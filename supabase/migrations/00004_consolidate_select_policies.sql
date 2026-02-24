-- Consolidate overlapping SELECT RLS policies to reduce planner overhead warnings.
-- Preserves public-read behavior for published resources and owner access for writes.

-- ============================================
-- creators: keep one SELECT policy
-- ============================================
DROP POLICY IF EXISTS creators_select_own ON public.creators;

-- ============================================
-- orders: merge buyer + creator SELECT into one policy
-- ============================================
DROP POLICY IF EXISTS orders_select_buyer_or_creator ON public.orders;
DROP POLICY IF EXISTS orders_buyer_own ON public.orders;
DROP POLICY IF EXISTS orders_creator_own ON public.orders;

CREATE POLICY orders_select_buyer_or_creator
  ON public.orders
  FOR SELECT
  USING (
    buyer_profile_id = (SELECT auth.uid())
    OR product_id IN (
      SELECT p.id
      FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE c.profile_id = (SELECT auth.uid())
    )
  );

-- ============================================
-- products: split ALL policy into command-specific policies + one SELECT policy
-- ============================================
DROP POLICY IF EXISTS products_select_public_or_own ON public.products;
DROP POLICY IF EXISTS products_insert_own ON public.products;
DROP POLICY IF EXISTS products_update_own ON public.products;
DROP POLICY IF EXISTS products_delete_own ON public.products;
DROP POLICY IF EXISTS products_public ON public.products;
DROP POLICY IF EXISTS products_own ON public.products;

CREATE POLICY products_select_public_or_own
  ON public.products
  FOR SELECT
  USING (
    status = 'published'
    OR creator_id IN (
      SELECT id
      FROM public.creators
      WHERE profile_id = (SELECT auth.uid())
    )
  );

CREATE POLICY products_insert_own
  ON public.products
  FOR INSERT
  WITH CHECK (
    creator_id IN (
      SELECT id
      FROM public.creators
      WHERE profile_id = (SELECT auth.uid())
    )
  );

CREATE POLICY products_update_own
  ON public.products
  FOR UPDATE
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

CREATE POLICY products_delete_own
  ON public.products
  FOR DELETE
  USING (
    creator_id IN (
      SELECT id
      FROM public.creators
      WHERE profile_id = (SELECT auth.uid())
    )
  );

-- ============================================
-- product_versions: split ALL policy into command-specific + merged SELECT
-- ============================================
DROP POLICY IF EXISTS versions_select_public_or_own ON public.product_versions;
DROP POLICY IF EXISTS versions_insert_own ON public.product_versions;
DROP POLICY IF EXISTS versions_update_own ON public.product_versions;
DROP POLICY IF EXISTS versions_delete_own ON public.product_versions;
DROP POLICY IF EXISTS versions_public ON public.product_versions;
DROP POLICY IF EXISTS versions_own ON public.product_versions;

CREATE POLICY versions_select_public_or_own
  ON public.product_versions
  FOR SELECT
  USING (
    product_id IN (
      SELECT p.id
      FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE c.profile_id = (SELECT auth.uid())
    )
    OR product_id IN (
      SELECT id
      FROM public.products
      WHERE status = 'published'
    )
  );

CREATE POLICY versions_insert_own
  ON public.product_versions
  FOR INSERT
  WITH CHECK (
    product_id IN (
      SELECT p.id
      FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE c.profile_id = (SELECT auth.uid())
    )
  );

CREATE POLICY versions_update_own
  ON public.product_versions
  FOR UPDATE
  USING (
    product_id IN (
      SELECT p.id
      FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE c.profile_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    product_id IN (
      SELECT p.id
      FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE c.profile_id = (SELECT auth.uid())
    )
  );

CREATE POLICY versions_delete_own
  ON public.product_versions
  FOR DELETE
  USING (
    product_id IN (
      SELECT p.id
      FROM public.products p
      JOIN public.creators c ON p.creator_id = c.id
      WHERE c.profile_id = (SELECT auth.uid())
    )
  );
