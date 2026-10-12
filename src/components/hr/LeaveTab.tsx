import React, { useEffect, useState, useCallback } from "react";
import {
  Plus as Add,
  Trash2 as Delete,
  CalendarDays as CalendarRange,
  Save as SaveIcon,
  UserCog,
  RotateCcw as Reset,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  getLeavePolicies,
  getCompanyHolidays,
  getCompanyOffDays,
  saveCompanyOffDays,
  getEmployeesWithCustomOffDays,
  saveEmployeeOffDays,
  removeEmployeeOffDays,
  WEEKDAY_LABELS,
  DEFAULT_COMPANY_OFF_DAYS,
  type LeavePolicy,
  type CompanyHoliday,
  type EmployeeOffDays,
  type QuotaPeriod,
} from "../../lib/leave";
import { getCompanyEmployeesWithStatus } from "../../lib/onboarding";
import { HolidayCalendar } from "./HolidayCalendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";

interface EmployeeBrief {
  id: string;
  name: string;
  job_title?: string | null;
  department?: string | null;
}

interface LeaveTabProps {
  showToast: (msg: string, severity?: "success" | "error" | "info" | "warning") => void;
}

export function LeaveTab({ showToast }: LeaveTabProps) {
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);

  const [companyOffDays, setCompanyOffDays] = useState<number[]>(DEFAULT_COMPANY_OFF_DAYS);
  const [savedCompanyOffDays, setSavedCompanyOffDays] =
    useState<number[]>(DEFAULT_COMPANY_OFF_DAYS);
  const [savingCompanyOffDays, setSavingCompanyOffDays] = useState(false);

  const [employees, setEmployees] = useState<EmployeeBrief[]>([]);
  const [employeeSchedules, setEmployeeSchedules] = useState<EmployeeOffDays[]>([]);

  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [newLeaveType, setNewLeaveType] = useState("");
  const [newLeaveQuota, setNewLeaveQuota] = useState("");
  const [newQuotaPeriod, setNewQuotaPeriod] = useState<QuotaPeriod>("annual");
  const [savingPolicy, setSavingPolicy] = useState(false);

  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [savingHoliday, setSavingHoliday] = useState(false);

  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [draftOffDays, setDraftOffDays] = useState<number[]>([]);
  const [editingSchedule, setEditingSchedule] = useState<EmployeeOffDays | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fetchData = useCallback(async () => {
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
    setCompanyId(profile.company_id);
    const [pol, hol, offDays, schedules, empRes] = await Promise.all([
      getLeavePolicies(profile.company_id),
      getCompanyHolidays(profile.company_id),
      getCompanyOffDays(profile.company_id),
      getEmployeesWithCustomOffDays(profile.company_id),
      getCompanyEmployeesWithStatus(profile.company_id) as Promise<EmployeeBrief[]>,
    ]);
    setPolicies(pol);
    setHolidays(hol);
    setCompanyOffDays(offDays);
    setSavedCompanyOffDays(offDays);
    setEmployeeSchedules(schedules);
    setEmployees(empRes);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  async function addPolicy() {
    if (!companyId || !newLeaveType.trim() || newLeaveQuota === "") return;
    setSavingPolicy(true);
    const { data, error } = await supabase
      .from("leave_policies")
      .insert({
        company_id: companyId,
        leave_type: newLeaveType.trim(),
        annual_quota: Number(newLeaveQuota),
        quota_period: newQuotaPeriod,
      })
      .select()
      .single();
    setSavingPolicy(false);
    if (error) {
      showToast("Failed to add leave type", "error");
      return;
    }
    setPolicies((prev) =>
      [...prev, data as LeavePolicy].sort((a, b) => a.leave_type.localeCompare(b.leave_type)),
    );
    setPolicyDialogOpen(false);
    setNewLeaveType("");
    setNewLeaveQuota("");
    setNewQuotaPeriod("annual");
    showToast("Leave type added");
  }

  async function deletePolicy(id: string) {
    const { error } = await supabase.from("leave_policies").delete().eq("id", id);
    if (error) {
      showToast("Failed to delete", "error");
      return;
    }
    setPolicies((prev) => prev.filter((p) => p.id !== id));
    showToast("Leave type removed");
  }

  async function addHoliday() {
    if (!companyId || !newHolidayName.trim() || !newHolidayDate) return;
    setSavingHoliday(true);
    const { data, error } = await supabase
      .from("company_holidays")
      .insert({
        company_id: companyId,
        date: newHolidayDate,
        name: newHolidayName.trim(),
      })
      .select()
      .single();
    setSavingHoliday(false);
    if (error) {
      showToast("Failed to add holiday", "error");
      return;
    }
    setHolidays((prev) =>
      [...prev, data as CompanyHoliday].sort((a, b) => a.date.localeCompare(b.date)),
    );
    setHolidayDialogOpen(false);
    setNewHolidayName("");
    setNewHolidayDate("");
    showToast("Holiday added");
  }

  async function deleteHoliday(id: string) {
    const { error } = await supabase.from("company_holidays").delete().eq("id", id);
    if (error) {
      showToast("Failed to delete", "error");
      return;
    }
    setHolidays((prev) => prev.filter((h) => h.id !== id));
    showToast("Holiday removed");
  }

  function toggleCompanyOffDay(day: number) {
    setCompanyOffDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  const companyOffDaysDirty =
    JSON.stringify([...companyOffDays].sort()) !== JSON.stringify([...savedCompanyOffDays].sort());

  async function persistCompanyOffDays() {
    if (!companyId || companyOffDays.length === 0) return;
    setSavingCompanyOffDays(true);
    const res = await saveCompanyOffDays(companyId, companyOffDays);
    setSavingCompanyOffDays(false);
    if (!res.success) {
      showToast(res.error || "Failed to save off days", "error");
      return;
    }
    setSavedCompanyOffDays([...companyOffDays]);
    showToast("Weekly off days updated");
  }

  function openScheduleDialog(emp?: EmployeeBrief, existing?: EmployeeOffDays) {
    setSelectedEmployeeId(emp?.id || (employees[0]?.id ?? ""));
    setEditingSchedule(existing || null);
    setDraftOffDays(existing ? [...existing.off_days] : []);
    setScheduleDialogOpen(true);
  }

  function toggleDraftOffDay(day: number) {
    setDraftOffDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  async function saveSchedule() {
    if (!companyId || !selectedEmployeeId || draftOffDays.length === 0) return;
    setSavingSchedule(true);
    const res = await saveEmployeeOffDays(companyId, selectedEmployeeId, draftOffDays, "admin");
    setSavingSchedule(false);
    if (!res.success) {
      showToast(res.error || "Failed to save schedule", "error");
      return;
    }
    const employee = employees.find((e) => e.id === selectedEmployeeId);
    setEmployeeSchedules((prev) => [
      ...prev.filter((s) => s.employee_id !== selectedEmployeeId),
      {
        id: editingSchedule?.id || "local",
        company_id: companyId,
        employee_id: selectedEmployeeId,
        off_days: [...draftOffDays],
        set_by: "admin",
        notes: null,
      },
    ]);
    setScheduleDialogOpen(false);
    setEditingSchedule(null);
    setSelectedEmployeeId("");
    setDraftOffDays([]);
    showToast(`Schedule saved for ${employee?.name || "employee"}`);
  }

  async function resetSchedule(empId: string, name: string) {
    if (!companyId) return;
    const res = await removeEmployeeOffDays(companyId, empId);
    if (!res.success) {
      showToast(res.error || "Failed to reset schedule", "error");
      return;
    }
    setEmployeeSchedules((prev) => prev.filter((s) => s.employee_id !== empId));
    showToast(`Schedule reset to company default for ${name}`);
  }

  if (loading) {
    return (
      <div >
        <Skeleton  />
        <Skeleton  />
      </div>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <TooltipProvider>
      <div className="hr-tab-container">
        {/* Header */}
        <div className="hr-tab-header">
          <div className="hr-tab-title-group">
            <h2 className="hr-tab-title">Leave & Policy Settings</h2>
            <p className="hr-tab-subtitle">
              Configure company leave quotas, weekly off-days, corporate holidays, and employee shift schedules.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-6)" }}>
          {/* Main column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            {/* Weekly Off Days */}
            <div className="hr-card">
              <div className="hr-card-header">
                <div>
                  <h3 className="hr-card-title">Weekly Off Days</h3>
                  <p className="hr-card-subtitle">
                    Company-wide non-working days, automatically excluded from leave calculations
                  </p>
                </div>
                {companyOffDaysDirty && (
                  <button
                    type="button"
                    disabled={savingCompanyOffDays || companyOffDays.length === 0}
                    onClick={persistCompanyOffDays}
                    className="hr-btn hr-btn-primary"
                    style={{ height: 32, fontSize: 12 }}
                  >
                    <SaveIcon size={14} />
                    <span>{savingCompanyOffDays ? "Saving…" : "Save Changes"}</span>
                  </button>
                )}
              </div>

              <div className="hr-card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {WEEKDAY_LABELS.map((label, i) => {
                    const selected = companyOffDays.includes(i);
                    return (
                      <button
                        type="button"
                        key={label}
                        onClick={() => toggleCompanyOffDay(i)}
                        className={`hr-btn ${selected ? "hr-btn-primary" : "hr-btn-secondary"}`}
                        style={{ minWidth: 54, height: 36, fontWeight: 600 }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
                  Selected days are treated as rest days for every employee and won't consume leave
                  quota. Individual overrides can be set under Employee Work Schedules.
                </p>
              </div>
            </div>

            {/* Leave Types & Quotas */}
            <div className="hr-table-wrapper">
              <div className="hr-table-toolbar">
                <div>
                  <h3 className="hr-table-title">Leave Types & Quotas</h3>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                    Define annual leave entitlements per employee
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setNewLeaveType("");
                    setNewLeaveQuota("");
                    setPolicyDialogOpen(true);
                  }}
                  className="hr-btn hr-btn-primary"
                  style={{ height: 32, fontSize: 12 }}
                >
                  <Add size={14} />
                  <span>Add Leave Type</span>
                </button>
              </div>

              <div className="hr-table-scroll">
                <table className="hr-data-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40%" }}>Leave Type</th>
                      <th style={{ width: "30%" }}>Quota</th>
                      <th style={{ width: "20%" }}>Period</th>
                      <th style={{ width: "10%", textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="hr-table-empty">
                          No leave types configured. Add Casual, Sick, Earned etc.
                        </td>
                      </tr>
                    ) : (
                      policies.map((lp) => (
                        <tr key={lp.id}>
                          <td style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                            {lp.leave_type}
                          </td>
                          <td className="hr-cell-mono">
                            <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                              {Number(lp.annual_quota)}
                            </span>{" "}
                            <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
                              / {lp.quota_period === "monthly" ? "month" : "year"}
                            </span>
                          </td>
                          <td>
                            <span className="hr-badge hr-badge-active" style={{ fontSize: 11 }}>
                              {lp.quota_period === "monthly" ? "Monthly" : "Annual"}
                            </span>
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={() => deletePolicy(lp.id)}
                              title="Delete Leave Type"
                              className="hr-btn-icon"
                              style={{ color: "#dc2626", marginLeft: "auto" }}
                            >
                              <Delete size={15} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Company Holidays & Calendar Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "var(--space-6)" }}>
              <div className="hr-card">
                <div className="hr-card-header">
                  <div>
                    <h3 className="hr-card-title">Company Holidays</h3>
                    <p className="hr-card-subtitle">
                      Mark company-wide non-working days
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewHolidayName("");
                      setNewHolidayDate("");
                      setHolidayDialogOpen(true);
                    }}
                    className="hr-btn hr-btn-secondary"
                    style={{ height: 32, fontSize: 12 }}
                  >
                    <Add size={14} />
                    <span>Add Holiday</span>
                  </button>
                </div>

                <div className="hr-card-body">
                  {holidays.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-muted)" }}>
                      <CalendarRange size={24} style={{ margin: "0 auto 6px", opacity: 0.5 }} />
                      <p style={{ margin: 0, fontSize: 13 }}>No holidays added yet.</p>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                      {[...holidays]
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map((h) => {
                          const past = h.date < todayStr;
                          return (
                            <div
                              key={h.id}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "8px 12px",
                                borderRadius: 8,
                                border: "1px solid var(--color-border)",
                                backgroundColor: past ? "var(--color-surface-subtle)" : "var(--color-surface)",
                                opacity: past ? 0.6 : 1,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <CalendarRange size={14} style={{ color: "var(--color-primary)" }} />
                                <div>
                                  <span style={{ fontWeight: 600, fontSize: 13, display: "block", color: "var(--color-text-primary)" }}>
                                    {h.name}
                                  </span>
                                  <span className="hr-cell-mono" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                                    {new Date(h.date + "T00:00:00").toLocaleDateString(undefined, {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </span>
                                </div>
                              </div>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => deleteHoliday(h.id)}
                                    className="hr-btn-icon"
                                    style={{ width: 24, height: 24, color: "#dc2626" }}
                                  >
                                    <Delete size={13} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Remove Holiday</TooltipContent>
                              </Tooltip>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Employee Work Schedules */}
            <div className="hr-card">
              <div className="hr-card-header">
                <div>
                  <h3 className="hr-card-title">Employee Work Schedules</h3>
                  <p className="hr-card-subtitle">
                    Override weekly off days for individual employees (hybrid / part-time / custom rosters)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openScheduleDialog()}
                  className="hr-btn hr-btn-secondary"
                  style={{ height: 32, fontSize: 12 }}
                >
                  <UserCog size={14} />
                  <span>Assign Schedule</span>
                </button>
              </div>

              <div className="hr-card-body">
                {employeeSchedules.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "var(--color-text-muted)" }}>
                    <UserCog size={24} style={{ margin: "0 auto 6px", opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: 13 }}>No custom schedules yet. Employees follow the company off days by default.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {employeeSchedules.map((s) => {
                      const emp = employees.find((e) => e.id === s.employee_id);
                      return (
                        <div
                          key={s.employee_id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 14px",
                            borderRadius: 8,
                            border: "1px solid var(--color-border)",
                            backgroundColor: "var(--color-surface-subtle)",
                            flexWrap: "wrap",
                            gap: 10,
                          }}
                        >
                          <div className="hr-avatar-cell">
                            <div className="hr-avatar hr-avatar-sm">
                              {emp?.name?.charAt(0) || "E"}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--color-text-primary)" }}>
                                {emp?.name || "Unknown employee"}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                                {emp?.job_title || emp?.department || ""}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {WEEKDAY_LABELS.map((label, i) => {
                              const isOff = s.off_days.includes(i);
                              return isOff ? (
                                <span
                                  key={label}
                                  className="hr-badge hr-badge-late"
                                  style={{ padding: "2px 6px", fontSize: 11 }}
                                >
                                  {label}
                                </span>
                              ) : null;
                            })}
                            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                              off
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => openScheduleDialog(emp, s)}
                                  className="hr-btn-icon"
                                >
                                  <UserCog size={15} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Edit Schedule</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => resetSchedule(s.employee_id, emp?.name || "employee")}
                                  className="hr-btn-icon"
                                >
                                  <Reset size={15} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>Reset to Company Default</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Add Leave Type dialog */}
        <Dialog open={policyDialogOpen} onOpenChange={setPolicyDialogOpen}>
          <DialogContent style={{ maxWidth: 440, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 22 }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
                Add Leave Type
              </DialogTitle>
            </DialogHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "16px 0" }}>
              <div className="hr-form-field">
                <label className="hr-form-label">Leave Type Name</label>
                <input
                  type="text"
                  placeholder="e.g. Casual, Sick, Earned"
                  value={newLeaveType}
                  onChange={(e) => setNewLeaveType(e.target.value)}
                  className="hr-input"
                  autoFocus
                />
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">Quota Period</label>
                <select
                  value={newQuotaPeriod}
                  onChange={(e) => setNewQuotaPeriod(e.target.value as QuotaPeriod)}
                  className="hr-select"
                >
                  <option value="annual">Annual Quota</option>
                  <option value="monthly">Monthly Quota</option>
                </select>
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">
                  {newQuotaPeriod === "monthly" ? "Quota per Month (days)" : "Annual Quota (days)"}
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={newLeaveQuota}
                  onChange={(e) => setNewLeaveQuota(e.target.value)}
                  className="hr-input"
                />
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--color-text-muted)" }}>
                  {newQuotaPeriod === "monthly"
                    ? "Resets every month, e.g. 2 Casual + 1 Short + 1 Half Day per month."
                    : "Resets every year at the start of January."}
                </p>
              </div>
            </div>

            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setPolicyDialogOpen(false)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  savingPolicy ||
                  !newLeaveType.trim() ||
                  newLeaveQuota === "" ||
                  Number(newLeaveQuota) < 0
                }
                onClick={addPolicy}
                className="hr-btn hr-btn-primary"
              >
                {savingPolicy ? "Adding…" : "Add Leave Type"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Holiday dialog */}
        <Dialog open={holidayDialogOpen} onOpenChange={setHolidayDialogOpen}>
          <DialogContent style={{ maxWidth: 440, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 22 }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
                Add Holiday
              </DialogTitle>
            </DialogHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "16px 0" }}>
              <div className="hr-form-field">
                <label className="hr-form-label">Holiday Name</label>
                <input
                  type="text"
                  placeholder="e.g. Diwali, Christmas"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  className="hr-input"
                  autoFocus
                />
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">Date</label>
                <input
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="hr-input"
                />
              </div>
            </div>

            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setHolidayDialogOpen(false)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingHoliday || !newHolidayName.trim() || !newHolidayDate}
                onClick={addHoliday}
                className="hr-btn hr-btn-primary"
              >
                {savingHoliday ? "Adding…" : "Add Holiday"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign Schedule dialog */}
        <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
          <DialogContent style={{ maxWidth: 460, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 22 }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
                {editingSchedule ? "Edit Work Schedule" : "Assign Work Schedule"}
              </DialogTitle>
            </DialogHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "16px 0" }}>
              <div className="hr-form-field">
                <label className="hr-form-label">Employee</label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="hr-select"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.job_title ? `— ${emp.job_title}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">
                  Weekly off days (at least one required)
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "4px 0" }}>
                  {WEEKDAY_LABELS.map((label, i) => {
                    const selected = draftOffDays.includes(i);
                    return (
                      <button
                        type="button"
                        key={label}
                        onClick={() => toggleDraftOffDay(i)}
                        className={`hr-btn ${selected ? "hr-btn-primary" : "hr-btn-secondary"}`}
                        style={{ minWidth: 46, height: 32, fontSize: 12, fontWeight: 600 }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {editingSchedule && (
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--color-text-muted)" }}>
                    Set by {editingSchedule.set_by === "admin" ? "HR/admin" : "employee request"}
                  </p>
                )}
              </div>
            </div>

            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setScheduleDialogOpen(false)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingSchedule || !selectedEmployeeId || draftOffDays.length === 0}
                onClick={saveSchedule}
                className="hr-btn hr-btn-primary"
              >
                {savingSchedule ? "Saving…" : "Save Schedule"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

