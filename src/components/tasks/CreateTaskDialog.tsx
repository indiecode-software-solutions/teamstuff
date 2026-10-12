import React from "react";
import {
  Paperclip,
  X as CloseIcon,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  File as FileGeneric,
  Plus,
  Loader2,
  Calendar,
  User as UserIcon,
  CheckCircle2,
  ChevronDown,
  Search,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { getCompanyEmployees, createNewTask, Task, TaskAttachment } from "../../lib/tasks";
import { sanitizeProfilePhoto } from "../../lib/profile-photo";
import {
  getAuthenticatedUserContext,
  ensureTaskAttachmentsFolder,
  uploadFileToCloud,
} from "../../lib/cloud-drive";
import {
  Dialog,
  DialogContent,
} from "../ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (task?: Task | null) => void | Promise<void>;
  companyId?: string | null;
  currentUserId?: string | null;
}

export function CreateTaskDialog({
  open,
  onClose,
  onCreated,
  companyId: propCompanyId,
  currentUserId: propCurrentUserId,
}: CreateTaskDialogProps) {
  const [creating, setCreating] = React.useState(false);
  const [uploadStatusText, setUploadStatusText] = React.useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(propCurrentUserId || null);
  const [currentUserName, setCurrentUserName] = React.useState<string>("Me");
  const [currentUserEmail, setCurrentUserEmail] = React.useState<string>("");
  const [currentUserPhoto, setCurrentUserPhoto] = React.useState<string | null>(null);
  const [companyId, setCompanyId] = React.useState<string | null>(propCompanyId || null);
  const [employees, setEmployees] = React.useState<
    { id: string; name: string; email: string; phone?: string; profile_photo?: string | null }[]
  >([]);
  const [taskTitle, setTaskTitle] = React.useState("");
  const [assignedToId, setAssignedToId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [stagedFiles, setStagedFiles] = React.useState<File[]>([]);
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = React.useState(false);
  const [assigneeSearchQuery, setAssigneeSearchQuery] = React.useState("");

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const titleInputRef = React.useRef<HTMLInputElement | null>(null);
  const dateInputRef = React.useRef<HTMLInputElement | null>(null);
  const assigneeDropdownRef = React.useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        assigneeDropdownRef.current &&
        !assigneeDropdownRef.current.contains(e.target as Node)
      ) {
        setIsAssigneeDropdownOpen(false);
      }
    }
    if (isAssigneeDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isAssigneeDropdownOpen]);

  const getTomorrowDateString = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Default due date: tomorrow
  const [dueDateValue, setDueDateValue] = React.useState<string>(getTomorrowDateString);

  React.useEffect(() => {
    if (!open) {
      setTaskTitle("");
      setDescription("");
      setAssignedToId("");
      setStagedFiles([]);
      setIsAssigneeDropdownOpen(false);
      setAssigneeSearchQuery("");
      setDueDateValue(getTomorrowDateString());
      return;
    }
    (async () => {
      let uid = propCurrentUserId;
      let targetCompanyId = propCompanyId;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        uid = user.id;
        setCurrentUserId(user.id);
      }

      if (typeof window !== "undefined") {
        try {
          const stored = sessionStorage.getItem("impersonated_company");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.id) targetCompanyId = parsed.id;
          }
        } catch {}
      }

      if (uid) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, name, email, profile_photo, company_id")
          .eq("id", uid)
          .maybeSingle();

        if (profile?.name) {
          setCurrentUserName(profile.name);
        } else if (profile?.email) {
          setCurrentUserName(profile.email.split("@")[0]);
        }

        if (profile?.email) {
          setCurrentUserEmail(profile.email);
        }
        if (profile?.profile_photo) {
          setCurrentUserPhoto(profile.profile_photo);
        }

        if (!targetCompanyId && profile?.company_id) {
          targetCompanyId = profile.company_id;
        }
      }

      if (targetCompanyId) {
        setCompanyId(targetCompanyId);
        const empList = await getCompanyEmployees(targetCompanyId);
        setEmployees(empList);
      }

      // Auto-focus title input
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 100);
    })();
  }, [open, propCompanyId, propCurrentUserId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);
    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

    const validFiles: File[] = [];
    for (const f of filesArray) {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`File "${f.name}" exceeds 25MB.`);
        continue;
      }
      validFiles.push(f);
    }

    setStagedFiles((prev) => [...prev, ...validFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveStagedFile = (index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeOrExt: string) => {
    const lower = mimeOrExt.toLowerCase();
    if (
      lower.includes("excel") ||
      lower.includes("spreadsheet") ||
      lower.endsWith(".xlsx") ||
      lower.endsWith(".xls") ||
      lower.endsWith(".csv")
    ) {
      return <FileSpreadsheet size={15} style={{ color: "#16a34a" }} />;
    }
    if (lower.includes("image") || lower.match(/\.(png|jpg|jpeg|webp|gif|svg)$/)) {
      return <ImageIcon size={15} style={{ color: "#2563eb" }} />;
    }
    if (
      lower.includes("pdf") ||
      lower.endsWith(".pdf") ||
      lower.includes("word") ||
      lower.endsWith(".docx")
    ) {
      return <FileText size={15} style={{ color: "#ea580c" }} />;
    }
    return <FileGeneric size={15} style={{ color: "#64748b" }} />;
  };

  const handleCreateTask = async () => {
    if (!taskTitle.trim() || !companyId || !currentUserId || creating) return;

    setCreating(true);
    let uploadedAttachments: TaskAttachment[] = [];

    // Upload staged files if any
    if (stagedFiles.length > 0) {
      setUploadStatusText("Uploading attachments...");
      const userContext = await getAuthenticatedUserContext();
      if (userContext) {
        const folderId = await ensureTaskAttachmentsFolder(userContext);
        for (let i = 0; i < stagedFiles.length; i++) {
          const file = stagedFiles[i];
          if (!file) continue;
          setUploadStatusText(`Uploading file ${i + 1} of ${stagedFiles.length}...`);
          const res = await uploadFileToCloud(userContext, file, folderId);
          if (res.success && res.fileItem) {
            uploadedAttachments.push({
              fileId: res.fileItem.id,
              name: res.fileItem.name,
              sizeBytes: res.fileItem.sizeBytes,
              mimeType: res.fileItem.mimeType,
              r2ObjectKey: res.fileItem.r2ObjectKey,
              uploadedAt: new Date().toISOString(),
              uploaderId: userContext.userId,
            });
          } else {
            console.error("Failed to upload attachment:", res.message);
          }
        }
      }
    }

    setUploadStatusText("Saving task...");
    const targetAssigneeId = assignedToId || currentUserId;
    const created = await createNewTask({
      companyId,
      title: taskTitle.trim(),
      description: description.trim() ? description.trim() : undefined,
      assignedTo: targetAssigneeId,
      assignedBy: currentUserId,
      dueDate: dueDateValue || undefined,
      status: "Not Started",
      attachments: uploadedAttachments,
    });

    if (created) {
      toast.success(
        created.assignedTo === currentUserId
          ? "Task created in your board"
          : `Task assigned to ${created.assigneeName || "team member"}`
      );
      setTaskTitle("");
      setDescription("");
      setStagedFiles([]);
      setCreating(false);
      setUploadStatusText(null);
      onClose();
      await onCreated?.(created);
    } else {
      setCreating(false);
      setUploadStatusText(null);
      toast.error("Failed to create task. Please try again.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleCreateTask();
    }
  };

  const getInitials = (name: string) => {
    if (!name) return "U";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const allSelectableEmployees = React.useMemo(() => {
    // Only return other colleagues (personal tasks belong in To-Do section)
    return employees.filter((e) => e.id !== currentUserId);
  }, [employees, currentUserId]);

  const filteredEmployees = React.useMemo(() => {
    const q = assigneeSearchQuery.toLowerCase().trim();
    if (!q) return allSelectableEmployees;
    return allSelectableEmployees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(q) ||
        (emp.email && emp.email.toLowerCase().includes(q))
    );
  }, [allSelectableEmployees, assigneeSearchQuery]);

  const selectedEmployee = allSelectableEmployees.find((emp) => emp.id === assignedToId);

  return (
    <Dialog open={open} onOpenChange={(val) => !creating && !val && onClose()}>
      <DialogContent
        className="tasks-modal-container"
        style={{ padding: 0, border: "none" }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="tasks-modal-header">
          <div className="tasks-modal-breadcrumb">
            <span>Tasks</span>
            <span>/</span>
            <span className="tasks-modal-breadcrumb-active">New Task</span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="tasks-modal-body">
          {/* Document Canvas (Title + Divider + Auto-expanding Description) */}
          <div className="tasks-modal-canvas">
            <input
              ref={titleInputRef}
              type="text"
              placeholder="Task title..."
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              disabled={creating}
              className="tasks-modal-title-input"
            />
            <div className="tasks-modal-canvas-divider" />
            <textarea
              rows={3}
              placeholder="Add description, notes, or checklist..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                // Auto-expand textarea
                e.target.style.height = "auto";
                e.target.style.height = `${Math.max(80, e.target.scrollHeight)}px`;
              }}
              disabled={creating}
              className="tasks-modal-desc-textarea"
            />
          </div>

          {/* Properties Grid (Assignee & Due Date) */}
          <div className="tasks-modal-props-grid">
            {/* Assign To */}
            <div className="tasks-modal-prop-item">
              <label className="tasks-modal-prop-label">
                <UserIcon size={12} />
                Assign To
              </label>
              <div className="tasks-assignee-dropdown-wrap">
                <Popover open={isAssigneeDropdownOpen} onOpenChange={setIsAssigneeDropdownOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="tasks-assignee-trigger-btn"
                      disabled={creating}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                        {selectedEmployee ? (
                          <>
                            <div className="tasks-assignee-avatar-initials" style={{ width: "22px", height: "22px", fontSize: "10px" }}>
                              {selectedEmployee.profile_photo ? (
                                <img
                                  src={sanitizeProfilePhoto(selectedEmployee.profile_photo) || selectedEmployee.profile_photo}
                                  alt=""
                                  style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                                />
                              ) : (
                                getInitials(selectedEmployee.name)
                              )}
                            </div>
                            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--color-text-primary, #0f172a)" }}>
                              {selectedEmployee.name}
                            </span>
                          </>
                        ) : (
                          <>
                            <div
                              style={{
                                width: "22px",
                                height: "22px",
                                borderRadius: "50%",
                                backgroundColor: "var(--color-surface-subtle, #f1f5f9)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                color: "var(--color-text-muted, #94a3b8)",
                              }}
                            >
                              <UserIcon size={12} />
                            </div>
                            <span style={{ color: "var(--color-text-muted, #94a3b8)" }}>
                              Select colleague
                            </span>
                          </>
                        )}
                      </div>
                      <ChevronDown size={14} style={{ color: "var(--color-text-muted, #94a3b8)", flexShrink: 0 }} />
                    </button>
                  </PopoverTrigger>

                  <PopoverContent
                    className="tasks-assignee-popover"
                    align="start"
                    sideOffset={4}
                    style={{ zIndex: 99999 }}
                    data-radix-scroll-lock-ignore
                  >
                    <div className="tasks-assignee-search-header">
                      <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
                        <Search size={14} style={{ position: "absolute", left: "9px", color: "var(--color-text-muted, #94a3b8)", pointerEvents: "none" }} />
                        <input
                          type="text"
                          placeholder="Search..."
                          value={assigneeSearchQuery}
                          onChange={(e) => setAssigneeSearchQuery(e.target.value)}
                          autoFocus
                          className="tasks-assignee-search-input"
                        />
                      </div>
                    </div>

                    <div
                      className="tasks-assignee-list"
                      data-radix-scroll-lock-ignore
                      onWheel={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                    >
                      {/* Filtered options */}
                      {filteredEmployees.map((emp) => {
                        const isSelected = emp.id === assignedToId;
                        return (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => {
                              setAssignedToId(emp.id);
                              setIsAssigneeDropdownOpen(false);
                              setAssigneeSearchQuery("");
                            }}
                            className={`tasks-assignee-option ${isSelected ? "selected" : ""}`}
                          >
                            <div className="tasks-assignee-avatar-initials">
                              {emp.profile_photo ? (
                                <img
                                  src={sanitizeProfilePhoto(emp.profile_photo) || emp.profile_photo}
                                  alt=""
                                  style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                                />
                              ) : (
                                getInitials(emp.name)
                              )}
                            </div>
                            <div className="tasks-assignee-option-info">
                              <span className="tasks-assignee-option-name">
                                {emp.name}
                              </span>
                              {emp.email && (
                                <span className="tasks-assignee-option-email">{emp.email}</span>
                              )}
                            </div>
                            {isSelected && (
                              <Check size={14} style={{ color: "#16a34a", flexShrink: 0 }} />
                            )}
                          </button>
                        );
                      })}

                      {filteredEmployees.length === 0 && (
                        <div style={{ padding: "12px 8px", textAlign: "center", fontSize: "12px", color: "var(--color-text-muted, #94a3b8)" }}>
                          No team members found
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Due Date */}
            <div className="tasks-modal-prop-item">
              <label className="tasks-modal-prop-label">
                <Calendar size={12} />
                Due Date
              </label>
              <div className="tasks-date-control-wrap">
                <input
                  ref={dateInputRef}
                  type="date"
                  value={dueDateValue}
                  onChange={(e) => setDueDateValue(e.target.value)}
                  disabled={creating}
                  className="tasks-modal-prop-date"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (dateInputRef.current) {
                      if ("showPicker" in dateInputRef.current) {
                        try {
                          dateInputRef.current.showPicker();
                        } catch {
                          dateInputRef.current.focus();
                        }
                      } else {
                        dateInputRef.current.focus();
                      }
                    }
                  }}
                  disabled={creating}
                  className="tasks-date-btn-corner"
                  aria-label="Open calendar"
                >
                  <Calendar size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Attachments Section */}
          <div className="tasks-modal-att-section">
            <div className="tasks-modal-att-header">
              <span className="tasks-modal-att-title">
                <Paperclip size={13} />
                Attachments {stagedFiles.length > 0 && `(${stagedFiles.length})`}
              </span>
              {stagedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={creating}
                  className="btn-icon"
                  style={{
                    fontSize: "11px",
                    width: "auto",
                    height: "auto",
                    color: "var(--color-text-primary, #0f172a)",
                    fontWeight: 600,
                    gap: "4px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <Plus size={13} />
                  Add more
                </button>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              style={{ display: "none" }}
              accept=".pdf,.xlsx,.xls,.csv,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp,.zip"
            />

            {stagedFiles.length === 0 ? (
              <button
                type="button"
                onClick={() => !creating && fileInputRef.current?.click()}
                className="tasks-modal-dropzone-btn"
              >
                <Paperclip size={14} style={{ color: "var(--color-text-muted, #94a3b8)" }} />
                <span>Attach files or documents</span>
              </button>
            ) : (
              <div className="tasks-modal-att-list">
                {stagedFiles.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="tasks-modal-att-chip">
                    <div className="tasks-modal-att-info">
                      {getFileIcon(file.name)}
                      <span className="tasks-modal-att-name">{file.name}</span>
                      <span className="tasks-modal-att-size">({formatFileSize(file.size)})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStagedFile(idx)}
                      disabled={creating}
                      className="tasks-modal-att-remove-btn"
                      aria-label="Remove attachment"
                    >
                      <CloseIcon size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="tasks-modal-footer">
          <div className="tasks-modal-footer-hint">
            {uploadStatusText && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--color-primary, #0f172a)", fontWeight: 500 }}>
                <Loader2 size={13}  />
                {uploadStatusText}
              </span>
            )}
          </div>

          <div className="tasks-modal-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={creating}
              className="btn btn-secondary"
              style={{ height: "32px", fontSize: "13px", padding: "0 12px" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateTask}
              disabled={!taskTitle.trim() || !assignedToId || creating}
              className="btn btn-primary"
              style={{ height: "32px", fontSize: "13px", padding: "0 14px", gap: "6px" }}
            >
              {creating ? (
                <>
                  <Loader2 size={13}  />
                  Creating...
                </>
              ) : (
                <>
                  <CheckCircle2 size={13} />
                  Create Task
                </>
              )}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

