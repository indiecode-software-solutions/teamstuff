import React, { useState, useEffect, useMemo, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabase";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import {
  uploadProfilePhoto,
  removePreviousProfilePhoto,
  sanitizeProfilePhoto,
  MAX_PROFILE_PHOTO_BYTES,
} from "../lib/profile-photo";
import { toast } from "sonner";
import {
  Edit3 as Edit,
  LogOut,
  Save,
  X,
  User,
  Briefcase,
  Wallet,
  Home,
  Mail,
  Phone,
  Cake,
  Users,
  Droplet,
  Globe,
  Wrench,
  FileText as StickyNote,
  Lock,
  Building2,
  IdCard,
  MapPin,
  Clock,
  UserCheck as UserCog,
  CalendarRange,
  CalendarCheck,
  ImagePlus,
  FileCheck,
  ShieldCheck,
  KeyRound,
  Loader2,
  Camera,
  Copy,
  Check,
  ExternalLink,
  Minus,
  Plus,
  FileBadge,
  Info,
  Shield,
  BriefcaseBusiness,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";
import {
  getLeavePolicies,
  getCompanyHolidays,
  getEmployeeEffectiveOffDays,
  computeLeaveBalances,
  type LeaveBalance,
} from "../lib/leave";
import { EmployeeDocumentsSection } from "../components/profile/EmployeeDocumentsSection";
import {
  SafeLockConfig,
  getSafeLockConfig,
  AVAILABLE_SERVICES,
} from "../lib/safelock";
import { SafeLockSetupModal } from "../components/SafeLockSetupModal";
import { ProfileExitSection } from "../components/hr/ProfileExitSection";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "CapOasis | My Profile" },
      { name: "description", content: "Executive employee profile overview." },
    ],
  }),
  component: ProfilePage,
});

interface ProfileData {
  id: string;
  name: string;
  role: string;
  manager_name: string | null;
  company_id?: string;
  employee_code?: string;
  job_title?: string;
  department?: string;
  employment_type?: string;
  work_location?: string;
  effective_work_start_time?: string;
  effective_work_end_time?: string;
  date_of_joining?: string;
  date_of_birth?: string;
  phone?: string;
  bank_name?: string;
  account_no?: string;
  pan?: string;
  uan?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  gender?: string;
  blood_group?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  linkedin_url?: string;
  skills?: string;
  experience_years?: string;
  notes?: string;
  profile_photo?: string;
  email?: string;
}

type TabKey = "personal" | "work" | "financial" | "address" | "leave" | "safelock" | "documents" | "exit";

const TABS: { id: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: "personal", label: "Personal Details", icon: User },
  { id: "work", label: "Work Information", icon: BriefcaseBusiness },
  { id: "financial", label: "Financial Details", icon: Wallet },
  { id: "address", label: "Addresses", icon: Home },
  { id: "leave", label: "Leave Balance", icon: CalendarCheck },
  { id: "safelock", label: "SafeLock PIN", icon: ShieldCheck },
  { id: "documents", label: "Documents & KYC", icon: FileCheck },
  { id: "exit", label: "Separation & Exit", icon: LogOut },
];

