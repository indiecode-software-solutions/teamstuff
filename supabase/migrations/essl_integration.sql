-- ============================================================
-- ESSL Biometric Integration Migration
-- Run this in the Supabase SQL Editor for your project.
-- ============================================================

-- 1. Add attendance_method to companies
--    Values: 'gps' (default) | 'biometric' | 'both'
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS attendance_method text NOT NULL DEFAULT 'gps';

-- 2. Create biometric_devices table
CREATE TABLE IF NOT EXISTS biometric_devices (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  device_serial      text NOT NULL,
  device_name        text NOT NULL DEFAULT 'Biometric Device',
  office_location_id uuid REFERENCES office_locations(id) ON DELETE SET NULL,
  is_active          boolean NOT NULL DEFAULT true,
  last_seen_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, device_serial)
);

-- 3. Add source + biometric_device_id to attendance
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'mobile_gps';
  -- values: 'mobile_gps' | 'biometric_essl' | 'manual'

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS biometric_device_id uuid REFERENCES biometric_devices(id) ON DELETE SET NULL;

-- 4. Index for fast device-serial lookups by the edge function
CREATE INDEX IF NOT EXISTS idx_biometric_devices_serial
  ON biometric_devices(device_serial);

-- Index for admin attendance filter by source
CREATE INDEX IF NOT EXISTS idx_attendance_source
  ON attendance(source);

-- 5. RLS Policies for biometric_devices
ALTER TABLE biometric_devices ENABLE ROW LEVEL SECURITY;

-- Admins of same company can read their devices
CREATE POLICY "Admins can view their company biometric devices"
  ON biometric_devices FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can insert devices for their company
CREATE POLICY "Admins can add biometric devices"
  ON biometric_devices FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update their company's devices
CREATE POLICY "Admins can update biometric devices"
  ON biometric_devices FOR UPDATE
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can delete their company's devices
CREATE POLICY "Admins can delete biometric devices"
  ON biometric_devices FOR DELETE
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- NOTE: The ESSL Edge Function uses the Supabase service_role key,
-- which bypasses RLS entirely, so no extra policy is needed for it.
