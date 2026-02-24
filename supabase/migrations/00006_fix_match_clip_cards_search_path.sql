-- After moving pgvector to extensions schema, ensure vector operators resolve.

CREATE OR REPLACE FUNCTION public.match_clip_cards(
    query_embedding extensions.vector(1536),
    match_creator_id UUID,
    match_count INT DEFAULT 80
)
RETURNS TABLE (
    video_id UUID,
    title TEXT,
    card_json JSONB,
    similarity FLOAT
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
    SELECT
        v.id AS video_id,
        v.title,
        cc.card_json,
        1 - (cc.embedding <=> query_embedding) AS similarity
    FROM public.clip_cards cc
    JOIN public.videos v ON v.id = cc.video_id
    WHERE v.creator_id = match_creator_id
      AND cc.embedding IS NOT NULL
    ORDER BY cc.embedding <=> query_embedding
    LIMIT match_count;
$$;
