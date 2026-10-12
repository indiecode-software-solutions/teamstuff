import { createServerFn } from "@tanstack/react-start";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { supabase } from "./supabase";
import { getAdminClient } from "./master.server";

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

export interface CompanyDocumentRequirement {
  id: string;
  company_id: string;
  name: string;
  description: string;
  is_mandatory: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentFileAttachment {
  file_name: string;
  r2_object_key: string;
  file_size: number;
  mime_type: string;
}

export interface EmployeeDocument {
  id: string;
  company_id: string;
  user_id: string;
  requirement_id: string;
  file_name: string;
  file_url: string;
  r2_object_key: string;
  file_size: number;
  mime_type: string;
  files?: DocumentFileAttachment[];
  status: EmployeeDocumentStatus;
  rejection_reason?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  created_at: string;
  updated_at: string;
  verifier?: {
    name: string;
  } | null;
}

/**
 * Robustly parses all file attachments from an EmployeeDocument record.
 */
export function parseDocumentFiles(doc: EmployeeDocument | null | undefined): DocumentFileAttachment[] {
  if (!doc) return [];
  if (Array.isArray(doc.files) && doc.files.length > 0) {
    return doc.files;
  }
  if (typeof doc.file_url === "string" && doc.file_url.startsWith("[")) {
    try {
      const parsed = JSON.parse(doc.file_url);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
  }
  if (doc.r2_object_key) {
    return [
      {
        file_name: doc.file_name || "Document",
        r2_object_key: doc.r2_object_key,
        file_size: doc.file_size || 0,
        mime_type: doc.mime_type || "application/octet-stream",
      },
    ];
  }
  return [];
}

export interface EmployeeDocumentItem {
  requirement: CompanyDocumentRequirement;
  submission: EmployeeDocument | null;
}

export interface EmployeeDocSummary {
  user_id: string;
  name: string;
  email: string;
  job_title?: string | null;
  department?: string | null;
  employee_code?: string | null;
  total_required: number;
  submitted_count: number;
  verified_count: number;
  rejected_count: number;
  pending_count: number;
  is_complete: boolean;
}

/**
 * Fetch company's document requirements list from database.
 * Starts completely blank by default until configured by HR.
 */
export async function getCompanyDocumentRequirements(companyId: string): Promise<CompanyDocumentRequirement[]> {
  try {
    const admin = getAdminClient();
    const client = admin || supabase;
    const { data, error } = await client
      .from("company_document_requirements")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("Could not query document requirements:", error);
      return [];
    }

    return (data || []) as CompanyDocumentRequirement[];
  } catch (err) {
    console.error("getCompanyDocumentRequirements exception:", err);
    return [];
  }
}

/**
 * Add a new document requirement for a company
 */
export const addDocumentRequirement = createServerFn({ method: "POST" })
  .validator((d: { companyId: string; name: string; description?: string; isMandatory?: boolean }) => d)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const client = admin || supabase;

    const { data: inserted, error } = await client
      .from("company_document_requirements")
      .insert({
        company_id: data.companyId,
        name: data.name.trim(),
        description: (data.description || "").trim(),
        is_mandatory: data.isMandatory ?? true,
      })
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, requirement: inserted as CompanyDocumentRequirement };
  });

/**
 * Update an existing document requirement
 */
export const updateDocumentRequirement = createServerFn({ method: "POST" })
  .validator((d: { requirementId: string; name?: string; description?: string; isMandatory?: boolean }) => d)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const client = admin || supabase;

    const updates: any = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.description !== undefined) updates.description = (data.description || "").trim();
    if (data.isMandatory !== undefined) updates.is_mandatory = data.isMandatory;

    const { data: updated, error } = await client
      .from("company_document_requirements")
      .update(updates)
      .eq("id", data.requirementId)
      .select("*")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, requirement: updated as CompanyDocumentRequirement };
  });

/**
 * Delete an existing document requirement
 */
export const deleteDocumentRequirement = createServerFn({ method: "POST" })
  .validator((d: { requirementId: string }) => d)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const client = admin || supabase;

    const { error } = await client
      .from("company_document_requirements")
      .delete()
      .eq("id", data.requirementId);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  });

/**
 * Fetch all requirements alongside employee's uploaded documents (Server Function)
 */
