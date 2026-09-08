/**
 * Fixed-window rate limiter for write endpoints (GamePlan.md Section 5.5).
 *
 * Not wired into anything yet — no write endpoints exist. Usage:
 *
 *   if (!rateLimit(`guess:${userId}`, 20, 60_000)) return new Response(null, { status: 429 });
 *
 * ponytail: in-memory and per-instance, so on Vercel each serverless instance
 * keeps its own counter and limits are effectively looser than configured.
 * That is fine for abuse/spam prevention at this traffic level. Swap the body
 * for Upstash Redis (`@upstash/ratelimit`) if limits ever need to be exact
 * across instances — the signature stays the same.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

/** Returns true if the call is allowed, false if the key is over its limit. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    if (hits.size > 10_000) sweep(now);
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count += 1;
  return true;
}

/** Drops expired entries so the map can't grow without bound. */
function sweep(now: number) {
  for (const [key, entry] of hits) {
    if (now >= entry.resetAt) hits.delete(key);
  }
}

/** Test hook — resets all counters. */
export function _reset() {
  hits.clear();
}
