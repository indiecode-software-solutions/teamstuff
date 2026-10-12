import React from "react";
import {
  Download as FileDownload,
  FileUp as UploadFile,
  CircleCheck as CheckCircle,
  TriangleAlert as WarningAmber,
  ReceiptText as ReceiptLong,
  Settings as Settings,
  Plus as Add,
  Trash2 as Delete,
  ChevronRight as KeyboardArrowRight,
  IndianRupee,
  Wallet,
  Users,
  TrendingUp,
  Image as ImageIcon,
  Stamp as StampIcon,
  PenTool as PenToolIcon,
  Building2 as BuildingIcon,
  X as CloseIcon,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  getCompanyPayslips,
  getPayslipColumns,
  getDefaultPayslipColumns,
  savePayslipColumns,
  sendPayslips,
  deletePayslipCycle,
  uploadPayslipLogo,
  savePayslipLogo,
  uploadPayslipStamp,
  savePayslipStamp,
  uploadPayslipSignature,
  savePayslipSignature,
  savePayslipSignMode,
  saveCompanyLegalDetails,
  getPayslipBranding,
  uniqueSlug,
  slugify,
  type PayslipColumn,
  type PayslipColumns,
  type PayslipInputRow,
  type PayslipRecord,
  type PayslipSignMode,
} from "../../lib/payslips";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Skeleton } from "../ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

interface PayslipsTabProps {
  showToast: (msg: string, severity?: "success" | "error" | "info" | "warning") => void;
}

interface ReviewRow extends PayslipInputRow {
  rowIndex: number;
  invalidAmounts: string[];
  noEmployeeMatch: boolean;
}

function monthOptions(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(d.toLocaleDateString(undefined, { month: "long", year: "numeric" }));
  }
  return out;
}

const PAYSLIP_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseCycleMonth(payPeriod: string): Date {
  const m = payPeriod.match(/([A-Za-z]+)\s+(\d{4})/);
  const idx = PAYSLIP_MONTHS.indexOf(m?.[1] ?? "");
  const year = Number(m?.[2] ?? 0) || 0;
  return new Date(year, idx === -1 ? 0 : idx, 1);
}

