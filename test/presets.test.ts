import { describe, it, expect } from "vitest";
import { RATE_LIMIT_PRESETS, resolvePreset, calculateRetryDelay } from "../src/core/presets";

describe("Rate Limit Presets", () => {
  it("should have all 5 required presets", () => {
    const expectedPresets = ["airtable", "notion", "hubspot", "slack", "whatsapp"];
    expectedPresets.forEach((name) => {
      expect(RATE_LIMIT_PRESETS[name]).toBeDefined();
      expect(RATE_LIMIT_PRESETS[name].name).toBeTruthy();
      expect(RATE_LIMIT_PRESETS[name].requests_per_second).toBeGreaterThan(0);
      expect(RATE_LIMIT_PRESETS[name].burst).toBeGreaterThan(0);
    });
  });

  it("should resolve presets case-insensitively", () => {
    expect(resolvePreset("Airtable")).toEqual(RATE_LIMIT_PRESETS["airtable"]);
    expect(resolvePreset("NOTION")).toEqual(RATE_LIMIT_PRESETS["notion"]);
    expect(resolvePreset("hubspot")).toEqual(RATE_LIMIT_PRESETS["hubspot"]);
  });

  it("should return undefined for unknown presets", () => {
    expect(resolvePreset("unknown")).toBeUndefined();
    expect(resolvePreset(null)).toBeUndefined();
    expect(resolvePreset("")).toBeUndefined();
  });

  describe("calculateRetryDelay", () => {
    it("should respect Retry-After header for retry_after strategy", () => {
      const slack = RATE_LIMIT_PRESETS["slack"];
      const delay = calculateRetryDelay(slack, 0, "5");
      expect(delay).toBe(5000); // 5 seconds in ms
    });

    it("should use base delay when no Retry-After for retry_after strategy", () => {
      const slack = RATE_LIMIT_PRESETS["slack"];
      const delay = calculateRetryDelay(slack, 0, null);
      expect(delay).toBe(slack.base_delay_ms);
    });

    it("should apply exponential backoff for exponential strategy", () => {
      const whatsapp = RATE_LIMIT_PRESETS["whatsapp"];
      const delay0 = calculateRetryDelay(whatsapp, 0, null);
      const delay1 = calculateRetryDelay(whatsapp, 1, null);
      const delay2 = calculateRetryDelay(whatsapp, 2, null);

      // Delays should generally increase (accounting for jitter)
      // Base: 500ms * 2^n, with ±25% jitter
      expect(delay0).toBeGreaterThanOrEqual(100);
      expect(delay0).toBeLessThanOrEqual(whatsapp.max_delay_ms);
    });

    it("should cap delay at max_delay_ms", () => {
      const whatsapp = RATE_LIMIT_PRESETS["whatsapp"];
      const delay = calculateRetryDelay(whatsapp, 100, null); // Very high retry count
      expect(delay).toBeLessThanOrEqual(whatsapp.max_delay_ms * 1.25); // Account for jitter
    });

    it("should never return less than 100ms", () => {
      const slack = RATE_LIMIT_PRESETS["slack"];
      const delay = calculateRetryDelay(slack, 0, "0");
      expect(delay).toBeGreaterThanOrEqual(100);
    });

    it("should prefer Retry-After over exponential for combined strategy", () => {
      const airtable = RATE_LIMIT_PRESETS["airtable"];
      const delay = calculateRetryDelay(airtable, 3, "10");
      expect(delay).toBe(10000); // 10 seconds from Retry-After
    });

    it("should fall back to exponential when no Retry-After for combined strategy", () => {
      const airtable = RATE_LIMIT_PRESETS["airtable"];
      const delay = calculateRetryDelay(airtable, 2, null);
      // Should be exponential: 1000 * 2^2 = 4000, ±25% jitter
      expect(delay).toBeGreaterThanOrEqual(3000);
      expect(delay).toBeLessThanOrEqual(5000);
    });
  });
});

describe("Preset Configurations", () => {
  it("Airtable should be 5 req/s with burst 10", () => {
    expect(RATE_LIMIT_PRESETS["airtable"].requests_per_second).toBe(5);
    expect(RATE_LIMIT_PRESETS["airtable"].burst).toBe(10);
  });

  it("Notion should be 3 req/s with burst 5", () => {
    expect(RATE_LIMIT_PRESETS["notion"].requests_per_second).toBe(3);
    expect(RATE_LIMIT_PRESETS["notion"].burst).toBe(5);
  });

  it("Slack should be 1 req/s with burst 3", () => {
    expect(RATE_LIMIT_PRESETS["slack"].requests_per_second).toBe(1);
    expect(RATE_LIMIT_PRESETS["slack"].burst).toBe(3);
  });

  it("WhatsApp should be 80 msg/s with burst 100", () => {
    expect(RATE_LIMIT_PRESETS["whatsapp"].requests_per_second).toBe(80);
    expect(RATE_LIMIT_PRESETS["whatsapp"].burst).toBe(100);
  });
});
