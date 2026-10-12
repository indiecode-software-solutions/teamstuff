import React, { useState, useEffect, useCallback } from "react";
import {
  LogOut,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  ChevronRight,
  Printer,
  UserCheck,
  Laptop,
  DollarSign,
  KeyRound,
  ClipboardList,
  Plus,
  Eye,
  RefreshCw,
  Star,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  fetchCompanyExitRequests,
  fetchMyExitRequest,
  fetchClearanceTasks,
  fetchExitInterview,
  initiateExitRequest,
  approveExitRequest,
  rejectExitRequest,
  completeClearanceTask,
  submitExitInterview,
  markExitCompleted,
  type ExitRequest,
  type ClearanceTask,
  type ExitInterview,
  type ExitType,
} from "../../lib/exit-management";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Switch } from "../ui/switch";
import { Skeleton } from "../ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function statusConfig(status: string) {
  switch (status) {
    case "pending":
      return {
        label: "Pending Approval",
        color: "text-amber-600 dark:text-amber-400",
        bg: "bg-amber-500/10 border-amber-500/20",
        dotBg: "bg-amber-500",
        icon: <Clock size={13} />,
      };
    case "approved":
      return {
        label: "Approved",
        color: "text-blue-600 dark:text-blue-400",
        bg: "bg-blue-500/10 border-blue-500/20",
        dotBg: "bg-blue-500",
        icon: <CheckCircle2 size={13} />,
      };
    case "in_clearance":
      return {
        label: "In Clearance",
        color: "text-purple-600 dark:text-purple-400",
        bg: "bg-purple-500/10 border-purple-500/20",
        dotBg: "bg-purple-500",
        icon: <ClipboardList size={13} />,
      };
    case "completed":
      return {
        label: "Completed",
        color: "text-emerald-600 dark:text-emerald-400",
        bg: "bg-emerald-500/10 border-emerald-500/20",
        dotBg: "bg-emerald-500",
        icon: <CheckCircle2 size={13} />,
      };
    case "rejected":
      return {
        label: "Rejected",
        color: "text-red-600 dark:text-red-400",
        bg: "bg-red-500/10 border-red-500/20",
        dotBg: "bg-red-500",
        icon: <XCircle size={13} />,
      };
    default:
      return {
        label: status,
        color: "text-text-muted",
        bg: "bg-surface-subtle border-border",
        dotBg: "bg-slate-400",
        icon: null,
      };
  }
}

export function deptIcon(dept: string) {
  switch (dept) {
    case "IT":
      return <Laptop size={15} />;
    case "Finance":
      return <DollarSign size={15} />;
    case "Admin":
      return <KeyRound size={15} />;
    case "Manager":
      return <UserCheck size={15} />;
    case "HR":
      return <ClipboardList size={15} />;
    default:
      return <CheckCircle2 size={15} />;
  }
}

export function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function getInitials(name: string) {
  return (
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "??"
  );
}

// ─── Relieving Letter Print View ──────────────────────────────────────────────

export function printRelievingLetter(req: ExitRequest, companyName: string) {
  const emp = req.employee;
  const html = `
    <html><head><title>Relieving Letter</title>
    <style>
      body { font-family: 'Georgia', serif; max-width: 740px; margin: 60px auto; color: #111; line-height: 1.8; }
      .header { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 32px; }
      .company { font-size: 22px; font-weight: 600; }
      .meta { font-size: 13px; color: #555; }
      h2 { font-size: 16px; text-align: center; margin: 24px 0; text-decoration: underline; }
      p { margin: 12px 0; font-size: 14px; }
      .signature { margin-top: 60px; }
      @media print { body { margin: 40px; } }
    </style></head>
    <body>
      <div class="header">
        <div class="company">${companyName}</div>
        <div class="meta">Date: ${fmtDate(new Date().toISOString())}</div>
      </div>
      <h2>RELIEVING LETTER</h2>
      <p>To Whom It May Concern,</p>
      <p>This is to certify that <strong>${emp?.name || "the employee"}</strong> was employed with <strong>${companyName}</strong> as <strong>${emp?.job_title || "—"}</strong> in the <strong>${emp?.department || "—"}</strong> department.</p>
      <p>We confirm that ${emp?.name || "the employee"} has been relieved from their duties effective <strong>${fmtDate(req.last_working_day)}</strong>, as per their ${req.exit_type}.</p>
      <p>During their tenure, they have satisfactorily discharged their duties and responsibilities. We wish them all the best in their future endeavours.</p>
      <p>This letter is issued at the request of the employee for use as a reference.</p>
      <div class="signature">
        <p>Sincerely,</p>
        <br/><br/>
        <p>___________________________</p>
        <p>Human Resources Department</p>
        <p>${companyName}</p>
      </div>
    </body></html>
  `;
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    w.print();
  }
}

