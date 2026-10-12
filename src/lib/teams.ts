import { supabase } from "./supabase";

// ==============================================================================
// TYPES & INTERFACES
// ==============================================================================

export interface TeamMemberProfile {
  id: string;
  full_name: string;
  email?: string;
  avatar_url?: string | null;
  department_name?: string | null;
  designation?: string | null;
  phone_number?: string | null;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: "lead" | "member";
  joined_at: string;
  profile?: TeamMemberProfile;
}

export interface Team {
  id: string;
  company_id: string;
  name: string;
  description?: string | null;
  icon: string;
  color: string;
  lead_id?: string | null;
  is_private: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  lead?: TeamMemberProfile | null;
  members?: TeamMember[];
  member_count?: number;
  boards_count?: number;
  is_current_user_member?: boolean;
}

export interface CreateTeamPayload {
  company_id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  lead_id?: string;
  is_private?: boolean;
  created_by?: string;
  member_ids?: string[];
}

export interface TeamChannel {
  id: string;
  team_id: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  created_by?: string | null;
  created_at: string;
}

export interface TeamChannelMessage {
  id: string;
  channel_id: string;
  team_id: string;
  user_id: string;
  content: string;
  attachments?: Array<{
    name: string;
    size?: string;
    type?: string;
    url?: string;
  }>;
  created_at: string;
  updated_at: string;
  profile?: TeamMemberProfile;
}

export interface TeamTask {
  id: string;
  team_id: string;
  title: string;
  description?: string | null;
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "low" | "medium" | "high";
  due_date?: string | null;
  assignee_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  assignee?: TeamMemberProfile | null;
}

