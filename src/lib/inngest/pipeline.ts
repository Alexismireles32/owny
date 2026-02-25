// Inngest multi-step pipeline function
// Each stage runs as an isolated step — if step 3 fails, it retries from step 3, not scratch
// This is the production-grade replacement for the fire-and-forget runScrapePipeline()

import { inngest } from './client';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
    fetchTikTokVideos,
    fetchVideoTranscript,
    getScrapeContinuationDecision,
    MAX_PIPELINE_VIDEOS,
    type NormalizedVideo,
} from '@/lib/scraping/scrapeCreators';
import { log } from '@/lib/logger';

function getServiceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

async function setCreatorStatus(creatorId: string, status: string, extra: Record<string, unknown> = {}) {
    const supabase = getServiceClient();
    const { error } = await supabase
        .from('creators')
        .update({ pipeline_status: status, ...extra })
        .eq('id', creatorId);

    if (error) {
        throw new Error(`Failed to set creator status to "${status}": ${error.message}`);
    }
}

// ─── Types ───
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

// ─── The Inngest Function ───
export const scrapePipeline = inngest.createFunction(
    {
        id: 'scrape-pipeline',
        name: 'Scrape Creator Pipeline',
        retries: 2,
        cancelOn: [{ event: 'pipeline/cancel', match: 'data.creatorId' }],
    },
    { event: 'pipeline/start' },
    async ({ event, step }) => {
        const { creatorId, handle } = event.data as { creatorId: string; handle: string };
        try {
            // ═══ STEP 1: Scrape Videos ═══
            const allVideos = await step.run('scrape-videos', async () => {
                await setCreatorStatus(creatorId, 'scraping');
                log.info('Inngest Pipeline Step 1: scraping videos', { creatorId, handle });

                const videos: NormalizedVideo[] = [];
                const seenIds = new Set<string>();
                let cursor: string | null = null;
                let previousCursor: string | null = null;
                let pagesScraped = 0;
                const startTime = Date.now();

                while (true) {
                    const page = await fetchTikTokVideos(handle, cursor || undefined);
                    pagesScraped++;

                    let newCount = 0;
                    for (const video of page.videos) {
                        if (!seenIds.has(video.id)) {
                            seenIds.add(video.id);
                            videos.push(video);
                            newCount++;
                        }
                    }

                    const decision = getScrapeContinuationDecision({
                        hasMore: page.hasMore,
                        nextCursor: page.nextCursor,
                        previousCursor,
                        newVideosCount: newCount,
                        totalVideos: videos.length,
                        pagesScraped,
                        startTime,
                    });

                    log.info('Pipeline: page scraped', {
                        page: pagesScraped, newVideos: newCount,
                        total: videos.length, continue: decision.shouldContinue,
                    });

                    if (!decision.shouldContinue) break;
                    previousCursor = cursor;
                    cursor = page.nextCursor;
                    await new Promise((r) => setTimeout(r, 300));
                }

                // Upsert videos into DB
                const supabase = getServiceClient();
                if (videos.length > 0) {
                    const videoRows = videos.slice(0, MAX_PIPELINE_VIDEOS).map((v) => ({
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

                    const { error } = await supabase
                        .from('videos')
                        .upsert(videoRows, { onConflict: 'creator_id,external_video_id', ignoreDuplicates: true });

                    if (error) log.error('Pipeline: video insert error', { error: error.message });
                }

                log.info('Pipeline Step 1 complete', { totalVideos: videos.length });
                return videos; // Passed to next step via Inngest state
            });

            // ═══ STEP 2: Fetch Transcripts ═══
            const transcriptRows = await step.run('fetch-transcripts', async () => {
                await setCreatorStatus(creatorId, 'transcribing');
                log.info('Inngest Pipeline Step 2: fetching transcripts', { creatorId });

                const supabase = getServiceClient();
                const { data: dbVideos } = await supabase
                    .from('videos')
                    .select('id, external_video_id, url, title, description')
                    .eq('creator_id', creatorId);

                const dbVideoMap = new Map(
                    (dbVideos || []).map((v) => [v.external_video_id, v])
                );

                const rows: TranscriptRow[] = [];

                // Process in batches of 20
                for (let i = 0; i < allVideos.length; i += 20) {
                    const batch = allVideos.slice(i, i + 20);
                    const promises = batch.map(async (video) => {
                        const dbVideo = dbVideoMap.get(video.id);
                        if (!dbVideo) return;

                        let transcriptText: string | null = null;
                        if (video.webvttUrl) {
                            transcriptText = await fetchVideoTranscript(video.webvttUrl);
                        }
                        if (!transcriptText || transcriptText.length < 10) {
                            transcriptText = video.description || video.title || '';
                        }
                        if (transcriptText.length < 10) return;

                        rows.push({
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

                const deduped = dedupeTranscriptRows(rows);

                if (deduped.length > 0) {
                    const { error } = await supabase
                        .from('video_transcripts')
                        .upsert(deduped, { onConflict: 'creator_id,video_id', ignoreDuplicates: false });
                    if (error) log.error('Pipeline: transcript upsert error', { error: error.message });
                }

                log.info('Pipeline Step 2 complete', { transcripts: deduped.length });

                // Check minimum
                if (deduped.length < 5) {
                    await setCreatorStatus(creatorId, 'insufficient_content', {
                        pipeline_error: `Only ${deduped.length} transcripts found. Need at least 5.`,
                    });
                    throw new Error(`Insufficient content: ${deduped.length} transcripts`);
                }

                return deduped;
            });

            // ═══ STEP 3: Cluster Content ═══
            const clusterLabels = await step.run('cluster-content', async () => {
                await setCreatorStatus(creatorId, 'clustering');
                log.info('Inngest Pipeline Step 3: clustering', { creatorId });

                const supabase = getServiceClient();
                const clusterMap = new Map<string, { videoIds: string[]; totalViews: number; count: number }>();

                const keywords: [string, string][] = [
                    ['morning', 'Morning Routine'], ['routine', 'Daily Routine'],
                    ['workout', 'Fitness & Workout'], ['exercise', 'Fitness & Workout'],
                    ['recipe', 'Recipes & Cooking'], ['cook', 'Recipes & Cooking'],
                    ['tips', 'Tips & Advice'], ['hack', 'Life Hacks'],
                    ['review', 'Reviews'], ['tutorial', 'Tutorials'],
                    ['how to', 'How-To Guides'], ['motivation', 'Motivation & Mindset'],
                    ['productivity', 'Productivity'], ['finance', 'Finance & Money'],
                    ['money', 'Finance & Money'], ['travel', 'Travel'],
                    ['fashion', 'Fashion & Style'], ['beauty', 'Beauty & Skincare'],
                    ['tech', 'Tech & Gadgets'], ['book', 'Books & Reading'],
                ];

                for (const row of transcriptRows) {
                    const text = (row.title || row.description || '').toLowerCase();
                    let topic = 'General Content';
                    for (const [kw, label] of keywords) {
                        if (text.includes(kw)) { topic = label; break; }
                    }

                    if (!clusterMap.has(topic)) clusterMap.set(topic, { videoIds: [], totalViews: 0, count: 0 });
                    const c = clusterMap.get(topic)!;
                    c.videoIds.push(row.video_id);
                    c.totalViews += row.views;
                    c.count++;
                }

                // Replace old clusters
                await supabase.from('content_clusters').delete().eq('creator_id', creatorId);

                const clusterRows = Array.from(clusterMap.entries()).map(([label, data]) => ({
                    creator_id: creatorId,
                    label,
                    topic_summary: `${data.count} videos about ${label}`,
                    video_ids: data.videoIds,
                    total_views: data.totalViews,
                    video_count: data.count,
                    recommended_product_type: data.count >= 5 ? 'mini_course' : 'pdf_guide',
                    confidence_score: Math.min(0.99, data.count / 20),
                }));

                if (clusterRows.length > 0) {
                    const { error } = await supabase.from('content_clusters').insert(clusterRows);
                    if (error) log.error('Pipeline: cluster insert error', { error: error.message });
                }

                log.info('Pipeline Step 3 complete', { clusters: clusterRows.length });
                return Array.from(clusterMap.keys());
            });

            // ═══ STEP 4: Extract Visual DNA + Voice Profile ═══
            await step.run('extract-dna-voice', async () => {
                await setCreatorStatus(creatorId, 'extracting');
                log.info('Inngest Pipeline Step 4: extracting DNA + voice', { creatorId });

                const supabase = getServiceClient();
                const topVideos = [...transcriptRows].sort((a, b) => b.views - a.views).slice(0, 10);
                const thumbnailUrls = topVideos.map((v) => v.thumbnail_url).filter((u): u is string => !!u);

                const visualDna = {
                    thumbnail_urls: thumbnailUrls.slice(0, 6),
                    dominant_topics: clusterLabels.slice(0, 5),
                    content_style: transcriptRows.length > 20 ? 'prolific' : 'curated',
                    top_views: topVideos[0]?.views || 0,
                    extracted_at: new Date().toISOString(),
                };

                const allText = transcriptRows.map((r) => r.transcript_text).join(' ');
                const wordCount = allText.split(/\s+/).length;
                const sentenceCount = allText.split(/[.!?]+/).filter(Boolean).length;

                const voiceProfile = {
                    total_words: wordCount,
                    total_transcripts: transcriptRows.length,
                    avg_sentence_count: sentenceCount,
                    top_topics: clusterLabels.slice(0, 5),
                    estimated_tone: wordCount > 5000 ? 'detailed' : 'concise',
                    extracted_at: new Date().toISOString(),
                };

                await supabase.from('creators').update({
                    visual_dna: visualDna,
                    voice_profile: voiceProfile,
                }).eq('id', creatorId);

                log.info('Pipeline Step 4 complete');
            });

            // ═══ STEP 5: Mark Complete ═══
            await step.run('mark-ready', async () => {
                await setCreatorStatus(creatorId, 'ready', { pipeline_error: null });
                log.info('Pipeline complete!', { creatorId, handle });
            });

            return { success: true, creatorId, handle };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown pipeline error';
            const isInsufficientContent = message.toLowerCase().includes('insufficient content');

            if (!isInsufficientContent) {
                try {
                    await setCreatorStatus(creatorId, 'error', { pipeline_error: message });
                } catch (statusError) {
                    log.error('Pipeline failed and status update failed', {
                        creatorId,
                        error: message,
                        statusError: statusError instanceof Error ? statusError.message : 'Unknown status update error',
                    });
                }
            }

            log.error('Inngest pipeline failed', { creatorId, handle, error: message });
            throw error;
        }
    }
);
