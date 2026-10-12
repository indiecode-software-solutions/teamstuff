import React, { useState } from "react";
import {
  FileText,
  CalendarDays,
  Home,
  Receipt,
  Clock,
  BriefcaseMedical,
  CheckCircle2,
  Clock3,
  XCircle,
  ChevronRight,
  Plus,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export type RequestCategory =
  | "Leave"
  | "WFH"
  | "Reimbursement"
  | "Attendance"
  | "Mediclaim"
  | "Salary";
export type RequestStatus = "Approved" | "Pending" | "Rejected";

export interface DashboardRequestItem {
  id: string;
  type: RequestCategory;
  title: string;
  applicantName?: string;
  applicantRole?: string;
  applicantAvatar?: string | null;
  approverName?: string;
  submittedAt: string;
  status: RequestStatus;
  detail: string;
  direction: "mine" | "incoming";
}

const DEFAULT_MOCK_REQUESTS: DashboardRequestItem[] = [
  {
    id: "req-1",
    type: "Leave",
    title: "Casual Leave",
    detail: "2 days (Sep 14 - Sep 15)",
    approverName: "HR Manager",
    submittedAt: "Yesterday",
    status: "Approved",
    direction: "mine",
  },
  {
    id: "req-2",
    type: "WFH",
    title: "Work From Home",
    detail: "Single day (Sep 18)",
    approverName: "Team Lead",
    submittedAt: "2 days ago",
    status: "Pending",
    direction: "mine",
  },
  {
    id: "req-3",
    type: "Reimbursement",
    title: "Client Lunch & Travel",
    detail: "$42.50 • Receipt attached",
    approverName: "Finance Lead",
    submittedAt: "Sep 8",
    status: "Approved",
    direction: "mine",
  },
  {
    id: "req-4",
    type: "Attendance",
    title: "Attendance Regularization",
    detail: "Missed punch-out on Sep 9",
    approverName: "HR Manager",
    submittedAt: "Sep 10",
    status: "Pending",
    direction: "mine",
  },
  {
    id: "req-inc-1",
    type: "Leave",
    title: "Sick Leave — Rohan Deshmukh",
    detail: "1 day off requested",
    applicantName: "Rohan Deshmukh",
    applicantRole: "Senior UI Designer",
    submittedAt: "3 hours ago",
    status: "Pending",
    direction: "incoming",
  },
  {
    id: "req-inc-2",
    type: "Reimbursement",
    title: "Software Subscription — Vikram Mehta",
    detail: "$29.00 Cloud Dev tools",
    applicantName: "Vikram Mehta",
    applicantRole: "DevOps Engineer",
    submittedAt: "Yesterday",
    status: "Pending",
    direction: "incoming",
  },
];

interface MyRequestsWidgetProps {
  id?: string;
  items?: DashboardRequestItem[];
  canApprove?: boolean;
  loading?: boolean;
}

export function MyRequestsWidget({
  id = "dashboard-my-requests-card",
  items = DEFAULT_MOCK_REQUESTS,
  canApprove = true,
  loading = false,
}: MyRequestsWidgetProps) {
  const [activeTab, setActiveTab] = useState<"mine" | "incoming">("mine");
  const navigate = useNavigate();

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 4;

  const myRequests = items.filter((i) => i.direction === "mine");
  const incomingRequests = items.filter((i) => i.direction === "incoming");

  const currentList = activeTab === "mine" ? myRequests : incomingRequests;
  const totalPages = Math.ceil(currentList.length / itemsPerPage);
  const paginatedList = currentList.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleTabChange = (tab: "mine" | "incoming") => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const getCategoryIcon = (type: RequestCategory) => {
    switch (type) {
      case "Leave":
        return <CalendarDays size={16} />;
      case "WFH":
        return <Home size={16} />;
      case "Reimbursement":
        return <Receipt size={16} />;
      case "Attendance":
        return <Clock size={16} />;
      case "Mediclaim":
        return <BriefcaseMedical size={16} />;
      default:
        return <FileText size={16} />;
    }
  };

  const getStatusBadge = (status: RequestStatus) => {
    switch (status) {
      case "Approved":
        return (
          <span className="requests-status-badge requests-status-approved">
            <CheckCircle2 size={11} strokeWidth={2.2} />
            <span>Approved</span>
          </span>
        );
      case "Pending":
        return (
          <span className="requests-status-badge requests-status-pending">
            <Clock3 size={11} strokeWidth={2.2} />
            <span>Pending</span>
          </span>
        );
      case "Rejected":
        return (
          <span className="requests-status-badge requests-status-rejected">
            <XCircle size={11} strokeWidth={2.2} />
            <span>Rejected</span>
          </span>
        );
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
          <FileText size={18} className="dashboard-card-title-icon" />
          <h3 className="dashboard-card-title">Approvals & Requests</h3>
        </div>

        <button
          type="button"
          onClick={() => navigate({ to: "/approvals" })}
          className="dashboard-card-action-btn"
        >
          View All
        </button>
      </div>

      {/* Tab Toggle (My Requests vs To Approve) */}
      <div className="dashboard-pill-tabs">
        <button
          type="button"
          onClick={() => handleTabChange("mine")}
          className={activeTab === "mine" ? "dashboard-pill-tab dashboard-pill-tab-active" : "dashboard-pill-tab"}
        >
          <span>My Requests</span>
          <span className="dashboard-pill-tab-count">
            {loading ? "..." : myRequests.length}
          </span>
        </button>

        {canApprove && (
          <button
            type="button"
            onClick={() => handleTabChange("incoming")}
            className={activeTab === "incoming" ? "dashboard-pill-tab dashboard-pill-tab-active" : "dashboard-pill-tab"}
          >
            <span>To Approve</span>
            <span className="dashboard-pill-tab-count">
              {loading ? "..." : incomingRequests.length}
            </span>
          </button>
        )}
      </div>

      {/* Requests List */}
      <div className="requests-list">
        {loading ? (
          [1, 2, 3].map((idx) => (
            <div key={idx} className="dashboard-skeleton-row">
              <div className="skeleton-shimmer skeleton-icon-box" />
              <div className="skeleton-text-group">
                <div className="skeleton-shimmer skeleton-line-title" />
                <div className="skeleton-shimmer skeleton-line-sub" />
              </div>
              <div className="skeleton-shimmer skeleton-pill-badge" />
            </div>
          ))
        ) : currentList.length === 0 ? (
          <div className="requests-empty-box">
            <div className="requests-empty-icon">
              <FileText size={20} strokeWidth={2} />
            </div>
            <p className="requests-empty-title">
              {activeTab === "mine" ? "No active requests" : "No pending approvals"}
            </p>
            <p className="requests-empty-desc">
              {activeTab === "mine"
                ? "You don't have any pending or recent approval requests."
                : "All submitted requests for your approval have been processed."}
            </p>
            {activeTab === "mine" && (
              <button
                type="button"
                onClick={() => navigate({ to: "/approvals" })}
                className="requests-empty-btn"
              >
                <Plus size={14} />
                <span>Create Request</span>
              </button>
            )}
          </div>
        ) : (
          paginatedList.map((req) => (
            <div
              key={req.id}
              onClick={() => navigate({ to: "/approvals" })}
              className="requests-item"
            >
              <div className="requests-item-left">
                <div className="requests-cat-icon">
                  {getCategoryIcon(req.type)}
                </div>

                <div className="requests-details">
                  <p className="requests-title">
                    {req.title}
                  </p>
                  <p className="requests-meta">
                    {req.detail ? `${req.detail} • ` : ""}
                    {activeTab === "mine"
                      ? `Submitted ${req.submittedAt}`
                      : `By ${req.applicantName || "Employee"} • ${req.submittedAt}`}
                  </p>
                </div>
              </div>

              <div className="requests-item-right">
                {getStatusBadge(req.status)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Footer */}
      {!loading && totalPages > 1 && (
        <div className="requests-pagination">
          <span className="requests-pagination-info">
            Showing {(currentPage - 1) * itemsPerPage + 1}-
            {Math.min(currentPage * itemsPerPage, currentList.length)} of{" "}
            {currentList.length}
          </span>
          <div className="requests-pagination-cluster">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="requests-nav-btn"
              aria-label="Previous Page"
            >
              ‹
            </button>
            <span className="requests-pagination-current">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="requests-nav-btn"
              aria-label="Next Page"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
