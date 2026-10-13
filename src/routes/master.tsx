import React, { useEffect, useState, useMemo, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Building2 as Business,
  Users as Group,
  HardDrive as StorageIcon,
  CheckCircle2 as CircleCheck,
  AlertCircle as CircleAlert,
  Copy as ContentCopy,
  UserPlus as PersonAdd,
  SquarePen as Edit,
  Trash2 as Delete,
  LogOut as Logout,
  Plus as PlusIcon,
  ExternalLink,
  Palette,
  Upload as UploadIcon,
  Image as ImageIcon,
  Sparkles,
  X as ClearIcon,
  Search,
  Key,
  RefreshCw,
  Menu as MenuIcon,
  Layers,
  Globe,
  Loader2,
  Check,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  getMasterDashboard,
  masterOnboardCompany,
  masterUpdateCompany,
  masterToggleCompanyStatus,
  masterDeleteCompany,
  masterAddUser,
  masterUploadCompanyLoginHero,
  masterUploadCompanyLogo,
  masterUploadCompanyFavicon,
  masterGetCompanyEmployees,
  masterDeleteEmployee,
  masterResetEmployeePassword,
  type MasterEmployee,
} from "../lib/master";
import { BRAND_COLOR_PRESETS, DEFAULT_BRAND_COLOR } from "../lib/tenant-brand";

export const Route = createFileRoute("/master")({
  head: () => ({
    title: "SaaS Console | Master Dashboard",
    meta: [{ name: "description", content: "SaaS owner console for company management." }],
  }),
  component: MasterPage,
});

const GB = 1024 * 1024 * 1024;

interface MasterCompany {
  id: string;
  name: string;
  short_name: string;
  tenant_domain: string;
  plan: string;
  seat_limit: number;
  storage_quota_gb: number;
  status: string;
  created_at?: string;
  employeeCount: number;
  usedBytes: number;
  brand_color?: string;
  logo_url?: string;
  brand_tagline?: string;
  login_hero_url?: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

const emptyForm = {
  companyId: "",
  name: "",
  shortName: "",
  tenantDomain: "",
  plan: "Starter",
  seatLimit: 50,
  storageQuotaGb: 5,
  status: "active",
  adminEmail: "",
  adminName: "",
  brandColor: DEFAULT_BRAND_COLOR,
  logoUrl: "",
  brandTagline: "",
  loginHeroUrl: "",
  faviconUrl: "",
};

function MasterPage() {
  const navigate = useNavigate();

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [adminName, setAdminName] = useState("");
  const [stats, setStats] = useState<{
    companies: number;
    employees: number;
    activeCompanies: number;
    suspendedCompanies: number;
    totalQuotaBytes: number;
    totalUsedBytes: number;
  } | null>(null);
  const [companies, setCompanies] = useState<MasterCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // Sidebar navigation view state
  const [activeSection, setActiveSection] = useState<"tenants" | "onboarding" | "analytics" | "admins">(
    "tenants",
  );
  const [activeNavTab, setActiveNavTab] = useState<"all" | "active" | "suspended" | "enterprise">(
    "all",
  );

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");

  const [form, setForm] = useState({ ...emptyForm });
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newCredentials, setNewCredentials] = useState<{ email: string; password: string } | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<MasterCompany | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [userForm, setUserForm] = useState({
    companyId: "",
    companyName: "",
    name: "",
    email: "",
    role: "admin" as "admin" | "hr" | "employee",
    jobTitle: "",
  });
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [savingUser, setSavingUser] = useState(false);

