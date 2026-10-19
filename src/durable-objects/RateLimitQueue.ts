import type { ProxiedRequest, ProxiedResponse } from "../types";
import { executeProxiedRequest, isRateLimited } from "../core/proxy";
import { resolvePreset, calculateRetryDelay } from "../core/presets";

/**
 * RateLimitQueue Durable Object
 *
 * One instance per destination hostname. Manages a FIFO queue of outbound
 * requests and drains them at the rate specified by the preset (or a default).
 *
 * Uses a token bucket algorithm to control throughput:
 *  - Tokens refill at `requests_per_second` rate
 *  - Burst capacity = `burst` tokens
 *  - When empty, requests wait until a token is available
 */

interface QueueEntry {
  id: string;
  idempotency_key: string;
  request: ProxiedRequest;
  preset: string | null;
  ttl_seconds: number;
  api_key_hash: string;
  enqueued_at: number;
  retry_count: number;
  resolve_url: string | null;
}

interface QueueState {
  queue: QueueEntry[];
  tokens: number;
  last_refill: number;
  processing: boolean;
}

export class RateLimitQueue implements DurableObject {
  private state: DurableObjectState;
  private queueData: QueueState;
  private alarm_scheduled: boolean;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    this.alarm_scheduled = false;
    this.queueData = {
      queue: [],
      tokens: 10, // Default burst
      last_refill: Date.now(),
      processing: false,
    };

