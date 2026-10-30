import React, { useEffect, useState, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import {
  Laptop,
  Monitor,
  Smartphone,
  CreditCard,
  Keyboard,
  Headphones,
  KeyRound,
  Car,
  Package,
  Plus,
  Send,
  ArrowLeft,
  X,
  Search,
  Copy,
  Check,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  Sparkles,
  Loader2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  getEmployeeAssignedAssets,
  getEmployeeAssetRequests,
  getCompanyAssets,
  createAssetRequest,
  DEFAULT_ASSET_CATEGORIES,
  type CompanyAsset,
  type AssetRequest,
  type RequestPriority,
} from "../lib/assets";
import { getDynamicPageTitle } from "../lib/tenant-brand";

export const Route = createFileRoute("/resources/assets")({
  head: () => ({
    title: getDynamicPageTitle("My Assets & Requisitions"),
    meta: [
      {
        name: "description",
        content: "Track company hardware in your custody and submit equipment requisitions.",
      },
    ],
  }),
  component: MyAssetsHubPage,
});

const getAssetIcon = (type: string, size = 18) => {
  const lower = (type || "").toLowerCase();
  if (lower.includes("mac") || lower.includes("laptop") || lower.includes("pc") || lower.includes("computer")) {
    return <Laptop size={size} />;
  }
  if (lower.includes("monitor") || lower.includes("screen") || lower.includes("display")) {
    return <Monitor size={size} />;
  }
  if (lower.includes("phone") || lower.includes("mobile") || lower.includes("ipad") || lower.includes("tab")) {
    return <Smartphone size={size} />;
  }
  if (lower.includes("key") || lower.includes("yubi")) {
    return <KeyRound size={size} />;
  }
  if (lower.includes("audio") || lower.includes("headset") || lower.includes("earphone") || lower.includes("mic") || lower.includes("headphones")) {
    return <Headphones size={size} />;
  }
  if (lower.includes("mouse") || lower.includes("keyboard") || lower.includes("board")) {
    return <Keyboard size={size} />;
  }
  if (lower.includes("sim") || lower.includes("card")) {
    return <CreditCard size={size} />;
  }
  if (lower.includes("car") || lower.includes("bike") || lower.includes("vehicle")) {
    return <Car size={size} />;
  }
  return <Package size={size} />;
};

function MyAssetsHubPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"assigned" | "requests">("assigned");
  const [searchQuery, setSearchQuery] = useState("");
  const [assets, setAssets] = useState<CompanyAsset[]>([]);
  const [requests, setRequests] = useState<AssetRequest[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>(DEFAULT_ASSET_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  // Request Asset Modal State
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [reqType, setReqType] = useState<string>("Laptop");
  const [customReqType, setCustomReqType] = useState("");
  const [showCustomTypeInput, setShowCustomTypeInput] = useState(false);
  const [reqPriority, setReqPriority] = useState<RequestPriority>("medium");
  const [reqReason, setReqReason] = useState("");
  const [submittingReq, setSubmittingReq] = useState(false);
  const [formError, setFormError] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name, company_id")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUserId(profile.id);
        setCompanyId(profile.company_id);
        const [assigned, myRequests, companyAssets] = await Promise.all([
          getEmployeeAssignedAssets(profile.id, profile.company_id),
          getEmployeeAssetRequests(profile.id, profile.company_id),
          getCompanyAssets(profile.company_id),
        ]);
        setAssets(assigned);
        setRequests(myRequests);

        // Derive company available categories
        const companyCats = companyAssets.map((a) => a.asset_type).filter(Boolean);
        const combined = Array.from(new Set([...DEFAULT_ASSET_CATEGORIES, ...companyCats]));
        setAvailableCategories(combined.sort((a, b) => a.localeCompare(b)));
      }
    } catch (err) {
      console.error("Error loading assigned assets / requests:", err);
      toast.error("Failed to load assets data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCopyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    toast.success(`Asset tag ${tag} copied to clipboard`);
    setTimeout(() => {
      setCopiedTag((curr) => (curr === tag ? null : curr));
    }, 2000);
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalType = reqType === "__CUSTOM__" ? customReqType.trim() : reqType.trim();
    if (!finalType) {
      setFormError("Please enter or select an asset category.");
      return;
    }
    if (!reqReason.trim()) {
      setFormError("Please provide a business justification or purpose.");
      return;
    }
    if (!userId || !companyId) return;

    setSubmittingReq(true);
    setFormError("");
    try {
      await createAssetRequest({
        company_id: companyId,
        employee_id: userId,
        asset_type: finalType,
        reason: reqReason.trim(),
        priority: reqPriority,
      });

      setRequestModalOpen(false);
      setReqReason("");
      setCustomReqType("");
      setShowCustomTypeInput(false);
      setActiveTab("requests");
      toast.success("Asset requisition submitted to IT / HR.");
      await loadData();
    } catch (err: any) {
      setFormError(err.message || "Failed to submit request");
      toast.error("Failed to submit requisition.");
    } finally {
      setSubmittingReq(false);
    }
  };

  const pendingCount = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests]
  );

  // Filtered Assets based on search query
  const filteredAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter(
      (a) =>
        a.asset_name.toLowerCase().includes(q) ||
        (a.asset_code && a.asset_code.toLowerCase().includes(q)) ||
        (a.serial_number && a.serial_number.toLowerCase().includes(q)) ||
        (a.brand && a.brand.toLowerCase().includes(q)) ||
        (a.model && a.model.toLowerCase().includes(q)) ||
        a.asset_type.toLowerCase().includes(q)
    );
  }, [assets, searchQuery]);

  // Filtered Requests based on search query
  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(
      (r) =>
        r.asset_type.toLowerCase().includes(q) ||
        r.reason.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q) ||
        r.priority.toLowerCase().includes(q)
    );
  }, [requests, searchQuery]);

  return (
    <div className="assets-page-wrapper">
      {/* Header & Breadcrumb Card */}
      <div className="assets-header-card">
        <div className="assets-breadcrumb-row">
          <Link to="/resources" className="assets-breadcrumb-link">
            Resources
          </Link>
          <span className="assets-breadcrumb-sep">/</span>
          <span className="assets-breadcrumb-current">My Assets & Requisitions</span>
        </div>

        <div className="assets-header-main">
          <div className="assets-title-group">
            <h1 className="assets-title">My Assets & Requisitions</h1>
            <p className="assets-subtitle">
              Manage company hardware in your custody, view asset tags, and submit equipment requisitions.
            </p>
          </div>

          <div className="assets-header-actions">
            <div className="assets-search-wrap">
              <Search size={15} className="assets-search-icon" />
              <input
                type="text"
                placeholder="Search hardware, tag, serial..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="assets-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: "10px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
                    padding: 0,
                    display: "flex",
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              onClick={() => {
                setFormError("");
                setRequestModalOpen(true);
              }}
              className="assets-request-btn"
            >
              <Plus size={15} />
              Request Asset
            </button>
          </div>
        </div>

        {/* Live Metrics Bar */}
        <div className="assets-stats-bar">
          <div className="assets-stat-item">
            <Laptop size={14} style={{ color: "var(--color-text-secondary)" }} />
            <span>Assigned Hardware:</span>
            <strong>{assets.length}</strong>
          </div>

          <div className="assets-stat-item">
            <Layers size={14} style={{ color: "var(--color-text-secondary)" }} />
            <span>Requisitions:</span>
            <strong>{requests.length}</strong>
            {pendingCount > 0 && (
              <span className="assets-tab-pending-badge">{pendingCount} Pending</span>
            )}
          </div>

          <div className="assets-stat-item" style={{ marginLeft: "auto" }}>
            <ShieldCheck size={14} style={{ color: "#059669" }} />
            <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>
              Custody Verified by IT
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="assets-tab-bar">
        <button
          onClick={() => setActiveTab("assigned")}
          className={`assets-tab-pill ${activeTab === "assigned" ? "is-active" : ""}`}
        >
          <Laptop size={14} />
          Assigned Hardware
          <span className="assets-tab-count">{assets.length}</span>
        </button>

        <button
          onClick={() => setActiveTab("requests")}
          className={`assets-tab-pill ${activeTab === "requests" ? "is-active" : ""}`}
        >
          <Send size={13} />
          My Requisitions
          {pendingCount > 0 ? (
            <span className="assets-tab-pending-badge">{pendingCount} Pending</span>
          ) : (
            <span className="assets-tab-count">{requests.length}</span>
          )}
        </button>
      </div>

      {/* Main Tab Content */}
      {loading ? (
        <div className="assets-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="assets-card" style={{ gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="skeleton-box" style={{ width: "42px", height: "42px", borderRadius: "10px" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                  <div className="skeleton-box" style={{ width: "60%", height: "18px", borderRadius: "4px" }} />
                  <div className="skeleton-box" style={{ width: "40%", height: "12px", borderRadius: "4px" }} />
                </div>
              </div>
              <div className="skeleton-box" style={{ width: "100%", height: "36px", borderRadius: "8px" }} />
              <div className="skeleton-box" style={{ width: "100%", height: "36px", borderRadius: "8px" }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: "8px" }}>
                <div className="skeleton-box" style={{ width: "80px", height: "18px", borderRadius: "4px" }} />
                <div className="skeleton-box" style={{ width: "70px", height: "18px", borderRadius: "4px" }} />
              </div>
            </div>
          ))}
        </div>
      ) : activeTab === "assigned" ? (
        filteredAssets.length === 0 ? (
          <div className="hub-empty-state" style={{ minHeight: "320px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
                border: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "14px",
                color: "var(--color-text-muted)",
              }}
            >
              <Laptop size={22} />
            </div>
            <h2 className="hub-empty-title">
              {searchQuery ? "No matching hardware found" : "No assets currently assigned"}
            </h2>
            <p className="hub-empty-desc" style={{ maxWidth: "420px", textAlign: "center" }}>
              {searchQuery
                ? `No devices matched "${searchQuery}". Try searching by asset name, tag, or serial number.`
                : "You do not have any company hardware checked out. Need a laptop, monitor, or accessories? Submit a requisition."}
            </p>
            <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
              {searchQuery ? (
                <button onClick={() => setSearchQuery("")} className="btn btn-secondary">
                  Clear Search
                </button>
              ) : (
                <button
                  onClick={() => {
                    setFormError("");
                    setRequestModalOpen(true);
                  }}
                  className="assets-request-btn"
                >
                  <Plus size={15} />
                  Request Equipment
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="assets-grid">
            {filteredAssets.map((asset) => {
              const isTagCopied = copiedTag === asset.asset_code;
              const handoverDate = asset.assigned_at
                ? new Date(asset.assigned_at).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "Assigned";

              return (
                <div key={asset.id} className="assets-card">
                  <div>
                    {/* Card Header */}
                    <div className="assets-card-header">
                      <div className="assets-card-header-left">
                        <div className="assets-icon-box">
                          {getAssetIcon(asset.asset_type, 20)}
                        </div>
                        <div className="assets-card-title-group">
                          <h3 className="assets-card-title" title={asset.asset_name}>
                            {asset.asset_name}
                          </h3>
                          <p className="assets-card-subtitle" title={[asset.brand, asset.model].filter(Boolean).join(" • ")}>
                            {[asset.brand, asset.model].filter(Boolean).join(" • ") || asset.asset_type}
                          </p>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 500,
                          padding: "2px 8px",
                          borderRadius: "var(--radius-full)",
                          backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
                          border: "1px solid var(--color-border)",
                          color: "var(--color-text-secondary)",
                          textTransform: "capitalize",
                          flexShrink: 0,
                        }}
                      >
                        {asset.condition || "Good Condition"}
                      </span>
                    </div>

                    {/* Specifications & Tag Info */}
                    <div className="assets-card-specs">
                      <div className="assets-spec-row">
                        <span className="assets-spec-label">Asset Tag</span>
                        <div className="assets-spec-value is-mono">
                          <span>{asset.asset_code || "—"}</span>
                          {asset.asset_code && (
                            <button
                              type="button"
                              onClick={() => handleCopyTag(asset.asset_code!)}
                              className={`assets-tag-copy-btn ${isTagCopied ? "is-copied" : ""}`}
                              title={isTagCopied ? "Copied!" : "Copy Asset Tag"}
                            >
                              {isTagCopied ? <Check size={12} /> : <Copy size={12} />}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="assets-spec-row">
                        <span className="assets-spec-label">Serial Number</span>
                        <span className="assets-spec-value is-mono">
                          {asset.serial_number || "—"}
                        </span>
                      </div>

                      <div className="assets-spec-row">
                        <span className="assets-spec-label">Hardware Type</span>
                        <span className="assets-spec-value">
                          {asset.asset_type}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="assets-card-footer">
                    <span className="assets-custody-tag">
                      <ShieldCheck size={12} />
                      In Your Custody
                    </span>

                    <span style={{ color: "var(--color-text-muted)", fontSize: "11.5px" }}>
                      Since {handoverDate}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* Requests Tab */
        filteredRequests.length === 0 ? (
          <div className="hub-empty-state" style={{ minHeight: "320px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
                border: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "14px",
                color: "var(--color-text-muted)",
              }}
            >
              <Send size={20} />
            </div>
            <h2 className="hub-empty-title">
              {searchQuery ? "No matching requisitions found" : "No asset requisitions submitted"}
            </h2>
            <p className="hub-empty-desc" style={{ maxWidth: "420px", textAlign: "center" }}>
              {searchQuery
                ? `No requests matched "${searchQuery}". Try searching by category or justification.`
                : "You haven't requested any hardware or equipment yet. Need equipment for your project? Submit a request."}
            </p>
            <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
              {searchQuery ? (
                <button onClick={() => setSearchQuery("")} className="btn btn-secondary">
                  Clear Search
                </button>
              ) : (
                <button
                  onClick={() => {
                    setFormError("");
                    setRequestModalOpen(true);
                  }}
                  className="assets-request-btn"
                >
                  <Plus size={15} />
                  Submit Requisition
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="assets-requests-list">
            {filteredRequests.map((req) => {
              const requestDate = new Date(req.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });

              return (
                <div key={req.id} className="assets-request-card">
                  <div className="assets-request-header">
                    <div className="assets-request-header-left">
                      <div className="assets-icon-box" style={{ width: "36px", height: "36px" }}>
                        {getAssetIcon(req.asset_type, 18)}
                      </div>
                      <div>
                        <h4 className="assets-request-category">{req.asset_type}</h4>
                        <span className="assets-request-date">Requested on {requestDate}</span>
                      </div>
                    </div>

                    <div className="assets-request-badges">
                      <span className={`assets-badge-priority ${req.priority}`}>
                        {req.priority} Priority
                      </span>

                      <span className={`assets-badge-status ${req.status}`}>
                        {req.status === "approved" ? (
                          <CheckCircle2 size={12} />
                        ) : req.status === "rejected" ? (
                          <AlertCircle size={12} />
                        ) : (
                          <Clock size={12} />
                        )}
                        {req.status}
                      </span>
                    </div>
                  </div>

                  <p className="assets-request-reason">
                    <strong style={{ fontWeight: 600, color: "var(--color-text-primary)", display: "block", marginBottom: "4px" }}>
                      Business Justification:
                    </strong>
                    {req.reason}
                  </p>

                  {req.status === "approved" && req.assigned_asset && (
                    <div className="assets-allocated-box">
                      <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
                      <span>
                        Hardware Allocated:{" "}
                        <strong style={{ fontWeight: 600 }}>
                          {req.assigned_asset.asset_name}
                        </strong>{" "}
                        (Tag: {req.assigned_asset.asset_code || "No Tag"})
                      </span>
                    </div>
                  )}

                  {req.status === "rejected" && req.rejection_reason && (
                    <div className="assets-rejected-box">
                      <AlertCircle size={15} style={{ flexShrink: 0 }} />
                      <span>
                        Rejection Note: {req.rejection_reason}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* REQUEST ASSET MODAL */}
      <Dialog.Root open={requestModalOpen} onOpenChange={setRequestModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="hub-modal-overlay" />
          <Dialog.Content className="hub-modal-content" style={{ maxWidth: "480px" }}>
            <div className="hub-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
                    border: "1px solid var(--color-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--color-text-primary)",
                  }}
                >
                  <Send size={15} />
                </div>
                <div>
                  <Dialog.Title className="hub-modal-title" style={{ margin: 0, fontSize: "16px" }}>
                    Submit Asset Requisition
                  </Dialog.Title>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted)" }}>
                    Request hardware or equipment from IT & HR
                  </p>
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="btn-icon" title="Close dialog">
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleCreateRequest} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {formError && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #fecaca",
                    backgroundColor: "#fef2f2",
                    color: "#b91c1c",
                    fontSize: "12.5px",
                  }}
                >
                  <AlertCircle size={15} />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="hub-form-label" style={{ display: "block", marginBottom: "6px" }}>
                  Equipment Category *
                </label>
                <select
                  value={reqType}
                  onChange={(e) => {
                    if (e.target.value === "__CUSTOM__") {
                      setShowCustomTypeInput(true);
                      setReqType("__CUSTOM__");
                    } else {
                      setShowCustomTypeInput(false);
                      setReqType(e.target.value);
                    }
                  }}
                  className="form-input"
                  style={{ width: "100%", height: "38px" }}
                >
                  {availableCategories.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                  <option value="__CUSTOM__">+ Specify Other / Custom Hardware...</option>
                </select>
              </div>

              {showCustomTypeInput && (
                <div>
                  <label className="hub-form-label" style={{ display: "block", marginBottom: "6px" }}>
                    Custom Hardware Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ergonomic Standing Desk, iPad Pro, Wacom Tablet..."
                    value={customReqType}
                    onChange={(e) => setCustomReqType(e.target.value)}
                    className="form-input"
                    style={{ width: "100%" }}
                  />
                </div>
              )}

              <div>
                <label className="hub-form-label" style={{ display: "block", marginBottom: "6px" }}>
                  Urgency / Priority *
                </label>
                <select
                  value={reqPriority}
                  onChange={(e) => setReqPriority(e.target.value as RequestPriority)}
                  className="form-input"
                  style={{ width: "100%", height: "38px" }}
                >
                  <option value="low">Low (Standard Upgrade / Nice to Have)</option>
                  <option value="medium">Medium (Normal Project Requirement)</option>
                  <option value="high">High (Required for Milestone)</option>
                  <option value="urgent">Urgent (Immediate Blocker / Work Disrupted)</option>
                </select>
              </div>

              <div>
                <label className="hub-form-label" style={{ display: "block", marginBottom: "6px" }}>
                  Business Justification & Purpose *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe what equipment you need, project context, and why it is required..."
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  className="form-textarea"
                  style={{ width: "100%", fontSize: "12.5px" }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  paddingTop: "16px",
                  borderTop: "1px solid var(--color-border)",
                  marginTop: "6px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setRequestModalOpen(false)}
                  className="btn btn-secondary"
                  disabled={submittingReq}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReq}
                  className="assets-request-btn"
                  style={{ minWidth: "140px", justifyContent: "center" }}
                >
                  {submittingReq ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send size={13} />
                      Submit Requisition
                    </>
                  )}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
