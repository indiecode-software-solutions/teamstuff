# Indicode HRMS — SaaS Architecture & Master Operations Blueprint

> **Reference Specification for AI Agents & Developers**  
> **Source Model:** simplecrm SaaS Multi-Tenant Engine  
> **Target Application:** `indicode hrms` (Human Resource Management System)  
> **Core Stack:** PostgreSQL + Supabase (RLS & GoTrue Auth) · Deno Edge Functions · React (Vite) · Razorpay (Orders, Subscriptions & Autopay)

---

## 1. Executive Summary & Architecture Overview

This document specifies the exact architecture, database schemas, cryptographic authentication bridges, master administration workflows, and Razorpay billing pipelines implemented in **simplecrm**, adapted specifically for **Indicode HRMS**.

### High-Level SaaS Lifecycle
```
                                 [ Public Web / Landing Page ]
                                               │
                                 1. Submit 14-Day Free Trial
                                               ▼
                              [ Edge: enroll-trial / intake ]
                                               │
                                  2. Validate & Record Lead
                                               ▼
                             [ Edge: provision-company ]
                                               │
               ┌───────────────────────────────┴───────────────────────────────┐
               ▼                                                               ▼
   [ 1. Provision Workspace ]                                      [ 2. Dispatch Email ]
   - Insert companies record                                        - Welcome HTML email
   - 14-day trial window set                                        - Admin temp password
   - Seed default HRMS fixtures                                     - Direct sign-in URL
   - Create initial Admin user
               │
               ▼
   [ First Login & Auth Bridge ]
   - User verifies temporary password
   - Edge Function mints authentic Supabase JWT (with company_id in app_metadata)
   - Postgres RLS isolates all HRMS data strictly by tenant
   - User sets permanent password
               │
               ▼
   [ Day 1 to Day 14: Active Free Trial ]
   - Master Admin monitors tenant usage, employees count, and health KPIs
   - Tenant Admin adds employees up to trial seat_limit (e.g., 10 seats)
               │
               ▼
   [ Day 15: Trial Expired Paywall Triggered ]
   - If not active or exempt, app enters TrialExpiredPaywall
   - Tenant Admin selects seat count (minimum = current active employees)
   - Razorpay Checkout (One-Time Order or Recurring Subscription Autopay)
               │
               ▼
   [ Webhook / Verification ]
   - Signature verified via HMAC-SHA256
   - companies.subscription_status -> 'active'
   - companies.seat_limit bumped
   - billing_transactions ledger recorded
   - Workspace unlocks immediately
```

---

## 2. Multi-Tenant Database Schema & Strict RLS

The database utilizes **Row-Level Security (RLS)** in a shared PostgreSQL database. Every tenant-scoped table contains a `company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE`.

### 2.1 Core Tables DDL

```sql
-- 1. COMPANIES (The Tenant Anchor)
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  subscription_status text NOT NULL DEFAULT 'trialing'
    CHECK (subscription_status IN ('trialing', 'pilot_extended', 'active', 'past_due', 'expired', 'cancelled')),
  trial_starts_at timestamptz NOT NULL DEFAULT now(),
  trial_ends_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  seat_limit integer NOT NULL DEFAULT 10 CHECK (seat_limit >= 1),
  price_per_seat_inr integer NOT NULL DEFAULT 999,
  is_billing_exempt boolean NOT NULL DEFAULT false,
  owner_email text NOT NULL,
  owner_phone text,
  razorpay_customer_id text,
  razorpay_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON public.companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_status ON public.companies(subscription_status);

-- 2. HRMS USERS / EMPLOYEES AUTH TABLE
CREATE TABLE IF NOT EXISTS public.hrms_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  password_hash text,             -- PBKDF2 with 100k iterations or Argon2
  password_updated_at timestamptz,
  must_change_password boolean NOT NULL DEFAULT false,
  role text NOT NULL DEFAULT 'employee'
    CHECK (role IN ('admin', 'hr_manager', 'department_head', 'employee')),
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hrms_users_company ON public.hrms_users(company_id);
CREATE INDEX IF NOT EXISTS idx_hrms_users_email ON public.hrms_users(lower(email));

-- 3. TRIAL ENROLLMENTS (Public Intake Leads)
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

-- 4. BILLING TRANSACTIONS (Financial Audit Ledger)
CREATE TABLE IF NOT EXISTS public.billing_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  transaction_type text NOT NULL
    CHECK (transaction_type IN ('initial_activation', 'seat_addon', 'renewal')),
  seats_delta integer NOT NULL DEFAULT 0,
  amount_inr numeric(12, 2) NOT NULL,
  unit_price_inr integer NOT NULL DEFAULT 999,
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

CREATE INDEX IF NOT EXISTS idx_billing_tx_company ON public.billing_transactions(company_id, created_at DESC);

-- 5. MASTER PLATFORM ADMINS (Super-Admin Engine)
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'Super Admin',
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES public.platform_admins(id) ON DELETE SET NULL,
  admin_email text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_audit_created ON public.platform_admin_audit_logs(created_at DESC);
```

