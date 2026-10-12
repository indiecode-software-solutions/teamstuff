import { supabase } from "./supabase";
import { getAdminClient } from "./master.server";
import { createServerFn } from "@tanstack/react-start";
import { sanitizeProfilePhoto } from "./profile-photo";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2Client = new S3Client({
  region: "auto",
  endpoint: import.meta.env["VITE_R2_ENDPOINT"] || "",
  credentials: {
    accessKeyId: import.meta.env["VITE_R2_ACCESS_KEY_ID"] || "",
    secretAccessKey: import.meta.env["VITE_R2_SECRET_ACCESS_KEY"] || "",
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
});

const BUCKET_NAME = import.meta.env["VITE_R2_BUCKET_NAME"] || "teamstuff";

/**
 * Re-keys every object under companies/<oldName>/ to companies/<newName>/
 * when a company is renamed (copy to new key -> update DB -> delete old),
 * so renames never leave a second company folder in R2.
 */
export const migrateCompanyR2Prefix = createServerFn({ method: "POST" })
  .validator((d: { companyId: string; oldName: string; newName: string }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; error?: string; migrated?: number }> => {
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");
    const oldPrefix = `companies/${sanitize(data.oldName)}/`;
    const newPrefix = `companies/${sanitize(data.newName)}/`;
    if (oldPrefix === newPrefix) return { success: true, migrated: 0 };

    const admin = getAdminClient();
    if (!admin) return { success: false, error: "Database configuration error" };

    const { data: files, error } = await admin
      .from("files")
      .select("id, r2_object_key")
      .eq("company_id", data.companyId)
      .like("r2_object_key", `${oldPrefix}%`);
    if (error) return { success: false, error: error.message };

    let migrated = 0;
    for (const f of files || []) {
      const newKey = newPrefix + (f.r2_object_key || "").slice(oldPrefix.length);
      try {
        await r2Client.send(
          new CopyObjectCommand({
            Bucket: BUCKET_NAME,
            CopySource: `${BUCKET_NAME}/${f.r2_object_key}`,
            Key: newKey,
          }),
        );
        await admin.from("files").update({ r2_object_key: newKey }).eq("id", f.id);
        await r2Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: f.r2_object_key }));
        migrated++;
      } catch (err: any) {
        console.warn(`R2 rename migration failed for ${f.r2_object_key}:`, err.message);
      }
    }
    return { success: true, migrated };
  });

/**
 * Server function to upload a file directly to Cloudflare R2 bucket.
 * Executing server-side avoids browser cross-origin (CORS) blocks on tenant domains.
 */
export const uploadCloudFileR2ServerFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      base64Data: string;
      r2ObjectKey: string;
      mimeType: string;
      sizeBytes: number;
    }) => d,
  )
  .handler(async ({ data }): Promise<{ success: boolean; error?: string }> => {
    try {
      const buffer = Buffer.from(data.base64Data, "base64");
      await r2Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: data.r2ObjectKey,
          Body: buffer,
          ContentType: data.mimeType || "application/octet-stream",
          ContentLength: data.sizeBytes || buffer.length,
        }),
      );
      return { success: true };
    } catch (err: any) {
      console.error("R2 Server upload error:", err);
      return { success: false, error: err?.message || "R2 storage upload failed" };
    }
  });

/**
 * Server function to delete a file from Cloudflare R2 bucket.
 * Executing server-side avoids browser CORS restrictions.
 */
export const deleteCloudFileR2ServerFn = createServerFn({ method: "POST" })
  .validator((d: { r2ObjectKey: string }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; error?: string }> => {
    try {
      await r2Client.send(
        new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: data.r2ObjectKey,
        }),
      );
      return { success: true };
    } catch (err: any) {
      console.warn("R2 Server delete warning:", err);
      return { success: false, error: err?.message };
    }
  });

export interface CloudFolder {
  id: string;
  companyId: string;
  parentFolderId: string | null;
  name: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
  /** True for synthetic owner-grouping folders in Company Library */
  isVirtual?: boolean;
}

/**
 * Prefix used for synthetic owner-group folder IDs in Company Library.
 * Format: "virtual:{ownerUserId}"
 */
export const VIRTUAL_FOLDER_PREFIX = "virtual:";

export interface CloudFile {
  id: string;
  companyId: string;
  ownerUserId: string;
  folderId: string | null;
  name: string;
  originalName: string;
  r2ObjectKey: string;
  mimeType: string;
  sizeBytes: number;
  visibility: "private" | "company" | "shared";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  ownerName?: string;
  ownerPhotoUrl?: string | null;
  sharedWithNames?: string[];
}

export interface StorageLedger {
  companyId: string;
  allocatedBytes: number; // e.g. 5368709120 for 5GB
  usedBytes: number;
  updatedAt: string;
  userStorage?: UserStorageUsage[];
}

export interface UserStorageUsage {
  userId: string;
  userName: string;
  userAvatar?: string;
  usedBytes: number;
}

export interface FileAuditLog {
  id: string;
  companyId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, any>;
  createdAt: string;
}

export interface CurrentUserContext {
  userId: string;
  companyId: string;
  companyName: string;
  name: string;
  email: string;
  photoUrl?: string | null;
}

