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
import { indexVideo } from '@/lib/indexing/orchestrator';
import { z } from 'zod';
import { triggerImportCompletedEmail, triggerImportFailedEmail } from '@/lib/email/triggers';
import { requestKimiStructuredArray, requestKimiStructuredObject } from '@/lib/ai/kimi-structured';
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

const ClusterProductTypeSchema = z.enum(['pdf_guide', 'mini_course', 'challenge_7day', 'checklist_toolkit']);

const ClusterResultSchema = z.object({
    label: z.string().min(1),
    videoIds: z.array(z.string().min(1)).default([]),
    summary: z.string().default(''),
    productType: ClusterProductTypeSchema.default('pdf_guide'),
    confidence: z.number().min(0).max(1).default(0.5),
});

const ClusterResultsSchema = z.array(ClusterResultSchema).default([]);

const VoiceBrandSchema = z.object({
    voiceProfile: z.object({
        tone: z.string().optional(),
        vocabulary: z.string().optional(),
        speakingStyle: z.string().optional(),
        catchphrases: z.array(z.string()).optional(),
        personality: z.string().optional(),
        contentFocus: z.string().optional(),
    }).passthrough(),
    brandTokens: z.object({
        primaryColor: z.string().optional(),
        secondaryColor: z.string().optional(),
        backgroundColor: z.string().optional(),
        textColor: z.string().optional(),
        fontFamily: z.string().optional(),
        mood: z.string().optional(),
    }).passthrough(),
});

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

            // ═══ STEP 3: Index Content (chunk + embed + clip cards) ═══
            await heartbeat('index-content:init', {
                transcripts: transcriptRows.length,
            });
            const indexingResult = await step.run('index-content', async () => {
                await ensureActivePipelineRun(creatorId, runId);
                await setCreatorPipelineStatus({
                    creatorId,
                    runId,
                    status: 'indexing',
                    pipelineError: null,
                });

                log.info('Inngest pipeline step 3: indexing content', { creatorId, runId });

                const supabase = getServiceClient();
                const { data: dbVideos } = await supabase
                    .from('videos')
                    .select('id')
                    .eq('creator_id', creatorId);

                const videoIds = (dbVideos || []).map((v) => v.id);
                let totalChunks = 0;
                let totalClipCards = 0;
                let totalEmbeddings = 0;

                for (let i = 0; i < videoIds.length; i++) {
                    try {
                        const result = await indexVideo(supabase, videoIds[i]);
                        totalChunks += result.chunksCreated;
                        totalClipCards += result.clipCardCreated ? 1 : 0;
                        totalEmbeddings += result.chunksEmbedded + (result.clipCardEmbedded ? 1 : 0);
                    } catch (err) {
                        log.error('Failed to index video', {
                            videoId: videoIds[i],
                            error: err instanceof Error ? err.message : 'Unknown',
                        });
                    }

                    if ((i + 1) % 5 === 0) {
                        await heartbeat('index-content:running', {
                            processedVideos: i + 1,
                            totalVideos: videoIds.length,
                            totalChunks,
                            totalClipCards,
                        });
                    }
                }

                log.info('Pipeline step 3 complete', {
                    creatorId,
                    runId,
                    totalChunks,
                    totalClipCards,
                    totalEmbeddings,
                });

                return { totalChunks, totalClipCards, totalEmbeddings };
            });

            runMetrics.chunks = indexingResult.totalChunks;
            runMetrics.clipCards = indexingResult.totalClipCards;
            runMetrics.embeddings = indexingResult.totalEmbeddings;

            // ═══ STEP 4: Cluster Content (AI-powered) ═══
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

                log.info('Inngest pipeline step 4: AI clustering', { creatorId, runId });

                const supabase = getServiceClient();

                // Build a summary of all video content for AI clustering
                const videoSummaries = transcriptRows.slice(0, 50).map((r) => ({
                    id: r.video_id,
                    title: r.title || '(untitled)',
                    views: r.views,
                    transcript: r.transcript_text.slice(0, 300),
                }));

                let clusters: { label: string; videoIds: string[]; summary: string; productType: string; confidence: number }[] = [];

                try {
                    const parsedClusters = await requestKimiStructuredArray({
                        systemPrompt: `You are a content analyst. Given a list of video titles and transcript snippets, group them into 3-7 topic clusters. For each cluster, provide a label, summary, list of video IDs, recommended product type (pdf_guide, mini_course, challenge_7day, or checklist_toolkit), and confidence score (0-1).\n\nOutput ONLY valid JSON array, no markdown:\n[{"label":"...","videoIds":["..."],"summary":"...","productType":"...","confidence":0.8}]`,
                        userPrompt: JSON.stringify(videoSummaries),
                        schema: ClusterResultsSchema,
                        maxTokens: 4096,
                    });
                    if (!parsedClusters || parsedClusters.length === 0) {
                        throw new Error('AI clustering returned empty structured output');
                    }

                    const allowedVideoIds = new Set(videoSummaries.map((video) => video.id));
                    clusters = parsedClusters
                        .map((cluster) => ({
                            label: cluster.label.trim(),
                            videoIds: cluster.videoIds.filter((videoId) => allowedVideoIds.has(videoId)),
                            summary: cluster.summary,
                            productType: cluster.productType,
                            confidence: cluster.confidence,
                        }))
                        .filter((cluster) => cluster.label.length > 0 && cluster.videoIds.length > 0);

                    if (clusters.length === 0) {
                        throw new Error('AI clustering returned no valid clusters after filtering.');
                    }
                } catch (err) {
                    log.error('AI clustering failed, falling back to keyword matching', {
                        error: err instanceof Error ? err.message : 'Unknown',
                    });
                    // Fallback: group by simple keyword matching
                    const clusterMap = new Map<string, { videoIds: string[]; totalViews: number; count: number }>();
                    for (const row of transcriptRows) {
                        const topic = 'General Content';
                        if (!clusterMap.has(topic)) clusterMap.set(topic, { videoIds: [], totalViews: 0, count: 0 });
                        const c = clusterMap.get(topic)!;
                        c.videoIds.push(row.video_id);
                        c.totalViews += row.views;
                        c.count++;
                    }
                    clusters = Array.from(clusterMap.entries()).map(([label, c]) => ({
                        label,
                        videoIds: c.videoIds,
                        summary: `${c.count} videos`,
                        productType: c.count >= 5 ? 'mini_course' : 'pdf_guide',
                        confidence: 0.5,
                    }));
                }

                // Persist clusters
                await supabase.from('content_clusters').delete().eq('creator_id', creatorId);

                const clusterRows = clusters.map((c) => ({
                    creator_id: creatorId,
                    label: c.label,
                    topic_summary: c.summary,
                    video_ids: c.videoIds,
                    total_views: transcriptRows.filter((r) => c.videoIds.includes(r.video_id)).reduce((sum, r) => sum + r.views, 0),
                    video_count: c.videoIds.length,
                    recommended_product_type: c.productType,
                    confidence_score: c.confidence,
                }));

                if (clusterRows.length > 0) {
                    const { error: insertError } = await supabase.from('content_clusters').insert(clusterRows);
                    if (insertError) {
                        throw new Error(`Failed to persist clusters: ${insertError.message}`);
                    }
                }

                log.info('Pipeline step 4 complete', {
                    creatorId, runId, clusters: clusterRows.length,
                });

                return clusters.map((c) => c.label);
            });

            runMetrics.clusters = clusterLabels.length;

            // ═══ STEP 5: Extract Visual DNA + Brand Tokens + Voice Profile (AI) ═══
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

                log.info('Inngest pipeline step 5: extracting DNA + voice via AI', {
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

                // AI-powered voice profile extraction
                const sampleTranscripts = topVideos.slice(0, 5).map((r) => r.transcript_text.slice(0, 1000)).join('\n---\n');
                let voiceProfile: Record<string, unknown> = {};
                let brandTokens: Record<string, unknown> = {};

                try {
                    const parsed = await requestKimiStructuredObject({
                        systemPrompt: `Analyze these video transcripts from a social media creator and extract:
1. Their voice profile (how they speak/write, vocabulary, tone, catchphrases, style)
2. Brand recommendations (colors, mood, font suggestion)

Output ONLY valid JSON:\n{"voiceProfile":{"tone":"...","vocabulary":"simple|intermediate|advanced","speakingStyle":"...","catchphrases":["..."],"personality":"...","contentFocus":"..."},"brandTokens":{"primaryColor":"#hex","secondaryColor":"#hex","backgroundColor":"#hex","textColor":"#hex","fontFamily":"inter|outfit|roboto|playfair","mood":"clean|fresh|bold|premium|energetic"}}`,
                        userPrompt: `Creator topics: ${clusterLabels.join(', ')}\n\nTranscripts:\n${sampleTranscripts}`,
                        schema: VoiceBrandSchema,
                        maxTokens: 2048,
                    });

                    voiceProfile = {
                        ...parsed.voiceProfile,
                        total_words: transcriptRows.reduce((sum, r) => sum + r.transcript_text.split(/\s+/).length, 0),
                        total_transcripts: transcriptRows.length,
                        top_topics: clusterLabels.slice(0, 5),
                        extracted_at: new Date().toISOString(),
                    };
                    brandTokens = {
                        ...parsed.brandTokens,
                        borderRadius: 'md',
                        spacing: 'normal',
                        shadow: 'sm',
                    };
                } catch (err) {
                    log.error('AI extraction failed, using defaults', {
                        error: err instanceof Error ? err.message : 'Unknown',
                    });
                    const allText = transcriptRows.map((r) => r.transcript_text).join(' ');
                    const wordCount = allText.split(/\s+/).filter(Boolean).length;
                    voiceProfile = {
                        total_words: wordCount,
                        total_transcripts: transcriptRows.length,
                        top_topics: clusterLabels.slice(0, 5),
                        estimated_tone: wordCount > 5000 ? 'detailed' : 'concise',
                        extracted_at: new Date().toISOString(),
                    };
                    brandTokens = {
                        primaryColor: '#6366f1',
                        secondaryColor: '#8b5cf6',
                        backgroundColor: '#ffffff',
                        textColor: '#1f2937',
                        fontFamily: 'inter',
                        mood: 'clean',
                        borderRadius: 'md',
                        spacing: 'normal',
                        shadow: 'sm',
                    };
                }

                const { error } = await supabase
                    .from('creators')
                    .update({
                        visual_dna: visualDna,
                        voice_profile: voiceProfile,
                        brand_tokens: brandTokens,
                    })
                    .eq('id', creatorId)
                    .eq('pipeline_run_id', runId);

                if (error) {
                    throw new Error(`Failed to update creator DNA/voice/brand: ${error.message}`);
                }

                runMetrics.topViewCount = topVideos[0]?.views || 0;

                log.info('Pipeline step 5 complete', {
                    creatorId,
                    runId,
                    voiceProfileKeys: Object.keys(voiceProfile),
                    brandMood: brandTokens.mood,
                });
            });

            // ═══ STEP 6: Auto-generate Draft Product ═══
            await heartbeat('auto-generate:init');
            await step.run('auto-generate-draft', async () => {
                await ensureActivePipelineRun(creatorId, runId);

                log.info('Inngest pipeline step 6: auto-generating draft product', {
                    creatorId,
                    runId,
                });

                const supabase = getServiceClient();

                // Check if creator already has products
                const { data: existingProducts } = await supabase
                    .from('products')
                    .select('id')
                    .eq('creator_id', creatorId)
                    .limit(1);

                if (existingProducts && existingProducts.length > 0) {
                    log.info('Creator already has products, skipping auto-generation', { creatorId });
                    return;
                }

                // Get the top cluster for product suggestion
                const { data: topCluster } = await supabase
                    .from('content_clusters')
                    .select('label, topic_summary, video_count, recommended_product_type')
                    .eq('creator_id', creatorId)
                    .order('video_count', { ascending: false })
                    .limit(1)
                    .single();

                if (!topCluster) {
                    log.warn('No clusters found for auto-generation', { creatorId });
                    return;
                }

                // Get creator display name for the title
                const { data: creatorData } = await supabase
                    .from('creators')
                    .select('display_name, handle')
                    .eq('id', creatorId)
                    .single();

                const displayName = creatorData?.display_name || creatorData?.handle || 'Creator';
                const productType = topCluster.recommended_product_type || 'pdf_guide';
                const typeLabels: Record<string, string> = {
                    pdf_guide: 'Guide',
                    mini_course: 'Mini Course',
                    challenge_7day: '7-Day Challenge',
                    checklist_toolkit: 'Toolkit',
                };
                const typeLabel = typeLabels[productType] || 'Guide';

                const title = `${displayName}'s ${topCluster.label} ${typeLabel}`;
                const description = `A ${typeLabel.toLowerCase()} about ${topCluster.label.toLowerCase()}, created from ${topCluster.video_count} videos by @${creatorData?.handle || 'creator'}.`;

                const baseSlug = title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
                    .slice(0, 60);
                const slug = `${baseSlug}-${Date.now().toString(36)}`;

                const { data: product, error: productError } = await supabase
                    .from('products')
                    .insert({
                        creator_id: creatorId,
                        slug,
                        type: productType,
                        title,
                        description,
                        status: 'draft',
                        access_type: 'paid',
                        price_cents: null,
                        currency: 'usd',
                    })
                    .select('id')
                    .single();

                if (productError) {
                    log.error('Failed to create draft product', { error: productError.message });
                    return;
                }

                // Create initial version
                if (product) {
                    const { data: version } = await supabase
                        .from('product_versions')
                        .insert({
                            product_id: product.id,
                            version_number: 1,
                            build_packet: {},
                            dsl_json: {},
                            source_video_ids: [],
                        })
                        .select('id')
                        .single();

                    if (version) {
                        await supabase
                            .from('products')
                            .update({ active_version_id: version.id })
                            .eq('id', product.id);
                    }
                }

                log.info('Auto-generated draft product', {
                    creatorId,
                    runId,
                    productTitle: title,
                    productType,
                    cluster: topCluster.label,
                });
            });

            // ═══ STEP 7: Mark Complete ═══
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

                // Send pipeline completion email
                try {
                    const supabase = getServiceClient();
                    const { data: creatorData } = await supabase
                        .from('creators')
                        .select('display_name, profiles(email)')
                        .eq('id', creatorId)
                        .single();
                    const profile = creatorData?.profiles as unknown as { email: string } | null;
                    if (profile?.email) {
                        await triggerImportCompletedEmail({
                            creatorEmail: profile.email,
                            creatorName: creatorData?.display_name || handle,
                            videoCount: (runMetrics.videoCount as number) || 0,
                        });
                    }
                } catch (emailErr) {
                    log.error('Failed to send pipeline completion email', { error: emailErr instanceof Error ? emailErr.message : 'Unknown' });
                }
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

            // Send pipeline failure email
            try {
                const supabase = getServiceClient();
                const { data: creatorData } = await supabase
                    .from('creators')
                    .select('display_name, profiles(email)')
                    .eq('id', creatorId)
                    .single();
                const profile = creatorData?.profiles as unknown as { email: string } | null;
                if (profile?.email) {
                    await triggerImportFailedEmail({
                        creatorEmail: profile.email,
                        creatorName: creatorData?.display_name || handle,
                        errorMessage: message.slice(0, 200),
                    });
                }
            } catch {
                // Best-effort — don't fail the pipeline error handler over an email
            }

            throw error;
        }
    }
);
