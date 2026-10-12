-- ============================================================
-- Field Visits Table (Simple HRMS Model)
-- "Attendance, but for work happening outside the office."
-- ============================================================

CREATE TABLE IF NOT EXISTS field_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  purpose text,
  status text NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'cancelled'
  
  -- Start details
  start_time timestamptz NOT NULL DEFAULT now(),
  start_lat double precision NOT NULL,
  start_lng double precision NOT NULL,
  start_address text,
  
  -- End details
  end_time timestamptz,
  end_lat double precision,
  end_lng double precision,
  end_address text,
  end_photo_url text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_field_visits_company_user ON field_visits(company_id, user_id);
CREATE INDEX IF NOT EXISTS idx_field_visits_status ON field_visits(status);
CREATE INDEX IF NOT EXISTS idx_field_visits_start_time ON field_visits(start_time DESC);

-- Enable RLS
ALTER TABLE field_visits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users and admins can view field visits"
  ON field_visits FOR SELECT
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      user_id = auth.uid() OR 
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'hr'))
    )
  );

CREATE POLICY "Users can create their own field visits"
  ON field_visits FOR INSERT
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update their own field visits"
  ON field_visits FOR UPDATE
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND (
      user_id = auth.uid() OR 
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR role = 'hr'))
    )
  );
