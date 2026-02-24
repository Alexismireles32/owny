// src/lib/indexing/clip-card-generator.ts
// PRD §5.2 — Clip card generation using Claude (Haiku 4.5 for cost)

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClipCard } from '@/types/clip-card';
import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a Content Indexer. Given a video transcript and metadata, produce a structured
Clip Card as JSON. This card will be used for search and retrieval — make it precise.

OUTPUT FORMAT (JSON only, no markdown fencing):
{
  "topicTags": ["morning routine", "skincare", "productivity"],
  "title": "Best inferred title for this video",
  "keySteps": ["Step 1 description", "Step 2 description"],
  "whoItsFor": "People who want to optimize their morning",
  "outcome": "A structured morning that saves 30 minutes",
  "warnings": ["Consult doctor before starting supplement stack"],
  "bestHook": "The first sentence/hook from the transcript",
  "contentType": "tutorial",
  "estimatedDuration": "30-45 seconds"
}

contentType must be one of: tutorial, story, review, tips, routine, other
Return ONLY valid JSON, no explanation or markdown.`;

function getAnthropicClient(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    return new Anthropic({ apiKey });
}

/**
 * Generate a clip card from a transcript + metadata using Claude
 */
export async function generateClipCard(
    transcript: string,
    metadata: {
        title?: string | null;
        views?: number | null;
        likes?: number | null;
        duration?: number | null;
        createdAt?: string | null;
    }
): Promise<ClipCard> {
    const client = getAnthropicClient();

    const userMessage = JSON.stringify({
        transcript: transcript.slice(0, 8000), // Cap transcript to avoid token limits
        metadata: {
            title: metadata.title || 'Unknown',
            views: metadata.views,
            likes: metadata.likes,
            duration: metadata.duration,
            createdAt: metadata.createdAt,
        },
    });

    const response = await client.messages.create({
        model: 'claude-haiku-4-5-20241022',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
    });

    // Extract text from response
    const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

    // Parse JSON — handle potential markdown fencing
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(jsonStr) as ClipCard;

    // Validate required fields
    if (!parsed.topicTags || !parsed.title || !parsed.contentType) {
        throw new Error('Invalid clip card: missing required fields');
    }

    return parsed;
}

/**
 * Generate and store a clip card for a video
 */
export async function generateAndStoreClipCard(
    supabase: SupabaseClient,
    videoId: string,
    transcript: string,
    metadata: {
        title?: string | null;
        views?: number | null;
        likes?: number | null;
        duration?: number | null;
        createdAt?: string | null;
    }
): Promise<boolean> {
    try {
        const clipCard = await generateClipCard(transcript, metadata);

        // Upsert: delete existing then insert
        await supabase
            .from('clip_cards')
            .delete()
            .eq('video_id', videoId);

        const { error } = await supabase
            .from('clip_cards')
            .insert({
                video_id: videoId,
                card_json: clipCard as unknown as Record<string, unknown>,
            });

        if (error) {
            console.error('Failed to store clip card:', error);
            return false;
        }

        return true;
    } catch (err) {
        console.error('Clip card generation failed:', err);
        return false;
    }
}
