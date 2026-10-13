/**
 * Simple fixed-window rate limiter kept in memory.
 *
 * Good enough for a demo, with one caveat: on Vercel each serverless instance has
 * its own memory, so the limit applies per instance and resets on cold starts.
 * For real traffic, use a shared store (e.g. Upstash Redis / Vercel KV).
 */

export const RATE_LIMIT = 10; // requests
export const RATE_WINDOW_MS = 60_000; // per minute

type Entry = { count: number; resetAt: number };
const hits = new Map<string, Entry>();

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

export function checkRateLimit(key: string, now = Date.now()): RateLimitResult {
  // Drop expired entries now and then so the map can't grow forever.
  if (hits.size > 5000) {
    for (const [k, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(k);
    }
  }

  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true };
  }
  if (entry.count >= RATE_LIMIT) {
    return { ok: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { ok: true };
}

/**
 * Best-effort client IP. On Vercel, x-forwarded-for is set by the platform
 * (the first entry is the real client), so it can't be spoofed there.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
