import { describe, it, expect, vi, beforeEach } from "vitest";
import worker from "../src/index";
import type { Env, ApiKeyMetadata } from "../src/types";

function createMockKV(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    async get(key: string, type?: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    _map: store,
  } as unknown as Env["IDEMPOTENCY_STORE"];
}

describe("ActionLock Worker E2E Tests", () => {
  const validApiKey = "al_live_test123456789";
  const validApiKeyMeta: ApiKeyMetadata = {
    owner_id: "user_test_1",
    tier: "free",
    created_at: new Date().toISOString(),
    monthly_usage: 10,
    rate_limit: 10,
  };

  let mockEnv: Env;

  beforeEach(() => {
    const apiKeysKV = createMockKV({
      [validApiKey]: JSON.stringify(validApiKeyMeta),
    });
    const idempotencyKV = createMockKV({});

    mockEnv = {
      IDEMPOTENCY_STORE: idempotencyKV,
      API_KEYS: apiKeysKV,
      RATE_LIMIT_QUEUE: {} as any,
      ENVIRONMENT: "test",
      DEFAULT_TTL_SECONDS: "86400",
    };

    vi.restoreAllMocks();
  });

  describe("Public Endpoints & CORS", () => {
    it("GET /v1/health should return 200 with healthy status", async () => {
      const req = new Request("http://localhost/v1/health", { method: "GET" });
      const res = await worker.fetch(req, mockEnv, {} as ExecutionContext);

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.status).toBe("healthy");
      expect(data.version).toBeDefined();
    });

    it("OPTIONS /any-route should return 204 CORS preflight", async () => {
      const req = new Request("http://localhost/v1/execute", { method: "OPTIONS" });
      const res = await worker.fetch(req, mockEnv, {} as ExecutionContext);

      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    });

    it("GET / should return 200 with API overview", async () => {
      const req = new Request("http://localhost/", { method: "GET" });
      const res = await worker.fetch(req, mockEnv, {} as ExecutionContext);

      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.name).toBe("Flowyl API");
      expect(data.status).toBe("online");
    });
  });

  describe("Authentication", () => {
    it("should reject requests with missing Authorization header", async () => {
      const req = new Request("http://localhost/v1/execute", {
        method: "POST",
        headers: { "X-ActionLock-Key": "test:1" },
        body: JSON.stringify({ method: "GET", url: "https://api.example.com" }),
      });
      const res = await worker.fetch(req, mockEnv, {} as ExecutionContext);

      expect(res.status).toBe(401);
      const data = (await res.json()) as any;
      expect(data.error.code).toBe("MISSING_API_KEY");
    });

    it("should reject requests with invalid API key", async () => {
      const req = new Request("http://localhost/v1/execute", {
        method: "POST",
        headers: {
          Authorization: "Bearer invalid_key_999",
          "X-ActionLock-Key": "test:1",
        },
        body: JSON.stringify({ method: "GET", url: "https://api.example.com" }),
      });
      const res = await worker.fetch(req, mockEnv, {} as ExecutionContext);

      expect(res.status).toBe(401);
      const data = (await res.json()) as any;
      expect(data.error.code).toBe("INVALID_API_KEY");
    });
  });

  describe("Validation in POST /v1/execute", () => {
    it("should reject requests without X-ActionLock-Key", async () => {
      const req = new Request("http://localhost/v1/execute", {
        method: "POST",
        headers: { Authorization: `Bearer ${validApiKey}` },
        body: JSON.stringify({ method: "GET", url: "https://api.example.com" }),
      });
      const res = await worker.fetch(req, mockEnv, {} as ExecutionContext);

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error.code).toBe("MISSING_IDEMPOTENCY_KEY");
    });

    it("should reject TTL exceeding user tier limit", async () => {
      const req = new Request("http://localhost/v1/execute", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validApiKey}`,
          "X-ActionLock-Key": "key:ttl_test",
          "X-ActionLock-TTL": "999999", // Free plan max is 86400
        },
        body: JSON.stringify({ method: "GET", url: "https://api.example.com" }),
      });
      const res = await worker.fetch(req, mockEnv, {} as ExecutionContext);

      expect(res.status).toBe(403);
      const data = (await res.json()) as any;
      expect(data.error.code).toBe("TTL_EXCEEDED");
    });

    it("should reject invalid unknown preset name", async () => {
      const req = new Request("http://localhost/v1/execute", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validApiKey}`,
          "X-ActionLock-Key": "key:preset_test",
          "X-ActionLock-Preset": "unknown_preset_xyz",
        },
        body: JSON.stringify({ method: "GET", url: "https://api.example.com" }),
      });
      const res = await worker.fetch(req, mockEnv, {} as ExecutionContext);

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error.code).toBe("UNKNOWN_PRESET");
    });

    it("should reject missing required body fields", async () => {
      const req = new Request("http://localhost/v1/execute", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validApiKey}`,
          "X-ActionLock-Key": "key:fields_test",
        },
        body: JSON.stringify({ method: "GET" }), // missing url
      });
      const res = await worker.fetch(req, mockEnv, {} as ExecutionContext);

      expect(res.status).toBe(400);
      const data = (await res.json()) as any;
      expect(data.error.code).toBe("MISSING_FIELDS");
    });
  });

  describe("Execution & Idempotency Deduplication Flow", () => {
    it("should execute request on first attempt and deduplicate on second attempt", async () => {
      // Mock global fetch for upstream API
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ id: "record_123", created: true }),
        text: async () => JSON.stringify({ id: "record_123", created: true }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const requestBody = {
        method: "POST",
        url: "https://api.airtable.com/v0/appXXX/Table",
        headers: { "Content-Type": "application/json" },
        body: { fields: { Name: "Alice" } },
      };

      // ── First call: Fresh execution ──────────────────────────────
      const req1 = new Request("http://localhost/v1/execute", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validApiKey}`,
          "X-ActionLock-Key": "create_user:alice_1",
          "X-ActionLock-Preset": "airtable",
        },
        body: JSON.stringify(requestBody),
      });

      const res1 = await worker.fetch(req1, mockEnv, {} as ExecutionContext);
      expect(res1.status).toBe(200);
      expect(res1.headers.get("X-Flowyl-Status")).toBe("executed");
      expect(res1.headers.get("X-Flowyl-Cached")).toBe("false");
      expect(res1.headers.get("X-ActionLock-Status")).toBe("executed");
      expect(res1.headers.get("X-ActionLock-Cached")).toBe("false");

      const data1 = (await res1.json()) as any;
      expect(data1.status).toBe("executed");
      expect(data1.cached).toBe(false);
      expect(data1.idempotency_key).toBe("create_user:alice_1");
      expect(data1.response.body).toEqual({ id: "record_123", created: true });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // ── Second call: Deduplicated cached execution ───────────────
      const req2 = new Request("http://localhost/v1/execute", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validApiKey}`,
          "X-Flowyl-Key": "create_user:alice_1",
        },
        body: JSON.stringify(requestBody),
      });

      const res2 = await worker.fetch(req2, mockEnv, {} as ExecutionContext);
      expect(res2.status).toBe(200);
      expect(res2.headers.get("X-Flowyl-Status")).toBe("deduplicated");
      expect(res2.headers.get("X-Flowyl-Cached")).toBe("true");
      expect(res2.headers.get("X-ActionLock-Status")).toBe("deduplicated");
      expect(res2.headers.get("X-ActionLock-Cached")).toBe("true");

      const data2 = (await res2.json()) as any;
      expect(data2.status).toBe("deduplicated");
      expect(data2.cached).toBe(true);
      expect(data2.idempotency_key).toBe("create_user:alice_1");
      expect(data2.response.body).toEqual({ id: "record_123", created: true });
      // Crucial: mockFetch was NOT called again!
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // ── Check status endpoint: GET /v1/status/:key ───────────────
      const statusReq = new Request("http://localhost/v1/status/create_user%3Aalice_1", {
        method: "GET",
        headers: { Authorization: `Bearer ${validApiKey}` },
      });
      const statusRes = await worker.fetch(statusReq, mockEnv, {} as ExecutionContext);
      expect(statusRes.status).toBe(200);
      const statusData = (await statusRes.json()) as any;
      expect(statusData.status).toBe("executed");
      expect(statusData.idempotency_key).toBe("create_user:alice_1");

      // ── Delete key: DELETE /v1/keys/:key ─────────────────────────
      const delReq = new Request("http://localhost/v1/keys/create_user%3Aalice_1", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${validApiKey}` },
      });
      const delRes = await worker.fetch(delReq, mockEnv, {} as ExecutionContext);
      expect(delRes.status).toBe(200);
      const delData = (await delRes.json()) as any;
      expect(delData.deleted).toBe(true);

      // ── Third call after deletion: executes again ─────────────────
      const req3 = new Request("http://localhost/v1/execute", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${validApiKey}`,
          "X-ActionLock-Key": "create_user:alice_1",
        },
        body: JSON.stringify(requestBody),
      });

      const res3 = await worker.fetch(req3, mockEnv, {} as ExecutionContext);
      expect(res3.status).toBe(200);
      expect(res3.headers.get("X-ActionLock-Status")).toBe("executed");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("Routing Errors", () => {
    it("should return 405 for GET /v1/execute", async () => {
      const req = new Request("http://localhost/v1/execute", {
        method: "GET",
        headers: { Authorization: `Bearer ${validApiKey}` },
      });
      const res = await worker.fetch(req, mockEnv, {} as ExecutionContext);

      expect(res.status).toBe(405);
      const data = (await res.json()) as any;
      expect(data.error.code).toBe("METHOD_NOT_ALLOWED");
    });

    it("should return 404 for non-existent paths", async () => {
      const req = new Request("http://localhost/v1/nonexistent", {
        method: "GET",
        headers: { Authorization: `Bearer ${validApiKey}` },
      });
      const res = await worker.fetch(req, mockEnv, {} as ExecutionContext);

      expect(res.status).toBe(404);
      const data = (await res.json()) as any;
      expect(data.error.code).toBe("NOT_FOUND");
    });
  });
});
