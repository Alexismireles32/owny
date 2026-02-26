// Inngest multi-step pipeline function
// Each stage runs as an isolated step — if step 3 fails, it retries from step 3, not scratch.

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
import {
    beginPipelineRun,
    completePipelineRun,
    ensureActivePipelineRun,
    failPipelineRun,
    heartbeatPipelineRun,
    markPipelineRunSuperseded,
    PipelineRunSupersededError,
    type PipelineTrigger,
    setCreatorPipelineStatus,
} from '@/lib/inngest/reliability';

function getServiceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

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

interface PipelineEventData {
    creatorId: string;
    handle: string;
    runId?: string;
    trigger?: string;
    replayOfRunId?: string | null;
}

function normalizeTrigger(trigger: string): PipelineTrigger {
    if (trigger === 'onboarding') return 'onboarding';
    if (trigger === 'manual_retry') return 'manual_retry';
    if (trigger === 'auto_recovery') return 'auto_recovery';
    if (trigger === 'dlq_replay') return 'dlq_replay';
    return 'unknown';
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

export const scrapePipeline = inngest.createFunction(
    {
        id: 'scrape-pipeline',
        name: 'Scrape Creator Pipeline',
        retries: 2,
        cancelOn: [{ event: 'pipeline/cancel', match: 'data.creatorId' }],
    },
    { event: 'pipeline/start' },
    async ({ event, step }) => {
        const data = event.data as PipelineEventData;
        const creatorId = String(data?.creatorId || '').trim();
        const handle = String(data?.handle || '').trim();
        const runId =
            typeof data?.runId === 'string' && data.runId.length > 0
                ? data.runId
                : `${creatorId}-${event.id || Date.now()}`;
        const trigger = normalizeTrigger(
            typeof data?.trigger === 'string' ? data.trigger : 'unknown'
        );
        const eventId = typeof event.id === 'string' ? event.id : null;

        if (!creatorId || !handle) {
            log.error('Inngest pipeline received invalid event payload', {
                eventId,
                data,
            });
            return { success: false, reason: 'invalid_payload' };
        }

        let currentStep = 'bootstrap';
        const runMetrics: Record<string, unknown> = {
            trigger,
            replayOfRunId: data?.replayOfRunId || null,
        };

        const heartbeat = async (stepName: string, metrics?: Record<string, unknown>) => {
            currentStep = stepName;
            await heartbeatPipelineRun({
                runId,
                step: stepName,
                metrics: {
                    ...runMetrics,
                    ...(metrics ?? {}),
                },
            });
        };

        try {
            await beginPipelineRun({
                runId,
                creatorId,
                handle,
                eventId,
                trigger,
            });
            await ensureActivePipelineRun(creatorId, runId);

            // ═══ STEP 1: Scrape Videos ═══
            await heartbeat('scrape-videos:init');
            const allVideos = await step.run('scrape-videos', async () => {
                await ensureActivePipelineRun(creatorId, runId);
                await setCreatorPipelineStatus({
                    creatorId,
                    runId,
                    status: 'scraping',
                    pipelineError: null,
                });

                log.info('Inngest pipeline step 1: scraping videos', {
                    creatorId,
                    handle,
                    runId,
                    eventId,
                });

                const videos: NormalizedVideo[] = [];
                const seenIds = new Set<string>();
                let cursor: string | null = null;
                let previousCursor: string | null = null;
                let pagesScraped = 0;
                const startTime = Date.now();

                while (true) {
                    await ensureActivePipelineRun(creatorId, runId);

                    const page = await fetchTikTokVideos(handle, cursor || undefined);
                    pagesScraped++;

                    let newCount = 0;
                    for (const video of page.videos) {
                        if (!video.id || seenIds.has(video.id)) continue;
                        seenIds.add(video.id);
                        videos.push(video);
                        newCount++;

                        if (videos.length >= MAX_PIPELINE_VIDEOS) {
                            break;
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

                    runMetrics.pagesScraped = pagesScraped;
                    runMetrics.videosScraped = videos.length;

                    await heartbeat('scrape-videos:running', {
                        pagesScraped,
                        videosScraped: videos.length,
                        newVideos: newCount,
                        continuationReason: decision.reason,
                    });

                    log.info('Pipeline: page scraped', {
                        creatorId,
                        runId,
                        page: pagesScraped,
                        newVideos: newCount,
                        total: videos.length,
                        continue: decision.shouldContinue,
                        reason: decision.reason,
                    });

                    if (!decision.shouldContinue) break;

                    previousCursor = cursor;
                    cursor = page.nextCursor;
                    await new Promise((resolve) => setTimeout(resolve, 300));
                }

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
                        .upsert(videoRows, {
                            onConflict: 'creator_id,external_video_id',
                            ignoreDuplicates: true,
                        });

                    if (error) {
                        throw new Error(`Failed to upsert videos: ${error.message}`);
                    }
                }

                log.info('Pipeline step 1 complete', {
                    creatorId,
                    runId,
                    totalVideos: videos.length,
                });

                return videos;
            });

            runMetrics.videosScraped = allVideos.length;

            // ═══ STEP 2: Fetch Transcripts ═══
            await heartbeat('fetch-transcripts:init', {
                videosToProcess: allVideos.length,
            });
            const transcriptRows = await step.run('fetch-transcripts', async () => {
                await ensureActivePipelineRun(creatorId, runId);
                await setCreatorPipelineStatus({
                    creatorId,
                    runId,
                    status: 'transcribing',
                    pipelineError: null,
                });

                log.info('Inngest pipeline step 2: fetching transcripts', {
                    creatorId,
                    runId,
                });

                const supabase = getServiceClient();
                const { data: dbVideos, error: dbVideosError } = await supabase
                    .from('videos')
                    .select('id, external_video_id, url, title, description')
                    .eq('creator_id', creatorId);

                if (dbVideosError) {
                    throw new Error(`Failed to load scraped videos: ${dbVideosError.message}`);
                }

                const dbVideoMap = new Map((dbVideos || []).map((v) => [v.external_video_id, v]));
                const rows: TranscriptRow[] = [];
                const BATCH_SIZE = 20;

                for (let i = 0; i < allVideos.length; i += BATCH_SIZE) {
                    await ensureActivePipelineRun(creatorId, runId);

                    const batch = allVideos.slice(i, i + BATCH_SIZE);
                    const settled = await Promise.allSettled(
                        batch.map(async (video) => {
                            const dbVideo = dbVideoMap.get(video.id);
                            if (!dbVideo) return null;

                            let transcriptText: string | null = null;
                            if (video.webvttUrl) {
                                transcriptText = await fetchVideoTranscript(video.webvttUrl);
                            }
                            if (!transcriptText || transcriptText.length < 10) {
                                transcriptText = video.description || video.title || '';
                            }
                            if (!transcriptText || transcriptText.length < 10) {
                                return null;
                            }

                            return {
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
                            } satisfies TranscriptRow;
                        })
                    );

                    for (const result of settled) {
                        if (result.status === 'fulfilled' && result.value) {
                            rows.push(result.value);
                        }
                    }

                    await heartbeat('fetch-transcripts:running', {
                        processedCount: Math.min(i + BATCH_SIZE, allVideos.length),
                        totalCount: allVideos.length,
                        transcriptsBuffered: rows.length,
                    });
                }

                const deduped = dedupeTranscriptRows(rows);

                if (deduped.length > 0) {
                    const { error } = await supabase
                        .from('video_transcripts')
                        .upsert(deduped, { onConflict: 'creator_id,video_id', ignoreDuplicates: false });

                    if (error) {
                        throw new Error(`Failed to upsert transcripts: ${error.message}`);
                    }
                }

                log.info('Pipeline step 2 complete', {
                    creatorId,
                    runId,
                    transcripts: deduped.length,
                });

                return deduped;
            });

            runMetrics.transcripts = transcriptRows.length;

            if (transcriptRows.length < 5) {
                await setCreatorPipelineStatus({
                    creatorId,
                    runId,
                    status: 'insufficient_content',
                    pipelineError: `Only ${transcriptRows.length} transcripts found. Need at least 5.`,
                });

                await completePipelineRun(runId, {
                    ...runMetrics,
                    terminalStatus: 'insufficient_content',
                });

                log.warn('Pipeline terminated: insufficient content', {
                    creatorId,
                    runId,
                    transcripts: transcriptRows.length,
                });

                return {
                    success: false,
                    creatorId,
                    handle,
                    runId,
                    reason: 'insufficient_content',
                };
            }

            // ═══ STEP 3: Cluster Content ═══
            await heartbeat('cluster-content:init', {
                transcripts: transcriptRows.length,
            });
            const clusterLabels = await step.run('cluster-content', async () => {
                await ensureActivePipelineRun(creatorId, runId);
                await setCreatorPipelineStatus({
                    creatorId,
                    runId,
                    status: 'clustering',
                    pipelineError: null,
                });

                log.info('Inngest pipeline step 3: clustering', { creatorId, runId });

                const supabase = getServiceClient();
                const clusterMap = new Map<string, { videoIds: string[]; totalViews: number; count: number }>();

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

                for (const row of transcriptRows) {
                    const text = (row.title || row.description || '').toLowerCase();
                    let topic = 'General Content';
                    for (const [kw, label] of keywords) {
                        if (text.includes(kw)) {
                            topic = label;
                            break;
                        }
                    }

                    if (!clusterMap.has(topic)) {
                        clusterMap.set(topic, { videoIds: [], totalViews: 0, count: 0 });
                    }
                    const cluster = clusterMap.get(topic)!;
                    cluster.videoIds.push(row.video_id);
                    cluster.totalViews += row.views;
                    cluster.count += 1;
                }

                const { error: deleteError } = await supabase
                    .from('content_clusters')
                    .delete()
                    .eq('creator_id', creatorId);

                if (deleteError) {
                    throw new Error(`Failed to clear old clusters: ${deleteError.message}`);
                }

                const clusterRows = Array.from(clusterMap.entries()).map(([label, row]) => ({
                    creator_id: creatorId,
                    label,
                    topic_summary: `${row.count} videos about ${label}`,
                    video_ids: row.videoIds,
                    total_views: row.totalViews,
                    video_count: row.count,
                    recommended_product_type: row.count >= 5 ? 'mini_course' : 'pdf_guide',
                    confidence_score: Math.min(0.99, row.count / 20),
                }));

                if (clusterRows.length > 0) {
                    const { error: insertError } = await supabase.from('content_clusters').insert(clusterRows);
                    if (insertError) {
                        throw new Error(`Failed to persist clusters: ${insertError.message}`);
                    }
                }

                log.info('Pipeline step 3 complete', {
                    creatorId,
                    runId,
                    clusters: clusterRows.length,
                });

                return Array.from(clusterMap.keys());
            });

            runMetrics.clusters = clusterLabels.length;

            // ═══ STEP 4: Extract Visual DNA + Voice Profile ═══
            await heartbeat('extract-dna-voice:init', {
                clusters: clusterLabels.length,
            });
            await step.run('extract-dna-voice', async () => {
                await ensureActivePipelineRun(creatorId, runId);
                await setCreatorPipelineStatus({
                    creatorId,
                    runId,
                    status: 'extracting',
                    pipelineError: null,
                });

                log.info('Inngest pipeline step 4: extracting DNA + voice', {
                    creatorId,
                    runId,
                });

                const supabase = getServiceClient();
                const topVideos = [...transcriptRows].sort((a, b) => b.views - a.views).slice(0, 10);
                const thumbnailUrls = topVideos
                    .map((v) => v.thumbnail_url)
                    .filter((url): url is string => Boolean(url));

                const visualDna = {
                    thumbnail_urls: thumbnailUrls.slice(0, 6),
                    dominant_topics: clusterLabels.slice(0, 5),
                    content_style: transcriptRows.length > 20 ? 'prolific' : 'curated',
                    top_views: topVideos[0]?.views || 0,
                    extracted_at: new Date().toISOString(),
                };

                const allText = transcriptRows.map((r) => r.transcript_text).join(' ');
                const wordCount = allText.split(/\s+/).filter(Boolean).length;
                const sentenceCount = allText.split(/[.!?]+/).filter(Boolean).length;

                const voiceProfile = {
                    total_words: wordCount,
                    total_transcripts: transcriptRows.length,
                    avg_sentence_count: sentenceCount,
                    top_topics: clusterLabels.slice(0, 5),
                    estimated_tone: wordCount > 5000 ? 'detailed' : 'concise',
                    extracted_at: new Date().toISOString(),
                };

                const { error } = await supabase
                    .from('creators')
                    .update({
                        visual_dna: visualDna,
                        voice_profile: voiceProfile,
                    })
                    .eq('id', creatorId)
                    .eq('pipeline_run_id', runId);

                if (error) {
                    throw new Error(`Failed to update creator DNA/voice profile: ${error.message}`);
                }

                runMetrics.topViewCount = topVideos[0]?.views || 0;

                log.info('Pipeline step 4 complete', {
                    creatorId,
                    runId,
                    wordCount,
                    sentenceCount,
                });
            });

            // ═══ STEP 5: Mark Complete ═══
            await heartbeat('mark-ready:init');
            await step.run('mark-ready', async () => {
                await ensureActivePipelineRun(creatorId, runId);
                await setCreatorPipelineStatus({
                    creatorId,
                    runId,
                    status: 'ready',
                    pipelineError: null,
                });
                log.info('Pipeline complete', { creatorId, handle, runId, eventId });
            });

            await completePipelineRun(runId, {
                ...runMetrics,
                terminalStatus: 'ready',
            });

            return { success: true, creatorId, handle, runId };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown pipeline error';

            if (error instanceof PipelineRunSupersededError) {
                await markPipelineRunSuperseded(runId, creatorId, {
                    step: currentStep,
                    expectedRunId: error.expectedRunId,
                    actualRunId: error.actualRunId,
                });

                log.warn('Inngest pipeline stopped due to superseded run token', {
                    creatorId,
                    handle,
                    runId,
                    expectedRunId: error.expectedRunId,
                    actualRunId: error.actualRunId,
                });

                return {
                    success: false,
                    creatorId,
                    handle,
                    runId,
                    reason: 'superseded',
                };
            }

            try {
                await setCreatorPipelineStatus({
                    creatorId,
                    runId,
                    status: 'error',
                    pipelineError: message,
                });
            } catch (statusError) {
                log.error('Pipeline failed and status update failed', {
                    creatorId,
                    runId,
                    error: message,
                    statusError: statusError instanceof Error ? statusError.message : 'Unknown status update error',
                });
            }

            await failPipelineRun({
                runId,
                creatorId,
                handle,
                eventId,
                failedStep: currentStep,
                errorMessage: message,
                payload: runMetrics,
            });

            log.error('Inngest pipeline failed', {
                creatorId,
                handle,
                runId,
                eventId,
                step: currentStep,
                error: message,
            });

            throw error;
        }
    }
);
