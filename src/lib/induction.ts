import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { supabase } from "./supabase";

export { getMyCompanyId } from "./policies";

export type TrainingBlockType = "text" | "image" | "embed" | "audio" | "team";

/**
 * A content block inside a training section.
 * - text:  markdown-ish paragraph text in `content`
 * - image: Cloudinary URL in `url` (+ optional `caption`)
 * - embed: link to embed in `url` (YouTube renders as a player) (+ optional `caption`)
 * - audio: Cloudinary / direct audio URL in `url` (+ optional `caption`)
 * - team:  dynamic team cards generated from company profiles (+ optional `caption` or filter)
 */
export interface TrainingBlock {
  type: TrainingBlockType;
  content?: string;
  url?: string;
  caption?: string;
}

export interface TrainingSection {
  id: string;
  company_id: string;
  title: string;
  description: string;
  content: TrainingBlock[];
  is_mandatory: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}

/**
 * Fetch the signed-in user's company training sections (ordered).
 * RLS restricts reads to employees of the company.
 */
export async function getCompanyTrainingSections(companyId: string): Promise<TrainingSection[]> {
  try {
    const { data, error } = await supabase
      .from("training_sections")
      .select("*")
      .eq("company_id", companyId)
      .order("order_index", { ascending: true });
    if (error) throw error;
    return (data as TrainingSection[]) || [];
  } catch (err) {
    console.error("Error fetching training sections:", err);
    return [];
  }
}

/**
 * Upload an image asset to the company's induction asset folder on Cloudinary
 * (auto-created: Intranet/companies/<companyId>/assets/induction).
 */
export const uploadTrainingAsset = createServerFn({ method: "POST" })
  .validator((d: { base64Data: string; companyId: string }) => d)
  .handler(async ({ data }) => {
    const { base64Data, companyId } = data;
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = `Intranet/companies/${companyId}/assets/induction`;
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
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Cloudinary API returned status ${res.status}: ${errText}`);
      }

      const json = await res.json();
      return { success: true, secure_url: json.secure_url as string };
    } catch (err: any) {
      console.error("Cloudinary training asset upload error:", err.message);
      return { success: false, error: err.message };
    }
  });

export interface SaveTrainingSectionParams {
  sectionId?: string;
  companyId: string;
  title: string;
  description: string;
  content: TrainingBlock[];
  isMandatory: boolean;
  orderIndex: number;
}

export interface TrainingSectionResult {
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

function sanitizeBlocks(content: TrainingBlock[]): TrainingBlock[] {
  return (content || []).filter((b) => {
    if (b.type === "text") return Boolean(b.content?.trim());
    if (b.type === "team") return true;
    return Boolean(b.url?.trim());
  });
}

/**
 * Server function that creates or updates a training section (service role,
 * so HR/Admin can publish induction content on behalf of the organisation).
 */
export const saveTrainingSection = createServerFn({ method: "POST" })
  .validator((d: SaveTrainingSectionParams) => d)
  .handler(async ({ data }): Promise<TrainingSectionResult> => {
    const adminClient = getAdminClient();
    if (!adminClient) return { success: false, error: "Database configuration error" };

    const { sectionId, companyId, title, description, content, isMandatory, orderIndex } = data;
    if (!title.trim()) return { success: false, error: "Section title is required" };

    const blocks = sanitizeBlocks(content);

    try {
      if (sectionId) {
        const { error } = await adminClient
          .from("training_sections")
          .update({
            title: title.trim(),
            description: description.trim(),
            content: blocks,
            is_mandatory: isMandatory,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sectionId);
        if (error) throw error;
      } else {
        const { error } = await adminClient.from("training_sections").insert({
          company_id: companyId,
          title: title.trim(),
          description: description.trim(),
          content: blocks,
          is_mandatory: isMandatory,
          order_index: orderIndex,
        });
        if (error) throw error;
      }
      return { success: true };
    } catch (err: any) {
      console.error("Save training section exception:", err);
      return { success: false, error: err.message };
    }
  });

export interface DeleteTrainingSectionParams {
  sectionId: string;
}

export const deleteTrainingSection = createServerFn({ method: "POST" })
  .validator((d: DeleteTrainingSectionParams) => d)
  .handler(async ({ data }): Promise<TrainingSectionResult> => {
    const adminClient = getAdminClient();
    if (!adminClient) return { success: false, error: "Database configuration error" };

    try {
      const { error } = await adminClient
        .from("training_sections")
        .delete()
        .eq("id", data.sectionId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Delete training section exception:", err);
      return { success: false, error: err.message };
    }
  });

export interface ReorderTrainingSectionsParams {
  orderedSectionIds: string[];
}

export const reorderTrainingSections = createServerFn({ method: "POST" })
  .validator((d: ReorderTrainingSectionsParams) => d)
  .handler(async ({ data }): Promise<TrainingSectionResult> => {
    const adminClient = getAdminClient();
    if (!adminClient) return { success: false, error: "Database configuration error" };

    try {
      const updates = data.orderedSectionIds.map((id, index) =>
        adminClient
          .from("training_sections")
          .update({ order_index: index, updated_at: new Date().toISOString() })
          .eq("id", id)
      );

      const results = await Promise.all(updates);
      const firstError = results.find((r) => r.error);
      if (firstError && firstError.error) throw firstError.error;

      return { success: true };
    } catch (err: any) {
      console.error("Reorder training sections exception:", err);
      return { success: false, error: err.message };
    }
  });
