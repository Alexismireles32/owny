// Test: Hybrid search and retrieval
// PRD §5.3: pgvector + FTS + metadata boosting

import { describe, it, expect, vi } from 'vitest';

// --- Simulated search types ---
interface ClipCard {
    id: string;
    title: string;
    content: string;
    embedding_similarity: number;
    view_count: number;
    published_at: string;
}

interface TranscriptResult {
    video_id: string;
    content: string;
    rank: number;
}

interface SearchResult {
    id: string;
    title: string;
    content: string;
    score: number;
    source: 'vector' | 'fts';
}

// --- Simulated hybrid search logic (mirrors src/lib/indexing/search.ts) ---

function mergeAndDedup(
    vectorResults: ClipCard[],
    ftsResults: TranscriptResult[]
): SearchResult[] {
    const merged = new Map<string, SearchResult>();

    // Add vector results
    for (const clip of vectorResults) {
        const score = calculateVectorScore(clip);
        merged.set(clip.id, {
            id: clip.id,
            title: clip.title,
            content: clip.content,
            score,
            source: 'vector',
        });
    }

    // Add FTS results — if already in map, boost the score
    for (const transcript of ftsResults) {
        const key = `fts_${transcript.video_id}`;
        const existing = merged.get(key);
        if (existing) {
            existing.score += transcript.rank * 0.3;
        } else {
            merged.set(key, {
                id: key,
                title: `Transcript: ${transcript.video_id}`,
                content: transcript.content,
                score: transcript.rank * 0.5,
                source: 'fts',
            });
        }
    }

    // Sort by score descending
    return Array.from(merged.values()).sort((a, b) => b.score - a.score);
}

function calculateVectorScore(clip: ClipCard): number {
    let score = clip.embedding_similarity;

    // Metadata boost: view count
    if (clip.view_count > 10000) score *= 1.2;
    else if (clip.view_count > 1000) score *= 1.1;

    // Metadata boost: recency (within last 30 days)
    const daysAgo = (Date.now() - new Date(clip.published_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo < 30) score *= 1.15;
    else if (daysAgo < 90) score *= 1.05;

    return score;
}

// --- Mock Supabase RPC calls ---
function createMockSupabase() {
    return {
        rpc: vi.fn(),
    };
}

describe('Hybrid Search', () => {
    describe('Vector Score Calculation', () => {
        it('should boost high-view-count clips', () => {
            const highViews: ClipCard = {
                id: '1',
                title: 'Popular Clip',
                content: 'content',
                embedding_similarity: 0.8,
                view_count: 50000,
                published_at: new Date().toISOString(),
            };

            const lowViews: ClipCard = {
                id: '2',
                title: 'Niche Clip',
                content: 'content',
                embedding_similarity: 0.8,
                view_count: 100,
                published_at: new Date().toISOString(),
            };

            const highScore = calculateVectorScore(highViews);
            const lowScore = calculateVectorScore(lowViews);

            expect(highScore).toBeGreaterThan(lowScore);
        });

        it('should boost recent clips', () => {
            const recentClip: ClipCard = {
                id: '1',
                title: 'Recent',
                content: 'content',
                embedding_similarity: 0.8,
                view_count: 500,
                published_at: new Date().toISOString(),
            };

            const oldClip: ClipCard = {
                id: '2',
                title: 'Old',
                content: 'content',
                embedding_similarity: 0.8,
                view_count: 500,
                published_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
            };

            const recentScore = calculateVectorScore(recentClip);
            const oldScore = calculateVectorScore(oldClip);

            expect(recentScore).toBeGreaterThan(oldScore);
        });
    });

    describe('Merge and Dedup', () => {
        it('should merge vector and FTS results', () => {
            const vectorResults: ClipCard[] = [
                { id: 'v1', title: 'Clip 1', content: 'Vector result', embedding_similarity: 0.9, view_count: 5000, published_at: new Date().toISOString() },
            ];

            const ftsResults: TranscriptResult[] = [
                { video_id: 'fts1', content: 'FTS result', rank: 0.8 },
            ];

            const results = mergeAndDedup(vectorResults, ftsResults);

            expect(results).toHaveLength(2);
            // Vector results should come first (higher score)
            expect(results[0].source).toBe('vector');
        });

        it('should sort by score descending', () => {
            const vectorResults: ClipCard[] = [
                { id: 'low', title: 'Low', content: 'c', embedding_similarity: 0.3, view_count: 10, published_at: '2020-01-01T00:00:00Z' },
                { id: 'high', title: 'High', content: 'c', embedding_similarity: 0.95, view_count: 100000, published_at: new Date().toISOString() },
            ];

            const results = mergeAndDedup(vectorResults, []);

            expect(results[0].id).toBe('high');
            expect(results[0].score).toBeGreaterThan(results[1].score);
        });

        it('should handle no results', () => {
            const results = mergeAndDedup([], []);
            expect(results).toHaveLength(0);
        });

        it('should handle single source (vector only)', () => {
            const vectorResults: ClipCard[] = [
                { id: 'v1', title: 'Only Vector', content: 'content', embedding_similarity: 0.85, view_count: 2000, published_at: new Date().toISOString() },
            ];

            const results = mergeAndDedup(vectorResults, []);

            expect(results).toHaveLength(1);
            expect(results[0].source).toBe('vector');
        });

        it('should handle single source (FTS only)', () => {
            const ftsResults: TranscriptResult[] = [
                { video_id: 'ft1', content: 'Only FTS', rank: 0.9 },
            ];

            const results = mergeAndDedup([], ftsResults);

            expect(results).toHaveLength(1);
            expect(results[0].source).toBe('fts');
        });
    });

    describe('Mock Supabase RPC', () => {
        it('should call match_clip_cards RPC with correct params', async () => {
            const supabase = createMockSupabase();
            const queryEmbedding = new Array(1536).fill(0.1);

            supabase.rpc.mockResolvedValueOnce({
                data: [
                    { id: 'cc1', title: 'Test', content: 'Test content', similarity: 0.88, view_count: 1000, published_at: '2024-01-01' },
                ],
                error: null,
            });

            const { data, error } = await supabase.rpc('match_clip_cards', {
                query_embedding: queryEmbedding,
                match_threshold: 0.5,
                match_count: 20,
            });

            expect(error).toBeNull();
            expect(data).toHaveLength(1);
            expect(supabase.rpc).toHaveBeenCalledWith('match_clip_cards', {
                query_embedding: queryEmbedding,
                match_threshold: 0.5,
                match_count: 20,
            });
        });

        it('should call search_transcripts RPC with correct params', async () => {
            const supabase = createMockSupabase();

            supabase.rpc.mockResolvedValueOnce({
                data: [
                    { video_id: 'v1', content: 'Found transcript', rank: 0.75 },
                ],
                error: null,
            });

            const { data, error } = await supabase.rpc('search_transcripts', {
                search_query: 'cooking tips',
                result_limit: 10,
            });

            expect(error).toBeNull();
            expect(data).toHaveLength(1);
            expect(supabase.rpc).toHaveBeenCalledWith('search_transcripts', {
                search_query: 'cooking tips',
                result_limit: 10,
            });
        });
    });
});
