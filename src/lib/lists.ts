import { supabase } from "./supabase";
import { sanitizeProfilePhoto } from "./profile-photo";

export interface CollaboratorPermissions {
  role?: "admin" | "editor" | "viewer" | "custom";
  canAddTasks: boolean;
  canRemoveTasks: boolean;
  canChangePriority: boolean;
  canMoveTasks: boolean;
  canAddStages: boolean;
  canDuplicateStages: boolean;
  canDeleteStages: boolean;
  canRenameStages: boolean;
  canConfigureStages: boolean;
  canManageCollaborators: boolean;
  canDeleteBoard: boolean;
}

export const DEFAULT_ADMIN_PERMISSIONS: CollaboratorPermissions = {
  role: "admin",
  canAddTasks: true,
  canRemoveTasks: true,
  canChangePriority: true,
  canMoveTasks: true,
  canAddStages: true,
  canDuplicateStages: true,
  canDeleteStages: true,
  canRenameStages: true,
  canConfigureStages: true,
  canManageCollaborators: true,
  canDeleteBoard: true,
};

export const DEFAULT_EDITOR_PERMISSIONS: CollaboratorPermissions = {
  role: "editor",
  canAddTasks: true,
  canRemoveTasks: true,
  canChangePriority: true,
  canMoveTasks: true,
  canAddStages: false,
  canDuplicateStages: false,
  canDeleteStages: false,
  canRenameStages: false,
  canConfigureStages: false,
  canManageCollaborators: false,
  canDeleteBoard: false,
};

export const DEFAULT_VIEWER_PERMISSIONS: CollaboratorPermissions = {
  role: "viewer",
  canAddTasks: false,
  canRemoveTasks: false,
  canChangePriority: false,
  canMoveTasks: false,
  canAddStages: false,
  canDuplicateStages: false,
  canDeleteStages: false,
  canRenameStages: false,
  canConfigureStages: false,
  canManageCollaborators: false,
  canDeleteBoard: false,
};

export function getRolePresetPermissions(role: "admin" | "editor" | "viewer" | "custom"): CollaboratorPermissions {
  if (role === "admin") return { ...DEFAULT_ADMIN_PERMISSIONS };
  if (role === "viewer") return { ...DEFAULT_VIEWER_PERMISSIONS };
  return { ...DEFAULT_EDITOR_PERMISSIONS };
}

export interface ToDoListCollaborator {
  id: string;
  name: string;
  avatarUrl?: string;
  permissions?: CollaboratorPermissions;
}

export interface ToDoActivity {
  id: string;
  user: string;
  text: string;
  createdAt: string;
}

export type KanbanColumnType = "todo" | "in_progress" | "done" | "custom";

export interface KanbanColumn {
  id: string;
  name: string;
  color?: string;
  columnType?: KanbanColumnType;
}

export const DEFAULT_KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "col_1", name: "To Do", color: "#71717a", columnType: "todo" },
  { id: "col_2", name: "In Progress", color: "#3f3f46", columnType: "in_progress" },
  { id: "col_3", name: "Done", color: "#18181b", columnType: "done" },
];

export function getColumnType(col?: KanbanColumn | null): KanbanColumnType {
  if (!col) return "todo";
  if (col.columnType === "todo" || col.columnType === "in_progress" || col.columnType === "done" || col.columnType === "custom") {
    return col.columnType;
  }
  const lower = (col.name || "").toLowerCase().trim();
  if (/(?:done|complete|completed|closed|finished|resolved|archived)/i.test(lower)) {
    return "done";
  }
  if (/(?:progress|doing|wip|active|in dev|dev|review|reviewing|testing|qa)/i.test(lower)) {
    return "in_progress";
  }
  return "todo";
}

export interface ToDoList {
  id: string;
  companyId: string;
  name: string;
  color: string;
  visibility: "private" | "shared";
  isFavorite: boolean;
  isArchived: boolean;
  ownerId: string;
  ownerName: string;
  ownerAvatarUrl?: string;
  createdAt: string;
  itemCount: number;
  completedCount: number;
  collaborators: ToDoListCollaborator[];
  activity: ToDoActivity[];
  listType?: "standard" | "kanban";
  columns?: KanbanColumn[];
  collaboratorPermissions?: Record<string, CollaboratorPermissions>;
  isPublicShareEnabled?: boolean;
  /** @deprecated Token system removed — kept for backwards compat parsing only */
  publicShareToken?: string;
  sharePermission?: "view" | "edit";
  isNotesEnabled?: boolean;
  allowPublicNotes?: boolean;
  notes?: ToDoListNote[];
  teamId?: string | null;
}

export interface ToDoListNote {
  id: string;
  listId: string;
  authorId?: string;
  authorName: string;
  authorAvatar?: string;
  targetCollaboratorId?: string;
  targetCollaboratorName?: string;
  content: string;
  createdAt: string;
  isPinned: boolean;
}

export type ToDoPriority = "High" | "Medium" | "Low";

export interface ToDoItem {
  id: string;
  listId: string;
  text: string;
  priority: ToDoPriority;
  dueDate: string | null; // ISO date (yyyy-mm-dd)
  remindAt: string | null; // ISO timestamp — device push fires at this moment
  completed: boolean;
  assigneeId?: string;
  assigneeName?: string;
  assigneeAvatar?: string;
  assignedToId?: string;
  assignedById?: string;
  assignmentStatus?: "pending" | "accepted" | "rejected";
  assignedByName?: string;
  createdAt: string;
  updatedAt?: string;
  order?: number;
  columnId?: string;
}

/** Format an ISO timestamp as a relative time label, e.g. "2 mins ago". */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Local yyyy-mm-dd for a date offset by N days from today. */
export function localDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const KANBAN_META_PREFIX = "__kanban_meta__:";

export interface KanbanMeta {
  listType: "standard" | "kanban";
  columns: KanbanColumn[];
  collaboratorPermissions?: Record<string, CollaboratorPermissions>;
  isPublicShareEnabled?: boolean;
  /** @deprecated Token system removed — kept for backwards compat parsing only */
  publicShareToken?: string;
  sharePermission?: "view" | "edit";
  isNotesEnabled?: boolean;
  allowPublicNotes?: boolean;
}

export function parseListDescriptionMeta(colorOrDesc: string | undefined): {
  color: string;
  listType: "standard" | "kanban";
  columns: KanbanColumn[];
  collaboratorPermissions: Record<string, CollaboratorPermissions>;
  isPublicShareEnabled: boolean;
  publicShareToken?: string;
  sharePermission: "view" | "edit";
  isNotesEnabled: boolean;
  allowPublicNotes: boolean;
  teamId?: string;
} {
  const fallbackColor = "#18181b";
  if (!colorOrDesc) {
    return {
      color: fallbackColor,
      listType: "standard",
      columns: [],
      collaboratorPermissions: {},
      isPublicShareEnabled: false,
      sharePermission: "view",
      isNotesEnabled: false,
      allowPublicNotes: true,
    };
  }
  if (colorOrDesc.startsWith(KANBAN_META_PREFIX) || colorOrDesc.startsWith("{")) {
    try {
      const jsonStr = colorOrDesc.startsWith(KANBAN_META_PREFIX)
        ? colorOrDesc.slice(KANBAN_META_PREFIX.length)
        : colorOrDesc;
      const parsed = JSON.parse(jsonStr);
      return {
        color: parsed.color || fallbackColor,
        listType: parsed.listType || "kanban",
        columns: Array.isArray(parsed.columns) ? parsed.columns : [],
        collaboratorPermissions: parsed.collaboratorPermissions || {},
        isPublicShareEnabled: Boolean(parsed.isPublicShareEnabled),
        publicShareToken: parsed.publicShareToken || undefined,
        sharePermission: parsed.sharePermission === "edit" ? "edit" : "view",
        isNotesEnabled: Boolean(parsed.isNotesEnabled),
        allowPublicNotes: parsed.allowPublicNotes !== undefined ? Boolean(parsed.allowPublicNotes) : true,
        teamId: parsed.teamId || parsed.team_id || undefined,
      };
    } catch {
      return {
        color: fallbackColor,
        listType: "standard",
        columns: [],
        collaboratorPermissions: {},
        isPublicShareEnabled: false,
        sharePermission: "view",
        isNotesEnabled: false,
        allowPublicNotes: true,
      };
    }
  }
  return {
    color: colorOrDesc,
    listType: "standard",
    columns: [],
    collaboratorPermissions: {},
    isPublicShareEnabled: false,
    sharePermission: "view",
    isNotesEnabled: false,
    allowPublicNotes: true,
  };
}

