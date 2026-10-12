-- =============================================================
-- COMPANY BRANDING & SUBDOMAIN SCHEMA
-- Run this in your Supabase SQL Editor
-- =============================================================

-- 1. Add branding columns to companies table if not already present
ALTER TABLE companies
ADD COLUMN IF NOT EXISTS brand_color text DEFAULT '#059669',
ADD COLUMN IF NOT EXISTS brand_tagline text,
ADD COLUMN IF NOT EXISTS logo_url text,
ADD COLUMN IF NOT EXISTS login_hero_url text;

-- 2. Index tenant_domain and short_name for sub-millisecond subdomain resolution
CREATE INDEX IF NOT EXISTS idx_companies_tenant_domain 
  ON companies (lower(tenant_domain)) 
  WHERE tenant_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_short_name 
  ON companies (lower(short_name));

-- 3. Ensure public read access to branding fields for unauthenticated login page
-- (Allows the /login page to fetch company logo, color, and name by subdomain)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'companies' AND policyname = 'Public read company branding by domain'
  ) THEN
    CREATE POLICY "Public read company branding by domain"
      ON companies FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
