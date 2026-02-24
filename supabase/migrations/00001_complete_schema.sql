-- =====================================================================
-- Owny.store — Complete Database Migration
-- Run this ONCE in Supabase SQL Editor (or via supabase db push)
-- =====================================================================

-- ============================================
-- EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================
-- 1. PROFILES (auto-created on signup)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('creator', 'buyer', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'buyer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. CREATORS
-- ============================================
CREATE TABLE IF NOT EXISTS public.creators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  brand_tokens JSONB NOT NULL DEFAULT '{}',
  featured_product_id UUID, -- FK added after products table
  stripe_connect_account_id TEXT,
  stripe_connect_status TEXT DEFAULT 'unconnected'
    CHECK (stripe_connect_status IN ('unconnected', 'pending', 'connected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creators_profile ON public.creators(profile_id);

ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creators_select_own" ON public.creators
  FOR SELECT USING (profile_id = auth.uid());
CREATE POLICY "creators_insert_own" ON public.creators
  FOR INSERT WITH CHECK (profile_id = auth.uid());
CREATE POLICY "creators_update_own" ON public.creators
  FOR UPDATE USING (profile_id = auth.uid());
CREATE POLICY "creators_select_public" ON public.creators
  FOR SELECT USING (true);

-- ============================================
-- 3. VIDEOS
-- ============================================
CREATE TABLE IF NOT EXISTS public.videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'scrapecreators'
    CHECK (source IN ('scrapecreators', 'csv', 'manual', 'youtube')),
  external_video_id TEXT,
  url TEXT,
  title TEXT,
  description TEXT,
  views INTEGER,
  likes INTEGER,
  comments_count INTEGER,
  shares INTEGER,
  duration INTEGER, -- seconds
  thumbnail_url TEXT,
  created_at_source TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_videos_creator ON public.videos(creator_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_external ON public.videos(creator_id, external_video_id)
  WHERE external_video_id IS NOT NULL;

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "videos_own" ON public.videos
  FOR ALL USING (creator_id IN (SELECT id FROM public.creators WHERE profile_id = auth.uid()));

-- ============================================
-- 4. VIDEO TRANSCRIPTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.video_transcripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  transcript_text TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  source TEXT DEFAULT 'caption' CHECK (source IN ('caption', 'ai_fallback', 'manual')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transcripts_video ON public.video_transcripts(video_id);

ALTER TABLE public.video_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transcripts_own" ON public.video_transcripts
  FOR ALL USING (video_id IN (
    SELECT v.id FROM public.videos v
    JOIN public.creators c ON v.creator_id = c.id
    WHERE c.profile_id = auth.uid()
  ));

-- ============================================
-- 5. TRANSCRIPT CHUNKS (with pgvector embeddings)
-- ============================================
CREATE TABLE IF NOT EXISTS public.transcript_chunks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding VECTOR(1536), -- text-embedding-3-small
  fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chunks_video ON public.transcript_chunks(video_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON public.transcript_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_chunks_fts ON public.transcript_chunks USING gin(fts);

ALTER TABLE public.transcript_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chunks_own" ON public.transcript_chunks
  FOR ALL USING (video_id IN (
    SELECT v.id FROM public.videos v
    JOIN public.creators c ON v.creator_id = c.id
    WHERE c.profile_id = auth.uid()
  ));

-- ============================================
-- 6. CLIP CARDS
-- ============================================
CREATE TABLE IF NOT EXISTS public.clip_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  card_json JSONB NOT NULL, -- ClipCard type
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clipcards_video ON public.clip_cards(video_id);
CREATE INDEX IF NOT EXISTS idx_clipcards_embedding ON public.clip_cards
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.clip_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clipcards_own" ON public.clip_cards
  FOR ALL USING (video_id IN (
    SELECT v.id FROM public.videos v
    JOIN public.creators c ON v.creator_id = c.id
    WHERE c.profile_id = auth.uid()
  ));

-- ============================================
-- 7. PRODUCTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  creator_id UUID NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('pdf_guide', 'mini_course', 'challenge_7day', 'checklist_toolkit')),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  active_version_id UUID, -- FK added after product_versions table
  access_type TEXT NOT NULL DEFAULT 'paid'
    CHECK (access_type IN ('public', 'email_gated', 'paid', 'subscription')),
  price_cents INTEGER,
  currency TEXT DEFAULT 'usd',
  stripe_price_id TEXT, -- Stripe Price object for subscriptions
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_creator ON public.products(creator_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_public" ON public.products
  FOR SELECT USING (status = 'published');
CREATE POLICY "products_own" ON public.products
  FOR ALL USING (creator_id IN (SELECT id FROM public.creators WHERE profile_id = auth.uid()));

-- ============================================
-- 8. PRODUCT VERSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS public.product_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  build_packet JSONB NOT NULL,
  dsl_json JSONB NOT NULL,
  source_video_ids UUID[] DEFAULT '{}',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_versions_product ON public.product_versions(product_id);

ALTER TABLE public.product_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "versions_own" ON public.product_versions
  FOR ALL USING (product_id IN (
    SELECT p.id FROM public.products p
    JOIN public.creators c ON p.creator_id = c.id
    WHERE c.profile_id = auth.uid()
  ));
CREATE POLICY "versions_public" ON public.product_versions
  FOR SELECT USING (product_id IN (
    SELECT id FROM public.products WHERE status = 'published'
  ));

-- Deferred FK constraints (cross-table references)
ALTER TABLE public.products ADD CONSTRAINT fk_active_version
  FOREIGN KEY (active_version_id) REFERENCES public.product_versions(id);
ALTER TABLE public.creators ADD CONSTRAINT fk_featured_product
  FOREIGN KEY (featured_product_id) REFERENCES public.products(id);

-- ============================================
-- 9. ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_profile_id UUID NOT NULL REFERENCES public.profiles(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'refunded', 'failed')),
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer ON public.orders(buyer_profile_id);
CREATE INDEX IF NOT EXISTS idx_orders_product ON public.orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_stripe ON public.orders(stripe_checkout_session_id);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_buyer_own" ON public.orders
  FOR SELECT USING (buyer_profile_id = auth.uid());
CREATE POLICY "orders_creator_own" ON public.orders
  FOR SELECT USING (product_id IN (
    SELECT p.id FROM public.products p
    JOIN public.creators c ON p.creator_id = c.id
    WHERE c.profile_id = auth.uid()
  ));

-- ============================================
-- 10. ENTITLEMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.entitlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_profile_id UUID NOT NULL REFERENCES public.profiles(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  granted_via TEXT DEFAULT 'purchase' CHECK (granted_via IN ('purchase', 'admin', 'promo')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_entitlements_unique ON public.entitlements(buyer_profile_id, product_id);

ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entitlements_own" ON public.entitlements
  FOR ALL USING (buyer_profile_id = auth.uid());

-- ============================================
-- 11. COURSE PROGRESS
-- ============================================
CREATE TABLE IF NOT EXISTS public.course_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  buyer_profile_id UUID NOT NULL REFERENCES public.profiles(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  progress_data JSONB NOT NULL DEFAULT '{}',
  -- progress_data shape: { completedBlockIds: string[], lastAccessedAt: string, percentComplete: number }
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_progress_unique ON public.course_progress(buyer_profile_id, product_id);

ALTER TABLE public.course_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "progress_own" ON public.course_progress
  FOR ALL USING (buyer_profile_id = auth.uid());

-- ============================================
-- 12. STRIPE WEBHOOK IDEMPOTENCY
-- ============================================
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processing_status TEXT DEFAULT 'received'
    CHECK (processing_status IN ('received', 'processed', 'failed')),
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
-- No user-facing RLS — only accessed via service role in webhooks

-- ============================================
-- 13. JOBS (background task queue)
-- ============================================
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN (
    'tiktok_import', 'transcript_fetch', 'clip_card_gen',
    'embedding_gen', 'csv_parse', 'product_build'
  )),
  creator_id UUID REFERENCES public.creators(id),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  payload JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status, type);
CREATE INDEX IF NOT EXISTS idx_jobs_creator ON public.jobs(creator_id);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_creator_own" ON public.jobs
  FOR SELECT USING (creator_id IN (SELECT id FROM public.creators WHERE profile_id = auth.uid()));

-- ============================================
-- 14. PAGE VIEWS (analytics)
-- ============================================
CREATE TABLE IF NOT EXISTS public.page_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  path TEXT NOT NULL,
  creator_id UUID REFERENCES public.creators(id),
  product_id UUID REFERENCES public.products(id),
  referrer TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pageviews_product ON public.page_views(product_id, created_at);

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pageviews_creator_own" ON public.page_views
  FOR SELECT USING (creator_id IN (SELECT id FROM public.creators WHERE profile_id = auth.uid()));
-- Page views are inserted via service role (no user insert policy needed)

-- ============================================
-- 15. TAKEDOWNS (admin moderation)
-- ============================================
CREATE TABLE IF NOT EXISTS public.takedowns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'lifted')),
  admin_profile_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.takedowns ENABLE ROW LEVEL SECURITY;
-- Only accessible via admin (service role). No user RLS needed.

-- ============================================
-- UPDATED_AT AUTO-UPDATE TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables with updated_at column
CREATE OR REPLACE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER creators_updated_at
  BEFORE UPDATE ON public.creators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER videos_updated_at
  BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER entitlements_updated_at
  BEFORE UPDATE ON public.entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER progress_updated_at
  BEFORE UPDATE ON public.course_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE TRIGGER jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
