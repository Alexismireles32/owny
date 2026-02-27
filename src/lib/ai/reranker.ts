// src/lib/ai/reranker.ts
// PRD §5.4 — Rerank + Select via Claude Sonnet 4.5

import Anthropic from '@anthropic-ai/sdk';

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

function stripMarkdownFences(text: string): string {
    return text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
}

function extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf('{');
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (ch === '\\') {
            escaped = true;
            continue;
        }

        if (ch === '"') {
            inString = !inString;
            continue;
        }

        if (inString) continue;

        if (ch === '{') depth += 1;
        if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                return text.slice(start, i + 1);
            }
        }
    }

    return null;
}

function parseRerankerResponse(text: string): RerankResult {
    const cleaned = stripMarkdownFences(text);

    try {
        return JSON.parse(cleaned) as RerankResult;
    } catch {
        const extracted = extractFirstJsonObject(cleaned);
        if (!extracted) {
            throw new Error('Reranker returned non-JSON response.');
        }

        try {
            return JSON.parse(extracted) as RerankResult;
        } catch {
            throw new Error('Reranker returned malformed JSON.');
        }
    }
}

function normalizeResult(
    raw: RerankResult,
    candidates: ClipCardInput[],
): RerankResult {
    const candidateIds = new Set(candidates.map((c) => c.videoId));
    const deduped = new Set<string>();
    const selectedVideos = Array.isArray(raw.selectedVideos)
        ? raw.selectedVideos
            .map((item) => {
                const videoId = String(item?.videoId || '').trim();
                if (!videoId || !candidateIds.has(videoId) || deduped.has(videoId)) return null;
                deduped.add(videoId);
                return {
                    videoId,
                    reason: String(item?.reason || 'Selected based on topic relevance').slice(0, 300),
                    relevanceScore:
                        typeof item?.relevanceScore === 'number'
                            ? Math.max(0, Math.min(item.relevanceScore, 1))
                            : 0.6,
                };
            })
            .filter((item): item is { videoId: string; reason: string; relevanceScore: number } => Boolean(item))
        : [];

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

    const coverageGaps = Array.isArray(raw.coverageGaps)
        ? raw.coverageGaps
            .map((gap) => String(gap).trim())
            .filter((gap) => gap.length > 0)
            .slice(0, 10)
        : [];

    const confidence: 'high' | 'medium' | 'low' =
        raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low'
            ? raw.confidence
            : selectedVideos.length >= 8
                ? 'medium'
                : 'low';

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

    // Compress clip cards for context window efficiency
    const compressedCards = candidates.slice(0, 60).map((c) => ({
        id: c.videoId,
        title: c.title,
        ...(c.clipCard ? {
            topics: (c.clipCard as Record<string, unknown>).topics,
            keyPoints: (c.clipCard as Record<string, unknown>).keyBullets || (c.clipCard as Record<string, unknown>).key_points,
            tags: (c.clipCard as Record<string, unknown>).tags,
        } : {}),
    }));

    const userMessage = `Product Type: ${productType}
Product Request: ${productRequest}

Available Videos (${compressedCards.length} candidates):
${JSON.stringify(compressedCards, null, 1)}`;

    try {
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: RERANK_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userMessage }],
        });

        const text = response.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('');

        const parsed = parseRerankerResponse(text);
        return normalizeResult(parsed, candidates);
    } catch {
        return buildDeterministicFallback(
            candidates,
            'AI reranker failed; used deterministic fallback selection.',
        );
    }
}