export function encodeListDescriptionMeta(params: {
  color: string;
  listType: "standard" | "kanban";
  columns: KanbanColumn[];
  collaboratorPermissions?: Record<string, CollaboratorPermissions>;
  isPublicShareEnabled?: boolean;
  publicShareToken?: string;
  sharePermission?: "view" | "edit";
  isNotesEnabled?: boolean;
  allowPublicNotes?: boolean;
}): string {
  if (
    params.listType === "standard" &&
    (!params.collaboratorPermissions || Object.keys(params.collaboratorPermissions).length === 0) &&
    !params.isPublicShareEnabled &&
    !params.isNotesEnabled
  ) {
    return params.color;
  }
  return `${KANBAN_META_PREFIX}${JSON.stringify({
    color: params.color,
    listType: params.listType,
    columns: params.columns,
    collaboratorPermissions: params.collaboratorPermissions || {},
    isPublicShareEnabled: Boolean(params.isPublicShareEnabled),
    publicShareToken: params.publicShareToken || undefined,
    sharePermission: params.sharePermission || "view",
    isNotesEnabled: Boolean(params.isNotesEnabled),
    allowPublicNotes: params.allowPublicNotes !== undefined ? Boolean(params.allowPublicNotes) : true,
  })}`;
}

/** Resolves effective permissions for a user given a list */
export function getEffectiveUserPermissions(list: ToDoList | null | undefined, userId: string | null | undefined): CollaboratorPermissions {
  if (!list || !userId) return { ...DEFAULT_VIEWER_PERMISSIONS };
  // List owner always has full admin permissions
  if (list.ownerId === userId) return { ...DEFAULT_ADMIN_PERMISSIONS };
  
  const granted = list.collaboratorPermissions?.[userId];
  if (granted) {
    return {
      ...granted,
      canConfigureStages:
        granted.canConfigureStages !== undefined
          ? granted.canConfigureStages
          : granted.role === "admin" || (granted.canAddStages && granted.canRenameStages),
    };
  }

  // Fallback if collaborator is on the list but has no explicit permissions record
  const isCollab = (list.collaborators || []).some((c) => c.id === userId);
  if (isCollab) return { ...DEFAULT_EDITOR_PERMISSIONS };

  return { ...DEFAULT_VIEWER_PERMISSIONS };
}

const ITEM_COLUMN_PREFIX = "[[col:";

export function parseItemColumn(text: string): {
  cleanText: string;
  columnId?: string;
  updatedAt?: string;
  order?: number;
  assignedToId?: string;
  assignedById?: string;
  assignedByName?: string;
  assignmentStatus?: "pending" | "accepted" | "rejected";
} {
  if (!text) return { cleanText: "" };
  if (text.startsWith(ITEM_COLUMN_PREFIX)) {
    const endIdx = text.indexOf("]]");
    if (endIdx > -1) {
      const meta = text.slice(ITEM_COLUMN_PREFIX.length, endIdx);
      const clean = text.slice(endIdx + 2).trim();
      let colId: string | undefined;
      let upd: string | undefined;
      let order: number | undefined;
      let assignedToId: string | undefined;
      let assignedById: string | undefined;
      let assignedByName: string | undefined;
      let assignmentStatus: "pending" | "accepted" | "rejected" | undefined;

      const parts = meta.split("|");
      colId = parts[0] || undefined;
      for (let i = 1; i < parts.length; i++) {
        const p = parts[i];
        if (p.startsWith("upd:")) {
          upd = p.slice(4);
        } else if (p.startsWith("ord:")) {
          const parsed = parseInt(p.slice(4), 10);
          if (!isNaN(parsed)) order = parsed;
        } else if (p.startsWith("asgTo:")) {
          assignedToId = p.slice(6);
        } else if (p.startsWith("asgBy:")) {
          assignedById = p.slice(6);
        } else if (p.startsWith("asgByName:")) {
          try {
            assignedByName = decodeURIComponent(p.slice(10));
          } catch {
            assignedByName = p.slice(10);
          }
        } else if (p.startsWith("asgStatus:")) {
          const s = p.slice(10);
          if (s === "pending" || s === "accepted" || s === "rejected") {
            assignmentStatus = s;
          }
        }
      }
      return {
        cleanText: clean,
        columnId: colId,
        updatedAt: upd,
        order,
        assignedToId,
        assignedById,
        assignedByName,
        assignmentStatus,
      };
    }
  }
  return { cleanText: text };
}

export function encodeItemColumn(
  text: string,
  columnId?: string,
  updatedAt?: string,
  order?: number,
  assignmentMeta?: {
    assignedToId?: string | null;
    assignedById?: string | null;
    assignedByName?: string | null;
    assignmentStatus?: "pending" | "accepted" | "rejected" | null;
  },
): string {
  const parsed = parseItemColumn(text);
  const cleanText = parsed.cleanText;
  const targetCol = columnId !== undefined ? columnId : parsed.columnId;
  const targetUpd = updatedAt !== undefined ? updatedAt : parsed.updatedAt;
  const targetOrd = order !== undefined ? order : parsed.order;

  const targetAsgTo =
    assignmentMeta !== undefined
      ? assignmentMeta.assignedToId || undefined
      : parsed.assignedToId;
  const targetAsgBy =
    assignmentMeta !== undefined
      ? assignmentMeta.assignedById || undefined
      : parsed.assignedById;
  const targetAsgByName =
    assignmentMeta !== undefined
      ? assignmentMeta.assignedByName || undefined
      : parsed.assignedByName;
  const targetStatus =
    assignmentMeta !== undefined
      ? assignmentMeta.assignmentStatus || undefined
      : parsed.assignmentStatus;

  if (
    !targetCol &&
    !targetUpd &&
    targetOrd === undefined &&
    !targetAsgTo &&
    !targetAsgBy &&
    !targetAsgByName &&
    !targetStatus
  ) {
    return cleanText;
  }
  const colPart = targetCol || "col_1";
  const updPart = targetUpd ? `|upd:${targetUpd}` : "";
  const ordPart = targetOrd !== undefined ? `|ord:${targetOrd}` : "";
  const asgToPart = targetAsgTo && targetStatus === "pending" ? `|asgTo:${targetAsgTo}` : "";
  const asgByPart = targetAsgBy && targetStatus === "pending" ? `|asgBy:${targetAsgBy}` : "";
  const asgByNamePart = targetAsgByName && targetStatus === "pending" ? `|asgByName:${encodeURIComponent(targetAsgByName)}` : "";
  const asgStatusPart = targetStatus === "pending" ? `|asgStatus:pending` : "";
  return `${ITEM_COLUMN_PREFIX}${colPart}${updPart}${ordPart}${asgToPart}${asgByPart}${asgByNamePart}${asgStatusPart}]] ${cleanText}`;
}

/**
 * Fetch all todo lists accessible to the user's company, enriched with
 * owner, collaborators, activity and item counts.
 */