export interface TeamEvent {
  id: string;
  team_id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time?: string | null;
  event_type: "meeting" | "deadline" | "review" | "sprint" | "social";
  location?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface TeamQuickLink {
  id: string;
  team_id: string;
  title: string;
  url: string;
  description?: string | null;
  icon?: string;
  created_at: string;
}

// ==============================================================================
// PROFILE HELPER
// ==============================================================================

export const mapProfile = (p: any): TeamMemberProfile => {
  if (!p) return { id: "", full_name: "Unknown" };
  return {
    id: p.id,
    full_name: p.name || "Employee",
    email: p.email || "",
    avatar_url: p.profile_photo || null,
    department_name: p.department || "",
    designation: p.job_title || p.role || "",
    phone_number: p.phone || "",
  };
};

// ==============================================================================
// 1. TEAMS CRUD
// ==============================================================================

/**
 * Fetch all teams within the company
 */
export async function fetchTeams(companyId: string, currentUserId?: string, userRole?: string): Promise<Team[]> {
  try {
    const { data: teamsData, error: teamsError } = await supabase
      .from("teams")
      .select(`
        id,
        company_id,
        name,
        description,
        icon,
        color,
        lead_id,
        is_private,
        created_by,
        created_at,
        updated_at
      `)
      .eq("company_id", companyId)
      .order("name", { ascending: true });

    if (teamsError) {
      console.warn("Error fetching teams from Supabase:", teamsError.message);
      return [];
    }

    if (!teamsData || teamsData.length === 0) {
      return [];
    }

    const teamIds = teamsData.map((t) => t.id);
    const leadIds = Array.from(new Set(teamsData.map((t) => t.lead_id).filter(Boolean))) as string[];

    const [membersRes, leadsRes] = await Promise.all([
      supabase
        .from("team_members")
        .select(`
          id,
          team_id,
          user_id,
          role,
          joined_at,
          profile:profiles(id, name, email, profile_photo, department, job_title, role, phone)
        `)
        .in("team_id", teamIds),
      leadIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, name, email, profile_photo, department, job_title, role, phone")
            .in("id", leadIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const membersData = membersRes.data || [];
    const leadsData = leadsRes.data || [];

    const membersByTeam = new Map<string, TeamMember[]>();
    membersData.forEach((m: any) => {
      const list = membersByTeam.get(m.team_id) || [];
      list.push({
        id: m.id,
        team_id: m.team_id,
        user_id: m.user_id,
        role: m.role as "lead" | "member",
        joined_at: m.joined_at,
        profile: mapProfile(m.profile),
      });
      membersByTeam.set(m.team_id, list);
    });

    const leadsMap = new Map<string, TeamMemberProfile>();
    leadsData.forEach((l: any) => {
      leadsMap.set(l.id, mapProfile(l));
    });

    return teamsData.map((t) => {
      const members = membersByTeam.get(t.id) || [];
      const isMember = currentUserId
        ? members.some((m) => m.user_id === currentUserId) || t.created_by === currentUserId || t.lead_id === currentUserId
        : false;

      return {
        ...t,
        icon: t.icon || "Users",
        color: t.color || "#18181b",
        lead: t.lead_id ? leadsMap.get(t.lead_id) || null : null,
        members,
        member_count: members.length,
        is_current_user_member: isMember,
      };
    });
  } catch (err: any) {
    console.error("fetchTeams error:", err);
    return [];
  }
}

export function slugifyTeamName(name: string): string {
  if (!name) return "team";
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "team"
  );
}

/**
 * Fetch a single team by ID or slug with lead and members
 */
export async function fetchTeamById(teamIdOrSlug: string, currentUserId?: string): Promise<Team | null> {
  try {
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamIdOrSlug);

    let teamData: any = null;

    if (isUUID) {
      const { data, error } = await supabase
        .from("teams")
        .select(`
          id,
          company_id,
          name,
          description,
          icon,
          color,
          lead_id,
          is_private,
          created_by,
          created_at,
          updated_at
        `)
        .eq("id", teamIdOrSlug)
        .maybeSingle();

      if (!error && data) {
        teamData = data;
      }
    }

    // If not found by UUID (or identifier is a slug), search by matching slug or name
    if (!teamData) {
      const { data: allTeams, error: allTeamsErr } = await supabase
        .from("teams")
        .select(`
          id,
          company_id,
          name,
          description,
          icon,
          color,
          lead_id,
          is_private,
          created_by,
          created_at,
          updated_at
        `);

      if (!allTeamsErr && allTeams) {
        teamData = allTeams.find(
          (t) => slugifyTeamName(t.name) === teamIdOrSlug.toLowerCase() || t.id === teamIdOrSlug
        );
      }
    }

    if (!teamData) {
      console.warn("Error fetching team by ID or slug:", teamIdOrSlug);
      return null;
    }

    const realTeamId = teamData.id;

    const [membersRes, leadRes] = await Promise.all([
      supabase
        .from("team_members")
        .select(`
          id,
          team_id,
          user_id,
          role,
          joined_at,
          profile:profiles(id, name, email, profile_photo, department, job_title, role, phone)
        `)
        .eq("team_id", realTeamId),
      teamData.lead_id
        ? supabase
            .from("profiles")
            .select("id, name, email, profile_photo, department, job_title, role, phone")
            .eq("id", teamData.lead_id)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
    ]);

    const members: TeamMember[] = (membersRes.data || []).map((m: any) => ({
      id: m.id,
      team_id: m.team_id,
      user_id: m.user_id,
      role: m.role as "lead" | "member",
      joined_at: m.joined_at,
      profile: mapProfile(m.profile),
    }));

    const lead: TeamMemberProfile | null = leadRes.data ? mapProfile(leadRes.data) : null;

    const isMember = currentUserId
      ? members.some((m) => m.user_id === currentUserId) || teamData.created_by === currentUserId || teamData.lead_id === currentUserId
      : false;

    return {
      ...teamData,
      icon: teamData.icon || "Users",
      color: teamData.color || "#18181b",
      lead,
      members,
      member_count: members.length,
      is_current_user_member: isMember,
    };
  } catch (err: any) {
    console.error("fetchTeamById error:", err);
    return null;
  }
}

/**
 * Create a new team and default #general channel
 */
export async function createTeam(payload: CreateTeamPayload): Promise<Team | null> {
  try {
    let compId = payload.company_id;
    let createdBy = payload.created_by;
    const memberIds = payload.member_ids || [];

    if (!compId || !createdBy) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        if (!createdBy) createdBy = user.id;
        if (!compId) {
          const { data: prof } = await supabase.from("profiles").select("company_id").eq("id", user.id).single();
          compId = prof?.company_id;
        }
      }
    }

    if (!compId) {
      throw new Error("Unable to determine company ID for team creation");
    }

    const { data: newTeam, error: createError } = await supabase
      .from("teams")
      .insert({
        company_id: compId,
        name: payload.name.trim(),
        description: payload.description?.trim() || null,
        icon: payload.icon || "Users",
        color: payload.color || "#18181b",
        lead_id: payload.lead_id || null,
        is_private: payload.is_private !== undefined ? payload.is_private : false,
        created_by: createdBy || null,
      })
      .select()
      .single();

    if (createError || !newTeam) {
      throw new Error(createError?.message || "Failed to create team");
    }

    // Add initial members
    const memberRows: Array<{ team_id: string; user_id: string; role: string }> = [];

    if (createdBy) {
      memberRows.push({
        team_id: newTeam.id,
        user_id: createdBy,
        role: payload.lead_id === createdBy ? "lead" : "member",
      });
    }

    if (payload.lead_id && payload.lead_id !== createdBy) {
      memberRows.push({
        team_id: newTeam.id,
        user_id: payload.lead_id,
        role: "lead",
      });
    }

    if (memberIds.length > 0) {
      memberIds.forEach((uid) => {
        if (!memberRows.some((m) => m.user_id === uid)) {
          memberRows.push({
            team_id: newTeam.id,
            user_id: uid,
            role: "member",
          });
        }
      });
    }

    if (memberRows.length > 0) {
      await supabase.from("team_members").insert(memberRows);
    }

    // Auto-create default #general channel
    try {
      await supabase.from("team_channels").insert({
        team_id: newTeam.id,
        name: "general",
        description: "General squad discussion and announcements",
        is_default: true,
        created_by: createdBy,
      });
    } catch (chanErr) {
      console.warn("Could not create default channel:", chanErr);
    }

    return await fetchTeamById(newTeam.id, createdBy);
  } catch (err: any) {
    console.error("createTeam error:", err);
    throw err;
  }
}