export const getEmployeeDocumentsListServerFn = createServerFn({ method: "POST" })
  .validator((d: { companyId: string; userId: string }) => d)
  .handler(async ({ data }): Promise<EmployeeDocumentItem[]> => {
    try {
      const admin = getAdminClient();
      const client = admin || supabase;
      const requirements = await getCompanyDocumentRequirements(data.companyId);

      const { data: docs, error } = await client
        .from("employee_documents")
        .select("*, verifier:verified_by ( name )")
        .eq("company_id", data.companyId)
        .eq("user_id", data.userId);

      if (error) {
        console.error("Error fetching employee docs in serverFn:", error);
      }

      const docsByReqId = new Map<string, EmployeeDocument>();
      for (const d of docs || []) {
        docsByReqId.set(d.requirement_id, d as EmployeeDocument);
      }

      return requirements.map((req) => ({
        requirement: req,
        submission: docsByReqId.get(req.id) || null,
      }));
    } catch (err) {
      console.error("getEmployeeDocumentsListServerFn exception:", err);
      return [];
    }
  });

export async function getEmployeeDocumentsList(
  companyId: string,
  userId: string,
): Promise<EmployeeDocumentItem[]> {
  try {
    return await getEmployeeDocumentsListServerFn({ data: { companyId, userId } });
  } catch (err) {
    console.warn("getEmployeeDocumentsList server fallback to client:", err);
    try {
      const requirements = await getCompanyDocumentRequirements(companyId);
      const { data: docs } = await supabase
        .from("employee_documents")
        .select("*, verifier:verified_by ( name )")
        .eq("company_id", companyId)
        .eq("user_id", userId);

      const docsByReqId = new Map<string, EmployeeDocument>();
      for (const d of docs || []) {
        docsByReqId.set(d.requirement_id, d as EmployeeDocument);
      }

      return requirements.map((req) => ({
        requirement: req,
        submission: docsByReqId.get(req.id) || null,
      }));
    } catch (fallbackErr) {
      console.error("getEmployeeDocumentsList fallback error:", fallbackErr);
      return [];
    }
  }
}

export interface UploadFileInput {
  fileName: string;
  base64Data: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Upload employee document(s) directly to Cloudflare R2 and save/update record in DB.
 * Supports multiple file attachments per requirement (e.g. Front & Back photos).
 */
export const uploadEmployeeDocumentServerFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      companyId: string;
      userId: string;
      requirementId: string;
      files?: UploadFileInput[];
      // Backwards compatibility for single file payload
      fileName?: string;
      base64Data?: string;
      mimeType?: string;
      sizeBytes?: number;
    }) => d,
  )
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const client = admin || supabase;

    try {
      // 1. Collect list of files to upload
      const rawFiles: UploadFileInput[] = [];
      if (Array.isArray(data.files) && data.files.length > 0) {
        rawFiles.push(...data.files);
      } else if (data.fileName && data.base64Data) {
        rawFiles.push({
          fileName: data.fileName,
          base64Data: data.base64Data,
          mimeType: data.mimeType || "application/octet-stream",
          sizeBytes: data.sizeBytes || 0,
        });
      }

      if (rawFiles.length === 0) {
        return { success: false, error: "No files provided for upload" };
      }

      // 2. Query company name for clean storage path
      const { data: comp } = await client
        .from("companies")
        .select("name")
        .eq("id", data.companyId)
        .maybeSingle();

      const sanitize = (s: string) => (s || "company").replace(/[^a-zA-Z0-9._-]/g, "_");
      const companyFolder = sanitize(comp?.name || data.companyId);

      // 3. Upload all files to R2
      const uploadedAttachments: DocumentFileAttachment[] = [];
      let totalSize = 0;

      for (let i = 0; i < rawFiles.length; i++) {
        const file = rawFiles[i]!;
        const cleanFileName = file.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const r2ObjectKey = `companies/${companyFolder}/employee_documents/${data.userId}/${data.requirementId}_${Date.now()}_${i}_${cleanFileName}`;

        const buffer = Buffer.from(file.base64Data, "base64");
        await r2Client.send(
          new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: r2ObjectKey,
            Body: buffer,
            ContentType: file.mimeType || "application/octet-stream",
            ContentLength: file.sizeBytes || buffer.length,
          }),
        );

        uploadedAttachments.push({
          file_name: file.fileName,
          r2_object_key: r2ObjectKey,
          file_size: file.sizeBytes || buffer.length,
          mime_type: file.mimeType || "application/octet-stream",
        });
        totalSize += file.sizeBytes || buffer.length;
      }

      const primaryFile = uploadedAttachments[0]!;
      const compositeFileName =
        uploadedAttachments.length === 1
          ? primaryFile.file_name
          : `${uploadedAttachments.length} files (${uploadedAttachments.map((f) => f.file_name).join(", ")})`;

      // 4. Upsert row into employee_documents table
      const { data: upserted, error: dbErr } = await client
        .from("employee_documents")
        .upsert(
          {
            company_id: data.companyId,
            user_id: data.userId,
            requirement_id: data.requirementId,
            file_name: compositeFileName,
            file_url: JSON.stringify(uploadedAttachments), // Stores JSON attachments array
            r2_object_key: primaryFile.r2_object_key,
            file_size: totalSize,
            mime_type: primaryFile.mime_type,
            status: "pending",
            rejection_reason: null,
            verified_by: null,
            verified_at: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,requirement_id" },
        )
        .select("*")
        .single();

      if (dbErr) {
        console.error("DB Upsert error for employee document:", dbErr);
        return { success: false, error: dbErr.message };
      }

      return { success: true, document: upserted as EmployeeDocument };
    } catch (err: any) {
      console.error("uploadEmployeeDocumentServerFn exception:", err);
      return { success: false, error: err?.message || "Failed to upload document" };
    }
  });

