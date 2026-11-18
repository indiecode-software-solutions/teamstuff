# Indicode HRMS — SaaS & Billing Engine Implementation Log

> **Reference Architecture:** simplecrm (`/Users/pranavpatil/Desktop/crm`)  
> **Target Project:** `indiecode-hrms`  
> **Status:** Active Implementation  
> **Started:** 2026-11-17  

---

## High-Level Implementation Phases

- [x] **Phase 1: Database Architecture & Multi-Tenant Billing Schema**
  - Add SaaS subscription fields to `public.companies`
  - Add `permissions jsonb` to `public.profiles`
  - Create `public.trial_enrollments` (intake leads visible in Master Panel)
  - Create `public.billing_transactions` (Razorpay ledger)
  - Implement PostgreSQL security functions (`can_manage_billing()`, `can_manage_users()`)
  - Create privilege safeguard trigger (`guard_profiles_privilege_changes`)
  - Status: **COMPLETED & VERIFIED (Migration `20261117_saas_billing_and_trial_engine.sql` executed)**
- [x] **Phase 2: Instant Trial Provisioning & Onboarding Pipeline**
  - Server provisioning pipeline (`src/lib/trial-provisioner.server.ts` & `src/lib/trial.ts`):
    - Auto-provision `companies` with 14-day trial window & calculated seat limit
    - Auto-provision `profiles` + `auth.users` with `role: 'admin'`, `manage_billing: true`
    - Seed HRMS defaults (General shift, default leave policies)
    - Send welcome email with credentials via Resend
  - Connect `src/routes/pricing.tsx` form submit to instant provisioning
  - Provide instant workspace session / login handoff
  - Status: **COMPLETED & VERIFIED (Built and integrated with instant session token minting)**
- [x] **Phase 3: Master Admin Panel Integration (`/master`)**
  - Add "Signups / Trials" tab to SaaS Master Console
  - Display trial countdown, subscription status, and conversion metrics
  - Add Master actions: Extend trial (+7d, +14d), Expire trial, Toggle billing-exempt, 1-Click Login/Impersonation
  - Status: **COMPLETED & VERIFIED**
- [x] **Phase 4: Granular Billing Permissions & Role Management**
  - Granular RBAC utilities (`src/lib/permissions.ts`):
    - `canUserManageBilling(user, company)`: decoupled billing authority
    - `canUserManageUsers(user)`: decoupled team user management
    - `isWorkspaceBillingOwner(user, company)`: protects primary workspace creator
  - HR Team Management (`src/components/hr/HRWorkspaceTabs.tsx`):
    - Billing managers can delegate `manage_billing: true/false` to other team members
    - Workspace owner billing access is permanently locked to prevent lockout
    - Subtle `Billing` badges display on authorized team members in employee directory
  - Restricted Settings View (`src/routes/settings.tsx`):
    - Only users with `canUserManageBilling` can see and access "Billing & Plans"
  - Status: **COMPLETED & VERIFIED**