/**
 * Update an existing team
 */
export async function updateTeam(
  teamId: string,
  updates: Partial<Pick<Team, "name" | "description" | "icon" | "color" | "lead_id" | "is_private">>
): Promise<boolean> {
  try {
    const payload: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("teams").update(payload).eq("id", teamId);
    if (error) throw error;

    // If lead changed, ensure the new lead is in team_members with role 'lead'
    if (updates.lead_id) {
      const { data: existingMember } = await supabase
        .from("team_members")
        .select("id, role")
        .eq("team_id", teamId)
        .eq("user_id", updates.lead_id)
        .single();

      if (existingMember) {
        if (existingMember.role !== "lead") {
          await supabase.from("team_members").update({ role: "lead" }).eq("id", existingMember.id);
        }
      } else {
        await supabase.from("team_members").insert({
          team_id: teamId,
          user_id: updates.lead_id,
          role: "lead",
        });
      }
    }

    return true;
  } catch (err: any) {
    console.error("updateTeam error:", err);
    return false;
  }
}

/**
 * Delete a team
 */
export async function deleteTeam(teamId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("teams").delete().eq("id", teamId);
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.error("deleteTeam error:", err);
    return false;
  }
}

// ==============================================================================
// 2. TEAM MEMBERS & EMPLOYEES
// ==============================================================================

export async function addTeamMember(
  teamId: string,
  userId: string,
  role: "lead" | "member" = "member"
): Promise<boolean> {
  try {
    const { error } = await supabase.from("team_members").insert({
      team_id: teamId,
      user_id: userId,
      role,
    });
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.error("addTeamMember error:", err);
    return false;
  }
}

export async function removeTeamMember(teamId: string, userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId);

    if (error) throw error;
    return true;
  } catch (err: any) {
    console.error("removeTeamMember error:", err);
    return false;
  }
}

export async function updateTeamMemberRole(
  teamId: string,
  userId: string,
  role: "lead" | "member"
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("team_members")
      .update({ role })
      .eq("team_id", teamId)
      .eq("user_id", userId);

    if (error) throw error;
    return true;
  } catch (err: any) {
    console.error("updateTeamMemberRole error:", err);
    return false;
  }
}

export async function fetchCompanyEmployees(companyId: string): Promise<TeamMemberProfile[]> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, profile_photo, department, job_title, role, phone")
      .eq("company_id", companyId)
      .order("name", { ascending: true });

    if (error) {
      console.warn("fetchCompanyEmployees error:", error.message);
      return [];
    }
    return (data || []).map(mapProfile);
  } catch (err: any) {
    console.error("fetchCompanyEmployees error:", err);
    return [];
  }
}

