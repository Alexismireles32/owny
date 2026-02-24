// src/lib/import/scrapecreators.ts
// ScrapeCreators adapter implementing ImportProvider (PRD §3)

import type { ImportProvider, VideoMeta, ProfileMeta, TranscriptResult } from '@/types/import';

const BASE_URL = 'https://api.scrapecreators.com';

function getApiKey(): string {
    const key = process.env.SCRAPECREATORS_API_KEY;
    if (!key) throw new Error('SCRAPECREATORS_API_KEY is not set');
    return key;
}

async function fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retries = 3
): Promise<Response> {
    const headers = {
        'x-api-key': getApiKey(),
        'Content-Type': 'application/json',
        ...options.headers,
    };

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const res = await fetch(url, { ...options, headers });

            if (res.ok) return res;

            // Retry on 5xx + 429
            if (res.status >= 500 || res.status === 429) {
                const delay = Math.pow(2, attempt) * 500; // 500, 1000, 2000ms
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }

            // 4xx (non-429) — don't retry
            throw new Error(`ScrapeCreators API error ${res.status}: ${await res.text()}`);
        } catch (err) {
            if (attempt === retries - 1) throw err;
            const delay = Math.pow(2, attempt) * 500;
            await new Promise((r) => setTimeout(r, delay));
        }
    }

    throw new Error('ScrapeCreators: max retries exceeded');
}

// Throttle helper: delays between batched calls
function delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

export const scrapeCreatorsProvider: ImportProvider = {
    async getProfile(handle: string): Promise<ProfileMeta> {
        const res = await fetchWithRetry(
            `${BASE_URL}/v1/tiktok/profile?handle=${encodeURIComponent(handle)}`
        );
        const data = await res.json();
        const p = data.data || data;

        return {
            handle: p.unique_id || p.handle || handle,
            displayName: p.nickname || p.display_name || handle,
            bio: p.signature || p.bio || null,
            followers: p.follower_count ?? p.followers ?? null,
            following: p.following_count ?? p.following ?? null,
            likes: p.heart_count ?? p.likes ?? null,
            avatarUrl: p.avatar_url || p.avatar_larger || null,
        };
    },

    async *listVideos(
        handle: string,
        options: { maxVideos?: number; sortBy?: 'latest' | 'popular'; cursor?: string }
    ): AsyncGenerator<VideoMeta[], void, unknown> {
        const maxVideos = options.maxVideos ?? 500;
        let cursor = options.cursor ?? '';
        let totalFetched = 0;

        while (totalFetched < maxVideos) {
            const params = new URLSearchParams({
                handle,
                sort_by: options.sortBy ?? 'latest',
                trim: 'true',
            });
            if (cursor) params.set('max_cursor', cursor);

            const res = await fetchWithRetry(
                `${BASE_URL}/v3/tiktok/profile/videos?${params.toString()}`
            );
            const data = await res.json();
            const videos = data.data?.videos || data.videos || [];

            if (!videos.length) break;

            const batch: VideoMeta[] = videos
                .slice(0, maxVideos - totalFetched)
                .map((v: Record<string, unknown>) => ({
                    externalVideoId: String(v.id || v.video_id || ''),
                    url: String(v.url || v.share_url || ''),
                    title: (v.title as string) || (v.desc as string) || null,
                    description: (v.desc as string) || (v.description as string) || null,
                    views: (v.play_count as number) ?? (v.views as number) ?? null,
                    likes: (v.digg_count as number) ?? (v.likes as number) ?? null,
                    comments: (v.comment_count as number) ?? (v.comments as number) ?? null,
                    shares: (v.share_count as number) ?? (v.shares as number) ?? null,
                    duration: (v.duration as number) ?? null,
                    createdAt: v.create_time
                        ? new Date(Number(v.create_time) * 1000).toISOString()
                        : (v.created_at as string) ?? null,
                    thumbnailUrl: (v.cover as string) || (v.thumbnail_url as string) || null,
                }));

            yield batch;
            totalFetched += batch.length;

            // Pagination
            cursor = String(data.data?.max_cursor || data.max_cursor || '');
            const hasMore = data.data?.has_more ?? data.has_more ?? false;
            if (!hasMore || !cursor) break;

            // Throttle between pages
            await delay(200);
        }
    },

    async getTranscript(
        videoUrl: string,
        options: { language?: string; useAiFallback?: boolean }
    ): Promise<TranscriptResult | null> {
        const params = new URLSearchParams({
            url: videoUrl,
            language: options.language ?? 'en',
        });
        if (options.useAiFallback) {
            params.set('use_ai_as_fallback', 'true');
        }

        try {
            const res = await fetchWithRetry(
                `${BASE_URL}/v1/tiktok/video/transcript?${params.toString()}`
            );
            const data = await res.json();
            const transcript = data.data?.transcript || data.transcript;

            if (!transcript) return null;

            // Extract external video ID from URL
            const videoIdMatch = videoUrl.match(/\/video\/(\d+)/);
            const externalVideoId = videoIdMatch?.[1] || '';

            return {
                videoExternalId: externalVideoId,
                transcriptText: typeof transcript === 'string'
                    ? transcript
                    : Array.isArray(transcript)
                        ? transcript.map((t: Record<string, string>) => t.text || t.value || '').join(' ')
                        : '',
                language: options.language ?? 'en',
                source: data.data?.source === 'ai_fallback' ? 'ai_fallback' : 'caption',
            };
        } catch {
            return null;
        }
    },
};
