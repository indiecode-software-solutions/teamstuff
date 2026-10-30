import { createServerFn } from "@tanstack/react-start";
import {
  getR2Path,
  uploadR2Base64,
  deleteR2Object,
  extractR2Key,
} from "./r2-storage";

export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Detects whether a stored profile_photo URL points to an uploaded asset (vs a DiceBear/external avatar). */
export function isUploadedProfileImage(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  if (url.includes("dicebear") || url.includes("api.dicebear.com")) return false;
  return (
    url.includes("r2.cloudflarestorage.com") ||
    url.includes("r2.dev") ||
    url.includes("/companies/") ||
    url.includes("res.cloudinary.com") ||
    url.startsWith("data:image/") ||
    url.startsWith("blob:")
  );
}

/** Returns the real uploaded photo URL or null if it's a DiceBear/cartoon fallback so UI renders letter initials */
export function sanitizeProfilePhoto(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  if (url.includes("dicebear") || url.includes("api.dicebear.com")) return null;
  return url;
}

/** Legacy Cloudinary publicId extractor kept for backward compatibility */
export function extractCloudinaryPublicId(url: string): string | null {
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
    if (!match || !match[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Helper that removes an asset from R2 or gracefully handles legacy Cloudinary assets. */
export async function destroyCloudinaryAsset(
  targetIdOrKey: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // If it's an R2 key or path
    if (targetIdOrKey.includes("companies/") || targetIdOrKey.includes("system/")) {
      return await deleteR2Object(targetIdOrKey);
    }
    // For legacy Cloudinary assets, log deprecation and return success
    return { success: true };
  } catch (err: unknown) {
    console.error("Asset deletion error:", errMessage(err));
    return { success: false, error: errMessage(err) };
  }
}

/**
 * Server function to securely upload a profile photo to Cloudflare R2.
 */
export const uploadProfilePhoto = createServerFn({ method: "POST" })
  .validator((d: { base64Data: string; companyId: string; userId: string }) => d)
  .handler(async ({ data }) => {
    const { base64Data, companyId, userId } = data;
    const key = getR2Path.profilePhoto(companyId, userId, "webp");

    try {
      const res = await uploadR2Base64({
        key,
        base64Data,
        contentType: "image/webp",
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to upload profile photo to R2");
      }

      return { success: true as const, secure_url: res.url };
    } catch (err: unknown) {
      console.error("❌ Profile Photo Upload Error:", errMessage(err));
      return { success: false as const, error: errMessage(err) };
    }
  });

/**
 * Server function to delete an uploaded profile photo.
 */
export const deleteProfilePhotoAsset = createServerFn({ method: "POST" })
  .validator((d: { publicId: string }) => d)
  .handler(async ({ data }) => destroyCloudinaryAsset(data.publicId));

/**
 * Client-side convenience: removes the previously uploaded profile photo (if any).
 * DiceBear URLs are external and need no cleanup. Failures are non-fatal.
 */
export async function removePreviousProfilePhoto(previousUrl?: string | null): Promise<void> {
  if (!isUploadedProfileImage(previousUrl)) return;
  const r2Key = extractR2Key(previousUrl);
  if (r2Key) {
    await deleteProfilePhotoAsset({ data: { publicId: r2Key } });
    return;
  }
  const legacyId = extractCloudinaryPublicId(previousUrl!);
  if (legacyId) {
    await deleteProfilePhotoAsset({ data: { publicId: legacyId } });
  }
}
