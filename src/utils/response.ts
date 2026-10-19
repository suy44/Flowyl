/**
 * Standardized JSON response helpers.
 * All ActionLock responses use a consistent envelope.
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-ActionLock-Key, X-ActionLock-TTL, X-ActionLock-Preset",
  "Access-Control-Max-Age": "86400",
};

export function jsonResponse(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Powered-By": "ActionLock",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

export function errorResponse(
  message: string,
  status: number,
  code?: string,
  details?: unknown,
): Response {
  return jsonResponse(
    {
      error: {
        message,
        code: code ?? httpStatusToCode(status),
        ...(details ? { details } : {}),
      },
    },
    status,
  );
}

export function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

function httpStatusToCode(status: number): string {
  const map: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    422: "UNPROCESSABLE_ENTITY",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
  };
  return map[status] ?? "UNKNOWN_ERROR";
}
