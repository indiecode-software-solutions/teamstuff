import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import Layout from "../components/Layout";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ChevronLeft,
  ChevronRight,
  PlaneTakeoff as FlightTakeoff,
  Receipt,
  CreditCard as Payment,
  BriefcaseMedical as MedicalServices,
  CircleCheck as CheckCircle,
  House as HomeWork,
  X as Close,
  Calendar as CalendarIcon,
  CalendarDays,
  Sparkles,
  Clock,
  Layers,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock3,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  getCompanyHolidays,
  getEmployeeEffectiveOffDays,
  DEFAULT_COMPANY_OFF_DAYS,
  type CompanyHoliday,
} from "../lib/leave";
import { formatApprovalAmount } from "../lib/approvals";
import { getDynamicPageTitle } from "../lib/tenant-brand";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    title: getDynamicPageTitle("Calendar"),
    meta: [
      {
        name: "description",
        content: "Consolidated view of your attendance, check-ins, leaves, and approval requests.",
      },
    ],
  }),
  component: CalendarPage,
});

export interface CalendarEvent {
  id: string;
  type: "Attendance" | "Leave" | "WFH" | "Reimbursement" | "Salary" | "Mediclaim" | "Holiday" | "Other";
  title: string;
  details: string;
  status: "Approved" | "Pending" | "Rejected" | "Present" | "Remote" | "Absent" | "Half Day" | "Holiday";
  date: string;
  time?: string;
  amount?: string;
  userName?: string;
  raw?: any;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type FilterCategory = "ALL" | "ATTENDANCE" | "LEAVES_WFH" | "FINANCE" | "HOLIDAYS";

function formatTimeString(isoOrTimeString?: string | null): string {
  if (!isoOrTimeString) return "";
  try {
    if (isoOrTimeString.includes("T")) {
      const d = new Date(isoOrTimeString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    // "HH:MM:SS"
    const parts = isoOrTimeString.split(":");
    if (parts.length >= 2) {
      let hours = parseInt(parts[0], 10);
      const minutes = parts[1];
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      return `${hours}:${minutes} ${ampm}`;
    }
    return isoOrTimeString;
  } catch {
    return isoOrTimeString;
  }
}

function CalendarPage() {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [isLoading, setIsLoading] = useState(true);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedDayEvents, setSelectedDayEvents] = useState<{ dateStr: string; events: CalendarEvent[] } | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("ALL");
  const [calendarScope, setCalendarScope] = useState<"MY" | "COMPANY">("MY");

  const [eventsMap, setEventsMap] = useState<Record<string, CalendarEvent[]>>({});
  const [holidays, setHolidays] = useState<CompanyHoliday[]>([]);
  const [offDays, setOffDays] = useState<number[]>(DEFAULT_COMPANY_OFF_DAYS);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; companyId: string } | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
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
        .select("id, name, company_id")
        .eq("id", user.id)
        .maybeSingle();

      const compId = profile?.company_id || "";
      setCurrentUser({
        id: user.id,
        name: profile?.name || "User",
        companyId: compId,
      });

      if (!compId) {
        setIsLoading(false);
        return;
      }

      // Fetch in parallel:
      // 1. Attendance records
      // 2. Approvals
      // 3. Holidays
      // 4. Employee effective off days
      const [attendanceRes, approvalsRes, hols, effectiveOff] = await Promise.all([
        supabase
          .from("attendance")
          .select("id, user_id, date, check_in, check_out, status, work_mode")
          .eq("user_id", user.id),
        supabase
          .from("approvals")
          .select("id, employee_id, type, title, status, start_date, end_date, amount, reason, details, created_at, profiles!employee_id(name)")
          .eq(calendarScope === "COMPANY" ? "company_id" : "employee_id", calendarScope === "COMPANY" ? compId : user.id),
        getCompanyHolidays(compId),
        getEmployeeEffectiveOffDays(compId, user.id),
      ]);

      setHolidays(hols || []);
      setOffDays(effectiveOff || DEFAULT_COMPANY_OFF_DAYS);

      const newEvents: Record<string, CalendarEvent[]> = {};

      const pushEvent = (date: string, evt: CalendarEvent) => {
        if (!date) return;
        if (!newEvents[date]) {
          newEvents[date] = [];
        }
        newEvents[date].push(evt);
      };

      // 1. Map Company Holidays
      (hols || []).forEach((h) => {
        if (h.date) {
          pushEvent(h.date, {
            id: `hol-${h.id || h.date}`,
            type: "Holiday",
            title: h.name,
            details: h.holiday_type || "Company Holiday",
            status: "Holiday",
            date: h.date,
          });
        }
      });

      // 2. Map Attendance
      (attendanceRes.data || []).forEach((att) => {
        if (!att.date) return;
        const inTime = formatTimeString(att.check_in);
        const outTime = formatTimeString(att.check_out);
        const timeDisplay = inTime ? (outTime ? `${inTime} - ${outTime}` : `${inTime} - Present`) : "Logged";

        const statusLabel =
          att.status === "Present"
            ? att.work_mode === "Remote"
              ? "Remote"
              : "Present"
            : att.status || "Present";

        pushEvent(att.date, {
          id: `att-${att.id}`,
          type: "Attendance",
          title: att.work_mode === "Remote" ? "Remote Work Check-in" : "Office Check-in",
          details: timeDisplay,
          status: statusLabel as any,
          date: att.date,
          time: timeDisplay,
          raw: att,
        });
      });

      // 3. Map Approvals
      (approvalsRes.data || []).forEach((app: any) => {
        const type = (app.type || "Other") as CalendarEvent["type"];
        const empName = app.profiles?.name;
        const prefix = calendarScope === "COMPANY" && empName ? `${empName}: ` : "";
        const formattedAmt = app.amount ? formatApprovalAmount(app.amount) : undefined;

        const eventPayload: Omit<CalendarEvent, "date"> = {
          id: `app-${app.id}`,
          type,
          title: `${prefix}${app.title || `${app.type} Request`}`,
          details: app.reason || app.details || (formattedAmt ? `Amount: ${formattedAmt}` : `${app.type} request`),
          status: app.status as any,
          amount: formattedAmt,
          userName: empName,
          raw: app,
        };

        if (app.start_date && app.end_date) {
          // Span across range
          const start = new Date(app.start_date);
          const end = new Date(app.end_date);
          // Clamp loop to maximum 90 days to avoid infinite/huge spans
          let curr = new Date(start);
          let count = 0;
          while (curr <= end && count < 90) {
            const dateStr = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, "0")}-${String(curr.getDate()).padStart(2, "0")}`;
            pushEvent(dateStr, {
              ...eventPayload,
              date: dateStr,
            });
            curr.setDate(curr.getDate() + 1);
            count++;
          }
        } else if (app.start_date) {
          pushEvent(app.start_date, {
            ...eventPayload,
            date: app.start_date,
          });
        } else if (app.created_at) {
          const dateStr = app.created_at.slice(0, 10);
          pushEvent(dateStr, {
            ...eventPayload,
            date: dateStr,
          });
        }
      });

      setEventsMap(newEvents);
    } catch (err) {
      console.error("Failed to load calendar data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [calendarScope]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((prev) => prev - 1);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((prev) => prev + 1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  const handleToday = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

  // Days in month calculation
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayWeekday = new Date(currentYear, currentMonth, 1).getDay();
  const prevMonthDays = new Date(currentYear, currentMonth, 0).getDate();
  const totalGridCells = Math.ceil((firstDayWeekday + daysInMonth) / 7) * 7;

  // Monthly stats
  const monthStats = useMemo(() => {
    let officeCount = 0;
    let remoteCount = 0;
    let leaveCount = 0;
    let wfhCount = 0;
    let pendingCount = 0;
    let holidayCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const events = eventsMap[dateStr] || [];
      events.forEach((evt) => {
        if (evt.type === "Attendance") {
          if (evt.status === "Remote") remoteCount++;
          else if (evt.status === "Present") officeCount++;
        } else if (evt.type === "Leave" && evt.status === "Approved") {
          leaveCount++;
        } else if (evt.type === "WFH" && evt.status === "Approved") {
          wfhCount++;
        } else if (evt.type === "Holiday") {
          holidayCount++;
        }
        if (evt.status === "Pending") {
          pendingCount++;
        }
      });
    }

    return { officeCount, remoteCount, leaveCount, wfhCount, pendingCount, holidayCount };
  }, [eventsMap, currentMonth, currentYear, daysInMonth]);

  const getEventIcon = (type: string, status?: string) => {
    if (type === "Attendance") {
      return status === "Remote" ? <HomeWork size={12} /> : <CheckCircle size={12} />;
    }
    switch (type) {
      case "Leave":
        return <FlightTakeoff size={12} />;
      case "WFH":
        return <HomeWork size={12} />;
      case "Reimbursement":
        return <Receipt size={12} />;
      case "Salary":
        return <Payment size={12} />;
      case "Mediclaim":
        return <MedicalServices size={12} />;
      case "Holiday":
        return <Sparkles size={12} />;
      default:
        return <CalendarIcon size={12} />;
    }
  };

  const getEventBadgeStyle = (type: string, status: string) => {
    if (type === "Holiday") {
      return {
        bg: "rgba(239, 68, 68, 0.1)",
        border: "rgba(239, 68, 68, 0.25)",
        color: "#dc2626",
      };
    }
    if (type === "Attendance") {
      return status === "Remote"
        ? {
            bg: "rgba(139, 92, 246, 0.1)",
            border: "rgba(139, 92, 246, 0.25)",
            color: "#7c3aed",
          }
        : {
            bg: "rgba(16, 185, 129, 0.1)",
            border: "rgba(16, 185, 129, 0.25)",
            color: "#059669",
          };
    }
    if (type === "WFH") {
      return {
        bg: "rgba(147, 51, 234, 0.1)",
        border: "rgba(147, 51, 234, 0.25)",
        color: "#9333ea",
      };
    }
    if (type === "Leave") {
      return status === "Approved"
        ? {
            bg: "rgba(59, 130, 246, 0.1)",
            border: "rgba(59, 130, 246, 0.25)",
            color: "#2563eb",
          }
        : {
            bg: "rgba(245, 158, 11, 0.1)",
            border: "rgba(245, 158, 11, 0.25)",
            color: "#d97706",
          };
    }
    if (type === "Reimbursement" || type === "Salary" || type === "Mediclaim") {
      return status === "Approved"
        ? {
            bg: "rgba(16, 185, 129, 0.1)",
            border: "rgba(16, 185, 129, 0.25)",
            color: "#059669",
          }
        : status === "Rejected"
          ? {
              bg: "rgba(239, 68, 68, 0.1)",
              border: "rgba(239, 68, 68, 0.25)",
              color: "#dc2626",
            }
          : {
              bg: "rgba(245, 158, 11, 0.1)",
              border: "rgba(245, 158, 11, 0.25)",
              color: "#d97706",
            };
    }
    return {
      bg: "var(--color-surface-subtle)",
      border: "var(--color-border)",
      color: "var(--color-text-primary)",
    };
  };

  const matchesFilter = (evt: CalendarEvent): boolean => {
    if (activeFilter === "ALL") return true;
    if (activeFilter === "ATTENDANCE") return evt.type === "Attendance";
    if (activeFilter === "LEAVES_WFH") return evt.type === "Leave" || evt.type === "WFH";
    if (activeFilter === "FINANCE")
      return evt.type === "Reimbursement" || evt.type === "Salary" || evt.type === "Mediclaim";
    if (activeFilter === "HOLIDAYS") return evt.type === "Holiday";
    return true;
  };

  return (
    <Layout activeTab="Calendar">
      <div className="calendar-page-container">
        {/* Top Header */}
        <div className="calendar-header-row">
          <div className="calendar-title-group">
            <h1 className="calendar-title">Personal Calendar</h1>
            <p className="calendar-subtitle">
              Consolidated view of your attendance, leaves, WFH, expense claims, and company holidays.
            </p>
          </div>

          <div className="calendar-controls-group">
            {/* Scope Switcher */}
            <div
              style={{
                display: "inline-flex",
                backgroundColor: "var(--color-surface-subtle)",
                padding: "3px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
              }}
            >
              <button
                type="button"
                onClick={() => setCalendarScope("MY")}
                style={{
                  padding: "4px 12px",
                  fontSize: "12px",
                  fontWeight: 500,
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: calendarScope === "MY" ? "var(--color-surface)" : "transparent",
                  color: calendarScope === "MY" ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  boxShadow: calendarScope === "MY" ? "var(--shadow-2xs)" : "none",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                My Schedule
              </button>
              <button
                type="button"
                onClick={() => setCalendarScope("COMPANY")}
                style={{
                  padding: "4px 12px",
                  fontSize: "12px",
                  fontWeight: 500,
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: calendarScope === "COMPANY" ? "var(--color-surface)" : "transparent",
                  color: calendarScope === "COMPANY" ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  boxShadow: calendarScope === "COMPANY" ? "var(--shadow-2xs)" : "none",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                Company Leaves
              </button>
            </div>

            {/* Today Button */}
            <button
              type="button"
              onClick={handleToday}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 500,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface)",
                color: "var(--color-text-primary)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <CalendarDays size={14} />
              Today
            </button>
          </div>
        </div>

        {/* Monthly Stats Overview Banner */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "var(--space-3)",
          }}
        >
          <div
            style={{
              padding: "12px 14px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "rgba(16, 185, 129, 0.1)",
                color: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle size={16} />
            </div>
            <div>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block" }}>
                Office Present
              </span>
              <strong style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                {monthStats.officeCount} days
              </strong>
            </div>
          </div>

          <div
            style={{
              padding: "12px 14px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "rgba(139, 92, 246, 0.1)",
                color: "#7c3aed",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <HomeWork size={16} />
            </div>
            <div>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block" }}>
                Remote Work
              </span>
              <strong style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                {monthStats.remoteCount} days
              </strong>
            </div>
          </div>

          <div
            style={{
              padding: "12px 14px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FlightTakeoff size={16} />
            </div>
            <div>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block" }}>
                Approved Leaves
              </span>
              <strong style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                {monthStats.leaveCount} days
              </strong>
            </div>
          </div>

          <div
            style={{
              padding: "12px 14px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "rgba(245, 158, 11, 0.1)",
                color: "#d97706",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Clock3 size={16} />
            </div>
            <div>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block" }}>
                Pending Requests
              </span>
              <strong style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                {monthStats.pendingCount}
              </strong>
            </div>
          </div>

          <div
            style={{
              padding: "12px 14px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                color: "#dc2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={16} />
            </div>
            <div>
              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", display: "block" }}>
                Holidays
              </span>
              <strong style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                {monthStats.holidayCount}
              </strong>
            </div>
          </div>
        </div>

        {/* Filter Chips Bar & Legend */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "var(--space-3)",
            padding: "8px 14px",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {/* Filters */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", marginRight: "4px" }}>
              <Filter size={12} style={{ display: "inline", marginRight: "4px", verticalAlign: "middle" }} />
              VIEW:
            </span>
            {[
              { key: "ALL", label: "All Items" },
              { key: "ATTENDANCE", label: "Attendance" },
              { key: "LEAVES_WFH", label: "Leaves & WFH" },
              { key: "FINANCE", label: "Finance & Claims" },
              { key: "HOLIDAYS", label: "Holidays" },
            ].map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setActiveFilter(f.key as FilterCategory)}
                style={{
                  padding: "4px 10px",
                  fontSize: "11.5px",
                  fontWeight: 500,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid",
                  borderColor: activeFilter === f.key ? "var(--color-primary, #3b82f6)" : "var(--color-border)",
                  backgroundColor:
                    activeFilter === f.key ? "rgba(59, 130, 246, 0.08)" : "transparent",
                  color:
                    activeFilter === f.key ? "var(--color-primary, #3b82f6)" : "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Quick Legend */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px", color: "var(--color-text-muted)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: "#059669" }} />
              Office
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: "#7c3aed" }} />
              Remote
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: "#2563eb" }} />
              Leave
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: "#dc2626" }} />
              Holiday
            </span>
          </div>
        </div>

        {/* Main Calendar Card */}
        <div className="calendar-grid-container">
          {/* Calendar Header with Switcher */}
          <div className="calendar-month-header">
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>
              {calendarScope === "MY" ? "My Month Planner" : "Company Schedule"}
            </span>

            {/* Month/Year Switcher */}
            <div className="calendar-month-navigator">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="calendar-nav-btn"
                title="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="calendar-nav-label">
                {MONTH_NAMES[currentMonth]} {currentYear}
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                className="calendar-nav-btn"
                title="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              borderBottom: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface-subtle)",
              textAlign: "center",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--color-text-muted)",
              textTransform: "uppercase",
              padding: "8px 0",
            }}
          >
            {WEEKDAYS.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>

          {/* Calendar Day Cells Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: "1px",
              backgroundColor: "var(--color-border-subtle)",
            }}
          >
            {Array.from({ length: totalGridCells }).map((_, idx) => {
              const isLeading = idx < firstDayWeekday;
              const isTrailing = idx >= firstDayWeekday + daysInMonth;
              let dayNum = 0;
              let cellMonth = currentMonth;
              let cellYear = currentYear;

              if (isLeading) {
                dayNum = prevMonthDays - firstDayWeekday + 1 + idx;
                cellMonth = currentMonth === 0 ? 11 : currentMonth - 1;
                cellYear = currentMonth === 0 ? currentYear - 1 : currentYear;
              } else if (isTrailing) {
                dayNum = idx - (firstDayWeekday + daysInMonth) + 1;
                cellMonth = currentMonth === 11 ? 0 : currentMonth + 1;
                cellYear = currentMonth === 11 ? currentYear + 1 : currentYear;
              } else {
                dayNum = idx - firstDayWeekday + 1;
              }

              const dateStr = `${cellYear}-${String(cellMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const isToday = dateStr === todayStr;
              const weekday = new Date(cellYear, cellMonth, dayNum).getDay();
              const isOff = offDays.includes(weekday);
              const isWeekend = weekday === 0 || weekday === 6;

              const rawDayEvents = eventsMap[dateStr] || [];
              const dayEvents = rawDayEvents.filter(matchesFilter);
              const holiday = rawDayEvents.find((e) => e.type === "Holiday");
              const isMuted = isLeading || isTrailing;

              return (
                <div
                  key={`cell-${idx}-${dateStr}`}
                  style={{
                    backgroundColor: isMuted
                      ? "var(--color-surface-subtle)"
                      : holiday
                        ? "rgba(239, 68, 68, 0.03)"
                        : isOff
                          ? "var(--color-surface-subtle)"
                          : "var(--color-surface)",
                    minHeight: "110px",
                    padding: "6px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    opacity: isMuted ? 0.4 : 1,
                    transition: "background-color 0.15s ease",
                    cursor: dayEvents.length > 0 ? "pointer" : "default",
                  }}
                  onClick={() => {
                    if (dayEvents.length > 0) {
                      setSelectedDayEvents({ dateStr, events: dayEvents });
                    }
                  }}
                >
                  {/* Top Bar inside cell: Date number & Off/Holiday tags */}
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
                        fontSize: "12px",
                        fontWeight: isToday ? 600 : 500,
                        padding: isToday ? "0" : "2px 4px",
                      }}
                    >
                      {dayNum}
                    </span>

                    {/* Weekend or Holiday tag */}
                    {holiday && !isMuted ? (
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 600,
                          color: "#dc2626",
                          backgroundColor: "rgba(239, 68, 68, 0.1)",
                          padding: "1px 4px",
                          borderRadius: "3px",
                        }}
                        title={holiday.title}
                      >
                        HOLIDAY
                      </span>
                    ) : isWeekend && !isMuted ? (
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 500,
                          color: "var(--color-text-muted)",
                        }}
                      >
                        WKND
                      </span>
                    ) : isOff && !isMuted ? (
                      <span
                        style={{
                          fontSize: "9px",
                          fontWeight: 500,
                          color: "var(--color-text-muted)",
                        }}
                      >
                        OFF
                      </span>
                    ) : null}
                  </div>

