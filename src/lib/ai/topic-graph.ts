import { createHash } from 'crypto';
import { z } from 'zod';
import { requestKimiStructuredObject } from '@/lib/ai/kimi-structured';
import type { ProductType } from '@/types/build-packet';

export interface TranscriptIntelligenceRow {
    creator_id: string;
    video_id: string;
    title: string | null;
    description: string | null;
    transcript_text: string;
    views: number;
}

export interface PersistedVideoIntelligenceRow {
    video_id: string;
    transcript_checksum: string;
}

export interface CreatorTopicGraphRow {
    topic_key: string;
    topic_label: string;
    problem_statement: string | null;
    promise_statement: string | null;
    audience_fit: string | null;
    supporting_video_ids: string[] | null;
    evidence_quotes: string[] | null;
    recommended_product_types: string[] | null;
    source_video_count: number | null;
    confidence_score: number | null;
}

interface VideoDigest {
    videoId: string;
    title: string;
    description: string;
    digest: string;
    views: number;
}

interface VideoIntelligenceRecord {
    videoId: string;
    semanticTitle: string;
    abstract: string;
    problems: string[];
    outcomes: string[];
    audiences: string[];
    themes: string[];
    actionSteps: string[];
    quotes: string[];
    recommendedProductTypes: ProductType[];
    productAngle: string;
    confidence: number;
}

interface TopicNodeRecord {
    topicKey: string;
    topicLabel: string;
    problemStatement: string;
    promiseStatement: string;
    audienceFit: string;
    supportingVideoIds: string[];
    evidenceQuotes: string[];
    recommendedProductTypes: ProductType[];
    confidence: number;
}

interface SupabaseSelectResult<T> {
    data: T | null;
    error: { message: string } | null;
}

interface SupabaseEqSelectBuilder<T> {
    eq: (column: string, value: unknown) => Promise<SupabaseSelectResult<T>>;
}

interface SupabaseTableBuilder {
    select: <T = unknown>(columns: string) => SupabaseEqSelectBuilder<T>;
    upsert: (payload: unknown, options?: { onConflict?: string }) => Promise<{ error: { message: string } | null }>;
    delete: () => SupabaseEqSelectBuilder<unknown>;
    insert: (payload: unknown) => Promise<{ error: { message: string } | null }>;
}

interface SupabaseLikeClient {
    from: (table: string) => unknown;
}

function normalizeProductTypes(values: unknown[], max = 4): ProductType[] {
    const allowed = new Set<ProductType>(['pdf_guide', 'mini_course', 'challenge_7day', 'checklist_toolkit']);
    const normalized: ProductType[] = [];
    for (const value of values) {
        if (typeof value !== 'string') continue;
        if (!allowed.has(value as ProductType)) continue;
        if (normalized.includes(value as ProductType)) continue;
        normalized.push(value as ProductType);
        if (normalized.length >= max) break;
    }
    return normalized;
}

const ProductTypeSchema = z.enum(['pdf_guide', 'mini_course', 'challenge_7day', 'checklist_toolkit']);

const VideoIntelligenceBatchSchema = z.object({
    items: z.array(z.object({
        videoId: z.string().min(1),
        semanticTitle: z.string().default(''),
        abstract: z.string().default(''),
        problems: z.array(z.string()).default([]),
        outcomes: z.array(z.string()).default([]),
        audiences: z.array(z.string()).default([]),
        themes: z.array(z.string()).default([]),
        actionSteps: z.array(z.string()).default([]),
        quotes: z.array(z.string()).default([]),
        recommendedProductTypes: z.array(ProductTypeSchema).default([]),
        productAngle: z.string().default(''),
        confidence: z.number().min(0).max(1).default(0.5),
    })).default([]),
});

const TopicGraphSchema = z.object({
    topics: z.array(z.object({
        topicKey: z.string().min(3),
        topicLabel: z.string().min(4),
        problemStatement: z.string().default(''),
        promiseStatement: z.string().default(''),
        audienceFit: z.string().default(''),
        supportingVideoIds: z.array(z.string()).default([]),
        evidenceQuotes: z.array(z.string()).default([]),
        recommendedProductTypes: z.array(ProductTypeSchema).default([]),
        confidence: z.number().min(0).max(1).default(0.5),
    })).default([]),
});

function batchArray<T>(items: T[], size: number): T[][] {
    const batches: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        batches.push(items.slice(index, index + size));
    }
    return batches;
}

