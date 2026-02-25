-- =====================================================================
-- 00009: ScrapeCreators Pipeline Schema
-- Adds pipeline columns to creators, reserved_handles, content_clusters,
-- and enriches video_transcripts per SCRAPE_CREATORS_FLOW.md
-- =====================================================================

-- ============================================
-- 1. CREATORS — new pipeline + TikTok columns
-- ============================================
ALTER TABLE public.creators
  ADD COLUMN IF NOT EXISTS pipeline_status TEXT DEFAULT 'pending'
    CHECK (pipeline_status IN ('pending', 'scraping', 'cleaning', 'clustering', 'extracting', 'ready', 'error', 'insufficient_content')),
  ADD COLUMN IF NOT EXISTS pipeline_error TEXT,
  ADD COLUMN IF NOT EXISTS follower_count INTEGER,
  ADD COLUMN IF NOT EXISTS following_count INTEGER,
  ADD COLUMN IF NOT EXISTS video_count INTEGER,
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_claimed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
  ADD COLUMN IF NOT EXISTS visual_dna JSONB,
  ADD COLUMN IF NOT EXISTS voice_profile JSONB;

COMMENT ON COLUMN public.creators.pipeline_status IS 'Current stage of the ScrapeCreators ingestion pipeline';
COMMENT ON COLUMN public.creators.visual_dna IS 'Brand DNA extracted from top video thumbnails (palette, accent, signals)';
COMMENT ON COLUMN public.creators.voice_profile IS 'Aggregated voice markers from transcript analysis';

-- ============================================
-- 2. RESERVED HANDLES
-- ============================================
CREATE TABLE IF NOT EXISTS public.reserved_handles (
  handle TEXT PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed a few obvious reserved handles
INSERT INTO public.reserved_handles (handle, reason) VALUES
  ('owny', 'Platform reserved'),
  ('admin', 'Platform reserved'),
  ('support', 'Platform reserved'),
  ('help', 'Platform reserved'),
  ('api', 'Platform reserved'),
  ('www', 'Platform reserved'),
  ('tiktok', 'Platform reserved')
ON CONFLICT (handle) DO NOTHING;

-- ============================================
-- 3. CONTENT CLUSTERS
-- ============================================
CREATE TABLE IF NOT EXISTS public.content_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  topic_summary TEXT,
  video_ids UUID[] DEFAULT '{}',
  total_views BIGINT DEFAULT 0,
  video_count INTEGER DEFAULT 0,
  extracted_content JSONB,
  recommended_product_type TEXT,
  confidence_score NUMERIC(3,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clusters_creator ON public.content_clusters(creator_id);

ALTER TABLE public.content_clusters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clusters_own" ON public.content_clusters
  FOR ALL USING (creator_id IN (SELECT id FROM public.creators WHERE profile_id = auth.uid()));

-- ============================================
-- 4. VIDEO TRANSCRIPTS — enrich with metadata
-- ============================================
ALTER TABLE public.video_transcripts
  ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES public.creators(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS platform TEXT DEFAULT 'tiktok',
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS views INTEGER,
  ADD COLUMN IF NOT EXISTS likes INTEGER,
  ADD COLUMN IF NOT EXISTS comments INTEGER,
  ADD COLUMN IF NOT EXISTS shares INTEGER,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS webvtt_url TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

-- Add unique constraint for (creator_id, video_id) if not exists
-- First drop the old unique index if it conflicts
-- The existing idx_transcripts_video is a unique on video_id only
-- We need (creator_id, video_id) per the spec
CREATE UNIQUE INDEX IF NOT EXISTS idx_transcripts_creator_video
  ON public.video_transcripts(creator_id, video_id)
  WHERE creator_id IS NOT NULL;

-- ============================================
-- 5. Add pipeline job type to jobs table
-- ============================================
-- The existing CHECK constraint limits job types, so we need to update it
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_type_check CHECK (type IN (
  'tiktok_import', 'transcript_fetch', 'clip_card_gen',
  'embedding_gen', 'csv_parse', 'product_build',
  'scrape_pipeline'
));
