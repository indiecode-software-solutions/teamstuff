import crypto from "crypto";
import { createServerFn } from "@tanstack/react-start";

const CLOUDINARY_CLOUD_NAME = "dfqyaawjv";
const CLOUDINARY_API_KEY = "122886755481348";
const CLOUDINARY_API_SECRET = "TqdPN3VMRk_eQbUjnC1mz-4MwI0";

export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Detects whether a stored profile_photo URL points to an uploaded asset (vs a DiceBear/external avatar). */
export function isUploadedProfileImage(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  // If it's a dicebear avatar or non-uploaded image, reject it
  if (url.includes("dicebear") || url.includes("api.dicebear.com")) return false;
  return url.includes("res.cloudinary.com") || url.startsWith("data:image/") || url.startsWith("blob:");
}

/** Returns the real uploaded photo URL or null if it's a DiceBear/cartoon fallback so UI renders letter initials */
export function sanitizeProfilePhoto(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  if (url.includes("dicebear") || url.includes("api.dicebear.com")) return null;
  return url;
}

/** Extracts the Cloudinary public_id (including folder path) from a secure_url. */
export function extractCloudinaryPublicId(url: string): string | null {
  try {
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
    if (!match || !match[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Server-side helper that removes an asset from Cloudinary. */
export async function destroyCloudinaryAsset(
  publicId: string,
): Promise<{ success: boolean; error?: string }> {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const signatureStr = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash("sha1").update(signatureStr).digest("hex");

  const formData = new FormData();
  formData.append("api_key", CLOUDINARY_API_KEY);
  formData.append("timestamp", timestamp.toString());
  formData.append("public_id", publicId);
  formData.append("signature", signature);

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`,
      { method: "POST", body: formData },
    );
    if (!res.ok) {
      throw new Error(`Cloudinary destroy API returned status ${res.status}`);
    }
    const json = await res.json();
    if (json.result !== "ok" && json.result !== "not found") {
      throw new Error(`Cloudinary destroy failed with result: ${json.result}`);
    }
    return { success: true };
  } catch (err: unknown) {
    console.error("❌ Cloudinary Destroy Error:", errMessage(err));
    return { success: false, error: errMessage(err) };
  }
}

/**
 * Server function to securely upload a profile photo to Cloudinary.
 */
export const uploadProfilePhoto = createServerFn({ method: "POST" })
  .validator((d: { base64Data: string; companyId: string; userId: string }) => d)
  .handler(async ({ data }) => {
    const { base64Data, companyId, userId } = data;
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = `Intranet/companies/${companyId}/users/${userId}/profile`;
    const signatureStr = `folder=${folder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
    const signature = crypto.createHash("sha1").update(signatureStr).digest("hex");

    const formData = new FormData();
    formData.append("file", base64Data);
    formData.append("api_key", CLOUDINARY_API_KEY);
    formData.append("timestamp", timestamp.toString());
    formData.append("folder", folder);
    formData.append("signature", signature);

    try {
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: "POST", body: formData },
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Cloudinary API returned status ${res.status}: ${errText}`);
      }
      const json = await res.json();
      return { success: true as const, secure_url: json.secure_url as string };
    } catch (err: unknown) {
      console.error("❌ Profile Photo Upload Error:", errMessage(err));
      return { success: false as const, error: errMessage(err) };
    }
  });

/**
 * Server function to delete an uploaded profile photo from Cloudinary.
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
  const publicId = extractCloudinaryPublicId(previousUrl!);
  if (!publicId) return;
  const result = await deleteProfilePhotoAsset({ data: { publicId } });
  if (!result.success) {
    console.warn("Failed to clean up previous profile photo:", result.error);
  }
}
