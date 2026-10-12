-- Migration: Add favicon_url column to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS favicon_url TEXT;
