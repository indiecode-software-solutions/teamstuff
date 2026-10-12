import { supabase } from "./supabase";

export interface CompanyWorkItem {
  id: string;
  name: string;
  role?: string | null;
  profilePhoto?: string | null;
  status: string | null; // manual status, only counts if updated today
  task: string | null; // fallback: latest accepted, non-completed task title
  activeTaskCount: number; // count of assigned active tasks
  oldestTaskDays: number; // days since oldest uncompleted task was created
  workLocation: string | null;
  present: boolean;
}

const EXCLUDED_ROLES = ["admin", "partner", "master"];

interface ProfileRow {
  id: string;
  name: string | null;
  role: string | null;
  profile_photo: string | null;
  work_location: string | null;
  manual_status: string | null;
  manual_status_updated_at: string | null;
}

interface AttendanceRow {
  user_id: string;
}

interface TaskRow {
  assigned_to: string;
  title: string;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Company-wide "what's everyone working on" feed.
 * Updates:
 * - Active & Working column: only users who have set an explicit manual status today.
 *   If they also have assigned tasks, append "+X tasks" on a new line.
 * - Available section: users without a manual status today.
 *   If they have assigned tasks: "working on X active task(s)" or "is working on X tasks from the past Y days".
 *   If no tasks: "No active tasks".
 */
export async function getCompanyWork(companyId: string): Promise<CompanyWorkItem[]> {
  try {
    const todayStr = new Date().toISOString().split("T")[0];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [{ data: profiles }, { data: attendance }, { data: tasks }] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, name, role, profile_photo, work_location, manual_status, manual_status_updated_at",
        )
        .eq("company_id", companyId),
      supabase
        .from("attendance")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("date", todayStr)
        .not("clock_in", "is", null),
      supabase
        .from("tasks")
        .select("assigned_to, title, created_at, updated_at")
        .eq("company_id", companyId)
        .eq("request_status", "Accepted")
        .or("status.is.null,status.neq.Completed"),
    ]);

    const presentIds = new Set((attendance as AttendanceRow[] | null)?.map((r) => r.user_id));

    // Aggregate active tasks per user: count, latest title, and oldest creation date
    const tasksByUser = new Map<
      string,
      { count: number; latestTitle: string; latestUpdatedAt: string; oldestCreatedAt: number }
    >();

    const nowTime = Date.now();
    for (const t of (tasks as TaskRow[] | null) || []) {
      if (!t.assigned_to) continue;
      const createdTime = t.created_at ? new Date(t.created_at).getTime() : nowTime;
      const prev = tasksByUser.get(t.assigned_to);
      if (!prev) {
        tasksByUser.set(t.assigned_to, {
          count: 1,
          latestTitle: t.title,
          latestUpdatedAt: t.updated_at || t.created_at || "",
          oldestCreatedAt: createdTime,
        });
      } else {
        prev.count += 1;
        if ((t.updated_at || t.created_at || "") > prev.latestUpdatedAt) {
          prev.latestTitle = t.title;
          prev.latestUpdatedAt = t.updated_at || t.created_at || "";
        }
        if (createdTime < prev.oldestCreatedAt) {
          prev.oldestCreatedAt = createdTime;
        }
      }
    }

    return ((profiles as ProfileRow[] | null) || [])
      .filter((p) => {
        if (!p.role) return false;
        const isExcluded = EXCLUDED_ROLES.includes(p.role.toLowerCase());
        if (!isExcluded) return true;
        const updatedAt = p.manual_status_updated_at ? new Date(p.manual_status_updated_at) : null;
        const statusToday =
          p.manual_status && updatedAt && updatedAt >= todayStart ? p.manual_status : null;
        return Boolean(statusToday);
      })
      .map((p) => {
        const updatedAt = p.manual_status_updated_at ? new Date(p.manual_status_updated_at) : null;
        const statusToday =
          p.manual_status && updatedAt && updatedAt >= todayStart ? p.manual_status : null;
        const userTaskData = tasksByUser.get(p.id);
        const taskCount = userTaskData?.count || 0;
        const oldestDays = userTaskData
          ? Math.max(0, Math.floor((nowTime - userTaskData.oldestCreatedAt) / (1000 * 60 * 60 * 24)))
          : 0;

        return {
          id: p.id,
          name: p.name || "Unknown",
          role: p.role,
          profilePhoto: p.profile_photo || null,
          status: statusToday,
          task: userTaskData?.latestTitle || null,
          activeTaskCount: taskCount,
          oldestTaskDays: oldestDays,
          workLocation: p.work_location || null,
          present: presentIds.has(p.id),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error("Error fetching company work:", err);
    return [];
  }
}

/**
 * Post the current user's daily status (empty string clears it).
 */
export async function updateMyStatus(statusText: string): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.error("updateMyStatus: No authenticated user found");
      return false;
    }

    const text = statusText.trim();
    const { error } = await supabase
      .from("profiles")
      .update({
        manual_status: text || null,
        manual_status_updated_at: text ? new Date().toISOString() : null,
      })
      .eq("id", user.id);

    if (error) {
      console.error("updateMyStatus: Supabase profiles update error:", error);
    }

    return !error;
  } catch (err) {
    console.error("Error updating status:", err);
    return false;
  }
}
