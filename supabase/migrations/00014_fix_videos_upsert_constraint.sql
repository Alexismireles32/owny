-- =====================================================================
-- 00014: Fix videos table unique constraint for upsert
-- The partial unique index (WHERE external_video_id IS NOT NULL)
-- prevents PostgREST upsert with onConflict: 'creator_id,external_video_id'
-- from resolving correctly, causing the scrape-videos step to fail.
-- Same pattern as 00012 which fixed video_transcripts.
-- =====================================================================

-- 1. Drop the partial unique index that breaks upsert
DROP INDEX IF EXISTS public.idx_videos_external;
-- 2. Create a NON-PARTIAL unique index on (creator_id, external_video_id)
--    This allows PostgREST onConflict resolution to work correctly
CREATE UNIQUE INDEX idx_videos_external
  ON public.videos(creator_id, external_video_id);
