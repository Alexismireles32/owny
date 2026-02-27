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

interface TranscriptFallbackRow {
    video_id: string;
    title: string | null;
    description: string | null;
    transcript_text: string;
}

function tokenizeQuery(query: string): string[] {
    return query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);
}

function deriveFallbackTags(row: TranscriptFallbackRow): string[] {
    const source = `${row.title || ''} ${row.description || ''}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 4);

    const unique: string[] = [];
    for (const token of source) {
        if (unique.includes(token)) continue;
        unique.push(token);
        if (unique.length >= 6) break;
    }
    return unique;
}

function scoreTranscriptMatch(
    row: TranscriptFallbackRow,
    tokens: string[]
): number {
    if (tokens.length === 0) return 0;

    const title = (row.title || '').toLowerCase();
    const description = (row.description || '').toLowerCase();
    const transcript = (row.transcript_text || '').toLowerCase();
    const snippet = transcript.slice(0, 3000);

    let score = 0;
    for (const token of tokens) {
        if (title.includes(token)) score += 2.0;
        if (description.includes(token)) score += 1.0;
        if (snippet.includes(token)) score += 0.5;
    }

    return score / tokens.length;
}

async function fallbackTranscriptSearch(
    supabase: SupabaseClient,
    creatorId: string,
    query: string,
    limit: number
): Promise<SearchResult[]> {
    const { data, error } = await supabase
        .from('video_transcripts')
        .select('video_id, title, description, transcript_text')
        .eq('creator_id', creatorId)
        .limit(Math.max(limit * 4, 200));

    if (error || !data || data.length === 0) {
        return [];
    }

    const rows = data as TranscriptFallbackRow[];
    const tokens = tokenizeQuery(query);
    const scored: SearchResult[] = [];

    for (const row of rows) {
        const lexicalScore = scoreTranscriptMatch(row, tokens);
        if (lexicalScore > 0) {
            scored.push({
                videoId: row.video_id,
                title: row.title,
                clipCard: {
                    topicTags: deriveFallbackTags(row),
                    keySteps: [],
                    bestHook: row.transcript_text.slice(0, 180),
                },
                score: lexicalScore,
                source: 'fts',
            });
        }
    }

    // If the prompt is too broad to lexical-match, return best available transcripts.
    if (scored.length === 0) {
        const byLength = [...rows]
            .sort((a, b) => (b.transcript_text || '').length - (a.transcript_text || '').length)
            .slice(0, limit);

        return byLength.map((row, idx) => ({
            videoId: row.video_id,
            title: row.title,
            clipCard: {
                topicTags: deriveFallbackTags(row),
                keySteps: [],
                bestHook: row.transcript_text.slice(0, 180),
            },
            score: 0.05 - idx * 0.0001,
            source: 'fts',
        }));
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
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
    let vectorResults: Array<{
        video_id: string;
        title: string | null;
        card_json: Record<string, unknown> | null;
        similarity: number | null;
    }> = [];

    // 1. Vector search on clip_cards
    try {
        const queryEmbedding = await generateQueryEmbedding(query);
        const embeddingStr = `[${queryEmbedding.join(',')}]`;
        const { data, error } = await supabase.rpc('match_clip_cards', {
            query_embedding: embeddingStr,
            match_creator_id: creatorId,
            match_count: limit,
        });

        if (error) {
            console.warn('Vector search failed:', error.message);
        } else {
            vectorResults = (data || []) as typeof vectorResults;
        }
    } catch (error) {
        console.warn('Vector embedding generation/search failed:', error);
    }

    // 2. Full-text search on transcript_chunks
    let ftsResults: Array<{
        video_id: string;
        title: string | null;
        card_json: Record<string, unknown> | null;
        rank: number | null;
    }> = [];

    try {
        const { data, error } = await supabase.rpc('search_transcripts', {
            search_query: query,
            match_creator_id: creatorId,
            match_count: limit,
        });

        if (error) {
            console.warn('Transcript FTS search failed:', error.message);
        } else {
            ftsResults = (data || []) as typeof ftsResults;
        }
    } catch (error) {
        console.warn('Transcript FTS search threw:', error);
    }

    // 3. Merge + Deduplicate
    const resultMap = new Map<string, SearchResult>();

    for (const r of vectorResults) {
        resultMap.set(r.video_id, {
            videoId: r.video_id,
            title: r.title,
            clipCard: r.card_json,
            score: r.similarity || 0,
            source: 'vector',
        });
    }

    for (const r of ftsResults) {
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

    // 3.5. Fallback: direct transcript lexical retrieval when indexes are missing.
    if (resultMap.size === 0) {
        const fallbackResults = await fallbackTranscriptSearch(supabase, creatorId, query, limit);
        for (const result of fallbackResults) {
            resultMap.set(result.videoId, result);
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
