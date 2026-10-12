import React from "react";
import {
  Plus as Add,
  SquarePen as Edit,
  Trash2 as Delete,
  FileUp as UploadFile,
  Link as LinkIcon,
  BookOpen as MenuBook,
  Music as MusicIcon,
  Volume2,
  ArrowUp,
  ArrowDown,
  Users as UsersIcon,
  AlertTriangle,
} from "lucide-react";
import {
  getMyCompanyId,
  getCompanyTrainingSections,
  saveTrainingSection,
  deleteTrainingSection,
  reorderTrainingSections,
  uploadTrainingAsset,
  type TrainingBlockType,
  type TrainingSection,
} from "../../lib/induction";
import { supabase } from "../../lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Skeleton } from "../ui/skeleton";
import { Checkbox } from "../ui/checkbox";

interface InductionTabProps {
  showToast: (msg: string, severity?: "success" | "error" | "info" | "warning") => void;
}

interface BlockDraft {
  id: string;
  type: TrainingBlockType;
  content: string;
  url: string;
  caption: string;
}

interface SectionDraft {
  title: string;
  description: string;
  isMandatory: boolean;
  blocks: BlockDraft[];
}

function newBlockId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now() + Math.random());
}

function emptyBlock(type: TrainingBlockType = "text"): BlockDraft {
  return { id: newBlockId(), type, content: "", url: "", caption: "" };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const TYPE_LABELS: Record<TrainingBlockType, string> = {
  text: "Text",
  image: "Image",
  audio: "Audio",
  embed: "Embed Link",
  team: "Meet the Family (Team)",
};

export function InductionTab({ showToast }: InductionTabProps) {
  const [sections, setSections] = React.useState<TrainingSection[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<SectionDraft>({
    title: "",
    description: "",
    isMandatory: true,
    blocks: [],
  });
  const [uploadingBlockId, setUploadingBlockId] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const audioFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [deleteTarget, setDeleteTarget] = React.useState<TrainingSection | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function loadSections() {
    const companyId = await getMyCompanyId();
    if (!companyId) return;
    setSections(await getCompanyTrainingSections(companyId));
  }

  React.useEffect(() => {
    loadSections().finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditingId(null);
    setDraft({ title: "", description: "", isMandatory: true, blocks: [emptyBlock("text")] });
    setEditorOpen(true);
  }

  function openEdit(section: TrainingSection) {
    setEditingId(section.id);
    setDraft({
      title: section.title,
      description: section.description || "",
      isMandatory: section.is_mandatory,
      blocks: section.content.map((b) => ({
        id: newBlockId(),
        type: b.type,
        content: b.content || "",
        url: b.url || "",
        caption: b.caption || "",
      })),
    });
    setEditorOpen(true);
  }

  function updateBlock(id: string, patch: Partial<BlockDraft>) {
    setDraft((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
  }

  function moveBlock(index: number, direction: "up" | "down") {
    setDraft((prev) => {
      const targetIdx = direction === "up" ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= prev.blocks.length) return prev;
      const nextBlocks = [...prev.blocks];
      const current = nextBlocks[index];
      const target = nextBlocks[targetIdx];
      if (!current || !target) return prev;
      nextBlocks[index] = target;
      nextBlocks[targetIdx] = current;
      return { ...prev, blocks: nextBlocks };
    });
  }

  async function handleMoveSection(index: number, direction: "up" | "down") {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const current = sections[index];
    const target = sections[targetIndex];
    if (!current || !target) return;

    const nextSections = [...sections];
    nextSections[index] = target;
    nextSections[targetIndex] = current;

    setSections(nextSections);

    try {
      const result = await reorderTrainingSections({
        data: {
          orderedSectionIds: nextSections.map((s) => s.id),
        },
      });
      if (!result.success) {
        showToast("Failed to update section order.", "error");
        await loadSections();
      } else {
        showToast("Section order updated.", "success");
      }
    } catch {
      showToast("Error updating order.", "error");
      await loadSections();
    }
  }

  async function handleImageSelected(file: File | null, blockId: string) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file.", "warning");
      return;
    }

    const companyId = await getMyCompanyId();
    if (!companyId) {
      showToast("Could not resolve your company.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = String(reader.result || "");
      setUploadingBlockId(blockId);
      try {
        const uploadRes = await uploadTrainingAsset({
          data: { base64Data, companyId },
        });
        if (!uploadRes.success || !("secure_url" in uploadRes) || !uploadRes.secure_url) {
          showToast(`Image upload failed. ${"error" in uploadRes ? uploadRes.error : ""}`, "error");
          return;
        }
        updateBlock(blockId, { url: uploadRes.secure_url });
        showToast("Image uploaded to the company asset folder.", "success");
      } finally {
        setUploadingBlockId(null);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleAudioSelected(file: File | null, blockId: string) {
    if (!file) return;
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(mp3|wav|m4a|ogg|aac|flac)$/i)) {
      showToast("Please choose an audio file (.mp3, .wav, .m4a, etc.)", "warning");
      return;
    }

    const companyId = await getMyCompanyId();
    if (!companyId) {
      showToast("Could not resolve your company.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = String(reader.result || "");
      setUploadingBlockId(blockId);
      try {
        const uploadRes = await uploadTrainingAsset({
          data: { base64Data, companyId },
        });
        if (!uploadRes.success || !("secure_url" in uploadRes) || !uploadRes.secure_url) {
          showToast(`Audio upload failed. ${"error" in uploadRes ? uploadRes.error : ""}`, "error");
          return;
        }
        updateBlock(blockId, { url: uploadRes.secure_url });
        showToast("Audio uploaded to the company asset folder.", "success");
      } finally {
        setUploadingBlockId(null);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.title.trim()) {
      showToast("Section title is required.", "warning");
      return;
    }

    const companyId = await getMyCompanyId();
    if (!companyId) {
      showToast("Could not resolve your company.", "error");
      return;
    }

    setSaving(true);
    try {
      const result = await saveTrainingSection({
        data: {
          ...(editingId ? { sectionId: editingId } : {}),
          companyId,
          title: draft.title,
          description: draft.description,
          content: draft.blocks.map((b) =>
            b.type === "text"
              ? { type: b.type, content: b.content, ...(b.caption ? { caption: b.caption } : {}) }
              : { type: b.type, url: b.url, ...(b.caption ? { caption: b.caption } : {}) },
          ),
          isMandatory: draft.isMandatory,
          orderIndex: editingId
            ? 0
            : sections.reduce((max, s) => Math.max(max, s.order_index), -1) + 1,
        },
      });
      if (!result.success) {
        showToast(`Failed to save section. ${result.error || ""}`, "error");
        return;
      }
      showToast(editingId ? "Section updated." : "Section published.", "success");
      setEditorOpen(false);
      await loadSections();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteTrainingSection({ data: { sectionId: deleteTarget.id } });
      if (!result.success) {
        showToast(`Failed to delete section. ${result.error || ""}`, "error");
        return;
      }
      showToast("Section deleted.", "success");
      setDeleteTarget(null);
      await loadSections();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="hr-tab-container">
      {/* Header */}
      <div className="hr-tab-header">
        <div className="hr-tab-title-group">
          <h2 className="hr-tab-title">Induction & Training</h2>
          <p className="hr-tab-subtitle">
            Build the onboarding journey — sidebar sections with text, images and embedded links.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="hr-btn hr-btn-primary"
        >
          <Add size={15} />
          <span>Create Section</span>
        </button>
      </div>

      {/* Main card */}
      <div className="hr-table-wrapper">
        {loading ? (
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton-shimmer" style={{ width: "100%", height: 52, borderRadius: 6 }} />
            ))}
          </div>
        ) : sections.length === 0 ? (
          <div className="hr-table-empty">
            <MenuBook size={32} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
            <p style={{ fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 4px" }}>
              No training sections yet.
            </p>
            <p style={{ margin: 0 }}>
              Click "Create Section" to start building the induction journey shown in Resources.
            </p>
          </div>
        ) : (
          <div className="hr-table-scroll">
            <table className="hr-data-table">
              <thead>
                <tr>
                  <th style={{ width: "10%" }}>Order</th>
                  <th style={{ width: "40%" }}>Section</th>
                  <th style={{ width: "10%" }}>Blocks</th>
                  <th style={{ width: "15%" }}>Type</th>
                  <th style={{ width: "15%" }}>Updated</th>
                  <th style={{ width: "10%", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((section, sIdx) => (
                  <tr key={section.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="hr-avatar hr-avatar-sm" style={{ fontWeight: 600 }}>
                          {sIdx + 1}
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <button
                            type="button"
                            disabled={sIdx === 0}
                            onClick={() => handleMoveSection(sIdx, "up")}
                            title="Move section up"
                            className="hr-btn-icon"
                            style={{ width: 18, height: 16 }}
                          >
                            <ArrowUp size={11} />
                          </button>
                          <button
                            type="button"
                            disabled={sIdx === sections.length - 1}
                            onClick={() => handleMoveSection(sIdx, "down")}
                            title="Move section down"
                            className="hr-btn-icon"
                            style={{ width: 18, height: 16 }}
                          >
                            <ArrowDown size={11} />
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: "var(--color-text-primary)", fontSize: 13 }}>
                        {section.title}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                        {section.description || "No description"}
                      </div>
                    </td>
                    <td className="hr-cell-mono">
                      <span className="hr-badge hr-badge-missing" style={{ padding: "2px 8px" }}>
                        {section.content.length} blocks
                      </span>
                    </td>
                    <td>
                      <span className={`hr-badge ${section.is_mandatory ? "hr-badge-present" : "hr-badge-late"}`}>
                        {section.is_mandatory ? "Mandatory" : "Optional"}
                      </span>
                    </td>
                    <td className="hr-cell-mono" style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                      {formatDate(section.updated_at)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => openEdit(section)}
                          title="Edit section"
                          className="hr-btn-icon"
                        >
                          <Edit size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(section)}
                          title="Delete section"
                          className="hr-btn-icon"
                          style={{ color: "#dc2626" }}
                        >
                          <Delete size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent style={{ maxWidth: 640, maxHeight: "85vh", display: "flex", flexDirection: "column", backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 22, overflow: "hidden" }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
              {editingId ? "Edit Section" : "Create Section"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, margin: "14px 0", paddingRight: 4 }}>
            <div className="hr-form-field">
              <label className="hr-form-label">
                Section Title <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                required
                value={draft.title}
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="e.g. Welcome to the Company"
                className="hr-input"
                autoFocus
              />
            </div>

            <div className="hr-form-field">
              <label className="hr-form-label">
                Short Description (shown under the sidebar title)
              </label>
              <textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Brief overview of this induction step."
                className="hr-input"
                style={{ height: "auto", padding: "8px 12px", resize: "vertical" }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, backgroundColor: "var(--color-surface-subtle)", border: "1px solid var(--color-border-subtle)" }}>
              <input
                type="checkbox"
                id="mandatory-checkbox"
                checked={draft.isMandatory}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, isMandatory: e.target.checked }))
                }
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--color-primary)" }}
              />
              <label
                htmlFor="mandatory-checkbox"
                style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", cursor: "pointer", margin: 0 }}
              >
                Mandatory to complete the journey
              </label>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
                  Content Blocks ({draft.blocks.length})
                </h4>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({ ...prev, blocks: [...prev.blocks, emptyBlock("text")] }))
                  }
                  className="hr-btn hr-btn-secondary"
                  style={{ height: 28, fontSize: 12 }}
                >
                  <Add size={14} />
                  <span>Add Block</span>
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {draft.blocks.map((block, idx) => (
                  <div
                    key={block.id}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-surface-subtle)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span className="hr-avatar hr-avatar-sm" style={{ width: 20, height: 20, fontSize: 10 }}>
                          {idx + 1}
                        </span>
                        <select
                          value={block.type}
                          onChange={(e) =>
                            updateBlock(block.id, {
                              type: e.target.value as TrainingBlockType,
                            })
                          }
                          className="hr-select"
                          style={{ height: 28, padding: "0 8px", fontSize: 12 }}
                        >
                          {(["text", "image", "audio", "embed", "team"] as TrainingBlockType[]).map((t) => (
                            <option key={t} value={t}>
                              {TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveBlock(idx, "up")}
                          title="Move block up"
                          className="hr-btn-icon"
                          style={{ width: 24, height: 24 }}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          type="button"
                          disabled={idx === draft.blocks.length - 1}
                          onClick={() => moveBlock(idx, "down")}
                          title="Move block down"
                          className="hr-btn-icon"
                          style={{ width: 24, height: 24 }}
                        >
                          <ArrowDown size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              blocks: prev.blocks.filter((b) => b.id !== block.id),
                            }))
                          }
                          title="Delete block"
                          className="hr-btn-icon"
                          style={{ width: 24, height: 24, color: "#dc2626" }}
                        >
                          <Delete size={12} />
                        </button>
                      </div>
                    </div>

                    {block.type === "text" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <input
                          placeholder="Block Heading / Title (optional)"
                          value={block.caption}
                          onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
                          className="hr-input"
                        />
                        <textarea
                          required
                          rows={4}
                          value={block.content}
                          onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                          placeholder="Write the section content here. Blank lines separate paragraphs."
                          className="hr-input"
                          style={{ height: "auto", padding: "8px 12px", resize: "vertical" }}
                        />
                      </div>
                    )}

                    {block.type === "image" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => {
                            handleImageSelected(e.target.files?.[0] || null, block.id);
                            e.target.value = "";
                          }}
                        />
                        {block.url ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 8, borderRadius: 6, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border-subtle)" }}>
                            <img
                              src={block.url}
                              alt="Uploaded"
                              style={{ width: 48, height: 48, borderRadius: 4, objectFit: "cover" }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#16a34a" }}>
                                ✓ Uploaded to company asset folder
                              </div>
                              <div style={{ fontSize: 10, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {block.url}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => updateBlock(block.id, { url: "" })}
                              className="hr-btn hr-btn-secondary"
                              style={{ height: 26, fontSize: 11 }}
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={uploadingBlockId === block.id}
                            onClick={() => fileInputRef.current?.click()}
                            className="hr-btn hr-btn-secondary"
                          >
                            <UploadFile size={14} />
                            <span>
                              {uploadingBlockId === block.id
                                ? "Uploading..."
                                : "Upload Image to Company Assets"}
                            </span>
                          </button>
                        )}
                        <input
                          placeholder="Caption (optional)"
                          value={block.caption}
                          onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
                          className="hr-input"
                        />
                      </div>
                    )}

                    {block.type === "embed" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <LinkIcon size={14} style={{ color: "var(--color-text-muted)" }} />
                          <input
                            required
                            placeholder="https://youtu.be/... or article URL"
                            value={block.url}
                            onChange={(e) => updateBlock(block.id, { url: e.target.value })}
                            className="hr-input"
                            style={{ flex: 1 }}
                          />
                        </div>
                        <input
                          placeholder="Caption (optional)"
                          value={block.caption}
                          onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
                          className="hr-input"
                        />
                      </div>
                    )}

                    {block.type === "audio" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <input
                          ref={audioFileInputRef}
                          type="file"
                          accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac"
                          hidden
                          onChange={(e) => {
                            handleAudioSelected(e.target.files?.[0] || null, block.id);
                            e.target.value = "";
                          }}
                        />
                        {block.url ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8, borderRadius: 6, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border-subtle)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <Volume2 size={16} style={{ color: "var(--color-primary)" }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#16a34a" }}>
                                  ✓ Audio track uploaded
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => updateBlock(block.id, { url: "" })}
                                className="hr-btn hr-btn-secondary"
                                style={{ height: 24, fontSize: 11 }}
                              >
                                Remove
                              </button>
                            </div>
                            <audio controls src={block.url} style={{ width: "100%", height: 32 }} />
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <button
                              type="button"
                              disabled={uploadingBlockId === block.id}
                              onClick={() => audioFileInputRef.current?.click()}
                              className="hr-btn hr-btn-secondary"
                            >
                              <MusicIcon size={14} />
                              <span>
                                {uploadingBlockId === block.id
                                  ? "Uploading..."
                                  : "Upload Audio File"}
                              </span>
                            </button>
                            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>or paste link below</span>
                          </div>
                        )}

                        {!block.url && (
                          <input
                            placeholder="Direct audio URL (https://.../audio.mp3)"
                            value={block.url}
                            onChange={(e) => updateBlock(block.id, { url: e.target.value })}
                            className="hr-input"
                          />
                        )}

                        <input
                          placeholder="Caption / Track Title (optional)"
                          value={block.caption}
                          onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
                          className="hr-input"
                        />
                      </div>
                    )}

                    {block.type === "team" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 6, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border-subtle)" }}>
                          <UsersIcon size={18} style={{ color: "var(--color-primary)" }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
                              Meet the Family (Automated Team Directory)
                            </div>
                            <p style={{ margin: 0, fontSize: 11, color: "var(--color-text-muted)" }}>
                              Automatically generates interactive employee cards directly from your database.
                            </p>
                          </div>
                        </div>

                        <input
                          placeholder="Section Heading / Subtitle (optional)"
                          value={block.caption}
                          onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
                          className="hr-input"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !!uploadingBlockId}
                className="hr-btn hr-btn-primary"
              >
                {saving ? "Saving..." : editingId ? "Save Changes" : "Publish Section"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent style={{ maxWidth: 440, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 22 }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={18} style={{ color: "#dc2626" }} />
              <span>Delete Section?</span>
            </DialogTitle>
          </DialogHeader>
          <div style={{ margin: "14px 0", fontSize: 13, color: "var(--color-text-secondary)" }}>
            This will permanently remove <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>"{deleteTarget?.title}"</span> from the Induction & Training page in Resources.
          </div>
          <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="hr-btn hr-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDelete}
              className="hr-btn hr-btn-danger"
            >
              {deleting ? "Deleting..." : "Delete Section"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


