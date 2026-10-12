import React, { useState, useMemo } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  UserMinus,
  ClockAlert,
  CalendarDays,
  Home,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export type OutReasonType = "leave" | "unclocked" | "wfh";

export interface OutEmployee {
  id: string;
  userId?: string;
  name: string;
  role: string;
  department: string;
  avatarUrl?: string | null;
  statusType: OutReasonType;
  statusLabel: string;
  detail: string;
  dateScope: "today" | "tomorrow" | "thisWeek";
}

const DEFAULT_MOCK_OUT_DATA: OutEmployee[] = [
  {
    id: "out-1",
    name: "Rohan Deshmukh",
    role: "Senior UI Designer",
    department: "Design",
    avatarUrl: null,
    statusType: "unclocked",
    statusLabel: "Not Clocked In",
    detail: "",
    dateScope: "today",
  },
  {
    id: "out-2",
    name: "Priya Sharma",
    role: "HR Executive",
    department: "Human Resources",
    avatarUrl: null,
    statusType: "leave",
    statusLabel: "Casual Leave",
    detail: "Approved full-day leave • Back tomorrow",
    dateScope: "today",
  },
  {
    id: "out-3",
    name: "Vikram Mehta",
    role: "DevOps Engineer",
    department: "Engineering",
    avatarUrl: null,
    statusType: "wfh",
    statusLabel: "Work From Home",
    detail: "Approved remote work shift",
    dateScope: "today",
  },
  {
    id: "out-4",
    name: "Ananya Iyer",
    role: "Product Manager",
    department: "Product",
    avatarUrl: null,
    statusType: "leave",
    statusLabel: "Sick Leave",
    detail: "Scheduled leave • All day",
    dateScope: "tomorrow",
  },
  {
    id: "out-5",
    name: "Priya Sharma",
    role: "HR Executive",
    department: "Human Resources",
    avatarUrl: null,
    statusType: "leave",
    statusLabel: "Casual Leave",
    detail: "Day 2 of 2",
    dateScope: "tomorrow",
  },
  {
    id: "out-6",
    name: "Siddharth Rao",
    role: "Backend Architect",
    department: "Engineering",
    avatarUrl: null,
    statusType: "leave",
    statusLabel: "Annual Vacation",
    detail: "Wed - Fri (3 days planned)",
    dateScope: "thisWeek",
  },
  {
    id: "out-7",
    name: "Ananya Iyer",
    role: "Product Manager",
    department: "Product",
    avatarUrl: null,
    statusType: "leave",
    statusLabel: "Sick Leave",
    detail: "Thu scheduled off",
    dateScope: "thisWeek",
  },
  {
    id: "out-8",
    name: "Karan Patel",
    role: "Sales Lead",
    department: "Growth",
    avatarUrl: null,
    statusType: "wfh",
    statusLabel: "Client WFH",
    detail: "Friday remote schedule",
    dateScope: "thisWeek",
  },
];

const ITEMS_PER_PAGE = 3;

export interface WhosOutWidgetProps {
  id?: string;
  items?: OutEmployee[];
  loading?: boolean;
  onActionClick?: () => void;
  teammateUserIds?: string[];
  initialScope?: "company" | "team";
}

function getVisiblePages(current: number, total: number): (number | "ellipsis-start" | "ellipsis-end")[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 3) {
    return [1, 2, 3, "ellipsis-end", total];
  }
  if (current >= total - 2) {
    return [1, "ellipsis-start", total - 2, total - 1, total];
  }
  return [1, "ellipsis-start", current, "ellipsis-end", total];
}

