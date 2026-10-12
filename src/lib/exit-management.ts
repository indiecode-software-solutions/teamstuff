import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExitType = "resignation" | "termination" | "retirement";
export type ExitStatus = "pending" | "approved" | "rejected" | "in_clearance" | "completed";
export type ClearanceStatus = "pending" | "completed";

export interface ExitRequest {
  id: string;
  company_id: string;
  employee_id: string;
  initiated_by: string;
  exit_type: ExitType;
  reason: string | null;
  last_working_day: string;
  notice_period_days: number;
  notice_shortfall_days: number;
  status: ExitStatus;
  manager_remarks: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  employee?: { name: string; email: string; job_title: string; department: string };
}

export interface ClearanceTask {
  id: string;
  exit_request_id: string;
  department: string;
  task_label: string;
  status: ClearanceStatus;
  completed_by: string | null;
  completed_at: string | null;
  remarks: string | null;
  created_at: string;
}

export interface ExitInterview {
  id: string;
  exit_request_id: string;
  employee_id: string;
  primary_reason: string | null;
  manager_rating: number | null;
  culture_rating: number | null;
  growth_rating: number | null;
  wlb_rating: number | null;
  would_recommend: boolean | null;
  open_feedback: string | null;
  submitted_at: string;
}

// Default clearance task templates — auto-created when exit is approved
const DEFAULT_CLEARANCE_TASKS = [
  { department: "IT", task_label: "Revoke system/email access & collect laptop/device" },
  { department: "Finance", task_label: "Clear pending expenses, loans, and salary advances" },
  { department: "Admin", task_label: "Collect ID badge, access card, and office keys" },
  { department: "Manager", task_label: "Knowledge transfer and project handover completed" },
  { department: "HR", task_label: "Exit interview conducted and no-dues certificate issued" },
];

// ─── Fetch ────────────────────────────────────────────────────────────────────

/** Fetch all exit requests for a company (HR/Admin view) */
export async function fetchCompanyExitRequests(companyId: string): Promise<ExitRequest[]> {
  try {
    const { data, error } = await supabase
      .from("exit_requests")
      .select(`
        *,
        employee:profiles!exit_requests_employee_id_fkey(name, email, job_title, department)
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("fetchCompanyExitRequests error:", error.message);
      return [];
    }
    return (data || []) as ExitRequest[];
  } catch (err) {
    console.error("fetchCompanyExitRequests exception:", err);
    return [];
  }
}

/** Fetch the current user's own exit request (Employee self-service view) */
export async function fetchMyExitRequest(employeeId: string): Promise<ExitRequest | null> {
  try {
    const { data, error } = await supabase
      .from("exit_requests")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("fetchMyExitRequest error:", error.message);
      return null;
    }
    return data as ExitRequest | null;
  } catch (err) {
    console.error("fetchMyExitRequest exception:", err);
    return null;
  }
}

/** Fetch clearance tasks for an exit request */
export async function fetchClearanceTasks(exitRequestId: string): Promise<ClearanceTask[]> {
  try {
    const { data, error } = await supabase
      .from("exit_clearance_tasks")
      .select("*")
      .eq("exit_request_id", exitRequestId)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("fetchClearanceTasks error:", error.message);
      return [];
    }
    return (data || []) as ClearanceTask[];
  } catch (err) {
    console.error("fetchClearanceTasks exception:", err);
    return [];
  }
}

/** Fetch exit interview for an exit request */
export async function fetchExitInterview(exitRequestId: string): Promise<ExitInterview | null> {
  try {
    const { data, error } = await supabase
      .from("exit_interviews")
      .select("*")
      .eq("exit_request_id", exitRequestId)
      .maybeSingle();

    if (error) {
      console.warn("fetchExitInterview error:", error.message);
      return null;
    }
    return data as ExitInterview | null;
  } catch (err) {
    console.error("fetchExitInterview exception:", err);
    return null;
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export interface InitiateExitParams {
  companyId: string;
  employeeId: string;
  initiatedBy: string;
  exitType: ExitType;
  reason?: string;
  lastWorkingDay: string;
  noticePeriodDays?: number;
  noticeShortfallDays?: number;
}

/** Create an exit request. Returns the new exit_request id. */
export async function initiateExitRequest(params: InitiateExitParams): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const { data, error } = await supabase
      .from("exit_requests")
      .insert({
        company_id: params.companyId,
        employee_id: params.employeeId,
        initiated_by: params.initiatedBy,
        exit_type: params.exitType,
        reason: params.reason || null,
        last_working_day: params.lastWorkingDay,
        notice_period_days: params.noticePeriodDays || 0,
        notice_shortfall_days: params.noticeShortfallDays || 0,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error("initiateExitRequest error:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (err: any) {
    console.error("initiateExitRequest exception:", err);
    return { success: false, error: err.message };
  }
}

/** Approve an exit request and auto-create clearance tasks */
export async function approveExitRequest(
  exitRequestId: string,
  approverId: string,
  remarks?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: updateErr } = await supabase
      .from("exit_requests")
      .update({
        status: "in_clearance",
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        manager_remarks: remarks || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", exitRequestId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // Auto-create clearance task checklist
    const tasks = DEFAULT_CLEARANCE_TASKS.map((t) => ({
      exit_request_id: exitRequestId,
      department: t.department,
      task_label: t.task_label,
      status: "pending",
    }));

    const { error: taskErr } = await supabase.from("exit_clearance_tasks").insert(tasks);
    if (taskErr) {
      console.warn("Could not create clearance tasks:", taskErr.message);
    }

    return { success: true };
  } catch (err: any) {
    console.error("approveExitRequest exception:", err);
    return { success: false, error: err.message };
  }
}

/** Reject an exit request */
export async function rejectExitRequest(
  exitRequestId: string,
  approverId: string,
  remarks?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("exit_requests")
      .update({
        status: "rejected",
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        manager_remarks: remarks || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", exitRequestId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Mark a single clearance task as complete */
export async function completeClearanceTask(
  taskId: string,
  completedBy: string,
  remarks?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("exit_clearance_tasks")
      .update({
        status: "completed",
        completed_by: completedBy,
        completed_at: new Date().toISOString(),
        remarks: remarks || null,
      })
      .eq("id", taskId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Submit exit interview responses */
export async function submitExitInterview(
  exitRequestId: string,
  employeeId: string,
  data: {
    primaryReason?: string;
    managerRating?: number;
    cultureRating?: number;
    growthRating?: number;
    wlbRating?: number;
    wouldRecommend?: boolean;
    openFeedback?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("exit_interviews").insert({
      exit_request_id: exitRequestId,
      employee_id: employeeId,
      primary_reason: data.primaryReason || null,
      manager_rating: data.managerRating || null,
      culture_rating: data.cultureRating || null,
      growth_rating: data.growthRating || null,
      wlb_rating: data.wlbRating || null,
      would_recommend: data.wouldRecommend ?? null,
      open_feedback: data.openFeedback || null,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/** Mark the entire exit as completed (all clearance done) */
export async function markExitCompleted(exitRequestId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("exit_requests")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", exitRequestId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
