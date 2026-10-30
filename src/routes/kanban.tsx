import React from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { supabase } from "../lib/supabase";
import {
  getToDoLists,
  getToDoItems,
  getToDoListActivity,
  getToDoListNotes,
  createToDoListNote,
  deleteToDoListNote,
  togglePinToDoListNote,
  updateToDoListNoteSettings,
  createToDoItem,
  toggleToDoItem,
  updateToDoItemPriority,
  deleteToDoItem,
  updateToDoListColumns,
  updateToDoListName,
  moveToDoItemColumn,
  reorderToDoItems,
  updateToDoListSharing,
  fetchPublicKanbanBoard,
  addToDoListCollaborator,
  removeToDoListCollaborator,
  updateToDoListCollaboratorPermissions,
  getEffectiveUserPermissions,
  getRolePresetPermissions,
  requestTaskAssignment,
  respondTaskAssignment,
  bulkRequestTaskAssignment,
  formatRelativeTime,
  localDateOffset,
  DEFAULT_EDITOR_PERMISSIONS,
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_VIEWER_PERMISSIONS,
  DEFAULT_KANBAN_COLUMNS,
  getColumnType,
  type KanbanColumnType,
  type ToDoList,
  type ToDoItem,
  type ToDoPriority,
  type KanbanColumn,
  type CollaboratorPermissions,
  type ToDoListNote,
  type ToDoListCollaborator,
} from "../lib/lists";
import { sanitizeProfilePhoto } from "../lib/profile-photo";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { Switch } from "../components/ui/switch";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../components/ui/tooltip";
import {
  Plus,
  Columns3,
  CheckCircle2,
  Lock,
  Users,
  ArrowLeft,
  ArrowRight,
  X as CloseIcon,
  Trash2 as DeleteOutlined,
  ExternalLink,
  Flag,
  Calendar as CalendarIcon,
  Folder,
  Settings as SettingsIcon,
  Shield,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  PanelRightClose,
  PanelRightOpen,
  MoreVertical,
  Copy,
  Pen,
  Move,
  Globe,
  Check,
  Share2,
  Link2,
  User,
  UserX,
  Clock,
  StickyNote,
  FileText,
  Pin,
  PinOff,
  Send,
  MessageSquare,
  AlertCircle,
  PlayCircle,
  SlidersHorizontal,
  UserPlus,
  Loader2,
  Search,
} from "lucide-react";

interface KanbanSearchParams {
  listId?: string | undefined;
  teamId?: string | undefined;
  shareToken?: string | undefined;
}

import { getDynamicPageTitle } from "../lib/tenant-brand";

export const Route = createFileRoute("/kanban")({
  validateSearch: (search: Record<string, unknown>): KanbanSearchParams => {
    return {
      listId: typeof search["listId"] === "string" ? (search["listId"] as string) : undefined,
      teamId: typeof search["teamId"] === "string" ? (search["teamId"] as string) : undefined,
      shareToken: typeof search["shareToken"] === "string" ? (search["shareToken"] as string) : undefined,
    };
  },
  head: () => ({
    title: getDynamicPageTitle("Kanban Workspace"),
    meta: [
      {
        name: "description",
        content: "Full-screen Kanban workspace for organizing custom project workflows.",
      },
    ],
  }),
  component: KanbanFullscreenPage,
});

const LIST_COLORS = ["#18181b", "#3f3f46", "#71717a", "#a1a1aa", "#d4d4d8"];

export type KanbanDateFilterType =
  | "today"
  | "current_month"
  | "past_3_months"
  | "past_6_months"
  | "all_time"
  | "custom_date";

export interface KanbanDateFilterState {
  type: KanbanDateFilterType;
  selectedDate?: string;
  cachedOnDate?: string;
}

const KANBAN_DATE_FILTER_KEY = "kanban_date_filter";

function getKanbanTodayString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadInitialKanbanDateFilter(): KanbanDateFilterState {
  const today = getKanbanTodayString();
  if (typeof window === "undefined") {
    return { type: "today", cachedOnDate: today };
  }
  try {
    const raw = localStorage.getItem(KANBAN_DATE_FILTER_KEY);
    if (raw) {
      const parsed: KanbanDateFilterState = JSON.parse(raw);
      if (parsed.type === "today") {
        return { type: "today", cachedOnDate: today };
      }
      return parsed;
    }
  } catch (err) {
    console.warn("Failed to load kanban date filter cache:", err);
  }
  return { type: "today", cachedOnDate: today };
}

function formatTaskTime(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "";
  }
}

interface MobileStageRowProps {
  col: KanbanColumn;
  colIndex: number;
  colTasks: ToDoItem[];
  allMembers: Array<{ id: string; name: string; avatarUrl?: string | undefined }>;
  myPerms: CollaboratorPermissions;
  boardCols: KanbanColumn[];
  addingTaskColId: string | null;
  setAddingTaskColId: (id: string | null) => void;
  colTaskText: string;
  setColTaskText: (t: string) => void;
  colTaskPriority: ToDoPriority;
  setColTaskPriority: (p: ToDoPriority) => void;
  handleAddColumnTask: (colId: string) => void;
  handleToggleTask: (taskId: string) => void;
  handleDeleteTask: (taskId: string) => void;
  handleMoveTaskColumn: (taskId: string, newColId: string) => void;
  handleUpdateTaskPriority: (taskId: string, priority: ToDoPriority) => void;
  onOpenColumnMenu: (colId: string) => void;
  editingColId: string | null;
  editingColName: string;
  setEditingColId: (id: string | null) => void;
  setEditingColName: (name: string) => void;
  handleRenameColumn: (colId: string, newName: string) => void;
  getDueLabel: (dateStr: string | null) => string | null;
  currentUserId?: string | undefined;
  handleRespondAssignment: (taskId: string, response: "accept" | "reject") => void;
  handleAssignTask: (taskId: string, assigneeId: string, assigneeName: string) => void;
  listCollaborators: Array<{ id: string; name: string; avatarUrl?: string | undefined; isOwner?: boolean | undefined }>;
  selectedTaskIds?: string[] | undefined;
  setSelectedTaskIds?: React.Dispatch<React.SetStateAction<string[]>> | undefined;
  isShiftPressed?: boolean | undefined;
  movingTaskState?: {
    taskId: string;
    direction: "left" | "right";
    targetColId: string;
    phase: "exiting" | "entering";
  } | null | undefined;
}

