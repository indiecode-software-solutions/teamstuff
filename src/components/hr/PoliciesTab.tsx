import React from "react";
import {
  Plus as Add,
  SquarePen as Edit,
  Trash2 as Delete,
  FileText as Description,
  CalendarDays as EventNote,
  AlertTriangle,
} from "lucide-react";
import {
  getMyCompanyId,
  getCompanyPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  estimateReadTime,
  POLICY_CATEGORIES,
  type HrPolicy,
  type PolicyCategory,
} from "../../lib/policies";
import { supabase } from "../../lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Skeleton } from "../ui/skeleton";
import { Badge } from "../ui/badge";

interface PoliciesTabProps {
  showToast: (msg: string, severity?: "success" | "error" | "info" | "warning") => void;
}

interface PolicyFormState {
  title: string;
  category: PolicyCategory;
  summary: string;
  content: string;
}

const EMPTY_FORM: PolicyFormState = {
  title: "",
  category: "Leaves",
  summary: "",
  content: "",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function PoliciesTab({ showToast }: PoliciesTabProps) {
  const [policies, setPolicies] = React.useState<HrPolicy[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<PolicyFormState>(EMPTY_FORM);

  const [deleteTarget, setDeleteTarget] = React.useState<HrPolicy | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function loadPolicies() {
    const companyId = await getMyCompanyId();
    if (!companyId) return;
    setPolicies(await getCompanyPolicies(companyId));
  }

  React.useEffect(() => {
    loadPolicies().finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(policy: HrPolicy) {
    setEditingId(policy.id);
    setForm({
      title: policy.title,
      category: policy.category,
      summary: policy.summary,
      content: policy.content,
    });
    setFormOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.summary.trim() || !form.content.trim()) {
      showToast("Title, summary and content are required.", "warning");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const result = await updatePolicy({
          data: {
            policyId: editingId,
            title: form.title,
            category: form.category,
            summary: form.summary,
            content: form.content,
          },
        });
        if (!result.success) {
          showToast(`Failed to update policy. ${result.error || ""}`, "error");
          return;
        }
        showToast("Policy updated.", "success");
      } else {
        const companyId = await getMyCompanyId();
        if (!companyId) {
          showToast("Could not resolve your company.", "error");
          return;
        }
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const result = await createPolicy({
          data: {
            companyId,
            title: form.title,
            category: form.category,
            summary: form.summary,
            content: form.content,
            ...(user?.id ? { createdBy: user.id } : {}),
          },
        });
        if (!result.success) {
          showToast(`Failed to create policy. ${result.error || ""}`, "error");
          return;
        }
        showToast("Policy published.", "success");
      }
      setFormOpen(false);
      await loadPolicies();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deletePolicy({ data: { policyId: deleteTarget.id } });
      if (!result.success) {
        showToast(`Failed to delete policy. ${result.error || ""}`, "error");
        return;
      }
      showToast("Policy deleted.", "success");
      setDeleteTarget(null);
      await loadPolicies();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="hr-tab-container">
      {/* Header bar */}
      <div className="hr-tab-header">
        <div className="hr-tab-title-group">
          <h2 className="hr-tab-title">HR Policies</h2>
          <p className="hr-tab-subtitle">
            Create and manage policies shown to employees in Resources.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="hr-btn hr-btn-primary"
        >
          <Add size={15} />
          <span>Create Policy</span>
        </button>
      </div>

      {/* Main container */}
      <div className="hr-table-wrapper">
        {loading ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton-shimmer" style={{ width: "100%", height: 52, borderRadius: 6 }} />
            ))}
          </div>
        ) : policies.length === 0 ? (
          <div className="hr-table-empty">
            <Description size={32} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
            <p style={{ fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 4px" }}>
              No policies published yet.
            </p>
            <p style={{ margin: 0 }}>
              Click "Create Policy" to publish the first one — it will appear in Resources.
            </p>
          </div>
        ) : (
          <div className="hr-table-scroll">
            <table className="hr-data-table">
              <thead>
                <tr>
                  <th style={{ width: "45%" }}>Policy</th>
                  <th style={{ width: "20%" }}>Category</th>
                  <th style={{ width: "25%" }}>Updated</th>
                  <th style={{ width: "10%", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: 13 }}>
                        {policy.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                        {policy.summary}
                      </div>
                    </td>
                    <td>
                      <span className="hr-badge hr-badge-active" style={{ fontSize: 11 }}>
                        {policy.category}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-muted)" }}>
                        <EventNote size={14} />
                        <span>
                          {formatDate(policy.updated_at)} · {estimateReadTime(policy.content)}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => openEdit(policy)}
                          title="Edit policy"
                          className="hr-btn-icon"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(policy)}
                          title="Delete policy"
                          className="hr-btn-icon"
                          style={{ color: "#dc2626" }}
                        >
                          <Delete size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent style={{ maxWidth: 540, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 22 }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {editingId ? "Edit Policy" : "Create Policy"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14, margin: "16px 0" }}>
            <div className="hr-form-field">
              <label className="hr-form-label">
                Policy Title <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g. Employee Travel Allowance Guide"
                className="hr-input"
                autoFocus
              />
            </div>

            <div className="hr-form-field">
              <label className="hr-form-label">Category</label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, category: e.target.value as PolicyCategory }))
                }
                className="hr-select"
              >
                {POLICY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="hr-form-field">
              <label className="hr-form-label">
                Short Summary <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                required
                rows={2}
                value={form.summary}
                onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                placeholder="Brief 1-2 sentence overview of the policy scope."
                className="hr-input"
                style={{ height: "auto", padding: "8px 12px", resize: "vertical" }}
              />
            </div>

            <div className="hr-form-field">
              <label className="hr-form-label">
                Document Content (Supports Markdown headings) <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                required
                rows={7}
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                placeholder={
                  "### 1. Section Title\nWrite policy details here.\n\n### 2. Next Section\n- Bullet point 1\n- Bullet point 2"
                }
                className="hr-input"
                style={{ height: "auto", padding: "8px 12px", resize: "vertical" }}
              />
            </div>

            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="hr-btn hr-btn-primary"
              >
                {saving ? "Saving..." : editingId ? "Save Changes" : "Publish Policy"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent style={{ maxWidth: 440, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 22 }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={18} style={{ color: "#dc2626" }} />
              <span>Delete Policy?</span>
            </DialogTitle>
          </DialogHeader>
          <div style={{ margin: "14px 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
            This will permanently remove <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>"{deleteTarget?.title}"</span> from Resources. Employees will no longer be able to view it.
          </div>
          <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="hr-btn hr-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="hr-btn hr-btn-danger"
            >
              {deleting ? "Deleting..." : "Delete Policy"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