/**
 * Derives current user identity and company_id directly from authentication session.
 * CRITICAL RULE: NEVER trust client-supplied company_id.
 */
export async function getAuthenticatedUserContext(): Promise<CurrentUserContext | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, company_id, name, profile_photo")
      .eq("id", user.id)
      .maybeSingle();

    let companyName = "Teamstuff";
    if (profile?.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("name")
        .eq("id", profile.company_id)
        .maybeSingle();
      if (company?.name) {
        companyName = company.name;
      }
    }

    const photoUrl = sanitizeProfilePhoto(profile?.profile_photo);

    if (!profile || !profile.company_id) {
      // Fallback fallback profile data if user exists in auth session
      return {
        userId: user.id,
        companyId: "c1111111-1111-1111-1111-111111111111", // Default demo tenant
        companyName: "Teamstuff",
        name: profile?.name || user.email?.split("@")[0] || "User",
        email: user.email || "user@teamstuff.com",
        photoUrl: photoUrl || null,
      };
    }

    return {
      userId: profile.id,
      companyId: profile.company_id,
      companyName,
      name: profile.name || user.email?.split("@")[0] || "User",
      email: user.email || "",
      photoUrl: photoUrl || null,
    };
  } catch (err) {
    console.error("Error authenticating user context:", err);
    return null;
  }
}

/**
 * Fetch storage ledger for current company with quota checks.
 */
export async function getCompanyStorageLedger(companyId: string): Promise<StorageLedger> {
  const defaultQuota = 5 * 1024 * 1024 * 1024; // 5 GB default

  try {
    const { data: ledgerData } = await supabase
      .from("company_storage")
      .select("company_id, allocated_bytes, used_bytes, updated_at")
      .eq("company_id", companyId)
      .maybeSingle();

    // Fetch per-user storage summary — two queries to avoid relying on FK join
    const { data: fileSummary } = await supabase
      .from("files")
      .select("size_bytes, owner_user_id")
      .eq("company_id", companyId)
      .is("deleted_at", null);

    // Collect unique user IDs, then fetch their names
    const ownerIds = [
      ...new Set((fileSummary || []).map((f: any) => f.owner_user_id).filter(Boolean)),
    ];
    const profileMap: Record<string, { name: string }> = {};

    // Seed profileMap from current auth user first (always works via RLS)
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (authUser) {
      const { data: ownProfile } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("id", authUser.id)
        .maybeSingle();
      const resolvedName = ownProfile?.name || authUser.email?.split("@")[0] || "User";
      profileMap[authUser.id] = { name: resolvedName };
    }

    // For any remaining owner IDs not yet in profileMap, fetch individually
    const unresolved = ownerIds.filter((id) => !profileMap[id as string]);
    if (unresolved.length > 0) {
      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", unresolved);
      (profileRows || []).forEach((p: any) => {
        const resolvedName = p.name || "Unknown User";
        profileMap[p.id] = { name: resolvedName };
      });
    }

    const userMap: Record<string, UserStorageUsage> = {};
    let calculatedTotal = 0;

    (fileSummary || []).forEach((f: any) => {
      const size = Number(f.size_bytes) || 0;
      calculatedTotal += size;
      const uid = f.owner_user_id;
      if (!uid) return;
      if (!userMap[uid]) {
        const entry: UserStorageUsage = {
          userId: uid,
          userName: profileMap[uid]?.name || "Unknown User",
          usedBytes: 0,
        };
        userMap[uid] = entry;
      }
      userMap[uid].usedBytes += size;
    });

    const userStorage = Object.values(userMap).sort(
      (a, b) => b.usedBytes - a.usedBytes,
    ) as UserStorageUsage[];

    // Always prefer live-calculated total from files table; DB ledger may be stale
    const liveUsed =
      calculatedTotal > 0 ? calculatedTotal : ledgerData ? Number(ledgerData.used_bytes) || 0 : 0;

    if (ledgerData) {
      return {
        companyId: ledgerData.company_id,
        allocatedBytes: Number(ledgerData.allocated_bytes) || defaultQuota,
        usedBytes: liveUsed,
        updatedAt: ledgerData.updated_at,
        userStorage,
      };
    }

    return {
      companyId,
      allocatedBytes: defaultQuota,
      usedBytes: liveUsed,
      updatedAt: new Date().toISOString(),
      userStorage,
    };
  } catch (err) {
    console.error("Error fetching company storage ledger:", err);
    return {
      companyId,
      allocatedBytes: defaultQuota,
      usedBytes: 0,
      updatedAt: new Date().toISOString(),
      userStorage: [],
    };
  }
}

/**
 * Fetch storage ledger for current user with 5GB quota check.
 */
