-- Follow-up hardening + performance improvements after initial schema rollout

-- ============================================
-- 1) Add explicit no-client policies for service-role-only tables
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stripe_events'
      AND policyname = 'stripe_events_no_client_access'
  ) THEN
    CREATE POLICY stripe_events_no_client_access
      ON public.stripe_events
      FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'takedowns'
      AND policyname = 'takedowns_no_client_access'
  ) THEN
    CREATE POLICY takedowns_no_client_access
      ON public.takedowns
      FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END
$$;

-- ============================================
-- 2) Harden function search_path
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'buyer');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_clip_cards(
    query_embedding VECTOR(1536),
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
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.search_transcripts(
    search_query TEXT,
    match_creator_id UUID,
    match_count INT DEFAULT 80
)
RETURNS TABLE (
    video_id UUID,
    title TEXT,
    card_json JSONB,
    rank FLOAT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT DISTINCT ON (v.id)
        v.id AS video_id,
        v.title,
        cc.card_json,
        ts_rank(
            to_tsvector('english', tc.chunk_text),
            plainto_tsquery('english', search_query)
        ) AS rank
    FROM public.transcript_chunks tc
    JOIN public.videos v ON v.id = tc.video_id
    LEFT JOIN public.clip_cards cc ON cc.video_id = v.id
    WHERE v.creator_id = match_creator_id
      AND to_tsvector('english', tc.chunk_text) @@ plainto_tsquery('english', search_query)
    ORDER BY v.id, rank DESC
    LIMIT match_count;
$$;

-- ============================================
-- 3) Improve RLS policy planner performance
-- ============================================
ALTER POLICY profiles_select_own
  ON public.profiles
  USING ((SELECT auth.uid()) = id);

ALTER POLICY profiles_update_own
  ON public.profiles
  USING ((SELECT auth.uid()) = id);

ALTER POLICY creators_select_own
  ON public.creators
  USING (profile_id = (SELECT auth.uid()));

ALTER POLICY creators_insert_own
  ON public.creators
  WITH CHECK (profile_id = (SELECT auth.uid()));

ALTER POLICY creators_update_own
  ON public.creators
  USING (profile_id = (SELECT auth.uid()));

ALTER POLICY videos_own
  ON public.videos
  USING (creator_id IN (
    SELECT id
    FROM public.creators
    WHERE profile_id = (SELECT auth.uid())
  ));

ALTER POLICY transcripts_own
  ON public.video_transcripts
  USING (video_id IN (
    SELECT v.id
    FROM public.videos v
    JOIN public.creators c ON v.creator_id = c.id
    WHERE c.profile_id = (SELECT auth.uid())
  ));

ALTER POLICY chunks_own
  ON public.transcript_chunks
  USING (video_id IN (
    SELECT v.id
    FROM public.videos v
    JOIN public.creators c ON v.creator_id = c.id
    WHERE c.profile_id = (SELECT auth.uid())
  ));

ALTER POLICY clipcards_own
  ON public.clip_cards
  USING (video_id IN (
    SELECT v.id
    FROM public.videos v
    JOIN public.creators c ON v.creator_id = c.id
    WHERE c.profile_id = (SELECT auth.uid())
  ));

ALTER POLICY products_own
  ON public.products
  USING (creator_id IN (
    SELECT id
    FROM public.creators
    WHERE profile_id = (SELECT auth.uid())
  ));

ALTER POLICY versions_own
  ON public.product_versions
  USING (product_id IN (
    SELECT p.id
    FROM public.products p
    JOIN public.creators c ON p.creator_id = c.id
    WHERE c.profile_id = (SELECT auth.uid())
  ));

ALTER POLICY orders_buyer_own
  ON public.orders
  USING (buyer_profile_id = (SELECT auth.uid()));

ALTER POLICY orders_creator_own
  ON public.orders
  USING (product_id IN (
    SELECT p.id
    FROM public.products p
    JOIN public.creators c ON p.creator_id = c.id
    WHERE c.profile_id = (SELECT auth.uid())
  ));

ALTER POLICY entitlements_own
  ON public.entitlements
  USING (buyer_profile_id = (SELECT auth.uid()));

ALTER POLICY progress_own
  ON public.course_progress
  USING (buyer_profile_id = (SELECT auth.uid()));

ALTER POLICY jobs_creator_own
  ON public.jobs
  USING (creator_id IN (
    SELECT id
    FROM public.creators
    WHERE profile_id = (SELECT auth.uid())
  ));

ALTER POLICY pageviews_creator_own
  ON public.page_views
  USING (creator_id IN (
    SELECT id
    FROM public.creators
    WHERE profile_id = (SELECT auth.uid())
  ));

-- ============================================
-- 4) Add missing foreign-key indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_course_progress_product
  ON public.course_progress(product_id);

CREATE INDEX IF NOT EXISTS idx_creators_featured_product
  ON public.creators(featured_product_id);

CREATE INDEX IF NOT EXISTS idx_entitlements_product
  ON public.entitlements(product_id);

CREATE INDEX IF NOT EXISTS idx_page_views_creator
  ON public.page_views(creator_id);

CREATE INDEX IF NOT EXISTS idx_products_active_version
  ON public.products(active_version_id);

CREATE INDEX IF NOT EXISTS idx_takedowns_admin_profile
  ON public.takedowns(admin_profile_id);

CREATE INDEX IF NOT EXISTS idx_takedowns_product
  ON public.takedowns(product_id);