export async function getToDoLists(companyId: string): Promise<ToDoList[]> {
  try {
    const { data: rawLists, error } = await supabase
      .from("todo_lists")
      .select(
        `*,
         owner:owner_id ( name, profile_photo ),
         collaborators:todo_list_collaborators ( added_at, user:user_id ( id, name, profile_photo ) )`,
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const listIds = (rawLists || []).map((l: any) => l.id);
    const itemsByList: Record<string, { total: number; completed: number }> = {};
    if (listIds.length > 0) {
      const { data: rawItems, error: itemsError } = await supabase
        .from("todo_list_items")
        .select("list_id, completed")
        .in("list_id", listIds);
      if (itemsError) throw itemsError;
      for (const it of rawItems || []) {
        const entry = itemsByList[it.list_id] || { total: 0, completed: 0 };
        entry.total += 1;
        if (it.completed) entry.completed += 1;
        itemsByList[it.list_id] = entry;
      }
    }

    const activityLists = await Promise.all(
      (rawLists || []).map(async (l: any) => {
        const { data: rawActivity } = await supabase
          .from("todo_list_activity")
          .select("id, action, created_at, actor:actor_id ( name )")
          .eq("list_id", l.id)
          .order("created_at", { ascending: false })
          .limit(5);
        return { listId: l.id as string, rawActivity: rawActivity || [] };
      }),
    );
    const activityByList: Record<string, ToDoActivity[]> = {};
    for (const { listId, rawActivity } of activityLists) {
      activityByList[listId] = rawActivity.map((a: any) => ({
        id: a.id,
        user: a.actor?.name || "Unknown User",
        text: a.action,
        createdAt: a.created_at,
      }));
    }

    // For lists linked to a team, also fetch team members to ensure all squad members are collaborators
    const teamIds = Array.from(new Set((rawLists || []).map((l: any) => l.team_id).filter(Boolean))) as string[];
    const teamMembersByTeam = new Map<string, any[]>();
    if (teamIds.length > 0) {
      try {
        const { data: teamMembersData } = await supabase
          .from("team_members")
          .select(`
            team_id,
            user:profiles(id, name, profile_photo)
          `)
          .in("team_id", teamIds);

        (teamMembersData || []).forEach((tm: any) => {
          if (tm.user) {
            const list = teamMembersByTeam.get(tm.team_id) || [];
            list.push(tm.user);
            teamMembersByTeam.set(tm.team_id, list);
          }
        });
      } catch (tmErr) {
        console.warn("Could not load team members for boards:", tmErr);
      }
    }

    return (rawLists || []).map((l: any): ToDoList => {
      const meta = parseListDescriptionMeta(l.color);

      // Explicit list collaborators
      const explicitCollabs = (l.collaborators || [])
        .filter((c: any) => c.user)
        .sort((a: any, b: any) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime())
        .map((c: any) => ({
          id: c.user.id,
          name: c.user.name || "Unknown User",
          avatarUrl: sanitizeProfilePhoto(c.user.profile_photo) || undefined,
          permissions: meta.collaboratorPermissions[c.user.id] || { ...DEFAULT_EDITOR_PERMISSIONS },
        }));

      // Team members if list is linked to a team
      const teamUsers = l.team_id ? teamMembersByTeam.get(l.team_id) || [] : [];
      const teamCollabs = teamUsers
        .filter((u: any) => u.id !== l.owner_id && !explicitCollabs.some((ec) => ec.id === u.id))
        .map((u: any) => ({
          id: u.id,
          name: u.name || "Unknown User",
          avatarUrl: sanitizeProfilePhoto(u.profile_photo) || undefined,
          permissions: meta.collaboratorPermissions[u.id] || { ...DEFAULT_EDITOR_PERMISSIONS },
        }));

      const mergedCollaborators = [...explicitCollabs, ...teamCollabs];

      return {
        id: l.id,
        companyId: l.company_id,
        name: l.name,
        color: meta.color,
        visibility: l.visibility,
        isFavorite: l.is_favorite || false,
        isArchived: l.is_archived || false,
        ownerId: l.owner_id,
        ownerName: l.owner?.name || "Unknown User",
        ownerAvatarUrl: sanitizeProfilePhoto(l.owner?.profile_photo) || undefined,
        createdAt: l.created_at,
        itemCount: itemsByList[l.id]?.total || 0,
        completedCount: itemsByList[l.id]?.completed || 0,
        collaborators: mergedCollaborators,
        activity: activityByList[l.id] || [],
        listType: meta.listType,
        columns: meta.columns,
        collaboratorPermissions: meta.collaboratorPermissions,
        isPublicShareEnabled: meta.isPublicShareEnabled,
        publicShareToken: meta.publicShareToken,
        sharePermission: meta.sharePermission,
        isNotesEnabled: meta.isNotesEnabled,
        allowPublicNotes: meta.allowPublicNotes,
        teamId: l.team_id || meta.teamId || null,
      };
    });
  } catch (err) {
    console.error("Error fetching todo lists:", err);
    return [];
  }
}

/**
 * Fetch all todo items across the company's lists.
 */
export async function getToDoItems(companyId: string): Promise<ToDoItem[]> {
  try {
    const { data: rawItems, error } = await supabase
      .from("todo_list_items")
      .select(
        `*,
         assignee:assignee_id ( name, profile_photo )`,
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    return (rawItems || []).map((t: any): ToDoItem => {
      const {
        cleanText,
        columnId,
        updatedAt: metaUpdatedAt,
        order: metaOrder,
        assignedToId,
        assignedById,
        assignedByName,
        assignmentStatus,
      } = parseItemColumn(t.text);
      return {
        id: t.id,
        listId: t.list_id,
        text: cleanText,
        priority: t.priority,
        dueDate: t.due_date || null,
        remindAt: t.remind_at || null,
        completed: t.completed || false,
        assigneeId: t.assignee_id || undefined,
        assigneeName: t.assignee?.name || undefined,
        assigneeAvatar: sanitizeProfilePhoto(t.assignee?.profile_photo) || undefined,
        assignedToId,
        assignedById,
        assignedByName,
        assignmentStatus,
        createdAt: t.created_at,
        updatedAt: metaUpdatedAt || t.updated_at || undefined,
        order: metaOrder,
        columnId,
      };
    });
  } catch (err) {
    console.error("Error fetching todo items:", err);
    return [];
  }
}

/**
 * Fetch the full activity feed for a single list.
 */
export async function getToDoListActivity(listId: string): Promise<ToDoActivity[]> {
  try {
    const { data, error } = await supabase
      .from("todo_list_activity")
      .select("id, action, created_at, actor:actor_id ( name )")
      .eq("list_id", listId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data || []).map((a: any) => ({
      id: a.id,
      user: a.actor?.name || "Unknown User",
      text: a.action,
      createdAt: a.created_at,
    }));
  } catch (err) {
    console.error("Error fetching todo list activity:", err);
    return [];
  }
}

/**
 * Create a new todo list and log the "created this list" activity.
 */
export async function createToDoList(params: {
  companyId: string;
  userId: string;
  name: string;
  visibility: "private" | "shared";
  color: string;
  isFavorite?: boolean;
  listType?: "standard" | "kanban";
  columns?: KanbanColumn[];
}): Promise<ToDoList | null> {
  try {
    const encodedColor = encodeListDescriptionMeta({
      color: params.color,
      listType: params.listType || "standard",
      columns: params.columns || [],
    });

    const { data: created, error } = await supabase
      .from("todo_lists")
      .insert({
        company_id: params.companyId,
        owner_id: params.userId,
        name: params.name,
        visibility: params.visibility,
        color: encodedColor,
        is_favorite: params.isFavorite || false,
      })
      .select("*, owner:owner_id ( name )")
      .single();
    if (error) throw error;

    await supabase.from("todo_list_activity").insert({
      list_id: created.id,
      company_id: params.companyId,
      actor_id: params.userId,
      action: params.listType === "kanban" ? "created this kanban board" : "created this list",
    });

    return {
      id: created.id,
      companyId: created.company_id,
      name: created.name,
      color: params.color,
      visibility: created.visibility,
      isFavorite: created.is_favorite || false,
      isArchived: false,
      ownerId: created.owner_id,
      ownerName: created.owner?.name || "Unknown User",
      createdAt: created.created_at,
      itemCount: 0,
      completedCount: 0,
      collaborators: [],
      activity: [],
      listType: params.listType || "standard",
      columns: params.columns || [],
    };
  } catch (err) {
    console.error("Error creating todo list:", err);
    return null;
  }
}

/**
 * Update a list's name and record activity.
 */
export async function updateToDoListName(params: {
  listId: string;
  name: string;
  companyId?: string;
  userId?: string;
  action?: string;
}): Promise<boolean> {
  try {
    const trimmed = params.name.trim();
    if (!trimmed) return false;

    const { error } = await supabase
      .from("todo_lists")
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq("id", params.listId);
    if (error) throw error;

    if (params.companyId && params.userId && params.action) {
      await supabase.from("todo_list_activity").insert({
        list_id: params.listId,
        company_id: params.companyId,
        actor_id: params.userId,
        action: params.action,
      });
    }
    return true;
  } catch (err) {
    console.error("Error updating list name:", err);
    return false;
  }
}

/**
 * Update a list's custom Kanban columns.
 * Supports both object signature and (listId, columns) positional signature.
 * IMPORTANT: Always reads the existing meta from DB first to preserve
 * isPublicShareEnabled, publicShareToken, sharePermission, and collaboratorPermissions.
 */
export async function updateToDoListColumns(
  paramsOrListId:
    | {
        listId: string;
        color?: string;
        listType?: "standard" | "kanban";
        columns: KanbanColumn[];
        companyId?: string;
        userId?: string;
        action?: string;
      }
    | string,
  columnsArg?: KanbanColumn[],
  colorArg?: string,
  listTypeArg?: "standard" | "kanban",
): Promise<boolean> {
  try {
    let listId: string;
    let color: string;
    let listType: "standard" | "kanban";
    let columns: KanbanColumn[];
    let companyId: string | undefined;
    let userId: string | undefined;
    let action: string | undefined;

    if (typeof paramsOrListId === "string") {
      listId = paramsOrListId;
      columns = columnsArg || [];
      color = colorArg || "#18181b";
      listType = listTypeArg || "kanban";
    } else {
      listId = paramsOrListId.listId;
      columns = paramsOrListId.columns || [];
      color = paramsOrListId.color || "#18181b";
      listType = paramsOrListId.listType || "kanban";
      companyId = paramsOrListId.companyId;
      userId = paramsOrListId.userId;
      action = paramsOrListId.action;
    }

    // Read existing meta so we never wipe public share or collaborator permissions
    let existingMeta: ReturnType<typeof parseListDescriptionMeta> | null = null;
    const { data: existing } = await supabase
      .from("todo_lists")
      .select("color")
      .eq("id", listId)
      .single();
    if (existing?.color) {
      existingMeta = parseListDescriptionMeta(existing.color);
    }

    const encodedColor = encodeListDescriptionMeta({
      color,
      listType,
      columns,
      // Preserve these fields from the existing record
      collaboratorPermissions: existingMeta?.collaboratorPermissions || {},
      isPublicShareEnabled: existingMeta?.isPublicShareEnabled || false,
      publicShareToken: existingMeta?.publicShareToken,
      sharePermission: existingMeta?.sharePermission || "view",
    });
    const { error } = await supabase
      .from("todo_lists")
      .update({ color: encodedColor, updated_at: new Date().toISOString() })
      .eq("id", listId);
    if (error) throw error;

    if (companyId && userId && action) {
      await supabase.from("todo_list_activity").insert({
        list_id: listId,
        company_id: companyId,
        actor_id: userId,
        action,
      });
    }
    return true;
  } catch (err) {
    console.error("Error updating list columns:", err);
    return false;
  }
}

/**
 * Update a list's public sharing configuration.
 * Token system removed — only isPublicShareEnabled matters now.
 * Always reads existing meta first to preserve columns & collaborator permissions.
 */
export async function updateToDoListSharing(params: {
  listId: string;
  isPublicShareEnabled: boolean;
  sharePermission?: "view" | "edit";
  color?: string;
  listType?: "standard" | "kanban";
  columns?: KanbanColumn[];
  collaboratorPermissions?: Record<string, CollaboratorPermissions>;
  companyId?: string;
  userId?: string;
  action?: string;
}): Promise<boolean> {
  try {
    // Read existing meta to preserve columns, collaboratorPermissions, etc.
    let existingMeta: ReturnType<typeof parseListDescriptionMeta> | null = null;
    const { data: existing } = await supabase
      .from("todo_lists")
      .select("color")
      .eq("id", params.listId)
      .single();
    if (existing?.color) {
      existingMeta = parseListDescriptionMeta(existing.color);
    }

    const encodedColor = encodeListDescriptionMeta({
      color: params.color || existingMeta?.color || "#18181b",
      listType: params.listType || existingMeta?.listType || "kanban",
      columns: params.columns || existingMeta?.columns || [],
      collaboratorPermissions: params.collaboratorPermissions || existingMeta?.collaboratorPermissions || {},
      isPublicShareEnabled: params.isPublicShareEnabled,
      // Deliberately do NOT write publicShareToken — token system is removed.
      // Existing stored tokens are preserved during read but never re-written.
      publicShareToken: undefined,
      sharePermission: params.sharePermission || existingMeta?.sharePermission || "view",
    });

    const { error } = await supabase
      .from("todo_lists")
      .update({
        color: encodedColor,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.listId);

    if (error) throw error;

    if (params.companyId && params.userId && params.action) {
      await supabase.from("todo_list_activity").insert({
        list_id: params.listId,
        company_id: params.companyId,
        actor_id: params.userId,
        action: params.action,
      });
    }
    return true;
  } catch (err) {
    console.error("Error updating list sharing:", err);
    return false;
  }
}

/**
 * Fetch a public kanban board for unauthenticated/guest users.
 * Access is gated solely on isPublicShareEnabled — no token required.
 */
export async function fetchPublicKanbanBoard(
  listId: string,
): Promise<{
  list: ToDoList;
  tasks: ToDoItem[];
  members: Array<{ id: string; name: string; avatarUrl?: string }>;
} | null> {
  try {
    let listData: any = null;
    const { data: joinedList, error: listErr } = await supabase
      .from("todo_lists")
      .select("id, company_id, name, color, visibility, is_favorite, is_archived, owner_id, team_id, created_at, owner:owner_id(name, profile_photo)")
      .eq("id", listId)
      .maybeSingle();

    if (joinedList) {
      listData = joinedList;
    } else {
      const { data: plainList, error: plainErr } = await supabase
        .from("todo_lists")
        .select("id, company_id, name, color, visibility, is_favorite, is_archived, owner_id, team_id, created_at")
        .eq("id", listId)
        .maybeSingle();

      if (plainErr || !plainList) {
        console.error("fetchPublicKanbanBoard list error:", listErr || plainErr);
        return null;
      }
      listData = plainList;
    }

    const meta = parseListDescriptionMeta(listData.color);
    // Gate: board is public share enabled or has shared visibility
    if (!meta.isPublicShareEnabled && listData.visibility !== "shared") return null;

    let rawTasks: any[] = [];
    const { data: joinedTasks, error: tasksErr } = await supabase
      .from("todo_list_items")
      .select("id, list_id, text, priority, due_date, remind_at, completed, assignee_id, created_at, assignee:assignee_id(name, profile_photo)")
      .eq("list_id", listId)
      .order("created_at", { ascending: true });

    if (joinedTasks) {
      rawTasks = joinedTasks;
    } else {
      const { data: plainTasks } = await supabase
        .from("todo_list_items")
        .select("id, list_id, text, priority, due_date, remind_at, completed, assignee_id, created_at")
        .eq("list_id", listId)
        .order("created_at", { ascending: true });
      rawTasks = plainTasks || [];
    }

    const parsedTasks = (rawTasks || []).map((t: any): ToDoItem => {
      const {
        cleanText,
        columnId,
        updatedAt: metaUpdatedAt,
        order: metaOrder,
        assignedToId,
        assignedById,
        assignedByName,
        assignmentStatus,
      } = parseItemColumn(t.text);
      return {
        id: t.id,
        listId: t.list_id,
        text: cleanText,
        priority: t.priority,
        dueDate: t.due_date || null,
        remindAt: t.remind_at || null,
        completed: t.completed || false,
        assigneeId: t.assignee_id || undefined,
        assigneeName: (t.assignee as any)?.name || undefined,
        assigneeAvatar: sanitizeProfilePhoto((t.assignee as any)?.profile_photo) || undefined,
        assignedToId,
        assignedById,
        assignedByName,
        assignmentStatus,
        createdAt: t.created_at,
        updatedAt: metaUpdatedAt || t.created_at,
        order: metaOrder,
        columnId,
      };
    });

    // Fetch collaborators for this list
    const { data: rawCollabs } = await supabase
      .from("todo_list_collaborators")
      .select("added_at, user:user_id(id, name, profile_photo)")
      .eq("list_id", listId);

    const collabs: ToDoListCollaborator[] = (rawCollabs || [])
      .filter((c: any) => c.user)
      .sort((a: any, b: any) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime())
      .map((c: any) => ({
        id: c.user.id,
        name: c.user.name || "Unknown User",
        avatarUrl: sanitizeProfilePhoto(c.user.profile_photo) || undefined,
        permissions: meta.collaboratorPermissions?.[c.user.id] || { ...DEFAULT_EDITOR_PERMISSIONS },
      }));

    // Build the full members list for assignee filtering
    const membersMap = new Map<string, { id: string; name: string; avatarUrl?: string }>();

    if (listData.owner_id) {
      membersMap.set(listData.owner_id, {
        id: listData.owner_id,
        name: (listData.owner as any)?.name || "Owner",
        avatarUrl: sanitizeProfilePhoto((listData.owner as any)?.profile_photo) || undefined,
      });
    }

    for (const c of collabs) {
      if (c.id && !membersMap.has(c.id)) {
        membersMap.set(c.id, {
          id: c.id,
          name: c.name || "Collaborator",
          avatarUrl: c.avatarUrl,
        });
      }
    }

    for (const t of parsedTasks) {
      if (t.assigneeId && !membersMap.has(t.assigneeId)) {
        membersMap.set(t.assigneeId, {
          id: t.assigneeId,
          name: t.assigneeName || "Team Member",
          avatarUrl: t.assigneeAvatar,
        });
      }
    }

    if (listData.company_id) {
      const { data: rawProfiles } = await supabase
        .from("profiles")
        .select("id, name, profile_photo")
        .eq("company_id", listData.company_id);

      for (const p of rawProfiles || []) {
        if (p.id && !membersMap.has(p.id)) {
          membersMap.set(p.id, {
            id: p.id,
            name: p.name || "Unknown",
            avatarUrl: sanitizeProfilePhoto(p.profile_photo) || undefined,
          });
        }
      }
    }

    const members = Array.from(membersMap.values());

    // Fetch activity log for the public board
    const { data: rawActivity } = await supabase
      .from("todo_list_activity")
      .select("id, action, created_at, actor:actor_id ( name )")
      .eq("list_id", listId)
      .order("created_at", { ascending: false })
      .limit(100);

    const parsedActivity: ToDoActivity[] = (rawActivity || []).map((a: any) => ({
      id: a.id,
      user: a.actor?.name || "Team Member",
      text: a.action,
      createdAt: a.created_at,
    }));

    // Fetch notes if enabled
    let parsedNotes: ToDoListNote[] = [];
    if (meta.isNotesEnabled) {
      const { data: rawNotes } = await supabase
        .from("todo_list_notes")
        .select("id, list_id, author_id, author_name, author_avatar, target_collaborator_id, content, created_at, is_pinned")
        .eq("list_id", listId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });

      parsedNotes = (rawNotes || []).map((n: any) => ({
        id: n.id,
        listId: n.list_id,
        authorId: n.author_id || undefined,
        authorName: n.author_name || "Guest",
        authorAvatar: sanitizeProfilePhoto(n.author_avatar) || undefined,
        targetCollaboratorId: n.target_collaborator_id || undefined,
        targetCollaboratorName: n.target_collaborator_id ? membersMap.get(n.target_collaborator_id)?.name : undefined,
        content: n.content,
        createdAt: n.created_at,
        isPinned: Boolean(n.is_pinned),
      }));
    }

    const parsedList: ToDoList = {
      id: listData.id,
      companyId: listData.company_id,
      name: listData.name,
      color: meta.color,
      visibility: "shared",
      isFavorite: false,
      isArchived: false,
      ownerId: listData.owner_id,
      ownerName: (listData.owner as any)?.name || "Owner",
      ownerAvatarUrl: sanitizeProfilePhoto((listData.owner as any)?.profile_photo) || undefined,
      createdAt: listData.created_at,
      itemCount: parsedTasks.length,
      completedCount: parsedTasks.filter((t) => t.completed).length,
      collaborators: collabs,
      activity: parsedActivity,
      listType: "kanban",
      columns: meta.columns,
      collaboratorPermissions: meta.collaboratorPermissions,
      isPublicShareEnabled: true,
      publicShareToken: meta.publicShareToken,
      sharePermission: meta.sharePermission,
      isNotesEnabled: meta.isNotesEnabled,
      allowPublicNotes: meta.allowPublicNotes,
      notes: parsedNotes,
      teamId: listData.team_id || meta.teamId || null,
    };

    return { list: parsedList, tasks: parsedTasks, members };
  } catch (err) {
    console.error("Error fetching public kanban board:", err);
    return null;
  }
}

/**
 * Update a list's favorite flag.
 */
export async function setToDoListFavorite(listId: string, isFavorite: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("todo_lists")
      .update({ is_favorite: isFavorite, updated_at: new Date().toISOString() })
      .eq("id", listId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Error updating todo list favorite:", err);
    return false;
  }
}

/**
 * Archive or restore a list.
 */
export async function setToDoListArchived(listId: string, isArchived: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("todo_lists")
      .update({ is_archived: isArchived, updated_at: new Date().toISOString() })
      .eq("id", listId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Error archiving todo list:", err);
    return false;
  }
}

/**
 * Delete a list (owner only). Items, collaborators and activity cascade.
 */
export async function deleteToDoList(listId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("todo_lists").delete().eq("id", listId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Error deleting todo list:", err);
    return false;
  }
}

/**
 * Add a collaborator to a list and log activity with custom permissions.
 */
export async function addToDoListCollaborator(params: {
  companyId: string;
  listId: string;
  userId: string;
  actorId: string;
  action?: string;
  permissions?: CollaboratorPermissions;
}): Promise<boolean> {
  try {
    const { error } = await supabase.from("todo_list_collaborators").upsert({
      list_id: params.listId,
      user_id: params.userId,
      added_by: params.actorId,
    });
    if (error) throw error;

    // Persist permissions in list metadata if provided
    if (params.permissions) {
      const { data: listData } = await supabase
        .from("todo_lists")
        .select("color")
        .eq("id", params.listId)
        .single();
      if (listData) {
        const meta = parseListDescriptionMeta(listData.color);
        const nextPermissions = {
          ...meta.collaboratorPermissions,
          [params.userId]: params.permissions,
        };
        const encoded = encodeListDescriptionMeta({
          color: meta.color,
          listType: meta.listType,
          columns: meta.columns,
          collaboratorPermissions: nextPermissions,
          isPublicShareEnabled: meta.isPublicShareEnabled,
          publicShareToken: meta.publicShareToken,
          sharePermission: meta.sharePermission,
        });
        await supabase
          .from("todo_lists")
          .update({ color: encoded, updated_at: new Date().toISOString() })
          .eq("id", params.listId);
      }
    }

    if (params.action) {
      await supabase.from("todo_list_activity").insert({
        list_id: params.listId,
        company_id: params.companyId,
        actor_id: params.actorId,
        action: params.action,
      });
    }
    return true;
  } catch (err) {
    console.error("Error adding collaborator:", err);
    return false;
  }
}

/**
 * Reorder multiple todo items by persisting their new encoded orders.
 */
export async function reorderToDoItems(
  updates: {
    id: string;
    text: string;
    columnId?: string;
    updatedAt?: string;
    order: number;
  }[],
): Promise<boolean> {
  try {
    await Promise.all(
      updates.map((u) => {
        const encodedText = encodeItemColumn(u.text, u.columnId, u.updatedAt, u.order);
        return supabase
          .from("todo_list_items")
          .update({ text: encodedText })
          .eq("id", u.id);
      }),
    );
    return true;
  } catch (err) {
    console.error("Error reordering todo items:", err);
    return false;
  }
}

/**
 * Update permissions for a specific collaborator on a list.
 */
export async function updateToDoListCollaboratorPermissions(params: {
  listId: string;
  userId: string;
  permissions: CollaboratorPermissions;
  companyId?: string;
  actorId?: string;
  targetUserName?: string;
}): Promise<boolean> {
  try {
    const { data: listData, error } = await supabase
      .from("todo_lists")
      .select("color")
      .eq("id", params.listId)
      .single();
    if (error || !listData) throw error || new Error("List not found");

    const meta = parseListDescriptionMeta(listData.color);
    const nextPermissions = {
      ...meta.collaboratorPermissions,
      [params.userId]: params.permissions,
    };
    const encoded = encodeListDescriptionMeta({
      color: meta.color,
      listType: meta.listType,
      columns: meta.columns,
      collaboratorPermissions: nextPermissions,
      isPublicShareEnabled: meta.isPublicShareEnabled,
      publicShareToken: meta.publicShareToken,
      sharePermission: meta.sharePermission,
    });
    const { error: updateError } = await supabase
      .from("todo_lists")
      .update({ color: encoded, updated_at: new Date().toISOString() })
      .eq("id", params.listId);
    if (updateError) throw updateError;

    if (params.companyId && params.actorId) {
      const name = params.targetUserName ? ` for ${params.targetUserName}` : "";
      await supabase.from("todo_list_activity").insert({
        list_id: params.listId,
        company_id: params.companyId,
        actor_id: params.actorId,
        action: `updated permissions${name} to ${params.permissions.role.toUpperCase()}`,
      });
    }
    return true;
  } catch (err) {
    console.error("Error updating collaborator permissions:", err);
    return false;
  }
}

/**
 * Remove a collaborator from a list.
 */
export async function removeToDoListCollaborator(params: {
  listId: string;
  userId: string;
  companyId?: string;
  actorId?: string;
  targetUserName?: string;
} | string, maybeUserId?: string): Promise<boolean> {
  try {
    const listId = typeof params === "string" ? params : params.listId;
    const userId = typeof params === "string" ? (maybeUserId || "") : params.userId;

    const { error } = await supabase
      .from("todo_list_collaborators")
      .delete()
      .eq("list_id", listId)
      .eq("user_id", userId);
    if (error) throw error;

    if (typeof params !== "string" && params.companyId && params.actorId) {
      const name = params.targetUserName ? ` ${params.targetUserName}` : "";
      await supabase.from("todo_list_activity").insert({
        list_id: params.listId,
        company_id: params.companyId,
        actor_id: params.actorId,
        action: `removed collaborator${name}`,
      });
    }
    return true;
  } catch (err) {
    console.error("Error removing collaborator:", err);
    return false;
  }
}

/**
 * Create a new item in a list and log activity.
 */
export async function createToDoItem(params: {
  companyId: string;
  listId: string;
  userId: string;
  text: string;
  priority?: ToDoPriority;
  dueDate?: string | null;
  remindAt?: string | null;
  assigneeId?: string | null;
  columnId?: string;
}): Promise<ToDoItem | null> {
  try {
    const encodedText = encodeItemColumn(params.text, params.columnId);
    const { data: created, error } = await supabase
      .from("todo_list_items")
      .insert({
        list_id: params.listId,
        company_id: params.companyId,
        text: encodedText,
        priority: params.priority || "Medium",
        due_date: params.dueDate ?? null,
        remind_at: params.remindAt ?? null,
        assignee_id: params.assigneeId ?? params.userId,
      })
      .select("*, assignee:assignee_id ( name, profile_photo )")
      .single();
    if (error) throw error;

    await supabase.from("todo_list_activity").insert({
      list_id: params.listId,
      company_id: params.companyId,
      actor_id: params.userId,
      action: `added task "${params.text.trim()}"`,
    });

    const { cleanText, columnId } = parseItemColumn(created.text);

    return {
      id: created.id,
      listId: created.list_id,
      text: cleanText,
      priority: created.priority,
      dueDate: created.due_date || null,
      remindAt: created.remind_at || null,
      completed: false,
      assigneeId: created.assignee_id || undefined,
      assigneeName: created.assignee?.name || undefined,
      assigneeAvatar: sanitizeProfilePhoto(created.assignee?.profile_photo) || undefined,
      createdAt: created.created_at,
      columnId,
    };
  } catch (err) {
    console.error("Error creating todo item:", err);
    return null;
  }
}

/**
 * Toggle an item's completed state and log completion activity.
 */
export async function toggleToDoItem(params: {
  itemId: string;
  completed: boolean;
  companyId: string;
  listId: string;
  userId: string;
  taskText?: string;
}): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("todo_list_items")
      .update({
        completed: params.completed,
        completed_at: params.completed ? new Date().toISOString() : null,
      })
      .eq("id", params.itemId);
    if (error) throw error;

    if (params.completed) {
      const taskLabel = params.taskText ? ` "${params.taskText}"` : "";
      await supabase.from("todo_list_activity").insert({
        list_id: params.listId,
        company_id: params.companyId,
        actor_id: params.userId,
        action: `completed task${taskLabel}`,
      });
    }
    return true;
  } catch (err) {
    console.error("Error toggling todo item:", err);
    return false;
  }
}

