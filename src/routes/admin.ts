import type { Env, PlanTier } from "../types";
import { jsonResponse, errorResponse } from "../utils/response";
import { analytics } from "../storage/analytics";

declare const process: any;

function getAdminSecret(env?: Env): string {
  return (
    (env as any)?.FLOWYL_API_KEYS ||
    (env as any)?.FLOWYL_ADMIN_SECRET ||
    env?.ACTIONLOCK_API_KEYS ||
    (typeof process !== "undefined"
      ? process.env?.FLOWYL_ADMIN_SECRET ||
        process.env?.FLOWYL_API_KEYS ||
        process.env?.ACTIONLOCK_ADMIN_SECRET ||
        process.env?.ADMIN_KEY
      : undefined) ||
    "admin123"
  );
}

function verifyAdminAuth(request: Request, env?: Env): boolean {
  const adminSecret = getAdminSecret(env);
  const authHeader = request.headers.get("Authorization") || "";
  const adminKeyHeader =
    request.headers.get("X-Flowyl-Admin-Key") ||
    request.headers.get("X-ActionLock-Admin-Key") ||
    "";

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  return token === adminSecret || adminKeyHeader === adminSecret;
}

/**
 * GET /v1/admin/overview
 * Returns dashboard metrics, active users, visitor stats, and activity logs.
 */
export async function handleAdminOverview(request: Request, env?: Env): Promise<Response> {
  if (!verifyAdminAuth(request, env)) {
    return errorResponse("Unauthorized admin access. Provide valid X-Flowyl-Admin-Key header.", 401, "ADMIN_UNAUTHORIZED");
  }

  const summary = analytics.getSummary();
  return jsonResponse(summary);
}

/**
 * POST /v1/admin/keys
 * Generates a new API key for a customer/developer.
 */
export async function handleAdminCreateKey(request: Request, env?: Env): Promise<Response> {
  if (!verifyAdminAuth(request, env)) {
    return errorResponse("Unauthorized admin access.", 401, "ADMIN_UNAUTHORIZED");
  }

  let body: { owner_id?: string; tier?: PlanTier } = {};
  try {
    body = (await request.json()) as any;
  } catch {
    body = {};
  }

  const ownerId = (body.owner_id || "").trim() || `user_${Math.random().toString(36).substring(2, 8)}`;
  const tier: PlanTier = ["free", "starter", "pro"].includes(body.tier as PlanTier)
    ? (body.tier as PlanTier)
    : "free";

  const result = analytics.createKey(ownerId, tier);

  return jsonResponse({
    success: true,
    message: "API Key created successfully.",
    api_key: result.key,
    metadata: result.metadata,
  }, 201);
}

/**
 * DELETE /v1/admin/keys/:key
 * Revokes an existing API key.
 */
export async function handleAdminRevokeKey(request: Request, env?: Env): Promise<Response> {
  if (!verifyAdminAuth(request, env)) {
    return errorResponse("Unauthorized admin access.", 401, "ADMIN_UNAUTHORIZED");
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const keyToRevoke = decodeURIComponent(pathParts.slice(4).join("/"));

  if (!keyToRevoke) {
    return errorResponse("Missing key to revoke in path. Use: DELETE /v1/admin/keys/<key>", 400, "MISSING_KEY");
  }

  const revoked = analytics.revokeKey(keyToRevoke);
  if (!revoked) {
    return errorResponse(`Key "${keyToRevoke}" not found or already revoked.`, 404, "KEY_NOT_FOUND");
  }

  return jsonResponse({
    success: true,
    message: `API Key "${keyToRevoke}" revoked.`,
  });
}

/**
 * POST /v1/track
 * Lightweight beacon for website visitor tracking.
 */
export async function handleTrackVisit(request: Request): Promise<Response> {
  const ip =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    "visitor";

  let path = "/";
  try {
    const body = (await request.json()) as { path?: string };
    if (body?.path) path = body.path;
  } catch {
    // ignore
  }

  analytics.recordPageView(ip, path);

  return jsonResponse({ tracked: true }, 200, {
    "Cache-Control": "no-store",
  });
}