### 2.2 PostgreSQL Row-Level Security Functions & Policies

This function extracts the `company_id` from the Supabase JWT's `app_metadata` and cross-verifies that `auth.uid()` matches a valid user in that company:

```sql
-- Security Definer Tenant Function
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id
  FROM public.hrms_users
  WHERE id = auth.uid()
    AND company_id = NULLIF(auth.jwt() -> 'app_metadata' ->> 'company_id', '')::uuid
  LIMIT 1;
$$;

-- Security Definer Admin Check
CREATE OR REPLACE FUNCTION public.is_company_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.hrms_users
    WHERE id = auth.uid()
      AND company_id = public.current_company_id()
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_company_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_admin() TO authenticated, service_role;
```

#### Standard Tenant Table RLS Policy Template
Apply this policy to every tenant-specific table (e.g. `employees`, `attendance`, `leaves`, `payroll`, `departments`, `billing_transactions`):

```sql
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- 1. Authenticated tenant users: strictly limited to their own company
CREATE POLICY "hrms_tenant_isolation"
  ON public.employees
  FOR ALL
  TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- 2. Service role / backend Edge Functions: unrestricted access
CREATE POLICY "service_role_unrestricted"
  ON public.employees
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

#### Lock Down Master Tables
The `platform_admins`, `platform_admin_audit_logs`, and `trial_enrollments` tables should have RLS enabled and revoke all permissions from `anon` and `authenticated`:

```sql
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_admins TO service_role;