                  {/* Event Chips */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "3px",
                      marginTop: "2px",
                      overflow: "hidden",
                    }}
                  >
                    {dayEvents.slice(0, 3).map((evt) => {
                      const badgeStyle = getEventBadgeStyle(evt.type, evt.status);
                      return (
                        <button
                          key={evt.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(evt);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "2px 5px",
                            borderRadius: "4px",
                            border: `1px solid ${badgeStyle.border}`,
                            backgroundColor: badgeStyle.bg,
                            color: badgeStyle.color,
                            fontSize: "10.5px",
                            fontWeight: 500,
                            textAlign: "left",
                            width: "100%",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            cursor: "pointer",
                            transition: "transform 0.1s ease",
                          }}
                          title={`${evt.title} (${evt.status})${evt.details ? ` - ${evt.details}` : ""}`}
                        >
                          <span style={{ flexShrink: 0 }}>{getEventIcon(evt.type, evt.status)}</span>
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {evt.title}
                          </span>
                        </button>
                      );
                    })}

                    {dayEvents.length > 3 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDayEvents({ dateStr, events: dayEvents });
                        }}
                        style={{
                          fontSize: "10px",
                          color: "var(--color-text-muted)",
                          fontWeight: 500,
                          padding: "1px 4px",
                          textAlign: "left",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        +{dayEvents.length - 3} more items
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day Events Overview Modal (Radix Dialog) */}
        <Dialog.Root
          open={!!selectedDayEvents}
          onOpenChange={(open) => !open && setSelectedDayEvents(null)}
        >
          <Dialog.Portal>
            <Dialog.Overlay
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                backdropFilter: "blur(4px)",
                zIndex: 1000,
              }}
            />
            <Dialog.Content
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-xl)",
                width: "90vw",
                maxWidth: "520px",
                maxHeight: "85vh",
                overflowY: "auto",
                zIndex: 1001,
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid var(--color-border)",
                  paddingBottom: "12px",
                }}
              >
                <div>
                  <Dialog.Title
                    style={{
                      fontSize: "16px",
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                      margin: 0,
                    }}
                  >
                    Schedule for {selectedDayEvents?.dateStr}
                  </Dialog.Title>
                  <Dialog.Description
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text-muted)",
                      margin: "2px 0 0 0",
                    }}
                  >
                    All attendance check-ins, leaves, and requests for this date.
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    <Close size={18} />
                  </button>
                </Dialog.Close>
              </div>

              {/* List of events */}
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {selectedDayEvents?.events.map((evt) => {
                  const badgeStyle = getEventBadgeStyle(evt.type, evt.status);
                  return (
                    <div
                      key={evt.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--color-border)",
                        backgroundColor: "var(--color-surface-subtle)",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                      }}
                    >
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: badgeStyle.bg,
                          color: badgeStyle.color,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          marginTop: "2px",
                        }}
                      >
                        {getEventIcon(evt.type, evt.status)}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                            {evt.title}
                          </span>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 500,
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: badgeStyle.bg,
                              color: badgeStyle.color,
                              border: `1px solid ${badgeStyle.border}`,
                              textTransform: "uppercase",
                            }}
                          >
                            {evt.status}
                          </span>
                        </div>
                        <p style={{ fontSize: "12px", color: "var(--color-text-muted)", margin: "3px 0 0 0" }}>
                          {evt.details}
                        </p>
                        {evt.amount && (
                          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-primary)", marginTop: "4px" }}>
                            Amount: {evt.amount}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Detailed Single Event Inspection Dialog (Radix Dialog) */}
        <Dialog.Root open={!!selectedEvent} onOpenChange={(open) => !open && setSelectedEvent(null)}>
          <Dialog.Portal>
            <Dialog.Overlay
              style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                backdropFilter: "blur(4px)",
                zIndex: 1000,
              }}
            />
            <Dialog.Content
              style={{
                position: "fixed",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                boxShadow: "var(--shadow-xl)",
                width: "90vw",
                maxWidth: "460px",
                zIndex: 1001,
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {selectedEvent && (
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      borderBottom: "1px solid var(--color-border)",
                      paddingBottom: "12px",
                      marginBottom: "14px",
                    }}
                  >
                    <Dialog.Title
                      style={{
                        fontSize: "15px",
                        fontWeight: 600,
                        color: "var(--color-text-primary)",
                        margin: 0,
                      }}
                    >
                      Event Details
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        <Close size={18} />
                      </button>
                    </Dialog.Close>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "var(--radius-md)",
                        backgroundColor: getEventBadgeStyle(selectedEvent.type, selectedEvent.status).bg,
                        color: getEventBadgeStyle(selectedEvent.type, selectedEvent.status).color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {getEventIcon(selectedEvent.type, selectedEvent.status)}
                    </div>
                    <div>
                      <h4
                        style={{
                          fontSize: "14px",
                          fontWeight: 600,
                          color: "var(--color-text-primary)",
                          margin: 0,
                        }}
                      >
                        {selectedEvent.title}
                      </h4>
                      <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: "2px 0 0 0" }}>
                        TYPE: {selectedEvent.type.toUpperCase()} • DATE: {selectedEvent.date}
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px",
                      backgroundColor: "var(--color-surface-subtle)",
                      padding: "12px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                      <span style={{ color: "var(--color-text-muted)" }}>Status</span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: getEventBadgeStyle(selectedEvent.type, selectedEvent.status).color,
                          textTransform: "uppercase",
                        }}
                      >
                        {selectedEvent.status}
                      </span>
                    </div>

                    {selectedEvent.amount && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                        <span style={{ color: "var(--color-text-muted)" }}>Amount</span>
                        <strong style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>
                          {selectedEvent.amount}
                        </strong>
                      </div>
                    )}

                    {selectedEvent.time && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                        <span style={{ color: "var(--color-text-muted)" }}>Time</span>
                        <span style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>
                          {selectedEvent.time}
                        </span>
                      </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
                      <span style={{ color: "var(--color-text-muted)" }}>Details / Reason</span>
                      <span style={{ color: "var(--color-text-primary)", lineHeight: 1.4 }}>
                        {selectedEvent.details || "No additional details provided."}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </Layout>
  );
}
