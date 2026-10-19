/**
 * Header parsing utilities for Flowyl gateway headers.
 * Supports both modern Flowyl headers (X-Flowyl-*) and legacy ActionLock headers (X-ActionLock-*).
 */

/** Parse the X-Flowyl-Key (or legacy X-ActionLock-Key) header. Returns null if missing/empty. */
export function parseIdempotencyKey(request: Request): string | null {
  const key = request.headers.get("X-Flowyl-Key") || request.headers.get("X-ActionLock-Key");
  if (!key || key.trim().length === 0) return null;
  // Enforce max key length to prevent abuse
  if (key.length > 256) return null;
  return key.trim();
}

/** Parse the X-Flowyl-TTL (or legacy X-ActionLock-TTL) header. Returns seconds or defaultTTL. */
export function parseTTL(request: Request, defaultTTL: number): number {
  const raw = request.headers.get("X-Flowyl-TTL") || request.headers.get("X-ActionLock-TTL");
  if (!raw) return defaultTTL;
  const ttl = parseInt(raw, 10);
  if (isNaN(ttl) || ttl < 1) return defaultTTL;
  return ttl;
}

/** Parse the X-Flowyl-Preset (or legacy X-ActionLock-Preset) header. Returns lowercase name or null. */
export function parsePreset(request: Request): string | null {
  const preset = request.headers.get("X-Flowyl-Preset") || request.headers.get("X-ActionLock-Preset");
  if (!preset || preset.trim().length === 0) return null;
  return preset.trim().toLowerCase();
}

/** Extract Bearer token from Authorization header. */
export function parseBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}
