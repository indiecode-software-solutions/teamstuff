import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabase";
import {
  getTasksAssignedToUser,
  getTasksAssignedByUser,
  updateTaskStatus,
  removeTaskAttachment,
  addTaskAttachment,
  Task,
  TaskAttachment,
} from "../lib/tasks";
import {
  getAuthenticatedUserContext,
  getPresignedDownloadUrl,
  deleteFile,
  ensureTaskAttachmentsFolder,
  uploadFileToCloud,
} from "../lib/cloud-drive";
import { CreateTaskDialog } from "../components/tasks/CreateTaskDialog";
import {
  Plus as AddIcon,
  Flame as LocalFireDepartment,
  Clock as AccessTime,
  CircleCheck as CheckCircleOutlined,
  Hourglass as HourglassEmpty,
  Calendar as CalendarToday,
  Inbox as EmptyInboxIcon,
  Download as DownloadIcon,
  Trash2 as DeleteIcon,
  Paperclip,
  Search,
  Check,
  ArrowRight,
  ArrowLeft,
  X as CloseIcon,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  File as FileGeneric,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "../components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../components/ui/tooltip";

function formatTurnaroundTime(createdAtStr?: string, completedAtStr?: string): string {
  if (!createdAtStr) return "Done";
  const start = new Date(createdAtStr).getTime();
  const end = completedAtStr ? new Date(completedAtStr).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
  if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
  return `${Math.max(1, diffMins)}m`;
}

function formatRelativeDue(dateStr?: string): { text: string; className: string } {
  if (!dateStr) return { text: "No due date", className: "" };
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dateStr);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: `${Math.abs(diffDays)}d overdue`, className: "overdue" };
    }
    if (diffDays === 0) {
      return { text: "Due Today", className: "today" };
    }
    if (diffDays === 1) {
      return { text: "Due Tomorrow", className: "today" };
    }
    return {
      text: due.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      className: "",
    };
  } catch {
    return { text: dateStr, className: "" };
  }
}

import { getDynamicPageTitle } from "../lib/tenant-brand";

