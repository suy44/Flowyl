import type { ProxiedRequest, ProxiedResponse } from "../types";

/**
 * Forward an HTTP request to the downstream target and capture
 * the full response (status, headers, body).
 *
 * This is the actual "proxy" — it takes the client's described request,
 * executes it against the real API, and returns a structured response.
 */
export async function executeProxiedRequest(
  request: ProxiedRequest,
): Promise<ProxiedResponse> {
  // Validate URL
  let targetUrl: URL;
  try {
    targetUrl = new URL(request.url);
  } catch {
    throw new ProxyError("Invalid target URL", 400);
  }

  // Block requests to internal/private addresses
  if (isPrivateUrl(targetUrl)) {
    throw new ProxyError("Requests to private/internal addresses are not allowed", 403);
  }

  // Build the outgoing fetch request
  const method = (request.method ?? "GET").toUpperCase();
  const headers = new Headers(request.headers ?? {});

  // Ensure we identify ourselves
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", "ActionLock/0.1.0");
  }

  const fetchInit: RequestInit = {
    method,
    headers,
    // Only attach body for methods that support it
    ...(["POST", "PUT", "PATCH"].includes(method) && request.body !== undefined
      ? { body: typeof request.body === "string" ? request.body : JSON.stringify(request.body) }
      : {}),
  };

  let response: Response;
  try {
    response = await fetch(targetUrl.toString(), fetchInit);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown fetch error";
    throw new ProxyError(`Upstream request failed: ${message}`, 502);
  }

  // Capture response headers (flatten to Record<string, string>)
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  // Capture response body
  let responseBody: unknown;
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }
  } catch {
    responseBody = null;
  }

  return {
    status: response.status,
    headers: responseHeaders,
    body: responseBody,
  };
}

/**
 * Check if the response from the target API is a 429 rate limit error.
 * Also extracts the Retry-After header if present.
 */
export function isRateLimited(response: ProxiedResponse): {
  limited: boolean;
  retryAfter: string | null;
} {
  if (response.status === 429) {
    return {
      limited: true,
      retryAfter: response.headers["retry-after"] ?? response.headers["Retry-After"] ?? null,
    };
  }
  return { limited: false, retryAfter: null };
}

/**
 * Prevent SSRF by blocking requests to private/internal IPs.
 */
function isPrivateUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  const privatePatterns = [
    /^localhost$/,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^0\.0\.0\.0$/,
    /^::1$/,
    /^fc00:/,
    /^fe80:/,
    /^169\.254\./,
    /\.local$/,
    /\.internal$/,
  ];
  return privatePatterns.some((p) => p.test(hostname));
}

/**
 * Custom error class for proxy failures with HTTP status codes.
 */
export class ProxyError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "ProxyError";
  }
}
