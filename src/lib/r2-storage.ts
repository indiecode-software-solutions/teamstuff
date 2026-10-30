import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getEnvVar(key: string, fallback = ""): string {
  if (typeof process !== "undefined" && process.env && process.env[key]) {
    return process.env[key]!;
  }
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key]) {
    return (import.meta.env as Record<string, string>)[key]!;
  }
  return fallback;
}

const R2_ENDPOINT = getEnvVar("VITE_R2_ENDPOINT");
const R2_ACCESS_KEY_ID = getEnvVar("VITE_R2_ACCESS_KEY_ID");
const R2_SECRET_ACCESS_KEY = getEnvVar("VITE_R2_SECRET_ACCESS_KEY");
export const R2_BUCKET_NAME = getEnvVar("VITE_R2_BUCKET_NAME", "teamstuff");
export const R2_PUBLIC_URL = getEnvVar("VITE_R2_PUBLIC_URL", "");

export const r2Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
});

/**
 * Clean and sanitize file names/extensions for safe object keys
 */
export function sanitizeKeySegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Standard deterministic Cloudflare R2 path generator.
 * Enforces neat hierarchical sorting per tenant:
 * companies/{company_id}/{feature}/...
 */
export const getR2Path = {
  profilePhoto(companyId: string, userId: string, ext = "webp"): string {
    const ts = Date.now();
    return `companies/${sanitizeKeySegment(companyId)}/profiles/${sanitizeKeySegment(userId)}/avatar_${ts}.${ext}`;
  },
  companyLogo(companyId: string, ext = "webp"): string {
    const ts = Date.now();
    return `companies/${sanitizeKeySegment(companyId)}/branding/logo_${ts}.${ext}`;
  },
  loginHero(companyId: string, ext = "webp"): string {
    const ts = Date.now();
    return `companies/${sanitizeKeySegment(companyId)}/branding/login_hero_${ts}.${ext}`;
  },
  payslipLogo(companyId: string, ext = "webp"): string {
    const ts = Date.now();
    return `companies/${sanitizeKeySegment(companyId)}/branding/payslip_logo_${ts}.${ext}`;
  },
  payslipStamp(companyId: string, ext = "png"): string {
    const ts = Date.now();
    return `companies/${sanitizeKeySegment(companyId)}/branding/payslip_stamp_${ts}.${ext}`;
  },
  payslipSignature(companyId: string, ext = "png"): string {
    const ts = Date.now();
    return `companies/${sanitizeKeySegment(companyId)}/branding/payslip_signature_${ts}.${ext}`;
  },
  inductionAsset(companyId: string, moduleId: string, filename: string): string {
    const ts = Date.now();
    return `companies/${sanitizeKeySegment(companyId)}/induction/${sanitizeKeySegment(moduleId)}/${ts}_${sanitizeKeySegment(filename)}`;
  },
  approvalAttachment(companyId: string, approvalId: string, filename: string): string {
    const ts = Date.now();
    return `companies/${sanitizeKeySegment(companyId)}/approvals/${sanitizeKeySegment(approvalId)}/${ts}_${sanitizeKeySegment(filename)}`;
  },
  forumAttachment(companyId: string, postId: string, filename: string): string {
    const ts = Date.now();
    return `companies/${sanitizeKeySegment(companyId)}/forum/${sanitizeKeySegment(postId)}/${ts}_${sanitizeKeySegment(filename)}`;
  },
  memoryPhoto(companyId: string, memoryId: string, filename: string): string {
    const ts = Date.now();
    return `companies/${sanitizeKeySegment(companyId)}/memories/${sanitizeKeySegment(memoryId)}/${ts}_${sanitizeKeySegment(filename)}`;
  },
  siteVisitPhoto(companyId: string, userId: string, visitId: string, type: "selfie" | "meter" | "custom", ext = "jpg"): string {
    const ts = Date.now();
    return `companies/${sanitizeKeySegment(companyId)}/site_visits/${sanitizeKeySegment(userId)}/${sanitizeKeySegment(visitId)}_${type}_${ts}.${ext}`;
  },
  masterAdminAsset(assetType: string, filename: string): string {
    const ts = Date.now();
    return `system/master/${sanitizeKeySegment(assetType)}/${ts}_${sanitizeKeySegment(filename)}`;
  },
};