function formatMoney(n: number): string {
  return `₹${(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function parseNumber(raw: unknown): { value: number; ok: boolean } {
  const text = String(raw ?? "")
    .replace(/[₹$,\s]/g, "")
    .trim();
  if (!text) return { value: 0, ok: true };
  const n = Number(text);
  if (Number.isNaN(n) || n < 0) return { value: 0, ok: false };
  return { value: n, ok: true };
}

function parseMetadataValue(key: string, label: string, raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  const text = String(raw).trim();
  if (!text) return "";

  // If this is a date field (like Pay Date) and Excel passed an integer serial number (e.g. 46239)
  const isDateKey = key.includes("date") || label.toLowerCase().includes("date");
  if (isDateKey) {
    if (typeof raw === "number" || (/^\d{4,6}$/.test(text) && !text.includes("-") && !text.includes("/"))) {
      const serial = Number(text);
      if (!Number.isNaN(serial) && serial > 20000 && serial < 80000) {
        const utcDays = Math.floor(serial - 25569);
        const date = new Date(utcDays * 86400 * 1000);
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(date.getUTCDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      }
    }
    const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (dmy) {
      const p1 = Number(dmy[1]);
      const p2 = Number(dmy[2]);
      let yyyy = Number(dmy[3]);
      if (yyyy < 100) yyyy += 2000;
      const mm = String(p2 <= 12 ? p2 : p1).padStart(2, "0");
      const dd = String(p2 <= 12 ? p1 : p2).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return text;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickColumn(keys: string[], candidates: string[]): string | undefined {
  const normalized = keys.map((k) => normalizeHeader(k));
  for (const c of candidates) {
    const idx = normalized.indexOf(normalizeHeader(c));
    if (idx !== -1) return keys[idx];
  }
  return undefined;
}

export function PayslipsTab({ showToast }: PayslipsTabProps) {
  const [payPeriod, setPayPeriod] = React.useState(monthOptions()[0] ?? "");
  const [mode, setMode] = React.useState<"idle" | "review">("idle");
  const [employees, setEmployees] = React.useState<any[]>([]);
  const [reviewRows, setReviewRows] = React.useState<ReviewRow[]>([]);
  const [parsing, setParsing] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [columns, setColumns] = React.useState<PayslipColumns | null>(getDefaultPayslipColumns());
  const [cycles, setCycles] = React.useState<
    {
      payPeriod: string;
      count: number;
      sentAt: string;
      gross: number;
      deductions: number;
      net: number;
    }[]
  >([]);
  const [cyclesLoading, setCyclesLoading] = React.useState(false);
  const [chartYear, setChartYear] = React.useState<number>(new Date().getFullYear());
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Cycle batch dialog state
  const [batchDialogOpen, setBatchDialogOpen] = React.useState(false);
  const [batchLoading, setBatchLoading] = React.useState(false);
  const [batchPeriod, setBatchPeriod] = React.useState("");
  const [batchRows, setBatchRows] = React.useState<
    { payslip: PayslipRecord; name: string; employeeCode: string }[]
  >([]);

  // Column settings dialog state
  const [colDialogOpen, setColDialogOpen] = React.useState(false);
  const [draftMetadata, setDraftMetadata] = React.useState<PayslipColumn[]>([]);
  const [draftEarnings, setDraftEarnings] = React.useState<PayslipColumn[]>([]);
  const [draftDeductions, setDraftDeductions] = React.useState<PayslipColumn[]>([]);
  const [savingColumns, setSavingColumns] = React.useState(false);

  // Payslip Branding states (Logo, Stamp, Signature, Sign Mode)
  const [companyLogo, setCompanyLogo] = React.useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);
  const logoInputRef = React.useRef<HTMLInputElement | null>(null);

  const [companyStamp, setCompanyStamp] = React.useState<string | null>(null);
  const [uploadingStamp, setUploadingStamp] = React.useState(false);
  const stampInputRef = React.useRef<HTMLInputElement | null>(null);

  const [companySignature, setCompanySignature] = React.useState<string | null>(null);
  const [uploadingSignature, setUploadingSignature] = React.useState(false);
  const signatureInputRef = React.useRef<HTMLInputElement | null>(null);

  const [signMode, setSignMode] = React.useState<PayslipSignMode>("digital_notice");
  const [savingSignMode, setSavingSignMode] = React.useState(false);

  // Company Legal / Header Details state
  const [companyFullName, setCompanyFullName] = React.useState<string>("");
  const [companyCin, setCompanyCin] = React.useState<string>("");
  const [companyPan, setCompanyPan] = React.useState<string>("");
  const [companyAddress, setCompanyAddress] = React.useState<string>("");

  const [companyInfoDialogOpen, setCompanyInfoDialogOpen] = React.useState(false);
  const [infoFormFullName, setInfoFormFullName] = React.useState("");
  const [infoFormCin, setInfoFormCin] = React.useState("");
  const [infoFormPan, setInfoFormPan] = React.useState("");
  const [infoFormAddress, setInfoFormAddress] = React.useState("");
  const [savingCompanyInfo, setSavingCompanyInfo] = React.useState(false);

  async function getCompanyId(): Promise<string | null> {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();
      return profile?.company_id || null;
    } catch {
      return null;
    }
  }

  async function loadCompanyBranding() {
    const companyId = await getCompanyId();
    if (!companyId) return;
    const branding = await getPayslipBranding(companyId);
    if (branding.logoUrl) setCompanyLogo(branding.logoUrl);
    if (branding.stampUrl) setCompanyStamp(branding.stampUrl);
    if (branding.signatureUrl) setCompanySignature(branding.signatureUrl);
    if (branding.signMode) setSignMode(branding.signMode);
    if (branding.fullName) setCompanyFullName(branding.fullName);
    if (branding.cin) setCompanyCin(branding.cin);
    if (branding.panNumber) setCompanyPan(branding.panNumber);
    if (branding.address) setCompanyAddress(branding.address);
  }

  function openCompanyInfoDialog() {
    setInfoFormFullName(companyFullName);
    setInfoFormCin(companyCin);
    setInfoFormPan(companyPan);
    setInfoFormAddress(companyAddress);
    setCompanyInfoDialogOpen(true);
  }

  async function handleSaveCompanyLegalInfo() {
    const companyId = await getCompanyId();
    if (!companyId) return;
    setSavingCompanyInfo(true);
    try {
      const res = await saveCompanyLegalDetails({
        data: {
          companyId,
          fullName: infoFormFullName.trim() || null,
          cin: infoFormCin.trim() || null,
          panNumber: infoFormPan.trim() || null,
          address: infoFormAddress.trim() || null,
        },
      });
      if (res.success) {
        setCompanyFullName(infoFormFullName.trim());
        setCompanyCin(infoFormCin.trim());
        setCompanyPan(infoFormPan.trim());
        setCompanyAddress(infoFormAddress.trim());
        setCompanyInfoDialogOpen(false);
        showToast("Company header info updated successfully!", "success");
      } else {
        showToast(res.error || "Failed to update company info.", "error");
      }
    } catch (err: any) {
      showToast(err?.message || "Failed to save company information.", "error");
    } finally {
      setSavingCompanyInfo(false);
    }
  }

  async function handleSignModeChange(newMode: PayslipSignMode) {
    setSignMode(newMode);
    const companyId = await getCompanyId();
    if (!companyId) return;
    setSavingSignMode(true);
    try {
      const res = await savePayslipSignMode({ data: { companyId, signMode: newMode } });
      if (res.success) {
        showToast(
          newMode === "stamp_and_signature"
            ? "Payslip mode set to: Stamp & Authorized Signature."
            : "Payslip mode set to: Digitally Generated Notice (no signature required).",
          "success",
        );
      } else {
        showToast("Failed to save payslip signature mode preference.", "error");
      }
    } catch (err: any) {
      showToast(err?.message || "Error updating signature mode.", "error");
    } finally {
      setSavingSignMode(false);
    }
  }

  async function handleLogoSelected(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file (PNG, JPG, SVG, WebP).", "warning");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image must be smaller than 5 MB.", "warning");
      return;
    }
    const companyId = await getCompanyId();
    if (!companyId) {
      showToast("Could not determine your company.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = String(reader.result || "");
      setUploadingLogo(true);
      try {
        const uploadRes = await uploadPayslipLogo({
          data: { base64Data, companyId },
        });
        if (!uploadRes.success || !("secure_url" in uploadRes) || !uploadRes.secure_url) {
          showToast(`Logo upload failed. ${"error" in uploadRes ? uploadRes.error : ""}`, "error");
          return;
        }
        const saveRes = await savePayslipLogo({
          data: { companyId, logoUrl: uploadRes.secure_url },
        });
        if (!saveRes.success) {
          showToast(`Failed to save payslip logo configuration. ${saveRes.error || ""}`, "error");
          return;
        }
        setCompanyLogo(uploadRes.secure_url);
        showToast("Payslip logo updated! It will appear top left on payslips.", "success");
      } catch (err: any) {
        showToast(err?.message || "Failed to upload logo.", "error");
      } finally {
        setUploadingLogo(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleStampSelected(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file (PNG, JPG, SVG, WebP).", "warning");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image must be smaller than 5 MB.", "warning");
      return;
    }
    const companyId = await getCompanyId();
    if (!companyId) {
      showToast("Could not determine your company.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = String(reader.result || "");
      setUploadingStamp(true);
      try {
        const uploadRes = await uploadPayslipStamp({
          data: { base64Data, companyId },
        });
        if (!uploadRes.success || !("secure_url" in uploadRes) || !uploadRes.secure_url) {
          showToast(`Stamp upload failed. ${"error" in uploadRes ? uploadRes.error : ""}`, "error");
          return;
        }
        const saveRes = await savePayslipStamp({
          data: { companyId, stampUrl: uploadRes.secure_url },
        });
        if (!saveRes.success) {
          showToast(`Failed to save stamp configuration. ${saveRes.error || ""}`, "error");
          return;
        }
        setCompanyStamp(uploadRes.secure_url);
        showToast("Company stamp updated! It will appear on the footer of all payslips.", "success");
      } catch (err: any) {
        showToast(err?.message || "Failed to upload stamp.", "error");
      } finally {
        setUploadingStamp(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSignatureSelected(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file (PNG, JPG, SVG, WebP).", "warning");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image must be smaller than 5 MB.", "warning");
      return;
    }
    const companyId = await getCompanyId();
    if (!companyId) {
      showToast("Could not determine your company.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = String(reader.result || "");
      setUploadingSignature(true);
      try {
        const uploadRes = await uploadPayslipSignature({
          data: { base64Data, companyId },
        });
        if (!uploadRes.success || !("secure_url" in uploadRes) || !uploadRes.secure_url) {
          showToast(`Signature upload failed. ${"error" in uploadRes ? uploadRes.error : ""}`, "error");
          return;
        }
        const saveRes = await savePayslipSignature({
          data: { companyId, signatureUrl: uploadRes.secure_url },
        });
        if (!saveRes.success) {
          showToast(`Failed to save signature configuration. ${saveRes.error || ""}`, "error");
          return;
        }
        setCompanySignature(uploadRes.secure_url);
        showToast("Authorized signature updated! It will appear on the footer of all payslips.", "success");
      } catch (err: any) {
        showToast(err?.message || "Failed to upload signature.", "error");
      } finally {
        setUploadingSignature(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function loadEmployees() {
    const companyId = await getCompanyId();
    if (!companyId) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, name, employee_code, job_title")
      .eq("company_id", companyId)
      .order("name", { ascending: true });
    setEmployees(data || []);
  }

  async function loadPayslipColumns() {
    const companyId = await getCompanyId();
    if (!companyId) return;
    const cols = await getPayslipColumns(companyId);
    setColumns(cols || getDefaultPayslipColumns());
  }

  async function loadCycles() {
    const companyId = await getCompanyId();
    if (!companyId) return;
    const records = await getCompanyPayslips(companyId);
    const grouped = new Map<
      string,
      { count: number; sentAt: string; gross: number; deductions: number; net: number }
    >();
    records.forEach((r) => {
      const cur = grouped.get(r.pay_period);
      const ts = r.created_at;
      if (cur) {
        cur.count += 1;
        if (ts > cur.sentAt) cur.sentAt = ts;
        cur.gross += r.gross_pay;
        cur.deductions += r.total_deductions;
        cur.net += r.net_pay;
      } else {
        grouped.set(r.pay_period, {
          count: 1,
          sentAt: ts,
          gross: r.gross_pay,
          deductions: r.total_deductions,
          net: r.net_pay,
        });
      }
    });
    setCycles(
      [...grouped.entries()]
        .map(([payPeriod, v]) => ({ payPeriod, ...v }))
        .sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt)),
    );
  }

  async function openCycleBatch(payPeriod: string) {
    const companyId = await getCompanyId();
    if (!companyId) return;
    setBatchPeriod(payPeriod);
    setBatchDialogOpen(true);
    setBatchLoading(true);
    setBatchRows([]);
    try {
      const [records, profileRes] = await Promise.all([
        getCompanyPayslips(companyId),
        supabase.from("profiles").select("id, name, employee_code").eq("company_id", companyId),
      ]);
      const profileById = new Map<string, { name: string; employeeCode: string }>();
      (profileRes.data || []).forEach((p: any) => {
        profileById.set(p.id, {
          name: p.name || "Unknown",
          employeeCode: p.employee_code || "—",
        });
      });
      setBatchRows(
        records
          .filter((r) => r.pay_period === payPeriod)
          .map((r) => ({
            payslip: r,
            name: profileById.get(r.user_id)?.name || "Unknown",
            employeeCode: profileById.get(r.user_id)?.employeeCode || "—",
          })),
      );
    } catch (err) {
      console.error("Error loading cycle batch:", err);
    } finally {
      setBatchLoading(false);
    }
  }

  // Delete cycle state & handler
  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [cycleToDelete, setCycleToDelete] = React.useState<string | null>(null);
  const [deletingCycle, setDeletingCycle] = React.useState(false);

  function promptDeleteCycle(payPeriod: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setCycleToDelete(payPeriod);
    setDeleteConfirmOpen(true);
  }

  async function handleConfirmDeleteCycle() {
    if (!cycleToDelete) return;
    const companyId = await getCompanyId();
    if (!companyId) return;
    setDeletingCycle(true);
    try {
      const res = await deletePayslipCycle({
        data: { companyId, payPeriod: cycleToDelete },
      });
      if (res.success) {
        showToast(`Deleted payslip cycle ${cycleToDelete}. All employee records and metrics updated.`, "success");
        setDeleteConfirmOpen(false);
        setBatchDialogOpen(false);
        setCycleToDelete(null);
        setCyclesLoading(true);
        await loadCycles();
      } else {
        showToast(res.error || "Failed to delete cycle.", "error");
      }
    } catch (err: any) {
      showToast(err?.message || "Failed to delete cycle.", "error");
    } finally {
      setDeletingCycle(false);
      setCyclesLoading(false);
    }
  }

  React.useEffect(() => {
    loadEmployees();
    loadPayslipColumns();
    loadCompanyBranding();
    setCyclesLoading(true);
    loadCycles().finally(() => setCyclesLoading(false));
  }, []);

  function openColumnSettings() {
    setDraftMetadata((columns?.metadata || []).map((c) => ({ ...c })));
    setDraftEarnings((columns?.earnings || []).map((c) => ({ ...c })));
    setDraftDeductions((columns?.deductions || []).map((c) => ({ ...c })));
    setColDialogOpen(true);
  }

  async function handleSaveColumns() {
    const metadata = draftMetadata
      .map((c) => ({ ...c, label: c.label.trim() }))
      .filter((c) => c.label.length > 0);
    const earnings = draftEarnings
      .map((c) => ({ ...c, label: c.label.trim() }))
      .filter((c) => c.label.length > 0);
    const deductions = draftDeductions
      .map((c) => ({ ...c, label: c.label.trim() }))
      .filter((c) => c.label.length > 0);

    if (earnings.length === 0 && deductions.length === 0 && metadata.length === 0) {
      showToast("Add at least one column before saving.", "warning");
      return;
    }

    const used = new Set<string>();
    const keyedMetadata = metadata.map((c) => {
      const key = c.key ? slugify(c.key) : uniqueSlug(c.label, used);
      used.add(key);
      return { key, label: c.label };
    });
    const keyedEarnings = earnings.map((c) => {
      const key = c.key ? slugify(c.key) : uniqueSlug(c.label, used);
      used.add(key);
      return { key, label: c.label };
    });
    const keyedDeductions = deductions.map((c) => {
      const key = c.key ? slugify(c.key) : uniqueSlug(c.label, used);
      used.add(key);
      return { key, label: c.label };
    });

    const companyId = await getCompanyId();
    if (!companyId) {
      showToast("Could not resolve your company.", "error");
      return;
    }

    setSavingColumns(true);
    try {
      const result = await savePayslipColumns({
        data: {
          companyId,
          metadata: keyedMetadata,
          earnings: keyedEarnings,
          deductions: keyedDeductions,
        },
      });
      if (!result.success) {
        showToast(
          `Failed to save columns. ${result.error || ""} Make sure the payslip SQL migration has been run in Supabase.`,
          "error",
        );
        return;
      }
      setColDialogOpen(false);
      setColumns({
        metadata: keyedMetadata,
        earnings: keyedEarnings,
        deductions: keyedDeductions,
      });
      showToast(
        `Payslip columns updated — ${keyedMetadata.length} employee details, ${keyedEarnings.length} earnings, ${keyedDeductions.length} deductions.`,
        "success",
      );
    } finally {
      setSavingColumns(false);
    }
  }

  async function handleDownloadTemplate() {
    try {
      const XLSX = await import("xlsx");
      const metadata = columns?.metadata || [];
      const earnings = columns?.earnings || [];
      const deductions = columns?.deductions || [];
      const header = [
        "Employee Code",
        "Employee Name",
        ...metadata.map((c) => c.label),
        ...earnings.map((c) => c.label),
        ...deductions.map((c) => c.label),
      ];
      const aoa: (string | number)[][] = [header];
      employees.forEach((emp) => {
        aoa.push([emp.employee_code || "", emp.name || ""]);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = header.map((c, idx) => ({
        wch: idx <= 1 ? Math.max(c.length + 4, idx === 1 ? 24 : 14) : 20,
      }));
      const headerCell = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "0F766E" } },
      };
      header.forEach((_, idx) => {
        const cell = ws[XLSX.utils.encode_cell({ r: 0, c: idx })];
        if (cell) Object.assign(cell.s || (cell.s = {}), headerCell);
      });
      ws["!freeze"] = { xSplit: 0, ySplit: 1 };

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Payslips");
      XLSX.writeFile(wb, `Payslip_Template_${payPeriod.replace(/\s+/g, "_")}.xlsx`);
      showToast(
        `Template downloaded — fill the ${employees.length || 0} employee rows and upload back.`,
        "info",
      );
    } catch (err) {
      console.error("Template download failed:", err);
      showToast("Could not generate the template file.", "error");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!companyLogo) {
      showToast("Please upload a Payslip Logo before uploading and generating payslips.", "warning");
      logoInputRef.current?.click();
      return;
    }

    setParsing(true);
    const metadata = columns?.metadata || [];
    const earnings = columns?.earnings || [];
    const deductions = columns?.deductions || [];
    const amountColumns = [...earnings, ...deductions];

    const companyId = await getCompanyId();
    const { data: allProfiles } = companyId
      ? await supabase
          .from("profiles")
          .select("id, name, employee_code")
          .eq("company_id", companyId)
      : { data: null };

    const codeSet = new Set(
      (allProfiles || [])
        .map((p: any) =>
          String(p.employee_code || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    );
    const nameSet = new Set(
      (allProfiles || [])
        .map((p: any) =>
          String(p.name || "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    );

    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const sheet = wb.Sheets[wb.SheetNames[0] || ""];
      if (!sheet) {
        showToast("The uploaded file has no sheets.", "warning");
        return;
      }
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];

      const keys = json.length > 0 ? Object.keys(json[0] as object) : [];
      const codeKey = pickColumn(keys, ["Employee Code", "Emp Code", "Code", "Employee ID"]);
      const nameKey = pickColumn(keys, ["Employee Name", "Name", "Employee"]);

      // Map metadata columns
      const metaHeaderMap = new Map<string, string>();
      metadata.forEach((col) => {
        const found = pickColumn(keys, [col.label, col.key]);
        if (found) metaHeaderMap.set(col.key, found);
      });

      // Map amount columns
      const colHeaderMap = new Map<string, string>();
      amountColumns.forEach((col) => {
        const found = pickColumn(keys, [col.label, col.key]);
        if (found) colHeaderMap.set(col.key, found);
      });

      const missingCols = amountColumns.filter((c) => !colHeaderMap.has(c.key));
      if (missingCols.length > 0) {
        showToast(
          `Could not find ${missingCols.length} amount column(s) in the sheet: ${missingCols
            .map((c) => c.label)
            .join(", ")}. Amounts for these will be 0.`,
          "warning",
        );
      }

      const rows: ReviewRow[] = [];
      json.forEach((raw, idx) => {
        const employeeCode = String(raw[codeKey!] ?? "").trim();
        const name = String(raw[nameKey!] ?? "").trim();

        const rowMetadata: Record<string, string | number> = {};
        metadata.forEach((col) => {
          const headerKey = metaHeaderMap.get(col.key);
          if (headerKey && raw[headerKey] !== undefined && raw[headerKey] !== null) {
            rowMetadata[col.key] = parseMetadataValue(col.key, col.label, raw[headerKey]);
          }
        });

        const rowEarnings: Record<string, number> = {};
        const rowDeductions: Record<string, number> = {};
        const invalidAmounts: string[] = [];

        amountColumns.forEach((col) => {
          const headerKey = colHeaderMap.get(col.key);
          if (!headerKey) return;
          const parsed = parseNumber(raw[headerKey]);
          if (!parsed.ok) {
            invalidAmounts.push(`"${col.label}"`);
          }
          const isDeduction = deductions.some((d) => d.key === col.key);
          if (isDeduction) rowDeductions[col.key] = parsed.value;
          else rowEarnings[col.key] = parsed.value;
        });

        if (employeeCode || name) {
          rows.push({
            rowIndex: idx + 2,
            employeeCode,
            name: name || "—",
            metadata: rowMetadata,
            earnings: rowEarnings,
            deductions: rowDeductions,
            invalidAmounts: invalidAmounts.slice(0, 2),
            noEmployeeMatch:
              !codeSet.has(employeeCode.toLowerCase()) && !nameSet.has(name.toLowerCase()),
          });
        }
      });

      if (rows.length === 0) {
        showToast("No employee rows found in the uploaded sheet.", "warning");
        return;
      }

      setReviewRows(rows);
      setMode("review");
      showToast(
        `${rows.length} payslip rows loaded for ${payPeriod}. Review before sending.`,
        "info",
      );
    } catch (err) {
      console.error("Upload parse failed:", err);
      showToast(
        "Could not read the uploaded file. Make sure it is a valid .xlsx or .csv file.",
        "error",
      );
    } finally {
      setParsing(false);
    }
  }

  const metadata = columns?.metadata || [];
  const earnings = columns?.earnings || [];
  const deductions = columns?.deductions || [];

  const totalIssues = reviewRows.filter(
    (r) => r.invalidAmounts.length > 0 || r.noEmployeeMatch,
  ).length;
  const totals = reviewRows.reduce(
    (acc, r) => {
      const gross = Object.values(r.earnings).reduce((a, b) => a + (b || 0), 0);
      const ded = Object.values(r.deductions).reduce((a, b) => a + (b || 0), 0);
      acc.gross += gross;
      acc.deductions += ded;
      acc.net += Math.max(gross - ded, 0);
      return acc;
    },
    { gross: 0, deductions: 0, net: 0 },
  );

  async function handleConfirmSend() {
    if (!companyLogo) {
      showToast("A Payslip Logo is mandatory to generate and send payslips. Please upload one first.", "error");
      logoInputRef.current?.click();
      return;
    }
    setSending(true);
    try {
      const companyId = await getCompanyId();
      if (!companyId) {
        showToast("Could not resolve your company.", "error");
        return;
      }
      const result = await sendPayslips({
        data: {
          companyId,
          payPeriod,
          rows: reviewRows.map((r) => ({
            employeeCode: r.employeeCode,
            name: r.name,
            metadata: r.metadata,
            earnings: r.earnings,
            deductions: r.deductions,
          })),
        },
      });

      if (!result.success) {
        showToast(result.error || "Failed to send payslips.", "error");
        return;
      }

      const skippedMsg =
        result.skipped.length > 0 ? `. Skipped ${result.skipped.length} unmatched row(s).` : "";
      showToast(`${result.sent} payslip(s) sent to employees for ${payPeriod}${skippedMsg}.`, "success");
      setMode("idle");
      setReviewRows([]);
      await loadCycles();
    } catch (err) {
      console.error("Send payslips failed:", err);
      showToast("Failed to send payslips.", "error");
    } finally {
      setSending(false);
    }
  }

  const chartYears = Array.from(
    new Set(cycles.map((c) => parseCycleMonth(c.payPeriod).getFullYear())),
  )
    .filter((y) => y > 0)
    .sort((a, b) => b - a);
  const activeChartYear = chartYears.includes(chartYear)
    ? chartYear
    : (chartYears[0] ?? new Date().getFullYear());
  const yearCycleMap = new Map<number, { net: number; payPeriod: string; count: number }>();
  cycles
    .filter((c) => parseCycleMonth(c.payPeriod).getFullYear() === activeChartYear)
    .forEach((c) =>
      yearCycleMap.set(parseCycleMonth(c.payPeriod).getMonth(), {
        net: c.net,
        payPeriod: c.payPeriod,
        count: c.count,
      }),
    );
  const yearMaxNet = Math.max(...[...yearCycleMap.values()].map((c) => c.net), 0);
  const hasYearCycle = yearCycleMap.size > 0;
  const latestCycle = cycles[0];
  const totalNet = cycles.reduce((s, c) => s + c.net, 0);
  const totalDeductions = cycles.reduce((s, c) => s + c.deductions, 0);
  const totalEmployeesProcessed = cycles.reduce((s, c) => s + c.count, 0);

  return (
    <TooltipProvider>
      <div className="hr-tab-container">
        {/* Header */}
        <div className="hr-tab-header">
          <div className="hr-tab-title-group">
            <h2 className="hr-tab-title">
              Payslips & Payroll
            </h2>
            <p className="hr-tab-subtitle">
              Configure payroll items, download spreadsheets, verify calculations, and dispatch payslips.
            </p>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={parsing}
            className="hr-btn hr-btn-primary"
          >
            <UploadFile size={16} />
            {parsing ? "Parsing..." : "Upload Filled Sheet"}
          </button>
        </div>

        {/* Action toolbar */}
        <div className="hr-card p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={payPeriod}
              onChange={(e) => setPayPeriod(e.target.value)}
              className="hr-select font-medium"
            >
              {monthOptions().map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {/* Signature Mode Selector */}
            <select
              value={signMode}
              onChange={(e) => handleSignModeChange(e.target.value as PayslipSignMode)}
              disabled={savingSignMode}
              className="hr-select"
            >
              <option value="digital_notice">Digital Notice (No Sign)</option>
              <option value="stamp_and_signature">Stamp & Signature</option>
            </select>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className={`hr-branding-upload-btn ${companyLogo ? "has-asset" : ""}`}
                >
                  {uploadingLogo ? (
                    <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : companyLogo ? (
                    <img src={companyLogo} alt="Logo" className="hr-branding-thumb-sm" />
                  ) : (
                    <ImageIcon size={15} />
                  )}
                  {uploadingLogo ? "Uploading..." : companyLogo ? "Change Logo" : "Upload Logo (Required)"}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {companyLogo
                  ? "Company logo configured (displays on top left of payslips)"
                  : "Required: Upload company logo to generate and send payslips"}
              </TooltipContent>
            </Tooltip>
            <input
              ref={logoInputRef}
              type="file"
              hidden
              accept="image/*"
              onChange={(e) => {
                handleLogoSelected(e.target.files?.[0] || null);
                e.target.value = "";
              }}
            />

            {signMode === "stamp_and_signature" && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => stampInputRef.current?.click()}
                      disabled={uploadingStamp}
                      className={`hr-branding-upload-btn ${companyStamp ? "has-asset" : ""}`}
                    >
                      {uploadingStamp ? (
                        <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : companyStamp ? (
                        <img src={companyStamp} alt="Stamp" className="hr-branding-thumb-sm" />
                      ) : (
                        <StampIcon size={15} />
                      )}
                      {uploadingStamp ? "Uploading..." : companyStamp ? "Change Stamp" : "Company Stamp"}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Upload the official company seal / stamp</TooltipContent>
                </Tooltip>
                <input
                  ref={stampInputRef}
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => {
                    handleStampSelected(e.target.files?.[0] || null);
                    e.target.value = "";
                  }}
                />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => signatureInputRef.current?.click()}
                      disabled={uploadingSignature}
                      className={`hr-branding-upload-btn ${companySignature ? "has-asset" : ""}`}
                    >
                      {uploadingSignature ? (
                        <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : companySignature ? (
                        <img src={companySignature} alt="Signature" className="hr-branding-thumb-sm" />
                      ) : (
                        <PenToolIcon size={15} />
                      )}
                      {uploadingSignature ? "Uploading..." : companySignature ? "Change Signature" : "Signature"}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Upload the authorized signatory signature</TooltipContent>
                </Tooltip>
                <input
                  ref={signatureInputRef}
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => {
                    handleSignatureSelected(e.target.files?.[0] || null);
                    e.target.value = "";
                  }}
                />
              </>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={openCompanyInfoDialog}
                  className="hr-btn hr-btn-secondary"
                >
                  <BuildingIcon size={15} />
                  {companyFullName || companyCin ? "Company Info" : "Add Company Info"}
                </button>
              </TooltipTrigger>
              <TooltipContent>Configure registered name, CIN, PAN, and address</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={openColumnSettings}
                  className="hr-btn hr-btn-secondary"
                >
                  <Settings size={15} />
                  Columns
                </button>
              </TooltipTrigger>
              <TooltipContent>Add, rename or remove earnings / deductions columns</TooltipContent>
            </Tooltip>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={employees.length === 0}
              className="hr-btn hr-btn-secondary"
            >
              <FileDownload size={15} />
              Download Template
            </button>
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
            />
          </div>
        </div>

        {/* Review screen */}
        {mode === "review" ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl border border-border bg-surface flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle size={14} />
                  {reviewRows.length} employees
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                  <ReceiptLong size={14} />
                  Net payout {formatMoney(totals.net)}
                </span>
                {totalIssues > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <WarningAmber size={14} />
                    {totalIssues} row(s) need attention
                  </span>
                )}
              </div>
            </div>

            {totalIssues > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-600 dark:text-amber-400">
                Rows with amber chips will still be sent, but double-check invalid amounts and
                unmatched employees before confirming.
              </div>
            )}

            <div className="hr-table-wrapper">
              <div className="hr-table-scroll">
                <table className="hr-data-table">
                  <thead>
                    <tr>
                      {[
                        "Employee",
                        ...metadata.map((c) => c.label),
                        ...earnings.map((c) => c.label),
                        "Gross Pay",
                        ...deductions.map((c) => c.label),
                        "Net Pay",
                        "",
                      ].map((h, index) => (
                        <th
                          key={h + index}
                          className="uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reviewRows.map((r) => {
                      const gross = Object.values(r.earnings).reduce((a, b) => a + (b || 0), 0);
                      const ded = Object.values(r.deductions).reduce((a, b) => a + (b || 0), 0);
                      const net = Math.max(gross - ded, 0);
                      const hasIssue = r.invalidAmounts.length > 0 || r.noEmployeeMatch;
                      return (
                        <tr key={r.rowIndex}>
                          <td>
                            <p className="font-semibold text-text-primary text-xs">{r.name}</p>
                            <p className="text-[11px] text-text-muted">
                              {r.employeeCode || "No code"}
                            </p>
                          </td>
                          {metadata.map((c) => (
                            <td key={c.key} className="text-xs">
                              {r.metadata?.[c.key] ? String(r.metadata[c.key]) : "—"}
                            </td>
                          ))}
                          {earnings.map((c) => (
                            <td key={c.key} className="text-xs">
                              {formatMoney(r.earnings[c.key] ?? 0)}
                            </td>
                          ))}
                          <td className="text-xs font-semibold text-text-primary">
                            {formatMoney(gross)}
                          </td>
                          {deductions.map((c) => (
                            <td key={c.key} className="text-xs text-red-500">
                              -{formatMoney(r.deductions[c.key] ?? 0)}
                            </td>
                          ))}
                          <td className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatMoney(net)}
                          </td>
                          <td>
                            {hasIssue ? (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 whitespace-nowrap">
                                {r.noEmployeeMatch ? "No match" : "Invalid amount"}
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                OK
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="font-semibold bg-surface-subtle border-t-2 border-border">
                      <td
                        colSpan={metadata.length + earnings.length + 1}
                        className="text-xs text-text-primary"
                      >
                        TOTALS ({reviewRows.length} employees)
                      </td>
                      <td className="text-xs font-semibold text-text-primary">
                        {formatMoney(totals.gross)}
                      </td>
                      <td
                        colSpan={deductions.length}
                        className="text-xs font-semibold text-red-500"
                      >
                        -{formatMoney(totals.deductions)}
                      </td>
                      <td className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(totals.net)}
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action buttons below the review table */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setMode("idle");
                  setReviewRows([]);
                }}
                className="hr-btn hr-btn-secondary"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleConfirmSend}
                disabled={sending || reviewRows.length === 0}
                className="hr-btn hr-btn-primary"
              >
                {sending ? "Sending Payslips..." : "Confirm & Send Payslips"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Payslip Overview */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                Payroll Overview
              </h3>

              {cyclesLoading ? (
                <div className="hr-metrics-grid">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="hr-metrics-grid">
                    <div className="hr-stat-card">
                      <div className="flex items-center justify-between">
                        <span className="hr-stat-label">Total Paid Out</span>
                        <span className="hr-stat-icon-wrapper"><Wallet size={16} /></span>
                      </div>
                      <p className="hr-stat-value">
                        {formatMoney(totalNet)}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        across {cycles.length} cycle{cycles.length === 1 ? "" : "s"}
                      </p>
                    </div>

                    <div className="hr-stat-card">
                      <div className="flex items-center justify-between">
                        <span className="hr-stat-label">Latest Cycle</span>
                        <span className="hr-stat-icon-wrapper"><IndianRupee size={16} /></span>
                      </div>
                      <p className="hr-stat-value">
                        {latestCycle ? formatMoney(latestCycle.net) : "—"}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {latestCycle
                          ? `${latestCycle.payPeriod} · ${latestCycle.count} employee${latestCycle.count === 1 ? "" : "s"}`
                          : "No cycle sent yet"}
                      </p>
                    </div>

                    <div className="hr-stat-card">
                      <div className="flex items-center justify-between">
                        <span className="hr-stat-label">Total Deductions</span>
                        <span className="hr-stat-icon-wrapper"><TrendingUp size={16} /></span>
                      </div>
                      <p className="hr-stat-value">
                        {formatMoney(totalDeductions)}
                      </p>
                      <p className="text-[11px] text-text-muted">tax / PF / other deductions</p>
                    </div>

                    <div className="hr-stat-card">
                      <div className="flex items-center justify-between">
                        <span className="hr-stat-label">Processed</span>
                        <span className="hr-stat-icon-wrapper"><Users size={16} /></span>
                      </div>
                      <p className="hr-stat-value">
                        {totalEmployeesProcessed}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        payslips sent · {employees.length} on payroll
                      </p>
                    </div>
                  </div>

                  {/* Net Payout Chart Card */}
                  <div className="hr-payslip-chart-card">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ReceiptLong size={16} className="text-text-muted" />
                        <h4 className="text-sm font-semibold text-text-primary">
                          Net Payout by Cycle Trend
                        </h4>
                      </div>

                      <select
                        value={activeChartYear}
                        onChange={(e) => setChartYear(Number(e.target.value))}
                        className="hr-select h-8 text-xs"
                      >
                        {(chartYears.length > 0 ? chartYears : [activeChartYear]).map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>

                    {!hasYearCycle ? (
                      <div className="py-8 text-center text-xs text-text-muted">
                        No payout data yet — upload and send the first cycle to see the trend.
                      </div>
                    ) : (
                      <div className="hr-payslip-chart-grid">
                        {PAYSLIP_MONTHS.map((name, idx) => {
                          const rec = yearCycleMap.get(idx);
                          const pct =
                            rec && yearMaxNet > 0 ? Math.max((rec.net / yearMaxNet) * 100, 10) : 0;
                          return (
                            <div key={name} className="hr-payslip-col-bar">
                              <div className="hr-payslip-bar-track">
                                {rec ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className="hr-payslip-bar-fill"
                                        style={{ height: `${pct}%` }}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {rec.payPeriod} • net {formatMoney(rec.net)}
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <div className="hr-payslip-bar-empty" />
                                )}
                              </div>
                              <span className="hr-payslip-bar-label">
                                {name.slice(0, 3)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Recently sent cycles */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                Recently Sent Cycles
              </h3>

              <div className="hr-table-wrapper">
                {cyclesLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-lg" />
                    ))}
                  </div>
                ) : cycles.length === 0 ? (
                  <div className="hr-empty-state p-8">
                    <div className="hr-empty-icon">
                      <FileDownload size={24} />
                    </div>
                    <p className="hr-empty-title">No payslips have been sent yet.</p>
                    <p className="hr-empty-desc">
                      Download the template above to start the first cycle.
                    </p>
                  </div>
                ) : (
                  <div className="hr-table-scroll">
                    <table className="hr-data-table">
                      <thead>
                        <tr>
                          {["Pay Period", "Employees", "Sent At", ""].map((h, index) => (
                            <th
                              key={index}
                              className="uppercase"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cycles.map((c) => (
                          <tr
                            key={c.payPeriod}
                            onClick={() => openCycleBatch(c.payPeriod)}
                            className="cursor-pointer"
                          >
                            <td className="font-semibold text-text-primary text-xs">
                              {c.payPeriod}
                            </td>
                            <td className="text-xs">{c.count} employees</td>
                            <td className="text-xs text-text-muted">
                              {new Date(c.sentAt).toLocaleDateString(undefined, {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td>
                              <div className="flex items-center justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(e) => promptDeleteCycle(c.payPeriod, e)}
                                      className="hr-btn-icon text-red-500 hover:text-red-600"
                                    >
                                      <Delete size={15} />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete cycle</TooltipContent>
                                </Tooltip>
                                <KeyboardArrowRight size={16} className="text-text-muted" />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Column settings dialog */}
        <Dialog open={colDialogOpen} onOpenChange={setColDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Payslip Columns Configuration
              </DialogTitle>
              <p className="text-xs text-text-muted mt-0.5">
                Personalise earnings and deductions columns. The spreadsheet template and employee payslip update automatically.
              </p>
            </DialogHeader>

            <div className="space-y-5 py-2">
              {/* Employee Metadata Info Section */}
              <div className="p-4 rounded-xl border border-border bg-surface-subtle space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-xs font-semibold text-text-primary">
                      Employee & Work Info Details ({draftMetadata.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraftMetadata((prev) => [...prev, { key: "", label: "" }])}
                    className="hr-btn hr-btn-secondary text-xs h-7 px-2"
                  >
                    <Add size={13} />
                    Add Detail Column
                  </button>
                </div>

                <div className="space-y-2">
                  {draftMetadata.length === 0 ? (
                    <p className="text-xs text-text-muted italic">
                      No additional details configured. Click "+ Add Detail Column".
                    </p>
                  ) : (
                    draftMetadata.map((col, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-xs text-text-muted w-5">{idx + 1}.</span>
                        <input
                          type="text"
                          value={col.label}
                          onChange={(e) =>
                            setDraftMetadata((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, label: e.target.value } : c)),
                            )
                          }
                          placeholder="e.g. Pay Date, Per Day Rate, No. of Working Days..."
                          className="hr-input flex-1 h-8 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setDraftMetadata((prev) => prev.filter((_, i) => i !== idx))}
                          className="hr-btn-icon text-red-500 h-8 w-8"
                        >
                          <Delete size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Earnings & Deductions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Earnings */}
                <div className="p-4 rounded-xl border border-border bg-surface-subtle space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-xs font-semibold text-text-primary">
                        Earnings ({draftEarnings.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDraftEarnings((prev) => [...prev, { key: "", label: "" }])}
                      className="hr-btn hr-btn-secondary text-xs h-7 px-2"
                    >
                      <Add size={13} />
                      Add Earning
                    </button>
                  </div>

                  <div className="space-y-2">
                    {draftEarnings.length === 0 ? (
                      <p className="text-xs text-text-muted italic">
                        No earnings columns defined.
                      </p>
                    ) : (
                      draftEarnings.map((col, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-xs text-text-muted w-5">{idx + 1}.</span>
                          <input
                            type="text"
                            value={col.label}
                            onChange={(e) =>
                              setDraftEarnings((prev) =>
                                prev.map((c, i) => (i === idx ? { ...c, label: e.target.value } : c)),
                              )
                            }
                            placeholder="e.g. Basic Wage, HRA..."
                            className="hr-input flex-1 h-8 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setDraftEarnings((prev) => prev.filter((_, i) => i !== idx))}
                            className="hr-btn-icon text-red-500 h-8 w-8"
                          >
                            <Delete size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Deductions */}
                <div className="p-4 rounded-xl border border-border bg-surface-subtle space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-xs font-semibold text-text-primary">
                        Deductions ({draftDeductions.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDraftDeductions((prev) => [...prev, { key: "", label: "" }])}
                      className="hr-btn hr-btn-secondary text-xs h-7 px-2"
                    >
                      <Add size={13} />
                      Add Deduction
                    </button>
                  </div>

                  <div className="space-y-2">
                    {draftDeductions.length === 0 ? (
                      <p className="text-xs text-text-muted italic">
                        No deductions columns defined.
                      </p>
                    ) : (
                      draftDeductions.map((col, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-xs text-text-muted w-5">{idx + 1}.</span>
                          <input
                            type="text"
                            value={col.label}
                            onChange={(e) =>
                              setDraftDeductions((prev) =>
                                prev.map((c, i) => (i === idx ? { ...c, label: e.target.value } : c)),
                              )
                            }
                            placeholder="e.g. Provident Fund, TDS..."
                            className="hr-input flex-1 h-8 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => setDraftDeductions((prev) => prev.filter((_, i) => i !== idx))}
                            className="hr-btn-icon text-red-500 h-8 w-8"
                          >
                            <Delete size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => setColDialogOpen(false)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingColumns}
                onClick={handleSaveColumns}
                className="hr-btn hr-btn-primary"
              >
                {savingColumns ? "Saving Changes..." : "Save Columns"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cycle batch dialog */}
        <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Payslip Batch • {batchPeriod}
              </DialogTitle>
            </DialogHeader>

            <div className="py-2">
              {batchLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-lg" />
                  ))}
                </div>
              ) : batchRows.length === 0 ? (
                <div className="hr-empty-state p-6">
                  <div className="hr-empty-icon">
                    <ReceiptLong size={24} />
                  </div>
                  <p className="hr-empty-title">No payslips found in this cycle.</p>
                </div>
              ) : (
                <div className="hr-table-wrapper">
                  <div className="hr-table-scroll">
                    <table className="hr-data-table">
                      <thead>
                        <tr>
                          {["#", "Employee", "Code", "Gross Pay", "Deductions", "Net Pay", "Status"].map(
                            (h) => (
                              <th key={h} className="uppercase">
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {batchRows.map((row, idx) => (
                          <tr key={row.payslip.id}>
                            <td className="text-xs text-text-muted">{idx + 1}</td>
                            <td className="font-semibold text-text-primary text-xs">{row.name}</td>
                            <td className="text-xs font-mono">{row.employeeCode}</td>
                            <td className="text-xs">{formatMoney(row.payslip.gross_pay)}</td>
                            <td className="text-xs text-red-500">
                              −{formatMoney(row.payslip.total_deductions)}
                            </td>
                            <td className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              {formatMoney(row.payslip.net_pay)}
                            </td>
                            <td>
                              <span className="hr-badge hr-badge-active">
                                {row.payslip.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => promptDeleteCycle(batchPeriod)}
                className="hr-btn hr-btn-danger"
              >
                <Delete size={15} />
                Delete Entire Cycle
              </button>
              <button
                type="button"
                onClick={() => setBatchDialogOpen(false)}
                className="hr-btn hr-btn-secondary"
              >
                Close
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Cycle Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={(o) => !deletingCycle && setDeleteConfirmOpen(o)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-500">
                <WarningAmber size={18} />
                Delete Payslip Cycle?
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-2">
              <p className="text-sm text-text-secondary">
                Are you sure you want to delete the entire payslip cycle for{" "}
                <strong className="text-text-primary">{cycleToDelete}</strong>?
              </p>
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
                This will permanently remove all payslips for this cycle and instantly update all metrics.
              </div>
            </div>
            <DialogFooter className="pt-2">
              <button
                type="button"
                disabled={deletingCycle}
                onClick={() => setDeleteConfirmOpen(false)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingCycle}
                onClick={handleConfirmDeleteCycle}
                className="hr-btn hr-btn-danger"
              >
                {deletingCycle ? "Deleting..." : "Yes, Delete Cycle"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Company Legal & Statutory Info Dialog */}
        <Dialog open={companyInfoDialogOpen} onOpenChange={(o) => !savingCompanyInfo && setCompanyInfoDialogOpen(o)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BuildingIcon size={18} />
                Company Header & Legal Information
              </DialogTitle>
              <p className="text-xs text-text-muted mt-0.5">
                Configure statutory company details to display in the header and footer of payslips.
              </p>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="hr-form-field">
                <label className="hr-form-label">
                  Full Registered Company Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Acme Technologies Private Limited"
                  value={infoFormFullName}
                  onChange={(e) => setInfoFormFullName(e.target.value)}
                  className="hr-input"
                />
              </div>

              <div className="hr-form-grid hr-form-grid-2">
                <div className="hr-form-field">
                  <label className="hr-form-label">
                    Company CIN
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. U72200MH2021PTC123456"
                    value={infoFormCin}
                    onChange={(e) => setInfoFormCin(e.target.value)}
                    className="hr-input"
                  />
                </div>
                <div className="hr-form-field">
                  <label className="hr-form-label">
                    Company PAN No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AABCU9603R"
                    value={infoFormPan}
                    onChange={(e) => setInfoFormPan(e.target.value)}
                    className="hr-input"
                  />
                </div>
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">
                  Registered Office Address
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. 101, Business Towers, 4th Cross Road, Tech Park, Mumbai 400001"
                  value={infoFormAddress}
                  onChange={(e) => setInfoFormAddress(e.target.value)}
                  className="hr-input h-auto py-2"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => setCompanyInfoDialogOpen(false)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingCompanyInfo}
                onClick={handleSaveCompanyLegalInfo}
                className="hr-btn hr-btn-primary"
              >
                {savingCompanyInfo ? "Saving..." : "Save Details"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
