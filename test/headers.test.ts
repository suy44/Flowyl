import { describe, it, expect } from "vitest";
import {
  parseIdempotencyKey,
  parseTTL,
  parsePreset,
  parseBearerToken,
} from "../src/utils/headers";

function makeRequest(headers: Record<string, string>): Request {
  return new Request("https://test.example.com", {
    headers: new Headers(headers),
  });
}

describe("Header Parsing", () => {
  describe("parseIdempotencyKey", () => {
    it("should parse a valid key", () => {
      const req = makeRequest({ "X-ActionLock-Key": "send_email:user_123" });
      expect(parseIdempotencyKey(req)).toBe("send_email:user_123");
    });

    it("should parse a valid X-Flowyl-Key", () => {
      const req = makeRequest({ "X-Flowyl-Key": "flowyl_order_99" });
      expect(parseIdempotencyKey(req)).toBe("flowyl_order_99");
    });

    it("should prioritize X-Flowyl-Key over legacy X-ActionLock-Key", () => {
      const req = makeRequest({
        "X-Flowyl-Key": "primary_flowyl_key",
        "X-ActionLock-Key": "legacy_key",
      });
      expect(parseIdempotencyKey(req)).toBe("primary_flowyl_key");
    });

    it("should trim whitespace", () => {
      const req = makeRequest({ "X-ActionLock-Key": "  my_key  " });
      expect(parseIdempotencyKey(req)).toBe("my_key");
    });

    it("should return null for missing header", () => {
      const req = makeRequest({});
      expect(parseIdempotencyKey(req)).toBeNull();
    });

    it("should return null for empty header", () => {
      const req = makeRequest({ "X-ActionLock-Key": "" });
      expect(parseIdempotencyKey(req)).toBeNull();
    });

    it("should return null for keys over 256 chars", () => {
      const longKey = "a".repeat(257);
      const req = makeRequest({ "X-ActionLock-Key": longKey });
      expect(parseIdempotencyKey(req)).toBeNull();
    });

    it("should accept keys exactly 256 chars", () => {
      const key = "a".repeat(256);
      const req = makeRequest({ "X-ActionLock-Key": key });
      expect(parseIdempotencyKey(req)).toBe(key);
    });
  });

  describe("parseTTL", () => {
    it("should parse a valid TTL", () => {
      const req = makeRequest({ "X-ActionLock-TTL": "3600" });
      expect(parseTTL(req, 86400)).toBe(3600);
    });

    it("should parse a valid X-Flowyl-TTL", () => {
      const req = makeRequest({ "X-Flowyl-TTL": "7200" });
      expect(parseTTL(req, 86400)).toBe(7200);
    });

    it("should return default for missing header", () => {
      const req = makeRequest({});
      expect(parseTTL(req, 86400)).toBe(86400);
    });

    it("should return default for invalid values", () => {
      const req = makeRequest({ "X-ActionLock-TTL": "abc" });
      expect(parseTTL(req, 86400)).toBe(86400);
    });

    it("should return default for zero", () => {
      const req = makeRequest({ "X-ActionLock-TTL": "0" });
      expect(parseTTL(req, 86400)).toBe(86400);
    });

    it("should return default for negative values", () => {
      const req = makeRequest({ "X-ActionLock-TTL": "-100" });
      expect(parseTTL(req, 86400)).toBe(86400);
    });
  });

  describe("parsePreset", () => {
    it("should parse and lowercase preset name", () => {
      const req = makeRequest({ "X-ActionLock-Preset": "Airtable" });
      expect(parsePreset(req)).toBe("airtable");
    });

    it("should parse and lowercase X-Flowyl-Preset", () => {
      const req = makeRequest({ "X-Flowyl-Preset": "HubSpot" });
      expect(parsePreset(req)).toBe("hubspot");
    });

    it("should return null for missing header", () => {
      const req = makeRequest({});
      expect(parsePreset(req)).toBeNull();
    });

    it("should return null for empty header", () => {
      const req = makeRequest({ "X-ActionLock-Preset": "  " });
      expect(parsePreset(req)).toBeNull();
    });
  });

  describe("parseBearerToken", () => {
    it("should parse a valid Bearer token", () => {
      const req = makeRequest({ "Authorization": "Bearer ak_live_xxx" });
      expect(parseBearerToken(req)).toBe("ak_live_xxx");
    });

    it("should return null for missing header", () => {
      const req = makeRequest({});
      expect(parseBearerToken(req)).toBeNull();
    });

    it("should return null for non-Bearer auth", () => {
      const req = makeRequest({ "Authorization": "Basic abc123" });
      expect(parseBearerToken(req)).toBeNull();
    });

    it("should return null for malformed header", () => {
      const req = makeRequest({ "Authorization": "BearerNoSpace" });
      expect(parseBearerToken(req)).toBeNull();
    });

    it("should handle case-insensitive Bearer", () => {
      const req = makeRequest({ "Authorization": "bearer token_123" });
      expect(parseBearerToken(req)).toBe("token_123");
    });
  });
});
