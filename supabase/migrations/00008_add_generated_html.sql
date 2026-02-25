-- Add generated_html column to product_versions
-- Stores the AI-generated HTML+Tailwind code for full code generation
ALTER TABLE public.product_versions
  ADD COLUMN IF NOT EXISTS generated_html TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.product_versions.generated_html IS
  'AI-generated HTML+Tailwind code. When present, rendered via iframe instead of DSL BlockRenderer.';
