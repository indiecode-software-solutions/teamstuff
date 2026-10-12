import React, { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import {
  Search,
  Plus,
  CalendarDays,
  Clock,
  Download,
  Printer,
  Copy,
  Check,
  X,
  Scale,
  ShieldCheck,
  HeartHandshake,
  FileText,
  BookOpen,
  Pencil,
  Trash2,
  Sparkles,
  Info,
  ChevronRight,
  Loader2,
  Layers,
} from "lucide-react";
import {
  getMyCompanyId,
  getCompanyPolicies,
  estimateReadTime,
  createPolicy,
  updatePolicy,
  deletePolicy,
  POLICY_CATEGORIES,
  type PolicyCategory,
} from "../lib/policies";
import { supabase } from "../lib/supabase";

export const Route = createFileRoute("/resources/hr-policies")({
  head: () => ({
    title: "Teamstuff | HR Policies & Handbook",
    meta: [
      {
        name: "description",
        content: "Official guidelines, leave policies, code of conduct, and employee compliance handbook at Teamstuff.",
      },
    ],
  }),
  component: HrPoliciesPage,
});

interface DisplayPolicy {
  id: string;
  title: string;
  category: PolicyCategory;
  summary: string;
  content: string;
  lastUpdated: string;
  updatedAtDate: Date;
  readTime: string;
}

const CATEGORIES: ("All" | PolicyCategory)[] = ["All", ...POLICY_CATEGORIES];

function HrPoliciesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<"All" | PolicyCategory>("All");
  const [policies, setPolicies] = useState<DisplayPolicy[]>([]);
  const [selectedPolicy, setSelectedPolicy] = useState<DisplayPolicy | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // User role & permission for HR/Admin quick actions
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);

  // Form modal state (for Add / Edit)
  const [formOpen, setFormOpen] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formCategory, setFormCategory] = useState<PolicyCategory>("Leaves");
  const [formSummary, setFormSummary] = useState("");
  const [formContent, setFormContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Delete confirmation modal state
  const [deleteTarget, setDeleteTarget] = useState<DisplayPolicy | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const canManage = myRole === "admin" || myRole === "hr";

  const loadData = async () => {
    try {
      const companyId = await getMyCompanyId();
      setMyCompanyId(companyId);
      if (companyId) {
        const records = await getCompanyPolicies(companyId);
        setPolicies(
          records.map((r) => ({
            id: r.id,
            title: r.title,
            category: r.category,
            summary: r.summary,
            content: r.content,
            updatedAtDate: new Date(r.updated_at),
            lastUpdated: new Date(r.updated_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
            readTime: estimateReadTime(r.content),
          })),
        );
      }
    } catch (err) {
      console.error("Error loading policies:", err);
      toast.error("Failed to load HR policies");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Fetch user role
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.role) setMyRole(data.role);
        });
    });
  }, []);

  // Filtered policies based on category + search query
  const filteredPolicies = useMemo(() => {
    return policies.filter((policy) => {
      const matchesCategory = selectedCategory === "All" || policy.category === selectedCategory;
      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        policy.title.toLowerCase().includes(q) ||
        policy.summary.toLowerCase().includes(q) ||
        policy.content.toLowerCase().includes(q)
      );
    });
  }, [policies, selectedCategory, searchQuery]);

  // Counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: policies.length };
    POLICY_CATEGORIES.forEach((cat) => {
      counts[cat] = policies.filter((p) => p.category === cat).length;
    });
    return counts;
  }, [policies]);

  // Latest revision date
  const latestRevision = useMemo(() => {
    if (policies.length === 0) return "Up to date";
    const sorted = [...policies].sort((a, b) => b.updatedAtDate.getTime() - a.updatedAtDate.getTime());
    return sorted[0].lastUpdated;
  }, [policies]);

  const handleOpenAdd = () => {
    setEditingPolicyId(null);
    setFormTitle("");
    setFormCategory("Leaves");
    setFormSummary("");
    setFormContent(
      "### Purpose & Scope\nDescribe the objective of this policy...\n\n### Key Guidelines\n- Guideline 1\n- Guideline 2\n\n### Compliance & Penalties\nViolation details...\n\n### Support\nContact the People Operations team for queries.",
    );
    setFormOpen(true);
  };

  const handleOpenEdit = (policy: DisplayPolicy, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingPolicyId(policy.id);
    setFormTitle(policy.title);
    setFormCategory(policy.category);
    setFormSummary(policy.summary);
    setFormContent(policy.content);
    setFormOpen(true);
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formSummary.trim() || !formContent.trim()) {
      toast.error("Please fill in the title, summary, and content");
      return;
    }
    if (!myCompanyId) {
      toast.error("Company information missing");
      return;
    }

    setIsSaving(true);
    try {
      if (editingPolicyId) {
        const res = await updatePolicy({
          data: {
            policyId: editingPolicyId,
            title: formTitle.trim(),
            category: formCategory,
            summary: formSummary.trim(),
            content: formContent.trim(),
          },
        });
        if (res.success) {
          toast.success("Policy updated successfully");
          setFormOpen(false);
          await loadData();
          if (selectedPolicy?.id === editingPolicyId) {
            setSelectedPolicy((prev) =>
              prev
                ? {
                    ...prev,
                    title: formTitle.trim(),
                    category: formCategory,
                    summary: formSummary.trim(),
                    content: formContent.trim(),
                    readTime: estimateReadTime(formContent.trim()),
                    lastUpdated: "Just now",
                  }
                : null,
            );
          }
        } else {
          toast.error(res.error || "Failed to update policy");
        }
      } else {
        const res = await createPolicy({
          data: {
            companyId: myCompanyId,
            title: formTitle.trim(),
            category: formCategory,
            summary: formSummary.trim(),
            content: formContent.trim(),
          },
        });
        if (res.success) {
          toast.success("New policy published successfully");
          setFormOpen(false);
          await loadData();
        } else {
          toast.error(res.error || "Failed to create policy");
        }
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred while saving");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePolicy = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await deletePolicy({
        data: { policyId: deleteTarget.id },
      });
      if (res.success) {
        toast.success("Policy removed");
        setDeleteTarget(null);
        if (selectedPolicy?.id === deleteTarget.id) {
          setSelectedPolicy(null);
        }
        await loadData();
      } else {
        toast.error(res.error || "Failed to delete policy");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to delete policy");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = (policy: DisplayPolicy) => {
    const blob = new Blob([policy.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${policy.title.toLowerCase().replace(/\s+/g, "_")}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Policy markdown downloaded");
  };

  const handleCopyLink = (policy: DisplayPolicy) => {
    const shareUrl = `${window.location.origin}/resources/hr-policies?policy=${policy.id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const getCategoryIcon = (category: PolicyCategory) => {
    switch (category) {
      case "Leaves":
        return <CalendarDays size={20} />;
      case "Conduct":
        return <Scale size={20} />;
      case "Benefits":
        return <HeartHandshake size={20} />;
      case "Security":
        return <ShieldCheck size={20} />;
      default:
        return <BookOpen size={20} />;
    }
  };

  const getCategoryClass = (category: PolicyCategory) => {
    switch (category) {
      case "Leaves":
        return "policy-card-icon-leaves";
      case "Conduct":
        return "policy-card-icon-conduct";
      case "Benefits":
        return "policy-card-icon-benefits";
      case "Security":
        return "policy-card-icon-security";
      default:
        return "";
    }
  };

  return (
    <div className="policies-page-wrapper">
      {/* Header Card */}
      <div className="policies-header-card">
        {/* Breadcrumb Trail */}
        <div className="policies-breadcrumb-row">
          <Link to="/resources" className="policies-breadcrumb-link">
            Resources
          </Link>
          <span className="policies-breadcrumb-separator">/</span>
          <span className="policies-breadcrumb-current">HR Policies</span>
        </div>

        {/* Title & Actions Row */}
        <div className="policies-header-main">
          <div className="policies-title-group">
            <h1 className="policies-title">HR Policies & Employee Handbook</h1>
            <p className="policies-subtitle">
              Comprehensive guidelines, leave regulations, code of conduct, and organizational compliance handbook.
            </p>
          </div>

          <div className="policies-header-actions">
            {/* Live Search */}
            <div className="policies-search-wrap">
              <Search size={15} className="policies-search-icon" />
              <input
                type="text"
                placeholder="Search policies, keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="policies-search-input"
              />
            </div>

            {/* HR / Admin Publish Action */}
            {canManage && (
              <button
                type="button"
                onClick={handleOpenAdd}
                className="policies-add-btn"
              >
                <Plus size={16} />
                <span>Add Policy</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="policies-stats-bar">
          <div className="policies-stat-item">
            <Layers size={14} className="policies-stat-icon" />
            <span>Total Policies: <strong className="policies-stat-val">{policies.length}</strong></span>
          </div>
          <div className="policies-stat-item">
            <BookOpen size={14} className="policies-stat-icon" />
            <span>Categories: <strong className="policies-stat-val">{POLICY_CATEGORIES.length}</strong></span>
          </div>
          <div className="policies-stat-item">
            <Clock size={14} className="policies-stat-icon" />
            <span>Last Revised: <strong className="policies-stat-val">{latestRevision}</strong></span>
          </div>
          <div className="policies-stat-item">
            <ShieldCheck size={14} style={{ color: "#059669" }} />
            <span style={{ color: "#059669", fontWeight: 500 }}>Compliance Verified</span>
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="policies-filter-bar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`policies-filter-pill ${selectedCategory === cat ? "is-active" : ""}`}
          >
            <span>{cat}</span>
            <span className="policies-filter-count">
              {categoryCounts[cat] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Policies Grid */}
      {isLoading ? (
        <div className="policies-grid">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="policy-card"
              style={{ minHeight: "220px", pointerEvents: "none" }}
            >
              <div className="policy-card-top">
                <div
                  className="skeleton-shimmer"
                  style={{ width: "42px", height: "42px", borderRadius: "10px" }}
                />
                <div
                  className="skeleton-shimmer"
                  style={{ width: "80px", height: "20px", borderRadius: "6px" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                <div
                  className="skeleton-shimmer"
                  style={{ width: "65%", height: "18px", borderRadius: "4px" }}
                />
                <div
                  className="skeleton-shimmer"
                  style={{ width: "95%", height: "14px", borderRadius: "4px" }}
                />
                <div
                  className="skeleton-shimmer"
                  style={{ width: "80%", height: "14px", borderRadius: "4px" }}
                />
              </div>
              <div
                className="skeleton-shimmer"
                style={{ width: "100%", height: "16px", borderRadius: "4px", marginTop: "16px" }}
              />
            </div>
          ))}
        </div>
      ) : filteredPolicies.length === 0 ? (
        <div className="hub-empty-state" style={{ backgroundColor: "var(--color-surface)", borderRadius: "14px", border: "1px solid var(--color-border)" }}>
          <FileText size={44} style={{ color: "var(--color-text-muted)", marginBottom: "12px", opacity: 0.7 }} />
          <h2 style={{ fontSize: "16px", fontWeight: 600, margin: "0 0 6px 0", color: "var(--color-text-primary)" }}>
            No policies found
          </h2>
          <p style={{ fontSize: "13px", color: "var(--color-text-muted)", margin: "0 0 16px 0", maxWidth: "420px", textAlign: "center" }}>
            {searchQuery
              ? `No policies match the keyword "${searchQuery}". Try a different search term or clear the filter.`
              : `No published policies found under the "${selectedCategory}" category.`}
          </p>
          {(searchQuery || selectedCategory !== "All") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("All");
              }}
              className="btn btn-secondary"
              style={{ fontSize: "12.5px" }}
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="policies-grid">
          {filteredPolicies.map((policy) => (
            <div
              key={policy.id}
              onClick={() => setSelectedPolicy(policy)}
              className="policy-card"
            >
              <div>
                <div className="policy-card-top">
                  <div className={`policy-card-icon-box ${getCategoryClass(policy.category)}`}>
                    {getCategoryIcon(policy.category)}
                  </div>
                  <div className="policy-card-badges">
                    <span className="policy-category-chip">{policy.category}</span>
                    <span className="policy-readtime-chip">
                      <Clock size={11} />
                      <span>{policy.readTime}</span>
                    </span>
                  </div>
                </div>

                <div className="policy-card-main">
                  <h3 className="policy-card-title">{policy.title}</h3>
                  <p className="policy-card-summary">{policy.summary}</p>
                </div>
              </div>

              <div className="policy-card-footer">
                <div className="policy-card-date">
                  <CalendarDays size={13} />
                  <span>Updated {policy.lastUpdated}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {canManage && (
                    <div
                      className="policy-card-admin-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleOpenEdit(policy, e)}
                        className="policy-card-btn"
                        title="Edit policy"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(policy);
                        }}
                        className="policy-card-btn is-delete"
                        title="Delete policy"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}

                  <span className="policy-card-action">
                    <span>Read</span>
                    <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reader Drawer / Sheet */}
      <Dialog.Root open={!!selectedPolicy} onOpenChange={(open) => !open && setSelectedPolicy(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="policy-reader-overlay" />
          <Dialog.Content className="policy-reader-sheet">
            {selectedPolicy && (
              <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                {/* Drawer Header */}
                <div className="policy-reader-header">
                  <div className="policy-reader-header-left">
                    <span className="policy-category-chip" style={{ fontSize: "12px", padding: "3px 10px" }}>
                      {selectedPolicy.category}
                    </span>
                    <span className="policy-readtime-chip" style={{ fontSize: "12px" }}>
                      <Clock size={12} />
                      <span>{selectedPolicy.readTime}</span>
                    </span>
                  </div>

                  <div className="policy-reader-header-actions">
                    <button
                      type="button"
                      onClick={() => handleCopyLink(selectedPolicy)}
                      title="Copy link to policy"
                      className="policy-reader-btn"
                    >
                      {copiedLink ? <Check size={14} style={{ color: "#059669" }} /> : <Copy size={14} />}
                      <span>{copiedLink ? "Copied" : "Copy Link"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDownload(selectedPolicy)}
                      title="Download Markdown"
                      className="policy-reader-btn"
                    >
                      <Download size={14} />
                      <span>Download</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePrint}
                      title="Print or save as PDF"
                      className="policy-reader-btn"
                    >
                      <Printer size={14} />
                      <span>Print</span>
                    </button>

                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="policy-reader-btn policy-reader-btn-icon"
                        aria-label="Close reader"
                      >
                        <X size={16} />
                      </button>
                    </Dialog.Close>
                  </div>
                </div>

                {/* Drawer Scrollable Content */}
                <div className="policy-reader-scrollable">
                  {/* Title & Metadata */}
                  <div className="policy-reader-title-section">
                    <Dialog.Title className="policy-reader-title">
                      {selectedPolicy.title}
                    </Dialog.Title>

                    <div className="policy-reader-meta-row">
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <CalendarDays size={14} />
                        <span>Last revised: {selectedPolicy.lastUpdated}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <ShieldCheck size={14} style={{ color: "#059669" }} />
                        <span>Official Corporate Policy</span>
                      </div>
                    </div>
                  </div>

                  {/* Summary Callout Banner */}
                  <div className="policy-reader-callout">
                    <Info size={18} className="policy-reader-callout-icon" />
                    <div>
                      <strong style={{ display: "block", marginBottom: "2px", color: "var(--color-text-primary)" }}>
                        Policy Overview
                      </strong>
                      <span>{selectedPolicy.summary}</span>
                    </div>
                  </div>

                  {/* Document Body */}
                  <div className="policy-doc-content">
                    {parseMarkdown(selectedPolicy.content)}
                  </div>

                  {/* Footer Note */}
                  <div className="policy-reader-footer-note">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Sparkles size={16} style={{ color: "var(--color-text-secondary)" }} />
                      <span>Questions about this policy? Contact the People Operations & HR team.</span>
                    </div>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(selectedPolicy)}
                        className="btn btn-secondary"
                        style={{ fontSize: "12px", padding: "4px 10px", height: "28px" }}
                      >
                        <Pencil size={12} />
                        <span>Edit Policy</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add / Edit Policy Modal (HR / Admin) */}
      <Dialog.Root open={formOpen} onOpenChange={setFormOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal-content" style={{ maxWidth: "620px" }}>
            <div className="modal-header">
              <Dialog.Title className="modal-title">
                {editingPolicyId ? "Edit HR Policy" : "Publish New HR Policy"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="modal-close-btn" aria-label="Close">
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleSavePolicy} style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "16px" }}>
              <div className="policy-form-group">
                <label className="policy-form-label">Policy Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Annual Leave & PTO Policy"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="policy-form-input"
                />
              </div>

              <div className="policy-form-group">
                <label className="policy-form-label">Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as PolicyCategory)}
                  className="policy-form-select"
                >
                  {POLICY_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="policy-form-group">
                <label className="policy-form-label">Short Summary</label>
                <input
                  type="text"
                  required
                  placeholder="Brief 1-2 sentence executive summary of this policy..."
                  value={formSummary}
                  onChange={(e) => setFormSummary(e.target.value)}
                  className="policy-form-input"
                />
              </div>

              <div className="policy-form-group">
                <label className="policy-form-label">Full Markdown Content</label>
                <textarea
                  required
                  placeholder="Policy content in markdown..."
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  className="policy-form-textarea"
                />
              </div>

              <div className="modal-footer" style={{ marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  disabled={isSaving}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn-primary"
                >
                  {isSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                  <span>{editingPolicyId ? "Save Changes" : "Publish Policy"}</span>
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Confirmation Modal */}
      <Dialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal-content modal-content--confirm">
            <div className="modal-header">
              <Dialog.Title className="modal-title">Delete Policy?</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="modal-close-btn" aria-label="Close">
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>
            <p className="modal-desc">
              Are you sure you want to permanently delete <strong>&quot;{deleteTarget?.title}&quot;</strong>? This action cannot be undone.
            </p>
            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeletePolicy}
                disabled={isDeleting}
                className="btn btn-danger"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>Delete</span>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

/**
 * Lightweight, robust markdown parser for policy documents
 */
function parseMarkdown(text: string): React.ReactNode {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];

  const flushList = (key: number) => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${key}`}>
          {...currentList}
        </ul>,
      );
      currentList = [];
    }
  };

  const parseInline = (line: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={index}
            style={{
              padding: "2px 5px",
              backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
              borderRadius: "4px",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
            }}
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList(index);
      return;
    }

    if (trimmed.startsWith("### ")) {
      flushList(index);
      elements.push(
        <h3 key={index}>{parseInline(trimmed.slice(4))}</h3>,
      );
    } else if (trimmed.startsWith("## ")) {
      flushList(index);
      elements.push(
        <h2 key={index}>{parseInline(trimmed.slice(3))}</h2>,
      );
    } else if (trimmed.startsWith("#### ")) {
      flushList(index);
      elements.push(
        <h4 key={index}>{parseInline(trimmed.slice(5))}</h4>,
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      currentList.push(
        <li key={index}>{parseInline(trimmed.slice(2))}</li>,
      );
    } else if (trimmed.startsWith("> ")) {
      flushList(index);
      elements.push(
        <div
          key={index}
          style={{
            borderLeft: "3px solid var(--color-primary)",
            paddingLeft: "14px",
            color: "var(--color-text-secondary)",
            fontStyle: "italic",
            margin: "8px 0",
          }}
        >
          {parseInline(trimmed.slice(2))}
        </div>,
      );
    } else {
      flushList(index);
      elements.push(
        <p key={index}>{parseInline(trimmed)}</p>,
      );
    }
  });

  flushList(lines.length);
  return <>{elements}</>;
}