export const Route = createFileRoute("/tasks")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      task: typeof search.task === "string" ? search.task : undefined,
    };
  },
  head: () => ({
    title: getDynamicPageTitle("Tasks"),
    meta: [
      {
        name: "description",
        content: "Kanban Task Workspace.",
      },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const [loading, setLoading] = React.useState(true);
  const [activeScope, setActiveScope] = React.useState<"assigned" | "sent">("assigned");
  const [scopeTransitioning, setScopeTransitioning] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");

  const handleScopeChange = (newScope: "assigned" | "sent") => {
    if (newScope === activeScope) return;
    setScopeTransitioning(true);
    setActiveScope(newScope);
    setTimeout(() => {
      setScopeTransitioning(false);
    }, 280);
  };

  // Supabase states
  const [assignedTasks, setAssignedTasks] = React.useState<Task[]>([]);
  const [sentTasks, setSentTasks] = React.useState<Task[]>([]);
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);
  const [companyId, setCompanyId] = React.useState<string | null>(null);

  // Modal states
  const [openModal, setOpenModal] = React.useState(false);
  const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
  const [openDetailsModal, setOpenDetailsModal] = React.useState(false);
  const [uploadingDrawerFile, setUploadingDrawerFile] = React.useState(false);
  const [highlightTaskId, setHighlightTaskId] = React.useState<string | null>(null);

  const fetchTaskData = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setCurrentUserId(user.id);

      let targetCompanyId: string | null = null;
      if (typeof window !== "undefined") {
        try {
          const stored = sessionStorage.getItem("impersonated_company");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.id) targetCompanyId = parsed.id;
          }
        } catch {}
      }

      if (!targetCompanyId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", user.id)
          .maybeSingle();
        if (profile?.company_id) {
          targetCompanyId = profile.company_id;
        }
      }

      if (targetCompanyId) {
        setCompanyId(targetCompanyId);
        const [assignedList, sentList] = await Promise.all([
          getTasksAssignedToUser(targetCompanyId, user.id),
          getTasksAssignedByUser(targetCompanyId, user.id),
        ]);
        setAssignedTasks(assignedList);
        setSentTasks(sentList);
      }
    } catch (err) {
      console.error("Error loading tasks:", err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchTaskData();
  }, []);

  const searchParams = Route.useSearch();
  const taskParam = searchParams["task"];

  // Auto-open task details when navigated with ?task=<id>
  React.useEffect(() => {
    if (!taskParam || loading) return;
    const all = [...assignedTasks, ...sentTasks];
    const found = all.find((t) => t.id === taskParam);
    if (found) {
      setSelectedTask(found);
      setOpenDetailsModal(true);
    }
  }, [taskParam, loading, assignedTasks, sentTasks]);

  // Unified list depending on active scope
  const scopedTasks = React.useMemo(() => {
    if (activeScope === "assigned") return assignedTasks;
    return sentTasks;
  }, [activeScope, assignedTasks, sentTasks]);

  // Filtered tasks by search
  const filteredTasks = React.useMemo(() => {
    let list = scopedTasks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          (t.assigneeName && t.assigneeName.toLowerCase().includes(q)) ||
          (t.assignerName && t.assignerName.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [scopedTasks, searchQuery]);

  // Overall task stats
  const totalCount = scopedTasks.length;
  const completedCount = scopedTasks.filter((t) => t.status === "Completed").length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Task Column Partitions
  const todoTasks = React.useMemo(
    () => filteredTasks.filter((t) => t.status === "Not Started" || (!t.status && t.status !== "In Progress" && t.status !== "Pending" && t.status !== "Completed")),
    [filteredTasks]
  );
  const inProgressTasks = React.useMemo(
    () => filteredTasks.filter((t) => t.status === "In Progress"),
    [filteredTasks]
  );
  const reviewTasks = React.useMemo(
    () => filteredTasks.filter((t) => t.status === "Pending"),
    [filteredTasks]
  );
  const completedTasks = React.useMemo(
    () => filteredTasks.filter((t) => t.status === "Completed"),
    [filteredTasks]
  );

  const handleUpdateStatusExplicit = async (task: Task, newStatus: Task["status"], e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updateInList = (list: Task[]) =>
      list.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t));

    setAssignedTasks(updateInList);
    setSentTasks(updateInList);
    if (selectedTask?.id === task.id) {
      setSelectedTask((prev) => (prev ? { ...prev, status: newStatus } : null));
    }

    await updateTaskStatus(task.id, newStatus);
  };

  // Drawer Attachment Upload
  const handleDrawerFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedTask || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    try {
      setUploadingDrawerFile(true);
      const userCtx = await getAuthenticatedUserContext();
      if (!userCtx?.companyId) throw new Error("No company context");

      const taskFolderId = await ensureTaskAttachmentsFolder(userCtx.companyId, selectedTask.id);
      const cloudFile = await uploadFileToCloud(userCtx.companyId, taskFolderId, file);

      const newAtt: TaskAttachment = {
        name: file.name,
        storagePath: cloudFile.storage_path,
        type: file.type || "application/octet-stream",
        size: file.size,
      };

      const updated = await addTaskAttachment(selectedTask.id, newAtt);
      if (updated) {
        setSelectedTask(updated);
        fetchTaskData();
      }
    } catch (err: any) {
      console.error("Attachment upload failed:", err);
      alert(err.message || "Failed to upload file");
    } finally {
      setUploadingDrawerFile(false);
      e.target.value = "";
    }
  };

  const handleDownloadAttachment = async (att: TaskAttachment) => {
    try {
      const url = await getPresignedDownloadUrl(att.storagePath);
      window.open(url, "_blank");
    } catch (err) {
      console.error("Download failed:", err);
      alert("Failed to get download URL");
    }
  };

  const handleDeleteAttachment = async (att: TaskAttachment) => {
    if (!selectedTask || !confirm(`Delete "${att.name}"?`)) return;
    try {
      await deleteFile(att.storagePath);
      const updated = await removeTaskAttachment(selectedTask.id, att.storagePath);
      if (updated) {
        setSelectedTask(updated);
        fetchTaskData();
      }
    } catch (err) {
      console.error("Failed to delete attachment:", err);
    }
  };

  return (
    <TooltipProvider>
      <Layout
        activeTab="Tasks"
        disablePadding
        breadcrumbs={[
          { label: "Work" },
          { label: "Tasks", href: "/tasks" },
          { label: activeScope === "assigned" ? "Assigned to Me" : "Assigned by Me" },
        ]}
      >
        <div className="tasks-page-container">
          <div className="tasks-linear-wrapper">
            {/* ========================================================================= */}
            {/* COMMAND BAR & HEADER */}
            {/* ========================================================================= */}
            <div className="tasks-linear-header">
              <div className="tasks-linear-header-left">
                {/* Scope Switcher Tabs */}
                <div className="tasks-linear-scope-tabs">
                  <button
                    type="button"
                    onClick={() => handleScopeChange("assigned")}
                    className={`tasks-linear-scope-tab ${activeScope === "assigned" ? "active" : ""}`}
                  >
                    <span>Assigned to Me</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScopeChange("sent")}
                    className={`tasks-linear-scope-tab ${activeScope === "sent" ? "active" : ""}`}
                  >
                    <span>Assigned by Me</span>
                  </button>
                </div>
              </div>

              {/* Controls Right */}
              <div className="tasks-linear-header-right">
                {/* Search */}
                <div className="tasks-linear-search-box">
                  <Search size={13} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                  <input
                    type="text"
                    placeholder="Search tasks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="tasks-linear-search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0 }}
                    >
                      <CloseIcon size={12} style={{ color: "var(--color-text-muted)" }} />
                    </button>
                  )}
                </div>

                {/* + New Task */}
                <button
                  type="button"
                  onClick={() => setOpenModal(true)}
                  className="tasks-linear-create-btn"
                >
                  <AddIcon size={14} />
                  <span>New Task</span>
                </button>
              </div>
            </div>

            {/* ========================================================================= */}
            {/* 4-COLUMN KANBAN BOARD BODY */}
            {/* ========================================================================= */}
            <div className="tasks-linear-body">
              {loading || scopeTransitioning ? (
                <div className="tasks-linear-board">
                  {[
                    { title: activeScope === "sent" ? "Not Started" : "To Do", dot: "#94a3b8", cardCount: 3 },
                    { title: "In Progress", dot: "#3b82f6", cardCount: 2 },
                    { title: "In Review", dot: "#f59e0b", cardCount: 1 },
                    { title: "Completed", dot: "#10b981", cardCount: 4 },
                  ].map((col, idx) => (
                    <div key={idx} className="tasks-linear-column">
                      {/* Column Header Skeleton */}
                      <div className="tasks-linear-col-header">
                        <div className="tasks-linear-col-title">
                          <span
                            className="tasks-col-dot"
                            style={{ backgroundColor: col.dot, opacity: 0.6 }}
                          />
                          <span>{col.title}</span>
                        </div>
                        <div className="tasks-shimmer-box" style={{ height: 18, width: 22, borderRadius: 999 }} />
                      </div>

                      {/* Card Items Skeleton List */}
                      <div className="tasks-linear-col-cards">
                        {Array.from({ length: col.cardCount }).map((_, cIdx) => (
                          <div key={cIdx} className="tasks-shimmer-card">
                            {/* Top row: From/To Name */}
                            <div className="tasks-shimmer-card-top">
                              <div className="tasks-shimmer-box" style={{ height: 12, width: 110 }} />
                            </div>

                            {/* Middle: Title & Description lines */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              <div className="tasks-shimmer-box" style={{ height: 14, width: cIdx % 2 === 0 ? "85%" : "70%" }} />
                              <div className="tasks-shimmer-box" style={{ height: 11, width: "95%" }} />
                            </div>

                            {/* Footer: Due date pill + Stage mover pill */}
                            <div className="tasks-shimmer-card-footer">
                              <div className="tasks-shimmer-box" style={{ height: 16, width: 65, borderRadius: 4 }} />
                              <div className="tasks-shimmer-box" style={{ height: 22, width: 75, borderRadius: 5 }} />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Bottom Add Task Action Skeleton */}
                      {idx === 0 && activeScope === "sent" && (
                        <div className="tasks-col-bottom-action" style={{ opacity: 0.5, pointerEvents: "none" }}>
                          <div className="tasks-shimmer-box" style={{ height: 13, width: 80 }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tasks-linear-board">
                  {/* Column 1: Not Started / To Do */}
                  <KanbanColumn
                    title={activeScope === "sent" ? "Not Started" : "To Do"}
                    dotColor="#94a3b8"
                    tasks={todoTasks}
                    onSelectTask={(t) => {
                      setSelectedTask(t);
                      setOpenDetailsModal(true);
                    }}
                    onMoveStage={(t, stage, e) => handleUpdateStatusExplicit(t, stage, e)}
                    activeScope={activeScope}
                    onQuickAdd={activeScope === "sent" ? () => setOpenModal(true) : undefined}
                    highlightTaskId={highlightTaskId}
                  />

                  {/* Column 2: In Progress */}
                  <KanbanColumn
                    title="In Progress"
                    dotColor="#3b82f6"
                    tasks={inProgressTasks}
                    onSelectTask={(t) => {
                      setSelectedTask(t);
                      setOpenDetailsModal(true);
                    }}
                    onMoveStage={(t, stage, e) => handleUpdateStatusExplicit(t, stage, e)}
                    activeScope={activeScope}
                    highlightTaskId={highlightTaskId}
                  />

                  {/* Column 3: In Review / Pending */}
                  <KanbanColumn
                    title="In Review"
                    dotColor="#f59e0b"
                    tasks={reviewTasks}
                    onSelectTask={(t) => {
                      setSelectedTask(t);
                      setOpenDetailsModal(true);
                    }}
                    onMoveStage={(t, stage, e) => handleUpdateStatusExplicit(t, stage, e)}
                    activeScope={activeScope}
                    highlightTaskId={highlightTaskId}
                  />

                  {/* Column 4: Completed */}
                  <KanbanColumn
                    title="Completed"
                    dotColor="#10b981"
                    tasks={completedTasks}
                    onSelectTask={(t) => {
                      setSelectedTask(t);
                      setOpenDetailsModal(true);
                    }}
                    onMoveStage={(t, stage, e) => handleUpdateStatusExplicit(t, stage, e)}
                    activeScope={activeScope}
                    highlightTaskId={highlightTaskId}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* SLIDE-OVER DETAILS SHEET */}
        {/* ========================================================================= */}
        <Sheet open={openDetailsModal} onOpenChange={setOpenDetailsModal}>
          <SheetContent className="tasks-drawer-sheet" style={{ maxWidth: 540, width: "100%", padding: 0 }}>
            {selectedTask && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                {/* Header */}
                <div className="tasks-drawer-header">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span className={`tasks-priority-tag ${selectedTask.priority || "medium"}`}>
                      {(selectedTask.priority || "Medium").toUpperCase()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenDetailsModal(false)}
                      style={{ border: "none", background: "transparent", cursor: "pointer" }}
                    >
                      <CloseIcon size={16} style={{ color: "var(--color-text-muted)" }} />
                    </button>
                  </div>
                  <SheetTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", lineHeight: 1.35, margin: 0 }}>
                    {selectedTask.title}
                  </SheetTitle>
                </div>

                {/* Body */}
                <div className="tasks-drawer-body">
                  {/* Status Switcher Stepper */}
                  <div className="tasks-drawer-box">
                    <span className="tasks-drawer-label">Task Status</span>
                    <div className="tasks-drawer-status-grid">
                      {(["Not Started", "In Progress", "Completed"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => handleUpdateStatusExplicit(selectedTask, st)}
                          className={`tasks-drawer-status-btn ${selectedTask.status === st ? "active" : ""}`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Meta: Due Date & Priority */}
                  <div className="tasks-drawer-box">
                    <div className="tasks-drawer-meta-grid">
                      <div>
                        <span className="tasks-drawer-label">Due Date</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-primary)" }}>
                          <CalendarToday size={14} style={{ color: "var(--color-text-muted)" }} />
                          <span style={{ fontSize: 12, fontWeight: 500 }}>
                            {selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : "No due date"}
                          </span>
                        </div>
                      </div>
                      <div>
                        <span className="tasks-drawer-label">Created</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-primary)" }}>
                          <AccessTime size={14} style={{ color: "var(--color-text-muted)" }} />
                          <span style={{ fontSize: 12, fontWeight: 500 }}>
                            {selectedTask.createdAt ? new Date(selectedTask.createdAt).toLocaleDateString() : "Recent"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Assignee / Assigner */}
                  <div className="tasks-drawer-box">
                    <div className="tasks-drawer-assign-row">
                      <div className="tasks-table-avatar" style={{ width: 28, height: 28 }}>
                        {selectedTask.assigneeAvatar ? (
                          <img src={selectedTask.assigneeAvatar} alt="" />
                        ) : (
                          <span>{selectedTask.assigneeName?.slice(0, 2).toUpperCase() || "UN"}</span>
                        )}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span className="tasks-drawer-label">Assigned To</span>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>
                          {selectedTask.assigneeName || "Unassigned"}
                        </p>
                      </div>
                    </div>

                    <div className="tasks-drawer-assign-row">
                      <div className="tasks-table-avatar" style={{ width: 28, height: 28 }}>
                        {selectedTask.assignerAvatar ? (
                          <img src={selectedTask.assignerAvatar} alt="" />
                        ) : (
                          <span>{selectedTask.assignerName?.slice(0, 2).toUpperCase() || "MG"}</span>
                        )}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <span className="tasks-drawer-label">Assigned By</span>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>
                          {selectedTask.assignerName || "Unknown"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <span className="tasks-drawer-label">Description</span>
                    <div className="tasks-drawer-box" style={{ minHeight: 70 }}>
                      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>
                        {selectedTask.description || "No description provided."}
                      </p>
                    </div>
                  </div>

                  {/* Attachments */}
                  <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <span className="tasks-drawer-label" style={{ margin: 0 }}>
                        Attachments ({selectedTask.attachments?.length || 0})
                      </span>
                      <label className="tasks-stage-btn" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <AddIcon size={12} />
                        {uploadingDrawerFile ? "Uploading..." : "Attach File"}
                        <input
                          type="file"
                          onChange={handleDrawerFileUpload}
                          style={{ display: "none" }}
                          disabled={uploadingDrawerFile}
                        />
                      </label>
                    </div>

                    {selectedTask.attachments && selectedTask.attachments.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {selectedTask.attachments.map((att, idx) => (
                          <div key={idx} className="tasks-att-item">
                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                              <Paperclip size={14} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {att.name}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <button
                                type="button"
                                onClick={() => handleDownloadAttachment(att)}
                                className="tasks-stage-btn"
                                title="Download file"
                              >
                                <DownloadIcon size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAttachment(att)}
                                className="tasks-stage-btn"
                                style={{ color: "#dc2626" }}
                                title="Delete file"
                              >
                                <DeleteIcon size={12} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: "var(--color-text-muted)", fontStyle: "italic", margin: 0 }}>
                        No files attached yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        {/* Create Task Dialog */}
        <CreateTaskDialog
          open={openModal}
          companyId={companyId}
          currentUserId={currentUserId}
          onClose={() => setOpenModal(false)}
          onCreated={async (created) => {
            if (created) {
              setActiveScope("sent");
              setSentTasks((prev) => {
                const exists = prev.some((t) => t.id === created.id);
                return exists ? prev : [created, ...prev];
              });
              setHighlightTaskId(created.id);
              setTimeout(() => {
                setHighlightTaskId(null);
              }, 3000);
            }
            await fetchTaskData();
          }}
        />
      </Layout>
    </TooltipProvider>
  );
}

// =========================================================================
// HELPER COMPONENT: KANBAN COLUMN
// =========================================================================
function KanbanColumn({
  title,
  dotColor,
  tasks,
  onSelectTask,
  onMoveStage,
  activeScope,
  onQuickAdd,
  highlightTaskId,
}: {
  title: string;
  dotColor: string;
  tasks: Task[];
  onSelectTask: (t: Task) => void;
  onMoveStage: (t: Task, stage: Task["status"], e: React.MouseEvent) => void;
  activeScope: "assigned" | "sent" | "all";
  onQuickAdd?: () => void;
  highlightTaskId?: string | null;
}) {
  return (
    <div className="tasks-linear-column">
      <div className="tasks-linear-col-header">
        <div className="tasks-linear-col-title">
          <span className="tasks-col-dot" style={{ backgroundColor: dotColor }} />
          <span>{title}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="tasks-linear-col-count">{tasks.length}</span>
          {onQuickAdd && (
            <button
              type="button"
              onClick={onQuickAdd}
              style={{ border: "none", background: "transparent", cursor: "pointer", padding: 2, display: "flex", alignItems: "center", color: "var(--color-text-muted)" }}
              title="Add task to this column"
            >
              <AddIcon size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="tasks-linear-col-cards">
        {tasks.length === 0 ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
            {onQuickAdd ? (
              <button
                type="button"
                onClick={onQuickAdd}
                className="tasks-col-empty-dashed"
              >
                <AddIcon size={13} /> Add task
              </button>
            ) : (
              <span style={{ fontSize: "12px", color: "var(--color-text-muted, #94a3b8)" }}>
                No tasks
              </span>
            )}
          </div>
        ) : (
          tasks.map((t) => {
            const dueInfo = formatRelativeDue(t.dueDate);
            const isDone = t.status === "Completed";
            const isInProgress = t.status === "In Progress";
            const isPending = t.status === "Pending";
            const isNotStarted = t.status === "Not Started" || (!t.status && !isInProgress && !isPending && !isDone);
            const isSentView = activeScope === "sent";
            const partyPrefix = isSentView ? "To" : "From";
            const partyName = isSentView ? (t.assigneeName || "Unassigned") : (t.assignerName || "Assigner");

            const isHighlighted = t.id === highlightTaskId;

            return (
              <div
                key={t.id}
                onClick={() => onSelectTask(t)}
                className={`tasks-linear-card ${isDone ? "done" : ""} ${isHighlighted ? "newly-created" : ""}`}
              >
                <div className="tasks-linear-card-top">
                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, overflow: "hidden" }}>
                    <span className="tasks-card-top-bar-prefix">{partyPrefix}</span>
                    <span className="tasks-card-top-bar-name" title={partyName}>
                      {partyName}
                    </span>
                  </div>
                </div>

                <h4
                  className="tasks-linear-card-title"
                  style={{ textDecoration: isDone ? "line-through" : "none", color: isDone ? "var(--color-text-muted)" : "var(--color-text-primary)" }}
                >
                  {t.title}
                </h4>

                {t.description && (
                  <p className="tasks-linear-card-desc">{t.description}</p>
                )}

                <div className="tasks-linear-card-footer">
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
                    {isDone ? (
                      <span className="tasks-turnaround-badge">
                        <CheckCircleOutlined size={10} /> {formatTurnaroundTime(t.createdAt, t.updatedAt)}
                      </span>
                    ) : (
                      <span className={`tasks-due-badge ${dueInfo.className}`}>
                        <CalendarToday size={10} /> {dueInfo.text}
                      </span>
                    )}
                    {t.attachments && t.attachments.length > 0 && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, color: "var(--color-text-muted)", flexShrink: 0 }}>
                        <Paperclip size={11} /> {t.attachments.length}
                      </span>
                    )}
                  </div>

                  <div style={{ flexShrink: 0 }}>
                    {(() => {
                      const STAGE_OPTIONS: { stage: Task["status"]; label: string; key: string }[] = [
                        { stage: "Not Started", label: "To-Do", key: "not-started" },
                        { stage: "In Progress", label: "In Progress", key: "in-progress" },
                        { stage: "Pending", label: "Pending", key: "pending" },
                        { stage: "Completed", label: "Done", key: "completed" },
                      ];
                      const currentStage = STAGE_OPTIONS.find((s) => s.stage === (t.status || "Not Started")) || STAGE_OPTIONS[0];

                      return (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className={`tasks-stage-mover-trigger ${currentStage.key}`}
                              title="Change stage"
                            >
                              <span className="arrow">&rarr;</span>
                              <span>{currentStage.label}</span>
                              <ChevronDown size={11} style={{ opacity: 0.7 }} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="tasks-stage-mover-menu"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {STAGE_OPTIONS.map((opt) => {
                              const isCurrent = (t.status || "Not Started") === opt.stage;
                              return (
                                <DropdownMenuItem
                                  key={opt.stage}
                                  className={`tasks-stage-mover-item ${isCurrent ? "active" : ""}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMoveStage(t, opt.stage, e);
                                  }}
                                >
                                  <span className="arrow">&rarr;</span>
                                  <span>{opt.label}</span>
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {onQuickAdd && (
        <button
          type="button"
          onClick={onQuickAdd}
          className="tasks-col-bottom-action"
        >
          + Add a task
        </button>
      )}
    </div>
  );
}