/**
 * Update an item's priority.
 */
export async function updateToDoItemPriority(params: {
  itemId: string;
  priority: ToDoPriority;
  companyId?: string;
  listId?: string;
  userId?: string;
  taskText?: string;
}): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("todo_list_items")
      .update({ priority: params.priority })
      .eq("id", params.itemId);
    if (error) throw error;

    if (params.companyId && params.listId && params.userId) {
      const actionText = params.taskText
        ? `changed priority of "${params.taskText}" to ${params.priority}`
        : `changed priority to ${params.priority}`;
      await supabase.from("todo_list_activity").insert({
        list_id: params.listId,
        company_id: params.companyId,
        actor_id: params.userId,
        action: actionText,
      });
    }
    return true;
  } catch (err) {
    console.error("Error updating todo item priority:", err);
    return false;
  }
}

/**
 * Update an item's text.
 */
export async function updateToDoItemText(params: {
  itemId: string;
  text: string;
  columnId?: string;
  companyId?: string;
  listId?: string;
  userId?: string;
}): Promise<boolean> {
  try {
    const encodedText = encodeItemColumn(params.text, params.columnId);
    const { error } = await supabase
      .from("todo_list_items")
      .update({ text: encodedText })
      .eq("id", params.itemId);
    if (error) throw error;

    if (params.companyId && params.listId && params.userId) {
      await supabase.from("todo_list_activity").insert({
        list_id: params.listId,
        company_id: params.companyId,
        actor_id: params.userId,
        action: `renamed task to "${params.text.trim()}"`,
      });
    }
    return true;
  } catch (err) {
    console.error("Error updating todo item text:", err);
    return false;
  }
}

