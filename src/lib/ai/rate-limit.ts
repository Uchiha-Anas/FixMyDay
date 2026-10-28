/**
 * Small in-memory sliding-window rate limiter. It protects a single server
 * instance from runaway AI spend; on multi-instance deployments swap it for a
 * shared store (e.g. Redis/Upstash) using the same interface.
 */
export function createRateLimiter(options: { limit: number; windowMs: number; maxKeys?: number }) {
  const hits = new Map<string, number[]>();
  const maxKeys = options.maxKeys ?? 10_000;

  return {
    check(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSec: number } {
      const since = now - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((t) => t > since);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + options.windowMs - now) / 1000)) };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) hits.delete(oldest);
      }
      return { ok: true };
    },
  };
}
