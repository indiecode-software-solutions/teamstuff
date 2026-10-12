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
      <div >
        <Loader2 size={24}  />
      </div>
    );
  }

  // Sidebar content component
  const sidebarContent = (
    <div >
      {/* Sidebar Header */}
      <div >
        <div>
          <div >
            <span >
              SaaS Console
            </span>
            <span >
              Master
            </span>
          </div>
          <p >
            Infrastructure & Tenants
          </p>
        </div>
      </div>

      {/* Navigation Groups */}
      <div >
        <span >
          Management
        </span>

        <button
          type="button"
          onClick={() => {
            setActiveNavTab("all");
            setMobileDrawerOpen(false);
          }}
          className={`${ activeNavTab === "all" ? "" : "" }`}
        >
          <div >
            <Business size={16} />
            <span>All Companies</span>
          </div>
          <span >
            {stats?.companies ?? companies.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveNavTab("active");
            setMobileDrawerOpen(false);
          }}
          className={`${ activeNavTab === "active" ? "" : "" }`}
        >
          <div >
            <CircleCheck size={16} />
            <span>Active Tenants</span>
          </div>
          {stats && (
            <span >
              {stats.activeCompanies}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveNavTab("suspended");
            setMobileDrawerOpen(false);
          }}
          className={`${ activeNavTab === "suspended" ? "" : "" }`}
        >
          <div >
            <CircleAlert size={16} />
            <span>Suspended</span>
          </div>
          {stats && (
            <span >
              {stats.suspendedCompanies}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveNavTab("enterprise");
            setMobileDrawerOpen(false);
          }}
          className={`${ activeNavTab === "enterprise" ? "" : "" }`}
        >
          <div >
            <Layers size={16} />
            <span>Enterprise Plan</span>
          </div>
        </button>
      </div>

      {/* Sidebar Footer / Super Admin Profile */}
      <div >
        <div >
          <div >
            {adminName
              ? adminName
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()
              : "SA"}
          </div>
          <div >
            <p >
              {adminName || "Super Admin"}
            </p>
            <p >Master Access</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          title="Sign out of Console"
          
        >
          <Logout size={16} />
        </button>
      </div>
    </div>
  );

  return (
    <div >
      {/* Desktop Sidebar */}
      <aside >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileDrawerOpen && (
        <div >
          <div
            
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div >
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Viewport */}
      <main >
        {/* Top Header Bar */}
        <header >
          <div >
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              
            >
              <MenuIcon size={20} />
            </button>
            <div>
              <h1 >
                {activeNavTab === "all"
                  ? "Companies Directory"
                  : activeNavTab === "active"
                  ? "Active Tenants"
                  : activeNavTab === "suspended"
                  ? "Suspended Companies"
                  : "Enterprise Plans"}
              </h1>
              <p >
                {filteredCompanies.length} tenant{filteredCompanies.length === 1 ? "" : "s"} listed in current view
              </p>
            </div>
          </div>

          <div >
            <button
              type="button"
              onClick={openCreate}
              
            >
              <PlusIcon size={15} />
              <span>Onboard Company</span>
            </button>
          </div>
        </header>

        {errorMsg ? (
          <div >
            <h2 >{errorMsg}</h2>
            <p >
              You do not have active master admin authorization for this platform console.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/master-login" })}
              
            >
              Return to Master Login
            </button>
          </div>
        ) : (
          <div >
            {/* Stats bar */}
            <div >
              {[
                {
                  label: "Total Companies",
                  value: stats?.companies ?? "—",
                  icon: <Business size={17} />,
                },
                {
                  label: "Total Employees",
                  value: stats?.employees ?? "—",
                  icon: <Group size={17} />,
                },
                {
                  label: "Active Tenants",
                  value: stats?.activeCompanies ?? "—",
                  icon: <CircleCheck size={17} />,
                },
                {
                  label: "Suspended",
                  value: stats?.suspendedCompanies ?? "—",
                  icon: <CircleAlert size={17} />,
                },
                {
                  label: "Storage Used",
                  value: stats
                    ? `${formatBytes(stats.totalUsedBytes)} / ${formatBytes(stats.totalQuotaBytes)}`
                    : "—",
                  icon: <StorageIcon size={17} />,
                },
              ].map((s) => (
                <div
                  key={s.label}
                  
                >
                  <div >
                    <span >
                      {s.label}
                    </span>
                    <div >
                      {s.icon}
                    </div>
                  </div>
                  <p >
                    {s.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Companies Table Card */}
            <div >
              {/* Controls Bar */}
              <div >
                <div>
                  <div >
                    <h3 >
                      Tenant Accounts
                    </h3>
                    <span >
                      {filteredCompanies.length} result{filteredCompanies.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p >
                    Subdomain configuration, employee capacity, and workspace management.
                  </p>
                </div>

                {/* Filters */}
                <div >
                  <div >
                    <Search
                      size={15}
                      
                    />
                    <input
                      type="text"
                      placeholder="Search companies..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      
                    />
                  </div>

                  <select
                    value={planFilter}
                    onChange={(e) => setPlanFilter(e.target.value)}
                    
                  >
                    <option value="all">All Plans</option>
                    <option value="Starter">Starter</option>
                    <option value="Pro">Pro</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    
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
                    
                  >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {/* Table */}
              <div >
                <table >
                  <thead>
                    <tr >
                      <th >Company</th>
                      <th >Subdomain & Brand</th>
                      <th >Plan</th>
                      <th >Status</th>
                      <th >Seats Usage</th>
                      <th >Storage Quota</th>
                      <th >Onboarded</th>
                      <th >Actions</th>
                    </tr>
                  </thead>
                  <tbody >
                    {loading ? (
                      <tr>
                        <td colSpan={8} >
                          <Loader2 size={24}  />
                          <span>Loading companies...</span>
                        </td>
                      </tr>
                    ) : filteredCompanies.length === 0 ? (
                      <tr>
                        <td colSpan={8} >
                          <div >
                            <Business size={20} />
                          </div>
                          <p >
                            {searchQuery || statusFilter !== "all" || planFilter !== "all" || activeNavTab !== "all"
                              ? "No matching companies found"
                              : "No companies onboarded yet"}
                          </p>
                          <p >
                            {searchQuery || statusFilter !== "all" || planFilter !== "all" || activeNavTab !== "all"
                              ? "Try adjusting your search query or filters."
                              : "Click 'Onboard Company' to setup your first tenant."}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredCompanies.map((c) => {
                        const pct =
                          c.storage_quota_gb > 0
                            ? Math.min(100, (c.usedBytes / (c.storage_quota_gb * GB)) * 100)
                            : 0;
                        const seatPct =
                          c.seat_limit > 0 ? Math.min(100, (c.employeeCount / c.seat_limit) * 100) : 0;

                        return (
                          <tr
                            key={c.id}
                            
                          >
                            {/* Company Name & Logo */}
                            <td >
                              <div >
                                <div >
                                  {c.logo_url ? (
                                    <img
                                      src={c.logo_url}
                                      alt={c.name}
                                      
                                    />
                                  ) : (
                                    <Business size={16}  />
                                  )}
                                </div>
                                <div>
                                  <span >
                                    {c.name}
                                  </span>
                                  <span >
                                    {c.short_name || "—"}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Subdomain & Brand */}
                            <td >
                              <div >
                                {c.tenant_domain ? (
                                  <span >
                                    {c.tenant_domain.includes(".") ? c.tenant_domain : `${c.tenant_domain}.teamstuff.com`}
                                  </span>
                                ) : (
                                  <span >Default domain</span>
                                )}
                                {c.brand_color && (
                                  <div >
                                    <span
                                      
                                      style={{ backgroundColor: c.brand_color }}
                                    />
                                    <span >
                                      {c.brand_color}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Plan */}
                            <td >
                              <span
                                className={`rounded${ c.plan === "Enterprise" ? "" : "" }`}
                              >
                                {c.plan}
                              </span>
                            </td>

                            {/* Status */}
                            <td >
                              <button
                                type="button"
                                onClick={() => toggleStatus(c)}
                                title="Click to toggle status"
                                className={`${ c.status === "active" ? "" : "" }`}
                              >
                                {c.status === "active" ? "Active" : "Suspended"}
                              </button>
                            </td>

                            {/* Seats */}
                            <td >
                              <div
                                onClick={() => openCompanyEmployees(c)}
                                
                              >
                                <div >
                                  <span>{c.employeeCount} / {c.seat_limit}</span>
                                  <Group size={13}  />
                                </div>
                                <div >
                                  <div
                                    
                                    style={{ width: `${seatPct}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Storage */}
                            <td >
                              <div >
                                {formatBytes(c.usedBytes)}
                              </div>
                              <span >
                                Quota: {c.storage_quota_gb} GB/user
                              </span>
                              <div >
                                <div
                                  
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </td>

                            {/* Onboarded Date */}
                            <td >
                              {c.created_at
                                ? new Date(c.created_at).toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })
                                : "—"}
                            </td>

                            {/* Actions */}
                            <td >
                              <div >
                                <button
                                  type="button"
                                  onClick={() => handleImpersonate(c)}
                                  title="Enter Workspace as Company Admin"
                                  
                                >
                                  <ExternalLink size={12} />
                                  <span>Enter</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openCompanyEmployees(c)}
                                  title="View employee directory"
                                  
                                >
                                  <Group size={15} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAddUser(c)}
                                  title="Add user to company"
                                  
                                >
                                  <PersonAdd size={15} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEdit(c)}
                                  title="Edit company settings"
                                  
                                >
                                  <Edit size={15} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(c)}
                                  title="Delete company & associated users"
                                  
                                >
                                  <Delete size={15} />
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
          </div>
        )}
      </main>

      {/* Onboard / Edit Company Dialog */}
      <Dialog.Root open={formOpen} onOpenChange={(v) => !v && setFormOpen(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fade-in" />
          <Dialog.Content className="fade-in zoom-in-95">
            <div >
              <Dialog.Title >
                {formMode === "create" ? "Onboard New Company" : `Edit Company · ${form.name}`}
              </Dialog.Title>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                
              >
                <ClearIcon size={18} />
              </button>
            </div>
            <Dialog.Description >Company setup and configurations</Dialog.Description>

            <div >
              <div>
                <label >
                  Company Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corporation"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  
                />
              </div>

              <div>
                <label >
                  Short Name / Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme"
                  value={form.shortName}
                  onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
                  
                />
                <span >
                  Displayed in the employee navigation sidebar and badges.
                </span>
              </div>

              {/* Brand & Subdomain Section */}
              <div >
                <div >
                  <div >
                    <Palette size={15}  />
                    <span >
                      Subdomain & Brand Portal
                    </span>
                  </div>
                  <span >
                    {form.tenantDomain
                      ? `${form.tenantDomain.toLowerCase().replace(/[^a-z0-9-]/g, "")}.teamstuff.com`
                      : "Default Domain"}
                  </span>
                </div>

                {/* Hidden file inputs */}
                <input
                  type="file"
                  ref={heroFileInputRef}
                  
                  accept="image/png,image/jpeg,image/webp,image/jpg"
                  onChange={handleHeroFileChange}
                />
                <input
                  type="file"
                  ref={logoFileInputRef}
                  
                  accept="image/png,image/svg+xml,image/jpeg,image/webp,image/jpg"
                  onChange={handleLogoFileChange}
                />
                <input
                  type="file"
                  ref={faviconFileInputRef}
                  
                  accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/jpeg,image/webp,image/jpg"
                  onChange={handleFaviconFileChange}
                />

                <div >
                  <div>
                    <label >
                      Tenant Subdomain Slug
                    </label>
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
                      
                    />
                  </div>
                  <div>
                    <label >
                      Login Tagline
                    </label>
                    <input
                      type="text"
                      placeholder="Welcome to Acme Intranet"
                      value={form.brandTagline}
                      onChange={(e) => setForm((f) => ({ ...f, brandTagline: e.target.value }))}
                      
                    />
                  </div>
                </div>

                {/* Logo Section */}
                <div >
                  <div >
                    <span >
                      <ImageIcon size={14}  />
                      Company Logo
                    </span>
                    <button
                      type="button"
                      disabled={uploadingLogo}
                      onClick={() => logoFileInputRef.current?.click()}
                      
                    >
                      {uploadingLogo ? (
                        <Loader2 size={12}  />
                      ) : (
                        <UploadIcon size={12} />
                      )}
                      <span>{uploadingLogo ? "Uploading..." : "Upload Logo"}</span>
                    </button>
                  </div>
                  <div >
                    <input
                      type="text"
                      placeholder="https://..."
                      value={form.logoUrl}
                      onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                      
                    />
                    {form.logoUrl && (
                      <div >
                        <img
                          src={form.logoUrl}
                          alt="Logo Preview"
                          
                        />
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, logoUrl: "" }))}
                          
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Favicon Section */}
                <div >
                  <div >
                    <span >
                      <Globe size={14}  />
                      Browser Favicon
                    </span>
                    <button
                      type="button"
                      disabled={uploadingFavicon}
                      onClick={() => faviconFileInputRef.current?.click()}
                      
                    >
                      {uploadingFavicon ? (
                        <Loader2 size={12}  />
                      ) : (
                        <UploadIcon size={12} />
                      )}
                      <span>{uploadingFavicon ? "Uploading..." : "Upload Favicon"}</span>
                    </button>
                  </div>
                  <div >
                    <input
                      type="text"
                      placeholder="https://... (PNG / ICO)"
                      value={form.faviconUrl}
                      onChange={(e) => setForm((f) => ({ ...f, faviconUrl: e.target.value }))}
                      
                    />
                    {form.faviconUrl && (
                      <div >
                        <img
                          src={form.faviconUrl}
                          alt="Favicon"
                          
                        />
                        <button
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, faviconUrl: "" }))}
                          
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Login Hero Artwork Section */}
                <div >
                  <div >
                    <span >
                      <Sparkles size={14}  />
                      Login Portal Hero Artwork
                    </span>
                    <button
                      type="button"
                      disabled={uploadingHero}
                      onClick={() => heroFileInputRef.current?.click()}
                      
                    >
                      {uploadingHero ? (
                        <Loader2 size={12}  />
                      ) : (
                        <UploadIcon size={12} />
                      )}
                      <span>{uploadingHero ? "Uploading..." : "Upload Artwork"}</span>
                    </button>
                  </div>
                  <div >
                    <input
                      type="text"
                      placeholder="https://... or /login_hero.png"
                      value={form.loginHeroUrl}
                      onChange={(e) => setForm((f) => ({ ...f, loginHeroUrl: e.target.value }))}
                      
                    />
                    {form.loginHeroUrl && (
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, loginHeroUrl: "" }))}
                        
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                {/* Color Presets */}
                <div>
                  <span >
                    Tenant Brand Accent Color
                  </span>
                  <div >
                    {BRAND_COLOR_PRESETS.map((preset) => {
                      const isSelected = form.brandColor.toLowerCase() === preset.hex.toLowerCase();
                      return (
                        <button
                          key={preset.hex}
                          type="button"
                          title={preset.name}
                          onClick={() => setForm((f) => ({ ...f, brandColor: preset.hex }))}
                          className={`${ isSelected ? "" : "" }`}
                          style={{ backgroundColor: preset.hex }}
                        />
                      );
                    })}
                    <input
                      type="color"
                      value={form.brandColor}
                      onChange={(e) => setForm((f) => ({ ...f, brandColor: e.target.value }))}
                      
                    />
                    <input
                      type="text"
                      value={form.brandColor}
                      onChange={(e) => setForm((f) => ({ ...f, brandColor: e.target.value }))}
                      
                    />
                  </div>
                </div>
              </div>

              <div >
                <div>
                  <label >
                    Plan
                  </label>
                  <select
                    value={form.plan}
                    onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                    
                  >
                    <option value="Starter">Starter</option>
                    <option value="Pro">Pro</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <label >
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div >
                <div>
                  <label >
                    Seat Limit
                  </label>
                  <input
                    type="number"
                    value={form.seatLimit}
                    onChange={(e) => setForm((f) => ({ ...f, seatLimit: Number(e.target.value) }))}
                    
                  />
                </div>
                <div>
                  <label >
                    Storage Quota (GB/User)
                  </label>
                  <input
                    type="number"
                    value={form.storageQuotaGb}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, storageQuotaGb: Number(e.target.value) }))
                    }
                    
                  />
                </div>
              </div>

              {formMode === "create" && (
                <div >
                  <span >
                    Initial Company Admin (Auto-creates credentials)
                  </span>
                  <div >
                    <div>
                      <label >
                        Admin Email
                      </label>
                      <input
                        type="email"
                        value={form.adminEmail}
                        onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                        
                      />
                    </div>
                    <div>
                      <label >
                        Admin Name
                      </label>
                      <input
                        type="text"
                        value={form.adminName}
                        onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
                        
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div >
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                
              >
                {saving ? (
                  <>
                    <Loader2 size={13}  />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{formMode === "create" ? "Onboard Company" : "Save Changes"}</span>
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Add User Dialog */}
      <Dialog.Root open={userDialogOpen} onOpenChange={(v) => !v && setUserDialogOpen(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fade-in" />
          <Dialog.Content className="fade-in zoom-in-95">
            <div >
              <Dialog.Title >
                Add User · {userForm.companyName}
              </Dialog.Title>
              <button
                type="button"
                onClick={() => setUserDialogOpen(false)}
                
              >
                <ClearIcon size={16} />
              </button>
            </div>
            <Dialog.Description >Add a new user</Dialog.Description>

            <div >
              <div>
                <label >
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={userForm.name}
                  onChange={(e) => setUserForm((f) => ({ ...f, name: e.target.value }))}
                  
                />
              </div>

              <div>
                <label >
                  Email Address
                </label>
                <input
                  type="email"
                  placeholder="user@company.com"
                  value={userForm.email}
                  onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
                  
                />
              </div>

              <div>
                <label >
                  Role
                </label>
                <select
                  value={userForm.role}
                  onChange={(e) =>
                    setUserForm((f) => ({
                      ...f,
                      role: e.target.value as "admin" | "hr" | "employee",
                    }))
                  }
                  
                >
                  <option value="admin">Admin</option>
                  <option value="hr">HR</option>
                  <option value="employee">Employee</option>
                </select>
              </div>

              <div>
                <label >
                  Job Title (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lead Engineer"
                  value={userForm.jobTitle}
                  onChange={(e) => setUserForm((f) => ({ ...f, jobTitle: e.target.value }))}
                  
                />
              </div>

              <p >
                A temporary password will be generated and credentials will be sent to the email.
              </p>
            </div>

            <div >
              <button
                type="button"
                onClick={() => setUserDialogOpen(false)}
                
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddUser}
                disabled={savingUser}
                
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
          <Dialog.Overlay className="fade-in" />
          <Dialog.Content className="fade-in zoom-in-95">
            {/* Header */}
            <div >
              <div >
                <div >
                  <Group size={17} />
                </div>
                <div>
                  <Dialog.Title >
                    Employees · {selectedCompanyForEmployees?.name}
                  </Dialog.Title>
                  <p >
                    {selectedCompanyForEmployees?.short_name || "Tenant"} • {employeesList.length} of{" "}
                    {selectedCompanyForEmployees?.seat_limit} Seats Used
                  </p>
                </div>
              </div>
              <div >
                {selectedCompanyForEmployees && (
                  <button
                    type="button"
                    onClick={() => openAddUser(selectedCompanyForEmployees)}
                    
                  >
                    <PersonAdd size={13} />
                    <span>Add User</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedCompanyForEmployees(null)}
                  
                >
                  <ClearIcon size={16} />
                </button>
              </div>
            </div>
            <Dialog.Description >Company employees directory</Dialog.Description>

            {/* Filter and Search */}
            <div >
              <div >
                <Search size={14}  />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={employeeSearchQuery}
                  onChange={(e) => setEmployeeSearchQuery(e.target.value)}
                  
                />
              </div>
              <select
                value={employeeRoleFilter}
                onChange={(e) => setEmployeeRoleFilter(e.target.value)}
                
              >
                <option value="all">All Roles ({employeesList.length})</option>
                <option value="admin">Admins ({employeesList.filter((e) => e.role === "admin").length})</option>
                <option value="hr">HR Managers ({employeesList.filter((e) => e.role === "hr").length})</option>
                <option value="employee">Employees ({employeesList.filter((e) => e.role === "employee").length})</option>
              </select>
              <button
                type="button"
                onClick={() => selectedCompanyForEmployees && openCompanyEmployees(selectedCompanyForEmployees)}
                disabled={loadingEmployees}
                
              >
                <RefreshCw size={14} className={loadingEmployees ? "animate-spin" : ""} />
              </button>
            </div>

            {/* Table Content */}
            <div >
              {loadingEmployees ? (
                <div >
                  <Loader2 size={22}  />
                  <span >Loading employees...</span>
                </div>
              ) : employeesList.filter((emp) => {
                  const q = employeeSearchQuery.trim().toLowerCase();
                  const matchesSearch =
                    !q ||
                    emp.name.toLowerCase().includes(q) ||
                    emp.email.toLowerCase().includes(q) ||
                    (emp.department && emp.department.toLowerCase().includes(q)) ||
                    (emp.job_title && emp.job_title.toLowerCase().includes(q));
                  const matchesRole =
                    employeeRoleFilter === "all" ||
                    emp.role.toLowerCase() === employeeRoleFilter.toLowerCase();
                  return matchesSearch && matchesRole;
                }).length === 0 ? (
                <div >
                  <p >No employees found</p>
                </div>
              ) : (
                <table >
                  <thead>
                    <tr >
                      <th >Employee</th>
                      <th >Role</th>
                      <th >Designation</th>
                      <th >Joined</th>
                      <th >Actions</th>
                    </tr>
                  </thead>
                  <tbody >
                    {employeesList
                      .filter((emp) => {
                        const q = employeeSearchQuery.trim().toLowerCase();
                        const matchesSearch =
                          !q ||
                          emp.name.toLowerCase().includes(q) ||
                          emp.email.toLowerCase().includes(q) ||
                          (emp.department && emp.department.toLowerCase().includes(q)) ||
                          (emp.job_title && emp.job_title.toLowerCase().includes(q));
                        const matchesRole =
                          employeeRoleFilter === "all" ||
                          emp.role.toLowerCase() === employeeRoleFilter.toLowerCase();
                        return matchesSearch && matchesRole;
                      })
                      .map((emp) => (
                        <tr key={emp.id} >
                          <td >
                            <div >
                              <div >
                                {emp.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .slice(0, 2)
                                  .join("")
                                  .toUpperCase()}
                              </div>
                              <div>
                                <span >
                                  {emp.name}
                                </span>
                                <span >{emp.email}</span>
                              </div>
                            </div>
                          </td>
                          <td >
                            <span
                              className={`rounded${ emp.role === "admin" ? "" : "" }`}
                            >
                              {emp.role === "admin" ? "Admin" : emp.role === "hr" ? "HR" : "Employee"}
                            </span>
                          </td>
                          <td >
                            <span >
                              {emp.job_title || "—"}
                            </span>
                            <span >{emp.department || "General"}</span>
                          </td>
                          <td >
                            {emp.date_of_joining
                              ? new Date(emp.date_of_joining).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "—"}
                          </td>
                          <td >
                            <div >
                              <button
                                type="button"
                                title="Reset & Email Temporary Password"
                                onClick={() => handleResetEmployeePassword(emp)}
                                disabled={employeeActionLoading === emp.id}
                                
                              >
                                {employeeActionLoading === emp.id ? (
                                  <Loader2 size={13}  />
                                ) : (
                                  <Key size={14} />
                                )}
                              </button>
                              <button
                                type="button"
                                title="Remove employee"
                                onClick={() => setDeleteEmployeeTarget(emp)}
                                
                              >
                                <Delete size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div >
              <span>{employeesList.length} total members</span>
              <button
                type="button"
                onClick={() => setSelectedCompanyForEmployees(null)}
                
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
          <Dialog.Overlay className="fade-in" />
          <Dialog.Content className="fade-in zoom-in-95">
            <div >
              <Delete size={18} />
            </div>
            <Dialog.Title >
              Remove {deleteEmployeeTarget?.name}?
            </Dialog.Title>
            <Dialog.Description >
              This will permanently remove <b>{deleteEmployeeTarget?.name}</b> ({deleteEmployeeTarget?.email}) from {selectedCompanyForEmployees?.name}.
            </Dialog.Description>
            <div >
              <button
                type="button"
                onClick={() => setDeleteEmployeeTarget(null)}
                
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteEmployee}
                disabled={deletingEmployee}
                
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
          <Dialog.Overlay className="fade-in" />
          <Dialog.Content className="fade-in zoom-in-95">
            <Dialog.Title >
              Credentials Generated
            </Dialog.Title>
            <Dialog.Description >
              Login credentials were automatically dispatched to {newCredentials?.email}.
            </Dialog.Description>
            <div >
              {[
                { label: "Email", value: newCredentials?.email || "" },
                { label: "Temporary Password", value: newCredentials?.password || "" },
              ].map((row) => (
                <div
                  key={row.label}
                  
                >
                  <div>
                    <span >
                      {row.label}
                    </span>
                    <span >
                      {row.value}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(row.value);
                      setToast({ open: true, message: `${row.label} copied`, severity: "success" });
                    }}
                    
                  >
                    <ContentCopy size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div >
              <button
                type="button"
                onClick={() => setNewCredentials(null)}
                
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
          <Dialog.Overlay className="fade-in" />
          <Dialog.Content className="fade-in zoom-in-95">
            <div >
              <Delete size={18} />
            </div>
            <Dialog.Title >
              Delete {deleteTarget?.name}?
            </Dialog.Title>
            <Dialog.Description >
              This permanently removes the company, its {deleteTarget?.employeeCount} employee profile(s) and their login credentials. This action cannot be undone.
            </Dialog.Description>
            <div >
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                
              >
                {deleting ? "Deleting..." : "Delete Company"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Toast Notification */}
      {toast.open && (
        <div className="fade-in">
          <div
            className={`${ toast.severity === "error" ? "" : "" }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast((t) => ({ ...t, open: false }))}
              
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