/**
 * Move an item to a different Kanban column.
 */
export async function moveToDoItemColumn(params: {
  itemId: string;
  rawText?: string;
  text?: string;
  columnId?: string;
  targetColumnId?: string;
  columnName?: string;
  targetColumnName?: string;
  companyId?: string;
  listId?: string;
  userId?: string;
  updatedAt?: string;
}): Promise<boolean> {
  try {
    const targetColId = params.targetColumnId || params.columnId || "col_1";
    let textToUse = params.rawText || params.text;

    if (!textToUse) {
      // Safety fallback: query existing text if not provided
      const { data: existing } = await supabase
        .from("todo_list_items")
        .select("text")
        .eq("id", params.itemId)
        .single();
      if (existing) {
        textToUse = existing.text;
      }
    }

    const { cleanText } = parseItemColumn(textToUse || "");
    const nowIso = params.updatedAt || new Date().toISOString();
    const encodedText = encodeItemColumn(textToUse || "", targetColId, nowIso);
    const { error } = await supabase
      .from("todo_list_items")
      .update({ text: encodedText })
      .eq("id", params.itemId);
    if (error) throw error;

    const colName = params.targetColumnName || params.columnName;
    if (params.companyId && params.listId && params.userId && colName) {
      const taskLabel = cleanText ? ` "${cleanText}"` : "";
      await supabase.from("todo_list_activity").insert({
        list_id: params.listId,
        company_id: params.companyId,
        actor_id: params.userId,
        action: `moved task${taskLabel} to "${colName}"`,
      });
    }
    return true;
  } catch (err) {
    console.error("Error moving task column:", err);
    return false;
  }
}

