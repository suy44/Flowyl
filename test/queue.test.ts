import { describe, it, expect, vi, beforeEach } from "vitest";
import { RateLimitQueue } from "../src/durable-objects/RateLimitQueue";
import { enqueueRequest, getQueueStatus, getQueueStub } from "../src/core/queue";
import type { Env, ProxiedRequest } from "../src/types";

function createMockDOState() {
  const store = new Map<string, any>();
  let alarmTime: number | null = null;

  return {
    storage: {
      get: vi.fn(async (key: string) => store.get(key)),
      put: vi.fn(async (key: string, value: any) => {
        store.set(key, value);
      }),
      setAlarm: vi.fn(async (time: number) => {
        alarmTime = time;
      }),
      _store: store,
      getAlarm: () => alarmTime,
    },
    blockConcurrencyWhile: vi.fn(async (fn: () => Promise<any>) => fn()),
  } as unknown as DurableObjectState;
}

describe("RateLimitQueue Durable Object", () => {
  let mockState: ReturnType<typeof createMockDOState>;
  let queueDO: RateLimitQueue;

  beforeEach(() => {
    mockState = createMockDOState();
    queueDO = new RateLimitQueue(mockState as any, {});
  });

  it("should initialize with empty queue and default tokens", async () => {
    const statusReq = new Request("https://do-internal/status?key=nonexistent");
    const statusRes = await queueDO.fetch(statusReq);
    expect(statusRes.status).toBe(404);
  });

  it("should enqueue a new item and return position and estimate", async () => {
    const enqueueReq = new Request("https://do-internal/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "item_1",
        idempotency_key: "lead_sync:123",
        request: {
          method: "POST",
          url: "https://api.hubspot.com/crm/v3/objects/contacts",
        },
        preset: "hubspot",
        ttl_seconds: 3600,
        api_key: "test_key_hash",
      }),
    });

    const res = await queueDO.fetch(enqueueReq);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.position).toBe(1);
    expect(data.queue_length).toBe(1);
    expect(data.estimated_execute_at).toBeDefined();

    // Check status via /status
    const statusReq = new Request("https://do-internal/status?key=lead_sync%3A123");
    const statusRes = await queueDO.fetch(statusReq);
    expect(statusRes.status).toBe(200);
    const statusData = (await statusRes.json()) as any;
    expect(statusData.position).toBe(1);
  });

  it("should not duplicate item if already in queue", async () => {
    const payload = {
      id: "item_duplicate",
      idempotency_key: "dup_key",
      request: { method: "GET", url: "https://api.airtable.com/v0/app/tbl" },
      preset: "airtable",
      ttl_seconds: 3600,
      api_key: "hash123",
    };

    const req1 = new Request("https://do-internal/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res1 = await queueDO.fetch(req1);
    const data1 = (await res1.json()) as any;
    expect(data1.position).toBe(1);

    const req2 = new Request("https://do-internal/enqueue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res2 = await queueDO.fetch(req2);
    const data2 = (await res2.json()) as any;
    expect(data2.position).toBe(1);
    expect(data2.queue_length).toBe(1);
  });

  it("should return 404 for unknown endpoints", async () => {
    const req = new Request("https://do-internal/unknown");
    const res = await queueDO.fetch(req);
    expect(res.status).toBe(404);
  });

  it("should return 400 for status check without key param", async () => {
    const req = new Request("https://do-internal/status");
    const res = await queueDO.fetch(req);
    expect(res.status).toBe(400);
  });
});

describe("Queue Client Helpers (src/core/queue.ts)", () => {
  it("getQueueStub should invoke idFromName and get on namespace", () => {
    const mockNamespace = {
      idFromName: vi.fn().mockReturnValue("mock_id"),
      get: vi.fn().mockReturnValue({ fetch: vi.fn() }),
    };
    const mockEnv = {
      RATE_LIMIT_QUEUE: mockNamespace,
    } as unknown as Env;

    const stub = getQueueStub(mockEnv, "api.airtable.com");
    expect(mockNamespace.idFromName).toHaveBeenCalledWith("api.airtable.com");
    expect(mockNamespace.get).toHaveBeenCalledWith("mock_id");
    expect(stub).toBeDefined();
  });

  it("enqueueRequest should call fetch on stub with POST /enqueue", async () => {
    const mockStub = {
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            queue_length: 2,
            position: 2,
            estimated_execute_at: "2026-10-18T02:00:00Z",
          }),
          { status: 200 },
        ),
      ),
    } as unknown as DurableObjectStub;

    const item = {
      id: "test_id",
      idempotency_key: "idem_key",
      request: { method: "POST", url: "https://example.com" } as ProxiedRequest,
      preset: "airtable",
      ttl_seconds: 3600,
      api_key: "api_hash",
    };

    const status = await enqueueRequest(mockStub, item);
    expect(status.position).toBe(2);
    expect(status.queue_length).toBe(2);
    expect(mockStub.fetch).toHaveBeenCalledWith(
      "https://do-internal/enqueue",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("getQueueStatus should call fetch on stub with GET /status?key=...", async () => {
    const mockStub = {
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            queue_length: 1,
            position: 1,
            estimated_execute_at: "2026-10-18T02:00:00Z",
          }),
          { status: 200 },
        ),
      ),
    } as unknown as DurableObjectStub;

    const status = await getQueueStatus(mockStub, "my:key:123");
    expect(status?.position).toBe(1);
    expect(mockStub.fetch).toHaveBeenCalledWith("https://do-internal/status?key=my%3Akey%3A123");
  });

  it("getQueueStatus should return null if DO returns 404", async () => {
    const mockStub = {
      fetch: vi.fn().mockResolvedValue(new Response("Not in queue", { status: 404 })),
    } as unknown as DurableObjectStub;

    const status = await getQueueStatus(mockStub, "nonexistent");
    expect(status).toBeNull();
  });
});
