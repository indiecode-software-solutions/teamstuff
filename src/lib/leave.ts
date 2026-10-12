import { createServerFn } from "@tanstack/react-start";
import { supabase } from "./supabase";
import { getAdminClient } from "./master.server";

export type QuotaPeriod = "annual" | "monthly";

export interface LeavePolicy {
  id: string;
  company_id: string;
  leave_type: string;
  annual_quota: number;
  quota_period?: QuotaPeriod;
}

export interface CompanyHoliday {
  id: string;
  company_id: string;
  date: string; // "YYYY-MM-DD"
  name: string;
}

export const DEFAULT_COMPANY_OFF_DAYS = [0, 6]; // Sunday + Saturday

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface CompanySettings {
  id: string;
  company_id: string;
  off_days: number[]; // day-of-week indices: 0 = Sunday, 1 = Monday, ... 6 = Saturday
}

export interface EmployeeOffDays {
  id: string;
  company_id: string;
  employee_id: string;
  off_days: number[];
  set_by: string; // 'admin' | 'request'
  notes: string | null;
}

export interface OffDayOptions {
  offDays?: number[];
  holidays?: string[]; // "YYYY-MM-DD" dates to also exclude
}

/** Day-of-week index (0 = Sunday ... 6 = Saturday) for a "YYYY-MM-DD" date. */
export function getDayIndex(dateStr: string): number {
  return new Date(dateStr + "T00:00:00").getDay();
}

export function isOffDay(dateStr: string, offDays: number[]): boolean {
  return offDays.includes(getDayIndex(dateStr));
}

export async function getLeavePolicies(companyId: string): Promise<LeavePolicy[]> {
  const { data, error } = await supabase
    .from("leave_policies")
    .select("*")
    .eq("company_id", companyId)
    .order("leave_type", { ascending: true });
  if (error) console.error("Failed to load leave policies:", error);
  return data || [];
}

export async function getCompanyHolidays(companyId: string): Promise<CompanyHoliday[]> {
  const { data, error } = await supabase
    .from("company_holidays")
    .select("*")
    .eq("company_id", companyId)
    .order("date", { ascending: true });
  if (error) console.error("Failed to load holidays:", error);
  return data || [];
}

/**
 * Fetches the company-wide weekly off-day configuration. Falls back to the
 * default (Saturday + Sunday) when the company has not customized it yet.
 */
export async function getCompanyOffDays(companyId: string): Promise<number[]> {
  const { data, error } = await supabase
    .from("company_settings")
    .select("off_days")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) console.error("Failed to load company off days:", error);
  return data?.off_days?.length ? data.off_days : DEFAULT_COMPANY_OFF_DAYS;
}

/**
 * Fetches an employee's custom weekly off-day configuration. Returns null when
 * the employee has no custom schedule (falls back to the company default).
 */