// ─── Interactive Star Rating Component ────────────────────────────────────────

function StarRating({
  value,
  onChange,
  readOnly = false,
}: {
  value: number | null | undefined;
  onChange?: (v: number) => void;
  readOnly?: boolean;
}) {
  const [hoverVal, setHoverVal] = useState<number | null>(null);
  const current = hoverVal ?? (value || 0);

  return (
    <div className="hr-star-row">
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= current;
        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && onChange?.(star)}
            onMouseEnter={() => !readOnly && setHoverVal(star)}
            onMouseLeave={() => !readOnly && setHoverVal(null)}
            className={`hr-star-btn ${isFilled ? "active" : ""}`}
          >
            <Star
              size={16}
              className={isFilled ? "fill-amber-400 text-amber-400" : "text-text-muted fill-transparent"}
            />
          </button>
        );
      })}
    </div>
  );
}

// ─── Exit Interview Form ──────────────────────────────────────────────────────

interface InterviewFormProps {
  exitRequestId: string;
  employeeId: string;
  onDone: () => void;
}

function ExitInterviewForm({ exitRequestId, employeeId, onDone }: InterviewFormProps) {
  const [primaryReason, setPrimaryReason] = useState("");
  const [managerRating, setManagerRating] = useState<number | null>(null);
  const [cultureRating, setCultureRating] = useState<number | null>(null);
  const [growthRating, setGrowthRating] = useState<number | null>(null);
  const [wlbRating, setWlbRating] = useState<number | null>(null);
  const [wouldRecommend, setWouldRecommend] = useState(true);
  const [openFeedback, setOpenFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reasons = [
    "Better opportunity elsewhere",
    "Career growth limitations",
    "Compensation & benefits",
    "Work-life balance",
    "Relocation",
    "Personal reasons",
    "Management issues",
    "Company culture",
    "Other",
  ];

  async function handleSubmit() {
    if (!primaryReason) {
      setError("Please select a primary reason.");
      return;
    }
    setSaving(true);
    const res = await submitExitInterview(exitRequestId, employeeId, {
      primaryReason,
      managerRating: managerRating || undefined,
      cultureRating: cultureRating || undefined,
      growthRating: growthRating || undefined,
      wlbRating: wlbRating || undefined,
      wouldRecommend,
      openFeedback,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to submit.");
      return;
    }
    onDone();
  }

  return (
    <div className="space-y-4 p-4 rounded-xl border border-border bg-surface-subtle">
      <h4 className="font-semibold text-text-primary text-sm">Exit Interview Questionnaire</h4>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-600 dark:text-red-400 text-xs">
          {error}
        </div>
      )}

      <div className="hr-form-field">
        <label className="hr-form-label">
          Primary Reason for Leaving <span className="text-red-500">*</span>
        </label>
        <select
          value={primaryReason}
          onChange={(e) => setPrimaryReason(e.target.value)}
          className="hr-select"
        >
          <option value="" disabled>
            Select primary reason...
          </option>
          {reasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3 pt-1">
        <p className="text-xs font-medium text-text-secondary">
          Rate your experience (1 = Poor, 5 = Excellent)
        </p>

        {[
          { label: "Manager / Reporting Relationship", value: managerRating, set: setManagerRating },
          { label: "Company Culture & Values", value: cultureRating, set: setCultureRating },
          { label: "Career Growth & Opportunities", value: growthRating, set: setGrowthRating },
          { label: "Work-Life Balance", value: wlbRating, set: setWlbRating },
        ].map(({ label, value, set }) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 py-1"
          >
            <span className="text-xs text-text-secondary">{label}</span>
            <StarRating value={value} onChange={set} />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between py-2 border-t border-b border-border-subtle">
        <span className="text-xs text-text-secondary">
          Would you recommend us as an employer?
        </span>
        <Switch checked={wouldRecommend} onCheckedChange={setWouldRecommend} />
      </div>

      <div className="hr-form-field">
        <label className="hr-form-label">
          Any other feedback or suggestions
        </label>
        <textarea
          rows={3}
          value={openFeedback}
          onChange={(e) => {
            setOpenFeedback(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
          }}
          placeholder="Share anything that would help us improve..."
          className="hr-input hr-textarea-autogrow"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="hr-btn hr-btn-primary w-full"
      >
        {saving ? "Submitting..." : "Submit Exit Interview"}
      </button>
    </div>
  );
}

// ─── Clearance Checklist ──────────────────────────────────────────────────────

interface ClearanceChecklistProps {
  tasks: ClearanceTask[];
  isHR: boolean;
  currentUserId: string;
  onTaskDone: (taskId: string) => void;
}

export function ClearanceChecklist({
  tasks,
  isHR,
  currentUserId,
  onTaskDone,
}: ClearanceChecklistProps) {
  const done = tasks.filter((t) => t.status === "completed").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const [remarkDialogTask, setRemarkDialogTask] = useState<ClearanceTask | null>(null);
  const [remark, setRemark] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleMarkDone() {
    if (!remarkDialogTask) return;
    setSaving(true);
    const res = await completeClearanceTask(remarkDialogTask.id, currentUserId, remark);
    setSaving(false);
    if (res.success) {
      onTaskDone(remarkDialogTask.id);
      setRemarkDialogTask(null);
      setRemark("");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-text-primary">Department Clearances</h4>
        <span className="text-xs text-text-muted font-medium">
          {done}/{tasks.length} cleared ({pct}%)
        </span>
      </div>

      <div className="hr-progress-track mb-3">
        <div
          className={`hr-progress-fill ${pct === 100 ? "success" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="hr-clearance-list">
        {tasks.map((task) => {
          const isCompleted = task.status === "completed";
          return (
            <div
              key={task.id}
              className={`hr-clearance-item ${isCompleted ? "completed" : ""}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`hr-clearance-dept-icon ${isCompleted ? "completed" : ""}`}
                >
                  {isCompleted ? <CheckCircle2 size={16} /> : deptIcon(task.department)}
                </span>
                <div>
                  <div className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                    <span>{task.department}</span>
                    <span className="font-normal text-text-muted">— {task.task_label}</span>
                  </div>
                  {task.remarks && (
                    <p className="text-[11px] text-text-secondary mt-0.5 italic">
                      "{task.remarks}"
                    </p>
                  )}
                </div>
              </div>

              <div>
                {isCompleted ? (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Cleared {fmtDate(task.completed_at)}
                  </span>
                ) : isHR ? (
                  <button
                    type="button"
                    onClick={() => setRemarkDialogTask(task)}
                    className="hr-btn hr-btn-secondary text-xs h-7 px-2.5"
                  >
                    Mark Done
                  </button>
                ) : (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                    Pending
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Remark dialog */}
      <Dialog open={!!remarkDialogTask} onOpenChange={(o) => !o && setRemarkDialogTask(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Mark "{remarkDialogTask?.department}" as Cleared
            </DialogTitle>
          </DialogHeader>

          <div className="hr-form-field py-2">
            <label className="hr-form-label">
              Remarks (optional)
            </label>
            <textarea
              rows={2}
              value={remark}
              onChange={(e) => {
                setRemark(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }}
              placeholder="E.g. Laptop returned, system access revoked"
              className="hr-input hr-textarea-autogrow"
            />
          </div>

          <DialogFooter className="pt-2">
            <button
              type="button"
              onClick={() => setRemarkDialogTask(null)}
              className="hr-btn hr-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleMarkDone}
              className="hr-btn hr-btn-primary"
            >
              {saving ? "Confirming..." : "Confirm Clearance"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Detail Drawer / Dialog ───────────────────────────────────────────────────

interface DetailDialogProps {
  req: ExitRequest;
  isHR: boolean;
  currentUserId: string;
  companyName: string;
  onClose: () => void;
  onRefresh: () => void;
}

export function DetailDialog({
  req,
  isHR,
  currentUserId,
  companyName,
  onClose,
  onRefresh,
}: DetailDialogProps) {
  const [tasks, setTasks] = useState<ClearanceTask[]>([]);
  const [interview, setInterview] = useState<ExitInterview | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<"approve" | "reject" | null>(null);
  const [actionRemark, setActionRemark] = useState("");
  const [showActionRemark, setShowActionRemark] = useState(false);
  const [actionType, setActionType] = useState<"approve" | "reject">("approve");
  const [completingExit, setCompletingExit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [t, iv] = await Promise.all([
      fetchClearanceTasks(req.id),
      fetchExitInterview(req.id),
    ]);
    setTasks(t);
    setInterview(iv);
    setLoading(false);
  }, [req.id]);

  useEffect(() => {
    load();
  }, [load]);

  function handleTaskDone(taskId: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status: "completed" as const, completed_at: new Date().toISOString() }
          : t
      )
    );
  }

  async function handleAction() {
    setApprovingId(actionType);
    const res =
      actionType === "approve"
        ? await approveExitRequest(req.id, currentUserId, actionRemark)
        : await rejectExitRequest(req.id, currentUserId, actionRemark);
    setApprovingId(null);
    if (res.success) {
      onRefresh();
      onClose();
    }
  }

  async function handleMarkExitCompleted() {
    setCompletingExit(true);
    await markExitCompleted(req.id);
    setCompletingExit(false);
    onRefresh();
    onClose();
  }

  const allClear = tasks.length > 0 && tasks.every((t) => t.status === "completed");
  const sc = statusConfig(req.status);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="pb-3 border-b border-border">
          <div>
            <h3 className="text-base font-semibold text-text-primary">
              {req.employee?.name || "Employee"} — Offboarding Details
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`hr-exit-status-pill ${sc.bg} ${sc.color}`}
              >
                {sc.icon} {sc.label}
              </span>
              <span className="text-xs text-text-muted capitalize">
                • {req.exit_type}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-5 pt-3">
          {/* Key Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-surface-subtle border border-border">
            {[
              { label: "Department", value: req.employee?.department || "—" },
              { label: "Job Title", value: req.employee?.job_title || "—" },
              { label: "Last Working Day", value: fmtDate(req.last_working_day) },
              { label: "Request Date", value: fmtDate(req.created_at) },
              { label: "Notice Period", value: `${req.notice_period_days} days` },
              {
                label: "Notice Shortfall",
                value: req.notice_shortfall_days > 0 ? `${req.notice_shortfall_days} days` : "None",
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                  {label}
                </span>
                <span className="text-xs font-medium text-text-primary">{value}</span>
              </div>
            ))}
          </div>

          {req.reason && (
            <div className="p-3 rounded-xl bg-surface-subtle border border-border">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block mb-1">
                Reason
              </span>
              <p className="text-xs text-text-secondary">{req.reason}</p>
            </div>
          )}

          {req.manager_remarks && (
            <div className="p-3 rounded-xl bg-surface-subtle border border-border">
              <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block mb-1">
                Manager Remarks
              </span>
              <p className="text-xs text-text-secondary">{req.manager_remarks}</p>
            </div>
          )}

          {/* HR approve/reject actions */}
          {isHR && req.status === "pending" && (
            <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-500/5">
              {!showActionRemark ? (
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActionType("reject");
                      setShowActionRemark(true);
                    }}
                    className="hr-btn hr-btn-danger"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActionType("approve");
                      setShowActionRemark(true);
                    }}
                    className="hr-btn hr-btn-primary"
                  >
                    Approve & Start Clearance
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    rows={2}
                    value={actionRemark}
                    onChange={(e) => {
                      setActionRemark(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
                    }}
                    placeholder={
                      actionType === "approve"
                        ? "Approval remarks (optional)"
                        : "Rejection reason"
                    }
                    className="hr-input hr-textarea-autogrow"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowActionRemark(false);
                        setActionRemark("");
                      }}
                      className="hr-btn hr-btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAction}
                      disabled={!!approvingId}
                      className={`hr-btn ${actionType === "approve" ? "hr-btn-primary" : "hr-btn-danger"}`}
                    >
                      {approvingId ? "Processing..." : actionType === "approve" ? "Confirm Approval" : "Confirm Rejection"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Clearance tasks */}
          {(req.status === "in_clearance" || req.status === "completed") && (
            <div className="p-4 rounded-xl border border-border bg-surface">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full rounded-lg" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              ) : (
                <ClearanceChecklist
                  tasks={tasks}
                  isHR={isHR}
                  currentUserId={currentUserId}
                  onTaskDone={handleTaskDone}
                />
              )}
            </div>
          )}

          {/* Exit interview */}
          {req.status === "in_clearance" && (
            <div>
              {interview ? (
                <div className="p-4 rounded-xl border border-border bg-surface space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-text-primary">Exit Interview</h4>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ Submitted
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 py-1">
                    {[
                      { label: "Manager", val: interview.manager_rating },
                      { label: "Culture", val: interview.culture_rating },
                      { label: "Growth", val: interview.growth_rating },
                      { label: "Work-Life Balance", val: interview.wlb_rating },
                    ].map(({ label, val }) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-xs text-text-secondary">
                          {label}
                        </span>
                        <StarRating value={val} readOnly />
                      </div>
                    ))}
                  </div>

                  {interview.primary_reason && (
                    <p className="text-xs text-text-secondary">
                      <span className="font-semibold text-text-primary">Primary reason:</span> {interview.primary_reason}
                    </p>
                  )}
                  {interview.open_feedback && (
                    <p className="text-xs text-text-secondary">
                      <span className="font-semibold text-text-primary">Feedback:</span> {interview.open_feedback}
                    </p>
                  )}
                </div>
              ) : req.employee_id === currentUserId ? (
                <ExitInterviewForm
                  exitRequestId={req.id}
                  employeeId={currentUserId}
                  onDone={load}
                />
              ) : (
                <div className="p-4 rounded-xl border border-border bg-surface-subtle text-xs text-text-muted text-center">
                  Exit interview not yet submitted by the employee.
                </div>
              )}
            </div>
          )}

          {/* Complete exit */}
          {isHR && req.status === "in_clearance" && allClear && interview && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleMarkExitCompleted}
                disabled={completingExit}
                className="hr-btn hr-btn-primary w-full"
              >
                {completingExit ? "Completing..." : "✓ Mark Exit as Completed"}
              </button>
            </div>
          )}

          {/* Relieving letter */}
          {req.status === "completed" && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => printRelievingLetter(req, companyName)}
                className="hr-btn hr-btn-secondary w-full"
              >
                <Printer size={16} />
                Generate Relieving Letter
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Initiate Exit Dialog ─────────────────────────────────────────────────────

interface InitiateExitDialogProps {
  companyId: string;
  currentUserId: string;
  employees: { id: string; name: string; job_title: string; department: string }[];
  selfOnly?: boolean;
  selfProfile?: { id: string; name: string };
  onDone: () => void;
  onClose: () => void;
}

export function InitiateExitDialog({
  companyId,
  currentUserId,
  employees,
  selfOnly,
  selfProfile,
  onDone,
  onClose,
}: InitiateExitDialogProps) {
  const [employeeId, setEmployeeId] = useState(selfOnly && selfProfile ? selfProfile.id : "");
  const [exitType, setExitType] = useState<ExitType>("resignation");
  const [reason, setReason] = useState("");
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [noticeShortfall, setNoticeShortfall] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!employeeId || !lastWorkingDay) {
      setError("Please select an employee and last working day.");
      return;
    }
    setSaving(true);
    const res = await initiateExitRequest({
      companyId,
      employeeId,
      initiatedBy: currentUserId,
      exitType,
      reason,
      lastWorkingDay,
      noticeShortfallDays: noticeShortfall,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to submit.");
      return;
    }
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="hr-stat-icon-wrapper">
              <LogOut size={20} />
            </div>
            <div>
              <DialogTitle>
                {selfOnly ? "Submit Resignation" : "Initiate Employee Exit"}
              </DialogTitle>
              <p className="text-xs text-text-muted mt-0.5">
                {selfOnly
                  ? "Submit your resignation request to HR and management"
                  : "Record offboarding details and trigger clearance workflows"}
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Employee Selection */}
          {!selfOnly ? (
            <div className="hr-form-field">
              <label className="hr-form-label">
                Employee <span className="text-red-500">*</span>
              </label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="hr-select"
              >
                <option value="" disabled>
                  Select employee...
                </option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.job_title || "—"} • {e.department || "General"})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-surface-subtle border border-border flex items-center justify-between">
              <span className="text-xs text-text-muted">
                Submitting resignation as:
              </span>
              <span className="text-xs font-semibold text-text-primary">
                {selfProfile?.name}
              </span>
            </div>
          )}

          {/* Exit Type & Last Working Day in 2 Columns */}
          <div className="hr-form-grid hr-form-grid-2">
            <div className="hr-form-field">
              <label className="hr-form-label">
                Exit Type <span className="text-red-500">*</span>
              </label>
              <select
                value={exitType}
                onChange={(e) => setExitType(e.target.value as ExitType)}
                className="hr-select"
              >
                <option value="resignation">Resignation</option>
                {!selfOnly && <option value="termination">Termination</option>}
                <option value="retirement">Retirement</option>
              </select>
            </div>

            <div className="hr-form-field">
              <label className="hr-form-label">
                Last Working Day <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={lastWorkingDay}
                onChange={(e) => setLastWorkingDay(e.target.value)}
                className="hr-input"
              />
            </div>
          </div>

          {/* Notice Shortfall */}
          {!selfOnly && (
            <div className="hr-form-field">
              <div className="flex items-center justify-between">
                <label className="hr-form-label">
                  Notice Shortfall (days)
                </label>
                <span className="text-[11px] text-text-muted">0 if full notice served</span>
              </div>
              <input
                type="number"
                min={0}
                value={noticeShortfall}
                onChange={(e) => setNoticeShortfall(Math.max(0, Number(e.target.value)))}
                className="hr-input"
              />
            </div>
          )}

          {/* Reason / Notes */}
          <div className="hr-form-field">
            <label className="hr-form-label">
              Reason / Notes <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
              }}
              placeholder="Provide context or instructions for this exit..."
              className="hr-input hr-textarea-autogrow"
            />
          </div>
        </div>

        <DialogFooter className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="hr-btn hr-btn-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="hr-btn hr-btn-primary"
          >
            {saving ? "Submitting..." : selfOnly ? "Submit Resignation" : "Initiate Exit"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ExitTab Component ────────────────────────────────────────────────────

interface ExitTabProps {
  showToast: (msg: string, severity?: "success" | "error" | "info" | "warning") => void;
}

export function ExitTab({ showToast }: ExitTabProps) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [isHR, setIsHR] = useState(false);
  const [exitRequests, setExitRequests] = useState<ExitRequest[]>([]);
  const [myExitRequest, setMyExitRequest] = useState<ExitRequest | null>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState("Company");

  const [showInitiate, setShowInitiate] = useState(false);
  const [selectedReq, setSelectedReq] = useState<ExitRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (!prof) {
      setLoading(false);
      return;
    }

    setProfile(prof);
    const hrRole = prof.role === "admin" || prof.role === "hr";
    setIsHR(hrRole);

    // Fetch company name
    const { data: co } = await supabase
      .from("companies")
      .select("name")
      .eq("id", prof.company_id)
      .maybeSingle();
    if (co) setCompanyName(co.name);

    if (hrRole) {
      const [reqs, emps] = await Promise.all([
        fetchCompanyExitRequests(prof.company_id),
        supabase
          .from("profiles")
          .select("id, name, job_title, department")
          .eq("company_id", prof.company_id)
          .neq("id", user.id),
      ]);
      setExitRequests(reqs);
      setEmployees(emps.data || []);
    } else {
      const req = await fetchMyExitRequest(user.id);
      setMyExitRequest(req);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="hr-tab-container">
        <div className="hr-metrics-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // ── Employee Self-Service View ────────────────────────────────────────────
  if (!isHR) {
    const sc = myExitRequest ? statusConfig(myExitRequest.status) : null;

    return (
      <div className="hr-tab-container">
        <div className="hr-tab-header">
          <div className="hr-tab-title-group">
            <h2 className="hr-tab-title">Exit Management</h2>
            <p className="hr-tab-subtitle">
              Manage your resignation, clearance approvals, and offboarding journey
            </p>
          </div>
        </div>

        {!myExitRequest ? (
          <div className="hr-card p-8 text-center flex flex-col items-center justify-center">
            <div className="hr-empty-icon mb-3">
              <LogOut size={28} />
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-1">
              No active exit request
            </h3>
            <p className="text-xs text-text-muted max-w-md mb-5">
              If you wish to resign, you can initiate the process here. Your manager and HR team will be notified.
            </p>
            <button
              type="button"
              onClick={() => setShowInitiate(true)}
              className="hr-btn hr-btn-primary"
            >
              <LogOut size={16} />
              Submit Resignation
            </button>
          </div>
        ) : (
          <div className="hr-card overflow-hidden">
            {/* Status header */}
            <div className={`p-5 border-b border-border flex items-center gap-3 ${sc?.bg}`}>
              <div className="p-2 rounded-lg bg-surface border border-border">
                {sc?.icon}
              </div>
              <div>
                <h4 className={`text-sm font-semibold ${sc?.color}`}>{sc?.label}</h4>
                <p className="text-xs text-text-muted mt-0.5">
                  Last Working Day: {fmtDate(myExitRequest.last_working_day)}
                </p>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {myExitRequest.status === "pending" && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600 dark:text-amber-400">
                  Your resignation request is awaiting manager / HR approval.
                </div>
              )}
              {myExitRequest.status === "rejected" && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
                  Request rejected. {myExitRequest.manager_remarks && `Reason: ${myExitRequest.manager_remarks}`}
                </div>
              )}

              <button
                type="button"
                onClick={() => setSelectedReq(myExitRequest)}
                className="hr-btn hr-btn-secondary"
              >
                <Eye size={16} />
                View Offboarding Details & Clearances
              </button>
            </div>
          </div>
        )}

        {showInitiate && profile && (
          <InitiateExitDialog
            companyId={profile.company_id}
            currentUserId={profile.id}
            employees={[]}
            selfOnly
            selfProfile={{ id: profile.id, name: profile.name }}
            onDone={() => {
              setShowInitiate(false);
              showToast("Resignation submitted successfully", "success");
              load();
            }}
            onClose={() => setShowInitiate(false)}
          />
        )}

        {selectedReq && profile && (
          <DetailDialog
            req={selectedReq}
            isHR={false}
            currentUserId={profile.id}
            companyName={companyName}
            onClose={() => setSelectedReq(null)}
            onRefresh={load}
          />
        )}
      </div>
    );
  }

  // ── HR / Admin View ─────────────────────────────────────────────────────────
  const statusGroups: Record<string, ExitRequest[]> = {
    pending: exitRequests.filter((r) => r.status === "pending"),
    in_clearance: exitRequests.filter((r) => r.status === "in_clearance"),
    completed: exitRequests.filter((r) => r.status === "completed"),
    rejected: exitRequests.filter((r) => r.status === "rejected"),
  };

  return (
    <TooltipProvider>
      <div className="hr-tab-container">
        {/* Header */}
        <div className="hr-tab-header">
          <div className="hr-tab-title-group">
            <h2 className="hr-tab-title">Exit Management</h2>
            <p className="hr-tab-subtitle">
              {exitRequests.length} total • {statusGroups.pending.length} pending •{" "}
              {statusGroups.in_clearance.length} in clearance
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={load}
                  className="hr-btn-icon"
                >
                  <RefreshCw size={16} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>

            <button
              type="button"
              onClick={() => setShowInitiate(true)}
              className="hr-btn hr-btn-primary"
            >
              <Plus size={16} />
              Initiate Exit
            </button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="hr-metrics-grid">
          {[
            {
              label: "Pending",
              count: statusGroups.pending.length,
              color: "text-amber-600 dark:text-amber-400",
              bg: "text-amber-600 dark:text-amber-400",
              icon: <Clock size={16} />,
              desc: "Awaiting approval",
            },
            {
              label: "In Clearance",
              count: statusGroups.in_clearance.length,
              color: "text-purple-600 dark:text-purple-400",
              bg: "text-purple-600 dark:text-purple-400",
              icon: <ClipboardList size={16} />,
              desc: "Tasks in progress",
            },
            {
              label: "Completed",
              count: statusGroups.completed.length,
              color: "text-emerald-600 dark:text-emerald-400",
              bg: "text-emerald-600 dark:text-emerald-400",
              icon: <CheckCircle2 size={16} />,
              desc: "Relieved & closed",
            },
            {
              label: "Rejected",
              count: statusGroups.rejected.length,
              color: "text-red-600 dark:text-red-400",
              bg: "text-red-600 dark:text-red-400",
              icon: <XCircle size={16} />,
              desc: "Declined requests",
            },
          ].map(({ label, count, color, icon, desc }) => (
            <div
              key={label}
              className="hr-stat-card"
            >
              <div className="flex items-center justify-between">
                <span className="hr-stat-label">{label}</span>
                <span className="hr-stat-icon-wrapper">{icon}</span>
              </div>
              <p className={`hr-stat-value ${color}`}>{count}</p>
              <p className="text-[11px] text-text-muted">{desc}</p>
            </div>
          ))}
        </div>

        {/* Exit requests list */}
        {exitRequests.length === 0 ? (
          <div className="hr-card p-10 text-center flex flex-col items-center justify-center">
            <div className="hr-empty-icon mb-3">
              <LogOut size={28} />
            </div>
            <h3 className="text-base font-semibold text-text-primary mb-1">No exit requests yet</h3>
            <p className="text-xs text-text-muted max-w-md mb-5">
              There are currently no active employee resignations or offboarding requests. You can initiate one whenever needed.
            </p>
            <button
              type="button"
              onClick={() => setShowInitiate(true)}
              className="hr-btn hr-btn-primary"
            >
              <Plus size={16} />
              Initiate Employee Exit
            </button>
          </div>
        ) : (
          <div className="hr-exit-list">
            {exitRequests.map((req) => {
              const sc = statusConfig(req.status);
              return (
                <div
                  key={req.id}
                  onClick={() => setSelectedReq(req)}
                  className="hr-exit-item"
                >
                  <div className="hr-avatar">
                    {getInitials(req.employee?.name || "?")}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text-primary text-sm truncate">
                        {req.employee?.name || "Unknown Employee"}
                      </span>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-surface-subtle text-text-muted capitalize border border-border">
                        {req.exit_type}
                      </span>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      {req.employee?.job_title || "—"} • {req.employee?.department || "General"}
                    </p>
                  </div>

                  <div className="text-right flex flex-col items-end gap-1">
                    <span
                      className={`hr-exit-status-pill ${sc.bg} ${sc.color}`}
                    >
                      {sc.icon} {sc.label}
                    </span>
                    <p className="text-[11px] text-text-muted">
                      LWD: <b className="text-text-secondary">{fmtDate(req.last_working_day)}</b>
                    </p>
                  </div>

                  <ChevronRight size={18} className="text-text-muted flex-shrink-0" />
                </div>
              );
            })}
          </div>
        )}

        {showInitiate && profile && (
          <InitiateExitDialog
            companyId={profile.company_id}
            currentUserId={profile.id}
            employees={employees}
            onDone={() => {
              setShowInitiate(false);
              showToast("Exit request initiated", "success");
              load();
            }}
            onClose={() => setShowInitiate(false)}
          />
        )}

        {selectedReq && profile && (
          <DetailDialog
            req={selectedReq}
            isHR={isHR}
            currentUserId={profile.id}
            companyName={companyName}
            onClose={() => setSelectedReq(null)}
            onRefresh={() => {
              load();
              showToast("Exit request updated", "success");
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

