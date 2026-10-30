import React from "react";
import {
  Search,
  X as Close,
  SquarePen as Edit,
  Trash2 as Delete,
  Copy as ContentCopy,
  Check,
  ClipboardCheck as AssignmentTurnedIn,
  Flame as LocalFireDepartment,
  Trophy as EmojiEvents,
  Hourglass as HourglassEmpty,
  Plus as Add,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getAuthenticatedUserContext } from "../../lib/cloud-drive";
import { getCompanyShifts, type CompanyShift } from "../../lib/shifts";
import {
  adminOnboardEmployee,
  adminDeleteEmployee,
  adminUpdateEmployee,
} from "../../lib/onboarding";
import { CreateTaskDialog } from "../tasks/CreateTaskDialog";
import { PayslipsTab } from "./PayslipsTab";
import { PoliciesTab } from "./PoliciesTab";
import { LeaveTab } from "./LeaveTab";
import { InductionTab } from "./InductionTab";
import { MemoriesTab } from "./MemoriesTab";
import { AssetsTab } from "./AssetsTab";
import { ExitTab } from "./ExitTab";
import { DocumentsTab } from "./DocumentsTab";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { Avatar, AvatarFallback } from "../ui/avatar";

export type HRTabKey =
  | "hr-attendance"
  | "hr-onboard"
  | "hr-documents"
  | "hr-assets"
  | "hr-tasks"
  | "hr-payslips"
  | "hr-policies"
  | "hr-leave"
  | "hr-induction"
  | "hr-memories"
  | "hr-exit";

interface HRWorkspaceTabsProps {
  activeTab: HRTabKey;
  showToast: (msg: string, severity?: "success" | "error" | "info" | "warning") => void;
}

interface TaskTrendChartProps {
  createdData: number[];
  completedData: number[];
  pendingData: number[];
  chartLabels: string[];
  hrTasksDateFilter: string;
  W: number;
  H: number;
  PX: number;
  PY: number;
  chartN: number;
}

const TREND_SERIES = [
  { key: "created", label: "Created", color: "#71717a" },
  { key: "completed", label: "Completed", color: "#18181b" },
  { key: "pending", label: "Pending", color: "#a1a1aa" },
] as const;

function getAttendanceStatusChip(log: any): { label: string; className: string } {
  if (!log.clock_out) {
    return {
      label: "Checkout Missing",
      className: "hr-badge hr-badge-missing",
    };
  }
  const status = (log.status || "").toLowerCase();
  if (status === "present") {
    return { label: "Present", className: "hr-badge hr-badge-present" };
  }
  if (status === "late") {
    return { label: "Late", className: "hr-badge hr-badge-late" };
  }
  if (status === "half_day") {
    return { label: "Half Day", className: "hr-badge hr-badge-half-day" };
  }
  if (status === "absent") {
    return { label: "Absent", className: "hr-badge hr-badge-absent" };
  }
  return {
    label: log.status || "Unknown",
    className: "hr-badge",
  };
}

