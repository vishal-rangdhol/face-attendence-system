import type { Context, Next } from "hono";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

/**
 * Lightweight in-memory rate limiter middleware for sensitive endpoints.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const store = new Map<string, { count: number; resetTime: number }>();

  return async function rateLimiter(c: Context, next: Next) {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("cf-connecting-ip") ||
      "unknown-client";

    const now = Date.now();
    const client = store.get(ip);

    if (client && now < client.resetTime) {
      if (client.count >= options.maxRequests) {
        return c.json(
          { error: "Too many requests. Please try again later." },
          429
        );
      }
      client.count++;
    } else {
      store.set(ip, { count: 1, resetTime: now + options.windowMs });
    }

    // Prune stale records when store exceeds threshold
    if (store.size > 1000) {
      for (const [key, val] of store.entries()) {
        if (now >= val.resetTime) {
          store.delete(key);
        }
      }
    }

    await next();
  };
}
