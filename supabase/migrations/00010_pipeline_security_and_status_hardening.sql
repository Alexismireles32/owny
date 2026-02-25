-- =====================================================================
-- 00010: Pipeline security and status hardening
-- - Adds "transcribing" as an allowed creators.pipeline_status
-- - Enables/locks down RLS on reserved_handles
-- - Optimizes content_clusters policy auth() calls for RLS planning
-- =====================================================================

-- ============================================
-- 1. creators.pipeline_status check constraint
-- ============================================
ALTER TABLE public.creators DROP CONSTRAINT IF EXISTS creators_pipeline_status_check;

ALTER TABLE public.creators
  ADD CONSTRAINT creators_pipeline_status_check
  CHECK (
    pipeline_status IN (
      'pending',
      'scraping',
      'transcribing',
      'cleaning',
      'clustering',
      'extracting',
      'ready',
      'error',
      'insufficient_content'
    )
  );

-- ============================================
-- 2. reserved_handles hardening
-- ============================================
ALTER TABLE public.reserved_handles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.reserved_handles FROM anon, authenticated;

-- Keep reads server-side only by default. Add explicit client policies later if needed.
DROP POLICY IF EXISTS reserved_handles_read ON public.reserved_handles;
CREATE POLICY reserved_handles_read
  ON public.reserved_handles
  FOR SELECT
  TO authenticated
  USING (false);

-- ============================================
-- 3. content_clusters policy optimization
-- ============================================
DROP POLICY IF EXISTS clusters_own ON public.content_clusters;

CREATE POLICY clusters_own ON public.content_clusters
  FOR ALL
  USING (
    creator_id IN (
      SELECT id
      FROM public.creators
      WHERE profile_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    creator_id IN (
      SELECT id
      FROM public.creators
      WHERE profile_id = (SELECT auth.uid())
    )
  );