function normalizeWhitespace(value: string | null | undefined, maxLen = 220): string {
    if (!value) return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 64);
}

function normalizeArray(values: string[], max = 6): string[] {
    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const value of values) {
        const cleaned = normalizeWhitespace(value, 180);
        const key = cleaned.toLowerCase();
        if (!cleaned || seen.has(key)) continue;
        seen.add(key);
        normalized.push(cleaned);
        if (normalized.length >= max) break;
    }

    return normalized;
}

function splitSentences(transcript: string): string[] {
    return transcript
        .replace(/\s+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length >= 36 && sentence.length <= 240);
}

function scoreSentence(sentence: string): number {
    const lower = sentence.toLowerCase();
    let score = 0;
    if (/\bhow to\b|\bwhen you\b|\bif you\b|\bso that\b|\blet go\b|\bremember\b|\bpractice\b|\bnotice\b/i.test(lower)) {
        score += 2.4;
    }
    if (/\byou\b|\byour\b|\bwe\b|\bour\b/i.test(lower)) score += 1;
    if (/\bfear\b|\banxiety\b|\baging\b|\blove\b|\bpain\b|\bpresence\b|\buncertainty\b|\bgrief\b|\brelationship\b|\bmind\b/i.test(lower)) {
        score += 1.6;
    }
    if (sentence.length >= 70 && sentence.length <= 180) score += 1.2;
    return score;
}

function buildTranscriptDigest(row: TranscriptIntelligenceRow): VideoDigest {
    const intro = normalizeWhitespace(row.transcript_text, 420);
    const highlights = splitSentences(row.transcript_text)
        .sort((a, b) => scoreSentence(b) - scoreSentence(a))
        .slice(0, 4);

    return {
        videoId: row.video_id,
        title: normalizeWhitespace(row.title, 140) || normalizeWhitespace(row.description, 140) || 'Untitled video',
        description: normalizeWhitespace(row.description, 220),
        digest: [intro, ...highlights].filter(Boolean).join(' | ').slice(0, 2200),
        views: row.views || 0,
    };
}

function buildTranscriptChecksum(row: TranscriptIntelligenceRow): string {
    return createHash('sha1')
        .update(`${row.title || ''}\n${row.description || ''}\n${row.transcript_text}`)
        .digest('hex');
}

function fallbackVideoIntelligence(row: VideoDigest): VideoIntelligenceRecord {
    return {
        videoId: row.videoId,
        semanticTitle: row.title,
        abstract: row.description || row.digest.slice(0, 180),
        problems: [],
        outcomes: [],
        audiences: [],
        themes: [],
        actionSteps: [],
        quotes: [],
        recommendedProductTypes: ['pdf_guide'],
        productAngle: row.title,
        confidence: 0.35,
    };
}

async function generateVideoIntelligenceBatch(batch: VideoDigest[]): Promise<VideoIntelligenceRecord[]> {
    const response = await requestKimiStructuredObject({
        systemPrompt: `You are the Owny Transcript Intelligence Compiler.
Return only a JSON object.

For each creator video, extract durable semantic metadata that can be reused later for topic discovery and product generation.

Rules:
- Stay grounded in the provided transcript digest.
- Prefer product-worthy framing: problems, transformations, practices, audience, and core themes.
- Avoid broad generic labels when a more specific angle is supported.
- Keep quotes short and specific.
- recommendedProductTypes must only contain: pdf_guide, mini_course, challenge_7day, checklist_toolkit.`,
        userPrompt: `VIDEOS:
${batch.map((row) => `VIDEO ${row.videoId}
title: ${row.title}
description: ${row.description || 'n/a'}
views: ${row.views}
transcript digest: ${row.digest}`).join('\n\n')}

Return a JSON object:
{
  "items": [
    {
      "videoId": "string",
      "semanticTitle": "string",
      "abstract": "string",
      "problems": ["string"],
      "outcomes": ["string"],
      "audiences": ["string"],
      "themes": ["string"],
      "actionSteps": ["string"],
      "quotes": ["string"],
      "recommendedProductTypes": ["pdf_guide"],
      "productAngle": "string",
      "confidence": 0.8
    }
  ]
}`,
        schema: VideoIntelligenceBatchSchema,
        maxTokens: 3200,
        thinking: 'enabled',
    });

    const batchIds = new Set(batch.map((row) => row.videoId));
    return response.items
        .filter((item) => batchIds.has(item.videoId))
        .map((item) => ({
            videoId: item.videoId,
            semanticTitle: normalizeWhitespace(item.semanticTitle, 140),
            abstract: normalizeWhitespace(item.abstract, 260),
            problems: normalizeArray(item.problems),
            outcomes: normalizeArray(item.outcomes),
            audiences: normalizeArray(item.audiences, 4),
            themes: normalizeArray(item.themes),
            actionSteps: normalizeArray(item.actionSteps, 5),
            quotes: normalizeArray(item.quotes, 4),
            recommendedProductTypes: item.recommendedProductTypes.length > 0 ? item.recommendedProductTypes : ['pdf_guide'],
            productAngle: normalizeWhitespace(item.productAngle, 180),
            confidence: item.confidence,
        }));
}

