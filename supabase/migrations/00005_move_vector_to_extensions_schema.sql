-- Move pgvector out of public schema to satisfy Supabase security lint.
-- Safe and idempotent on projects where vector is already in extensions.

CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'vector'
  ) THEN
    ALTER EXTENSION vector SET SCHEMA extensions;
  END IF;
END
$$;