function MobileStageRow({
  col,
  colIndex: _colIndex,
  colTasks,
  allMembers,
  myPerms,
  boardCols,
  addingTaskColId,
  setAddingTaskColId,
  colTaskText,
  setColTaskText,
  colTaskPriority,
  setColTaskPriority,
  handleAddColumnTask,
  handleToggleTask,
  handleDeleteTask,
  handleMoveTaskColumn,
  handleUpdateTaskPriority,
  onOpenColumnMenu,
  editingColId,
  editingColName,
  setEditingColId,
  setEditingColName,
  handleRenameColumn,
  getDueLabel,
  currentUserId,
  handleRespondAssignment,
  handleAssignTask,
  listCollaborators,
  selectedTaskIds = [],
  setSelectedTaskIds,
  isShiftPressed = false,
  movingTaskState,
}: MobileStageRowProps) {
  const [activeIdx, setActiveIdx] = React.useState(0);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const { scrollLeft, scrollWidth, clientWidth } = container;

    if (scrollLeft + clientWidth >= scrollWidth - 15) {
      setActiveIdx(colTasks.length - 1);
      return;
    }

    if (scrollLeft <= 10) {
      setActiveIdx(0);
      return;
    }

    const cardElements = container.querySelectorAll<HTMLElement>("[data-mobile-card]");
    if (cardElements.length > 0) {
      const containerCenter = container.getBoundingClientRect().left + clientWidth / 2;
      let closestIdx = 0;
      let closestDist = Infinity;

      cardElements.forEach((el, idx) => {
        const rect = el.getBoundingClientRect();
        const cardCenter = rect.left + rect.width / 2;
        const dist = Math.abs(cardCenter - containerCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = idx;
        }
      });

      setActiveIdx(closestIdx);
    }
  };

  const scrollToCard = (index: number) => {
    if (!scrollRef.current) return;
    const cardElements = scrollRef.current.querySelectorAll<HTMLElement>("[data-mobile-card]");
    if (cardElements[index]) {
      cardElements[index].scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      setActiveIdx(index);
    }
  };

  return (
    <div className="kanban-mobile-stage-row">
      {/* Stage Header */}
      <div className="kanban-mobile-stage-header">
        <div className="kanban-mobile-stage-title-box">
          <div
            className="kanban-col-color-dot"
            style={{ backgroundColor: col.color || "#18181b" }}
          />

          {editingColId === col.id && myPerms.canRenameStages ? (
            <input
              autoFocus
              className="kanban-col-rename-input"
              value={editingColName}
              onChange={(e) => setEditingColName(e.target.value)}
              onBlur={() => handleRenameColumn(col.id, editingColName)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameColumn(col.id, editingColName);
                if (e.key === "Escape") setEditingColId(null);
              }}
            />
          ) : (
            <div
              onClick={() => {
                if (myPerms.canRenameStages) {
                  setEditingColId(col.id);
                  setEditingColName(col.name);
                }
              }}
              className={`kanban-col-title ${myPerms.canRenameStages ? "editable" : ""}`}
            >
              <span>
                {col.name}
              </span>
              <span className="kanban-col-badge" style={{ marginLeft: "8px" }}>
                {colTasks.length}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {myPerms.canAddTasks && (
            <button
              type="button"
              onClick={() => {
                setAddingTaskColId(addingTaskColId === col.id ? null : col.id);
                setColTaskText("");
                setColTaskPriority("Low");
              }}
              className="kanban-col-menu-btn"
              title="Add task"
            >
              <Plus size={18} />
            </button>
          )}

          {(myPerms.canDuplicateStages || myPerms.canDeleteStages || myPerms.canConfigureStages || myPerms.role === "admin") && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenColumnMenu(col.id);
              }}
              className="kanban-col-menu-btn"
              title="Stage options"
            >
              <MoreVertical size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Inline Task Composer on Mobile */}
      {addingTaskColId === col.id && (
        <div className="kanban-col-inline-composer">
          <textarea
            autoFocus
            rows={2}
            placeholder="What needs to be done?"
            value={colTaskText}
            onChange={(e) => setColTaskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAddColumnTask(col.id);
              }
              if (e.key === "Escape") setAddingTaskColId(null);
            }}
            className="kanban-col-inline-input"
          />

          <div className="kanban-col-inline-controls">
            <div className="kanban-priority-select-group">
              <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 550 }}>Priority:</span>
              {(["Low", "Medium", "High"] as ToDoPriority[]).map((p) => {
                const isSelected = colTaskPriority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setColTaskPriority(p)}
                    className={`kanban-priority-option-btn ${isSelected ? "selected" : ""}`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>

            <div className="kanban-col-inline-actions">
              <button
                type="button"
                onClick={() => setAddingTaskColId(null)}
                className="kanban-inline-cancel-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAddColumnTask(col.id)}
                disabled={!colTaskText.trim()}
                className="kanban-inline-submit-btn"
              >
                Add Card
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Horizontal Card Slider */}
      {colTasks.length === 0 ? (
        <div className="kanban-col-empty" style={{ minHeight: "90px", backgroundColor: "#ffffff", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
          <span style={{ fontSize: "12.5px", color: "#94a3b8", marginBottom: "8px" }}>No cards in {col.name}</span>
          {myPerms.canAddTasks && (
            <button
              type="button"
              onClick={() => {
                setAddingTaskColId(col.id);
                setColTaskText("");
                setColTaskPriority("Low");
              }}
              className="kanban-col-add-btn"
            >
              <Plus size={14} />
              Add Card
            </button>
          )}
        </div>
      ) : (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="kanban-mobile-cards-slider"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {colTasks.map((t) => {
            const flagColor = t.priority === "High" ? "#dc2626" : t.priority === "Medium" ? "#ea580c" : "#64748b";

            const creator = allMembers.find((m) => m.id === t.assigneeId) || {
              name: t.assigneeName || "Team Member",
              avatarUrl: t.assigneeAvatar,
            };

            const dueLabel = getDueLabel(t.dueDate);
            const isSingle = colTasks.length === 1;

            const isMyTask =
              Boolean(currentUserId && t.assigneeId === currentUserId);
            const isBoardAdmin = myPerms.role === "admin" || myPerms.canManageCollaborators;
            const canChangePriority = isBoardAdmin || (isMyTask && myPerms.canChangePriority);
            const canMoveThisTask = isBoardAdmin || (isMyTask && myPerms.canMoveTasks);
            const canRemoveThisTask = isBoardAdmin || (isMyTask && myPerms.canRemoveTasks);
            const canHandoverThisTask = isBoardAdmin || (isMyTask && (myPerms.canAddTasks || myPerms.canMoveTasks));
            const isSelected = selectedTaskIds.includes(t.id);
            const isHandoverEligible = !t.completed && canHandoverThisTask;

            return (
              <div
                key={t.id}
                data-mobile-card="true"
                onMouseDown={(e) => {
                  if (e.shiftKey || isShiftPressed || selectedTaskIds.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.getSelection()?.removeAllRanges();
                  }
                }}
                onClick={(e) => {
                  if (e.shiftKey || selectedTaskIds.length > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    window.getSelection()?.removeAllRanges();
                    if (isHandoverEligible && setSelectedTaskIds) {
                      setSelectedTaskIds((prev) =>
                        prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                      );
                    }
                  }
                }}
                className={`kanban-card ${t.completed ? "completed" : ""} ${isSelected ? "selected" : ""} ${
                  movingTaskState?.taskId === t.id
                    ? movingTaskState.phase === "exiting"
                      ? movingTaskState.direction === "right"
                        ? "anim-exit-right"
                        : "anim-exit-left"
                      : movingTaskState.phase === "entering"
                        ? movingTaskState.direction === "right"
                          ? "anim-enter-from-left"
                          : "anim-enter-from-right"
                        : ""
                    : ""
                }`.trim()}
                style={isSingle ? { minWidth: "100%", maxWidth: "100%" } : undefined}
              >
                {/* Top Row: Task Title + Priority Flag */}
                <div className="kanban-card-top-handle">
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {isSelected && (
                      <span className="kanban-card-selected-badge">
                        <Check size={10} strokeWidth={3} />
                        Selected
                      </span>
                    )}
                    <span className={`kanban-card-priority-pill ${t.priority ? t.priority.toLowerCase() : "low"}`}>
                      {t.priority || "Low"}
                    </span>
                  </div>

                  {canChangePriority ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="kanban-card-action-icon-btn"
                          title={`Priority: ${t.priority} (Click to change)`}
                        >
                          <Flag size={13} color={flagColor} fill={flagColor} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleUpdateTaskPriority(t.id, "High")}>
                          High
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleUpdateTaskPriority(t.id, "Medium")}>
                          Medium
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleUpdateTaskPriority(t.id, "Low")}>
                          Normal
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <div title={`Priority: ${t.priority}`}>
                      <Flag size={13} color={flagColor} fill={flagColor} />
                    </div>
                  )}
                </div>

                {/* Card Title & Checkbox */}
                <div className="kanban-card-body">
                  <button
                    type="button"
                    onClick={() => handleToggleTask(t.id, t.completed)}
                    className={`kanban-card-checkbox ${t.completed ? "checked" : ""}`}
                  >
                    {t.completed && <Check size={12} strokeWidth={3} />}
                  </button>
                  <div className="kanban-card-text-wrapper">
                    <span className={`kanban-card-title ${t.completed ? "completed" : ""}`}>
                      {t.text}
                    </span>
                  </div>
                </div>

                {/* Handover / Assignment Status Banner */}
                {t.assignmentStatus === "pending" && (
                  <>
                    {t.assignedToId === currentUserId ? (
                      <div className="kanban-handover-banner">
                        <UserPlus size={13} />
                        <span>
                          Handover offered by {t.assignedByName || "Collaborator"}
                        </span>
                      </div>
                    ) : t.assignedById === currentUserId ? (
                      <div className="kanban-handover-banner pending-out">
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <Clock size={13} />
                          <span>
                            Handover offered (Pending)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRespondAssignment(t.id, "reject");
                          }}
                          style={{ background: "none", border: "none", color: "#92400e", fontWeight: 600, cursor: "pointer", fontSize: "11px" }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </>
                )}

                {/* Bottom Row: User Avatar, Due Date & Actions */}
                <div className="kanban-card-footer">
                  <div className="kanban-card-footer-left">
                    {!t.completed && canHandoverThisTask ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
                            title={`Assigned to ${creator.name} • Click to hand over`}
                          >
                            <Avatar className="kanban-card-avatar">
                              <AvatarImage src={sanitizeProfilePhoto(creator.avatarUrl) || undefined} />
                              <AvatarFallback>
                                {(creator.name || "U").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <div style={{ padding: "6px 10px", fontSize: "11px", fontWeight: 600, color: "#64748b" }}>
                            Hand Over Task To
                          </div>
                          <DropdownMenuSeparator />
                          {listCollaborators.map((c) => {
                            const isMe = c.id === currentUserId;
                            return (
                              <DropdownMenuItem
                                key={c.id}
                                disabled={isMe}
                                onClick={() => handleAssignTask(t.id, c.id, c.name.replace(" (You)", ""))}
                              >
                                <Avatar className="kanban-card-avatar" style={{ marginRight: "8px" }}>
                                  <AvatarImage src={sanitizeProfilePhoto(c.avatarUrl) || undefined} />
                                  <AvatarFallback>
                                    {(c.name || "U").charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span>{c.name}</span>
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Avatar className="kanban-card-avatar">
                        <AvatarImage src={sanitizeProfilePhoto(creator.avatarUrl) || undefined} />
                        <AvatarFallback>
                          {(creator.name || "U").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <div className="kanban-card-meta-text">
                      {dueLabel && (
                        <span className="kanban-card-due-date">
                          {dueLabel}
                        </span>
                      )}
                      {t.createdAt && (
                        <span className="kanban-card-timestamp">
                          {formatTaskTime(t.updatedAt || t.createdAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="kanban-card-footer-right">
                    {t.assignmentStatus === "pending" && t.assignedToId === currentUserId ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRespondAssignment(t.id, "reject");
                          }}
                          className="kanban-header-btn"
                          style={{ height: "24px", padding: "0 6px", fontSize: "10.5px" }}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleRespondAssignment(t.id, "accept");
                          }}
                          className="kanban-header-btn"
                          style={{ height: "24px", padding: "0 8px", fontSize: "10.5px", backgroundColor: "#0f172a", color: "#ffffff", borderColor: "#0f172a" }}
                        >
                          Accept
                        </button>
                      </div>
                    ) : (
                      <>
                        {canMoveThisTask && boardCols.length > 1 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => e.stopPropagation()}
                                className="kanban-stage-select"
                              >
                                <span>{col.name}</span>
                                <ChevronDown size={11} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="kanban-stage-mover-dropdown">
                              {boardCols.map((c) => {
                                const isCurrent = c.id === col.id;
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isCurrent) handleMoveTaskColumn(t.id, c.id);
                                    }}
                                    className={`kanban-stage-mover-item ${isCurrent ? "active" : ""}`}
                                  >
                                    {isCurrent ? (
                                      <>
                                        <Check size={12} strokeWidth={2.5} />
                                        <span>{c.name}</span>
                                      </>
                                    ) : (
                                      <span>→ {c.name}</span>
                                    )}
                                  </button>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}

                        {canRemoveThisTask && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTask(t.id)}
                            className="kanban-card-action-icon-btn"
                            title="Delete card"
                          >
                            <DeleteOutlined size={14} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Dot Indicators */}
      {colTasks.length > 1 && (
        <div className="kanban-mobile-dots">
          {colTasks.map((_, dotIdx) => {
            const isActive = dotIdx === activeIdx;
            return (
              <button
                key={dotIdx}
                type="button"
                onClick={() => scrollToCard(dotIdx)}
                className={`kanban-mobile-dot ${isActive ? "active" : ""}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function KanbanFullscreenPage() {
  const search = useSearch({ from: "/kanban" });
  const navigate = useNavigate();
  const listId = search.listId;

  const [dateFilter, setDateFilter] = React.useState<KanbanDateFilterState>(loadInitialKanbanDateFilter);
  const [calendarViewingDate, setCalendarViewingDate] = React.useState<Date>(() => {
    const initial = loadInitialKanbanDateFilter();
    if (initial.type === "custom_date" && initial.selectedDate) {
      const [y, m, d] = initial.selectedDate.split("-").map(Number) as [number, number, number];
      return new Date(y, (m ?? 1) - 1, d ?? 1);
    }
    return new Date();
  });

  const [loading, setLoading] = React.useState(true);
  const [currentList, setCurrentList] = React.useState<ToDoList | null>(null);
  const [tasks, setTasks] = React.useState<ToDoItem[]>([]);
  const authCtxRef = React.useRef<{ companyId: string; userId: string; userFullName: string } | null>(null);
  const boardScrollContainerRef = React.useRef<HTMLDivElement | null>(null);

  const [editingColId, setEditingColId] = React.useState<string | null>(null);
  const [editingColName, setEditingColName] = React.useState("");
  const [isAddingCol, setIsAddingCol] = React.useState(false);
  const [newColName, setNewColName] = React.useState("");

  const [isEditingListName, setIsEditingListName] = React.useState(false);
  const [editingListName, setEditingListName] = React.useState("");

  const [manageCollabOpen, setManageCollabOpen] = React.useState(false);
  const [collabToAdd, setCollabToAdd] = React.useState("");
  const [collabSearchQuery, setCollabSearchQuery] = React.useState("");
  const [collabPickerOpen, setCollabPickerOpen] = React.useState(false);
  const [collabAddRole, setCollabAddRole] = React.useState<"admin" | "editor" | "viewer" | "custom">("editor");
  const [collabAddPermissions, setCollabAddPermissions] = React.useState<CollaboratorPermissions>(DEFAULT_EDITOR_PERMISSIONS);
  const [managingCollabs, setManagingCollabs] = React.useState(false);
  const [allMembers, setAllMembers] = React.useState<Array<{ id: string; name: string; avatarUrl?: string }>>([]);

  const availableMembers = React.useMemo(() => {
    const currentCollaboratorIds = new Set((currentList?.collaborators || []).map((c) => c.id));
    return allMembers.filter((m) => !currentCollaboratorIds.has(m.id));
  }, [allMembers, currentList?.collaborators]);

  const filteredAvailableMembers = React.useMemo(() => {
    if (!collabSearchQuery.trim()) return availableMembers;
    const q = collabSearchQuery.toLowerCase();
    return availableMembers.filter((m) => m.name.toLowerCase().includes(q));
  }, [availableMembers, collabSearchQuery]);

  const selectedCollabMember = React.useMemo(
    () => allMembers.find((m) => m.id === collabToAdd),
    [allMembers, collabToAdd],
  );

  const [editingCollab, setEditingCollab] = React.useState<{ id: string; name: string; permissions: CollaboratorPermissions } | null>(null);

  const [addingTaskColId, setAddingTaskColId] = React.useState<string | null>(null);
  const [colTaskText, setColTaskText] = React.useState("");
  const [colTaskPriority, setColTaskPriority] = React.useState<ToDoPriority>("Low");

  const [showSidebar, setShowSidebar] = React.useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1200 : true,
  );

  const [activityVisibleCount, setActivityVisibleCount] = React.useState(10);

  const effectiveTeamId = search.teamId || currentList?.teamId || null;
  const backRoute = effectiveTeamId
    ? `/teams/${effectiveTeamId}`
    : authCtxRef.current?.userId
    ? "/lists"
    : "/login";

  const backLabel = effectiveTeamId
    ? "Back to Team"
    : authCtxRef.current?.userId
    ? "Back to Lists"
    : "Sign In";

  const [movingTaskState, setMovingTaskState] = React.useState<{
    taskId: string;
    direction: "left" | "right";
    targetColId: string;
    phase: "exiting" | "entering";
  } | null>(null);

  const [selectedTaskIds, setSelectedTaskIds] = React.useState<string[]>([]);
  const [isShiftPressed, setIsShiftPressed] = React.useState(false);

  React.useEffect(() => {
    const isEditableElement = (el: EventTarget | null) => {
      if (!el || !(el instanceof HTMLElement)) return false;
      const tagName = el.tagName.toLowerCase();
      return (
        tagName === "input" ||
        tagName === "textarea" ||
        el.isContentEditable ||
        Boolean(el.closest("input, textarea, [contenteditable='true']"))
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableElement(e.target) || isEditableElement(document.activeElement)) {
        return;
      }
      if (e.key === "Shift") {
        setIsShiftPressed(true);
        window.getSelection()?.removeAllRanges();
      }
      if (e.key === "Escape" && selectedTaskIds.length > 0) {
        setSelectedTaskIds([]);
        window.getSelection()?.removeAllRanges();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        setIsShiftPressed(false);
      }
    };

    const handleWindowBlur = () => {
      setIsShiftPressed(false);
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (isEditableElement(e.target)) {
        setIsShiftPressed(false);
      }
    };

    const handleSelectStart = (e: Event) => {
      if (isEditableElement(e.target) || isEditableElement(document.activeElement)) {
        return;
      }
      if (isShiftPressed || selectedTaskIds.length > 0 || (e as MouseEvent).shiftKey) {
        e.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("selectstart", handleSelectStart);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("selectstart", handleSelectStart);
    };
  }, [selectedTaskIds.length, isShiftPressed]);

  React.useEffect(() => {
    if (isShiftPressed || selectedTaskIds.length > 0) {
      document.body.style.userSelect = "none";
      document.body.style.webkitUserSelect = "none";
      const activeEl = document.activeElement;
      const isInputFocused =
        activeEl instanceof HTMLElement &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.isContentEditable ||
          Boolean(activeEl.closest("input, textarea, [contenteditable='true']")));
      if (!isInputFocused) {
        window.getSelection()?.removeAllRanges();
      }
    } else {
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
    }
    return () => {
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
    };
  }, [isShiftPressed, selectedTaskIds.length]);

  const [isCopied, setIsCopied] = React.useState(false);

  const [draggingTaskId, setDraggingTaskId] = React.useState<string | null>(null);
  const [dragSourceColId, setDragSourceColId] = React.useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = React.useState<{
    colId: string;
    taskId?: string;
    position?: "before" | "after";
  } | null>(null);

  const [selectedAssigneeId, setSelectedAssigneeId] = React.useState<string>("all");

  const [notesOpen, setNotesOpen] = React.useState(false);
  const [notes, setNotes] = React.useState<ToDoListNote[]>([]);
  const [loadingNotes, setLoadingNotes] = React.useState(false);
  const [noteContent, setNoteContent] = React.useState("");
  const [noteTargetCollabId, setNoteTargetCollabId] = React.useState<string>("all");
  const [noteGuestName, setNoteGuestName] = React.useState("");
  const [guestNameTouched, setGuestNameTouched] = React.useState(false);
  const [submittingNote, setSubmittingNote] = React.useState(false);
  const [noteFilterTab, setNoteFilterTab] = React.useState<"all" | "for_me" | "general">("all");
  const [guestSentNoteIds, setGuestSentNoteIds] = React.useState<string[]>([]);

  const refreshNotes = React.useCallback(async (listIdToUse?: string) => {
    const id = listIdToUse || currentList?.id;
    if (!id) return;
    setLoadingNotes(true);
    const fetched = await getToDoListNotes(id);
    setNotes(fetched);
    setLoadingNotes(false);
  }, [currentList?.id]);

  React.useEffect(() => {
    if (currentList?.id) {
      if (currentList.notes && currentList.notes.length > 0) {
        setNotes(currentList.notes);
      } else {
        void refreshNotes(currentList.id);
      }
    }
  }, [currentList?.id, refreshNotes]);

  const refreshActivity = React.useCallback(async () => {
    if (!currentList?.id) return;
    try {
      const act = await getToDoListActivity(currentList.id);
      setCurrentList((prev) => (prev ? { ...prev, activity: act } : prev));
    } catch (err) {
      console.error("Failed to refresh activity:", err);
    }
  }, [currentList?.id]);

  const handleAddNote = async () => {
    if (!currentList?.id || !noteContent.trim() || submittingNote) return;

    const isGuest = !authCtxRef.current?.userId;
    if (isGuest && !noteGuestName.trim()) {
      setGuestNameTouched(true);
      return;
    }

    setSubmittingNote(true);
    try {
      const notePayload: { listId: string; content: string; targetCollaboratorId?: string; authorName?: string } = {
        listId: currentList.id,
        content: noteContent.trim(),
        authorName: noteGuestName.trim() || (authCtxRef.current?.userFullName || "Guest"),
      };
      if (noteTargetCollabId !== "all") {
        notePayload.targetCollaboratorId = noteTargetCollabId;
      }
      const created = await createToDoListNote(notePayload);
      if (created) {
        setNotes((prev) => [created, ...prev]);
        if (!authCtxRef.current?.userId) {
          setGuestSentNoteIds((prev) => [...prev, created.id]);
        }
        setNoteContent("");
        setNoteTargetCollabId("all");
        setGuestNameTouched(false);
        const targetLabel = created.targetCollaboratorName
          ? `sent directly to ${created.targetCollaboratorName}`
          : "posted for All Collaborators";
        toast.success(`Note ${targetLabel}!`);
        void refreshActivity();
      } else {
        toast.error("Could not save note. Please verify database schema and RLS policies in Supabase.");
      }
    } catch (err: any) {
      console.error("Failed to add note:", err);
      toast.error(err?.message || "Failed to post note. Please try again.");
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const ok = await deleteToDoListNote(noteId);
      if (ok) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
        toast.success("Note deleted");
      }
    } catch (err) {
      console.error("Failed to delete note:", err);
    }
  };

  const handleTogglePinNote = async (noteId: string, currentPinned: boolean) => {
    try {
      const ok = await togglePinToDoListNote(noteId, !currentPinned);
      if (ok) {
        setNotes((prev) =>
          prev
            .map((n) => (n.id === noteId ? { ...n, isPinned: !currentPinned } : n))
            .sort((a, b) => Number(b.isPinned) - Number(a.isPinned)),
        );
      }
    } catch (err) {
      console.error("Failed to toggle pin note:", err);
    }
  };

  const handleConvertNoteToTask = async (note: ToDoListNote, columnId: string) => {
    if (!currentList?.id || !note.content.trim()) return;
    const cols =
      currentList.columns && currentList.columns.length > 0
        ? currentList.columns
        : DEFAULT_KANBAN_COLUMNS;
    const targetCol = cols.find((c) => c.id === columnId) || cols[0];
    if (!targetCol) return;
    const ctx = authCtxRef.current;
    const companyId = ctx?.companyId || currentList.companyId || "";
    const userId = ctx?.userId || currentList.ownerId;

    try {
      const created = await createToDoItem({
        companyId: companyId,
        listId: currentList.id,
        userId: userId,
        text: note.content.trim(),
        priority: "Medium",
        dueDate: localDateOffset(0),
        columnId: targetCol.id,
      });

      if (created) {
        setTasks((prev) => [...prev, created]);
        setCurrentList((prev) => (prev ? { ...prev, itemCount: prev.itemCount + 1 } : prev));
        setNotes((prev) => prev.filter((n) => n.id !== note.id));
        void deleteToDoListNote(note.id);
        toast.success(`Note added to "${targetCol.name}" and removed from notes!`);
        void refreshActivity();
      }
    } catch (err) {
      console.error("Failed to convert note to task:", err);
      toast.error("Failed to add note to column. Please try again.");
    }
  };

  const handleToggleNotesFeature = async (enabled: boolean) => {
    if (!currentList?.id) return;
    const ok = await updateToDoListNoteSettings(currentList.id, {
      isNotesEnabled: enabled,
      allowPublicNotes: currentList.allowPublicNotes !== undefined ? currentList.allowPublicNotes : true,
    });
    if (ok) {
      setCurrentList((prev) => (prev ? { ...prev, isNotesEnabled: enabled } : prev));
      if (enabled) void refreshNotes(currentList.id);
    }
  };

  const handleTogglePublicNotes = async (allow: boolean) => {
    if (!currentList?.id) return;
    const ok = await updateToDoListNoteSettings(currentList.id, {
      isNotesEnabled: Boolean(currentList.isNotesEnabled),
      allowPublicNotes: allow,
    });
    if (ok) {
      setCurrentList((prev) => (prev ? { ...prev, allowPublicNotes: allow } : prev));
    }
  };

  const todayStr = localDateOffset(0);
  const tomorrowStr = localDateOffset(1);

  const getDueLabel = (d: string | null) => {
    if (!d) return "";
    if (d === todayStr) return "Today";
    if (d === tomorrowStr) return "Tomorrow";
    return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
  };

  const availableAssignees = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string; avatarUrl?: string | undefined }>();

    if (currentList?.ownerId) {
      map.set(currentList.ownerId, {
        id: currentList.ownerId,
        name: currentList.ownerName || "List Owner",
        avatarUrl: currentList.ownerAvatarUrl || allMembers.find((m) => m.id === currentList.ownerId)?.avatarUrl,
      });
    }

    if (currentList?.collaborators) {
      for (const c of currentList.collaborators) {
        if (c.id) {
          map.set(c.id, {
            id: c.id,
            name: c.name,
            avatarUrl: c.avatarUrl,
          });
        }
      }
    }

    for (const t of tasks) {
      if (t.assigneeId) {
        const existing = map.get(t.assigneeId);
        map.set(t.assigneeId, {
          id: t.assigneeId,
          name: t.assigneeName || existing?.name || "Team Member",
          avatarUrl: t.assigneeAvatar || existing?.avatarUrl,
        });
      }
    }

    return Array.from(map.values());
  }, [currentList, tasks, allMembers]);

  const listCollaborators = React.useMemo(() => {
    const list: { id: string; name: string; avatarUrl?: string | undefined; isOwner?: boolean | undefined }[] = [];
    const seen = new Set<string>();

    if (currentList?.ownerId) {
      seen.add(currentList.ownerId);
      const isMe = currentList.ownerId === authCtxRef.current?.userId;
      list.push({
        id: currentList.ownerId,
        name: isMe ? `${currentList.ownerName || "User"} (You)` : (currentList.ownerName || "Team Member"),
        avatarUrl: currentList.ownerAvatarUrl || allMembers.find((m) => m.id === currentList.ownerId)?.avatarUrl,
        isOwner: true,
      });
    }

    if (currentList?.collaborators) {
      for (const c of currentList.collaborators) {
        if (c.id && !seen.has(c.id)) {
          seen.add(c.id);
          const isMe = c.id === authCtxRef.current?.userId;
          list.push({
            id: c.id,
            name: isMe ? `${c.name} (You)` : c.name,
            avatarUrl: c.avatarUrl || undefined,
            isOwner: false,
          });
        }
      }
    }
    return list;
  }, [currentList?.ownerId, currentList?.ownerName, currentList?.ownerAvatarUrl, currentList?.collaborators, allMembers]);

  const accessibleNotes = React.useMemo(() => {
    const currentUserId = authCtxRef.current?.userId;
    return notes.filter((n) => {
      if (guestSentNoteIds.includes(n.id)) return true;
      if (!n.targetCollaboratorId) return true;
      if (!currentUserId) return false;
      if (n.targetCollaboratorId === currentUserId) return true;
      if (n.authorId === currentUserId) return true;
      return false;
    });
  }, [notes, guestSentNoteIds]);

  const selectedAssigneeObj = React.useMemo(() => {
    if (selectedAssigneeId === "all") return null;
    return availableAssignees.find((a) => a.id === selectedAssigneeId) || null;
  }, [availableAssignees, selectedAssigneeId]);

  const saveKanbanDateFilter = (newFilter: KanbanDateFilterState) => {
    const today = getKanbanTodayString();
    const updated = { ...newFilter, cachedOnDate: today };
    setDateFilter(updated);
    try {
      localStorage.setItem(KANBAN_DATE_FILTER_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn("Failed to persist date filter:", err);
    }
  };

  React.useEffect(() => {
    const timer = setInterval(() => {
      const today = getKanbanTodayString();
      if (dateFilter.type === "today" && dateFilter.cachedOnDate !== today) {
        saveKanbanDateFilter({ type: "today", cachedOnDate: today });
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [dateFilter]);

  const dateFilterLabel = React.useMemo(() => {
    const todayStr = getKanbanTodayString();
    const now = new Date();
    switch (dateFilter.type) {
      case "today": {
        const monthShort = now.toLocaleString("default", { month: "short" });
        return `Today • ${monthShort} ${now.getDate()}`;
      }
      case "current_month": {
        const monthLong = now.toLocaleString("default", { month: "short" });
        return `${monthLong} ${now.getFullYear()}`;
      }
      case "past_3_months":
        return "Past 3 Months";
      case "past_6_months":
        return "Past 6 Months";
      case "all_time":
        return "All Time";
      case "custom_date": {
        if (!dateFilter.selectedDate) return "Custom Date";
        const [y, m, d] = dateFilter.selectedDate.split("-").map(Number) as [number, number, number];
        const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
        if (dateFilter.selectedDate === todayStr) {
          const monthShort = dt.toLocaleString("default", { month: "short" });
          return `Today • ${monthShort} ${d}`;
        }
        const monthShort = dt.toLocaleString("default", { month: "short" });
        return `${monthShort} ${d}, ${y}`;
      }
      default:
        return "Today";
    }
  }, [dateFilter]);

  const getTaskDateStr = (t: ToDoItem): string => {
    if (t.dueDate) {
      return t.dueDate.split("T")[0];
    }
    if (t.createdAt) {
      try {
        const d = new Date(t.createdAt);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      } catch {
        return "";
      }
    }
    return "";
  };

  const getTaskUpdatedDateStr = (t: ToDoItem): string => {
    if (t.updatedAt) {
      try {
        const d = new Date(t.updatedAt);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      } catch {
        // fallback
      }
    }
    return getTaskDateStr(t);
  };

  const isTaskInDateFilter = React.useCallback(
    (task: ToDoItem, colType: KanbanColumnType): boolean => {
      // 1. All time shows everything
      if (dateFilter.type === "all_time") {
        return true;
      }

      // 2. Active tasks in "todo" and "in_progress" columns always persist across days
      const isTaskActive = !task.completed && colType !== "done";
      if ((colType === "todo" || colType === "in_progress") && isTaskActive) {
        return true;
      }

      // 3. For completed / done tasks (or inactive tasks), check completion/update date
      const taskDate = colType === "done" ? getTaskUpdatedDateStr(task) : getTaskDateStr(task);
      if (!taskDate) return false;

      const todayStr = getKanbanTodayString();
      const now = new Date();

      switch (dateFilter.type) {
        case "today":
          return taskDate === todayStr;
        case "custom_date":
          return taskDate === (dateFilter.selectedDate || todayStr);
        case "current_month": {
          const [ty, tm] = taskDate.split("-").map(Number);
          return ty === now.getFullYear() && tm === now.getMonth() + 1;
        }
        case "past_3_months": {
          const [ty, tm] = taskDate.split("-").map(Number);
          const taskMonth = new Date(ty, tm - 1, 1);
          const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
          return taskMonth >= threeMonthsAgo && taskMonth <= currentMonthEnd;
        }
        case "past_6_months": {
          const [ty, tm] = taskDate.split("-").map(Number);
          const taskMonth = new Date(ty, tm - 1, 1);
          const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
          const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
          return taskMonth >= sixMonthsAgo && taskMonth <= currentMonthEnd;
        }
        default:
          return true;
      }
    },
    [dateFilter],
  );

  const filteredTasks = React.useMemo(() => {
    const cols = currentList?.columns && currentList.columns.length > 0 ? currentList.columns : DEFAULT_KANBAN_COLUMNS;
    const colTypeMap = new Map<string, KanbanColumnType>();
    cols.forEach((c) => {
      colTypeMap.set(c.id, c.columnType || getColumnType(c));
    });

    return tasks.filter((t) => {
      if (selectedAssigneeId !== "all" && t.assigneeId !== selectedAssigneeId) {
        return false;
      }
      const cType = colTypeMap.get(t.columnId || "") || "todo";
      return isTaskInDateFilter(t, cType);
    });
  }, [tasks, selectedAssigneeId, currentList?.columns, isTaskInDateFilter]);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const currentUser = userData?.user;

      if (!currentUser) {
        if (listId) {
          const publicBoard = await fetchPublicKanbanBoard(listId);
          if (publicBoard) {
            authCtxRef.current = null;
            setCurrentList(publicBoard.list);
            setTasks(publicBoard.tasks || []);
            setLoading(false);
            return;
          }
        }
        authCtxRef.current = null;
        setCurrentList(null);
        setTasks([]);
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, name")
        .eq("id", currentUser.id)
        .single();

      const companyId = profile?.company_id || "";
      authCtxRef.current = {
        companyId,
        userId: currentUser.id,
        userFullName: (profile as any)?.name || currentUser.email || "User",
      };

      if (companyId) {
        const { data: rawProfiles } = await supabase
          .from("profiles")
          .select("id, name, profile_photo")
          .eq("company_id", companyId);

        if (rawProfiles) {
          setAllMembers(
            rawProfiles.map((m: any) => ({
              id: m.id,
              name: m.name || "Team Member",
              avatarUrl: sanitizeProfilePhoto(m.profile_photo) || undefined,
            })),
          );
        }
      }

      if (listId) {
        const lists = await getToDoLists(companyId);
        let found = lists.find((l) => l.id === listId);

        if (!found) {
          const publicBoard = await fetchPublicKanbanBoard(listId);
          if (publicBoard) {
            found = publicBoard.list;
            setTasks(publicBoard.tasks || []);
          }
        } else {
          const allItems = await getToDoItems(companyId);
          const listItems = allItems.filter((i) => i.listId === found!.id);
          setTasks(listItems);
        }

        if (found) {
          setCurrentList(found);
        } else {
          setCurrentList(null);
          setTasks([]);
        }
      } else {
        const lists = await getToDoLists(companyId);
        const kanbanLists = lists.filter((l) => l.listType === "kanban");
        if (kanbanLists.length > 0 && kanbanLists[0]) {
          const first = kanbanLists[0];
          setCurrentList(first);
          const allItems = await getToDoItems(companyId);
          setTasks(allItems.filter((i) => i.listId === first.id));
        } else if (lists.length > 0 && lists[0]) {
          const first = lists[0];
          setCurrentList(first);
          const allItems = await getToDoItems(companyId);
          setTasks(allItems.filter((i) => i.listId === first.id));
        } else {
          setCurrentList(null);
          setTasks([]);
        }
      }
    } catch (err) {
      console.error("Failed to load Kanban board:", err);
      toast.error("Failed to load Kanban board.");
    } finally {
      setLoading(false);
    }
  }, [listId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  // Real-time subscription for kanban items
  React.useEffect(() => {
    if (!currentList?.id) return;
    const channel = supabase
      .channel(`kanban_realtime_${currentList.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "todo_list_items",
          filter: `list_id=eq.${currentList.id}`,
        },
        async () => {
          if (authCtxRef.current?.companyId) {
            const allItems = await getToDoItems(authCtxRef.current.companyId);
            setTasks(allItems.filter((i) => i.listId === currentList.id));
            void refreshActivity();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentList?.id, refreshActivity]);

  const handleAddColumnTask = async (colId: string) => {
    const ctx = authCtxRef.current;
    if (!currentList || !ctx || !colTaskText.trim()) return;

    const trimmed = colTaskText.trim();
    setColTaskText("");
    setAddingTaskColId(null);

    try {
      const created = await createToDoItem({
        companyId: ctx.companyId,
        listId: currentList.id,
        userId: ctx.userId,
        text: trimmed,
        priority: colTaskPriority,
        dueDate: todayStr,
        columnId: colId,
      });

      if (created) {
        setTasks((prev) => [...prev, created]);
        setCurrentList((prev) => (prev ? { ...prev, itemCount: prev.itemCount + 1 } : prev));
        void refreshActivity();
      }
    } catch (err) {
      console.error("Failed to create task:", err);
      toast.error("Failed to add task card.");
    }
  };

  const handleToggleTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    const ctx = authCtxRef.current;
    if (!task || !ctx || !currentList) return;

    const nextCompleted = !task.completed;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: nextCompleted } : t)));

    await toggleToDoItem({
      itemId: taskId,
      completed: nextCompleted,
      companyId: ctx.companyId,
      listId: currentList.id,
      userId: ctx.userId,
      taskText: task.text,
    });
    void refreshActivity();
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    const ctx = authCtxRef.current;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setSelectedTaskIds((prev) => prev.filter((id) => id !== taskId));
    setCurrentList((prev) => (prev ? { ...prev, itemCount: Math.max(0, prev.itemCount - 1) } : prev));

    if (currentList && ctx && task) {
      await deleteToDoItem({
        itemId: taskId,
        companyId: ctx.companyId,
        listId: currentList.id,
        userId: ctx.userId,
        taskText: task.text,
      });
    } else {
      await deleteToDoItem(taskId);
    }
    void refreshActivity();
  };

  const handleUpdateTaskPriority = async (taskId: string, priority: ToDoPriority) => {
    const task = tasks.find((t) => t.id === taskId);
    const ctx = authCtxRef.current;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, priority } : t)));
    const prioPayload: { itemId: string; priority: ToDoPriority; companyId?: string; listId?: string; userId?: string; taskText?: string } = {
      itemId: taskId,
      priority,
    };
    if (ctx?.companyId) prioPayload.companyId = ctx.companyId;
    if (currentList?.id) prioPayload.listId = currentList.id;
    if (ctx?.userId) prioPayload.userId = ctx.userId;
    if (task?.text) prioPayload.taskText = task.text;
    await updateToDoItemPriority(prioPayload);
    void refreshActivity();
  };

  const handleMoveTaskColumn = async (taskId: string, newColId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    const ctx = authCtxRef.current;
    if (!task || task.columnId === newColId || !currentList || !ctx) return;

    const cols = currentList.columns && currentList.columns.length > 0 ? currentList.columns : DEFAULT_KANBAN_COLUMNS;
    const fallbackColId = cols[0]?.id || "";
    const currentIdx = cols.findIndex((c) => c.id === (task.columnId || fallbackColId));
    const targetIdx = cols.findIndex((c) => c.id === newColId);
    const direction: "left" | "right" = targetIdx > currentIdx ? "right" : "left";

    const targetCol = cols.find((c) => c.id === newColId);
    const isDoneCol = targetCol?.columnType === "done" || getColumnType(targetCol) === "done";
    const nextCompleted = Boolean(isDoneCol);
    const nowIso = new Date().toISOString();

    setMovingTaskState({ taskId, direction, targetColId: newColId, phase: "exiting" });

    setTimeout(() => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, columnId: newColId, completed: nextCompleted, updatedAt: nowIso }
            : t,
        ),
      );
      setMovingTaskState({ taskId, direction, targetColId: newColId, phase: "entering" });

      setTimeout(() => {
        setMovingTaskState(null);
      }, 220);
    }, 180);

    const movePayload: {
      itemId: string;
      targetColumnId?: string;
      targetColumnName?: string;
      companyId?: string;
      listId?: string;
      userId?: string;
      text?: string;
      updatedAt?: string;
    } = {
      itemId: taskId,
      targetColumnId: newColId,
      companyId: ctx.companyId,
      listId: currentList.id,
      userId: ctx.userId,
      text: task.text,
      updatedAt: nowIso,
    };
    if (targetCol?.name) movePayload.targetColumnName = targetCol.name;
    await moveToDoItemColumn(movePayload);
    void refreshActivity();
  };

  const handleReorderTask = async (taskId: string, direction: "up" | "down") => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const colId = task.columnId;
    const colTasks = tasks.filter((t) => t.columnId === colId);
    const taskIdx = colTasks.findIndex((t) => t.id === taskId);
    if (taskIdx === -1) return;

    const swapIdx = direction === "up" ? taskIdx - 1 : taskIdx + 1;
    if (swapIdx < 0 || swapIdx >= colTasks.length) return;

    const newColTasks = [...colTasks];
    const [removed] = newColTasks.splice(taskIdx, 1);
    if (!removed) return;
    newColTasks.splice(swapIdx, 0, removed);

    const itemOrderPayload = newColTasks.map((t, idx) => {
      const p: { id: string; text: string; columnId?: string; updatedAt?: string; order: number } = {
        id: t.id,
        text: t.text,
        order: idx,
      };
      if (t.columnId) p.columnId = t.columnId;
      if (t.updatedAt) p.updatedAt = t.updatedAt;
      return p;
    });

    setTasks((prev) =>
      prev.map((t) => {
        const match = itemOrderPayload.find((p) => p.id === t.id);
        return match ? { ...t, order: match.order } : t;
      }),
    );

    await reorderToDoItems(itemOrderPayload);
    void refreshActivity();
  };

  const handleAssignTask = async (taskId: string, targetUserId: string, targetUserName: string) => {
    const ctx = authCtxRef.current;
    if (!ctx || !currentList) return;

    const ok = await requestTaskAssignment({
      taskId,
      targetUserId,
      currentUserName: ctx.userFullName,
      currentUserId: ctx.userId,
      listId: currentList.id,
      companyId: ctx.companyId,
      targetUserName,
    });

    if (ok) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                assignmentStatus: "pending",
                assignedToId: targetUserId,
                assignedById: ctx.userId,
                assignedByName: ctx.userFullName,
              }
            : t,
        ),
      );
      toast.success(`Handover request sent to ${targetUserName}!`);
      void refreshActivity();
    } else {
      toast.error("Failed to request task handover.");
    }
  };

  const handleRespondAssignment = async (taskId: string, response: "accept" | "reject") => {
    const ctx = authCtxRef.current;
    if (!ctx || !currentList) return;

    const ok = await respondTaskAssignment({
      taskId,
      response,
      userId: ctx.userId,
      currentUserName: ctx.userFullName,
      listId: currentList.id,
      companyId: ctx.companyId,
    });

    if (ok) {
      if (response === "accept") {
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== taskId) return t;
            const updated = {
              ...t,
              assigneeId: ctx.userId,
              assigneeName: ctx.userFullName,
            };
            delete updated.assignmentStatus;
            return updated;
          }),
        );
        toast.success("Task handover accepted!");
      } else {
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== taskId) return t;
            const updated = { ...t };
            delete updated.assignmentStatus;
            delete updated.assignedToId;
            delete updated.assignedById;
            delete updated.assignedByName;
            return updated;
          }),
        );
        toast.info("Task handover declined.");
      }
      void refreshActivity();
    } else {
      toast.error("Failed to update task assignment.");
    }
  };

  const handleBulkAssignTasks = async (targetUserId: string, targetUserName: string) => {
    const ctx = authCtxRef.current;
    if (!ctx || !currentList || selectedTaskIds.length === 0) return;

    const ok = await bulkRequestTaskAssignment({
      itemIds: selectedTaskIds,
      toUserId: targetUserId,
      fromUserName: ctx.userFullName,
      fromUserId: ctx.userId,
      listId: currentList.id,
      companyId: ctx.companyId,
      toUserName: targetUserName,
    });

    if (ok) {
      setTasks((prev) =>
        prev.map((t) =>
          selectedTaskIds.includes(t.id)
            ? {
                ...t,
                assignmentStatus: "pending",
                assignedToId: targetUserId,
                assignedById: ctx.userId,
                assignedByName: ctx.userFullName,
              }
            : t,
        ),
      );
      toast.success(`Handover request sent to ${targetUserName} for ${selectedTaskIds.length} tasks!`);
      setSelectedTaskIds([]);
      void refreshActivity();
    } else {
      toast.error("Failed to send bulk handover requests.");
    }
  };

  const handleAddColumn = async () => {
    const ctx = authCtxRef.current;
    if (!currentList || !ctx || !newColName.trim()) return;

    const trimmed = newColName.trim();
    setNewColName("");
    setIsAddingCol(false);

    const existingCols =
      currentList.columns && currentList.columns.length > 0 ? currentList.columns : DEFAULT_KANBAN_COLUMNS;
    const newColId = `col_${Date.now()}`;
    const newColColor = LIST_COLORS[existingCols.length % LIST_COLORS.length] || "#18181b";

    const nextCols: KanbanColumn[] = [
      ...existingCols,
      { id: newColId, name: trimmed, color: newColColor, columnType: "custom" },
    ];

    setCurrentList((prev) => (prev ? { ...prev, columns: nextCols } : prev));

    await updateToDoListColumns({
      listId: currentList.id,
      color: currentList.color || "#18181b",
      listType: "kanban",
      columns: nextCols,
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: `added stage "${trimmed}"`,
    });
    void refreshActivity();
  };

  const handleRenameColumn = async (colId: string, newName: string) => {
    const ctx = authCtxRef.current;
    if (!currentList || !ctx) return;

    const trimmed = newName.trim();
    if (!trimmed) {
      setEditingColId(null);
      setEditingColName("");
      return;
    }

    const existingCols =
      currentList.columns && currentList.columns.length > 0 ? currentList.columns : DEFAULT_KANBAN_COLUMNS;
    const targetCol = existingCols.find((c) => c.id === colId);

    setEditingColId(null);
    setEditingColName("");

    if (targetCol && targetCol.name.trim() === trimmed) {
      return;
    }

    const nextCols = existingCols.map((c) => (c.id === colId ? { ...c, name: trimmed } : c));
    setCurrentList((prev) => (prev ? { ...prev, columns: nextCols } : prev));
    await updateToDoListColumns({
      listId: currentList.id,
      color: currentList.color || "#18181b",
      listType: "kanban",
      columns: nextCols,
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: `renamed stage "${targetCol?.name || "Column"}" to "${trimmed}"`,
    });
    void refreshActivity();
  };

  const handleDeleteColumn = async (colId: string) => {
    const ctx = authCtxRef.current;
    if (!currentList || !ctx) return;
    const existingCols =
      currentList.columns && currentList.columns.length > 0 ? currentList.columns : DEFAULT_KANBAN_COLUMNS;
    if (existingCols.length <= 1) return;
    const colToDelete = existingCols.find((c) => c.id === colId);
    const nextCols = existingCols.filter((c) => c.id !== colId);
    const fallbackColId = nextCols[0]?.id || "col_1";

    setTasks((prev) => prev.map((t) => (t.columnId === colId ? { ...t, columnId: fallbackColId } : t)));
    setCurrentList((prev) => (prev ? { ...prev, columns: nextCols } : prev));
    await updateToDoListColumns({
      listId: currentList.id,
      color: currentList.color || "#18181b",
      listType: "kanban",
      columns: nextCols,
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: `deleted stage "${colToDelete?.name || "Column"}"`,
    });
    void refreshActivity();
  };

  const handleDuplicateColumn = async (colId: string) => {
    const ctx = authCtxRef.current;
    if (!currentList || !ctx) return;
    const existingCols =
      currentList.columns && currentList.columns.length > 0 ? currentList.columns : DEFAULT_KANBAN_COLUMNS;
    const sourceColIndex = existingCols.findIndex((c) => c.id === colId);
    if (sourceColIndex === -1 || !existingCols[sourceColIndex]) return;
    const sourceCol = existingCols[sourceColIndex]!;

    const newColId = `col_${Date.now()}`;
    const newColName = `${sourceCol.name} (Copy)`;
    const newColColor = LIST_COLORS[existingCols.length % LIST_COLORS.length] || "#18181b";

    const newCol: KanbanColumn = {
      id: newColId,
      name: newColName,
      color: newColColor,
      columnType: sourceCol.columnType || getColumnType(sourceCol),
    };
    const nextCols = [
      ...existingCols.slice(0, sourceColIndex + 1),
      newCol,
      ...existingCols.slice(sourceColIndex + 1),
    ];

    setCurrentList((prev) => (prev ? { ...prev, columns: nextCols } : prev));

    const sourceTasks = tasks.filter((t) => (t.columnId ? t.columnId === sourceCol.id : sourceColIndex === 0));

    await updateToDoListColumns({
      listId: currentList.id,
      color: currentList.color || "#18181b",
      listType: "kanban",
      columns: nextCols,
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: `duplicated stage "${sourceCol.name}"`,
    });

    if (sourceTasks.length > 0) {
      for (const t of sourceTasks) {
        const created = await createToDoItem({
          companyId: ctx.companyId,
          listId: currentList.id,
          userId: ctx.userId,
          text: t.text,
          priority: t.priority,
          dueDate: t.dueDate,
          columnId: newColId,
        });
        if (created) {
          setTasks((prev) => [...prev, created]);
        }
      }
    }
    void refreshActivity();
  };

  const handleReorderColumn = async (colId: string, direction: "left" | "right") => {
    const ctx = authCtxRef.current;
    if (!currentList || !ctx) return;
    const existingCols =
      currentList.columns && currentList.columns.length > 0 ? currentList.columns : DEFAULT_KANBAN_COLUMNS;
    const colIndex = existingCols.findIndex((c) => c.id === colId);
    if (colIndex === -1) return;

    const targetIndex = direction === "left" ? colIndex - 1 : colIndex + 1;
    if (targetIndex < 0 || targetIndex >= existingCols.length) return;

    const nextCols = [...existingCols];
    const [moved] = nextCols.splice(colIndex, 1);
    if (!moved) return;
    nextCols.splice(targetIndex, 0, moved);

    setCurrentList((prev) => (prev ? { ...prev, columns: nextCols } : prev));
    await updateToDoListColumns({
      listId: currentList.id,
      color: currentList.color || "#18181b",
      listType: "kanban",
      columns: nextCols,
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: `moved stage "${moved.name}" ${direction}`,
    });
    void refreshActivity();
  };

  const handleRenameList = async (newName: string) => {
    const ctx = authCtxRef.current;
    if (!currentList || !ctx) return;
    const trimmed = newName.trim();
    setIsEditingListName(false);
    if (!trimmed || trimmed === currentList.name) return;

    setCurrentList((prev) => (prev ? { ...prev, name: trimmed } : prev));
    await updateToDoListName({
      listId: currentList.id,
      name: trimmed,
      companyId: ctx.companyId,
      userId: ctx.userId,
      action: `renamed list to "${trimmed}"`,
    });
    void refreshActivity();
  };

  const handleTogglePublicShare = async (enabled: boolean) => {
    if (!currentList) return;
    const sharePayload: { listId: string; isPublicShareEnabled: boolean; companyId?: string; userId?: string; action?: string } = {
      listId: currentList.id,
      isPublicShareEnabled: enabled,
      action: enabled ? "enabled public sharing" : "disabled public sharing",
    };
    if (authCtxRef.current?.companyId) sharePayload.companyId = authCtxRef.current.companyId;
    if (authCtxRef.current?.userId) sharePayload.userId = authCtxRef.current.userId;
    const ok = await updateToDoListSharing(sharePayload);
    if (ok) {
      setCurrentList((prev) => (prev ? { ...prev, isPublicShareEnabled: enabled } : prev));
      toast.success(enabled ? "Public link enabled!" : "Board is now private.");
    }
  };

  const getPublicShareUrl = () => {
    if (typeof window === "undefined" || !currentList?.id) return "";
    return `${window.location.origin}/kanban?listId=${currentList.id}`;
  };

  const handleCopyShareLink = async () => {
    const url = getPublicShareUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      toast.success("Public link copied to clipboard!");
      setTimeout(() => setIsCopied(false), 3000);
    } catch {
      toast.error("Failed to copy link.");
    }
  };

  const handleAddCollaborator = async () => {
    if (!currentList || !collabToAdd || !authCtxRef.current || managingCollabs) return;
    const targetMember = allMembers.find((m) => m.id === collabToAdd);
    if (!targetMember) return;

    setManagingCollabs(true);
    try {
      const ok = await addToDoListCollaborator({
        companyId: authCtxRef.current.companyId,
        listId: currentList.id,
        userId: targetMember.id,
        actorId: authCtxRef.current.userId,
        permissions: collabAddPermissions,
        action: `added collaborator ${targetMember.name}`,
      });
      if (ok) {
        const newCollab: ToDoListCollaborator = {
          id: targetMember.id,
          name: targetMember.name,
          permissions: collabAddPermissions,
        };
        if (targetMember.avatarUrl) newCollab.avatarUrl = targetMember.avatarUrl;
        const nextCollabs: ToDoListCollaborator[] = [
          ...(currentList.collaborators || []),
          newCollab,
        ];
        setCurrentList((prev) => (prev ? { ...prev, collaborators: nextCollabs } : prev));
        setCollabToAdd("");
        setCollabAddRole("editor");
        setCollabAddPermissions(DEFAULT_EDITOR_PERMISSIONS);
        toast.success(`Added ${targetMember.name} as a collaborator!`);
        void refreshActivity();
      }
    } finally {
      setManagingCollabs(false);
    }
  };

  const handleRemoveCollaborator = async (collabId: string) => {
    if (!currentList || !authCtxRef.current || managingCollabs) return;
    setManagingCollabs(true);
    try {
      const ok = await removeToDoListCollaborator({
        listId: currentList.id,
        userId: collabId,
        companyId: authCtxRef.current.companyId,
        actorId: authCtxRef.current.userId,
      });
      if (ok) {
        const nextCollabs = (currentList.collaborators || []).filter((c) => c.id !== collabId);
        setCurrentList((prev) => (prev ? { ...prev, collaborators: nextCollabs } : prev));
        toast.success("Collaborator removed.");
        void refreshActivity();
      }
    } finally {
      setManagingCollabs(false);
    }
  };

  const handleSaveCollaboratorPermissions = async (collabId: string, perms: CollaboratorPermissions) => {
    if (!currentList || !authCtxRef.current || managingCollabs) return;
    setManagingCollabs(true);
    try {
      const ok = await updateToDoListCollaboratorPermissions({
        listId: currentList.id,
        userId: collabId,
        permissions: perms,
        companyId: authCtxRef.current.companyId,
        actorId: authCtxRef.current.userId,
      });
      if (ok) {
        const nextCollabs = (currentList.collaborators || []).map((c) => (c.id === collabId ? { ...c, permissions: perms } : c));
        setCurrentList((prev) => (prev ? { ...prev, collaborators: nextCollabs } : prev));
        setEditingCollab(null);
        toast.success("Collaborator permissions updated!");
        void refreshActivity();
      }
    } finally {
      setManagingCollabs(false);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, taskId: string, colId: string) => {
    setDraggingTaskId(taskId);
    setDragSourceColId(colId);
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDragSourceColId(null);
    setDragOverTarget(null);
  };

  const handleColumnDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (!dragOverTarget || dragOverTarget.colId !== colId || dragOverTarget.taskId) {
      setDragOverTarget({ colId });
    }
  };

  const handleCardDragOver = (e: React.DragEvent, colId: string, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const targetEl = e.currentTarget as HTMLElement;
    const rect = targetEl.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: "before" | "after" = e.clientY < midY ? "before" : "after";
    if (!dragOverTarget || dragOverTarget.taskId !== taskId || dragOverTarget.position !== position) {
      setDragOverTarget({ colId, taskId, position });
    }
  };

  const handleDrop = async (e: React.DragEvent, targetColId: string) => {
    e.preventDefault();
    const taskId = draggingTaskId || e.dataTransfer.getData("text/plain");
    if (!taskId || !currentList) {
      handleDragEnd();
      return;
    }

    const task = tasks.find((t) => t.id === taskId);
    if (!task) {
      handleDragEnd();
      return;
    }

    const sourceColId = task.columnId;
    const isChangingCol = sourceColId !== targetColId;

    if (isChangingCol) {
      void handleMoveTaskColumn(taskId, targetColId);
    }
    handleDragEnd();
  };

  if (loading) {
    return (
      <div className="kanban-loading-screen">
        <div className="kanban-spinner" />
        <span className="kanban-loading-text">Loading Kanban Workspace...</span>
      </div>
    );
  }

  if (!currentList) {
    const isGuestWithNoBoard = !authCtxRef.current?.userId;
    return (
      <div className="kanban-empty-state-screen">
        {isGuestWithNoBoard ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: "380px" }}>
            <div className="kanban-empty-icon-box">
              <Lock size={24} />
            </div>
            <h2 className="kanban-empty-title">
              Sign in to view this board
            </h2>
            <p className="kanban-empty-desc">
              This Kanban board is private. Sign in with your account to access it, or ask the owner to share a public link with you.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/login" })}
              className="kanban-header-btn"
              style={{ backgroundColor: "#0f172a", color: "#ffffff", borderColor: "#0f172a", padding: "0 20px", height: "36px" }}
            >
              Sign In
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: "380px" }}>
            <h2 className="kanban-empty-title">Board Not Found</h2>
            <p className="kanban-empty-desc">The requested Kanban board does not exist or has been removed.</p>
            <button
              type="button"
              onClick={() => navigate({ to: search.teamId ? `/teams/${search.teamId}` : "/lists" })}
              className="kanban-header-btn"
              style={{ backgroundColor: "#0f172a", color: "#ffffff", borderColor: "#0f172a", padding: "0 20px", height: "36px" }}
            >
              <ArrowLeft size={16} />
              {search.teamId ? "Return to Team" : "Return to Lists"}
            </button>
          </div>
        )}
      </div>
    );
  }

  const myPerms = getEffectiveUserPermissions(currentList, authCtxRef.current?.userId);
  const isOwnerOrAdmin = currentList?.ownerId === authCtxRef.current?.userId || myPerms.canManageCollaborators;

  const boardCols =
    currentList.columns && currentList.columns.length > 0
      ? currentList.columns
      : DEFAULT_KANBAN_COLUMNS;

  const renderSidebarContent = () => (
    <div className="kanban-sidebar">
      {myPerms.canAddStages && (
        <div className="kanban-sidebar-card">
          <div className="kanban-sidebar-card-title">Add Stage</div>
          {isAddingCol ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <input
                autoFocus
                placeholder="e.g. In Review, QA..."
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddColumn();
                  if (e.key === "Escape") setIsAddingCol(false);
                }}
                className="kanban-col-rename-input"
                style={{ borderBottom: "1.5px solid #0f172a", padding: "4px 0" }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px" }}>
                <button
                  type="button"
                  onClick={() => setIsAddingCol(false)}
                  className="kanban-header-btn"
                  style={{ height: "26px", padding: "0 8px", fontSize: "11px" }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!newColName.trim()}
                  onClick={handleAddColumn}
                  className="kanban-header-btn"
                  style={{ height: "26px", padding: "0 10px", fontSize: "11px", backgroundColor: "#0f172a", color: "#ffffff", borderColor: "#0f172a" }}
                >
                  Save Stage
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsAddingCol(true);
                setNewColName("");
              }}
              className="kanban-add-stage-btn"
            >
              <Plus size={15} />
              Add another stage
            </button>
          )}
        </div>
      )}

      {/* List Details */}
      <div className="kanban-sidebar-card">
        <div className="kanban-sidebar-card-title">List Details</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="kanban-detail-row">
            <span className="kanban-detail-label">Creator</span>
            <span className="kanban-detail-value">
              {currentList.ownerId === authCtxRef.current?.userId ? "You" : currentList.ownerName}
            </span>
          </div>
          <div className="kanban-detail-row">
            <span className="kanban-detail-label">Created on</span>
            <span className="kanban-detail-value">
              {new Date(currentList.createdAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
          <div className="kanban-detail-row">
            <span className="kanban-detail-label">Total Cards</span>
            <span className="kanban-detail-value">{tasks.length}</span>
          </div>
          <div className="kanban-detail-row">
            <span className="kanban-detail-label">Stages</span>
            <span className="kanban-detail-value">{boardCols.length}</span>
          </div>
        </div>
      </div>

      {/* Collaborators */}
      <div className="kanban-sidebar-card">
        <div className="kanban-sidebar-card-title">
          <span>Collaborators</span>
          {isOwnerOrAdmin && (
            <button
              type="button"
              onClick={() => setManageCollabOpen(true)}
              className="kanban-note-convert-btn"
              style={{ fontSize: "12px", color: "#16a34a", fontWeight: 600 }}
            >
              Manage
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="kanban-card-avatar" style={{ width: "28px", height: "28px" }}>
                  <AvatarImage src={sanitizeProfilePhoto(currentList.ownerAvatarUrl || allMembers.find((m) => m.id === currentList.ownerId)?.avatarUrl) || undefined} />
                  <AvatarFallback>
                    {(currentList.ownerName || "O")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>{`${currentList.ownerName} (Creator)`}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {(currentList.collaborators || []).map((collab) => (
            <TooltipProvider key={collab.id}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Avatar className="kanban-card-avatar" style={{ width: "28px", height: "28px" }}>
                    <AvatarImage src={sanitizeProfilePhoto(collab.avatarUrl || allMembers.find((m) => m.id === collab.id)?.avatarUrl) || undefined} />
                    <AvatarFallback>
                      {(collab.name || "U")[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent>{`${collab.name} (${collab.permissions?.role?.toUpperCase() || "EDITOR"})`}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="kanban-sidebar-card" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div className="kanban-sidebar-card-title">
          <span>Recent Activity</span>
          {currentList.activity && currentList.activity.length > 0 && (
            <span style={{ fontSize: "11px", color: "#94a3b8" }}>
              {Math.min(activityVisibleCount, currentList.activity.length)} of {currentList.activity.length}
            </span>
          )}
        </div>

        <div
          onScroll={(e) => {
            const target = e.currentTarget;
            if (target.scrollHeight - target.scrollTop <= target.clientHeight + 25) {
              if (currentList.activity && activityVisibleCount < currentList.activity.length) {
                setActivityVisibleCount((prev) => prev + 10);
              }
            }
          }}
          style={{ overflowY: "auto", flex: 1, maxHeight: "320px" }}
        >
          {currentList.activity && currentList.activity.length > 0 ? (
            <>
              {currentList.activity.slice(0, activityVisibleCount).map((act) => (
                <div key={act.id} className="kanban-activity-item">
                  <div className="kanban-activity-dot" />
                  <div className="kanban-activity-content">
                    <p style={{ margin: 0, fontSize: "12px", color: "#334155" }}>
                      <strong style={{ color: "#0f172a" }}>{act.user}</strong> {act.text}
                    </p>
                    <span className="kanban-activity-time">
                      {formatRelativeTime(act.createdAt)}
                    </span>
                  </div>
                </div>
              ))}

              {activityVisibleCount < currentList.activity.length && (
                <button
                  type="button"
                  onClick={() => setActivityVisibleCount((prev) => prev + 10)}
                  className="kanban-col-footer-btn"
                  style={{ marginTop: "8px" }}
                >
                  Load more activity (+10)
                </button>
              )}
            </>
          ) : (
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>No activity yet</span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="kanban-workspace-root">
      {/* Top Header Bar */}
      <header className="kanban-header-bar">
        {/* Left: Back Button */}
        <div className="kanban-header-left">
          <button
            type="button"
            onClick={() => navigate({ to: backRoute })}
            className="kanban-back-btn"
          >
            <ArrowLeft size={14} />
            {backLabel}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: backRoute })}
            className="kanban-back-btn-mobile"
            title={backLabel}
          >
            <ArrowLeft size={16} />
          </button>
        </div>

        {/* Center: List Title + Visibility Badge */}
        <div className="kanban-header-center">
          {isEditingListName && isOwnerOrAdmin ? (
            <input
              autoFocus
              className="kanban-title-input"
              value={editingListName}
              onChange={(e) => setEditingListName(e.target.value)}
              onBlur={() => handleRenameList(editingListName)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameList(editingListName);
                if (e.key === "Escape") {
                  setIsEditingListName(false);
                  setEditingListName("");
                }
              }}
            />
          ) : (
            <h1
              onClick={() => {
                if (isOwnerOrAdmin) {
                  setIsEditingListName(true);
                  setEditingListName(currentList.name);
                }
              }}
              className={`kanban-title-text ${isOwnerOrAdmin ? "editable" : ""}`}
              title={isOwnerOrAdmin ? "Click to rename list" : currentList.name}
            >
              {currentList.name}
            </h1>
          )}

          {/* Visibility Popover Trigger */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={!isOwnerOrAdmin}
                className={`kanban-visibility-badge ${currentList.isPublicShareEnabled ? "public" : ""}`}
              >
                {currentList.isPublicShareEnabled ? <Globe size={11} /> : <Lock size={11} />}
                <span>{currentList.isPublicShareEnabled ? "Open Link" : "Private"}</span>
                {isOwnerOrAdmin && <ChevronDown size={10} />}
              </button>
            </PopoverTrigger>
            <PopoverContent align="center" className="kanban-visibility-popover">
              <div className="kanban-visibility-header">
                <h3>List Visibility</h3>
                <p>Control who can view and collaborate on this board</p>
              </div>

              {/* Card 1: Private Access */}
              <div className="kanban-visibility-card">
                <div className="kanban-visibility-card-top">
                  <div className="kanban-visibility-card-top-left">
                    <div className="kanban-visibility-icon-box">
                      <Lock size={16} />
                    </div>
                    <div>
                      <div className="kanban-visibility-card-title">Private Access</div>
                      <p className="kanban-visibility-card-desc">Only you and invited collaborators have access.</p>
                    </div>
                  </div>
                </div>

                <div className="kanban-visibility-divider-row">
                  <div className="kanban-collab-badge-group">
                    <Users size={14} />
                    <span>{(currentList.collaborators || []).length} {(currentList.collaborators || []).length === 1 ? "collaborator" : "collaborators"}</span>
                  </div>
                  {isOwnerOrAdmin && (
                    <button
                      type="button"
                      onClick={() => setManageCollabOpen(true)}
                      className="kanban-manage-collabs-btn"
                    >
                      Manage
                    </button>
                  )}
                </div>
              </div>

              {/* Card 2: Public Share Link */}
              <div className="kanban-visibility-card">
                <div className="kanban-visibility-card-top">
                  <div className="kanban-visibility-card-top-left">
                    <div className="kanban-visibility-icon-box">
                      <Globe size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="kanban-visibility-card-title">Public Link</span>
                        <span className={`kanban-visibility-status-pill ${currentList.isPublicShareEnabled ? "active" : "inactive"}`}>
                          <span className="kanban-visibility-status-dot" />
                          {currentList.isPublicShareEnabled ? "Active" : "Off"}
                        </span>
                      </div>
                      <p className="kanban-visibility-card-desc">Anyone with this link can view this board.</p>
                    </div>
                  </div>
                  <Switch
                    checked={Boolean(currentList.isPublicShareEnabled)}
                    onCheckedChange={(checked) => void handleTogglePublicShare(checked)}
                  />
                </div>

                {currentList.isPublicShareEnabled && (
                  <div className="kanban-share-link-input-group">
                    <span className="kanban-share-url-text">{getPublicShareUrl()}</span>
                    <a
                      href={getPublicShareUrl()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="kanban-share-ext-link"
                      title="Open in new tab"
                    >
                      <ExternalLink size={13} />
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyShareLink}
                      className={`kanban-share-copy-action ${isCopied ? "copied" : ""}`}
                    >
                      {isCopied ? <Check size={13} /> : <Copy size={13} />}
                      {isCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                )}
              </div>

              {/* Card 3: Board Notes */}
              <div className="kanban-visibility-card">
                <div className="kanban-visibility-card-top">
                  <div className="kanban-visibility-card-top-left">
                    <div className="kanban-visibility-icon-box">
                      <FileText size={16} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="kanban-visibility-card-title">Board Notes</span>
                        <span className={`kanban-visibility-status-pill ${currentList.isNotesEnabled ? "active" : "inactive"}`}>
                          <span className="kanban-visibility-status-dot" />
                          {currentList.isNotesEnabled ? "Enabled" : "Off"}
                        </span>
                      </div>
                      <p className="kanban-visibility-card-desc">Allow leaving messages and notes on this board.</p>
                    </div>
                  </div>
                  <Switch
                    checked={Boolean(currentList.isNotesEnabled)}
                    onCheckedChange={(checked) => void handleToggleNotesFeature(checked)}
                  />
                </div>

                {currentList.isNotesEnabled && (
                  <div className="kanban-visibility-divider-row">
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#0f172a" }}>Allow Guest Notes</div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>Visitors can leave notes without signing in</div>
                    </div>
                    <Switch
                      checked={currentList.allowPublicNotes !== false}
                      onCheckedChange={(checked) => void handleTogglePublicNotes(checked)}
                    />
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          {effectiveTeamId && (
            <button
              type="button"
              onClick={() => navigate({ to: `/teams/${effectiveTeamId}` })}
              className="kanban-visibility-badge"
            >
              <Users size={11} />
              Team Board
            </button>
          )}
        </div>

        {/* Right side Desktop Controls */}
        <div className="kanban-header-right-desktop">
          {/* Date Selector Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={`kanban-header-btn ${
                  dateFilter.type === "today" ? "active-green" : dateFilter.type === "all_time" ? "" : "active-blue"
                }`}
              >
                <CalendarDays size={14} />
                <span>{dateFilterLabel}</span>
                <ChevronDown size={11} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="kanban-date-popover">
              {/* Left: Presets Column */}
              <div className="kanban-date-presets-col">
                <div className="kanban-date-presets-title">
                  <CalendarDays size={16} className="text-blue-600" />
                  Filter by Date
                </div>
                <span className="kanban-date-presets-label">PRESETS</span>
                {[
                  { type: "today" as const, label: "Today" },
                  { type: "current_month" as const, label: "This Month" },
                  { type: "past_3_months" as const, label: "Past 3 Months" },
                  { type: "past_6_months" as const, label: "Past 6 Months" },
                  { type: "all_time" as const, label: "All Time" },
                ].map((preset) => {
                  const isSelected = dateFilter.type === preset.type;
                  return (
                    <button
                      key={preset.type}
                      type="button"
                      onClick={() => saveKanbanDateFilter({ type: preset.type })}
                      className={`kanban-date-preset-btn ${isSelected ? "active" : ""}`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              {/* Vertical divider */}
              <div className="kanban-date-divider" />

              {/* Right: Calendar Column */}
              <div className="kanban-date-calendar-col">
                {(() => {
                  const viewYear = calendarViewingDate.getFullYear();
                  const viewMonth = calendarViewingDate.getMonth();
                  const monthNames = [
                    "January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"
                  ];
                  const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
                  const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
                  const startDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
                  const todayStr = getKanbanTodayString();

                  return (
                    <div>
                      <div className="kanban-calendar-nav">
                        <button
                          type="button"
                          onClick={() => setCalendarViewingDate(new Date(viewYear, viewMonth - 1, 1))}
                          className="kanban-calendar-nav-btn"
                          title="Previous month"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span className="kanban-calendar-month-title">
                          {monthNames[viewMonth]} {viewYear}
                        </span>
                        <button
                          type="button"
                          onClick={() => setCalendarViewingDate(new Date(viewYear, viewMonth + 1, 1))}
                          className="kanban-calendar-nav-btn"
                          title="Next month"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>

                      <div className="kanban-calendar-weekdays">
                        {daysOfWeek.map((d) => (
                          <span key={d}>{d}</span>
                        ))}
                      </div>

                      <div className="kanban-calendar-grid">
                        {Array.from({ length: startDayOfWeek }).map((_, i) => (
                          <div key={`empty-${i}`} className="h-8" />
                        ))}
                        {Array.from({ length: totalDays }).map((_, i) => {
                          const dayNum = i + 1;
                          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                          const isToday = dateStr === todayStr;
                          const isSelected =
                            dateFilter.type === "today"
                              ? isToday
                              : dateFilter.type === "custom_date" && dateFilter.selectedDate === dateStr;

                          return (
                            <button
                              key={`day-${dayNum}`}
                              type="button"
                              onClick={() => {
                                if (dateStr === todayStr) {
                                  saveKanbanDateFilter({ type: "today" });
                                } else {
                                  saveKanbanDateFilter({ type: "custom_date", selectedDate: dateStr });
                                }
                              }}
                              className={`kanban-calendar-day-btn ${isSelected ? "selected" : isToday ? "today" : ""}`}
                            >
                              {dayNum}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </PopoverContent>
          </Popover>

          {/* Assignee Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`kanban-header-btn ${selectedAssigneeId === "all" ? "" : "active-blue"}`}
              >
                {selectedAssigneeId === "all" ? (
                  <Users size={14} />
                ) : (
                  <Avatar className="w-4 h-4 text-[9px] bg-blue-600 text-white font-semibold">
                    <AvatarImage src={sanitizeProfilePhoto(selectedAssigneeObj?.avatarUrl) || undefined} />
                    <AvatarFallback>
                      {(selectedAssigneeObj?.name || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
                <span>{selectedAssigneeId === "all" ? "All Members" : selectedAssigneeObj?.name || "Assignee"}</span>
                <span className={`kanban-count-pill ${selectedAssigneeId === "all" ? "" : "blue"}`}>
                  {selectedAssigneeId !== "all" ? `${filteredTasks.length}/${tasks.length}` : tasks.length}
                </span>
                <ChevronDown size={11} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-white border border-slate-200 rounded-xl p-1 shadow-lg">
              <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">
                Filter by Assignee
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setSelectedAssigneeId("all")}
                className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-slate-50 text-xs"
              >
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                    <Users size={12} />
                  </div>
                  <span className={selectedAssigneeId === "all" ? "font-semibold text-slate-900" : "text-slate-700"}>All Members</span>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">{tasks.length}</span>
              </DropdownMenuItem>
              {availableAssignees.map((m) => {
                const count = tasks.filter((t) => t.assigneeId === m.id).length;
                return (
                  <DropdownMenuItem
                    key={m.id}
                    onClick={() => setSelectedAssigneeId(m.id)}
                    className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-slate-50 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="w-5 h-5 text-[9px]">
                        <AvatarImage src={sanitizeProfilePhoto(m.avatarUrl) || undefined} />
                        <AvatarFallback>
                          {(m.name || "U").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className={selectedAssigneeId === m.id ? "font-semibold text-blue-600" : "text-slate-700"}>
                        {m.name}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium">{count}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notes Button */}
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className={`kanban-header-btn ${accessibleNotes.length > 0 ? "active-amber" : ""}`}
            title="Board Notes"
          >
            <FileText size={14} />
            <span>Notes</span>
            {accessibleNotes.length > 0 && (
              <span className="kanban-count-pill amber">
                {accessibleNotes.length}
              </span>
            )}
          </button>

          {/* Sidebar toggle button */}
          <button
            type="button"
            onClick={() => setShowSidebar((prev) => !prev)}
            className={`kanban-header-btn ${showSidebar ? "active-sidebar" : ""}`}
          >
            {showSidebar ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            <span>Sidebar</span>
          </button>
        </div>

        {/* Mobile Sidebar Toggle Button */}
        <div className="kanban-header-right-mobile">
          <button
            type="button"
            onClick={() => setShowSidebar((prev) => !prev)}
            className="kanban-back-btn-mobile"
          >
            {showSidebar ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
      </header>

      {/* Subheader Filter Bar on Mobile/Tablet */}
      <div className="kanban-mobile-subbar">
        <button
          type="button"
          onClick={() => {
            if (dateFilter.type === "today") {
              saveKanbanDateFilter({ type: "all_time" });
            } else {
              saveKanbanDateFilter({ type: "today" });
            }
          }}
          className={`kanban-mobile-subbar-btn ${dateFilter.type === "today" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : ""}`}
        >
          <CalendarDays size={13} />
          <span>{dateFilterLabel}</span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="kanban-mobile-subbar-btn"
            >
              <Users size={13} />
              <span>{selectedAssigneeId === "all" ? "All Members" : selectedAssigneeObj?.name || "Assignee"}</span>
              <ChevronDown size={11} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 bg-white border border-slate-200 rounded-xl p-1 shadow-lg">
            <DropdownMenuItem onClick={() => setSelectedAssigneeId("all")} className="text-xs p-2">
              All Members
            </DropdownMenuItem>
            {availableAssignees.map((m) => (
              <DropdownMenuItem key={m.id} onClick={() => setSelectedAssigneeId(m.id)} className="text-xs p-2">
                {m.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {(currentList?.isNotesEnabled || isOwnerOrAdmin) && (
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className={`kanban-mobile-subbar-btn ${accessibleNotes.length > 0 ? "text-amber-800 bg-amber-50 border-amber-200" : ""}`}
          >
            <StickyNote size={13} />
            <span>Notes</span>
            {accessibleNotes.length > 0 && (
              <span className="kanban-count-pill amber">
                {accessibleNotes.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Main Kanban Content Area */}
      <div className="kanban-body-container">
        {/* Mobile View: Vertical Stage Stack */}
        <div className="kanban-mobile-view">
          {boardCols.map((col, cIdx) => {
            const sortedColTasks = filteredTasks
              .filter((t) => (t.columnId ? t.columnId === col.id : cIdx === 0))
              .sort((a, b) => {
                if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
                  return a.order - b.order;
                }
                const timeA = new Date(a.createdAt).getTime();
                const timeB = new Date(b.createdAt).getTime();
                if (timeA !== timeB) return timeA - timeB;
                return a.id.localeCompare(b.id);
              });

            return (
              <MobileStageRow
                key={col.id}
                col={col}
                colIndex={cIdx}
                colTasks={sortedColTasks}
                allMembers={allMembers}
                myPerms={myPerms}
                boardCols={boardCols}
                addingTaskColId={addingTaskColId}
                setAddingTaskColId={setAddingTaskColId}
                colTaskText={colTaskText}
                setColTaskText={setColTaskText}
                colTaskPriority={colTaskPriority}
                setColTaskPriority={setColTaskPriority}
                handleAddColumnTask={handleAddColumnTask}
                handleToggleTask={handleToggleTask}
                handleDeleteTask={handleDeleteTask}
                handleMoveTaskColumn={handleMoveTaskColumn}
                handleUpdateTaskPriority={handleUpdateTaskPriority}
                onOpenColumnMenu={() => {}}
                editingColId={editingColId}
                editingColName={editingColName}
                setEditingColId={setEditingColId}
                setEditingColName={setEditingColName}
                handleRenameColumn={handleRenameColumn}
                getDueLabel={getDueLabel}
                currentUserId={authCtxRef.current?.userId}
                handleRespondAssignment={handleRespondAssignment}
                handleAssignTask={handleAssignTask}
                listCollaborators={listCollaborators}
                selectedTaskIds={selectedTaskIds}
                setSelectedTaskIds={setSelectedTaskIds}
                isShiftPressed={isShiftPressed}
                movingTaskState={movingTaskState}
              />
            );
          })}
        </div>

        {/* Desktop View: Multi-Column Kanban Board */}
        <div
          ref={boardScrollContainerRef}
          className="kanban-desktop-board"
        >
          {boardCols.map((col, cIdx) => {
            const sortedColTasks = filteredTasks
              .filter((t) => (t.columnId ? t.columnId === col.id : cIdx === 0))
              .sort((a, b) => {
                if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
                  return a.order - b.order;
                }
                const timeA = new Date(a.createdAt).getTime();
                const timeB = new Date(b.createdAt).getTime();
                if (timeA !== timeB) return timeA - timeB;
                return a.id.localeCompare(b.id);
              });

            let colTasks: ToDoItem[] = sortedColTasks;

            if (draggingTaskId) {
              const draggedTask = tasks.find((t) => t.id === draggingTaskId);
              const remainingColTasks = sortedColTasks.filter((t) => t.id !== draggingTaskId);

              if (dragOverTarget?.colId === col.id && draggedTask) {
                let insertIdx = remainingColTasks.length;
                if (dragOverTarget.taskId) {
                  const targetIdx = remainingColTasks.findIndex((t) => t.id === dragOverTarget.taskId);
                  if (targetIdx !== -1) {
                    insertIdx = dragOverTarget.position === "before" ? targetIdx : targetIdx + 1;
                  }
                }
                const newTasks = [...remainingColTasks];
                newTasks.splice(insertIdx, 0, draggedTask);
                colTasks = newTasks;
              } else if (dragSourceColId === col.id && !dragOverTarget) {
                colTasks = sortedColTasks;
              } else {
                colTasks = remainingColTasks;
              }
            }

            const isAlternate = cIdx % 2 === 1;

            return (
              <div
                key={col.id}
                className={`kanban-column ${isAlternate ? "alt-bg" : ""}`}
              >
                {/* Column Header */}
                <div className="kanban-col-header">
                  <div className="kanban-col-header-left">
                    <div
                      className="kanban-col-color-dot"
                      style={{ backgroundColor: col.color || "#18181b" }}
                    />
                    {editingColId === col.id && myPerms.canRenameStages ? (
                      <input
                        autoFocus
                        className="kanban-col-rename-input"
                        value={editingColName}
                        onChange={(e) => setEditingColName(e.target.value)}
                        onBlur={() => handleRenameColumn(col.id, editingColName)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameColumn(col.id, editingColName);
                          if (e.key === "Escape") setEditingColId(null);
                        }}
                      />
                    ) : (
                      <span
                        onClick={() => {
                          if (myPerms.canRenameStages) {
                            setEditingColId(col.id);
                            setEditingColName(col.name);
                          }
                        }}
                        className={`kanban-col-title ${myPerms.canRenameStages ? "editable" : ""}`}
                        title={myPerms.canRenameStages ? "Click to rename stage" : col.name}
                      >
                        {col.name}
                      </span>
                    )}
                  </div>

                  <div className="kanban-col-header-right">
                    <span className="kanban-col-badge">
                      {sortedColTasks.length}
                    </span>

                    {(myPerms.canDuplicateStages || myPerms.canDeleteStages || myPerms.canConfigureStages || myPerms.role === "admin") && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="kanban-col-menu-btn"
                            title="Column options"
                          >
                            <MoreVertical size={14} />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="kanban-col-menu-dropdown">
                          {/* Directional Shift */}
                          <div className="kanban-col-dirs-row">
                            <button
                              type="button"
                              disabled={cIdx <= 0}
                              onClick={() => handleReorderColumn(col.id, "left")}
                              className="kanban-col-dir-btn"
                            >
                              <ArrowLeft size={13} /> Left
                            </button>
                            <button
                              type="button"
                              disabled={cIdx >= boardCols.length - 1}
                              onClick={() => handleReorderColumn(col.id, "right")}
                              className="kanban-col-dir-btn"
                            >
                              Right <ArrowRight size={13} />
                            </button>
                          </div>

                          {/* Stage Category */}
                          <div className="kanban-col-cat-subheader">Stage Category</div>
                          {[
                            { type: "todo" as const, label: "To Do (Pending)", icon: Clock },
                            { type: "in_progress" as const, label: "In Progress (Active)", icon: PlayCircle },
                            { type: "done" as const, label: "Done (Completed)", icon: CheckCircle2 },
                            { type: "custom" as const, label: "Custom (Date-Scoped)", icon: SlidersHorizontal },
                          ].map((cat) => {
                            const currentType = col.columnType || getColumnType(col);
                            const isSelected = currentType === cat.type;
                            const IconComponent = cat.icon;
                            return (
                              <button
                                key={cat.type}
                                type="button"
                                onClick={() => {
                                  if (!currentList?.id) return;
                                  const nextCols = boardCols.map((c) =>
                                    c.id === col.id ? { ...c, columnType: cat.type } : c
                                  );
                                  setCurrentList((prev) => (prev ? { ...prev, columns: nextCols } : prev));
                                  void updateToDoListColumns(currentList.id, nextCols);
                                }}
                                className={`kanban-col-cat-item ${isSelected ? "active" : ""}`}
                              >
                                <div className="kanban-col-cat-item-left">
                                  <IconComponent size={13} />
                                  <span>{cat.label}</span>
                                </div>
                                {isSelected && <Check size={14} strokeWidth={2.5} className="text-blue-600" />}
                              </button>
                            );
                          })}

                          {/* Action Items */}
                          {(myPerms.canDuplicateStages || (boardCols.length > 1 && myPerms.canDeleteStages)) && (
                            <div className="kanban-col-actions-group">
                              {myPerms.canDuplicateStages && (
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateColumn(col.id)}
                                  className="kanban-col-action-item"
                                >
                                  <Copy size={13} />
                                  <span>Duplicate Column</span>
                                </button>
                              )}
                              {boardCols.length > 1 && myPerms.canDeleteStages && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteColumn(col.id)}
                                  className="kanban-col-action-item delete"
                                >
                                  <DeleteOutlined size={13} />
                                  <span>Delete Column</span>
                                </button>
                              )}
                            </div>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {/* Column Drop Zone / Tasks Container */}
                <div
                  onDragOver={(e) => handleColumnDragOver(e, col.id)}
                  onDrop={(e) => handleDrop(e, col.id)}
                  className="kanban-cards-stack"
                >
                  {colTasks.length === 0 ? (
                    addingTaskColId === col.id ? null : (
                      <div className="kanban-col-empty">
                        {myPerms.canAddTasks ? (
                          <button
                            type="button"
                            onClick={() => {
                              setAddingTaskColId(col.id);
                              setColTaskText("");
                              setColTaskPriority("Low");
                            }}
                            className="kanban-col-add-btn"
                          >
                            <Plus size={14} />
                            Add task
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">No tasks</span>
                        )}
                      </div>
                    )
                  ) : (
                    colTasks.map((t, tIdx) => {
                      const isTopTask = tIdx === 0;
                      const isBottomTask = tIdx === colTasks.length - 1;
                      const isDragging = draggingTaskId === t.id;

                      const isMyTask =
                        Boolean(authCtxRef.current?.userId && t.assigneeId === authCtxRef.current.userId);
                      const isBoardAdmin = isOwnerOrAdmin || myPerms.role === "admin";
                      const canChangePriority = isBoardAdmin || (isMyTask && myPerms.canChangePriority);
                      const canMoveThisTask = isBoardAdmin || (isMyTask && myPerms.canMoveTasks);
                      const canRemoveThisTask = isBoardAdmin || (isMyTask && myPerms.canRemoveTasks);
                      const canHandoverThisTask = isBoardAdmin || (isMyTask && (myPerms.canAddTasks || myPerms.canMoveTasks));
                      const isSelected = selectedTaskIds.includes(t.id);
                      const isHandoverEligible = !t.completed && canHandoverThisTask;

                      return (
                        <div
                          key={t.id}
                          data-card-id={t.id}
                          onDragOver={(e) => handleCardDragOver(e, col.id, t.id)}
                          onMouseDown={(e) => {
                            if (e.shiftKey || isShiftPressed || selectedTaskIds.length > 0) {
                              e.preventDefault();
                              e.stopPropagation();
                              window.getSelection()?.removeAllRanges();
                            }
                          }}
                          onClick={(e) => {
                            if (e.shiftKey || selectedTaskIds.length > 0) {
                              e.preventDefault();
                              e.stopPropagation();
                              window.getSelection()?.removeAllRanges();
                              if (isHandoverEligible) {
                                setSelectedTaskIds((prev) =>
                                  prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                                );
                              }
                            }
                          }}
                          className={`kanban-card ${t.completed ? "completed" : ""} ${isSelected ? "selected" : ""} ${isDragging ? "dragging" : ""} ${
                            movingTaskState?.taskId === t.id
                              ? movingTaskState.phase === "exiting"
                                ? movingTaskState.direction === "right"
                                  ? "anim-exit-right"
                                  : "anim-exit-left"
                                : movingTaskState.phase === "entering"
                                  ? movingTaskState.direction === "right"
                                    ? "anim-enter-from-left"
                                    : "anim-enter-from-right"
                                  : ""
                              : ""
                          }`.trim()}
                        >
                          {/* Priority + Actions Bar (Draggable handle) */}
                          <div
                            draggable={canMoveThisTask && !isShiftPressed}
                            onDragStart={(e) => handleDragStart(e, t.id, col.id)}
                            onDragEnd={handleDragEnd}
                            className="kanban-card-top-handle"
                          >
                            <div className="flex items-center gap-1.5">
                              {canChangePriority ? (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button
                                      type="button"
                                      className={`kanban-card-priority-pill ${(t.priority || "low").toLowerCase()}`}
                                      title={`Priority: ${t.priority || "Low"} (Click to change)`}
                                    >
                                      {t.priority || "Low"}
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="w-28 bg-white border border-slate-200 rounded-xl p-1 shadow-lg">
                                    <DropdownMenuItem onClick={() => handleUpdateTaskPriority(t.id, "High")} className="text-xs p-1.5 text-rose-600 font-medium">
                                      High
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleUpdateTaskPriority(t.id, "Medium")} className="text-xs p-1.5 text-amber-600 font-medium">
                                      Medium
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleUpdateTaskPriority(t.id, "Low")} className="text-xs p-1.5 text-slate-600 font-medium">
                                      Low
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              ) : (
                                <span className={`kanban-card-priority-pill ${(t.priority || "low").toLowerCase()}`}>
                                  {t.priority || "Low"}
                                </span>
                              )}

                              {isSelected && (
                                <span className="kanban-card-selected-badge">
                                  <Check size={10} strokeWidth={3} />
                                  Selected
                                </span>
                              )}
                            </div>

                            {/* Hover Quick Actions */}
                            <div className="kanban-card-hover-actions">
                              {canMoveThisTask && colTasks.length > 1 && (
                                <>
                                  <button
                                    type="button"
                                    disabled={isTopTask}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleReorderTask(t.id, "up");
                                    }}
                                    className="kanban-card-action-icon-btn disabled:opacity-30"
                                    title="Move up"
                                  >
                                    <ChevronUp size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBottomTask}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleReorderTask(t.id, "down");
                                    }}
                                    className="kanban-card-action-icon-btn disabled:opacity-30"
                                    title="Move down"
                                  >
                                    <ChevronDown size={13} />
                                  </button>
                                </>
                              )}

                              {canRemoveThisTask && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDeleteTask(t.id);
                                  }}
                                  className="kanban-card-action-icon-btn hover:text-rose-600"
                                  title="Remove card"
                                >
                                  <CloseIcon size={13} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Task Text */}
                          <div className="kanban-card-body">
                            <div className="kanban-card-text-wrapper">
                              <p className={`kanban-card-title ${t.completed ? "completed" : ""}`}>
                                {t.text}
                              </p>
                            </div>
                          </div>

                          {/* Handover Status Banner */}
                          {t.assignmentStatus === "pending" && (
                            <>
                              {t.assignedToId === authCtxRef.current?.userId ? (
                                <div className="kanban-handover-banner">
                                  <UserPlus size={12} />
                                  <span>
                                    Handover offered by {t.assignedByName || "Collaborator"}
                                  </span>
                                </div>
                              ) : t.assignedById === authCtxRef.current?.userId ? (
                                <div className="kanban-handover-banner pending-out">
                                  <div className="flex items-center gap-1.5">
                                    <Clock size={12} />
                                    <span>
                                      Handover offered (Pending)
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void handleRespondAssignment(t.id, "reject");
                                    }}
                                    className="text-[10.5px] font-semibold text-amber-800 hover:underline"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : null}
                            </>
                          )}

                          {/* Card Footer: Assignee Avatar + Due Date + Stage Mover */}
                          <div className="kanban-card-footer">
                            <div className="kanban-card-footer-left">
                              {(() => {
                                const creator = allMembers.find((m) => m.id === t.assigneeId) || {
                                  name: t.assigneeName || "Team Member",
                                  avatarUrl: t.assigneeAvatar,
                                };
                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div>
                                          {!t.completed && canHandoverThisTask ? (
                                            <DropdownMenu>
                                              <DropdownMenuTrigger asChild>
                                                <button type="button" className="p-0 border-0 bg-transparent">
                                                  <Avatar className="kanban-card-avatar">
                                                    <AvatarImage src={sanitizeProfilePhoto(creator.avatarUrl) || undefined} />
                                                    <AvatarFallback>
                                                      {(creator.name || "U")[0]?.toUpperCase()}
                                                    </AvatarFallback>
                                                  </Avatar>
                                                </button>
                                              </DropdownMenuTrigger>
                                              <DropdownMenuContent align="start" className="w-52 bg-white border border-slate-200 rounded-xl p-1 shadow-lg">
                                                <div className="px-2 py-1.5 text-xs font-semibold text-slate-500">
                                                  Hand Over Task To
                                                </div>
                                                <DropdownMenuSeparator />
                                                {listCollaborators.map((c) => {
                                                  const isMe = c.id === authCtxRef.current?.userId;
                                                  return (
                                                    <DropdownMenuItem
                                                      key={c.id}
                                                      disabled={isMe}
                                                      onClick={() => handleAssignTask(t.id, c.id, c.name.replace(" (You)", ""))}
                                                      className="flex items-center gap-2 p-1.5 text-xs rounded cursor-pointer"
                                                    >
                                                      <Avatar className="w-5 h-5 text-[9px]">
                                                        <AvatarImage src={sanitizeProfilePhoto(c.avatarUrl) || undefined} />
                                                        <AvatarFallback className="bg-slate-900 text-white">
                                                          {(c.name || "U").charAt(0).toUpperCase()}
                                                        </AvatarFallback>
                                                      </Avatar>
                                                      <span>{c.name}</span>
                                                    </DropdownMenuItem>
                                                  );
                                                })}
                                              </DropdownMenuContent>
                                            </DropdownMenu>
                                          ) : (
                                            <Avatar className="kanban-card-avatar">
                                              <AvatarImage src={sanitizeProfilePhoto(creator.avatarUrl) || undefined} />
                                              <AvatarFallback>
                                                {(creator.name || "U")[0]?.toUpperCase()}
                                              </AvatarFallback>
                                            </Avatar>
                                          )}
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {!t.completed && canHandoverThisTask
                                          ? `Assigned to ${creator.name} • Click to hand over`
                                          : `Assigned to ${creator.name}`}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })()}

                              <div className="kanban-card-meta-text">
                                {t.dueDate && (
                                  <span className="kanban-card-due-date">
                                    {getDueLabel(t.dueDate)}
                                  </span>
                                )}
                                {t.createdAt && (
                                  <span className="kanban-card-timestamp">
                                    {formatTaskTime(t.updatedAt || t.createdAt)}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Right: Accept/Reject Buttons OR Stage Mover */}
                            {t.assignmentStatus === "pending" && t.assignedToId === authCtxRef.current?.userId ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleRespondAssignment(t.id, "reject");
                                  }}
                                  className="px-2 py-0.5 text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded hover:bg-rose-100"
                                >
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleRespondAssignment(t.id, "accept");
                                  }}
                                  className="px-2 py-0.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100"
                                >
                                  Accept
                                </button>
                              </div>
                            ) : canMoveThisTask && boardCols.length > 1 ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => e.stopPropagation()}
                                    className="kanban-stage-select"
                                  >
                                    <span>{col.name}</span>
                                    <ChevronDown size={11} />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="kanban-stage-mover-dropdown">
                                  {boardCols.map((c) => {
                                    const isCurrent = c.id === col.id;
                                    return (
                                      <button
                                        key={c.id}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!isCurrent) handleMoveTaskColumn(t.id, c.id);
                                        }}
                                        className={`kanban-stage-mover-item ${isCurrent ? "active" : ""}`}
                                      >
                                        {isCurrent ? (
                                          <>
                                            <Check size={12} strokeWidth={2.5} />
                                            <span>{c.name}</span>
                                          </>
                                        ) : (
                                          <span>→ {c.name}</span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Column Pinned Footer: Inline Composer OR Add Task Button */}
                {myPerms.canAddTasks && (
                  addingTaskColId === col.id ? (
                    <div className="kanban-col-inline-composer">
                      <textarea
                        autoFocus
                        rows={2}
                        placeholder="What needs to be done?"
                        value={colTaskText}
                        onChange={(e) => setColTaskText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddColumnTask(col.id);
                          }
                          if (e.key === "Escape") setAddingTaskColId(null);
                        }}
                        className="kanban-col-inline-input"
                      />

                      <div className="kanban-col-inline-controls">
                        <div className="kanban-priority-select-group">
                          {(["Low", "Medium", "High"] as ToDoPriority[]).map((p) => {
                            const isSelected = colTaskPriority === p;
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setColTaskPriority(p)}
                                className={`kanban-priority-option-btn ${isSelected ? "selected" : ""}`}
                              >
                                {p}
                              </button>
                            );
                          })}
                        </div>

                        <div className="kanban-col-inline-actions">
                          <button
                            type="button"
                            onClick={() => setAddingTaskColId(null)}
                            className="kanban-inline-cancel-btn"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={!colTaskText.trim()}
                            onClick={() => handleAddColumnTask(col.id)}
                            className="kanban-inline-submit-btn"
                          >
                            Add Card
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="kanban-col-footer">
                      <button
                        type="button"
                        onClick={() => {
                          setAddingTaskColId(col.id);
                          setColTaskText("");
                          setColTaskPriority("Low");
                        }}
                        className="kanban-col-footer-btn"
                      >
                        <Plus size={14} />
                        Add a task
                      </button>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* Right Collapsible Activity / Stage Sidebar on Desktop */}
        {showSidebar && (
          <aside className="scrollbar-thin">
            {renderSidebarContent()}
          </aside>
        )}
      </div>

      {/* Collaborator Management Dialog */}
      <Dialog open={manageCollabOpen} onOpenChange={setManageCollabOpen}>
        <DialogContent style={{ maxWidth: "520px", padding: "20px" }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: "16px", fontWeight: 600, color: "#0f172a" }}>
              {effectiveTeamId ? "Team Board Members & Access" : "Manage Collaborators"}
            </DialogTitle>
          </DialogHeader>

          <div className="kanban-dialog-body">
            <div>
              <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "10px" }}>
                {effectiveTeamId ? "Team Members & Access" : "Current Collaborators & Access"}
              </div>

              <div className="kanban-collab-list">
                {/* Creator */}
                <div className="kanban-collab-item">
                  <div className="kanban-collab-item-left">
                    <Avatar className="kanban-card-avatar" style={{ width: "28px", height: "28px" }}>
                      <AvatarImage src={sanitizeProfilePhoto(currentList.ownerAvatarUrl || allMembers.find((m) => m.id === currentList.ownerId)?.avatarUrl) || undefined} />
                      <AvatarFallback>
                        {(currentList.ownerName || "O")[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="kanban-collab-name">
                        {currentList.ownerId === authCtxRef.current?.userId ? `${currentList.ownerName} (You)` : currentList.ownerName}
                      </div>
                      <span className="kanban-role-pill admin" style={{ fontSize: "9.5px", padding: "0 5px" }}>
                        CREATOR
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 500 }}>Full Access</span>
                </div>

                {/* Added Collaborators */}
                {(!currentList.collaborators || currentList.collaborators.length === 0) ? (
                  <span style={{ fontSize: "12px", color: "#94a3b8", padding: "8px 0" }}>No other collaborators added yet</span>
                ) : (
                  currentList.collaborators.map((c) => {
                    const roleLabel = c.permissions?.role || "editor";
                    const avatar = c.avatarUrl || allMembers.find((m) => m.id === c.id)?.avatarUrl;
                    return (
                      <div
                        key={c.id}
                        className="kanban-collab-item"
                      >
                        <div className="kanban-collab-item-left">
                          <Avatar className="kanban-card-avatar" style={{ width: "28px", height: "28px" }}>
                            <AvatarImage src={sanitizeProfilePhoto(avatar) || undefined} />
                            <AvatarFallback>
                              {(c.name || "U").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="kanban-collab-name">{c.name}</div>
                            <span
                              className={`kanban-role-pill ${roleLabel}`}
                            >
                              {roleLabel.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <button
                            type="button"
                            disabled={managingCollabs}
                            onClick={() => {
                              setEditingCollab({
                                id: c.id,
                                name: c.name,
                                permissions: c.permissions || { ...DEFAULT_EDITOR_PERMISSIONS },
                              });
                            }}
                            className="kanban-col-menu-btn"
                            title="Edit Permissions"
                          >
                            <SettingsIcon size={16} />
                          </button>
                          {!effectiveTeamId && (
                            <button
                              type="button"
                              disabled={managingCollabs}
                              onClick={() => void handleRemoveCollaborator(c.id)}
                              className="kanban-col-menu-btn"
                              title="Remove Collaborator"
                            >
                              <DeleteOutlined size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {!effectiveTeamId && (
              <div className="kanban-collab-add-section">
                <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#475569" }}>
                  Add New Collaborator
                </div>
                <div className="kanban-collab-add-row">
                  {/* Custom Searchable Teammate Dropdown */}
                  <Popover open={collabPickerOpen} onOpenChange={setCollabPickerOpen} modal={false}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="kanban-collab-search-trigger"
                      >
                        {selectedCollabMember ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                            <Avatar style={{ width: "20px", height: "20px", flexShrink: 0 }}>
                              <AvatarImage src={selectedCollabMember.avatarUrl} />
                              <AvatarFallback style={{ fontSize: "10px", backgroundColor: "#0f172a", color: "#ffffff" }}>
                                {(selectedCollabMember.name || "U").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#0f172a", fontWeight: 550 }}>
                              {selectedCollabMember.name}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: "#94a3b8" }}>Select a teammate...</span>
                        )}
                        <ChevronDown size={13} style={{ color: "#94a3b8", marginLeft: "auto", flexShrink: 0 }} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="kanban-collab-search-popover"
                      data-scroll-lock-ignore="true"
                      onWheel={(e) => e.stopPropagation()}
                    >
                      <div className="kanban-collab-search-input-wrap">
                        <Search size={13} style={{ color: "#94a3b8", flexShrink: 0 }} />
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search teammates..."
                          value={collabSearchQuery}
                          onChange={(e) => setCollabSearchQuery(e.target.value)}
                          className="kanban-collab-search-input"
                        />
                        {collabSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setCollabSearchQuery("")}
                            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#94a3b8", display: "flex" }}
                          >
                            <CloseIcon size={12} />
                          </button>
                        )}
                      </div>

                      <div
                        className="kanban-collab-search-list scrollbar-thin"
                        data-scroll-lock-ignore="true"
                        onWheel={(e) => e.stopPropagation()}
                      >
                        {filteredAvailableMembers.length === 0 ? (
                          <div className="kanban-collab-search-empty">
                            {availableMembers.length === 0 ? "All teammates are already added" : "No teammates found"}
                          </div>
                        ) : (
                          filteredAvailableMembers.map((m) => {
                            const isSelected = collabToAdd === m.id;
                            return (
                              <div
                                key={m.id}
                                onClick={() => {
                                  setCollabToAdd(m.id);
                                  setCollabPickerOpen(false);
                                  setCollabSearchQuery("");
                                }}
                                className={`kanban-collab-search-item ${isSelected ? "selected" : ""}`}
                              >
                                <Avatar style={{ width: "24px", height: "24px", flexShrink: 0 }}>
                                  <AvatarImage src={m.avatarUrl} />
                                  <AvatarFallback style={{ fontSize: "10px", backgroundColor: "#0f172a", color: "#ffffff", fontWeight: 600 }}>
                                    {(m.name || "U").charAt(0).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="kanban-collab-search-name truncate">{m.name}</span>
                                {isSelected && <Check size={14} style={{ color: "#2563eb", marginLeft: "auto", flexShrink: 0 }} />}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>

                  <select
                    value={collabAddRole}
                    onChange={(e) => {
                      const nextRole = e.target.value as "admin" | "editor" | "viewer" | "custom";
                      setCollabAddRole(nextRole);
                      if (nextRole !== "custom") {
                        setCollabAddPermissions(getRolePresetPermissions(nextRole));
                      }
                    }}
                    className="kanban-collab-select role"
                  >
                    <option value="admin">Admin (Full)</option>
                    <option value="editor">Editor</option>
                    <option value="viewer">Viewer (Read Only)</option>
                    <option value="custom">Custom...</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => void handleAddCollaborator()}
                    disabled={!collabToAdd || managingCollabs}
                    className="kanban-header-btn"
                    style={{ height: "34px", padding: "0 14px", backgroundColor: "#0f172a", color: "#ffffff", borderColor: "#0f172a", flexShrink: 0 }}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setManageCollabOpen(false)}
              className="kanban-header-btn"
              style={{ height: "32px", padding: "0 16px" }}
            >
              Done
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Collaborator Granular Permissions Modal */}
      {editingCollab && (
        <Dialog open={Boolean(editingCollab)} onOpenChange={(open) => !open && setEditingCollab(null)}>
          <DialogContent style={{ maxWidth: "480px", padding: "20px" }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: "16px", fontWeight: 600, color: "#0f172a" }}>
                Permissions for {editingCollab.name}
              </DialogTitle>
            </DialogHeader>

            <div className="kanban-dialog-body">
              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>
                  Access Role Preset
                </label>
                <select
                  value={editingCollab.permissions.role || "custom"}
                  onChange={(e) => {
                    const role = e.target.value as "admin" | "editor" | "viewer" | "custom";
                    if (role === "custom") {
                      setEditingCollab((prev) => (prev ? { ...prev, permissions: { ...prev.permissions, role: "custom" } } : null));
                    } else {
                      setEditingCollab((prev) => (prev ? { ...prev, permissions: getRolePresetPermissions(role) } : null));
                    }
                  }}
                  className="kanban-stage-select"
                  style={{ width: "100%", height: "34px" }}
                >
                  <option value="admin">Admin (Full Access)</option>
                  <option value="editor">Editor (Standard)</option>
                  <option value="viewer">Viewer (Read Only)</option>
                  <option value="custom">Custom Access</option>
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "280px", overflowY: "auto", paddingRight: "4px" }}>
                {[
                  { key: "canAddTasks" as const, label: "Can Add Tasks" },
                  { key: "canRemoveTasks" as const, label: "Can Remove Tasks" },
                  { key: "canChangePriority" as const, label: "Can Change Priority" },
                  { key: "canMoveTasks" as const, label: "Can Move Tasks between Stages" },
                  { key: "canAddStages" as const, label: "Can Add Stages" },
                  { key: "canDuplicateStages" as const, label: "Can Duplicate Stages" },
                  { key: "canDeleteStages" as const, label: "Can Delete Stages" },
                  { key: "canRenameStages" as const, label: "Can Rename Stages" },
                  { key: "canConfigureStages" as const, label: "Can Configure Stage Categories" },
                ].map(({ key, label }) => (
                  <div key={key} className="kanban-perms-switch-row">
                    <span className="kanban-perms-switch-label">{label}</span>
                    <Switch
                      checked={Boolean(editingCollab.permissions[key])}
                      onCheckedChange={(checked) =>
                        setEditingCollab((prev) =>
                          prev
                            ? {
                                ...prev,
                                permissions: { ...prev.permissions, role: "custom", [key]: checked },
                              }
                            : null,
                        )
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setEditingCollab(null)}
                className="kanban-header-btn"
                style={{ height: "32px", padding: "0 12px" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={managingCollabs}
                onClick={() => {
                  if (editingCollab) {
                    void handleSaveCollaboratorPermissions(editingCollab.id, editingCollab.permissions);
                  }
                }}
                className="kanban-header-btn"
                style={{ height: "32px", padding: "0 16px", backgroundColor: "#0f172a", color: "#ffffff", borderColor: "#0f172a" }}
              >
                Save Changes
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Board Notes Slide-over Sheet */}
      <Sheet open={notesOpen} onOpenChange={setNotesOpen}>
        <SheetContent side="right" className="kanban-notes-sheet">
          <SheetHeader className="kanban-notes-header">
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div className="kanban-notes-header-icon">
                <FileText size={18} />
              </div>
              <SheetTitle style={{ fontSize: "16px", fontWeight: 600, color: "#0f172a", margin: 0 }}>
                Board Notes
              </SheetTitle>
            </div>
            <button
              type="button"
              onClick={() => setNotesOpen(false)}
              className="kanban-sheet-close-btn"
              title="Close notes"
            >
              <CloseIcon size={14} />
            </button>
          </SheetHeader>

          {/* Notes List & Filter Tabs */}
          <div className="kanban-notes-tabs">
            {(["all", "for_me", "general"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setNoteFilterTab(tab)}
                className={`kanban-notes-tab-btn ${noteFilterTab === tab ? "active" : ""}`}
              >
                {tab.replace("_", " ")}
              </button>
            ))}
          </div>

          <div className="kanban-notes-list">
            {loadingNotes ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 0", color: "#94a3b8" }}>
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : accessibleNotes.length === 0 ? (
              <div style={{ fontSize: "13px", color: "#94a3b8", textAlign: "center", padding: "32px 0" }}>
                No notes posted yet. Leave a note below!
              </div>
            ) : (
              accessibleNotes
                .filter((n) => {
                  if (noteFilterTab === "for_me") return n.targetCollaboratorId === authCtxRef.current?.userId;
                  if (noteFilterTab === "general") return !n.targetCollaboratorId;
                  return true;
                })
                .map((n) => (
                  <div
                    key={n.id}
                    className={`kanban-note-card ${n.isPinned ? "pinned" : ""}`}
                  >
                    <div className="kanban-note-card-top">
                      <div className="kanban-note-author-info">
                        <span>{n.authorName || "Member"}</span>
                        {n.targetCollaboratorName && (
                          <span className="kanban-note-target-tag">
                            → {n.targetCollaboratorName}
                          </span>
                        )}
                      </div>

                      <div className="kanban-note-card-actions">
                        <button
                          type="button"
                          onClick={() => handleTogglePinNote(n.id, Boolean(n.isPinned))}
                          className="kanban-note-btn"
                          title={n.isPinned ? "Unpin note" : "Pin note"}
                        >
                          {n.isPinned ? <PinOff size={13} /> : <Pin size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteNote(n.id)}
                          className="kanban-note-btn"
                          title="Delete note"
                        >
                          <DeleteOutlined size={13} />
                        </button>
                      </div>
                    </div>

                    <p className="kanban-note-content">{n.content}</p>

                    <div className="kanban-note-footer">
                      <span>{formatRelativeTime(n.createdAt)}</span>
                      {boardCols.length > 0 && myPerms.canAddTasks && (
                        <button
                          type="button"
                          onClick={() => boardCols[0] && handleConvertNoteToTask(n, boardCols[0].id)}
                          className="kanban-note-convert-btn"
                        >
                          Convert to Card →
                        </button>
                      )}
                    </div>
                  </div>
                ))
            )}
          </div>

          {/* Note Composer Footer */}
          <div className="kanban-note-composer-box">
            {!authCtxRef.current?.userId && (
              <input
                placeholder="Your Name (Required for guests)"
                value={noteGuestName}
                onChange={(e) => setNoteGuestName(e.target.value)}
                className="kanban-col-rename-input"
                style={{ border: guestNameTouched && !noteGuestName.trim() ? "1px solid #ef4444" : "1px solid #cbd5e1", borderRadius: "6px", padding: "6px 8px" }}
              />
            )}

            <div>
              <select
                value={noteTargetCollabId}
                onChange={(e) => setNoteTargetCollabId(e.target.value)}
                className="kanban-stage-select"
                style={{ width: "100%", height: "30px", fontSize: "11.5px" }}
              >
                <option value="all">Post to: All Collaborators</option>
                {listCollaborators.map((c) => (
                  <option key={c.id} value={c.id}>
                    Direct to: {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <textarea
                rows={2}
                placeholder="Write a note..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleAddNote();
                  }
                }}
                className="kanban-note-textarea"
              />
              <button
                type="button"
                onClick={() => void handleAddNote()}
                disabled={!noteContent.trim() || submittingNote || (!authCtxRef.current?.userId && !noteGuestName.trim())}
                className="kanban-note-send-btn"
              >
                {submittingNote ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                <span>Post Note</span>
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Floating Bulk Action Bar */}
      {selectedTaskIds.length > 0 && (
        <div className="kanban-bulk-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className="kanban-bulk-count-badge">
              {selectedTaskIds.length}
            </span>
            <span style={{ fontSize: "12.5px", fontWeight: 550 }}>
              {selectedTaskIds.length === 1 ? "1 card selected" : `${selectedTaskIds.length} cards selected`}
            </span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="kanban-bulk-btn"
              >
                <UserPlus size={14} />
                Handover Selected
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" style={{ minWidth: "200px" }}>
              <div style={{ padding: "6px 10px", fontSize: "11px", fontWeight: 600, color: "#64748b" }}>
                Bulk Handover ({selectedTaskIds.length} tasks)
              </div>
              <DropdownMenuSeparator />
              {listCollaborators.map((c) => {
                const isMe = c.id === authCtxRef.current?.userId;
                return (
                  <DropdownMenuItem
                    key={c.id}
                    disabled={isMe}
                    onClick={() => void handleBulkAssignTasks(c.id, c.name.replace(" (You)", ""))}
                  >
                    <Avatar className="kanban-card-avatar" style={{ marginRight: "8px" }}>
                      <AvatarImage src={sanitizeProfilePhoto(c.avatarUrl) || undefined} />
                      <AvatarFallback>
                        {(c.name || "U").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span>{c.name}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={() => {
              const eligibleIds = tasks
                .filter((t) => {
                  const isMyTask =
                    Boolean(authCtxRef.current?.userId && t.assigneeId === authCtxRef.current.userId);
                  const isBoardAdmin = isOwnerOrAdmin || myPerms.role === "admin";
                  const canHandoverThisTask = isBoardAdmin || (isMyTask && (myPerms.canAddTasks || myPerms.canMoveTasks));
                  return !t.completed && canHandoverThisTask;
                })
                .map((t) => t.id);

              if (selectedTaskIds.length === eligibleIds.length && eligibleIds.length > 0) {
                setSelectedTaskIds([]);
              } else {
                setSelectedTaskIds(eligibleIds);
              }
            }}
            className="kanban-bulk-btn"
          >
            {(() => {
              const eligibleIds = tasks
                .filter((t) => {
                  const isMyTask =
                    Boolean(authCtxRef.current?.userId && t.assigneeId === authCtxRef.current.userId);
                  const isBoardAdmin = isOwnerOrAdmin || myPerms.role === "admin";
                  const canHandoverThisTask = isBoardAdmin || (isMyTask && (myPerms.canAddTasks || myPerms.canMoveTasks));
                  return !t.completed && canHandoverThisTask;
                })
                .map((t) => t.id);
              return selectedTaskIds.length === eligibleIds.length && eligibleIds.length > 0 ? "Deselect All" : "Select All";
            })()}
          </button>

          <button
            type="button"
            onClick={() => setSelectedTaskIds([])}
            className="kanban-col-menu-btn"
            style={{ color: "#ffffff" }}
            title="Clear selection (Esc)"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

