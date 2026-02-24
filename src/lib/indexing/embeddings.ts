// src/lib/indexing/embeddings.ts
// PRD §5.2 — Embedding generation using OpenAI text-embedding-3-small (1536d)

import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

function getOpenAIClient(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
    return new OpenAI({ apiKey });
}

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;
const MAX_BATCH_SIZE = 50; // OpenAI supports batches

/**
 * Generate embeddings for an array of text strings.
 * Returns array of number arrays, one per input.
 */
export async function generateEmbeddings(
    texts: string[]
): Promise<number[][]> {
    if (texts.length === 0) return [];

    const client = getOpenAIClient();
    const embeddings: number[][] = [];

    // Process in batches
    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
        const batch = texts.slice(i, i + MAX_BATCH_SIZE);

        const response = await client.embeddings.create({
            model: EMBEDDING_MODEL,
            input: batch,
            dimensions: EMBEDDING_DIMS,
        });

        for (const item of response.data) {
            embeddings.push(item.embedding);
        }
    }

    return embeddings;
}

/**
 * Generate a single embedding for a query string (used for search).
 */
export async function generateQueryEmbedding(query: string): Promise<number[]> {
    const [embedding] = await generateEmbeddings([query]);
    return embedding;
}

/**
 * Generate and store embeddings for transcript chunks of a video
 */
export async function embedTranscriptChunks(
    supabase: SupabaseClient,
    videoId: string
): Promise<number> {
    // Fetch chunks that don't have embeddings yet
    const { data: chunks, error } = await supabase
        .from('transcript_chunks')
        .select('id, chunk_text')
        .eq('video_id', videoId)
        .is('embedding', null)
        .order('chunk_index');

    if (error || !chunks?.length) return 0;

    const texts = chunks.map((c) => c.chunk_text);
    const embeddings = await generateEmbeddings(texts);

    let updated = 0;
    for (let i = 0; i < chunks.length; i++) {
        // pgvector expects the embedding as a string: '[0.1,0.2,...]'
        const embeddingStr = `[${embeddings[i].join(',')}]`;

        const { error: updateError } = await supabase
            .from('transcript_chunks')
            .update({ embedding: embeddingStr })
            .eq('id', chunks[i].id);

        if (!updateError) updated++;
    }

    return updated;
}

/**
 * Generate and store embedding for a clip card
 */
export async function embedClipCard(
    supabase: SupabaseClient,
    videoId: string
): Promise<boolean> {
    // Fetch the clip card
    const { data: clipCard, error } = await supabase
        .from('clip_cards')
        .select('id, card_json')
        .eq('video_id', videoId)
        .single();

    if (error || !clipCard) return false;

    // Build embedding text from clip card fields
    const card = clipCard.card_json as Record<string, unknown>;
    const embeddingText = [
        card.title || '',
        ...(Array.isArray(card.topicTags) ? card.topicTags : []),
        ...(Array.isArray(card.keySteps) ? card.keySteps : []),
        card.whoItsFor || '',
        card.outcome || '',
        card.bestHook || '',
    ].join(' ');

    const [embedding] = await generateEmbeddings([embeddingText]);
    const embeddingStr = `[${embedding.join(',')}]`;

    const { error: updateError } = await supabase
        .from('clip_cards')
        .update({ embedding: embeddingStr })
        .eq('id', clipCard.id);

    return !updateError;
}
