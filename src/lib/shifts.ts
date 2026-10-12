import { createServerFn } from "@tanstack/react-start";
import { getAdminClient } from "./master.server";
import { supabase } from "./supabase";

export interface CompanyShift {
  id: string;
  companyId: string;
  name: string;
  startTime: string; // "HH:MM" 24h
  endTime: string; // "HH:MM" 24h
  isDefault: boolean;
  lateMarkPolicyId: string | null;
}

export type LateMarkPenaltyType = "half_day_after_marks" | "marks_to_half_day";

export interface LateMarkPolicy {
  id: string;
  companyId: string;
  name: string;
  penaltyType: LateMarkPenaltyType;
  lateMarksCount: number;
  graceMinutes: number;
}

export const LATE_MARK_PENALTY_LABELS: Record<LateMarkPenaltyType, string> = {
  half_day_after_marks: "Half day after N late marks",
  marks_to_half_day: "N late marks = 1 half day",
};

export function describeLateMarkPolicy(p: LateMarkPolicy): string {
  const graceStr = typeof p.graceMinutes === "number" ? ` (after ${p.graceMinutes}m grace)` : "";
  return p.penaltyType === "half_day_after_marks"
    ? `After ${p.lateMarksCount} late marks${graceStr} in a month, subsequent late punches count as half days`
    : `Every ${p.lateMarksCount} late marks${graceStr} are counted as 1 half day`;
}

/**
 * Fetch the late mark policy templates defined for a company (authenticated
 * users can read their own company's policies via RLS).
 */
export async function getLateMarkPolicies(companyId: string): Promise<LateMarkPolicy[]> {
  try {
    const { data } = await supabase
      .from("late_mark_policies")
      .select("id, company_id, name, penalty_type, late_marks_count, grace_minutes")
      .eq("company_id", companyId)
      .order("name");
    return (data || []).map((s: any) => ({
      id: s.id,
      companyId: s.company_id,
      name: s.name,
      penaltyType: s.penalty_type as LateMarkPenaltyType,
      lateMarksCount: s.late_marks_count,
      graceMinutes: typeof s.grace_minutes === "number" ? s.grace_minutes : 10,
    }));
  } catch (err) {
    console.error("Error fetching late mark policies:", err);
    return [];
  }
}

/**
 * Fetch the shift templates defined for a company (authenticated users can
 * read their own company's shifts via RLS).
 */
export async function getCompanyShifts(companyId: string): Promise<CompanyShift[]> {
  try {
    const { data } = await supabase
      .from("shifts")
      .select("id, company_id, name, start_time, end_time, is_default, late_mark_policy_id")
      .eq("company_id", companyId)
      .order("is_default", { ascending: false })
      .order("name");
    return (data || []).map((s: any) => ({
      id: s.id,
      companyId: s.company_id,
      name: s.name,
      startTime: s.start_time,
      endTime: s.end_time,
      isDefault: s.is_default,
      lateMarkPolicyId: s.late_mark_policy_id ?? null,
    }));
  } catch (err) {
    console.error("Error fetching shifts:", err);
    return [];
  }
}

interface SaveShiftParams {
  userId: string; // caller auth id (verified server-side)
  companyId: string;
  id?: string; // present when editing an existing shift
  name: string;
  startTime: string;
  endTime: string;
  isDefault: boolean;
  lateMarkPolicyId?: string | null;
}

async function assertAdmin(
  admin: NonNullable<ReturnType<typeof getAdminClient>>,
  userId: string,
  companyId: string,
): Promise<boolean> {
  const { data: me } = await admin
    .from("profiles")
    .select("company_id, role")
    .eq("id", userId)
    .maybeSingle();
  return !!me && me.company_id === companyId && me.role === "admin";
}

/**
 * Create or update a shift template for the company. Only admins may manage
 * shifts. Setting one shift as default clears the flag on the others.
 */
