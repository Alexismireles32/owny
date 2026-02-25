// POST /api/scrape/prefetch
// Anonymous prefetch for TikTok profile metadata (no DB writes, no ownership claims).
// Used to warm cache before auth completes.

import { NextResponse } from 'next/server';
import { AppError, fetchTikTokProfile } from '@/lib/scraping/scrapeCreators';
import { getPrefetchedProfile, setPrefetchedProfile } from '@/lib/scraping/prefetch-cache';
import { rateLimitResponse } from '@/lib/rate-limit';
import { log } from '@/lib/logger';

const HANDLE_REGEX = /^[a-zA-Z0-9._]{1,24}$/;

function normalizeHandle(raw: string): string {
    return raw.replace(/^@/, '').trim().toLowerCase();
}

function getRequestIp(request: Request): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        const first = forwardedFor.split(',')[0]?.trim();
        if (first) return first;
    }

    const realIp = request.headers.get('x-real-ip');
    if (realIp) return realIp;

    return 'unknown';
}

export async function POST(request: Request) {
    let body: { handle?: string };

    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    if (!body.handle || typeof body.handle !== 'string') {
        return NextResponse.json({ error: 'handle is required' }, { status: 400 });
    }

    const handle = normalizeHandle(body.handle);

    if (!HANDLE_REGEX.test(handle)) {
        return NextResponse.json(
            { error: 'Invalid TikTok handle. Use 1-24 characters: letters, numbers, dots, underscores.' },
            { status: 400 }
        );
    }

    const ip = getRequestIp(request);
    const rl = rateLimitResponse(ip, 'scrape-prefetch');
    if (rl) return rl;

    const cached = getPrefetchedProfile(handle);
    if (cached) {
        return NextResponse.json({
            prefetched: true,
            cached: true,
            profile: {
                handle: cached.handle,
                nickname: cached.nickname,
                avatarUrl: cached.avatarUrl,
                followerCount: cached.followerCount,
            },
        });
    }

    try {
        const profile = await fetchTikTokProfile(handle);
        setPrefetchedProfile(handle, profile);

        return NextResponse.json({
            prefetched: true,
            cached: false,
            profile: {
                handle: profile.handle,
                nickname: profile.nickname,
                avatarUrl: profile.avatarUrl,
                followerCount: profile.followerCount,
            },
        });
    } catch (err) {
        if (err instanceof AppError) {
            return NextResponse.json({ error: err.userMessage }, { status: err.statusCode });
        }

        log.error('Prefetch profile error', {
            error: err instanceof Error ? err.message : 'Unknown',
            handle,
        });
        return NextResponse.json(
            { error: 'An unexpected error occurred. Please try again.' },
            { status: 500 }
        );
    }
}
