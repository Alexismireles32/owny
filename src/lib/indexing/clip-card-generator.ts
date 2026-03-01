// src/lib/indexing/clip-card-generator.ts
// PRD §5.2 — Clip card generation using Kimi K2.5

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClipCard } from '@/types/clip-card';
import { z } from 'zod';
import { requestKimiStructuredObject } from '@/lib/ai/kimi-structured';

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

const ClipCardSchema = z.object({
    topicTags: z.array(z.string()).default([]),
    title: z.string().min(1),
    keySteps: z.array(z.string()).default([]),
    whoItsFor: z.string().default(''),
    outcome: z.string().default(''),
    warnings: z.array(z.string()).default([]),
    bestHook: z.string().default(''),
    contentType: z.enum(['tutorial', 'story', 'review', 'tips', 'routine', 'other']),
    estimatedDuration: z.string().default(''),
});

/**
 * Generate a clip card from a transcript + metadata using Kimi
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

    const parsed = await requestKimiStructuredObject({
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: userMessage,
        schema: ClipCardSchema,
        maxTokens: 2048,
    });

    // Validate required fields
    if (!parsed.topicTags || !parsed.title || !parsed.contentType) {
        throw new Error('Invalid clip card: missing required fields');
    }

    return parsed as ClipCard;
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
