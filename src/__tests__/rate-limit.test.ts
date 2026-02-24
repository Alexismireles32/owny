// Test: Rate limiting
// PRD requires rate limiting on /api/ai/* and /api/import/* endpoints

import { describe, it, expect, beforeEach } from 'vitest';

// Inline rate limiting logic for unit testing (mirrors src/lib/rate-limit.ts)
interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
    ai: { maxRequests: 20, windowMs: 60 * 60 * 1000 },        // 20/hour
    import: { maxRequests: 3, windowMs: 24 * 60 * 60 * 1000 }, // 3/day
    checkout: { maxRequests: 10, windowMs: 60 * 60 * 1000 },   // 10/hour
    auth: { maxRequests: 5, windowMs: 15 * 60 * 1000 },        // 5/15min
};

const store = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(identifier: string, category: string): { allowed: boolean; remaining: number; resetAt: number } {
    const config = RATE_LIMITS[category];
    if (!config) return { allowed: true, remaining: Infinity, resetAt: 0 };

    const key = `${category}:${identifier}`;
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + config.windowMs });
        return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
    }

    if (entry.count >= config.maxRequests) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}

describe('Rate Limiting', () => {
    beforeEach(() => {
        store.clear();
    });

    it('should allow requests within the limit', () => {
        const result = checkRateLimit('user1', 'ai');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(19); // 20 - 1
    });

    it('should block requests exceeding the limit', () => {
        // Use up all 20 AI requests
        for (let i = 0; i < 20; i++) {
            const result = checkRateLimit('user2', 'ai');
            expect(result.allowed).toBe(true);
        }

        // 21st request should be blocked
        const result = checkRateLimit('user2', 'ai');
        expect(result.allowed).toBe(false);
        expect(result.remaining).toBe(0);
    });

    it('should track different users separately', () => {
        // Exhaust user1
        for (let i = 0; i < 20; i++) {
            checkRateLimit('user1', 'ai');
        }

        // user2 should still be allowed
        const result = checkRateLimit('user2', 'ai');
        expect(result.allowed).toBe(true);
    });

    it('should track different categories separately', () => {
        // Exhaust AI limit for user1
        for (let i = 0; i < 20; i++) {
            checkRateLimit('user1', 'ai');
        }

        // Import should still work
        const result = checkRateLimit('user1', 'import');
        expect(result.allowed).toBe(true);
    });

    it('should respect import limit of 3/day', () => {
        for (let i = 0; i < 3; i++) {
            const result = checkRateLimit('user1', 'import');
            expect(result.allowed).toBe(true);
        }

        const blocked = checkRateLimit('user1', 'import');
        expect(blocked.allowed).toBe(false);
    });

    it('should respect auth limit of 5/15min', () => {
        for (let i = 0; i < 5; i++) {
            const result = checkRateLimit('user1', 'auth');
            expect(result.allowed).toBe(true);
        }

        const blocked = checkRateLimit('user1', 'auth');
        expect(blocked.allowed).toBe(false);
    });

    it('should return correct remaining count', () => {
        checkRateLimit('user1', 'ai'); // 1st → 19 remaining
        checkRateLimit('user1', 'ai'); // 2nd → 18 remaining
        const result = checkRateLimit('user1', 'ai'); // 3rd → 17 remaining
        expect(result.remaining).toBe(17);
    });

    it('should handle unknown categories gracefully', () => {
        const result = checkRateLimit('user1', 'unknown_category');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(Infinity);
    });

    it('should reset after the window expires', () => {
        // Exhaust limit
        for (let i = 0; i < 20; i++) {
            checkRateLimit('user1', 'ai');
        }

        // Simulate window expiry by manually adjusting the store
        const entry = store.get('ai:user1');
        if (entry) {
            entry.resetAt = Date.now() - 1; // expired
        }

        const result = checkRateLimit('user1', 'ai');
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(19); // fresh window
    });
});
