-- Schema for Company Document Requirements and Employee Document Submissions

CREATE TABLE IF NOT EXISTS public.company_document_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_mandatory BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requirement_id UUID NOT NULL REFERENCES public.company_document_requirements(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  r2_object_key TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'verified', 'rejected'
  rejection_reason TEXT,
  files JSONB DEFAULT '[]'::jsonb,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_employee_doc_requirement UNIQUE (user_id, requirement_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_doc_req_company ON public.company_document_requirements(company_id);
CREATE INDEX IF NOT EXISTS idx_emp_docs_user ON public.employee_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_emp_docs_company ON public.employee_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_emp_docs_status ON public.employee_documents(company_id, status);

-- Enable RLS
ALTER TABLE public.company_document_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for company_document_requirements
DROP POLICY IF EXISTS "Users can view document requirements for their company" ON public.company_document_requirements;
CREATE POLICY "Users can view document requirements for their company"
  ON public.company_document_requirements FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can manage document requirements" ON public.company_document_requirements;
CREATE POLICY "Admins can manage document requirements"
  ON public.company_document_requirements FOR ALL
  USING (
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid() AND LOWER(COALESCE(role, '')) IN ('admin', 'master', 'super_admin', 'hr', 'hr_admin', 'hr_manager')
    )
  );

-- RLS Policies for employee_documents
DROP POLICY IF EXISTS "Users can view their own documents or HR can view company documents" ON public.employee_documents;
CREATE POLICY "Users can view their own documents or HR can view company documents"
  ON public.employee_documents FOR SELECT
  USING (
    user_id = auth.uid() OR
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid() AND LOWER(COALESCE(role, '')) IN ('admin', 'master', 'super_admin', 'hr', 'hr_admin', 'hr_manager')
    )
  );

DROP POLICY IF EXISTS "Users can insert/update their own documents" ON public.employee_documents;
CREATE POLICY "Users can insert/update their own documents"
  ON public.employee_documents FOR ALL
  USING (
    user_id = auth.uid() OR
    company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid() AND LOWER(COALESCE(role, '')) IN ('admin', 'master', 'super_admin', 'hr', 'hr_admin', 'hr_manager')
    )
  );
