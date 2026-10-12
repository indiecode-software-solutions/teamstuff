import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { supabase } from "./supabase";

/**
 * A configurable earnings/deductions column as defined by the company.
 * The HR/Admin can add, rename or remove columns to personalise payslips.
 */
export interface PayslipColumn {
  key: string;
  label: string;
}

export interface PayslipColumns {
  metadata?: PayslipColumn[];
  earnings: PayslipColumn[];
  deductions: PayslipColumn[];
}

export const DEFAULT_METADATA_COLUMNS: PayslipColumn[] = [];

export const DEFAULT_EARNINGS_COLUMNS: PayslipColumn[] = [
  { key: "basic", label: "Basic Wage" },
  { key: "hra", label: "House Rent Allowance (HRA)" },
  { key: "allowance", label: "Special Allowance" },
  { key: "reimbursements", label: "Other Allowance / Reimbursements" },
];

export const DEFAULT_DEDUCTIONS_COLUMNS: PayslipColumn[] = [
  { key: "provident_fund", label: "Provident Fund (PF)" },
  { key: "professional_tax", label: "Professional Tax" },
  { key: "health_insurance", label: "Health & Vision Premium" },
  { key: "tds", label: "TDS / Income Tax" },
];

export function getDefaultPayslipColumns(): PayslipColumns {
  return {
    metadata: [],
    earnings: DEFAULT_EARNINGS_COLUMNS,
    deductions: DEFAULT_DEDUCTIONS_COLUMNS,
  };
}

export function slugify(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "custom";
}

/**
 * Build a unique slug for a column label within a set of already-used keys.
 */
export function uniqueSlug(label: string, taken: Set<string>): string {
  const base = slugify(label);
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let i = 2;
  while (taken.has(`${base}_${i}`)) i += 1;
  const slug = `${base}_${i}`;
  taken.add(slug);
  return slug;
}

/**
 * Fetch the company's customised payslip columns.
 * Returns null when the table does not exist yet (SQL not run) so callers
 * can fall back to the built-in defaults.
 */
export async function getPayslipColumns(companyId: string): Promise<PayslipColumns | null> {
  try {
    const { data, error } = await supabase
      .from("payslip_columns")
      .select("key, label, section, position")
      .eq("company_id", companyId)
      .order("position", { ascending: true });
    if (error) throw error;

    const metadata: PayslipColumn[] = [];
    const earnings: PayslipColumn[] = [];
    const deductions: PayslipColumn[] = [];
    (data || []).forEach((c: any) => {
      const col = { key: c.key, label: c.label };
      if (c.section === "metadata") metadata.push(col);
      else if (c.section === "deductions") deductions.push(col);
      else earnings.push(col);
    });
    if (earnings.length === 0 && deductions.length === 0 && metadata.length === 0) {
      return getDefaultPayslipColumns();
    }
    return {
      metadata,
      earnings,
      deductions,
    };
  } catch (err) {
    console.error("Error fetching payslip columns:", err);
    return null;
  }
}

export interface SavePayslipColumnsParams {
  companyId: string;
  metadata?: PayslipColumn[];
  earnings: PayslipColumn[];
  deductions: PayslipColumn[];
}

/**
 * Server function that replaces the company's payslip column configuration
 * (delete + insert, using the service role client).
 */