/**
 * Uploads a Buffer directly to R2.
 */
export async function uploadR2Buffer(params: {
  key: string;
  buffer: Buffer | Uint8Array;
  contentType?: string;
}): Promise<{ success: boolean; url: string; error?: string }> {
  try {
    const { key, buffer, contentType = "application/octet-stream" } = params;
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ContentLength: buffer.length,
      })
    );

    const publicUrl = getR2PublicUrl(key);
    return { success: true, url: publicUrl };
  } catch (err: any) {
    console.error("R2 Buffer upload error:", err);
    return { success: false, url: "", error: err?.message || "Failed to upload to R2" };
  }
}

/**
 * Parses and uploads base64 file data (handles data URL prefixes like data:image/png;base64,...).
 */
export async function uploadR2Base64(params: {
  key: string;
  base64Data: string;
  contentType?: string;
}): Promise<{ success: boolean; url: string; error?: string }> {
  try {
    let cleanBase64 = params.base64Data;
    let detectedMime = params.contentType;

    if (params.base64Data.startsWith("data:")) {
      const match = params.base64Data.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        if (!detectedMime) detectedMime = match[1];
        cleanBase64 = match[2];
      }
    }

    const buffer = Buffer.from(cleanBase64, "base64");
    return await uploadR2Buffer({
      key: params.key,
      buffer,
      contentType: detectedMime || "application/octet-stream",
    });
  } catch (err: any) {
    console.error("R2 Base64 upload error:", err);
    return { success: false, url: "", error: err?.message || "Failed to decode base64 file" };
  }
}

/**
 * Deletes an object from R2 by its key.
 */
export async function deleteR2Object(key: string): Promise<{ success: boolean; error?: string }> {
  try {
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      })
    );
    return { success: true };
  } catch (err: any) {
    console.error("R2 Delete error:", err);
    return { success: false, error: err?.message || "Failed to delete from R2" };
  }
}

/**
 * Generates a public URL for an R2 object key.
 * If VITE_R2_PUBLIC_URL is provided, formats as ${VITE_R2_PUBLIC_URL}/${key}.
 * Otherwise, generates an authenticated presigned URL (1 year expiration) as seamless fallback.
 */
export function getR2PublicUrl(key: string): string {
  if (R2_PUBLIC_URL) {
    const base = R2_PUBLIC_URL.replace(/\/+$/, "");
    const cleanKey = key.replace(/^\/+/, "");
    return `${base}/${cleanKey}`;
  }
  // If no public domain is connected, return formatted endpoint URL
  const endpointBase = R2_ENDPOINT.replace(/\/+$/, "");
  return `${endpointBase}/${R2_BUCKET_NAME}/${key}`;
}

/**
 * Generates a secure time-limited presigned URL for protected/sensitive objects
 * (e.g. payslip signatures, stamps, expense receipts, audit photos).
 */
export async function getR2PresignedUrl(params: {
  key: string;
  expiresInSeconds?: number;
  filename?: string;
  asAttachment?: boolean;
}): Promise<string> {
  const { key, expiresInSeconds = 3600, filename, asAttachment = false } = params;
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ...(asAttachment && filename
      ? { ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"` }
      : filename
      ? { ResponseContentDisposition: `inline; filename="${encodeURIComponent(filename)}"` }
      : {}),
  });

  return await getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Extracts the R2 object key from an existing R2 URL (public or presigned).
 */
export function extractR2Key(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  // Match key under companies/ or system/
  const match = url.match(/(companies\/[^\s?#]+|system\/[^\s?#]+)/);
  if (match && match[1]) {
    return decodeURIComponent(match[1]);
  }
  return null;
}