function fallbackTopicNodes(input: {
    creatorId: string;
    intelligenceRows: Array<Record<string, unknown>>;
}): TopicNodeRecord[] {
    const buckets = new Map<string, TopicNodeRecord>();

    for (const row of input.intelligenceRows) {
        const problems = Array.isArray(row.problem_statements) ? row.problem_statements as string[] : [];
        const outcomes = Array.isArray(row.outcome_statements) ? row.outcome_statements as string[] : [];
        const themes = Array.isArray(row.theme_phrases) ? row.theme_phrases as string[] : [];
        const quotes = Array.isArray(row.evidence_quotes) ? row.evidence_quotes as string[] : [];
        const productTypes = Array.isArray(row.recommended_product_types) ? row.recommended_product_types as ProductType[] : ['pdf_guide'];
        const videoId = typeof row.video_id === 'string' ? row.video_id : null;

        const label = problems[0] || outcomes[0] || themes[0];
        if (!label || !videoId) continue;

        const key = slugify(label);
        const existing: TopicNodeRecord = buckets.get(key) || {
            topicKey: key,
            topicLabel: label,
            problemStatement: problems[0] || label,
            promiseStatement: outcomes[0] || label,
            audienceFit: (Array.isArray(row.audience_signals) ? row.audience_signals[0] : '') || '',
            supportingVideoIds: [],
            evidenceQuotes: [],
            recommendedProductTypes: [],
            confidence: 0.45,
        };

        if (!existing.supportingVideoIds.includes(videoId)) {
            existing.supportingVideoIds.push(videoId);
        }
        existing.evidenceQuotes = normalizeArray([...existing.evidenceQuotes, ...quotes], 3);
        existing.recommendedProductTypes = normalizeProductTypes(
            [...existing.recommendedProductTypes, ...productTypes],
            4
        );
        buckets.set(key, existing);
    }

    return [...buckets.values()]
        .filter((node) => node.supportingVideoIds.length > 0)
        .sort((a, b) => b.supportingVideoIds.length - a.supportingVideoIds.length)
        .slice(0, 6);
}

async function generateTopicGraphFromIntelligence(input: {
    creatorDisplayName: string;
    intelligenceRows: Array<Record<string, unknown>>;
}): Promise<TopicNodeRecord[]> {
    const response = await requestKimiStructuredObject({
        systemPrompt: `You are the Owny Creator Topic Graph Architect.
Return only a JSON object.

Turn reusable per-video transcript intelligence into product-worthy creator topic nodes.

Rules:
- Each topic node must represent a specific problem or transformation angle, not a generic genre.
- Prefer labels a customer would actually choose.
- supportingVideoIds must reference the supplied videos only.
- Keep 4-8 strong topic nodes, not dozens of weak ones.`,
        userPrompt: `CREATOR: ${input.creatorDisplayName}

VIDEO INTELLIGENCE:
${input.intelligenceRows.map((row) => JSON.stringify({
    videoId: row.video_id,
    semanticTitle: row.semantic_title,
    abstract: row.semantic_abstract,
    problems: row.problem_statements,
    outcomes: row.outcome_statements,
    audiences: row.audience_signals,
    themes: row.theme_phrases,
    quotes: row.evidence_quotes,
    recommendedProductTypes: row.recommended_product_types,
    productAngle: row.product_angle,
    confidence: row.confidence_score,
})).join('\n')}

Return:
{
  "topics": [
    {
      "topicKey": "string",
      "topicLabel": "string",
      "problemStatement": "string",
      "promiseStatement": "string",
      "audienceFit": "string",
      "supportingVideoIds": ["video-id"],
      "evidenceQuotes": ["quote"],
      "recommendedProductTypes": ["pdf_guide"],
      "confidence": 0.8
    }
  ]
}`,
        schema: TopicGraphSchema,
        maxTokens: 2600,
        thinking: 'enabled',
    });

    const allowedVideoIds = new Set(input.intelligenceRows.map((row) => String(row.video_id)));
    return response.topics
        .map((topic) => ({
            topicKey: slugify(topic.topicKey || topic.topicLabel),
            topicLabel: normalizeWhitespace(topic.topicLabel, 120),
            problemStatement: normalizeWhitespace(topic.problemStatement, 180),
            promiseStatement: normalizeWhitespace(topic.promiseStatement, 180),
            audienceFit: normalizeWhitespace(topic.audienceFit, 160),
            supportingVideoIds: topic.supportingVideoIds.filter((id) => allowedVideoIds.has(id)),
            evidenceQuotes: normalizeArray(topic.evidenceQuotes, 4),
            recommendedProductTypes: normalizeProductTypes(
                topic.recommendedProductTypes.length > 0 ? topic.recommendedProductTypes : ['pdf_guide']
            ),
            confidence: topic.confidence,
        }))
        .filter((topic) => topic.topicKey && topic.topicLabel && topic.supportingVideoIds.length > 0)
        .slice(0, 8);
}

