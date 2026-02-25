// src/lib/pipeline/pipeline.ts
// 6-stage async pipeline per SCRAPE_CREATORS_FLOW.md
// Stages: 0A scrape-videos → 0B fetch-transcripts → 1 clean → 2 cluster → 2.5 visual-dna → 3 extract
// Runs as a background task kicked off by /api/pipeline/start

import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
    fetchTikTokVideos,
    fetchVideoTranscript,
    getScrapeContinuationDecision,
    MAX_PIPELINE_VIDEOS,
    type NormalizedVideo,
} from '@/lib/scraping/scrapeCreators';
import { log } from '@/lib/logger';

// Use service role for pipeline operations (bypasses RLS)
function getServiceClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    return createServiceClient(url, serviceKey);
}

// ────────────────────────────────────────
// Status Helpers
// ────────────────────────────────────────

async function setCreatorStatus(
    creatorId: string,
    status: string,
    extra: Record<string, unknown> = {}
) {
    const supabase = getServiceClient();
    const { error } = await supabase
        .from('creators')
        .update({ pipeline_status: status, ...extra })
        .eq('id', creatorId);

    if (error) {
        throw new Error(`Failed to set creator status to "${status}": ${error.message}`);
    }
}

// ────────────────────────────────────────
// Transcript Row Dedup
// ────────────────────────────────────────

interface TranscriptRow {
    creator_id: string;
    video_id: string;
    platform: string;
    title: string | null;
    description: string | null;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    thumbnail_url: string | null;
    transcript_text: string;
    webvtt_url: string | null;
    duration_seconds: number;
    posted_at: string | null;
    language: string;
    source: string;
}

function dedupeTranscriptRows(rows: TranscriptRow[]): TranscriptRow[] {
    const byVideoId = new Map<string, TranscriptRow>();
    for (const row of rows) {
        const existing = byVideoId.get(row.video_id);
        if (!existing || row.transcript_text.length > existing.transcript_text.length) {
            byVideoId.set(row.video_id, row);
        }
    }
    return Array.from(byVideoId.values());
}

// ────────────────────────────────────────
// Main Pipeline
// ────────────────────────────────────────

