-- Supabase RPC functions for hybrid search (M4)
-- Run this AFTER 00001_complete_schema.sql

-- ============================================
-- VECTOR SEARCH: Match clip cards by embedding similarity
-- ============================================
CREATE OR REPLACE FUNCTION match_clip_cards(
    query_embedding VECTOR(1536),
    match_creator_id UUID,
    match_count INT DEFAULT 80
)
RETURNS TABLE (
    video_id UUID,
    title TEXT,
    card_json JSONB,
    similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT
        v.id AS video_id,
        v.title,
        cc.card_json,
        1 - (cc.embedding <=> query_embedding) AS similarity
    FROM clip_cards cc
    JOIN videos v ON v.id = cc.video_id
    WHERE v.creator_id = match_creator_id
      AND cc.embedding IS NOT NULL
    ORDER BY cc.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- ============================================
-- FULL-TEXT SEARCH: Search transcript chunks
-- ============================================
CREATE OR REPLACE FUNCTION search_transcripts(
    search_query TEXT,
    match_creator_id UUID,
    match_count INT DEFAULT 80
)
RETURNS TABLE (
    video_id UUID,
    title TEXT,
    card_json JSONB,
    rank FLOAT
)
LANGUAGE sql STABLE
AS $$
    SELECT DISTINCT ON (v.id)
        v.id AS video_id,
        v.title,
        cc.card_json,
        ts_rank(
            to_tsvector('english', tc.chunk_text),
            plainto_tsquery('english', search_query)
        ) AS rank
    FROM transcript_chunks tc
    JOIN videos v ON v.id = tc.video_id
    LEFT JOIN clip_cards cc ON cc.video_id = v.id
    WHERE v.creator_id = match_creator_id
      AND to_tsvector('english', tc.chunk_text) @@ plainto_tsquery('english', search_query)
    ORDER BY v.id, rank DESC
    LIMIT match_count;
$$;
