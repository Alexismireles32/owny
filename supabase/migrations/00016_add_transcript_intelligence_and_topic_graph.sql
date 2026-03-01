-- =====================================================================
-- 00016: Add durable transcript intelligence and creator topic graph
-- - video_intelligence stores one persistent semantic record per video
-- - creator_topic_graph stores reusable product-worthy topic nodes per creator
-- =====================================================================

-- ============================================
-- 1. video_intelligence
-- ============================================
CREATE TABLE IF NOT EXISTS public.video_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  transcript_checksum TEXT NOT NULL,
  semantic_title TEXT,
  semantic_abstract TEXT,
  problem_statements TEXT[] DEFAULT '{}',
  outcome_statements TEXT[] DEFAULT '{}',
  audience_signals TEXT[] DEFAULT '{}',
  theme_phrases TEXT[] DEFAULT '{}',
  action_steps TEXT[] DEFAULT '{}',
  evidence_quotes TEXT[] DEFAULT '{}',
  recommended_product_types TEXT[] DEFAULT '{}',
  product_angle TEXT,
  confidence_score NUMERIC(3,2) DEFAULT 0.5,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_video_intelligence_creator_video
  ON public.video_intelligence(creator_id, video_id);

CREATE INDEX IF NOT EXISTS idx_video_intelligence_creator
  ON public.video_intelligence(creator_id);

ALTER TABLE public.video_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS video_intelligence_own ON public.video_intelligence;
CREATE POLICY video_intelligence_own ON public.video_intelligence
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

-- ============================================
-- 2. creator_topic_graph
-- ============================================
CREATE TABLE IF NOT EXISTS public.creator_topic_graph (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  topic_key TEXT NOT NULL,
  topic_label TEXT NOT NULL,
  problem_statement TEXT,
  promise_statement TEXT,
  audience_fit TEXT,
  supporting_video_ids UUID[] DEFAULT '{}',
  supporting_chunk_refs JSONB DEFAULT '[]'::jsonb,
  evidence_quotes TEXT[] DEFAULT '{}',
  recommended_product_types TEXT[] DEFAULT '{}',
  source_video_count INTEGER DEFAULT 0,
  confidence_score NUMERIC(3,2) DEFAULT 0.5,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_topic_graph_creator_key
  ON public.creator_topic_graph(creator_id, topic_key);

CREATE INDEX IF NOT EXISTS idx_creator_topic_graph_creator
  ON public.creator_topic_graph(creator_id);

ALTER TABLE public.creator_topic_graph ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creator_topic_graph_own ON public.creator_topic_graph;
CREATE POLICY creator_topic_graph_own ON public.creator_topic_graph
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
