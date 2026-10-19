import type { Env } from "./types";
import { authenticateRequest } from "./auth/api-key";
import { handleExecute } from "./routes/execute";
import { handleStatus } from "./routes/status";
import { handleDeleteKey } from "./routes/keys";
import { handleHealth } from "./routes/health";
import {
  handleAdminOverview,
  handleAdminCreateKey,
  handleAdminRevokeKey,
  handleTrackVisit,
  handleCreateFreeKey,
} from "./routes/admin";
import { errorResponse, corsPreflightResponse, jsonResponse } from "./utils/response";

// Re-export Durable Object class so Cloudflare can instantiate it
export { RateLimitQueue } from "./durable-objects/RateLimitQueue";

/**
 * ActionLock — Cloudflare Worker & API Router
 *
 * Router:
 *   GET    /                 → API overview & discovery
 *   GET    /v1/health        → Public health check
 *   POST   /v1/keys/free     → Generate free API key
 *   POST   /v1/execute       → Main proxy endpoint (auth required)
 *   GET    /v1/status/:key   → Check idempotency key status (auth required)
 *   DELETE /v1/keys/:key     → Invalidate cached execution (auth required)
 *   OPTIONS *                → CORS preflight
 */
export default {
  async fetch(request: Request, env?: Env, _ctx?: ExecutionContext): Promise<Response> {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return corsPreflightResponse();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // ── Public routes (no auth) ────────────────────────────────
    if (path === "/v1/health" && request.method === "GET") {
      return handleHealth();
    }

    // Telemetry: record page visit from website
    if (path === "/v1/track" && request.method === "POST") {
      return handleTrackVisit(request);
    }

    // Public: Provision free developer API key
    if (path === "/v1/keys/free" && request.method === "POST") {
      return handleCreateFreeKey(request);
    }

    // Root API overview
    if (path === "/" || path === "") {
      return jsonResponse({
        name: "Flowyl API",
        version: "0.1.0",
        description: "Flowyl — Idempotency and Rate Limiting Gateway for AI Agents",
        status: "online",
        endpoints: {
          health: "GET /v1/health",
          free_key: "POST /v1/keys/free",
          execute: "POST /v1/execute",
          status: "GET /v1/status/:key",
          delete_key: "DELETE /v1/keys/:key",
          admin_overview: "GET /v1/admin/overview",
        },
      });
    }

    // ── Admin routes (protected by admin secret) ───────────────
    const resolvedEnv: Env = env ?? {};

    if (path === "/v1/admin/overview" && request.method === "GET") {
      return handleAdminOverview(request, resolvedEnv);
    }

    if (path === "/v1/admin/keys" && request.method === "POST") {
      return handleAdminCreateKey(request, resolvedEnv);
    }

    if (path.startsWith("/v1/admin/keys/") && request.method === "DELETE") {
      return handleAdminRevokeKey(request, resolvedEnv);
    }

    // ── Authenticated routes ───────────────────────────────────
    const authResult = await authenticateRequest(request, resolvedEnv);
    if (!authResult.authenticated) {
      return authResult.errorResponse!;
    }

    const apiKey = authResult.apiKey!;
    const metadata = authResult.metadata!;

    // POST /v1/execute
    if (path === "/v1/execute" && request.method === "POST") {
      return handleExecute(request, resolvedEnv, apiKey, metadata);
    }

    // GET /v1/status/:key
    if (path.startsWith("/v1/status/") && request.method === "GET") {
      return handleStatus(request, resolvedEnv, apiKey, metadata);
    }

    // DELETE /v1/keys/:key
    if (path.startsWith("/v1/keys/") && request.method === "DELETE") {
      return handleDeleteKey(request, resolvedEnv, apiKey, metadata);
    }

    // ── Method not allowed ─────────────────────────────────────
    if (path === "/v1/execute") {
      return errorResponse("Method not allowed. Use POST.", 405, "METHOD_NOT_ALLOWED");
    }

    // ── 404 ────────────────────────────────────────────────────
    return errorResponse(
      `Route not found: ${request.method} ${path}`,
      404,
      "NOT_FOUND",
      {
        available_routes: [
          "GET  /v1/health",
          "POST /v1/execute",
          "GET  /v1/status/:key",
          "DELETE /v1/keys/:key",
        ],
      },
    );
  },
};