/**
 * Delete an uploaded employee document from R2 and database
 */
export const deleteEmployeeDocumentServerFn = createServerFn({ method: "POST" })
  .validator((d: { documentId: string; r2ObjectKey: string }) => d)
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const client = admin || supabase;

    try {
      // 1. Delete from R2
      if (data.r2ObjectKey) {
        await r2Client
          .send(
            new DeleteObjectCommand({
              Bucket: BUCKET_NAME,
              Key: data.r2ObjectKey,
            }),
          )
          .catch((err) => console.warn("R2 delete warning:", err.message));
      }

      // 2. Delete from DB
      const { error } = await client.from("employee_documents").delete().eq("id", data.documentId);
      if (error) return { success: false, error: error.message };

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

/**
 * HR Action: Verify or reject an employee's submitted document
 */
export const verifyEmployeeDocumentServerFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      documentId: string;
      status: "verified" | "rejected";
      rejectionReason?: string;
      verifierId: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const client = admin || supabase;

    try {
      const { data: updated, error } = await client
        .from("employee_documents")
        .update({
          status: data.status,
          rejection_reason: data.status === "rejected" ? (data.rejectionReason || "").trim() : null,
          verified_by: data.verifierId,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.documentId)
        .select("*, verifier:verified_by ( name )")
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, document: updated as EmployeeDocument };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

/**
 * Generate a temporary signed view/download URL for an R2 object key
 */
export const getEmployeeDocumentDownloadUrl = createServerFn({ method: "POST" })
  .validator((d: { r2ObjectKey: string; fileName?: string }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; url: string | null; error?: string }> => {
    try {
      const signedUrl = await getSignedUrl(
        r2Client,
        new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: data.r2ObjectKey,
          ResponseContentDisposition: data.fileName
            ? `inline; filename="${encodeURIComponent(data.fileName)}"`
            : "inline",
        }),
        { expiresIn: 3600 }, // 1 hour validity
      );
      return { success: true, url: signedUrl };
    } catch (err: any) {
      console.error("getEmployeeDocumentDownloadUrl error:", err);
      return { success: false, url: null, error: err?.message || "Failed to generate view URL" };
    }
  });

/**
 * Summary for all employees in a company for HR Overview (Server Function)
 */
export const getCompanyEmployeesDocSummaryServerFn = createServerFn({ method: "POST" })
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data }): Promise<EmployeeDocSummary[]> => {
    try {
      const admin = getAdminClient();
      const client = admin || supabase;
      const requirements = await getCompanyDocumentRequirements(data.companyId);

      // Fetch all profiles for company
      const { data: profiles, error: pErr } = await client
        .from("profiles")
        .select("id, name, email, job_title, department, employee_code, role")
        .eq("company_id", data.companyId)
        .order("name", { ascending: true });

      if (pErr) throw pErr;

      // Fetch all employee documents for company
      const { data: allDocs, error: dErr } = await client
        .from("employee_documents")
        .select("id, user_id, requirement_id, status")
        .eq("company_id", data.companyId);

      if (dErr) throw dErr;

      const docsByUser = new Map<string, Array<{ id: string; requirement_id: string; status: string }>>();
      for (const d of allDocs || []) {
        if (!docsByUser.has(d.user_id)) {
          docsByUser.set(d.user_id, []);
        }
        docsByUser.get(d.user_id)!.push(d);
      }

      const summaries: EmployeeDocSummary[] = (profiles || []).map((p) => {
        const userDocs = docsByUser.get(p.id) || [];
        const submittedCount = userDocs.length;
        const verifiedCount = userDocs.filter((d) => d.status === "verified").length;
        const rejectedCount = userDocs.filter((d) => d.status === "rejected").length;
        const pendingCount = userDocs.filter((d) => d.status === "pending").length;

        // Check if all mandatory requirements have a submission that is not rejected
        const submittedReqIds = new Set(
          userDocs.filter((d) => d.status !== "rejected").map((d) => d.requirement_id),
        );
        const isComplete = requirements
          .filter((r) => r.is_mandatory)
          .every((r) => submittedReqIds.has(r.id));

        return {
          user_id: p.id,
          name: p.name || "Unknown",
          email: p.email || "—",
          job_title: p.job_title,
          department: p.department,
          employee_code: p.employee_code,
          total_required: requirements.length,
          submitted_count: submittedCount,
          verified_count: verifiedCount,
          rejected_count: rejectedCount,
          pending_count: pendingCount,
          is_complete: isComplete,
        };
      });

      return summaries;
    } catch (err) {
      console.error("getCompanyEmployeesDocSummaryServerFn error:", err);
      return [];
    }
  });

