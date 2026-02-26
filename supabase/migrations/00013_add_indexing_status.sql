-- =====================================================================
-- 00013: Add 'indexing' to pipeline_status allowed values
-- The new indexing step (chunking + embedding + clip cards) needs its
-- own status so the frontend can show progress accurately.
-- =====================================================================

ALTER TABLE public.creators DROP CONSTRAINT IF EXISTS creators_pipeline_status_check;

ALTER TABLE public.creators
  ADD CONSTRAINT creators_pipeline_status_check
  CHECK (
    pipeline_status IN (
      'pending',
      'scraping',
      'transcribing',
      'indexing',
      'cleaning',
      'clustering',
      'extracting',
      'ready',
      'error',
      'insufficient_content'
    )
  );
