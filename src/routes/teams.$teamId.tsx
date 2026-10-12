import React, { useState, useEffect, useRef } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useSetBreadcrumbs } from "../components/Layout";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import {
  Users,
  Plus,
  ArrowRight,
  MoreVertical,
  Paperclip,
  Smile,
  Search,
  Check,
  X as CloseIcon,
  Loader2,
  FileText,
  File,
  Download,
  Send,
  Calendar as CalendarIcon,
  Settings,
  Folder,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  UserPlus,
  Code,
  LayoutGrid,
  List,
  Sparkles,
  Link2,
  Upload,
  Trash2,
  MessageSquare,
  Lock,
  Globe,
  AlertTriangle,
  CheckSquare,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  fetchTeamById,
  fetchCompanyEmployees,
  addTeamMember,
  removeTeamMember,
  updateTeamMemberRole,
  updateTeam,
  deleteTeam,
  fetchTeamChannels,
  createTeamChannel,
  fetchChannelMessages,
  sendChannelMessage,
  fetchTeamTasks,
  createTeamTask,
  updateTeamTaskStatus,
  deleteTeamTask,
  fetchTeamEvents,
  createTeamEvent,
  deleteTeamEvent,
  fetchTeamQuickLinks,
  createTeamQuickLink,
  deleteTeamQuickLink,
  Team,
  TeamMember,
  TeamMemberProfile,
  TeamChannel,
  TeamChannelMessage,
  TeamTask,
  TeamEvent,
  TeamQuickLink,
  slugifyTeamName,
} from "../lib/teams";
import {
  getFolders,
  getFiles,
  createFolder,
  uploadFileToCloud,
  getPresignedDownloadUrl,
  deleteFile,
  CloudFolder,
  CloudFile,
  CurrentUserContext,
  getAuthenticatedUserContext,
} from "../lib/cloud-drive";
import { sanitizeProfilePhoto } from "../lib/profile-photo";
import { getTeamIcon } from "./teams.index";

export const Route = createFileRoute("/teams/$teamId")({
  head: () => ({
    title: "CapOasis | Team Workspace",
    meta: [
      {
        name: "description",
        content: "Collaborative team workspace.",
      },
    ],
  }),
  component: TeamWorkspacePage,
});

type TabType = "overview" | "members" | "channels" | "tasks" | "files" | "calendar" | "settings";