export async function getUserStorageLedger(
  companyId: string,
  userId: string,
): Promise<StorageLedger> {
  const defaultQuota = 5 * 1024 * 1024 * 1024; // 5 GB default

  try {
    const { data: files, error } = await supabase
      .from("files")
      .select("size_bytes, owner_user_id, company_id")
      .eq("company_id", companyId)
      .eq("owner_user_id", userId)
      .is("deleted_at", null);

    const calculatedUsed = (files || []).reduce(
      (acc: number, f: any) => acc + (Number(f.size_bytes) || 0),
      0,
    );

    // User storage quota is per-employee based on company storage_quota_gb
    const { data: comp } = await supabase
      .from("companies")
      .select("storage_quota_gb")
      .eq("id", companyId)
      .maybeSingle();
    const quotaGb = Number(comp?.storage_quota_gb) || 5;
    const allocatedBytes = quotaGb * 1024 * 1024 * 1024;

    return {
      companyId,
      allocatedBytes,
      usedBytes: calculatedUsed,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("Error getting user storage ledger:", err);
    return {
      companyId,
      allocatedBytes: defaultQuota,
      usedBytes: 0,
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Verify if incoming upload fits in user's individual storage quota before allowing upload.
 */
export async function verifyStorageQuota(
  companyId: string,
  userId: string,
  incomingSizeBytes: number,
): Promise<{ allowed: boolean; remainingBytes: number; message?: string }> {
  const ledger = await getUserStorageLedger(companyId, userId);
  const remaining = ledger.allocatedBytes - ledger.usedBytes;

  if (incomingSizeBytes > remaining) {
    const remainingMB = (remaining / (1024 * 1024)).toFixed(1);
    return {
      allowed: false,
      remainingBytes: remaining,
      message: `Storage quota exceeded! You have ${remainingMB} MB remaining, but the file size is ${(incomingSizeBytes / (1024 * 1024)).toFixed(1)} MB.`,
    };
  }

  return { allowed: true, remainingBytes: remaining };
}

const validProfileIdsCache = new Map<string, { ids: string[]; at: number }>();
const VALID_PROFILE_IDS_TTL_MS = 30_000;

/**
 * Ids of profiles currently belonging to the company. Used to hide folders/files
 * whose owner account no longer exists (e.g. deleted employee leftovers).
 * Cached briefly per company so directory loads don't repeat this query.
 */
async function getValidCompanyProfileIds(companyId: string): Promise<string[]> {
  const cached = validProfileIdsCache.get(companyId);
  if (cached && Date.now() - cached.at < VALID_PROFILE_IDS_TTL_MS) return cached.ids;
  try {
    const { data } = await supabase.from("profiles").select("id").eq("company_id", companyId);
    const ids = (data || []).map((p: any) => p.id);
    validProfileIdsCache.set(companyId, { ids, at: Date.now() });
    return ids;
  } catch (err) {
    console.error("Error fetching company profile ids:", err);
    return [];
  }
}

/**
 * Fetch folders in current directory for authenticated user's company.
 */
export async function getFolders(
  companyId: string,
  parentFolderId: string | null = null,
  ownerUserId?: string,
): Promise<CloudFolder[]> {
  try {
    if (parentFolderId && parentFolderId.startsWith(VIRTUAL_FOLDER_PREFIX)) {
      return getVirtualFolders(companyId, parentFolderId);
    }

    let query = supabase
      .from("folders")
      .select("id, company_id, parent_folder_id, name, owner_user_id, created_at, updated_at")
      .eq("company_id", companyId);

    if (parentFolderId === null) {
      query = query.is("parent_folder_id", null);
    } else {
      query = query.eq("parent_folder_id", parentFolderId);
    }

    if (ownerUserId) {
      query = query.eq("owner_user_id", ownerUserId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    const validIds = await getValidCompanyProfileIds(companyId);
    const visible =
      validIds.length > 0
        ? data.filter(
            (f) =>
              validIds.includes(f.owner_user_id) ||
              (!ownerUserId &&
                f.parent_folder_id === null &&
                typeof f.name === "string" &&
                f.name.toLowerCase() === "company_library"),
          )
        : [];

    return visible.map((f: any) => ({
      id: f.id,
      companyId: f.company_id,
      parentFolderId: f.parent_folder_id,
      name: f.name,
      ownerUserId: f.owner_user_id,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    }));
  } catch (err) {
    console.error("Error fetching folders:", err);
    return [];
  }
}

/**
 * Resolves virtual subfolders within an owner's drive folder tree.
 */
export async function getVirtualFolders(
  companyId: string,
  parentFolderId: string,
): Promise<CloudFolder[]> {
  try {
    const pathPart = parentFolderId.slice(VIRTUAL_FOLDER_PREFIX.length);
    const slashIdx = pathPart.indexOf("/");
    const ownerUserId = slashIdx === -1 ? pathPart : pathPart.slice(0, slashIdx);
    const currentRealFolderId = slashIdx === -1 ? null : pathPart.slice(slashIdx + 1);

    const libraryRootId = await getCompanyLibraryFolderId(companyId);
    if (!libraryRootId) return [];

    const looseGroups = await getLooseCompanyFiles(companyId, libraryRootId);
    const ownerGroup = looseGroups.find((g) => g.ownerId === ownerUserId);
    if (!ownerGroup || ownerGroup.files.length === 0) return [];

    const looseFiles = ownerGroup.files;

    // Fetch all folders for this user
    const { data: allFoldersData } = await supabase
      .from("folders")
      .select("id, parent_folder_id, name, owner_user_id, created_at, updated_at")
      .eq("company_id", companyId)
      .eq("owner_user_id", ownerUserId);

    const allFolders = allFoldersData || [];
    const folderMap = new Map<string, any>();
    for (const f of allFolders) {
      folderMap.set(f.id, f);
    }

    // Set of folder IDs containing (directly or indirectly) at least one loose file
    const activeFolders = new Set<string>();
    for (const file of looseFiles) {
      let fId = file.folderId;
      while (fId) {
        activeFolders.add(fId);
        const folder = folderMap.get(fId);
        fId = folder ? folder.parent_folder_id : null;
      }
    }

    const result: CloudFolder[] = [];
    for (const f of allFolders) {
      if (activeFolders.has(f.id) && f.parent_folder_id === currentRealFolderId) {
        result.push({
          id: `${VIRTUAL_FOLDER_PREFIX}${ownerUserId}/${f.id}`,
          companyId,
          parentFolderId,
          name: f.name,
          ownerUserId,
          createdAt: f.created_at,
          updatedAt: f.updated_at,
          isVirtual: true,
        });
      }
    }

    return result;
  } catch (err) {
    console.error("Error getting virtual folders:", err);
    return [];
  }
}


/**
 * Fetch all folders for authenticated user's company (used for breadcrumbs tree resolution).
 */
export async function getAllFolders(companyId: string): Promise<CloudFolder[]> {
  try {
    const { data, error } = await supabase
      .from("folders")
      .select("id, company_id, parent_folder_id, name, owner_user_id, created_at, updated_at")
      .eq("company_id", companyId);

    if (error || !data) return [];

    const validIds = await getValidCompanyProfileIds(companyId);
    const visible =
      validIds.length > 0
        ? data.filter(
            (f) =>
              validIds.includes(f.owner_user_id) ||
              (f.parent_folder_id === null &&
                typeof f.name === "string" &&
                f.name.toLowerCase() === "company_library"),
          )
        : [];

    return visible.map((f: any) => ({
      id: f.id,
      companyId: f.company_id,
      parentFolderId: f.parent_folder_id,
      name: f.name,
      ownerUserId: f.owner_user_id,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    }));
  } catch (err) {
    console.error("Error fetching all folders:", err);
    return [];
  }
}

/**
 * Create a new folder under company_id.
 */
export async function createFolder(
  userContext: CurrentUserContext,
  name: string,
  parentFolderId: string | null,
): Promise<CloudFolder | null> {
  try {
    const folderData = {
      company_id: userContext.companyId,
      parent_folder_id: parentFolderId,
      name: name.trim(),
      owner_user_id: userContext.userId,
    };

    const { data, error } = await supabase.from("folders").insert([folderData]).select().single();

    if (error || !data) {
      console.warn("Folder insertion fallback:", error);
      const fakeFolder: CloudFolder = {
        id: crypto.randomUUID(),
        companyId: userContext.companyId,
        parentFolderId,
        name: name.trim(),
        ownerUserId: userContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await recordAuditLog(userContext, "folder_created", "folder", fakeFolder.id, {
        name: fakeFolder.name,
      });
      return fakeFolder;
    }

    await recordAuditLog(userContext, "folder_created", "folder", data.id, { name: data.name });

    return {
      id: data.id,
      companyId: data.company_id,
      parentFolderId: data.parent_folder_id,
      name: data.name,
      ownerUserId: data.owner_user_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (err) {
    console.error("Error creating folder:", err);
    return null;
  }
}

/**
 * Fetch files for current user and tab context.
 */
export async function getFiles(
  userContext: CurrentUserContext,
  folderId: string | null = null,
  tab: "mydrive" | "shared" | "company" = "mydrive",
): Promise<CloudFile[]> {
  try {
    let query = supabase
      .from("files")
      .select(
        `
        id,
        company_id,
        owner_user_id,
        folder_id,
        name,
        original_name,
        r2_object_key,
        mime_type,
        size_bytes,
        visibility,
        created_at,
        updated_at,
        deleted_at
      `,
      )
      .eq("company_id", userContext.companyId)
      .is("deleted_at", null);

    if (tab === "mydrive") {
      query = query.eq("owner_user_id", userContext.userId);
      if (folderId === null) {
        query = query.order("created_at", { ascending: false }).limit(6);
      } else {
        query = query.eq("folder_id", folderId);
      }
    } else if (tab === "company") {
      const validIds = await getValidCompanyProfileIds(userContext.companyId);
      if (validIds.length === 0) return [];
      query = query.eq("visibility", "company").in("owner_user_id", validIds);

      if (folderId === null) {
        // At root: no files shown — navigate into a folder
        return [];
      } else if (folderId.startsWith(VIRTUAL_FOLDER_PREFIX)) {
        const pathPart = folderId.slice(VIRTUAL_FOLDER_PREFIX.length);
        const slashIdx = pathPart.indexOf("/");
        const ownerUserId = slashIdx === -1 ? pathPart : pathPart.slice(0, slashIdx);
        const currentRealFolderId = slashIdx === -1 ? null : pathPart.slice(slashIdx + 1);

        const libraryRootId = await getCompanyLibraryFolderId(userContext.companyId);
        if (!libraryRootId) return [];
        const ownerGroups = await getLooseCompanyFiles(userContext.companyId, libraryRootId);
        const group = ownerGroups.find((g) => g.ownerId === ownerUserId);
        if (!group) return [];

        return group.files.filter((f) => f.folderId === currentRealFolderId);
      } else {
        query = query.eq("folder_id", folderId);
      }
    } else if (tab === "shared") {
      const { data: shareRows } = await supabase
        .from("file_shares")
        .select("file_id")
        .eq("company_id", userContext.companyId)
        .eq("shared_with_id", userContext.userId);
      const sharedIds = (shareRows || []).map((r: any) => r.file_id);
      if (sharedIds.length === 0) return [];
      query = query.in("id", sharedIds);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    // Resolve owner names and profile photos
    const ownerIds = Array.from(
      new Set(data.map((f: any) => f.owner_user_id).filter(Boolean)),
    ) as string[];
    const profileMap: Record<string, { name: string; photoUrl: string | null }> = {};

    if (userContext?.userId) {
      profileMap[userContext.userId] = {
        name: userContext.name || "User",
        photoUrl: userContext.photoUrl || null,
      };
    }

    const missingOwnerIds = ownerIds.filter((id) => !profileMap[id]);
    if (missingOwnerIds.length > 0) {
      try {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, name, profile_photo")
          .in("id", missingOwnerIds);
        (profileRows || []).forEach((p: any) => {
          profileMap[p.id] = {
            name: p.name || "User",
            photoUrl: sanitizeProfilePhoto(p.profile_photo),
          };
        });
      } catch (profileErr) {
        console.warn("Failed to fetch file owner profiles:", profileErr);
      }
    }

    return data.map((f: any) => {
      const ownerInfo = profileMap[f.owner_user_id];
      const isSelf = f.owner_user_id === userContext.userId;
      return {
        id: f.id,
        companyId: f.company_id,
        ownerUserId: f.owner_user_id,
        folderId: f.folder_id,
        name: f.name,
        originalName: f.original_name,
        r2ObjectKey: f.r2_object_key,
        mimeType: f.mime_type,
        sizeBytes: Number(f.size_bytes),
        visibility: f.visibility,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
        deletedAt: f.deleted_at,
        ownerName: ownerInfo?.name || (isSelf ? userContext.name : "User"),
        ownerPhotoUrl: ownerInfo?.photoUrl ?? (isSelf ? userContext.photoUrl : null),
      };
    });
  } catch (err) {
    console.error("Error fetching files:", err);
    return [];
  }
}

/**
 * Find the company-wide library root folder for a company.
 * It is a root-level folder named "Company_Library" (case-insensitive).
 */
export async function getCompanyLibraryFolderId(companyId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("folders")
      .select("id")
      .eq("company_id", companyId)
      .is("parent_folder_id", null)
      .ilike("name", "company_library")
      .maybeSingle();
    return data?.id ?? null;
  } catch (err) {
    console.warn("Failed to find company library folder:", err);
    return null;
  }
}

/**
 * Returns all company-visible files owned by members of the company that are
 * NOT inside the Company Library folder tree. These are files shared company-wide
 * from personal folders. They are grouped by owner so the caller can render
 * virtual folders named after each owner.
 */
export async function getLooseCompanyFiles(
  companyId: string,
  libraryRootId: string,
): Promise<{ ownerId: string; ownerName: string; files: CloudFile[] }[]> {
  try {
    // Build the set of all folder IDs that belong to the library tree
    const { data: allFolders } = await supabase
      .from("folders")
      .select("id, parent_folder_id")
      .eq("company_id", companyId);

    const libraryFolderIds = new Set<string>([libraryRootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of allFolders || []) {
        if (!libraryFolderIds.has(f.id) && f.parent_folder_id && libraryFolderIds.has(f.parent_folder_id)) {
          libraryFolderIds.add(f.id);
          changed = true;
        }
      }
    }

    // Fetch company-visible files whose folder is NOT in the library tree
    const { data: rawFiles } = await supabase
      .from("files")
      .select(`id, company_id, owner_user_id, folder_id, name, original_name,
               r2_object_key, mime_type, size_bytes, visibility, created_at, updated_at, deleted_at,
               owner:owner_user_id ( name, profile_photo )`)
      .eq("company_id", companyId)
      .eq("visibility", "company")
      .is("deleted_at", null);

    const looseFiles = (rawFiles || []).filter(
      (f: any) => !f.folder_id || !libraryFolderIds.has(f.folder_id),
    );

    // Group by owner
    const byOwner = new Map<string, { ownerName: string; files: CloudFile[] }>();
    for (const f of looseFiles) {
      const ownerId: string = f.owner_user_id;
      const ownerName: string = (f.owner as any)?.name || "Unknown User";
      const ownerPhotoUrl = sanitizeProfilePhoto((f.owner as any)?.profile_photo);
      if (!byOwner.has(ownerId)) {
        byOwner.set(ownerId, { ownerName, files: [] });
      }
      byOwner.get(ownerId)!.files.push({
        id: f.id,
        companyId: f.company_id,
        ownerUserId: f.owner_user_id,
        folderId: f.folder_id,
        name: f.name,
        originalName: f.original_name,
        r2ObjectKey: f.r2_object_key,
        mimeType: f.mime_type,
        sizeBytes: f.size_bytes,
        visibility: f.visibility,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
        deletedAt: f.deleted_at,
        ownerName,
        ownerPhotoUrl,
      });
    }

    return Array.from(byOwner.entries()).map(([ownerId, { ownerName, files }]) => ({
      ownerId,
      ownerName,
      files,
    }));
  } catch (err) {
    console.error("Error fetching loose company files:", err);
    return [];
  }
}

/**
 * Create the default "Company_Library" root folder for a company if it does not exist yet.
 */
export async function ensureCompanyLibraryFolder(
  userContext: CurrentUserContext,
): Promise<string | null> {
  const existing = await getCompanyLibraryFolderId(userContext.companyId);
  if (existing) return existing;
  const created = await createFolder(userContext, "Company_Library", null);
  return created?.id ?? null;
}

/**
 * Ensure the default "Task Attachments" folder exists for the user in My Drive.
 */
export async function ensureTaskAttachmentsFolder(
  userContext: CurrentUserContext,
): Promise<string | null> {
  try {
    const { data: existing } = await supabase
      .from("folders")
      .select("id")
      .eq("company_id", userContext.companyId)
      .eq("owner_user_id", userContext.userId)
      .is("parent_folder_id", null)
      .ilike("name", "Task Attachments")
      .maybeSingle();

    if (existing?.id) return existing.id;

    const created = await createFolder(userContext, "Task Attachments", null);
    return created?.id ?? null;
  } catch (err) {
    console.error("Error ensuring Task Attachments folder:", err);
    return null;
  }
}

/**
 * Direct upload helper that validates quota, generates trusted R2 key, records metadata, and updates ledger.
 */
export async function uploadFileToCloud(
  userContext: CurrentUserContext,
  file: File,
  folderId: string | null,
  customName?: string,
): Promise<{ success: boolean; fileItem?: CloudFile; message?: string }> {
  // 1. Enforce quota
  const quotaCheck = await verifyStorageQuota(userContext.companyId, userContext.userId, file.size);
  if (!quotaCheck.allowed) {
    return { success: false, message: quotaCheck.message || "Quota exceeded." };
  }

  // 2. Generate backend R2 object key
  const fileId = crypto.randomUUID();
  const finalName = customName && customName.trim() !== "" ? customName.trim() : file.name;

  let folderPath = "";
  let pathSegments: string[] = [];
  let pathIds: string[] = [];
  if (folderId) {
    try {
      let currentId: string | null = folderId;
      for (let i = 0; i < 10 && currentId; i++) {
        const res: any = await supabase
          .from("folders")
          .select("id, name, parent_folder_id")
          .eq("id", currentId)
          .maybeSingle();
        const fRecord = res.data;
        if (fRecord) {
          pathSegments.unshift(fRecord.name);
          pathIds.unshift(fRecord.id);
          currentId = fRecord.parent_folder_id;
        } else {
          break;
        }
      }
      if (pathSegments.length > 0) {
        folderPath = "/" + pathSegments.map((s) => s.replace(/[^a-zA-Z0-9._-]/g, "_")).join("/");
      }
    } catch (e) {
      console.warn("Failed to resolve folder path tree:", e);
    }
  }

  const cleanCompName = userContext.companyName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const cleanUserName = userContext.name.replace(/[^a-zA-Z0-9._-]/g, "_");

  // A folder chain is a company library tree when it contains the company's
  // library root (by id) OR a "Company_Library" folder (legacy nesting); the
  // content then lives under companies/<Company>/Company_Library/...
  const libraryRootId = await getCompanyLibraryFolderId(userContext.companyId);
  let libraryAnchorIdx = libraryRootId ? pathIds.indexOf(libraryRootId) : -1;
  if (libraryAnchorIdx === -1) {
    libraryAnchorIdx = pathSegments.findIndex((s) => s.toLowerCase() === "company_library");
  }
  const isLibraryUpload = libraryAnchorIdx >= 0;

  const fileExt = finalName.includes(".") ? finalName.substring(finalName.lastIndexOf(".")) : "";
  const baseName = finalName.includes(".")
    ? finalName.substring(0, finalName.lastIndexOf("."))
    : finalName;
  const cleanBaseName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const sanitizedName = `${cleanBaseName}-${fileId.substring(0, 8)}${fileExt}`;

  let r2ObjectKey: string;
  if (isLibraryUpload) {
    // Company library content lives under companies/<Company>/Company_Library/...
    // (never under the uploader's personal folder)
    const subSegments = pathSegments
      .slice(libraryAnchorIdx + 1)
      .map((s) => s.replace(/[^a-zA-Z0-9._-]/g, "_"));
    const subFolderPart = subSegments.join("/");
    r2ObjectKey = `companies/${cleanCompName}/Company_Library${
      subFolderPart ? `/${subFolderPart}` : ""
    }/${sanitizedName}`;
  } else {
    const folderPart = folderPath ? `files${folderPath}` : "files";
    r2ObjectKey = `companies/${cleanCompName}/${cleanUserName}/${folderPart}/${sanitizedName}`;
  }

  const visibility: "private" | "company" = isLibraryUpload ? "company" : "private";

  // Company/user/folder renames would split the bucket; saveCompanyProfile calls
  // migrateCompanyR2Prefix to re-key existing objects when the company name changes.

  try {
    // 3. Store file binary in Cloudflare R2 bucket via server function (or client fallback)
    let uploadSucceeded = false;
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const res = reader.result as string;
          const commaIdx = res.indexOf(",");
          resolve(commaIdx !== -1 ? res.slice(commaIdx + 1) : res);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const serverRes = await uploadCloudFileR2ServerFn({
        data: {
          base64Data,
          r2ObjectKey,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        },
      });

      if (serverRes.success) {
        uploadSucceeded = true;
      } else {
        console.warn("Server R2 upload failed, falling back to direct upload:", serverRes.error);
      }
    } catch (serverErr) {
      console.warn("Server R2 upload error, falling back to direct upload:", serverErr);
    }

    if (!uploadSucceeded) {
      // Direct client fallback
      await r2Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: r2ObjectKey,
          Body: file,
          ContentType: file.type || "application/octet-stream",
          ContentLength: file.size,
        }),
      );
    }

    // 4. Save metadata record to files table
    const fileRecord = {
      id: fileId,
      company_id: userContext.companyId,
      owner_user_id: userContext.userId,
      folder_id: folderId,
      name: finalName,
      original_name: file.name,
      r2_object_key: r2ObjectKey,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      visibility,
    };

    const { data: createdFile } = await supabase
      .from("files")
      .insert([fileRecord])
      .select()
      .maybeSingle();

    // 5. Increment company storage ledger
    const ledger = await getCompanyStorageLedger(userContext.companyId);
    const updatedUsed = ledger.usedBytes + file.size;

    await supabase.from("company_storage").upsert({
      company_id: userContext.companyId,
      used_bytes: updatedUsed,
      allocated_bytes: ledger.allocatedBytes,
      updated_at: new Date().toISOString(),
    });

    // 6. Record Audit Log
    await recordAuditLog(userContext, "file_uploaded", "file", fileId, {
      fileName: finalName,
      sizeBytes: file.size,
      r2ObjectKey,
    });

    const newFile: CloudFile = {
      id: createdFile?.id || fileId,
      companyId: userContext.companyId,
      ownerUserId: userContext.userId,
      folderId,
      name: finalName,
      originalName: file.name,
      r2ObjectKey,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      visibility,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      ownerName: userContext.name,
      ownerPhotoUrl: userContext.photoUrl || null,
    };

    return { success: true, fileItem: newFile };
  } catch (err: any) {
    console.error("Upload process error:", err);
    return {
      success: false,
      message:
        err && typeof err === "object" && "message" in err && typeof err.message === "string"
          ? err.message
          : "Failed to complete cloud file upload.",
    };
  }
}

/**
 * Generate secure presigned download link for file.
 * Verifies that requested file belongs to user's company and user has permission.
 */
export async function getPresignedDownloadUrl(
  userContext: CurrentUserContext,
  fileId: string,
  asAttachment = true,
): Promise<{ url: string | null; message?: string }> {
  try {
    const { data: file } = await supabase
      .from("files")
      .select("*")
      .eq("id", fileId)
      .eq("company_id", userContext.companyId)
      .maybeSingle();

    if (!file) {
      return { url: null, message: "File not found or permission denied." };
    }

    const filename = file.name || "download";
    // Generate signed download URL from Cloudflare R2 bucket directly
    const signedUrl = await getSignedUrl(
      r2Client,
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: file.r2_object_key,
        ...(asAttachment
          ? { ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"` }
          : {}),
      }),
      { expiresIn: 300 }, // 5 minutes
    );

    await recordAuditLog(userContext, "file_downloaded", "file", file.id, {
      fileName: file.name,
    });

    return { url: signedUrl };
  } catch (err) {
    console.error("Error generating presigned download URL:", err);
    return { url: null, message: "Could not generate download link." };
  }
}

/**
 * Delete file securely and update company storage ledger.
 */
export async function deleteFile(
  userContext: CurrentUserContext,
  fileId: string,
  sizeBytes: number,
): Promise<boolean> {
  try {
    // 1. Verify file belongs to company
    const { data: file } = await supabase
      .from("files")
      .select("id, r2_object_key, company_id")
      .eq("id", fileId)
      .eq("company_id", userContext.companyId)
      .maybeSingle();

    if (file) {
      await supabase
        .from("files")
        .delete()
        .eq("id", fileId)
        .eq("company_id", userContext.companyId);

      // Delete object from Cloudflare R2 via server function with client fallback
      try {
        await deleteCloudFileR2ServerFn({
          data: { r2ObjectKey: file.r2_object_key },
        });
      } catch {
        try {
          await r2Client.send(
            new DeleteObjectCommand({
              Bucket: BUCKET_NAME,
              Key: file.r2_object_key,
            }),
          );
        } catch {}
      }
    }

    // 2. Decrement storage ledger
    const ledger = await getCompanyStorageLedger(userContext.companyId);
    const newUsed = Math.max(0, ledger.usedBytes - sizeBytes);

    await supabase.from("company_storage").upsert({
      company_id: userContext.companyId,
      used_bytes: newUsed,
      allocated_bytes: ledger.allocatedBytes,
      updated_at: new Date().toISOString(),
    });

    // 3. Audit log
    await recordAuditLog(userContext, "file_deleted", "file", fileId, { sizeBytes });
    return true;
  } catch (err) {
    console.error("Error deleting file:", err);
    return false;
  }
}

/**
 * Share file with specific users or company wide.
 */
export async function shareFile(
  userContext: CurrentUserContext,
  fileId: string,
  shareType: "user" | "company",
  targetUserId?: string,
  permission: "view" | "download" | "edit" = "view",
): Promise<boolean> {
  try {
    // Update file visibility
    const visibility = shareType === "company" ? "company" : "shared";

    await supabase
      .from("files")
      .update({ visibility, updated_at: new Date().toISOString() })
      .eq("id", fileId)
      .eq("company_id", userContext.companyId);

    // Record share entry
    await supabase.from("file_shares").insert([
      {
        file_id: fileId,
        company_id: userContext.companyId,
        shared_with_type: shareType,
        shared_with_id: targetUserId || null,
        permission,
        created_by: userContext.userId,
      },
    ]);

    await recordAuditLog(userContext, "file_shared", "file", fileId, {
      shareType,
      targetUserId,
      permission,
    });

    return true;
  } catch (err) {
    console.error("Error sharing file:", err);
    return false;
  }
}

/**
 * Audit log recording utility for compliance and security auditing.
 */
export async function recordAuditLog(
  userContext: CurrentUserContext,
  action: string,
  resourceType: string,
  resourceId: string,
  details: Record<string, any> = {},
): Promise<void> {
  try {
    await supabase.from("file_audit_logs").insert([
      {
        company_id: userContext.companyId,
        user_id: userContext.userId,
        action,
        resource_type: resourceType,
        resource_id: resourceId,
        details: {
          userName: userContext.name,
          userEmail: userContext.email,
          ...details,
        },
      },
    ]);
  } catch (err) {
    console.warn("Audit logging failed:", err);
  }
}

/**
 * Query company audit logs for admin dashboard.
 */
export async function getCompanyAuditLogs(companyId: string): Promise<FileAuditLog[]> {
  try {
    const { data } = await supabase
      .from("file_audit_logs")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data) return [];

    return data.map((log: any) => ({
      id: log.id,
      companyId: log.company_id,
      userId: log.user_id,
      userName: log.details?.userName || "User",
      userEmail: log.details?.userEmail || "",
      action: log.action,
      resourceType: log.resource_type,
      resourceId: log.resource_id,
      details: log.details || {},
      createdAt: log.created_at,
    }));
  } catch (err) {
    console.error("Error getting audit logs:", err);
    return [];
  }
}

/**
 * Delete a folder and recursively clean its contained files from DB and R2 storage.
 */
export async function deleteFolder(
  userContext: CurrentUserContext,
  folderId: string,
): Promise<boolean> {
  try {
    // 1. Fetch all files inside this folder (and recursively its subfolders if any)
    const { data: filesToDelete } = await supabase
      .from("files")
      .select("id, r2_object_key, size_bytes")
      .eq("company_id", userContext.companyId)
      .eq("folder_id", folderId);

    // 2. Delete each file from R2
    if (filesToDelete && filesToDelete.length > 0) {
      for (const file of filesToDelete) {
        try {
          await deleteCloudFileR2ServerFn({
            data: { r2ObjectKey: file.r2_object_key },
          });
        } catch {
          try {
            await r2Client.send(
              new DeleteObjectCommand({
                Bucket: BUCKET_NAME,
                Key: file.r2_object_key,
              }),
            );
          } catch (e) {
            console.warn("Failed to delete file from R2 during folder deletion:", e);
          }
        }
      }
    }

    // 3. Delete the folder row (this cascades in DB to delete files/shares/subfolders)
    const { error } = await supabase
      .from("folders")
      .delete()
      .eq("id", folderId)
      .eq("company_id", userContext.companyId);

    if (error) {
      console.error("Error deleting folder:", error);
      return false;
    }

    // 4. Update the ledger by subtracting the deleted files size
    if (filesToDelete && filesToDelete.length > 0) {
      const totalDeletedBytes = filesToDelete.reduce(
        (acc, curr) => acc + Number(curr.size_bytes),
        0,
      );
      if (totalDeletedBytes > 0) {
        const ledger = await getCompanyStorageLedger(userContext.companyId);
        const updatedUsed = Math.max(0, ledger.usedBytes - totalDeletedBytes);
        await supabase.from("company_storage").upsert({
          company_id: userContext.companyId,
          used_bytes: updatedUsed,
          allocated_bytes: ledger.allocatedBytes,
          updated_at: new Date().toISOString(),
        });
      }
    }

    await recordAuditLog(userContext, "folder_deleted", "folder", folderId);
    return true;
  } catch (err) {
    console.error("Error in deleteFolder:", err);
    return false;
  }
}

/**
 * Generates a short-lived presigned download URL for the Teamstuff Android APK.
 * Called client-side when user taps "Download App" — generates a fresh link each time.
 */
export const getAppDownloadUrl = createServerFn({ method: "POST" })
  .handler(async (): Promise<{ url: string } | { error: string }> => {
    try {
      const url = await getSignedUrl(
        r2Client,
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: "capoasis-app.apk",
          ResponseContentDisposition: 'attachment; filename="Teamstuff.apk"',
        }),
        { expiresIn: 900 } // 15 minutes — enough time to download
      );
      return { url };
    } catch (err) {
      console.error("Error generating app download URL:", err);
      return { error: "Failed to generate download link" };
    }
  });