ALTER TABLE public.trial_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trial_enrollments FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.trial_enrollments TO service_role;
```

---

## 3. The Shadow Auth Bridge Pattern

### Why This Pattern?
Instead of exposing Supabase's default sign-up directly to public clients (which makes multi-tenant company assignment, password rules, and custom roles messy), **simplecrm** uses a **Shadow Auth Bridge**:
1. Tenant users are managed in the application table (`hrms_users`).
2. Authentication takes place in a Deno Edge Function (`auth-login`) using PBKDF2/Argon2.
3. Once validated, the backend provisions/syncs a corresponding shadow user in `auth.users` with `id = hrms_users.id` and assigns immutable claims:
   ```json
   {
     "company_id": "8bb17380-...",
     "hrms_user_id": "45f91a20-...",
     "app_role": "admin"
   }
   ```
4. It mints a native Supabase session using a silent magic link exchange (`adminClient.auth.admin.generateLink` + `anonClient.auth.verifyOtp`) **without sending any email**.
5. The frontend calls `supabase.auth.setSession(data.session)` and immediately operates within strict Postgres RLS!

### Edge Function Implementation: `ensureAuthUserAndMintSession`

```typescript
// supabase/functions/_shared/authBridge.ts
export async function ensureAuthUserAndMintSession(
  adminClient: SupabaseClient,
  anonClient: SupabaseClient,
  user: Record<string, any>
) {
  const email = String(user.email || "").trim().toLowerCase();
  const appMetadata = {
    company_id: user.company_id,
    hrms_user_id: user.id,
    app_role: user.role || "employee",
  };

  const { data: existingById } = await adminClient.auth.admin.getUserById(user.id);

  if (existingById?.user) {
    const currentMeta = existingById.user.app_metadata || {};
    const needsSync =
      existingById.user.email?.toLowerCase() !== email ||
      currentMeta.company_id !== appMetadata.company_id ||
      currentMeta.hrms_user_id !== appMetadata.hrms_user_id ||
      currentMeta.app_role !== appMetadata.app_role;

    if (needsSync) {
      await adminClient.auth.admin.updateUserById(user.id, {
        email,
        email_confirm: true,
        app_metadata: appMetadata,
        user_metadata: { name: user.name },
      });
    }
  } else {
    const { error: createErr } = await adminClient.auth.admin.createUser({
      id: user.id,
      email,
      email_confirm: true,
      app_metadata: appMetadata,
      user_metadata: { name: user.name },
    });

    if (createErr) {
      // Collision recovery if email existed under an orphan auth.users row
      const { data: listData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const matching = listData?.users?.find((u) => u.email?.toLowerCase() === email);
      if (matching) {
        await adminClient.auth.admin.deleteUser(matching.id);
        await adminClient.auth.admin.createUser({
          id: user.id,
          email,
          email_confirm: true,
          app_metadata: appMetadata,
          user_metadata: { name: user.name },
        });
      }
    }
  }

  // Mint authentic Supabase tokens without emailing the user
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const hashedToken = linkData?.properties?.hashed_token;
  if (linkErr || !hashedToken) {
    throw new Error(`Failed to generate session link: ${linkErr?.message}`);
  }

  const { data: verifiedData, error: verifyErr } = await anonClient.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });

  if (verifyErr || !verifiedData?.session) {
    throw new Error(`Failed to verify session: ${verifyErr?.message}`);
  }

  return verifiedData.session; // Returns { access_token, refresh_token, expires_in, ... }
}
```

---

## 4. Public Trial Intake & Automated Provisioning

### 4.1 Flow
1. **Public Intake (`enroll-trial`)**:
   - The user visits the landing page or `/trial` and submits: Full Name, Company Name, Work Email, Phone, and Requested Seats.
   - The Edge Function checks if an account already exists in `hrms_users`. If yes, returns `EMAIL_EXISTS` (prompting them to sign in).
   - Rate-limits duplicate submissions (1 per email per 10 minutes).
   - Inserts record into `trial_enrollments` with `status: 'pending'`.
   - Calls `provisionCompany(...)` automatically (or defers to Master Admin approval if manual review is desired).

2. **Automated Provisioner (`companyProvisioner.ts`)**:
   - Computes unique company slug (e.g. `acme-corp-1234`).
   - Inserts `companies` row:
     - `subscription_status: 'trialing'`
     - `trial_starts_at: now()`
     - `trial_ends_at: now() + 14 days`
     - `seat_limit: requestedSeats` (default: 10)
     - `price_per_seat_inr: 999`
   - Generates a human-friendly temporary password (e.g. `Welcome@8392` or `Pranav@4719`).
   - Inserts initial administrator row in `hrms_users`:
     - `role: 'admin'`
     - `must_change_password: true`
     - `permissions: { admin: { all: true, manage_billing: true } }`
   - Seeds HRMS default fixtures:
     - Default Departments (Engineering, Sales, Operations, HR).
     - Default Leave Types (Casual Leave, Sick Leave, Paid Leave).
     - Default Shifts (General 9:00 AM – 6:00 PM).
   - Dispatches transactional HTML welcome email via Resend / SMTP with login URL and credentials.

### 4.2 Temporary Password Generator
```typescript
export function generateHumanTempPassword(name = ""): string {
  const cleanName = String(name || "").trim().split(/\s+/)[0].replace(/[^a-zA-Z]/g, "");
  const prefix = cleanName.length >= 2
    ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase()
    : "Welcome";
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const digits = 1000 + (buf[0] % 9000);
  return `${prefix}@${digits}`;
}
```

---

## 5. Master Admin Operations (`/master-admin`)

The Master Admin panel is completely isolated from normal tenant logins. It runs via a dedicated endpoint `supabase/functions/platform-admin` protected by a signed HMAC `x-master-token`.

### 5.1 Supported Master Actions

| Action | Purpose | Key Parameters |
| :--- | :--- | :--- |
| `login` | Authenticate Super Admin against `platform_admins` table using PBKDF2. Mints 12-hour signed `x-master-token`. | `email`, `password` |
| `session` | Verify active master session and return admin profile. | Header `x-master-token` |
| `overview` | Multi-tenant KPI dashboard: all companies, total seats, revenue, transactions, trial enrollments, active tickets. | None |
| `company_detail` | Complete single-tenant deep dive: company data, roster, transaction history, audit trails. | `companyId` |
| `update_company_billing` | Instant lifecycle presets: `trial_14d`, `expire_trial`, `extend_pilot`, `active_30d`, `renewal_grace`, `past_due`, `toggle_exempt`, `set_price`, manual date/seat overrides. | `companyId`, `actionType`, `customDates`, `seatLimit` |
| `record_offline_payment` | Record manual bank wire/NEFT/cash payment, extend subscription period, and create `billing_transactions` ledger entry. | `companyId`, `amountInr`, `paymentMethod`, `referenceNumber`, `extendDays` |
| `create_company` | Direct provisioning of a tenant workspace from Master Admin. | `companyName`, `adminName`, `adminEmail`, `seatLimit`, `isExempt` |
| `provision_enrollment` | Convert a pending website trial lead into a live provisioned company and dispatch credentials. | `enrollmentId`, `trialDays`, `seatLimit` |
| `reset_crm_user_password` | Admin-directed password reset for any tenant employee. | `userId`, `newPassword` |
| `impersonate_crm_user` | **1-Click Tenant Impersonation**: Mints a valid tenant JWT session so super-admin can inspect the app as the user without asking for credentials. | `userId` |

### 5.2 Zero-Password Impersonation Engine
Super-admins can troubleshoot customer issues without asking for passwords:
1. Super-admin clicks **"Login as User"** in Master Panel.
2. Frontend calls `platform-admin` with action `impersonate_crm_user` and `userId`.
3. Edge Function verifies super-admin authorization, fetches user from `hrms_users`, runs `ensureAuthUserAndMintSession`, logs an audit entry in `platform_admin_audit_logs`, and returns the valid session tokens.
4. Frontend stores handoff tokens in `localStorage.setItem('hrms_support_handoff', ...)` and opens the main app in a new tab.
5. Main app detects handoff on boot, calls `supabase.auth.setSession()`, and opens the tenant workspace directly.

---

## 6. Razorpay Billing, Seats & Autopay Architecture

### 6.1 Pricing Model & Seat Management
- **Price**: ₹999 per seat / month (configurable per tenant in `companies.price_per_seat_inr`).
- **Enforcement Rule**: Active employees cannot exceed `companies.seat_limit`.
  ```sql
  -- Seat Enforcement Validation
  SELECT COUNT(*) FROM public.hrms_users
  WHERE company_id = :company_id AND is_active = true;
  -- If count >= company.seat_limit, block adding new employee until seats are expanded
  ```

### 6.2 The 4 Billing Edge Functions
1. **`razorpay-create-order`**:
   - Calculates checkout amount: `clampedSeats * price_per_seat_inr * 100` (in paise).
   - Can initialize a one-time order (`razorpay.orders.create`) or a recurring monthly plan subscription (`razorpay.subscriptions.create`).
   - Inserts pending record into `billing_transactions` with `status: 'created'`.
   - Returns `orderId` or `subscriptionId`, `amount`, and Razorpay public `key_id`.

2. **`razorpay-verify`**:
   - Receives frontend callback payload: `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`.
   - Recomputes HMAC-SHA256 signature using `RAZORPAY_KEY_SECRET`:
     ```typescript
     // Order verification:
     crypto.subtle.sign("HMAC", secretKey, `${orderId}|${paymentId}`)
     // Subscription verification:
     crypto.subtle.sign("HMAC", secretKey, `${paymentId}|${subscriptionId}`)
     ```
   - On match:
     - Updates `billing_transactions` status to `'paid'`.
     - Updates `companies`:
       - `subscription_status = 'active'`
       - `seat_limit = newSeatLimit`
       - `current_period_start = now()`
       - `current_period_end = now() + 30 days`
     - Returns updated company record.

3. **`razorpay-webhook`**:
   - Asynchronous server-to-server webhook listener from Razorpay servers.
   - Validates webhook secret signature (`X-Razorpay-Signature`).
   - Handles:
     - `payment.captured`: Reconciles any order where frontend browser closed early.
     - `subscription.charged`: Autopay renewal. Extends `current_period_end` by +30 days.
     - `payment.failed`: Flags company as `past_due` with a 3-day grace period.

4. **`razorpay-sync-subscription`**:
   - Manual or cron trigger to poll Razorpay API for live subscription state.

### 6.3 Day-15 Trial Expired Paywall (`TrialExpiredPaywall.jsx`)
If a non-exempt company has `subscription_status != 'active'` and `now() > trial_ends_at`:
1. The app renders a blocking, full-screen paywall component over all protected routes.
2. It fetches active employee count (e.g. 7 employees).
3. The seat selector slider is automatically clamped so the user cannot select fewer seats than their active employee roster (`minSeats = Math.max(1, activeEmployeeCount)`).
4. Tenant admin clicks **"Activate Subscription"**, which dynamically loads the Razorpay checkout script (`https://checkout.razorpay.com/v1/checkout.js`) and opens the payment modal.
5. On successful payment, the modal receives the verification response, unlocks the workspace, and redirects to the HRMS dashboard.