- [x] **Phase 5: Seamless Razorpay Autopay & Dynamic Seat Synchronization**
  - Razorpay Subscription Engine (`src/lib/billing.server.ts` & `src/lib/billing.ts`):
    - Recurring plan resolution (`/v1/plans`) at ₹149/seat/mo
    - Subscription creation with live keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`)
    - HMAC-SHA256 signature verification (`payment_id|subscription_id`)
    - Dynamic seat synchronization (`syncSubscriptionSeatsWithRazorpay`): automatically triggers `PATCH /v1/subscriptions/{id}` when employees are onboarded or deleted
  - Settings Billing & Subscription Dashboard:
    - Live Subscription Status card with countdown and renewal dates
    - Day-15 Trial Expired Paywall (`src/components/billing/TrialExpiredPaywall.tsx`):
      - Clamps minimum seats to active employees
      - Seamless Razorpay Checkout popup with live credentials
      - Full-screen paywall blocking expired non-exempt tenants in `src/routes/__root.tsx`
  - Status: **COMPLETED & VERIFIED**
- [x] **Phase 6: SimpleCRM Billing Architecture Alignment (Automatic Per-User Model)**
  - Replaced manual seat selector with SimpleCRM's automatic per-user model
  - Created `src/components/billing/BillingSeatsView.tsx` with 3 clean cards:
    1. Workspace Plan (Active Users, Rate per User / mo, Next Renewal Estimate / mo, Set up Autopay, Manage dropdown)
    2. Active Team Roster (Bordered table, Member Name + Email, Role, Added Date, Search, Pagination)
    3. Payment & Billing History (Bordered ledger table with Date, Description, Users, Amount, Status, ID)
  - Ported minimal clean styling into `src/styles/billing.css` with strict font-weight $\le 600$
  - Integrated into `src/routes/settings.tsx`
  - Status: **COMPLETED & VERIFIED**

---

## Detailed Step-by-Step Execution Log

### Phase 1: Database Architecture & Multi-Tenant Billing Schema
- **Migration Script:** `supabase/migrations/20261117_saas_billing_and_trial_engine.sql`
- **Execution:** Successfully applied to Supabase database (Ref: `osoipbhuzjvvcyikcsnc`) via Management API.
- **Added Tables:**
  - `public.trial_enrollments`: Stores website trial requests with requested seats, company name, phone, email, and provisioned company ID. RLS locked to `service_role`.
  - `public.billing_transactions`: Stores financial ledger rows for initial activations, seat add-ons, renewals, and offline entries with Razorpay order, payment, and signature references.
- **Enhanced Tables:**
  - `public.companies`: Added `subscription_status` (`trialing`, `active`, `past_due`, `expired`, etc.), `trial_starts_at`, `trial_ends_at`, `price_per_seat_inr` (default 149), `base_price_inr` (default 2499), `base_seats_included` (10), `is_billing_exempt`, `owner_email`, `owner_phone`, `razorpay_customer_id`, `razorpay_subscription_id`, `razorpay_plan_id`, `current_period_start`, and `current_period_end`.
  - `public.profiles`: Added `permissions jsonb`, `is_active boolean`, `must_change_password boolean`, and `password_hash text`.
- **Installed Functions & Triggers:**
  - `public.current_company_id()`: Resolves active company ID for authenticated session.
  - `public.can_manage_billing()`: Grants billing access only to users with `permissions.admin.manage_billing = true` or matching `companies.owner_email`.
  - `public.can_manage_users()`: Grants user management to `role = 'admin'` or `permissions.admin.manage_users = true`.
  - `public.guard_profiles_privilege_changes()`: Enforces privilege safeguards preventing non-admins from creating admins, protecting the company owner from billing revocation, and guaranteeing at least 1 billing user per workspace.
- **Status:** **Completed & Verified**

---

### Phase 2: Instant Trial Provisioning & Onboarding Pipeline
- **Modules Created:**
  - `src/lib/trial-provisioner.server.ts`: Backend provisioning pipeline with email validation, duplicate rate-limiting, company slug deduplication, 14-day trial window generation, temporary password generation (`generateHumanTempPassword`), Supabase `auth.users` creation, `public.profiles` upsert with `{ admin: { manage_users: true, manage_billing: true } }`, default shift & leave policies seeding, silent magic link session minting, and Resend transactional welcome email.
  - `src/lib/trial.ts`: TanStack Start `enrollTrialServerFn` POST server function wrapper.
- **Frontend Integration:**
  - `src/routes/pricing.tsx`: Replaced simulated `setTimeout` with live invocation of `enrollTrialServerFn`. Added trial success modal showing provisioned company name, trial seat count, temporary credentials box with 1-click copy, and "Enter Workspace Immediately" (or "Sign In to Workspace") navigation.
- **Status:** **Completed & Verified**

---

### Phase 3: Master Admin Panel Integration (`/master`)
- **Backend Updates (`src/lib/master.ts` & `src/lib/master.server.ts`):**
  - Added `MasterTrialEnrollment` interface and extended `MasterCompany` with subscription fields (`subscription_status`, `trial_starts_at`, `trial_ends_at`, `is_billing_exempt`, `owner_email`).
  - Updated `getMasterDashboard` to query and return `trial_enrollments` alongside companies and storage metrics.
  - Added `masterUpdateSubscription` server function supporting 6 lifecycle actions: `extend_7d`, `extend_14d`, `expire`, `activate_30d`, `toggle_exempt`, and `update_seats`.
  - Added `masterImpersonateCompanyUser` server function for 1-click superadmin workspace access using silent magiclink authentication.
- **Frontend Master Console Updates (`src/routes/master.tsx`):**
  - Added **Trial Signups & Intake Leads** section in Master Console sidebar with live badge count.
  - Added Signups dashboard with summary cards (Total Trial Signups, Provisioned Workspaces, Total Requested Seats, Pending Review), multi-criteria search, status filters, and 1-click "Enter Workspace" and contact copy actions.
  - Enhanced Tenants Directory with `Subscription` column: displays color-coded badges (`Exempt`, `Paid Active`, `Trial (Nd left)`, `Trial Expired`) and quick management buttons (`+7d`, `Exempt/Paid`).
  - Added direct 1-click Impersonation button in company rows.
- **Status:** **Completed & Verified**

---

### Phase 4: Granular Billing Permissions & Role Management
- **Modules Created:**
  - `src/lib/permissions.ts`: Core permission checks (`canUserManageBilling`, `canUserManageUsers`, `isWorkspaceBillingOwner`, `getTrialDaysRemaining`, `isWorkspaceAccessAllowed`).
- **HR Team Integration (`src/components/hr/HRWorkspaceTabs.tsx`):**
  - Added billing permission delegation in the Employee Edit modal.
  - Protected workspace owner from having billing rights revoked.
  - Displayed `Billing` badges on authorized team members in the roster.
- **Settings Navigation Restriction (`src/routes/settings.tsx`):**
  - Dynamically injected the "Billing & Plans" category only for users with verified billing authority.
- **Status:** **Completed & Verified**

---

### Phase 5: Seamless Razorpay Autopay & Dynamic Seat Synchronization
- **Server Billing Engine (`src/lib/billing.server.ts` & `src/lib/billing.ts`):**
  - `createWorkspaceSubscription`: Resolves/creates monthly seat plan (₹149/seat/mo), creates Razorpay customer, initiates 120-cycle subscription, and records pending transaction.
  - `verifyWorkspaceSubscriptionPayment`: Validates HMAC-SHA256 signature (`payment_id|subscription_id`), marks transaction `paid`, activates company subscription, and converts trial enrollment.
  - `syncSubscriptionSeatsWithRazorpay`: Calculates active seats and updates Razorpay subscription quantity in real time (`PATCH https://api.razorpay.com/v1/subscriptions/{id}`) when employees are added, deactivated, or deleted.
