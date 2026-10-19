import { jsonResponse } from "../utils/response";
import { RATE_LIMIT_PRESETS } from "../core/presets";

/**
 * GET /v1/health
 *
 * Public health check — no auth required.
 * Returns service status and available presets.
 */
export function handleHealth(): Response {
  return jsonResponse({
    status: "healthy",
    service: "Flowyl",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    presets: Object.keys(RATE_LIMIT_PRESETS),
    docs: "https://flowyl.vercel.app/docs",
  });
}