export async function getEmployeeOffDays(
  companyId: string,
  employeeId: string,
): Promise<number[] | null> {
  const { data, error } = await supabase
    .from("employee_off_days")
    .select("off_days")
    .eq("company_id", companyId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (error) console.error("Failed to load employee off days:", error);
  return data?.off_days?.length ? data.off_days : null;
}

/**
 * Convenience helper: returns the effective weekly off days for an employee,
 * i.e. their custom schedule when set, otherwise the company defaults.
 */
export async function getEmployeeEffectiveOffDays(
  companyId: string,
  employeeId: string,
): Promise<number[]> {
  const custom = await getEmployeeOffDays(companyId, employeeId);
  if (custom) return custom;
  return getCompanyOffDays(companyId);
}

/** Saves the company-wide weekly off days, inserting a settings row if needed. */
export async function saveCompanyOffDays(
  companyId: string,
  offDays: number[],
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("company_settings").upsert(
    {
      company_id: companyId,
      off_days: offDays,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Saves (or updates) an employee's custom weekly off days. */
export async function saveEmployeeOffDays(
  companyId: string,
  employeeId: string,
  offDays: number[],
  setBy: "admin" | "request" = "admin",
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from("employee_off_days").upsert(
    {
      company_id: companyId,
      employee_id: employeeId,
      off_days: offDays,
      set_by: setBy,
      notes: notes ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,employee_id" },
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Deletes an employee's custom weekly off days (reverts to company default). */
export async function removeEmployeeOffDays(
  companyId: string,
  employeeId: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("employee_off_days")
    .delete()
    .eq("company_id", companyId)
    .eq("employee_id", employeeId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Queries all employees in the company who have a custom off-day schedule. */
export async function getEmployeesWithCustomOffDays(companyId: string): Promise<EmployeeOffDays[]> {
  const { data, error } = await supabase
    .from("employee_off_days")
    .select("*")
    .eq("company_id", companyId);
  if (error) console.error("Failed to load employee off days:", error);
  return data || [];
}

/**
 * Server-only write used when an approved "Schedule" request is actioned.
 * Approvers are not always admins, so we bypass RLS via the service-role client
 * after verifying the actor belongs to the same company.
 */
export const applyScheduleOffDays = createServerFn({ method: "POST" })
  .validator(
    (d: {
      actorId: string;
      companyId: string;
      employeeId: string;
      offDays: number[];
      notes?: string | null;
    }) => d,
  )
  .handler(async ({ data }): Promise<{ success: boolean; error?: string }> => {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: "Database configuration error" };

    const valid =
      data.offDays.length > 0 &&
      data.offDays.every((d) => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6);
    if (!valid) return { success: false, error: "At least one valid off day is required." };

    try {
      const { data: actor } = await admin
        .from("profiles")
        .select("company_id")
        .eq("id", data.actorId)
        .maybeSingle();
      if (!actor || actor.company_id !== data.companyId) {
        return { success: false, error: "You are not part of this company." };
      }

      const { error } = await admin.from("employee_off_days").upsert(
        {
          company_id: data.companyId,
          employee_id: data.employeeId,
          off_days: data.offDays,
          set_by: "request",
          notes: data.notes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,employee_id" },
      );
      if (error) throw error;
      return { success: true };
    } catch (err) {
      console.error("Apply schedule off days exception:", err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

/**
 * Inclusive number of working days between two "YYYY-MM-DD" dates.
 * When `opts.offDays`/`opts.holidays` are provided, those dates are skipped so
 * off days and company holidays do not consume leave quota.
 */
export function getLeaveDayCount(start: string, end?: string | null, opts?: OffDayOptions): number {
  if (!start) return 0;
  const s = new Date(start + "T00:00:00");
  const e = end ? new Date(end + "T00:00:00") : s;
  const diff = Math.floor((e.getTime() - s.getTime()) / 86400000);
  const totalDays = Math.max(1, diff + 1);
  if (!opts || (opts.offDays?.length === 0 && !opts.holidays?.length)) return totalDays;

  const offDays = opts.offDays || [];
  const holidays = opts.holidays || [];
  let working = 0;
  for (let i = 0; i < totalDays; i++) {
    const cur = new Date(s.getTime() + i * 86400000);
    const dateStr = cur.toISOString().slice(0, 10);
    if (!isOffDay(dateStr, offDays) && !holidays.includes(dateStr)) working++;
  }
  return working;
}

/**
 * Days consumed by an approved leave request row.
 * Half Day / Short leaves count as half a day; everything else uses the
 * (working-day aware) date range.
 */
export function getLeaveRequestDays(
  title: string,
  startDate: string,
  endDate?: string | null,
  opts?: OffDayOptions,
): number {
  if (/Half Day|Short/i.test(title)) return 0.5;
  return getLeaveDayCount(startDate, endDate, opts);
}

export function enumerateLeaveDates(
  start: string,
  end?: string | null,
  opts?: OffDayOptions,
): string[] {
  if (!start) return [];
  const out: string[] = [];
  const s = new Date(start + "T00:00:00");
  const e = end ? new Date(end + "T00:00:00") : s;
  const offDays = opts?.offDays || [];
  const holidays = opts?.holidays || [];
  for (let d = new Date(s); d <= e && out.length < 60; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    if (isOffDay(dateStr, offDays) || holidays.includes(dateStr)) continue;
    out.push(dateStr);
  }
  return out;
}

export interface LeaveBalance {
  leaveType: string;
  quota: number;
  used: number;
  quotaPeriod: QuotaPeriod;
}

/**
 * Computes per-type balances from approved leave requests.
 * - Annual period: quota applies per calendar year, usage counted from
 *   requests whose start date falls in the given year.
 * - Monthly period: quota applies per calendar month, usage counted from
 *   requests whose start date falls in the current month.
 * Matches the title format produced by the approvals page: `${leaveType} Leave Request`.
 * When `opts` is provided, off days/holidays are excluded from the used count.
 */
export function computeLeaveBalances(
  policies: LeavePolicy[],
  approvedLeaves: { title: string; start_date: string; end_date?: string | null }[],
  year = new Date().getFullYear(),
  opts?: OffDayOptions,
): LeaveBalance[] {
  const now = new Date();
  const monthPrefix = `${year}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return policies.map((p) => {
    const quotaPeriod: QuotaPeriod = p.quota_period === "monthly" ? "monthly" : "annual";
    const inWindow = (start: string) =>
      quotaPeriod === "monthly" ? start.startsWith(monthPrefix) : start.startsWith(String(year));
    const used = approvedLeaves
      .filter(
        (r) =>
          r.title === `${p.leave_type} Leave Request` && r.start_date && inWindow(r.start_date),
      )
      .reduce((sum, r) => sum + getLeaveRequestDays(r.title, r.start_date, r.end_date, opts), 0);
    return { leaveType: p.leave_type, quota: p.annual_quota, used, quotaPeriod };
  });
}
