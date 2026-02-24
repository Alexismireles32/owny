// src/lib/indexing/search.ts
// PRD §5.3 — Hybrid retrieval: vector search + full-text search + metadata boost

import type { SupabaseClient } from '@supabase/supabase-js';
import { generateQueryEmbedding } from './embeddings';

interface SearchResult {
    videoId: string;
    title: string | null;
    clipCard: Record<string, unknown> | null;
    score: number;
    source: 'vector' | 'fts' | 'both';
}

/**
 * Hybrid search: combines pgvector cosine similarity + Postgres full-text search.
 * Returns deduplicated, boosted results.
 */
export async function hybridSearch(
    supabase: SupabaseClient,
    creatorId: string,
    query: string,
    options?: { limit?: number }
): Promise<SearchResult[]> {
    const limit = options?.limit ?? 100;

    // Generate query embedding
    const queryEmbedding = await generateQueryEmbedding(query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    // 1. Vector search on clip_cards
    const { data: vectorResults } = await supabase.rpc('match_clip_cards', {
        query_embedding: embeddingStr,
        match_creator_id: creatorId,
        match_count: limit,
    });

    // 2. Full-text search on transcript_chunks
    const { data: ftsResults } = await supabase.rpc('search_transcripts', {
        search_query: query,
        match_creator_id: creatorId,
        match_count: limit,
    });

    // 3. Merge + Deduplicate
    const resultMap = new Map<string, SearchResult>();

    for (const r of (vectorResults || [])) {
        resultMap.set(r.video_id, {
            videoId: r.video_id,
            title: r.title,
            clipCard: r.card_json,
            score: r.similarity || 0,
            source: 'vector',
        });
    }

    for (const r of (ftsResults || [])) {
        const existing = resultMap.get(r.video_id);
        if (existing) {
            // Combine scores — both sources matched
            existing.score = existing.score * 0.6 + (r.rank || 0) * 0.4;
            existing.source = 'both';
        } else {
            resultMap.set(r.video_id, {
                videoId: r.video_id,
                title: r.title,
                clipCard: r.card_json,
                score: r.rank || 0,
                source: 'fts',
            });
        }
    }

    // 4. Metadata boost
    const results = Array.from(resultMap.values());

    // Fetch video metadata for boosting
    const videoIds = results.map((r) => r.videoId);
    if (videoIds.length > 0) {
        const { data: videos } = await supabase
            .from('videos')
            .select('id, views, created_at_source')
            .in('id', videoIds);

        if (videos) {
            const avgViews = videos.reduce((sum, v) => sum + (v.views || 0), 0) / videos.length || 1;

            for (const result of results) {
                const video = videos.find((v) => v.id === result.videoId);
                if (!video) continue;

                // View count boost (normalized)
                const viewBoost = Math.min((video.views || 0) / avgViews, 3) * 0.1;

                // Recency boost (decay over 365 days)
                let recencyBoost = 0;
                if (video.created_at_source) {
                    const ageMs = Date.now() - new Date(video.created_at_source).getTime();
                    const ageDays = ageMs / (1000 * 60 * 60 * 24);
                    recencyBoost = Math.max(0, 1 - ageDays / 365) * 0.1;
                }

                result.score += viewBoost + recencyBoost;
            }
        }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, limit);
}