// ==============================================================================
// 3. TEAM CHANNELS & MESSAGES (REAL-TIME CHAT)
// ==============================================================================

export async function fetchTeamChannels(teamId: string): Promise<TeamChannel[]> {
  try {
    const { data, error } = await supabase
      .from("team_channels")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("fetchTeamChannels error:", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("fetchTeamChannels error:", err);
    return [];
  }
}

export async function createTeamChannel(
  teamId: string,
  name: string,
  description?: string,
  userId?: string
): Promise<TeamChannel | null> {
  try {
    const cleanName = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/^-+|-+$/g, "");
    const { data, error } = await supabase
      .from("team_channels")
      .insert({
        team_id: teamId,
        name: cleanName,
        description: description?.trim() || null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("createTeamChannel error:", err);
    return null;
  }
}

export async function fetchChannelMessages(channelId: string): Promise<TeamChannelMessage[]> {
  try {
    const { data: messagesData, error } = await supabase
      .from("team_channel_messages")
      .select(`
        id,
        channel_id,
        team_id,
        user_id,
        content,
        attachments,
        created_at,
        updated_at
      `)
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("fetchChannelMessages error:", error.message);
      return [];
    }

    if (!messagesData || messagesData.length === 0) {
      return [];
    }

    const userIds = Array.from(new Set(messagesData.map((m) => m.user_id).filter(Boolean))) as string[];
    let profilesMap = new Map<string, TeamMemberProfile>();

    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, email, profile_photo, department, job_title, role, phone")
        .in("id", userIds);

      (profs || []).forEach((p) => {
        profilesMap.set(p.id, mapProfile(p));
      });
    }

    return messagesData.map((m: any) => ({
      ...m,
      profile: m.user_id ? profilesMap.get(m.user_id) || null : null,
    }));
  } catch (err) {
    console.error("fetchChannelMessages error:", err);
    return [];
  }
}

export async function sendChannelMessage(params: {
  channelId: string;
  teamId: string;
  userId: string;
  content: string;
  attachments?: Array<{ name: string; size?: string; type?: string; url?: string }>;
}): Promise<TeamChannelMessage | null> {
  try {
    const { data, error } = await supabase
      .from("team_channel_messages")
      .insert({
        channel_id: params.channelId,
        team_id: params.teamId,
        user_id: params.userId,
        content: params.content.trim(),
        attachments: params.attachments || [],
      })
      .select(`
        id,
        channel_id,
        team_id,
        user_id,
        content,
        attachments,
        created_at,
        updated_at
      `)
      .single();

    if (error || !data) throw error;

    let profile: TeamMemberProfile | null = null;
    if (data.user_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, name, email, profile_photo, department, job_title, role, phone")
        .eq("id", data.user_id)
        .maybeSingle();

      if (prof) {
        profile = mapProfile(prof);
      }
    }

    return {
      ...data,
      profile,
    };
  } catch (err) {
    console.error("sendChannelMessage error:", err);
    return null;
  }
}

// ==============================================================================
// 4. TEAM TASKS (KANBAN BOARD)
// ==============================================================================

export async function fetchTeamTasks(teamId: string): Promise<TeamTask[]> {
  try {
    const { data: tasksData, error } = await supabase
      .from("team_tasks")
      .select(`
        id,
        team_id,
        title,
        description,
        status,
        priority,
        due_date,
        assignee_id,
        created_by,
        created_at,
        updated_at
      `)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("fetchTeamTasks error:", error.message);
      return [];
    }

    if (!tasksData || tasksData.length === 0) {
      return [];
    }

    const assigneeIds = Array.from(new Set(tasksData.map((t) => t.assignee_id).filter(Boolean))) as string[];
    let assigneesMap = new Map<string, TeamMemberProfile>();

    if (assigneeIds.length > 0) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, name, email, profile_photo, department, job_title, role, phone")
        .in("id", assigneeIds);

      (profilesData || []).forEach((p) => {
        assigneesMap.set(p.id, mapProfile(p));
      });
    }

    return tasksData.map((t: any) => ({
      ...t,
      assignee: t.assignee_id ? assigneesMap.get(t.assignee_id) || null : null,
    }));
  } catch (err) {
    console.error("fetchTeamTasks error:", err);
    return [];
  }
}

