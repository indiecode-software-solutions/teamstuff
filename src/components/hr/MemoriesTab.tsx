import React from "react";
import {
  Plus as Add,
  SquarePen as Edit,
  Trash2 as Delete,
  Image as ImageIcon,
  Camera as PhotoCamera,
  Heart as Favorite,
  AlertTriangle,
} from "lucide-react";
import {
  getMyCompanyId,
  getCompanyMemories,
  saveMemory,
  deleteMemory,
  uploadMemoryImage,
  MEMORY_CATEGORIES,
  type CompanyMemory,
  type MemoryCategory,
} from "../../lib/memories";
import { supabase } from "../../lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { Badge } from "../ui/badge";

interface MemoriesTabProps {
  showToast: (msg: string, severity?: "success" | "error" | "info" | "warning") => void;
}

interface MemoryFormState {
  title: string;
  category: MemoryCategory;
  date: string;
  location: string;
  image: string;
  likes: number;
  attendees: string;
}

const EMPTY_FORM: MemoryFormState = {
  title: "",
  category: "Offsite",
  date: new Date().toISOString().slice(0, 10),
  location: "",
  image: "",
  likes: 0,
  attendees: "",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getCategoryBadgeClass(category: MemoryCategory): string {
  switch (category) {
    case "Celebrations":
      return "bg-zinc-900/10 text-zinc-900 dark:text-zinc-100 border-zinc-900/20";
    case "Workshops":
      return "bg-zinc-900/10 text-zinc-700 dark:text-zinc-100 border-zinc-900/20";
    case "Offsite":
      return "bg-zinc-900/10 text-zinc-700 dark:text-zinc-100 border-zinc-900/20";
    case "Hackathons":
      return "bg-zinc-900/10 text-zinc-900 dark:text-zinc-100 border-zinc-300/20";
    default:
      return "bg-zinc-900/10 text-zinc-900 dark:text-zinc-100 border-zinc-300/20";
  }
}

export function MemoriesTab({ showToast }: MemoriesTabProps) {
  const [memories, setMemories] = React.useState<CompanyMemory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<MemoryFormState>(EMPTY_FORM);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);

  const [deleteTarget, setDeleteTarget] = React.useState<CompanyMemory | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function loadMemories() {
    const companyId = await getMyCompanyId();
    if (!companyId) return;
    setMemories(await getCompanyMemories(companyId));
  }

  React.useEffect(() => {
    loadMemories().finally(() => setLoading(false));
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(memory: CompanyMemory) {
    setEditingId(memory.id);
    setForm({
      title: memory.title,
      category: memory.category,
      date: memory.date?.slice(0, 10) || "",
      location: memory.location || "",
      image: memory.image,
      likes: memory.likes,
      attendees: (memory.attendees || []).join(", "),
    });
    setFormOpen(true);
  }

  async function handleImageSelected(file: File | null) {
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
      setUploadingImage(true);
      try {
        const uploadRes = await uploadMemoryImage({
          data: { base64Data, companyId },
        });
        if (!uploadRes.success || !("secure_url" in uploadRes) || !uploadRes.secure_url) {
          showToast(`Image upload failed. ${"error" in uploadRes ? uploadRes.error : ""}`, "error");
          return;
        }
        setForm((prev) => ({ ...prev, image: uploadRes.secure_url }));
        showToast("Image uploaded to the company's memory album.", "success");
      } finally {
        setUploadingImage(false);
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.image.trim() || !form.date) {
      showToast("Title, date and an image are required.", "warning");
      return;
    }

    setSaving(true);
    try {
      const companyId = await getMyCompanyId();
      if (!companyId) {
        showToast("Could not resolve your company.", "error");
        return;
      }
      const { data } = await supabase.auth.getUser();
      const result = await saveMemory({
        data: {
          ...(editingId ? { memoryId: editingId } : {}),
          companyId,
          title: form.title,
          date: form.date,
          location: form.location,
          image: form.image,
          category: form.category,
          likes: form.likes,
          attendees: form.attendees
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
          ...(data.user?.id ? { createdBy: data.user.id } : {}),
        },
      });
      if (!result.success) {
        showToast(`Failed to save memory. ${result.error || ""}`, "error");
        return;
      }
      showToast(editingId ? "Memory updated." : "Memory published.", "success");
      setFormOpen(false);
      await loadMemories();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const result = await deleteMemory({ data: { memoryId: deleteTarget.id } });
      if (!result.success) {
        showToast(`Failed to delete memory. ${result.error || ""}`, "error");
        return;
      }
      showToast("Memory deleted.", "success");
      setDeleteTarget(null);
      await loadMemories();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <TooltipProvider>
      <div className="hr-tab-container">
        {/* Header bar */}
        <div className="hr-tab-header">
          <div className="hr-tab-title-group">
            <h2 className="hr-tab-title">
              Company Memories
            </h2>
            <p className="hr-tab-subtitle">
              Curate the memory album and team milestone moments shown in Resources.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="hr-btn hr-btn-primary"
          >
            <Add size={16} />
            <span>Add Memory</span>
          </button>
        </div>

        {/* Main card */}
        <div className="hr-card">
          {loading ? (
            <div className="p-6 space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : memories.length === 0 ? (
            <div className="hr-empty-state">
              <div className="hr-empty-icon">
                <PhotoCamera size={28} />
              </div>
              <h3 className="hr-empty-title">
                No memories published yet.
              </h3>
              <p className="hr-empty-desc">
                Click "Add Memory" to publish team photos and retreats — they will appear in Resources.
              </p>
            </div>
          ) : (
            <div className="hr-table-scroll">
              <table className="hr-data-table">
                <thead>
                  <tr>
                    <th>Memory</th>
                    <th>Category</th>
                    <th>Date</th>
                    <th>Likes</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {memories.map((memory) => (
                    <tr
                      key={memory.id}
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <img
                            src={memory.image}
                            alt={memory.title}
                            className="hr-memory-thumb"
                          />
                          <div>
                            <div className="font-medium text-text-primary">
                              {memory.title}
                            </div>
                            <div className="text-xs text-text-muted mt-0.5">
                              {memory.location || "Location not set"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="hr-badge">
                          {memory.category}
                        </span>
                      </td>
                      <td className="text-xs text-text-secondary whitespace-nowrap">
                        {memory.date ? formatDate(memory.date) : "—"}
                      </td>
                      <td>
                        <div className="inline-flex items-center gap-1.5 text-xs text-text-secondary font-medium">
                          <Favorite size={14} className="text-red-500 fill-red-500" />
                          <span>{memory.likes}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => openEdit(memory)}
                                className="hr-btn-icon"
                              >
                                <Edit size={15} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Edit Memory
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(memory)}
                                className="hr-btn-icon text-red-500 hover:text-red-600"
                              >
                                <Delete size={15} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              Delete Memory
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create / Edit Dialog */}
        <Dialog open={formOpen} onOpenChange={(open) => !saving && setFormOpen(open)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Edit Memory" : "Add Memory"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="hr-form-field">
                <label className="hr-form-label">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Annual Strategy Retreat 2026"
                  className="hr-input"
                />
              </div>

              <div className="hr-form-grid hr-form-grid-2">
                <div className="hr-form-field">
                  <label className="hr-form-label">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, category: e.target.value as MemoryCategory }))
                    }
                    className="hr-select"
                  >
                    {MEMORY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="hr-form-field">
                  <label className="hr-form-label">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={form.date}
                    onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                    className="hr-input"
                  />
                </div>
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">Location</label>
                <input
                  placeholder="e.g. Rishikesh, India"
                  value={form.location}
                  onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                  className="hr-input"
                />
              </div>

              {/* Photo Upload Section */}
              <div className="hr-form-field">
                <label className="hr-form-label">
                  Memory Photo <span className="text-red-500">*</span>
                </label>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    handleImageSelected(e.target.files?.[0] || null);
                    e.target.value = "";
                  }}
                />
                {form.image ? (
                  <div className="hr-memory-preview-container">
                    <img
                      src={form.image}
                      alt="Memory preview"
                      className="hr-memory-preview-img"
                    />
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="hr-change-photo-btn"
                      title="Change Photo"
                    >
                      <PhotoCamera size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="hr-photo-upload-box"
                  >
                    <ImageIcon size={26} />
                    <span className="text-xs font-medium">
                      {uploadingImage ? "Uploading to album…" : "Upload Photo"}
                    </span>
                  </button>
                )}
                <p className="text-[11px] text-text-muted mt-1">
                  Image is stored securely in your company's memory album.
                </p>
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">Attendees</label>
                <input
                  placeholder="e.g. Aman Sharma, Priya Verma, Rohan Das"
                  value={form.attendees}
                  onChange={(e) => setForm((p) => ({ ...p, attendees: e.target.value }))}
                  className="hr-input"
                />
                <p className="text-[11px] text-text-muted mt-1">
                  Comma-separated names of people in the photo.
                </p>
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">Likes</label>
                <input
                  type="number"
                  min={0}
                  value={form.likes}
                  onChange={(e) => setForm((p) => ({ ...p, likes: Number(e.target.value) || 0 }))}
                  className="hr-input"
                />
              </div>

              <DialogFooter className="pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setFormOpen(false)}
                  className="hr-btn hr-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="hr-btn hr-btn-primary"
                >
                  {saving ? "Saving…" : editingId ? "Save Changes" : "Publish"}
                </button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-500">
                <AlertTriangle size={18} />
                <span>Delete this memory?</span>
              </DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <div className="text-sm text-text-secondary">
                <span className="font-semibold text-text-primary">"{deleteTarget?.title}"</span> will be removed from Resources permanently.
              </div>
            </div>
            <DialogFooter className="pt-2">
              <button
                type="button"
                disabled={deleting}
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
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

