-- =====================================================================
-- 00015: Supabase-native pipeline job queue
-- - Adds pipeline_jobs for durable queue-based pipeline dispatch
-- - Adds claim + stale lock release RPC helpers for worker processing
-- =====================================================================

-- ============================================
-- 1. pipeline_jobs table
-- ============================================
CREATE TABLE IF NOT EXISTS public.pipeline_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  handle TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE,
  trigger TEXT NOT NULL DEFAULT 'unknown'
    CHECK (trigger IN ('onboarding', 'manual_retry', 'auto_recovery', 'dlq_replay', 'unknown')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead_letter', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  worker_id TEXT,
  locked_at TIMESTAMPTZ,
  lock_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_ready
  ON public.pipeline_jobs(status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_creator_created
  ON public.pipeline_jobs(creator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_worker_status
  ON public.pipeline_jobs(worker_id, status);

ALTER TABLE public.pipeline_jobs ENABLE ROW LEVEL SECURITY;

-- service-role only table
DROP POLICY IF EXISTS pipeline_jobs_no_client_access ON public.pipeline_jobs;
CREATE POLICY pipeline_jobs_no_client_access
  ON public.pipeline_jobs
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================
-- 2. updated_at trigger wiring
-- ============================================
DROP TRIGGER IF EXISTS pipeline_jobs_updated_at ON public.pipeline_jobs;
CREATE TRIGGER pipeline_jobs_updated_at
  BEFORE UPDATE ON public.pipeline_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 3. Claim jobs RPC (safe concurrent claiming)
-- ============================================
CREATE OR REPLACE FUNCTION public.claim_pipeline_jobs(
  p_limit INTEGER DEFAULT 5,
  p_worker_id TEXT DEFAULT NULL,
  p_lock_seconds INTEGER DEFAULT 180
)
RETURNS SETOF public.pipeline_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := GREATEST(COALESCE(p_limit, 1), 1);
  v_worker TEXT := COALESCE(NULLIF(p_worker_id, ''), 'pipeline-worker');
  v_lock INTERVAL := make_interval(secs => GREATEST(COALESCE(p_lock_seconds, 180), 15));
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT pj.id
    FROM public.pipeline_jobs pj
    WHERE pj.status = 'queued'
      AND pj.next_attempt_at <= now()
      AND (pj.lock_expires_at IS NULL OR pj.lock_expires_at <= now())
    ORDER BY pj.created_at ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.pipeline_jobs pj
  SET
    status = 'running',
    attempts = pj.attempts + 1,
    worker_id = v_worker,
    locked_at = now(),
    lock_expires_at = now() + v_lock,
    started_at = COALESCE(pj.started_at, now()),
    updated_at = now()
  FROM candidates c
  WHERE pj.id = c.id
  RETURNING pj.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pipeline_jobs(INTEGER, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_pipeline_jobs(INTEGER, TEXT, INTEGER) TO service_role;

-- ============================================
-- 4. Stale lock recovery RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.release_expired_pipeline_jobs(
  p_limit INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := GREATEST(COALESCE(p_limit, 1), 1);
  v_count INTEGER := 0;
BEGIN
  WITH candidates AS (
    SELECT pj.id
    FROM public.pipeline_jobs pj
    WHERE pj.status = 'running'
      AND pj.lock_expires_at IS NOT NULL
      AND pj.lock_expires_at <= now()
    ORDER BY pj.lock_expires_at ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE public.pipeline_jobs pj
    SET
      status = 'queued',
      worker_id = NULL,
      locked_at = NULL,
      lock_expires_at = NULL,
      next_attempt_at = now() + interval '30 seconds',
      last_error = COALESCE(pj.last_error || E'\n', '') || 'Recovered stale running lock',
      updated_at = now()
    FROM candidates c
    WHERE pj.id = c.id
    RETURNING pj.id
  )
  SELECT COUNT(*)::INTEGER INTO v_count FROM updated;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_pipeline_jobs(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_expired_pipeline_jobs(INTEGER) TO service_role;