    // Restore state from storage on cold start
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<QueueState>("queueState");
      if (stored) {
        this.queueData = stored;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/enqueue":
        return this.handleEnqueue(request);
      case "/status":
        return this.handleStatus(url);
      case "/drain":
        return this.handleDrain();
      default:
        return new Response("Not Found", { status: 404 });
    }
  }

  /**
   * Handle alarm — this is the main drain loop trigger.
   * Called by the Cloudflare runtime when the alarm fires.
   */
  async alarm(): Promise<void> {
    this.alarm_scheduled = false;
    await this.drainQueue();
  }

  // ─── Enqueue ─────────────────────────────────────────────────────

  private async handleEnqueue(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      id: string;
      idempotency_key: string;
      request: ProxiedRequest;
      preset: string | null;
      ttl_seconds: number;
      api_key: string;
    };

    const entry: QueueEntry = {
      id: body.id,
      idempotency_key: body.idempotency_key,
      request: body.request,
      preset: body.preset,
      ttl_seconds: body.ttl_seconds,
      api_key_hash: body.api_key,
      enqueued_at: Date.now(),
      retry_count: 0,
      resolve_url: null,
    };

    // Check for duplicate in queue
    const existing = this.queueData.queue.findIndex(
      (e) => e.idempotency_key === entry.idempotency_key,
    );
    if (existing !== -1) {
      return Response.json({
        queue_length: this.queueData.queue.length,
        position: existing + 1,
        estimated_execute_at: this.estimateExecutionTime(existing),
      });
    }

    this.queueData.queue.push(entry);
    await this.persistState();

    // Schedule drain if not already scheduled
    await this.scheduleDrain(100);

    const position = this.queueData.queue.length;
    return Response.json({
      queue_length: position,
      position,
      estimated_execute_at: this.estimateExecutionTime(position - 1),
    });
  }

  // ─── Status ──────────────────────────────────────────────────────

  private handleStatus(url: URL): Response {
    const key = url.searchParams.get("key");
    if (!key) return new Response("Missing key param", { status: 400 });

    const index = this.queueData.queue.findIndex((e) => e.idempotency_key === key);
    if (index === -1) {
      return new Response("Not in queue", { status: 404 });
    }

    return Response.json({
      queue_length: this.queueData.queue.length,
      position: index + 1,
      estimated_execute_at: this.estimateExecutionTime(index),
    });
  }

  // ─── Drain ───────────────────────────────────────────────────────

  private async handleDrain(): Promise<Response> {
    await this.drainQueue();
    return Response.json({ remaining: this.queueData.queue.length });
  }

  private async drainQueue(): Promise<void> {
    if (this.queueData.processing || this.queueData.queue.length === 0) return;

    this.queueData.processing = true;

    try {
      // Refill tokens
      this.refillTokens();

      // Process as many queued items as we have tokens for
      let processed = 0;
      const maxBatch = Math.min(this.queueData.queue.length, 10); // Max 10 per alarm

      while (this.queueData.queue.length > 0 && this.queueData.tokens >= 1 && processed < maxBatch) {
        const entry = this.queueData.queue[0];
        this.queueData.tokens -= 1;

        try {
          const response = await executeProxiedRequest(entry.request);
          const rateLimitCheck = isRateLimited(response);

          if (rateLimitCheck.limited) {
            // Got 429 — re-queue with backoff
            const preset = resolvePreset(entry.preset);
            if (preset && entry.retry_count < preset.max_retries) {
              entry.retry_count += 1;
              const delay = calculateRetryDelay(preset, entry.retry_count, rateLimitCheck.retryAfter);
              // Move to back of queue
              this.queueData.queue.shift();
              this.queueData.queue.push(entry);
              // Schedule next drain after the delay
              await this.scheduleDrain(delay);
            } else {
              // Max retries exceeded — store failure and remove
              await this.storeResult(entry, response);
              this.queueData.queue.shift();
            }
          } else {
            // Success — store result and remove from queue
            await this.storeResult(entry, response);
            this.queueData.queue.shift();
          }
        } catch (err) {
          // Fetch error — retry if possible
          const preset = resolvePreset(entry.preset);
          if (preset && entry.retry_count < preset.max_retries) {
            entry.retry_count += 1;
            this.queueData.queue.shift();
            this.queueData.queue.push(entry);
          } else {
            // Give up
            this.queueData.queue.shift();
          }
        }

        processed++;
      }

      // If there are more items, schedule another drain
      if (this.queueData.queue.length > 0) {
        const preset = resolvePreset(this.queueData.queue[0].preset);
        const intervalMs = preset ? Math.ceil(1000 / preset.requests_per_second) : 200;
        await this.scheduleDrain(intervalMs);
      }
    } finally {
      this.queueData.processing = false;
      await this.persistState();
    }
  }

  // ─── Token Bucket ────────────────────────────────────────────────

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.queueData.last_refill) / 1000;
    this.queueData.last_refill = now;

    // Use the first item's preset to determine refill rate
    const firstItem = this.queueData.queue[0];
    const preset = firstItem ? resolvePreset(firstItem.preset) : undefined;
    const rps = preset?.requests_per_second ?? 5;
    const maxBurst = preset?.burst ?? 10;

    this.queueData.tokens = Math.min(
      maxBurst,
      this.queueData.tokens + elapsed * rps,
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private async storeResult(entry: QueueEntry, response: ProxiedResponse): Promise<void> {
    // Store the result in DO storage keyed by idempotency_key
    // This allows the status endpoint to return the result
    await this.state.storage.put(`result:${entry.idempotency_key}`, {
      response,
      executed_at: new Date().toISOString(),
      idempotency_key: entry.idempotency_key,
    });

    // Auto-expire result after 1 hour (cleanup)
    // In production, this would also write back to the Worker's KV
  }

  private estimateExecutionTime(position: number): string {
    const firstItem = this.queueData.queue[0];
    const preset = firstItem ? resolvePreset(firstItem.preset) : undefined;
    const rps = preset?.requests_per_second ?? 5;
    const estimatedSeconds = position / rps;
    const estimatedTime = new Date(Date.now() + estimatedSeconds * 1000);
    return estimatedTime.toISOString();
  }

  private async scheduleDrain(delayMs: number): Promise<void> {
    if (this.alarm_scheduled) return;
    const scheduledTime = Date.now() + delayMs;
    await this.state.storage.setAlarm(scheduledTime);
    this.alarm_scheduled = true;
  }

  private async persistState(): Promise<void> {
    await this.state.storage.put("queueState", this.queueData);
  }
}