- **Paywall & Root Protection (`src/components/billing/TrialExpiredPaywall.tsx` & `src/routes/__root.tsx`):**
  - Installed `TrialExpiredPaywall` in root layout.
  - Automatically triggered on non-exempt workspaces when the 14-day trial expires or recurring subscription lapses past the 3-day grace period.
  - Enforces minimum seats clamped to current active employees.
- **Status:** **Completed & Verified**

---

### Phase 6: SimpleCRM Billing Architecture Alignment (Automatic Per-User Model)
- **Problem Statement:** The initial billing tab included a manual seat selector ("Change Allocated Seat Capacity") which added friction and clutter. In SimpleCRM, workspace seats are never manually chosen by users; they are derived automatically from the active team roster, and Razorpay Autopay adjusts recurring debits for next month's bill seamlessly.
- **Architectural & UI Overhaul:**
  - **Component Created:** `src/components/billing/BillingSeatsView.tsx` mirroring SimpleCRM's clean 3-card layout:
    1. **Workspace Plan Card:**
       - Shows active users count, monthly rate (₹149/user/mo), and estimated next renewal total (or `Exempt` / `Next Autopay Debit`).
       - Clear footnote explaining automatic per-user scaling.
       - Clean primary action button (`Set up Autopay · ₹XXX` / `Reactivate Autopay · ₹XXX`).
       - Native `Manage ▾` dropdown with "Change Payment Method" and "Manage Users".
    2. **Active Team Roster Card:**
       - Direct tabular breakdown of all active members (`#`, `Member` [Name + Email], `Role` [Admin / Member], `Added` [Date]).
       - Built-in search filtering and pagination controls.
       - Visual proof that seat count = active roster size (zero manual steppers or sliders).
    3. **Payment & Billing History Card:**
       - Bordered ledger table showing `Date`, `Description`, `Users`, `Amount`, `Status`, and `Reference / ID`.
       - Minimal empty state when no transactions exist yet.
  - **Styles Created (`src/styles/billing.css`):**
    - Clean card structures, bordered table styles, status pills (`active`, `trialing`, `expired`), dropdown menu, and responsive layout.
    - Strict compliance with typography constraints: **all font weights $\le 600$**.
  - **Backend Synchronization:**
    - `getCompanyBillingPortalData` updated to return active `teamMembers` alongside company status and transactions.
    - Verified `syncSubscriptionSeatsWithRazorpay` triggers on every employee addition or offboarding.
  - **Base Plan & Pricing Formula Implementation (₹2,499 base tier):**
    - Corrected billing calculation via `calculateWorkspaceMonthlyPrice`:
      - Teams $\le 10$ users are billed flat ₹2,499/mo (base tier).
      - Teams $> 10$ users are billed ₹2,499 + (Extra Users × ₹149)/mo.
    - `createWorkspaceSubscription` and `syncSubscriptionSeatsWithRazorpay` now create or switch to exact Razorpay monthly plans matching this formula.
    - `BillingSeatsView` and `TrialExpiredPaywall` now clearly reflect the base tier (10 users included) and extra user breakdown with zero manual sliders.
