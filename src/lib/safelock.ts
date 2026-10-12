import { supabase } from "./supabase";

export interface SafeLockConfig {
  enabled: boolean;
  pinHash: string; // SHA-256 hex string
  hint: string;
  recoveryQuestion: string;
  recoveryAnswerHash: string; // Lowercase SHA-256 hex string
  protectedTabs: string[]; // e.g. ["Salary", "Files", "Mail", "Performance"]
  updatedAt: string;
}

export const RECOVERY_QUESTIONS = [
  "What was the name of your first pet?",
  "What was your childhood nickname?",
  "What is your favorite color?",
  "What was the make of your first car or bike?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was your favorite subject in high school?",
  "What was the name of your first school?",
  "What is your all-time favorite movie or book?",
  "What is your favorite food or cuisine?",
];

export const AVAILABLE_SERVICES = [
  { key: "Salary", label: "Payslips & Salary", mandatory: true, description: "Detailed monthly pay slips and salary breakdowns" },
  { key: "Files", label: "Cloud Drive & Files", mandatory: false, description: "Personal and confidential cloud documents" },
  { key: "Mail", label: "Internal Mailbox", mandatory: false, description: "Corporate inbox and email messages" },
  { key: "Performance", label: "Appraisals & Performance", mandatory: false, description: "Reviews, KPI metrics and 1-on-1 appraisals" },
];

/**
 * SHA-256 hashing utility using browser Web Crypto API
 */
export async function hashString(value: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Session unlock management with 15-minute inactivity expiry (persists across tab navigations, cleared on tab close or after 15m idle)
const SESSION_STORAGE_KEY_PREFIX = "capoasis_safelock_session_";
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export function isSessionUnlocked(userId: string): boolean {
  if (typeof window === "undefined" || !userId) return false;
  try {
    const raw = sessionStorage.getItem(`${SESSION_STORAGE_KEY_PREFIX}${userId}`);
    if (!raw) return false;
    const lastActive = parseInt(raw, 10);
    if (isNaN(lastActive)) return false;
    if (Date.now() - lastActive > SESSION_TIMEOUT_MS) {
      sessionStorage.removeItem(`${SESSION_STORAGE_KEY_PREFIX}${userId}`);
      return false;
    }
    // Refresh activity timestamp
    sessionStorage.setItem(`${SESSION_STORAGE_KEY_PREFIX}${userId}`, Date.now().toString());
    return true;
  } catch {
    return false;
  }
}

export function unlockSession(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    sessionStorage.setItem(`${SESSION_STORAGE_KEY_PREFIX}${userId}`, Date.now().toString());
  } catch (e) {
    console.error("Failed to set safelock session:", e);
  }
}

export function lockSession(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    sessionStorage.removeItem(`${SESSION_STORAGE_KEY_PREFIX}${userId}`);
  } catch (e) {
    console.error("Failed to clear safelock session:", e);
  }
}

const LOCAL_STORAGE_KEY_PREFIX = "capoasis_safelock_";

/**
 * Fetch SafeLock configuration for a user.
 * Reads from Supabase profiles.safelock_config (if available) with localStorage fallback/sync.
 */
export async function getSafeLockConfig(userId: string): Promise<SafeLockConfig | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("safelock_config")
      .eq("id", userId)
      .maybeSingle();

    if (!error && data?.safelock_config) {
      const config = data.safelock_config as SafeLockConfig;
      // Keep local sync
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + userId, JSON.stringify(config));
      } catch (e) {
        // ignore storage errors
      }
      return config;
    }
  } catch (err) {
    console.warn("Could not load safelock config from profiles DB, trying localStorage:", err);
  }

  // Local storage fallback
  try {
    const local = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + userId);
    if (local) {
      return JSON.parse(local) as SafeLockConfig;
    }
  } catch (e) {
    // ignore
  }

  return null;
}

/**
 * Save SafeLock configuration for a user.
 */
export async function saveSafeLockConfig(userId: string, config: SafeLockConfig): Promise<boolean> {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + userId, JSON.stringify(config));
  } catch (e) {
    // ignore
  }

  try {
    const { error } = await supabase
      .from("profiles")
      .update({
        safelock_config: config,
      })
      .eq("id", userId);

    if (error) {
      console.warn("Could not persist safelock_config to profiles column (might not exist in DB yet, local storage saved):", error.message);
    }
    return true;
  } catch (err) {
    console.warn("Error updating safelock_config in Supabase:", err);
    return true; // Still true since localStorage is updated
  }
}

/**
 * Check if a given tab/service is protected by the user's config
 */
export function isTabProtected(tabName: string, config: SafeLockConfig | null): boolean {
  if (!config || !config.enabled) {
    // If no config exists, "Salary" is considered protected by default (triggering setup)
    return tabName === "Salary";
  }
  // Salary is always protected if config exists
  if (tabName === "Salary") return true;
  return config.protectedTabs?.includes(tabName) ?? false;
}
