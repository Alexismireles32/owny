// src/lib/scraping/scrapeCreators.ts
// ScrapeCreators adapter per SCRAPE_CREATORS_FLOW.md
// Handles profile fetch, paginated video listing, WebVTT transcript fetch,
// and proper provider error mapping.

import { log } from '@/lib/logger';

// ────────────────────────────────────────
// Types
// ────────────────────────────────────────

export interface NormalizedProfile {
    handle: string;
    nickname: string;
    bio: string | null;
    avatarUrl: string | null;
    followerCount: number;
    followingCount: number;
    videoCount: number;
    isVerified: boolean;
    tiktokUrl: string;
}

export interface NormalizedVideo {
    id: string;
    url: string;
    title: string | null;
    description: string | null;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    duration: number;
    thumbnailUrl: string | null;
    webvttUrl: string | null;
    createdAt: string | null;
}

export interface VideoPage {
    videos: NormalizedVideo[];
    nextCursor: string | null;
    hasMore: boolean;
}

export class AppError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly userMessage: string
    ) {
        super(message);
        this.name = 'AppError';
    }
}

// ────────────────────────────────────────
// Config
// ────────────────────────────────────────

const BASE_URL = 'https://api.scrapecreators.com';

function getApiKey(): string {
    const key = process.env.SCRAPECREATORS_API_KEY;
    if (!key) throw new AppError('SCRAPECREATORS_API_KEY is not set', 500, 'Service configuration error');
    return key;
}

// ────────────────────────────────────────
// Provider Error Mapping
// ────────────────────────────────────────

function mapProviderFailure(status: number, body: string): AppError {
    const bodyLower = body.toLowerCase();

    // Not found / private account
    if (
        status === 404 ||
        bodyLower.includes('user not found') ||
        bodyLower.includes('account not found') ||
        bodyLower.includes('private account') ||
        bodyLower.includes('does not exist')
    ) {
        return new AppError(
            `Provider 404: ${body}`,
            404,
            'Could not find that TikTok account. Please check the username and try again.'
        );
    }

    // Rate limited
    if (status === 429) {
        return new AppError(`Provider rate limited`, 429, 'Too many requests. Please try again in a moment.');
    }

    // Credits exhausted
    if (status === 402 || bodyLower.includes('credit') || bodyLower.includes('quota')) {
        return new AppError(`Provider credits exhausted: ${body}`, 503, 'Service temporarily unavailable. Please try again later.');
    }

    // Auth / key issues
    if (status === 401 || status === 403) {
        return new AppError(`Provider auth error ${status}: ${body}`, 503, 'Service temporarily unavailable. Please try again later.');
    }

    // Provider server errors
    if (status >= 500) {
        return new AppError(`Provider ${status}: ${body}`, 503, 'TikTok data service temporarily unavailable. Please try again later.');
    }

    // Unexpected non-5xx
    return new AppError(`Provider ${status}: ${body}`, 502, 'Unexpected error fetching TikTok data. Please try again.');
}

// ────────────────────────────────────────
// HTTP Helper
// ────────────────────────────────────────

async function scFetch(path: string): Promise<unknown> {
    const url = `${BASE_URL}${path}`;

    const res = await fetch(url, {
        headers: {
            'x-api-key': getApiKey(),
            'Content-Type': 'application/json',
        },
    }).catch((err) => {
        throw new AppError(
            `Network error: ${err instanceof Error ? err.message : 'Unknown'}`,
            503,
            'Could not reach TikTok data service. Please try again later.'
        );
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw mapProviderFailure(res.status, body);
    }

    return res.json();
}

// ────────────────────────────────────────
// Normalization Helpers
// ────────────────────────────────────────

function toNumber(val: unknown): number {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const n = parseInt(val, 10);
        return isNaN(n) ? 0 : n;
    }
    return 0;
}

