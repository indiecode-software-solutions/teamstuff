-- ============================================================================
-- Indicode HRMS — SaaS Multi-Tenant Billing & Instant Trial Engine Migration
-- Adds SaaS lifecycle columns to companies, permissions to profiles,
-- creates trial_enrollments & billing_transactions tables, and installs
-- granular billing security functions & triggers.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. COMPANIES (SaaS Lifecycle & Razorpay Columns)
-- ----------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'trialing',
  ADD COLUMN IF NOT EXISTS trial_starts_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  ADD COLUMN IF NOT EXISTS price_per_seat_inr integer NOT NULL DEFAULT 149,
  ADD COLUMN IF NOT EXISTS base_price_inr integer NOT NULL DEFAULT 2499,
  ADD COLUMN IF NOT EXISTS base_seats_included integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS is_billing_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS owner_phone text,
  ADD COLUMN IF NOT EXISTS razorpay_customer_id text,
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id text,
  ADD COLUMN IF NOT EXISTS razorpay_plan_id text,
  ADD COLUMN IF NOT EXISTS current_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Ensure existing active companies remain active & exempt from trial lockout
UPDATE public.companies
SET subscription_status = 'active',
    is_billing_exempt = true
WHERE status = 'active' AND (subscription_status IS NULL OR subscription_status = 'trialing');

CREATE INDEX IF NOT EXISTS idx_companies_sub_status ON public.companies(subscription_status);
CREATE INDEX IF NOT EXISTS idx_companies_owner_email ON public.companies(lower(owner_email));

-- ----------------------------------------------------------------------------
-- 2. PROFILES (RBAC Permissions & Auth Safeguards)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_hash text;

CREATE INDEX IF NOT EXISTS idx_profiles_company ON public.profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(lower(email));

-- ----------------------------------------------------------------------------
-- 3. TRIAL ENROLLMENTS (Public Intake Leads for Master Panel)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trial_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  company_name text,
  work_email text NOT NULL,
  phone text NOT NULL,
  requested_seats integer NOT NULL DEFAULT 10 CHECK (requested_seats >= 1),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'provisioned', 'converted', 'churned')),
  provisioned_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trial_enrollments_email
  ON public.trial_enrollments (lower(work_email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trial_enrollments_status
  ON public.trial_enrollments (status, created_at DESC);

ALTER TABLE public.trial_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_trial_enrollments" ON public.trial_enrollments;
CREATE POLICY "service_role_trial_enrollments"
  ON public.trial_enrollments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 4. BILLING TRANSACTIONS (Financial Audit Ledger)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transaction_type text NOT NULL
    CHECK (transaction_type IN ('initial_activation', 'seat_addon', 'renewal', 'plan_upgrade', 'manual_offline')),
  seats_delta integer NOT NULL DEFAULT 0,
  amount_inr numeric(12, 2) NOT NULL,
  unit_price_inr integer NOT NULL DEFAULT 149,
  currency text NOT NULL DEFAULT 'INR',
  razorpay_order_id text UNIQUE,
  razorpay_payment_id text UNIQUE,
  razorpay_signature text,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'paid', 'failed', 'refunded')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_tx_company
  ON public.billing_transactions(company_id, created_at DESC);

ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 5. SECURITY & HELPER FUNCTIONS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_billing()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    LEFT JOIN public.companies c ON c.id = p.company_id
    WHERE p.id = auth.uid()
      AND (
        lower(COALESCE(p.permissions -> 'admin' ->> 'manage_billing', '')) = 'true'
        OR (
          c.owner_email IS NOT NULL
          AND length(trim(c.owner_email)) > 0
          AND lower(trim(COALESCE(p.email, p.work_email, ''))) = lower(trim(c.owner_email))
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_billing() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_billing() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_users()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        p.role = 'admin'
        OR lower(COALESCE(p.permissions -> 'admin' ->> 'manage_users', '')) = 'true'
        OR lower(COALESCE(p.permissions ->> 'manage_users', '')) = 'true'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_users() TO authenticated, service_role;

-- Billing Transactions RLS: only users with can_manage_billing() can see receipts
DROP POLICY IF EXISTS "tenant_billing_select" ON public.billing_transactions;
CREATE POLICY "tenant_billing_select"
  ON public.billing_transactions
  FOR SELECT
  TO authenticated
  USING (
    company_id = public.current_company_id()
    AND public.can_manage_billing()
  );

DROP POLICY IF EXISTS "service_role_billing_transactions" ON public.billing_transactions;
CREATE POLICY "service_role_billing_transactions"
  ON public.billing_transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 6. PRIVILEGE GUARD TRIGGER (Protects billing permissions & owner lock)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profiles_privilege_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_billing boolean := false;
  v_new_billing boolean := false;
  v_owner_email text;
  v_remaining_billing_count integer := 0;
  v_via_billing_rpc boolean := false;
BEGIN
  -- Bypass only for service_role backend operations or migrations
  IF auth.role() <> 'authenticated' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_via_billing_rpc := COALESCE(current_setting('app.billing_rpc_active', true), '') = 'true';
  v_new_billing := lower(COALESCE(NEW.permissions -> 'admin' ->> 'manage_billing', '')) = 'true';

  IF TG_OP = 'INSERT' THEN
    IF NEW.role = 'admin' AND NOT public.can_manage_users() THEN
      RAISE EXCEPTION 'Only workspace administrators can create admin accounts.';
    END IF;

    IF v_new_billing AND NOT public.can_manage_billing() THEN
      RAISE EXCEPTION 'You do not have permission to grant billing access.';
    END IF;

    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE'
  v_old_billing := lower(COALESCE(OLD.permissions -> 'admin' ->> 'manage_billing', '')) = 'true';

  IF NOT public.can_manage_users() AND NOT v_via_billing_rpc THEN
    IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role = 'admin' THEN
      RAISE EXCEPTION 'Only workspace administrators can assign the Admin role.';
    END IF;
    IF OLD.role = 'admin' AND NEW.role <> 'admin' THEN
      RAISE EXCEPTION 'Only workspace administrators can edit Admin accounts.';
    END IF;
  END IF;

  IF v_new_billing IS DISTINCT FROM v_old_billing THEN
    IF NOT public.can_manage_billing() THEN
      RAISE EXCEPTION 'Only users with billing access can modify billing permissions.';
    END IF;

    IF v_old_billing = true AND v_new_billing = false THEN
      SELECT owner_email
      INTO v_owner_email
      FROM public.companies
      WHERE id = OLD.company_id;

      IF v_owner_email IS NOT NULL
         AND length(trim(v_owner_email)) > 0
         AND lower(trim(COALESCE(OLD.email, OLD.work_email, ''))) = lower(trim(v_owner_email)) THEN
        RAISE EXCEPTION 'Workspace owner billing access cannot be revoked.';
      END IF;

      SELECT count(*)
      INTO v_remaining_billing_count
      FROM public.profiles p
      WHERE p.company_id = OLD.company_id
        AND p.id <> OLD.id
        AND (
          lower(COALESCE(p.permissions -> 'admin' ->> 'manage_billing', '')) = 'true'
          OR (
            v_owner_email IS NOT NULL
            AND length(trim(v_owner_email)) > 0
            AND lower(trim(COALESCE(p.email, p.work_email, ''))) = lower(trim(v_owner_email))
          )
        );

      IF v_remaining_billing_count = 0 THEN
        RAISE EXCEPTION 'At least one user in the workspace must retain billing access.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_privilege_changes ON public.profiles;
CREATE TRIGGER trg_guard_profiles_privilege_changes
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_profiles_privilege_changes();

COMMIT;