export async function syncVideoIntelligence(input: {
    supabase: SupabaseLikeClient;
    creatorId: string;
    transcriptRows: TranscriptIntelligenceRow[];
}): Promise<number> {
    if (input.transcriptRows.length === 0) return 0;

    const videoIntelligenceTable = input.supabase.from('video_intelligence') as SupabaseTableBuilder;
    const { data: existingRows, error: existingError } = await videoIntelligenceTable
        .select<PersistedVideoIntelligenceRow[]>('video_id, transcript_checksum')
        .eq('creator_id', input.creatorId);

    if (existingError) {
        throw new Error(`Failed to load existing video intelligence: ${existingError.message}`);
    }

    const existingByVideoId = new Map((existingRows || []).map((row) => [row.video_id, row.transcript_checksum]));
    const staleRows = input.transcriptRows.filter((row) => existingByVideoId.get(row.video_id) !== buildTranscriptChecksum(row));

    if (staleRows.length === 0) return 0;

    const digests = staleRows.map(buildTranscriptDigest);
    const upsertPayload: Record<string, unknown>[] = [];

    for (const batch of batchArray(digests, 6)) {
        let generated: VideoIntelligenceRecord[] = [];
        try {
            generated = await generateVideoIntelligenceBatch(batch);
        } catch {
            generated = batch.map(fallbackVideoIntelligence);
        }

        const generatedById = new Map(generated.map((row) => [row.videoId, row]));
        for (const digest of batch) {
            const sourceRow = staleRows.find((row) => row.video_id === digest.videoId);
            if (!sourceRow) continue;
            const intelligence = generatedById.get(digest.videoId) || fallbackVideoIntelligence(digest);
            upsertPayload.push({
                creator_id: input.creatorId,
                video_id: digest.videoId,
                transcript_checksum: buildTranscriptChecksum(sourceRow),
                semantic_title: intelligence.semanticTitle || digest.title,
                semantic_abstract: intelligence.abstract || digest.description || digest.digest.slice(0, 220),
                problem_statements: intelligence.problems,
                outcome_statements: intelligence.outcomes,
                audience_signals: intelligence.audiences,
                theme_phrases: intelligence.themes,
                action_steps: intelligence.actionSteps,
                evidence_quotes: intelligence.quotes,
                recommended_product_types: intelligence.recommendedProductTypes,
                product_angle: intelligence.productAngle || intelligence.semanticTitle || digest.title,
                confidence_score: intelligence.confidence,
                metadata: {
                    sourceTitle: digest.title,
                    sourceDescription: digest.description,
                    sourceViews: digest.views,
                },
                updated_at: new Date().toISOString(),
            });
        }
    }

    if (upsertPayload.length === 0) return 0;

    const { error: upsertError } = await videoIntelligenceTable.upsert(upsertPayload, { onConflict: 'creator_id,video_id' });

    if (upsertError) {
        throw new Error(`Failed to upsert video intelligence: ${upsertError.message}`);
    }

    return upsertPayload.length;
}

