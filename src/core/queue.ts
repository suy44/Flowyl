import type { Env, QueuedItem, QueueStatus } from "../types";

/**
 * Interface for communicating with the RateLimitQueue Durable Object.
 *
 * Each destination (identified by hostname) gets its own DO instance,
 * ensuring independent rate limiting per target API.
 */

/**
 * Get the Durable Object stub for a given destination hostname.
 */
export function getQueueStub(env: Env, destinationHost: string): DurableObjectStub {
  if (!env.RATE_LIMIT_QUEUE) {
    throw new Error("RATE_LIMIT_QUEUE is not configured in this environment");
  }
  const id = env.RATE_LIMIT_QUEUE.idFromName(destinationHost);
  return env.RATE_LIMIT_QUEUE.get(id);
}

/**
 * Enqueue a request into the rate-limit queue for a specific destination.
 * Returns queue position and estimated execution time.
 */
export async function enqueueRequest(
  stub: DurableObjectStub,
  item: Omit<QueuedItem, "enqueued_at" | "retry_count" | "next_attempt_at">,
): Promise<QueueStatus> {
  const response = await stub.fetch("https://do-internal/enqueue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });

  if (!response.ok) {
    throw new Error(`Queue enqueue failed: ${response.status}`);
  }

  return (await response.json()) as QueueStatus;
}

/**
 * Get queue status for a specific item.
 */
export async function getQueueStatus(
  stub: DurableObjectStub,
  idempotencyKey: string,
): Promise<QueueStatus | null> {
  const response = await stub.fetch(
    `https://do-internal/status?key=${encodeURIComponent(idempotencyKey)}`,
  );

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Queue status check failed: ${response.status}`);

  return (await response.json()) as QueueStatus;
}
