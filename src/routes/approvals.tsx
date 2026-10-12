import React, { useState, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import Layout from "../components/Layout";
import {
  Plus,
  ReceiptIndianRupee,
  CreditCard,
  Check,
  X,
  ArrowDownUp,
  ChevronLeft,
  ChevronRight,
  BriefcaseMedical,
  House,
  Clock,
  CalendarClock as CalendarClockIcon,
  CalendarDays,
  Search,
  Loader2,
  FileText,
  Paperclip,
  ChevronDown,
  Calendar,
  Layers,
  Inbox,
  Send,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  Info,
  Sparkles,
  ArrowLeft,
  Filter,
  Trash2,
  UploadCloud,
  Upload,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import {
  sendApprovalWhatsAppNotification,
  formatApprovalAmount,
  uploadApprovalAttachment,
} from "../lib/approvals";
import { createNotification } from "../lib/notifications";
import { sanitizeProfilePhoto } from "../lib/profile-photo";
import {
  getCompanyHolidays,
  getLeavePolicies,
  computeLeaveBalances,
  enumerateLeaveDates,
  getEmployeeEffectiveOffDays,
  isOffDay,
  applyScheduleOffDays,
  WEEKDAY_LABELS,
  DEFAULT_COMPANY_OFF_DAYS,
  type CompanyHoliday,
  type LeavePolicy,
  type LeaveBalance,
} from "../lib/leave";
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
} from "../components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../components/ui/tooltip";

export const Route = createFileRoute("/approvals")({
  head: () => ({
    title: "Teamstuff | Approvals Center",
    meta: [
      {
        name: "description",
        content: "Apply for leaves, submit reimbursement requests, and manage approval workflows.",
      },
    ],
  }),
  component: ApprovalsPage,
});

interface ApprovalRequest {
  id: string;
  type: "Leave" | "Reimbursement" | "Salary" | "Mediclaim" | "WFH" | "Attendance" | "Schedule";
  title: string;
  details: string;
  amount?: string;
  date: string;
  status: "Pending" | "Approved" | "Rejected";
  applicant: {
    id?: string;
    name: string;
    avatar?: string;
    role: string;
  };
  approver?: {
    id?: string;
    name: string;
    avatar?: string;
    role: string;
  };
  reason: string;
  startDate?: string;
  endDate?: string;
  attachment?: { name: string; url: string } | undefined;
}

function parseScheduleOffDays(details?: string): number[] {
  if (!details) return [];
  const match = /Off days:\s*(.+)/i.exec(details);
  if (!match || !match[1]) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .map((label) => WEEKDAY_LABELS.indexOf(label))
    .filter((i) => i >= 0);
}

type RequestType =
  "Leave" | "Reimbursement" | "Salary" | "Mediclaim" | "WFH" | "Attendance" | "Schedule";

const APPROVAL_TYPES_CONFIG: {
  value: RequestType;
  label: string;
  badge: string;
  modalTitle: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  guidelines: string[];
}[] = [
    {
      value: "Leave",
      label: "Leave",
      badge: "Time Off",
      modalTitle: "Apply for Leave",
      icon: <CalendarDays size={17.5} />,
      iconBg: "bg-blue-50 text-blue-600",
      iconColor: "text-blue-600",
      guidelines: [
        "24-hour advance notice for planned leave",
        "Medical note required if leave exceeds 2 days",
        "Quota balance auto-deducted upon approval",
      ],
    },
    {
      value: "WFH",
      label: "Work From Home",
      badge: "Remote Work",
      modalTitle: "Work From Home Request",
      icon: <House size={17.5} />,
      iconBg: "bg-emerald-50 text-emerald-600",
      iconColor: "text-emerald-600",
      guidelines: [
        "Stable high-speed internet & power required",
        "Active presence on Slack/Teams during core hours",
        "Coordinate active handovers with lead",
      ],
    },
    {
      value: "Attendance",
      label: "Regularisation",
      badge: "Punches & Shifts",
      modalTitle: "Attendance Regularisation",
      icon: <Clock size={17.5} />,
      iconBg: "bg-amber-50 text-amber-600",
      iconColor: "text-amber-600",
      guidelines: [
        "Submit within 3 business days of punch anomaly",
        "Specify reason for biometric discrepancy",
        "Ledger updates immediately upon approval",
      ],
    },
    {
      value: "Reimbursement",
      label: "Reimbursement",
      badge: "Claims & Receipts",
      modalTitle: "Expense Reimbursement",
      icon: <ReceiptIndianRupee size={17.5} />,
      iconBg: "bg-violet-50 text-violet-600",
      iconColor: "text-violet-600",
      guidelines: [
        "Attach valid GST/tax invoice or receipt",
        "Claims over ₹5,000 undergo secondary finance review",
        "Disbursed in the upcoming payroll cycle",
      ],
    },
    {
      value: "Salary",
      label: "Salary & Advance",
      badge: "Advance & Payroll",
      modalTitle: "Salary & Advance Request",
      icon: <CreditCard size={17.5} />,
      iconBg: "bg-indigo-50 text-indigo-600",
      iconColor: "text-indigo-600",
      guidelines: [
        "Advance capped at 50% of monthly net pay",
        "Structured repayment over 1–3 payroll cycles",
        "Requires HR & Finance executive clearance",
      ],
    },
    {
      value: "Mediclaim",
      label: "Mediclaim",
      badge: "Medical Claims",
      modalTitle: "Mediclaim Insurance Claim",
      icon: <BriefcaseMedical size={17.5} />,
      iconBg: "bg-rose-50 text-rose-600",
      iconColor: "text-rose-600",
      guidelines: [
        "Upload hospital discharge summary & prescriptions",
        "Covers employee and registered dependents",
        "Report cashless claims within 24h of admission",
      ],
    },
    {
      value: "Schedule",
      label: "Work Schedule",
      badge: "Weekly Roster",
      modalTitle: "Work Schedule Preference",
      icon: <CalendarClockIcon size={17.5} />,
      iconBg: "bg-cyan-50 text-cyan-600",
      iconColor: "text-cyan-600",
      guidelines: [
        "Select your weekly rest day preferences",
        "Adjustments effective next week upon approval",
        "Subject to team shift coverage and approval",
      ],
    },
  ];

const REQUEST_TYPE_OPTIONS = APPROVAL_TYPES_CONFIG;

const NOW = new Date();
const TODAY_PARTS = {
  d: String(NOW.getDate()).padStart(2, "0"),
  m: String(NOW.getMonth() + 1).padStart(2, "0"),
  y: String(NOW.getFullYear()),
};

function DateSelect({
  label,
  value,
  onChange,
  disablePast = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disablePast?: boolean;
}) {
  const minDate = disablePast
    ? `${TODAY_PARTS.y}-${TODAY_PARTS.m}-${TODAY_PARTS.d}`
    : undefined;

  return (
    <div className="approvals-form-group">
      <label className="approvals-form-label">{label}</label>
      <input
        type="date"
        value={value || ""}
        min={minDate}
        onChange={(e) => onChange(e.target.value)}
        className="approvals-form-input"
      />
    </div>
  );
}

function ApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<ApprovalRequest[]>([]);
  const [approvedByMeRequests, setApprovedByMeRequests] = useState<ApprovalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // View Mode: Explorer Table vs Inline Form Builder
  const [viewMode, setViewMode] = useState<"explorer" | "create">("explorer");

  // Navigation & Filter States
  const [activeView, setActiveView] = useState<"all" | "mine" | "toApprove" | "approvedByMe">("all");
  const [selectedCategory, setSelectedCategory] = useState<RequestType | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "Pending" | "Approved" | "Rejected">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);

  // Calendar State
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Withdraw Confirmation Modal State
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Form State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestType, setRequestType] = useState<RequestType>("Leave");
  const [attendanceRegType, setAttendanceRegType] = useState<
    "MISSING_CHECKOUT" | "LATE_ARRIVAL" | "EARLY_DEPARTURE" | ""
  >("MISSING_CHECKOUT");
  const [leaveType, setLeaveType] = useState("Casual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reimbursementCategory, setReimbursementCategory] = useState("Meals");
  const [amount, setAmount] = useState("");
  const [salaryRequestType, setSalaryRequestType] = useState("Salary Advance");
  const [mediclaimCategory, setMediclaimCategory] = useState("Hospitalization");
  const [hospitalName, setHospitalName] = useState("");
  const [scheduleOffDays, setScheduleOffDays] = useState<number[]>([]);
  const [reason, setReason] = useState("");

  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
    role: string;
    rawRole: string;
    companyId: string;
    reportingTo?: string | null;
  } | null>(null);
  const [potentialApprovers, setPotentialApprovers] = useState<
    { id: string; name: string; role: string; phone?: string; avatar?: string; isReportingManager?: boolean }[]
  >([]);
  const [selectedApproverId, setSelectedApproverId] = useState<string>("");
  const [attachment, setAttachment] = useState<{ name: string; url: string } | null>(null);
  const [attachmentBase64, setAttachmentBase64] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showAllLeaveBalances, setShowAllLeaveBalances] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicy[]>([]);
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [myOffDays, setMyOffDays] = useState<number[]>(DEFAULT_COMPANY_OFF_DAYS);
  const [teamLeaves, setTeamLeaves] = useState<
    {
      id: string;
      employee_id: string;
      name: string;
      job_title?: string;
      title: string;
      type: string;
      status: string;
      reason?: string;
      details?: string;
      amount?: string;
      start_date: string;
      end_date: string;
    }[]
  >([]);

  const initDataRef = useRef(false);

  const loadLeaveData = async (userObj?: typeof currentUser) => {
    const user = userObj || currentUser;
    if (!user) return;
    try {
      const pols = await getLeavePolicies(user.companyId);
      setLeavePolicies(pols);
      if (pols.length > 0 && !leaveType) {
        setLeaveType(pols[0].leave_type);
      }
      const hols = await getCompanyHolidays(user.companyId);
      setHolidays(hols);
      const off = await getEmployeeEffectiveOffDays(user.companyId, user.id);
      setMyOffDays(off);

      const { data: teamData } = await supabase
        .from("approvals")
        .select("id, employee_id, title, type, status, reason, details, amount, start_date, end_date, created_at, profiles!employee_id(name, job_title)")
        .eq("company_id", user.companyId)
        .in("type", ["Leave", "WFH", "Reimbursement", "Salary", "Mediclaim"])
        .in("status", ["Approved", "Pending"]);

      if (teamData) {
        setTeamLeaves(
          teamData.map((d: any) => ({
            id: d.id,
            employee_id: d.employee_id,
            name: d.profiles?.name || "Colleague",
            job_title: d.profiles?.job_title || "",
            title: d.title || `${d.type} Request`,
            type: d.type || "Leave",
            status: d.status || "Approved",
            reason: d.reason || "",
            details: d.details || "",
            amount: d.amount ? formatApprovalAmount(d.amount) : undefined,
            start_date: d.start_date || (d.created_at ? d.created_at.slice(0, 10) : ""),
            end_date: d.end_date || d.start_date || (d.created_at ? d.created_at.slice(0, 10) : ""),
          })),
        );
      }
    } catch (e) {
      console.error("Error loading leave policies:", e);
    }
  };

  const loadRequests = async (userObj?: typeof currentUser, showSkeleton: boolean = false) => {
    const user = userObj || currentUser;
    if (!user) return;
    if (showSkeleton) {
      setIsLoading(true);
    }
    try {
      const [allProfilesRes, myDataRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, name, role, job_title, profile_photo")
          .eq("company_id", user.companyId),
        supabase
          .from("approvals")
          .select(
            "id, type, title, details, amount, status, reason, start_date, end_date, attachment, created_at, approver_id, employee_id",
          )
          .eq("employee_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      const profileMap = new Map((allProfilesRes.data || []).map((p: any) => [p.id, p]));
      const myData = myDataRes.data;

      const isManagerOrAdmin =
        ["admin", "hr", "manager"].includes(user.rawRole.toLowerCase()) ||
        Boolean(user.reportingTo) ||
        (typeof window !== "undefined" && Boolean(sessionStorage.getItem("impersonated_company")));

      let incomingData: any[] = [];
      if (isManagerOrAdmin) {
        const { data: inc } = await supabase
          .from("approvals")
          .select(
            "id, type, title, details, amount, status, reason, start_date, end_date, attachment, created_at, approver_id, employee_id",
          )
          .eq("approver_id", user.id)
          .eq("status", "Pending")
          .order("created_at", { ascending: false });
        if (inc) incomingData = inc;
      }

      const { data: actionedData } = await supabase
        .from("approvals")
        .select(
          "id, type, title, details, amount, status, reason, start_date, end_date, attachment, created_at, approver_id, employee_id",
        )
        .eq("approver_id", user.id)
        .neq("status", "Pending")
        .order("created_at", { ascending: false });

      const formatRow = (r: any): ApprovalRequest => {
        const applicantProfile = profileMap.get(r.employee_id);
        const approverProfile = r.approver_id ? profileMap.get(r.approver_id) : null;

        return {
          id: r.id,
          type: r.type,
          title: r.title,
          details: r.details,
          amount: r.amount ? formatApprovalAmount(r.amount) : undefined,
          date: r.created_at,
          status: r.status,
          applicant: {
            id: r.employee_id,
            name: applicantProfile?.name || (r.employee_id === user.id ? user.name : "Team Member"),
            role: applicantProfile?.job_title || applicantProfile?.role || "Employee",
            avatar: sanitizeProfilePhoto(applicantProfile?.profile_photo) || undefined,
          },
          approver: approverProfile
            ? {
              id: approverProfile.id,
              name: approverProfile.name || "Approver",
              role: approverProfile.job_title || approverProfile.role || "Approver",
              avatar: sanitizeProfilePhoto(approverProfile.profile_photo) || undefined,
            }
            : undefined,
          reason: r.reason,
          startDate: r.start_date,
          endDate: r.end_date,
          attachment: r.attachment,
        };
      };

      const formattedMy = (myData || []).map(formatRow);
      const formattedIncoming = incomingData.map(formatRow);
      const formattedActioned = (actionedData || []).map(formatRow);

      setRequests(formattedMy);
      setIncomingRequests(formattedIncoming);
      setApprovedByMeRequests(formattedActioned);

      if (!selectedRequest && formattedIncoming.length > 0) {
        setSelectedRequest(formattedIncoming[0]);
      } else if (!selectedRequest && formattedMy.length > 0) {
        setSelectedRequest(formattedMy[0]);
      }
    } catch (e) {
      console.error("Failed to load approval requests:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initDataRef.current) return;
    initDataRef.current = true;

    const initApprovalsPage = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, name, role, job_title, company_id, reporting_to")
          .eq("id", user.id)
          .single();

        if (!profile) {
          setIsLoading(false);
          return;
        }

        const userObj = {
          id: profile.id,
          name: profile.name || "Employee",
          role: profile.job_title || profile.role || "Team Member",
          rawRole: profile.role || "",
          companyId: profile.company_id,
          reportingTo: profile.reporting_to,
        };
        setCurrentUser(userObj);

        // Fetch colleagues & approvers in background
        supabase
          .from("profiles")
          .select("id, name, role, job_title, phone, profile_photo")
          .eq("company_id", profile.company_id)
          .neq("id", user.id)
          .then(({ data: colleagues }) => {
            if (colleagues) {
              const reportingManager = profile.reporting_to
                ? colleagues.find((c: any) => c.id === profile.reporting_to)
                : null;

              if (reportingManager) {
                const assigned = [
                  {
                    id: reportingManager.id,
                    name: reportingManager.name || "Reporting Manager",
                    role: reportingManager.job_title || reportingManager.role || "Reporting Manager",
                    phone: reportingManager.phone || "",
                    avatar: sanitizeProfilePhoto(reportingManager.profile_photo) || "",
                    isReportingManager: true,
                  },
                ];
                setPotentialApprovers(assigned);
                setSelectedApproverId(reportingManager.id);
              } else {
                const managers = colleagues
                  .filter((c: any) => ["admin", "hr", "manager"].includes(c.role?.toLowerCase()) || c.job_title)
                  .map((c: any) => ({
                    id: c.id,
                    name: c.name || "Unknown Approver",
                    role: c.job_title || c.role || "Approver",
                    phone: c.phone || "",
                    avatar: sanitizeProfilePhoto(c.profile_photo) || "",
                    isReportingManager: false,
                  }));
                setPotentialApprovers(managers);
                setSelectedApproverId(managers[0]?.id ?? "");
              }
            }
          });

        // Parallel fetch of leave metadata & approval requests
        await Promise.all([
          loadRequests(userObj, false),
          loadLeaveData(userObj),
        ]);
      } catch (err) {
        console.error("Initialization error in approvals:", err);
      } finally {
        setIsLoading(false);
      }
    };

    initApprovalsPage();
  }, []);

  const handleCreateRequest = async () => {
    if (!currentUser) return;
    if (!reason.trim()) {
      toast.error("Please provide a reason / justification.");
      return;
    }

    setIsSubmitting(true);
    try {
      let title = `${requestType} Request`;
      let details = "";
      let calculatedDays = 1;

      if (requestType === "Leave") {
        title = `${leaveType} Leave Request`;
        if (startDate && endDate) {
          const dates = enumerateLeaveDates(startDate, endDate);
          const workingDates = dates.filter(
            (d) => !isOffDay(d, myOffDays) && !holidays.some((h) => h.holiday_date === d),
          );
          calculatedDays = workingDates.length;
          details = `${leaveType} (${calculatedDays} working day${calculatedDays === 1 ? "" : "s"}): ${startDate} to ${endDate}`;
        } else {
          details = `${leaveType} Leave on ${startDate || "single date"}`;
        }
      } else if (requestType === "Reimbursement") {
        title = `Expense: ${reimbursementCategory}`;
        details = `Category: ${reimbursementCategory}`;
      } else if (requestType === "Salary") {
        title = `Salary Request: ${salaryRequestType}`;
        details = salaryRequestType;
      } else if (requestType === "WFH") {
        title = "Work From Home Request";
        details = startDate && endDate ? `${startDate} to ${endDate}` : startDate || "Single day";
      } else if (requestType === "Attendance") {
        const typeLabels: Record<string, string> = {
          MISSING_CHECKOUT: "Missing Clock-Out",
          LATE_ARRIVAL: "Late Arrival",
          EARLY_DEPARTURE: "Early Departure",
        };
        title = `Attendance Regularization — ${typeLabels[attendanceRegType] || attendanceRegType}`;
        details = `Regularization for ${startDate || "Date"}`;
      } else if (requestType === "Mediclaim") {
        title = `Mediclaim Claim: ${mediclaimCategory}`;
        details = `${mediclaimCategory} (${hospitalName || "Hospital Claim"})`;
      } else if (requestType === "Schedule") {
        const offDayLabels = scheduleOffDays.map((i) => WEEKDAY_LABELS[i]).join(", ");
        title = "Weekly Work Schedule Preference";
        details = `Off days: ${offDayLabels}`;
      }

      let uploadedAttachment: { name: string; url: string } | undefined = undefined;
      if (attachmentBase64 && attachment) {
        const uploadRes = await uploadApprovalAttachment({
          data: {
            base64Data: attachmentBase64,
            fileName: attachment.name,
            companyId: currentUser.companyId,
          },
        });
        if (uploadRes.success && uploadRes.secure_url) {
          uploadedAttachment = { name: attachment.name, url: uploadRes.secure_url };
        } else {
          console.warn("Attachment upload warning:", uploadRes.error);
        }
      }

      const { data: inserted, error } = await supabase
        .from("approvals")
        .insert({
          company_id: currentUser.companyId,
          employee_id: currentUser.id,
          approver_id: selectedApproverId || null,
          type: requestType,
          title,
          details,
          amount: amount ? Number(amount) : null,
          reason,
          start_date: startDate || null,
          end_date: endDate || null,
          attachment: uploadedAttachment || null,
          status: "Pending",
        })
        .select()
        .single();

      if (error) throw error;

      if (selectedApproverId) {
        createNotification({
          userId: selectedApproverId,
          title: `New ${requestType} Request`,
          message: `${currentUser.name} submitted a ${requestType} request for your review.`,
          type: "approval_pending",
          link: "/approvals",
        }).catch((err) => console.error("Notification trigger error:", err));

        const chosenApprover = potentialApprovers.find((a) => a.id === selectedApproverId);
        if (chosenApprover?.phone) {
          sendApprovalWhatsAppNotification({
            approverPhone: chosenApprover.phone,
            approverName: chosenApprover.name,
            applicantName: currentUser.name,
            requestType,
            requestTitle: title,
            details,
            amount: amount ? `₹${amount}` : undefined,
            reason,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
          }).catch((err) => console.error("WhatsApp notification error:", err));
        }
      }

      toast.success("Approval request submitted!");
      resetForm();
      setViewMode("explorer");
      await loadRequests();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to submit approval request");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActionRequest = async (id: string, newStatus: "Approved" | "Rejected") => {
    const all = [...incomingRequests, ...requests, ...approvedByMeRequests];
    const req = all.find((r) => r.id === id);
    if (!req || !currentUser) return;

    try {
      const { error } = await supabase
        .from("approvals")
        .update({
          status: newStatus,
          approver_id: currentUser.id,
        })
        .eq("id", id);
      if (error) throw error;

      if (req.type === "Schedule" && newStatus === "Approved" && req.applicant.id) {
        const offDays = parseScheduleOffDays(req.details);
        if (offDays.length > 0) {
          await applyScheduleOffDays(currentUser.companyId, req.applicant.id, offDays);
        }
      }

      if (req.applicant.id) {
        createNotification({
          userId: req.applicant.id,
          title: `Request ${newStatus}`,
          message: `Your request "${req.title}" was ${newStatus.toLowerCase()} by ${currentUser.name}.`,
          type: newStatus === "Approved" ? "approval_approved" : "approval_rejected",
          link: "/approvals",
        }).catch((err) => console.error("In-app notification error:", err));
      }

      toast.success(`Request ${newStatus.toLowerCase()} successfully`);
      await loadRequests();
      if (selectedRequest?.id === id) {
        setSelectedRequest({ ...req, status: newStatus });
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || `Failed to ${newStatus.toLowerCase()} request`);
    }
  };

  const confirmWithdrawRequest = async () => {
    if (!currentUser || !selectedRequest) return;
    setIsWithdrawing(true);

    try {
      const { error } = await supabase
        .from("approvals")
        .delete()
        .eq("id", selectedRequest.id)
        .eq("employee_id", currentUser.id);

      if (error) throw error;

      toast.success("Approval request withdrawn");
      setWithdrawModalOpen(false);
      setSelectedRequest(null);
      await loadRequests();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to withdraw request");
    } finally {
      setIsWithdrawing(false);
    }
  };


  const resetForm = () => {
    setReason("");
    setStartDate("");
    setEndDate("");
    setAmount("");
    setHospitalName("");
    setAttachment(null);
    setAttachmentBase64(null);
  };

  const handleFileObject = (file: File) => {
    setAttachment({ name: file.name, url: "" });
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAttachmentBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileObject(file);
  };

  // Build Unified & Filtered Requests
  const allUniqueRequestsMap = new Map<string, ApprovalRequest>();
  [...incomingRequests, ...requests, ...approvedByMeRequests].forEach((r) => {
    allUniqueRequestsMap.set(r.id, r);
  });
  const allRequests = Array.from(allUniqueRequestsMap.values());

  // Dynamic Leave Balances for Logged-In User
  const userApprovedLeaves = React.useMemo(() => {
    return requests
      .filter((r) => r.type === "Leave" && r.status === "Approved")
      .map((r) => ({
        title: r.title,
        start_date: r.startDate || r.date,
        end_date: r.endDate,
      }));
  }, [requests]);

  const leaveBalances: LeaveBalance[] = React.useMemo(() => {
    if (!leavePolicies || leavePolicies.length === 0) return [];
    return computeLeaveBalances(
      leavePolicies,
      userApprovedLeaves,
      new Date().getFullYear(),
      {
        offDays: myOffDays,
        holidays: holidays.map((h) => h.date),
      },
    );
  }, [leavePolicies, userApprovedLeaves, myOffDays, holidays]);

  // Filter based on activeView & selectedCategory
  let baseList: ApprovalRequest[] = [];
  if (selectedCategory) {
    baseList = allRequests.filter(
      (r) => r.type?.toLowerCase() === selectedCategory.toLowerCase(),
    );
  } else if (activeView === "mine") {
    baseList = requests;
  } else if (activeView === "toApprove") {
    baseList = incomingRequests;
  } else if (activeView === "approvedByMe") {
    baseList = approvedByMeRequests;
  } else {
    baseList = allRequests;
  }

  // Filter by status tab
  if (statusFilter !== "ALL") {
    baseList = baseList.filter((r) => r.status === statusFilter);
  }

  // Filter by search query
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    baseList = baseList.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.applicant.name.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        (r.details && r.details.toLowerCase().includes(q)),
    );
  }

  // Sort
  const filteredRequests = [...baseList].sort((a, b) => {
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    return sortOrder === "desc" ? dateB - dateA : dateA - dateB;
  });

  const getCategoryCount = (type: RequestType) => {
    return allRequests.filter(
      (r) => r.type?.toLowerCase() === type.toLowerCase(),
    ).length;
  };

  const getPendingCategoryCount = (type: RequestType) => {
    return allRequests.filter(
      (r) => r.type?.toLowerCase() === type.toLowerCase() && r.status === "Pending",
    ).length;
  };

  let approvalsSubLabel = "All Requests";
  if (viewMode === "create") {
    approvalsSubLabel = activeTypeConfig ? `New ${activeTypeConfig.label} Request` : "New Request";
  } else if (selectedCategory) {
    const catCfg = APPROVAL_TYPES_CONFIG.find((c) => c.value === selectedCategory);
    approvalsSubLabel = catCfg ? `${catCfg.label} Requests` : `${selectedCategory} Requests`;
  } else if (activeView === "mine") {
    approvalsSubLabel = "My Submissions";
  } else if (activeView === "toApprove") {
    approvalsSubLabel = "To Review";
  } else if (activeView === "approvedByMe") {
    approvalsSubLabel = "Actioned by Me";
  }

  return (
    <TooltipProvider>
      <Layout
        activeTab="Approvals"
        disablePadding
        breadcrumbs={[
          { label: "Work" },
          { label: "Approvals", href: "/approvals" },
          { label: approvalsSubLabel },
        ]}
      >
        <div className="approvals-app-container">
          {/* =================================================================
              LEFT SIDEBAR: Category Tree, Views & + New Request
              ================================================================= */}
          <aside className="approvals-sidebar">
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* + New Request Dropdown Button using Radix DropdownMenu */}
              <div className="approvals-new-btn-wrapper">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className="approvals-new-btn">
                      <Plus size={15} />
                      <span>New Request</span>
                      <ChevronDown size={14} style={{ opacity: 0.8, marginLeft: "auto" }} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    sideOffset={6}
                    className="approvals-dropdown-content"
                  >
                    {APPROVAL_TYPES_CONFIG.map((cfg) => {
                      const iconBgColor =
                        cfg.value === "Leave"
                          ? "#eff6ff"
                          : cfg.value === "WFH"
                            ? "#ecfdf5"
                            : cfg.value === "Attendance"
                              ? "#fffbeb"
                              : cfg.value === "Reimbursement"
                                ? "#f5f3ff"
                                : cfg.value === "Salary"
                                  ? "#eef2ff"
                                  : cfg.value === "Mediclaim"
                                    ? "#fff1f2"
                                    : "#ecfeff";

                      const iconTextColor =
                        cfg.value === "Leave"
                          ? "#2563eb"
                          : cfg.value === "WFH"
                            ? "#059669"
                            : cfg.value === "Attendance"
                              ? "#d97706"
                              : cfg.value === "Reimbursement"
                                ? "#7c3aed"
                                : cfg.value === "Salary"
                                  ? "#4f46e5"
                                  : cfg.value === "Mediclaim"
                                    ? "#e11d48"
                                    : "#0891b2";

                      return (
                        <DropdownMenuItem
                          key={cfg.value}
                          onClick={() => {
                            setRequestType(cfg.value);
                            resetForm();
                            setViewMode("create");
                          }}
                          className="approvals-dropdown-item"
                        >
                          <div
                            className="approvals-dropdown-item-icon"
                            style={{ backgroundColor: iconBgColor, color: iconTextColor }}
                          >
                            {cfg.icon}
                          </div>
                          <div className="approvals-dropdown-item-content">
                            <span className="approvals-dropdown-item-label">{cfg.label}</span>
                            <span className="approvals-dropdown-item-badge">{cfg.badge}</span>
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Navigation Views Tree */}
              <div className="approvals-nav-groups">
                <div>
                  <div className="approvals-nav-group-title">Views</div>
                  <div className="approvals-nav-list">
                    <button
                      type="button"
                      className={`approvals-nav-item ${viewMode === "explorer" && activeView === "all" && !selectedCategory ? "active" : ""}`}
                      onClick={() => {
                        setViewMode("explorer");
                        setActiveView("all");
                        setSelectedCategory(null);
                      }}
                    >
                      <div className="approvals-nav-item-left">
                        <Layers size={15} />
                        <span>All Requests</span>
                      </div>
                      <span className="approvals-nav-badge">{allRequests.length}</span>
                    </button>

                    <button
                      type="button"
                      className={`approvals-nav-item ${viewMode === "explorer" && activeView === "mine" && !selectedCategory ? "active" : ""}`}
                      onClick={() => {
                        setViewMode("explorer");
                        setActiveView("mine");
                        setSelectedCategory(null);
                      }}
                    >
                      <div className="approvals-nav-item-left">
                        <Send size={15} />
                        <span>My Submissions</span>
                      </div>
                      <span className="approvals-nav-badge">{requests.length}</span>
                    </button>

                    <button
                      type="button"
                      className={`approvals-nav-item ${viewMode === "explorer" && activeView === "toApprove" && !selectedCategory ? "active" : ""}`}
                      onClick={() => {
                        setViewMode("explorer");
                        setActiveView("toApprove");
                        setSelectedCategory(null);
                      }}
                    >
                      <div className="approvals-nav-item-left">
                        <Inbox size={15} />
                        <span>To Review</span>
                      </div>
                      <span
                        className={`approvals-nav-badge ${incomingRequests.length > 0 ? "pending" : ""}`}
                      >
                        {incomingRequests.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      className={`approvals-nav-item ${viewMode === "explorer" && activeView === "approvedByMe" && !selectedCategory ? "active" : ""}`}
                      onClick={() => {
                        setViewMode("explorer");
                        setActiveView("approvedByMe");
                        setSelectedCategory(null);
                      }}
                    >
                      <div className="approvals-nav-item-left">
                        <CheckCircle2 size={15} />
                        <span>Actioned by Me</span>
                      </div>
                      <span className="approvals-nav-badge">{approvedByMeRequests.length}</span>
                    </button>
                  </div>
                </div>

                {/* Request Types Tree */}
                <div>
                  <div className="approvals-nav-group-title">Request Types</div>
                  <div className="approvals-nav-list">
                    {APPROVAL_TYPES_CONFIG.map((cfg) => {
                      const count = getCategoryCount(cfg.value);
                      const pending = getPendingCategoryCount(cfg.value);
                      const isSelected = viewMode === "explorer" && selectedCategory === cfg.value;

                      return (
                        <button
                          key={cfg.value}
                          type="button"
                          className={`approvals-nav-item ${isSelected ? "active" : ""}`}
                          onClick={() => {
                            setViewMode("explorer");
                            setActiveView("all");
                            setSelectedCategory(cfg.value);
                          }}
                        >
                          <div className="approvals-nav-item-left">
                            <span style={{ display: "flex", alignItems: "center" }}>{cfg.icon}</span>
                            <span>{cfg.label}</span>
                          </div>
                          <span className={`approvals-nav-badge ${pending > 0 ? "pending" : ""}`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Leave Quota Summary Card */}
            <div className="approvals-quota-section">
              <div className="approvals-quota-header">
                <span>Leave Balance</span>
                {leaveBalances.length > 3 ? (
                  <button
                    type="button"
                    className="approvals-quota-toggle-btn"
                    onClick={() => setShowAllLeaveBalances((prev) => !prev)}
                    title={showAllLeaveBalances ? "Show fewer categories" : "Show all categories"}
                  >
                    <span>{showAllLeaveBalances ? "Less" : `+${leaveBalances.length - 3} more`}</span>
                    <ChevronDown
                      size={12}
                      style={{
                        transform: showAllLeaveBalances ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s ease",
                      }}
                    />
                  </button>
                ) : (
                  <Calendar size={13} />
                )}
              </div>
              <div className="approvals-quota-pills">
                {leaveBalances.length > 0 ? (
                  (showAllLeaveBalances ? leaveBalances : leaveBalances.slice(0, 3)).map((b) => {
                    const remaining = Math.max(0, b.quota - b.used);
                    return (
                      <div
                        key={b.leaveType}
                        className="approvals-quota-pill"
                        title={`${remaining} remaining of ${b.quota} ${b.quotaPeriod} (${b.used} used)`}
                      >
                        <span className="approvals-quota-pill-value">{remaining}</span>
                        <span className="approvals-quota-pill-label">{b.leaveType}</span>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", fontSize: "11.5px", color: "#94a3b8", padding: "4px 0" }}>
                    No policies configured
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* =================================================================
              CENTER MAIN CONTENT: Explorer Table OR Inline Request Form
              ================================================================= */}
          <main className="approvals-main">
            {viewMode === "create" ? (
              /* Inline Request Creation Form with Fixed Header & Fixed Footer */
              <div className="approvals-create-layout">
                {/* 1. Persistent Fixed Topbar */}
                <div className="approvals-topbar approvals-create-topbar">
                  <div className="approvals-breadcrumbs">
                    <span
                      className="approvals-breadcrumb-link"
                      onClick={() => setViewMode("explorer")}
                    >
                      Approvals
                    </span>
                    <ChevronRight size={14} />
                    <span className="approvals-breadcrumb-active">New Request</span>
                    <ChevronRight size={14} />
                    <span className="approvals-breadcrumb-active">{activeTypeConfig?.label}</span>
                  </div>

                  <button
                    type="button"
                    className="approvals-sort-btn"
                    onClick={() => setViewMode("explorer")}
                  >
                    <ArrowLeft size={13} />
                    <span>Back to Requests</span>
                  </button>
                </div>

                {/* 2. Scrollable Body */}
                <div className="approvals-create-body">
                  {/* Main Form Builder Card */}
                  <div className="approvals-create-container">
                    <div className="approvals-form-card">
                      {/* Header */}
                      <div className="approvals-form-header">
                        <div
                          className="approvals-form-icon-badge"
                          style={{
                            backgroundColor:
                              requestType === "Leave"
                                ? "#eff6ff"
                                : requestType === "WFH"
                                  ? "#ecfdf5"
                                  : requestType === "Attendance"
                                    ? "#fffbeb"
                                    : requestType === "Reimbursement"
                                      ? "#f5f3ff"
                                      : requestType === "Salary"
                                        ? "#eef2ff"
                                        : requestType === "Mediclaim"
                                          ? "#fff1f2"
                                          : "#ecfeff",
                            color:
                              requestType === "Leave"
                                ? "#2563eb"
                                : requestType === "WFH"
                                  ? "#059669"
                                  : requestType === "Attendance"
                                    ? "#d97706"
                                    : requestType === "Reimbursement"
                                      ? "#7c3aed"
                                      : requestType === "Salary"
                                        ? "#4f46e5"
                                        : requestType === "Mediclaim"
                                          ? "#e11d48"
                                          : "#0891b2",
                          }}
                        >
                          {activeTypeConfig?.icon}
                        </div>
                        <div className="approvals-form-header-meta">
                          <h2 className="approvals-form-title">{activeTypeConfig?.modalTitle || "New Request"}</h2>
                          <span className="approvals-form-subtitle">
                            Complete the fields below to submit for manager review.
                          </span>
                        </div>
                      </div>

                      {/* Form Fields */}
                      <div className="approvals-form-grid">
                        {/* Dynamic Sub-forms */}
                        {requestType === "Leave" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                            <div className="approvals-form-group">
                              <label className="approvals-form-label">Leave Type</label>
                              <select
                                value={leaveType}
                                onChange={(e) => setLeaveType(e.target.value)}
                                className="approvals-form-select"
                              >
                                {leavePolicies.length > 0 ? (
                                  leavePolicies.map((p) => (
                                    <option key={p.id} value={p.leave_type}>
                                      {p.leave_type} Leave
                                    </option>
                                  ))
                                ) : (
                                  <>
                                    <option value="Casual">Casual Leave</option>
                                    <option value="Sick">Sick Leave</option>
                                    <option value="Earned">Earned Leave</option>
                                    <option value="Half Day">Half Day</option>
                                    <option value="Short">Short Leave (2 Hours)</option>
                                  </>
                                )}
                              </select>
                            </div>
                            <div className="approvals-form-row">
                              <DateSelect label="Start Date" value={startDate} onChange={setStartDate} disablePast />
                              <DateSelect label="End Date" value={endDate} onChange={setEndDate} disablePast />
                            </div>
                          </div>
                        )}

                        {requestType === "WFH" && (
                          <div className="approvals-form-row">
                            <DateSelect label="Start Date" value={startDate} onChange={setStartDate} disablePast />
                            <DateSelect label="End Date" value={endDate} onChange={setEndDate} disablePast />
                          </div>
                        )}

                        {requestType === "Attendance" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                            <div className="approvals-form-group">
                              <label className="approvals-form-label">Regularization Reason</label>
                              <select
                                value={attendanceRegType}
                                onChange={(e) => setAttendanceRegType(e.target.value as any)}
                                className="approvals-form-select"
                              >
                                <option value="MISSING_CHECKOUT">Missing Clock-Out</option>
                                <option value="LATE_ARRIVAL">Late Arrival</option>
                                <option value="EARLY_DEPARTURE">Early Departure</option>
                              </select>
                            </div>
                            <DateSelect label="Target Date" value={startDate} onChange={setStartDate} />
                          </div>
                        )}

                        {requestType === "Reimbursement" && (
                          <div className="approvals-form-row">
                            <div className="approvals-form-group">
                              <label className="approvals-form-label">Expense Category</label>
                              <select
                                value={reimbursementCategory}
                                onChange={(e) => setReimbursementCategory(e.target.value)}
                                className="approvals-form-select"
                              >
                                <option value="Meals">Client Meals & Food</option>
                                <option value="Travel">Travel & Fuel</option>
                                <option value="Internet">Internet / Mobile</option>
                                <option value="Hardware">Hardware & Supplies</option>
                                <option value="Other">Other Expenses</option>
                              </select>
                            </div>
                            <div className="approvals-form-group">
                              <label className="approvals-form-label">Amount (₹)</label>
                              <input
                                type="number"
                                placeholder="e.g. 1500"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="approvals-form-input"
                              />
                            </div>
                          </div>
                        )}

                        {requestType === "Salary" && (
                          <div className="approvals-form-row">
                            <div className="approvals-form-group">
                              <label className="approvals-form-label">Category</label>
                              <select
                                value={salaryRequestType}
                                onChange={(e) => setSalaryRequestType(e.target.value)}
                                className="approvals-form-select"
                              >
                                <option value="Salary Advance">Salary Advance</option>
                                <option value="Tax Deduction">Tax Deduction Structure</option>
                                <option value="Appraisal">Compensation Appraisal</option>
                              </select>
                            </div>
                            <div className="approvals-form-group">
                              <label className="approvals-form-label">Amount (₹, optional)</label>
                              <input
                                type="number"
                                placeholder="e.g. 20000"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="approvals-form-input"
                              />
                            </div>
                          </div>
                        )}

                        {requestType === "Mediclaim" && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                            <div className="approvals-form-row">
                              <div className="approvals-form-group">
                                <label className="approvals-form-label">Claim Type</label>
                                <select
                                  value={mediclaimCategory}
                                  onChange={(e) => setMediclaimCategory(e.target.value)}
                                  className="approvals-form-select"
                                >
                                  <option value="Hospitalization">In-Patient Hospitalization</option>
                                  <option value="OPD">OPD Consultation & Pharmacy</option>
                                  <option value="Dental">Dental Care</option>
                                </select>
                              </div>
                              <div className="approvals-form-group">
                                <label className="approvals-form-label">Claim Amount (₹)</label>
                                <input
                                  type="number"
                                  placeholder="e.g. 35000"
                                  value={amount}
                                  onChange={(e) => setAmount(e.target.value)}
                                  className="approvals-form-input"
                                />
                              </div>
                            </div>
                            <div className="approvals-form-group">
                              <label className="approvals-form-label">Hospital / Clinic Name</label>
                              <input
                                type="text"
                                placeholder="e.g. Apollo Hospital"
                                value={hospitalName}
                                onChange={(e) => setHospitalName(e.target.value)}
                                className="approvals-form-input"
                              />
                            </div>
                          </div>
                        )}

                        {requestType === "Schedule" && (
                          <div className="approvals-form-group">
                            <label className="approvals-form-label">Select Weekly Off Days</label>
                            <div className="approvals-weekday-grid">
                              {WEEKDAY_LABELS.map((label, idx) => {
                                const isSelected = scheduleOffDays.includes(idx);
                                return (
                                  <button
                                    type="button"
                                    key={label}
                                    onClick={() => {
                                      setScheduleOffDays((prev) =>
                                        isSelected ? prev.filter((d) => d !== idx) : [...prev, idx],
                                      );
                                    }}
                                    className={`approvals-weekday-chip ${isSelected ? "selected" : ""}`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Custom Styled Attachment Dropzone for Reimbursement & Mediclaim */}
                        {(requestType === "Reimbursement" || requestType === "Mediclaim") && (
                          <div className="approvals-form-group">
                            <label className="approvals-form-label">
                              Supporting Document (Receipt / Bill)
                            </label>
                            {attachment ? (
                              <div className="approvals-file-preview-card">
                                <div className="approvals-file-preview-icon">
                                  <FileText size={18} />
                                </div>
                                <div className="approvals-file-preview-meta">
                                  <span className="approvals-file-preview-name">{attachment.name}</span>
                                  <span className="approvals-file-preview-tag">Attached & ready to submit</span>
                                </div>
                                <button
                                  type="button"
                                  className="approvals-file-preview-remove"
                                  onClick={() => {
                                    setAttachment(null);
                                    setAttachmentBase64(null);
                                    if (fileInputRef.current) fileInputRef.current.value = "";
                                  }}
                                  title="Remove document"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ) : (
                              <div
                                className={`approvals-file-dropzone ${isDragging ? "dragging" : ""}`}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  setIsDragging(true);
                                }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  setIsDragging(false);
                                  const file = e.dataTransfer.files?.[0];
                                  if (file) handleFileObject(file);
                                }}
                                onClick={() => fileInputRef.current?.click()}
                              >
                                <input
                                  ref={fileInputRef}
                                  type="file"
                                  accept="image/*,application/pdf"
                                  onChange={handleAttachmentUpload}
                                  style={{ display: "none" }}
                                />
                                <div className="approvals-file-dropzone-inner">
                                  <div className="approvals-file-dropzone-icon">
                                    <UploadCloud size={20} />
                                  </div>
                                  <div className="approvals-file-dropzone-text">
                                    <span className="approvals-file-dropzone-title">Click to upload or drag & drop</span>
                                    <span className="approvals-file-dropzone-desc">PDF, PNG, JPG (Max 10MB)</span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Approver Picker */}
                        <div className="approvals-form-group">
                          <label className="approvals-form-label">Designated Approver</label>
                          <select
                            value={selectedApproverId}
                            onChange={(e) => setSelectedApproverId(e.target.value)}
                            className="approvals-form-select"
                          >
                            {potentialApprovers.map((ap) => (
                              <option key={ap.id} value={ap.id}>
                                {ap.name} ({ap.role}) {ap.isReportingManager ? "— Reporting Manager" : ""}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Justification / Reason */}
                        <div className="approvals-form-group">
                          <label className="approvals-form-label">Justification / Comments</label>
                          <textarea
                            rows={3}
                            placeholder="Provide details or context for your request..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            required
                            className="approvals-form-textarea"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. True Fixed Bottom Footer */}
                <div className="approvals-create-footer">
                  <button
                    type="button"
                    onClick={() => setViewMode("explorer")}
                    className="approvals-form-cancel"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting || !reason.trim()}
                    onClick={handleCreateRequest}
                    className="approvals-form-submit"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Submitting...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Request</span>
                        <Send size={13} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* Explorer Table Browser View */
              <>
                {/* Minimalist Topbar */}
                <div className="approvals-topbar">
                  <div className="approvals-search-box">
                    <Search size={15} className="approvals-search-icon" />
                    <input
                      type="text"
                      placeholder="Search approvals"
                      className="approvals-search-input"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="approvals-search-clear-btn"
                        title="Clear search"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <div className="approvals-topbar-controls">
                    {/* Status Filter Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="approvals-filter-dropdown-btn">
                          <Filter size={13} style={{ opacity: 0.7 }} />
                          <span>{statusFilter === "ALL" ? "All Statuses" : statusFilter}</span>
                          <ChevronDown size={13} style={{ opacity: 0.6 }} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        sideOffset={6}
                        className="approvals-dropdown-menu-content"
                      >
                        {(["ALL", "Pending", "Approved", "Rejected"] as const).map((st) => (
                          <DropdownMenuItem
                            key={st}
                            onClick={() => setStatusFilter(st)}
                            className={`approvals-dropdown-menu-item ${statusFilter === st ? "active" : ""}`}
                          >
                            <span>{st === "ALL" ? "All Statuses" : st}</span>
                            {statusFilter === st && <Check size={14} style={{ marginLeft: "auto" }} />}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Team Calendar Action Button */}
                    <button
                      type="button"
                      className="approvals-icon-action-btn"
                      onClick={() => setCalendarOpen(true)}
                      title="Open Team Calendar"
                    >
                      <Calendar size={14} />
                      <span>Calendar</span>
                    </button>
                  </div>
                </div>

                {/* Content Body */}
                <div className="approvals-content">
                  {/* Breadcrumbs & Sorting Row */}
                  <div className="approvals-breadcrumbs-bar">
                    <div className="approvals-breadcrumbs">
                      <span>Approvals</span>
                      <ChevronRight size={14} />
                      <span className="approvals-breadcrumb-active">
                        {selectedCategory
                          ? APPROVAL_TYPES_CONFIG.find((c) => c.value === selectedCategory)?.label
                          : activeView === "mine"
                            ? "My Submissions"
                            : activeView === "toApprove"
                              ? "To Review"
                              : activeView === "approvedByMe"
                                ? "Actioned by Me"
                                : "All Requests"}
                      </span>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                        ({filteredRequests.length})
                      </span>
                    </div>

                    <button
                      type="button"
                      className="approvals-sort-btn"
                      onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
                    >
                      <ArrowDownUp size={13} />
                      <span>{sortOrder === "desc" ? "Newest First" : "Oldest First"}</span>
                    </button>
                  </div>

                  {/* Fluid Master Feed List (Zero Horizontal Scroll) */}
                  <div className="approvals-list-wrap">
                    {isLoading ? (
                      <div className="approvals-skeleton-feed" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="approvals-list-item" style={{ pointerEvents: "none", opacity: 0.9 }}>
                            <div className="approvals-item-icon ui-skeleton" style={{ width: 38, height: 38, borderRadius: 10 }} />
                            <div className="approvals-item-content">
                              <div className="approvals-item-header">
                                <div className="ui-skeleton" style={{ height: 14, width: `${50 - (i % 3) * 10}%`, borderRadius: 4 }} />
                                <div className="ui-skeleton" style={{ height: 20, width: 68, borderRadius: 999 }} />
                              </div>
                              <div className="approvals-item-meta" style={{ display: "flex", gap: 12, marginTop: 6 }}>
                                <div className="ui-skeleton" style={{ height: 11, width: `${65 - (i % 2) * 15}%`, borderRadius: 4 }} />
                              </div>
                              <div className="approvals-item-footer" style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                                <div className="ui-skeleton" style={{ height: 11, width: 80, borderRadius: 4 }} />
                                <div className="ui-skeleton" style={{ height: 11, width: 55, borderRadius: 4 }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : filteredRequests.length === 0 ? (
                      <div className="approvals-empty-state">
                        <FileText size={32} style={{ color: "#cbd5e1" }} />
                        <span className="approvals-empty-title">No requests found</span>
                        <span style={{ fontSize: "12.5px" }}>
                          There are no approval requests matching your selected filters.
                        </span>
                      </div>
                    ) : (
                      filteredRequests.map((req) => {
                        const isSelected = selectedRequest?.id === req.id;
                        const typeConfig = APPROVAL_TYPES_CONFIG.find((c) => c.value === req.type);

                        return (
                          <div
                            key={req.id}
                            className={`approvals-list-item ${isSelected ? "selected" : ""}`}
                            onClick={() => setSelectedRequest(req)}
                          >
                            {/* Icon Badge */}
                            <div className="approvals-item-icon">
                              {typeConfig?.icon || <FileText size={18} />}
                            </div>

                            {/* Item Content */}
                            <div className="approvals-item-content">
                              {/* Row 1: Title + Status Pill */}
                              <div className="approvals-item-header">
                                <span className="approvals-item-title">{req.title}</span>
                                <span
                                  className={`approvals-status-pill ${req.status === "Approved"
                                    ? "approved"
                                    : req.status === "Rejected"
                                      ? "rejected"
                                      : "pending"
                                    }`}
                                >
                                  {req.status === "Approved" ? (
                                    <CheckCircle2 size={12.5} />
                                  ) : req.status === "Rejected" ? (
                                    <XCircle size={12.5} />
                                  ) : (
                                    <AlertCircle size={12.5} />
                                  )}
                                  <span>{req.status}</span>
                                </span>
                              </div>

                              {/* Row 2: Applicant & Amount (Left) + Date (Bottom Right) */}
                              <div className="approvals-item-meta">
                                <div className="approvals-item-meta-left">
                                  <span style={{ fontWeight: 500, color: "#334155" }}>
                                    {req.applicant.name}
                                  </span>
                                  {req.amount && (
                                    <>
                                      <span className="approvals-item-meta-dot">•</span>
                                      <span className="approvals-item-amount">{req.amount}</span>
                                    </>
                                  )}
                                </div>
                                <span className="approvals-item-date">
                                  {new Date(req.date).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </main>

          {/* =================================================================
              RIGHT INSPECTOR / GUIDELINES PANEL
              ================================================================= */}
          <aside className="approvals-inspector">
            {viewMode === "create" ? (
              /* Guidelines & Quota during Request Creation */
              <>
                <div className="approvals-inspector-header">
                  <div>
                    <h3 className="approvals-inspector-title">
                      {activeTypeConfig?.label || "Request"} Guidelines
                    </h3>
                    <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--color-text-muted, #64748b)" }}>
                      Policy requirements & workflow
                    </p>
                  </div>
                </div>

                <div className="approvals-inspector-body">
                  <div className="approvals-inspector-section">
                    <span className="approvals-inspector-label">Policy Checklist</span>
                    <div className="approvals-guideline-card">
                      <div className="approvals-guideline-list">
                        {activeTypeConfig?.guidelines.map((item, idx) => (
                          <div key={idx} className="approvals-guideline-item">
                            <Info size={14} style={{ color: "#0284c7", flexShrink: 0, marginTop: "2px" }} />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="approvals-inspector-section">
                    <span className="approvals-inspector-label">Approval Process</span>
                    <div className="approvals-guideline-card">
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12.5px" }}>
                        <span style={{ fontWeight: 500, color: "#0f172a" }}>Fast Track Workflow</span>
                        <span style={{ color: "#64748b" }}>
                          Requests are routed directly to your assigned manager and alerted in real-time.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : selectedRequest ? (
              /* Selected Request Details */
              <>
                <div className="approvals-inspector-header">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3 className="approvals-inspector-title">
                      {selectedRequest.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="approvals-inspector-close"
                    onClick={() => setSelectedRequest(null)}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="approvals-inspector-body">
                  {/* Applicant Card */}
                  <div className="approvals-inspector-section">
                    <span className="approvals-inspector-label">Applicant</span>
                    <div className="approvals-applicant-card">
                      <div className="approvals-applicant-avatar">
                        {selectedRequest.applicant.avatar ? (
                          <img
                            src={selectedRequest.applicant.avatar}
                            alt=""
                            style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                          />
                        ) : (
                          selectedRequest.applicant.name.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="approvals-applicant-info">
                        <span className="approvals-applicant-name">
                          {selectedRequest.applicant.name}
                        </span>
                        <span className="approvals-applicant-role">
                          {selectedRequest.applicant.role}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Approver Card */}
                  <div className="approvals-inspector-section">
                    <span className="approvals-inspector-label">Approver</span>
                    <div className="approvals-applicant-card">
                      <div
                        className="approvals-applicant-avatar"
                        style={{
                          backgroundColor: selectedRequest.approver ? "#eff6ff" : "#f1f5f9",
                          color: selectedRequest.approver ? "#2563eb" : "#94a3b8",
                        }}
                      >
                        {selectedRequest.approver?.avatar ? (
                          <img
                            src={selectedRequest.approver.avatar}
                            alt=""
                            style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
                          />
                        ) : selectedRequest.approver ? (
                          selectedRequest.approver.name.slice(0, 2).toUpperCase()
                        ) : (
                          "—"
                        )}
                      </div>
                      <div className="approvals-applicant-info">
                        <span
                          className="approvals-applicant-name"
                          style={{
                            color: selectedRequest.approver ? "#0f172a" : "#64748b",
                          }}
                        >
                          {selectedRequest.approver?.name || "Not assigned"}
                        </span>
                        <span className="approvals-applicant-role">
                          {selectedRequest.approver?.role || (selectedRequest.status === "Pending" ? "Pending review" : "Not specified")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Key Information Details */}
                  <div className="approvals-inspector-section">
                    <span className="approvals-inspector-label">Request Information</span>
                    <div className="approvals-info-grid">
                      <div className="approvals-info-box">
                        <span className="approvals-info-box-label">Category</span>
                        <span className="approvals-info-box-value">{selectedRequest.type}</span>
                      </div>
                      <div className="approvals-info-box">
                        <span className="approvals-info-box-label">Submitted</span>
                        <span className="approvals-info-box-value">
                          {new Date(selectedRequest.date).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      {selectedRequest.amount && (
                        <div className="approvals-info-box" style={{ gridColumn: "span 2" }}>
                          <span className="approvals-info-box-label">Total Amount</span>
                          <span className="approvals-info-box-value">{selectedRequest.amount}</span>
                        </div>
                      )}
                      {selectedRequest.details && (
                        <div className="approvals-info-box" style={{ gridColumn: "span 2" }}>
                          <span className="approvals-info-box-label">Timing / Specification</span>
                          <span className="approvals-info-box-value">{selectedRequest.details}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reason / Justification */}
                  <div className="approvals-inspector-section">
                    <span className="approvals-inspector-label">Reason / Justification</span>
                    <div className="approvals-reason-box">{selectedRequest.reason || "No comments provided."}</div>
                  </div>

                  {/* Attachment Preview if any */}
                  {selectedRequest.attachment && (
                    <div className="approvals-inspector-section">
                      <span className="approvals-inspector-label">Supporting Document</span>
                      {selectedRequest.attachment.url?.startsWith("blob:") ? (
                        <div
                          className="approvals-attachment-btn-expired"
                          title="This document was stored in a previous browser session and has expired from local memory."
                        >
                          <AlertCircle size={14} style={{ color: "#d97706", flexShrink: 0 }} />
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {selectedRequest.attachment.name}
                          </span>
                          <span className="approvals-attachment-expired-tag">Session expired</span>
                        </div>
                      ) : (
                        <a
                          href={selectedRequest.attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="approvals-attachment-btn"
                        >
                          <Paperclip size={14} />
                          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                            {selectedRequest.attachment.name}
                          </span>
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                {selectedRequest.status === "Pending" && (
                  <div className="approvals-action-buttons">
                    {selectedRequest.applicant.id === currentUser?.id ? (
                      <button
                        type="button"
                        className="approvals-btn-withdraw"
                        onClick={() => setWithdrawModalOpen(true)}
                      >
                        <Trash2 size={15} />
                        <span>Withdraw Request</span>
                      </button>
                    ) : (
                      (currentUser &&
                        (["admin", "hr", "manager"].includes(currentUser.rawRole?.toLowerCase() || "") ||
                          Boolean(currentUser.reportingTo) ||
                          (typeof window !== "undefined" &&
                            Boolean(sessionStorage.getItem("impersonated_company"))))) && (
                        <>
                          <button
                            type="button"
                            className="approvals-btn-approve"
                            onClick={() => handleActionRequest(selectedRequest.id, "Approved")}
                          >
                            <Check size={15} />
                            <span>Approve</span>
                          </button>
                          <button
                            type="button"
                            className="approvals-btn-reject"
                            onClick={() => handleActionRequest(selectedRequest.id, "Rejected")}
                          >
                            <X size={15} />
                            <span>Reject</span>
                          </button>
                        </>
                      )
                    )}
                  </div>
                )}
              </>
            ) : isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                <div className="approvals-inspector-header">
                  <div className="ui-skeleton" style={{ height: 18, width: "60%", borderRadius: 4 }} />
                </div>
                <div className="approvals-inspector-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="approvals-inspector-section">
                    <div className="ui-skeleton" style={{ height: 11, width: 60, borderRadius: 4, marginBottom: 8 }} />
                    <div className="approvals-applicant-card" style={{ pointerEvents: "none" }}>
                      <div className="ui-skeleton ui-skeleton-circle" style={{ width: 38, height: 38 }} />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div className="ui-skeleton" style={{ height: 13, width: "70%", borderRadius: 4 }} />
                        <div className="ui-skeleton" style={{ height: 11, width: "45%", borderRadius: 4 }} />
                      </div>
                    </div>
                  </div>
                  <div className="approvals-inspector-section">
                    <div className="ui-skeleton" style={{ height: 11, width: 90, borderRadius: 4, marginBottom: 8 }} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div className="ui-skeleton" style={{ height: 48, borderRadius: 8 }} />
                      <div className="ui-skeleton" style={{ height: 48, borderRadius: 8 }} />
                    </div>
                  </div>
                  <div className="approvals-inspector-section">
                    <div className="ui-skeleton" style={{ height: 11, width: 110, borderRadius: 4, marginBottom: 8 }} />
                    <div className="ui-skeleton" style={{ height: 60, borderRadius: 8 }} />
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#94a3b8",
                  textAlign: "center",
                  gap: "8px",
                  fontSize: "12.5px",
                  padding: "20px",
                }}
              >
                <FileText size={28} />
                <span>Select a request from the list to preview details & actions</span>
              </div>
            )}
          </aside>

          {/* =================================================================
              TEAM CALENDAR MODAL
              ================================================================= */}
          <Dialog open={calendarOpen} onOpenChange={setCalendarOpen}>
            <DialogContent
              hideCornerClose={true}
              style={{
                maxWidth: "940px",
                width: "92vw",
                maxHeight: "90vh",
                overflowY: "auto",
                padding: "0",
                borderRadius: "16px",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface)",
              }}
            >
              {/* Minimal Modal Header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 0 0 20px",
                  height: "52px",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <DialogTitle
                  style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                    margin: 0,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Approvals Calendar
                </DialogTitle>

                <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginRight: "16px" }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (currentMonth === 0) {
                          setCurrentMonth(11);
                          setCurrentYear((y) => y - 1);
                        } else {
                          setCurrentMonth((m) => m - 1);
                        }
                      }}
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
                        border: "1px solid var(--color-border, #e4e4e7)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--color-text-secondary, #71717a)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      title="Previous Month"
                    >
                      <ChevronLeft size={14} />
                    </button>

                    <span
                      style={{
                        fontSize: "13.5px",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        minWidth: "100px",
                        textAlign: "center",
                      }}
                    >
                      {new Date(currentYear, currentMonth, 1).toLocaleString("default", {
                        month: "long",
                        year: "numeric",
                      })}
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        if (currentMonth === 11) {
                          setCurrentMonth(0);
                          setCurrentYear((y) => y + 1);
                        } else {
                          setCurrentMonth((m) => m + 1);
                        }
                      }}
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
                        border: "1px solid var(--color-border, #e4e4e7)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--color-text-secondary, #71717a)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      title="Next Month"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  {/* Corner Close Section */}
                  <button
                    type="button"
                    onClick={() => setCalendarOpen(false)}
                    style={{
                      height: "100%",
                      width: "52px",
                      border: "none",
                      borderLeft: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
                      borderTopRightRadius: "inherit",
                      borderBottomRightRadius: "0",
                      borderTopLeftRadius: "0",
                      borderBottomLeftRadius: "0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-text-secondary, #71717a)",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                    title="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div style={{ padding: "16px 20px 20px 20px" }}>
                {/* Calendar Grid with Shared 1px Line Separators */}
                {(() => {
                  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                  const firstDayWeekday = new Date(currentYear, currentMonth, 1).getDay();
                  const prevDaysInMonth = new Date(currentYear, currentMonth, 0).getDate();
                  const totalCells = Math.ceil((firstDayWeekday + daysInMonth) / 7) * 7;
                  const todayStr = new Date().toISOString().slice(0, 10);

                  return (
                    <div
                      style={{
                        border: "1px solid var(--color-border)",
                        borderRadius: "8px",
                        overflow: "hidden",
                        backgroundColor: "var(--color-border)",
                      }}
                    >
                      {/* Weekday Headers */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(7, 1fr)",
                          backgroundColor: "var(--color-surface-subtle)",
                          borderBottom: "1px solid var(--color-border)",
                          textAlign: "center",
                          padding: "8px 0",
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "var(--color-text-muted)",
                          textTransform: "uppercase",
                        }}
                      >
                        {WEEKDAY_LABELS.map((d) => (
                          <div key={d}>{d}</div>
                        ))}
                      </div>

                      {/* Day Cells */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(7, 1fr)",
                          gap: "1px",
                          backgroundColor: "var(--color-border)",
                        }}
                      >
                        {Array.from({ length: totalCells }).map((_, idx) => {
                          const isLeading = idx < firstDayWeekday;
                          const isTrailing = idx >= firstDayWeekday + daysInMonth;
                          let dayNum = 0;
                          let cellMonth = currentMonth;
                          let cellYear = currentYear;

                          if (isLeading) {
                            dayNum = prevDaysInMonth - firstDayWeekday + 1 + idx;
                            cellMonth = currentMonth === 0 ? 11 : currentMonth - 1;
                            cellYear = currentMonth === 0 ? currentYear - 1 : currentYear;
                          } else if (isTrailing) {
                            dayNum = idx - (firstDayWeekday + daysInMonth) + 1;
                            cellMonth = currentMonth === 11 ? 0 : currentMonth + 1;
                            cellYear = currentMonth === 11 ? currentYear + 1 : currentYear;
                          } else {
                            dayNum = idx - firstDayWeekday + 1;
                          }

                          const dayStr = `${cellYear}-${String(cellMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                          const isToday = dayStr === todayStr;
                          const holiday = holidays.find((h) => h.date === dayStr);
                          const weekday = new Date(cellYear, cellMonth, dayNum).getDay();
                          const isOffDay = myOffDays.includes(weekday);
                          const isWeekend = weekday === 0 || weekday === 6;

                          const eventsOnDay = teamLeaves.filter(
                            (l) => l.start_date <= dayStr && l.end_date >= dayStr,
                          );

                          const isMuted = isLeading || isTrailing;

                          return (
                            <div
                              key={idx}
                              style={{
                                minHeight: "96px",
                                backgroundColor: isMuted
                                  ? "var(--color-surface-subtle)"
                                  : holiday
                                    ? "rgba(239, 68, 68, 0.03)"
                                    : isOffDay
                                      ? "var(--color-surface-subtle)"
                                      : "var(--color-surface)",
                                opacity: isMuted ? 0.4 : 1,
                                padding: "6px 8px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                                overflow: "hidden",
                                transition: "background-color 0.15s ease",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  width: "100%",
                                }}
                              >
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: isToday ? "22px" : "auto",
                                    height: isToday ? "22px" : "auto",
                                    borderRadius: isToday ? "50%" : "0",
                                    backgroundColor: isToday ? "var(--color-primary, #3b82f6)" : "transparent",
                                    color: isToday ? "#ffffff" : isMuted ? "var(--color-text-muted)" : "var(--color-text-primary)",
                                    fontSize: "11.5px",
                                    fontWeight: isToday ? 600 : 500,
                                    padding: isToday ? "0" : "1px 3px",
                                  }}
                                >
                                  {dayNum}
                                </span>

                                {holiday && !isMuted ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span
                                        style={{
                                          fontSize: "8.5px",
                                          color: "#dc2626",
                                          fontWeight: 600,
                                          backgroundColor: "rgba(239, 68, 68, 0.1)",
                                          padding: "1px 4px",
                                          borderRadius: "3px",
                                          cursor: "default",
                                        }}
                                      >
                                        HOLIDAY
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      <div style={{ fontSize: "12px", fontWeight: 500 }}>
                                        Company Holiday: {holiday.name} ({holiday.holiday_type || "Mandatory"})
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : isWeekend && !isMuted ? (
                                  <span style={{ fontSize: "8.5px", color: "var(--color-text-muted)", fontWeight: 500 }}>
                                    WKND
                                  </span>
                                ) : isOffDay && !isMuted ? (
                                  <span style={{ fontSize: "8.5px", color: "var(--color-text-muted)", fontWeight: 500 }}>
                                    OFF
                                  </span>
                                ) : null}
                              </div>

                              {/* Holiday banner tag if active */}
                              {holiday && !isMuted && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div
                                      style={{
                                        fontSize: "9px",
                                        fontWeight: 500,
                                        backgroundColor: "rgba(239, 68, 68, 0.08)",
                                        color: "#dc2626",
                                        border: "1px solid rgba(239, 68, 68, 0.2)",
                                        borderRadius: "3px",
                                        padding: "2px 4px",
                                        whiteSpace: "nowrap",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        cursor: "pointer",
                                      }}
                                    >
                                      {holiday.name}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <div style={{ fontSize: "12px" }}>
                                      <strong>Holiday:</strong> {holiday.name} ({holiday.holiday_type || "Holiday"})
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              )}

                              {/* Approvals Events with Tooltips */}
                              {!isMuted && (
                                <div style={{ display: "flex", flexDirection: "column", gap: "3px", marginTop: "2px" }}>
                                  {eventsOnDay.slice(0, 3).map((l) => {
                                    const isWfh = l.type === "WFH";
                                    const isLeave = l.type === "Leave";
                                    const isFinance = l.type === "Reimbursement" || l.type === "Salary" || l.type === "Mediclaim";

                                    const badgeBg = isWfh
                                      ? "rgba(139, 92, 246, 0.1)"
                                      : isLeave
                                        ? "rgba(59, 130, 246, 0.1)"
                                        : "rgba(16, 185, 129, 0.1)";
                                    const badgeColor = isWfh ? "#7c3aed" : isLeave ? "#2563eb" : "#059669";
                                    const badgeBorder = isWfh
                                      ? "rgba(139, 92, 246, 0.25)"
                                      : isLeave
                                        ? "rgba(59, 130, 246, 0.25)"
                                        : "rgba(16, 185, 129, 0.25)";

                                    return (
                                      <Tooltip key={l.id}>
                                        <TooltipTrigger asChild>
                                          <div
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                              justifyContent: "space-between",
                                              gap: "3px",
                                              padding: "2px 5px",
                                              borderRadius: "3px",
                                              fontSize: "9.5px",
                                              fontWeight: 500,
                                              backgroundColor: badgeBg,
                                              color: badgeColor,
                                              border: `1px solid ${badgeBorder}`,
                                              width: "100%",
                                              whiteSpace: "nowrap",
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                              cursor: "pointer",
                                            }}
                                          >
                                            <span
                                              style={{
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                                fontWeight: 500,
                                              }}
                                            >
                                              {l.name}
                                            </span>
                                            <span style={{ fontSize: "8.5px", opacity: 0.8, textTransform: "uppercase" }}>
                                              {l.type}
                                            </span>
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent
                                          side="top"
                                          align="center"
                                          style={{
                                            maxWidth: "280px",
                                            padding: "10px 12px",
                                            zIndex: 1100,
                                            backgroundColor: "var(--color-surface, #ffffff)",
                                            color: "var(--color-text-primary, #0f172a)",
                                            border: "1px solid var(--color-border, #e2e8f0)",
                                            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
                                            borderRadius: "8px",
                                          }}
                                        >
                                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                                              <div>
                                                <strong style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>
                                                  {l.name}
                                                </strong>
                                                {l.job_title && (
                                                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block" }}>
                                                    {l.job_title}
                                                  </span>
                                                )}
                                              </div>
                                              <span
                                                style={{
                                                  fontSize: "9.5px",
                                                  fontWeight: 600,
                                                  padding: "2px 6px",
                                                  borderRadius: "4px",
                                                  backgroundColor: badgeBg,
                                                  color: badgeColor,
                                                  textTransform: "uppercase",
                                                }}
                                              >
                                                {l.status}
                                              </span>
                                            </div>
                                            <div style={{ fontSize: "11.5px", color: "var(--color-text-primary)", fontWeight: 500 }}>
                                              {l.type}: {l.title}
                                            </div>
                                            {l.start_date && (
                                              <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                                                Dates: {l.start_date} {l.end_date && l.end_date !== l.start_date ? `➔ ${l.end_date}` : ""}
                                              </div>
                                            )}
                                            {l.amount && (
                                              <div style={{ fontSize: "11.5px", fontWeight: 600, color: "#059669" }}>
                                                Amount: {l.amount}
                                              </div>
                                            )}
                                            {l.reason && (
                                              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)", fontStyle: "italic" }}>
                                                "{l.reason}"
                                              </div>
                                            )}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  })}

                                  {eventsOnDay.length > 3 && (
                                    <span style={{ fontSize: "9px", color: "var(--color-text-muted)", fontWeight: 500 }}>
                                      +{eventsOnDay.length - 3} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </DialogContent>
          </Dialog>

          {/* Withdraw Request Confirmation Dialog */}
          <Dialog open={withdrawModalOpen} onOpenChange={setWithdrawModalOpen}>
            <DialogContent
              style={{
                maxWidth: "430px",
                borderRadius: "14px",
                padding: "24px",
                backgroundColor: "#ffffff",
                border: "1px solid #e2e8f0",
                boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "10px",
                      backgroundColor: "#fee2e2",
                      color: "#dc2626",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={20} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#0f172a" }}>
                      Withdraw Approval Request
                    </h3>
                    <p style={{ margin: 0, fontSize: "13px", color: "#64748b", lineHeight: "1.5" }}>
                      Are you sure you want to withdraw this request? This action will permanently remove it from the approvals queue.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                  <button
                    type="button"
                    disabled={isWithdrawing}
                    onClick={() => setWithdrawModalOpen(false)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "7px",
                      border: "1px solid #cbd5e1",
                      backgroundColor: "#ffffff",
                      color: "#334155",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isWithdrawing}
                    onClick={confirmWithdrawRequest}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "7px",
                      border: "none",
                      backgroundColor: "#dc2626",
                      color: "#ffffff",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: isWithdrawing ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      transition: "all 0.15s ease",
                      opacity: isWithdrawing ? 0.7 : 1,
                    }}
                  >
                    {isWithdrawing ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Withdrawing...</span>
                      </>
                    ) : (
                      <span>Withdraw Request</span>
                    )}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </Layout>
    </TooltipProvider>
  );
}
