import React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabase";
import {
  getToDoLists,
  getToDoItems,
  getToDoListActivity,
  createToDoList,
  setToDoListFavorite,
  createToDoItem,
  toggleToDoItem,
  updateToDoItemPriority,
  updateToDoItemText,
  updateToDoItemReminder,
  deleteToDoItem,
  deleteToDoList,
  addToDoListCollaborator,
  removeToDoListCollaborator,
  updateToDoListColumns,
  moveToDoItemColumn,
  formatRelativeTime,
  localDateOffset,
  DEFAULT_KANBAN_COLUMNS,
  getColumnType,
  type KanbanColumnType,
  type ToDoList,
  type ToDoItem,
  type ToDoPriority,
  type ToDoActivity,
  type KanbanColumn,
} from "../lib/lists";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
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
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "../components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { Calendar } from "../components/ui/calendar";
import {
  Plus,
  Star,
  Folder as FolderOutlined,
  Users as People,
  Search,
  Lock,
  ListFilter as FilterList,
  List as FormatListBulleted,
  Calendar as CalendarToday,
  ChevronDown as ArrowDropDown,
  X as CloseIcon,
  Flag as FlagIcon,
  SquarePen as EditOutlined,
  Check as CheckIcon,
  Trash2 as DeleteOutlined,
  BellRing as NotificationsActive,
  Bell as NotificationsNone,
  Columns3,
  PanelRightClose,
  PanelRightOpen,
  Loader2,
  Flame,
} from "lucide-react";
import { getDynamicPageTitle } from "../lib/tenant-brand";

export const Route = createFileRoute("/lists")({
  head: () => ({
    title: getDynamicPageTitle("TO-DO List"),
    meta: [
      {
        name: "description",
        content: "Organize tasks, projects, ideas, and checklists.",
      },
    ],
  }),
  component: ListsPage,
});

interface ToDoListCategory {
  category: "all" | "favorites" | "private" | "shared" | "archived";
}

const LIST_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#F43F5E", "#8B5CF6", "#06B6D4", "#0F172A"];

const LIST_PALETTE = [
  { color: "#3B82F6", label: "Electric Blue" },
  { color: "#10B981", label: "Emerald" },
  { color: "#F59E0B", label: "Sunset Amber" },
  { color: "#F43F5E", label: "Rose" },
  { color: "#8B5CF6", label: "Violet" },
  { color: "#06B6D4", label: "Cyan" },
  { color: "#0F172A", label: "Obsidian" },
];

const KANBAN_STAGE_PRESETS = [
  {
    name: "Standard (3)",
    columns: [
      { id: "col_1", name: "To Do", color: "#3B82F6" },
      { id: "col_2", name: "In Progress", color: "#F59E0B" },
      { id: "col_3", name: "Done", color: "#10B981" },
    ],
  },
  {
    name: "Sprint (4)",
    columns: [
      { id: "col_1", name: "Backlog", color: "#64748B" },
      { id: "col_2", name: "To Do", color: "#3B82F6" },
      { id: "col_3", name: "In Progress", color: "#F59E0B" },
      { id: "col_4", name: "Done", color: "#10B981" },
    ],
  },
  {
    name: "Review Pipeline (5)",
    columns: [
      { id: "col_1", name: "Ideas", color: "#8B5CF6" },
      { id: "col_2", name: "In Progress", color: "#3B82F6" },
      { id: "col_3", name: "In Review", color: "#F59E0B" },
      { id: "col_4", name: "QA / Testing", color: "#F43F5E" },
      { id: "col_5", name: "Shipped", color: "#10B981" },
    ],
  },
];

