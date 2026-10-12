import { supabase } from "./supabase";
import { createNotification } from "./notifications";
import { createServerFn } from "@tanstack/react-start";

export interface TaskAttachment {
  fileId: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  r2ObjectKey: string;
  uploadedAt: string;
  uploaderId: string;
}

export interface Task {
  id: string;
  companyId: string;
  title: string;
  description?: string;
  assignedTo: string;
  assignedBy: string;
  dueDate?: string;
  status: "Not Started" | "In Progress" | "Completed" | "Pending";
  requestStatus: "Pending" | "Accepted" | "Declined";
  createdAt: string;
  updatedAt: string;
  attachments?: TaskAttachment[];
  // Enriched fields
  assigneeName?: string;
  assigneeAvatar?: string;
  assignerName?: string;
  assignerAvatar?: string;
}

/**
 * Server function to send Twilio WhatsApp messages securely.
 */
export const sendWhatsAppNotification = createServerFn({ method: "POST" })
  .validator(
    (d: {
      to: string;
      employeeName: string;
      taskTitle: string;
      dueDate: string;
      assignerName: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    const accountSid = process.env["TWILIO_ACCOUNT_SID"];
    const authToken = process.env["TWILIO_AUTH_TOKEN"];
    const fromNumber = process.env["TWILIO_WHATSAPP_NUMBER"] || "whatsapp:+14155238886"; // Default Twilio sandbox number

    if (!accountSid || !authToken) {
      console.warn("⚠️ Twilio credentials missing from server environment variables.");
      return { success: false, error: "Twilio credentials missing" };
    }

    const { to, employeeName, taskTitle, dueDate, assignerName } = data;

    // Format recipient number (E.164 formatted whatsapp number)
    let recipient = to.replace(/[\s-()]/g, "");
    if (recipient.length === 10 && /^\d+$/.test(recipient)) {
      recipient = `+91${recipient}`; // Fallback default to India country code
    }
    if (!recipient.startsWith("+")) {
      recipient = `+${recipient}`;
    }
    const toFormatted = `whatsapp:${recipient}`;
    const fromFormatted = fromNumber.startsWith("whatsapp:")
      ? fromNumber
      : `whatsapp:${fromNumber}`;

    // SID template for Task Assigned: HX8b0b156c183945a76fc2228475d672bb
    const contentSid = "HX8b0b156c183945a76fc2228475d672bb";
    const contentVariables = JSON.stringify({
      "1": employeeName,
      "2": taskTitle,
      "3": assignerName,
      "4": dueDate || "No Due Date",
    });

    const params = new URLSearchParams();
    params.append("From", fromFormatted);
    params.append("To", toFormatted);
    params.append("ContentSid", contentSid);
    params.append("ContentVariables", contentVariables);

    try {
      const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        },
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Twilio API responded with status ${res.status}: ${errText}`);
      }

      const resData = await res.json();
      console.log(`✅ Twilio WhatsApp message sent to ${toFormatted}:`, resData.sid);
      return { success: true, sid: resData.sid };
    } catch (err: any) {
      console.error("❌ Twilio Send Error:", err.message);
      return { success: false, error: err.message };
    }
  });

/**
 * Fetch list of all company employees.
 */
export async function getCompanyEmployees(companyId: string) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, phone, profile_photo")
      .eq("company_id", companyId)
      .order("name", { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Error fetching company employees:", err);
    return [];
  }
}

/**
 * Safely parse task attachments from jsonb array or JSON string.
 */
export function parseTaskAttachments(raw: any): TaskAttachment[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Fetch tasks assigned to a specific user.
 */
export async function getTasksAssignedToUser(companyId: string, userId: string): Promise<Task[]> {
  try {
    const { data: rawTasks, error } = await supabase
      .from("tasks")
      .select("*, assignee:assigned_to ( name, profile_photo ), assigner:assigned_by ( name, profile_photo )")
      .eq("company_id", companyId)
      .eq("assigned_to", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (rawTasks || []).map((t: any) => ({
      id: t.id,
      companyId: t.company_id,
      title: t.title,
      description: t.description || undefined,
      assignedTo: t.assigned_to,
      assignedBy: t.assigned_by,
      dueDate: t.due_date || undefined,
      status: t.status,
      requestStatus: t.request_status,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      attachments: parseTaskAttachments(t.attachments),
      assigneeName: t.assignee?.name || "Unknown User",
      assigneeAvatar: t.assignee?.profile_photo || undefined,
      assignerName: t.assigner?.name || "Unknown User",
      assignerAvatar: t.assigner?.profile_photo || undefined,
    }));
  } catch (err) {
    console.error("Error fetching assigned tasks:", err);
    return [];
  }
}

/**
 * Fetch all tasks for a company (Admin / Overview view).
 */
export async function getAllCompanyTasks(companyId: string): Promise<Task[]> {
  try {
    const { data: rawTasks, error } = await supabase
      .from("tasks")
      .select("*, assignee:assigned_to ( name, profile_photo ), assigner:assigned_by ( name, profile_photo )")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (rawTasks || []).map((t: any) => ({
      id: t.id,
      companyId: t.company_id,
      title: t.title,
      description: t.description || undefined,
      assignedTo: t.assigned_to,
      assignedBy: t.assigned_by,
      dueDate: t.due_date || undefined,
      status: t.status,
      requestStatus: t.request_status,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      attachments: parseTaskAttachments(t.attachments),
      assigneeName: t.assignee?.name || "Unknown User",
      assigneeAvatar: t.assignee?.profile_photo || undefined,
      assignerName: t.assigner?.name || "Unknown User",
      assignerAvatar: t.assigner?.profile_photo || undefined,
    }));
  } catch (err) {
    console.error("Error fetching all company tasks:", err);
    return [];
  }
}

/**
 * Fetch tasks assigned by a specific user.
 */
export async function getTasksAssignedByUser(companyId: string, userId: string): Promise<Task[]> {
  try {
    const { data: rawTasks, error } = await supabase
      .from("tasks")
      .select("*, assignee:assigned_to ( name, profile_photo ), assigner:assigned_by ( name, profile_photo )")
      .eq("company_id", companyId)
      .eq("assigned_by", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (rawTasks || []).map((t: any) => ({
      id: t.id,
      companyId: t.company_id,
      title: t.title,
      description: t.description || undefined,
      assignedTo: t.assigned_to,
      assignedBy: t.assigned_by,
      dueDate: t.due_date || undefined,
      status: t.status,
      requestStatus: t.request_status,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      attachments: parseTaskAttachments(t.attachments),
      assigneeName: t.assignee?.name || "Unknown User",
      assigneeAvatar: t.assignee?.profile_photo || undefined,
      assignerName: t.assigner?.name || "Unknown User",
      assignerAvatar: t.assigner?.profile_photo || undefined,
    }));
  } catch (err) {
    console.error("Error fetching sent tasks:", err);
    return [];
  }
}

/**
 * Create a new task and trigger whatsapp notification.
 */
export async function createNewTask(params: {
  companyId: string;
  title: string;
  description?: string | undefined;
  assignedTo: string;
  assignedBy: string;
  dueDate?: string | undefined;
  status?: "Not Started" | "In Progress" | "Completed" | "Pending" | undefined;
  attachments?: TaskAttachment[] | undefined;
}): Promise<Task | null> {
  try {
    const { data: created, error } = await supabase
      .from("tasks")
      .insert({
        company_id: params.companyId,
        title: params.title,
        description: params.description || null,
        assigned_to: params.assignedTo,
        assigned_by: params.assignedBy,
        due_date: params.dueDate || null,
        status: params.status || "Not Started",
        request_status: "Accepted", // Auto-accepted initially
        attachments: params.attachments && params.attachments.length > 0 ? params.attachments : [],
      })
      .select("*, assignee:assigned_to ( name, phone ), assigner:assigned_by ( name )")
      .single();

    if (error) throw error;

    const task: Task = {
      id: created.id,
      companyId: created.company_id,
      title: created.title,
      description: created.description || undefined,
      assignedTo: created.assigned_to,
      assignedBy: created.assigned_by,
      dueDate: created.due_date || undefined,
      status: created.status,
      requestStatus: created.request_status,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
      attachments: parseTaskAttachments(created.attachments),
      assigneeName: created.assignee?.name || "Unknown User",
      assignerName: created.assigner?.name || "Unknown User",
    };

    // Trigger WhatsApp notification if assignee has a phone number
    const targetPhone = created.assignee?.phone;
    if (targetPhone) {
      console.log(`Triggering WhatsApp notification to ${targetPhone} for task "${task.title}"`);
      await sendWhatsAppNotification({
        data: {
          to: targetPhone,
          employeeName: task.assigneeName || "Employee",
          taskTitle: task.title,
          dueDate: task.dueDate || "No Due Date",
          assignerName: task.assignerName || "Manager",
        },
      }).catch((e) => console.error("Failed to send WhatsApp:", e));
    }

    // In-app notification for the assignee
    if (params.assignedTo !== params.assignedBy) {
      await createNotification({
        userId: params.assignedTo,
        actorId: params.assignedBy,
        type: "task_assigned",
        title: "New Task Assigned",
        description: `You have been assigned "${task.title}"${
          task.dueDate ? ` (due ${task.dueDate})` : ""
        }`,
        link: "/tasks",
      });

      // Trigger FCM push notification via Supabase Edge Function
      console.log(`Invoking push-notifications edge function for user: ${params.assignedTo}`);
      void supabase.functions
        .invoke("push-notifications", {
          body: {
            targetUserId: params.assignedTo,
            title: "New Task Assigned",
            body: `You have been assigned "${task.title}"${
              task.dueDate ? ` (due ${task.dueDate})` : ""
            }`,
            link: "/tasks",
          },
        })
        .then((res) => {
          console.log("FCM push function invoke response:", res);
        })
        .catch((e) => {
          console.error("FCM push function invoke error:", e);
        });
    }

    return task;
  } catch (err) {
    console.error("Error creating task:", err);
    return null;
  }
}

/**
 * Update the status of a task.
 */
export async function updateTaskStatus(
  taskId: string,
  status: "Not Started" | "In Progress" | "Completed" | "Pending",
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("tasks")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", taskId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Error updating task status:", err);
    return false;
  }
}

/**
 * Add an attachment to an existing task.
 */
export async function addTaskAttachment(taskId: string, attachment: TaskAttachment): Promise<boolean> {
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from("tasks")
      .select("attachments")
      .eq("id", taskId)
      .maybeSingle();

    if (fetchErr || !existing) return false;

    const currentAttachments = parseTaskAttachments(existing.attachments);
    const updatedAttachments = [...currentAttachments, attachment];

    const { error: updateErr } = await supabase
      .from("tasks")
      .update({ attachments: updatedAttachments, updated_at: new Date().toISOString() })
      .eq("id", taskId);

    if (updateErr) throw updateErr;
    return true;
  } catch (err) {
    console.error("Error adding task attachment:", err);
    return false;
  }
}

/**
 * Remove an attachment from a task record.
 */
export async function removeTaskAttachment(taskId: string, fileId: string): Promise<boolean> {
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from("tasks")
      .select("attachments")
      .eq("id", taskId)
      .maybeSingle();

    if (fetchErr || !existing) return false;

    const currentAttachments = parseTaskAttachments(existing.attachments);
    const updatedAttachments = currentAttachments.filter((att) => att.fileId !== fileId);

    const { error: updateErr } = await supabase
      .from("tasks")
      .update({ attachments: updatedAttachments, updated_at: new Date().toISOString() })
      .eq("id", taskId);

    if (updateErr) throw updateErr;
    return true;
  } catch (err) {
    console.error("Error removing task attachment:", err);
    return false;
  }
}