---

## 7. Adaptation Guide: SimpleCRM to Indicode HRMS

To implement this exact engine in `indicode hrms`, map the domain models as follows:

| SimpleCRM Component | Indicode HRMS Adaptation |
| :--- | :--- |
| `crm_users` | `hrms_users` (or `employees` with auth columns `password_hash`, `role`, `permissions`) |
| `pipelines` & `pipeline_stages` | `departments`, `designations`, `shifts`, and `leave_types` |
| `leads` & `deals` | `employees`, `attendance_logs`, and `payroll_runs` |
| `seat_limit` enforcement | Number of active employees on payroll roster (`WHERE is_active = true`) |
| Seed Fixtures in Provisioner | Default Departments (Engineering, Sales, HR), Leave Quotas (12 CL, 6 SL), General Shift |
| Permissions Model | `{ hr: { view: true, edit: true }, payroll: { view: true, process: true }, admin: { manage_billing: true } }` |

---

## 8. Step-by-Step Implementation Checklist for HRMS Agent

Follow this ordered sequence when developing `indicode hrms`:

### Phase 1: Database & RLS
- [ ] Run migration to create `companies`, `hrms_users`, `trial_enrollments`, `billing_transactions`, and `platform_admins`.
- [ ] Implement `public.current_company_id()` and `public.is_company_admin()` functions in PostgreSQL.
- [ ] Add `company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE` to all HRMS entity tables (`employees`, `attendance`, `leaves`, `payroll`).
- [ ] Enable RLS and apply the standard tenant isolation policy to all tables.