export async function runScrapePipeline(creatorId: string, handle: string): Promise<void> {
    const supabase = getServiceClient();

    try {
        // ═══ STAGE 0A: Scrape Videos ═══
        await setCreatorStatus(creatorId, 'scraping');
        log.info('Pipeline 0A: scraping videos', { creatorId, handle });

        const allVideos: NormalizedVideo[] = [];
        const seenIds = new Set<string>();
        let cursor: string | null = null;
        let previousCursor: string | null = null;
        let pagesScraped = 0;
        const startTime = Date.now();

        while (true) {
            const page = await fetchTikTokVideos(handle, cursor || undefined);
            pagesScraped++;

            // Dedupe within this run
            let newCount = 0;
            for (const video of page.videos) {
                if (!seenIds.has(video.id)) {
                    seenIds.add(video.id);
                    allVideos.push(video);
                    newCount++;
                }
            }

            const decision = getScrapeContinuationDecision({
                hasMore: page.hasMore,
                nextCursor: page.nextCursor,
                previousCursor,
                newVideosCount: newCount,
                totalVideos: allVideos.length,
                pagesScraped,
                startTime,
            });

            log.info('Pipeline 0A: page scraped', {
                page: pagesScraped,
                newVideos: newCount,
                total: allVideos.length,
                continue: decision.shouldContinue,
                reason: decision.reason,
            });

            if (!decision.shouldContinue) break;

            previousCursor = cursor;
            cursor = page.nextCursor;

            // Throttle between pages
            await new Promise((r) => setTimeout(r, 300));
        }

        // Upsert videos into DB
        if (allVideos.length > 0) {
            const videoRows = allVideos.slice(0, MAX_PIPELINE_VIDEOS).map((v) => ({
                creator_id: creatorId,
                source: 'scrapecreators' as const,
                external_video_id: v.id,
                url: v.url,
                title: v.title,
                description: v.description,
                views: v.views,
                likes: v.likes,
                comments_count: v.comments,
                shares: v.shares,
                duration: v.duration,
                thumbnail_url: v.thumbnailUrl,
                created_at_source: v.createdAt,
            }));

            const { error: insertError } = await supabase
                .from('videos')
                .upsert(videoRows, {
                    onConflict: 'creator_id,external_video_id',
                    ignoreDuplicates: true,
                });

            if (insertError) {
                log.error('Pipeline 0A: video insert error', { error: insertError.message });
            }
        }

        log.info('Pipeline 0A complete', { totalVideos: allVideos.length });

        // ═══ STAGE 0B: Fetch Transcripts ═══
        log.info('Pipeline 0B: fetching transcripts', { creatorId });

        // Fetch DB video IDs for transcript mapping
        const { data: dbVideos } = await supabase
            .from('videos')
            .select('id, external_video_id, url, title, description')
            .eq('creator_id', creatorId);

        const dbVideoMap = new Map(
            (dbVideos || []).map((v) => [v.external_video_id, v])
        );

        const transcriptRows: TranscriptRow[] = [];
        const TRANSCRIPT_BATCH_SIZE = 20;

        for (let i = 0; i < allVideos.length; i += TRANSCRIPT_BATCH_SIZE) {
            const batch = allVideos.slice(i, i + TRANSCRIPT_BATCH_SIZE);

            const promises = batch.map(async (video) => {
                const dbVideo = dbVideoMap.get(video.id);
                if (!dbVideo) return;

                let transcriptText: string | null = null;

                // Try WebVTT first
                if (video.webvttUrl) {
                    transcriptText = await fetchVideoTranscript(video.webvttUrl);
                }

                // Fallback to description or title
                if (!transcriptText || transcriptText.length < 10) {
                    transcriptText = video.description || video.title || '';
                }

                // Skip if too short
                if (transcriptText.length < 10) return;

                transcriptRows.push({
                    creator_id: creatorId,
                    video_id: dbVideo.id,
                    platform: 'tiktok',
                    title: video.title,
                    description: video.description,
                    views: video.views,
                    likes: video.likes,
                    comments: video.comments,
                    shares: video.shares,
                    thumbnail_url: video.thumbnailUrl,
                    transcript_text: transcriptText,
                    webvtt_url: video.webvttUrl,
                    duration_seconds: video.duration,
                    posted_at: video.createdAt,
                    language: 'en',
                    source: video.webvttUrl ? 'caption' : 'ai_fallback',
                });
            });

            await Promise.all(promises);
        }

        // Dedupe and upsert transcripts
        const dedupedRows = dedupeTranscriptRows(transcriptRows);

        if (dedupedRows.length > 0) {
            const { error: transcriptError } = await supabase
                .from('video_transcripts')
                .upsert(dedupedRows, {
                    onConflict: 'creator_id,video_id',
                    ignoreDuplicates: false,
                });

            if (transcriptError) {
                log.error('Pipeline 0B: transcript upsert error', { error: transcriptError.message });
            }
        }

        log.info('Pipeline 0B complete', { transcripts: dedupedRows.length });

        // Check minimum transcript count
        if (dedupedRows.length < 5) {
            await setCreatorStatus(creatorId, 'insufficient_content', {
                pipeline_error: `Only ${dedupedRows.length} transcripts found. Need at least 5.`,
            });
            log.warn('Pipeline: insufficient content', { creatorId, count: dedupedRows.length });
            return; // Stop pipeline here
        }

        // ═══ STAGE 1: Clean Transcripts ═══
        await setCreatorStatus(creatorId, 'cleaning');
        log.info('Pipeline 1: cleaning transcripts', { creatorId });

        // For MVP: transcripts are already usable as-is from WebVTT/description
        // In production, this would call Gemini Flash to clean/organize
        // For now, we just advance to the next stage
        log.info('Pipeline 1 complete (pass-through for MVP)');

        // ═══ STAGE 2: Cluster Content ═══
        await setCreatorStatus(creatorId, 'clustering');
        log.info('Pipeline 2: clustering content', { creatorId });

        // MVP: Create basic clusters from video metadata
        // In production, this would use Gemini Flash for intelligent clustering
        const clusterMap = new Map<string, { videos: typeof dedupedRows; totalViews: number }>();

        for (const row of dedupedRows) {
            // Simple topic extraction from title/description
            const text = (row.title || row.description || '').toLowerCase();
            let topic = 'General Content';

            // Basic keyword-based clustering
            const keywords: [string, string][] = [
                ['morning', 'Morning Routine'],
                ['routine', 'Daily Routine'],
                ['workout', 'Fitness & Workout'],
                ['exercise', 'Fitness & Workout'],
                ['recipe', 'Recipes & Cooking'],
                ['cook', 'Recipes & Cooking'],
                ['tips', 'Tips & Advice'],
                ['hack', 'Life Hacks'],
                ['review', 'Reviews'],
                ['tutorial', 'Tutorials'],
                ['how to', 'How-To Guides'],
                ['motivation', 'Motivation & Mindset'],
                ['productivity', 'Productivity'],
                ['finance', 'Finance & Money'],
                ['money', 'Finance & Money'],
                ['travel', 'Travel'],
                ['fashion', 'Fashion & Style'],
                ['beauty', 'Beauty & Skincare'],
                ['tech', 'Tech & Gadgets'],
                ['book', 'Books & Reading'],
            ];

            for (const [kw, label] of keywords) {
                if (text.includes(kw)) {
                    topic = label;
                    break;
                }
            }

            if (!clusterMap.has(topic)) {
                clusterMap.set(topic, { videos: [], totalViews: 0 });
            }
            const cluster = clusterMap.get(topic)!;
            cluster.videos.push(row);
            cluster.totalViews += row.views;
        }

        // Delete old clusters for this creator
        await supabase
            .from('content_clusters')
            .delete()
            .eq('creator_id', creatorId);

        // Insert new clusters
        const clusterRows = Array.from(clusterMap.entries()).map(([label, data]) => ({
            creator_id: creatorId,
            label,
            topic_summary: `${data.videos.length} videos about ${label}`,
            video_ids: data.videos.map((v) => v.video_id),
            total_views: data.totalViews,
            video_count: data.videos.length,
            recommended_product_type: data.videos.length >= 5 ? 'mini_course' : 'pdf_guide',
            confidence_score: Math.min(0.99, data.videos.length / 20),
        }));

        if (clusterRows.length > 0) {
            const { error: clusterError } = await supabase
                .from('content_clusters')
                .insert(clusterRows);

            if (clusterError) {
                log.error('Pipeline 2: cluster insert error', { error: clusterError.message });
            }
        }

        log.info('Pipeline 2 complete', { clusters: clusterRows.length });

        // ═══ STAGE 2.5: Extract Visual DNA ═══
        log.info('Pipeline 2.5: extracting visual DNA', { creatorId });

        // Extract visual DNA from top video thumbnails
        const topVideos = [...dedupedRows]
            .sort((a, b) => b.views - a.views)
            .slice(0, 10);

        const thumbnailUrls = topVideos
            .map((v) => v.thumbnail_url)
            .filter((url): url is string => !!url);

        const visualDna = {
            thumbnail_urls: thumbnailUrls.slice(0, 6),
            dominant_topics: Array.from(clusterMap.keys()).slice(0, 5),
            content_style: dedupedRows.length > 20 ? 'prolific' : 'curated',
            top_views: topVideos[0]?.views || 0,
            extracted_at: new Date().toISOString(),
        };

        await supabase
            .from('creators')
            .update({ visual_dna: visualDna })
            .eq('id', creatorId);

        log.info('Pipeline 2.5 complete');

        // ═══ STAGE 3: Extract Content + Voice Profile ═══
        await setCreatorStatus(creatorId, 'extracting');
        log.info('Pipeline 3: extracting content', { creatorId });

        // MVP: Build voice profile from transcript analysis
        // In production, this would use GPT-4.1 for deep extraction
        const allText = dedupedRows.map((r) => r.transcript_text).join(' ');
        const wordCount = allText.split(/\s+/).length;
        const avgSentenceLength = allText.split(/[.!?]+/).filter(Boolean).length;

        const voiceProfile = {
            total_words: wordCount,
            total_transcripts: dedupedRows.length,
            avg_sentence_count: avgSentenceLength,
            top_topics: Array.from(clusterMap.keys()).slice(0, 5),
            estimated_tone: wordCount > 5000 ? 'detailed' : 'concise',
            extracted_at: new Date().toISOString(),
        };

        await supabase
            .from('creators')
            .update({ voice_profile: voiceProfile })
            .eq('id', creatorId);

        log.info('Pipeline 3 complete');

        // ═══ COMPLETION ═══
        await setCreatorStatus(creatorId, 'ready', { pipeline_error: null });
        log.info('Pipeline complete!', { creatorId, handle });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        log.error('Pipeline failed', { creatorId, handle, error: message });
        await setCreatorStatus(creatorId, 'error', { pipeline_error: message });
        throw error; // Re-throw for caller to handle
    }
}