export async function createTeamTask(params: {
  teamId: string;
  title: string;
  description?: string;
  status?: "todo" | "in_progress" | "in_review" | "done";
  priority?: "low" | "medium" | "high";
  dueDate?: string;
  assigneeId?: string;
  userId?: string;
}): Promise<TeamTask | null> {
  try {
    const { data, error } = await supabase
      .from("team_tasks")
      .insert({
        team_id: params.teamId,
        title: params.title.trim(),
        description: params.description?.trim() || null,
        status: params.status || "todo",
        priority: params.priority || "medium",
        due_date: params.dueDate || null,
        assignee_id: params.assigneeId || null,
        created_by: params.userId || null,
      })
      .select(`
        id,
        team_id,
        title,
        description,
        status,
        priority,
        due_date,
        assignee_id,
        created_by,
        created_at,
        updated_at
      `)
      .single();

    if (error || !data) throw error;

    let assignee: TeamMemberProfile | null = null;
    if (data.assignee_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id, name, email, profile_photo, department, job_title, role, phone")
        .eq("id", data.assignee_id)
        .maybeSingle();

      if (prof) {
        assignee = mapProfile(prof);
      }
    }

    return {
      ...data,
      assignee,
    };
  } catch (err) {
    console.error("createTeamTask error:", err);
    return null;
  }
}

export async function updateTeamTaskStatus(
  taskId: string,
  status: "todo" | "in_progress" | "in_review" | "done"
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("team_tasks")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", taskId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("updateTeamTaskStatus error:", err);
    return false;
  }
}

export async function deleteTeamTask(taskId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("team_tasks").delete().eq("id", taskId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("deleteTeamTask error:", err);
    return false;
  }
}

// ==============================================================================
// 5. TEAM CALENDAR & EVENTS
// ==============================================================================

export async function fetchTeamEvents(teamId: string): Promise<TeamEvent[]> {
  try {
    const { data, error } = await supabase
      .from("team_events")
      .select("*")
      .eq("team_id", teamId)
      .order("start_time", { ascending: true });

    if (error) {
      console.warn("fetchTeamEvents error:", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("fetchTeamEvents error:", err);
    return [];
  }
}

export async function createTeamEvent(params: {
  teamId: string;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string;
  eventType?: "meeting" | "deadline" | "review" | "sprint" | "social";
  location?: string;
  userId?: string;
}): Promise<TeamEvent | null> {
  try {
    const { data, error } = await supabase
      .from("team_events")
      .insert({
        team_id: params.teamId,
        title: params.title.trim(),
        description: params.description?.trim() || null,
        start_time: params.startTime,
        end_time: params.endTime || null,
        event_type: params.eventType || "meeting",
        location: params.location?.trim() || null,
        created_by: params.userId || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("createTeamEvent error:", err);
    return null;
  }
}

export async function deleteTeamEvent(eventId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("team_events").delete().eq("id", eventId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("deleteTeamEvent error:", err);
    return false;
  }
}

// ==============================================================================
// 6. TEAM QUICK LINKS
// ==============================================================================

export async function fetchTeamQuickLinks(teamId: string): Promise<TeamQuickLink[]> {
  try {
    const { data, error } = await supabase
      .from("team_quick_links")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("fetchTeamQuickLinks error:", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("fetchTeamQuickLinks error:", err);
    return [];
  }
}

export async function createTeamQuickLink(params: {
  teamId: string;
  title: string;
  url: string;
  description?: string;
  icon?: string;
  userId?: string;
}): Promise<TeamQuickLink | null> {
  try {
    const { data, error } = await supabase
      .from("team_quick_links")
      .insert({
        team_id: params.teamId,
        title: params.title.trim(),
        url: params.url.trim(),
        description: params.description?.trim() || null,
        icon: params.icon || "Link",
        created_by: params.userId || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error("createTeamQuickLink error:", err);
    return null;
  }
}

export async function deleteTeamQuickLink(linkId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("team_quick_links").delete().eq("id", linkId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("deleteTeamQuickLink error:", err);
    return false;
  }
}
