import { describe, it, expect } from "vitest";
import { isRateLimited, ProxyError, executeProxiedRequest } from "../src/core/proxy";
import type { ProxiedResponse } from "../src/types";

describe("Proxy Core", () => {
  describe("isRateLimited", () => {
    it("should identify HTTP 429 response as rate limited", () => {
      const response: ProxiedResponse = {
        status: 429,
        headers: { "retry-after": "30" },
        body: { error: "Rate limit exceeded" },
      };
      const result = isRateLimited(response);
      expect(result.limited).toBe(true);
      expect(result.retryAfter).toBe("30");
    });

    it("should handle Retry-After header with different casing", () => {
      const response: ProxiedResponse = {
        status: 429,
        headers: { "Retry-After": "15" },
        body: null,
      };
      const result = isRateLimited(response);
      expect(result.limited).toBe(true);
      expect(result.retryAfter).toBe("15");
    });

    it("should return retryAfter null if 429 has no retry-after header", () => {
      const response: ProxiedResponse = {
        status: 429,
        headers: {},
        body: "Too Many Requests",
      };
      const result = isRateLimited(response);
      expect(result.limited).toBe(true);
      expect(result.retryAfter).toBeNull();
    });

    it("should return limited: false for 200 OK", () => {
      const response: ProxiedResponse = {
        status: 200,
        headers: {},
        body: { success: true },
      };
      const result = isRateLimited(response);
      expect(result.limited).toBe(false);
      expect(result.retryAfter).toBeNull();
    });

    it("should return limited: false for 500 errors", () => {
      const response: ProxiedResponse = {
        status: 500,
        headers: {},
        body: "Internal Server Error",
      };
      const result = isRateLimited(response);
      expect(result.limited).toBe(false);
    });
  });

  describe("SSRF and Private URL Protection", () => {
    it("should block localhost URLs", async () => {
      await expect(
        executeProxiedRequest({
          method: "GET",
          url: "http://localhost:8080/secret",
        }),
      ).rejects.toThrow("Requests to private/internal addresses are not allowed");
    });

    it("should block 127.0.0.1", async () => {
      await expect(
        executeProxiedRequest({
          method: "GET",
          url: "http://127.0.0.1/admin",
        }),
      ).rejects.toThrow(ProxyError);
    });

    it("should block 10.0.0.0/8 private range", async () => {
      await expect(
        executeProxiedRequest({
          method: "POST",
          url: "http://10.0.0.1/api",
        }),
      ).rejects.toThrow("Requests to private/internal addresses are not allowed");
    });

    it("should block 192.168.x.x private range", async () => {
      await expect(
        executeProxiedRequest({
          method: "GET",
          url: "http://192.168.1.1/router",
        }),
      ).rejects.toThrow("Requests to private/internal addresses are not allowed");
    });

    it("should throw ProxyError on invalid URLs", async () => {
      await expect(
        executeProxiedRequest({
          method: "GET",
          url: "not-a-valid-url",
        }),
      ).rejects.toThrow("Invalid target URL");
    });
  });

  describe("ProxyError", () => {
    it("should create error with correct statusCode and name", () => {
      const err = new ProxyError("Custom message", 502);
      expect(err.message).toBe("Custom message");
      expect(err.statusCode).toBe(502);
      expect(err.name).toBe("ProxyError");
    });
  });
});
