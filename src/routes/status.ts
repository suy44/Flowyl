import type { Env } from "../types";
import type { ApiKeyMetadata } from "../types";
import { jsonResponse, errorResponse } from "../utils/response";
import { getExecutionStatus, hashApiKey } from "../core/idempotency";
import { resolveIdempotencyStore } from "../storage/kv-adapter";

/**
 * GET /v1/status/:key
 *
 * Check the status of an idempotency key.
 * Returns the cached execution if it exists, or 404 if not found.
 */
export async function handleStatus(
  request: Request,
  env: Env,
  apiKey: string,
  _keyMetadata: ApiKeyMetadata,
): Promise<Response> {
  // Extract key from URL path
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  // Expected: /v1/status/<key>
  const idempotencyKey = decodeURIComponent(pathParts.slice(3).join("/"));

  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return errorResponse(
      "Missing idempotency key in path. Use: GET /v1/status/<key>",
      400,
      "MISSING_KEY",
    );
  }

  const apiKeyHash = await hashApiKey(apiKey);
  const store = resolveIdempotencyStore(env);
  const status = await getExecutionStatus(store, apiKeyHash, idempotencyKey);

  if (!status.exists) {
    return errorResponse(
      `No execution found for key: "${idempotencyKey}"`,
      404,
      "KEY_NOT_FOUND",
    );
  }

  return jsonResponse({
    idempotency_key: idempotencyKey,
    status: "executed",
    execution: status.execution,
  });
}
