-- =============================================================
-- EXIT MANAGEMENT SCHEMA
-- Run this in your Supabase SQL Editor
-- =============================================================

-- 1. Core exit request record
CREATE TABLE IF NOT EXISTS exit_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL,
  employee_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  initiated_by          uuid NOT NULL,
  exit_type             text NOT NULL CHECK (exit_type IN ('resignation', 'termination', 'retirement')),
  reason                text,
  last_working_day      date NOT NULL,
  notice_period_days    int DEFAULT 0,
  notice_shortfall_days int DEFAULT 0,
  status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected', 'in_clearance', 'completed')),
  manager_remarks       text,
  approved_by           uuid,
  approved_at           timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- 2. Per-department clearance checklist items
CREATE TABLE IF NOT EXISTS exit_clearance_tasks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exit_request_id   uuid NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
  department        text NOT NULL,
  task_label        text NOT NULL,
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  completed_by      uuid,
  completed_at      timestamptz,
  remarks           text,
  created_at        timestamptz DEFAULT now()
);

-- 3. Exit interview responses
CREATE TABLE IF NOT EXISTS exit_interviews (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exit_request_id   uuid NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
  employee_id       uuid NOT NULL,
  primary_reason    text,
  manager_rating    int CHECK (manager_rating BETWEEN 1 AND 5),
  culture_rating    int CHECK (culture_rating BETWEEN 1 AND 5),
  growth_rating     int CHECK (growth_rating BETWEEN 1 AND 5),
  wlb_rating        int CHECK (wlb_rating BETWEEN 1 AND 5),
  would_recommend   boolean,
  open_feedback     text,
  submitted_at      timestamptz DEFAULT now()
);

-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_exit_requests_company    ON exit_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_exit_requests_employee   ON exit_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_exit_clearance_request   ON exit_clearance_tasks(exit_request_id);
CREATE INDEX IF NOT EXISTS idx_exit_interview_request   ON exit_interviews(exit_request_id);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE exit_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE exit_clearance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE exit_interviews      ENABLE ROW LEVEL SECURITY;

-- exit_requests: employees see only their own; HR/admins see entire company
CREATE POLICY "exit_requests_select" ON exit_requests
  FOR SELECT USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND company_id = exit_requests.company_id
        AND role IN ('admin', 'hr')
    )
  );

CREATE POLICY "exit_requests_insert" ON exit_requests
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "exit_requests_update" ON exit_requests
  FOR UPDATE USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND company_id = exit_requests.company_id
        AND role IN ('admin', 'hr')
    )
  );

-- clearance tasks: visible to company HR/admin + the employee
CREATE POLICY "clearance_tasks_select" ON exit_clearance_tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM exit_requests er
      JOIN profiles p ON p.id = auth.uid()
      WHERE er.id = exit_clearance_tasks.exit_request_id
        AND (er.employee_id = auth.uid() OR (p.company_id = er.company_id AND p.role IN ('admin', 'hr')))
    )
  );

CREATE POLICY "clearance_tasks_insert" ON exit_clearance_tasks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "clearance_tasks_update" ON exit_clearance_tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM exit_requests er
      JOIN profiles p ON p.id = auth.uid()
      WHERE er.id = exit_clearance_tasks.exit_request_id
        AND p.company_id = er.company_id
        AND p.role IN ('admin', 'hr')
    )
  );

-- exit_interviews: employee can insert/view; HR can view
CREATE POLICY "exit_interviews_select" ON exit_interviews
  FOR SELECT USING (
    employee_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM exit_requests er
      JOIN profiles p ON p.id = auth.uid()
      WHERE er.id = exit_interviews.exit_request_id
        AND p.company_id = er.company_id
        AND p.role IN ('admin', 'hr')
    )
  );

CREATE POLICY "exit_interviews_insert" ON exit_interviews
  FOR INSERT WITH CHECK (employee_id = auth.uid());
