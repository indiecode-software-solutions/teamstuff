import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type PolicyCategory = "Leaves" | "Conduct" | "Benefits" | "Security";

export const POLICY_CATEGORIES: PolicyCategory[] = ["Leaves", "Conduct", "Benefits", "Security"];

export interface HrPolicy {
  id: string;
  company_id: string;
  title: string;
  category: PolicyCategory;
  summary: string;
  content: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function estimateReadTime(content: string): string {
  const words = (content || "").trim().split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.ceil(words / 200))} min read`;
}

export async function getMyCompanyId(): Promise<string | null> {
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

/**
 * Fetch the signed-in user's company policies. RLS restricts reads to
 * employees of the company.
 */
export async function getCompanyPolicies(companyId: string): Promise<HrPolicy[]> {
  try {
    const { data, error } = await supabase
      .from("hr_policies")
      .select("*")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data as HrPolicy[]) || [];
  } catch (err) {
    console.error("Error fetching company policies:", err);
    return [];
  }
}

export interface PolicyInput {
  companyId: string;
  title: string;
  category: PolicyCategory;
  summary: string;
  content: string;
  createdBy?: string;
}

export interface PolicyResult {
  success: boolean;
  error?: string;
}

function getAdminClient() {
  const supabaseUrl = process.env["VITE_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Server function that creates a new HR policy for the company
 * (service role, so HR/Admin can publish on behalf of the organisation).
 */
export const createPolicy = createServerFn({ method: "POST" })
  .validator((d: PolicyInput) => d)
  .handler(async ({ data }): Promise<PolicyResult> => {
    const adminClient = getAdminClient();
    if (!adminClient) return { success: false, error: "Database configuration error" };

    const { companyId, title, category, summary, content, createdBy } = data;
    if (!title.trim() || !summary.trim() || !content.trim()) {
      return { success: false, error: "Title, summary and content are required" };
    }

    try {
      const { error } = await adminClient.from("hr_policies").insert({
        company_id: companyId,
        title: title.trim(),
        category,
        summary: summary.trim(),
        content,
        created_by: createdBy ?? null,
      });
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Create policy exception:", err);
      return { success: false, error: err.message };
    }
  });

export interface UpdatePolicyParams {
  policyId: string;
  title: string;
  category: PolicyCategory;
  summary: string;
  content: string;
}

export const updatePolicy = createServerFn({ method: "POST" })
  .validator((d: UpdatePolicyParams) => d)
  .handler(async ({ data }): Promise<PolicyResult> => {
    const adminClient = getAdminClient();
    if (!adminClient) return { success: false, error: "Database configuration error" };

    const { policyId, title, category, summary, content } = data;
    if (!title.trim() || !summary.trim() || !content.trim()) {
      return { success: false, error: "Title, summary and content are required" };
    }

    try {
      const { error } = await adminClient
        .from("hr_policies")
        .update({
          title: title.trim(),
          category,
          summary: summary.trim(),
          content,
          updated_at: new Date().toISOString(),
        })
        .eq("id", policyId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Update policy exception:", err);
      return { success: false, error: err.message };
    }
  });

export interface DeletePolicyParams {
  policyId: string;
}

export const deletePolicy = createServerFn({ method: "POST" })
  .validator((d: DeletePolicyParams) => d)
  .handler(async ({ data }): Promise<PolicyResult> => {
    const adminClient = getAdminClient();
    if (!adminClient) return { success: false, error: "Database configuration error" };

    try {
      const { error } = await adminClient.from("hr_policies").delete().eq("id", data.policyId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Delete policy exception:", err);
      return { success: false, error: err.message };
    }
  });