export const savePayslipColumns = createServerFn({ method: "POST" })
  .validator((d: SavePayslipColumnsParams) => d)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env["VITE_SUPABASE_URL"];
    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!supabaseUrl || !serviceRoleKey) {
      return { success: false, error: "Database configuration error" };
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { companyId, metadata = [], earnings, deductions } = data;

    try {
      const { error: delErr } = await adminClient
        .from("payslip_columns")
        .delete()
        .eq("company_id", companyId);
      if (delErr) throw delErr;

      const rows: any[] = [];
      metadata.forEach((col, idx) => {
        rows.push({
          company_id: companyId,
          section: "metadata",
          key: col.key,
          label: col.label,
          position: idx,
        });
      });
      earnings.forEach((col, idx) => {
        rows.push({
          company_id: companyId,
          section: "earnings",
          key: col.key,
          label: col.label,
          position: metadata.length + idx,
        });
      });
      deductions.forEach((col, idx) => {
        rows.push({
          company_id: companyId,
          section: "deductions",
          key: col.key,
          label: col.label,
          position: metadata.length + earnings.length + idx,
        });
      });

      if (rows.length > 0) {
        const { error: insErr } = await adminClient.from("payslip_columns").insert(rows);
        if (insErr) throw insErr;
      }

      return { success: true };
    } catch (err: any) {
      console.error("Save payslip columns exception:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * Upload a dedicated payslip company logo to the company's asset folder on Cloudinary
 * (Intranet/companies/<companyId>/assets/payslip_logo).
 */
export const uploadPayslipLogo = createServerFn({ method: "POST" })
  .validator((d: { base64Data: string; companyId: string }) => d)
  .handler(async ({ data }) => {
    const { base64Data, companyId } = data;
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = `Intranet/companies/${companyId}/assets/payslip_logo`;
    const apiSecret = "TqdPN3VMRk_eQbUjnC1mz-4MwI0";
    const apiKey = "122886755481348";
    const cloudName = "dfqyaawjv";

    const signatureStr = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash("sha1").update(signatureStr).digest("hex");

    const formData = new FormData();
    formData.append("file", base64Data);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp.toString());
    formData.append("folder", folder);
    formData.append("signature", signature);

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Cloudinary payslip logo upload failed:", errorText);
        return { success: false, error: errorText };
      }

      const json = await res.json();
      return { success: true, secure_url: json.secure_url };
    } catch (err: any) {
      console.error("Cloudinary payslip logo upload error:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * Upload a dedicated payslip company stamp to Cloudinary
 * (Intranet/companies/<companyId>/assets/payslip_stamp).
 */
export const uploadPayslipStamp = createServerFn({ method: "POST" })
  .validator((d: { base64Data: string; companyId: string }) => d)
  .handler(async ({ data }) => {
    const { base64Data, companyId } = data;
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = `Intranet/companies/${companyId}/assets/payslip_stamp`;
    const apiSecret = "TqdPN3VMRk_eQbUjnC1mz-4MwI0";
    const apiKey = "122886755481348";
    const cloudName = "dfqyaawjv";

    const signatureStr = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash("sha1").update(signatureStr).digest("hex");

    const formData = new FormData();
    formData.append("file", base64Data);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp.toString());
    formData.append("folder", folder);
    formData.append("signature", signature);

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Cloudinary payslip stamp upload failed:", errorText);
        return { success: false, error: errorText };
      }

      const json = await res.json();
      return { success: true, secure_url: json.secure_url };
    } catch (err: any) {
      console.error("Cloudinary payslip stamp upload error:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * Upload a dedicated authorized signature to Cloudinary
 * (Intranet/companies/<companyId>/assets/payslip_signature).
 */
export const uploadPayslipSignature = createServerFn({ method: "POST" })
  .validator((d: { base64Data: string; companyId: string }) => d)
  .handler(async ({ data }) => {
    const { base64Data, companyId } = data;
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = `Intranet/companies/${companyId}/assets/payslip_signature`;
    const apiSecret = "TqdPN3VMRk_eQbUjnC1mz-4MwI0";
    const apiKey = "122886755481348";
    const cloudName = "dfqyaawjv";

    const signatureStr = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash("sha1").update(signatureStr).digest("hex");

    const formData = new FormData();
    formData.append("file", base64Data);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp.toString());
    formData.append("folder", folder);
    formData.append("signature", signature);

    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("Cloudinary payslip signature upload failed:", errorText);
        return { success: false, error: errorText };
      }

      const json = await res.json();
      return { success: true, secure_url: json.secure_url };
    } catch (err: any) {
      console.error("Cloudinary payslip signature upload error:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * Persist the dedicated payslip logo URL in companies.payslip_logo_url.
 */
export const savePayslipLogo = createServerFn({ method: "POST" })
  .validator((d: { companyId: string; logoUrl: string }) => d)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env["VITE_SUPABASE_URL"];
    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!supabaseUrl || !serviceRoleKey) {
      return { success: false, error: "Database configuration error" };
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { companyId, logoUrl } = data;

    try {
      const { error } = await adminClient
        .from("companies")
        .update({ payslip_logo_url: logoUrl || null })
        .eq("id", companyId);

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Save payslip logo error:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * Persist the dedicated payslip stamp URL in companies.payslip_stamp_url.
 */
export const savePayslipStamp = createServerFn({ method: "POST" })
  .validator((d: { companyId: string; stampUrl: string }) => d)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env["VITE_SUPABASE_URL"];
    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!supabaseUrl || !serviceRoleKey) {
      return { success: false, error: "Database configuration error" };
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { companyId, stampUrl } = data;

    try {
      const { error } = await adminClient
        .from("companies")
        .update({ payslip_stamp_url: stampUrl || null })
        .eq("id", companyId);

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Save payslip stamp error:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * Persist the dedicated payslip signature URL in companies.payslip_signature_url.
 */
export const savePayslipSignature = createServerFn({ method: "POST" })
  .validator((d: { companyId: string; signatureUrl: string }) => d)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env["VITE_SUPABASE_URL"];
    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!supabaseUrl || !serviceRoleKey) {
      return { success: false, error: "Database configuration error" };
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { companyId, signatureUrl } = data;

    try {
      const { error } = await adminClient
        .from("companies")
        .update({ payslip_signature_url: signatureUrl || null })
        .eq("id", companyId);

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Save payslip signature error:", err);
      return { success: false, error: err.message };
    }
  });

export type PayslipSignMode = "stamp_and_signature" | "digital_notice";

export interface CompanyLegalDetails {
  fullName: string | null;
  cin: string | null;
  panNumber: string | null;
  address: string | null;
}

export interface PayslipBranding extends CompanyLegalDetails {
  logoUrl: string | null;
  stampUrl: string | null;
  signatureUrl: string | null;
  signMode: PayslipSignMode;
}

/**
 * Persist company legal/statutory details (full name, CIN, PAN, address)
 */
export const saveCompanyLegalDetails = createServerFn({ method: "POST" })
  .validator(
    (d: {
      companyId: string;
      fullName?: string | null;
      cin?: string | null;
      panNumber?: string | null;
      address?: string | null;
    }) => d,
  )
  .handler(async ({ data }) => {
    const supabaseUrl = process.env["VITE_SUPABASE_URL"];
    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!supabaseUrl || !serviceRoleKey) {
      return { success: false, error: "Database configuration error" };
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { companyId, fullName, cin, panNumber, address } = data;

    try {
      const updateData: Record<string, any> = {};
      if (fullName !== undefined) updateData["full_name"] = fullName || null;
      if (cin !== undefined) updateData["cin"] = cin || null;
      if (panNumber !== undefined) updateData["pan_number"] = panNumber || null;
      if (address !== undefined) updateData["address"] = address || null;

      const { error } = await adminClient
        .from("companies")
        .update(updateData)
        .eq("id", companyId);

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Save company legal details error:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * Persist the payslip signature mode ('stamp_and_signature' or 'digital_notice')
 */
export const savePayslipSignMode = createServerFn({ method: "POST" })
  .validator((d: { companyId: string; signMode: PayslipSignMode }) => d)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env["VITE_SUPABASE_URL"];
    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!supabaseUrl || !serviceRoleKey) {
      return { success: false, error: "Database configuration error" };
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { companyId, signMode } = data;

    try {
      const { error } = await adminClient
        .from("companies")
        .update({ payslip_sign_mode: signMode })
        .eq("id", companyId);

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Save payslip sign mode error:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * Fetch dedicated payslip branding (logo, stamp, signature, signMode, legal details) for a company.
 */
export async function getPayslipBranding(companyId: string): Promise<PayslipBranding> {
  try {
    const { data, error } = await supabase
      .from("companies")
      .select("name, full_name, cin, pan_number, address, payslip_logo_url, payslip_stamp_url, payslip_signature_url, payslip_sign_mode")
      .eq("id", companyId)
      .maybeSingle();
    if (error) throw error;
    const row = data as any;
    return {
      logoUrl: row?.payslip_logo_url || null,
      stampUrl: row?.payslip_stamp_url || null,
      signatureUrl: row?.payslip_signature_url || null,
      signMode: (row?.payslip_sign_mode as PayslipSignMode) || "digital_notice",
      fullName: row?.full_name || row?.name || null,
      cin: row?.cin || null,
      panNumber: row?.pan_number || null,
      address: row?.address || null,
    };
  } catch (err) {
    console.error("Error fetching payslip branding:", err);
    return {
      logoUrl: null,
      stampUrl: null,
      signatureUrl: null,
      signMode: "digital_notice",
      fullName: null,
      cin: null,
      panNumber: null,
      address: null,
    };
  }
}

/**
 * Fetch the dedicated payslip logo URL for a company from companies.payslip_logo_url.
 */
export async function getPayslipLogoUrl(companyId: string): Promise<string | null> {
  const branding = await getPayslipBranding(companyId);
  return branding.logoUrl;
}

/**
 * A single payslip row as entered by HR in the spreadsheet template.
 * Amounts are keyed by the configured column key.
 */
export interface PayslipInputRow {
  employeeCode: string;
  name: string;
  metadata?: Record<string, string | number>;
  earnings: Record<string, number>;
  deductions: Record<string, number>;
}

export interface PayslipRecord {
  id: string;
  company_id: string;
  user_id: string;
  pay_period: string;
  pay_date: string | null;
  basic: number;
  hra: number;
  allowance: number;
  reimbursements: number;
  provident_fund: number;
  professional_tax: number;
  health_insurance: number;
  tds: number;
  metadata?: Record<string, string | number>;
  earnings: Record<string, number>;
  deductions: Record<string, number>;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch the current user's own payslips (used by the employee salary page).
 * RLS restricts this to payslips belonging to the logged-in user.
 */
export async function getMyPayslips(): Promise<PayslipRecord[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await supabase
      .from("payslips")
      .select("*")
      .eq("user_id", user.id)
      .order("pay_period", { ascending: false });
    if (error) throw error;
    return (data as PayslipRecord[]) || [];
  } catch (err) {
    console.error("Error fetching my payslips:", err);
    return [];
  }
}

/**
 * Fetch every payslip for a company (used by the HR payslips tab to show
 * previously generated / sent cycles).
 */
export async function getCompanyPayslips(companyId: string): Promise<PayslipRecord[]> {
  try {
    const { data, error } = await supabase
      .from("payslips")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as PayslipRecord[]) || [];
  } catch (err) {
    console.error("Error fetching company payslips:", err);
    return [];
  }
}

export interface SendPayslipsParams {
  companyId: string;
  payPeriod: string;
  rows: PayslipInputRow[];
}

export interface SendPayslipsResult {
  success: boolean;
  sent: number;
  skipped: { employeeCode: string; name: string; reason: string }[];
  error?: string;
}

/**
 * Server function that inserts (or updates) the confirmed payslip batch for a
 * pay period. Uses the service role client so HR can publish payslips for any
 * employee of the company. Matching employees by employee code first, then by
 * name, within the same company.
 */
export const sendPayslips = createServerFn({ method: "POST" })
  .validator((d: SendPayslipsParams) => d)
  .handler(async ({ data }): Promise<SendPayslipsResult> => {
    const supabaseUrl = process.env["VITE_SUPABASE_URL"];
    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("⚠️ Supabase admin credentials missing from server env.");
      return { success: false, sent: 0, skipped: [], error: "Database configuration error" };
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { companyId, payPeriod, rows } = data;

    try {
      const { data: profiles, error: profileErr } = await adminClient
        .from("profiles")
        .select("id, name, employee_code")
        .eq("company_id", companyId);

      if (profileErr) throw profileErr;

      const byCode = new Map<string, string>();
      const byName = new Map<string, string>();
      (profiles || []).forEach((p: any) => {
        if (p.employee_code) byCode.set(String(p.employee_code).trim().toLowerCase(), p.id);
        byName.set(
          String(p.name || "")
            .trim()
            .toLowerCase(),
          p.id,
        );
      });

      const records: any[] = [];
      const skipped: SendPayslipsResult["skipped"] = [];

      for (const row of rows) {
        let userId = row.employeeCode
          ? byCode.get(String(row.employeeCode).trim().toLowerCase())
          : undefined;
        if (!userId)
          userId = byName.get(
            String(row.name || "")
              .trim()
              .toLowerCase(),
          );

        if (!userId) {
          skipped.push({
            employeeCode: row.employeeCode,
            name: row.name,
            reason: "No matching employee found in company",
          });
          continue;
        }

        const grossPay = Object.values(row.earnings).reduce((a, b) => a + (b || 0), 0);
        const totalDeductions = Object.values(row.deductions).reduce((a, b) => a + (b || 0), 0);
        const netPay = Math.max(grossPay - totalDeductions, 0);

        // Safely sanitize pay_date for PostgreSQL date column
        let rawPayDate = row.metadata?.["pay_date"] ? String(row.metadata["pay_date"]).trim() : null;
        if (rawPayDate) {
          if (/^\d{4,6}$/.test(rawPayDate) && !rawPayDate.includes("-") && !rawPayDate.includes("/")) {
            const serial = Number(rawPayDate);
            if (!Number.isNaN(serial) && serial > 20000 && serial < 80000) {
              const utcDays = Math.floor(serial - 25569);
              const d = new Date(utcDays * 86400 * 1000);
              rawPayDate = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
            }
          }
          const dmy = rawPayDate.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
          if (dmy) {
            const p1 = Number(dmy[1]);
            const p2 = Number(dmy[2]);
            let yyyy = Number(dmy[3]);
            if (yyyy < 100) yyyy += 2000;
            const mm = String(p2 <= 12 ? p2 : p1).padStart(2, "0");
            const dd = String(p2 <= 12 ? p1 : p2).padStart(2, "0");
            rawPayDate = `${yyyy}-${mm}-${dd}`;
          }
          if (Number.isNaN(Date.parse(rawPayDate))) {
            rawPayDate = null;
          }
        }

        records.push({
          company_id: companyId,
          user_id: userId,
          pay_period: payPeriod,
          pay_date: rawPayDate,
          metadata: row.metadata || {},
          earnings: row.earnings,
          deductions: row.deductions,
          // Compatibility with legacy fixed columns (defaults only)
          basic: row.earnings["basic"] ?? 0,
          hra: row.earnings["hra"] ?? 0,
          allowance: row.earnings["allowance"] ?? 0,
          reimbursements: row.earnings["reimbursements"] ?? 0,
          provident_fund: row.deductions["provident_fund"] ?? 0,
          professional_tax: row.deductions["professional_tax"] ?? 0,
          health_insurance: row.deductions["health_insurance"] ?? 0,
          tds: row.deductions["tds"] ?? 0,
          gross_pay: grossPay,
          total_deductions: totalDeductions,
          net_pay: netPay,
          status: "sent",
          updated_at: new Date().toISOString(),
        });
      }

      // Track who already had a payslip for this pay period so re-publishing
      // is silent (no duplicate "new payslip" notifications).
      const alreadyNotified = new Set<string>();
      try {
        const { data: existingRows } = await adminClient
          .from("payslips")
          .select("user_id")
          .eq("company_id", companyId)
          .eq("pay_period", payPeriod);
        (existingRows || []).forEach((row: any) => alreadyNotified.add(row.user_id));
      } catch (existingErr: any) {
        console.error("Failed to check existing payslips:", existingErr);
      }

      let sent = 0;
      if (records.length > 0) {
        const { error: insertErr } = await adminClient.from("payslips").upsert(records, {
          onConflict: "company_id,user_id,pay_period",
          ignoreDuplicates: false,
        });
        if (insertErr) throw insertErr;
        sent = records.length;
      }

      // In-app "new payslip" notifications for employees who just got one.
      if (records.length > 0) {
        try {
          const notifications = records
            .filter((record) => !alreadyNotified.has(record.user_id))
            .map((record) => ({
              user_id: record.user_id,
              type: "salary",
              title: "New payslip available",
              description: `Your payslip for ${payPeriod} is now ready to view.`,
              link: "/salary",
            }));
          if (notifications.length > 0) {
            await adminClient.from("notifications").insert(notifications);
          }
        } catch (notifErr: any) {
          console.error("Failed to create payslip notifications:", notifErr);
        }
      }

      return { success: true, sent, skipped };
    } catch (err: any) {
      console.error("Send payslips exception:", err);
      return { success: false, sent: 0, skipped: [], error: err.message };
    }
  });

export interface DeletePayslipCycleParams {
  companyId: string;
  payPeriod: string;
}

/**
 * Server function that permanently deletes all payslip records for a given company and pay cycle.
 * This automatically removes them from employee payslip views (/salary) and recalculates all metrics.
 */
export const deletePayslipCycle = createServerFn({ method: "POST" })
  .validator((d: DeletePayslipCycleParams) => d)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env["VITE_SUPABASE_URL"];
    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!supabaseUrl || !serviceRoleKey) {
      return { success: false, error: "Database configuration error" };
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { companyId, payPeriod } = data;

    try {
      const { error, count } = await adminClient
        .from("payslips")
        .delete({ count: "exact" })
        .eq("company_id", companyId)
        .eq("pay_period", payPeriod);

      if (error) throw error;

      return { success: true, count: count ?? 0 };
    } catch (err: any) {
      console.error("Delete payslip cycle error:", err);
      return { success: false, error: err.message };
    }
  });
