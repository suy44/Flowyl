// ─── Environment & Storage Bindings ─────────────────────────────────────
export interface IKVStore {
  get(key: string, type?: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  IDEMPOTENCY_STORE?: IKVStore | KVNamespace;
  API_KEYS?: IKVStore | KVNamespace;
  RATE_LIMIT_QUEUE?: DurableObjectNamespace;
  ENVIRONMENT?: string;
  MAX_REQUEST_BODY_SIZE?: string;
  DEFAULT_TTL_SECONDS?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;
  ACTIONLOCK_API_KEYS?: string;
}

// ─── API Request / Response ──────────────────────────────────────────

/** The original HTTP request the client wants ActionLock to proxy. */
export interface ProxiedRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/** The response we captured from the downstream target. */
export interface ProxiedResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/** Execution status for the ActionLock response envelope. */
export type ExecutionStatus = "executed" | "deduplicated" | "queued";

/** Top-level response from POST /v1/execute */
export interface ExecuteResponse {
  status: ExecutionStatus;
  idempotency_key: string;
  response?: ProxiedResponse;
  executed_at?: string;
  cached: boolean;
  /** Present when status === "queued" */
  queue_position?: number;
  estimated_execute_at?: string;
  poll_url?: string;
}

/** Stored in KV alongside the idempotency key */
export interface CachedExecution {
  response: ProxiedResponse;
  executed_at: string;
  idempotency_key: string;
}

// ─── Rate Limit Presets ──────────────────────────────────────────────

export interface RateLimitPreset {
  /** Human-readable name */
  name: string;
  /** Maximum sustained requests per second */
  requests_per_second: number;
  /** Burst allowance (token bucket max) */
  burst: number;
  /** Retry strategy when 429 is received */
  retry_strategy: "exponential" | "retry_after" | "exponential_retry_after";
  /** Maximum number of retries */
  max_retries: number;
  /** Base delay in ms for exponential backoff */
  base_delay_ms: number;
  /** Maximum delay cap in ms */
  max_delay_ms: number;
}

// ─── Queue Types ─────────────────────────────────────────────────────

export interface QueuedItem {
  id: string;
  idempotency_key: string;
  request: ProxiedRequest;
  preset: string | null;
  ttl_seconds: number;
  api_key: string;
  enqueued_at: string;
  retry_count: number;
  next_attempt_at: string;
}

export interface QueueStatus {
  queue_length: number;
  position: number;
  estimated_execute_at: string;
}

// ─── Auth ────────────────────────────────────────────────────────────

export type PlanTier = "free" | "starter" | "pro";

export interface ApiKeyMetadata {
  owner_id: string;
  tier: PlanTier;
  monthly_limit: number;
  max_ttl_seconds: number;
  created_at: string;
}

/** Plan limits by tier */
export const PLAN_LIMITS: Record<PlanTier, { monthly_requests: number; max_ttl_seconds: number }> = {
  free:    { monthly_requests: 5_000,   max_ttl_seconds: 86_400 },      // 24h
  starter: { monthly_requests: 100_000, max_ttl_seconds: 604_800 },     // 7d
  pro:     { monthly_requests: 500_000, max_ttl_seconds: 2_592_000 },   // 30d
};

// ─── Analytics & Admin Dashboard Types ─────────────────────────────────

export interface ActivityEvent {
  id: string;
  timestamp: string;
  type: "execute" | "deduplicate" | "rate_limit" | "page_view";
  key_preview?: string;
  owner_id?: string;
  target_url?: string;
  preset?: string;
  latency_ms?: number;
}

export interface AnalyticsSummary {
  website_visitors: {
    total_page_views: number;
    unique_visitors: number;
  };
  api_metrics: {
    total_requests: number;
    executed_requests: number;
    duplicates_prevented: number;
    rate_limits_mitigated: number;
  };
  preset_distribution: Record<string, number>;
  active_users_count: number;
  recent_activity: ActivityEvent[];
  api_keys: Array<{
    key_preview: string;
    full_key?: string;
    owner_id: string;
    tier: PlanTier;
    monthly_limit: number;
    usage: number;
    created_at: string;
  }>;
}