  // Company Employees Directory State
  const [selectedCompanyForEmployees, setSelectedCompanyForEmployees] = useState<MasterCompany | null>(
    null,
  );
  const [employeesList, setEmployeesList] = useState<MasterEmployee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState("");
  const [employeeRoleFilter, setEmployeeRoleFilter] = useState<string>("all");
  const [employeeActionLoading, setEmployeeActionLoading] = useState<string | null>(null);
  const [deleteEmployeeTarget, setDeleteEmployeeTarget] = useState<MasterEmployee | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState(false);

  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const heroFileInputRef = useRef<HTMLInputElement | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const faviconFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleHeroFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setToast({
        open: true,
        message: "Please select an image file (PNG, JPG, WEBP).",
        severity: "error",
      });
      return;
    }
    setUploadingHero(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const res = await masterUploadCompanyLoginHero({
            data: { base64Data, companyId: form.companyId },
          });
          if (!res.success || !res.secure_url) {
            throw new Error(res.error || "Failed to upload hero image.");
          }
          setForm((f) => ({ ...f, loginHeroUrl: res.secure_url! }));
          setToast({
            open: true,
            message: "Login artwork uploaded successfully.",
            severity: "success",
          });
        } catch (err: any) {
          setToast({ open: true, message: err.message || "Hero upload failed.", severity: "error" });
        } finally {
          setUploadingHero(false);
          if (heroFileInputRef.current) heroFileInputRef.current.value = "";
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setToast({ open: true, message: err.message || "Hero upload failed.", severity: "error" });
      setUploadingHero(false);
    }
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setToast({
        open: true,
        message: "Please select an image file (PNG, SVG, JPG).",
        severity: "error",
      });
      return;
    }
    setUploadingLogo(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const res = await masterUploadCompanyLogo({
            data: { base64Data, companyId: form.companyId },
          });
          if (!res.success || !res.secure_url) {
            throw new Error(res.error || "Failed to upload company logo.");
          }
          setForm((f) => ({ ...f, logoUrl: res.secure_url! }));
          setToast({
            open: true,
            message: "Company logo uploaded successfully.",
            severity: "success",
          });
        } catch (err: any) {
          setToast({ open: true, message: err.message || "Logo upload failed.", severity: "error" });
        } finally {
          setUploadingLogo(false);
          if (logoFileInputRef.current) logoFileInputRef.current.value = "";
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setToast({ open: true, message: err.message || "Logo upload failed.", severity: "error" });
      setUploadingLogo(false);
    }
  };

  const handleFaviconFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.name.endsWith(".ico")) {
      setToast({
        open: true,
        message: "Please select a favicon file (PNG, ICO, SVG, WEBP).",
        severity: "error",
      });
      return;
    }
    setUploadingFavicon(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const res = await masterUploadCompanyFavicon({
            data: { base64Data, companyId: form.companyId },
          });
          if (!res.success || !res.secure_url) {
            throw new Error(res.error || "Failed to upload favicon.");
          }
          setForm((f) => ({ ...f, faviconUrl: res.secure_url! }));
          setToast({
            open: true,
            message: "Company favicon uploaded successfully.",
            severity: "success",
          });
        } catch (err: any) {
          setToast({ open: true, message: err.message || "Favicon upload failed.", severity: "error" });
        } finally {
          setUploadingFavicon(false);
          if (faviconFileInputRef.current) faviconFileInputRef.current.value = "";
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setToast({ open: true, message: err.message || "Favicon upload failed.", severity: "error" });
      setUploadingFavicon(false);
    }
  };

  const authGuard = async (): Promise<string | null> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      navigate({ to: "/master-login" });
      return null;
    }
    return user.id;
  };

  const loadDashboard = async (userId: string) => {
    setLoading(true);
    const res = await getMasterDashboard({ data: { userId } });
    if (!res.success) {
      setErrorMsg(res.error || "Access denied");
      setLoading(false);
      return;
    }
    setAdminName(res.adminName || "Super Admin");
    setStats(res.stats || null);
    setCompanies(res.companies || []);
    setLoading(false);
  };

  useEffect(() => {
    authGuard().then((uid) => {
      if (uid) loadDashboard(uid);
      setChecking(false);
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/master-login" });
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.shortName.trim()) {
      setToast({
        open: true,
        message: "Company name and short name are required.",
        severity: "error",
      });
      return;
    }
    setSaving(true);
    try {
      if (formMode === "create") {
        const payload: Parameters<typeof masterOnboardCompany>[0]["data"] = {
          name: form.name,
          shortName: form.shortName,
          tenantDomain: form.tenantDomain,
          plan: form.plan,
          seatLimit: Number(form.seatLimit),
          storageQuotaGb: Number(form.storageQuotaGb),
          brandColor: form.brandColor,
          logoUrl: form.logoUrl,
          brandTagline: form.brandTagline,
          loginHeroUrl: form.loginHeroUrl,
          faviconUrl: form.faviconUrl,
        };
        if (form.adminEmail.trim()) payload.adminEmail = form.adminEmail.trim();
        if (form.adminName.trim()) payload.adminName = form.adminName.trim();
        const res = await masterOnboardCompany({ data: payload });
        if (!res.success) throw new Error(res.error || "Failed to onboard company");
        if (res.credentials) setNewCredentials(res.credentials);
        setToast({
          open: true,
          message: `${form.name} onboarded successfully.`,
          severity: "success",
        });
      } else {
        const res = await masterUpdateCompany({
          data: {
            companyId: form.companyId || "",
            name: form.name,
            shortName: form.shortName,
            tenantDomain: form.tenantDomain,
            plan: form.plan,
            seatLimit: Number(form.seatLimit),
            storageQuotaGb: Number(form.storageQuotaGb),
            status: form.status,
            brandColor: form.brandColor,
            logoUrl: form.logoUrl,
            brandTagline: form.brandTagline,
            loginHeroUrl: form.loginHeroUrl,
            faviconUrl: form.faviconUrl,
          },
        });
        if (!res.success) throw new Error(res.error || "Failed to update company");
        setToast({ open: true, message: `${form.name} updated.`, severity: "success" });
      }
      setFormOpen(false);
      const uid = await authGuard();
      if (uid) loadDashboard(uid);
    } catch (err: any) {
      setToast({ open: true, message: err.message, severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setForm({ ...emptyForm });
    setFormMode("create");
    setFormOpen(true);
  };

  const openEdit = (c: MasterCompany) => {
    setForm({
      ...emptyForm,
      companyId: c.id,
      name: c.name,
      shortName: c.short_name,
      tenantDomain: c.tenant_domain || "",
      plan: c.plan,
      seatLimit: c.seat_limit,
      storageQuotaGb: c.storage_quota_gb,
      status: c.status,
      brandColor: c.brand_color || DEFAULT_BRAND_COLOR,
      logoUrl: c.logo_url || "",
      brandTagline: c.brand_tagline || "",
      loginHeroUrl: c.login_hero_url || "",
      faviconUrl: c.favicon_url || "",
    });
    setFormMode("edit");
    setFormOpen(true);
  };

  const toggleStatus = async (c: MasterCompany) => {
    const next = c.status === "active" ? "suspended" : "active";
    const res = await masterToggleCompanyStatus({ data: { companyId: c.id, status: next } });
    if (!res.success) {
      setToast({ open: true, message: res.error || "Failed to update status.", severity: "error" });
      return;
    }
    setCompanies((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: next } : x)));
    setToast({
      open: true,
      message: `${c.name} ${next === "active" ? "activated" : "suspended"}.`,
      severity: "success",
    });
  };

  const handleImpersonate = (c: MasterCompany) => {
    try {
      sessionStorage.setItem(
        "impersonated_company",
        JSON.stringify({
          id: c.id,
          name: c.name,
          shortName: c.short_name,
          role: "admin",
        }),
      );
      setToast({
        open: true,
        message: `Entering ${c.name} workspace...`,
        severity: "success",
      });
      setTimeout(() => {
        navigate({ to: "/dashboard" });
      }, 300);
    } catch (e) {
      console.error(e);
    }
  };

  const openAddUser = (c: MasterCompany) => {
    setUserForm({
      companyId: c.id,
      companyName: c.name,
      name: "",
      email: "",
      role: "admin",
      jobTitle: "",
    });
    setUserDialogOpen(true);
  };

  const handleAddUser = async () => {
    if (!userForm.name.trim() || !userForm.email.trim()) {
      setToast({
        open: true,
        message: "User name and email are required.",
        severity: "error",
      });
      return;
    }
    setSavingUser(true);
    try {
      const uid = await authGuard();
      if (!uid) return;
      const res = await masterAddUser({
        data: {
          userId: uid,
          companyId: userForm.companyId,
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          jobTitle: userForm.jobTitle.trim() ? userForm.jobTitle.trim() : undefined,
        },
      });
      if (!res.success) throw new Error(res.error || "Failed to create user");
      if (res.credentials) setNewCredentials(res.credentials);
      setUserDialogOpen(false);
      setToast({
        open: true,
        message: `${userForm.name} added to ${userForm.companyName}.`,
        severity: "success",
      });
      loadDashboard(uid);
    } catch (err: any) {
      setToast({ open: true, message: err.message, severity: "error" });
    } finally {
      setSavingUser(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await masterDeleteCompany({ data: { companyId: deleteTarget.id } });
    setDeleting(false);
    if (!res.success) {
      setToast({
        open: true,
        message: res.error || "Failed to delete company.",
        severity: "error",
      });
      return;
    }
    setDeleteTarget(null);
    setCompanies((prev) => prev.filter((c) => c.id !== deleteTarget.id));
    setToast({
      open: true,
      message: `${deleteTarget.name} deleted along with ${res.removedUsers || 0} user account(s).`,
      severity: "success",
    });
  };

  const openCompanyEmployees = async (c: MasterCompany) => {
    setSelectedCompanyForEmployees(c);
    setEmployeeSearchQuery("");
    setEmployeeRoleFilter("all");
    setLoadingEmployees(true);
    try {
      const uid = await authGuard();
      if (!uid) return;
      const res = await masterGetCompanyEmployees({
        data: { userId: uid, companyId: c.id },
      });
      if (!res.success) {
        setToast({
          open: true,
          message: res.error || "Failed to load company employees.",
          severity: "error",
        });
        return;
      }
      setEmployeesList(res.employees || []);
    } catch (err: any) {
      setToast({ open: true, message: err.message || "Failed to load employees.", severity: "error" });
    } finally {
      setLoadingEmployees(false);
    }
  };

  const handleResetEmployeePassword = async (emp: MasterEmployee) => {
    if (!selectedCompanyForEmployees) return;
    setEmployeeActionLoading(emp.id);
    try {
      const uid = await authGuard();
      if (!uid) return;
      const res = await masterResetEmployeePassword({
        data: {
          userId: uid,
          companyId: selectedCompanyForEmployees.id,
          employeeId: emp.id,
        },
      });
      if (!res.success || !res.credentials) {
        throw new Error(res.error || "Failed to reset password.");
      }
      setNewCredentials(res.credentials);
      setToast({
        open: true,
        message: `New temporary password generated for ${emp.name}.`,
        severity: "success",
      });
    } catch (err: any) {
      setToast({ open: true, message: err.message || "Password reset failed.", severity: "error" });
    } finally {
      setEmployeeActionLoading(null);
    }
  };

  const confirmDeleteEmployee = async () => {
    if (!deleteEmployeeTarget || !selectedCompanyForEmployees) return;
    setDeletingEmployee(true);
    try {
      const uid = await authGuard();
      if (!uid) return;
      const res = await masterDeleteEmployee({
        data: {
          userId: uid,
          companyId: selectedCompanyForEmployees.id,
          employeeId: deleteEmployeeTarget.id,
        },
      });
      if (!res.success) {
        throw new Error(res.error || "Failed to remove employee.");
      }
      setToast({
        open: true,
        message: `${deleteEmployeeTarget.name} removed from ${selectedCompanyForEmployees.name}.`,
        severity: "success",
      });
      setEmployeesList((prev) => prev.filter((e) => e.id !== deleteEmployeeTarget.id));
      setDeleteEmployeeTarget(null);
      loadDashboard(uid);
    } catch (err: any) {
      setToast({ open: true, message: err.message || "Failed to remove employee.", severity: "error" });
    } finally {
      setDeletingEmployee(false);
    }
  };

  // Filtered companies based on search, selectors, and activeNavTab
  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      // Tab filter
      if (activeNavTab === "active" && c.status.toLowerCase() !== "active") return false;
      if (activeNavTab === "suspended" && c.status.toLowerCase() !== "suspended") return false;
      if (activeNavTab === "enterprise" && c.plan.toLowerCase() !== "enterprise") return false;

      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.short_name && c.short_name.toLowerCase().includes(q)) ||
        (c.tenant_domain && c.tenant_domain.toLowerCase().includes(q));

      const matchesStatus = statusFilter === "all" || c.status.toLowerCase() === statusFilter.toLowerCase();
      const matchesPlan = planFilter === "all" || c.plan.toLowerCase() === planFilter.toLowerCase();

      return matchesQuery && matchesStatus && matchesPlan;
    });
  }, [companies, searchQuery, statusFilter, planFilter, activeNavTab]);

  if (checking) {
    return (
      <div className="master-shell" style={{ alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  // Sidebar content component
  const sidebarContent = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
      <div>
        {/* Sidebar Header */}
        <div className="master-sidebar-header">
          <div className="master-sidebar-brand">
            <img src="/teamstuff_icon_logo.png" alt="Teamstuff" className="master-sidebar-logo" />
            <div>
              <h2 className="master-sidebar-title">Teamstuff</h2>
              <p className="master-sidebar-tag">Master Console</p>
            </div>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="master-sidebar-nav">
          <p className="master-nav-section-title">Processes</p>

          <button
            type="button"
            onClick={() => {
              setActiveSection("tenants");
              setMobileDrawerOpen(false);
            }}
            className={`master-nav-item ${activeSection === "tenants" ? "active" : ""}`}
          >
            <div className="master-nav-item-content">
              <Business size={15} />
              <span>Tenants Directory</span>
            </div>
            <span className="master-nav-count">
              {companies.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setForm({ ...emptyForm });
              setFormMode("create");
              setActiveSection("onboarding");
              setMobileDrawerOpen(false);
            }}
            className={`master-nav-item ${activeSection === "onboarding" ? "active" : ""}`}
          >
            <div className="master-nav-item-content">
              <PlusIcon size={15} />
              <span>Onboard Tenant</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSection("analytics");
              setMobileDrawerOpen(false);
            }}
            className={`master-nav-item ${activeSection === "analytics" ? "active" : ""}`}
          >
            <div className="master-nav-item-content">
              <StorageIcon size={15} />
              <span>Infrastructure</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveSection("admins");
              setMobileDrawerOpen(false);
            }}
            className={`master-nav-item ${activeSection === "admins" ? "active" : ""}`}
          >
            <div className="master-nav-item-content">
              <Key size={15} />
              <span>Platform Access</span>
            </div>
          </button>
        </div>
      </div>

      {/* Sidebar Footer / Super Admin Profile */}
      <div className="master-sidebar-footer">
        <div className="master-user-info">
          <div className="master-user-avatar">
            {adminName
              ? adminName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()
              : "SA"}
          </div>
          <div>
            <p className="master-user-name">
              {adminName || "Super Admin"}
            </p>
            <p className="master-user-role">Master Access</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          title="Sign out of Console"
          className="master-logout-btn"
        >
          <Logout size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="master-shell">
      {/* Desktop Sidebar */}
      <aside className="master-sidebar">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileDrawerOpen && (
        <div className="master-modal-overlay" onClick={() => setMobileDrawerOpen(false)}>
          <div
            className="master-sidebar"
            style={{ position: "fixed", left: 0, top: 0, bottom: 0, zIndex: 101 }}
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Viewport */}
      <main className="master-main">
        <div className="master-content-container">
          {/* Top Header Bar */}
          <header className="master-header">
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setMobileDrawerOpen(true)}
                className="master-icon-btn"
                style={{ display: "none" }}
              >
                <MenuIcon size={16} />
              </button>
              <div>
                <h1 className="master-header-title">
                  {activeSection === "tenants"
                    ? (activeNavTab === "all"
                        ? "Companies Directory"
                        : activeNavTab === "active"
                        ? "Active Tenants"
                        : activeNavTab === "suspended"
                        ? "Suspended Companies"
                        : "Enterprise Plans")
                    : activeSection === "onboarding"
                    ? "Onboard New Tenant"
                    : activeSection === "analytics"
                    ? "Infrastructure & Storage"
                    : "Platform Security & Access"}
                </h1>
              </div>
            </div>

            <div className="master-header-actions">
              {activeSection !== "onboarding" && (
                <button
                  type="button"
                  onClick={() => {
                    setForm({ ...emptyForm });
                    setFormMode("create");
                    setActiveSection("onboarding");
                  }}
                  className="master-btn-primary"
                >
                  <PlusIcon size={14} />
                  <span>Onboard Company</span>
                </button>
              )}
            </div>
          </header>

          {errorMsg ? (
            <div className="master-empty-state">
              <h2 className="master-empty-title">{errorMsg}</h2>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "#71717a" }}>
                You do not have active master admin authorization for this platform console.
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: "/master-login" })}
                className="master-btn-primary"
              >
                Return to Master Login
              </button>
            </div>
          ) : (
            <>
              {/* SECTION 1: TENANTS DIRECTORY */}
              {activeSection === "tenants" && (
                <>
                  {/* Minimal Stat Boxes */}
                  <div className="master-stats-grid">
                    {[
                      {
                        label: "Total Companies",
                        value: stats?.companies ?? companies.length,
                      },
                      {
                        label: "Total Employees",
                        value: stats?.employees ?? "—",
                      },
                      {
                        label: "Active Tenants",
                        value: stats?.activeCompanies ?? "—",
                      },
                      {
                        label: "Suspended",
                        value: stats?.suspendedCompanies ?? "—",
                      },
                      {
                        label: "Storage Used",
                        value: stats
                          ? `${formatBytes(stats.totalUsedBytes)} / ${formatBytes(stats.totalQuotaBytes)}`
                          : "—",
                      },
                    ].map((s) => (
                      <div key={s.label} className="master-stat-box">
                        <span className="master-stat-box-label">{s.label}</span>
                        <p className="master-stat-box-value">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Sub-tabs */}
                  <div className="master-sub-tabs">
                    <button
                      type="button"
                      onClick={() => setActiveNavTab("all")}
                      className={`master-sub-tab ${activeNavTab === "all" ? "active" : ""}`}
                    >
                      All Companies ({companies.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveNavTab("active")}
                      className={`master-sub-tab ${activeNavTab === "active" ? "active" : ""}`}
                    >
                      Active ({stats?.activeCompanies ?? companies.filter((c) => c.status === "active").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveNavTab("suspended")}
                      className={`master-sub-tab ${activeNavTab === "suspended" ? "active" : ""}`}
                    >
                      Suspended ({stats?.suspendedCompanies ?? companies.filter((c) => c.status === "suspended").length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveNavTab("enterprise")}
                      className={`master-sub-tab ${activeNavTab === "enterprise" ? "active" : ""}`}
                    >
                      Enterprise ({companies.filter((c) => c.plan.toLowerCase() === "enterprise").length})
                    </button>
                  </div>

                  {/* Table Card */}
                  <div className="master-table-card">
                    <div className="master-toolbar">
                      <div className="master-toolbar-controls">
                        <div className="master-search-wrap">
                          <Search size={14} className="master-search-icon" />
                          <input
                            type="text"
                            placeholder="Search companies..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="master-search-input"
                          />
                        </div>

                        <select
                          value={planFilter}
                          onChange={(e) => setPlanFilter(e.target.value)}
                          className="master-select"
                        >
                          <option value="all">All Plans</option>
                          <option value="Starter">Starter</option>
                          <option value="Pro">Pro</option>
                          <option value="Enterprise">Enterprise</option>
                        </select>

                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="master-select"
                        >
                          <option value="all">All Status</option>
                          <option value="active">Active</option>
                          <option value="suspended">Suspended</option>
                        </select>

                        <button
                          type="button"
                          onClick={async () => {
                            const uid = await authGuard();
                            if (uid) loadDashboard(uid);
                          }}
                          disabled={loading}
                          title="Refresh data"
                          className="master-icon-btn"
                        >
                          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                        </button>
                      </div>
                    </div>

                    <div className="master-table-wrapper">
                      <table className="master-table">
                        <thead>
                          <tr>
                            <th>Company</th>
                            <th>Subdomain</th>
                            <th>Plan</th>
                            <th>Status</th>
                            <th>Seats</th>
                            <th>Storage</th>
                            <th>Onboarded</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            <tr>
                              <td colSpan={8} style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#71717a" }}>
                                <Loader2 size={20} className="animate-spin" style={{ margin: "0 auto 0.5rem auto", display: "block" }} />
                                <span>Loading companies...</span>
                              </td>
                            </tr>
                          ) : filteredCompanies.length === 0 ? (
                            <tr>
                              <td colSpan={8}>
                                <div className="master-empty-state">
                                  <Business size={24} style={{ color: "#a1a1aa" }} />
                                  <p className="master-empty-title">
                                    {searchQuery || statusFilter !== "all" || planFilter !== "all" || activeNavTab !== "all"
                                      ? "No matching companies found"
                                      : "No companies onboarded yet"}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setForm({ ...emptyForm });
                                      setFormMode("create");
                                      setActiveSection("onboarding");
                                    }}
                                    className="master-btn-primary"
                                  >
                                    <PlusIcon size={14} />
                                    <span>Onboard Company</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            filteredCompanies.map((c) => {
                              return (
                                <tr key={c.id}>
                                  <td>
                                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                      {c.logo_url ? (
                                        <img
                                          src={c.logo_url}
                                          alt={c.name}
                                          style={{ width: 22, height: 22, objectFit: "contain", borderRadius: 3, border: "1px solid #e4e4e7" }}
                                        />
                                      ) : (
                                        <div style={{ width: 22, height: 22, borderRadius: 3, background: "#f4f4f5", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #e4e4e7" }}>
                                          <Business size={12} color="#71717a" />
                                        </div>
                                      )}
                                      <div>
                                        <span style={{ fontWeight: 600, color: "#09090b", display: "block" }}>{c.name}</span>
                                        <span style={{ fontSize: "0.6875rem", color: "#71717a" }}>{c.short_name || "—"}</span>
                                      </div>
                                    </div>
                                  </td>
                                  <td>
                                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "#52525b" }}>
                                      {c.tenant_domain ? (c.tenant_domain.includes(".") ? c.tenant_domain : `${c.tenant_domain}.teamstuff.com`) : "default"}
                                    </span>
                                  </td>
                                  <td>
                                    <span className="master-badge-plan">{c.plan}</span>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      onClick={() => toggleStatus(c)}
                                      title="Toggle status"
                                      style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
                                    >
                                      {c.status === "active" ? (
                                        <span className="master-badge-active">Active</span>
                                      ) : (
                                        <span className="master-badge-suspended">Suspended</span>
                                      )}
                                    </button>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      onClick={() => openCompanyEmployees(c)}
                                      style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "#27272a", fontSize: "0.8125rem", display: "flex", alignItems: "center", gap: "4px" }}
                                    >
                                      <span>{c.employeeCount} / {c.seat_limit}</span>
                                      <Group size={12} color="#71717a" />
                                    </button>
                                  </td>
                                  <td>
                                    <span style={{ fontSize: "0.75rem", color: "#27272a" }}>
                                      {formatBytes(c.usedBytes)} / {c.storage_quota_gb} GB
                                    </span>
                                  </td>
                                  <td>
                                    <span style={{ fontSize: "0.75rem", color: "#71717a" }}>
                                      {c.created_at ? new Date(c.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                                    </span>
                                  </td>
                                  <td>
                                    <div className="master-action-row">
                                      <button
                                        type="button"
                                        onClick={() => handleImpersonate(c)}
                                        title="Enter Workspace"
                                        className="master-row-btn"
                                      >
                                        <ExternalLink size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openCompanyEmployees(c)}
                                        title="View members"
                                        className="master-row-btn"
                                      >
                                        <Group size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openAddUser(c)}
                                        title="Add employee"
                                        className="master-row-btn"
                                      >
                                        <PersonAdd size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => openEdit(c)}
                                        title="Edit settings"
                                        className="master-row-btn"
                                      >
                                        <Edit size={13} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setDeleteTarget(c)}
                                        title="Delete company"
                                        className="master-row-btn danger"
                                      >
                                        <Delete size={13} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* SECTION 2: ONBOARD TENANT */}
              {activeSection === "onboarding" && (
                <div className="master-form-card">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e4e4e7", paddingBottom: "0.75rem" }}>
                    <h2 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600 }}>Company Onboarding</h2>
                    <button type="button" onClick={() => setActiveSection("tenants")} className="master-btn-secondary">
                      Back to Directory
                    </button>
                  </div>

                  <div className="master-form-grid">
                    <div className="master-field">
                      <label className="master-label">Company Full Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. Acme Corporation"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        className="master-input"
                        required
                      />
                    </div>

                    <div className="master-field">
                      <label className="master-label">Short Name / Code *</label>
                      <input
                        type="text"
                        placeholder="e.g. Acme"
                        value={form.shortName}
                        onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
                        className="master-input"
                        required
                      />
                      <span className="master-field-hint">Displayed in employee sidebar and navigation</span>
                    </div>

                    <div className="master-field">
                      <label className="master-label">Tenant Subdomain Slug</label>
                      <input
                        type="text"
                        placeholder="acme"
                        value={form.tenantDomain}
                        onChange={(e) => setForm((f) => ({ ...f, tenantDomain: e.target.value.toLowerCase().replace(/[^a-z0-9-.]/g, "") }))}
                        className="master-input"
                      />
                      <span className="master-field-hint">{form.tenantDomain ? `${form.tenantDomain}.teamstuff.com` : "Default domain fallback"}</span>
                    </div>

                    <div className="master-field">
                      <label className="master-label">Login Tagline</label>
                      <input
                        type="text"
                        placeholder="Welcome to Acme Intranet"
                        value={form.brandTagline}
                        onChange={(e) => setForm((f) => ({ ...f, brandTagline: e.target.value }))}
                        className="master-input"
                      />
                    </div>

                    <div className="master-field">
                      <label className="master-label">Subscription Plan</label>
                      <select
                        value={form.plan}
                        onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                        className="master-select"
                        style={{ height: "36px" }}
                      >
                        <option value="Starter">Starter</option>
                        <option value="Pro">Pro</option>
                        <option value="Enterprise">Enterprise</option>
                      </select>
                    </div>

                    <div className="master-field">
                      <label className="master-label">Seat Limit</label>
                      <input
                        type="number"
                        value={form.seatLimit}
                        onChange={(e) => setForm((f) => ({ ...f, seatLimit: Number(e.target.value) }))}
                        className="master-input"
                        min={1}
                      />
                    </div>

                    <div className="master-field">
                      <label className="master-label">Storage Quota (GB/User)</label>
                      <input
                        type="number"
                        value={form.storageQuotaGb}
                        onChange={(e) => setForm((f) => ({ ...f, storageQuotaGb: Number(e.target.value) }))}
                        className="master-input"
                        min={1}
                      />
                    </div>

                    <div className="master-field">
                      <label className="master-label">Initial Admin Email</label>
                      <input
                        type="email"
                        placeholder="admin@company.com"
                        value={form.adminEmail}
                        onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                        className="master-input"
                      />
                    </div>

                    <div className="master-field">
                      <label className="master-label">Initial Admin Name</label>
                      <input
                        type="text"
                        placeholder="Jane Doe"
                        value={form.adminName}
                        onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                        className="master-input"
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="master-btn-primary"
                    >
                      {saving ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Onboarding...</span>
                        </>
                      ) : (
                        <span>Onboard Company</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSection("tenants")}
                      className="master-btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* SECTION 3: INFRASTRUCTURE & METRICS */}
              {activeSection === "analytics" && (
                <div className="master-stats-grid">
                  <div className="master-stat-box">
                    <span className="master-stat-box-label">Total Registered Companies</span>
                    <p className="master-stat-box-value">{stats?.companies ?? companies.length}</p>
                  </div>
                  <div className="master-stat-box">
                     <span className="master-stat-box-label">Total Employee Profiles</span>
                     <p className="master-stat-box-value">{stats?.employees ?? 0}</p>
                  </div>
                  <div className="master-stat-box">
                    <span className="master-stat-box-label">Active Workspaces</span>
                    <p className="master-stat-box-value">{stats?.activeCompanies ?? 0}</p>
                  </div>
                  <div className="master-stat-box">
                    <span className="master-stat-box-label">Suspended Workspaces</span>
                    <p className="master-stat-box-value">{stats?.suspendedCompanies ?? 0}</p>
                  </div>
                  <div className="master-stat-box">
                    <span className="master-stat-box-label">Cloudflare R2 Storage Used</span>
                    <p className="master-stat-box-value">{stats ? formatBytes(stats.totalUsedBytes) : "0 B"}</p>
                  </div>
                  <div className="master-stat-box">
                    <span className="master-stat-box-label">Total Storage Allocation</span>
                    <p className="master-stat-box-value">{stats ? formatBytes(stats.totalQuotaBytes) : "0 B"}</p>
                  </div>
                </div>
              )}

              {/* SECTION 4: PLATFORM SECURITY & ACCESS */}
              {activeSection === "admins" && (
                <div className="master-form-card" style={{ maxWidth: "560px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                    <div className="master-user-avatar" style={{ width: "36px", height: "36px", fontSize: "0.875rem" }}>
                      {adminName ? adminName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() : "SA"}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 600 }}>{adminName || "Super Admin"}</h3>
                      <p style={{ margin: "2px 0 0 0", fontSize: "0.75rem", color: "#71717a" }}>Platform Owner &bull; Root Privileges</p>
                    </div>
                  </div>

                  <div className="master-field">
                    <label className="master-label">Security & Authentication</label>
                    <p style={{ margin: 0, fontSize: "0.8125rem", color: "#27272a" }}>PBKDF2-SHA256 authenticated session active.</p>
                  </div>

                  <div style={{ marginTop: "1rem" }}>
                    <button type="button" onClick={handleLogout} className="master-btn-danger">
                      <Logout size={13} />
                      <span>Sign out of Console</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Onboard / Edit Company Dialog */}
      <Dialog.Root open={formOpen} onOpenChange={(v) => !v && setFormOpen(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="master-modal-overlay" />
          <Dialog.Content className="master-modal-content">
            <div className="master-modal-header">
              <Dialog.Title className="master-modal-title">
                {formMode === "create" ? "Onboard New Company" : `Edit Company · ${form.name}`}
              </Dialog.Title>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="master-icon-btn"
                style={{ width: 24, height: 24 }}
              >
                <ClearIcon size={14} />
              </button>
            </div>
            <Dialog.Description style={{ display: "none" }}>Company configuration</Dialog.Description>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div className="master-field">
                <label className="master-label">Company Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corporation"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="master-input"
                />
              </div>

              <div className="master-field">
                <label className="master-label">Short Name / Code</label>
                <input
                  type="text"
                  placeholder="e.g. Acme"
                  value={form.shortName}
                  onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
                  className="master-input"
                />
              </div>

              {/* Hidden file inputs */}
              <input
                type="file"
                ref={heroFileInputRef}
                style={{ display: "none" }}
                accept="image/png,image/jpeg,image/webp,image/jpg"
                onChange={handleHeroFileChange}
              />
              <input
                type="file"
                ref={logoFileInputRef}
                style={{ display: "none" }}
                accept="image/png,image/svg+xml,image/jpeg,image/webp,image/jpg"
                onChange={handleLogoFileChange}
              />
              <input
                type="file"
                ref={faviconFileInputRef}
                style={{ display: "none" }}
                accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/jpeg,image/webp,image/jpg"
                onChange={handleFaviconFileChange}
              />

              <div className="master-field">
                <label className="master-label">Tenant Subdomain Slug</label>
                <input
                  type="text"
                  placeholder="acme"
                  value={form.tenantDomain}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      tenantDomain: e.target.value.toLowerCase().replace(/[^a-z0-9-.]/g, ""),
                    }))
                  }
                  className="master-input"
                />
              </div>

              <div className="master-field">
                <label className="master-label">Company Logo</label>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={form.logoUrl}
                    onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                    className="master-input"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    disabled={uploadingLogo}
                    onClick={() => logoFileInputRef.current?.click()}
                    className="master-btn-secondary"
                  >
                    {uploadingLogo ? <Loader2 size={12} className="animate-spin" /> : <UploadIcon size={12} />}
                    <span>Upload</span>
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div className="master-field">
                  <label className="master-label">Plan</label>
                  <select
                    value={form.plan}
                    onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                    className="master-select"
                  >
                    <option value="Starter">Starter</option>
                    <option value="Pro">Pro</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </div>
                <div className="master-field">
                  <label className="master-label">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="master-select"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div className="master-field">
                  <label className="master-label">Seat Limit</label>
                  <input
                    type="number"
                    value={form.seatLimit}
                    onChange={(e) => setForm((f) => ({ ...f, seatLimit: Number(e.target.value) }))}
                    className="master-input"
                  />
                </div>
                <div className="master-field">
                  <label className="master-label">Storage (GB/User)</label>
                  <input
                    type="number"
                    value={form.storageQuotaGb}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, storageQuotaGb: Number(e.target.value) }))
                    }
                    className="master-input"
                  />
                </div>
              </div>
            </div>

            <div className="master-modal-actions">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="master-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="master-btn-primary"
              >
                {saving ? "Saving..." : formMode === "create" ? "Onboard" : "Save Changes"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add User Dialog */}
      <Dialog.Root open={userDialogOpen} onOpenChange={(v) => !v && setUserDialogOpen(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="master-modal-overlay" />
          <Dialog.Content className="master-modal-content">
            <div className="master-modal-header">
              <Dialog.Title className="master-modal-title">
                Add User · {userForm.companyName}
              </Dialog.Title>
              <button
                type="button"
                onClick={() => setUserDialogOpen(false)}
                className="master-icon-btn"
                style={{ width: 24, height: 24 }}
              >
                <ClearIcon size={14} />
              </button>
            </div>
            <Dialog.Description style={{ display: "none" }}>Add a new user</Dialog.Description>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div className="master-field">
                <label className="master-label">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={userForm.name}
                  onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
                  className="master-input"
                />
              </div>

              <div className="master-field">
                <label className="master-label">Email Address</label>
                <input
                  type="email"
                  placeholder="user@company.com"
                  value={userForm.email}
                  onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
                  className="master-input"
                />
              </div>

              <div className="master-field">
                <label className="master-label">Role</label>
                <select
                  value={userForm.role}
                  onChange={(e) =>
                    setUserForm((f) => ({
                      ...f,
                      role: e.target.value as "admin" | "hr" | "employee",
                    }))
                  }
                  className="master-select"
                >
                  <option value="admin">Admin</option>
                  <option value="hr">HR</option>
                  <option value="employee">Employee</option>
                </select>
              </div>

              <div className="master-field">
                <label className="master-label">Job Title</label>
                <input
                  type="text"
                  placeholder="e.g. Software Engineer"
                  value={userForm.jobTitle}
                  onChange={(e) => setUserForm((f) => ({ ...f, jobTitle: e.target.value }))}
                  className="master-input"
                />
              </div>
            </div>

            <div className="master-modal-actions">
              <button
                type="button"
                onClick={() => setUserDialogOpen(false)}
                className="master-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddUser}
                disabled={savingUser}
                className="master-btn-primary"
              >
                {savingUser ? "Creating..." : "Create User"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Company Employees Directory Dialog */}
      <Dialog.Root
        open={Boolean(selectedCompanyForEmployees)}
        onOpenChange={(v) => {
          if (!v && !employeeActionLoading && !deletingEmployee) {
            setSelectedCompanyForEmployees(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="master-modal-overlay" />
          <Dialog.Content className="master-modal-content" style={{ maxWidth: "680px" }}>
            <div className="master-modal-header">
              <div>
                <Dialog.Title className="master-modal-title">
                  Members · {selectedCompanyForEmployees?.name}
                </Dialog.Title>
                <span style={{ fontSize: "0.6875rem", color: "#71717a" }}>
                  {employeesList.length} of {selectedCompanyForEmployees?.seat_limit} Seats Used
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.375rem" }}>
                {selectedCompanyForEmployees && (
                  <button
                    type="button"
                    onClick={() => openAddUser(selectedCompanyForEmployees)}
                    className="master-btn-primary"
                    style={{ height: 28, fontSize: "0.75rem" }}
                  >
                    <PersonAdd size={12} />
                    <span>Add User</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCompanyForEmployees(null)}
                  className="master-icon-btn"
                  style={{ width: 28, height: 28 }}
                >
                  <ClearIcon size={14} />
                </button>
              </div>
            </div>
            <Dialog.Description style={{ display: "none" }}>Employees list</Dialog.Description>

            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                type="text"
                placeholder="Search employees..."
                value={employeeSearchQuery}
                onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                className="master-input"
                style={{ flex: 1 }}
              />
              <select
                value={employeeRoleFilter}
                onChange={(e) => setEmployeeRoleFilter(e.target.value)}
                className="master-select"
              >
                <option value="all">All Roles</option>
                <option value="admin">Admins</option>
                <option value="hr">HR</option>
                <option value="employee">Employees</option>
              </select>
            </div>

            <div className="master-table-wrapper" style={{ maxHeight: "360px", overflowY: "auto" }}>
              <table className="master-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Designation</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingEmployees ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", padding: "1.5rem" }}>
                        <Loader2 size={16} className="animate-spin" />
                      </td>
                    </tr>
                  ) : employeesList.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", padding: "1.5rem", color: "#71717a" }}>
                        No employees found.
                      </td>
                    </tr>
                  ) : (
                    employeesList
                      .filter((emp) => {
                        const q = employeeSearchQuery.trim().toLowerCase();
                        const matchesSearch =
                          !q ||
                          emp.name.toLowerCase().includes(q) ||
                          emp.email.toLowerCase().includes(q) ||
                          (emp.job_title && emp.job_title.toLowerCase().includes(q));
                        const matchesRole =
                          employeeRoleFilter === "all" ||
                          emp.role.toLowerCase() === employeeRoleFilter.toLowerCase();
                        return matchesSearch && matchesRole;
                      })
                      .map((emp) => (
                        <tr key={emp.id}>
                          <td>
                            <div style={{ fontWeight: 600, color: "#09090b" }}>{emp.name}</div>
                            <div style={{ fontSize: "0.6875rem", color: "#71717a" }}>{emp.email}</div>
                          </td>
                          <td>
                            <span className="master-badge-plan">{emp.role}</span>
                          </td>
                          <td>
                            <span style={{ fontSize: "0.75rem", color: "#52525b" }}>{emp.job_title || "—"}</span>
                          </td>
                          <td>
                            <div className="master-action-row">
                              <button
                                type="button"
                                title="Reset Password"
                                onClick={() => handleResetEmployeePassword(emp)}
                                disabled={employeeActionLoading === emp.id}
                                className="master-row-btn"
                              >
                                {employeeActionLoading === emp.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Key size={12} />
                                )}
                              </button>
                              <button
                                type="button"
                                title="Remove employee"
                                onClick={() => setDeleteEmployeeTarget(emp)}
                                className="master-row-btn danger"
                              >
                                <Delete size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="master-modal-actions">
              <button
                type="button"
                onClick={() => setSelectedCompanyForEmployees(null)}
                className="master-btn-secondary"
              >
                Close
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Employee Confirmation Dialog */}
      <Dialog.Root open={Boolean(deleteEmployeeTarget)} onOpenChange={(v) => !v && setDeleteEmployeeTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="master-modal-overlay" />
          <Dialog.Content className="master-modal-content">
            <div className="master-modal-header">
              <Dialog.Title className="master-modal-title">
                Remove {deleteEmployeeTarget?.name}?
              </Dialog.Title>
            </div>
            <Dialog.Description style={{ margin: 0, fontSize: "0.8125rem", color: "#71717a" }}>
              This will remove <b>{deleteEmployeeTarget?.name}</b> ({deleteEmployeeTarget?.email}) from {selectedCompanyForEmployees?.name}.
            </Dialog.Description>
            <div className="master-modal-actions">
              <button
                type="button"
                onClick={() => setDeleteEmployeeTarget(null)}
                className="master-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteEmployee}
                disabled={deletingEmployee}
                className="master-btn-danger"
              >
                {deletingEmployee ? "Removing..." : "Remove Employee"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Credentials Generated Dialog */}
      <Dialog.Root open={Boolean(newCredentials)} onOpenChange={(v) => !v && setNewCredentials(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="master-modal-overlay" />
          <Dialog.Content className="master-modal-content">
            <div className="master-modal-header">
              <Dialog.Title className="master-modal-title">
                Credentials Generated
              </Dialog.Title>
            </div>
            <Dialog.Description style={{ margin: 0, fontSize: "0.8125rem", color: "#71717a" }}>
              Login credentials were automatically dispatched to {newCredentials?.email}.
            </Dialog.Description>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {[
                { label: "Email", value: newCredentials?.email || "" },
                { label: "Temporary Password", value: newCredentials?.password || "" },
              ].map((row) => (
                <div
                  key={row.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.625rem",
                    border: "1px solid #e4e4e7",
                    borderRadius: 4,
                    backgroundColor: "#fbfbfb",
                  }}
                >
                  <div>
                    <span style={{ fontSize: "0.6875rem", color: "#71717a", textTransform: "uppercase", display: "block" }}>
                      {row.label}
                    </span>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#09090b", fontFamily: "var(--font-mono)" }}>
                      {row.value}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(row.value);
                      setToast({ open: true, message: `${row.label} copied`, severity: "success" });
                    }}
                    className="master-icon-btn"
                  >
                    <ContentCopy size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="master-modal-actions">
              <button
                type="button"
                onClick={() => setNewCredentials(null)}
                className="master-btn-primary"
              >
                Done
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Delete Company Confirmation Dialog */}
      <Dialog.Root open={Boolean(deleteTarget)} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="master-modal-overlay" />
          <Dialog.Content className="master-modal-content">
            <div className="master-modal-header">
              <Dialog.Title className="master-modal-title">
                Delete {deleteTarget?.name}?
              </Dialog.Title>
            </div>
            <Dialog.Description style={{ margin: 0, fontSize: "0.8125rem", color: "#71717a" }}>
              This permanently removes the company and all {deleteTarget?.employeeCount} associated employee profile(s).
            </Dialog.Description>
            <div className="master-modal-actions">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="master-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="master-btn-danger"
              >
                {deleting ? "Deleting..." : "Delete Company"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Toast Notification */}
      {toast.open && (
        <div className={`master-login-toast ${toast.severity}`}>
          <span>{toast.message}</span>
          <button
            type="button"
            className="master-login-toast-close"
            onClick={() => setToast((t) => ({ ...t, open: false }))}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
