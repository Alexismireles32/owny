// src/lib/pipeline/pipeline.ts
// Queue/fallback pipeline path (used when dispatch transport is Supabase queue).
// Upgraded to keep quality close to the Inngest multi-step pipeline.

import { createClient as createServiceClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import {
    fetchTikTokVideos,
    fetchVideoTranscript,
    getScrapeContinuationDecision,
    MAX_PIPELINE_VIDEOS,
    type NormalizedVideo,
} from '@/lib/scraping/scrapeCreators';
import { scrapeCreatorsProvider } from '@/lib/import/scrapecreators';
import { indexVideo } from '@/lib/indexing/orchestrator';
import { chunkAndStoreTranscript } from '@/lib/indexing/chunker';
import { log } from '@/lib/logger';
import type { ProductType } from '@/types/build-packet';

type PipelineProductType = ProductType;

interface VideoRow {
    id: string;
    external_video_id: string;
    url: string | null;
    title: string | null;
    description: string | null;
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

interface ClusterCandidate {
    label: string;
    videoIds: string[];
    summary: string;
    productType: PipelineProductType;
    confidence: number;
}

const ClusterProductTypeSchema = z.enum([
    'pdf_guide',
    'mini_course',
    'challenge_7day',
    'checklist_toolkit',
]);

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

function getServiceClient() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

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

function sanitizeText(input: string | null | undefined, maxLen = 160): string | null {
    if (!input) return null;
    const cleaned = input.replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned.length < 3) return null;
    return cleaned.slice(0, maxLen);
}

function deriveTitle(video: NormalizedVideo, dbVideo?: VideoRow): string | null {
    return (
        sanitizeText(video.title, 160) ||
        sanitizeText(dbVideo?.title, 160) ||
        sanitizeText(video.description, 160) ||
        sanitizeText(dbVideo?.description, 160) ||
        null
    );
}

function deriveDescription(video: NormalizedVideo, dbVideo?: VideoRow): string | null {
    return (
        sanitizeText(video.description, 400) ||
        sanitizeText(dbVideo?.description, 400) ||
        sanitizeText(video.title, 400) ||
        sanitizeText(dbVideo?.title, 400) ||
        null
    );
}

function tokenizeTopic(text: string): string[] {
    return text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);
}

