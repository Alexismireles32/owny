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
select the 15-25 most relevant videos and rank them by relevance.

RULES:
1. Ensure COVERAGE: selected videos should cover all subtopics needed for the product.
2. Ensure DIVERSITY: avoid selecting 5 videos that all say the same thing.
3. If fewer than 8 videos are relevant, say so — the creator may need to film more content.
4. For each selected video, provide a 1-sentence reason for inclusion.

OUTPUT (JSON only, no markdown fences):
{
  "selectedVideos": [
    { "videoId": "uuid", "reason": "Covers morning hydration protocol", "relevanceScore": 0.95 }
  ],
  "coverageGaps": ["No content about morning meditation found"],
  "confidence": "high" | "medium" | "low"
}`;

/**
 * Rerank search candidates using Claude Sonnet 4.5.
 * Takes the top 60 clip cards and selects 15-25 most relevant.
 */
export async function rerankCandidates(
    candidates: ClipCardInput[],
    productRequest: string,
    productType: string
): Promise<RerankResult> {
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

    const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 4096,
        system: RERANK_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

    // Parse JSON (handle possible markdown fences)
    const jsonStr = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr) as RerankResult;

    // Validate
    if (!result.selectedVideos || !Array.isArray(result.selectedVideos)) {
        throw new Error('Reranker returned invalid JSON: missing selectedVideos');
    }

    if (!result.confidence) {
        result.confidence = 'medium';
    }

    if (!result.coverageGaps) {
        result.coverageGaps = [];
    }

    return result;
}
