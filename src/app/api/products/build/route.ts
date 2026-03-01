// POST /api/products/build — SSE streaming endpoint for live product generation
// Phase 1: Topic discovery (if vague) → Phase 2: Retrieve+Rerank → Phase 3: Plan → Phase 4: Stream HTML

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { hybridSearch } from '@/lib/indexing/search';
import { rerankCandidates } from '@/lib/ai/reranker';
import { postProcessHTML } from '@/lib/ai/post-process-html';
import { buildCreatorDNA, buildCreatorDNAContext } from '@/lib/ai/creator-dna';
import {
    buildDesignCanonContext,
    chooseCreativeDirection,
    getEvergreenDesignCanon,
} from '@/lib/ai/design-canon';
import { evaluateProductQuality } from '@/lib/ai/quality-gates';
import { runEvergreenCriticLoop } from '@/lib/ai/critic-loop';
import { runKimiSectionedProductPipeline } from '@/lib/ai/kimi-product-pipeline';
import { log } from '@/lib/logger';
import type { ProductType } from '@/types/build-packet';

function getServiceDb() {
    return createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}


interface TranscriptSelectionRow {
    video_id: string;
    title: string | null;
    description: string | null;
    transcript_text: string | null;
    views: number | null;
    likes: number | null;
}

interface ClipCardRow {
    video_id: string;
    card_json: Record<string, unknown> | null;
}

interface VideoMetadataRow {
    id: string;
    title: string | null;
    description: string | null;
    views: number | null;
    likes: number | null;
}

interface TranscriptChunkRow {
    video_id: string;
    chunk_text: string;
    chunk_index: number;
}

interface TopicClusterRow {
    label: string | null;
    video_count: number | null;
    confidence_score: number | null;
    total_views: number | null;
    video_ids: string[] | null;
}

interface TopicSuggestionRow {
    topic: string;
    videoCount: number;
}

const TOPIC_STOPWORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'build', 'create', 'course',
    'content', 'day', 'for', 'from', 'get', 'guide', 'has', 'have', 'how', 'in', 'into', 'is',
    'it', 'its', 'lesson', 'make', 'mini', 'my', 'now', 'of', 'on', 'or', 'our', 'pdf', 'real',
    'that', 'the', 'their', 'them', 'they', 'this', 'to', 'toolkit', 'video', 'videos', 'what',
    'with', 'your',
]);

const TOPIC_GENERIC_SINGLE_WORDS = new Set([
    'content', 'course', 'create', 'guide', 'lesson', 'make', 'official', 'real', 'time', 'video',
]);

const TOPIC_GENERIC_LABELS = new Set([
    'general',
    'general content',
    'misc',
    'miscellaneous',
]);

function normalizeWhitespace(value: string | null | undefined, maxLen = 160): string | null {
    if (!value) return null;
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;
    return cleaned.slice(0, maxLen);
}

function pickVideoTitle(
    index: number,
    transcript: TranscriptSelectionRow | undefined,
    videoMeta: VideoMetadataRow | undefined
): string {
    const candidate = normalizeWhitespace(transcript?.title, 160)
        || normalizeWhitespace(videoMeta?.title, 160)
        || normalizeWhitespace(transcript?.description, 160)
        || normalizeWhitespace(videoMeta?.description, 160);

    if (!candidate) return `Video ${index + 1}`;
    if (/^(untitled|null|n\/a)$/i.test(candidate)) return `Video ${index + 1}`;
    return candidate;
}

function tokenizeQuery(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);
}