- **Status:** **Completed & Verified**

---

## Phase 6: Admin Settings Sidebar Alignment with HR Workspace
- **Objective:** Redesign Admin Settings navigation sidebar to match the clean, unboxed, docked layout and aesthetics of the HR Workspace section (`hr-category-sidebar`).
- **Issues Identified in Admin Settings:**
  - Sidebar was enclosed within a floating rounded card (`.settings-nav-list`), isolated with a wide gap and no vertical dividing line.
  - Active nav item used flat grey background without elevation or active indicator dot.
  - Layout was constrained inside a 1320px shell rather than docking seamlessly into the workspace viewport.
- **Changes Applied:**
  1. **Full-Bleed Workspace Canvas (`.settings-page-shell`):**
     - Matches `.hr-workspace-shell` with negative margins to flush-dock to the edges of `.app-content-area`.
  2. **Dedicated Docked Sidebar (`.settings-sidebar` & `.settings-nav-list`):**
     - `width: 16rem; min-width: 16rem;` with continuous vertical `border-right: 1px solid var(--color-border);`.
     - Removed the floating card enclosure; navigation items now sit directly within the unboxed column with a sticky container.
  3. **Refined Navigation Items (`.settings-nav-item`):**
     - Icons sized to standard `18px`.
     - Inactive items: transparent background and border with muted text/icons.
     - Active item: elevated white card surface (`background-color: var(--color-surface); border: 1px solid var(--color-border); box-shadow: var(--shadow-2xs); font-weight: 600;`) with black icon, dark label, and a right-aligned active dot indicator (`.settings-nav-dot`).
  4. **Clean Content Header (`.settings-pane-header`):**
     - Aligned title and subtitle typography with `.hr-tab-title` and `.hr-tab-subtitle`, removing distracting horizontal dividing lines.
  5. **Mobile Responsiveness:**
     - Transforms gracefully into a horizontal scrolling tab strip with bottom divider on screens $\le 960\text{px}$.
  6. **Typography & System Constraints:**
     - All font weights strictly $\le 600$.
- **Status:** **Completed & Verified**
