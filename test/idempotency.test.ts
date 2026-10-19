import { describe, it, expect, vi } from "vitest";
import {
  hashApiKey,
  getExecution,
  storeExecution,
  deleteExecution,
  getExecutionStatus,
} from "../src/core/idempotency";
import type { Env, ProxiedResponse } from "../src/types";

// In-memory mock KV store for testing
function createMockKV() {
  const store = new Map<string, string>();
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

describe("Idempotency Core", () => {
  describe("hashApiKey", () => {
    it("should produce deterministic 12-char hex hash", async () => {
      const hash1 = await hashApiKey("al_live_testkey123");
      const hash2 = await hashApiKey("al_live_testkey123");
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(12);
      expect(/^[0-9a-f]{12}$/.test(hash1)).toBe(true);
    });

    it("should produce different hashes for different keys", async () => {
      const hash1 = await hashApiKey("key_one");
      const hash2 = await hashApiKey("key_two");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("storeExecution and getExecution", () => {
    it("should store and retrieve execution correctly", async () => {
      const kv = createMockKV();
      const apiKeyHash = "abcd1234efgh";
      const idempotencyKey = "order:create:123";

      const mockResponse: ProxiedResponse = {
        status: 200,
        headers: { "content-type": "application/json" },
        body: { id: "ord_123", status: "success" },
      };

      const stored = await storeExecution(kv, apiKeyHash, idempotencyKey, mockResponse, 3600);
      expect(stored.idempotency_key).toBe(idempotencyKey);
      expect(stored.response).toEqual(mockResponse);
      expect(stored.executed_at).toBeDefined();

      const retrieved = await getExecution(kv, apiKeyHash, idempotencyKey);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.idempotency_key).toBe(idempotencyKey);
      expect(retrieved?.response.status).toBe(200);
      expect(retrieved?.response.body).toEqual({ id: "ord_123", status: "success" });
    });

    it("should return null for non-existent key", async () => {
      const kv = createMockKV();
      const retrieved = await getExecution(kv, "hash", "non_existent");
      expect(retrieved).toBeNull();
    });

    it("should return null and clean up corrupted json", async () => {
      const kv = createMockKV();
      const apiKeyHash = "hash1";
      const key = "corrupt_key";
      await kv.put(`actionlock:idem:${apiKeyHash}:${key}`, "invalid-json-string{");

      const retrieved = await getExecution(kv, apiKeyHash, key);
      expect(retrieved).toBeNull();

      // Check that it was deleted
      const checkAgain = await kv.get(`actionlock:idem:${apiKeyHash}:${key}`);
      expect(checkAgain).toBeNull();
    });
  });

  describe("deleteExecution", () => {
    it("should delete existing execution and return true", async () => {
      const kv = createMockKV();
      const apiKeyHash = "hash1";
      const key = "delete_me";
      const mockResponse: ProxiedResponse = {
        status: 201,
        headers: {},
        body: "Created",
      };

      await storeExecution(kv, apiKeyHash, key, mockResponse, 3600);
      const deleted = await deleteExecution(kv, apiKeyHash, key);
      expect(deleted).toBe(true);

      const retrieved = await getExecution(kv, apiKeyHash, key);
      expect(retrieved).toBeNull();
    });

    it("should return false when deleting non-existent key", async () => {
      const kv = createMockKV();
      const deleted = await deleteExecution(kv, "hash1", "does_not_exist");
      expect(deleted).toBe(false);
    });
  });

  describe("getExecutionStatus", () => {
    it("should return exists: true with execution when key found", async () => {
      const kv = createMockKV();
      const apiKeyHash = "hash1";
      const key = "status_check";
      const mockResponse: ProxiedResponse = {
        status: 200,
        headers: {},
        body: { ok: true },
      };

      await storeExecution(kv, apiKeyHash, key, mockResponse, 3600);
      const status = await getExecutionStatus(kv, apiKeyHash, key);
      expect(status.exists).toBe(true);
      expect(status.execution).toBeDefined();
      expect(status.execution?.idempotency_key).toBe(key);
    });

    it("should return exists: false when key not found", async () => {
      const kv = createMockKV();
      const status = await getExecutionStatus(kv, "hash1", "missing_key");
      expect(status.exists).toBe(false);
      expect(status.execution).toBeUndefined();
    });
  });
});
