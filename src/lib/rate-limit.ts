// src/lib/rate-limit.ts
// PRD §11.2 — In-memory rate limiter (per-IP + per-user)

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean expired entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
        if (entry.resetAt < now) store.delete(key);
    }
}, 60_000);

interface RateLimitConfig {
    limit: number;
    windowMs: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
    'ai': { limit: 20, windowMs: 60 * 60 * 1000 },          // 20/hour
    'import': { limit: 3, windowMs: 24 * 60 * 60 * 1000 },   // 3/day
    'checkout': { limit: 30, windowMs: 60 * 60 * 1000 },     // 30/hour
    'auth': { limit: 10, windowMs: 60 * 1000 },              // 10/min
};

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
}

export function checkRateLimit(
    key: string,
    config: RateLimitConfig
): RateLimitResult {
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || entry.resetAt < now) {
        // New window
        store.set(key, { count: 1, resetAt: now + config.windowMs });
        return { allowed: true, remaining: config.limit - 1, resetAt: now + config.windowMs };
    }

    if (entry.count >= config.limit) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Rate limit helper for API routes.
 * Returns a Response if rate limited, null if OK.
 */
export function rateLimitResponse(
    identifier: string,
    category: keyof typeof RATE_LIMITS
): Response | null {
    const config = RATE_LIMITS[category];
    if (!config) return null;

    const result = checkRateLimit(`${category}:${identifier}`, config);

    if (!result.allowed) {
        return new Response(
            JSON.stringify({
                error: 'Rate limit exceeded',
                retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
            }),
            {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
                    'X-RateLimit-Remaining': '0',
                },
            }
        );
    }

    return null;
}
