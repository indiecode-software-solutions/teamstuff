-- ============================================================
-- Dedicated Payslip Logo configuration for companies table
-- Run this once in the Supabase SQL editor.
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS payslip_logo_url text;
