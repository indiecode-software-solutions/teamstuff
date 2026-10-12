-- ============================================================
-- Dedicated Payslip Stamp & Signature configuration for companies table
-- Run this once in the Supabase SQL editor.
-- ============================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS payslip_stamp_url text,
  ADD COLUMN IF NOT EXISTS payslip_signature_url text,
  ADD COLUMN IF NOT EXISTS payslip_sign_mode text DEFAULT 'digital_notice',
  ADD COLUMN IF NOT EXISTS cin text,
  ADD COLUMN IF NOT EXISTS pan_number text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS address text;

-- Add metadata JSON column on payslips to store configurable top section employee details (Pay Date, Working Days, etc.)
ALTER TABLE public.payslips
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Allow 'metadata' in payslip_columns table section check constraint
ALTER TABLE public.payslip_columns
  DROP CONSTRAINT IF EXISTS payslip_columns_section_check;

ALTER TABLE public.payslip_columns
  ADD CONSTRAINT payslip_columns_section_check
  CHECK (section IN ('metadata', 'earnings', 'deductions'));
