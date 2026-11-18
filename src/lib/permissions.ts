/**
 * permissions.ts — Granular RBAC & Billing Permissions Engine
 * Adapted from SimpleCRM architecture for Indicode HRMS.
 */

export interface UserAdminPermissions {
  manage_users?: boolean;
  manage_billing?: boolean;
  manage_routing?: boolean;
  manage_meta?: boolean;
}

export interface UserPermissions {
  admin?: UserAdminPermissions;
  [key: string]: any;
}

export interface UserContextLike {
  id?: string;
  email?: string | null;
  role?: string | null;
  permissions?: UserPermissions | null;
}

export interface CompanyContextLike {
  id?: string;
  name?: string | null;
  owner_email?: string | null;
  owner_phone?: string | null;
  subscription_status?: string | null;
  is_billing_exempt?: boolean | null;
  trial_starts_at?: string | null;
  trial_ends_at?: string | null;
  seat_limit?: number | null;
  base_seats_included?: number | null;
  base_price_inr?: number | null;
  price_per_seat_inr?: number | null;
  razorpay_customer_id?: string | null;
  razorpay_subscription_id?: string | null;
  razorpay_plan_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
}

/**
 * Checks whether the user is the original creator / owner of the workspace.
 */
export function isWorkspaceBillingOwner(
  user: UserContextLike | null | undefined,
  company: CompanyContextLike | null | undefined,
): boolean {
  if (!user?.email || !company?.owner_email) return false;
  return String(user.email).trim().toLowerCase() === String(company.owner_email).trim().toLowerCase();
}

/**
 * Checks whether the user is authorized to view and manage billing,
 * upgrade subscriptions, change seat count, and access invoices.
 *
 * Rules:
 * 1. Explicit `manage_billing: true` in user.permissions.admin.
 * 2. Workspace creator / owner (`companies.owner_email`).
 * Notice: Standard admins do NOT automatically get billing access unless granted.
 */
export function canUserManageBilling(
  user: UserContextLike | null | undefined,
  company?: CompanyContextLike | null | undefined,
): boolean {
  if (!user) return false;
  if (user.permissions?.admin?.manage_billing === true) return true;
  if (company && isWorkspaceBillingOwner(user, company)) return true;
  return false;
}

/**
 * Checks whether the user can add, edit, or remove workspace employees.
 */
export function canUserManageUsers(
  user: UserContextLike | null | undefined,
): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.permissions?.admin?.manage_users === true) return true;
  return false;
}

/**
 * Calculates remaining trial days given a company record.
 */
export function getTrialDaysRemaining(company: CompanyContextLike | null | undefined): number {
  if (!company?.trial_ends_at) return 0;
  const diffMs = new Date(company.trial_ends_at).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Determines whether the workspace is currently in an active or exempt state.
 * Returns true if the company is paid active, in active trial, or billing-exempt.
 */
export function isWorkspaceAccessAllowed(company: CompanyContextLike | null | undefined): boolean {
  if (!company) return true;
  if (company.is_billing_exempt) return true;
  if (company.subscription_status === "active") return true;
  if (company.subscription_status === "trialing") {
    return getTrialDaysRemaining(company) > 0;
  }
  return false;
}

/**
 * Calculates the monthly subscription total for a workspace based on the base tier + extra user pricing:
 * - Base Plan: ₹2,499/mo (includes up to 10 users).
 * - Additional Users: +₹149/user/mo for each user beyond 10.
 */
export function calculateWorkspaceMonthlyPrice(
  company: CompanyContextLike | null | undefined,
  activeUsersCount: number,
): {
  basePrice: number;
  baseSeats: number;
  extraSeatPrice: number;
  billableUsersCount: number;
  extraUsersCount: number;
  monthlyTotalInr: number;
} {
  const basePrice = Math.max(0, Number(company?.base_price_inr ?? 2499));
  const baseSeats = Math.max(1, Number(company?.base_seats_included ?? 10));
  const extraSeatPrice = Math.max(0, Number(company?.price_per_seat_inr ?? 149));
  const billableUsersCount = Math.max(1, activeUsersCount || 1);
  const extraUsersCount = Math.max(0, billableUsersCount - baseSeats);
  const monthlyTotalInr = basePrice + (extraUsersCount * extraSeatPrice);

  return {
    basePrice,
    baseSeats,
    extraSeatPrice,
    billableUsersCount,
    extraUsersCount,
    monthlyTotalInr,
  };
}
