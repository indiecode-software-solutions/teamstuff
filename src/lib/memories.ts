import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { supabase } from "./supabase";

export { getMyCompanyId } from "./policies";

export type MemoryCategory = "Team Building" | "Celebrations" | "Workshops" | "Offsite";

export const MEMORY_CATEGORIES: MemoryCategory[] = [
  "Team Building",
  "Celebrations",
  "Workshops",
  "Offsite",
];

export interface CompanyMemory {
  id: string;
  company_id: string;
  title: string;
  date: string;
  location: string;
  image: string;
  category: MemoryCategory;
  likes: number;
  hasLiked: boolean;
  attendees: string[];
  created_at: string;
  updated_at: string;
}

/**
 * Fetch the signed-in user's company memories (newest first).
 * RLS restricts reads to employees of the company. Like counts combine the
 * base likes set by HR with real likes from the memory_likes table.
 */
export async function getCompanyMemories(companyId: string): Promise<CompanyMemory[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("company_memories")
      .select(`*, memory_likes:memory_likes ( user_id )`)
      .eq("company_id", companyId)
      .order("date", { ascending: false });
    if (error) throw error;
    return (data || []).map((m: any) => {
      const userLikes: { user_id: string }[] = m.memory_likes || [];
      return {
        id: m.id,
        company_id: m.company_id,
        title: m.title,
        date: m.date,
        location: m.location,
        image: m.image,
        category: m.category,
        likes: (m.likes || 0) + userLikes.length,
        hasLiked: userLikes.some((l) => l.user_id === user?.id),
        attendees: m.attendees || [],
        created_at: m.created_at,
        updated_at: m.updated_at,
      };
    });
  } catch (err) {
    console.error("Error fetching company memories:", err);
    return [];
  }
}

/**
 * Toggle the signed-in user's like on a memory. Mirrors the forum like
 * pattern: rows live in memory_likes (RLS scoped to the company), so any
 * employee can like, and the difference is shown as likes count.
 */
export async function toggleMemoryLike(
  memoryId: string,
  userId: string,
  hasLiked: boolean,
): Promise<boolean> {
  try {
    if (hasLiked) {
      const { error } = await supabase
        .from("memory_likes")
        .delete()
        .eq("memory_id", memoryId)
        .eq("user_id", userId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("memory_likes")
        .insert([{ memory_id: memoryId, user_id: userId }]);
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.error("Error toggling memory like:", err);
    return false;
  }
}

/**
 * Upload a memory image to the company's memories asset folder on Cloudinary
 * (auto-created: Intranet/companies/<companyId>/assets/memories).
 */
export const uploadMemoryImage = createServerFn({ method: "POST" })
  .validator((d: { base64Data: string; companyId: string }) => d)
  .handler(async ({ data }) => {
    const { base64Data, companyId } = data;
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = `Intranet/companies/${companyId}/assets/memories`;
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
        const errText = await res.text();
        throw new Error(`Cloudinary API returned status ${res.status}: ${errText}`);
      }

      const json = await res.json();
      return { success: true, secure_url: json.secure_url as string };
    } catch (err: any) {
      console.error("Cloudinary memory image upload error:", err.message);
      return { success: false, error: err.message };
    }
  });

export interface SaveMemoryParams {
  memoryId?: string;
  companyId: string;
  title: string;
  date: string;
  location: string;
  image: string;
  category: MemoryCategory;
  likes: number;
  attendees: string[];
  createdBy?: string;
}

export interface MemoryResult {
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
 * Server function that creates or updates a company memory (service role,
 * so HR/Admin can publish memories on behalf of the organisation).
 */
export const saveMemory = createServerFn({ method: "POST" })
  .validator((d: SaveMemoryParams) => d)
  .handler(async ({ data }): Promise<MemoryResult> => {
    const adminClient = getAdminClient();
    if (!adminClient) return { success: false, error: "Database configuration error" };

    const {
      memoryId,
      companyId,
      title,
      date,
      location,
      image,
      category,
      likes,
      attendees,
      createdBy,
    } = data;
    if (!title.trim() || !image.trim()) {
      return { success: false, error: "Title and image are required" };
    }

    try {
      if (memoryId) {
        const { error } = await adminClient
          .from("company_memories")
          .update({
            title: title.trim(),
            date,
            location: location.trim(),
            image: image.trim(),
            category,
            likes: Math.max(0, Math.round(likes || 0)),
            attendees,
            updated_at: new Date().toISOString(),
          })
          .eq("id", memoryId);
        if (error) throw error;
      } else {
        const { error } = await adminClient.from("company_memories").insert({
          company_id: companyId,
          title: title.trim(),
          date,
          location: location.trim(),
          image: image.trim(),
          category,
          likes: Math.max(0, Math.round(likes || 0)),
          attendees,
          ...(createdBy ? { created_by: createdBy } : {}),
        });
        if (error) throw error;
      }
      return { success: true };
    } catch (err: any) {
      console.error("Save memory exception:", err);
      return { success: false, error: err.message };
    }
  });

export interface DeleteMemoryParams {
  memoryId: string;
}

export const deleteMemory = createServerFn({ method: "POST" })
  .validator((d: DeleteMemoryParams) => d)
  .handler(async ({ data }): Promise<MemoryResult> => {
    const adminClient = getAdminClient();
    if (!adminClient) return { success: false, error: "Database configuration error" };

    try {
      const { error } = await adminClient.from("company_memories").delete().eq("id", data.memoryId);
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Delete memory exception:", err);
      return { success: false, error: err.message };
    }
  });