/**
 * Set or clear an item's device-push reminder. Changing a reminder re-arms
 * it (reminder_sent is reset so the cron dispatcher picks it up again).
 */
export async function updateToDoItemReminder(params: {
  itemId: string;
  remindAt: string | null;
}): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("todo_list_items")
      .update({ remind_at: params.remindAt, reminder_sent: false })
      .eq("id", params.itemId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Error updating todo item reminder:", err);
    return false;
  }
}

/**
 * Delete a todo item.
 */
export async function deleteToDoItem(
  params:
    | string
    | {
        itemId: string;
        companyId?: string;
        listId?: string;
        userId?: string;
        taskText?: string;
      },
): Promise<boolean> {
  const itemId = typeof params === "string" ? params : params.itemId;
  try {
    const { error } = await supabase.from("todo_list_items").delete().eq("id", itemId);
    if (error) throw error;

    if (typeof params !== "string" && params.companyId && params.listId && params.userId) {
      const taskLabel = params.taskText ? ` "${params.taskText}"` : "";
      await supabase.from("todo_list_activity").insert({
        list_id: params.listId,
        company_id: params.companyId,
        actor_id: params.userId,
        action: `deleted task${taskLabel}`,
      });
    }
    return true;
  } catch (err) {
    console.error("Error deleting todo item:", err);
    return false;
  }
}

