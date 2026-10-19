import type { Env, ProxiedRequest, ExecuteResponse } from "../types";
import type { ApiKeyMetadata } from "../types";
import { parseIdempotencyKey, parseTTL, parsePreset } from "../utils/headers";
import { jsonResponse, errorResponse } from "../utils/response";
import { getExecution, storeExecution, hashApiKey } from "../core/idempotency";
import { executeProxiedRequest, isRateLimited, ProxyError } from "../core/proxy";
import { resolvePreset } from "../core/presets";
import { getQueueStub, enqueueRequest } from "../core/queue";
import { validateTTL } from "../auth/api-key";
import { PLAN_LIMITS } from "../types";
import { resolveIdempotencyStore } from "../storage/kv-adapter";
import { analytics } from "../storage/analytics";

/**
 * POST /v1/execute
 *
 * Main proxy endpoint. Flow:
 * 1. Validate idempotency key header
 * 2. Check for cached execution (deduplication)
 * 3. If preset specified, apply rate limiting via Durable Object queue
 * 4. Execute the proxied request
 * 5. Store the result with TTL
 * 6. Return structured response
 */
export async function handleExecute(
  request: Request,
  env: Env,
  apiKey: string,
  keyMetadata: ApiKeyMetadata,
): Promise<Response> {
  // ── 1. Parse and validate headers ──────────────────────────────
  const idempotencyKey = parseIdempotencyKey(request);
  if (!idempotencyKey) {
    return errorResponse(
      "Missing or invalid X-ActionLock-Key header. Provide a unique key (max 256 chars).",
      400,
      "MISSING_IDEMPOTENCY_KEY",
    );
  }

  const defaultTTL = parseInt(env?.DEFAULT_TTL_SECONDS ?? "86400", 10) || 86400;
  const ttl = parseTTL(request, defaultTTL);
  const presetName = parsePreset(request);

  // Validate TTL against plan limits
  const planLimits = PLAN_LIMITS[keyMetadata.tier];
  if (!validateTTL(ttl, planLimits.max_ttl_seconds)) {
    return errorResponse(
      `TTL of ${ttl}s exceeds your plan's maximum of ${planLimits.max_ttl_seconds}s. Upgrade to increase.`,
      403,
      "TTL_EXCEEDED",
      { max_ttl: planLimits.max_ttl_seconds, requested_ttl: ttl, tier: keyMetadata.tier },
    );
  }

  // Validate preset name if provided
  if (presetName && !resolvePreset(presetName)) {
    return errorResponse(
      `Unknown preset: "${presetName}". Available: airtable, notion, hubspot, slack, whatsapp`,
      400,
      "UNKNOWN_PRESET",
    );
  }

  // ── 2. Parse request body ──────────────────────────────────────
  let proxiedRequest: ProxiedRequest;
  try {
    proxiedRequest = (await request.json()) as ProxiedRequest;
  } catch {
    return errorResponse(
      "Invalid JSON body. Expected: { method, url, headers?, body? }",
      400,
      "INVALID_BODY",
    );
  }

  // Validate required fields
  if (!proxiedRequest.method || !proxiedRequest.url) {
    return errorResponse(
      "Missing required fields: 'method' and 'url' are required in the request body.",
      400,
      "MISSING_FIELDS",
    );
  }

  // ── 3. Check idempotency cache ────────────────────────────────
  const apiKeyHash = await hashApiKey(apiKey);
  const store = resolveIdempotencyStore(env);
  const cached = await getExecution(store, apiKeyHash, idempotencyKey);

  if (cached) {
    analytics.recordApiExecution({
      status: "deduplicated",
      idempotencyKey,
      apiKey,
      ownerId: keyMetadata.owner_id,
      targetUrl: proxiedRequest.url,
      preset: presetName,
    });
    const response: ExecuteResponse = {
      status: "deduplicated",
      idempotency_key: idempotencyKey,
      response: cached.response,
      executed_at: cached.executed_at,
      cached: true,
    };
    return jsonResponse(response, 200, {
      "X-Flowyl-Status": "deduplicated",
      "X-Flowyl-Cached": "true",
      "X-ActionLock-Status": "deduplicated",
      "X-ActionLock-Cached": "true",
    });
  }

  // ── 4. Check if we should queue (rate-limited preset) ─────────
  const preset = resolvePreset(presetName);

  // For presets, attempt direct execution first. If 429, queue or retry.
  try {
    const proxyResponse = await executeProxiedRequest(proxiedRequest);
    const rateLimitCheck = isRateLimited(proxyResponse);

    if (rateLimitCheck.limited && preset && env?.RATE_LIMIT_QUEUE) {
      // Target returned 429 and Durable Objects available — queue for background drain
      analytics.recordApiExecution({
        status: "queued",
        idempotencyKey,
        apiKey,
        ownerId: keyMetadata.owner_id,
        targetUrl: proxiedRequest.url,
        preset: presetName,
      });
      const stub = getQueueStub(env, new URL(proxiedRequest.url).hostname);
      const queueStatus = await enqueueRequest(stub, {
        id: crypto.randomUUID(),
        idempotency_key: idempotencyKey,
        request: proxiedRequest,
        preset: presetName,
        ttl_seconds: ttl,
        api_key: apiKeyHash,
      });

      const queuedResponse: ExecuteResponse = {
        status: "queued",
        idempotency_key: idempotencyKey,
        cached: false,
        queue_position: queueStatus.position,
        estimated_execute_at: queueStatus.estimated_execute_at,
        poll_url: `/v1/status/${encodeURIComponent(idempotencyKey)}`,
      };

      return jsonResponse(queuedResponse, 202, {
        "X-Flowyl-Status": "queued",
        "X-Flowyl-Queue-Position": String(queueStatus.position),
        "X-ActionLock-Status": "queued",
        "X-ActionLock-Queue-Position": String(queueStatus.position),
      });
    }

    if (rateLimitCheck.limited) {
      // 429 received (either no preset, or on platform without Durable Objects)
      // Retry once with backoff
      const retryAfterMs = rateLimitCheck.retryAfter
        ? parseInt(rateLimitCheck.retryAfter, 10) * 1000
        : 2000;

      // Wait and retry once
      await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterMs, 5000)));
      const retryResponse = await executeProxiedRequest(proxiedRequest);
      const retryRateCheck = isRateLimited(retryResponse);

      if (retryRateCheck.limited) {
        // Still 429 — return error to client
        return errorResponse(
          "Target API rate limit exceeded. Consider using a preset (X-Flowyl-Preset) for automatic queuing.",
          429,
          "TARGET_RATE_LIMITED",
          {
            retry_after: rateLimitCheck.retryAfter,
            hint: "Add X-Flowyl-Preset header to enable smart queuing",
          },
        );
      }

      // Retry succeeded
      const execution = await storeExecution(
        store,
        apiKeyHash,
        idempotencyKey,
        retryResponse,
        ttl,
      );

      const executedResponse: ExecuteResponse = {
        status: "executed",
        idempotency_key: idempotencyKey,
        response: retryResponse,
        executed_at: execution.executed_at,
        cached: false,
      };

      return jsonResponse(executedResponse, 200, {
        "X-Flowyl-Status": "executed",
        "X-ActionLock-Status": "executed",
      });
    }

    // ── 5. Success — store and return ─────────────────────────────
    analytics.recordApiExecution({
      status: "executed",
      idempotencyKey,
      apiKey,
      ownerId: keyMetadata.owner_id,
      targetUrl: proxiedRequest.url,
      preset: presetName,
    });

    const execution = await storeExecution(
      store,
      apiKeyHash,
      idempotencyKey,
      proxyResponse,
      ttl,
    );

    const executedResponse: ExecuteResponse = {
      status: "executed",
      idempotency_key: idempotencyKey,
      response: proxyResponse,
      executed_at: execution.executed_at,
      cached: false,
    };

    return jsonResponse(executedResponse, 200, {
      "X-Flowyl-Status": "executed",
      "X-Flowyl-Cached": "false",
      "X-ActionLock-Status": "executed",
      "X-ActionLock-Cached": "false",
    });
  } catch (err) {
    if (err instanceof ProxyError) {
      return errorResponse(err.message, err.statusCode, "PROXY_ERROR");
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(`Execution failed: ${message}`, 500, "EXECUTION_ERROR");
  }
}
