import { describe, it, expect } from "vitest";
import worker from "../src/index";

describe("Admin Dashboard & Telemetry Endpoints", () => {
  it("GET /v1/admin/overview should reject requests with invalid admin key", async () => {
    const req = new Request("http://localhost/v1/admin/overview", {
      headers: { "X-ActionLock-Admin-Key": "wrong_password" },
    });
    const res = await worker.fetch(req);

    expect(res.status).toBe(401);
    const data = (await res.json()) as any;
    expect(data.error.code).toBe("ADMIN_UNAUTHORIZED");
  });

  it("GET /v1/admin/overview should return full analytics summary with valid key", async () => {
    const req = new Request("http://localhost/v1/admin/overview", {
      headers: { "X-Flowyl-Admin-Key": "admin123" },
    });
    const res = await worker.fetch(req);

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.website_visitors).toBeDefined();
    expect(data.api_metrics).toBeDefined();
    expect(data.api_metrics.duplicates_prevented).toBeGreaterThanOrEqual(0);
    expect(data.active_users_count).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(data.api_keys)).toBe(true);
  });

  it("POST /v1/admin/keys should create a new API key with chosen tier", async () => {
    const req = new Request("http://localhost/v1/admin/keys", {
      method: "POST",
      headers: {
        "X-ActionLock-Admin-Key": "admin123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        owner_id: "Acme Agency",
        tier: "pro",
      }),
    });
    const res = await worker.fetch(req);

    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.api_key).toMatch(/^ak_live_/);
    expect(data.metadata.owner_id).toBe("Acme Agency");
    expect(data.metadata.tier).toBe("pro");
  });

  it("POST /v1/keys/free should allow developers to provision a free key without admin auth", async () => {
    const req = new Request("http://localhost/v1/keys/free", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_name: "Agent Workflow Alpha",
        email: "alex@example.com",
      }),
    });
    const res = await worker.fetch(req);

    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.api_key).toMatch(/^ak_live_/);
    expect(data.metadata.owner_id).toBe("Agent Workflow Alpha");
    expect(data.metadata.tier).toBe("free");
    expect(data.metadata.monthly_limit).toBe(5000);
  });

  it("POST /v1/track should record page visit telemetry", async () => {
    const req = new Request("http://localhost/v1/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/features" }),
    });
    const res = await worker.fetch(req);

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.tracked).toBe(true);
  });
});
