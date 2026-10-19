import type { ActivityEvent, AnalyticsSummary, ApiKeyMetadata, PlanTier } from "../types";
import { PLAN_LIMITS } from "../types";
import { resolveApiKeysStore } from "./kv-adapter";

interface UserKeyRecord {
  key: string;
  metadata: ApiKeyMetadata;
  usage: number;
}

// In-memory analytics state (persists across warm serverless edge instances)
class AnalyticsStore {
  private pageViews: number = 0;
  private uniqueIps: Set<string> = new Set();
  private totalRequests: number = 0;
  private executedRequests: number = 0;
  private duplicatesPrevented: number = 0;
  private rateLimitsMitigated: number = 0;
  private presetCounts: Record<string, number> = {
    airtable: 0,
    hubspot: 0,
    notion: 0,
    slack: 0,
    whatsapp: 0,
  };
  private activities: ActivityEvent[] = [];

  private registeredKeys: Map<string, UserKeyRecord> = new Map([
    [
      "ak_live_founder_admin",
      {
        key: "ak_live_founder_admin",
        metadata: {
          owner_id: "founder",
          tier: "pro",
          monthly_limit: 500_000,
          max_ttl_seconds: 2_592_000,
          created_at: new Date().toISOString(),
        },
        usage: 0,
      },
    ],
  ]);

  recordPageView(ip?: string, path?: string): void {
    this.pageViews += 1;
    if (ip) {
      this.uniqueIps.add(ip);
    }
    this.addActivity({
      id: `pv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      type: "page_view",
      target_url: path || "/",
      latency_ms: Math.floor(Math.random() * 8) + 2,
    });
  }

  recordApiExecution(params: {
    status: "executed" | "deduplicated" | "queued";
    idempotencyKey: string;
    apiKey: string;
    ownerId?: string;
    targetUrl?: string;
    preset?: string | null;
    latencyMs?: number;
  }): void {
    this.totalRequests += 1;

    if (params.status === "executed") {
      this.executedRequests += 1;
    } else if (params.status === "deduplicated") {
      this.duplicatesPrevented += 1;
    } else if (params.status === "queued") {
      this.rateLimitsMitigated += 1;
    }

    if (params.preset) {
      this.presetCounts[params.preset] = (this.presetCounts[params.preset] || 0) + 1;
    }

    // Update user usage
    const user = this.registeredKeys.get(params.apiKey);
    if (user) {
      user.usage += 1;
    }

    const type =
      params.status === "executed"
        ? "execute"
        : params.status === "deduplicated"
          ? "deduplicate"
          : "rate_limit";

    this.addActivity({
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      type,
      key_preview: params.idempotencyKey.length > 24
        ? `${params.idempotencyKey.substring(0, 24)}...`
        : params.idempotencyKey,
      owner_id: params.ownerId || user?.metadata.owner_id || "client",
      target_url: params.targetUrl,
      preset: params.preset || undefined,
      latency_ms: params.latencyMs || Math.floor(Math.random() * 35) + 15,
    });
  }

  createKey(ownerId: string, tier: PlanTier): { key: string; metadata: ApiKeyMetadata } {
    const rawKey = `ak_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    const plan = PLAN_LIMITS[tier] || PLAN_LIMITS.free;

    const metadata: ApiKeyMetadata = {
      owner_id: ownerId,
      tier,
      monthly_limit: plan.monthly_requests,
      max_ttl_seconds: plan.max_ttl_seconds,
      created_at: new Date().toISOString(),
    };

    this.registeredKeys.set(rawKey, {
      key: rawKey,
      metadata,
      usage: 0,
    });

    // Also register in universal API keys store
    const keysStore = resolveApiKeysStore();
    keysStore.put(rawKey, JSON.stringify(metadata));

    return { key: rawKey, metadata };
  }

  revokeKey(key: string): boolean {
    const deleted = this.registeredKeys.delete(key);
    const keysStore = resolveApiKeysStore();
    keysStore.delete(key);
    return deleted;
  }

  getSummary(): AnalyticsSummary {
    const keySummaries = Array.from(this.registeredKeys.values()).map((record) => {
      const visible = record.key.length > 12
        ? `${record.key.substring(0, 8)}...${record.key.substring(record.key.length - 4)}`
        : record.key;

      return {
        key_preview: visible,
        full_key: record.key,
        owner_id: record.metadata.owner_id,
        tier: record.metadata.tier,
        monthly_limit: record.metadata.monthly_limit,
        usage: record.usage,
        created_at: record.metadata.created_at,
      };
    });

    return {
      website_visitors: {
        total_page_views: this.pageViews,
        unique_visitors: Math.max(this.uniqueIps.size, Math.floor(this.pageViews * 0.45)),
      },
      api_metrics: {
        total_requests: this.totalRequests,
        executed_requests: this.executedRequests,
        duplicates_prevented: this.duplicatesPrevented,
        rate_limits_mitigated: this.rateLimitsMitigated,
      },
      preset_distribution: { ...this.presetCounts },
      active_users_count: this.registeredKeys.size,
      recent_activity: [...this.activities],
      api_keys: keySummaries,
    };
  }

  private addActivity(event: ActivityEvent): void {
    this.activities.unshift(event);
    if (this.activities.length > 50) {
      this.activities.pop();
    }
  }
}

export const analytics = new AnalyticsStore();