const ADJUST_BOX = 240;

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("personal");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    if (type === "error") toast.error(msg);
    else toast.success(msg);
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate({ to: "/login" });
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;

      const cleanData = {
        ...data,
        email: user.email || (data as any)?.email,
        profile_photo: sanitizeProfilePhoto((data as any)?.profile_photo),
      };
      setProfile(cleanData as any);
    } catch (err) {
      console.error("Error fetching user profile:", err);
      showToast("Could not load profile details.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const [editForm, setEditForm] = useState<Partial<ProfileData>>({});
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState<{
    src: string;
    zoom: number;
    x: number;
    y: number;
  } | null>(null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ px: number; py: number; bx: number; by: number } | null>(null);

  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
  const [leaveBalanceLoading, setLeaveBalanceLoading] = useState(false);

  const [safelockConfig, setSafelockConfig] = useState<SafeLockConfig | null>(null);
  const [safelockSetupOpen, setSafelockSetupOpen] = useState(false);

  useEffect(() => {
    if (profile) {
      setEditForm(profile);
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    let isCancelled = false;

    async function loadLeaveBalances() {
      if (!profile) return;
      const companyId = profile.company_id;
      if (!companyId) return;

      try {
        setLeaveBalanceLoading(true);
        const [policies, holidays, offDays, approvalsRes] = await Promise.all([
          getLeavePolicies(companyId),
          getCompanyHolidays(companyId),
          getEmployeeEffectiveOffDays(companyId, profile.id),
          supabase
            .from("approvals")
            .select("title, start_date, end_date, status, type, employee_id")
            .eq("employee_id", profile.id)
            .ilike("status", "approved"),
        ]);

        if (isCancelled) return;

        const currentYear = new Date().getFullYear();
        const approvedLeaves = (approvalsRes.data || []).map((r: any) => ({
          title: r.title || "",
          start_date: r.start_date || "",
          end_date: r.end_date || null,
        }));

        const balances = computeLeaveBalances(
          policies || [],
          approvedLeaves,
          currentYear,
          {
            offDays: offDays || [],
            holidays: (holidays || []).map((h) => h.date),
          }
        );

        setLeaveBalances(balances);
      } catch (err) {
        console.error("Failed to load employee leave balance:", err);
      } finally {
        if (!isCancelled) setLeaveBalanceLoading(false);
      }
    }

    loadLeaveBalances();
    return () => {
      isCancelled = true;
    };
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    let isCancelled = false;

    async function loadSafeLock() {
      if (!profile) return;
      try {
        const cfg = await getSafeLockConfig(profile.id);
        if (!isCancelled) setSafelockConfig(cfg);
      } catch (err) {
        console.error("Failed to load SafeLock config in profile:", err);
      }
    }

    loadSafeLock();
    return () => {
      isCancelled = true;
    };
  }, [profile]);

  const handleInputChange = (field: keyof ProfileData, value: any) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!profile || !editForm) return;
    try {
      setIsSaving(true);
      const { error } = await supabase
        .from("profiles")
        .update({
          phone: editForm.phone || null,
          date_of_birth: editForm.date_of_birth || null,
          gender: editForm.gender || null,
          blood_group: editForm.blood_group || null,
          linkedin_url: editForm.linkedin_url || null,
          skills: editForm.skills || null,
          notes: editForm.notes || null,
          emergency_contact_name: editForm.emergency_contact_name || null,
          emergency_contact_phone: editForm.emergency_contact_phone || null,
          address_line1: editForm.address_line1 || null,
          address_line2: editForm.address_line2 || null,
          city: editForm.city || null,
          state: editForm.state || null,
          postal_code: editForm.postal_code || null,
          country: editForm.country || null,
        })
        .eq("id", profile.id);

      if (error) throw error;
      setProfile((prev) => ({ ...prev!, ...editForm }));
      setIsEditing(false);
      showToast("Profile details updated successfully!");
    } catch (err) {
      console.error("Failed to save profile:", err);
      showToast("Failed to save profile updates.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditForm(profile || {});
    setIsEditing(false);
  };

  const handleProfilePhotoFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !profile) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please select a valid image file.", "error");
      return;
    }
    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      showToast("Image must be smaller than 5 MB.", "error");
      return;
    }

    try {
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read the selected file."));
        reader.readAsDataURL(file);
      });

      const img = new Image();
      img.onload = () => {
        setImgDims({ w: img.naturalWidth || ADJUST_BOX, h: img.naturalHeight || ADJUST_BOX });
      };
      img.src = src;

      setPendingPhoto({ src, zoom: 1, x: 0, y: 0 });
      setAvatarPickerOpen(true);
    } catch {
      showToast("Could not read the selected file.", "error");
    }
  };

  const handleOpenPhotoPicker = () => {
    if (isUploadingPhoto) return;
    if (pendingPhoto) {
      setAvatarPickerOpen(true);
    } else {
      photoInputRef.current?.click();
    }
  };

  const clampOffset = (x: number, y: number, zoom: number) => {
    if (!imgDims || !imgDims.w || !imgDims.h) return { x: 0, y: 0 };
    const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const baseScale = Math.max(
      ADJUST_BOX / Math.max(1, imgDims.w),
      ADJUST_BOX / Math.max(1, imgDims.h),
    );
    const drawW = imgDims.w * baseScale * safeZoom;
    const drawH = imgDims.h * baseScale * safeZoom;
    const maxX = Math.max(0, (drawW - ADJUST_BOX) / 2);
    const maxY = Math.max(0, (drawH - ADJUST_BOX) / 2);
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    return {
      x: Math.min(maxX, Math.max(-maxX, safeX)),
      y: Math.min(maxY, Math.max(-maxY, safeY)),
    };
  };

  const applyAdjustedPhoto = async () => {
    if (!pendingPhoto || !profile || !imgDims) return;
    setIsUploadingPhoto(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 512;
          canvas.height = 512;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas is not supported in this browser."));
          const safeZoom = Number.isFinite(pendingPhoto.zoom) && pendingPhoto.zoom > 0 ? pendingPhoto.zoom : 1;
          const safeX = Number.isFinite(pendingPhoto.x) ? pendingPhoto.x : 0;
          const safeY = Number.isFinite(pendingPhoto.y) ? pendingPhoto.y : 0;
          const baseScale = Math.max(ADJUST_BOX / Math.max(1, imgDims.w), ADJUST_BOX / Math.max(1, imgDims.h));
          const drawW = imgDims.w * baseScale * safeZoom;
          const drawH = imgDims.h * baseScale * safeZoom;
          const left = (ADJUST_BOX - drawW) / 2 + safeX;
          const top = (ADJUST_BOX - drawH) / 2 + safeY;
          const out = 512 / ADJUST_BOX;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, 512, 512);
          ctx.drawImage(img, left * out, top * out, drawW * out, drawH * out);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        };
        img.onerror = () => reject(new Error("Could not process the selected image."));
        img.src = pendingPhoto.src;
      });

      const uploadRes = await uploadProfilePhoto({
        data: {
          base64Data,
          companyId: profile.company_id || "unknown-company",
          userId: profile.id,
        },
      });
      if (!uploadRes.success) {
        throw new Error(uploadRes.error || "Upload failed");
      }

      const previousPhotoUrl = profile.profile_photo;
      const { error } = await supabase
        .from("profiles")
        .update({ profile_photo: uploadRes.secure_url })
        .eq("id", profile.id);
      if (error) throw error;

      setPendingPhoto(null);
      setAvatarPickerOpen(false);

      await removePreviousProfilePhoto(previousPhotoUrl);
      window.location.reload();
    } catch (err: unknown) {
      showToast(`Failed to upload photo: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const currentTabDef = TABS.find((t) => t.id === activeTab);

  return (
    <Layout
      activeTab="Dashboard"
      breadcrumbs={[
        { label: "Personal" },
        { label: "My Profile", href: "/profile" },
        { label: currentTabDef?.label || "Personal Details" },
      ]}
    >
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleProfilePhotoFile}
      />
      <div className="profile-page-wrapper">
        <div className="profile-tabbed-layout">
          {/* =========================================================================
              LEFT VERTICAL NAVIGATION RAIL
             ========================================================================= */}
          <nav className="profile-nav-rail" aria-label="Profile navigation">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsEditing(false);
                  }}
                  className={`profile-nav-item ${isActive ? "active" : ""}`}
                >
                  <span className="profile-nav-left">
                    <span className="profile-nav-icon">
                      <Icon size={17} />
                    </span>
                    <span>{tab.label}</span>
                  </span>
                  <ChevronRight size={14} className="profile-nav-chevron" />
                </button>
              );
            })}
          </nav>

          {/* =========================================================================
              RIGHT CONTENT AREA
             ========================================================================= */}
          <div className="profile-tab-content-area">
            {/* =====================================================================
                TAB 1: PERSONAL DETAILS
               ===================================================================== */}
            {activeTab === "personal" && (
              <div className="profile-main-card">
                <div className="profile-card-header">
                  <h2 className="profile-header-title">Personal Details</h2>

                  <div className="profile-header-actions">
                    {!isEditing ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => setIsEditing(true)}
                        className="hr-btn hr-btn-secondary"
                        style={{ padding: "5px 12px", fontSize: 12.5 }}
                      >
                        <Edit size={12} />
                        <span>Edit</span>
                      </button>
                    ) : (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={isSaving}
                          className="hr-btn hr-btn-primary"
                          style={{ padding: "6px 14px", fontSize: 13 }}
                        >
                          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                          <span>{isSaving ? "Saving..." : "Save"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCancel}
                          disabled={isSaving}
                          className="hr-btn hr-btn-secondary"
                          style={{ padding: "6px 12px", fontSize: 13 }}
                        >
                          <X size={13} />
                          <span>Cancel</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="profile-split-view">
                  {/* Left: Key-Value Structured Rows */}
                  <div className="profile-data-table">
                    <DataRow label="Full Name" value={profile?.name} loading={loading} skeletonWidth={160} />
                    <DataRow
                      label="Official Email"
                      value={profile?.email || ""}
                      loading={loading}
                      skeletonWidth={190}
                      canCopy
                      isLink
                      linkPrefix="mailto:"
                    />
                    <DataRow
                      label="Phone Number"
                      value={isEditing ? editForm.phone || "" : profile?.phone || ""}
                      loading={loading}
                      skeletonWidth={130}
                      editable={isEditing}
                      placeholder="+91 98765 43210"
                      onChange={(val) => handleInputChange("phone", val)}
                      canCopy
                    />
                    <DataRow
                      label="Date of Birth"
                      value={isEditing ? editForm.date_of_birth || "" : profile?.date_of_birth || ""}
                      loading={loading}
                      skeletonWidth={110}
                      editable={isEditing}
                      type="date"
                      onChange={(val) => handleInputChange("date_of_birth", val)}
                    />
                    <DataRow
                      label="Gender"
                      value={isEditing ? editForm.gender || "" : profile?.gender || ""}
                      loading={loading}
                      skeletonWidth={90}
                      editable={isEditing}
                      type="select"
                      options={["Male", "Female", "Non-Binary", "Prefer not to say"]}
                      onChange={(val) => handleInputChange("gender", val)}
                    />
                    <DataRow
                      label="Blood Group"
                      value={isEditing ? editForm.blood_group || "" : profile?.blood_group || ""}
                      loading={loading}
                      skeletonWidth={60}
                      editable={isEditing}
                      type="select"
                      options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]}
                      onChange={(val) => handleInputChange("blood_group", val)}
                    />
                    <DataRow
                      label="LinkedIn Profile"
                      value={isEditing ? editForm.linkedin_url || "" : profile?.linkedin_url || ""}
                      loading={loading}
                      skeletonWidth={200}
                      editable={isEditing}
                      placeholder="https://linkedin.com/in/username"
                      onChange={(val) => handleInputChange("linkedin_url", val)}
                      isLink
                    />
                    <DataRow
                      label="Skills"
                      value={isEditing ? editForm.skills || "" : profile?.skills || ""}
                      loading={loading}
                      skeletonWidth={220}
                      editable={isEditing}
                      placeholder="React, TypeScript, PostgreSQL (comma-separated)"
                      onChange={(val) => handleInputChange("skills", val)}
                      renderCustom={
                        !isEditing && profile?.skills ? (
                          <div className="profile-skill-cloud">
                            {profile.skills.split(",").map((s) => (
                              <span key={s} className="profile-skill-chip">
                                {s.trim()}
                              </span>
                            ))}
                          </div>
                        ) : undefined
                      }
                    />
                    <DataRow
                      label="About / Bio"
                      value={isEditing ? editForm.notes || "" : profile?.notes || ""}
                      loading={loading}
                      skeletonWidth={210}
                      editable={isEditing}
                      multiline
                      placeholder="Share a short bio or summary..."
                      onChange={(val) => handleInputChange("notes", val)}
                    />
                  </div>

                  {/* Right: Embedded Identity Card */}
                  <ProfileIdentityCard
                    profile={profile}
                    loading={loading}
                    onOpenPhotoPicker={handleOpenPhotoPicker}
                    onLogout={handleLogout}
                  />
                </div>
              </div>
            )}

            {/* =====================================================================
                TAB 2: WORK INFORMATION
               ===================================================================== */}
            {activeTab === "work" && (
              <div className="profile-main-card">
                <div className="profile-card-header">
                  <h2 className="profile-header-title">Work Information</h2>
                </div>

                <div className="profile-split-view">
                  <div className="profile-data-table">
                    <DataRow label="Employee ID" value={profile?.employee_code || "Not assigned"} loading={loading} skeletonWidth={100} canCopy={!!profile?.employee_code} />
                    <DataRow label="Job Title" value={profile?.job_title || "Staff Member"} loading={loading} skeletonWidth={150} />
                    <DataRow label="Department" value={profile?.department || "General"} loading={loading} skeletonWidth={130} />
                    <DataRow label="Role Level" value={profile?.role === "admin" ? "Administrator" : "Employee"} loading={loading} skeletonWidth={110} />
                    <DataRow label="Employment Type" value={profile?.employment_type || "Full-time"} loading={loading} skeletonWidth={100} />
                    <DataRow label="Work Location" value={profile?.work_location || "Headquarters"} loading={loading} skeletonWidth={140} />
                    <DataRow
                      label="Shift Timings"
                      value={`${profile?.effective_work_start_time || "09:00"} - ${profile?.effective_work_end_time || "18:00"}`}
                      loading={loading}
                      skeletonWidth={130}
                    />
                    <DataRow label="Reporting Manager" value={profile?.manager_name || "Direct to Management"} loading={loading} skeletonWidth={160} />
                    <DataRow label="Date of Joining" value={profile?.date_of_joining || "Not specified"} loading={loading} skeletonWidth={120} />
                  </div>

                  <ProfileIdentityCard
                    profile={profile}
                    loading={loading}
                    onOpenPhotoPicker={handleOpenPhotoPicker}
                    onLogout={handleLogout}
                  />
                </div>
              </div>
            )}

            {/* =====================================================================
                TAB 3: FINANCIAL DETAILS & KYC
               ===================================================================== */}
            {activeTab === "financial" && (
              <div className="profile-main-card">
                <div className="profile-card-header">
                  <h2 className="profile-header-title">Financial Details & Statutory KYC</h2>
                </div>

                <div className="profile-split-view">
                  <div>
                    <div className="profile-data-table">
                      <DataRow label="Bank Organization" value={profile?.bank_name || "Not specified"} loading={loading} skeletonWidth={150} />
                      <DataRow
                        label="Bank Account No"
                        value={profile?.account_no ? `•••• •••• ${profile.account_no.slice(-4)}` : "Not linked"}
                        loading={loading}
                        skeletonWidth={170}
                        canCopy={!!profile?.account_no}
                        copyText={profile?.account_no}
                      />
                      <DataRow label="PAN Card ID" value={profile?.pan || "Not linked"} loading={loading} skeletonWidth={120} canCopy={!!profile?.pan} />
                      <DataRow label="UAN / PF ID" value={profile?.uan || "Not linked"} loading={loading} skeletonWidth={140} canCopy={!!profile?.uan} />
                    </div>

                    <div className="profile-notice-box" style={{ marginTop: 20 }}>
                      <Lock size={16} style={{ flexShrink: 0 }} />
                      <span>Financial records are locked and maintained exclusively by HR Payroll for statutory compliance.</span>
                    </div>
                  </div>

                  <ProfileIdentityCard
                    profile={profile}
                    loading={loading}
                    onOpenPhotoPicker={handleOpenPhotoPicker}
                    onLogout={handleLogout}
                  />
                </div>
              </div>
            )}

            {/* =====================================================================
                TAB 4: ADDRESSES & RESIDENTIAL DETAILS
               ===================================================================== */}
            {activeTab === "address" && (
              <div className="profile-main-card">
                <div className="profile-card-header">
                  <h2 className="profile-header-title">Residential Addresses</h2>

                  <div className="profile-header-actions">
                    {!isEditing ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => setIsEditing(true)}
                        className="hr-btn hr-btn-secondary"
                        style={{ padding: "5px 12px", fontSize: 12.5 }}
                      >
                        <Edit size={12} />
                        <span>Edit</span>
                      </button>
                    ) : (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={isSaving}
                          className="hr-btn hr-btn-primary"
                          style={{ padding: "6px 14px", fontSize: 13 }}
                        >
                          {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                          <span>{isSaving ? "Saving..." : "Save"}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCancel}
                          disabled={isSaving}
                          className="hr-btn hr-btn-secondary"
                          style={{ padding: "6px 12px", fontSize: 13 }}
                        >
                          <X size={13} />
                          <span>Cancel</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="profile-split-view">
                  <div className="profile-data-table">
                    <DataRow
                      label="Address Line 1"
                      value={isEditing ? editForm.address_line1 || "" : profile?.address_line1 || ""}
                      loading={loading}
                      skeletonWidth={180}
                      editable={isEditing}
                      placeholder="Street address, Apartment / Suite"
                      onChange={(val) => handleInputChange("address_line1", val)}
                    />
                    <DataRow
                      label="Address Line 2"
                      value={isEditing ? editForm.address_line2 || "" : profile?.address_line2 || ""}
                      loading={loading}
                      skeletonWidth={150}
                      editable={isEditing}
                      placeholder="Landmark, Area / Sector"
                      onChange={(val) => handleInputChange("address_line2", val)}
                    />
                    <DataRow
                      label="City"
                      value={isEditing ? editForm.city || "" : profile?.city || ""}
                      loading={loading}
                      skeletonWidth={110}
                      editable={isEditing}
                      placeholder="City"
                      onChange={(val) => handleInputChange("city", val)}
                    />
                    <DataRow
                      label="State / Province"
                      value={isEditing ? editForm.state || "" : profile?.state || ""}
                      loading={loading}
                      skeletonWidth={120}
                      editable={isEditing}
                      placeholder="State"
                      onChange={(val) => handleInputChange("state", val)}
                    />
                    <DataRow
                      label="Postal / ZIP Code"
                      value={isEditing ? editForm.postal_code || "" : profile?.postal_code || ""}
                      loading={loading}
                      skeletonWidth={90}
                      editable={isEditing}
                      placeholder="Postal code"
                      onChange={(val) => handleInputChange("postal_code", val)}
                    />
                    <DataRow
                      label="Country"
                      value={isEditing ? editForm.country || "" : profile?.country || ""}
                      loading={loading}
                      skeletonWidth={100}
                      editable={isEditing}
                      placeholder="Country"
                      onChange={(val) => handleInputChange("country", val)}
                    />
                    <DataRow
                      label="Emergency Contact Name"
                      value={isEditing ? editForm.emergency_contact_name || "" : profile?.emergency_contact_name || ""}
                      loading={loading}
                      skeletonWidth={140}
                      editable={isEditing}
                      placeholder="Contact person name"
                      onChange={(val) => handleInputChange("emergency_contact_name", val)}
                    />
                    <DataRow
                      label="Emergency Phone"
                      value={isEditing ? editForm.emergency_contact_phone || "" : profile?.emergency_contact_phone || ""}
                      loading={loading}
                      skeletonWidth={130}
                      editable={isEditing}
                      placeholder="+91 98765 43210"
                      onChange={(val) => handleInputChange("emergency_contact_phone", val)}
                      canCopy={!isEditing && !!profile?.emergency_contact_phone}
                    />
                  </div>

                  <ProfileIdentityCard
                    profile={profile}
                    loading={loading}
                    onOpenPhotoPicker={handleOpenPhotoPicker}
                    onLogout={handleLogout}
                  />
                </div>
              </div>
            )}

            {/* =====================================================================
                TAB 5: LEAVE BALANCE
               ===================================================================== */}
            {activeTab === "leave" && (
              <div className="profile-main-card">
                <div className="profile-card-header">
                  <h2 className="profile-header-title">Leave Balance & Quotas ({new Date().getFullYear()})</h2>
                </div>

                <div className="profile-split-view">
                  <div>
                    {leaveBalanceLoading || loading ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div className="skeleton-shimmer" style={{ height: 50, borderRadius: 8 }} />
                        <div className="skeleton-shimmer" style={{ height: 50, borderRadius: 8 }} />
                      </div>
                    ) : leaveBalances.length === 0 ? (
                      <div className="profile-notice-box">
                        <Info size={16} style={{ flexShrink: 0 }} />
                        <span>No leave balance policies configured for your organization. Contact HR for details.</span>
                      </div>
                    ) : (
                      <div className="profile-quota-list">
                        {leaveBalances.map((bal) => {
                          const remaining = Math.max(0, bal.quota - bal.used);
                          const isMonthly = bal.quotaPeriod === "monthly";
                          const formattedTitle = bal.leaveType.toLowerCase().endsWith("leave")
                            ? bal.leaveType
                            : `${bal.leaveType} Leave`;
                          const usedPct = bal.quota > 0 ? Math.min(100, Math.round((bal.used / bal.quota) * 100)) : 0;
                          return (
                            <div key={bal.leaveType} className="profile-quota-segment-row">
                              {/* Left Segment: Name & Used */}
                              <div className="profile-quota-segment-left">
                                <span className="profile-quota-left-title">{formattedTitle}</span>
                                <span className="profile-quota-left-used">
                                  Used {bal.used} {bal.used === 1 ? "day" : "days"} this {isMonthly ? "month" : "year"}
                                </span>
                              </div>

                              {/* Right Segment: Leaves Left, Micro Bar, Used % */}
                              <div className="profile-quota-segment-right">
                                <div className="profile-quota-right-remaining">
                                  <span className="profile-quota-right-bold">{remaining}</span>
                                  <span>of {bal.quota} {bal.quota === 1 ? "day" : "days"} left</span>
                                </div>

                                <div className="profile-quota-mini-bar">
                                  <div
                                    className="profile-quota-mini-fill"
                                    style={{ width: `${usedPct}%` }}
                                  />
                                </div>

                                <span className="profile-quota-right-percent">
                                  {usedPct}% used
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <ProfileIdentityCard
                    profile={profile}
                    loading={loading}
                    onOpenPhotoPicker={handleOpenPhotoPicker}
                    onLogout={handleLogout}
                  />
                </div>
              </div>
            )}

            {/* =====================================================================
                TAB 6: SAFELOCK PIN
               ===================================================================== */}
            {activeTab === "safelock" && (
              <div className="profile-main-card">
                <div className="profile-card-header">
                  <h2 className="profile-header-title">SafeLock PIN &amp; Privacy Controls</h2>

                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setSafelockSetupOpen(true)}
                    className="hr-btn hr-btn-secondary"
                    style={{ padding: "5px 12px", fontSize: 12.5 }}
                  >
                    <KeyRound size={12} />
                    <span>{safelockConfig?.enabled ? "Update PIN & Settings" : "Set Up SafeLock PIN"}</span>
                  </button>
                </div>

                <div className="profile-split-view">
                  <div className="profile-safelock-flat-container">
                    {/* Flat Section 1: Security & PIN Status */}
                    <div className="profile-safelock-flat-group">
                      <div className="profile-safelock-flat-row">
                        <div className="profile-safelock-row-left">
                          <span className="profile-safelock-row-label">SafeLock Protection</span>
                          <span className="profile-safelock-row-sub">
                            {safelockConfig?.enabled
                              ? `Active · Last updated: ${
                                  safelockConfig.updatedAt
                                    ? new Date(safelockConfig.updatedAt).toLocaleDateString("en-GB", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })
                                    : "Recently"
                                }`
                              : "Disabled · Set up a 4-digit PIN to secure sensitive compensation files"}
                          </span>
                        </div>
                        <div className="profile-safelock-row-right">
                          <span className={`profile-safelock-status-pill ${safelockConfig?.enabled ? "active" : "disabled"}`}>
                            {safelockConfig?.enabled ? "Active" : "Disabled"}
                          </span>
                        </div>
                      </div>

                      {safelockConfig?.enabled && (
                        <>
                          <div className="profile-safelock-flat-row">
                            <div className="profile-safelock-row-left">
                              <span className="profile-safelock-row-label">Recovery Question</span>
                              <span className="profile-safelock-row-sub">
                                {safelockConfig.recoveryQuestion || "What was your childhood nickname?"}
                              </span>
                            </div>
                            <div className="profile-safelock-row-right">
                              <span className="profile-safelock-configured-text">
                                <Check size={13} />
                                <span>Configured</span>
                              </span>
                            </div>
                          </div>

                          <div className="profile-safelock-flat-row">
                            <div className="profile-safelock-row-left">
                              <span className="profile-safelock-row-label">Password Hint</span>
                              <span className="profile-safelock-row-sub">
                                Revealed if 3 consecutive incorrect PINs are entered
                              </span>
                            </div>
                            <div className="profile-safelock-row-right">
                              <span className="profile-safelock-hint-text">
                                &ldquo;{safelockConfig.hint || "—"}&rdquo;
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Flat Section 2: Protected Workspace Services */}
                    <div className="profile-safelock-flat-group" style={{ marginTop: 24 }}>
                      <div className="profile-safelock-group-header">
                        <span className="profile-safelock-group-title">Protected Workspace Services</span>
                      </div>

                      <div className="profile-safelock-services-list">
                        {AVAILABLE_SERVICES.map((svc) => {
                          const isProtected =
                            svc.mandatory ||
                            (safelockConfig?.enabled && safelockConfig?.protectedTabs?.includes(svc.key));
                          return (
                            <div key={svc.key} className="profile-safelock-flat-row">
                              <div className="profile-safelock-row-left">
                                <div className="profile-safelock-service-title-wrap">
                                  <span className="profile-safelock-row-label">{svc.label}</span>
                                  {svc.mandatory && (
                                    <span className="profile-safelock-mandatory-label">Mandatory</span>
                                  )}
                                </div>
                                <span className="profile-safelock-row-sub">{svc.description}</span>
                              </div>

                              <div className="profile-safelock-row-right">
                                <span className={`profile-safelock-service-status ${isProtected ? "protected" : "unlocked"}`}>
                                  {isProtected ? "Protected" : "Unlocked"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <ProfileIdentityCard
                    profile={profile}
                    loading={loading}
                    onOpenPhotoPicker={handleOpenPhotoPicker}
                    onLogout={handleLogout}
                  />
                </div>
              </div>
            )}

            {/* =====================================================================
                TAB 7: DOCUMENTS & KYC
               ===================================================================== */}
            {activeTab === "documents" && (
              <div className="profile-main-card">
                <div className="profile-card-header">
                  <h2 className="profile-header-title">Documents & KYC Verification</h2>
                </div>

                <div className="profile-split-view">
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {profile?.company_id ? (
                      <EmployeeDocumentsSection
                        companyId={profile.company_id}
                        userId={profile.id}
                        showToast={showToast}
                      />
                    ) : (
                      <div className="doc-cards-grid">
                        {[0, 1, 2, 3].map((i) => (
                          <div key={i} className="skeleton-shimmer" style={{ height: 120, borderRadius: "var(--radius-sm)" }} />
                        ))}
                      </div>
                    )}
                  </div>

                  <ProfileIdentityCard
                    profile={profile}
                    loading={loading}
                    onOpenPhotoPicker={handleOpenPhotoPicker}
                    onLogout={handleLogout}
                  />
                </div>
              </div>
            )}

            {/* =====================================================================
                TAB 8: EMPLOYMENT SEPARATION & OFFBOARDING
               ===================================================================== */}
            {activeTab === "exit" && (
              <div className="profile-main-card">
                <div className="profile-card-header">
                  <h2 className="profile-header-title">Employment Separation & Offboarding</h2>
                </div>

                <div className="profile-split-view">
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {profile ? (
                      <ProfileExitSection profile={profile} showToast={showToast} />
                    ) : (
                      <div className="skeleton-shimmer" style={{ height: 180, borderRadius: "var(--radius-sm)" }} />
                    )}
                  </div>

                  <ProfileIdentityCard
                    profile={profile}
                    loading={loading}
                    onOpenPhotoPicker={handleOpenPhotoPicker}
                    onLogout={handleLogout}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SafeLock Configuration Modal */}
        {safelockSetupOpen && profile && (
          <SafeLockSetupModal
            open={safelockSetupOpen}
            onClose={() => setSafelockSetupOpen(false)}
            userId={profile.id}
            existingConfig={safelockConfig}
            onSuccess={async (newCfg) => {
              setSafelockSetupOpen(false);
              setSafelockConfig(newCfg);
              showToast("SafeLock settings updated successfully");
            }}
          />
        )}

        {/* Avatar Cropper / Adjustment Modal */}
        <Dialog open={avatarPickerOpen} onOpenChange={setAvatarPickerOpen}>
          <DialogContent
            style={{ maxWidth: 440, padding: 24 }}
          >
            <DialogHeader style={{ marginBottom: 12 }}>
              <DialogTitle style={{ fontSize: "var(--font-size-base)", fontWeight: 600, margin: 0, color: "var(--color-text-primary)" }}>
                Update Profile Photo
              </DialogTitle>
              <DialogDescription className="sr-only">
                Adjust and crop your profile photo
              </DialogDescription>
            </DialogHeader>

            {pendingPhoto ? (() => {
              const baseScale = imgDims && imgDims.w > 0 && imgDims.h > 0
                ? Math.max(ADJUST_BOX / imgDims.w, ADJUST_BOX / imgDims.h)
                : 1;
              const displayW = imgDims && imgDims.w > 0 ? imgDims.w * baseScale : ADJUST_BOX;
              const displayH = imgDims && imgDims.h > 0 ? imgDims.h * baseScale : ADJUST_BOX;
              const safeZoom = Number.isFinite(pendingPhoto.zoom) && pendingPhoto.zoom > 0 ? pendingPhoto.zoom : 1;
              const safeX = Number.isFinite(pendingPhoto.x) ? pendingPhoto.x : 0;
              const safeY = Number.isFinite(pendingPhoto.y) ? pendingPhoto.y : 0;

              return (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div
                    className="profile-cropper-box"
                    style={{ width: ADJUST_BOX, height: ADJUST_BOX, cursor: "grab" }}
                    onMouseDown={(e) => {
                      dragRef.current = {
                        px: e.clientX,
                        py: e.clientY,
                        bx: safeX,
                        by: safeY,
                      };
                    }}
                    onMouseMove={(e) => {
                      if (!dragRef.current) return;
                      const dx = e.clientX - dragRef.current.px;
                      const dy = e.clientY - dragRef.current.py;
                      const next = clampOffset(
                        dragRef.current.bx + dx,
                        dragRef.current.by + dy,
                        safeZoom,
                      );
                      setPendingPhoto((prev) => (prev ? { ...prev, ...next } : null));
                    }}
                    onMouseUp={() => (dragRef.current = null)}
                    onMouseLeave={() => (dragRef.current = null)}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      if (!touch) return;
                      dragRef.current = {
                        px: touch.clientX,
                        py: touch.clientY,
                        bx: safeX,
                        by: safeY,
                      };
                    }}
                    onTouchMove={(e) => {
                      if (!dragRef.current) return;
                      const touch = e.touches[0];
                      if (!touch) return;
                      const dx = touch.clientX - dragRef.current.px;
                      const dy = touch.clientY - dragRef.current.py;
                      const next = clampOffset(
                        dragRef.current.bx + dx,
                        dragRef.current.by + dy,
                        safeZoom,
                      );
                      setPendingPhoto((prev) => (prev ? { ...prev, ...next } : null));
                    }}
                    onTouchEnd={() => (dragRef.current = null)}
                  >
                    <img
                      src={pendingPhoto.src}
                      alt="Adjust preview"
                      draggable={false}
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        setImgDims({ w: img.naturalWidth || ADJUST_BOX, h: img.naturalHeight || ADJUST_BOX });
                      }}
                      style={{
                        position: "absolute",
                        transformOrigin: "center center",
                        transform: `translate(${safeX}px, ${safeY}px) scale(${safeZoom})`,
                        maxWidth: "none",
                        maxHeight: "none",
                        width: `${displayW}px`,
                        height: `${displayH}px`,
                        left: `${(ADJUST_BOX - displayW) / 2}px`,
                        top: `${(ADJUST_BOX - displayH) / 2}px`,
                        userSelect: "none",
                        pointerEvents: "none",
                      }}
                    />
                  </div>

                  {/* Zoom Controls (Vanilla CSS Slider) */}
                  <div className="profile-cropper-controls">
                    <button
                      type="button"
                      className="hr-btn-icon"
                      title="Zoom Out"
                      onClick={() =>
                        setPendingPhoto((prev) =>
                          prev
                            ? {
                                ...prev,
                                zoom: Math.max(0.5, +(prev.zoom - 0.1).toFixed(2)),
                                ...clampOffset(prev.x, prev.y, Math.max(0.5, prev.zoom - 0.1)),
                              }
                            : null,
                        )
                      }
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="range"
                      min="0.5"
                      max="3"
                      step="0.05"
                      value={safeZoom}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (Number.isFinite(val)) {
                          setPendingPhoto((prev) =>
                            prev ? { ...prev, zoom: val, ...clampOffset(prev.x, prev.y, val) } : null,
                          );
                        }
                      }}
                      className="profile-zoom-slider"
                      aria-label="Adjust zoom level"
                    />
                    <button
                      type="button"
                      className="hr-btn-icon"
                      title="Zoom In"
                      onClick={() =>
                        setPendingPhoto((prev) =>
                          prev
                            ? {
                                ...prev,
                                zoom: Math.min(3, +(prev.zoom + 0.1).toFixed(2)),
                                ...clampOffset(prev.x, prev.y, Math.min(3, prev.zoom + 0.1)),
                              }
                            : null,
                        )
                      }
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", marginTop: 16 }}>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="hr-btn hr-btn-secondary"
                    disabled={isUploadingPhoto}
                    style={{ fontSize: 12.5 }}
                  >
                    Choose Different Photo
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingPhoto(null);
                        setAvatarPickerOpen(false);
                      }}
                      className="hr-btn hr-btn-secondary"
                      disabled={isUploadingPhoto}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={applyAdjustedPhoto}
                      disabled={isUploadingPhoto || !imgDims}
                      className="hr-btn hr-btn-primary"
                    >
                      {isUploadingPhoto ? "Saving..." : "Save Photo"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })() : (
              <div
                onClick={() => !isUploadingPhoto && photoInputRef.current?.click()}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "32px 20px",
                  border: "2px dashed var(--color-border)",
                  borderRadius: "var(--radius-xl)",
                  backgroundColor: "var(--color-surface-subtle)",
                  cursor: "pointer",
                  marginTop: 12,
                  transition: "all var(--transition-fast)",
                }}
              >
                {isUploadingPhoto ? (
                  <Loader2 size={28} className="animate-spin" style={{ color: "var(--color-primary)" }} />
                ) : (
                  <ImagePlus size={32} style={{ color: "var(--color-text-muted)" }} />
                )}
                <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>
                  Upload profile photo
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)", textAlign: "center", maxWidth: 260 }}>
                  JPG, PNG or WebP up to 5 MB. Crop and zoom before saving.
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

// 1-Click Copy Helper Button
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="profile-copy-btn"
      title="Copy to clipboard"
    >
      {copied ? <Check size={13} style={{ color: "#16a34a" }} /> : <Copy size={13} />}
    </button>
  );
}

// Reusable Key-Value Data Row Component (clean horizontal table style with border-bottom)
function DataRow({
  label,
  value,
  loading = false,
  skeletonWidth = 140,
  editable = false,
  onChange,
  type = "text",
  options,
  multiline = false,
  placeholder,
  canCopy = false,
  copyText,
  isLink = false,
  linkPrefix = "",
  renderCustom,
}: {
  label: string;
  value?: string;
  loading?: boolean;
  skeletonWidth?: number | string;
  editable?: boolean;
  onChange?: (val: string) => void;
  type?: "text" | "date" | "select";
  options?: string[];
  multiline?: boolean;
  placeholder?: string;
  canCopy?: boolean;
  copyText?: string;
  isLink?: boolean;
  linkPrefix?: string;
  renderCustom?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const textToCopy = copyText || value;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!textToCopy) return;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="profile-data-row">
      <div className="profile-data-label">{label}</div>

      <div className="profile-data-val">
        {loading ? (
          <div
            className="skeleton-shimmer"
            style={{ width: skeletonWidth, height: 16, borderRadius: 4 }}
          />
        ) : editable ? (
          type === "select" && options ? (
            <select
              value={value || ""}
              onChange={(e) => onChange?.(e.target.value)}
              className="profile-select-control"
            >
              <option value="">Select {label}...</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : multiline ? (
            <textarea
              rows={2}
              value={value || ""}
              onChange={(e) => onChange?.(e.target.value)}
              placeholder={placeholder}
              className="profile-textarea-control"
            />
          ) : (
            <input
              type={type === "date" ? "date" : "text"}
              value={value || ""}
              onChange={(e) => onChange?.(e.target.value)}
              placeholder={placeholder}
              className="profile-input-control"
            />
          )
        ) : renderCustom ? (
          renderCustom
        ) : isLink && value ? (
          <a
            href={linkPrefix ? `${linkPrefix}${value}` : value.startsWith("http") ? value : `https://${value}`}
            target={linkPrefix ? "_self" : "_blank"}
            rel="noreferrer"
            style={{ color: "var(--color-primary)", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            <span>{value}</span>
            {!linkPrefix && <ExternalLink size={13} />}
          </a>
        ) : (
          <span className={!value ? "empty" : ""}>{value || "Not specified"}</span>
        )}

        {!loading && !editable && canCopy && textToCopy && (
          <button
            type="button"
            onClick={handleCopy}
            className="profile-copy-btn"
            title="Copy to clipboard"
          >
            {copied ? <Check size={13} style={{ color: "#16a34a" }} /> : <Copy size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}

// Right Column: Clean Profile Identity Card (Square avatar + meta list + sign out)
function ProfileIdentityCard({
  profile,
  loading = false,
  onOpenPhotoPicker,
  onLogout,
}: {
  profile?: ProfileData | null;
  loading?: boolean;
  onOpenPhotoPicker: () => void;
  onLogout: () => void;
}) {
  return (
    <aside className="profile-identity-card">
      <div
        className="profile-avatar-box"
        onClick={loading ? undefined : onOpenPhotoPicker}
        title={loading ? undefined : "Click to change photo"}
        style={loading ? { cursor: "default" } : undefined}
      >
        {loading ? (
          <div className="skeleton-shimmer" style={{ width: "100%", height: "100%" }} />
        ) : profile?.profile_photo ? (
          <img
            src={profile.profile_photo}
            alt={profile.name}
            className="profile-avatar-img"
          />
        ) : (
          <div className="profile-avatar-fallback">
            {getInitials(profile?.name || "Employee")}
          </div>
        )}
        {!loading && (
          <div
            className="profile-avatar-cam-badge"
            title="Upload Photo"
            onClick={(e) => {
              e.stopPropagation();
              onOpenPhotoPicker();
            }}
          >
            <Camera size={14} />
          </div>
        )}
      </div>

      <div>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center", width: "100%" }}>
            <div className="skeleton-shimmer" style={{ width: 140, height: 18, borderRadius: 4 }} />
            <div className="skeleton-shimmer" style={{ width: 100, height: 14, borderRadius: 4 }} />
          </div>
        ) : (
          <>
            <h3 className="profile-card-name">{profile?.name || "Employee"}</h3>
            <p className="profile-card-subtitle">
              {profile?.job_title || "Staff Member"} {profile?.department ? `• ${profile.department}` : ""}
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={onOpenPhotoPicker}
        className="hr-btn hr-btn-secondary profile-card-photo-btn"
      >
        Change Photo
      </button>

      <p className="profile-photo-hint">
        JPG, PNG up to 5 MB<br />Recommended 1:1 ratio
      </p>

      <div className="profile-card-meta-list">
        {loading ? (
          <>
            {[
              { icon: IdCard, label: "ID", width: 70 },
              { icon: Mail, label: "Email", width: 110 },
              { icon: Phone, label: "Phone", width: 90 },
              { icon: UserCog, label: "Manager", width: 95 },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="profile-card-meta-row">
                  <span className="profile-card-meta-lbl">
                    <Icon size={13} />
                    <span>{item.label}</span>
                  </span>
                  <span className="profile-card-meta-val">
                    <div
                      className="skeleton-shimmer"
                      style={{ width: item.width, height: 13, borderRadius: 3 }}
                    />
                  </span>
                </div>
              );
            })}
          </>
        ) : (
          <>
            {profile?.employee_code && (
              <div className="profile-card-meta-row">
                <span className="profile-card-meta-lbl">
                  <IdCard size={13} />
                  <span>ID</span>
                </span>
                <span className="profile-card-meta-val">
                  <span>{profile.employee_code}</span>
                  <CopyButton text={profile.employee_code} />
                </span>
              </div>
            )}

            {profile?.email && (
              <div className="profile-card-meta-row">
                <span className="profile-card-meta-lbl">
                  <Mail size={13} />
                  <span>Email</span>
                </span>
                <span className="profile-card-meta-val">
                  <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={profile.email}>
                    {profile.email}
                  </span>
                  <CopyButton text={profile.email} />
                </span>
              </div>
            )}

            {profile?.phone && (
              <div className="profile-card-meta-row">
                <span className="profile-card-meta-lbl">
                  <Phone size={13} />
                  <span>Phone</span>
                </span>
                <span className="profile-card-meta-val">
                  <span>{profile.phone}</span>
                  <CopyButton text={profile.phone} />
                </span>
              </div>
            )}

            {profile?.manager_name && (
              <div className="profile-card-meta-row">
                <span className="profile-card-meta-lbl">
                  <UserCog size={13} />
                  <span>Manager</span>
                </span>
                <span className="profile-card-meta-val">{profile.manager_name}</span>
              </div>
            )}

            {(profile?.effective_work_start_time || profile?.effective_work_end_time) && (
              <div className="profile-card-meta-row">
                <span className="profile-card-meta-lbl">
                  <Clock size={13} />
                  <span>Shift</span>
                </span>
                <span className="profile-card-meta-val">
                  {profile?.effective_work_start_time || "09:00"} - {profile?.effective_work_end_time || "18:00"}
                </span>
              </div>
            )}

            {profile?.date_of_joining && (
              <div className="profile-card-meta-row">
                <span className="profile-card-meta-lbl">
                  <CalendarRange size={13} />
                  <span>Joined</span>
                </span>
                <span className="profile-card-meta-val">{profile.date_of_joining}</span>
              </div>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={onLogout}
        className="hr-btn hr-btn-secondary profile-card-logout-btn"
        title="Sign out of your account"
      >
        <LogOut size={14} />
        <span>Sign Out</span>
      </button>
    </aside>
  );
}
