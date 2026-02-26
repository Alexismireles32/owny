-- =====================================================================
-- 00012: Fix video_transcripts unique constraint for upsert
-- The partial unique index (WHERE creator_id IS NOT NULL) prevents
-- PostgREST upsert with onConflict: 'creator_id,video_id' from
-- resolving correctly, causing the transcript save step to fail.
-- =====================================================================

-- 1. Drop the partial unique index that breaks upsert
DROP INDEX IF EXISTS public.idx_transcripts_creator_video;

-- 2. Drop the old single-column unique index on video_id only
--    (incompatible with the multi-creator model where the same video
--    could theoretically appear under different creators)
DROP INDEX IF EXISTS public.idx_transcripts_video;

-- 3. Create a NON-PARTIAL unique index on (creator_id, video_id)
--    This allows PostgREST onConflict resolution to work correctly
CREATE UNIQUE INDEX idx_transcripts_creator_video
  ON public.video_transcripts(creator_id, video_id);