export async function getCompanyEmployeesDocSummary(companyId: string): Promise<EmployeeDocSummary[]> {
  try {
    return await getCompanyEmployeesDocSummaryServerFn({ data: { companyId } });
  } catch (err) {
    console.warn("getCompanyEmployeesDocSummary server fallback:", err);
    try {
      const requirements = await getCompanyDocumentRequirements(companyId);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, email, job_title, department, employee_code, role")
        .eq("company_id", companyId)
        .order("name", { ascending: true });

      const { data: allDocs } = await supabase
        .from("employee_documents")
        .select("id, user_id, requirement_id, status")
        .eq("company_id", companyId);

      const docsByUser = new Map<string, Array<{ id: string; requirement_id: string; status: string }>>();
      for (const d of allDocs || []) {
        if (!docsByUser.has(d.user_id)) {
          docsByUser.set(d.user_id, []);
        }
        docsByUser.get(d.user_id)!.push(d);
      }

      return (profiles || []).map((p) => {
        const userDocs = docsByUser.get(p.id) || [];
        const submittedCount = userDocs.length;
        const verifiedCount = userDocs.filter((d) => d.status === "verified").length;
        const rejectedCount = userDocs.filter((d) => d.status === "rejected").length;
        const pendingCount = userDocs.filter((d) => d.status === "pending").length;

        const submittedReqIds = new Set(
          userDocs.filter((d) => d.status !== "rejected").map((d) => d.requirement_id),
        );
        const isComplete = requirements
          .filter((r) => r.is_mandatory)
          .every((r) => submittedReqIds.has(r.id));

        return {
          user_id: p.id,
          name: p.name || "Unknown",
          email: p.email || "—",
          job_title: p.job_title,
          department: p.department,
          employee_code: p.employee_code,
          total_required: requirements.length,
          submitted_count: submittedCount,
          verified_count: verifiedCount,
          rejected_count: rejectedCount,
          pending_count: pendingCount,
          is_complete: isComplete,
        };
      });
    } catch (fallbackErr) {
      console.error("getCompanyEmployeesDocSummary fallback error:", fallbackErr);
      return [];
    }
  }
}

/**
 * Check if the currently logged-in user has pending/rejected mandatory documents.
 */
export async function checkUserPendingDocuments(
  companyId: string,
  userId: string,
): Promise<{
  hasPending: boolean;
  missingMandatoryCount: number;
  rejectedCount: number;
  totalPending: number;
  items: Array<{ name: string; isMandatory: boolean; status: "missing" | "pending" | "rejected" | "verified"; rejectionReason?: string | null }>;
}> {
  try {
    const list = await getEmployeeDocumentsList(companyId, userId);
    let missingMandatoryCount = 0;
    let rejectedCount = 0;

    const items = list.map((item) => {
      let status: "missing" | "pending" | "rejected" | "verified" = "missing";
      let rejectionReason: string | null = null;

      if (!item.submission) {
        status = "missing";
        if (item.requirement.is_mandatory) {
          missingMandatoryCount++;
        }
      } else if (item.submission.status === "rejected") {
        status = "rejected";
        rejectionReason = item.submission.rejection_reason || null;
        if (item.requirement.is_mandatory) {
          rejectedCount++;
        }
      } else if (item.submission.status === "verified") {
        status = "verified";
      } else {
        status = "pending";
      }

      return {
        name: item.requirement.name,
        isMandatory: item.requirement.is_mandatory,
        status,
        rejectionReason,
      };
    });

    const totalPending = missingMandatoryCount + rejectedCount;
    return {
      hasPending: totalPending > 0,
      missingMandatoryCount,
      rejectedCount,
      totalPending,
      items,
    };
  } catch (err) {
    console.error("checkUserPendingDocuments error:", err);
    return {
      hasPending: false,
      missingMandatoryCount: 0,
      rejectedCount: 0,
      totalPending: 0,
      items: [],
    };
  }
}
