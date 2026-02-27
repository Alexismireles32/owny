// src/lib/ai/reranker.ts
// PRD §5.4 — Rerank + Select via Claude Sonnet 4.5

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

interface ClipCardInput {
    videoId: string;
    title: string | null;
    clipCard: Record<string, unknown> | null;
}

interface RerankResult {
    selectedVideos: {
        videoId: string;
        reason: string;
        relevanceScore: number;
    }[];
    coverageGaps: string[];
    confidence: 'high' | 'medium' | 'low';
}

const SelectedVideoSchema = z.object({
    videoId: z.string().min(1),
    reason: z.string().default('Selected based on topic relevance'),
    relevanceScore: z.number().min(0).max(1).default(0.6),
});

const RerankResultSchema = z.object({
    selectedVideos: z.array(SelectedVideoSchema).default([]),
    coverageGaps: z.array(z.string()).default([]),
    confidence: z.enum(['high', 'medium', 'low']).default('medium'),
});

type ParsedRerankResult = z.infer<typeof RerankResultSchema>;

const RERANK_SYSTEM_PROMPT = `You are a Content Curator. Given a product request and a list of video clip cards,
select up to 25 most relevant videos and rank them by relevance.

RULES:
1. Ensure COVERAGE: selected videos should cover all subtopics needed for the product.
2. Ensure DIVERSITY: avoid selecting 5 videos that all say the same thing.
3. If fewer than 8 videos are relevant, say so — the creator may need to film more content.
4. For each selected video, provide a 1-sentence reason for inclusion.
5. If there are fewer than 15 candidates, return all relevant candidates.

OUTPUT (JSON only, no markdown fences):
{
  "selectedVideos": [
    { "videoId": "uuid", "reason": "Covers morning hydration protocol", "relevanceScore": 0.95 }
  ],
  "coverageGaps": ["No content about morning meditation found"],
  "confidence": "high" | "medium" | "low"
}`;

function normalizeString(input: unknown): string | null {
    if (typeof input !== 'string') return null;
    const cleaned = input.trim().replace(/\s+/g, ' ');
    return cleaned.length > 0 ? cleaned : null;
}

function readStringArray(source: Record<string, unknown>, keys: string[]): string[] {
    for (const key of keys) {
        const value = source[key];
        if (!Array.isArray(value)) continue;

        const normalized = value
            .map((item) => normalizeString(item))
            .filter((item): item is string => Boolean(item))
            .slice(0, 8);

        if (normalized.length > 0) {
            return normalized;
        }
    }

    return [];
}

function normalizeResult(
    raw: ParsedRerankResult,
    candidates: ClipCardInput[],
): RerankResult {
    const candidateIds = new Set(candidates.map((c) => c.videoId));
    const deduped = new Set<string>();
    const selectedVideos = raw.selectedVideos
        .map((item) => {
            const videoId = item.videoId.trim();
            if (!videoId || !candidateIds.has(videoId) || deduped.has(videoId)) return null;
            deduped.add(videoId);
            return {
                videoId,
                reason: item.reason.slice(0, 300),
                relevanceScore: Math.max(0, Math.min(item.relevanceScore, 1)),
            };
        })
        .filter((item): item is { videoId: string; reason: string; relevanceScore: number } => Boolean(item));

    if (selectedVideos.length === 0) {
        const fallback = candidates.slice(0, Math.min(candidates.length, 8)).map((c, idx) => ({
            videoId: c.videoId,
            reason: 'Fallback selection from top retrieved content.',
            relevanceScore: Math.max(0.2, 0.8 - idx * 0.05),
        }));

        return {
            selectedVideos: fallback,
            coverageGaps: ['AI reranker response was malformed; used deterministic fallback selection.'],
            confidence: fallback.length >= 8 ? 'medium' : 'low',
        };
    }

    const coverageGaps = raw.coverageGaps
        .map((gap) => String(gap).trim())
        .filter((gap) => gap.length > 0)
        .slice(0, 10);

    const confidence: 'high' | 'medium' | 'low' = raw.confidence;

    return {
        selectedVideos,
        coverageGaps,
        confidence,
    };
}

function buildDeterministicFallback(
    candidates: ClipCardInput[],
    reason: string
): RerankResult {
    const fallback = candidates.slice(0, Math.min(candidates.length, 8)).map((c, idx) => ({
        videoId: c.videoId,
        reason: 'Fallback selection from top retrieved content.',
        relevanceScore: Math.max(0.2, 0.8 - idx * 0.05),
    }));

    return {
        selectedVideos: fallback,
        coverageGaps: [reason],
        confidence: fallback.length >= 8 ? 'medium' : 'low',
    };
}

/**
 * Rerank search candidates using Claude Sonnet 4.5.
 * Takes the top 60 clip cards and selects 15-25 most relevant.
 */
export async function rerankCandidates(
    candidates: ClipCardInput[],
    productRequest: string,
    productType: string
): Promise<RerankResult> {
    if (candidates.length === 0) {
        return {
            selectedVideos: [],
            coverageGaps: ['No candidate videos available for reranking.'],
            confidence: 'low',
        };
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    // Compress cards with normalized field aliases for stable reranking quality.
    const compressedCards = candidates.slice(0, 60).map((c) => {
        const card = (c.clipCard || {}) as Record<string, unknown>;
        const topics = readStringArray(card, ['topicTags', 'topics', 'tags']);
        const keyPoints = readStringArray(card, ['keySteps', 'keyBullets', 'key_points']);

        return {
            id: c.videoId,
            title: c.title,
            topics,
            keyPoints,
            tags: readStringArray(card, ['tags', 'topicTags']),
            whoItsFor: normalizeString(card.whoItsFor),
            outcome: normalizeString(card.outcome),
            bestHook: normalizeString(card.bestHook),
            contentType: normalizeString(card.contentType),
        };
    });

    const userMessage = `Product Type: ${productType}
Product Request: ${productRequest}

Available Videos (${compressedCards.length} candidates):
${JSON.stringify(compressedCards, null, 1)}`;

    try {
        const response = await anthropic.messages.parse({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: RERANK_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMessage }],
            output_config: {
                format: zodOutputFormat(RerankResultSchema),
            },
        });

        const parsed = response.parsed_output;
        if (!parsed) {
            return buildDeterministicFallback(
                candidates,
                'AI reranker returned empty structured output; used deterministic fallback selection.',
            );
        }

        return normalizeResult(parsed, candidates);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return buildDeterministicFallback(
            candidates,
            `AI reranker failed (${message.slice(0, 180)}); used deterministic fallback selection.`,
        );
    }
}
