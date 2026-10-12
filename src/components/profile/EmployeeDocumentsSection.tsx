import React from "react";
import {
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Upload,
  Eye,
  Loader2,
} from "lucide-react";
import {
  getEmployeeDocumentsList,
  uploadEmployeeDocumentServerFn,
  getEmployeeDocumentDownloadUrl,
  parseDocumentFiles,
  type EmployeeDocumentItem,
  type UploadFileInput,
} from "../../lib/employee-documents";

interface EmployeeDocumentsSectionProps {
  companyId: string;
  userId?: string;
  employeeId?: string;
  showToast?: (msg: string, severity?: "success" | "error" | "info" | "warning") => void;
}

export function EmployeeDocumentsSection({
  companyId,
  userId,
  employeeId,
  showToast,
}: EmployeeDocumentsSectionProps) {
  const effectiveUserId = userId || employeeId || "";
  const [docsList, setDocsList] = React.useState<EmployeeDocumentItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploadingReqId, setUploadingReqId] = React.useState<string | null>(null);

  const fileInputRefs = React.useRef<{ [key: string]: HTMLInputElement | null }>({});

  const fetchDocs = React.useCallback(async () => {
    if (!companyId || !effectiveUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getEmployeeDocumentsList(companyId, effectiveUserId);
      setDocsList(data || []);
    } catch (err) {
      console.error("Error loading employee documents:", err);
      showToast?.("Failed to load documents list", "error");
    } finally {
      setLoading(false);
    }
  }, [companyId, effectiveUserId, showToast]);

  React.useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleFileSelect = async (requirementId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    if (selected.length === 0) return;

    const oversized = selected.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) {
      showToast?.(`"${oversized.name}" exceeds 10 MB limit.`, "error");
      return;
    }

    setUploadingReqId(requirementId);
    try {
      const readFiles = await Promise.all(
        selected.map(
          (file) =>
            new Promise<UploadFileInput>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const res = reader.result as string;
                const commaIdx = res.indexOf(",");
                resolve({
                  fileName: file.name,
                  sizeBytes: file.size,
                  base64Data: commaIdx !== -1 ? res.slice(commaIdx + 1) : res,
                  mimeType: file.type || "application/octet-stream",
                });
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            }),
        ),
      );

      const res = await uploadEmployeeDocumentServerFn({
        data: {
          companyId,
          userId: effectiveUserId,
          requirementId,
          files: readFiles,
        },
      });

      if (!res.success) throw new Error(res.error);

      showToast?.(
        readFiles.length === 1
          ? `"${readFiles[0]?.fileName}" uploaded successfully!`
          : `${readFiles.length} files uploaded successfully!`,
        "success",
      );
      await fetchDocs();
    } catch (err: any) {
      console.error("Upload error:", err);
      showToast?.(err.message || "Failed to upload document", "error");
    } finally {
      setUploadingReqId(null);
      if (event.target) event.target.value = "";
    }
  };

  const handleViewDocument = async (r2Key: string, fileName: string) => {
    try {
      const res = await getEmployeeDocumentDownloadUrl({ data: { r2ObjectKey: r2Key, fileName } });
      if (res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer");
      } else {
        showToast?.("Could not generate secure view link: " + (res.error || ""), "error");
      }
    } catch (err) {
      showToast?.("Failed to open document", "error");
    }
  };

  return (
    <div className="doc-desk-container">
      {/* Documents Grid */}
      {loading ? (
        <div className="doc-cards-grid">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton-shimmer" style={{ height: 120, borderRadius: "var(--radius-sm)" }} />
          ))}
        </div>
      ) : docsList.length === 0 ? (
        <div className="doc-desk-empty">
          <FileText size={32} strokeWidth={1.5} style={{ color: "var(--color-text-muted)" }} />
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-text-primary)" }}>
            No Document Requirements Found
          </div>
          <p style={{ fontSize: 12.5, color: "var(--color-text-muted)", margin: 0 }}>
            Mandatory HR document requirements will appear here when configured for your organization.
          </p>
        </div>
      ) : (
        <div className="doc-cards-grid">
          {docsList.map(({ requirement, submission }) => {
            const isUploaded = !!submission;
            const isVerified = submission?.status === "verified";
            const isRejected = submission?.status === "rejected";
            const isPending = submission?.status === "pending";
            const isCurrentUploading = uploadingReqId === requirement.id;
            const attachments = isUploaded ? parseDocumentFiles(submission) : [];

            return (
              <div
                key={requirement.id}
                className={`doc-card-minimal ${
                  isVerified
                    ? "is-verified"
                    : isRejected
                    ? "is-rejected"
                    : isUploaded
                    ? "is-uploaded"
                    : "is-missing"
                }`}
              >
                {/* Hidden file input */}
                <input
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                  ref={(el) => {
                    fileInputRefs.current[requirement.id] = el;
                  }}
                  hidden
                  onChange={(e) => handleFileSelect(requirement.id, e)}
                />

                {/* Card Header: Doc title, badge & status */}
                <div className="doc-card-header">
                  <div className="doc-card-title-group">
                    <span className="doc-card-title">{requirement.name}</span>
                    <span
                      className={`doc-card-req-tag ${
                        requirement.is_mandatory ? "mandatory" : "optional"
                      }`}
                    >
                      {requirement.is_mandatory ? "Mandatory" : "Optional"}
                    </span>
                  </div>

                  <div className="doc-card-status">
                    {isVerified ? (
                      <span className="doc-status-text verified" title="Verified by HR">
                        <CheckCircle2 size={12} />
                        <span>Verified</span>
                      </span>
                    ) : isRejected ? (
                      <span className="doc-status-text rejected" title="Action required">
                        <AlertCircle size={12} />
                        <span>Rejected</span>
                      </span>
                    ) : isPending ? (
                      <span className="doc-status-text pending" title="In review by HR">
                        <Clock size={12} />
                        <span>In Review</span>
                      </span>
                    ) : (
                      <span className="doc-status-text missing">
                        <span>Missing</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Body: Files Preview or Upload Dropzone */}
                <div className="doc-card-body">
                  {isUploaded ? (
                    <div className="doc-card-files-container">
                      {attachments.map((att, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleViewDocument(att.r2_object_key, att.file_name)}
                          className="doc-card-file-row"
                          title={`Click to preview ${att.file_name}`}
                        >
                          <div className="doc-card-file-left">
                            <FileText size={13} className="doc-card-file-icon" />
                            <span className="doc-card-file-name">{att.file_name}</span>
                          </div>
                          <div className="doc-card-file-right">
                            <span className="doc-card-file-size">
                              {(att.file_size / 1024).toFixed(0)} KB
                            </span>
                            <Eye size={12} className="doc-card-file-view-icon" />
                          </div>
                        </div>
                      ))}

                      {isRejected && submission.rejection_reason && (
                        <div className="doc-card-rejection-note">
                          <span style={{ fontWeight: 600 }}>HR Note: </span>
                          <span>{submission.rejection_reason}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isCurrentUploading}
                      onClick={() => fileInputRefs.current[requirement.id]?.click()}
                      className="doc-card-upload-box"
                      title="Click to select file"
                    >
                      {isCurrentUploading ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload size={13} />
                          <span>Upload Document</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Card Footer: Metadata timestamp & replace button */}
                {isUploaded && (
                  <div className="doc-card-footer">
                    <span className="doc-card-date">
                      Submitted {new Date(submission.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>

                    {!isVerified && (
                      <button
                        type="button"
                        disabled={isCurrentUploading}
                        onClick={() => fileInputRefs.current[requirement.id]?.click()}
                        className="doc-card-action-btn"
                        title="Upload a new file to replace"
                      >
                        {isCurrentUploading ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <>
                            <Upload size={11} />
                            <span>{isRejected ? "Re-upload" : "Replace"}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