function toNonEmptyStringOrNull(val: unknown): string | null {
    if (typeof val !== 'string') return null;
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function resolveUrl(val: unknown): string | null {
    if (typeof val === 'string' && val.length > 0) return val;
    // ScrapeCreators nests cover images as { url_list: string[] }
    if (val && typeof val === 'object' && 'url_list' in val) {
        const list = (val as Record<string, unknown>).url_list;
        if (Array.isArray(list) && typeof list[0] === 'string') return list[0];
    }
    return null;
}

function pickThumbnail(v: Record<string, unknown>): string | null {
    const video = v.video as Record<string, unknown> | undefined;
    // Prefer non-HEIC candidates — check both top-level and nested video object
    const candidates = [
        v.cover, video?.cover,
        v.origin_cover, video?.origin_cover,
        v.dynamic_cover, video?.dynamic_cover,
        v.thumbnail_url,
        v.ai_dynamic_cover, video?.ai_dynamic_cover,
    ];
    for (const c of candidates) {
        const url = resolveUrl(c);
        if (url && !url.endsWith('.heic')) return url;
    }
    // Fallback: return first resolvable URL
    for (const c of candidates) {
        const url = resolveUrl(c);
        if (url) return url;
    }
    return null;
}

function extractWebvttUrl(v: Record<string, unknown>): string | null {
    // Try video_subtitle_info_structs -> caption/subtitle structures
    const subtitles = v.video_subtitle_info_structs as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(subtitles) && subtitles.length > 0) {
        for (const sub of subtitles) {
            const url = sub.Url || sub.url || sub.webvtt_url;
            if (typeof url === 'string' && url.length > 0) return url;
        }
    }

    // Fallback: caption_infos
    const captions = v.caption_infos as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(captions) && captions.length > 0) {
        for (const cap of captions) {
            const url = cap.url || cap.web_vtt;
            if (typeof url === 'string' && url.length > 0) return url;
        }
    }

    return null;
}

// ────────────────────────────────────────
// Public API
// ────────────────────────────────────────

/**
 * Fetches a TikTok profile by handle.
 */
export async function fetchTikTokProfile(handle: string): Promise<NormalizedProfile> {
    const raw = await scFetch(`/v1/tiktok/profile?handle=${encodeURIComponent(handle)}`) as Record<string, unknown>;
    const data = (raw.data || raw) as Record<string, unknown>;

    // Support nested wrappers
    const user = (data.user || data) as Record<string, unknown>;
    const stats = (data.stats || data) as Record<string, unknown>;

    return {
        handle: String(user.unique_id || user.uniqueId || user.handle || handle),
        nickname: String(user.nickname || user.display_name || handle),
        bio: typeof user.signature === 'string' ? user.signature : (typeof user.bio === 'string' ? user.bio : null),
        avatarUrl: toNonEmptyStringOrNull(user.avatar_url || user.avatar_larger || user.avatarLarger),
        followerCount: toNumber(stats.follower_count || stats.followerCount || user.follower_count),
        followingCount: toNumber(stats.following_count || stats.followingCount || user.following_count),
        videoCount: toNumber(stats.video_count || stats.videoCount || user.video_count),
        isVerified: Boolean(user.is_verified || user.verified),
        tiktokUrl: `https://www.tiktok.com/@${handle}`,
    };
}

/**
 * Fetches a page of TikTok videos for a handle.
 */
