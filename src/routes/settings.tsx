import React, { useState, useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Layout from "../components/Layout";
import { toast } from "sonner";
import {
  MapPin,
  Shield,
  Building2,
  Trash2,
  X,
  Clock,
  Database,
  Plus,
  Star,
  SquarePen,
  Fingerprint,
  Copy,
  CheckCircle2,
  Circle,
  MessageSquare,
  Users,
  ShieldCheck,
  BarChart3,
  ShieldAlert,
  Image as ImageIcon,
  FileUp,
  Loader2,
  Info,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  BiometricDevice,
  AttendanceMethod,
  ATTENDANCE_METHOD_LABELS,
  getAdmsEndpointUrl,
  getCompanyBiometricDevices,
  addBiometricDevice,
  toggleBiometricDevice,
  deleteBiometricDevice,
  saveAttendanceMethod,
} from "../lib/essl";
import {
  getCompanyShifts,
  saveShift,
  deleteShift,
  getLateMarkPolicies,
  saveLateMarkPolicy,
  deleteLateMarkPolicy,
  describeLateMarkPolicy,
  LATE_MARK_PENALTY_LABELS,
  type CompanyShift,
  type LateMarkPolicy,
  type LateMarkPenaltyType,
} from "../lib/shifts";
import {
  uploadCompanyLogo,
  saveCompanyLogo,
  saveCompanyProfile,
  invalidateCompanyBrandingCache,
  type CompanyLogoDisplay,
} from "../lib/company";
import { getCurrentCoordinates } from "../lib/geolocation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { Switch } from "../components/ui/switch";
import { Progress } from "../components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";

export const Route = createFileRoute("/settings")({
  head: () => ({
    title: "CapOasis | System Settings",
    meta: [
      { name: "description", content: "Manage enterprise configurations and attendance policies." },
    ],
  }),
  component: SettingsRouteComponent,
});

function SettingsRouteComponent() {
  const [categoryLabel, setCategoryLabel] = useState("Company Profile");

  return (
    <Layout
      activeTab="Settings"
      breadcrumbs={[
        { label: "Admin" },
        { label: "Settings", href: "/admin-console/settings" },
        { label: categoryLabel },
      ]}
    >
      <SettingsPageContent onCategoryChange={setCategoryLabel} />
    </Layout>
  );
}

// ---------- Types ----------
interface OfficeLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

interface ProfileData {
  name: string;
  email: string;
  avatar_url?: string;
}

// ---------- Shift & Time Formatting Helpers ----------
function formatTime12h(timeStr?: string | null): string {
  if (!timeStr) return "--:--";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1].padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours.toString().padStart(2, "0")}:${minutes} ${ampm}`;
}

function calculateShiftDuration(start?: string | null, end?: string | null): { hours: number; minutes: number; label: string; totalMinutes: number } {
  if (!start || !end) return { hours: 0, minutes: 0, label: "--", totalMinutes: 0 };
  const [sH, sM] = start.split(":").map((n) => parseInt(n, 10) || 0);
  const [eH, eM] = end.split(":").map((n) => parseInt(n, 10) || 0);
  let totalMin = eH * 60 + eM - (sH * 60 + sM);
  if (totalMin <= 0) {
    totalMin += 24 * 60;
  }
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  const label = minutes > 0 ? `${hours}h ${minutes}m` : `${hours} hrs`;
  return { hours, minutes, label, totalMinutes: totalMin };
}

function calculateLateCutoffTime(start?: string | null, graceMin?: number | null): string {
  if (!start) return "--:--";
  const [sH, sM] = start.split(":").map((n) => parseInt(n, 10) || 0);
  const grace = graceMin ?? 10;
  const totalMin = sH * 60 + sM + grace;
  const cutoffH = Math.floor((totalMin % (24 * 60)) / 60);
  const cutoffM = totalMin % 60;
  const ampm = cutoffH >= 12 ? "PM" : "AM";
  const displayH = cutoffH % 12 || 12;
  return `${displayH.toString().padStart(2, "0")}:${cutoffM.toString().padStart(2, "0")} ${ampm}`;
}

export function SettingsPageContent({
  isEmbedded = false,
  storageData,
  auditLogs,
  storageLoading,
  auditLoading,
  onCategoryChange,
}: {
  isEmbedded?: boolean;
  storageData?: {
    usedGB: string;
    usedDisplay?: string;
    limitGB: string;
    usedPercentage: number;
    userStorage?:
    | {
      userId: string;
      userName: string;
      userAvatar?: string;
      usedBytes: number;
    }[]
    | undefined;
  };
  auditLogs?: any[];
  storageLoading?: boolean;
  auditLoading?: boolean;
  onCategoryChange?: (label: string) => void;
}) {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<ProfileData | null>(null);

  const [activeCategory, setActiveCategory] = useState<
    "company" | "geolocation" | "shifts" | "storage" | "audit" | "biometric"
  >("company");

  useEffect(() => {
    const labelMap: Record<string, string> = {
      company: "Company Profile",
      geolocation: "Geolocation",
      biometric: "Biometric Devices",
      shifts: "Shifts & Timing",
      storage: "Storage",
      audit: "Audit Logs",
    };
    onCategoryChange?.(labelMap[activeCategory] || "Company Profile");
  }, [activeCategory, onCategoryChange]);

  // ── Biometric Integration state ──────────────────────────
  const [attendanceMethod, setAttendanceMethod] = useState<AttendanceMethod>("gps");
  const [biometricDevices, setBiometricDevices] = useState<BiometricDevice[]>([]);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [newDeviceSerial, setNewDeviceSerial] = useState("");
  const [newDeviceName, setNewDeviceName] = useState("");
  const [newDeviceLocationId, setNewDeviceLocationId] = useState("");
  const [addingDevice, setAddingDevice] = useState(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  // Shift management state
  const [shifts, setShifts] = useState<CompanyShift[]>([]);
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [shiftName, setShiftName] = useState("");
  const [shiftStart, setShiftStart] = useState("09:30");
  const [shiftEnd, setShiftEnd] = useState("18:30");
  const [shiftIsDefault, setShiftIsDefault] = useState(false);
  const [shiftPolicyId, setShiftPolicyId] = useState("");
  const [shiftSaving, setShiftSaving] = useState(false);

  // Late mark policy state
  const [policies, setPolicies] = useState<LateMarkPolicy[]>([]);
  const [defaultPolicyId, setDefaultPolicyId] = useState<string | null>(null);
  const [lateGraceMinutes, setLateGraceMinutes] = useState(10);
  const [policyDialogOpen, setPolicyDialogOpen] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyName, setPolicyName] = useState("");
  const [policyPenaltyType, setPolicyPenaltyType] =
    useState<LateMarkPenaltyType>("half_day_after_marks");
  const [policyCount, setPolicyCount] = useState("3");
  const [policyGraceMinutes, setPolicyGraceMinutes] = useState("10");
  const [policySaving, setPolicySaving] = useState(false);

  // Dialog state for adding location
  const [openAddLocDialog, setOpenAddLocDialog] = useState(false);

  // Office location fields
  const [locations, setLocations] = useState<OfficeLocation[]>([]);
  const [newLocName, setNewLocName] = useState("");
  const [newLocLat, setNewLocLat] = useState("");
  const [newLocLng, setNewLocLng] = useState("");
  const [newLocRadius, setNewLocRadius] = useState("100");

  // Company Details
  const [companyName, setCompanyName] = useState("CapOasis");
  const [companyShortName, setCompanyShortName] = useState("");
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [logoDisplay, setLogoDisplay] = useState<CompanyLogoDisplay>("logo_and_name");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [companyDomain, setCompanyDomain] = useState("yoovaventures.com");
  const [workStartTime, setWorkStartTime] = useState("09:30");
  const [workEndTime, setWorkEndTime] = useState("18:30");
  const [inductionEnabled, setInductionEnabled] = useState(true);
  const [chatMode, setChatMode] = useState<"anonymous" | "transparent">("anonymous");
  const [allowTeamLeadPolls, setAllowTeamLeadPolls] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);

  async function handleDetectLocation() {
    setDetectingLocation(true);
    try {
      const coords = await getCurrentCoordinates();
      setNewLocLat(coords.latitude.toString());
      setNewLocLng(coords.longitude.toString());
      showToast("Location coordinates detected successfully!", "success");
    } catch (error: any) {
      showToast(
        error.message || "Failed to detect coordinates. Check location permissions.",
        "error",
      );
    } finally {
      setDetectingLocation(false);
    }
  }

  // Verify Role is Admin (from DB profile or impersonation)
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const impersonated = sessionStorage.getItem("impersonated_company");
        if (impersonated) return;
      } catch (e) {}
    }

    let cancelled = false;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && (data?.role ?? "employee") !== "admin") {
            navigate({ to: "/" });
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    loadCompanyData();
  }, []);

  async function loadCompanyData() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUser({ id: user.id });

      let targetCompanyId: string | null = null;
      if (typeof window !== "undefined") {
        try {
          const stored = sessionStorage.getItem("impersonated_company");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.id) targetCompanyId = parsed.id;
          }
        } catch (e) {}
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("name, company_id")
        .eq("id", user.id)
        .single();

      if (profile) {
        setUserProfile({
          name: profile.name || "Admin User",
          email: user.email || "",
        });
        if (!targetCompanyId) {
          targetCompanyId = profile.company_id;
        }
      }

      if (targetCompanyId) {
        setCompanyId(targetCompanyId);
        // Load company profile fields
        const { data: comp } = await supabase
          .from("companies")
          .select(
            "name, tenant_domain, default_work_start_time, default_work_end_time, short_name, logo_url, logo_display, induction_enabled, late_mark_policy_id, late_grace_minutes, attendance_method, chat_mode, allow_team_lead_polls",
          )
          .eq("id", targetCompanyId)
          .maybeSingle();
        if (comp) {
          setCompanyName(comp.name || "CapOasis");
          setCompanyDomain(comp.tenant_domain || "yoovaventures.com");
          setWorkStartTime(comp.default_work_start_time || "09:30");
          setWorkEndTime(comp.default_work_end_time || "18:30");
          setCompanyShortName(comp.short_name || comp.name || "");
          setCompanyLogo(comp.logo_url || null);
          setLogoDisplay((comp.logo_display as CompanyLogoDisplay) || "logo_and_name");
          setInductionEnabled(comp.induction_enabled ?? true);
          setChatMode((comp.chat_mode as "anonymous" | "transparent") || "anonymous");
          setAllowTeamLeadPolls(Boolean((comp as any).allow_team_lead_polls));
          setDefaultPolicyId(comp.late_mark_policy_id || null);
          setLateGraceMinutes(typeof (comp as any).late_grace_minutes === "number" ? (comp as any).late_grace_minutes : 10);
          setAttendanceMethod((comp.attendance_method as AttendanceMethod) || "gps");
        }

        // Load locations
        const { data: locs } = await supabase
          .from("office_locations")
          .select("*")
          .eq("company_id", targetCompanyId)
          .eq("is_active", true);
        setLocations(locs || []);

        // Load shifts
        setShifts(await getCompanyShifts(targetCompanyId));

        // Load late mark policies
        setPolicies(await getLateMarkPolicies(targetCompanyId));

        // Load biometric devices
        await loadBiometricDevices(targetCompanyId);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to load settings data", "error");
    } finally {
      setLoading(false);
    }
  }

  function showToast(message: string, severity: "success" | "error" = "success") {
    if (severity === "error") {
      toast.error(message);
    } else {
      toast.success(message);
    }
  }

  async function handleAddLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!newLocName || !newLocLat || !newLocLng || !newLocRadius) {
      showToast("Please fill in all coordinates parameters.", "error");
      return;
    }

    const lat = parseFloat(newLocLat);
    const lng = parseFloat(newLocLng);
    const rad = parseInt(newLocRadius);

    if (isNaN(lat) || isNaN(lng) || isNaN(rad)) {
      showToast("Coordinates parameters must be valid numbers.", "error");
      return;
    }

    setActionLoading(true);
    try {
      let activeCompanyId = companyId;
      if (!activeCompanyId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("id", user.id)
            .single();
          if (profile?.company_id) {
            activeCompanyId = profile.company_id;
            setCompanyId(profile.company_id);
          }
        }
      }

      if (!activeCompanyId) {
        const { data: firstCompany } = await supabase.from("companies").select("id").limit(1);
        if (Array.isArray(firstCompany) && firstCompany.length > 0 && firstCompany[0]) {
          activeCompanyId = firstCompany[0].id;
          setCompanyId(activeCompanyId);
        } else {
          // Table is empty. Auto-create a default company tenant
          const { data: newCompany, error: compErr } = await supabase
            .from("companies")
            .insert({ name: "CapOasis", tenant_domain: "yoovaventures.com" })
            .select()
            .single();

          let resolvedCompany = newCompany;
          if (compErr) {
            const { data: retryCompany, error: retryErr } = await supabase
              .from("companies")
              .insert({ name: "CapOasis" })
              .select()
              .single();
            if (retryErr)
              throw new Error("Failed to auto-create a company tenant: " + retryErr.message);
            resolvedCompany = retryCompany;
          }

          if (resolvedCompany) {
            activeCompanyId = resolvedCompany.id;
            setCompanyId(activeCompanyId);

            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (user) {
              await supabase
                .from("profiles")
                .update({ company_id: activeCompanyId })
                .eq("id", user.id);
            }
          }
        }
      }

      if (!activeCompanyId) {
        throw new Error(
          "No company tenant found. Please set up a company in the companies table first.",
        );
      }

      const { data, error } = await supabase
        .from("office_locations")
        .insert({
          company_id: activeCompanyId,
          name: newLocName,
          latitude: lat,
          longitude: lng,
          radius_meters: rad,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      if (!data) throw new Error("Database did not return the created office location record.");

      setLocations((prev) => [...prev, data]);
      setNewLocName("");
      setNewLocLat("");
      setNewLocLng("");
      setNewLocRadius("100");
      setOpenAddLocDialog(false);
      showToast("Office location added successfully!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to save office coordinates.", "error");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveCompanyProfile() {
    if (!companyId) return;
    setActionLoading(true);
    try {
      const selectedPolicy = policies.find((p) => p.id === defaultPolicyId);
      const effectiveGraceMinutes = selectedPolicy ? (selectedPolicy.graceMinutes ?? 10) : (Number(lateGraceMinutes) || 10);

      const { success, error } = await saveCompanyProfile({
        data: {
          companyId,
          name: companyName,
          shortName: companyShortName,
          logoUrl: companyLogo,
          logoDisplay: companyLogo ? logoDisplay : null,
          tenantDomain: companyDomain,
          workStartTime,
          workEndTime,
          lateMarkPolicyId: defaultPolicyId,
          lateGraceMinutes: effectiveGraceMinutes,
          inductionEnabled,
          chatMode,
          allowTeamLeadPolls,
        },
      });
      if (!success) throw new Error(error || "Failed to save company settings.");

      invalidateCompanyBrandingCache();
      showToast("Company settings updated successfully!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to save company settings.", "error");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLogoSelected(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file for the logo.", "error");
      return;
    }
    if (!companyId) {
      showToast("Could not resolve your company.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = String(reader.result || "");
      setUploadingLogo(true);
      try {
        const uploadRes = await uploadCompanyLogo({
          data: { base64Data, companyId },
        });
        if (!uploadRes.success || !("secure_url" in uploadRes) || !uploadRes.secure_url) {
          showToast(`Logo upload failed. ${"error" in uploadRes ? uploadRes.error : ""}`, "error");
          return;
        }
        setCompanyLogo(uploadRes.secure_url);
        const { success: persistSuccess, error: persistError } = await saveCompanyLogo({
          data: { companyId, logoUrl: uploadRes.secure_url },
        });
        if (!persistSuccess) {
          showToast(
            `Logo uploaded, but could not be saved: ${persistError || "unknown error"}`,
            "error",
          );
          return;
        }
        invalidateCompanyBrandingCache();
        showToast("Logo uploaded to the company asset folder.", "success");
      } finally {
        setUploadingLogo(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleDeleteLocation(id: string) {
    if (!confirm("Are you sure you want to remove this office location?")) return;

    setActionLoading(true);
    try {
      const { error } = await supabase.from("office_locations").delete().eq("id", id);
      if (error) throw error;

      setLocations((prev) => prev.filter((loc) => loc.id !== id));
      showToast("Office location removed.", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to remove coordinates.", "error");
    } finally {
      setActionLoading(false);
    }
  }

  // ── Biometric handlers ─────────────────────────────────────
  async function loadBiometricDevices(cid: string) {
    setBiometricLoading(true);
    try {
      const devices = await getCompanyBiometricDevices(cid);
      setBiometricDevices(devices);
    } catch (err: any) {
      showToast(err.message || "Failed to load biometric devices.", "error");
    } finally {
      setBiometricLoading(false);
    }
  }

  async function handleSaveAttendanceMethod(method: AttendanceMethod) {
    if (!companyId) return;
    try {
      await saveAttendanceMethod(companyId, method);
      setAttendanceMethod(method);
      showToast("Attendance method updated.", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to update attendance method.", "error");
    }
  }

  async function handleAddBiometricDevice(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId) return;
    if (!newDeviceSerial.trim() || !newDeviceName.trim()) {
      showToast("Device serial number and name are required.", "error");
      return;
    }
    setAddingDevice(true);
    try {
      const device = await addBiometricDevice({
        company_id: companyId,
        device_serial: newDeviceSerial.trim().toUpperCase(),
        device_name: newDeviceName.trim(),
        office_location_id: newDeviceLocationId || null,
      });
      setBiometricDevices((prev) => [device, ...prev]);
      setNewDeviceSerial("");
      setNewDeviceName("");
      setNewDeviceLocationId("");
      showToast("Biometric device registered successfully!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to add device. Check the serial number is unique.", "error");
    } finally {
      setAddingDevice(false);
    }
  }

  async function handleToggleBiometricDevice(id: string, isActive: boolean) {
    try {
      await toggleBiometricDevice(id, isActive);
      setBiometricDevices((prev) =>
        prev.map((d) => (d.id === id ? { ...d, is_active: isActive } : d)),
      );
    } catch (err: any) {
      showToast(err.message || "Failed to update device status.", "error");
    }
  }

  async function handleDeleteBiometricDevice(id: string) {
    if (!confirm("Remove this biometric device? Existing attendance records will be kept.")) return;
    try {
      await deleteBiometricDevice(id);
      setBiometricDevices((prev) => prev.filter((d) => d.id !== id));
      showToast("Device removed.", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to remove device.", "error");
    }
  }

  function handleCopyEndpoint() {
    const url = getAdmsEndpointUrl();
    navigator.clipboard.writeText(url).then(() => {
      setCopiedEndpoint(true);
      setTimeout(() => setCopiedEndpoint(false), 2500);
    });
  }

  const categories = [
    { id: "company", label: "Company Profile", icon: <Building2  />, color: "text-zinc-900" },
    { id: "geolocation", label: "Geolocation", icon: <MapPin  />, color: "text-zinc-700" },
    { id: "biometric", label: "Biometric", icon: <Fingerprint  />, color: "text-zinc-900" },
    { id: "shifts", label: "Shifts", icon: <Clock  />, color: "text-zinc-700" },
    { id: "storage", label: "Storage", icon: <Database  />, color: "text-zinc-900" },
    { id: "audit", label: "Audit Logs", icon: <Shield  />, color: "text-zinc-700" },
  ] as const;

  function openCreateShiftDialog() {
    setEditingShiftId(null);
    setShiftName("");
    setShiftStart(workStartTime || "09:30");
    setShiftEnd(workEndTime || "18:30");
    setShiftIsDefault(false);
    setShiftPolicyId("");
    setShiftDialogOpen(true);
  }

  function openEditShiftDialog(shift: CompanyShift) {
    setEditingShiftId(shift.id);
    setShiftName(shift.name);
    setShiftStart(shift.startTime);
    setShiftEnd(shift.endTime);
    setShiftIsDefault(shift.isDefault);
    setShiftPolicyId(shift.lateMarkPolicyId || "");
    setShiftDialogOpen(true);
  }

  async function handleSaveShift() {
    if (!companyId || !user) return;
    if (!shiftName.trim() || !shiftStart || !shiftEnd) {
      showToast("Shift name and timings are required.", "error");
      return;
    }
    if (shiftStart >= shiftEnd) {
      showToast("Shift start must be earlier than end time.", "error");
      return;
    }
    setShiftSaving(true);
    try {
      const res = await saveShift({
        data: {
          userId: user.id,
          companyId,
          ...(editingShiftId ? { id: editingShiftId } : {}),
          name: shiftName.trim(),
          startTime: shiftStart,
          endTime: shiftEnd,
          isDefault: shiftIsDefault,
          lateMarkPolicyId: shiftPolicyId || null,
        },
      });
      if (!res.success) throw new Error(res.error || "Failed to save shift");
      showToast(editingShiftId ? "Shift updated." : "Shift created.", "success");
      setShiftDialogOpen(false);
      setShifts(await getCompanyShifts(companyId));
    } catch (err: any) {
      showToast(err.message || "Failed to save shift.", "error");
    } finally {
      setShiftSaving(false);
    }
  }

  async function handleDeleteShift(shiftId: string) {
    if (!companyId || !user) return;
    if (
      !window.confirm(
        "Delete this shift? Employees assigned to it will fall back to the company default timing.",
      )
    )
      return;
    try {
      const res = await deleteShift({
        data: { userId: user.id, shiftId, companyId },
      });
      if (!res.success) throw new Error(res.error || "Failed to delete shift");
      showToast("Shift deleted.", "success");
      setShifts(await getCompanyShifts(companyId));
    } catch (err: any) {
      showToast(err.message || "Failed to delete shift.", "error");
    }
  }

  async function handleSetDefaultShift(shiftId: string) {
    if (!companyId || !user) return;
    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;
    try {
      const res = await saveShift({
        data: {
          userId: user.id,
          companyId,
          id: shift.id,
          name: shift.name,
          startTime: shift.startTime,
          endTime: shift.endTime,
          isDefault: true,
        },
      });
      if (!res.success) throw new Error(res.error || "Failed to update shift");
      showToast(`${shift.name} is now the default shift.`, "success");
      setShifts(await getCompanyShifts(companyId));
    } catch (err: any) {
      showToast(err.message || "Failed to update shift.", "error");
    }
  }

  function openCreatePolicyDialog() {
    setEditingPolicyId(null);
    setPolicyName("");
    setPolicyPenaltyType("half_day_after_marks");
    setPolicyCount("3");
    setPolicyGraceMinutes("10");
    setPolicyDialogOpen(true);
  }

  function openEditPolicyDialog(policy: LateMarkPolicy) {
    setEditingPolicyId(policy.id);
    setPolicyName(policy.name);
    setPolicyPenaltyType(policy.penaltyType);
    setPolicyCount(String(policy.lateMarksCount));
    setPolicyGraceMinutes(String(policy.graceMinutes ?? 10));
    setPolicyDialogOpen(true);
  }

  async function handleSavePolicy() {
    if (!companyId || !user) return;
    if (!policyName.trim()) {
      showToast("Policy name is required.", "error");
      return;
    }
    const count = parseInt(policyCount, 10);
    if (!Number.isInteger(count) || count < 1) {
      showToast("Late marks count must be a whole number of at least 1.", "error");
      return;
    }
    const grace = parseInt(policyGraceMinutes, 10);
    const graceMins = !isNaN(grace) && grace >= 0 ? grace : 10;

    setPolicySaving(true);
    try {
      const res = await saveLateMarkPolicy({
        data: {
          userId: user.id,
          companyId,
          ...(editingPolicyId ? { id: editingPolicyId } : {}),
          name: policyName.trim(),
          penaltyType: policyPenaltyType,
          lateMarksCount: count,
          graceMinutes: graceMins,
        },
      });
      if (!res.success) throw new Error(res.error || "Failed to save policy");
      showToast(editingPolicyId ? "Policy updated." : "Policy created.", "success");
      setPolicyDialogOpen(false);
      setPolicies(await getLateMarkPolicies(companyId));
    } catch (err: any) {
      showToast(err.message || "Failed to save policy.", "error");
    } finally {
      setPolicySaving(false);
    }
  }

  async function handleDeletePolicy(policyId: string) {
    if (!companyId || !user) return;
    if (
      !window.confirm("Delete this late mark policy? Shifts using it will fall back to no policy.")
    )
      return;
    try {
      const res = await deleteLateMarkPolicy({
        data: { userId: user.id, policyId, companyId },
      });
      if (!res.success) throw new Error(res.error || "Failed to delete policy");
      showToast("Policy deleted.", "success");
      const freshPolicies = await getLateMarkPolicies(companyId);
      setPolicies(freshPolicies);
      if (defaultPolicyId === policyId) setDefaultPolicyId(null);
      setShifts(await getCompanyShifts(companyId));
    } catch (err: any) {
      showToast(err.message || "Failed to delete policy.", "error");
    }
  }

  return (
    <div className="settings-page-shell">
      <div className="settings-layout-grid">
        {/* Left Column: Category Sidebar */}
        <div className="settings-sidebar">
          <div className="settings-nav-list">
            {categories.map((c) => {
              const isActive = activeCategory === c.id;
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  className={`settings-nav-item ${isActive ? "active" : ""}`}
                >
                  <span className="settings-nav-icon">
                    {c.icon}
                  </span>
                  <span className="settings-nav-label">
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Detailed Pane */}
        <div className="settings-pane">
          {/* Category Header */}
          <div className="settings-pane-header">
            <h1 className="settings-pane-title">
              <span>{categories.find((c) => c.id === activeCategory)?.label}</span>
            </h1>
            <span className="settings-pane-desc">
              {activeCategory === "company"
                ? "Manage company profile and branding settings."
                : activeCategory === "geolocation"
                  ? "Manage office geofencing and coordinates."
                  : activeCategory === "biometric"
                    ? "Configure biometric ADMS hardware devices."
                    : activeCategory === "shifts"
                      ? "Define shift schedules and late arrival rules."
                      : activeCategory === "storage"
                        ? "Cloud usage and consumption metrics."
                        : "System security audit and activity log."}
            </span>
          </div>

          {/* ---------- CATEGORY: COMPANY PROFILE ---------- */}
          {activeCategory === "company" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-header-left">
                    <h2 className="settings-card-title">General Info</h2>
                    <p className="settings-card-subtitle">Organization tenant credentials and branding assets.</p>
                  </div>
                </div>

                <div className="settings-form-grid">
                  <div className="settings-form-grid-2">
                    <div className="settings-field">
                      <label className="settings-label">
                        Company Tenant Name
                      </label>
                      {loading ? (
                        <div className="skeleton-shimmer" style={{ width: "100%", height: "38px", borderRadius: "6px" }} />
                      ) : (
                        <input
                          type="text"
                          className="settings-input"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                        />
                      )}
                    </div>

                    <div className="settings-field">
                      <label className="settings-label">
                        Company Short Name
                      </label>
                      {loading ? (
                        <div className="skeleton-shimmer" style={{ width: "100%", height: "38px", borderRadius: "6px" }} />
                      ) : (
                        <input
                          type="text"
                          className="settings-input"
                          placeholder="Shown in the sidebar when logo is not displayed"
                          value={companyShortName}
                          onChange={(e) => setCompanyShortName(e.target.value)}
                        />
                      )}
                    </div>
                  </div>

                  <div className="settings-field">
                    <label className="settings-label">
                      Company Logo
                    </label>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        handleLogoSelected(e.target.files?.[0] || null);
                        e.target.value = "";
                      }}
                    />
                    <div className="settings-logo-container">
                      <div className="settings-logo-preview-box">
                        {loading ? (
                          <div className="skeleton-shimmer" style={{ width: "100%", height: "100%", borderRadius: "6px" }} />
                        ) : companyLogo ? (
                          <img
                            src={companyLogo}
                            alt="Company logo preview"
                            className="settings-logo-preview-img"
                          />
                        ) : (
                          <div className="settings-logo-placeholder">
                            <ImageIcon size={24} />
                          </div>
                        )}
                      </div>
                      <div className="settings-logo-actions">
                        <button
                          type="button"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={loading || uploadingLogo}
                          className="settings-btn settings-btn-secondary"
                        >
                          {uploadingLogo ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Uploading…</span>
                            </>
                          ) : (
                            <>
                              <FileUp size={14} />
                              <span>{companyLogo ? "Replace Logo" : "Upload Logo"}</span>
                            </>
                          )}
                        </button>
                        {companyLogo && !loading && (
                          <button
                            type="button"
                            onClick={() => setCompanyLogo(null)}
                            className="settings-btn settings-btn-danger settings-btn-icon"
                            title="Delete Logo"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="settings-help-text">
                      Stored securely in your company's dedicated cloud storage.
                    </p>
                  </div>

                  {companyLogo && !loading && (
                    <div className="settings-field">
                      <label className="settings-label">
                        Sidebar Display Mode
                      </label>
                      <div className="settings-choice-grid">
                        <div
                          className={`settings-choice-card ${logoDisplay === "logo_and_name" ? "selected" : ""}`}
                          onClick={() => setLogoDisplay("logo_and_name")}
                        >
                          <div className="settings-choice-header">
                            <span className="settings-choice-title-row">
                              <Building2 size={16} />
                              <span>Logo + Short Name</span>
                            </span>
                            <input
                              type="radio"
                              name="logoDisplay"
                              value="logo_and_name"
                              checked={logoDisplay === "logo_and_name"}
                              onChange={(e) => setLogoDisplay(e.target.value as CompanyLogoDisplay)}
                            />
                          </div>
                          <p className="settings-choice-desc">
                            Shows both logo and company text on the sidebar.
                          </p>
                        </div>

                        <div
                          className={`settings-choice-card ${logoDisplay === "logo_only" ? "selected" : ""}`}
                          onClick={() => setLogoDisplay("logo_only")}
                        >
                          <div className="settings-choice-header">
                            <span className="settings-choice-title-row">
                              <ImageIcon size={16} />
                              <span>Logo Only</span>
                            </span>
                            <input
                              type="radio"
                              name="logoDisplay"
                              value="logo_only"
                              checked={logoDisplay === "logo_only"}
                              onChange={(e) => setLogoDisplay(e.target.value as CompanyLogoDisplay)}
                            />
                          </div>
                          <p className="settings-choice-desc">
                            Shows only the logo emblem on the top sidebar.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="settings-field">
                    <label className="settings-label">
                      Portal Corporate Domain
                    </label>
                    {loading ? (
                      <div className="skeleton-shimmer" style={{ width: "100%", height: "38px", borderRadius: "6px" }} />
                    ) : (
                      <input
                        type="text"
                        className="settings-input"
                        value={companyDomain}
                        onChange={(e) => setCompanyDomain(e.target.value)}
                      />
                    )}
                  </div>

                  {/* Employee Induction Switch */}
                  <div className="settings-toggle-row">
                    <div className="settings-toggle-info">
                      <p className="settings-toggle-title">
                        Employee Induction
                      </p>
                      <p className="settings-toggle-desc">
                        Show the company induction journey (welcome, vision, culture videos) after a new employee completes onboarding.
                      </p>
                    </div>
                    {loading ? (
                      <div className="skeleton-shimmer" style={{ width: "40px", height: "22px", borderRadius: "12px" }} />
                    ) : (
                      <Switch
                        checked={inductionEnabled}
                        onCheckedChange={setInductionEnabled}
                      />
                    )}
                  </div>

                  {/* Company Discussion Mode Setting */}
                  <div className="settings-field" style={{ marginTop: "8px" }}>
                    <label className="settings-label">Company Quick Chat & Discussion Mode</label>
                    {loading ? (
                      <div className="settings-choice-grid">
                        <div className="settings-choice-card">
                          <div className="skeleton-shimmer" style={{ width: "120px", height: "18px", borderRadius: "4px", marginBottom: "8px" }} />
                          <div className="skeleton-shimmer" style={{ width: "100%", height: "12px", borderRadius: "4px" }} />
                        </div>
                        <div className="settings-choice-card">
                          <div className="skeleton-shimmer" style={{ width: "140px", height: "18px", borderRadius: "4px", marginBottom: "8px" }} />
                          <div className="skeleton-shimmer" style={{ width: "100%", height: "12px", borderRadius: "4px" }} />
                        </div>
                      </div>
                    ) : (
                      <div className="settings-choice-grid">
                        {/* Anonymous Card */}
                        <div
                          onClick={() => setChatMode("anonymous")}
                          className={`settings-choice-card ${chatMode === "anonymous" ? "selected" : ""}`}
                        >
                          <div className="settings-choice-header">
                            <div className="settings-choice-title-row">
                              <img
                                src="/anonymous-stroke-rounded.svg"
                                alt="Anonymous"
                                style={{ width: "18px", height: "18px" }}
                              />
                              <span>Anonymous Chat</span>
                            </div>
                            <input
                              type="radio"
                              checked={chatMode === "anonymous"}
                              onChange={() => setChatMode("anonymous")}
                            />
                          </div>
                          <p className="settings-choice-desc">
                            All new posts & replies hide author identities to encourage candid and open company feedback.
                          </p>
                        </div>

                        {/* Transparent Card */}
                        <div
                          onClick={() => setChatMode("transparent")}
                          className={`settings-choice-card ${chatMode === "transparent" ? "selected" : ""}`}
                        >
                          <div className="settings-choice-header">
                            <div className="settings-choice-title-row">
                              <Users size={18} />
                              <span>Transparent Group Chat</span>
                            </div>
                            <input
                              type="radio"
                              checked={chatMode === "transparent"}
                              onChange={() => setChatMode("transparent")}
                            />
                          </div>
                          <p className="settings-choice-desc">
                            Employees post with their real names, photos, and roles for accountable team conversations.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Privacy Callout */}
                    <div className="settings-callout" style={{ marginTop: "12px" }}>
                      <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                      <p>
                        <strong>Privacy Invariant:</strong> Switching between modes will never unmask previously posted anonymous messages. Historical anonymous posts permanently stay private.
                      </p>
                    </div>

                    {/* Team Lead Poll Permissions */}
                    <div className="settings-toggle-row" style={{ marginTop: "12px" }}>
                      <div className="settings-toggle-info">
                        <p className="settings-toggle-title">
                          Team Lead Poll Creation
                        </p>
                        <p className="settings-toggle-desc">
                          Allow Team Leads and Managers to publish polls on the Internal Forum. By default, only HR and Admins are permitted.
                        </p>
                      </div>
                      {loading ? (
                        <div className="skeleton-shimmer" style={{ width: "40px", height: "22px", borderRadius: "12px" }} />
                      ) : (
                        <Switch
                          checked={allowTeamLeadPolls}
                          onCheckedChange={setAllowTeamLeadPolls}
                        />
                      )}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                    <button
                      type="button"
                      disabled={loading || actionLoading}
                      onClick={handleSaveCompanyProfile}
                      className="settings-btn settings-btn-primary"
                    >
                      {actionLoading ? "Saving…" : "Save Profile"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------- CATEGORY: GEOLOCATION ---------- */}
          {activeCategory === "geolocation" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-header-left">
                    <h2 className="settings-card-title">Office Geofence Locations</h2>
                    <p className="settings-card-subtitle">Define valid office perimeters where employees are permitted to clock-in via GPS.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpenAddLocDialog(true)}
                    className="settings-btn settings-btn-primary"
                  >
                    <Plus size={14} />
                    <span>Add Geofence</span>
                  </button>
                </div>

                <div className="settings-table-wrapper">
                  <div className="settings-table-scroll">
                    <table className="settings-table">
                      <thead>
                        <tr>
                          <th>Office Name</th>
                          <th>Coordinates</th>
                          <th>Radius</th>
                          <th style={{ textAlign: "right" }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          [1, 2, 3].map((i) => (
                            <tr key={`geo-skel-${i}`}>
                              <td>
                                <div className="skeleton-shimmer" style={{ width: "140px", height: "14px", borderRadius: "4px" }} />
                              </td>
                              <td>
                                <div className="skeleton-shimmer" style={{ width: "160px", height: "14px", borderRadius: "4px" }} />
                              </td>
                              <td>
                                <div className="skeleton-shimmer" style={{ width: "45px", height: "14px", borderRadius: "4px" }} />
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <div className="skeleton-shimmer" style={{ width: "28px", height: "28px", borderRadius: "6px", marginLeft: "auto" }} />
                              </td>
                            </tr>
                          ))
                        ) : locations.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="settings-table-empty">
                              No office locations configured. Click Add Geofence to add coordinates.
                            </td>
                          </tr>
                        ) : (
                          locations.map((loc) => (
                            <tr key={loc.id}>
                              <td style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{loc.name}</td>
                              <td className="settings-cell-mono">
                                {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                              </td>
                              <td>{loc.radius_meters}m</td>
                              <td style={{ textAlign: "right" }}>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteLocation(loc.id)}
                                  disabled={actionLoading}
                                  className="settings-btn settings-btn-danger settings-btn-icon"
                                  title="Delete location"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------- CATEGORY: BIOMETRIC ---------- */}
          {activeCategory === "biometric" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Attendance Method Card */}
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-header-left">
                    <h2 className="settings-card-title">Attendance Method</h2>
                    <p className="settings-card-subtitle">Choose how attendance punches are captured organization-wide.</p>
                  </div>
                </div>
                {loading ? (
                  <div className="settings-choice-grid">
                    {[1, 2, 3].map((i) => (
                      <div key={`method-skel-${i}`} className="settings-choice-card">
                        <div className="skeleton-shimmer" style={{ width: "130px", height: "18px", borderRadius: "4px", marginBottom: "8px" }} />
                        <div className="skeleton-shimmer" style={{ width: "100%", height: "12px", borderRadius: "4px" }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="settings-choice-grid">
                    {(["gps", "biometric", "both"] as AttendanceMethod[]).map((method) => (
                      <div
                        key={method}
                        onClick={() => handleSaveAttendanceMethod(method)}
                        className={`settings-choice-card ${attendanceMethod === method ? "selected" : ""}`}
                      >
                        <div className="settings-choice-header">
                          <div className="settings-choice-title-row">
                            {attendanceMethod === method ? (
                              <CheckCircle2 size={18} style={{ color: "var(--color-primary)" }} />
                            ) : (
                              <Circle size={18} style={{ color: "var(--color-text-muted)" }} />
                            )}
                            <span>{ATTENDANCE_METHOD_LABELS[method].label}</span>
                          </div>
                        </div>
                        <p className="settings-choice-desc">
                          {ATTENDANCE_METHOD_LABELS[method].description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ADMS Endpoint Card — shown only when biometric is involved */}
              {(attendanceMethod === "biometric" || attendanceMethod === "both") && (
                <div className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-header-left">
                      <h2 className="settings-card-title">Device Server URL (ADMS)</h2>
                      <p className="settings-card-subtitle">Configure your physical eSSL / Identix biometric devices with this cloud endpoint.</p>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <p className="settings-help-text" style={{ fontSize: "12px", lineHeight: "1.5" }}>
                      On your device screen: <strong>Menu → COMM. → Cloud Server Setting</strong>. Enable ADMS, set Enable Domain Name to <strong>ON</strong>, and paste the server address below:
                    </p>
                    <div className="settings-endpoint-box">
                      <code className="settings-endpoint-code">
                        {getAdmsEndpointUrl()}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopyEndpoint}
                        className={`settings-btn ${copiedEndpoint ? "settings-btn-primary" : "settings-btn-secondary"}`}
                      >
                        <Copy size={14} />
                        <span>{copiedEndpoint ? "Copied!" : "Copy"}</span>
                      </button>
                    </div>
                    <div className="settings-form-grid-3" style={{ marginTop: "4px" }}>
                      <div className="settings-user-storage-item">
                        <span className="settings-label">Port</span>
                        <span className="settings-cell-mono">443</span>
                      </div>
                      <div className="settings-user-storage-item">
                        <span className="settings-label">Protocol</span>
                        <span className="settings-cell-mono">HTTPS</span>
                      </div>
                      <div className="settings-user-storage-item">
                        <span className="settings-label">Domain Name</span>
                        <span className="settings-badge settings-badge-active">ON</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Devices Table — shown only when biometric is involved */}
              {(attendanceMethod === "biometric" || attendanceMethod === "both") && (
                <div className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-header-left">
                      <h2 className="settings-card-title">Registered Biometric Devices</h2>
                      <p className="settings-card-subtitle">Manage all hardware terminals connected to your intranet.</p>
                    </div>
                  </div>

                  {/* Add Device Form */}
                  <form
                    onSubmit={handleAddBiometricDevice}
                    style={{
                      backgroundColor: "var(--color-surface-subtle)",
                      padding: "16px",
                      borderRadius: "8px",
                      border: "1px solid var(--color-border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                      Register New Hardware Device
                    </h3>
                    <div className="settings-form-grid-3">
                      <input
                        type="text"
                        placeholder="Serial No. (e.g. ABI9232100001)"
                        value={newDeviceSerial}
                        onChange={(e) => setNewDeviceSerial(e.target.value)}
                        required
                        className="settings-input"
                      />
                      <input
                        type="text"
                        placeholder="Device Name (e.g. Main Entrance)"
                        value={newDeviceName}
                        onChange={(e) => setNewDeviceName(e.target.value)}
                        required
                        className="settings-input"
                      />
                      <select
                        value={newDeviceLocationId}
                        onChange={(e) => setNewDeviceLocationId(e.target.value)}
                        className="settings-select"
                      >
                        <option value="">Linked Location (optional)</option>
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="submit"
                        disabled={addingDevice}
                        className="settings-btn settings-btn-primary"
                      >
                        {addingDevice ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus size={14} />
                        )}
                        <span>{addingDevice ? "Adding..." : "Add Device"}</span>
                      </button>
                    </div>
                  </form>

                  {/* Devices list */}
                  <div className="settings-table-wrapper">
                    {biometricLoading ? (
                      <div className="settings-table-scroll">
                        <table className="settings-table">
                          <thead>
                            <tr>
                              <th>Device Name</th>
                              <th>Serial No.</th>
                              <th>Location</th>
                              <th>Last Seen</th>
                              <th>Status</th>
                              <th style={{ textAlign: "right" }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[1, 2, 3].map((i) => (
                              <tr key={`bio-skel-${i}`}>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <div className="skeleton-shimmer" style={{ width: "16px", height: "16px", borderRadius: "4px" }} />
                                    <div className="skeleton-shimmer" style={{ width: "120px", height: "14px", borderRadius: "4px" }} />
                                  </div>
                                </td>
                                <td>
                                  <div className="skeleton-shimmer" style={{ width: "110px", height: "14px", borderRadius: "4px" }} />
                                </td>
                                <td>
                                  <div className="skeleton-shimmer" style={{ width: "80px", height: "14px", borderRadius: "4px" }} />
                                </td>
                                <td>
                                  <div className="skeleton-shimmer" style={{ width: "95px", height: "14px", borderRadius: "4px" }} />
                                </td>
                                <td>
                                  <div className="skeleton-shimmer" style={{ width: "50px", height: "20px", borderRadius: "4px" }} />
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <div className="skeleton-shimmer" style={{ width: "28px", height: "28px", borderRadius: "6px", marginLeft: "auto" }} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : biometricDevices.length === 0 ? (
                      <div className="settings-table-empty">
                        <Fingerprint size={28} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                        <p>No biometric devices registered yet.</p>
                      </div>
                    ) : (
                      <div className="settings-table-scroll">
                        <table className="settings-table">
                          <thead>
                            <tr>
                              <th>Device Name</th>
                              <th>Serial No.</th>
                              <th>Location</th>
                              <th>Last Seen</th>
                              <th>Status</th>
                              <th style={{ textAlign: "right" }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {biometricDevices.map((device) => (
                              <tr key={device.id}>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                                    <Fingerprint
                                      size={16}
                                      style={{ color: device.is_active ? "var(--color-primary)" : "var(--color-text-muted)" }}
                                    />
                                    <span>{device.device_name}</span>
                                  </div>
                                </td>
                                <td className="settings-cell-mono">
                                  {device.device_serial}
                                </td>
                                <td>
                                  {locations.find((l) => l.id === device.office_location_id)
                                    ?.name ?? "—"}
                                </td>
                                <td>
                                  {device.last_seen_at
                                    ? new Date(device.last_seen_at).toLocaleString("en-IN", {
                                      day: "numeric",
                                      month: "short",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                    : "Never"}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleBiometricDevice(device.id, !device.is_active)
                                    }
                                    className={`settings-badge ${device.is_active ? "settings-badge-active" : "settings-badge-inactive"}`}
                                    style={{ cursor: "pointer", border: "none" }}
                                  >
                                    <span>{device.is_active ? "Active" : "Inactive"}</span>
                                  </button>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteBiometricDevice(device.id)}
                                    className="settings-btn settings-btn-danger settings-btn-icon"
                                    title="Delete device"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---------- CATEGORY: STORAGE ---------- */}
          {activeCategory === "storage" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-header-left">
                    <h2 className="settings-card-title">Cloud Usage Metrics</h2>
                    <p className="settings-card-subtitle">Organization file storage quota and employee usage breakdown.</p>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                  {storageLoading ? (
                    <div className="skeleton-shimmer" style={{ width: "100%", height: "48px", borderRadius: "6px" }} />
                  ) : (
                    <div className="settings-storage-meter">
                      <div className="settings-storage-icon-box">
                        <Database size={22} />
                      </div>
                      <div className="settings-storage-progress-col">
                        <div className="settings-storage-info-row">
                          <span>
                            {storageData?.usedDisplay || storageData?.usedGB || "0.00"}{" "}
                            <span style={{ fontWeight: 400, color: "var(--color-text-muted)" }}>
                              of {storageData?.limitGB || "5.00"} GB
                            </span>
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--color-primary)" }}>
                            {(storageData?.usedPercentage || 0).toFixed(1)}% used
                          </span>
                        </div>
                        <Progress
                          value={storageData?.usedPercentage || 0}
                          style={{ height: "8px" }}
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <h3 style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "12px" }}>
                      Storage Consumption by Employee
                    </h3>
                    {storageLoading ? (
                      <div className="settings-user-storage-list">
                        {[1, 2, 3].map((i) => (
                          <div key={`user-stor-skel-${i}`} className="settings-user-storage-item">
                            <div className="settings-user-storage-left">
                              <div className="skeleton-shimmer" style={{ width: "32px", height: "32px", borderRadius: "50%" }} />
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                <div className="skeleton-shimmer" style={{ width: "110px", height: "14px", borderRadius: "4px" }} />
                                <div className="skeleton-shimmer" style={{ width: "55px", height: "11px", borderRadius: "4px" }} />
                              </div>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                              <div className="skeleton-shimmer" style={{ width: "65px", height: "14px", borderRadius: "4px" }} />
                              <div className="skeleton-shimmer" style={{ width: "30px", height: "11px", borderRadius: "4px" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : storageData?.userStorage && storageData.userStorage.length > 0 ? (
                      <div className="settings-user-storage-list">
                        {storageData.userStorage.map((u) => (
                          <div
                            key={u.userId}
                            className="settings-user-storage-item"
                          >
                            <div className="settings-user-storage-left">
                              <Avatar style={{ width: "32px", height: "32px" }}>
                                {u.userAvatar && <AvatarImage src={u.userAvatar} />}
                                <AvatarFallback>{u.userName[0]}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                                  {u.userName}
                                </p>
                                <p style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                                  Employee
                                </p>
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <p className="settings-cell-mono" style={{ fontWeight: 600 }}>
                                {(u.usedBytes / (1024 * 1024)).toFixed(1)} MB
                              </p>
                              <p style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                                Used
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="settings-table-empty">
                        <p>No active storage usage data available.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------- CATEGORY: AUDIT LOGS ---------- */}
          {activeCategory === "audit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <div className="settings-card">
                <div className="settings-card-header">
                  <div className="settings-card-header-left">
                    <h2 className="settings-card-title">Security Event Ledger</h2>
                    <p className="settings-card-subtitle">Comprehensive audit trail of file management and security activities.</p>
                  </div>
                </div>

                <div className="settings-table-wrapper">
                  <div className="settings-table-scroll">
                    <table className="settings-table">
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Target Resource</th>
                          <th>Performed By</th>
                          <th style={{ textAlign: "right" }}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLoading ? (
                          [1, 2, 3, 4].map((i) => (
                            <tr key={`audit-skel-${i}`}>
                              <td>
                                <div className="skeleton-shimmer" style={{ width: "55px", height: "20px", borderRadius: "4px" }} />
                              </td>
                              <td>
                                <div className="skeleton-shimmer" style={{ width: "150px", height: "14px", borderRadius: "4px" }} />
                              </td>
                              <td>
                                <div className="skeleton-shimmer" style={{ width: "110px", height: "14px", borderRadius: "4px" }} />
                              </td>
                              <td style={{ textAlign: "right" }}>
                                <div className="skeleton-shimmer" style={{ width: "80px", height: "14px", borderRadius: "4px", marginLeft: "auto" }} />
                              </td>
                            </tr>
                          ))
                        ) : !auditLogs || auditLogs.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="settings-table-empty">
                              No security events recorded in the last 30 days.
                            </td>
                          </tr>
                        ) : (
                          auditLogs.map((log, idx) => (
                            <tr key={idx}>
                              <td>
                                <span
                                  className={`settings-badge ${log.action === "delete" ? "settings-badge-inactive" : "settings-badge-active"}`}
                                >
                                  {log.action}
                                </span>
                              </td>
                              <td style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                                {log.file_name}
                              </td>
                              <td>
                                {log.user_name}
                              </td>
                              <td style={{ textAlign: "right" }} className="settings-cell-mono">
                                {new Date(log.created_at || Date.now()).toLocaleDateString("en-IN", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ---------- CATEGORY: SHIFTS ---------- */}
          {activeCategory === "shifts" && (() => {
            const selectedDefaultPolicy = policies.find((p) => p.id === defaultPolicyId);
            const effectiveCompanyGrace = selectedDefaultPolicy ? (selectedDefaultPolicy.graceMinutes ?? 10) : (Number(lateGraceMinutes) || 10);

            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {/* SECTION 1: COMPANY DEFAULT SCHEDULE */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-header-left">
                      <h2 className="settings-card-title">Company Default Schedule</h2>
                      <p className="settings-card-subtitle">Standard working hours and late threshold applied across the organization.</p>
                    </div>
                  </div>

                  <div className="settings-form-grid">
                    {/* Row 1: Working Hours */}
                    <div className="settings-toggle-row">
                      <div className="settings-toggle-info">
                        <p className="settings-toggle-title">Standard Working Hours</p>
                        <p className="settings-toggle-desc">Daily clock-in and clock-out window.</p>
                      </div>
                      {loading ? (
                        <div className="skeleton-shimmer" style={{ width: "270px", height: "36px", borderRadius: "6px" }} />
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <input
                            type="time"
                            value={workStartTime}
                            onChange={(e) => setWorkStartTime(e.target.value)}
                            step="600"
                            className="settings-input"
                            style={{ width: "130px" }}
                          />
                          <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>to</span>
                          <input
                            type="time"
                            value={workEndTime}
                            onChange={(e) => setWorkEndTime(e.target.value)}
                            step="600"
                            className="settings-input"
                            style={{ width: "130px" }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Row 2: Late Arrival Buffer */}
                    <div className="settings-toggle-row">
                      <div className="settings-toggle-info">
                        <p className="settings-toggle-title">Late Arrival Grace Buffer</p>
                        <p className="settings-toggle-desc">
                          {selectedDefaultPolicy ? "Managed by selected policy." : "Permitted grace window before marked late."}
                        </p>
                      </div>
                      {loading ? (
                        <div className="skeleton-shimmer" style={{ width: "100px", height: "36px", borderRadius: "6px" }} />
                      ) : (
                        <div>
                          {selectedDefaultPolicy ? (
                            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                              <span>{selectedDefaultPolicy.graceMinutes ?? 10} minutes</span>
                              <span style={{ fontSize: "11px", color: "var(--color-text-muted)", marginLeft: "6px" }}>
                                (Inherited from {selectedDefaultPolicy.name})
                              </span>
                            </div>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={lateGraceMinutes}
                              onChange={(e) =>
                                setLateGraceMinutes(Math.max(0, parseInt(e.target.value || "0", 10)))
                              }
                              className="settings-input"
                              style={{ width: "100px" }}
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Row 3: Late Mark Policy */}
                    <div className="settings-toggle-row">
                      <div className="settings-toggle-info">
                        <p className="settings-toggle-title">Default Deduction Policy</p>
                        <p className="settings-toggle-desc">Monthly deduction rule applied to cumulative late marks.</p>
                      </div>
                      {loading ? (
                        <div className="skeleton-shimmer" style={{ width: "260px", height: "36px", borderRadius: "6px" }} />
                      ) : (
                        <div>
                          <select
                            value={defaultPolicyId || ""}
                            onChange={(e) => setDefaultPolicyId(e.target.value || null)}
                            className="settings-select"
                            style={{ minWidth: "260px" }}
                          >
                            <option value="">None (Simple late count)</option>
                            {policies.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.graceMinutes ?? 10}m grace • {LATE_MARK_PENALTY_LABELS[p.penaltyType]})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Footer Summary */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "12px", borderTop: "1px solid var(--color-border-subtle)", flexWrap: "wrap", gap: "12px" }}>
                      {loading ? (
                        <div className="skeleton-shimmer" style={{ width: "320px", height: "16px", borderRadius: "4px" }} />
                      ) : (
                        <p style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                          Active rule: <strong>{formatTime12h(workStartTime)} – {formatTime12h(workEndTime)}</strong> ({calculateShiftDuration(workStartTime, workEndTime).label}) • Cutoff at <strong>{calculateLateCutoffTime(workStartTime, effectiveCompanyGrace)}</strong>
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={loading || actionLoading}
                        onClick={handleSaveCompanyProfile}
                        className="settings-btn settings-btn-primary"
                      >
                        {actionLoading ? "Saving…" : "Save Changes"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: CUSTOM SHIFTS */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-header-left">
                      <h2 className="settings-card-title">Custom Shifts ({shifts.length})</h2>
                      <p className="settings-card-subtitle">Rotational, support, or department-specific work hours.</p>
                    </div>
                    <button
                      type="button"
                      onClick={openCreateShiftDialog}
                      className="settings-btn settings-btn-primary"
                    >
                      <Plus size={14} />
                      <span>Add Shift</span>
                    </button>
                  </div>

                  <div className="settings-table-wrapper">
                    <div className="settings-table-scroll">
                      <table className="settings-table">
                        <thead>
                          <tr>
                            <th>Shift Name</th>
                            <th>Timing Window</th>
                            <th>Duration</th>
                            <th>Linked Policy</th>
                            <th style={{ textAlign: "right" }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            [1, 2, 3].map((i) => (
                              <tr key={`shift-skel-${i}`}>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <div className="skeleton-shimmer" style={{ width: "16px", height: "16px", borderRadius: "4px" }} />
                                    <div className="skeleton-shimmer" style={{ width: "110px", height: "14px", borderRadius: "4px" }} />
                                  </div>
                                </td>
                                <td>
                                  <div className="skeleton-shimmer" style={{ width: "130px", height: "14px", borderRadius: "4px" }} />
                                </td>
                                <td>
                                  <div className="skeleton-shimmer" style={{ width: "55px", height: "14px", borderRadius: "4px" }} />
                                </td>
                                <td>
                                  <div className="skeleton-shimmer" style={{ width: "130px", height: "14px", borderRadius: "4px" }} />
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <div className="skeleton-shimmer" style={{ width: "64px", height: "28px", borderRadius: "6px", marginLeft: "auto" }} />
                                </td>
                              </tr>
                            ))
                          ) : shifts.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="settings-table-empty">
                                No custom shifts configured. Click <strong>Add Shift</strong> to create a custom schedule.
                              </td>
                            </tr>
                          ) : (
                            shifts.map((shift) => {
                              const duration = calculateShiftDuration(shift.startTime, shift.endTime);
                              const linkedPolicy = policies.find((p) => p.id === shift.lateMarkPolicyId);

                              return (
                                <tr key={shift.id}>
                                  <td>
                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                      <div style={{ color: "var(--color-primary)" }}>
                                        <Clock size={16} />
                                      </div>
                                      <div>
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                          <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                                            {shift.name}
                                          </span>
                                          {shift.isDefault && (
                                            <span className="settings-badge settings-badge-default">
                                              DEFAULT
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="settings-cell-mono">
                                    {formatTime12h(shift.startTime)} – {formatTime12h(shift.endTime)}
                                  </td>
                                  <td>
                                    <span>{duration.label}</span>
                                  </td>
                                  <td>
                                    {linkedPolicy ? (
                                      <span style={{ color: "var(--color-text-primary)" }}>
                                        {linkedPolicy.name} ({linkedPolicy.graceMinutes ?? 10}m grace)
                                      </span>
                                    ) : (
                                      <span style={{ color: "var(--color-text-muted)" }}>
                                        None (Simple count)
                                      </span>
                                    )}
                                  </td>
                                  <td style={{ textAlign: "right" }}>
                                    <div style={{ display: "inline-flex", gap: "4px" }}>
                                      {!shift.isDefault && (
                                        <button
                                          type="button"
                                          title="Set as organization default"
                                          onClick={() => handleSetDefaultShift(shift.id)}
                                          className="settings-btn-icon"
                                        >
                                          <Star size={14} />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        title="Edit shift"
                                        onClick={() => openEditShiftDialog(shift)}
                                        className="settings-btn-icon"
                                      >
                                        <SquarePen size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        title="Delete shift"
                                        onClick={() => handleDeleteShift(shift.id)}
                                        className="settings-btn-icon"
                                        style={{ color: "#ef4444" }}
                                      >
                                        <Trash2 size={14} />
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

                {/* SECTION 3: LATE MARK POLICIES */}
                <div className="settings-card">
                  <div className="settings-card-header">
                    <div className="settings-card-header-left">
                      <h2 className="settings-card-title">Late Mark Policies ({policies.length})</h2>
                      <p className="settings-card-subtitle">Automated deduction rules for cumulative late arrivals.</p>
                    </div>
                    <button
                      type="button"
                      onClick={openCreatePolicyDialog}
                      className="settings-btn settings-btn-primary"
                    >
                      <Plus size={14} />
                      <span>Add Policy</span>
                    </button>
                  </div>

                  <div className="settings-table-wrapper">
                    <div className="settings-table-scroll">
                      <table className="settings-table">
                        <thead>
                          <tr>
                            <th>Policy Name</th>
                            <th>Grace Buffer</th>
                            <th>Deduction Rule</th>
                            <th style={{ textAlign: "right" }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            [1, 2].map((i) => (
                              <tr key={`policy-skel-${i}`}>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <div className="skeleton-shimmer" style={{ width: "16px", height: "16px", borderRadius: "4px" }} />
                                    <div className="skeleton-shimmer" style={{ width: "120px", height: "14px", borderRadius: "4px" }} />
                                  </div>
                                </td>
                                <td>
                                  <div className="skeleton-shimmer" style={{ width: "60px", height: "20px", borderRadius: "4px" }} />
                                </td>
                                <td>
                                  <div className="skeleton-shimmer" style={{ width: "190px", height: "14px", borderRadius: "4px" }} />
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <div className="skeleton-shimmer" style={{ width: "52px", height: "28px", borderRadius: "6px", marginLeft: "auto" }} />
                                </td>
                              </tr>
                            ))
                          ) : policies.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="settings-table-empty">
                                No late mark policies configured. Click <strong>Add Policy</strong> to create monthly rules.
                              </td>
                            </tr>
                          ) : (
                            policies.map((policy) => (
                              <tr key={policy.id}>
                                <td>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <div style={{ color: "var(--color-primary)" }}>
                                      <ShieldAlert size={16} />
                                    </div>
                                    <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                                      {policy.name}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <span className="settings-badge settings-badge-default">
                                    {policy.graceMinutes ?? 10} mins
                                  </span>
                                </td>
                                <td>
                                  {policy.penaltyType === "half_day_after_marks" ? (
                                    <span>
                                      After <strong>{policy.lateMarksCount} late marks</strong>, subsequent late check-ins = <strong>0.5 day deduction</strong>
                                    </span>
                                  ) : (
                                    <span>
                                      Every <strong>{policy.lateMarksCount} late marks</strong> = <strong>0.5 day deduction</strong>
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <div style={{ display: "inline-flex", gap: "4px" }}>
                                    <button
                                      type="button"
                                      title="Edit policy"
                                      onClick={() => openEditPolicyDialog(policy)}
                                      className="settings-btn-icon"
                                    >
                                      <SquarePen size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      title="Delete policy"
                                      onClick={() => handleDeletePolicy(policy.id)}
                                      className="settings-btn-icon"
                                      style={{ color: "#ef4444" }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Dialog for adding new geofence location */}
      <Dialog open={openAddLocDialog} onOpenChange={setOpenAddLocDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>
              Add Office Location
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddLocation} className="settings-form-grid" style={{ marginTop: "12px" }}>
            <div className="settings-field">
              <label className="settings-label">
                Office Location Name
              </label>
              <input
                type="text"
                placeholder="e.g. Nashik Office HQ"
                value={newLocName}
                onChange={(e) => setNewLocName(e.target.value)}
                required
                className="settings-input"
              />
            </div>
            <div>
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={detectingLocation}
                className="settings-btn settings-btn-secondary"
                style={{ width: "100%" }}
              >
                {detectingLocation ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <MapPin size={14} />
                )}
                <span>{detectingLocation ? "Detecting GPS..." : "Use My Current Location"}</span>
              </button>
            </div>
            <div className="settings-form-grid-2">
              <div className="settings-field">
                <label className="settings-label">
                  Latitude
                </label>
                <input
                  type="text"
                  placeholder="e.g. 19.9975"
                  value={newLocLat}
                  onChange={(e) => setNewLocLat(e.target.value)}
                  required
                  className="settings-input"
                />
              </div>
              <div className="settings-field">
                <label className="settings-label">
                  Longitude
                </label>
                <input
                  type="text"
                  placeholder="e.g. 73.7898"
                  value={newLocLng}
                  onChange={(e) => setNewLocLng(e.target.value)}
                  required
                  className="settings-input"
                />
              </div>
            </div>
            <div className="settings-field">
              <label className="settings-label">
                Geofence Radius (meters)
              </label>
              <input
                type="number"
                min="10"
                step="10"
                value={newLocRadius}
                onChange={(e) => setNewLocRadius(e.target.value)}
                required
                className="settings-input"
              />
            </div>
            <DialogFooter style={{ marginTop: "12px" }}>
              <button
                type="button"
                onClick={() => setOpenAddLocDialog(false)}
                className="settings-btn settings-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading}
                className="settings-btn settings-btn-primary"
              >
                {actionLoading ? "Adding..." : "Add Location"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for adding / editing shift */}
      <Dialog open={shiftDialogOpen} onOpenChange={setShiftDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingShiftId ? "Edit Shift Schedule" : "New Shift Schedule"}
            </DialogTitle>
          </DialogHeader>
          <div className="settings-form-grid" style={{ marginTop: "12px" }}>
            <div className="settings-field">
              <label className="settings-label">
                Shift Name
              </label>
              <input
                type="text"
                placeholder="e.g. Night Shift, Sales Team"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                className="settings-input"
              />
            </div>
            <div className="settings-form-grid-2">
              <div className="settings-field">
                <label className="settings-label">
                  Start Time
                </label>
                <input
                  type="time"
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  step="600"
                  className="settings-input"
                />
              </div>
              <div className="settings-field">
                <label className="settings-label">
                  End Time
                </label>
                <input
                  type="time"
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  step="600"
                  className="settings-input"
                />
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={shiftIsDefault}
                onChange={(e) => setShiftIsDefault(e.target.checked)}
              />
              <span>Set as company default shift</span>
            </label>
            <div className="settings-field">
              <label className="settings-label">
                Late Mark Policy
              </label>
              <select
                value={shiftPolicyId}
                onChange={(e) => setShiftPolicyId(e.target.value)}
                className="settings-select"
              >
                <option value="">No policy</option>
                {policies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {describeLateMarkPolicy(p)}
                  </option>
                ))}
              </select>
              <p className="settings-help-text">
                Applied when counting late marks against this shift's employees.
              </p>
            </div>
          </div>
          <DialogFooter style={{ marginTop: "12px" }}>
            <button
              type="button"
              onClick={() => setShiftDialogOpen(false)}
              className="settings-btn settings-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={shiftSaving}
              onClick={handleSaveShift}
              className="settings-btn settings-btn-primary"
            >
              {shiftSaving ? "Saving…" : editingShiftId ? "Save Changes" : "Create Shift"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog for adding / editing late mark policy */}
      <Dialog open={policyDialogOpen} onOpenChange={setPolicyDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingPolicyId ? "Edit Late Mark Policy" : "New Late Mark Policy"}
            </DialogTitle>
          </DialogHeader>
          <div className="settings-form-grid" style={{ marginTop: "12px" }}>
            <div className="settings-field">
              <label className="settings-label">
                Policy Name
              </label>
              <input
                type="text"
                placeholder="e.g. Strict Lateness, 3 Strikes"
                value={policyName}
                onChange={(e) => setPolicyName(e.target.value)}
                className="settings-input"
              />
            </div>
            <div className="settings-field">
              <label className="settings-label">
                Policy Type
              </label>
              <div className="settings-choice-grid">
                <div
                  className={`settings-choice-card ${policyPenaltyType === "half_day_after_marks" ? "selected" : ""}`}
                  onClick={() => setPolicyPenaltyType("half_day_after_marks")}
                >
                  <div className="settings-choice-header">
                    <span style={{ fontSize: "12px", fontWeight: 600 }}>Half day after N marks</span>
                    <input
                      type="radio"
                      name="policyPenaltyType"
                      value="half_day_after_marks"
                      checked={policyPenaltyType === "half_day_after_marks"}
                      onChange={(e) => setPolicyPenaltyType(e.target.value as LateMarkPenaltyType)}
                    />
                  </div>
                  <p className="settings-choice-desc">
                    After N late marks in a month, subsequent late punches count as half days.
                  </p>
                </div>
                <div
                  className={`settings-choice-card ${policyPenaltyType === "marks_to_half_day" ? "selected" : ""}`}
                  onClick={() => setPolicyPenaltyType("marks_to_half_day")}
                >
                  <div className="settings-choice-header">
                    <span style={{ fontSize: "12px", fontWeight: 600 }}>N marks = 1 half day</span>
                    <input
                      type="radio"
                      name="policyPenaltyType"
                      value="marks_to_half_day"
                      checked={policyPenaltyType === "marks_to_half_day"}
                      onChange={(e) => setPolicyPenaltyType(e.target.value as LateMarkPenaltyType)}
                    />
                  </div>
                  <p className="settings-choice-desc">
                    Every N late marks accumulate into 1 half day deduction.
                  </p>
                </div>
              </div>
            </div>
            <div className="settings-field">
              <label className="settings-label">
                Grace Period Before Late Mark (Minutes)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 10, 15, 30"
                value={policyGraceMinutes}
                onChange={(e) => setPolicyGraceMinutes(e.target.value)}
                className="settings-input"
              />
              <p className="settings-help-text">
                Punches after shift start time + N minutes will be marked Late.
              </p>
            </div>
            <div className="settings-field">
              <label className="settings-label">
                Late Marks Count (N)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={policyCount}
                onChange={(e) => setPolicyCount(e.target.value)}
                className="settings-input"
              />
            </div>
          </div>
          <DialogFooter style={{ marginTop: "12px" }}>
            <button
              type="button"
              onClick={() => setPolicyDialogOpen(false)}
              className="settings-btn settings-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={policySaving}
              onClick={handleSavePolicy}
              className="settings-btn settings-btn-primary"
            >
              {policySaving ? "Saving…" : editingPolicyId ? "Save Changes" : "Create Policy"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