/**
 * Fetch all notes for a list.
 */
export async function getToDoListNotes(listId: string): Promise<ToDoListNote[]> {
  try {
    const { data, error } = await supabase
      .from("todo_list_notes")
      .select("id, list_id, author_id, author_name, author_avatar, target_collaborator_id, content, created_at, is_pinned")
      .eq("list_id", listId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Error fetching list notes:", error);
      return [];
    }

    // Resolve target collaborator names
    const targetIds = (data || []).map((n: any) => n.target_collaborator_id).filter(Boolean);
    const targetNameMap = new Map<string, string>();
    if (targetIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", targetIds);
      for (const p of profiles || []) {
        if (p.id && p.name) targetNameMap.set(p.id, p.name);
      }
    }

    return (data || []).map((n: any) => ({
      id: n.id,
      listId: n.list_id,
      authorId: n.author_id || undefined,
      authorName: n.author_name || "Guest",
      authorAvatar: sanitizeProfilePhoto(n.author_avatar) || undefined,
      targetCollaboratorId: n.target_collaborator_id || undefined,
      targetCollaboratorName: n.target_collaborator_id ? targetNameMap.get(n.target_collaborator_id) : undefined,
      content: n.content,
      createdAt: n.created_at,
      isPinned: Boolean(n.is_pinned),
    }));
  } catch (err) {
    console.warn("getToDoListNotes error:", err);
    return [];
  }
}

/**
 * Create a new note on a list.
 */
export async function createToDoListNote(params: {
  listId: string;
  content: string;
  targetCollaboratorId?: string;
  authorName?: string;
  authorAvatar?: string;
}): Promise<ToDoListNote | null> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    let authorId: string | null = null;
    let authorName = params.authorName?.trim() || "";
    let authorAvatar = params.authorAvatar || undefined;

    if (userData?.user) {
      authorId = userData.user.id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, profile_photo")
        .eq("id", authorId)
        .maybeSingle();
      if (profile?.name) {
        authorName = profile.name;
        authorAvatar = sanitizeProfilePhoto(profile.profile_photo) || undefined;
      }
    } else {
      // For unauthenticated guests, name is compulsory
      if (!authorName) {
        console.error("createToDoListNote error: authorName is compulsory for guests");
        return null;
      }
    }

    const { data, error } = await supabase
      .from("todo_list_notes")
      .insert({
        list_id: params.listId,
        author_id: authorId,
        author_name: authorName,
        author_avatar: authorAvatar || null,
        target_collaborator_id: params.targetCollaboratorId || null,
        content: params.content.trim(),
        is_pinned: false,
      })
      .select("id, list_id, author_id, author_name, author_avatar, target_collaborator_id, content, created_at, is_pinned")
      .single();

    if (error) {
      console.error("createToDoListNote error:", error);
      return null;
    }

    let targetName: string | undefined;
    if (params.targetCollaboratorId) {
      const { data: targetProf } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", params.targetCollaboratorId)
        .maybeSingle();
      if (targetProf?.name) targetName = targetProf.name;
    }

    // Log activity if list exists
    if (authorId) {
      await supabase.from("todo_list_activity").insert({
        list_id: params.listId,
        actor_id: authorId,
        action: `left a note${targetName ? ` for ${targetName}` : ""}`,
      });
    }

    return {
      id: data.id,
      listId: data.list_id,
      authorId: data.author_id || undefined,
      authorName: data.author_name,
      authorAvatar: sanitizeProfilePhoto(data.author_avatar) || undefined,
      targetCollaboratorId: data.target_collaborator_id || undefined,
      targetCollaboratorName: targetName,
      content: data.content,
      createdAt: data.created_at,
      isPinned: Boolean(data.is_pinned),
    };
  } catch (err) {
    console.error("createToDoListNote exception:", err);
    return null;
  }
}

/**
 * Delete a note.
 */
export async function deleteToDoListNote(noteId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("todo_list_notes")
      .delete()
      .eq("id", noteId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("deleteToDoListNote error:", err);
    return false;
  }
}

/**
 * Toggle pin status of a note.
 */
export async function togglePinToDoListNote(noteId: string, isPinned: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("todo_list_notes")
      .update({ is_pinned: isPinned })
      .eq("id", noteId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("togglePinToDoListNote error:", err);
    return false;
  }
}

/**
 * Update note feature settings (isNotesEnabled & allowPublicNotes).
 */
export async function updateToDoListNoteSettings(
  listId: string,
  settings: { isNotesEnabled: boolean; allowPublicNotes?: boolean },
): Promise<boolean> {
  try {
    const { data: existing, error: fetchErr } = await supabase
      .from("todo_lists")
      .select("color")
      .eq("id", listId)
      .single();

    if (fetchErr || !existing) throw fetchErr || new Error("List not found");

    const existingMeta = parseListDescriptionMeta(existing.color);
    const newMeta = encodeListDescriptionMeta({
      color: existingMeta.color,
      listType: existingMeta.listType,
      columns: existingMeta.columns,
      collaboratorPermissions: existingMeta.collaboratorPermissions,
      isPublicShareEnabled: existingMeta.isPublicShareEnabled,
      publicShareToken: existingMeta.publicShareToken,
      sharePermission: existingMeta.sharePermission,
      isNotesEnabled: settings.isNotesEnabled,
      allowPublicNotes: settings.allowPublicNotes !== undefined ? settings.allowPublicNotes : existingMeta.allowPublicNotes,
    });

    const { error: updateErr } = await supabase
      .from("todo_lists")
      .update({ color: newMeta, updated_at: new Date().toISOString() })
      .eq("id", listId);

    if (updateErr) throw updateErr;

    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      await supabase.from("todo_list_activity").insert({
        list_id: listId,
        actor_id: userData.user.id,
        action: settings.isNotesEnabled ? "enabled notes feature for this board" : "disabled notes feature for this board",
      });
    }

    return true;
  } catch (err) {
    console.error("updateToDoListNoteSettings error:", err);
    return false;
  }
}