export function WhosOutWidget({
  id = "dashboard-whos-out-card",
  items,
  loading = false,
  onActionClick,
  teammateUserIds,
  initialScope = "company",
}: WhosOutWidgetProps) {
  const displayItems = items !== undefined ? items : DEFAULT_MOCK_OUT_DATA;
  const [activeTab, setActiveTab] = useState<"today" | "tomorrow" | "thisWeek">("today");
  const [currentPage, setCurrentPage] = useState(1);
  const [scope, setScopeState] = useState<"company" | "team">(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("whos_out_scope_pref");
        if (saved === "company" || saved === "team") {
          return saved;
        }
      } catch (e) {
        // ignore
      }
    }
    return initialScope;
  });

  const handleTabChange = (tab: "today" | "tomorrow" | "thisWeek") => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const setScope = (newScope: "company" | "team") => {
    setScopeState(newScope);
    setCurrentPage(1);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("whos_out_scope_pref", newScope);
      } catch (e) {
        // ignore
      }
    }
  };

  const navigate = useNavigate();
  const teammateSet = useMemo(() => new Set(teammateUserIds || []), [teammateUserIds]);

  const scopedItems = useMemo(() => {
    if (scope === "company") return displayItems;
    if (teammateUserIds !== undefined) {
      if (teammateUserIds.length === 0) return [];
      return displayItems.filter((i) => i.userId && teammateSet.has(i.userId));
    }
    if (items !== undefined) return displayItems;
    return displayItems.filter((_, idx) => idx % 2 === 0);
  }, [scope, displayItems, teammateUserIds, teammateSet, items]);

  const todayCount = scopedItems.filter((i) => i.dateScope === "today").length;
  const tomorrowCount = scopedItems.filter((i) => i.dateScope === "tomorrow").length;
  const thisWeekCount = scopedItems.filter((i) => i.dateScope === "thisWeek").length;

  const currentList = scopedItems.filter((i) => i.dateScope === activeTab);
  const totalPages = Math.ceil(currentList.length / ITEMS_PER_PAGE);
  const safePage = Math.max(1, Math.min(currentPage, totalPages || 1));
  const paginatedList = currentList.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);
  const visiblePages = useMemo(() => getVisiblePages(safePage, totalPages), [safePage, totalPages]);

  const getStatusChipConfig = (type: OutReasonType, label: string) => {
    switch (type) {
      case "unclocked":
        return {
          icon: <ClockAlert />,
          bg: "bg-zinc-100 text-zinc-900 border-zinc-300",
          label: label || "Not Clocked In",
        };
      case "leave":
        return {
          icon: <CalendarDays />,
          bg: "bg-zinc-100 text-zinc-900 border-zinc-300",
          label: label || "On Leave",
        };
      case "wfh":
        return {
          icon: <Home />,
          bg: "bg-zinc-100 text-zinc-900 border-zinc-200",
          label: label || "Remote / WFH",
        };
      default:
        return {
          icon: <UserMinus />,
          bg: "bg-slate-100 text-slate-700 border-slate-200",
          label: label || "Away",
        };
    }
  };

  return (
    <div
      id={id}
      className="dashboard-card"
    >
      {/* Header */}
      <div className="dashboard-card-header">
        <div className="dashboard-card-title-wrap">
          <UserMinus size={18} className="dashboard-card-title-icon" />
          <h3 className="dashboard-card-title">Who's Out</h3>
        </div>

        {/* Scope Dropdown */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="dashboard-card-action-btn"
            >
              <span>{scope === "company" ? "Company wide" : "Team"}</span>
              <ChevronDown size={14} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="whos-out-dropdown-content"
            >
              <DropdownMenu.Item
                onClick={() => setScope("company")}
                className={`whos-out-dropdown-item ${scope === "company" ? "whos-out-dropdown-item-active" : ""}`}
              >
                <span>Company wide</span>
                {scope === "company" && <Check size={14} />}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onClick={() => setScope("team")}
                className={`whos-out-dropdown-item ${scope === "team" ? "whos-out-dropdown-item-active" : ""}`}
              >
                <span>Team</span>
                {scope === "team" && <Check size={14} />}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Timeframe Filter Pills */}
      <div className="dashboard-pill-tabs">
        <button
          type="button"
          onClick={() => handleTabChange("today")}
          className={activeTab === "today" ? "dashboard-pill-tab dashboard-pill-tab-active" : "dashboard-pill-tab"}
        >
          <span>Today</span>
          <span className="dashboard-pill-tab-count">
            {loading ? "..." : todayCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("tomorrow")}
          className={activeTab === "tomorrow" ? "dashboard-pill-tab dashboard-pill-tab-active" : "dashboard-pill-tab"}
        >
          <span>Tomorrow</span>
          <span className="dashboard-pill-tab-count">
            {loading ? "..." : tomorrowCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("thisWeek")}
          className={activeTab === "thisWeek" ? "dashboard-pill-tab dashboard-pill-tab-active" : "dashboard-pill-tab"}
        >
          <span>This Week</span>
          <span className="dashboard-pill-tab-count">
            {loading ? "..." : thisWeekCount}
          </span>
        </button>
      </div>

      {/* Employee Out List */}
      <div className="whos-out-content">
        {loading ? (
          <div className="whos-out-list">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="dashboard-skeleton-row">
                <div className="skeleton-shimmer skeleton-avatar" />
                <div className="skeleton-text-group">
                  <div className="skeleton-shimmer skeleton-line-title" />
                  <div className="skeleton-shimmer skeleton-line-sub" />
                </div>
                <div className="skeleton-shimmer skeleton-pill-badge" />
              </div>
            ))}
          </div>
        ) : currentList.length === 0 ? (
          <div className="whos-out-empty-box">
            <div className="whos-out-empty-icon">
              <CheckCircle2 size={20} strokeWidth={2.2} />
            </div>
            <p className="whos-out-empty-title">
              {scope === "team" ? "All teammates present!" : "All team members present!"}
            </p>
            <p className="whos-out-empty-desc">
              {scope === "team" && teammateUserIds && teammateUserIds.length === 0
                ? "You are not currently assigned to any team."
                : activeTab === "today"
                ? scope === "team"
                  ? "Every teammate has clocked in and no leaves recorded."
                  : "Every active team member has clocked in and no leaves recorded."
                : activeTab === "tomorrow"
                ? scope === "team"
                  ? "No teammates on scheduled leave tomorrow."
                  : "No approved leaves scheduled for tomorrow."
                : scope === "team"
                ? "No teammates scheduled off across the rest of this week."
                : "No leaves scheduled across the rest of this week."}
            </p>
          </div>
        ) : (
          <div className="whos-out-list">
            {paginatedList.map((emp) => {
              const chip = getStatusChipConfig(emp.statusType, emp.statusLabel);
              return (
                <div
                  key={emp.id}
                  className="whos-out-item"
                >
                  <div className="whos-out-item-left">
                    {emp.avatarUrl ? (
                      <img
                        src={emp.avatarUrl}
                        alt={emp.name}
                        className="whos-out-avatar"
                      />
                    ) : (
                      <div className="whos-out-avatar-initials">
                        {emp.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                    )}

                    <div className="whos-out-details">
                      <p className="whos-out-name">
                        {emp.name}
                      </p>
                      <p className="whos-out-role">
                        {emp.role || "Team Member"}
                        {activeTab === "thisWeek" && emp.detail
                          ? ` • ${(emp.detail.split("•")[0] ?? "").trim()}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <span className={`whos-out-chip whos-out-chip-${emp.statusType}`}>
                    {chip.icon}
                    <span>{chip.label}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Accessible Pagination Controls */}
        {!loading && totalPages > 1 && (
          <nav
            aria-label="Who's Out list pagination"
            className="whos-out-pagination"
          >
            <div className="whos-out-pagination-summary">
              <span className="whos-out-pagination-info">
                Showing <span className="whos-out-pagination-highlight">{(safePage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(safePage * ITEMS_PER_PAGE, currentList.length)}</span> of <span className="whos-out-pagination-highlight">{currentList.length}</span>
              </span>
              <span className="whos-out-sr-only" aria-live="polite" aria-atomic="true">
                Page {safePage} of {totalPages}, showing {(safePage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(safePage * ITEMS_PER_PAGE, currentList.length)} of {currentList.length} employees
              </span>
            </div>

            <div className="whos-out-pagination-cluster">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                aria-disabled={safePage === 1}
                className="whos-out-nav-btn"
                aria-label="Go to previous page"
              >
                <ChevronLeft size={14} aria-hidden="true" />
              </button>

              <div className="whos-out-page-pills" role="group" aria-label="Page selection">
                {visiblePages.map((item, idx) => {
                  if (typeof item === "string") {
                    return (
                      <span
                        key={`ellipsis-${idx}`}
                        className="whos-out-page-ellipsis"
                        aria-hidden="true"
                      >
                        …
                      </span>
                    );
                  }
                  const pageNum = item;
                  const isActive = safePage === pageNum;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`whos-out-page-pill ${isActive ? "whos-out-page-pill-active" : ""}`}
                      aria-current={isActive ? "page" : undefined}
                      aria-label={`Page ${pageNum}`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                aria-disabled={safePage === totalPages}
                className="whos-out-nav-btn"
                aria-label="Go to next page"
              >
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
