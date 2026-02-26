// src/lib/rate-limit.ts
// PRD §11.2 — Hybrid rate limiter: Upstash Redis in production, in-memory fallback
// Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env vars for Redis mode

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

// ── In-memory store (fallback for local dev / no Redis) ──
const memoryStore = new Map<string, RateLimitEntry>();

// Clean expired entries periodically
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of memoryStore) {
            if (entry.resetAt < now) memoryStore.delete(key);
        }
    }, 60_000);
}

interface RateLimitConfig {
    limit: number;
    windowMs: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
    'ai': { limit: 20, windowMs: 60 * 60 * 1000 },          // 20/hour
    'import': { limit: 3, windowMs: 24 * 60 * 60 * 1000 },   // 3/day
    'checkout': { limit: 30, windowMs: 60 * 60 * 1000 },     // 30/hour
    'auth': { limit: 10, windowMs: 60 * 1000 },              // 10/min
    'pipeline-start': { limit: 10, windowMs: 60 * 60 * 1000 }, // 10/hour per user
    'scrape-profile': { limit: 5, windowMs: 60 * 60 * 1000 },  // 5/hour per user
    'scrape-prefetch': { limit: 20, windowMs: 60 * 60 * 1000 }, // 20/hour per IP
};

interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
}

// ── Redis-backed rate limiter (Upstash REST API, no dependencies required) ──
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

async function redisIncr(key: string, windowMs: number): Promise<{ count: number; ttl: number }> {
    const url = `${UPSTASH_URL}`;
    const pipeline = [
        ['INCR', key],
        ['PTTL', key],
    ];

    const res = await fetch(`${url}/pipeline`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${UPSTASH_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(pipeline),
    });

    const results = await res.json() as { result: number }[];
    const count = results[0]?.result || 1;
    const ttl = results[1]?.result || -1;

    // Set TTL on first increment (when key was just created)
    if (count === 1 || ttl < 0) {
        await fetch(`${url}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${UPSTASH_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(['PEXPIRE', key, windowMs]),
        });
    }

    return { count, ttl: ttl > 0 ? ttl : windowMs };
}

export function checkRateLimit(
    key: string,
    config: RateLimitConfig
): RateLimitResult {
    const now = Date.now();
    const entry = memoryStore.get(key);

    if (!entry || entry.resetAt < now) {
        memoryStore.set(key, { count: 1, resetAt: now + config.windowMs });
        return { allowed: true, remaining: config.limit - 1, resetAt: now + config.windowMs };
    }

    if (entry.count >= config.limit) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return { allowed: true, remaining: config.limit - entry.count, resetAt: entry.resetAt };
}

/**
 * Async rate limit check — uses Redis if available, otherwise in-memory.
 */
export async function checkRateLimitAsync(
    key: string,
    config: RateLimitConfig
): Promise<RateLimitResult> {
    if (!useRedis) {
        return checkRateLimit(key, config);
    }

    try {
        const redisKey = `rl:${key}`;
        const { count, ttl } = await redisIncr(redisKey, config.windowMs);
        const resetAt = Date.now() + ttl;

        return {
            allowed: count <= config.limit,
            remaining: Math.max(0, config.limit - count),
            resetAt,
        };
    } catch {
        // Redis failure → fall back to in-memory
        return checkRateLimit(key, config);
    }
}

/**
 * Rate limit helper for API routes.
 * Returns a Response if rate limited, null if OK.
 * Uses Redis when available (async version).
 */
export async function rateLimitResponseAsync(
    identifier: string,
    category: keyof typeof RATE_LIMITS
): Promise<Response | null> {
    const config = RATE_LIMITS[category];
    if (!config) return null;

    const result = await checkRateLimitAsync(`${category}:${identifier}`, config);

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

/**
 * Synchronous rate limit helper (backward compatible, in-memory only).
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
