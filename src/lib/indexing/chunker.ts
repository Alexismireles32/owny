// src/lib/indexing/chunker.ts
// Transcript chunking: ~250 tokens per chunk, 50 token overlap
// PRD §5.2 — chunks stored in transcript_chunks table

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Rough token estimation: ~4 chars per token (English average)
 */
function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Split text into word-boundary chunks of approximately `targetTokens`
 * with `overlapTokens` of overlap between consecutive chunks.
 */
export function chunkText(
    text: string,
    targetTokens = 250,
    overlapTokens = 50
): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const targetChars = targetTokens * 4;
    const overlapChars = overlapTokens * 4;

    const chunks: string[] = [];
    let startIdx = 0;

    while (startIdx < words.length) {
        let charCount = 0;
        let endIdx = startIdx;

        // Build chunk up to target size
        while (endIdx < words.length && charCount < targetChars) {
            charCount += words[endIdx].length + 1; // +1 for space
            endIdx++;
        }

        const chunk = words.slice(startIdx, endIdx).join(' ');
        if (chunk.trim()) {
            chunks.push(chunk.trim());
        }

        // Move start forward by (target - overlap) chars worth of words
        const advanceChars = targetChars - overlapChars;
        let advancedChars = 0;
        let newStart = startIdx;
        while (newStart < endIdx && advancedChars < advanceChars) {
            advancedChars += words[newStart].length + 1;
            newStart++;
        }

        // Avoid infinite loop
        if (newStart <= startIdx) newStart = startIdx + 1;
        startIdx = newStart;
    }

    return chunks;
}

/**
 * Chunk a transcript and store in transcript_chunks table.
 * Returns the number of chunks created.
 */
export async function chunkAndStoreTranscript(
    supabase: SupabaseClient,
    videoId: string,
    transcriptText: string
): Promise<number> {
    const chunks = chunkText(transcriptText);

    if (chunks.length === 0) return 0;

    // Delete existing chunks for this video (idempotent re-runs)
    await supabase
        .from('transcript_chunks')
        .delete()
        .eq('video_id', videoId);

    const rows = chunks.map((text, index) => ({
        video_id: videoId,
        chunk_index: index,
        chunk_text: text,
    }));

    const { error } = await supabase
        .from('transcript_chunks')
        .insert(rows);

    if (error) {
        console.error('Failed to store chunks:', error);
        return 0;
    }

    return chunks.length;
}

/**
 * Get token count stats for debugging
 */
export function getChunkStats(chunks: string[]): {
    count: number;
    avgTokens: number;
    minTokens: number;
    maxTokens: number;
} {
    if (chunks.length === 0) return { count: 0, avgTokens: 0, minTokens: 0, maxTokens: 0 };

    const tokenCounts = chunks.map(estimateTokens);
    return {
        count: chunks.length,
        avgTokens: Math.round(tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length),
        minTokens: Math.min(...tokenCounts),
        maxTokens: Math.max(...tokenCounts),
    };
}
