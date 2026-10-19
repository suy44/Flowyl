import type { CachedExecution, ProxiedResponse, IKVStore } from "../types";

/**
 * KV-based idempotency store.
 *
 * Each key is stored as:   actionlock:idem:<api_key_hash>:<idempotency_key>
 * Value is a JSON-serialized CachedExecution.
 * TTL is set on write and honored by KV natively.
 */

const KEY_PREFIX = "flowyl:idem:";
const LEGACY_KEY_PREFIX = "actionlock:idem:";

function buildKVKey(apiKeyHash: string, idempotencyKey: string): string {
  return `${KEY_PREFIX}${apiKeyHash}:${idempotencyKey}`;
}

function buildLegacyKVKey(apiKeyHash: string, idempotencyKey: string): string {
  return `${LEGACY_KEY_PREFIX}${apiKeyHash}:${idempotencyKey}`;
}

/**
 * Check if an idempotency key already has a stored execution.
 * Returns the cached execution or null.
 */
export async function getExecution(
  store: IKVStore,
  apiKeyHash: string,
  idempotencyKey: string,
): Promise<CachedExecution | null> {
  const kvKey = buildKVKey(apiKeyHash, idempotencyKey);
  let raw = await store.get(kvKey, "text");
  let activeKey = kvKey;
  if (!raw) {
    const legacyKey = buildLegacyKVKey(apiKeyHash, idempotencyKey);
    raw = await store.get(legacyKey, "text");
    activeKey = legacyKey;
  }
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CachedExecution;
  } catch {
    // Corrupted entry — treat as miss
    await store.delete(activeKey);
    return null;
  }
}

/**
 * Store a successful execution result with the given TTL.
 */
export async function storeExecution(
  store: IKVStore,
  apiKeyHash: string,
  idempotencyKey: string,
  response: ProxiedResponse,
  ttlSeconds: number,
): Promise<CachedExecution> {
  const kvKey = buildKVKey(apiKeyHash, idempotencyKey);
  const execution: CachedExecution = {
    response,
    executed_at: new Date().toISOString(),
    idempotency_key: idempotencyKey,
  };

  await store.put(kvKey, JSON.stringify(execution), {
    expirationTtl: ttlSeconds,
  });

  return execution;
}

/**
 * Delete a stored execution (manual invalidation).
 */
export async function deleteExecution(
  store: IKVStore,
  apiKeyHash: string,
  idempotencyKey: string,
): Promise<boolean> {
  const kvKey = buildKVKey(apiKeyHash, idempotencyKey);
  const legacyKey = buildLegacyKVKey(apiKeyHash, idempotencyKey);
  const existingPrimary = await store.get(kvKey, "text");
  const existingLegacy = await store.get(legacyKey, "text");
  if (!existingPrimary && !existingLegacy) return false;
  if (existingPrimary) await store.delete(kvKey);
  if (existingLegacy) await store.delete(legacyKey);
  return true;
}

/**
 * Retrieve execution status for a key (for GET /v1/status/:key).
 */
export async function getExecutionStatus(
  store: IKVStore,
  apiKeyHash: string,
  idempotencyKey: string,
): Promise<{ exists: boolean; execution?: CachedExecution }> {
  const execution = await getExecution(store, apiKeyHash, idempotencyKey);
  return execution ? { exists: true, execution } : { exists: false };
}

/**
 * Create a short hash of the API key for namespacing KV keys.
 * Uses first 12 chars of SHA-256 hex digest — collision-safe for our scale.
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex.substring(0, 12);
}