export async function fetchTikTokVideos(
    handle: string,
    cursor?: string
): Promise<VideoPage> {
    const params = new URLSearchParams({ handle, trim: 'true' });
    if (cursor) params.set('max_cursor', cursor);

    const raw = await scFetch(`/v3/tiktok/profile/videos?${params.toString()}`) as Record<string, unknown>;
    const data = (raw.data || raw) as Record<string, unknown>;

    // Support multiple response shapes
    const videoList = (data.videos || data.aweme_list || []) as Array<Record<string, unknown>>;

    const videos: NormalizedVideo[] = videoList.map((v) => {
        const id = String(v.aweme_id || v.id || v.video_id || '');
        const stats = (v.statistics || {}) as Record<string, unknown>;
        const videoObj = (v.video || {}) as Record<string, unknown>;
        return {
            id,
            url: String(v.url || v.share_url || `https://www.tiktok.com/@${handle}/video/${id}`),
            title: typeof v.title === 'string' ? v.title : null,
            description: typeof v.desc === 'string' ? v.desc : (typeof v.description === 'string' ? v.description : null),
            views: toNumber(v.play_count || stats.play_count || v.views),
            likes: toNumber(v.digg_count || stats.digg_count || v.likes),
            comments: toNumber(v.comment_count || stats.comment_count || v.comments),
            shares: toNumber(v.share_count || stats.share_count || v.shares),
            duration: toNumber(v.duration || videoObj.duration),
            thumbnailUrl: pickThumbnail(v),
            webvttUrl: extractWebvttUrl(v),
            createdAt: v.create_time
                ? new Date(Number(v.create_time) * 1000).toISOString()
                : (typeof v.created_at === 'string' ? v.created_at : null),
        };
    });

    // Normalize cursor
    const nextCursor = data.max_cursor != null ? String(data.max_cursor) : null;
    const hasMore = Boolean(data.has_more ?? false);

    return { videos, nextCursor, hasMore };
}

/**
 * Fetches a WebVTT transcript from a URL and returns plain text.
 */
export async function fetchVideoTranscript(webvttUrl: string): Promise<string | null> {
    try {
        const res = await fetch(webvttUrl, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return null;

        const text = await res.text();

        // Parse WebVTT: strip headers and timestamps, keep only text lines
        const lines = text.split('\n');
        const textLines: string[] = [];
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip WebVTT header, empty lines, timestamps (contain -->)
            if (
                !trimmed ||
                trimmed === 'WEBVTT' ||
                trimmed.includes('-->') ||
                /^\d+$/.test(trimmed) ||
                trimmed.startsWith('NOTE')
            ) {
                continue;
            }
            textLines.push(trimmed);
        }

        const transcript = textLines.join(' ').trim();
        return transcript.length >= 10 ? transcript : null;
    } catch (err) {
        log.warn('Failed to fetch WebVTT transcript', { url: webvttUrl, error: err instanceof Error ? err.message : 'Unknown' });
        return null;
    }
}

// ────────────────────────────────────────
// Pipeline Helpers
// ────────────────────────────────────────

export const MAX_PIPELINE_VIDEOS = 180;
const MAX_PAGES = 20;
const MAX_SCRAPE_DURATION_MS = 120_000;

export interface ContinuationDecision {
    shouldContinue: boolean;
    reason: string;
}

export function getScrapeContinuationDecision(opts: {
    hasMore: boolean;
    nextCursor: string | null;
    previousCursor: string | null;
    newVideosCount: number;
    totalVideos: number;
    pagesScraped: number;
    startTime: number;
}): ContinuationDecision {
    if (!opts.hasMore) return { shouldContinue: false, reason: 'provider says no more' };
    if (!opts.nextCursor) return { shouldContinue: false, reason: 'missing next cursor' };
    if (opts.nextCursor === opts.previousCursor) return { shouldContinue: false, reason: 'repeated cursor' };
    if (opts.newVideosCount === 0) return { shouldContinue: false, reason: 'page added 0 new videos' };
    if (opts.pagesScraped >= MAX_PAGES) return { shouldContinue: false, reason: 'page limit reached' };
    if (opts.totalVideos >= MAX_PIPELINE_VIDEOS) return { shouldContinue: false, reason: 'video limit reached' };
    if (Date.now() - opts.startTime > MAX_SCRAPE_DURATION_MS) return { shouldContinue: false, reason: 'scrape duration exceeded' };

    return { shouldContinue: true, reason: 'continue' };
}
