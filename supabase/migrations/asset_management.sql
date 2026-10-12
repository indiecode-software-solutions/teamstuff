-- ==========================================
-- ASSET MANAGEMENT MODULE MIGRATION
-- ==========================================

-- 1. Create company_assets table
CREATE TABLE IF NOT EXISTS public.company_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    asset_name TEXT NOT NULL,
    asset_type TEXT NOT NULL DEFAULT 'Laptop', -- 'Laptop', 'Monitor', 'Smartphone', 'SIM Card', 'Keyboard/Mouse', 'Headphones', 'Security Key', 'Vehicle', 'Other'
    serial_number TEXT,
    asset_code TEXT, -- e.g. AST-001
    brand TEXT, -- e.g. Apple, Dell, Lenovo, Samsung
    model TEXT, -- e.g. MacBook Pro 14 M3, UltraSharp 27
    purchase_date DATE,
    purchase_cost NUMERIC(12, 2),
    warranty_expiry DATE,
    status TEXT NOT NULL DEFAULT 'available', -- 'available', 'assigned', 'maintenance', 'damaged', 'retired'
    condition TEXT NOT NULL DEFAULT 'good', -- 'brand_new', 'good', 'fair', 'damaged'
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    image_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create asset_assignment_history table
CREATE TABLE IF NOT EXISTS public.asset_assignment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES public.company_assets(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    returned_at TIMESTAMPTZ,
    condition_on_assign TEXT DEFAULT 'good',
    condition_on_return TEXT,
    notes TEXT,
    performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_company_assets_company_id ON public.company_assets(company_id);
CREATE INDEX IF NOT EXISTS idx_company_assets_assigned_to ON public.company_assets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_company_assets_status ON public.company_assets(status);
CREATE INDEX IF NOT EXISTS idx_asset_history_asset_id ON public.asset_assignment_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_history_employee_id ON public.asset_assignment_history(employee_id);

-- 4. Enable Row Level Security
ALTER TABLE public.company_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_assignment_history ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Allow authenticated users to view assets belonging to their company
CREATE POLICY "Allow view company assets"
ON public.company_assets
FOR SELECT
TO authenticated
USING (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

-- Allow authenticated users with admin/hr/manager role to insert/update/delete assets
CREATE POLICY "Allow manage company assets"
ON public.company_assets
FOR ALL
TO authenticated
USING (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
)
WITH CHECK (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

-- Allow viewing assignment history for company
CREATE POLICY "Allow view asset history"
ON public.asset_assignment_history
FOR SELECT
TO authenticated
USING (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

-- Allow managing assignment history for company
CREATE POLICY "Allow manage asset history"
ON public.asset_assignment_history
FOR ALL
TO authenticated
USING (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
)
WITH CHECK (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

-- 6. Create asset_requests table
CREATE TABLE IF NOT EXISTS public.asset_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL DEFAULT 'Laptop',
    reason TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    rejection_reason TEXT,
    assigned_asset_id UUID REFERENCES public.company_assets(id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_requests_company_id ON public.asset_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_asset_requests_employee_id ON public.asset_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_asset_requests_status ON public.asset_requests(status);

ALTER TABLE public.asset_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow view asset requests"
ON public.asset_requests
FOR SELECT
TO authenticated
USING (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

CREATE POLICY "Allow manage asset requests"
ON public.asset_requests
FOR ALL
TO authenticated
USING (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
)
WITH CHECK (
    company_id IN (
        SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
);

