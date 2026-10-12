import React from "react";
import {
  Search,
  Plus as Add,
  X as Close,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Trash2,
  Edit2,
  FileCheck,
  FileQuestion,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  getCompanyDocumentRequirements,
  addDocumentRequirement,
  updateDocumentRequirement,
  deleteDocumentRequirement,
  getEmployeeDocumentsList,
  getCompanyEmployeesDocSummary,
  verifyEmployeeDocumentServerFn,
  getEmployeeDocumentDownloadUrl,
  parseDocumentFiles,
  type CompanyDocumentRequirement,
  type EmployeeDocSummary,
  type EmployeeDocumentItem,
} from "../../lib/employee-documents";
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

interface DocumentsTabProps {
  showToast: (msg: string, severity?: "success" | "error" | "info" | "warning") => void;
}

export function DocumentsTab({ showToast }: DocumentsTabProps) {
  const [loading, setLoading] = React.useState(true);
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null);

  // Requirements state
  const [requirements, setRequirements] = React.useState<CompanyDocumentRequirement[]>([]);
  const [reqModalOpen, setReqModalOpen] = React.useState(false);
  const [editingReq, setEditingReq] = React.useState<CompanyDocumentRequirement | null>(null);
  const [reqName, setReqName] = React.useState("");
  const [reqDesc, setReqDesc] = React.useState("");
  const [reqMandatory, setReqMandatory] = React.useState(true);
  const [reqSaving, setReqSaving] = React.useState(false);

  // Employees summary state
  const [summaries, setSummaries] = React.useState<EmployeeDocSummary[]>([]);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "complete" | "pending" | "action_needed">("all");

  // Employee Review Modal
  const [reviewModalOpen, setReviewModalOpen] = React.useState(false);
  const [reviewingEmployee, setReviewingEmployee] = React.useState<EmployeeDocSummary | null>(null);
  const [employeeDocs, setEmployeeDocs] = React.useState<EmployeeDocumentItem[]>([]);
  const [reviewLoading, setReviewLoading] = React.useState(false);
  const [actionLoadingId, setActionLoadingId] = React.useState<string | null>(null);

  // Rejection Dialog
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);
  const [rejectingDocId, setRejectingDocId] = React.useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState("");

  React.useEffect(() => {
    loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) return;
      setCompanyId(profile.company_id);

      await refreshAllData(profile.company_id);
    } catch (err) {
      console.error("Error loading documents tab initial data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function refreshAllData(cId: string) {
    const [reqs, sums] = await Promise.all([
      getCompanyDocumentRequirements(cId),
      getCompanyEmployeesDocSummary(cId),
    ]);
    setRequirements(reqs);
    setSummaries(sums);
  }

  // Handle Requirement Creation / Edit
  function openAddRequirementModal() {
    setEditingReq(null);
    setReqName("");
    setReqDesc("");
    setReqMandatory(true);
    setReqModalOpen(true);
  }

  function openEditRequirementModal(req: CompanyDocumentRequirement) {
    setEditingReq(req);
    setReqName(req.name);
    setReqDesc(req.description || "");
    setReqMandatory(req.is_mandatory);
    setReqModalOpen(true);
  }

  async function handleSaveRequirement() {
    if (!reqName.trim()) {
      showToast("Please provide a document title (e.g. Passport, PAN Card)", "error");
      return;
    }
    if (!companyId) return;

    setReqSaving(true);
    try {
      if (editingReq) {
        const res = await updateDocumentRequirement({
          data: {
            requirementId: editingReq.id,
            name: reqName.trim(),
            description: reqDesc.trim(),
            isMandatory: reqMandatory,
          },
        });
        if (!res.success) throw new Error(res.error);
        showToast("Requirement updated", "success");
      } else {
        const res = await addDocumentRequirement({
          data: {
            companyId,
            name: reqName.trim(),
            description: reqDesc.trim(),
            isMandatory: reqMandatory,
          },
        });
        if (!res.success) throw new Error(res.error);
        showToast("Requirement added", "success");
      }
      setReqModalOpen(false);
      await refreshAllData(companyId);
    } catch (err: any) {
      showToast(err.message || "Failed to save requirement", "error");
    } finally {
      setReqSaving(false);
    }
  }

  async function handleDeleteRequirement(reqId: string) {
    if (!window.confirm("Are you sure you want to remove this document requirement?")) {
      return;
    }
    if (!companyId) return;

    try {
      const res = await deleteDocumentRequirement({ data: { requirementId: reqId } });
      if (!res.success) throw new Error(res.error);
      showToast("Requirement deleted", "info");
      await refreshAllData(companyId);
    } catch (err: any) {
      showToast(err.message || "Failed to delete requirement", "error");
    }
  }

  // Open Employee Verification Review Modal
  async function openReviewModal(emp: EmployeeDocSummary) {
    setReviewingEmployee(emp);
    setReviewModalOpen(true);
    setReviewLoading(true);
    if (!companyId) return;
    try {
      const docs = await getEmployeeDocumentsList(companyId, emp.user_id);
      setEmployeeDocs(docs);
    } catch (err: any) {
      showToast("Failed to fetch employee documents", "error");
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleVerifyDocument(docId: string) {
    if (!currentUserId || !companyId) return;
    setActionLoadingId(docId);
    try {
      const res = await verifyEmployeeDocumentServerFn({
        data: {
          documentId: docId,
          status: "verified",
          verifierId: currentUserId,
        },
      });
      if (!res.success) throw new Error(res.error);
      showToast("Document verified successfully", "success");

      // Update local state
      setEmployeeDocs((prev) =>
        prev.map((item) =>
          item.submission?.id === docId
            ? {
                ...item,
                submission: {
                  ...item.submission,
                  status: "verified",
                  rejection_reason: null,
                },
              }
            : item
        )
      );
      await refreshAllData(companyId);
    } catch (err: any) {
      showToast(err.message || "Failed to verify document", "error");
    } finally {
      setActionLoadingId(null);
    }
  }

  function openRejectDialog(docId: string) {
    setRejectingDocId(docId);
    setRejectionReason("");
    setRejectDialogOpen(true);
  }

  async function handleConfirmReject() {
    if (!rejectingDocId || !currentUserId || !companyId) return;
    if (!rejectionReason.trim()) {
      showToast("Please provide a reason for rejecting this document", "warning");
      return;
    }

    setActionLoadingId(rejectingDocId);
    try {
      const res = await verifyEmployeeDocumentServerFn({
        data: {
          documentId: rejectingDocId,
          status: "rejected",
          rejectionReason: rejectionReason.trim(),
          verifierId: currentUserId,
        },
      });
      if (!res.success) throw new Error(res.error);
      showToast("Document rejected with feedback remarks", "info");

      // Update local state
      setEmployeeDocs((prev) =>
        prev.map((item) =>
          item.submission?.id === rejectingDocId
            ? {
                ...item,
                submission: {
                  ...item.submission,
                  status: "rejected",
                  rejection_reason: rejectionReason.trim(),
                },
              }
            : item
        )
      );
      setRejectDialogOpen(false);
      await refreshAllData(companyId);
    } catch (err: any) {
      showToast(err.message || "Failed to reject document", "error");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleViewDocument(r2Key: string, fileName: string) {
    try {
      const res = await getEmployeeDocumentDownloadUrl({
        data: { r2ObjectKey: r2Key, fileName },
      });
      if (res?.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        showToast(res?.error || "Could not generate secure view URL", "error");
      }
    } catch (err: any) {
      showToast("Error opening document: " + (err.message || String(err)), "error");
    }
  }

  // Stats calculation
  const totalEmployees = summaries.length;
  const verifiedEmployees = summaries.filter((s) => s.is_complete && s.verified_count >= s.total_required).length;
  const pendingReviewCount = summaries.reduce((acc, s) => acc + s.pending_count, 0);
  const incompleteEmployees = summaries.filter((s) => !s.is_complete || s.rejected_count > 0).length;

  const filteredSummaries = summaries.filter((s) => {
    const matchesSearch =
      !searchTerm.trim() ||
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.employee_code || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.department || "").toLowerCase().includes(searchTerm.toLowerCase());

    let matchesStatus = true;
    if (statusFilter === "complete") {
      matchesStatus = s.is_complete;
    } else if (statusFilter === "pending") {
      matchesStatus = s.pending_count > 0;
    } else if (statusFilter === "action_needed") {
      matchesStatus = !s.is_complete || s.rejected_count > 0;
    }

    return matchesSearch && matchesStatus;
  });

  return (
    <TooltipProvider>
      <div className="hr-tab-container">
        {/* Header */}
        <div className="hr-tab-header">
          <div className="hr-tab-title-group">
            <h2 className="hr-tab-title">Verification Desk</h2>
            <p className="hr-tab-subtitle">
              Manage KYC requirements and review submitted employee credentials.
            </p>
          </div>

          <button
            type="button"
            onClick={openAddRequirementModal}
            className="hr-btn hr-btn-primary"
          >
            <Add size={16} />
            <span>Add Requirement</span>
          </button>
        </div>

        {/* Metric Cards Grid */}
        <div className="hr-metrics-grid">
          {[
            {
              label: "Total Staff",
              value: totalEmployees,
              icon: <FileQuestion size={18} />,
            },
            {
              label: "Fully Verified",
              value: verifiedEmployees,
              icon: <CheckCircle2 size={18} style={{ color: "#16a34a" }} />,
            },
            {
              label: "Under Review",
              value: pendingReviewCount,
              icon: <Clock size={18} style={{ color: "#d97706" }} />,
            },
            {
              label: "Pending / Missing",
              value: incompleteEmployees,
              icon: <AlertCircle size={18} style={{ color: "#dc2626" }} />,
            },
          ].map((m) => (
            <div key={m.label} className="hr-stat-card">
              <div className="hr-stat-header">
                <div className="hr-stat-icon-wrapper">{m.icon}</div>
                <span className="hr-stat-label">{m.label}</span>
              </div>
              <div className="hr-stat-value">
                {loading ? <div className="skeleton-shimmer" style={{ width: 40, height: 28, borderRadius: 6 }} /> : m.value}
              </div>
            </div>
          ))}
        </div>

        {/* Minimal Requirements Bar */}
        <div className="hr-req-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>
                Active Document Requirements ({requirements.length})
              </h3>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Visible during onboarding and profile settings
              </span>
            </div>
            <button
              type="button"
              onClick={openAddRequirementModal}
              className="hr-btn hr-btn-secondary"
              style={{ height: 30, fontSize: 12, padding: "0 10px" }}
            >
              <Add size={14} />
              <span>Add another</span>
            </button>
          </div>

          <div className="hr-req-grid">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="skeleton-shimmer" style={{ width: 140, height: 32, borderRadius: 8 }} />
              ))
            ) : requirements.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
                No requirements created yet. Click "Add Requirement" to set up required KYC documents.
              </p>
            ) : (
              requirements.map((req) => (
                <div key={req.id} className="hr-req-chip">
                  <span className={`hr-req-chip-dot ${!req.is_mandatory ? "optional" : ""}`} />
                  <span style={{ fontWeight: 500 }}>{req.name}</span>
                  <span className="hr-req-chip-tag">
                    {req.is_mandatory ? "Required" : "Optional"}
                  </span>
                  <div className="hr-req-actions">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => openEditRequirementModal(req)}
                          className="hr-btn-icon"
                          style={{ width: 22, height: 22 }}
                        >
                          <Edit2 size={12} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Edit</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => handleDeleteRequirement(req.id)}
                          className="hr-btn-icon"
                          style={{ width: 22, height: 22 }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Delete</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Employee Documents Table */}
        <div className="hr-table-wrapper">
          {/* Search & Segmented Filter Bar */}
          <div className="hr-table-toolbar">
            <div className="hr-search-bar">
              <Search size={15} style={{ color: "var(--color-text-muted)" }} />
              <input
                type="text"
                placeholder="Search staff by name, code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="hr-btn-icon"
                  style={{ width: 20, height: 20 }}
                >
                  <Close size={12} />
                </button>
              )}
            </div>

            {/* Segmented Filter Pills */}
            <div className="hr-segmented-nav">
              {[
                { id: "all", label: "All" },
                { id: "pending", label: "Needs Review" },
                { id: "action_needed", label: "Incomplete" },
                { id: "complete", label: "Verified" },
              ].map((f) => {
                const active = statusFilter === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id as any)}
                    className={`hr-segmented-btn ${active ? "active" : ""}`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hr-table-scroll">
            <table className="hr-data-table">
              <thead>
                <tr>
                  <th style={{ width: "28%" }}>Employee</th>
                  <th style={{ width: "22%" }}>Role & Dept</th>
                  <th style={{ width: "22%" }}>Progress</th>
                  <th style={{ width: "16%" }}>Status</th>
                  <th style={{ width: "12%", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td>
                        <div className="hr-avatar-cell">
                          <div className="skeleton-shimmer" style={{ width: 34, height: 34, borderRadius: "50%" }} />
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div className="skeleton-shimmer" style={{ width: 110, height: 14, borderRadius: 4 }} />
                            <div className="skeleton-shimmer" style={{ width: 80, height: 11, borderRadius: 4 }} />
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <div className="skeleton-shimmer" style={{ width: 90, height: 13, borderRadius: 4 }} />
                          <div className="skeleton-shimmer" style={{ width: 60, height: 11, borderRadius: 4 }} />
                        </div>
                      </td>
                      <td><div className="skeleton-shimmer" style={{ width: 100, height: 14, borderRadius: 4 }} /></td>
                      <td><div className="skeleton-shimmer" style={{ width: 70, height: 20, borderRadius: 6 }} /></td>
                      <td style={{ textAlign: "right" }}><div className="skeleton-shimmer" style={{ width: 50, height: 26, borderRadius: 6, marginLeft: "auto" }} /></td>
                    </tr>
                  ))
                ) : filteredSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="hr-table-empty">
                      <FileQuestion size={28} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                      <p style={{ fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 4px" }}>No employee records found</p>
                      <p style={{ margin: 0 }}>Try adjusting the search query or status filter.</p>
                    </td>
                  </tr>
                ) : (
                  filteredSummaries.map((emp) => {
                    const initials = emp.name
                      ? emp.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .substring(0, 2)
                          .toUpperCase()
                      : "EM";

                    const progressPct =
                      emp.total_required > 0
                        ? Math.min(100, Math.round((emp.submitted_count / emp.total_required) * 100))
                        : 100;

                    return (
                      <tr key={emp.user_id}>
                        {/* Employee Info */}
                        <td>
                          <div className="hr-avatar-cell">
                            <div className="hr-avatar">
                              {initials}
                            </div>
                            <div>
                              <p style={{ fontWeight: 600, color: "var(--color-text-primary)", margin: 0, fontSize: 13 }}>{emp.name}</p>
                              <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
                                {emp.email} {emp.employee_code ? `• ${emp.employee_code}` : ""}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Dept & Role */}
                        <td>
                          <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: 0, fontSize: 13 }}>{emp.job_title || "Team Member"}</p>
                          <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>{emp.department || "General"}</p>
                        </td>

                        {/* Progress */}
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                              <span style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>
                                {emp.submitted_count} / {emp.total_required} docs
                              </span>
                              <span style={{ color: "var(--color-text-muted)" }}>
                                {emp.verified_count} verified
                              </span>
                            </div>
                            <div className="hr-progress-track">
                              <div
                                className={`hr-progress-fill ${emp.is_complete ? "success" : ""}`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td>
                          {emp.rejected_count > 0 ? (
                            <span className="hr-badge hr-badge-absent">
                              {emp.rejected_count} Rejected
                            </span>
                          ) : emp.pending_count > 0 ? (
                            <span className="hr-badge hr-badge-late">
                              {emp.pending_count} Needs Review
                            </span>
                          ) : emp.is_complete ? (
                            <span className="hr-badge hr-badge-present">
                              Verified
                            </span>
                          ) : (
                            <span className="hr-badge hr-badge-missing">
                              Pending
                            </span>
                          )}
                        </td>

                        {/* Action */}
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => openReviewModal(emp)}
                            className="hr-btn hr-btn-secondary"
                            style={{ height: 28, fontSize: 12, padding: "0 10px" }}
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Requirement Add / Edit Modal */}
        <Dialog open={reqModalOpen} onOpenChange={setReqModalOpen}>
          <DialogContent style={{ maxWidth: 440, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 20 }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
                {editingReq ? "Edit Requirement" : "New Document Requirement"}
              </DialogTitle>
            </DialogHeader>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "16px 0" }}>
              <div className="hr-form-field">
                <label className="hr-form-label">
                  Document Title <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Passport, PAN Card, Degree Certificate"
                  value={reqName}
                  onChange={(e) => setReqName(e.target.value)}
                  className="hr-input"
                  autoFocus
                />
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">
                  Instructions (optional)
                </label>
                <textarea
                  placeholder="e.g. Scanned copy in PDF or JPG format"
                  value={reqDesc}
                  onChange={(e) => setReqDesc(e.target.value)}
                  rows={2}
                  className="hr-input"
                  style={{ height: "auto", padding: "8px 12px", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", backgroundColor: "var(--color-surface-subtle)", borderRadius: 8, border: "1px solid var(--color-border-subtle)" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>Mandatory Submission</p>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>
                    Employees receive login reminders until submitted.
                  </p>
                </div>
                <Switch
                  checked={reqMandatory}
                  onCheckedChange={setReqMandatory}
                />
              </div>
            </div>

            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setReqModalOpen(false)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reqSaving || !reqName.trim()}
                onClick={handleSaveRequirement}
                className="hr-btn hr-btn-primary"
              >
                {reqSaving ? "Saving..." : editingReq ? "Update" : "Add Requirement"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Review Employee Documents Modal */}
        <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
          <DialogContent style={{ maxWidth: 640, maxHeight: "85vh", display: "flex", flexDirection: "column", backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 24, overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 16, borderBottom: "1px solid var(--color-border-subtle)", flexWrap: "wrap", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div className="hr-avatar hr-avatar-lg">
                  {reviewingEmployee?.name?.substring(0, 2).toUpperCase() || "EM"}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
                      {reviewingEmployee?.name}
                    </h3>
                    <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                      ({reviewingEmployee?.department || "General"})
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>{reviewingEmployee?.email}</p>
                </div>
              </div>

              <div>
                <span className={`hr-badge ${reviewingEmployee?.is_complete ? "hr-badge-present" : "hr-badge-late"}`}>
                  {reviewingEmployee?.verified_count || 0} / {reviewingEmployee?.total_required || 0} Verified
                </span>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, padding: "16px 0" }}>
              {reviewLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div className="skeleton-shimmer" style={{ width: "100%", height: 70, borderRadius: 8 }} />
                  <div className="skeleton-shimmer" style={{ width: "100%", height: 70, borderRadius: 8 }} />
                </div>
              ) : employeeDocs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-text-muted)", fontSize: 13 }}>
                  No document requirements configured.
                </div>
              ) : (
                employeeDocs.map(({ requirement, submission }) => {
                  const isUploaded = !!submission;
                  const isVerified = submission?.status === "verified";
                  const isRejected = submission?.status === "rejected";
                  const isPending = submission?.status === "pending";
                  const attachments = isUploaded ? parseDocumentFiles(submission) : [];

                  return (
                    <div
                      key={requirement.id}
                      style={{
                        padding: 14,
                        borderRadius: 8,
                        border: "1px solid var(--color-border)",
                        backgroundColor: "var(--color-surface-subtle)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                      }}
                    >
                      {/* Row Header */}
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
                              {requirement.name}
                            </h4>
                            <span style={{ fontSize: 11, color: requirement.is_mandatory ? "var(--color-primary)" : "var(--color-text-muted)", fontWeight: 500 }}>
                              • {requirement.is_mandatory ? "Mandatory" : "Optional"}
                            </span>
                          </div>
                          {requirement.description && (
                            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                              {requirement.description}
                            </p>
                          )}
                        </div>

                        {/* Status Tag */}
                        <div>
                          {isVerified ? (
                            <span className="hr-badge hr-badge-present">
                              <CheckCircle2 size={12} /> Verified
                            </span>
                          ) : isRejected ? (
                            <span className="hr-badge hr-badge-absent">
                              <AlertCircle size={12} /> Rejected
                            </span>
                          ) : isPending ? (
                            <span className="hr-badge hr-badge-late">
                              <Clock size={12} /> Needs Review
                            </span>
                          ) : (
                            <span className="hr-badge hr-badge-missing">
                              Not Uploaded
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Attachments list */}
                      {isUploaded && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 6, borderTop: "1px solid var(--color-border-subtle)" }}>
                          {attachments.map((att, attIdx) => (
                            <div
                              key={attIdx}
                              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", backgroundColor: "var(--color-surface)", borderRadius: 6, border: "1px solid var(--color-border-subtle)" }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--color-text-primary)" }}>
                                <FileCheck size={14} style={{ color: "var(--color-primary)" }} />
                                <span style={{ fontWeight: 500 }}>{att.file_name}</span>
                                <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>
                                  ({(att.file_size / 1024).toFixed(0)} KB)
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleViewDocument(att.r2_object_key, att.file_name)}
                                className="hr-btn hr-btn-secondary"
                                style={{ height: 26, fontSize: 11, padding: "0 8px" }}
                              >
                                <ExternalLink size={11} />
                                <span>View</span>
                              </button>
                            </div>
                          ))}

                          {/* Rejection Feedback Note */}
                          {isRejected && submission.rejection_reason && (
                            <p style={{ margin: 0, fontSize: 12, color: "#dc2626", backgroundColor: "rgba(239, 68, 68, 0.08)", padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                              Reason: {submission.rejection_reason}
                            </p>
                          )}

                          {/* Minimal Actions Row */}
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                            {isVerified ? (
                              <button
                                type="button"
                                disabled={actionLoadingId === submission.id}
                                onClick={() => openRejectDialog(submission.id)}
                                className="hr-btn hr-btn-secondary"
                                style={{ height: 28, fontSize: 12 }}
                              >
                                Revoke Approval
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  disabled={actionLoadingId === submission.id}
                                  onClick={() => openRejectDialog(submission.id)}
                                  className="hr-btn hr-btn-danger"
                                  style={{ height: 28, fontSize: 12 }}
                                >
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  disabled={actionLoadingId === submission.id}
                                  onClick={() => handleVerifyDocument(submission.id)}
                                  className="hr-btn hr-btn-primary"
                                  style={{ height: 28, fontSize: 12 }}
                                >
                                  Approve
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 12, borderTop: "1px solid var(--color-border-subtle)" }}>
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="hr-btn hr-btn-primary"
              >
                Done
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Reject Feedback Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent style={{ maxWidth: 440, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 20 }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
                Reject Document Submission
              </DialogTitle>
              <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
                Add feedback so the employee knows what to fix when re-uploading.
              </p>
            </DialogHeader>

            <div style={{ margin: "14px 0" }} className="hr-form-field">
              <label className="hr-form-label">
                Feedback / Reason <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                autoFocus
                placeholder="e.g. Blurry photo, document cropped, or expired ID"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                className="hr-input"
                style={{ height: "auto", padding: "8px 12px", resize: "vertical" }}
              />
            </div>

            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setRejectDialogOpen(false)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="hr-btn hr-btn-danger"
              >
                Reject
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

