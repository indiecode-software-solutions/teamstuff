import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Users } from "lucide-react";
import { getDayIndex, DEFAULT_COMPANY_OFF_DAYS, type CompanyHoliday } from "../../lib/leave";
import { Tooltip, TooltipTrigger, TooltipContent } from "../ui/tooltip";
import { Avatar, AvatarImage, AvatarFallback } from "../ui/avatar";
import { cn } from "@/lib/utils";

export interface OnLeaveEmployee {
  name: string;
  profilePhoto?: string | null;
}

interface HolidayCalendarProps {
  holidays: CompanyHoliday[];
  onLeaveToday?: OnLeaveEmployee[];
  title?: string;
  fill?: boolean;
  offDays?: number[];
  id?: string;
  loading?: boolean;
}

interface DayCell {
  day: number;
  dateStr: string;
  isHoliday: boolean;
  isOff: boolean;
  name: string | null;
  isToday: boolean;
  isPast: boolean;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
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

const HOLIDAY_DARK = "#18181b";
const OFF_TINT = "rgba(148,163,184,0.14)";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function HolidayCalendar({
  holidays,
  onLeaveToday = [],
  title,
  fill,
  offDays = DEFAULT_COMPANY_OFF_DAYS,
  id,
  loading = false,
}: HolidayCalendarProps) {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const todayLabel = now.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const [viewMode, setViewMode] = useState<"calendar" | "leave">("calendar");
  const [view, setView] = useState(() => ({
    year: now.getFullYear(),
    month: now.getMonth(),
  }));

  const holidayMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of holidays) map.set(h.date, h.name);
    return map;
  }, [holidays]);

  const cells = useMemo<(DayCell | null)[]>(() => {
    const firstWeekday = new Date(view.year, view.month, 1).getDay();
    const totalDays = new Date(view.year, view.month + 1, 0).getDate();
    const out: (DayCell | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${view.year}-${pad(view.month + 1)}-${pad(d)}`;
      const name = holidayMap.get(dateStr) ?? null;
      out.push({
        day: d,
        dateStr,
        isHoliday: name !== null,
        isOff: !name && offDays.includes(getDayIndex(dateStr)),
        name,
        isToday: dateStr === todayStr,
        isPast: dateStr < todayStr,
      });
    }
    return out;
  }, [view, holidayMap, todayStr, offDays]);

  function goPrev() {
    setView((v) =>
      v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 },
    );
  }
  function goNext() {
    setView((v) =>
      v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 },
    );
  }

  const leaveCount = onLeaveToday.length;

  return (
    <div
      id={id}
      className={cn(
        "dashboard-card calendar-widget-wrapper",
        fill ? "dashboard-card-fill" : "",
      )}
    >
      {/* Header with toggle */}
      {title && (
        <div className="dashboard-card-header">
          {viewMode === "calendar" ? (
            <>
              <div className="dashboard-card-title-wrap">
                <CalendarDays size={18} className="dashboard-card-title-icon" />
                <h3 className="dashboard-card-title">{title}</h3>
              </div>
              <div className="calendar-header-actions">
                <div className="calendar-month-navigator">
                  <button
                    type="button"
                    onClick={goPrev}
                    aria-label="Previous month"
                    className="calendar-nav-btn"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span
                    className={cn(
                      "calendar-nav-label",
                      loading && "skeleton-shimmer",
                    )}
                    style={
                      loading
                        ? { borderRadius: "4px", padding: "1px 8px" }
                        : undefined
                    }
                  >
                    {MONTHS[view.month]} {view.year}
                  </span>
                  <button
                    type="button"
                    onClick={goNext}
                    aria-label="Next month"
                    className="calendar-nav-btn"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
                {leaveCount > 0 && !loading && (
                  <button
                    type="button"
                    onClick={() => setViewMode("leave")}
                    className="dashboard-card-action-btn"
                  >
                    On leave: {leaveCount}
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="dashboard-card-title-wrap">
                <Users size={18} className="dashboard-card-title-icon" />
                <h3 className="dashboard-card-title">On Leave Today</h3>
              </div>
              <div className="calendar-header-actions">
                <button
                  type="button"
                  onClick={() => setViewMode("calendar")}
                  className="dashboard-card-action-btn"
                >
                  Back to Calendar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Calendar view */}
      {viewMode === "calendar" && (
        <div>
          {/* Weekday labels */}
          <div className="calendar-weekdays-row">
            {WEEKDAYS.map((w) => (
              <span key={w}>
                {w}
              </span>
            ))}
          </div>

          {/* Day grid */}
          <div className="calendar-compact-grid">
            {cells.map((cell, i) => {
              if (!cell) {
                return <div key={`blank-${i}`} className="calendar-compact-cell-blank" />;
              }

              if (loading) {
                return (
                  <div key={cell.dateStr} className="calendar-compact-cell">
                    <span className="skeleton-shimmer calendar-compact-cell-skeleton" />
                  </div>
                );
              }

              const cellElement = (
                <div
                  className={cn(
                    "calendar-compact-cell",
                    cell.isHoliday && "calendar-compact-cell-holiday",
                    cell.isToday && "calendar-compact-cell-today",
                    cell.isOff && "calendar-compact-cell-off",
                  )}
                >
                  {cell.day}
                </div>
              );

              if (cell.isHoliday && cell.name) {
                return (
                  <Tooltip key={cell.dateStr}>
                    <TooltipTrigger asChild>{cellElement}</TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6}>
                      {cell.name}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return <React.Fragment key={cell.dateStr}>{cellElement}</React.Fragment>;
            })}
          </div>
        </div>
      )}

      {/* Legend / Footer (only in calendar mode) */}
      {viewMode === "calendar" && (
        <div className="calendar-legend-row">
          <div className="calendar-legend-item">
            <div className="calendar-legend-dot calendar-legend-holiday" />
            <span>Holiday</span>
          </div>
          <div className="calendar-legend-item">
            <div className="calendar-legend-dot calendar-legend-off" />
            <span>Weekly Off</span>
          </div>
          <div className="calendar-legend-item">
            <div className="calendar-legend-box calendar-legend-today" />
            <span>Today</span>
          </div>
        </div>
      )}

      {/* On-leave list view */}
      {viewMode === "leave" && (
        <div className={cn("", fill ? "" : "")}>
          <div >{todayLabel}</div>
          {leaveCount === 0 ? (
            <div >
              No one is on leave today.
            </div>
          ) : (
            <div >
              {onLeaveToday.map((emp, idx) => (
                <div
                  key={idx}
                  
                >
                  <Avatar >
                    <AvatarImage src={emp.profilePhoto || undefined}  />
                    <AvatarFallback >
                      {initials(emp.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span >{emp.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