export const saveShift = createServerFn({ method: "POST" })
  .validator((d: SaveShiftParams) => d)
  .handler(async ({ data }): Promise<{ success: boolean; error?: string }> => {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: "Database configuration error" };

    if (!(await assertAdmin(admin, data.userId, data.companyId))) {
      return { success: false, error: "Only company admins can manage shifts." };
    }

    const name = data.name.trim();
    if (!name || !data.startTime || !data.endTime) {
      return { success: false, error: "Name and shift timings are required." };
    }
    if (data.startTime >= data.endTime) {
      return { success: false, error: "Shift start time must be earlier than end time." };
    }

    try {
      if (data.isDefault) {
        await admin
          .from("shifts")
          .update({ is_default: false, updated_at: new Date().toISOString() })
          .eq("company_id", data.companyId);
      }
      const policyId = data.lateMarkPolicyId || null;
      if (data.id) {
        const { error } = await admin
          .from("shifts")
          .update({
            name,
            start_time: data.startTime,
            end_time: data.endTime,
            is_default: data.isDefault,
            late_mark_policy_id: policyId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.id)
          .eq("company_id", data.companyId);
        if (error) throw error;
      } else {
        const { error } = await admin.from("shifts").insert({
          company_id: data.companyId,
          name,
          start_time: data.startTime,
          end_time: data.endTime,
          is_default: data.isDefault,
          late_mark_policy_id: policyId,
        });
        if (error) throw error;
      }
      return { success: true };
    } catch (err: any) {
      console.error("Save shift exception:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * Delete a shift template. Employees assigned to it fall back to the company
 * default timing (shift_id is set to null by the FK).
 */
export const deleteShift = createServerFn({ method: "POST" })
  .validator((d: { userId: string; shiftId: string; companyId: string }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; error?: string }> => {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: "Database configuration error" };

    if (!(await assertAdmin(admin, data.userId, data.companyId))) {
      return { success: false, error: "Only company admins can manage shifts." };
    }

    try {
      const { error } = await admin
        .from("shifts")
        .delete()
        .eq("id", data.shiftId)
        .eq("company_id", data.companyId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Delete shift exception:", err);
      return { success: false, error: err.message };
    }
  });

interface SaveLateMarkPolicyParams {
  userId: string;
  companyId: string;
  id?: string;
  name: string;
  penaltyType: LateMarkPenaltyType;
  lateMarksCount: number;
  graceMinutes?: number;
}

/**
 * Create or update a late mark policy for the company. Only admins may manage
 * policies.
 */
export const saveLateMarkPolicy = createServerFn({ method: "POST" })
  .validator((d: SaveLateMarkPolicyParams) => d)
  .handler(async ({ data }): Promise<{ success: boolean; error?: string }> => {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: "Database configuration error" };

    if (!(await assertAdmin(admin, data.userId, data.companyId))) {
      return { success: false, error: "Only company admins can manage late mark policies." };
    }

    const name = data.name.trim();
    if (!name) return { success: false, error: "Policy name is required." };
    if (data.penaltyType !== "half_day_after_marks" && data.penaltyType !== "marks_to_half_day") {
      return { success: false, error: "Invalid penalty type." };
    }
    if (!Number.isInteger(data.lateMarksCount) || data.lateMarksCount < 1) {
      return { success: false, error: "Late marks count must be a whole number of at least 1." };
    }
    const graceMinutes =
      typeof data.graceMinutes === "number" && !isNaN(data.graceMinutes) && data.graceMinutes >= 0
        ? data.graceMinutes
        : 10;

    try {
      if (data.id) {
        let { error } = await admin
          .from("late_mark_policies")
          .update({
            name,
            penalty_type: data.penaltyType,
            late_marks_count: data.lateMarksCount,
            grace_minutes: graceMinutes,
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.id)
          .eq("company_id", data.companyId);

        if (error && (error.code === "PGRST204" || error.message?.includes("grace_minutes"))) {
          // Graceful fallback if column not yet migrated
          const fallback = await admin
            .from("late_mark_policies")
            .update({
              name,
              penalty_type: data.penaltyType,
              late_marks_count: data.lateMarksCount,
              updated_at: new Date().toISOString(),
            })
            .eq("id", data.id)
            .eq("company_id", data.companyId);
          error = fallback.error;
        }
        if (error) throw error;
      } else {
        let { error } = await admin.from("late_mark_policies").insert({
          company_id: data.companyId,
          name,
          penalty_type: data.penaltyType,
          late_marks_count: data.lateMarksCount,
          grace_minutes: graceMinutes,
        });

        if (error && (error.code === "PGRST204" || error.message?.includes("grace_minutes"))) {
          // Graceful fallback if column not yet migrated
          const fallback = await admin.from("late_mark_policies").insert({
            company_id: data.companyId,
            name,
            penalty_type: data.penaltyType,
            late_marks_count: data.lateMarksCount,
          });
          error = fallback.error;
        }
        if (error) throw error;
      }
      return { success: true };
    } catch (err: any) {
      console.error("Save late mark policy exception:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * Delete a late mark policy. Shifts (and the company default) referencing it
 * fall back to no policy (FK is set to null).
 */
export const deleteLateMarkPolicy = createServerFn({ method: "POST" })
  .validator((d: { userId: string; policyId: string; companyId: string }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; error?: string }> => {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: "Database configuration error" };

    if (!(await assertAdmin(admin, data.userId, data.companyId))) {
      return { success: false, error: "Only company admins can manage late mark policies." };
    }

    try {
      const { error } = await admin
        .from("late_mark_policies")
        .delete()
        .eq("id", data.policyId)
        .eq("company_id", data.companyId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Delete late mark policy exception:", err);
      return { success: false, error: err.message };
    }
  });
