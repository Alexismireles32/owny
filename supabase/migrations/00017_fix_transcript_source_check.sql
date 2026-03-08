-- =====================================================================
-- 00017: Fix video_transcripts.source CHECK constraint
-- The pipeline sets source = 'description_fallback' for videos without
-- real transcripts, but the original constraint only allowed
-- ('caption', 'ai_fallback', 'manual'). This caused the entire batch
-- upsert to fail, leaving zero transcripts in the DB.
-- =====================================================================

ALTER TABLE public.video_transcripts DROP CONSTRAINT IF EXISTS video_transcripts_source_check;

ALTER TABLE public.video_transcripts
  ADD CONSTRAINT video_transcripts_source_check
  CHECK (source IN ('caption', 'ai_fallback', 'manual', 'description_fallback'));