function fallbackClusterRows(rows: TranscriptRow[]): ClusterCandidate[] {
    const clusterMap = new Map<string, { videoIds: string[]; totalViews: number; count: number }>();
    const keywords: Array<[string, string]> = [
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

    for (const row of rows) {
        const text = `${row.title || ''} ${row.description || ''}`.toLowerCase();
        let topic = 'General Content';
        for (const [keyword, label] of keywords) {
            if (text.includes(keyword)) {
                topic = label;
                break;
            }
        }

        if (!clusterMap.has(topic)) {
            clusterMap.set(topic, { videoIds: [], totalViews: 0, count: 0 });
        }

        const cluster = clusterMap.get(topic)!;
        cluster.videoIds.push(row.video_id);
        cluster.totalViews += row.views || 0;
        cluster.count += 1;
    }

    return Array.from(clusterMap.entries()).map(([label, cluster]) => ({
        label,
        videoIds: cluster.videoIds,
        summary: `${cluster.count} videos`,
        productType: cluster.count >= 5 ? 'mini_course' : 'pdf_guide',
        confidence: Math.min(0.99, cluster.count / 20),
    }));
}

function buildDefaultVoiceProfile(rows: TranscriptRow[], clusterLabels: string[]): Record<string, unknown> {
    const allText = rows.map((row) => row.transcript_text).join(' ');
    const words = allText.split(/\s+/).filter(Boolean);
    return {
        total_words: words.length,
        total_transcripts: rows.length,
        top_topics: clusterLabels.slice(0, 5),
        estimated_tone: words.length > 5000 ? 'detailed' : 'concise',
        extracted_at: new Date().toISOString(),
    };
}

function buildDefaultBrandTokens(): Record<string, unknown> {
    return {
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
            pagesScraped += 1;

            let newCount = 0;
            for (const video of page.videos) {
                if (!seenIds.has(video.id)) {
                    seenIds.add(video.id);
                    allVideos.push(video);
                    newCount += 1;
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
            await new Promise((resolve) => setTimeout(resolve, 300));
        }

        if (allVideos.length > 0) {
            const videoRows = allVideos.slice(0, MAX_PIPELINE_VIDEOS).map((video) => ({
                creator_id: creatorId,
                source: 'scrapecreators' as const,
                external_video_id: video.id,
                url: video.url,
                title: deriveTitle(video) || video.title,
                description: deriveDescription(video) || video.description,
                views: video.views,
                likes: video.likes,
                comments_count: video.comments,
                shares: video.shares,
                duration: video.duration,
                thumbnail_url: video.thumbnailUrl,
                created_at_source: video.createdAt,
            }));

            const { error: insertError } = await supabase
                .from('videos')
                .upsert(videoRows, {
                    onConflict: 'creator_id,external_video_id',
                    ignoreDuplicates: false,
                });

            if (insertError) {
                log.error('Pipeline 0A: video upsert error', {
                    creatorId,
                    error: insertError.message,
                });
            }
        }

        log.info('Pipeline 0A complete', {
            creatorId,
            totalVideos: allVideos.length,
        });

        // ═══ STAGE 0B: Fetch Transcripts ═══
        await setCreatorStatus(creatorId, 'transcribing');
        log.info('Pipeline 0B: fetching transcripts', { creatorId });

        const { data: dbVideos } = await supabase
            .from('videos')
            .select('id, external_video_id, url, title, description')
            .eq('creator_id', creatorId);

        const dbVideoMap = new Map(
            ((dbVideos || []) as VideoRow[]).map((video) => [video.external_video_id, video])
        );

        const transcriptRows: TranscriptRow[] = [];
        const TRANSCRIPT_BATCH_SIZE = 12;

        for (let i = 0; i < allVideos.length; i += TRANSCRIPT_BATCH_SIZE) {
            const batch = allVideos.slice(i, i + TRANSCRIPT_BATCH_SIZE);

            await Promise.all(
                batch.map(async (video) => {
                    const dbVideo = dbVideoMap.get(video.id);
                    if (!dbVideo) return;

                    let transcriptText: string | null = null;
                    let source = 'caption';

                    if (video.webvttUrl) {
                        transcriptText = await fetchVideoTranscript(video.webvttUrl);
                    }

                    if ((!transcriptText || transcriptText.length < 40) && video.url) {
                        try {
                            const providerTranscript = await scrapeCreatorsProvider.getTranscript(video.url, {
                                useAiFallback: true,
                            });
                            if (providerTranscript?.transcriptText?.trim()) {
                                transcriptText = providerTranscript.transcriptText.trim();
                                source = providerTranscript.source || 'ai_fallback';
                            }
                        } catch (error) {
                            log.warn('Pipeline 0B: provider transcript fallback failed', {
                                creatorId,
                                videoId: video.id,
                                error: error instanceof Error ? error.message : 'Unknown provider transcript error',
                            });
                        }
                    }

                    if (!transcriptText || transcriptText.length < 10) {
                        transcriptText = deriveDescription(video, dbVideo) || deriveTitle(video, dbVideo) || '';
                        source = 'description_fallback';
                    }

                    if (transcriptText.length < 10) return;

                    transcriptRows.push({
                        creator_id: creatorId,
                        video_id: dbVideo.id,
                        platform: 'tiktok',
                        title: deriveTitle(video, dbVideo),
                        description: deriveDescription(video, dbVideo),
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
                        source,
                    });
                })
            );
        }

        const dedupedRows = dedupeTranscriptRows(transcriptRows);

        if (dedupedRows.length > 0) {
            const { error: transcriptError } = await supabase
                .from('video_transcripts')
                .upsert(dedupedRows, {
                    onConflict: 'creator_id,video_id',
                    ignoreDuplicates: false,
                });

            if (transcriptError) {
                log.error('Pipeline 0B: transcript upsert error', {
                    creatorId,
                    error: transcriptError.message,
                });
            }
        }

        log.info('Pipeline 0B complete', {
            creatorId,
            transcripts: dedupedRows.length,
        });

        if (dedupedRows.length < 5) {
            await setCreatorStatus(creatorId, 'insufficient_content', {
                pipeline_error: `Only ${dedupedRows.length} transcripts found. Need at least 5.`,
            });
            log.warn('Pipeline: insufficient content', {
                creatorId,
                transcriptCount: dedupedRows.length,
            });
            return;
        }

        // ═══ STAGE 1: Index Content (chunk + clip cards + embeddings) ═══
        await setCreatorStatus(creatorId, 'indexing');
        log.info('Pipeline 1: indexing content', { creatorId });

        const { data: creatorVideos } = await supabase
            .from('videos')
            .select('id')
            .eq('creator_id', creatorId);

        const videoIds = (creatorVideos || []).map((video) => video.id);
        const transcriptByVideoId = new Map(dedupedRows.map((row) => [row.video_id, row.transcript_text]));
        let totalChunks = 0;
        let totalClipCards = 0;
        let totalEmbeddings = 0;
        let indexingFailures = 0;
        let fallbackChunkedVideos = 0;

        for (const videoId of videoIds) {
            try {
                const result = await indexVideo(supabase, videoId);
                totalChunks += result.chunksCreated;
                totalClipCards += result.clipCardCreated ? 1 : 0;
                totalEmbeddings += result.chunksEmbedded + (result.clipCardEmbedded ? 1 : 0);
            } catch (error) {
                indexingFailures += 1;
                const transcript = transcriptByVideoId.get(videoId);
                if (transcript && transcript.length > 0) {
                    try {
                        const fallbackChunks = await chunkAndStoreTranscript(supabase, videoId, transcript);
                        if (fallbackChunks > 0) {
                            totalChunks += fallbackChunks;
                            fallbackChunkedVideos += 1;
                        }
                    } catch (chunkError) {
                        log.warn('Pipeline fallback chunking failed', {
                            creatorId,
                            videoId,
                            error: chunkError instanceof Error ? chunkError.message : 'Unknown fallback chunking error',
                        });
                    }
                }
                log.warn('Pipeline indexing failed for video', {
                    creatorId,
                    videoId,
                    error: error instanceof Error ? error.message : 'Unknown indexing error',
                });
            }
        }

        if (totalChunks === 0) {
            throw new Error('No searchable transcript chunks were generated during indexing.');
        }

        log.info('Pipeline 1 complete', {
            creatorId,
            videoCount: videoIds.length,
            totalChunks,
            totalClipCards,
            totalEmbeddings,
            indexingFailures,
            fallbackChunkedVideos,
        });

        // ═══ STAGE 2: Cluster Content ═══
        await setCreatorStatus(creatorId, 'clustering');
        log.info('Pipeline 2: clustering content', { creatorId });

        let clusters: ClusterCandidate[] = [];
        const videoSummaries = dedupedRows.slice(0, 50).map((row) => ({
            id: row.video_id,
            title: row.title || '(untitled)',
            views: row.views,
            transcript: row.transcript_text.slice(0, 320),
        }));

        if (process.env.ANTHROPIC_API_KEY && videoSummaries.length > 0) {
            try {
                const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
                const response = await anthropic.messages.parse({
                    model: 'claude-haiku-4-5-20241022',
                    max_tokens: 2048,
                    system: `You are a content analyst. Group these creator videos into 3-7 meaningful topic clusters.
Return ONLY valid JSON array:
[{"label":"...","videoIds":["..."],"summary":"...","productType":"pdf_guide|mini_course|challenge_7day|checklist_toolkit","confidence":0.0}]`,
                    messages: [{ role: 'user', content: JSON.stringify(videoSummaries) }],
                    output_config: {
                        format: zodOutputFormat(ClusterResultsSchema),
                    },
                });

                const parsed = response.parsed_output || [];
                const allowedVideoIds = new Set(videoSummaries.map((video) => video.id));
                clusters = parsed
                    .map((cluster) => ({
                        label: cluster.label.trim(),
                        videoIds: cluster.videoIds.filter((videoId) => allowedVideoIds.has(videoId)),
                        summary: cluster.summary,
                        productType: cluster.productType,
                        confidence: cluster.confidence,
                    }))
                    .filter((cluster) => cluster.label.length > 0 && cluster.videoIds.length > 0);
            } catch (error) {
                log.warn('Pipeline 2: AI clustering failed, using keyword fallback', {
                    creatorId,
                    error: error instanceof Error ? error.message : 'Unknown clustering error',
                });
            }
        }

        if (clusters.length === 0) {
            clusters = fallbackClusterRows(dedupedRows);
        }

        await supabase
            .from('content_clusters')
            .delete()
            .eq('creator_id', creatorId);

        const clusterRows = clusters.map((cluster) => ({
            creator_id: creatorId,
            label: cluster.label,
            topic_summary: cluster.summary,
            video_ids: cluster.videoIds,
            total_views: dedupedRows
                .filter((row) => cluster.videoIds.includes(row.video_id))
                .reduce((sum, row) => sum + (row.views || 0), 0),
            video_count: cluster.videoIds.length,
            recommended_product_type: cluster.productType,
            confidence_score: cluster.confidence,
        }));

        if (clusterRows.length > 0) {
            const { error: clusterError } = await supabase
                .from('content_clusters')
                .insert(clusterRows);

            if (clusterError) {
                log.error('Pipeline 2: cluster insert error', {
                    creatorId,
                    error: clusterError.message,
                });
            }
        }

        const clusterLabels = clusterRows.map((cluster) => cluster.label);
        log.info('Pipeline 2 complete', {
            creatorId,
            clusters: clusterRows.length,
        });

        // ═══ STAGE 3: Extract Visual DNA + Voice + Brand Tokens ═══
        await setCreatorStatus(creatorId, 'extracting');
        log.info('Pipeline 3: extracting visual DNA + voice + brand', { creatorId });

        const topVideos = [...dedupedRows]
            .sort((a, b) => b.views - a.views)
            .slice(0, 10);

        const visualDna = {
            thumbnail_urls: topVideos
                .map((video) => video.thumbnail_url)
                .filter((url): url is string => Boolean(url))
                .slice(0, 6),
            dominant_topics: clusterLabels.slice(0, 5),
            content_style: dedupedRows.length > 20 ? 'prolific' : 'curated',
            top_views: topVideos[0]?.views || 0,
            extracted_at: new Date().toISOString(),
        };

        const transcriptTokens = tokenizeTopic(
            topVideos.map((video) => video.transcript_text).join(' ')
        );

        let voiceProfile: Record<string, unknown> = buildDefaultVoiceProfile(dedupedRows, clusterLabels);
        let brandTokens: Record<string, unknown> = buildDefaultBrandTokens();

        const sampleTranscripts = topVideos
            .slice(0, 5)
            .map((video) => video.transcript_text.slice(0, 1200))
            .join('\n---\n');

        if (process.env.ANTHROPIC_API_KEY && sampleTranscripts.length > 0) {
            try {
                const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
                const response = await anthropic.messages.parse({
                    model: 'claude-haiku-4-5-20241022',
                    max_tokens: 1024,
                    system: `Analyze this creator's transcripts and return ONLY valid JSON:
{"voiceProfile":{"tone":"...","vocabulary":"simple|intermediate|advanced","speakingStyle":"...","catchphrases":["..."],"personality":"...","contentFocus":"..."},"brandTokens":{"primaryColor":"#hex","secondaryColor":"#hex","backgroundColor":"#hex","textColor":"#hex","fontFamily":"inter|outfit|roboto|playfair","mood":"clean|fresh|bold|premium|energetic"}}`,
                    messages: [{ role: 'user', content: `Creator topics: ${clusterLabels.join(', ')}\n\nTranscripts:\n${sampleTranscripts}` }],
                    output_config: {
                        format: zodOutputFormat(VoiceBrandSchema),
                    },
                });

                const parsed = response.parsed_output;
                if (parsed) {
                    voiceProfile = {
                        ...parsed.voiceProfile,
                        total_words: dedupedRows.reduce(
                            (sum, row) => sum + row.transcript_text.split(/\s+/).filter(Boolean).length,
                            0
                        ),
                        total_transcripts: dedupedRows.length,
                        top_topics: clusterLabels.slice(0, 5),
                        extracted_at: new Date().toISOString(),
                    };
                    brandTokens = {
                        ...buildDefaultBrandTokens(),
                        ...parsed.brandTokens,
                    };
                }
            } catch (error) {
                log.warn('Pipeline 3: AI voice/brand extraction failed, using defaults', {
                    creatorId,
                    error: error instanceof Error ? error.message : 'Unknown voice extraction error',
                });
            }
        } else {
            // Enrich fallback voice profile with simple lexical signal.
            voiceProfile = {
                ...voiceProfile,
                dominant_terms: transcriptTokens.slice(0, 20),
            };
        }

        await supabase
            .from('creators')
            .update({
                visual_dna: visualDna,
                voice_profile: voiceProfile,
                brand_tokens: brandTokens,
            })
            .eq('id', creatorId);

        log.info('Pipeline 3 complete', {
            creatorId,
            voiceKeys: Object.keys(voiceProfile),
            brandMood: String(brandTokens.mood || ''),
        });

        // ═══ COMPLETION ═══
        await setCreatorStatus(creatorId, 'ready', {
            pipeline_error: null,
        });

        log.info('Pipeline complete', {
            creatorId,
            handle,
            totalVideos: allVideos.length,
            transcripts: dedupedRows.length,
            totalChunks,
            totalClipCards,
            totalEmbeddings,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        log.error('Pipeline failed', {
            creatorId,
            handle,
            error: message,
        });
        await setCreatorStatus(creatorId, 'error', {
            pipeline_error: message,
        });
        throw error;
    }
}