function TeamWorkspacePage() {
  const { teamId } = Route.useParams();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabType>("channels");
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<Team | null>(null);

  const tabLabels: Record<TabType, string> = {
    channels: "Channels",
    tasks: "Tasks",
    files: "Files",
    calendar: "Calendar",
    members: "Members",
    overview: "Overview",
    settings: "Settings",
  };

  useSetBreadcrumbs(
    team?.name
      ? [
          { label: "Work" },
          { label: "Teams", href: "/teams" },
          { label: team.name },
          { label: tabLabels[activeTab] || "Channels" },
        ]
      : undefined
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userContext, setUserContext] = useState<CurrentUserContext | null>(null);

  // Employees for add member pickers
  const [companyEmployees, setCompanyEmployees] = useState<TeamMemberProfile[]>([]);

  // Modals
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedEmployeeRole, setSelectedEmployeeRole] = useState<"member" | "lead">("member");
  const [submittingMember, setSubmittingMember] = useState(false);

  // Quick Links State
  const [quickLinks, setQuickLinks] = useState<TeamQuickLink[]>([]);
  const [addLinkModalOpen, setAddLinkModalOpen] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkDesc, setNewLinkDesc] = useState("");

  // Channels & Messages State
  const [channels, setChannels] = useState<TeamChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>("");
  const [channelMessages, setChannelMessages] = useState<TeamChannelMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [newChannelModalOpen, setNewChannelModalOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDesc, setNewChannelDesc] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Tasks State
  const [tasks, setTasks] = useState<TeamTask[]>([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState("");

  // Files State (Cloud Drive Integration)
  const [driveFolders, setDriveFolders] = useState<CloudFolder[]>([]);
  const [driveFiles, setDriveFiles] = useState<CloudFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  // Calendar State
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [newEventStartTime, setNewEventStartTime] = useState("");
  const [newEventEndTime, setNewEventEndTime] = useState("");
  const [newEventType, setNewEventType] = useState<"meeting" | "deadline" | "review" | "sprint" | "social">("meeting");
  const [newEventLocation, setNewEventLocation] = useState("");

  // Settings State
  const [settingsName, setSettingsName] = useState("");
  const [settingsDesc, setSettingsDesc] = useState("");
  const [settingsIcon, setSettingsIcon] = useState("Users");
  const [settingsLeadId, setSettingsLeadId] = useState("");
  const [settingsIsPrivate, setSettingsIsPrivate] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Members search
  const [memberSearch, setMemberSearch] = useState("");

  // Initial Load
  useEffect(() => {
    const loadTeamData = async () => {
      try {
        setLoading(true);
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user;

        if (user) {
          setCurrentUserId(user.id);
          const { data: profile } = await supabase
            .from("profiles")
            .select("company_id, role")
            .eq("id", user.id)
            .single();

          if (profile?.company_id) {
            setCurrentUserRole(profile.role);
            setCompanyId(profile.company_id);
            const employees = await fetchCompanyEmployees(profile.company_id);
            setCompanyEmployees(employees);
          }
        }

        const ctx = await getAuthenticatedUserContext();
        setUserContext(ctx);

        // Fetch team by ID or slug
        const teamData = await fetchTeamById(teamId, user?.id);
        if (teamData) {
          setTeam(teamData);
          setSettingsName(teamData.name);
          setSettingsDesc(teamData.description || "");
          setSettingsIcon(teamData.icon || "Users");
          setSettingsLeadId(teamData.lead_id || "");
          setSettingsIsPrivate(teamData.is_private || false);

          const realTeamId = teamData.id;
          const slug = slugifyTeamName(teamData.name);
          if (typeof window !== "undefined" && window.location.pathname !== `/teams/${slug}`) {
            window.history.replaceState(null, "", `/teams/${slug}`);
          }
          localStorage.setItem("last_team_id", slug);

          // Fetch channels, quick links, tasks, events using real UUID
          const [chans, links, teamTaskList, eventList] = await Promise.all([
            fetchTeamChannels(realTeamId),
            fetchTeamQuickLinks(realTeamId),
            fetchTeamTasks(realTeamId),
            fetchTeamEvents(realTeamId),
          ]);

          setChannels(chans);
          if (chans.length > 0) {
            setActiveChannelId(chans[0].id);
          }
          setQuickLinks(links);
          setTasks(teamTaskList);
          setEvents(eventList);
        }
      } catch (err) {
        console.error("Error loading team workspace:", err);
      } finally {
        setLoading(false);
      }
    };

    loadTeamData();
  }, [teamId]);

  // Load Channel Messages when activeChannelId changes
  useEffect(() => {
    if (!activeChannelId) return;

    let isMounted = true;
    const loadMessages = async () => {
      const msgs = await fetchChannelMessages(activeChannelId);
      if (isMounted) {
        setChannelMessages(msgs);
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    };

    loadMessages();

    // Setup Supabase Realtime Subscription for new messages
    const channelSub = supabase
      .channel(`team-messages-${activeChannelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "team_channel_messages",
          filter: `channel_id=eq.${activeChannelId}`,
        },
        async (payload) => {
          // Fetch the new message with profile
          const { data: newMsg } = await supabase
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
            .eq("id", payload.new.id)
            .single();

          if (newMsg && isMounted) {
            let prof: TeamMemberProfile | undefined = undefined;
            if (newMsg.user_id) {
              const { data: p } = await supabase
                .from("profiles")
                .select("id, name, email, profile_photo, department, job_title, role, phone")
                .eq("id", newMsg.user_id)
                .maybeSingle();

              if (p) {
                prof = {
                  id: p.id,
                  full_name: p.name || "Employee",
                  avatar_url: p.profile_photo,
                  email: p.email,
                };
              }
            }

            setChannelMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [
                ...prev,
                {
                  ...newMsg,
                  profile: prof,
                },
              ];
            });
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 100);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channelSub);
    };
  }, [activeChannelId]);

  // Load Cloud Drive Files for this team
  useEffect(() => {
    if (activeTab !== "files" || !userContext) return;

    const loadDrive = async () => {
      try {
        setFilesLoading(true);
        const [foldersRes, filesRes] = await Promise.all([
          getFolders(userContext.companyId, currentFolderId, userContext.userId),
          getFiles(userContext.companyId, currentFolderId, userContext.userId),
        ]);
        setDriveFolders(foldersRes);
        setDriveFiles(filesRes);
      } catch (err) {
        console.error("Error loading team files:", err);
      } finally {
        setFilesLoading(false);
      }
    };

    loadDrive();
  }, [activeTab, currentFolderId, userContext]);

  // Message Send Handler
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !activeChannelId || !currentUserId) return;

    const text = chatInput;
    setChatInput("");

    try {
      await sendChannelMessage({
        channelId: activeChannelId,
        teamId: team?.id || teamId,
        userId: currentUserId,
        content: text,
      });
    } catch (err: any) {
      toast.error("Failed to send message: " + err.message);
    }
  };

  // Channel Creation
  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;

    try {
      const targetTeamId = team?.id || teamId;
      const created = await createTeamChannel(targetTeamId, newChannelName, newChannelDesc, currentUserId || undefined);
      if (created) {
        setChannels((prev) => [...prev, created]);
        setActiveChannelId(created.id);
        setNewChannelModalOpen(false);
        setNewChannelName("");
        setNewChannelDesc("");
        toast.success(`Channel #${created.name} created!`);
      }
    } catch (err: any) {
      toast.error("Failed to create channel: " + err.message);
    }
  };

  // Add Member
  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) return;

    try {
      setSubmittingMember(true);
      const targetTeamId = team?.id || teamId;
      const success = await addTeamMember(targetTeamId, selectedEmployeeId, selectedEmployeeRole);
      if (success) {
        const refreshed = await fetchTeamById(targetTeamId, currentUserId || undefined);
        if (refreshed) setTeam(refreshed);
        setInviteModalOpen(false);
        setSelectedEmployeeId("");
        toast.success("Member added to squad!");
      }
    } catch (err: any) {
      toast.error("Failed to add member: " + err.message);
    } finally {
      setSubmittingMember(false);
    }
  };

  // Remove Member
  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm("Are you sure you want to remove this member from the team?")) return;
    try {
      const targetTeamId = team?.id || teamId;
      const success = await removeTeamMember(targetTeamId, userId);
      if (success) {
        setTeam((prev) => (prev ? { ...prev, members: prev.members?.filter((m) => m.user_id !== userId) } : null));
        toast.success("Member removed");
      }
    } catch (err: any) {
      toast.error("Failed to remove member: " + err.message);
    }
  };

  // Toggle Role
  const handleToggleMemberRole = async (member: TeamMember) => {
    const newRole = member.role === "lead" ? "member" : "lead";
    try {
      const targetTeamId = team?.id || teamId;
      const success = await updateTeamMemberRole(targetTeamId, member.user_id, newRole);
      if (success) {
        setTeam((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            members: prev.members?.map((m) => (m.id === member.id ? { ...m, role: newRole } : m)),
          };
        });
        toast.success(`Role updated to ${newRole}`);
      }
    } catch (err: any) {
      toast.error("Failed to update role: " + err.message);
    }
  };

  // Task Creation
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      const targetTeamId = team?.id || teamId;
      const created = await createTeamTask({
        teamId: targetTeamId,
        title: newTaskTitle,
        description: newTaskDesc,
        priority: newTaskPriority,
        dueDate: newTaskDueDate || undefined,
        assigneeId: newTaskAssigneeId || undefined,
        userId: currentUserId || undefined,
      });

      if (created) {
        setTasks((prev) => [created, ...prev]);
        setTaskModalOpen(false);
        setNewTaskTitle("");
        setNewTaskDesc("");
        setNewTaskDueDate("");
        setNewTaskAssigneeId("");
        toast.success("Task created!");
      }
    } catch (err: any) {
      toast.error("Failed to create task: " + err.message);
    }
  };

  // Task Status Update
  const handleUpdateTaskStatus = async (taskId: string, status: "todo" | "in_progress" | "in_review" | "done") => {
    try {
      const success = await updateTeamTaskStatus(taskId, status);
      if (success) {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
      }
    } catch (err: any) {
      toast.error("Failed to update status: " + err.message);
    }
  };

  // Task Delete
  const handleDeleteTask = async (taskId: string) => {
    try {
      const success = await deleteTeamTask(taskId);
      if (success) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        toast.success("Task deleted");
      }
    } catch (err: any) {
      toast.error("Failed to delete task: " + err.message);
    }
  };

  // Quick Link Add
  const handleAddQuickLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkTitle.trim() || !newLinkUrl.trim()) return;

    try {
      const targetTeamId = team?.id || teamId;
      const created = await createTeamQuickLink({
        teamId: targetTeamId,
        title: newLinkTitle,
        url: newLinkUrl,
        description: newLinkDesc,
        userId: currentUserId || undefined,
      });

      if (created) {
        setQuickLinks((prev) => [...prev, created]);
        setAddLinkModalOpen(false);
        setNewLinkTitle("");
        setNewLinkUrl("");
        setNewLinkDesc("");
        toast.success("Quick link added!");
      }
    } catch (err: any) {
      toast.error("Failed to add link: " + err.message);
    }
  };

  // Quick Link Delete
  const handleDeleteQuickLink = async (linkId: string) => {
    try {
      const success = await deleteTeamQuickLink(linkId);
      if (success) {
        setQuickLinks((prev) => prev.filter((l) => l.id !== linkId));
        toast.success("Link removed");
      }
    } catch (err: any) {
      toast.error("Failed to remove link: " + err.message);
    }
  };

  // Event Creation
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim() || !newEventStartTime) return;

    try {
      const targetTeamId = team?.id || teamId;
      const created = await createTeamEvent({
        teamId: targetTeamId,
        title: newEventTitle,
        description: newEventDesc,
        startTime: newEventStartTime,
        endTime: newEventEndTime || undefined,
        eventType: newEventType,
        location: newEventLocation,
        userId: currentUserId || undefined,
      });

      if (created) {
        setEvents((prev) => [...prev, created]);
        setEventModalOpen(false);
        setNewEventTitle("");
        setNewEventDesc("");
        setNewEventStartTime("");
        setNewEventEndTime("");
        setNewEventLocation("");
        toast.success("Event scheduled!");
      }
    } catch (err: any) {
      toast.error("Failed to schedule event: " + err.message);
    }
  };

  // Event Delete
  const handleDeleteEvent = async (eventId: string) => {
    try {
      const success = await deleteTeamEvent(eventId);
      if (success) {
        setEvents((prev) => prev.filter((e) => e.id !== eventId));
        toast.success("Event removed");
      }
    } catch (err: any) {
      toast.error("Failed to delete event: " + err.message);
    }
  };

  // File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userContext) return;

    try {
      setUploadingFile(true);
      await uploadFileToCloud(file, userContext.companyId, currentFolderId, userContext.userId);
      const filesRes = await getFiles(userContext.companyId, currentFolderId, userContext.userId);
      setDriveFiles(filesRes);
      toast.success(`Uploaded ${file.name}`);
    } catch (err: any) {
      toast.error("File upload failed: " + err.message);
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  };

  // Create Folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim() || !userContext) return;

    try {
      await createFolder(newFolderName.trim(), userContext.companyId, currentFolderId, userContext.userId);
      const foldersRes = await getFolders(userContext.companyId, currentFolderId, userContext.userId);
      setDriveFolders(foldersRes);
      setNewFolderModalOpen(false);
      setNewFolderName("");
      toast.success("Folder created!");
    } catch (err: any) {
      toast.error("Failed to create folder: " + err.message);
    }
  };

  // File Download
  const handleDownloadFile = async (f: CloudFile) => {
    try {
      const url = await getPresignedDownloadUrl(f.storage_path);
      window.open(url, "_blank");
    } catch (err: any) {
      toast.error("Download failed: " + err.message);
    }
  };

  // File Delete
  const handleDeleteFile = async (f: CloudFile) => {
    if (!window.confirm(`Delete ${f.name}?`)) return;
    try {
      await deleteFile(f.id, f.storage_path, f.size_bytes);
      setDriveFiles((prev) => prev.filter((file) => file.id !== f.id));
      toast.success("File deleted");
    } catch (err: any) {
      toast.error("Delete failed: " + err.message);
    }
  };

  // Settings Save
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsName.trim()) return;

    try {
      setSavingSettings(true);
      const targetTeamId = team?.id || teamId;
      const success = await updateTeam(targetTeamId, {
        name: settingsName,
        description: settingsDesc,
        icon: settingsIcon,
        lead_id: settingsLeadId || null,
        is_private: settingsIsPrivate,
      });

      if (success) {
        const refreshed = await fetchTeamById(targetTeamId, currentUserId || undefined);
        if (refreshed) {
          setTeam(refreshed);
          const newSlug = slugifyTeamName(refreshed.name);
          if (typeof window !== "undefined" && window.location.pathname !== `/teams/${newSlug}`) {
            window.history.replaceState(null, "", `/teams/${newSlug}`);
          }
          localStorage.setItem("last_team_id", newSlug);
        }
        toast.success("Team settings updated successfully!");
      }
    } catch (err: any) {
      toast.error("Failed to update settings: " + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Team Delete
  const handleDeleteTeam = async () => {
    if (!window.confirm(`Are you sure you want to permanently delete the team "${team?.name}"? This action cannot be undone.`)) return;

    try {
      const targetTeamId = team?.id || teamId;
      const success = await deleteTeam(targetTeamId);
      if (success) {
        toast.success("Team deleted successfully");
        navigate({ to: "/teams" });
      }
    } catch (err: any) {
      toast.error("Failed to delete team: " + err.message);
    }
  };

  const isAdmin = currentUserRole === "admin" || currentUserRole === "super_admin";
  const isLead = team?.lead_id === currentUserId || team?.members?.some((m) => m.user_id === currentUserId && m.role === "lead");
  const canManage = isAdmin || isLead;

  // Filtered members
  const filteredMembers = (team?.members || []).filter((m) => {
    if (!memberSearch) return true;
    const q = memberSearch.toLowerCase();
    const name = m.profile?.full_name?.toLowerCase() || "";
    const email = m.profile?.email?.toLowerCase() || "";
    const role = m.profile?.designation?.toLowerCase() || "";
    return name.includes(q) || email.includes(q) || role.includes(q);
  });

  const memberCount = team?.members?.length ?? 0;
  const leadName = team?.lead?.full_name || "Unassigned";

  // Task columns grouping
  const todoTasks = tasks.filter((t) => t.status === "todo");
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
  const inReviewTasks = tasks.filter((t) => t.status === "in_review");
  const doneTasks = tasks.filter((t) => t.status === "done");

  return (
    <div className="teams-page-container">
      {/* Unified White Card Shell */}
      <div className="teams-unified-card">
        {/* Nav Header Bar inside Unified Card */}
        <div className="teams-unified-nav-header">
          <div className="teams-top-tabs-list">
            <button
              className={`teams-top-tab-btn ${activeTab === "channels" ? "active" : ""}`}
              onClick={() => setActiveTab("channels")}
            >
              <MessageSquare size={14} strokeWidth={1.4} />
              <span>Channels</span>
            </button>
            <button
              className={`teams-top-tab-btn ${activeTab === "tasks" ? "active" : ""}`}
              onClick={() => setActiveTab("tasks")}
            >
              <CheckSquare size={14} strokeWidth={1.4} />
              <span>Tasks</span>
            </button>
            <button
              className={`teams-top-tab-btn ${activeTab === "files" ? "active" : ""}`}
              onClick={() => setActiveTab("files")}
            >
              <Folder size={14} strokeWidth={1.4} />
              <span>Files</span>
            </button>
            <button
              className={`teams-top-tab-btn ${activeTab === "calendar" ? "active" : ""}`}
              onClick={() => setActiveTab("calendar")}
            >
              <CalendarIcon size={14} strokeWidth={1.4} />
              <span>Calendar</span>
            </button>
            <button
              className={`teams-top-tab-btn ${activeTab === "members" ? "active" : ""}`}
              onClick={() => setActiveTab("members")}
            >
              <Users size={14} strokeWidth={1.4} />
              <span>Members</span>
            </button>
            <button
              className={`teams-top-tab-btn ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              <LayoutGrid size={14} strokeWidth={1.4} />
              <span>Overview</span>
            </button>
            {canManage && (
              <button
                className={`teams-top-tab-btn ${activeTab === "settings" ? "active" : ""}`}
                onClick={() => setActiveTab("settings")}
              >
                <Settings size={14} strokeWidth={1.4} />
                <span>Settings</span>
              </button>
            )}
          </div>
        </div>

        {/* Unified Card Body */}
        <div className="teams-unified-body">

          {/* ========================================================================= */}
          {/* SKELETON LOADING STATE (Matching elements, static frames visible) */}
          {/* ========================================================================= */}
          {loading && (
            <>
              {activeTab === "overview" && (
                <div className="teams-overview-tab-content">
                  <div className="teams-overview-hero-card">
                    <div className="teams-hero-left">
                      <div className="teams-shimmer" style={{ width: "50px", height: "50px", borderRadius: "10px", flexShrink: 0 }} />
                      <div className="teams-hero-info" style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div className="teams-shimmer" style={{ width: "160px", height: "22px", borderRadius: "4px" }} />
                          <div className="teams-shimmer" style={{ width: "80px", height: "20px", borderRadius: "4px" }} />
                        </div>
                        <div className="teams-shimmer" style={{ width: "280px", height: "14px", borderRadius: "4px", marginTop: "6px" }} />
                      </div>
                    </div>
                    <div className="teams-hero-actions">
                      <div className="teams-shimmer" style={{ width: "100px", height: "32px", borderRadius: "6px" }} />
                      <div className="teams-shimmer" style={{ width: "110px", height: "32px", borderRadius: "6px" }} />
                    </div>
                  </div>

                  <div className="teams-overview-layout">
                    <div className="teams-overview-left">
                      <div className="teams-overview-card">
                        <h2 className="teams-card-heading">About Squad</h2>
                        <div className="teams-shimmer" style={{ width: "100%", height: "13px", borderRadius: "4px" }} />
                        <div className="teams-shimmer" style={{ width: "75%", height: "13px", borderRadius: "4px" }} />
                        <div className="teams-lead-section">
                          <span className="teams-section-eyebrow">Squad Leadership</span>
                          <div className="teams-about-lead-box">
                            <div className="teams-shimmer" style={{ width: "40px", height: "40px", borderRadius: "50%", flexShrink: 0 }} />
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                              <div className="teams-shimmer" style={{ width: "120px", height: "14px", borderRadius: "4px" }} />
                              <div className="teams-shimmer" style={{ width: "80px", height: "12px", borderRadius: "4px" }} />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="teams-overview-card">
                        <div className="teams-card-header-row">
                          <div>
                            <h2 className="teams-card-heading">Quick Resources & Links</h2>
                            <p className="teams-card-subtitle">Important squad documents, repositories, and bookmarks</p>
                          </div>
                        </div>
                        <div className="teams-quicklinks-grid">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="teams-quicklink-item">
                              <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                                <div className="teams-shimmer" style={{ width: "28px", height: "28px", borderRadius: "4px" }} />
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                                  <div className="teams-shimmer" style={{ width: "140px", height: "13px", borderRadius: "4px" }} />
                                  <div className="teams-shimmer" style={{ width: "200px", height: "11px", borderRadius: "4px" }} />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="teams-overview-right">
                      <div className="teams-overview-card">
                        <h2 className="teams-card-heading">Squad Highlights</h2>
                        <div className="teams-metrics-grid">
                          <div className="teams-metric-card">
                            <div className="teams-metric-icon-wrap icon-members">
                              <Users size={16} strokeWidth={1.5} />
                            </div>
                            <div className="teams-metric-content">
                              <div className="teams-shimmer" style={{ width: "28px", height: "20px", borderRadius: "4px" }} />
                              <span className="teams-metric-lbl">Members</span>
                            </div>
                          </div>
                          <div className="teams-metric-card">
                            <div className="teams-metric-icon-wrap icon-tasks">
                              <CheckSquare size={16} strokeWidth={1.5} />
                            </div>
                            <div className="teams-metric-content">
                              <div className="teams-shimmer" style={{ width: "28px", height: "20px", borderRadius: "4px" }} />
                              <span className="teams-metric-lbl">Squad Tasks</span>
                            </div>
                          </div>
                          <div className="teams-metric-card">
                            <div className="teams-metric-icon-wrap icon-channels">
                              <MessageSquare size={16} strokeWidth={1.5} />
                            </div>
                            <div className="teams-metric-content">
                              <div className="teams-shimmer" style={{ width: "28px", height: "20px", borderRadius: "4px" }} />
                              <span className="teams-metric-lbl">Channels</span>
                            </div>
                          </div>
                          <div className="teams-metric-card">
                            <div className="teams-metric-icon-wrap icon-events">
                              <CalendarIcon size={16} strokeWidth={1.5} />
                            </div>
                            <div className="teams-metric-content">
                              <div className="teams-shimmer" style={{ width: "28px", height: "20px", borderRadius: "4px" }} />
                              <span className="teams-metric-lbl">Events</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="teams-overview-card">
                        <div className="teams-card-header-row">
                          <h2 className="teams-card-heading">Recent Tasks</h2>
                        </div>
                        <div className="teams-mini-task-list">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="teams-mini-task-item">
                              <div className="teams-mini-task-main" style={{ flex: 1 }}>
                                <div className="teams-shimmer" style={{ width: "7px", height: "7px", borderRadius: "50%" }} />
                                <div className="teams-shimmer" style={{ width: "60%", height: "13px", borderRadius: "4px" }} />
                              </div>
                              <div className="teams-shimmer" style={{ width: "45px", height: "18px", borderRadius: "4px" }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "channels" && (
                <div className="teams-channels-layout">
                  {/* Channels Sidebar */}
                  <div className="teams-channels-sidebar">
                    <div className="teams-channels-header">
                      <span className="teams-channels-heading">CHANNELS</span>
                      <button
                        className="teams-btn-icon-subtle"
                        title="Create channel"
                        disabled
                      >
                        <Plus size={16} strokeWidth={1.4} />
                      </button>
                    </div>

                    <div className="teams-channels-list">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={`teams-channel-nav-item ${i === 1 ? "active" : ""}`} style={{ pointerEvents: "none" }}>
                          <span className="teams-channel-hash">#</span>
                          <div className="teams-shimmer" style={{ width: i === 1 ? "80px" : i === 2 ? "100px" : "65px", height: "13px", borderRadius: "4px" }} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chat Feed */}
                  <div className="teams-chat-pane">
                    <div className="teams-chat-header">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="teams-channel-hash">#</span>
                        <div className="teams-shimmer" style={{ width: "120px", height: "16px", borderRadius: "4px" }} />
                      </div>
                      <div className="teams-shimmer" style={{ width: "220px", height: "12px", borderRadius: "4px", marginTop: "4px" }} />
                    </div>

                    <div className="teams-chat-messages-container">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="teams-chat-msg-row">
                          <div className="teams-chat-msg-avatar">
                            <div className="teams-shimmer" style={{ width: "100%", height: "100%", borderRadius: "50%" }} />
                          </div>
                          <div className="teams-chat-msg-body" style={{ flex: 1 }}>
                            <div className="teams-chat-msg-top">
                              <div className="teams-shimmer" style={{ width: "90px", height: "13px", borderRadius: "4px" }} />
                              <div className="teams-shimmer" style={{ width: "40px", height: "11px", borderRadius: "4px" }} />
                            </div>
                            <div className="teams-shimmer" style={{ width: i % 2 === 0 ? "75%" : "55%", height: "14px", borderRadius: "4px", marginTop: "4px" }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Chat Input */}
                    <div className="teams-chat-input-bar">
                      <input
                        type="text"
                        placeholder="Message channel..."
                        className="teams-chat-input"
                        disabled
                      />
                      <button
                        type="button"
                        disabled
                        className="teams-chat-send-btn"
                        style={{ opacity: 0.6 }}
                      >
                        <Send size={16} strokeWidth={1.4} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "tasks" && (
                <div className="teams-tasks-container">
                  <div className="teams-tasks-toolbar">
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button className="teams-filter-pill active">All Tasks</button>
                      <button className="teams-filter-pill">My Tasks</button>
                    </div>
                    <div className="teams-shimmer" style={{ width: "100px", height: "32px", borderRadius: "6px" }} />
                  </div>
                  <div className="teams-kanban-board">
                    {["To Do", "In Progress", "In Review", "Done"].map((col) => (
                      <div key={col} className="teams-kanban-col">
                        <div className="teams-kanban-col-header">
                          <span className="teams-col-title">{col}</span>
                        </div>
                        <div className="teams-kanban-cards-stack">
                          {[1, 2].map((k) => (
                            <div key={k} className="teams-kanban-card">
                              <div className="teams-shimmer" style={{ width: "80%", height: "14px", borderRadius: "4px" }} />
                              <div className="teams-shimmer" style={{ width: "95%", height: "11px", borderRadius: "4px" }} />
                              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px" }}>
                                <div className="teams-shimmer" style={{ width: "50px", height: "16px", borderRadius: "4px" }} />
                                <div className="teams-shimmer" style={{ width: "20px", height: "20px", borderRadius: "50%" }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "files" && (
                <div className="teams-files-container">
                  <div className="teams-files-toolbar">
                    <div className="teams-files-breadcrumb">
                      <span>Root Folder</span>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <div className="teams-shimmer" style={{ width: "100px", height: "32px", borderRadius: "6px" }} />
                      <div className="teams-shimmer" style={{ width: "100px", height: "32px", borderRadius: "6px" }} />
                    </div>
                  </div>
                  <div className="teams-table-card">
                    <table className="teams-data-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Size</th>
                          <th>Last Modified</th>
                          <th style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[1, 2, 3, 4].map((i) => (
                          <tr key={i}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <div className="teams-shimmer" style={{ width: "18px", height: "18px", borderRadius: "4px" }} />
                                <div className="teams-shimmer" style={{ width: "160px", height: "13px", borderRadius: "4px" }} />
                              </div>
                            </td>
                            <td><div className="teams-shimmer" style={{ width: "40px", height: "12px", borderRadius: "4px" }} /></td>
                            <td><div className="teams-shimmer" style={{ width: "50px", height: "12px", borderRadius: "4px" }} /></td>
                            <td><div className="teams-shimmer" style={{ width: "80px", height: "12px", borderRadius: "4px" }} /></td>
                            <td style={{ textAlign: "right" }}><div className="teams-shimmer" style={{ width: "24px", height: "24px", borderRadius: "4px", marginLeft: "auto" }} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "calendar" && (
                <div className="teams-calendar-container">
                  <div className="teams-calendar-toolbar">
                    <h2 className="teams-card-heading">Upcoming Squad Events</h2>
                    <div className="teams-shimmer" style={{ width: "120px", height: "32px", borderRadius: "6px" }} />
                  </div>
                  <div className="teams-events-list">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="teams-event-card">
                        <div className="teams-event-date-badge">
                          <div className="teams-shimmer" style={{ width: "26px", height: "10px", borderRadius: "2px", margin: "0 auto 2px" }} />
                          <div className="teams-shimmer" style={{ width: "20px", height: "16px", borderRadius: "2px", margin: "0 auto" }} />
                        </div>
                        <div className="teams-event-info" style={{ flex: 1 }}>
                          <div className="teams-shimmer" style={{ width: "160px", height: "14px", borderRadius: "4px" }} />
                          <div className="teams-shimmer" style={{ width: "220px", height: "12px", borderRadius: "4px", marginTop: "4px" }} />
                          <div className="teams-shimmer" style={{ width: "100px", height: "11px", borderRadius: "4px", marginTop: "4px" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "members" && (
                <div className="teams-members-container">
                  <div className="teams-members-toolbar">
                    <div className="teams-search-box">
                      <Search size={14} strokeWidth={1.4} />
                      <input type="text" placeholder="Search squad members..." className="teams-search-input" disabled />
                    </div>
                    <div className="teams-shimmer" style={{ width: "110px", height: "32px", borderRadius: "6px" }} />
                  </div>
                  <div className="teams-table-card">
                    <table className="teams-data-table">
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th>Designation / Department</th>
                          <th>Squad Role</th>
                          <th>Joined</th>
                          <th style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[1, 2, 3, 4].map((i) => (
                          <tr key={i}>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <div className="teams-shimmer" style={{ width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0 }} />
                                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                  <div className="teams-shimmer" style={{ width: "110px", height: "13px", borderRadius: "4px" }} />
                                  <div className="teams-shimmer" style={{ width: "140px", height: "11px", borderRadius: "4px" }} />
                                </div>
                              </div>
                            </td>
                            <td><div className="teams-shimmer" style={{ width: "100px", height: "12px", borderRadius: "4px" }} /></td>
                            <td><div className="teams-shimmer" style={{ width: "60px", height: "18px", borderRadius: "4px" }} /></td>
                            <td><div className="teams-shimmer" style={{ width: "70px", height: "12px", borderRadius: "4px" }} /></td>
                            <td style={{ textAlign: "right" }}><div className="teams-shimmer" style={{ width: "24px", height: "24px", borderRadius: "4px", marginLeft: "auto" }} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "settings" && (
                <div className="teams-settings-wrapper">
                  <div className="teams-settings-layout">
                    <div className="teams-settings-card">
                      <div className="teams-settings-card-header">
                        <h2 className="teams-card-heading">Workspace Identity</h2>
                      </div>
                      <div className="teams-shimmer" style={{ width: "100%", height: "36px", borderRadius: "6px" }} />
                      <div className="teams-shimmer" style={{ width: "100%", height: "72px", borderRadius: "6px" }} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Empty state if team was not found */}
          {!loading && !team && (
            <div className="teams-empty-state" style={{ margin: "40px auto", maxWidth: "480px" }}>
              <div className="teams-empty-icon">
                <Users size={36} strokeWidth={1.4} />
              </div>
              <h3 className="teams-empty-title">Team Not Found</h3>
              <p className="teams-empty-subtitle">The requested department workspace could not be found or has been deleted.</p>
              <button onClick={() => navigate({ to: "/teams" })} className="teams-create-btn" style={{ marginTop: "16px" }}>
                Return to Teams Directory
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 1: OVERVIEW */}
          {/* ========================================================================= */}
          {!loading && team && activeTab === "overview" && (
            <div className="teams-overview-tab-content">
              {/* Enhanced Team Hero Header Card */}
              <div className="teams-overview-hero-card">
                <div className="teams-hero-left">
                  <div className="teams-hero-icon-box">
                    {getTeamIcon(team.icon)}
                  </div>
              <div className="teams-hero-info">
                <div className="teams-hero-title-row">
                  <h1 className="teams-hero-title">{team.name}</h1>
                  {team.is_private ? (
                    <span className="teams-privacy-badge is-private" title="Private squad">
                      <Lock size={12} strokeWidth={1.5} /> Private Squad
                    </span>
                  ) : (
                    <span className="teams-privacy-badge is-public" title="Public squad">
                      <Globe size={12} strokeWidth={1.5} /> Public Squad
                    </span>
                  )}
                </div>
                <p className="teams-hero-subtitle">
                  {team.description || "Squad collaborative workspace and department hub."}
                </p>
              </div>
            </div>

            <div className="teams-hero-actions">
              <button
                onClick={() => setActiveTab("channels")}
                className="teams-btn-secondary"
                title="Go to channels"
              >
                <MessageSquare size={14} strokeWidth={1.5} />
                Squad Chat
              </button>
              {canManage && (
                <button
                  onClick={() => setInviteModalOpen(true)}
                  className="teams-btn-secondary"
                >
                  <UserPlus size={14} strokeWidth={1.5} />
                  Invite Member
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => setActiveTab("settings")}
                  className="teams-btn-secondary"
                >
                  <Settings size={14} strokeWidth={1.5} />
                  Settings
                </button>
              )}
            </div>
          </div>

          <div className="teams-overview-layout">
            {/* Left Column: About & Quick Links */}
            <div className="teams-overview-left">
              {/* About Squad Card */}
              <div className="teams-overview-card">
                <div className="teams-card-header-row">
                  <h2 className="teams-card-heading">About {team.name}</h2>
                </div>
                <p className="teams-card-body-text">
                  {team.description || "Squad collaborative workspace, projects, communication channels, and department hub."}
                </p>

                <div className="teams-lead-section">
                  <span className="teams-section-eyebrow">Squad Leadership</span>
                  <div className="teams-about-lead-box">
                    <div className="teams-about-lead-avatar">
                      {team.lead?.avatar_url ? (
                        <img src={sanitizeProfilePhoto(team.lead.avatar_url)} alt={leadName} />
                      ) : (
                        leadName.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="teams-about-lead-details">
                      <h4 className="teams-about-lead-name">{leadName}</h4>
                      <p className="teams-about-lead-title">{team.lead?.designation || "Team Lead"}</p>
                      {team.lead?.email && (
                        <span className="teams-about-lead-email">{team.lead.email}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Links Card */}
              <div className="teams-overview-card">
                <div className="teams-card-header-row">
                  <div>
                    <h2 className="teams-card-heading">Quick Resources & Links</h2>
                    <p className="teams-card-subtitle">Important squad documents, repositories, and bookmarks</p>
                  </div>
                  {canManage && (
                    <button
                      onClick={() => setAddLinkModalOpen(true)}
                      className="teams-btn-secondary"
                      style={{ padding: "6px 10px", fontSize: "12px" }}
                    >
                      <Plus size={13} strokeWidth={1.5} /> Add Link
                    </button>
                  )}
                </div>

                {quickLinks.length === 0 ? (
                  <div className="teams-empty-resource-box">
                    <Link2 size={20} strokeWidth={1.4} />
                    <p>No quick links added yet.</p>
                    {canManage && (
                      <button
                        onClick={() => setAddLinkModalOpen(true)}
                        className="teams-btn-text"
                        style={{ color: "var(--teams-text-primary)", textDecoration: "underline" }}
                      >
                        Add your first resource link
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="teams-quicklinks-grid">
                    {quickLinks.map((link) => (
                      <div key={link.id} className="teams-quicklink-item">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="teams-quicklink-anchor"
                        >
                          <div className="teams-quicklink-icon-wrap">
                            <ExternalLink size={14} strokeWidth={1.5} />
                          </div>
                          <div className="teams-quicklink-info">
                            <span className="teams-quicklink-title">{link.title}</span>
                            {link.description && <p className="teams-quicklink-desc">{link.description}</p>}
                            <span className="teams-quicklink-url">{link.url.replace(/^https?:\/\//, "").slice(0, 32)}...</span>
                          </div>
                        </a>
                        {canManage && (
                          <button
                            onClick={() => handleDeleteQuickLink(link.id)}
                            className="teams-btn-icon-subtle"
                            title="Remove link"
                          >
                            <Trash2 size={13} strokeWidth={1.5} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Team Activity Feed & Metrics */}
            <div className="teams-overview-right">
              {/* Key Metrics Grid */}
              <div className="teams-overview-card">
                <h2 className="teams-card-heading">Squad Highlights</h2>
                <div className="teams-metrics-grid">
                  <div className="teams-metric-card">
                    <div className="teams-metric-icon-wrap icon-members">
                      <Users size={16} strokeWidth={1.5} />
                    </div>
                    <div className="teams-metric-content">
                      <span className="teams-metric-num">{memberCount}</span>
                      <span className="teams-metric-lbl">Members</span>
                    </div>
                  </div>
                  <div className="teams-metric-card">
                    <div className="teams-metric-icon-wrap icon-tasks">
                      <CheckSquare size={16} strokeWidth={1.5} />
                    </div>
                    <div className="teams-metric-content">
                      <span className="teams-metric-num">{tasks.length}</span>
                      <span className="teams-metric-lbl">Squad Tasks</span>
                    </div>
                  </div>
                  <div className="teams-metric-card">
                    <div className="teams-metric-icon-wrap icon-channels">
                      <MessageSquare size={16} strokeWidth={1.5} />
                    </div>
                    <div className="teams-metric-content">
                      <span className="teams-metric-num">{channels.length}</span>
                      <span className="teams-metric-lbl">Channels</span>
                    </div>
                  </div>
                  <div className="teams-metric-card">
                    <div className="teams-metric-icon-wrap icon-events">
                      <CalendarIcon size={16} strokeWidth={1.5} />
                    </div>
                    <div className="teams-metric-content">
                      <span className="teams-metric-num">{events.length}</span>
                      <span className="teams-metric-lbl">Events</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent Squad Tasks */}
              <div className="teams-overview-card">
                <div className="teams-card-header-row">
                  <h2 className="teams-card-heading">Recent Tasks</h2>
                  {tasks.length > 0 && (
                    <button
                      onClick={() => setActiveTab("tasks")}
                      className="teams-btn-text"
                    >
                      View all <ChevronRight size={13} strokeWidth={1.5} />
                    </button>
                  )}
                </div>

                {tasks.length === 0 ? (
                  <div className="teams-empty-resource-box">
                    <CheckSquare size={20} strokeWidth={1.4} />
                    <p>No tasks created in this squad yet.</p>
                    <button
                      onClick={() => {
                        setActiveTab("tasks");
                        setNewTaskModalOpen(true);
                      }}
                      className="teams-btn-text"
                      style={{ color: "var(--teams-text-primary)", textDecoration: "underline" }}
                    >
                      Create first task
                    </button>
                  </div>
                ) : (
                  <div className="teams-mini-task-list">
                    {tasks.slice(0, 5).map((t) => (
                      <div key={t.id} className="teams-mini-task-item" onClick={() => setActiveTab("tasks")}>
                        <div className="teams-mini-task-main">
                          <span className={`teams-task-status-indicator status-${t.status}`} />
                          <span className="teams-mini-task-title">{t.title}</span>
                        </div>
                        <span className={`teams-tag-badge priority-${t.priority}`}>
                          {t.priority}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MEMBERS */}
      {/* ========================================================================= */}
      {!loading && team && activeTab === "members" && (
        <div className="teams-members-container">
          <div className="teams-members-toolbar">
            <div className="teams-search-box">
              <Search size={16} strokeWidth={1.4} className="teams-search-icon" />
              <input
                type="text"
                placeholder="Search team members..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="teams-search-input"
              />
            </div>

            {canManage && (
              <button
                onClick={() => setInviteModalOpen(true)}
                className="teams-create-btn"
              >
                <Plus size={16} strokeWidth={1.4} />
                Add Member
              </button>
            )}
          </div>

          <div className="teams-table-card">
            <table className="teams-data-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Designation</th>
                  <th>Role in Squad</th>
                  <th>Email</th>
                  {canManage && <th style={{ textAlign: "right" }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m) => {
                  const name = m.profile?.full_name || "Employee";
                  const photo = m.profile?.avatar_url;
                  const designation = m.profile?.designation || "Staff";
                  const email = m.profile?.email || "—";
                  const isSquadLead = m.role === "lead" || team.lead_id === m.user_id;

                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="teams-table-user">
                          <div className="teams-table-avatar">
                            {photo ? (
                              <img src={sanitizeProfilePhoto(photo)} alt={name} />
                            ) : (
                              name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <span className="teams-table-name">{name}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="teams-table-cell-text">{designation}</span>
                      </td>
                      <td>
                        <span className={`teams-role-pill ${isSquadLead ? "lead" : "member"}`}>
                          {isSquadLead ? "Team Lead" : "Member"}
                        </span>
                      </td>
                      <td>
                        <span className="teams-table-cell-text">{email}</span>
                      </td>
                      {canManage && (
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "8px" }}>
                            <button
                              onClick={() => handleToggleMemberRole(m)}
                              className="teams-btn-text"
                              title={isSquadLead ? "Demote to member" : "Promote to lead"}
                            >
                              {isSquadLead ? "Set as Member" : "Set as Lead"}
                            </button>
                            <button
                              onClick={() => handleRemoveMember(m.user_id)}
                              className="teams-btn-icon-subtle"
                              title="Remove member"
                            >
                              <Trash2 size={14} strokeWidth={1.4} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: CHANNELS & REALTIME CHAT */}
      {/* ========================================================================= */}
      {!loading && team && activeTab === "channels" && (
        <div className="teams-channels-layout">
          {/* Channels Sidebar */}
          <div className="teams-channels-sidebar">
            <div className="teams-channels-header">
              <span className="teams-channels-heading">CHANNELS</span>
              <button
                onClick={() => setNewChannelModalOpen(true)}
                className="teams-btn-icon-subtle"
                title="Create channel"
              >
                <Plus size={16} strokeWidth={1.4} />
              </button>
            </div>

            <div className="teams-channels-list">
              {channels.map((chan) => (
                <button
                  key={chan.id}
                  className={`teams-channel-nav-item ${activeChannelId === chan.id ? "active" : ""}`}
                  onClick={() => setActiveChannelId(chan.id)}
                >
                  <span className="teams-channel-hash">#</span>
                  <span className="teams-channel-name">{chan.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Chat Feed */}
          <div className="teams-chat-pane">
            <div className="teams-chat-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="teams-channel-hash">#</span>
                <h3 className="teams-chat-channel-title">
                  {channels.find((c) => c.id === activeChannelId)?.name || "channel"}
                </h3>
              </div>
              <p className="teams-chat-channel-desc">
                {channels.find((c) => c.id === activeChannelId)?.description || "Discussion thread"}
              </p>
            </div>

            <div className="teams-chat-messages-container">
              {channelMessages.length === 0 ? (
                <div className="teams-chat-empty">
                  <MessageSquare size={32} strokeWidth={1.4} />
                  <p>No messages in this channel yet. Start the conversation!</p>
                </div>
              ) : (
                channelMessages.map((msg) => {
                  const author = msg.profile?.full_name || "Employee";
                  const photo = msg.profile?.avatar_url;
                  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                  return (
                    <div key={msg.id} className="teams-chat-msg-row">
                      <div className="teams-chat-msg-avatar">
                        {photo ? (
                          <img src={sanitizeProfilePhoto(photo)} alt={author} />
                        ) : (
                          author.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="teams-chat-msg-body">
                        <div className="teams-chat-msg-top">
                          <span className="teams-chat-msg-author">{author}</span>
                          <span className="teams-chat-msg-time">{time}</span>
                        </div>
                        <p className="teams-chat-msg-content">{msg.content}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="teams-chat-input-bar">
              <input
                type="text"
                placeholder={`Message #${channels.find((c) => c.id === activeChannelId)?.name || "channel"}...`}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="teams-chat-input"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="teams-chat-send-btn"
              >
                <Send size={16} strokeWidth={1.4} />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: TASKS KANBAN BOARD */}
      {/* ========================================================================= */}
      {!loading && team && activeTab === "tasks" && (
        <div className="teams-kanban-container">
          <div className="teams-kanban-toolbar">
            <h2 className="teams-kanban-heading">Squad Kanban Tasks</h2>
            <button
              onClick={() => setTaskModalOpen(true)}
              className="teams-create-btn"
            >
              <Plus size={16} strokeWidth={1.4} />
              Add Task
            </button>
          </div>

          <div className="teams-kanban-board">
            {/* Column 1: To Do */}
            <div className="teams-kanban-column">
              <div className="teams-kanban-col-header">
                <span className="teams-col-title">To Do</span>
                <span className="teams-col-count">{todoTasks.length}</span>
              </div>
              <div className="teams-kanban-cards-stack">
                {todoTasks.map((t) => (
                  <div key={t.id} className="teams-kanban-card">
                    <div className="teams-kanban-card-top">
                      <span className={`teams-tag-badge priority-${t.priority}`}>{t.priority}</span>
                      <button
                        onClick={() => handleDeleteTask(t.id)}
                        className="teams-btn-icon-subtle"
                        title="Delete task"
                      >
                        <Trash2 size={12} strokeWidth={1.4} />
                      </button>
                    </div>
                    <h4 className="teams-kanban-card-title">{t.title}</h4>
                    {t.description && <p className="teams-kanban-card-desc">{t.description}</p>}
                    <div className="teams-kanban-card-footer">
                      <span className="teams-kanban-due">
                        <Clock size={12} strokeWidth={1.4} /> {t.due_date ? new Date(t.due_date).toLocaleDateString([], { month: "short", day: "numeric" }) : "No due date"}
                      </span>
                      <button
                        onClick={() => handleUpdateTaskStatus(t.id, "in_progress")}
                        className="teams-btn-text"
                        style={{ fontSize: "11px" }}
                      >
                        Start &rarr;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 2: In Progress */}
            <div className="teams-kanban-column">
              <div className="teams-kanban-col-header">
                <span className="teams-col-title">In Progress</span>
                <span className="teams-col-count">{inProgressTasks.length}</span>
              </div>
              <div className="teams-kanban-cards-stack">
                {inProgressTasks.map((t) => (
                  <div key={t.id} className="teams-kanban-card">
                    <div className="teams-kanban-card-top">
                      <span className={`teams-tag-badge priority-${t.priority}`}>{t.priority}</span>
                      <button
                        onClick={() => handleDeleteTask(t.id)}
                        className="teams-btn-icon-subtle"
                        title="Delete task"
                      >
                        <Trash2 size={12} strokeWidth={1.4} />
                      </button>
                    </div>
                    <h4 className="teams-kanban-card-title">{t.title}</h4>
                    {t.description && <p className="teams-kanban-card-desc">{t.description}</p>}
                    <div className="teams-kanban-card-footer">
                      <button
                        onClick={() => handleUpdateTaskStatus(t.id, "todo")}
                        className="teams-btn-text"
                        style={{ fontSize: "11px" }}
                      >
                        &larr; To Do
                      </button>
                      <button
                        onClick={() => handleUpdateTaskStatus(t.id, "in_review")}
                        className="teams-btn-text"
                        style={{ fontSize: "11px" }}
                      >
                        Review &rarr;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 3: In Review */}
            <div className="teams-kanban-column">
              <div className="teams-kanban-col-header">
                <span className="teams-col-title">In Review</span>
                <span className="teams-col-count">{inReviewTasks.length}</span>
              </div>
              <div className="teams-kanban-cards-stack">
                {inReviewTasks.map((t) => (
                  <div key={t.id} className="teams-kanban-card">
                    <div className="teams-kanban-card-top">
                      <span className={`teams-tag-badge priority-${t.priority}`}>{t.priority}</span>
                      <button
                        onClick={() => handleDeleteTask(t.id)}
                        className="teams-btn-icon-subtle"
                        title="Delete task"
                      >
                        <Trash2 size={12} strokeWidth={1.4} />
                      </button>
                    </div>
                    <h4 className="teams-kanban-card-title">{t.title}</h4>
                    {t.description && <p className="teams-kanban-card-desc">{t.description}</p>}
                    <div className="teams-kanban-card-footer">
                      <button
                        onClick={() => handleUpdateTaskStatus(t.id, "in_progress")}
                        className="teams-btn-text"
                        style={{ fontSize: "11px" }}
                      >
                        &larr; Back
                      </button>
                      <button
                        onClick={() => handleUpdateTaskStatus(t.id, "done")}
                        className="teams-btn-text"
                        style={{ fontSize: "11px", color: "var(--teams-success)" }}
                      >
                        Done &check;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Column 4: Done */}
            <div className="teams-kanban-column">
              <div className="teams-kanban-col-header">
                <span className="teams-col-title">Done</span>
                <span className="teams-col-count">{doneTasks.length}</span>
              </div>
              <div className="teams-kanban-cards-stack">
                {doneTasks.map((t) => (
                  <div key={t.id} className="teams-kanban-card done">
                    <div className="teams-kanban-card-top">
                      <span className="teams-tag-badge priority-done">Completed</span>
                      <button
                        onClick={() => handleDeleteTask(t.id)}
                        className="teams-btn-icon-subtle"
                        title="Delete task"
                      >
                        <Trash2 size={12} strokeWidth={1.4} />
                      </button>
                    </div>
                    <h4 className="teams-kanban-card-title" style={{ textDecoration: "line-through", color: "var(--teams-text-secondary)" }}>
                      {t.title}
                    </h4>
                    <div className="teams-kanban-card-footer">
                      <span className="teams-kanban-due">
                        <CheckCircle2 size={12} strokeWidth={1.4} color="var(--teams-success)" /> Complete
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: FILES & RESOURCES (CLOUD DRIVE) */}
      {/* ========================================================================= */}
      {!loading && team && activeTab === "files" && (
        <div className="teams-files-container">
          <div className="teams-files-toolbar">
            <h2 className="teams-card-heading">Team Drive & Files</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => setNewFolderModalOpen(true)}
                className="teams-btn-secondary"
              >
                <Folder size={16} strokeWidth={1.4} />
                New Folder
              </button>
              <label className="teams-create-btn" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Upload size={16} strokeWidth={1.4} />
                {uploadingFile ? "Uploading..." : "Upload File"}
                <input
                  type="file"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                  disabled={uploadingFile}
                />
              </label>
            </div>
          </div>

          {filesLoading ? (
            <div className="teams-shimmer" style={{ height: "200px", borderRadius: "8px" }} />
          ) : driveFolders.length === 0 && driveFiles.length === 0 ? (
            <div className="teams-empty-state">
              <Folder size={32} strokeWidth={1.4} />
              <h3 className="teams-empty-title">No Files Uploaded Yet</h3>
              <p className="teams-empty-subtitle">Upload squad documentation, blueprints, spreadsheets, and design assets.</p>
            </div>
          ) : (
            <div className="teams-table-card">
              <table className="teams-data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Last Modified</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {driveFolders.map((f) => (
                    <tr
                      key={f.id}
                      onClick={() => setCurrentFolderId(f.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <Folder size={18} strokeWidth={1.4} color="#f59e0b" />
                          <span className="teams-table-name">{f.name}</span>
                        </div>
                      </td>
                      <td><span className="teams-table-cell-text">Folder</span></td>
                      <td><span className="teams-table-cell-text">—</span></td>
                      <td><span className="teams-table-cell-text">{new Date(f.updated_at).toLocaleDateString()}</span></td>
                      <td style={{ textAlign: "right" }}><ChevronRight size={16} strokeWidth={1.4} /></td>
                    </tr>
                  ))}
                  {driveFiles.map((file) => (
                    <tr key={file.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <FileText size={18} strokeWidth={1.4} />
                          <span className="teams-table-name">{file.name}</span>
                        </div>
                      </td>
                      <td><span className="teams-table-cell-text">{file.mime_type || "File"}</span></td>
                      <td><span className="teams-table-cell-text">{(file.size_bytes / (1024 * 1024)).toFixed(2)} MB</span></td>
                      <td><span className="teams-table-cell-text">{new Date(file.created_at).toLocaleDateString()}</span></td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "8px" }}>
                          <button
                            onClick={() => handleDownloadFile(file)}
                            className="teams-btn-icon-subtle"
                            title="Download file"
                          >
                            <Download size={14} strokeWidth={1.4} />
                          </button>
                          <button
                            onClick={() => handleDeleteFile(file)}
                            className="teams-btn-icon-subtle"
                            title="Delete file"
                          >
                            <Trash2 size={14} strokeWidth={1.4} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: CALENDAR */}
      {/* ========================================================================= */}
      {!loading && team && activeTab === "calendar" && (
        <div className="teams-calendar-container">
          <div className="teams-calendar-toolbar">
            <h2 className="teams-card-heading">Squad Milestones & Events</h2>
            <button
              onClick={() => setEventModalOpen(true)}
              className="teams-create-btn"
            >
              <Plus size={16} strokeWidth={1.4} />
              Schedule Event
            </button>
          </div>

          {events.length === 0 ? (
            <div className="teams-empty-state">
              <CalendarIcon size={32} strokeWidth={1.4} />
              <h3 className="teams-empty-title">No Scheduled Events</h3>
              <p className="teams-empty-subtitle">Schedule upcoming sprints, release deadlines, and team syncs.</p>
            </div>
          ) : (
            <div className="teams-events-list">
              {events.map((ev) => {
                const date = new Date(ev.start_time).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
                const time = new Date(ev.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                return (
                  <div key={ev.id} className="teams-event-card">
                    <div className="teams-event-date-box">
                      <span className="teams-event-date-month">{new Date(ev.start_time).toLocaleDateString([], { month: "short" })}</span>
                      <span className="teams-event-date-day">{new Date(ev.start_time).getDate()}</span>
                    </div>
                    <div className="teams-event-info">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <h4 className="teams-event-title">{ev.title}</h4>
                        <span className={`teams-tag-badge type-${ev.event_type}`}>{ev.event_type}</span>
                      </div>
                      <p className="teams-event-desc">{ev.description || "No description provided"}</p>
                      <span className="teams-event-time">
                        <Clock size={12} strokeWidth={1.4} /> {time} {ev.location && `• ${ev.location}`}
                      </span>
                    </div>
                    {canManage && (
                      <button
                        onClick={() => handleDeleteEvent(ev.id)}
                        className="teams-btn-icon-subtle"
                        title="Delete event"
                      >
                        <Trash2 size={16} strokeWidth={1.4} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 7: SETTINGS */}
      {/* ========================================================================= */}
      {!loading && team && activeTab === "settings" && canManage && (
        <div className="teams-settings-wrapper">
          <form onSubmit={handleSaveSettings} className="teams-settings-layout">
            
            {/* Card 1: Workspace Profile */}
            <div className="teams-settings-card">
              <div className="teams-settings-card-header">
                <h2 className="teams-card-heading">Workspace Identity</h2>
                <p className="teams-card-subtitle">Manage squad name, description, and visual icon</p>
              </div>

              <div className="teams-form-group">
                <label className="teams-form-label">Squad Name <span style={{ color: "var(--teams-danger)" }}>*</span></label>
                <input
                  type="text"
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                  className="teams-form-input"
                  placeholder="e.g. Platform Engineering"
                  required
                />
              </div>

              <div className="teams-form-group">
                <label className="teams-form-label">Mission & Description</label>
                <textarea
                  value={settingsDesc}
                  onChange={(e) => setSettingsDesc(e.target.value)}
                  className="teams-form-textarea"
                  placeholder="Summarize the purpose and goals of this squad..."
                  rows={3}
                />
              </div>

              <div className="teams-form-group">
                <label className="teams-form-label">Squad Icon</label>
                <select
                  value={settingsIcon}
                  onChange={(e) => setSettingsIcon(e.target.value)}
                  className="teams-form-select"
                >
                  <option value="Users">👥 Users (General Squad)</option>
                  <option value="Code2">💻 Code2 (Engineering)</option>
                  <option value="TrendingUp">📈 TrendingUp (Sales & Growth)</option>
                  <option value="Megaphone">📢 Megaphone (Marketing & Brand)</option>
                  <option value="UserCheck">🤝 UserCheck (Human Resources)</option>
                  <option value="CreditCard">💳 CreditCard (Finance & Accounting)</option>
                  <option value="Headphones">🎧 Headphones (Customer Support)</option>
                  <option value="Boxes">📦 Boxes (Product Management)</option>
                  <option value="Zap">⚡ Zap (Operations & Strategy)</option>
                  <option value="Palette">🎨 Palette (Design & Creative)</option>
                  <option value="Server">🖥️ Server (Infrastructure & IT)</option>
                  <option value="Scale">⚖️ Scale (Legal & Compliance)</option>
                </select>
              </div>
            </div>

            {/* Card 2: Privacy & Visibility */}
            <div className="teams-settings-card">
              <div className="teams-settings-card-header">
                <h2 className="teams-card-heading">Privacy & Access</h2>
                <p className="teams-card-subtitle">Choose who can discover and participate in this squad</p>
              </div>

              <div className="teams-privacy-selector-grid">
                <div
                  className={`teams-privacy-option-card ${!settingsIsPrivate ? "selected" : ""}`}
                  onClick={() => setSettingsIsPrivate(false)}
                >
                  <div className="teams-privacy-option-header">
                    <div className="teams-privacy-icon-box">
                      <Globe size={18} strokeWidth={1.5} />
                    </div>
                    <div className="teams-radio-dot">{!settingsIsPrivate && <span />}</div>
                  </div>
                  <h4 className="teams-privacy-option-title">Public Squad</h4>
                  <p className="teams-privacy-option-desc">
                    Visible to all company members. Anyone can view squad info and join discussions.
                  </p>
                </div>

                <div
                  className={`teams-privacy-option-card ${settingsIsPrivate ? "selected" : ""}`}
                  onClick={() => setSettingsIsPrivate(true)}
                >
                  <div className="teams-privacy-option-header">
                    <div className="teams-privacy-icon-box">
                      <Lock size={18} strokeWidth={1.5} />
                    </div>
                    <div className="teams-radio-dot">{settingsIsPrivate && <span />}</div>
                  </div>
                  <h4 className="teams-privacy-option-title">Private Squad</h4>
                  <p className="teams-privacy-option-desc">
                    Restricted squad. Visible and accessible only to invited members.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 3: Squad Leadership */}
            <div className="teams-settings-card">
              <div className="teams-settings-card-header">
                <h2 className="teams-card-heading">Squad Leadership</h2>
                <p className="teams-card-subtitle">Assign the primary team lead or department manager</p>
              </div>

              <div className="teams-form-group">
                <label className="teams-form-label">Assigned Squad Lead</label>
                <select
                  value={settingsLeadId}
                  onChange={(e) => setSettingsLeadId(e.target.value)}
                  className="teams-form-select"
                >
                  <option value="">-- No Lead Assigned --</option>
                  {companyEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} — {emp.designation || emp.department_name || "Employee"}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Save Action Bar */}
            <div className="teams-settings-action-bar">
              <button
                type="submit"
                disabled={savingSettings}
                className="teams-create-btn"
              >
                {savingSettings ? "Saving Changes..." : "Save Workspace Changes"}
              </button>
            </div>
          </form>

          {/* Card 4: Danger Zone */}
          <div className="teams-danger-card">
            <div className="teams-danger-card-header">
              <div className="teams-danger-icon-wrap">
                <AlertTriangle size={18} strokeWidth={1.5} />
              </div>
              <div>
                <h3 className="teams-danger-heading">Danger Zone</h3>
                <p className="teams-danger-text">
                  Permanently delete this team, channels, chat history, tasks, and member associations.
                </p>
              </div>
            </div>
            <button
              onClick={handleDeleteTeam}
              className="teams-btn-danger"
            >
              Delete Squad Workspace
            </button>
          </div>
        </div>
      )}

        </div> {/* /teams-unified-body */}
      </div> {/* /teams-unified-card */}

      {/* ========================================================================= */}
      {/* MODAL: INVITE MEMBER */}
      {/* ========================================================================= */}
      <Dialog.Root open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="teams-modal-overlay" />
          <Dialog.Content className="teams-modal-content">
            <div className="teams-modal-header">
              <Dialog.Title className="teams-modal-title">Add Member to {team?.name || "Team"}</Dialog.Title>
              <Dialog.Close asChild>
                <button className="teams-btn-icon-subtle"><CloseIcon size={16} strokeWidth={1.4} /></button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleAddMember} className="teams-modal-form">
              <div className="teams-form-group">
                <label className="teams-form-label">Select Employee</label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="teams-form-select"
                  required
                >
                  <option value="">Select from company directory...</option>
                  {companyEmployees
                    .filter((emp) => !team?.members?.some((m) => m.user_id === emp.id))
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({emp.designation || emp.department_name || "Employee"})
                      </option>
                    ))}
                </select>
              </div>

              <div className="teams-form-group">
                <label className="teams-form-label">Squad Role</label>
                <select
                  value={selectedEmployeeRole}
                  onChange={(e) => setSelectedEmployeeRole(e.target.value as any)}
                  className="teams-form-select"
                >
                  <option value="member">Member</option>
                  <option value="lead">Team Lead</option>
                </select>
              </div>

              <div className="teams-modal-footer">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="teams-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingMember || !selectedEmployeeId}
                  className="teams-create-btn"
                >
                  {submittingMember ? "Adding..." : "Add Member"}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ========================================================================= */}
      {/* MODAL: ADD TASK */}
      {/* ========================================================================= */}
      <Dialog.Root open={taskModalOpen} onOpenChange={setTaskModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="teams-modal-overlay" />
          <Dialog.Content className="teams-modal-content">
            <div className="teams-modal-header">
              <Dialog.Title className="teams-modal-title">Create Team Task</Dialog.Title>
              <Dialog.Close asChild>
                <button className="teams-btn-icon-subtle"><CloseIcon size={16} strokeWidth={1.4} /></button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleCreateTask} className="teams-modal-form">
              <div className="teams-form-group">
                <label className="teams-form-label">Task Title</label>
                <input
                  type="text"
                  placeholder="e.g. Implement OAuth login"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="teams-form-input"
                  required
                />
              </div>

              <div className="teams-form-group">
                <label className="teams-form-label">Description</label>
                <textarea
                  placeholder="Details and acceptance criteria..."
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="teams-form-textarea"
                  rows={3}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="teams-form-group">
                  <label className="teams-form-label">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="teams-form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="teams-form-group">
                  <label className="teams-form-label">Due Date</label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="teams-form-input"
                  />
                </div>
              </div>

              <div className="teams-form-group">
                <label className="teams-form-label">Assignee</label>
                <select
                  value={newTaskAssigneeId}
                  onChange={(e) => setNewTaskAssigneeId(e.target.value)}
                  className="teams-form-select"
                >
                  <option value="">Unassigned</option>
                  {team?.members?.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.profile?.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="teams-modal-footer">
                <button
                  type="button"
                  onClick={() => setTaskModalOpen(false)}
                  className="teams-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="teams-create-btn">
                  Create Task
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ========================================================================= */}
      {/* MODAL: ADD QUICK LINK */}
      {/* ========================================================================= */}
      <Dialog.Root open={addLinkModalOpen} onOpenChange={setAddLinkModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="teams-modal-overlay" />
          <Dialog.Content className="teams-modal-content">
            <div className="teams-modal-header">
              <Dialog.Title className="teams-modal-title">Add Squad Quick Link</Dialog.Title>
              <Dialog.Close asChild>
                <button className="teams-btn-icon-subtle"><CloseIcon size={16} strokeWidth={1.4} /></button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleAddQuickLink} className="teams-modal-form">
              <div className="teams-form-group">
                <label className="teams-form-label">Title</label>
                <input
                  type="text"
                  placeholder="e.g. Figma Design System"
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                  className="teams-form-input"
                  required
                />
              </div>

              <div className="teams-form-group">
                <label className="teams-form-label">URL</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  className="teams-form-input"
                  required
                />
              </div>

              <div className="teams-form-group">
                <label className="teams-form-label">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Component library and tokens"
                  value={newLinkDesc}
                  onChange={(e) => setNewLinkDesc(e.target.value)}
                  className="teams-form-input"
                />
              </div>

              <div className="teams-modal-footer">
                <button
                  type="button"
                  onClick={() => setAddLinkModalOpen(false)}
                  className="teams-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="teams-create-btn">
                  Add Link
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ========================================================================= */}
      {/* MODAL: CREATE CHANNEL */}
      {/* ========================================================================= */}
      <Dialog.Root open={newChannelModalOpen} onOpenChange={setNewChannelModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="teams-modal-overlay" />
          <Dialog.Content className="teams-modal-content">
            <div className="teams-modal-header">
              <Dialog.Title className="teams-modal-title">Create New Channel</Dialog.Title>
              <Dialog.Close asChild>
                <button className="teams-btn-icon-subtle"><CloseIcon size={16} strokeWidth={1.4} /></button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleCreateChannel} className="teams-modal-form">
              <div className="teams-form-group">
                <label className="teams-form-label">Channel Name</label>
                <input
                  type="text"
                  placeholder="e.g. dev-updates"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  className="teams-form-input"
                  required
                />
              </div>

              <div className="teams-form-group">
                <label className="teams-form-label">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="What is this channel about?"
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                  className="teams-form-input"
                />
              </div>

              <div className="teams-modal-footer">
                <button
                  type="button"
                  onClick={() => setNewChannelModalOpen(false)}
                  className="teams-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="teams-create-btn">
                  Create Channel
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ========================================================================= */}
      {/* MODAL: SCHEDULE EVENT */}
      {/* ========================================================================= */}
      <Dialog.Root open={eventModalOpen} onOpenChange={setEventModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="teams-modal-overlay" />
          <Dialog.Content className="teams-modal-content">
            <div className="teams-modal-header">
              <Dialog.Title className="teams-modal-title">Schedule Squad Event</Dialog.Title>
              <Dialog.Close asChild>
                <button className="teams-btn-icon-subtle"><CloseIcon size={16} strokeWidth={1.4} /></button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleCreateEvent} className="teams-modal-form">
              <div className="teams-form-group">
                <label className="teams-form-label">Event Title</label>
                <input
                  type="text"
                  placeholder="e.g. Sprint Planning Sync"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="teams-form-input"
                  required
                />
              </div>

              <div className="teams-form-group">
                <label className="teams-form-label">Type</label>
                <select
                  value={newEventType}
                  onChange={(e) => setNewEventType(e.target.value as any)}
                  className="teams-form-select"
                >
                  <option value="meeting">Meeting</option>
                  <option value="sprint">Sprint</option>
                  <option value="deadline">Deadline</option>
                  <option value="review">Design Review</option>
                  <option value="social">Social</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div className="teams-form-group">
                  <label className="teams-form-label">Start Time</label>
                  <input
                    type="datetime-local"
                    value={newEventStartTime}
                    onChange={(e) => setNewEventStartTime(e.target.value)}
                    className="teams-form-input"
                    required
                  />
                </div>
                <div className="teams-form-group">
                  <label className="teams-form-label">End Time</label>
                  <input
                    type="datetime-local"
                    value={newEventEndTime}
                    onChange={(e) => setNewEventEndTime(e.target.value)}
                    className="teams-form-input"
                  />
                </div>
              </div>

              <div className="teams-form-group">
                <label className="teams-form-label">Location / Link</label>
                <input
                  type="text"
                  placeholder="e.g. Room 402 or Google Meet link"
                  value={newEventLocation}
                  onChange={(e) => setNewEventLocation(e.target.value)}
                  className="teams-form-input"
                />
              </div>

              <div className="teams-modal-footer">
                <button
                  type="button"
                  onClick={() => setEventModalOpen(false)}
                  className="teams-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="teams-create-btn">
                  Schedule Event
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ========================================================================= */}
      {/* MODAL: CREATE FOLDER */}
      {/* ========================================================================= */}
      <Dialog.Root open={newFolderModalOpen} onOpenChange={setNewFolderModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="teams-modal-overlay" />
          <Dialog.Content className="teams-modal-content">
            <div className="teams-modal-header">
              <Dialog.Title className="teams-modal-title">Create Folder</Dialog.Title>
              <Dialog.Close asChild>
                <button className="teams-btn-icon-subtle"><CloseIcon size={16} strokeWidth={1.4} /></button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleCreateFolder} className="teams-modal-form">
              <div className="teams-form-group">
                <label className="teams-form-label">Folder Name</label>
                <input
                  type="text"
                  placeholder="e.g. Architecture Diagrams"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="teams-form-input"
                  required
                />
              </div>

              <div className="teams-modal-footer">
                <button
                  type="button"
                  onClick={() => setNewFolderModalOpen(false)}
                  className="teams-btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="teams-create-btn">
                  Create Folder
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
