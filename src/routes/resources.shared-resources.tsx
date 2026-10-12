import React, { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Mail,
  Trash2,
  Users,
  Shield,
  ShieldCheck,
  Lock,
  Globe,
  X,
  UserCheck,
  Info,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";

export const Route = createFileRoute("/resources/shared-resources")({
  head: () => ({
    title: "CapOasis | Shared Resources & Credentials Vault",
    meta: [
      {
        name: "description",
        content: "Access and manage company-wide credentials, tool accounts, and internal services at CapOasis.",
      },
    ],
  }),
  component: SharedResourcesPage,
});

interface Resource {
  id: string;
  title: string;
  url: string;
  username: string;
  password: string;
  description: string;
  createdByMe: boolean;
  creatorName: string;
  sharedWithIds: string[];
}

interface Employee {
  id: string;
  name: string;
  role: string;
}

type ScopeFilter = "all" | "mine" | "shared";

function getHostname(urlStr: string): string {
  try {
    const formatted = urlStr.startsWith("http://") || urlStr.startsWith("https://")
      ? urlStr
      : `https://${urlStr}`;
    return new URL(formatted).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "U";
}

function SharedResourcesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [resources, setResources] = useState<Resource[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>("You");
  const [isSaving, setIsSaving] = useState(false);

  // Visibility map for passwords
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Active copy states (resourceId + field) -> boolean
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Add dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDescription, setNewDescription] = useState("");

  // Access Dialog state
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [tempSharedIds, setTempSharedIds] = useState<string[]>([]);
  const [accessSearchQuery, setAccessSearchQuery] = useState("");
  const [isUpdatingAccess, setIsUpdatingAccess] = useState(false);

  // Delete Dialog state
  const [resourceToDelete, setResourceToDelete] = useState<Resource | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Favicon error tracking
  const [failedFavicons, setFailedFavicons] = useState<Record<string, boolean>>({});

  const fetchResources = async (uid: string, cid: string, profilesMap?: Record<string, string>) => {
    const { data, error } = await supabase
      .from("shared_resources")
      .select("id, title, url, username, password, description, created_by, shared_with_ids")
      .eq("company_id", cid)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Fetch resources error:", error);
      toast.error("Failed to load shared credentials.");
      return;
    }

    const mapped: Resource[] = (data || []).map((r: any) => ({
      id: r.id,
      title: r.title,
      url: r.url,
      username: r.username,
      password: r.password,
      description: r.description || "",
      createdByMe: r.created_by === uid,
      creatorName: profilesMap?.[r.created_by] || (r.created_by === uid ? "You" : "A colleague"),
      sharedWithIds: r.shared_with_ids || [],
    }));

    setResources(mapped);
  };

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !isMounted) return;
        setCurrentUserId(user.id);

        const { data: me } = await supabase
          .from("profiles")
          .select("company_id, name")
          .eq("id", user.id)
          .single();

        if (!me?.company_id || !isMounted) return;
        setCompanyId(me.company_id);
        if (me.name) setCurrentUserName(me.name);

        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, name, job_title, role")
          .eq("company_id", me.company_id)
          .order("name", { ascending: true });

        if (profiles && isMounted) {
          const pMap: Record<string, string> = {};
          profiles.forEach((p: any) => {
            pMap[p.id] = p.name || "Unknown";
          });
          if (me.name) pMap[user.id] = me.name;

          setEmployees(
            profiles
              .filter((p: any) => p.id !== user.id)
              .map((p: any) => ({
                id: p.id,
                name: p.name || "Colleague",
                role: p.job_title || p.role || "Team Member",
              }))
          );
          await fetchResources(user.id, me.company_id, pMap);
        } else if (isMounted) {
          await fetchResources(user.id, me.company_id);
        }
      } catch (err) {
        console.error("Init shared resources error:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    init();
    return () => {
      isMounted = false;
    };
  }, []);

  // Filter metrics
  const myResourcesCount = useMemo(
    () => resources.filter((r) => r.createdByMe).length,
    [resources]
  );
  const sharedWithMeCount = useMemo(
    () => resources.filter((r) => !r.createdByMe).length,
    [resources]
  );

  // Filtered resources based on search and scope
  const filteredResources = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return resources.filter((res) => {
      // Scope match
      if (scopeFilter === "mine" && !res.createdByMe) return false;
      if (scopeFilter === "shared" && res.createdByMe) return false;

      // Query match
      if (!q) return true;
      return (
        res.title.toLowerCase().includes(q) ||
        res.description.toLowerCase().includes(q) ||
        res.username.toLowerCase().includes(q) ||
        res.url.toLowerCase().includes(q) ||
        res.creatorName.toLowerCase().includes(q)
      );
    });
  }, [resources, scopeFilter, searchQuery]);

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = (text: string, type: "Username" | "Password", id: string) => {
    navigator.clipboard.writeText(text);
    const key = `${id}-${type.toLowerCase()}`;
    setCopiedKey(key);
    toast.success(`${type} copied to clipboard`);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2000);
  };

  const handleOpenDelete = (res: Resource) => {
    setResourceToDelete(res);
  };

  const handleConfirmDelete = async () => {
    if (!resourceToDelete) return;
    setIsDeleting(true);
    const { error } = await supabase
      .from("shared_resources")
      .delete()
      .eq("id", resourceToDelete.id);

    setIsDeleting(false);
    if (error) {
      toast.error("Failed to delete shared resource: " + error.message);
      return;
    }

    setResources((prev) => prev.filter((res) => res.id !== resourceToDelete.id));
    toast.success("Shared credential removed from vault.");
    setResourceToDelete(null);
  };

  const handleOpenAccess = (res: Resource) => {
    setSelectedResource(res);
    setTempSharedIds(res.sharedWithIds || []);
    setAccessSearchQuery("");
    setAccessDialogOpen(true);
  };

  const handleSaveAccess = async () => {
    if (!selectedResource) return;
    setIsUpdatingAccess(true);
    const { error } = await supabase
      .from("shared_resources")
      .update({ shared_with_ids: tempSharedIds })
      .eq("id", selectedResource.id);

    setIsUpdatingAccess(false);
    if (error) {
      toast.error("Failed to update access permissions.");
      return;
    }

    setResources((prev) =>
      prev.map((res) =>
        res.id === selectedResource.id ? { ...res, sharedWithIds: tempSharedIds } : res
      )
    );
    setAccessDialogOpen(false);
    toast.success("Team permissions updated successfully.");
  };

  const handleToggleEmployeeAccess = (empId: string) => {
    setTempSharedIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleSelectAllAccess = () => {
    setTempSharedIds(employees.map((e) => e.id));
  };

  const handleClearAllAccess = () => {
    setTempSharedIds([]);
  };

  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newUrl.trim() || !newUsername.trim() || !newPassword.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (!currentUserId || !companyId) {
      toast.error("User company information is not ready. Please try again.");
      return;
    }

    setIsSaving(true);
    const formattedUrl =
      newUrl.startsWith("http://") || newUrl.startsWith("https://")
        ? newUrl.trim()
        : `https://${newUrl.trim()}`;

    const { error } = await supabase.from("shared_resources").insert({
      company_id: companyId,
      created_by: currentUserId,
      title: newTitle.trim(),
      url: formattedUrl,
      username: newUsername.trim(),
      password: newPassword.trim(),
      description: newDescription.trim(),
      shared_with_ids: [],
    });

    setIsSaving(false);
    if (error) {
      toast.error("Failed to add resource: " + error.message);
      return;
    }

    const pMap: Record<string, string> = {};
    employees.forEach((e) => {
      pMap[e.id] = e.name;
    });
    if (currentUserName) pMap[currentUserId] = currentUserName;
    await fetchResources(currentUserId, companyId, pMap);

    setAddDialogOpen(false);
    setNewTitle("");
    setNewUrl("");
    setNewUsername("");
    setNewPassword("");
    setNewDescription("");
    toast.success("Shared credential saved to vault.");
  };

  // Filtered employees for access modal
  const filteredEmployeesForAccess = useMemo(() => {
    const q = accessSearchQuery.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q)
    );
  }, [employees, accessSearchQuery]);

  return (
    <div className="vault-page-wrapper">
      {/* Header & Breadcrumb Card */}
      <div className="vault-header-card">
        <div className="vault-breadcrumb-row">
          <Link to="/resources" className="vault-breadcrumb-link">
            Resources
          </Link>
          <span className="vault-breadcrumb-separator">/</span>
          <span className="vault-breadcrumb-current">Credentials Vault</span>
        </div>

        <div className="vault-header-main">
          <div className="vault-title-group">
            <h1 className="vault-title">Shared Resources & Credentials</h1>
            <p className="vault-subtitle">
              Securely organize company tool accounts, shared logins, and credentials with granular team access.
            </p>
          </div>

          <div className="vault-header-actions">
            <div className="vault-search-wrap">
              <Search size={15} className="vault-search-icon" />
              <input
                type="text"
                placeholder="Search tools, logins, accounts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="vault-search-input"
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
              onClick={() => setAddDialogOpen(true)}
              className="vault-add-btn"
            >
              <Plus size={15} />
              Add Resource
            </button>
          </div>
        </div>

        {/* Live Vault Metrics */}
        <div className="vault-stats-bar">
          <div className="vault-stat-item">
            <Lock size={14} className="vault-stat-icon" />
            <span>Total Logins:</span>
            <span className="vault-stat-val">{resources.length}</span>
          </div>

          <div className="vault-stat-item">
            <UserCheck size={14} className="vault-stat-icon" />
            <span>Created by Me:</span>
            <span className="vault-stat-val">{myResourcesCount}</span>
          </div>

          <div className="vault-stat-item">
            <Users size={14} className="vault-stat-icon" />
            <span>Shared with Me:</span>
            <span className="vault-stat-val">{sharedWithMeCount}</span>
          </div>

          <div className="vault-stat-item" style={{ marginLeft: "auto" }}>
            <ShieldCheck size={14} style={{ color: "#059669" }} />
            <span style={{ color: "var(--color-text-secondary)", fontSize: "12px", fontWeight: 500 }}>
              Encrypted Corporate Vault
            </span>
          </div>
        </div>
      </div>

      {/* Scope Filter Pills */}
      <div className="vault-filter-bar">
        <button
          onClick={() => setScopeFilter("all")}
          className={`vault-filter-pill ${scopeFilter === "all" ? "is-active" : ""}`}
        >
          All Resources
          <span className="vault-filter-count">{resources.length}</span>
        </button>

        <button
          onClick={() => setScopeFilter("mine")}
          className={`vault-filter-pill ${scopeFilter === "mine" ? "is-active" : ""}`}
        >
          Created by Me
          <span className="vault-filter-count">{myResourcesCount}</span>
        </button>

        <button
          onClick={() => setScopeFilter("shared")}
          className={`vault-filter-pill ${scopeFilter === "shared" ? "is-active" : ""}`}
        >
          Shared with Me
          <span className="vault-filter-count">{sharedWithMeCount}</span>
        </button>
      </div>

      {/* Content Grid / Skeletons / Empty State */}
      {isLoading ? (
        <div className="vault-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="vault-card" style={{ gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="skeleton-box" style={{ width: "40px", height: "40px", borderRadius: "8px" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                  <div className="skeleton-box" style={{ width: "60%", height: "18px", borderRadius: "4px" }} />
                  <div className="skeleton-box" style={{ width: "40%", height: "12px", borderRadius: "4px" }} />
                </div>
              </div>
              <div className="skeleton-box" style={{ width: "100%", height: "42px", borderRadius: "8px" }} />
              <div className="skeleton-box" style={{ width: "100%", height: "42px", borderRadius: "8px" }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: "8px" }}>
                <div className="skeleton-box" style={{ width: "90px", height: "14px", borderRadius: "4px" }} />
                <div className="skeleton-box" style={{ width: "80px", height: "24px", borderRadius: "6px" }} />
              </div>
            </div>
          ))}
        </div>
      ) : filteredResources.length === 0 ? (
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
            <Shield size={22} />
          </div>
          <h2 className="hub-empty-title">
            {searchQuery
              ? "No matching resources found"
              : scopeFilter === "mine"
              ? "You haven't added any resources yet"
              : scopeFilter === "shared"
              ? "No resources have been shared with you yet"
              : "No shared resources yet"}
          </h2>
          <p className="hub-empty-desc" style={{ maxWidth: "420px", textAlign: "center" }}>
            {searchQuery
              ? `No credentials or logins matched "${searchQuery}". Try searching by tool name, account username, or domain.`
              : "Store software licenses, shared tools, or test accounts here for your team to safely access."}
          </p>
          <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery("")}
                className="btn btn-secondary"
              >
                Clear Search
              </button>
            ) : (
              <button
                onClick={() => setAddDialogOpen(true)}
                className="vault-add-btn"
              >
                <Plus size={15} />
                Add Your First Resource
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="vault-grid">
          {filteredResources.map((res) => {
            const hostname = getHostname(res.url);
            const isFaviconFailed = failedFavicons[res.id];
            const isUsernameCopied = copiedKey === `${res.id}-username`;
            const isPasswordCopied = copiedKey === `${res.id}-password`;
            const isPasswordVisible = !!visiblePasswords[res.id];

            return (
              <div key={res.id} className="vault-card">
                <div>
                  {/* Card Header */}
                  <div className="vault-card-header">
                    <div className="vault-card-header-left">
                      <div className="vault-favicon-box">
                        {hostname && !isFaviconFailed ? (
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=64`}
                            alt=""
                            className="vault-favicon-img"
                            onError={() =>
                              setFailedFavicons((prev) => ({ ...prev, [res.id]: true }))
                            }
                          />
                        ) : (
                          <KeyRound size={18} style={{ color: "var(--color-text-muted)" }} />
                        )}
                      </div>

                      <div className="vault-card-title-group">
                        <h3 className="vault-card-title" title={res.title}>
                          {res.title}
                        </h3>
                        <span className="vault-card-domain" title={hostname || res.url}>
                          {hostname || "Internal Service"}
                        </span>
                      </div>
                    </div>

                    <div className="vault-card-header-actions">
                      {res.url && (
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="vault-icon-btn"
                          title="Open application in new tab"
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}

                      {res.createdByMe && (
                        <button
                          onClick={() => handleOpenDelete(res)}
                          className="vault-icon-btn is-delete"
                          title="Delete credential"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Optional Description / Notes */}
                  {res.description && (
                    <p className="vault-description-text">
                      {res.description}
                    </p>
                  )}

                  {/* Credentials Fields */}
                  <div className="vault-credentials-body">
                    {/* Username Field */}
                    <div className="vault-credential-field">
                      <span className="vault-field-label">Username / Account</span>
                      <div className="vault-field-row">
                        <div className="vault-field-value-wrap">
                          <Mail size={13} className="vault-field-icon" />
                          <span className="vault-field-value" title={res.username}>
                            {res.username}
                          </span>
                        </div>
                        <div className="vault-field-actions">
                          <button
                            onClick={() => copyToClipboard(res.username, "Username", res.id)}
                            className={`vault-copy-btn ${isUsernameCopied ? "is-copied" : ""}`}
                            title={isUsernameCopied ? "Copied!" : "Copy username"}
                          >
                            {isUsernameCopied ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Password Field */}
                    <div className="vault-credential-field">
                      <span className="vault-field-label">Password</span>
                      <div className="vault-field-row">
                        <div className="vault-field-value-wrap">
                          <Lock size={13} className="vault-field-icon" />
                          <span
                            className="vault-field-value"
                            style={{
                              letterSpacing: !isPasswordVisible ? "0.15em" : "normal",
                            }}
                            title={isPasswordVisible ? res.password : "Password hidden"}
                          >
                            {isPasswordVisible ? res.password : "••••••••••••"}
                          </span>
                        </div>
                        <div className="vault-field-actions">
                          <button
                            onClick={() => togglePasswordVisibility(res.id)}
                            className="vault-copy-btn"
                            title={isPasswordVisible ? "Hide password" : "Show password"}
                          >
                            {isPasswordVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                          </button>
                          <button
                            onClick={() => copyToClipboard(res.password, "Password", res.id)}
                            className={`vault-copy-btn ${isPasswordCopied ? "is-copied" : ""}`}
                            title={isPasswordCopied ? "Copied!" : "Copy password"}
                          >
                            {isPasswordCopied ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="vault-card-footer">
                  <div
                    className={`vault-creator-badge ${res.createdByMe ? "is-me" : ""}`}
                    title={
                      res.createdByMe
                        ? "You created and manage this credential"
                        : `Shared by ${res.creatorName}`
                    }
                  >
                    <Users size={12} />
                    <span>
                      {res.createdByMe ? "Shared by you" : `Shared by ${res.creatorName}`}
                    </span>
                  </div>

                  {res.createdByMe && (
                    <button
                      onClick={() => handleOpenAccess(res)}
                      className="vault-manage-access-btn"
                      title="Configure who has access to these credentials"
                    >
                      <Shield size={11} />
                      Manage Access
                      {res.sharedWithIds && res.sharedWithIds.length > 0 && (
                        <span
                          style={{
                            backgroundColor: "rgba(0,0,0,0.06)",
                            padding: "0 4px",
                            borderRadius: "10px",
                            fontSize: "10.5px",
                          }}
                        >
                          {res.sharedWithIds.length}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Resource Dialog */}
      <Dialog.Root open={addDialogOpen} onOpenChange={setAddDialogOpen}>
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
                  <Lock size={15} />
                </div>
                <div>
                  <Dialog.Title className="hub-modal-title" style={{ margin: 0, fontSize: "16px" }}>
                    Add Shared Resource
                  </Dialog.Title>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted)" }}>
                    Store a new login credential in the company vault
                  </p>
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="btn-icon" title="Close dialog">
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleAddResource} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label className="hub-form-label" style={{ display: "block", marginBottom: "6px" }}>
                  Tool / Resource Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Figma Organization, GitHub Team"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="form-input"
                  style={{ width: "100%" }}
                />
              </div>

              <div>
                <label className="hub-form-label" style={{ display: "block", marginBottom: "6px" }}>
                  Service Website URL *
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://figma.com/login"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="form-input"
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label className="hub-form-label" style={{ display: "block", marginBottom: "6px" }}>
                    Username / Email *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="team@company.com"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="form-input"
                    style={{ width: "100%" }}
                  />
                </div>

                <div>
                  <label className="hub-form-label" style={{ display: "block", marginBottom: "6px" }}>
                    Password *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="••••••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="form-input"
                    style={{ width: "100%" }}
                  />
                </div>
              </div>

              <div>
                <label className="hub-form-label" style={{ display: "block", marginBottom: "6px" }}>
                  Notes / 2FA Instructions (Optional)
                </label>
                <textarea
                  placeholder="e.g. 2FA backup codes sent to #it-support on Slack. Do not change billing settings."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="form-textarea"
                  rows={2}
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
                  onClick={() => setAddDialogOpen(false)}
                  className="btn btn-secondary"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="vault-add-btn"
                  style={{ minWidth: "120px", justifyContent: "center" }}
                >
                  {isSaving ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Credential"
                  )}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Manage Access Dialog */}
      <Dialog.Root open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
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
                  <Shield size={15} />
                </div>
                <div>
                  <Dialog.Title className="hub-modal-title" style={{ margin: 0, fontSize: "16px" }}>
                    Manage Access
                  </Dialog.Title>
                  <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted)" }}>
                    {selectedResource?.title}
                  </p>
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="btn-icon" title="Close dialog">
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <p style={{ fontSize: "12.5px", color: "var(--color-text-muted)", margin: "0 0 12px 0", lineHeight: 1.45 }}>
              Choose which team members can view these credentials. Team members with access will see this resource in their vault.
            </p>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "8px" }}>
              <input
                type="text"
                placeholder="Search colleagues by name or role..."
                value={accessSearchQuery}
                onChange={(e) => setAccessSearchQuery(e.target.value)}
                className="vault-access-search"
                style={{ margin: 0, flex: 1 }}
              />
              <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={handleSelectAllAccess}
                  className="btn btn-secondary"
                  style={{ fontSize: "11px", padding: "4px 8px", height: "36px" }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={handleClearAllAccess}
                  className="btn btn-secondary"
                  style={{ fontSize: "11px", padding: "4px 8px", height: "36px" }}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="vault-access-list">
              {filteredEmployeesForAccess.length === 0 ? (
                <div style={{ padding: "32px 16px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "13px" }}>
                  {accessSearchQuery ? "No team members matched your search." : "No team members found."}
                </div>
              ) : (
                filteredEmployeesForAccess.map((emp) => {
                  const isChecked = tempSharedIds.includes(emp.id);
                  return (
                    <label
                      key={emp.id}
                      className="vault-access-item"
                    >
                      <div className="vault-access-item-left">
                        <div className="vault-access-avatar">
                          {getInitials(emp.name)}
                        </div>
                        <div>
                          <span className="vault-access-name">{emp.name}</span>
                          <span className="vault-access-role">{emp.role}</span>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleEmployeeAccess(emp.id)}
                        style={{ width: "16px", height: "16px", accentColor: "#09090b", cursor: "pointer" }}
                      />
                    </label>
                  );
                })
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: "14px",
                borderTop: "1px solid var(--color-border)",
                marginTop: "12px",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                {tempSharedIds.length} member{tempSharedIds.length === 1 ? "" : "s"} selected
              </span>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setAccessDialogOpen(false)}
                  className="btn btn-secondary"
                  disabled={isUpdatingAccess}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAccess}
                  className="vault-add-btn"
                  disabled={isUpdatingAccess}
                  style={{ minWidth: "110px", justifyContent: "center" }}
                >
                  {isUpdatingAccess ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Access"
                  )}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Confirmation Dialog */}
      <Dialog.Root
        open={!!resourceToDelete}
        onOpenChange={(open) => {
          if (!open) setResourceToDelete(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="hub-modal-overlay" />
          <Dialog.Content className="hub-modal-content" style={{ maxWidth: "420px" }}>
            <div className="hub-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fecaca",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#dc2626",
                  }}
                >
                  <AlertCircle size={16} />
                </div>
                <Dialog.Title className="hub-modal-title" style={{ margin: 0, fontSize: "16px" }}>
                  Delete Shared Resource
                </Dialog.Title>
              </div>
              <Dialog.Close asChild>
                <button className="btn-icon" title="Close dialog">
                  <X size={16} />
                </button>
              </Dialog.Close>
            </div>

            <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.5, margin: "0 0 16px 0" }}>
              Are you sure you want to delete <strong style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{resourceToDelete?.title}</strong>? Team members will no longer have access to this credential.
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                paddingTop: "14px",
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <button
                type="button"
                onClick={() => setResourceToDelete(null)}
                className="btn btn-secondary"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="btn"
                style={{
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                  border: "none",
                  fontWeight: 500,
                  fontSize: "13px",
                  padding: "0 14px",
                  height: "36px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  borderRadius: "var(--radius-md, 8px)",
                }}
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete Resource"
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
