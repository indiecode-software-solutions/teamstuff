-- Multi-Tenant Cloud Drive Database Schema for CapOasis Intranet

-- 1. Folders table
CREATE TABLE IF NOT EXISTS public.folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    parent_folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    owner_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Files table
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    owner_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    r2_object_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'company', 'shared')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- 3. File Shares table
CREATE TABLE IF NOT EXISTS public.file_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    shared_with_type TEXT NOT NULL CHECK (shared_with_type IN ('user', 'company')),
    shared_with_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'download', 'edit')),
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- 4. Company Storage Accounting Ledger
CREATE TABLE IF NOT EXISTS public.company_storage (
    company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
    allocated_bytes BIGINT NOT NULL DEFAULT 5368709120, -- 5 GB Default
    used_bytes BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. File Audit Logs
CREATE TABLE IF NOT EXISTS public.file_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- e.g. 'file_uploaded', 'file_downloaded', 'file_deleted', 'file_shared', 'folder_created'
    resource_type TEXT NOT NULL, -- 'file' or 'folder'
    resource_id UUID NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for high performance multi-tenant lookups
CREATE INDEX IF NOT EXISTS idx_folders_company_parent ON public.folders(company_id, parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_files_company_folder ON public.files(company_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_files_owner ON public.files(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_file_shares_file ON public.file_shares(file_id);
CREATE INDEX IF NOT EXISTS idx_file_shares_shared_with ON public.file_shares(shared_with_id);
CREATE INDEX IF NOT EXISTS idx_file_audit_logs_company ON public.file_audit_logs(company_id, created_at DESC);
