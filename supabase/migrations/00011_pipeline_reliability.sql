-- =====================================================================
-- 00011: Pipeline reliability hardening
-- - Adds run ownership token to creators for stronger idempotency
-- - Adds pipeline_runs for observability/heartbeat tracking
-- - Adds pipeline_dead_letters for failure capture + replay workflow
-- =====================================================================

-- ============================================
-- 1. creators run token for idempotent ownership
-- ============================================
ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS pipeline_run_id TEXT;

CREATE INDEX IF NOT EXISTS idx_creators_pipeline_run_id ON public.creators(pipeline_run_id);

COMMENT ON COLUMN public.creators.pipeline_run_id IS 'Current active pipeline run token; stale runs must not write state when this changes';

-- ============================================
-- 2. pipeline_runs (observability + run lifecycle)
-- ============================================
CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL UNIQUE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  handle TEXT NOT NULL,
  event_id TEXT,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled', 'superseded')),
  current_step TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_creator_started
  ON public.pipeline_runs(creator_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status_heartbeat
  ON public.pipeline_runs(status, last_heartbeat_at DESC);

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

-- service-role only table
DROP POLICY IF EXISTS pipeline_runs_no_client_access ON public.pipeline_runs;
CREATE POLICY pipeline_runs_no_client_access
  ON public.pipeline_runs
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================
-- 3. pipeline_dead_letters (DLQ)
-- ============================================
CREATE TABLE IF NOT EXISTS public.pipeline_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL UNIQUE,
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  handle TEXT NOT NULL,
  event_id TEXT,
  failed_step TEXT,
  error_message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'replayed', 'resolved', 'ignored')),
  replay_count INTEGER NOT NULL DEFAULT 0,
  replayed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_dlq_creator_created
  ON public.pipeline_dead_letters(creator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_dlq_status_created
  ON public.pipeline_dead_letters(status, created_at DESC);

ALTER TABLE public.pipeline_dead_letters ENABLE ROW LEVEL SECURITY;

-- service-role only table
DROP POLICY IF EXISTS pipeline_dead_letters_no_client_access ON public.pipeline_dead_letters;
CREATE POLICY pipeline_dead_letters_no_client_access
  ON public.pipeline_dead_letters
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================
-- 4. updated_at trigger wiring
-- ============================================
DROP TRIGGER IF EXISTS pipeline_runs_updated_at ON public.pipeline_runs;
CREATE TRIGGER pipeline_runs_updated_at
  BEFORE UPDATE ON public.pipeline_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS pipeline_dead_letters_updated_at ON public.pipeline_dead_letters;
CREATE TRIGGER pipeline_dead_letters_updated_at
  BEFORE UPDATE ON public.pipeline_dead_letters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