### Phase 2: Edge Functions & Auth Bridge
- [ ] Create `supabase/functions/_shared/authBridge.ts` with PBKDF2 hashing, CORS headers, and `ensureAuthUserAndMintSession`.
- [ ] Create `supabase/functions/auth-login/index.ts` to authenticate email + password and return Supabase session.
- [ ] Create `supabase/functions/_shared/companyProvisioner.ts` to automate company creation, slug deduplication, initial admin generation, and welcome email dispatch.
- [ ] Create `supabase/functions/enroll-trial/index.ts` for public intake from the website.

### Phase 3: Master Admin Panel
- [ ] Create `supabase/functions/platform-admin/index.ts` supporting `login`, `overview`, `company_detail`, `update_company_billing`, `record_offline_payment`, `provision_enrollment`, and `impersonate_crm_user`.
- [ ] Create frontend route `/master-admin` in React with `MasterAdminRoot.jsx`, `MasterLoginView.jsx`, and `MasterAdminShell.jsx`.
- [ ] Connect impersonation handoff logic (`storeSupportHandoff` and `consumeSupportHandoff` in `App.jsx`).

### Phase 4: Razorpay Billing & Paywall
- [ ] Create `supabase/functions/_shared/billing.ts` with signature verification and company active/locked checks.
- [ ] Create `supabase/functions/razorpay-create-order/index.ts` and `supabase/functions/razorpay-verify/index.ts`.
- [ ] Create `supabase/functions/razorpay-webhook/index.ts` to handle recurring autopay charges.
- [ ] Create `src/lib/billing.js` on the frontend with `loadRazorpayCheckoutScript` and `launchRazorpayCheckout`.
- [ ] Create `TrialExpiredPaywall.jsx` and render it conditionally in `App.jsx` whenever `isCompanyAccessLocked(company)` is true.
- [ ] Build `BillingSeatsView.jsx` inside the HRMS Settings menu for managing seats and viewing billing invoice history.

---

*Document compiled from production implementation in `simplecrm`.*  
*All patterns, crypto functions, and schema definitions are validated for multi-tenant isolation and financial compliance.*
