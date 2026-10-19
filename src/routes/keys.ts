import type { Env } from "../types";
import type { ApiKeyMetadata } from "../types";
import { jsonResponse, errorResponse } from "../utils/response";
import { deleteExecution, hashApiKey } from "../core/idempotency";
import { resolveIdempotencyStore } from "../storage/kv-adapter";

/**
 * DELETE /v1/keys/:key
 *
 * Manually invalidate a cached execution.
 * This allows re-execution of the same idempotency key.
 */
export async function handleDeleteKey(
  request: Request,
  env: Env,
  apiKey: string,
  _keyMetadata: ApiKeyMetadata,
): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  // Expected: /v1/keys/<key>
  const idempotencyKey = decodeURIComponent(pathParts.slice(3).join("/"));

  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return errorResponse(
      "Missing idempotency key in path. Use: DELETE /v1/keys/<key>",
      400,
      "MISSING_KEY",
    );
  }

  const apiKeyHash = await hashApiKey(apiKey);
  const store = resolveIdempotencyStore(env);
  const deleted = await deleteExecution(store, apiKeyHash, idempotencyKey);

  if (!deleted) {
    return errorResponse(
      `No execution found for key: "${idempotencyKey}"`,
      404,
      "KEY_NOT_FOUND",
    );
  }

  return jsonResponse({
    idempotency_key: idempotencyKey,
    deleted: true,
    message: "Idempotency key invalidated. The action can now be re-executed.",
  });
}
