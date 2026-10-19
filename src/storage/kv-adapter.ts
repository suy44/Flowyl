declare const process: any;

import type { IKVStore, Env, ApiKeyMetadata } from "../types";

/**
 * In-memory KV Store with TTL expiration.
 * Used for testing, local execution, and fallback when no external KV/Redis is bound.
 */
export class MemoryKVStore implements IKVStore {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string, _type?: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiresAt = options?.expirationTtl
      ? Date.now() + options.expirationTtl * 1000
      : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Upstash Redis / Vercel KV REST API Store.
 * Standard zero-dependency REST client compatible with Edge and Serverless runtimes.
 */
export class UpstashRedisKVStore implements IKVStore {
  private baseUrl: string;
  private token: string;

  constructor(url: string, token: string) {
    this.baseUrl = url.replace(/\/+$/, "");
    this.token = token;
  }

  async get(key: string, _type?: string): Promise<string | null> {
    try {
      const res = await fetch(`${this.baseUrl}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { result: string | null };
      return data.result ?? null;
    } catch {
      return null;
    }
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    try {
      if (options?.expirationTtl) {
        await fetch(
          `${this.baseUrl}/setex/${encodeURIComponent(key)}/${options.expirationTtl}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${this.token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(value),
          },
        );
      } else {
        await fetch(`${this.baseUrl}/set/${encodeURIComponent(key)}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(value),
        });
      }
    } catch (err) {
      console.error("UpstashRedisKVStore put error:", err);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await fetch(`${this.baseUrl}/del/${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}` },
      });
    } catch (err) {
      console.error("UpstashRedisKVStore delete error:", err);
    }
  }
}

// Global in-memory singleton for serverless container reuse
const globalMemoryStore = new MemoryKVStore();
const globalApiKeysStore = new MemoryKVStore();

// Default keys pre-seeded for dev / demo
const DEFAULT_DEMO_KEY: ApiKeyMetadata = {
  owner_id: "demo_user",
  tier: "pro",
  monthly_limit: 500_000,
  max_ttl_seconds: 2_592_000,
  created_at: new Date().toISOString(),
};

globalApiKeysStore.put("ak_test_dev123", JSON.stringify(DEFAULT_DEMO_KEY));
globalApiKeysStore.put("ak_live_default123", JSON.stringify(DEFAULT_DEMO_KEY));

/**
 * Resolves the appropriate KV store for idempotency keys.
 */
export function resolveIdempotencyStore(env?: Env): IKVStore {
  if (env?.IDEMPOTENCY_STORE && typeof (env.IDEMPOTENCY_STORE as IKVStore).get === "function") {
    return env.IDEMPOTENCY_STORE as IKVStore;
  }

  // Check Vercel KV / Upstash Redis env vars
  const redisUrl =
    env?.UPSTASH_REDIS_REST_URL ||
    env?.KV_REST_API_URL ||
    (typeof process !== "undefined" ? process.env?.UPSTASH_REDIS_REST_URL || process.env?.KV_REST_API_URL : undefined);

  const redisToken =
    env?.UPSTASH_REDIS_REST_TOKEN ||
    env?.KV_REST_API_TOKEN ||
    (typeof process !== "undefined" ? process.env?.UPSTASH_REDIS_REST_TOKEN || process.env?.KV_REST_API_TOKEN : undefined);

  if (redisUrl && redisToken) {
    return new UpstashRedisKVStore(redisUrl, redisToken);
  }

  return globalMemoryStore;
}

/**
 * Resolves the appropriate store for API key authentication.
 */
export function resolveApiKeysStore(env?: Env): IKVStore {
  if (env?.API_KEYS && typeof (env.API_KEYS as IKVStore).get === "function") {
    return env.API_KEYS as IKVStore;
  }

  // Check if ACTIONLOCK_API_KEYS environment variable is provided (JSON map or list)
  const envKeys =
    env?.ACTIONLOCK_API_KEYS ||
    (typeof process !== "undefined" ? process.env?.ACTIONLOCK_API_KEYS : undefined);

  if (envKeys) {
    try {
      const parsed = JSON.parse(envKeys);
      if (Array.isArray(parsed)) {
        parsed.forEach((k: string) => {
          globalApiKeysStore.put(k, JSON.stringify(DEFAULT_DEMO_KEY));
        });
      } else if (typeof parsed === "object") {
        Object.entries(parsed).forEach(([k, meta]) => {
          globalApiKeysStore.put(k, JSON.stringify(meta));
        });
      }
    } catch (e) {
      console.warn("Failed to parse ACTIONLOCK_API_KEYS env var", e);
    }
  }

  return globalApiKeysStore;
}