/**
 * Propose assigning a task to a collaborator (requires recipient accept/reject).
 */
export async function requestTaskAssignment(params: {
  itemId?: string;
  taskId?: string;
  fromUserId?: string;
  currentUserId?: string;
  fromUserName?: string;
  currentUserName?: string;
  toUserId?: string;
  targetUserId?: string;
  toUserName?: string;
  targetUserName?: string;
  rawText?: string;
  listId?: string;
  companyId?: string;
}): Promise<boolean> {
  const itemId = params.itemId || params.taskId;
  const fromUserId = params.fromUserId || params.currentUserId;
  const fromUserName = params.fromUserName || params.currentUserName;
  const toUserId = params.toUserId || params.targetUserId;
  const toUserName = params.toUserName || params.targetUserName;

  if (!itemId || !fromUserId || !toUserId) {
    console.error("requestTaskAssignment missing required parameters:", { itemId, fromUserId, toUserId });
    return false;
  }

  try {
    let textToUse = params.rawText;
    if (!textToUse) {
      const { data: existing, error: fetchErr } = await supabase
        .from("todo_list_items")
        .select("text")
        .eq("id", itemId)
        .single();
      if (fetchErr) {
        console.error("Error fetching existing task text for assignment:", fetchErr);
      }
      if (existing) textToUse = existing.text;
    }

    const { cleanText, columnId, updatedAt, order } = parseItemColumn(textToUse || "");
    const encoded = encodeItemColumn(cleanText, columnId, updatedAt, order, {
      assignedToId: toUserId,
      assignedById: fromUserId,
      assignedByName: fromUserName,
      assignmentStatus: "pending",
    });

    const { error } = await supabase
      .from("todo_list_items")
      .update({ text: encoded })
      .eq("id", itemId);
    if (error) {
      console.error("Error updating todo_list_items in requestTaskAssignment:", error);
      throw error;
    }

    if (params.companyId && params.listId && fromUserId) {
      const targetLabel = toUserName ? ` to ${toUserName}` : "";
      const taskLabel = cleanText ? ` "${cleanText}"` : "";
      await supabase.from("todo_list_activity").insert({
        list_id: params.listId,
        company_id: params.companyId,
        actor_id: fromUserId,
        action: `offered task${taskLabel}${targetLabel} (pending acceptance)`,
      });
    }

    return true;
  } catch (err) {
    console.error("Error requesting task assignment:", err);
    return false;
  }
}

/**
 * Accept or Reject a proposed task assignment.
 */
export async function respondTaskAssignment(params: {
  itemId?: string;
  taskId?: string;
  action?: "accept" | "reject";
  response?: "accept" | "reject";
  userId?: string;
  currentUserId?: string;
  userName?: string;
  currentUserName?: string;
  rawText?: string;
  listId?: string;
  companyId?: string;
}): Promise<boolean> {
  const itemId = params.itemId || params.taskId;
  const action = params.action || params.response;
  const userId = params.userId || params.currentUserId;

  if (!itemId || !action || !userId) {
    console.error("respondTaskAssignment missing required parameters:", { itemId, action, userId });
    return false;
  }

  try {
    let textToUse = params.rawText;
    if (!textToUse) {
      const { data: existing, error: fetchErr } = await supabase
        .from("todo_list_items")
        .select("text")
        .eq("id", itemId)
        .single();
      if (fetchErr) {
        console.error("Error fetching existing task text for respondTaskAssignment:", fetchErr);
      }
      if (existing) textToUse = existing.text;
    }

    const { cleanText, columnId, order } = parseItemColumn(textToUse || "");
    const nowIso = new Date().toISOString();

    if (action === "accept") {
      const encoded = encodeItemColumn(cleanText, columnId, nowIso, order, {
        assignmentStatus: null,
        assignedToId: null,
        assignedById: null,
        assignedByName: null,
      });

      const { error } = await supabase
        .from("todo_list_items")
        .update({
          text: encoded,
          assignee_id: userId,
        })
        .eq("id", itemId);
      if (error) {
        console.error("Error updating assignee_id on accept:", error);
        throw error;
      }

      if (params.companyId && params.listId) {
        const taskLabel = cleanText ? ` "${cleanText}"` : "";
        await supabase.from("todo_list_activity").insert({
          list_id: params.listId,
          company_id: params.companyId,
          actor_id: userId,
          action: `accepted task assignment${taskLabel}`,
        });
      }
    } else {
      // Reject or cancel
      const encoded = encodeItemColumn(cleanText, columnId, nowIso, order, {
        assignmentStatus: null,
        assignedToId: null,
        assignedById: null,
        assignedByName: null,
      });

      const { error } = await supabase
        .from("todo_list_items")
        .update({
          text: encoded,
        })
        .eq("id", itemId);
      if (error) {
        console.error("Error clearing assignment on reject:", error);
        throw error;
      }

      if (params.companyId && params.listId) {
        const taskLabel = cleanText ? ` "${cleanText}"` : "";
        await supabase.from("todo_list_activity").insert({
          list_id: params.listId,
          company_id: params.companyId,
          actor_id: userId,
          action: `declined task assignment${taskLabel}`,
        });
      }
    }

    return true;
  } catch (err) {
    console.error("Error responding to task assignment:", err);
    return false;
  }
}

/**
 * Propose assigning multiple tasks to a collaborator in bulk (requires recipient accept/reject).
 */
export async function bulkRequestTaskAssignment(params: {
  itemIds: string[];
  fromUserId: string;
  fromUserName?: string;
  toUserId: string;
  toUserName?: string;
  listId?: string;
  companyId?: string;
}): Promise<boolean> {
  const { itemIds, fromUserId, fromUserName, toUserId, toUserName, listId, companyId } = params;
  if (!itemIds || itemIds.length === 0 || !fromUserId || !toUserId) {
    console.error("bulkRequestTaskAssignment missing required parameters:", { itemIds, fromUserId, toUserId });
    return false;
  }

  try {
    const { data: existingItems, error: fetchErr } = await supabase
      .from("todo_list_items")
      .select("id, text")
      .in("id", itemIds);

    if (fetchErr) throw fetchErr;
    if (!existingItems || existingItems.length === 0) return false;

    const updatePromises = existingItems.map((item: any) => {
      const { cleanText, columnId, updatedAt, order } = parseItemColumn(item.text || "");
      const encoded = encodeItemColumn(cleanText, columnId, updatedAt, order, {
        assignedToId: toUserId,
        assignedById: fromUserId,
        assignedByName: fromUserName,
        assignmentStatus: "pending",
      });
      return supabase
        .from("todo_list_items")
        .update({ text: encoded })
        .eq("id", item.id);
    });

    const results = await Promise.all(updatePromises);
    const anyError = results.find((r) => r.error);
    if (anyError?.error) throw anyError.error;

    if (companyId && listId && fromUserId) {
      const targetLabel = toUserName ? ` to ${toUserName}` : "";
      const countLabel = existingItems.length === 1 ? "1 task" : `${existingItems.length} tasks`;
      await supabase.from("todo_list_activity").insert({
        list_id: listId,
        company_id: companyId,
        actor_id: fromUserId,
        action: `offered ${countLabel}${targetLabel} in bulk (pending acceptance)`,
      });
    }

    return true;
  } catch (err) {
    console.error("Error in bulkRequestTaskAssignment:", err);
    return false;
  }
}



