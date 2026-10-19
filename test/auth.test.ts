import { describe, it, expect } from "vitest";
import { PLAN_LIMITS } from "../src/types";
import { validateTTL } from "../src/auth/api-key";

describe("Plan Limits", () => {
  it("should define limits for all tiers", () => {
    expect(PLAN_LIMITS.free).toBeDefined();
    expect(PLAN_LIMITS.starter).toBeDefined();
    expect(PLAN_LIMITS.pro).toBeDefined();
  });

  it("free tier: 5,000 requests, 24h TTL", () => {
    expect(PLAN_LIMITS.free.monthly_requests).toBe(5_000);
    expect(PLAN_LIMITS.free.max_ttl_seconds).toBe(86_400);
  });

  it("starter tier: 100,000 requests, 7d TTL", () => {
    expect(PLAN_LIMITS.starter.monthly_requests).toBe(100_000);
    expect(PLAN_LIMITS.starter.max_ttl_seconds).toBe(604_800);
  });

  it("pro tier: 500,000 requests, 30d TTL", () => {
    expect(PLAN_LIMITS.pro.monthly_requests).toBe(500_000);
    expect(PLAN_LIMITS.pro.max_ttl_seconds).toBe(2_592_000);
  });
});

describe("TTL Validation", () => {
  it("should allow TTL within plan limits", () => {
    expect(validateTTL(3600, 86400)).toBe(true);
  });

  it("should allow TTL equal to plan limit", () => {
    expect(validateTTL(86400, 86400)).toBe(true);
  });

  it("should reject TTL exceeding plan limits", () => {
    expect(validateTTL(86401, 86400)).toBe(false);
  });
});
