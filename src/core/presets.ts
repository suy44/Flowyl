import type { RateLimitPreset } from "../types";

/**
 * Pre-configured rate-limit profiles for the most commonly used APIs
 * in automation workflows. Values are conservative to avoid edge-case 429s.
 *
 * Sources:
 *  - Airtable: 5 req/s per base (https://airtable.com/developers/web/api/rate-limits)
 *  - Notion:   3 req/s average  (https://developers.notion.com/reference/request-limits)
 *  - HubSpot:  10 req/s (private apps) / 100 req/10s (https://developers.hubspot.com/docs/api/usage-details)
 *  - Slack:    1 req/s (Web API tier 2) (https://api.slack.com/docs/rate-limits)
 *  - WhatsApp: 80 msg/s (Cloud API) (https://developers.facebook.com/docs/whatsapp/cloud-api/overview)
 */
export const RATE_LIMIT_PRESETS: Record<string, RateLimitPreset> = {
  airtable: {
    name: "Airtable",
    requests_per_second: 5,
    burst: 10,
    retry_strategy: "exponential_retry_after",
    max_retries: 5,
    base_delay_ms: 1_000,
    max_delay_ms: 30_000,
  },

  notion: {
    name: "Notion",
    requests_per_second: 3,
    burst: 5,
    retry_strategy: "exponential_retry_after",
    max_retries: 5,
    base_delay_ms: 1_000,
    max_delay_ms: 30_000,
  },

  hubspot: {
    name: "HubSpot",
    requests_per_second: 10,
    burst: 20,
    retry_strategy: "exponential_retry_after",
    max_retries: 5,
    base_delay_ms: 500,
    max_delay_ms: 20_000,
  },

  slack: {
    name: "Slack",
    requests_per_second: 1,
    burst: 3,
    retry_strategy: "retry_after",
    max_retries: 5,
    base_delay_ms: 1_000,
    max_delay_ms: 60_000,
  },

  whatsapp: {
    name: "WhatsApp Cloud API",
    requests_per_second: 80,
    burst: 100,
    retry_strategy: "exponential",
    max_retries: 3,
    base_delay_ms: 500,
    max_delay_ms: 10_000,
  },
};

/**
 * Resolve a preset name (case-insensitive) to its configuration.
 * Returns undefined for unknown presets.
 */
export function resolvePreset(name: string | null | undefined): RateLimitPreset | undefined {
  if (!name) return undefined;
  return RATE_LIMIT_PRESETS[name.toLowerCase()];
}

/**
 * Calculate the next retry delay based on the preset's strategy.
 */
export function calculateRetryDelay(
  preset: RateLimitPreset,
  retryCount: number,
  retryAfterHeader?: string | null,
): number {
  let delayMs: number;

  switch (preset.retry_strategy) {
    case "retry_after": {
      const retryAfterSec = retryAfterHeader ? parseRetryAfter(retryAfterHeader) : null;
      delayMs = retryAfterSec !== null ? retryAfterSec * 1000 : preset.base_delay_ms;
      break;
    }
    case "exponential": {
      delayMs = Math.min(
        preset.base_delay_ms * Math.pow(2, retryCount),
        preset.max_delay_ms,
      );
      // Add jitter: ±25%
      delayMs = delayMs * (0.75 + Math.random() * 0.5);
      break;
    }
    case "exponential_retry_after": {
      const retryAfterSec = retryAfterHeader ? parseRetryAfter(retryAfterHeader) : null;
      if (retryAfterSec !== null) {
        delayMs = retryAfterSec * 1000;
      } else {
        delayMs = Math.min(
          preset.base_delay_ms * Math.pow(2, retryCount),
          preset.max_delay_ms,
        );
        delayMs = delayMs * (0.75 + Math.random() * 0.5);
      }
      break;
    }
  }

  return Math.max(delayMs, 100); // Floor: never retry faster than 100ms
}

/**
 * Parse the Retry-After header. Supports both seconds (integer)
 * and HTTP-date formats.
 */
function parseRetryAfter(value: string): number | null {
  // Try integer seconds first
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds) && seconds >= 0) return seconds;

  // Try HTTP-date
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    const delaySec = Math.max(0, (date.getTime() - Date.now()) / 1000);
    return Math.ceil(delaySec);
  }

  return null;
}
