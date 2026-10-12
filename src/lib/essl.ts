// ESSL Biometric Integration — client-side helpers
// Used by the Settings UI to manage registered biometric devices.

import { supabase } from "./supabase";

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

export interface BiometricDevice {
  id: string;
  company_id: string;
  device_serial: string;
  device_name: string;
  office_location_id: string | null;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export type AttendanceMethod = "gps" | "biometric" | "both";

export const ATTENDANCE_METHOD_LABELS: Record<AttendanceMethod, { label: string; description: string }> = {
  gps: {
    label: "GPS Only",
    description: "Employees clock in/out using the mobile app with GPS verification.",
  },
  biometric: {
    label: "Biometric Only",
    description: "Attendance is recorded exclusively from registered ESSL biometric devices.",
  },
  both: {
    label: "Both (GPS + Biometric)",
    description: "Employees can use either the mobile app or biometric device.",
  },
};

// ─────────────────────────────────────────────────────────
// ADMS endpoint URL
// Devices must be configured to push to this URL.
// ─────────────────────────────────────────────────────────
export function getAdmsEndpointUrl(): string {
  // Derive from the Supabase URL (VITE env var)
  const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
  if (!supabaseUrl) return "https://<project-ref>.supabase.co/functions/v1/essl-adms";
  // e.g. https://xyzabc.supabase.co → https://xyzabc.supabase.co/functions/v1/essl-adms
  return `${supabaseUrl}/functions/v1/essl-adms`;
}

// ─────────────────────────────────────────────────────────
// CRUD helpers
// ─────────────────────────────────────────────────────────

export async function getCompanyBiometricDevices(companyId: string): Promise<BiometricDevice[]> {
  const { data, error } = await supabase
    .from("biometric_devices")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as BiometricDevice[];
}

export async function addBiometricDevice(device: {
  company_id: string;
  device_serial: string;
  device_name: string;
  office_location_id: string | null;
}): Promise<BiometricDevice> {
  const { data, error } = await supabase
    .from("biometric_devices")
    .insert(device)
    .select()
    .single();
  if (error) throw error;
  return data as BiometricDevice;
}

export async function toggleBiometricDevice(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from("biometric_devices")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteBiometricDevice(id: string): Promise<void> {
  const { error } = await supabase.from("biometric_devices").delete().eq("id", id);
  if (error) throw error;
}

export async function saveAttendanceMethod(
  companyId: string,
  method: AttendanceMethod,
): Promise<void> {
  const { error } = await supabase
    .from("companies")
    .update({ attendance_method: method })
    .eq("id", companyId);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────
// Source label helpers (used in attendance views)
// ─────────────────────────────────────────────────────────
export function getAttendanceSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case "biometric_essl":
      return "Biometric";
    case "manual":
      return "Manual";
    case "mobile_gps":
    default:
      return "GPS";
  }
}
