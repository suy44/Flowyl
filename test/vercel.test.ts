import { describe, it, expect, vi } from "vitest";
import handler, { config } from "../api/index";

describe("Vercel Edge Function Adapter", () => {
  it("should declare runtime as edge", () => {
    expect(config.runtime).toBe("edge");
  });

  it("should handle GET / without Cloudflare env bindings", async () => {
    const req = new Request("http://localhost/");
    const res = await handler(req);

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.name).toBe("Flowyl API");
    expect(data.status).toBe("online");
  });

  it("should handle GET /v1/health without Cloudflare env bindings", async () => {
    const req = new Request("http://localhost/v1/health");
    const res = await handler(req);

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("healthy");
    expect(data.version).toBe("0.1.0");
  });

  it("should authenticate using default demo API key on Vercel", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ id: "record_test_vercel", success: true }),
      text: async () => JSON.stringify({ id: "record_test_vercel", success: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const req = new Request("http://localhost/v1/execute", {
      method: "POST",
      headers: {
        Authorization: "Bearer ak_test_dev123",
        "X-ActionLock-Key": "vercel_test_key_1",
      },
      body: JSON.stringify({
        method: "POST",
        url: "https://api.example.com/items",
        body: { test: true },
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("executed");
    expect(data.cached).toBe(false);

    // Call second time to verify memory KV deduplication on Vercel
    const req2 = new Request("http://localhost/v1/execute", {
      method: "POST",
      headers: {
        Authorization: "Bearer ak_test_dev123",
        "X-ActionLock-Key": "vercel_test_key_1",
      },
      body: JSON.stringify({
        method: "POST",
        url: "https://api.example.com/items",
        body: { test: true },
      }),
    });

    const res2 = await handler(req2);
    expect(res2.status).toBe(200);
    const data2 = (await res2.json()) as any;
    expect(data2.status).toBe("deduplicated");
    expect(data2.cached).toBe(true);

    vi.restoreAllMocks();
  });
});
