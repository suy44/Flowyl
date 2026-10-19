import type { Env, ApiKeyMetadata } from "../types";
import { parseBearerToken } from "../utils/headers";
import { errorResponse } from "../utils/response";
import { resolveApiKeysStore } from "../storage/kv-adapter";

/**
 * API key authentication middleware.
 *
 * API keys are stored in the API_KEYS KV namespace (Cloudflare)
 * or Vercel KV / Upstash Redis / Memory Store (Vercel).
 */

export interface AuthResult {
  authenticated: boolean;
  apiKey?: string;
  metadata?: ApiKeyMetadata;
  errorResponse?: Response;
}

export async function authenticateRequest(
  request: Request,
  env?: Env,
): Promise<AuthResult> {
  const token = parseBearerToken(request);

  if (!token) {
    return {
      authenticated: false,
      errorResponse: errorResponse(
        "Missing or malformed Authorization header. Expected: Bearer <api_key>",
        401,
        "MISSING_API_KEY",
      ),
    };
  }

  // Look up the API key using universal store
  const keysStore = resolveApiKeysStore(env);
  const raw = await keysStore.get(token, "text");
  if (!raw) {
    return {
      authenticated: false,
      errorResponse: errorResponse(
        "Invalid API key",
        401,
        "INVALID_API_KEY",
      ),
    };
  }

  let metadata: ApiKeyMetadata;
  try {
    metadata = JSON.parse(raw) as ApiKeyMetadata;
  } catch {
    return {
      authenticated: false,
      errorResponse: errorResponse(
        "API key metadata is corrupted. Contact support.",
        500,
        "CORRUPTED_KEY",
      ),
    };
  }

  return {
    authenticated: true,
    apiKey: token,
    metadata,
  };
}

/**
 * Check if a given TTL is within the plan's allowed maximum.
 */
export function validateTTL(requestedTTL: number, maxTTL: number): boolean {
  return requestedTTL <= maxTTL;
}