function TaskTrendChart({
  createdData,
  completedData,
  pendingData,
  chartLabels,
  hrTasksDateFilter,
  W,
  H,
  PX,
  PY,
  chartN,
}: TaskTrendChartProps) {
  const [hoverIdx, setHoverIdx] = React.useState<number | null>(null);
  const peak = Math.max(...createdData, ...completedData, ...pendingData, 1);
  const niceMax = Math.max(4, Math.ceil(peak / 4) * 4);
  const xOf = (i: number) => PX + (i / Math.max(chartN - 1, 1)) * (W - PX * 2);
  const yOf = (v: number) => H - PY - (v / niceMax) * (H - PY * 2);
  const series = [
    { data: createdData, color: TREND_SERIES[0].color },
    { data: completedData, color: TREND_SERIES[1].color },
    { data: pendingData, color: TREND_SERIES[2].color },
  ];
  const hx = hoverIdx !== null ? xOf(hoverIdx) : null;
  const tooltipLeft = hoverIdx !== null && hoverIdx > chartN * 0.65;
  return (
    <div >
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H + 24}`}
        
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const svgX = ((e.clientX - rect.left) / rect.width) * W;
          const step = (W - PX * 2) / Math.max(chartN - 1, 1);
          const idx = Math.round((svgX - PX) / step);
          setHoverIdx(Math.max(0, Math.min(chartN - 1, idx)));
        }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Horizontal gridlines with value ticks */}
        {[0, 0.5, 1].map((t, i) => {
          const gy = yOf(niceMax * t);
          return (
            <g key={i}>
              <line
                x1={PX}
                y1={gy}
                x2={W - PX}
                y2={gy}
                stroke="#eceef2"
                strokeWidth="1"
                strokeDasharray={t === 0 ? "0" : "3 4"}
                className="dark:stroke-zinc-800"
              />
              <text
                x={PX - 8}
                y={gy + 3}
                textAnchor="end"
                fontSize="9"
                fill="#a3aab8"
                fontWeight="600"
              >
                {Math.round(niceMax * t)}
              </text>
            </g>
          );
        })}

        {/* Straight trend lines */}
        {series.map(({ data, color }, si) => (
          <polyline
            key={si}
            points={data.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ")}
            fill="none"
            stroke={color}
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {/* Hover guide + markers */}
        {hoverIdx !== null && hx !== null && (
          <line
            x1={hx}
            y1={PY}
            x2={hx}
            y2={H - PY}
            stroke="#c9cedb"
            strokeWidth="1"
            strokeDasharray="3 3"
            className="dark:stroke-zinc-700"
          />
        )}
        {hoverIdx !== null &&
          series.map(({ data, color }, si) =>
            data[hoverIdx] === 0 ? null : (
              <circle
                key={si}
                cx={xOf(hoverIdx)}
                cy={yOf(data[hoverIdx] ?? 0)}
                r="3.5"
                fill="#ffffff"
                stroke={color}
                strokeWidth="1.8"
              />
            ),
          )}

        {/* Tooltip */}
        {hoverIdx !== null &&
          hx !== null &&
          (() => {
            const label = chartLabels[hoverIdx] ?? "";
            const c = createdData[hoverIdx] ?? 0;
            const d = completedData[hoverIdx] ?? 0;
            const p = pendingData[hoverIdx] ?? 0;
            const tw = 138,
              th = 78;
            const tx = tooltipLeft ? hx - tw - 12 : hx + 12;
            const ty = Math.max(PY, Math.min(yOf(Math.max(c, d, p, 1)) - th / 2, H - PY - th));
            return (
              <g>
                <rect
                  x={tx + 2}
                  y={ty + 2}
                  width={tw}
                  height={th}
                  rx={8}
                  fill="#0f172a"
                  opacity="0.06"
                />
                <rect
                  x={tx}
                  y={ty}
                  width={tw}
                  height={th}
                  rx={8}
                  fill="#ffffff"
                  stroke="#e5e7eb"
                  className="dark:fill-zinc-900 dark:stroke-zinc-800"
                />
                <text x={tx + 12} y={ty + 18} fontSize="10" fill="#6b7280" fontWeight="600">
                  {label}
                </text>
                {[
                  { color: TREND_SERIES[0].color, label: "Created", val: c },
                  { color: TREND_SERIES[1].color, label: "Completed", val: d },
                  { color: TREND_SERIES[2].color, label: "Pending", val: p },
                ].map((row, ri) => (
                  <g key={ri}>
                    <circle cx={tx + 15} cy={ty + 31 + ri * 14} r="3" fill={row.color} />
                    <text
                      x={tx + 24}
                      y={ty + 34 + ri * 14}
                      fontSize="10"
                      fill="#374151"
                      fontWeight="500"
                      className="dark:fill-zinc-300"
                    >
                      {row.label}
                    </text>
                    <text
                      x={tx + tw - 12}
                      y={ty + 34 + ri * 14}
                      fontSize="10"
                      fill="#111827"
                      fontWeight="600"
                      textAnchor="end"
                      className="dark:fill-zinc-100"
                    >
                      {row.val}
                    </text>
                  </g>
                ))}
              </g>
            );
          })()}

        {/* X labels */}
        {chartLabels.map(
          (lbl, i) =>
            (i % (hrTasksDateFilter === "weekly" ? 1 : 5) === 0 || i === chartN - 1) && (
              <text
                key={i}
                x={xOf(i)}
                y={H + 16}
                textAnchor="middle"
                fontSize="9"
                fill={i === hoverIdx ? "#334155" : "#a3aab8"}
                fontWeight="600"
                className="dark:fill-zinc-400"
              >
                {lbl}
              </text>
            ),
        )}
      </svg>
    </div>
  );
}

export function HRWorkspaceTabs({ activeTab, showToast }: HRWorkspaceTabsProps) {
  // HR Tasks states
  const [hrTasks, setHRTasks] = React.useState<any[]>([]);
  const [hrTasksLoading, setHRTasksLoading] = React.useState(false);
  const [hrTasksSearchTerm, setHRTasksSearchTerm] = React.useState("");
  const [hrTasksStatusFilter, setHRTasksStatusFilter] = React.useState("all");
  const [hrTasksDateFilter, setHRTasksDateFilter] = React.useState<"weekly" | "current-month">(
    "weekly",
  );

  // HR Onboarding States
  const [onboardName, setOnboardName] = React.useState("");
  const [onboardEmail, setOnboardEmail] = React.useState("");
  const [onboardRole, setOnboardRole] = React.useState("employee");
  const [onboardDept, setOnboardDept] = React.useState("");
  const [onboardJobTitle, setOnboardJobTitle] = React.useState("");
  const [onboardEmployeeCode, setOnboardEmployeeCode] = React.useState("");
  const [onboardWorkLocation, setOnboardWorkLocation] = React.useState("Onsite");
  const [onboardEmploymentType, setOnboardEmploymentType] = React.useState("Full-time");
  const [onboardDateOfJoining, setOnboardDateOfJoining] = React.useState("");
  const [onboardLoading, setOnboardLoading] = React.useState(false);
  const [createdCredentials, setCreatedCredentials] = React.useState<{
    email: string;
    pass: string;
    emailSent?: boolean;
    portalUrl?: string;
    portalDisplayUrl?: string;
  } | null>(null);

  const [onboardModalOpen, setOnboardModalOpen] = React.useState(false);
  const [employeesList, setEmployeesList] = React.useState<any[]>([]);
  const [employeesLoading, setEmployeesLoading] = React.useState(false);
  const [companyShifts, setCompanyShifts] = React.useState<CompanyShift[]>([]);
  const [onboardShiftId, setOnboardShiftId] = React.useState("");
  const [onboardReportingTo, setOnboardReportingTo] = React.useState<string | null>(null);
  const [reportingSearchTerm, setReportingSearchTerm] = React.useState("");
  const [copiedEmail, setCopiedEmail] = React.useState(false);
  const [copiedPass, setCopiedPass] = React.useState(false);
  const [copiedPortal, setCopiedPortal] = React.useState(false);

  // Edit/Delete Employee States
  const [editingEmployee, setEditingEmployee] = React.useState<any | null>(null);
  const [editName, setEditName] = React.useState("");
  const [editRole, setEditRole] = React.useState("employee");
  const [editDept, setEditDept] = React.useState("");
  const [editJobTitle, setEditJobTitle] = React.useState("");
  const [editEmployeeCode, setEditEmployeeCode] = React.useState("");
  const [editWorkLocation, setEditWorkLocation] = React.useState("");
  const [editEmploymentType, setEditEmploymentType] = React.useState("Full-time");
  const [editOnboardingStatus, setEditOnboardingStatus] = React.useState("Completed");
  const [editShiftId, setEditShiftId] = React.useState("");
  const [editReportingTo, setEditReportingTo] = React.useState<string | null>(null);
  const [editDateOfJoining, setEditDateOfJoining] = React.useState("");
  const [editLoading, setEditLoading] = React.useState(false);

  // HR inline state
  const [hrAttendanceLogs, setHRAttendanceLogs] = React.useState<any[]>([]);
  const [hrFilteredLogs, setHRFilteredLogs] = React.useState<any[]>([]);
  const [hrLoading, setHRLoading] = React.useState(false);
  const [hrSearchTerm, setHRSearchTerm] = React.useState("");
  const [hrStatusFilter, setHRStatusFilter] = React.useState("all");
  const [hrSelectedDate, setHRSelectedDate] = React.useState(
    new Date().toISOString().split("T")[0],
  );
  const [hrDateViewMode, setHRDateViewMode] = React.useState<"monthly" | "daily">("monthly");

  // Create Task modal state
  const [taskModalOpen, setTaskModalOpen] = React.useState(false);

  function formatEmployeeCode(val: string): string {
    const clean = val.trim();
    if (!clean) return "";
    if (/^\d+$/.test(clean)) {
      return `EMP${clean.padStart(3, "0")}`;
    }
    const match = clean.match(/^EMP\s*(\d+)$/i);
    if (match && match[1]) {
      return `EMP${match[1].padStart(3, "0")}`;
    }
    return clean;
  }

  React.useEffect(() => {
    if (activeTab === "hr-attendance") fetchHRAttendance();
    if (activeTab === "hr-onboard") fetchCompanyEmployees();
    if (activeTab === "hr-tasks") fetchHRTasks();
  }, [activeTab, hrSelectedDate, hrDateViewMode]);

  async function fetchHRTasks() {
    setHRTasksLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();
      if (!profile?.company_id) return;
      const { data: tasks } = await supabase
        .from("tasks")
        .select("*, assignee:assigned_to ( id, name ), assigner:assigned_by ( id, name )")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false });
      setHRTasks(tasks || []);
    } catch (err) {
      console.error("Error fetching HR tasks:", err);
    } finally {
      setHRTasksLoading(false);
    }
  }

  React.useEffect(() => {
    let result = [...hrAttendanceLogs];
    if (hrSearchTerm.trim())
      result = result.filter((l) =>
        (l.profiles?.name || "").toLowerCase().includes(hrSearchTerm.toLowerCase()),
      );
    if (hrStatusFilter !== "all") result = result.filter((l) => l.status === hrStatusFilter);
    setHRFilteredLogs(result);
  }, [hrAttendanceLogs, hrSearchTerm, hrStatusFilter]);

  async function fetchHRAttendance() {
    setHRLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();
      if (!profile?.company_id) return;

      let query = supabase
        .from("attendance")
        .select(
          "id, date, clock_in, clock_out, status, user_id, office_locations:office_location_id ( name )",
        )
        .eq("company_id", profile.company_id);

      if (hrDateViewMode === "daily") {
        query = query.eq("date", hrSelectedDate);
      } else {
        let baseDate = hrSelectedDate ? new Date(hrSelectedDate) : new Date();
        if (isNaN(baseDate.getTime())) {
          baseDate = new Date();
        }
        const startOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1)
          .toISOString()
          .split("T")[0];
        const endOfMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0)
          .toISOString()
          .split("T")[0];
        query = query.gte("date", startOfMonth).lte("date", endOfMonth);
      }

      const { data: attendanceData, error: attError } = await query;

      if (attError) {
        console.error("Error fetching attendance logs:", attError);
        setHRAttendanceLogs([]);
        return;
      }

      const userIds = [
        ...new Set((attendanceData || []).map((l: any) => l.user_id).filter(Boolean)),
      ];
      const profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", userIds);
        (profileRows || []).forEach((p: any) => {
          profileMap[p.id] = p.name || "Unknown User";
        });
      }

      const enrichedData = (attendanceData || []).map((log: any) => ({
        ...log,
        profiles: {
          name: profileMap[log.user_id] || "Unknown User",
        },
      }));

      setHRAttendanceLogs(enrichedData);
    } catch (err) {
      console.error(err);
    } finally {
      setHRLoading(false);
    }
  }

  async function fetchCompanyEmployees() {
    setEmployeesLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();
      if (!profile?.company_id) return;

      const { data: employees, error } = await supabase
        .from("profiles")
        .select(
          "id, name, email, role, department, onboarding_status, job_title, employee_code, work_location, employment_type, shift_id, reporting_to, date_of_joining",
        )
        .eq("company_id", profile.company_id)
        .order("name", { ascending: true });

      if (error) throw error;
      setEmployeesList(employees || []);
      setCompanyShifts(await getCompanyShifts(profile.company_id));
    } catch (err) {
      console.error("Error fetching company employees list:", err);
    } finally {
      setEmployeesLoading(false);
    }
  }

  const reportingSearchLower = reportingSearchTerm.trim().toLowerCase();
  const onboardReportingOptions = employeesList.filter(
    (e) =>
      !reportingSearchLower ||
      e.id === onboardReportingTo ||
      e.name.toLowerCase().includes(reportingSearchLower),
  );
  const editReportingOptions = employeesList.filter(
    (e) =>
      e.id !== editingEmployee?.id &&
      (!reportingSearchLower ||
        e.id === editReportingTo ||
        e.name.toLowerCase().includes(reportingSearchLower)),
  );

  const totalTasksAll = hrTasks.length;
  const completedAll = hrTasks.filter((t) => t.status === "Completed").length;
  const inProgressAll = hrTasks.filter((t) => t.status === "In Progress").length;
  const overdueAll = hrTasks.filter(
    (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "Completed",
  ).length;

  return (
    <div className="hr-workspace-tabs-root">
      {/* ===== HR ASSETS ===== */}
      {activeTab === "hr-assets" && <AssetsTab showToast={showToast} />}

      {/* ===== HR DOCUMENTS / KYC ===== */}
      {activeTab === "hr-documents" && <DocumentsTab showToast={showToast} />}

      {/* ===== HR PAYSLIPS ===== */}
      {activeTab === "hr-payslips" && <PayslipsTab showToast={showToast} />}

      {/* ===== HR POLICIES ===== */}
      {activeTab === "hr-policies" && <PoliciesTab showToast={showToast} />}

      {/* ===== HR LEAVE ===== */}
      {activeTab === "hr-leave" && <LeaveTab showToast={showToast} />}

      {/* ===== HR INDUCTION & TRAINING ===== */}
      {activeTab === "hr-induction" && <InductionTab showToast={showToast} />}

      {/* ===== HR MEMORIES ===== */}
      {activeTab === "hr-memories" && <MemoriesTab showToast={showToast} />}

      {/* ===== HR EXIT MANAGEMENT ===== */}
      {activeTab === "hr-exit" && <ExitTab showToast={showToast} />}

      {/* ===== HR TASKS ANALYTICS ===== */}
      {activeTab === "hr-tasks" &&
        (() => {
          const hrTasksFiltered = hrTasks.filter((t) => {
            const matchesSearch =
              !hrTasksSearchTerm.trim() ||
              (t.assignee?.name || "").toLowerCase().includes(hrTasksSearchTerm.toLowerCase()) ||
              (t.assigner?.name || "").toLowerCase().includes(hrTasksSearchTerm.toLowerCase()) ||
              (t.title || "").toLowerCase().includes(hrTasksSearchTerm.toLowerCase());
            const matchesStatus = hrTasksStatusFilter === "all" || t.status === hrTasksStatusFilter;
            let matchesDate = true;
            if (hrTasksDateFilter === "weekly") {
              const oneWeekAgo = new Date();
              oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
              matchesDate = new Date(t.created_at) >= oneWeekAgo;
            } else if (hrTasksDateFilter === "current-month") {
              const now = new Date();
              const d = new Date(t.created_at);
              matchesDate =
                d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }
            return matchesSearch && matchesStatus && matchesDate;
          });

          const chartN =
            hrTasksDateFilter === "weekly"
              ? 7
              : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
          const chartLabels =
            hrTasksDateFilter === "weekly"
              ? Array.from({ length: 7 }, (_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() - (6 - i));
                  return d.toLocaleDateString(undefined, { weekday: "short" });
                })
              : Array.from({ length: chartN }, (_, i) => String(i + 1));
          const createdData = Array.from({ length: chartN }, (_, i) => {
            let d = new Date();
            if (hrTasksDateFilter === "weekly") d.setDate(d.getDate() - (6 - i));
            else d = new Date(new Date().getFullYear(), new Date().getMonth(), i + 1);
            return hrTasks.filter((t) => new Date(t.created_at).toDateString() === d.toDateString())
              .length;
          });
          const completedData = Array.from({ length: chartN }, (_, i) => {
            let d = new Date();
            if (hrTasksDateFilter === "weekly") d.setDate(d.getDate() - (6 - i));
            else d = new Date(new Date().getFullYear(), new Date().getMonth(), i + 1);
            return hrTasks.filter(
              (t) =>
                t.status === "Completed" &&
                t.updated_at &&
                new Date(t.updated_at).toDateString() === d.toDateString(),
            ).length;
          });
          const pendingData = Array.from({ length: chartN }, (_, i) => {
            let d = new Date();
            if (hrTasksDateFilter === "weekly") d.setDate(d.getDate() - (6 - i));
            else d = new Date(new Date().getFullYear(), new Date().getMonth(), i + 1);
            return hrTasks.filter(
              (t) =>
                t.status === "Pending" &&
                new Date(t.created_at).toDateString() === d.toDateString(),
            ).length;
          });
          const W = 640,
            H = 220,
            PX = 34,
            PY = 16;

          return (
            <div className="hr-tab-container">
              {/* Header */}
              <div className="hr-tab-header">
                <div className="hr-tab-title-group">
                  <h2 className="hr-tab-title">
                    Company Tasks
                  </h2>
                  <p className="hr-tab-subtitle">
                    Monitor and manage tasks across the entire organization.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTaskModalOpen(true)}
                  className="hr-btn hr-btn-primary"
                >
                  <Add size={16} />
                  <span>New Task</span>
                </button>
              </div>

              {/* KPI Cards */}
              <div className="hr-metrics-grid">
                {[
                  {
                    label: "Total Tasks",
                    value: totalTasksAll,
                    icon: <AssignmentTurnedIn size={18} />,
                  },
                  {
                    label: "Completed",
                    value: completedAll,
                    icon: <EmojiEvents size={18} />,
                  },
                  {
                    label: "In Progress",
                    value: inProgressAll,
                    icon: <HourglassEmpty size={18} />,
                  },
                  {
                    label: "Overdue",
                    value: overdueAll,
                    icon: <LocalFireDepartment size={18} />,
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="hr-stat-card"
                  >
                    <div className="hr-stat-header">
                      <div className="hr-stat-icon-wrapper">
                        {kpi.icon}
                      </div>
                      <span className="hr-stat-label">
                        {kpi.label}
                      </span>
                    </div>
                    <div className="hr-stat-value">
                      {hrTasksLoading ? (
                        <div className="skeleton-shimmer" style={{ width: "45px", height: "28px", borderRadius: "4px" }} />
                      ) : (
                        kpi.value
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Trend Chart */}
              <div className="hr-card" style={{ padding: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
                  <div>
                    <h3 className="hr-card-title">
                      Task Completion Trend
                    </h3>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "8px" }}>
                      {TREND_SERIES.map((s) => (
                        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span
                            style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: s.color }}
                          />
                          <span style={{ fontSize: "12px", color: "var(--color-text-secondary)", fontWeight: 500 }}>
                            {s.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <select
                    value={hrTasksDateFilter}
                    onChange={(e) => setHRTasksDateFilter(e.target.value as any)}
                    className="hr-select"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="current-month">Monthly</option>
                  </select>
                </div>
                {hrTasksLoading ? (
                  <div className="skeleton-shimmer" style={{ width: "100%", height: "220px", borderRadius: "6px" }} />
                ) : (
                  <TaskTrendChart
                    createdData={createdData}
                    completedData={completedData}
                    pendingData={pendingData}
                    chartLabels={chartLabels}
                    hrTasksDateFilter={hrTasksDateFilter}
                    W={W}
                    H={H}
                    PX={PX}
                    PY={PY}
                    chartN={chartN}
                  />
                )}
              </div>

              {/* Activity Ledger Table */}
              <div className="hr-table-wrapper">
                <div className="hr-table-toolbar">
                  <h3 className="hr-table-title">
                    Activity Ledger
                  </h3>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <select
                      value={hrTasksStatusFilter}
                      onChange={(e) => setHRTasksStatusFilter(e.target.value)}
                      className="hr-select"
                    >
                      <option value="all">All Status</option>
                      <option value="Completed">Completed</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Pending">Pending</option>
                      <option value="Not Started">Not Started</option>
                    </select>

                    <div className="hr-search-bar" style={{ maxWidth: "260px" }}>
                      <Search size={16} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                      <input
                        type="text"
                        placeholder="Search tasks..."
                        value={hrTasksSearchTerm}
                        onChange={(e) => setHRTasksSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="hr-table-scroll">
                  <table className="hr-data-table">
                    <thead>
                      <tr>
                        <th>Task Detail</th>
                        <th>Assignee</th>
                        <th>Due Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hrTasksLoading ? (
                        [1, 2, 3, 4, 5].map((i) => (
                          <tr key={`task-skel-${i}`}>
                            <td>
                              <div className="skeleton-shimmer" style={{ width: "160px", height: "14px", borderRadius: "4px", marginBottom: "4px" }} />
                              <div className="skeleton-shimmer" style={{ width: "100px", height: "11px", borderRadius: "4px" }} />
                            </td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <div className="skeleton-shimmer" style={{ width: "28px", height: "28px", borderRadius: "50%" }} />
                                <div className="skeleton-shimmer" style={{ width: "90px", height: "14px", borderRadius: "4px" }} />
                              </div>
                            </td>
                            <td>
                              <div className="skeleton-shimmer" style={{ width: "80px", height: "14px", borderRadius: "4px" }} />
                            </td>
                            <td>
                              <div className="skeleton-shimmer" style={{ width: "70px", height: "20px", borderRadius: "4px" }} />
                            </td>
                          </tr>
                        ))
                      ) : hrTasksFiltered.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="hr-table-empty">
                            No tasks found matching your criteria.
                          </td>
                        </tr>
                      ) : (
                        hrTasksFiltered.map((task) => {
                          const isOverdue =
                            task.due_date &&
                            new Date(task.due_date) < new Date() &&
                            task.status !== "Completed";
                          const statusClass =
                            task.status === "Completed"
                              ? "hr-badge hr-badge-present"
                              : task.status === "In Progress"
                                ? "hr-badge hr-badge-late"
                                : "hr-badge hr-badge-missing";

                          return (
                            <tr key={task.id}>
                              <td>
                                <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                                  {task.title}
                                </div>
                                <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                                  Assigned by {task.assigner?.name || "System"}
                                </div>
                              </td>
                              <td>
                                <div className="hr-avatar-cell">
                                  <Avatar style={{ width: "28px", height: "28px", fontSize: "12px" }}>
                                    <AvatarFallback>
                                      {(task.assignee?.name?.[0] || "?").toUpperCase()}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                                    {task.assignee?.name || "Unassigned"}
                                  </span>
                                </div>
                              </td>
                              <td>
                                <span className={isOverdue ? "hr-badge hr-badge-absent" : "hr-cell-mono"}>
                                  {task.due_date
                                    ? new Date(task.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                                    : "No deadline"}
                                </span>
                              </td>
                              <td>
                                <span className={statusClass}>
                                  {task.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}

      {/* HR Attendance */}
      {activeTab === "hr-attendance" && (
        <div className="hr-tab-container">
          <div className="hr-tab-header">
            <div className="hr-tab-title-group">
              <h2 className="hr-tab-title">
                Company Attendance
              </h2>
              <p className="hr-tab-subtitle">
                Track daily attendance across all employees.
              </p>
            </div>
          </div>

          <div className="hr-card" style={{ padding: "16px" }}>
            <div className="hr-toolbar-filter-group">
              <div className="hr-search-bar">
                <Search size={16} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Search employee..."
                  value={hrSearchTerm}
                  onChange={(e) => setHRSearchTerm(e.target.value)}
                />
              </div>

              <select
                value={hrDateViewMode}
                onChange={(e) => setHRDateViewMode(e.target.value as "monthly" | "daily")}
                className="hr-select"
              >
                <option value="monthly">Monthly</option>
                <option value="daily">Daily</option>
              </select>

              {hrDateViewMode === "monthly" ? (
                <input
                  type="month"
                  className="hr-input"
                  value={(hrSelectedDate || "").substring(0, 7)}
                  onChange={(e) => {
                    if (e.target.value) setHRSelectedDate(e.target.value + "-01");
                  }}
                />
              ) : (
                <input
                  type="date"
                  className="hr-input"
                  value={hrSelectedDate}
                  onChange={(e) => setHRSelectedDate(e.target.value)}
                />
              )}

              <select
                value={hrStatusFilter}
                onChange={(e) => setHRStatusFilter(e.target.value)}
                className="hr-select"
              >
                <option value="all">All Statuses</option>
                <option value="present">Present</option>
                <option value="late">Late</option>
                <option value="half_day">Half Day</option>
                <option value="absent">Absent</option>
              </select>
            </div>
          </div>

          <div className="hr-table-wrapper">
            <div className="hr-table-scroll">
              <table className="hr-data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th>Location</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {hrLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={`hr-att-skel-${i}`}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div className="skeleton-shimmer" style={{ width: "28px", height: "28px", borderRadius: "50%" }} />
                            <div className="skeleton-shimmer" style={{ width: "120px", height: "14px", borderRadius: "4px" }} />
                          </div>
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "90px", height: "14px", borderRadius: "4px" }} />
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "70px", height: "14px", borderRadius: "4px" }} />
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "70px", height: "14px", borderRadius: "4px" }} />
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "80px", height: "14px", borderRadius: "4px" }} />
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "65px", height: "20px", borderRadius: "4px" }} />
                        </td>
                      </tr>
                    ))
                  ) : hrFilteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="hr-table-empty">
                        No records found for this {hrDateViewMode === "monthly" ? "month" : "date"}.
                      </td>
                    </tr>
                  ) : (
                    hrFilteredLogs.map((log) => {
                      const chip = getAttendanceStatusChip(log);
                      return (
                        <tr key={log.id}>
                          <td>
                            <div className="hr-avatar-cell">
                              <Avatar style={{ width: "28px", height: "28px", fontSize: "12px" }}>
                                <AvatarFallback>
                                  {(log.profiles?.name || "U")[0]?.toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                                {log.profiles?.name || "Unassigned"}
                              </span>
                            </div>
                          </td>
                          <td>
                            {log.date
                              ? new Date(log.date).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "—"}
                          </td>
                          <td className="hr-cell-mono">
                            {log.clock_in
                              ? new Date(log.clock_in).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                })
                              : "—"}
                          </td>
                          <td className="hr-cell-mono">
                            {log.clock_out
                              ? new Date(log.clock_out).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                })
                              : "—"}
                          </td>
                          <td>
                            {log.office_locations?.name || "Remote"}
                          </td>
                          <td>
                            <span className={chip.className}>
                              {chip.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Employee List Table & Modal Onboarding Popup */}
      {activeTab === "hr-onboard" && (
        <div className="hr-tab-container">
          <div className="hr-tab-header">
            <div className="hr-tab-title-group">
              <h2 className="hr-tab-title">
                Employee Registry
              </h2>
              <p className="hr-tab-subtitle">
                Manage employee records and add new joiners to the workspace.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOnboardModalOpen(true)}
              className="hr-btn hr-btn-primary"
            >
              <Add size={16} />
              <span>Add Employee</span>
            </button>
          </div>

          {createdCredentials && (
            <div className="hr-card" style={{ padding: "18px", borderLeft: "4px solid var(--color-primary)", backgroundColor: "var(--color-surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <h3 className="hr-card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Check size={18} style={{ color: "var(--color-primary)" }} />
                  <span>Employee Onboarded Successfully</span>
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setCreatedCredentials(null);
                    setCopiedEmail(false);
                    setCopiedPass(false);
                    setCopiedPortal(false);
                  }}
                  className="hr-btn-icon"
                >
                  <Close size={16} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "14px" }}>
                {createdCredentials.portalUrl && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", backgroundColor: "var(--color-surface-subtle)", borderRadius: "6px" }}>
                    <div style={{ fontSize: "13px" }}>
                      <span style={{ color: "var(--color-text-muted)", marginRight: "8px" }}>HRMS:</span>
                      <a
                        href={createdCredentials.portalUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--color-primary)", textDecoration: "underline" }}
                      >
                        {createdCredentials.portalDisplayUrl || createdCredentials.portalUrl}
                      </a>
                    </div>
                    <button
                      type="button"
                      className="hr-btn hr-btn-secondary"
                      style={{ height: "28px", padding: "0 8px", fontSize: "12px" }}
                      onClick={async () => {
                        await navigator.clipboard.writeText(createdCredentials.portalUrl!);
                        setCopiedPortal(true);
                        setTimeout(() => setCopiedPortal(false), 2000);
                      }}
                    >
                      {copiedPortal ? <Check size={13} /> : <ContentCopy size={13} />}
                      <span>{copiedPortal ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", backgroundColor: "var(--color-surface-subtle)", borderRadius: "6px" }}>
                  <div style={{ fontSize: "13px" }}>
                    <span style={{ color: "var(--color-text-muted)", marginRight: "8px" }}>Email:</span>
                    <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{createdCredentials.email}</span>
                  </div>
                  <button
                    type="button"
                    className="hr-btn hr-btn-secondary"
                    style={{ height: "28px", padding: "0 8px", fontSize: "12px" }}
                    onClick={async () => {
                      await navigator.clipboard.writeText(createdCredentials.email);
                      setCopiedEmail(true);
                      setTimeout(() => setCopiedEmail(false), 2000);
                    }}
                  >
                    {copiedEmail ? <Check size={13} /> : <ContentCopy size={13} />}
                    <span>{copiedEmail ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", backgroundColor: "var(--color-surface-subtle)", borderRadius: "6px" }}>
                  <div style={{ fontSize: "13px" }}>
                    <span style={{ color: "var(--color-text-muted)", marginRight: "8px" }}>Password:</span>
                    <span className="hr-cell-mono" style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{createdCredentials.pass}</span>
                  </div>
                  <button
                    type="button"
                    className="hr-btn hr-btn-secondary"
                    style={{ height: "28px", padding: "0 8px", fontSize: "12px" }}
                    onClick={async () => {
                      await navigator.clipboard.writeText(createdCredentials.pass);
                      setCopiedPass(true);
                      setTimeout(() => setCopiedPass(false), 2000);
                    }}
                  >
                    {copiedPass ? <Check size={13} /> : <ContentCopy size={13} />}
                    <span>{copiedPass ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              <p style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "10px" }}>
                {createdCredentials.emailSent
                  ? `Login credentials emailed to ${createdCredentials.email}`
                  : "Email delivery failed — share these credentials manually."}
              </p>
            </div>
          )}

          <div className="hr-table-wrapper">
            <div className="hr-table-scroll">
              <table className="hr-data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employeesLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={`emp-skel-${i}`}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <div className="skeleton-shimmer" style={{ width: "28px", height: "28px", borderRadius: "50%" }} />
                            <div className="skeleton-shimmer" style={{ width: "120px", height: "14px", borderRadius: "4px" }} />
                          </div>
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "140px", height: "14px", borderRadius: "4px" }} />
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "65px", height: "14px", borderRadius: "4px" }} />
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "90px", height: "14px", borderRadius: "4px" }} />
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "70px", height: "20px", borderRadius: "4px" }} />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="skeleton-shimmer" style={{ width: "56px", height: "28px", borderRadius: "6px", marginLeft: "auto" }} />
                        </td>
                      </tr>
                    ))
                  ) : employeesList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="hr-table-empty">
                        No onboarded employees found.
                      </td>
                    </tr>
                  ) : (
                    employeesList.map((emp) => (
                      <tr key={emp.id}>
                        <td>
                          <div className="hr-avatar-cell">
                            <Avatar style={{ width: "28px", height: "28px", fontSize: "12px" }}>
                              <AvatarFallback>
                                {(emp.name || "E")[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                                {emp.name || "—"}
                              </div>
                              {emp.employee_code && (
                                <div className="hr-cell-mono" style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                                  {emp.employee_code}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{ color: "var(--color-text-secondary)" }}>
                            {emp.email || "—"}
                          </span>
                        </td>
                        <td>
                          <span className="hr-badge" style={{ textTransform: "capitalize" }}>
                            {emp.role || "employee"}
                          </span>
                        </td>
                        <td>
                          <span style={{ color: "var(--color-text-primary)" }}>
                            {emp.department || "—"}
                          </span>
                          {emp.job_title && (
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                              {emp.job_title}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={emp.onboarding_status === "Completed" ? "hr-badge hr-badge-present" : "hr-badge hr-badge-late"}>
                            {emp.onboarding_status || "Completed"}
                          </span>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div style={{ display: "inline-flex", gap: "4px" }}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEmployee(emp);
                                setEditName(emp.name || "");
                                setEditRole(emp.role || "employee");
                                setEditDept(emp.department || "");
                                setEditJobTitle(emp.job_title || "");
                                setEditEmployeeCode(emp.employee_code || "");
                                setEditWorkLocation(emp.work_location || "Onsite");
                                setEditEmploymentType(emp.employment_type || "Full-time");
                                setEditOnboardingStatus(emp.onboarding_status || "Completed");
                                setEditShiftId(emp.shift_id || "");
                                setEditReportingTo(emp.reporting_to || null);
                                setEditDateOfJoining(
                                  emp.date_of_joining
                                    ? (String(emp.date_of_joining).split("T")[0] ?? "")
                                    : "",
                                );
                              }}
                              className="hr-btn-icon"
                              title="Edit Employee"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (
                                  window.confirm(
                                    `Are you sure you want to delete ${emp.name || "this employee"}?`,
                                  )
                                ) {
                                  try {
                                    const res = await adminDeleteEmployee({
                                      data: { employeeId: emp.id },
                                    });
                                    if (!res.success) throw new Error(res.error || "Delete failed");
                                    showToast("Employee profile deleted.", "success");
                                    fetchCompanyEmployees();
                                  } catch (err: any) {
                                    showToast("Delete failed: " + err.message, "error");
                                  }
                                }
                              }}
                              className="hr-btn-icon"
                              style={{ color: "#ef4444" }}
                              title="Delete Employee"
                            >
                              <Delete size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Edit Employee Modal */}
          <Dialog
            open={Boolean(editingEmployee)}
            onOpenChange={(open) => !open && setEditingEmployee(null)}
          >
            <DialogContent
              className="sm:max-w-[580px]"
              style={{
                maxHeight: "min(88vh, 720px)",
                display: "flex",
                flexDirection: "column",
                padding: 0,
                overflow: "hidden",
              }}
            >
              <DialogHeader style={{ padding: "20px 24px 14px", borderBottom: "1px solid var(--color-border-subtle)", margin: 0 }}>
                <DialogTitle>
                  Edit Employee Settings
                </DialogTitle>
              </DialogHeader>
              <div style={{ padding: "18px 24px", overflowY: "auto", flex: 1, maxHeight: "calc(88vh - 145px)" }}>
                <div className="hr-form-grid">
                  <div className="hr-form-grid-2">
                    <div className="hr-form-field">
                      <label className="hr-form-label">Full Name</label>
                      <input
                        type="text"
                        className="hr-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </div>

                    <div className="hr-form-field">
                      <label className="hr-form-label">Role</label>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="hr-select"
                      >
                        <option value="employee">Employee</option>
                        <option value="hr">HR Specialist</option>
                        <option value="accountant">Accountant</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                  </div>

                  <div className="hr-form-grid-2">
                    <div className="hr-form-field">
                      <label className="hr-form-label">Department</label>
                      <input
                        type="text"
                        className="hr-input"
                        value={editDept}
                        onChange={(e) => setEditDept(e.target.value)}
                        placeholder="e.g. Engineering"
                      />
                    </div>

                    <div className="hr-form-field">
                      <label className="hr-form-label">Job Title</label>
                      <input
                        type="text"
                        className="hr-input"
                        value={editJobTitle}
                        onChange={(e) => setEditJobTitle(e.target.value)}
                        placeholder="e.g. Senior Frontend Engineer"
                      />
                    </div>
                  </div>

                  <div className="hr-form-grid-2">
                    <div className="hr-form-field">
                      <label className="hr-form-label">Employee Code</label>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="hr-badge" style={{ height: "38px", boxSizing: "border-box" }}>
                          EMP
                        </span>
                        <input
                          type="text"
                          className="hr-input"
                          style={{ flex: 1 }}
                          value={editEmployeeCode.replace(/^EMP/i, "")}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (/^\d*$/.test(val) && val.length <= 3) {
                              setEditEmployeeCode(val);
                            }
                          }}
                          onBlur={(e) => {
                            const val = e.target.value;
                            if (val && /^\d+$/.test(val)) {
                              setEditEmployeeCode(val.padStart(3, "0"));
                            }
                          }}
                          placeholder="001"
                        />
                      </div>
                    </div>

                    <div className="hr-form-field">
                      <label className="hr-form-label">Onboarding Status</label>
                      <select
                        value={editOnboardingStatus}
                        onChange={(e) => setEditOnboardingStatus(e.target.value)}
                        className="hr-select"
                      >
                        <option value="Completed">Completed</option>
                        <option value="Pending">Pending</option>
                      </select>
                    </div>
                  </div>

                  <div className="hr-form-grid-2">
                    <div className="hr-form-field">
                      <label className="hr-form-label">Work Mode</label>
                      <select
                        value={editWorkLocation}
                        onChange={(e) => setEditWorkLocation(e.target.value)}
                        className="hr-select"
                      >
                        <option value="Onsite">Onsite</option>
                        <option value="Remote">Remote</option>
                      </select>
                    </div>

                    <div className="hr-form-field">
                      <label className="hr-form-label">Employment Type</label>
                      <select
                        value={editEmploymentType}
                        onChange={(e) => setEditEmploymentType(e.target.value)}
                        className="hr-select"
                      >
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Contract">Contract</option>
                        <option value="Internship">Internship</option>
                      </select>
                    </div>
                  </div>

                  <div className="hr-form-grid-2">
                    <div className="hr-form-field">
                      <label className="hr-form-label">Date of Joining</label>
                      <input
                        type="date"
                        className="hr-input"
                        value={editDateOfJoining}
                        onChange={(e) => setEditDateOfJoining(e.target.value)}
                      />
                    </div>

                    <div className="hr-form-field">
                      <label className="hr-form-label">Shift</label>
                      <select
                        value={editShiftId}
                        onChange={(e) => setEditShiftId(e.target.value)}
                        className="hr-select"
                      >
                        <option value="">Company Default</option>
                        {companyShifts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.startTime} - {s.endTime}){s.isDefault ? " (Default)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="hr-form-field">
                    <label className="hr-form-label">Reporting To</label>
                    <select
                      value={editReportingTo || ""}
                      onChange={(e) => setEditReportingTo(e.target.value || null)}
                      className="hr-select"
                    >
                      <option value="">None (Direct Report / Executive)</option>
                      {editReportingOptions.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} {emp.job_title ? `— ${emp.job_title}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <DialogFooter style={{ padding: "14px 24px 18px", borderTop: "1px solid var(--color-border-subtle)", margin: 0, display: "flex", justifyContent: "flex-end", gap: "10px", backgroundColor: "var(--color-surface)" }}>
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="hr-btn hr-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={editLoading}
                  onClick={async () => {
                    if (!editName) {
                      showToast("Name is required.", "warning");
                      return;
                    }
                    try {
                      setEditLoading(true);
                      const codeToFormat = editEmployeeCode.trim()
                        ? !editEmployeeCode.toUpperCase().startsWith("EMP")
                          ? `EMP${editEmployeeCode.trim()}`
                          : editEmployeeCode
                        : "";
                      const formattedCode = formatEmployeeCode(codeToFormat);
                      if (formattedCode && formattedCode.trim() !== "") {
                        const userCtx = await getAuthenticatedUserContext();
                        if (userCtx) {
                          const { data: codeCheck } = await supabase
                            .from("profiles")
                            .select("id, name")
                            .eq("company_id", userCtx.companyId)
                            .eq("employee_code", formattedCode)
                            .neq("id", editingEmployee.id)
                            .maybeSingle();

                          if (codeCheck) {
                            showToast(
                              `Employee code "${formattedCode}" is already assigned to ${codeCheck.name}.`,
                              "warning",
                            );
                            setEditLoading(false);
                            return;
                          }
                        }
                      }

                      const res = await adminUpdateEmployee({
                        data: {
                          employeeId: editingEmployee.id,
                          name: editName,
                          role: editRole,
                          department: editDept.trim() || null,
                          jobTitle: editJobTitle.trim() || null,
                          employeeCode: formattedCode || null,
                          workLocation: editWorkLocation,
                          employmentType: editEmploymentType,
                          onboardingStatus: editOnboardingStatus,
                          shiftId: editShiftId || null,
                          reportingTo: editReportingTo,
                          dateOfJoining: editDateOfJoining || null,
                        },
                      });

                      if (!res.success) throw new Error(res.error || "Update failed");
                      showToast("Employee updated successfully.", "success");
                      setEditingEmployee(null);
                      fetchCompanyEmployees();
                    } catch (err: any) {
                      showToast("Update failed: " + err.message, "error");
                    } finally {
                      setEditLoading(false);
                    }
                  }}
                  className="hr-btn hr-btn-primary"
                >
                  {editLoading ? "Saving..." : "Save Changes"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Minimal Popup Dialog Modal for Onboarding Form */}
          <Dialog
            open={onboardModalOpen}
            onOpenChange={setOnboardModalOpen}
          >
            <DialogContent
              className="sm:max-w-[580px]"
              style={{
                maxHeight: "min(88vh, 720px)",
                display: "flex",
                flexDirection: "column",
                padding: 0,
                overflow: "hidden",
              }}
            >
              <DialogHeader style={{ padding: "20px 24px 14px", borderBottom: "1px solid var(--color-border-subtle)", margin: 0 }}>
                <DialogTitle>
                  Onboard New Employee
                </DialogTitle>
              </DialogHeader>
              <div style={{ padding: "18px 24px", overflowY: "auto", flex: 1, maxHeight: "calc(88vh - 145px)" }}>
                <div className="hr-form-grid">
                  <div className="hr-form-grid-2">
                    <div className="hr-form-field">
                      <label className="hr-form-label">
                        Full Name <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        required
                        type="text"
                        className="hr-input"
                        value={onboardName}
                        onChange={(e) => setOnboardName(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                      />
                    </div>

                    <div className="hr-form-field">
                      <label className="hr-form-label">
                        Work Email <span style={{ color: "#ef4444" }}>*</span>
                      </label>
                      <input
                        required
                        type="email"
                        className="hr-input"
                        value={onboardEmail}
                        onChange={(e) => setOnboardEmail(e.target.value)}
                        placeholder="e.g. rahul@company.com"
                      />
                    </div>
                  </div>

                  <div className="hr-form-grid-2">
                    <div className="hr-form-field">
                      <label className="hr-form-label">Role</label>
                      <select
                        value={onboardRole}
                        onChange={(e) => setOnboardRole(e.target.value)}
                        className="hr-select"
                      >
                        <option value="employee">Employee</option>
                        <option value="hr">HR Specialist</option>
                        <option value="accountant">Accountant</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>

                    <div className="hr-form-field">
                      <label className="hr-form-label">Department</label>
                      <input
                        type="text"
                        className="hr-input"
                        value={onboardDept}
                        onChange={(e) => setOnboardDept(e.target.value)}
                        placeholder="e.g. Engineering"
                      />
                    </div>
                  </div>

                  <div className="hr-form-grid-2">
                    <div className="hr-form-field">
                      <label className="hr-form-label">Job Title</label>
                      <input
                        type="text"
                        className="hr-input"
                        value={onboardJobTitle}
                        onChange={(e) => setOnboardJobTitle(e.target.value)}
                        placeholder="e.g. Senior Frontend Engineer"
                      />
                    </div>

                    <div className="hr-form-field">
                      <label className="hr-form-label">Employee Code</label>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="hr-badge" style={{ height: "38px", boxSizing: "border-box" }}>
                          EMP
                        </span>
                        <input
                          type="text"
                          className="hr-input"
                          style={{ flex: 1 }}
                          value={onboardEmployeeCode.replace(/^EMP/i, "")}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (/^\d*$/.test(val) && val.length <= 3) {
                              setOnboardEmployeeCode(val);
                            }
                          }}
                          onBlur={(e) => {
                            const val = e.target.value;
                            if (val && /^\d+$/.test(val)) {
                              setOnboardEmployeeCode(val.padStart(3, "0"));
                            }
                          }}
                          placeholder="001"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="hr-form-grid-2">
                    <div className="hr-form-field">
                      <label className="hr-form-label">Work Mode</label>
                      <select
                        value={onboardWorkLocation}
                        onChange={(e) => setOnboardWorkLocation(e.target.value)}
                        className="hr-select"
                      >
                        <option value="Onsite">Onsite</option>
                        <option value="Remote">Remote</option>
                      </select>
                    </div>

                    <div className="hr-form-field">
                      <label className="hr-form-label">Employment Type</label>
                      <select
                        value={onboardEmploymentType}
                        onChange={(e) => setOnboardEmploymentType(e.target.value)}
                        className="hr-select"
                      >
                        <option value="Full-time">Full-time</option>
                        <option value="Part-time">Part-time</option>
                        <option value="Contract">Contract</option>
                        <option value="Internship">Internship</option>
                      </select>
                    </div>
                  </div>

                  <div className="hr-form-grid-2">
                    <div className="hr-form-field">
                      <label className="hr-form-label">Date of Joining</label>
                      <input
                        type="date"
                        className="hr-input"
                        value={onboardDateOfJoining}
                        onChange={(e) => setOnboardDateOfJoining(e.target.value)}
                      />
                    </div>

                    <div className="hr-form-field">
                      <label className="hr-form-label">Shift</label>
                      <select
                        value={onboardShiftId}
                        onChange={(e) => setOnboardShiftId(e.target.value)}
                        className="hr-select"
                      >
                        <option value="">Company Default</option>
                        {companyShifts.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.startTime} - {s.endTime}){s.isDefault ? " (Default)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="hr-form-field">
                    <label className="hr-form-label">Reporting To</label>
                    <select
                      value={onboardReportingTo || ""}
                      onChange={(e) => setOnboardReportingTo(e.target.value || null)}
                      className="hr-select"
                    >
                      <option value="">None (Direct Report / Executive)</option>
                      {onboardReportingOptions.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} {emp.job_title ? `— ${emp.job_title}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <DialogFooter style={{ padding: "14px 24px 18px", borderTop: "1px solid var(--color-border-subtle)", margin: 0, display: "flex", justifyContent: "flex-end", gap: "10px", backgroundColor: "var(--color-surface)" }}>
                <button
                  type="button"
                  onClick={() => setOnboardModalOpen(false)}
                  className="hr-btn hr-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={onboardLoading}
                  onClick={async () => {
                    if (!onboardName || !onboardEmail) {
                      showToast("Please provide name and email.", "warning");
                      return;
                    }
                    setOnboardLoading(true);
                    try {
                      const userCtx = await getAuthenticatedUserContext();
                      if (!userCtx) throw new Error("Unauthorized");

                      const codeToFormat = onboardEmployeeCode.trim()
                        ? !onboardEmployeeCode.toUpperCase().startsWith("EMP")
                          ? `EMP${onboardEmployeeCode.trim()}`
                          : onboardEmployeeCode
                        : "";
                      const formattedCode = formatEmployeeCode(codeToFormat);
                      if (formattedCode) {
                        const { data: codeCheck } = await supabase
                          .from("profiles")
                          .select("id, name")
                          .eq("company_id", userCtx.companyId)
                          .eq("employee_code", formattedCode)
                          .maybeSingle();

                        if (codeCheck) {
                          showToast(
                            `Employee code "${formattedCode}" is already assigned to ${codeCheck.name}.`,
                            "warning",
                          );
                          setOnboardLoading(false);
                          return;
                        }
                      }
                      const res = await adminOnboardEmployee({
                        data: {
                          companyId: userCtx.companyId,
                          companyName: userCtx.companyName,
                          name: onboardName,
                          email: onboardEmail,
                          jobTitle: onboardJobTitle,
                          department: onboardDept,
                          employeeCode: formattedCode || "",
                          workLocation: onboardWorkLocation || "",
                          employmentType: onboardEmploymentType || "",
                          role: onboardRole as any,
                          shiftId: onboardShiftId || null,
                          reportingTo: onboardReportingTo,
                          dateOfJoining: onboardDateOfJoining || null,
                        },
                      });

                      if (!res.success) {
                        throw new Error(res.error || "Failed to onboard employee");
                      }

                      setCreatedCredentials({
                        email: onboardEmail,
                        pass: res.credentials?.password || "",
                        emailSent: res.emailSent,
                        portalUrl: res.credentials?.portalUrl,
                        portalDisplayUrl: res.credentials?.portalDisplayUrl,
                      });
                      setOnboardName("");
                      setOnboardEmail("");
                      setOnboardDept("");
                      setOnboardJobTitle("");
                      setOnboardEmployeeCode("");
                      setOnboardWorkLocation("Onsite");
                      setOnboardEmploymentType("Full-time");
                      setOnboardDateOfJoining("");
                      setOnboardShiftId("");
                      setOnboardReportingTo(null);
                      setOnboardModalOpen(false);
                      showToast("Employee onboarded successfully.", "success");
                      fetchCompanyEmployees();
                    } catch (err: any) {
                      showToast("Onboarding failed: " + err.message, "error");
                    } finally {
                      setOnboardLoading(false);
                    }
                  }}
                  className="hr-btn hr-btn-primary"
                >
                  {onboardLoading ? "Onboarding..." : "Onboard Employee"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      <CreateTaskDialog
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        onCreated={fetchHRTasks}
      />
    </div>
  );
}