export async function syncCreatorTopicGraph(input: {
    supabase: SupabaseLikeClient;
    creatorId: string;
    creatorDisplayName: string;
}): Promise<number> {
    const videoIntelligenceTable = input.supabase.from('video_intelligence') as SupabaseTableBuilder;
    const { data: intelligenceRows, error: intelligenceError } = await videoIntelligenceTable
        .select<Array<Record<string, unknown>>>('video_id, semantic_title, semantic_abstract, problem_statements, outcome_statements, audience_signals, theme_phrases, action_steps, evidence_quotes, recommended_product_types, product_angle, confidence_score')
        .eq('creator_id', input.creatorId);

    if (intelligenceError) {
        throw new Error(`Failed to load video intelligence for topic graph: ${intelligenceError.message}`);
    }

    const rows = intelligenceRows || [];
    if (rows.length === 0) return 0;

    let topics: TopicNodeRecord[] = [];
    try {
        topics = await generateTopicGraphFromIntelligence({
            creatorDisplayName: input.creatorDisplayName,
            intelligenceRows: rows,
        });
    } catch {
        topics = fallbackTopicNodes({
            creatorId: input.creatorId,
            intelligenceRows: rows,
        });
    }

    if (topics.length === 0) return 0;

    const topicGraphTable = input.supabase.from('creator_topic_graph') as SupabaseTableBuilder;
    await topicGraphTable.delete().eq('creator_id', input.creatorId);

    const payload = topics.map((topic) => ({
        creator_id: input.creatorId,
        topic_key: topic.topicKey,
        topic_label: topic.topicLabel,
        problem_statement: topic.problemStatement,
        promise_statement: topic.promiseStatement,
        audience_fit: topic.audienceFit,
        supporting_video_ids: topic.supportingVideoIds,
        supporting_chunk_refs: [],
        evidence_quotes: topic.evidenceQuotes,
        recommended_product_types: topic.recommendedProductTypes,
        source_video_count: topic.supportingVideoIds.length,
        confidence_score: topic.confidence,
        metadata: {},
        updated_at: new Date().toISOString(),
    }));

    const { error: insertError } = await topicGraphTable.insert(payload);

    if (insertError) {
        throw new Error(`Failed to persist creator topic graph: ${insertError.message}`);
    }

    return payload.length;
}

export function rankTopicSuggestionsFromGraph(input: {
    topics: CreatorTopicGraphRow[];
    productType: ProductType;
}): Array<{
    topic: string;
    videoCount: number;
    problem?: string;
    promise?: string;
    supportingVideoIds?: string[];
}> {
    return [...input.topics]
        .map((topic) => {
            const productTypes = Array.isArray(topic.recommended_product_types) ? topic.recommended_product_types : [];
            const productTypeBoost = productTypes.includes(input.productType) ? 1.4 : 0;
            const sourceCount = Math.max(0, topic.source_video_count || topic.supporting_video_ids?.length || 0);
            const confidence = Math.max(0, topic.confidence_score || 0);
            const specificityBoost = topic.topic_label.split(' ').length >= 3 ? 0.5 : 0;
            return {
                topic: topic.topic_label,
                videoCount: sourceCount,
                problem: topic.problem_statement || undefined,
                promise: topic.promise_statement || undefined,
                supportingVideoIds: topic.supporting_video_ids || [],
                score: sourceCount * 1.6 + confidence * 2 + productTypeBoost + specificityBoost,
            };
        })
        .filter((topic) => topic.videoCount > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map((entry) => ({
            topic: entry.topic,
            videoCount: entry.videoCount,
            problem: entry.problem,
            promise: entry.promise,
            supportingVideoIds: entry.supportingVideoIds,
        }));
}

export async function loadRankedTopicSuggestionsFromGraph(input: {
    supabase: SupabaseLikeClient;
    creatorId: string;
    productType: ProductType;
}): Promise<Array<{
    topic: string;
    videoCount: number;
    problem?: string;
    promise?: string;
    supportingVideoIds?: string[];
}>> {
    const topicGraphTable = input.supabase.from('creator_topic_graph') as SupabaseTableBuilder;
    const { data, error } = await topicGraphTable
        .select<CreatorTopicGraphRow[]>('topic_key, topic_label, problem_statement, promise_statement, audience_fit, supporting_video_ids, evidence_quotes, recommended_product_types, source_video_count, confidence_score')
        .eq('creator_id', input.creatorId);

    if (error) {
        throw new Error(`Failed to load creator topic graph: ${error.message}`);
    }

    return rankTopicSuggestionsFromGraph({
        topics: data || [],
        productType: input.productType,
    });
}