function ListsPage() {
  const navigate = useNavigate();

  const [activeCategory, setActiveCategory] = React.useState<ToDoListCategory["category"]>("all");
  const [lists, setLists] = React.useState<ToDoList[]>([]);
  const [selectedListId, setSelectedListId] = React.useState<string>("");
  const [tasks, setTasks] = React.useState<ToDoItem[]>([]);
  const [loadingLists, setLoadingLists] = React.useState(true);
  const [loadingTasks, setLoadingTasks] = React.useState(true);
  const [loadingDetails, setLoadingDetails] = React.useState(true);
  const authCtxRef = React.useRef<{ companyId: string; userId: string } | null>(null);

  // New list dialog state
  const [newListOpen, setNewListOpen] = React.useState(false);
  const [newListName, setNewListName] = React.useState("");
  const [newListColor, setNewListColor] = React.useState("#3B82F6");
  const [newListType, setNewListType] = React.useState<"favorites" | "private" | "shared">(
    "private",
  );
  const [newListFormat, setNewListFormat] = React.useState<"standard" | "kanban">("standard");
  const [newListCustomColumns, setNewListCustomColumns] = React.useState<KanbanColumn[]>(
    DEFAULT_KANBAN_COLUMNS,
  );
  const [newColInput, setNewColInput] = React.useState("");

  // New task state
  const [newTaskText, setNewTaskText] = React.useState("");
  const [newTaskTimeGroup, setNewTaskTimeGroup] = React.useState<"Today" | "Upcoming">("Today");
  const [newTaskPriority, setNewTaskPriority] = React.useState<ToDoPriority>("Medium");
  const [addTaskPanelOpen, setAddTaskPanelOpen] = React.useState(false);

  // Sub-tabs: 0 = All Tasks, 1 = Calendar
  const [activeSubTab, setActiveSubTab] = React.useState(0);

  // Right sidebar toggle state
  const [showSidebar, setShowSidebar] = React.useState(true);

  // Activity visible count for batch scrolling (10 per batch)
  const [activityVisibleCount, setActivityVisibleCount] = React.useState(10);

  const todayStr = localDateOffset(0);
  const tomorrowStr = localDateOffset(1);
  const getDueLabel = (d: string | null) => {
    if (!d) return "";
    if (d === todayStr) return "Today";
    if (d === tomorrowStr) return "Tomorrow";
    return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
  };
  const getDueMonthLabel = (d: string | null) =>
    d
      ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })
      : "";
  const getTimeGroup = (d: string | null): "Today" | "Upcoming" =>
    d && d <= todayStr ? "Today" : "Upcoming";

  const formatReminderLabel = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    if (dayKey === todayStr) return `Today ${time}`;
    if (dayKey === tomorrowStr) return `Tomorrow ${time}`;
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + ` ${time}`;
  };

  // Initial fetch: user -> company -> lists + items
  React.useEffect(() => {
    (async () => {
      setLoadingLists(true);
      setLoadingTasks(true);
      setLoadingDetails(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setLoadingLists(false);
          setLoadingTasks(false);
          setLoadingDetails(false);
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id, name")
          .eq("id", user.id)
          .single();
        if (!profile?.company_id) {
          setLoadingLists(false);
          setLoadingTasks(false);
          setLoadingDetails(false);
          return;
        }
        authCtxRef.current = { companyId: profile.company_id, userId: user.id };

        const pLists = getToDoLists(profile.company_id).then((listsData) => {
          setLists(listsData);
          setSelectedListId((prev) =>
            prev && listsData.some((l) => l.id === prev) ? prev : listsData[0]?.id || "",
          );
          setLoadingLists(false);
          setLoadingDetails(false);
          return listsData;
        });

        const pItems = getToDoItems(profile.company_id).then((itemsData) => {
          setTasks(itemsData);
          setLoadingTasks(false);
          return itemsData;
        });

        await Promise.all([pLists, pItems]);
      } catch (err) {
        console.error("Error loading to-do data:", err);
      } finally {
        setLoadingLists(false);
        setLoadingTasks(false);
        setLoadingDetails(false);
      }
    })();
  }, []);

  // Quiet refresh of lists (activity/collaborators/counts) after mutations
  const [allActivity, setAllActivity] = React.useState<ToDoActivity[]>([]);
  const [loadingActivity, setLoadingActivity] = React.useState(false);

  const refreshLists = async () => {
    const ctx = authCtxRef.current;
    if (!ctx) return;
    const listsData = await getToDoLists(ctx.companyId);
    setLists(listsData);
    setSelectedListId((prev) =>
      prev && listsData.some((l) => l.id === prev) ? prev : listsData[0]?.id || "",
    );
    if (selectedListId) {
      getToDoListActivity(selectedListId).then(setAllActivity);
    }
  };

  // Auto-fetch full activity for selected list so it scrolls in batches of 10
  React.useEffect(() => {
    setActivityVisibleCount(10);
    if (selectedListId) {
      setLoadingActivity(true);
      getToDoListActivity(selectedListId)
        .then((acts) => {
          setAllActivity(acts);
        })
        .finally(() => setLoadingActivity(false));
    } else {
      setAllActivity([]);
    }
  }, [selectedListId]);

  const selectedList = lists.find((l) => l.id === selectedListId) ||
    lists[0] || {
      id: "",
      companyId: "",
      name: "No List Selected",
      color: "#71717a",
      visibility: "private" as const,
      isFavorite: false,
      isArchived: false,
      ownerId: "",
      ownerName: "",
      createdAt: "",
      itemCount: 0,
      completedCount: 0,
      collaborators: [],
      activity: [],
    };

  const handleToggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let nextFavorite = false;
    setLists((prev) =>
      prev.map((l) => {
        if (l.id === id) {
          nextFavorite = !l.isFavorite;
          return { ...l, isFavorite: nextFavorite };
        }
        return l;
      }),
    );
    setToDoListFavorite(id, nextFavorite);
  };

  const [creatingList, setCreatingList] = React.useState(false);
  const handleCreateList = async () => {
    const ctx = authCtxRef.current;
    if (!newListName.trim() || !ctx || creatingList) return;
    setCreatingList(true);
    try {
      const chosenColor = newListColor || "#3B82F6";
      const colsToSave =
        newListFormat === "kanban"
          ? newListCustomColumns.filter((c) => c.name.trim().length > 0)
          : undefined;

      const created = await createToDoList({
        companyId: ctx.companyId,
        userId: ctx.userId,
        name: newListName.trim(),
        visibility: newListType === "shared" ? "shared" : "private",
        color: chosenColor,
        isFavorite: newListType === "favorites",
        listType: newListFormat,
        columns:
          colsToSave && colsToSave.length > 0
            ? colsToSave
            : DEFAULT_KANBAN_COLUMNS,
      });
      if (created) {
        setLists((prev) => [...prev, created]);
        setSelectedListId(created.id);
        toast.success(`List "${created.name}" created!`);
      }
      setNewListName("");
      setNewListColor("#3B82F6");
      setNewListFormat("standard");
      setNewListCustomColumns(DEFAULT_KANBAN_COLUMNS);
      setNewListOpen(false);
    } finally {
      setCreatingList(false);
    }
  };

  // No-list warning state
  const [noListAlertCount, setNoListAlertCount] = React.useState(0);
  const [noListRed, setNoListRed] = React.useState(false);
  const flashNoListWarning = () => {
    setNoListAlertCount((c) => c + 1);
    setNoListRed(true);
    window.setTimeout(() => setNoListRed(false), 1000);
  };

  const handleAddTask = async () => {
    const ctx = authCtxRef.current;
    if (!selectedList.id) {
      flashNoListWarning();
      return;
    }
    if (!newTaskText.trim() || !ctx) return;
    const created = await createToDoItem({
      companyId: ctx.companyId,
      listId: selectedList.id,
      userId: ctx.userId,
      text: newTaskText.trim(),
      priority: newTaskPriority,
      dueDate: newTaskTimeGroup === "Today" ? todayStr : tomorrowStr,
    });
    if (created) {
      setTasks((prev) => [...prev, created]);
      setLists((prev) =>
        prev.map((l) => (l.id === selectedList.id ? { ...l, itemCount: l.itemCount + 1 } : l)),
      );
      toast.success("Task added!");
      refreshLists();
    }
    setNewTaskText("");
  };

  const handleToggleTask = (taskId: string) => {
    const ctx = authCtxRef.current;
    const task = tasks.find((t) => t.id === taskId);
    if (!ctx || !task) return;
    const nextCompleted = !task.completed;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: nextCompleted } : t)));
    setLists((prev) =>
      prev.map((l) =>
        l.id === task.listId
          ? { ...l, completedCount: Math.max(0, l.completedCount + (nextCompleted ? 1 : -1)) }
          : l,
      ),
    );
    toggleToDoItem({
      itemId: taskId,
      completed: nextCompleted,
      companyId: ctx.companyId,
      listId: task.listId,
      userId: ctx.userId,
    }).then((ok) => {
      if (ok) refreshLists();
    });
  };

  const PRIORITY_CYCLE: Record<ToDoPriority, ToDoPriority> = {
    Low: "Medium",
    Medium: "High",
    High: "Low",
  };

  const handleCyclePriority = (taskId: string) => {
    const ctx = authCtxRef.current;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const next = PRIORITY_CYCLE[task.priority] || "Medium";
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, priority: next } : t)));
    updateToDoItemPriority(
      ctx
        ? {
            itemId: taskId,
            priority: next,
            companyId: ctx.companyId,
            listId: task.listId,
            userId: ctx.userId,
          }
        : { itemId: taskId, priority: next },
    ).then((ok) => {
      if (ok) refreshLists();
    });
  };

  // Inline task edit state
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null);
  const [editingText, setEditingText] = React.useState("");

  const handleStartEditTask = (task: ToDoItem) => {
    setEditingTaskId(task.id);
    setEditingText(task.text);
  };

  const handleCancelEditTask = () => {
    setEditingTaskId(null);
    setEditingText("");
  };

  // Reminder (device push) state
  const [reminderMenuTaskId, setReminderMenuTaskId] = React.useState<string | null>(null);
  const [pickerDate, setPickerDate] = React.useState<Date | null>(null);
  const [pickerHour, setPickerHour] = React.useState<number | null>(null);
  const [showCalendar, setShowCalendar] = React.useState(false);
  const [savingReminder, setSavingReminder] = React.useState(false);

  const HOUR_CHOICES = Array.from({ length: 12 }, (_, i) => i + 1);
  const pickerIsPM = pickerHour === null ? true : pickerHour >= 12;
  const displayedHour = pickerHour === null ? null : pickerHour % 12 || 12;
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const sameCalendarDay = (a: Date | null, b: Date | null | undefined) =>
    !!a &&
    !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const dayChipActive: "today" | "tomorrow" | "custom" | null = !pickerDate
    ? null
    : sameCalendarDay(pickerDate, startOfToday)
      ? "today"
      : sameCalendarDay(pickerDate, startOfTomorrow)
        ? "tomorrow"
        : "custom";

  const handleOpenReminderMenu = (task: ToDoItem) => {
    setReminderMenuTaskId(task.id);
    if (task.remindAt) {
      const existing = new Date(task.remindAt);
      setPickerDate(existing);
      setPickerHour(existing.getHours());
      setShowCalendar(
        !sameCalendarDay(existing, startOfToday) && !sameCalendarDay(existing, startOfTomorrow),
      );
    } else {
      setPickerDate(startOfToday);
      setPickerHour(9);
      setShowCalendar(false);
    }
  };

  const handleCloseReminderMenu = () => {
    setReminderMenuTaskId(null);
    setPickerDate(null);
    setPickerHour(null);
    setShowCalendar(false);
  };

  const handleSetReminder = async (taskId: string, remindAt: string | null) => {
    if (savingReminder) return;
    setSavingReminder(true);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, remindAt } : t)));
    await updateToDoItemReminder({ itemId: taskId, remindAt });
    setSavingReminder(false);
    toast.success(remindAt ? "Reminder set!" : "Reminder removed.");
    handleCloseReminderMenu();
  };

  const handleQuickReminder = (at: Date) => {
    if (!reminderMenuTaskId) return;
    void handleSetReminder(reminderMenuTaskId, at.toISOString());
  };

  const handlePickHourChoice = (h12: number) => {
    const base = h12 % 12;
    setPickerHour(pickerIsPM ? base + 12 : base);
  };

  const handleToggleAmPm = (pm: boolean) => {
    const base = pickerHour === null ? 9 : pickerHour % 12;
    setPickerHour((base % 12) + (pm ? 12 : 0));
  };

  const handleSavePickerReminder = () => {
    if (!reminderMenuTaskId || !pickerDate || pickerHour === null) return;
    const combined = new Date(pickerDate);
    combined.setHours(pickerHour, 0, 0, 0);
    void handleSetReminder(reminderMenuTaskId, combined.toISOString());
  };

  const handleSaveTaskEdit = async () => {
    const ctx = authCtxRef.current;
    const taskId = editingTaskId;
    const trimmed = editingText.trim();
    if (!ctx || !taskId || !trimmed) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (trimmed !== task.text) {
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, text: trimmed } : t)));
      const ok = await updateToDoItemText({
        itemId: taskId,
        text: trimmed,
        companyId: ctx.companyId,
        listId: task.listId,
        userId: ctx.userId,
      });
      if (ok) refreshLists();
    }
    handleCancelEditTask();
  };

  const handleDeleteTask = async (taskId: string) => {
    const ctx = authCtxRef.current;
    const task = tasks.find((t) => t.id === taskId);
    if (!ctx || !task) return;
    if (editingTaskId === taskId) handleCancelEditTask();
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setLists((prev) =>
      prev.map((l) =>
        l.id === task.listId
          ? {
              ...l,
              itemCount: Math.max(0, l.itemCount - 1),
              completedCount: task.completed ? Math.max(0, l.completedCount - 1) : l.completedCount,
            }
          : l,
      ),
    );
    const ok = await deleteToDoItem({
      itemId: taskId,
      companyId: ctx.companyId,
      listId: task.listId,
      userId: ctx.userId,
    });
    if (!ok) {
      const itemsData = await getToDoItems(ctx.companyId);
      setTasks(itemsData);
    }
    refreshLists();
  };

  // Manage collaborators dialog state
  const [manageCollabOpen, setManageCollabOpen] = React.useState(false);
  const [collabPickerOpen, setCollabPickerOpen] = React.useState(false);
  const [companyMembers, setCompanyMembers] = React.useState<
    { id: string; name: string; profile_photo?: string | null }[]
  >([]);
  const [collabToAdd, setCollabToAdd] = React.useState("");
  const [collabSearchTerm, setCollabSearchTerm] = React.useState("");
  const [managingCollabs, setManagingCollabs] = React.useState(false);

  const isListOwner = !!authCtxRef.current && selectedList.ownerId === authCtxRef.current.userId;

  const handleOpenManageCollaborators = async () => {
    setManageCollabOpen(true);
    setCollabPickerOpen(false);
    setCollabToAdd("");
    setCollabSearchTerm("");
    const ctx = authCtxRef.current;
    if (!ctx) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, name, profile_photo")
      .eq("company_id", ctx.companyId)
      .neq("id", ctx.userId);
    setCompanyMembers(data || []);
  };

  const availableMembers = companyMembers.filter(
    (m) =>
      m.id !== selectedList.ownerId &&
      !(selectedList.collaborators || []).some((c) => c.id === m.id),
  );
  const filteredMembers = availableMembers.filter((m) =>
    m.name.toLowerCase().includes(collabSearchTerm.trim().toLowerCase()),
  );

  const handleAddCollaborator = async () => {
    const ctx = authCtxRef.current;
    if (!ctx || !selectedList.id || !collabToAdd || managingCollabs) return;
    setManagingCollabs(true);
    const member = companyMembers.find((m) => m.id === collabToAdd);
    const ok = await addToDoListCollaborator({
      companyId: ctx.companyId,
      listId: selectedList.id,
      userId: collabToAdd,
      actorId: ctx.userId,
      action: member ? `added ${member.name} as a collaborator` : "added a collaborator",
    });
    if (ok) {
      await refreshLists();
      setCollabToAdd("");
      toast.success("Collaborator added!");
    }
    setManagingCollabs(false);
  };

  const handleRemoveCollaborator = async (userId: string) => {
    const ctx = authCtxRef.current;
    if (!ctx || !selectedList.id || managingCollabs) return;
    setManagingCollabs(true);
    const ok = await removeToDoListCollaborator(selectedList.id, userId);
    if (ok) {
      await refreshLists();
      toast.success("Collaborator removed.");
    }
    setManagingCollabs(false);
  };

  // Delete list state (two-click inline confirm)
  const [confirmDeleteList, setConfirmDeleteList] = React.useState(false);
  const [deletingList, setDeletingList] = React.useState(false);

  const handleDeleteListClick = () => {
    if (deletingList) return;
    if (!confirmDeleteList) {
      setConfirmDeleteList(true);
      window.setTimeout(() => setConfirmDeleteList(false), 3000);
      return;
    }
    void (async () => {
      setDeletingList(true);
      const ok = await deleteToDoList(selectedList.id);
      if (ok) {
        const remaining = lists.filter((l) => l.id !== selectedList.id);
        setLists(remaining);
        setSelectedListId(remaining[0]?.id || "");
        setTasks((prev) => prev.filter((t) => t.listId !== selectedList.id));
        setConfirmDeleteList(false);
        toast.success("List deleted.");
      }
      setDeletingList(false);
    })();
  };

  const renderTaskRow = (t: ToDoItem) => {
    const editing = editingTaskId === t.id;
    return (
      <div
        key={t.id}
        onClick={editing ? undefined : () => handleToggleTask(t.id)}
        className={`lists-task-row ${t.completed ? "completed" : ""}`}
      >
        {/* Priority Checkbox: Shows priority icon when pending, animates & pops checkmark on completion */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={
                t.completed
                  ? "Mark as incomplete"
                  : `Complete task (Priority: ${t.priority || "Low"}, Right-click to cycle)`
              }
              onClick={(e) => {
                e.stopPropagation();
                handleToggleTask(t.id);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!t.completed) handleCyclePriority(t.id);
              }}
              className={`lists-task-checkbox ${t.completed ? "checked" : (t.priority || "Low").toLowerCase()}`}
            >
              {t.completed ? (
                <CheckIcon size={13} strokeWidth={2.6} className="lists-check-icon-pop" />
              ) : (
                <Flame size={12} strokeWidth={2.2} className="lists-priority-checkbox-flame" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {t.completed
              ? "Completed (Click to undo)"
              : `Priority: ${t.priority || "Low"} (Click to complete • Right-click to cycle)`}
          </TooltipContent>
        </Tooltip>

        {/* Middle Content: Title on Top, Priority Dash + Reminder Below */}
        <div className="lists-task-content">
          {editing ? (
            <div className="lists-task-edit-wrap" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                type="text"
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveTaskEdit();
                  if (e.key === "Escape") handleCancelEditTask();
                }}
                className="lists-task-edit-input"
              />
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                <button
                  type="button"
                  disabled={!editingText.trim()}
                  onClick={() => void handleSaveTaskEdit()}
                  className="lists-btn-primary"
                  style={{ height: "24px", padding: "0 10px", fontSize: "11px" }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleCancelEditTask}
                  className="lists-btn-secondary"
                  style={{ height: "24px", padding: "0 10px", fontSize: "11px" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Row 1: Task Title */}
              <span className={`lists-task-text ${t.completed ? "completed" : ""}`}>
                {t.text}
              </span>

              {/* Row 2: Bottom Sub-Row (Left: Reminders, Right: Actions + Avatar) */}
              <div className="lists-task-bottom-row">
                <div className="lists-task-meta-left">
                  {!t.completed && t.remindAt && (
                    <span className="lists-reminder-pill">
                      <NotificationsActive size={10} strokeWidth={1.5} />
                      {formatReminderLabel(t.remindAt)}
                    </span>
                  )}
                </div>

                <div className="lists-task-right">
                  <div className="lists-task-actions">
                    {/* Reminder Popover */}
                    <Popover
                      open={reminderMenuTaskId === t.id}
                      onOpenChange={(open) => {
                        if (!open) {
                          handleCloseReminderMenu();
                        } else {
                          handleOpenReminderMenu(t);
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label={t.remindAt ? "Edit reminder" : "Set reminder"}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (reminderMenuTaskId === t.id) {
                              handleCloseReminderMenu();
                            } else {
                              handleOpenReminderMenu(t);
                            }
                          }}
                          className="lists-row-action-btn"
                        >
                          {t.remindAt ? (
                            <NotificationsActive size={15} strokeWidth={1.75} style={{ color: "#2563eb" }} />
                          ) : (
                            <NotificationsNone size={15} strokeWidth={1.75} />
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        side="bottom"
                        sideOffset={8}
                        onClick={(e) => e.stopPropagation()}
                        className="lists-reminder-popover-content"
                        style={{ width: 330, padding: "18px 16px", borderRadius: 16 }}
                      >
                        <div className="lists-reminder-modal-body">
                          {/* QUICK SECTION */}
                          <div className="lists-reminder-section">
                            <div className="lists-reminder-label">QUICK</div>
                            <div className="lists-reminder-quick-grid">
                              {[
                                ...[1, 2, 3, 4, 5, 6].map((mins) => ({
                                  label: mins === 1 ? "In 1 min" : `In ${mins} mins`,
                                  at: new Date(Date.now() + mins * 60_000),
                                })),
                                ...[1, 2, 3, 4, 5, 6].map((hrs) => ({
                                  label: hrs === 1 ? "In 1 hr" : `In ${hrs} hrs`,
                                  at: new Date(Date.now() + hrs * 3600_000),
                                })),
                              ].map((q) => (
                                <button
                                  key={q.label}
                                  type="button"
                                  onClick={() => handleQuickReminder(q.at)}
                                  className="lists-reminder-quick-btn"
                                >
                                  {q.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* CUSTOM SECTION */}
                          <div className="lists-reminder-section" style={{ marginTop: 14 }}>
                            <div className="lists-reminder-label">CUSTOM</div>

                            {/* Date Pills */}
                            <div className="lists-reminder-date-pills">
                              {(["today", "tomorrow"] as const).map((chip) => (
                                <button
                                  key={chip}
                                  type="button"
                                  onClick={() => {
                                    setPickerDate(
                                      chip === "today" ? new Date(startOfToday) : new Date(startOfTomorrow),
                                    );
                                    setShowCalendar(false);
                                  }}
                                  className={`lists-reminder-date-pill ${dayChipActive === chip ? "active" : ""}`}
                                >
                                  {chip === "today" ? "Today" : "Tomorrow"}
                                </button>
                              ))}
                              <button
                                type="button"
                                onClick={() => setShowCalendar((v) => !v)}
                                className={`lists-reminder-date-pill ${dayChipActive === "custom" ? "active" : ""}`}
                              >
                                {dayChipActive === "custom" && pickerDate
                                  ? pickerDate.toLocaleDateString(undefined, { day: "numeric", month: "short" })
                                  : "Pick date"}
                              </button>
                            </div>

                            {/* Inline Calendar if Pick Date selected */}
                            {showCalendar && (
                              <div className="lists-reminder-inline-calendar">
                                <Calendar
                                  mode="single"
                                  selected={pickerDate ?? undefined}
                                  onSelect={(d) => setPickerDate(d ?? null)}
                                  disabled={{ before: startOfToday }}
                                />
                              </div>
                            )}

                            {/* 1-12 Hour Grid */}
                            <div className="lists-reminder-hours-grid">
                              {HOUR_CHOICES.map((h12) => (
                                <button
                                  key={h12}
                                  type="button"
                                  onClick={() => handlePickHourChoice(h12)}
                                  className={`lists-reminder-hour-btn ${displayedHour === h12 ? "active" : ""}`}
                                >
                                  {h12}
                                </button>
                              ))}
                            </div>

                            {/* AM / PM Row */}
                            <div className="lists-reminder-ampm-row">
                              {(["AM", "PM"] as const).map((label) => {
                                const active = pickerIsPM === (label === "PM");
                                return (
                                  <button
                                    key={label}
                                    type="button"
                                    onClick={() => handleToggleAmPm(label === "PM")}
                                    className={`lists-reminder-ampm-btn ${active ? "active" : ""}`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Set Reminder Button */}
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
                              <button
                                type="button"
                                disabled={!pickerDate || pickerHour === null || savingReminder}
                                onClick={handleSavePickerReminder}
                                className="lists-reminder-submit-btn"
                              >
                                Set Reminder
                              </button>

                              {t.remindAt && (
                                <button
                                  type="button"
                                  onClick={() => void handleSetReminder(t.id, null)}
                                  className="lists-reminder-clear-btn"
                                >
                                  Remove Reminder
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>

                    {!t.completed && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Priority: ${t.priority || "Low"} (Click to cycle)`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCyclePriority(t.id);
                            }}
                            className={`lists-row-action-btn ${(t.priority || "Low").toLowerCase()}`}
                          >
                            <Flame size={15} strokeWidth={1.75} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Priority: {t.priority || "Low"} (Click to change)
                        </TooltipContent>
                      </Tooltip>
                    )}

                    <button
                      type="button"
                      aria-label="Edit task"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartEditTask(t);
                      }}
                      className="lists-row-action-btn"
                    >
                      <EditOutlined size={15} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete task"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteTask(t.id);
                      }}
                      className="lists-row-action-btn delete"
                    >
                      <DeleteOutlined size={15} strokeWidth={1.75} />
                    </button>
                  </div>

                  {t.assigneeName && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Avatar className="lists-task-avatar">
                          <AvatarImage src={t.assigneeAvatar} />
                          <AvatarFallback>{(t.assigneeName || "?").charAt(0)}</AvatarFallback>
                        </Avatar>
                      </TooltipTrigger>
                      <TooltipContent>{t.assigneeName}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const filteredLists = lists.filter((l) => {
    if (activeCategory === "all") return !l.isArchived;
    if (activeCategory === "favorites") return l.isFavorite && !l.isArchived;
    if (activeCategory === "archived") return l.isArchived;
    return l.visibility === activeCategory && !l.isArchived;
  });

  const activeTasks = tasks.filter((t) => t.listId === selectedList.id);
  const todayTasks = activeTasks.filter((t) => getTimeGroup(t.dueDate) === "Today");
  const upcomingTasks = activeTasks.filter((t) => getTimeGroup(t.dueDate) === "Upcoming");

  const progressPercent =
    selectedList.itemCount > 0
      ? Math.round((selectedList.completedCount / selectedList.itemCount) * 100)
      : 0;

  return (
    <TooltipProvider>
      <Layout activeTab="Lists" disablePadding>
        <div className="lists-container">
          {/* Top Header Bar */}
          <div className="lists-top-bar">
            {/* Left: Title & Category Filter */}
            <div className="lists-top-left">
              <span className="lists-page-title">
                To-Do Lists
              </span>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="lists-filter-trigger"
                  >
                    <FilterList size={13} strokeWidth={1.5} />
                    <span>
                      {activeCategory === "all"
                        ? "All Lists"
                        : activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1)}
                    </span>
                    <ArrowDropDown size={13} strokeWidth={1.5} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="lists-dropdown-menu">
                  {[
                    { key: "all", label: "All Lists", icon: FilterList },
                    { key: "favorites", label: "Favorites", icon: Star },
                    { key: "private", label: "Private", icon: Lock },
                    { key: "shared", label: "Shared with team", icon: People },
                    { key: "archived", label: "Archived", icon: FolderOutlined },
                  ].map((item) => {
                    const IconComp = item.icon;
                    const isActive = activeCategory === item.key;
                    return (
                      <DropdownMenuItem
                        key={item.key}
                        onClick={() => setActiveCategory(item.key as ToDoListCategory["category"])}
                        className={`lists-dropdown-item ${isActive ? "active" : ""}`}
                      >
                        <div className="lists-dropdown-item-left">
                          <IconComp size={13} strokeWidth={1.5} />
                          <span>{item.label}</span>
                        </div>
                        {isActive && <CheckIcon size={12} strokeWidth={2.5} className="lists-dropdown-checkmark" />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Center: Selected List Name (desktop) */}
            {selectedList.id && (
              <div className="lists-top-center">
                <span className="lists-selected-title">
                  {selectedList.name}
                </span>
                {selectedList.visibility === "private" ? (
                  <span className="lists-vis-pill private">
                    <Lock size={11} strokeWidth={1.5} />
                    Private
                  </span>
                ) : selectedList.visibility === "shared" ? (
                  <span className="lists-vis-pill shared">
                    <People size={11} strokeWidth={1.5} />
                    Shared
                  </span>
                ) : null}
              </div>
            )}

            {/* Right: View Toggle + Sidebar Toggle */}
            <div className="lists-top-right">
              {selectedList.id && (
                <span className="lists-task-count-badge">
                  <strong>{activeTasks.length}</strong>{" "}
                  {activeTasks.length === 1 ? "task" : "tasks"}
                </span>
              )}

              {selectedList.id && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="lists-filter-trigger"
                    >
                      {activeSubTab === 0 ? (
                        <FormatListBulleted size={13} strokeWidth={1.5} />
                      ) : (
                        <CalendarToday size={13} strokeWidth={1.5} />
                      )}
                      <span>{activeSubTab === 0 ? "All Tasks" : "Calendar"}</span>
                      <ArrowDropDown size={13} strokeWidth={1.5} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="lists-dropdown-menu">
                    {[
                      { key: 0, label: "All Tasks", icon: FormatListBulleted },
                      { key: 1, label: "Calendar", icon: CalendarToday },
                    ].map((item) => {
                      const IconComp = item.icon;
                      const isActive = activeSubTab === item.key;
                      return (
                        <DropdownMenuItem
                          key={item.key}
                          onClick={() => setActiveSubTab(item.key)}
                          className={`lists-dropdown-item ${isActive ? "active" : ""}`}
                        >
                          <div className="lists-dropdown-item-left">
                            <IconComp size={13} strokeWidth={1.5} />
                            <span>{item.label}</span>
                          </div>
                          {isActive && <CheckIcon size={12} strokeWidth={2.5} className="lists-dropdown-checkmark" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Right Sidebar Toggle Button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setShowSidebar((s) => !s)}
                    className="lists-icon-btn"
                  >
                    {showSidebar ? (
                      <PanelRightClose size={14} strokeWidth={1.5} />
                    ) : (
                      <PanelRightOpen size={14} strokeWidth={1.5} />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {showSidebar ? "Hide sidebar" : "Show sidebar"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* 3-Column Core Workspace */}
          <div className="lists-workspace-grid">
            {/* COLUMN 1: Lists Selector Panel */}
            <div className="lists-col-sidebar">
              {/* Column 1 Body: List items */}
              <div className="lists-nav-scroll scrollbar-none">
                {loadingLists ? (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="lists-nav-group-header">
                      <div className="lists-nav-group-title">
                        <FormatListBulleted size={13} strokeWidth={2} />
                        <span>Lists</span>
                      </div>
                      <div className="lists-shimmer-box" style={{ height: 14, width: 20, borderRadius: 999 }} />
                    </div>
                    {[0, 1].map((i) => (
                      <div key={i} className="lists-skeleton-nav-item">
                        <div className="lists-shimmer-box" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                          <div className="lists-shimmer-box" style={{ height: 13, width: i % 2 === 0 ? '68%' : '52%', borderRadius: 4 }} />
                          <div className="lists-shimmer-box" style={{ height: 10, width: '35%', borderRadius: 4 }} />
                        </div>
                      </div>
                    ))}
                    <div className="lists-nav-group-header" style={{ marginTop: 8 }}>
                      <div className="lists-nav-group-title">
                        <Columns3 size={13} strokeWidth={2} />
                        <span>Kanban Boards</span>
                      </div>
                      <div className="lists-shimmer-box" style={{ height: 14, width: 20, borderRadius: 999 }} />
                    </div>
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="lists-skeleton-nav-item">
                        <div className="lists-shimmer-box" style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0 }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                          <div className="lists-shimmer-box" style={{ height: 13, width: i % 2 === 0 ? '68%' : '52%', borderRadius: 4 }} />
                          <div className="lists-shimmer-box" style={{ height: 10, width: '35%', borderRadius: 4 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredLists.length === 0 ? (
                  <div className="lists-empty-state">
                    <div className="lists-empty-icon">
                      <FormatListBulleted size={18} strokeWidth={1.5} />
                    </div>
                    <p className="lists-empty-title">
                      No lists found
                    </p>
                    <p className="lists-empty-desc">
                      Create a new list to organize your tasks.
                    </p>
                  </div>
                ) : (
                  (() => {
                    const sortStarredFirst = (items: ToDoList[]) => {
                      return [...items].sort((a, b) => {
                        if (a.isFavorite === b.isFavorite) return 0;
                        return a.isFavorite ? -1 : 1;
                      });
                    };

                    const standardLists = sortStarredFirst(filteredLists.filter((l) => l.listType !== "kanban"));
                    const kanbanBoards = sortStarredFirst(filteredLists.filter((l) => l.listType === "kanban"));

                    const renderItem = (item: ToDoList) => {
                      const isActive = item.id === selectedListId;
                      const isKanban = item.listType === "kanban";
                      const kanbanCols = item.columns || [];

                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            if (isKanban) {
                              navigate({ to: "/kanban", search: { listId: item.id } });
                              return;
                            }
                            setSelectedListId(item.id);
                            setActiveSubTab(0);
                          }}
                          className={`lists-nav-item ${isActive && !isKanban ? "active" : ""}`}
                        >
                          <div className="lists-nav-left">
                            <div className="lists-nav-icon">
                              {isKanban ? (
                                <Columns3 size={18} strokeWidth={1.5} />
                              ) : (
                                <FormatListBulleted size={18} strokeWidth={1.5} />
                              )}
                            </div>
                            <div className="lists-nav-info">
                              <p className="lists-nav-title">
                                {item.name}
                              </p>
                              <p className="lists-nav-meta">
                                {item.itemCount} {item.itemCount === 1 ? "task" : "tasks"}
                                {isKanban && kanbanCols.length > 0 && ` • ${kanbanCols.length} stages`}
                              </p>
                            </div>
                          </div>

                          <div className="lists-nav-actions">
                            <button
                              type="button"
                              onClick={(e) => handleToggleFavorite(item.id, e)}
                              className={`lists-nav-fav-btn ${item.isFavorite ? "active" : ""}`}
                              title={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
                            >
                              <Star
                                size={16}
                                strokeWidth={1.75}
                                fill={item.isFavorite ? "#eab308" : "none"}
                                color={item.isFavorite ? "#eab308" : "#64748b"}
                              />
                            </button>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <>
                        {/* Section 1: Standard Lists */}
                        {standardLists.length > 0 && (
                          <div className="lists-nav-group">
                            <div className="lists-nav-group-header">
                              <div className="lists-nav-group-title">
                                <FormatListBulleted size={13} strokeWidth={2} />
                                <span>Lists</span>
                              </div>
                              <span className="lists-nav-group-badge">{standardLists.length}</span>
                            </div>
                            {standardLists.map(renderItem)}
                          </div>
                        )}

                        {/* Section 2: Kanban Boards */}
                        {kanbanBoards.length > 0 && (
                          <div className="lists-nav-group">
                            <div className="lists-nav-group-header">
                              <div className="lists-nav-group-title">
                                <Columns3 size={13} strokeWidth={2} />
                                <span>Kanban Boards</span>
                              </div>
                              <span className="lists-nav-group-badge">{kanbanBoards.length}</span>
                            </div>
                            {kanbanBoards.map(renderItem)}
                          </div>
                        )}
                      </>
                    );
                  })()
                )}
              </div>

              {/* Column 1 Footer: Pin "+ New List" */}
              <div className="lists-nav-footer">
                <button
                  type="button"
                  onClick={() => setNewListOpen(true)}
                  className="lists-new-list-btn"
                >
                  + New List
                </button>
              </div>
            </div>

            {/* COLUMN 2: Task Checklist */}
            <div className="lists-col-main">
              {/* Column 2 Body: Tasks area */}
              <div className="lists-main-scroll scrollbar-none">
                {loadingTasks ? (
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                    {/* Section Header */}
                    <div className="lists-section-header">
                      <span>TODAY</span>
                      <div className="lists-shimmer-box" style={{ height: 14, width: 48, borderRadius: 4 }} />
                    </div>
                    {/* Task Rows Shimmer */}
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="lists-skeleton-task-row">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0 }}>
                          <div className="lists-shimmer-box" style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0 }} />
                          <div className="lists-shimmer-box" style={{ height: 14, width: `${75 - (i % 4) * 12}%`, borderRadius: 4 }} />
                        </div>
                        <div className="lists-shimmer-box" style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }} />
                      </div>
                    ))}
                  </div>
                ) : !selectedList.id ? (
                  <div className="lists-empty-state">
                    <p
                      key={noListAlertCount}
                      className={`lists-empty-title ${noListRed ? "underline" : ""}`}
                    >
                      Select or create a list to start organizing tasks.
                    </p>
                  </div>
                ) : activeSubTab === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {/* Inline Task Composer if open */}
                    {addTaskPanelOpen && (
                      <div className="lists-quick-composer">
                        <input
                          type="text"
                          autoFocus
                          placeholder="What needs to be done?"
                          value={newTaskText}
                          onChange={(e) => setNewTaskText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddTask();
                            if (e.key === "Escape") setAddTaskPanelOpen(false);
                          }}
                          className="lists-composer-input"
                        />
                        <div className="lists-composer-controls">
                          <div className="lists-composer-shortcuts">
                            <button
                              type="button"
                              onClick={() => setNewTaskTimeGroup((g) => (g === "Today" ? "Upcoming" : "Today"))}
                              className="lists-composer-pill"
                            >
                              <CalendarToday size={13} strokeWidth={2} />
                              {newTaskTimeGroup}
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewTaskPriority((p) => PRIORITY_CYCLE[p])}
                              className={`lists-composer-pill ${newTaskPriority.toLowerCase()}`}
                            >
                              <Flame size={13} strokeWidth={2} />
                              {newTaskPriority}
                            </button>
                          </div>
                          <div className="lists-composer-actions">
                            <button
                              type="button"
                              onClick={() => setAddTaskPanelOpen(false)}
                              className="lists-btn-ghost"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleAddTask}
                              disabled={!newTaskText.trim()}
                              className="lists-btn-primary"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TODAY TASKS */}
                    {todayTasks.length > 0 && (
                      <div className="lists-task-group">
                        <div className="lists-section-header">
                          <span>TODAY</span>
                          <span className="lists-section-badge">
                            {todayTasks.length} {todayTasks.length === 1 ? "task" : "tasks"}
                          </span>
                        </div>
                        <div className="lists-task-items-list">
                          {todayTasks.map((t) => renderTaskRow(t))}
                        </div>
                      </div>
                    )}

                    {/* UPCOMING TASKS */}
                    {upcomingTasks.length > 0 && (
                      <div className="lists-task-group">
                        <div className="lists-section-header">
                          <span>UPCOMING</span>
                          <span className="lists-section-badge">
                            {upcomingTasks.length} {upcomingTasks.length === 1 ? "task" : "tasks"}
                          </span>
                        </div>
                        <div className="lists-task-items-list">
                          {upcomingTasks.map((t) => renderTaskRow(t))}
                        </div>
                      </div>
                    )}

                    {activeTasks.length === 0 && (
                      <div className="lists-empty-state">
                        <p className="lists-empty-desc">
                          No tasks in this list yet. Click &quot;+ Add a task&quot; below.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* CALENDAR AGENDA VIEW */
                  <div className="lists-calendar-view">
                    <span className="lists-calendar-header">
                      Schedule Agenda
                    </span>
                    {activeTasks.map((t) => (
                      <div
                        key={t.id}
                        className="lists-calendar-card"
                      >
                        <div className="lists-calendar-date-badge">
                          <p className="lists-calendar-date-day">
                            {getDueLabel(t.dueDate)}
                          </p>
                          <p className="lists-calendar-date-month">
                            {getDueMonthLabel(t.dueDate)}
                          </p>
                        </div>
                        <div
                          className={`lists-calendar-bar ${t.completed ? "completed" : ""}`}
                        />
                        <div className="lists-calendar-card-body">
                          <p
                            className={`lists-calendar-card-title ${t.completed ? "completed" : ""}`}
                          >
                            {t.text}
                          </p>
                          <p className="lists-calendar-card-meta">
                            Assigned to {t.assigneeName || "Unassigned"}
                          </p>
                        </div>
                        {t.priority === "High" && (
                          <span className="lists-priority-flame-badge" title="High Priority">
                            <Flame size={12} strokeWidth={2.2} />
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Floating Action Button (FAB): Add Task in bottom-right corner */}
              {selectedList.id && !addTaskPanelOpen && (
                <button
                  type="button"
                  onClick={() => setAddTaskPanelOpen(true)}
                  className="lists-fab-add-task"
                  title="Add a task"
                >
                  <Plus size={16} strokeWidth={2.4} />
                  <span>Add a task</span>
                </button>
              )}
            </div>

            {/* COLUMN 3: Right Sidebar (Details, Collaborators, Activity) */}
            {showSidebar && (
              <div className="lists-col-details scrollbar-none">
                {loadingDetails ? (
                  <>
                    {/* List Details Card Skeleton with Fixed Labels */}
                    <div className="lists-details-card">
                      <span className="lists-details-card-title">
                        List Details
                      </span>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div className="lists-details-stat-row">
                          <span>Creator</span>
                          <div className="lists-shimmer-box" style={{ height: 13, width: 60, borderRadius: 4 }} />
                        </div>

                        <div className="lists-details-stat-row">
                          <span>Created on</span>
                          <div className="lists-shimmer-box" style={{ height: 13, width: 85, borderRadius: 4 }} />
                        </div>

                        <div className="lists-details-stat-row">
                          <span>Tasks</span>
                          <div className="lists-shimmer-box" style={{ height: 13, width: 24, borderRadius: 4 }} />
                        </div>

                        <div className="lists-details-stat-row">
                          <span>Completed</span>
                          <div className="lists-shimmer-box" style={{ height: 13, width: 24, borderRadius: 4 }} />
                        </div>

                        <div className="lists-details-stat-row">
                          <span>Progress</span>
                          <div className="lists-shimmer-box" style={{ height: 13, width: 35, borderRadius: 4 }} />
                        </div>

                        <div className="lists-progress-track" style={{ marginTop: 2 }}>
                          <div className="lists-shimmer-box" style={{ height: 4, width: '100%', borderRadius: 999 }} />
                        </div>
                      </div>
                    </div>

                    {/* Collaborators Card Skeleton with Fixed Header */}
                    <div className="lists-details-card">
                      <div className="lists-details-card-header">
                        <span className="lists-details-card-title">
                          Collaborators
                        </span>
                        <span className="lists-details-manage-btn" style={{ opacity: 0.5, pointerEvents: 'none' }}>
                          Manage
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        {[0, 1, 2].map((av) => (
                          <div key={av} className="lists-shimmer-box" style={{ width: 28, height: 28, borderRadius: '50%' }} />
                        ))}
                      </div>
                    </div>

                    {/* Recent Activity Card Skeleton with Fixed Header */}
                    <div className="lists-details-card">
                      <div className="lists-details-card-header">
                        <span className="lists-details-card-title">
                          Recent Activity
                        </span>
                        <div className="lists-shimmer-box" style={{ height: 12, width: 42, borderRadius: 3 }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                        {[0, 1, 2, 3].map((item) => (
                          <div key={item} className="lists-skeleton-activity-row">
                            <div className="lists-activity-bullet" style={{ flexShrink: 0 }} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                              <div className="lists-shimmer-box" style={{ height: 12, width: `${85 - item * 12}%`, borderRadius: 3 }} />
                              <div className="lists-shimmer-box" style={{ height: 9, width: 50, borderRadius: 2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : selectedList.id ? (
                  <>
                    {/* List Details Card */}
                    <div className="lists-details-card">
                      <span className="lists-details-card-title">
                        List Details
                      </span>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div className="lists-details-stat-row">
                          <span>Creator</span>
                          <span className="lists-details-stat-val">
                            {selectedList.ownerId === authCtxRef.current?.userId ? "You" : selectedList.ownerName}
                          </span>
                        </div>

                        <div className="lists-details-stat-row">
                          <span>Created on</span>
                          <span className="lists-details-stat-val">
                            {selectedList.createdAt
                              ? new Date(selectedList.createdAt).toLocaleDateString(undefined, {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "-"}
                          </span>
                        </div>

                        <div className="lists-details-stat-row">
                          <span>Tasks</span>
                          <span className="lists-details-stat-val">
                            {selectedList.itemCount}
                          </span>
                        </div>

                        <div className="lists-details-stat-row">
                          <span>Completed</span>
                          <span className="lists-details-stat-val">
                            {selectedList.completedCount}
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                          <div className="lists-details-stat-row">
                            <span>Progress</span>
                            <span className="lists-details-stat-val">{progressPercent}%</span>
                          </div>
                          <div className="lists-progress-track">
                            <div
                              className="lists-progress-fill"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {isListOwner && selectedList.id && (
                        <button
                          type="button"
                          disabled={deletingList}
                          onClick={handleDeleteListClick}
                          className="lists-delete-list-btn"
                          style={confirmDeleteList ? { color: '#dc2626' } : {}}
                        >
                          <DeleteOutlined size={12} strokeWidth={1.5} />
                          {deletingList
                            ? "Deleting..."
                            : confirmDeleteList
                            ? "Click again to confirm"
                            : "Delete list"}
                        </button>
                      )}
                    </div>

                    {/* Collaborators Card */}
                    <div className="lists-details-card">
                      <div className="lists-details-card-header">
                        <span className="lists-details-card-title">
                          Collaborators
                        </span>
                        {isListOwner && (
                          <button
                            type="button"
                            onClick={() => void handleOpenManageCollaborators()}
                            className="lists-btn-ghost"
                            style={{ height: 22, padding: '0 6px', fontSize: 11 }}
                          >
                            Manage
                          </button>
                        )}
                      </div>

                      <div className="lists-avatars-row">
                        {/* Creator Avatar */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Avatar style={{ width: 28, height: 28, fontSize: 11 }}>
                              <AvatarFallback>
                                {(selectedList.ownerName || "C")[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </TooltipTrigger>
                          <TooltipContent>
                            {selectedList.ownerName} (Creator)
                          </TooltipContent>
                        </Tooltip>

                        {(selectedList.collaborators || []).map((collab) => (
                          <Tooltip key={collab.id}>
                            <TooltipTrigger asChild>
                              <Avatar style={{ width: 28, height: 28, fontSize: 11 }}>
                                <AvatarImage src={collab.avatarUrl} />
                                <AvatarFallback>
                                  {(collab.name || "U")[0]?.toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            </TooltipTrigger>
                            <TooltipContent>{collab.name}</TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </div>

                    {/* Recent Activity Card */}
                    <div className="lists-details-card">
                      <div className="lists-details-card-header">
                        <span className="lists-details-card-title">
                          Recent Activity
                        </span>
                        {allActivity.length > 0 && (
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>
                            {Math.min(activityVisibleCount, allActivity.length)} of {allActivity.length}
                          </span>
                        )}
                      </div>

                      <div
                        onScroll={(e) => {
                          const target = e.currentTarget;
                          if (target.scrollHeight - target.scrollTop <= target.clientHeight + 25) {
                            if (activityVisibleCount < allActivity.length) {
                              setActivityVisibleCount((prev) => prev + 10);
                            }
                          }
                        }}
                        className="lists-activity-feed scrollbar-thin"
                      >
                        {loadingActivity ? (
                          <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
                            <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite', color: '#94a3b8' }} />
                          </div>
                        ) : allActivity.length === 0 ? (
                          <p className="lists-empty-desc">No activity yet</p>
                        ) : (
                          allActivity.slice(0, activityVisibleCount).map((act, i, arr) => (
                            <div key={act.id} className="lists-activity-item">
                              <div className="lists-activity-bullet" />
                              <div>
                                <p style={{ margin: 0, fontWeight: 500, color: '#0f172a' }}>
                                  {act.user}{" "}
                                  <span style={{ fontWeight: 400, color: '#64748b' }}>{act.text}</span>
                                </p>
                                <p style={{ margin: '2px 0 0', fontSize: 10.5, color: '#94a3b8' }}>
                                  {formatRelativeTime(act.createdAt)}
                                </p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="lists-empty-state">
                    <p className="lists-empty-desc">Select a list to view details</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dialog: Create New List */}
          <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
            <DialogContent style={{ maxWidth: 440, padding: "20px 24px" }}>
              <DialogHeader style={{ marginBottom: 12 }}>
                <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "#0f172a" }}>
                  Create New List
                </DialogTitle>
              </DialogHeader>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* List Name Input */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    List Name
                  </label>
                  <input
                    autoFocus
                    type="text"
                    placeholder="e.g. Sprint Tasks, Product Roadmap, Q4 Goals..."
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newListName.trim() && !creatingList) {
                        e.preventDefault();
                        void handleCreateList();
                      }
                    }}
                    className="lists-field-input"
                  />
                </div>

                {/* Workspace Format */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Format
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setNewListFormat("standard")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 12px",
                        borderRadius: 6,
                        border: newListFormat === "standard" ? "1.5px solid #0f172a" : "1px solid #cbd5e1",
                        backgroundColor: newListFormat === "standard" ? "#f8fafc" : "#ffffff",
                        color: newListFormat === "standard" ? "#0f172a" : "#64748b",
                        fontWeight: newListFormat === "standard" ? 600 : 500,
                        fontSize: 13,
                        cursor: "pointer",
                        transition: "all 0.12s ease",
                      }}
                    >
                      <FormatListBulleted size={15} />
                      <span>Checklist</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewListFormat("kanban")}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 12px",
                        borderRadius: 6,
                        border: newListFormat === "kanban" ? "1.5px solid #0f172a" : "1px solid #cbd5e1",
                        backgroundColor: newListFormat === "kanban" ? "#f8fafc" : "#ffffff",
                        color: newListFormat === "kanban" ? "#0f172a" : "#64748b",
                        fontWeight: newListFormat === "kanban" ? 600 : 500,
                        fontSize: 13,
                        cursor: "pointer",
                        transition: "all 0.12s ease",
                      }}
                    >
                      <Columns3 size={15} />
                      <span>Kanban Board</span>
                    </button>
                  </div>
                </div>

                {/* Stages (Only when Kanban is chosen) */}
                {newListFormat === "kanban" && (
                  <div className="lists-col-builder">
                    <div className="lists-col-builder-header">
                      <span>Columns ({newListCustomColumns.length})</span>
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {newListCustomColumns.map((col, idx) => (
                        <div key={col.id} className="lists-studio-stage-tag">
                          <div
                            className="lists-studio-stage-dot"
                            style={{ backgroundColor: col.color || "#0f172a" }}
                          />
                          <span>{col.name}</span>
                          {newListCustomColumns.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setNewListCustomColumns(
                                  newListCustomColumns.filter((_, i) => i !== idx),
                                )
                              }
                              className="lists-studio-stage-del"
                              title="Remove stage"
                            >
                              <CloseIcon size={10} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <input
                        type="text"
                        placeholder="Add column..."
                        value={newColInput}
                        onChange={(e) => setNewColInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newColInput.trim()) {
                            e.preventDefault();
                            const newColId = "col_" + Date.now();
                            const colColor =
                              LIST_COLORS[newListCustomColumns.length % LIST_COLORS.length] || "#0f172a";
                            setNewListCustomColumns([
                              ...newListCustomColumns,
                              { id: newColId, name: newColInput.trim(), color: colColor },
                            ]);
                            setNewColInput("");
                          }
                        }}
                        className="lists-field-input"
                        style={{ height: 30, padding: "0 8px", fontSize: 12 }}
                      />
                      <button
                        type="button"
                        disabled={!newColInput.trim()}
                        onClick={() => {
                          if (!newColInput.trim()) return;
                          const newColId = "col_" + Date.now();
                          const colColor =
                            LIST_COLORS[newListCustomColumns.length % LIST_COLORS.length] || "#0f172a";
                          setNewListCustomColumns([
                            ...newListCustomColumns,
                            { id: newColId, name: newColInput.trim(), color: colColor },
                          ]);
                          setNewColInput("");
                        }}
                        className="lists-btn-secondary"
                        style={{ height: 30, padding: "0 10px", fontSize: 12, flexShrink: 0 }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter style={{ marginTop: 20 }}>
                <button
                  type="button"
                  onClick={() => setNewListOpen(false)}
                  disabled={creatingList}
                  className="lists-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateList()}
                  disabled={creatingList || !newListName.trim()}
                  className="lists-btn-primary"
                >
                  {creatingList ? (
                    <>
                      <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                      Creating...
                    </>
                  ) : (
                    "Create List"
                  )}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog: Manage Collaborators */}
          <Dialog open={manageCollabOpen} onOpenChange={setManageCollabOpen}>
            <DialogContent style={{ maxWidth: 460 }}>
              <DialogHeader>
                <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
                  Manage Collaborators
                </DialogTitle>
              </DialogHeader>

              <div className="lists-dialog-body">
                <div>
                  <label className="lists-field-label">Current List</label>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: "#0f172a", margin: "4px 0 0 0" }}>
                    {selectedList.name}
                  </p>
                </div>

                <div>
                  <label className="lists-field-label" style={{ marginBottom: 6, display: "block" }}>
                    Active Collaborators ({selectedList.collaborators?.length || 0})
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" }}>
                    {(!selectedList.collaborators || selectedList.collaborators.length === 0) ? (
                      <p className="lists-empty-desc" style={{ padding: "8px 0", fontSize: 12.5 }}>No collaborators added yet</p>
                    ) : (
                      selectedList.collaborators.map((c) => (
                        <div
                          key={c.id}
                          className="lists-collab-item"
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Avatar style={{ width: 26, height: 26, fontSize: 11 }}>
                              <AvatarImage src={c.avatarUrl} />
                              <AvatarFallback style={{ backgroundColor: "#0f172a", color: "#ffffff", fontWeight: 600 }}>
                                {(c.name || "U").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span style={{ fontSize: 13, fontWeight: 500, color: "#0f172a" }}>{c.name}</span>
                          </div>
                          <button
                            type="button"
                            disabled={managingCollabs}
                            onClick={() => void handleRemoveCollaborator(c.id)}
                            className="lists-row-action-btn delete"
                            title="Remove collaborator"
                          >
                            <DeleteOutlined size={14} style={{ color: "#ef4444" }} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <label className="lists-field-label" style={{ marginBottom: 6, display: "block" }}>
                    Add Teammate
                  </label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Popover open={collabPickerOpen} onOpenChange={setCollabPickerOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="lists-collab-select"
                        >
                          <span className={collabToAdd ? "text-slate-900 font-medium" : "lists-collab-select-placeholder"}>
                            {collabToAdd
                              ? companyMembers.find((m) => m.id === collabToAdd)?.name || "Select a teammate..."
                              : "Select a teammate..."}
                          </span>
                          <ArrowDropDown size={14} className="text-slate-400" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        style={{ width: "280px", padding: 0, backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.15)", zIndex: 100 }}
                      >
                        <div className="lists-collab-search-box">
                          <Search size={13} className="lists-collab-search-icon" />
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search teammate..."
                            value={collabSearchTerm}
                            onChange={(e) => setCollabSearchTerm(e.target.value)}
                            className="lists-collab-search-input"
                          />
                          {collabSearchTerm && (
                            <button
                              type="button"
                              onClick={() => setCollabSearchTerm("")}
                              className="lists-collab-search-clear"
                            >
                              <CloseIcon size={12} />
                            </button>
                          )}
                        </div>

                        <div className="lists-collab-search-list">
                          {filteredMembers.length === 0 ? (
                            <div className="lists-collab-search-empty">
                              {availableMembers.length === 0 ? "All teammates are already added" : "No teammates found"}
                            </div>
                          ) : (
                            filteredMembers.map((m) => {
                              const isSelected = collabToAdd === m.id;
                              return (
                                <div
                                  key={m.id}
                                  onClick={() => {
                                    setCollabToAdd(m.id);
                                    setCollabPickerOpen(false);
                                    setCollabSearchTerm("");
                                  }}
                                  className={`lists-collab-search-item ${isSelected ? "selected" : ""}`}
                                >
                                  <Avatar style={{ width: "24px", height: "24px", flexShrink: 0 }}>
                                    <AvatarImage src={m.profile_photo || undefined} />
                                    <AvatarFallback style={{ fontSize: "10px", backgroundColor: "#0f172a", color: "#ffffff", fontWeight: 600 }}>
                                      {(m.name || "U").charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="lists-collab-search-name truncate">{m.name}</span>
                                  {isSelected && <CheckIcon size={14} style={{ color: "#2563eb", marginLeft: "auto", flexShrink: 0 }} />}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>

                    <button
                      type="button"
                      onClick={() => void handleAddCollaborator()}
                      disabled={!collabToAdd || managingCollabs}
                      className="lists-btn-primary"
                      style={{ whiteSpace: "nowrap", flexShrink: 0, height: "36px", padding: "0 14px" }}
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setManageCollabOpen(false)}
                  className="lists-btn-secondary"
                >
                  Done
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </Layout>
    </TooltipProvider>
  );
}