function titleCaseTopic(topic: string): string {
    return topic
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function buildCreatorNoiseTokens(creator: { handle?: string | null; display_name?: string | null }): Set<string> {
    const source = `${creator.handle || ''} ${creator.display_name || ''}`
        .toLowerCase()
        .replace(/[#@]/g, ' ');

    const tokens = source
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);

    const output = new Set<string>(tokens);

    const compactHandle = (creator.handle || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    if (compactHandle.length >= 4) output.add(compactHandle);

    // Common creator handle suffixes tend to be metadata, not topic signals.
    const suffixes = ['official', 'real', 'tv', 'channel'];
    for (const suffix of suffixes) {
        if (compactHandle.endsWith(suffix)) {
            const stripped = compactHandle.slice(0, compactHandle.length - suffix.length);
            if (stripped.length >= 4) output.add(stripped);
        }
    }

    const displayTokens = (creator.display_name || '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2);
    if (displayTokens.length >= 2) {
        output.add(displayTokens.join(''));
        for (let i = 0; i < displayTokens.length - 1; i++) {
            const pair = `${displayTokens[i]}${displayTokens[i + 1]}`;
            if (pair.length >= 4) output.add(pair);
        }
    }

    return output;
}

function normalizeTopicPhrase(input: string, creatorNoise: Set<string>): string | null {
    const tokens = input
        .toLowerCase()
        .replace(/[#@]/g, ' ')
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) =>
            token.length >= 3
            && !/^\d+$/.test(token)
            && !TOPIC_STOPWORDS.has(token)
            && !creatorNoise.has(token)
        );

    if (tokens.length === 0) return null;
    if (tokens.length === 1 && TOPIC_GENERIC_SINGLE_WORDS.has(tokens[0])) return null;

    return tokens.slice(0, 5).join(' ');
}

function deriveTopicPhrasesFromText(text: string, creatorNoise: Set<string>): string[] {
    const tokens = text
        .toLowerCase()
        .replace(/[#@]/g, ' ')
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) =>
            token.length >= 3
            && !/^\d+$/.test(token)
            && !TOPIC_STOPWORDS.has(token)
            && !creatorNoise.has(token)
        );

    const phrases: string[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const unigram = normalizeTopicPhrase(tokens[i], creatorNoise);
        if (unigram) phrases.push(unigram);

        if (i + 1 < tokens.length) {
            const bigram = normalizeTopicPhrase(`${tokens[i]} ${tokens[i + 1]}`, creatorNoise);
            if (bigram) phrases.push(bigram);
        }

        if (i + 2 < tokens.length) {
            const trigram = normalizeTopicPhrase(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`, creatorNoise);
            if (trigram) phrases.push(trigram);
        }
    }

    return phrases;
}

function buildTopicSuggestions(input: {
    searchResults: Array<{ videoId: string; title: string | null; clipCard: Record<string, unknown> | null; score: number }>;
    clusterRows: TopicClusterRow[];
    creator: { handle?: string | null; display_name?: string | null };
}): TopicSuggestionRow[] {
    const creatorNoise = buildCreatorNoiseTokens(input.creator);
    const searchVideoIds = new Set(input.searchResults.map((result) => result.videoId));
    const topicMap = new Map<string, { score: number; videoIds: Set<string>; inferredCoverage: number }>();

    const pushTopic = (topic: string | null, videoId: string | null, weight: number, inferredCoverage = 0) => {
        if (!topic) return;
        if (TOPIC_GENERIC_LABELS.has(topic)) return;
        const existing = topicMap.get(topic) || { score: 0, videoIds: new Set<string>(), inferredCoverage: 0 };
        existing.score += weight;
        if (videoId) existing.videoIds.add(videoId);
        existing.inferredCoverage = Math.max(existing.inferredCoverage, inferredCoverage);
        topicMap.set(topic, existing);
    };

    for (const cluster of input.clusterRows) {
        const normalized = normalizeTopicPhrase(cluster.label || '', creatorNoise);
        if (!normalized || TOPIC_GENERIC_LABELS.has(normalized)) continue;
        const confidence = Math.max(0, Number(cluster.confidence_score || 0));
        const videoCount = Math.max(0, Number(cluster.video_count || 0));
        const relatedVideoIds = Array.isArray(cluster.video_ids)
            ? cluster.video_ids.filter((videoId) => searchVideoIds.has(videoId))
            : [];
        const coverage = relatedVideoIds.length;
        if (coverage === 0) continue;
        const clusterWeight = 1.4 + confidence + Math.min(videoCount, 8) * 0.12;
        pushTopic(normalized, null, clusterWeight, coverage);
    }

    for (const result of input.searchResults) {
        const card = (result.clipCard || {}) as Record<string, unknown>;
        const tags = Array.isArray(card.topicTags) ? card.topicTags : [];
        for (const tag of tags) {
            const normalized = normalizeTopicPhrase(String(tag || ''), creatorNoise);
            if (!normalized) continue;
            const weight = normalized.split(' ').length >= 2 ? 1.2 : 0.45;
            pushTopic(normalized, result.videoId, weight);
        }

        const phraseSource = [
            result.title || '',
            typeof card.bestHook === 'string' ? card.bestHook : '',
            typeof card.outcome === 'string' ? card.outcome : '',
            typeof card.whoItsFor === 'string' ? card.whoItsFor : '',
        ].join(' ');

        const phrases = deriveTopicPhrasesFromText(phraseSource, creatorNoise);
        for (const phrase of phrases) {
            const lengthBoost = phrase.split(' ').length >= 2 ? 0.35 : 0;
            pushTopic(phrase, result.videoId, 0.7 + lengthBoost);
        }
    }

    const ranked = Array.from(topicMap.entries())
        .map(([topic, data]) => ({
            topic,
            score: data.score + Math.max(data.videoIds.size, data.inferredCoverage) * 1.8,
            videoCount: Math.max(data.videoIds.size, data.inferredCoverage),
        }))
        .filter((entry) => entry.videoCount > 0 && !TOPIC_GENERIC_LABELS.has(entry.topic))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.videoCount !== a.videoCount) return b.videoCount - a.videoCount;
            return b.topic.split(' ').length - a.topic.split(' ').length;
        });

    const dedupedMultiWordStrong: TopicSuggestionRow[] = [];
    const dedupedMultiWordWeak: TopicSuggestionRow[] = [];
    const dedupedSingleWordStrong: TopicSuggestionRow[] = [];
    const dedupedSingleWordWeak: TopicSuggestionRow[] = [];
    const seen = new Set<string>();
    for (const entry of ranked) {
        if (seen.has(entry.topic)) continue;
        seen.add(entry.topic);
        const row = {
            topic: titleCaseTopic(entry.topic),
            videoCount: entry.videoCount,
        };
        const isStrong = entry.videoCount >= 2;
        if (entry.topic.includes(' ')) {
            if (isStrong) dedupedMultiWordStrong.push(row);
            else dedupedMultiWordWeak.push(row);
        } else if (isStrong) {
            dedupedSingleWordStrong.push(row);
        } else {
            dedupedSingleWordWeak.push(row);
        }
    }

    const deduped: TopicSuggestionRow[] = [];
    for (const row of dedupedMultiWordStrong) {
        deduped.push(row);
        if (deduped.length >= 6) break;
    }
    if (deduped.length < 6) {
        for (const row of dedupedMultiWordWeak) {
            deduped.push(row);
            if (deduped.length >= 6) break;
        }
    }
    if (deduped.length < 6) {
        for (const row of dedupedSingleWordStrong) {
            deduped.push(row);
            if (deduped.length >= 6) break;
        }
    }
    if (deduped.length < 6) {
        for (const row of dedupedSingleWordWeak) {
            deduped.push(row);
            if (deduped.length >= 6) break;
        }
    }

    return deduped;
}

function scoreTextMatch(text: string, tokens: string[]): number {
    if (!text || tokens.length === 0) return 0;
    const lower = text.toLowerCase();
    let score = 0;
    for (const token of tokens) {
        if (lower.includes(token)) score += 1;
    }
    return score;
}

function buildTranscriptContext(
    transcript: string | null | undefined,
    chunks: TranscriptChunkRow[],
    queryTokens: string[],
    maxChars = 5000
): string {
    const transcriptText = (transcript || '').trim();
    if (!transcriptText && chunks.length === 0) return '';

    if (chunks.length === 0) {
        return transcriptText.slice(0, maxChars);
    }

    const rankedChunks = chunks
        .map((chunk) => ({
            text: chunk.chunk_text,
            score: scoreTextMatch(chunk.chunk_text, queryTokens),
            idx: chunk.chunk_index,
        }))
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.idx - b.idx;
        })
        .slice(0, 6)
        .sort((a, b) => a.idx - b.idx);

    const chunkJoined = rankedChunks.map((chunk) => chunk.text).join('\n');
    const candidate = chunkJoined.length >= 250 ? chunkJoined : transcriptText;
    return candidate.slice(0, maxChars);
}

function countHtmlWords(html: string): number {
    const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!text) return 0;
    return text.split(' ').filter(Boolean).length;
}

const MAX_GROUNDED_VIDEOS = 8;
const MAX_TRANSCRIPT_CONTEXT_CHARS = 2200;
const MAX_CONTENT_CONTEXT_CHARS_PER_VIDEO = 1800;
const KIMI_PIPELINE_TIMEOUT_MS = 240_000;
const CRITIC_LOOP_TIMEOUT_MS = 70_000;

function buildContentContext(
    contexts: Array<{
        videoId: string;
        title: string;
        views: number;
        topicTags: string[];
        keySteps: string[];
        transcriptContext: string;
    }>,
    maxVideos = MAX_GROUNDED_VIDEOS,
    maxCharsPerVideo = MAX_CONTENT_CONTEXT_CHARS_PER_VIDEO
): string {
    return contexts
        .slice(0, maxVideos)
        .map((row, i) => `--- VIDEO ${i + 1} [ID: ${row.videoId}] ---
TITLE: "${row.title}" (${row.views} views)
${row.topicTags.length > 0 ? `KEY TOPICS: ${row.topicTags.join(', ')}` : 'KEY TOPICS: N/A'}
${row.keySteps.length > 0 ? `KEY STEPS: ${JSON.stringify(row.keySteps)}` : 'KEY STEPS: []'}
TRANSCRIPT EVIDENCE:
${row.transcriptContext.slice(0, maxCharsPerVideo)}
---`)
        .join('\n\n');
}

async function withTimeout<T>(
    work: Promise<T>,
    timeoutMs: number,
    label: string
): Promise<T> {
    let timeoutHandle: NodeJS.Timeout | null = null;

    try {
        return await Promise.race([
            work,
            new Promise<T>((_, reject) => {
                timeoutHandle = setTimeout(() => {
                    reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
                }, timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
    }
}

async function loadCreatorCatalogHtml(
    db: ReturnType<typeof getServiceDb>,
    creatorId: string,
    excludeProductId?: string
): Promise<string[]> {
    try {
        let productsQuery = db
            .from('products')
            .select('active_version_id')
            .eq('creator_id', creatorId)
            .not('active_version_id', 'is', null)
            .limit(40);

        if (excludeProductId) {
            productsQuery = productsQuery.neq('id', excludeProductId);
        }

        const { data: products, error: productsError } = await productsQuery;

        if (productsError || !products || products.length === 0) {
            return [];
        }

        const versionIds = products
            .map((row) => row.active_version_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0)
            .slice(0, 40);

        if (versionIds.length === 0) return [];

        const { data: versions, error: versionsError } = await db
            .from('product_versions')
            .select('generated_html')
            .in('id', versionIds)
            .limit(40);

        if (versionsError || !versions) {
            return [];
        }

        return versions
            .map((row) => row.generated_html)
            .filter((html): html is string => typeof html === 'string' && html.trim().length > 0);
    } catch (error) {
        log.warn('Failed to load creator catalog HTML for distinctiveness gate', {
            error: error instanceof Error ? error.message : 'Unknown error',
            creatorId,
        });
        return [];
    }
}

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    let body: { creatorId: string; message: string; productType?: ProductType; confirmedTopic?: string };
    try {
        body = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
    }

    const { creatorId, message } = body;
    if (!creatorId || !message) {
        return new Response(JSON.stringify({ error: 'creatorId and message required' }), { status: 400 });
    }

    // Enforce creator ownership using the authenticated user context.
    const { data: ownedCreator, error: ownershipError } = await supabase
        .from('creators')
        .select('id')
        .eq('id', creatorId)
        .eq('profile_id', user.id)
        .maybeSingle();

    if (ownershipError) {
        return new Response(JSON.stringify({ error: ownershipError.message }), { status: 500 });
    }

    if (!ownedCreator) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }

    const db = getServiceDb();

    // Verify creator
    const { data: creator } = await db
        .from('creators')
        .select('id, handle, display_name, bio, brand_tokens, voice_profile')
        .eq('id', ownedCreator.id)
        .single();

    if (!creator) {
        return new Response(JSON.stringify({ error: 'Creator not found' }), { status: 404 });
    }

    // Detect product type
    const promptLower = message.toLowerCase();
    let productType: ProductType = body.productType || 'pdf_guide';
    if (!body.productType) {
        if (promptLower.includes('course') || promptLower.includes('lesson')) productType = 'mini_course';
        else if (promptLower.includes('challenge') || promptLower.includes('7-day') || promptLower.includes('7 day')) productType = 'challenge_7day';
        else if (promptLower.includes('checklist') || promptLower.includes('toolkit')) productType = 'checklist_toolkit';
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            let streamClosed = false;
            let requestAborted = false;

            const closeStream = () => {
                if (streamClosed) return;
                streamClosed = true;
                try {
                    controller.close();
                } catch {
                    // The stream controller may already be closed if the client disconnects.
                }
            };

            const send = (event: Record<string, unknown>) => {
                if (streamClosed || requestAborted) return;
                try {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch {
                    streamClosed = true;
                }
            };

            const ensureActiveRequest = () => {
                if (request.signal.aborted || requestAborted) {
                    requestAborted = true;
                    closeStream();
                    throw new Error('Build request was aborted by the client.');
                }
            };

            request.signal.addEventListener('abort', () => {
                requestAborted = true;
                closeStream();
            });

            try {
                // ── Phase 1: Topic Discovery ──
                send({ type: 'status', message: '🔍 Analyzing your content library...', phase: 'analyzing' });

                // Check if prompt is specific or vague
                const isVague = /^(create|make|build)\s+(a|an|my)?\s*(pdf|guide|course|mini|challenge|checklist|toolkit)/i.test(message)
                    && message.split(' ').length < 10;

                // Run hybrid search to discover what content exists
                const searchResults = await hybridSearch(db, creator.id, message, { limit: 100 });

                if (searchResults.length === 0) {
                    send({
                        type: 'error',
                        message: '📭 No content found. Please import your TikTok videos first so the AI can build products from your real content.',
                    });
                    closeStream();
                    return;
                }

                // If prompt is vague, suggest topics
                if (isVague && !body.confirmedTopic) {
                    const { data: clusterRows } = await db
                        .from('content_clusters')
                        .select('label, video_count, confidence_score, total_views, video_ids')
                        .eq('creator_id', creator.id)
                        .order('total_views', { ascending: false })
                        .limit(8);

                    const topTopics = buildTopicSuggestions({
                        searchResults,
                        clusterRows: (clusterRows || []) as TopicClusterRow[],
                        creator: {
                            handle: creator.handle,
                            display_name: creator.display_name,
                        },
                    });

                    if (topTopics.length > 0) {
                        send({
                            type: 'topic_suggestions',
                            message: `I found ${searchResults.length} videos in your library. What topic should this ${productType === 'pdf_guide' ? 'guide' : productType === 'mini_course' ? 'course' : productType === 'challenge_7day' ? 'challenge' : 'toolkit'} focus on?`,
                            topics: topTopics,
                            productType,
                        });
                        closeStream();
                        return;
                    }
                }

                // Use confirmed topic or the original message as the search query
                const topicQuery = body.confirmedTopic || message;

                // ── Phase 2: Retrieve + Rerank ──
                send({ type: 'status', message: '🎯 Finding your best content on this topic...', phase: 'retrieving' });

                // Re-search with specific topic if confirmed
                const topicResults = body.confirmedTopic
                    ? await hybridSearch(db, creator.id, topicQuery, { limit: 100 })
                    : searchResults;

                send({ type: 'status', message: `📊 Found ${topicResults.length} related videos. Selecting the best ones...`, phase: 'reranking' });

                const reranked = await rerankCandidates(
                    topicResults.map((r) => ({
                        videoId: r.videoId,
                        title: r.title,
                        clipCard: r.clipCard,
                    })),
                    topicQuery,
                    productType,
                );

                const selectedVideoIds = reranked.selectedVideos.map((v) => v.videoId);

                if (selectedVideoIds.length === 0) {
                    send({
                        type: 'error',
                        message: '📭 Not enough relevant content found for this topic. Try a different topic or import more videos.',
                    });
                    closeStream();
                    return;
                }

                send({
                    type: 'status',
                    message: `✅ Selected ${selectedVideoIds.length} videos. Extracting content...`,
                    phase: 'extracting',
                });

                const queryTokens = tokenizeQuery(topicQuery);

                const [
                    { data: transcripts },
                    { data: clipCards },
                    { data: videosMeta },
                    { data: transcriptChunks },
                ] = await Promise.all([
                    db
                        .from('video_transcripts')
                        .select('video_id, title, description, transcript_text, views, likes')
                        .in('video_id', selectedVideoIds),
                    db
                        .from('clip_cards')
                        .select('video_id, card_json')
                        .in('video_id', selectedVideoIds),
                    db
                        .from('videos')
                        .select('id, title, description, views, likes')
                        .in('id', selectedVideoIds),
                    db
                        .from('transcript_chunks')
                        .select('video_id, chunk_text, chunk_index')
                        .in('video_id', selectedVideoIds),
                ]);

                const transcriptMap = new Map(
                    ((transcripts || []) as TranscriptSelectionRow[]).map((row) => [row.video_id, row])
                );
                const videoMap = new Map(
                    ((videosMeta || []) as VideoMetadataRow[]).map((row) => [row.id, row])
                );
                const clipCardMap = new Map(
                    ((clipCards || []) as ClipCardRow[]).map((row) => [row.video_id, row.card_json])
                );
                const chunksByVideo = new Map<string, TranscriptChunkRow[]>();
                for (const chunk of (transcriptChunks || []) as TranscriptChunkRow[]) {
                    const existing = chunksByVideo.get(chunk.video_id) || [];
                    existing.push(chunk);
                    chunksByVideo.set(chunk.video_id, existing);
                }

                const selectedContexts = selectedVideoIds
                    .map((videoId, idx) => {
                        const transcript = transcriptMap.get(videoId);
                        const videoMeta = videoMap.get(videoId);
                        const card = (clipCardMap.get(videoId) || null) as Record<string, unknown> | null;
                        const title = pickVideoTitle(idx, transcript, videoMeta);
                        const views = transcript?.views || videoMeta?.views || 0;
                        const topicTags = Array.isArray(card?.topicTags)
                            ? (card?.topicTags as string[]).slice(0, 8)
                            : (Array.isArray(card?.tags) ? (card?.tags as string[]).slice(0, 8) : []);
                        const keySteps = Array.isArray(card?.keySteps)
                            ? (card?.keySteps as string[]).slice(0, 8)
                            : (Array.isArray(card?.keyBullets) ? (card?.keyBullets as string[]).slice(0, 8) : []);
                        const transcriptContext = buildTranscriptContext(
                            transcript?.transcript_text,
                            chunksByVideo.get(videoId) || [],
                            queryTokens,
                            MAX_TRANSCRIPT_CONTEXT_CHARS
                        );

                        if (!transcriptContext) return null;

                        return {
                            videoId,
                            title,
                            views,
                            topicTags,
                            keySteps,
                            transcriptContext,
                        };
                    })
                    .filter((row): row is {
                        videoId: string;
                        title: string;
                        views: number;
                        topicTags: string[];
                        keySteps: string[];
                        transcriptContext: string;
                    } => Boolean(row))
                    .slice(0, MAX_GROUNDED_VIDEOS);

                if (selectedContexts.length === 0) {
                    send({
                        type: 'error',
                        message: '📭 We found videos but could not retrieve enough transcript content. Please retry import to refresh transcripts.',
                    });
                    closeStream();
                    return;
                }

                const sourceEvidenceWordCount = selectedContexts.reduce((sum, row) => {
                    const words = row.transcriptContext.split(/\s+/).filter(Boolean).length;
                    return sum + words;
                }, 0);
                const groundedVideoIds = selectedContexts.map((row) => row.videoId);

                const contentContext = buildContentContext(selectedContexts);

                send({
                    type: 'source_videos',
                    videos: selectedContexts.map((row) => ({
                        title: row.title,
                        views: row.views || 0,
                    })),
                });

                // ── Phase 3: Planning ──
                send({ type: 'status', message: '📝 Planning your product structure...', phase: 'planning' });

                // Generate a smart title
                const titlePrompt = body.confirmedTopic || message;
                const cleanTitle = titlePrompt
                    .replace(/^(create|make|build|generate)\s+(a|an|my|me)?\s*/i, '')
                    .replace(/\s*(from|using|with)\s+my\s+(top\s+)?(videos?|content|tiktoks?).*/i, '')
                    .trim();
                const productTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

                const slug = productTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
                    + '-' + Date.now().toString(36);

                // ── Phase 4: Stream product build ──
                send({ type: 'status', message: '🏗️ Building your product live...', phase: 'building' });
                ensureActiveRequest();

                const catalogHtml = await loadCreatorCatalogHtml(db, creator.id);

                send({
                    type: 'status',
                    message: '🧬 Applying creator DNA and evergreen design canon...',
                    phase: 'planning',
                });

                const voiceProfile = creator.voice_profile as Record<string, unknown> | null;
                const brandTokens = creator.brand_tokens as Record<string, unknown> | null;
                const creatorDna = buildCreatorDNA({
                    handle: creator.handle,
                    displayName: creator.display_name,
                    bio: creator.bio,
                    voiceProfile,
                    brandTokens,
                });
                const creatorDnaContext = buildCreatorDNAContext(creatorDna);

                const designCanon = getEvergreenDesignCanon();
                const creativeDirection = chooseCreativeDirection({
                    productType,
                    creatorId: creator.id,
                    topicQuery,
                    creatorMood: creatorDna.visual.mood,
                    priorProductCount: catalogHtml.length,
                });
                const designCanonContext = buildDesignCanonContext(designCanon, creativeDirection);

                send({
                    type: 'status',
                    message: '📚 Kimi is curating source evidence and planning the product architecture...',
                    phase: 'building',
                });
                ensureActiveRequest();

                const pipelineResult = await withTimeout(
                    runKimiSectionedProductPipeline({
                        productType,
                        productTitle,
                        topicQuery,
                        creatorDisplayName: creator.display_name || creator.handle,
                        creatorHandle: creator.handle,
                        creatorDna,
                        creatorDnaContext,
                        designCanonContext,
                        creativeDirection,
                        selectedContexts,
                    }),
                    KIMI_PIPELINE_TIMEOUT_MS,
                    'Kimi sectioned product pipeline'
                );

                const sourceVideoIdsForBuild = pipelineResult.librarianPack.selectedVideoIds.length > 0
                    ? pipelineResult.librarianPack.selectedVideoIds
                    : groundedVideoIds;
                let fullHtml = postProcessHTML(pipelineResult.html);
                const htmlBuildMode = 'kimi-sectioned';

                send({
                    type: 'status',
                    message: `🧠 Kimi built ${pipelineResult.sectionBlocks.length} section block(s) and composed the final product.`,
                    phase: 'building',
                });

                send({ type: 'html_chunk', html: fullHtml });

                let qualityEvaluation = evaluateProductQuality({
                    html: fullHtml,
                    productType,
                    sourceVideoIds: sourceVideoIdsForBuild,
                    catalogHtml,
                    brandTokens,
                    creatorHandle: creator.handle,
                    qualityWeights: designCanon.qualityWeights,
                });
                let criticIterations = 0;
                let criticModels: string[] = [];
                const stageTimingsMs = {
                    ...pipelineResult.stageTimingsMs,
                } as Record<string, number>;

                if (!qualityEvaluation.overallPassed) {
                    send({
                        type: 'status',
                        message: '🧪 Running evergreen quality critic and revision loop...',
                        phase: 'building',
                    });
                    ensureActiveRequest();

                    try {
                        const criticStart = Date.now();
                        const criticResult = await withTimeout(
                            runEvergreenCriticLoop({
                                html: fullHtml,
                                productType,
                                sourceVideoIds: sourceVideoIdsForBuild,
                                catalogHtml,
                                brandTokens,
                                creatorHandle: creator.handle,
                                creatorDisplayName: creator.display_name || creator.handle,
                                topicQuery,
                                originalRequest: message,
                                creatorDnaContext,
                                designCanonContext,
                                directionId: creativeDirection.id,
                                contentContext,
                                maxIterations: 1,
                                qualityWeights: designCanon.qualityWeights,
                                preferredModel: 'kimi',
                            }),
                            CRITIC_LOOP_TIMEOUT_MS,
                            'Kimi critic loop'
                        );
                        stageTimingsMs.critic = Date.now() - criticStart;

                        fullHtml = criticResult.html;
                        qualityEvaluation = criticResult.evaluation;
                        criticIterations = criticResult.iterationsRun;
                        criticModels = criticResult.modelTrail;
                        send({ type: 'html_chunk', html: fullHtml });
                    } catch (criticError) {
                        stageTimingsMs.critic = stageTimingsMs.critic || CRITIC_LOOP_TIMEOUT_MS;
                        log.warn('Evergreen critic loop failed; keeping best available HTML', {
                            error: criticError instanceof Error ? criticError.message : 'Unknown critic error',
                            creatorId: creator.id,
                            topicQuery,
                        });
                    }
                }

                send({
                    type: 'status',
                    message: `✅ Quality score ${qualityEvaluation.overallScore}/100 (${qualityEvaluation.overallPassed ? 'pass' : 'partial pass'})`,
                    phase: 'building',
                });
                send({ type: 'html_complete', html: fullHtml });

                if (!qualityEvaluation.overallPassed) {
                    send({
                        type: 'error',
                        message: 'Build failed hard quality gates. The draft preview was generated, but nothing was saved.',
                        manualEditRequired: true,
                        qualityScore: qualityEvaluation.overallScore,
                        failingGates: qualityEvaluation.failingGates,
                        candidateHtml: fullHtml,
                    });
                    log.warn('Rejected product build that failed hard quality gates', {
                        creatorId: creator.id,
                        productType,
                        topicQuery,
                        qualityScore: qualityEvaluation.overallScore,
                        failingGates: qualityEvaluation.failingGates,
                    });
                    closeStream();
                    return;
                }

                // Save version
                send({ type: 'status', message: '💾 Saving your product...', phase: 'saving' });
                ensureActiveRequest();

                const { data: product, error: productError } = await db
                    .from('products')
                    .insert({
                        creator_id: creator.id,
                        slug,
                        type: productType,
                        title: productTitle,
                        description: `Created from: "${message}"`,
                        status: 'draft',
                        access_type: 'paid',
                        price_cents: 999,
                        currency: 'usd',
                    })
                    .select('id')
                    .single();

                if (productError || !product) {
                    throw new Error(`Failed to create product: ${productError?.message || 'Unknown error'}`);
                }

                const gateScores = Object.fromEntries(
                    Object.entries(qualityEvaluation.gates).map(([key, gate]) => [
                        key,
                        {
                            score: gate.score,
                            threshold: gate.threshold,
                            passed: gate.passed,
                            notes: gate.notes,
                        },
                    ])
                );

                const { data: version, error: versionError } = await db
                    .from('product_versions')
                    .insert({
                        product_id: product.id,
                        version_number: 1,
                        build_packet: {
                            userPrompt: message,
                            productType,
                            title: productTitle,
                            creatorHandle: creator.handle,
                            videosUsed: sourceVideoIdsForBuild.length,
                            sourceVideoIdsUsed: sourceVideoIdsForBuild,
                            brandTokens,
                            rerankerConfidence: reranked.confidence,
                            coverageGaps: reranked.coverageGaps,
                            sourceEvidenceWordCount,
                            generatedWordCount: countHtmlWords(fullHtml),
                            htmlBuildMode,
                            kimiBuilderIterations: pipelineResult.sectionBlocks.length,
                            kimiBuilderValidationTrail: [],
                            kimiLibrarianSelectedVideoIds: pipelineResult.librarianPack.selectedVideoIds,
                            kimiArchitectSectionIds: pipelineResult.architectPlan.sections.map((section) => section.id),
                            stageTimingsMs,
                            designCanonVersion: designCanon.version,
                            qualityWeights: designCanon.qualityWeights,
                            creatorDisplayName: creator.display_name,
                            creativeDirectionId: creativeDirection.id,
                            creativeDirectionName: creativeDirection.name,
                            qualityOverallScore: qualityEvaluation.overallScore,
                            qualityOverallPassed: qualityEvaluation.overallPassed,
                            qualityFailingGates: qualityEvaluation.failingGates,
                            qualityGateScores: gateScores,
                            maxCatalogSimilarity: qualityEvaluation.maxCatalogSimilarity,
                            catalogCompared: catalogHtml.length,
                            criticIterations,
                            criticModels,
                        },
                        dsl_json: {},
                        generated_html: fullHtml,
                        source_video_ids: sourceVideoIdsForBuild,
                    })
                    .select('id')
                    .single();

                if (versionError || !version) {
                    await db
                        .from('products')
                        .delete()
                        .eq('id', product.id)
                        .is('active_version_id', null);
                    throw new Error(`Failed to save product version: ${versionError?.message || 'Unknown error'}`);
                }

                const { error: activateError } = await db
                        .from('products')
                        .update({ active_version_id: version.id })
                        .eq('id', product.id);

                if (activateError) {
                    await db
                        .from('product_versions')
                        .delete()
                        .eq('id', version.id);
                    await db
                        .from('products')
                        .delete()
                        .eq('id', product.id)
                        .is('active_version_id', null);
                    throw new Error(`Failed to activate product version: ${activateError.message}`);
                }

                send({
                    type: 'complete',
                    productId: product.id,
                    versionId: version?.id,
                    title: productTitle,
                    productType,
                    videosUsed: sourceVideoIdsForBuild.length,
                    qualityScore: qualityEvaluation.overallScore,
                });

                log.info('Product built via streaming', {
                    productId: product.id,
                    title: productTitle,
                    htmlLength: fullHtml.length,
                    videosUsed: sourceVideoIdsForBuild.length,
                    confidence: reranked.confidence,
                    qualityScore: qualityEvaluation.overallScore,
                    qualityPassed: qualityEvaluation.overallPassed,
                    criticIterations,
                });
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Unknown error';
                if (!requestAborted) {
                    log.error('Build stream error', { error: msg });
                    send({ type: 'error', message: msg });
                }
            }

            closeStream();
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
