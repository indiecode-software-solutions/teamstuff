import React, { useState, useEffect, useRef, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabase";
import {
  getAuthenticatedUserContext,
  getUserStorageLedger,
  getFolders,
  getAllFolders,
  getFiles,
  createFolder,
  ensureCompanyLibraryFolder,
  getLooseCompanyFiles,
  uploadFileToCloud,
  getPresignedDownloadUrl,
  deleteFile,
  deleteFolder,
  shareFile,
  CloudFolder,
  CloudFile,
  StorageLedger,
  CurrentUserContext,
  VIRTUAL_FOLDER_PREFIX,
} from "../lib/cloud-drive";
import { SafeLockGuard } from "../components/SafeLockGuard";
import { SafeLockConfig, getSafeLockConfig } from "../lib/safelock";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { sanitizeProfilePhoto } from "../lib/profile-photo";
import {
  Folder,
  FileText,
  Table,
  Presentation,
  Image as ImageIcon,
  Upload,
  Plus,
  FolderPlus,
  Search,
  MoreVertical,
  Share2,
  Cloud,
  Trash2,
  Download,
  FileArchive,
  ChevronRight,
  FolderOpen,
  Building2,
  X,
  Loader2,
  LayoutGrid,
  List,
  Info,
  Clock,
  Star,
  HardDrive,
  Eye,
  FileUp,
  Check,
} from "lucide-react";

export const Route = createFileRoute("/files")({
  head: () => ({
    title: "Teamstuff | Cloud Drive",
    meta: [
      {
        name: "description",
        content: "Modern enterprise cloud drive with multi-tenant file management.",
      },
    ],
  }),
  component: FilesPage,
});

type NavTab = "mydrive" | "shared" | "company" | "recent" | "starred" | "trash";
type FilterType = "all" | "docs" | "sheets" | "slides" | "images" | "pdfs" | "archives";

function FilesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const navRequestRef = useRef(0);
  const [userContext, setUserContext] = useState<CurrentUserContext | null>(null);
  const [storageLedger, setStorageLedger] = useState<StorageLedger>({
    companyId: "",
    allocatedBytes: 5368709120, // 5 GB
    usedBytes: 0,
    updatedAt: new Date().toISOString(),
  });

  const [activeTab, setActiveTab] = useState<NavTab>("mydrive");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<CloudFolder[]>([]);
  const [allFolders, setAllFolders] = useState<CloudFolder[]>([]);
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedFileForDetails, setSelectedFileForDetails] = useState<CloudFile | null>(null);

  // Drag & drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Dialog states
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openFolderModal, setOpenFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [openUploadModal, setOpenUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFileName, setUploadingFileName] = useState("");
  const [uploadState, setUploadState] = useState<"form" | "progress">("form");
  const [selectedUploadFolderId, setSelectedUploadFolderId] = useState<string | null>(null);
  const [selectedFileToUpload, setSelectedFileToUpload] = useState<File | null>(null);
  const [customFileName, setCustomFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [openShareModal, setOpenShareModal] = useState(false);
  const [selectedFileForShare, setSelectedFileForShare] = useState<CloudFile | null>(null);
  const [shareTargetType, setShareTargetType] = useState<"user" | "company">("user");
  const [selectedColleague, setSelectedColleague] = useState("");
  const [colleagueSearch, setColleagueSearch] = useState("");
  const [colleagues, setColleagues] = useState<{ id: string; name: string; role: string; photoUrl?: string | null }[]>([]);
  const [safelockConfig, setSafelockConfig] = useState<SafeLockConfig | null>(null);
  const [safelockLoading, setSafelockLoading] = useState(true);

  // Image URL cache for inline preview thumbnails & inspector drawer
  const [imageUrlCache, setImageUrlCache] = useState<Record<string, string>>({});

  // Delete modal state
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedItemForMenu, setSelectedItemForMenu] = useState<{
    id: string;
    name?: string;
    isFolder: boolean;
    sizeBytes?: number;
  } | null>(null);

  const isImageFile = (file: { mimeType: string; name: string }) => {
    return (
      file.mimeType.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name)
    );
  };

  const getImageUrl = async (fileId: string): Promise<string | null> => {
    if (imageUrlCache[fileId]) return imageUrlCache[fileId];
    if (!userContext) return null;
    const { url } = await getPresignedDownloadUrl(userContext, fileId, false);
    if (url) {
      setImageUrlCache((prev) => ({ ...prev, [fileId]: url }));
      return url;
    }
    return null;
  };

  const handlePreviewFile = async (file: CloudFile) => {
    setSelectedFileForDetails(file);
    setInspectorOpen(true);
    if (isImageFile(file) && !imageUrlCache[file.id]) {
      await getImageUrl(file.id);
    }
  };

  // Initialize
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      const ctx = await getAuthenticatedUserContext();
      setUserContext(ctx);

      if (ctx) {
        try {
          const cfg = await getSafeLockConfig(ctx.userId);
          setSafelockConfig(cfg);
        } catch (e) {
          console.error("Error loading safelock config:", e);
        } finally {
          setSafelockLoading(false);
        }
        const ledger = await getUserStorageLedger(ctx.companyId, ctx.userId);
        setStorageLedger(ledger);
        await loadDirectoryContent(ctx, currentFolderId, activeTab);

        const { data: colleagueRows } = await supabase
          .from("profiles")
          .select("id, name, job_title, profile_photo")
          .eq("company_id", ctx.companyId)
          .neq("id", ctx.userId)
          .order("name");
        setColleagues(
          (colleagueRows || []).map((c: any) => ({
            id: c.id,
            name: c.name || "Unknown",
            role: c.job_title || "Team Member",
            photoUrl: sanitizeProfilePhoto(c.profile_photo),
          })),
        );
      } else {
        setSafelockLoading(false);
      }
      setIsLoading(false);
    }
    init();
  }, []);

  // Directory reload
  useEffect(() => {
    if (userContext) {
      loadDirectoryContent(userContext, currentFolderId, activeTab);
    }
  }, [currentFolderId, activeTab]);

  const loadDirectoryContent = async (
    ctx: CurrentUserContext,
    folderId: string | null,
    tab: NavTab,
  ) => {
    const reqId = ++navRequestRef.current;
    setIsNavigating(true);
    try {
      const isDriveTab = tab === "mydrive" || tab === "company";
      const [foldersRes, fetchedFiles, allFetchedFolders] = await Promise.all([
        isDriveTab
          ? getFolders(ctx.companyId, folderId, tab === "mydrive" ? ctx.userId : undefined)
          : Promise.resolve([] as CloudFolder[]),
        getFiles(ctx, folderId, tab === "company" ? "company" : tab === "shared" ? "shared" : "mydrive"),
        getAllFolders(ctx.companyId),
      ]);
      let fetchedFolders = foldersRes;

      if (tab === "mydrive") {
        fetchedFolders = fetchedFolders.filter(
          (f) => f.name.toLowerCase() !== "company_library" && f.name.toLowerCase() !== "company library",
        );

        if (folderId === null) {
          const taskFolder = fetchedFolders.find(
            (f) =>
              f.name.toLowerCase() === "task attachments" ||
              f.name.toLowerCase() === "task_attachments",
          );
          if (taskFolder) {
            const { count } = await supabase
              .from("files")
              .select("id", { count: "exact", head: true })
              .eq("folder_id", taskFolder.id)
              .eq("company_id", ctx.companyId)
              .is("deleted_at", null);

            if (!count || count === 0) {
              fetchedFolders = fetchedFolders.filter((f) => f.id !== taskFolder.id);
            }
          }
        }
      }

      if (tab === "company") {
        const libraryId = await ensureCompanyLibraryFolder(ctx);
        if (libraryId) {
          if (folderId === null) {
            if (navRequestRef.current === reqId) {
              setCurrentFolderId(libraryId);
            }
            return;
          }

          if (folderId === libraryId) {
            const looseGroups = await getLooseCompanyFiles(ctx.companyId, libraryId);
            const virtualFolders: CloudFolder[] = looseGroups.map((g) => ({
              id: `${VIRTUAL_FOLDER_PREFIX}${g.ownerId}`,
              companyId: ctx.companyId,
              parentFolderId: libraryId,
              name: `${g.ownerName}'s Files`,
              ownerUserId: g.ownerId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              isVirtual: true,
            }));
            fetchedFolders = [...fetchedFolders, ...virtualFolders];
          }
        }
      }

      setAllFolders(allFetchedFolders);
      setFolders(fetchedFolders);
      setFiles(fetchedFiles);
    } finally {
      if (navRequestRef.current === reqId) {
        setIsNavigating(false);
      }
    }
  };

  const refreshStorageLedger = async () => {
    if (userContext) {
      const ledger = await getUserStorageLedger(userContext.companyId, userContext.userId);
      setStorageLedger(ledger);
    }
  };

  // Filters & Search
  const filteredFolders = useMemo(() => {
    return folders.filter((f) =>
      f.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [folders, searchTerm]);

  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      if (activeFilter === "all") return true;
      if (activeFilter === "docs") return /\.(docx?|txt|md|rtf)$/i.test(f.name) || f.mimeType.includes("word") || f.mimeType.includes("text");
      if (activeFilter === "sheets") return /\.(xlsx?|csv|numbers)$/i.test(f.name) || f.mimeType.includes("sheet") || f.mimeType.includes("csv");
      if (activeFilter === "slides") return /\.(pptx?|key)$/i.test(f.name) || f.mimeType.includes("presentation");
      if (activeFilter === "images") return isImageFile(f);
      if (activeFilter === "pdfs") return f.name.endsWith(".pdf") || f.mimeType.includes("pdf");
      if (activeFilter === "archives") return /\.(zip|rar|tar|gz|7z)$/i.test(f.name) || f.mimeType.includes("zip");
      return true;
    });
  }, [files, searchTerm, activeFilter]);

  // Suggested / Quick Access Files (recent files for single horizontal scroll row)
  const suggestedFiles = useMemo(() => {
    return files.slice(0, 8);
  }, [files]);

  const isVirtualFolder = currentFolderId?.startsWith(VIRTUAL_FOLDER_PREFIX);

  const formatStorageSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB";
    return bytes + " B";
  };

  const usedPercentage = Math.min(
    (storageLedger.usedBytes / storageLedger.allocatedBytes) * 100,
    100,
  );
  const limitGB = (storageLedger.allocatedBytes / (1024 * 1024 * 1024)).toFixed(1);
  const usedDisplay = formatStorageSize(storageLedger.usedBytes);

  const handleCreateFolderSubmit = async () => {
    if (!newFolderName.trim() || !userContext) return;
    let targetFolderId = currentFolderId;
    if (activeTab === "company") {
      const libraryId = await ensureCompanyLibraryFolder(userContext);
      targetFolderId = targetFolderId ?? libraryId ?? null;
      if (!targetFolderId) return;
    }
    const created = await createFolder(userContext, newFolderName, targetFolderId);
    if (created) {
      setNewFolderName("");
      setOpenFolderModal(false);
      toast.success(`Folder "${created.name}" created!`);
      if (activeTab === "company") {
        loadDirectoryContent(userContext, currentFolderId, "company");
      } else {
        setFolders((prev) => [...prev, created]);
      }
    }
  };

  const handleTriggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFileToUpload(file);
      setCustomFileName(file.name);
      setSelectedUploadFolderId(currentFolderId);
      setUploadState("form");
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setOpenUploadModal(true);
    }
  };

  const handleStartUploadSubmit = async () => {
    if (!selectedFileToUpload || !userContext) return;
    setErrorMessage(null);
    setUploadState("progress");
    setUploadProgress(20);
    setUploadingFileName(customFileName || selectedFileToUpload.name);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => (prev < 80 ? prev + 15 : prev));
    }, 150);

    let uploadFolderId = selectedUploadFolderId;
    if (activeTab === "company") {
      const libraryId = await ensureCompanyLibraryFolder(userContext);
      uploadFolderId = uploadFolderId ?? libraryId ?? null;
      if (!uploadFolderId) return;
    }

    const result = await uploadFileToCloud(
      userContext,
      selectedFileToUpload,
      uploadFolderId,
      customFileName,
    );

    clearInterval(progressInterval);
    setUploadProgress(100);

    if (result.success && result.fileItem) {
      setTimeout(() => {
        setFiles((prev) => [result.fileItem!, ...prev]);
        setOpenUploadModal(false);
        setSelectedFileToUpload(null);
        refreshStorageLedger();
        toast.success("File uploaded successfully!");
      }, 300);
    } else {
      setErrorMessage(result.message || "File upload failed.");
      toast.error(result.message || "File upload failed.");
      setOpenUploadModal(false);
    }
  };

  const handleDownloadFile = async (fileId: string) => {
    if (!userContext) return;
    const targetFile =
      files.find((f) => f.id === fileId) ||
      (selectedFileForDetails?.id === fileId ? selectedFileForDetails : null);
    const fileName = targetFile?.name || "download";
    const toastId = toast.loading(`Downloading ${fileName}...`);
    try {
      const { url, message } = await getPresignedDownloadUrl(userContext, fileId, true);
      if (url) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
            toast.success(`Downloading ${fileName}`, { id: toastId });
            return;
          }
        } catch {
          // Fallback to direct anchor download trigger
        }
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success(`Downloading ${fileName}`, { id: toastId });
      } else {
        setErrorMessage(message || "Download failed.");
        toast.error(message || "Download failed.", { id: toastId });
      }
    } catch (err: any) {
      toast.error(err?.message || "Download failed.", { id: toastId });
    }
  };

  const handleDeleteItemSubmit = async () => {
    if (!selectedItemForMenu || !userContext) return;
    const { id, isFolder, sizeBytes = 0 } = selectedItemForMenu;

    setIsDeleting(true);
    try {
      if (!isFolder) {
        const success = await deleteFile(userContext, id, sizeBytes);
        if (success) {
          setFiles((prev) => prev.filter((f) => f.id !== id));
          if (selectedFileForDetails?.id === id) {
            setSelectedFileForDetails(null);
          }
          refreshStorageLedger();
          toast.success("File deleted.");
        }
      } else {
        const success = await deleteFolder(userContext, id);
        if (success) {
          setFolders((prev) => prev.filter((f) => f.id !== id));
          loadDirectoryContent(userContext, currentFolderId, activeTab);
          refreshStorageLedger();
          toast.success("Folder deleted.");
        }
      }
      setOpenDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenShareModal = (file: CloudFile) => {
    setSelectedFileForShare(file);
    setShareTargetType("user");
    setSelectedColleague("");
    setColleagueSearch("");
    setOpenShareModal(true);
  };

  const handleShareFileSubmit = async () => {
    if (!selectedFileForShare || !userContext) return;
    if (shareTargetType === "user" && !selectedColleague) return;
    const success = await shareFile(
      userContext,
      selectedFileForShare.id,
      shareTargetType,
      selectedColleague || undefined,
    );
    if (success) {
      setOpenShareModal(false);
      setSelectedColleague("");
      toast.success("File shared successfully!");
      loadDirectoryContent(userContext, currentFolderId, activeTab);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentFolderId && !isDraggingOver) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (!currentFolderId) {
      toast.error("Files must be uploaded inside a folder. Please open a folder first.");
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFileToUpload(file);
      setCustomFileName(file.name);
      setSelectedUploadFolderId(currentFolderId);
      setUploadState("form");
      setOpenUploadModal(true);
    }
  };

  const getBreadcrumbs = () => {
    if (!currentFolderId) return [];

    if (currentFolderId.startsWith(VIRTUAL_FOLDER_PREFIX)) {
      const crumbs: { id: string; name: string }[] = [];
      const pathPart = currentFolderId.slice(VIRTUAL_FOLDER_PREFIX.length);
      const parts = pathPart.split("/");
      const ownerUserId = parts[0];

      let ownerName = "";
      if (userContext && ownerUserId === userContext.userId) {
        ownerName = userContext.name;
      } else {
        ownerName = colleagues.find((c) => c.id === ownerUserId)?.name || "User";
      }

      crumbs.push({
        id: `${VIRTUAL_FOLDER_PREFIX}${ownerUserId}`,
        name: `${ownerName}'s Files`,
      });

      let currentVirtualId = `${VIRTUAL_FOLDER_PREFIX}${ownerUserId}`;
      for (let i = 1; i < parts.length; i++) {
        const folderId = parts[i];
        const realFolder = allFolders.find((f) => f.id === folderId);
        currentVirtualId += `/${folderId}`;
        crumbs.push({
          id: currentVirtualId,
          name: realFolder?.name || folderId || "",
        });
      }
      return crumbs;
    }

    const crumbs: CloudFolder[] = [];
    let current = allFolders.find((f) => f.id === currentFolderId);
    while (current) {
      if (
        activeTab === "company" &&
        current.parentFolderId === null &&
        (current.name.toLowerCase() === "company_library" || current.name.toLowerCase() === "company library")
      ) {
        break;
      }
      crumbs.unshift(current);
      const parentId = current.parentFolderId;
      current = parentId ? allFolders.find((f) => f.id === parentId) : undefined;
    }
    return crumbs;
  };

  const getFileIconComponent = (mimeType: string, name: string, size = 20) => {
    if (mimeType.includes("pdf") || name.endsWith(".pdf")) {
      return <FileText size={size} color="#EA4335" />;
    }
    if (mimeType.includes("sheet") || /\.(xlsx?|csv)$/i.test(name)) {
      return <Table size={size} color="#0F9D58" />;
    }
    if (mimeType.includes("presentation") || /\.(pptx?|key)$/i.test(name)) {
      return <Presentation size={size} color="#F4B400" />;
    }
    if (isImageFile({ mimeType, name })) {
      return <ImageIcon size={size} color="#FA7B17" />;
    }
    if (mimeType.includes("zip") || /\.(zip|rar|7z)$/i.test(name)) {
      return <FileArchive size={size} color="#7B1FA2" />;
    }
    return <FileText size={size} color="#4285F4" />;
  };

  const getFileColorBadge = (mimeType: string, name: string) => {
    if (mimeType.includes("pdf") || name.endsWith(".pdf")) return "#EA4335";
    if (mimeType.includes("sheet") || /\.(xlsx?|csv)$/i.test(name)) return "#0F9D58";
    if (mimeType.includes("presentation") || /\.(pptx?|key)$/i.test(name)) return "#F4B400";
    if (isImageFile({ mimeType, name })) return "#FA7B17";
    if (mimeType.includes("zip") || /\.(zip|rar|7z)$/i.test(name)) return "#7B1FA2";
    return "#4285F4";
  };

  const renderUserAvatar = (name?: string, photoUrl?: string | null) => {
    if (photoUrl) {
      return (
        <div className="gdrive-avatar">
          <img src={photoUrl} alt={name || "User"} />
        </div>
      );
    }
    const initial = (name && name.trim().length > 0 ? name.trim().charAt(0) : "U").toUpperCase();
    return <div className="gdrive-avatar">{initial}</div>;
  };

  const getDisplayOwnerName = (file: CloudFile, ctx: CurrentUserContext | null, format: "table" | "card" = "card") => {
    const isSelf = Boolean(ctx && file.ownerUserId === ctx.userId);
    if (isSelf) {
      return format === "table" ? "me" : ctx?.name || "me";
    }
    return file.ownerName || "User";
  };

  const getDisplayOwnerPhoto = (file: CloudFile, ctx: CurrentUserContext | null) => {
    if (file.ownerPhotoUrl) return file.ownerPhotoUrl;
    if (ctx && file.ownerUserId === ctx.userId) return ctx.photoUrl || null;
    return null;
  };

  const tabLabelMap: Record<NavTab, string> = {
    mydrive: "My Drive",
    shared: "Shared with Me",
    company: "Company Vault",
    recent: "Recent",
    starred: "Starred",
    trash: "Trash",
  };

  return (
    <TooltipProvider>
      <Layout
        activeTab="Files"
        disablePadding
        breadcrumbs={[
          { label: "Work" },
          { label: "Files", href: "/files" },
          { label: tabLabelMap[activeTab] || "My Drive" },
        ]}
      >
        <SafeLockGuard
          tabName="Files"
          userId={userContext?.userId || ""}
          config={safelockConfig}
          loadingConfig={safelockLoading}
          onConfigUpdated={(newCfg) => setSafelockConfig(newCfg)}
        >
          <div
            className="gdrive-container"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Hidden native file selector */}
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            {/* Drag & Drop Visual Dropzone Overlay */}
            {isDraggingOver && (
              <div className="gdrive-dropzone-overlay">
                <div className="gdrive-dropzone-box">
                  <FileUp size={36} />
                  <span>Drop files here to upload to Drive</span>
                </div>
              </div>
            )}

            {/* LEFT GOOGLE DRIVE SIDEBAR */}
            <aside className="gdrive-sidebar">
              <div>
                {/* "+ New" Floating Button */}
                <div className="gdrive-new-btn-wrapper">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="gdrive-new-btn">
                        <Plus size={20} color="#EA4335" strokeWidth={2.5} />
                        <span>New</span>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={6}
                      className="gdrive-new-dropdown-content"
                    >
                      <DropdownMenuItem
                        onClick={() => setOpenFolderModal(true)}
                        className="gdrive-new-dropdown-item"
                      >
                        <FolderPlus size={16} />
                        <span>New folder</span>
                      </DropdownMenuItem>
                      {currentFolderId && (
                        <>
                          <DropdownMenuSeparator className="gdrive-dropdown-separator" />
                          <DropdownMenuItem
                            onClick={handleTriggerFileSelect}
                            className="gdrive-new-dropdown-item"
                          >
                            <FileUp size={16} />
                            <span>File upload</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Navigation Links */}
                <nav className="gdrive-nav-list">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("mydrive");
                      setCurrentFolderId(null);
                    }}
                    className={`gdrive-nav-item ${activeTab === "mydrive" ? "active" : ""}`}
                  >
                    <HardDrive className="nav-icon" color={activeTab === "mydrive" ? "#2563eb" : "#64748b"} />
                    <span>My Drive</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("shared");
                      setCurrentFolderId(null);
                    }}
                    className={`gdrive-nav-item ${activeTab === "shared" ? "active" : ""}`}
                  >
                    <FolderOpen className="nav-icon" color={activeTab === "shared" ? "#2563eb" : "#64748b"} />
                    <span>Shared with me</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("company");
                      setCurrentFolderId(null);
                    }}
                    className={`gdrive-nav-item ${activeTab === "company" ? "active" : ""}`}
                  >
                    <Building2 className="nav-icon" color={activeTab === "company" ? "#2563eb" : "#64748b"} />
                    <span>Company Library</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("recent");
                      setCurrentFolderId(null);
                    }}
                    className={`gdrive-nav-item ${activeTab === "recent" ? "active" : ""}`}
                  >
                    <Clock className="nav-icon" color={activeTab === "recent" ? "#2563eb" : "#64748b"} />
                    <span>Recent</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("starred");
                      setCurrentFolderId(null);
                    }}
                    className={`gdrive-nav-item ${activeTab === "starred" ? "active" : ""}`}
                  >
                    <Star className="nav-icon" color={activeTab === "starred" ? "#eab308" : "#64748b"} />
                    <span>Starred</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("trash");
                      setCurrentFolderId(null);
                    }}
                    className={`gdrive-nav-item ${activeTab === "trash" ? "active" : ""}`}
                  >
                    <Trash2 className="nav-icon" color={activeTab === "trash" ? "#ef4444" : "#64748b"} />
                    <span>Trash</span>
                  </button>
                </nav>
              </div>

              {/* Storage Usage Widget */}
              <div className="gdrive-sidebar-storage">
                <div className="gdrive-storage-header">
                  <Cloud size={16} color="#2563eb" />
                  <span>Storage</span>
                </div>
                <div className="gdrive-storage-bar-bg">
                  <div
                    className="gdrive-storage-bar-fill"
                    style={{ width: `${usedPercentage}%` }}
                  />
                </div>
                <div className="gdrive-storage-sub">
                  {usedDisplay} of {limitGB} GB used
                </div>
              </div>
            </aside>

            {/* MAIN GOOGLE DRIVE EXPLORER */}
            <main className="gdrive-main">
              {/* Top Search & Actions Toolbar */}
              <header className="gdrive-topbar">
                {/* Search Bar */}
                <div className="gdrive-search-box">
                  <Search size={18} className="gdrive-search-icon" />
                  <input
                    type="text"
                    placeholder="Search in Drive"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="gdrive-search-input"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="gdrive-search-clear"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                {/* Right Actions: View Mode & Info */}
                <div className="gdrive-topbar-actions">
                  <div className="gdrive-view-toggle">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setViewMode("list")}
                          className={`gdrive-view-btn ${viewMode === "list" ? "active" : ""}`}
                        >
                          <List size={16} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>List view</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setViewMode("grid")}
                          className={`gdrive-view-btn ${viewMode === "grid" ? "active" : ""}`}
                        >
                          <LayoutGrid size={16} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Grid view</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </header>

              {/* Drive Content */}
              <div className="gdrive-content">
                {/* Breadcrumbs Navigation */}
                <div className="gdrive-breadcrumbs">
                  {(() => {
                    const crumbs = getBreadcrumbs();
                    const rootLabel =
                      activeTab === "mydrive"
                        ? "My Drive"
                        : activeTab === "shared"
                        ? "Shared with me"
                        : activeTab === "company"
                        ? "Company Library"
                        : activeTab === "recent"
                        ? "Recent"
                        : activeTab === "starred"
                        ? "Starred"
                        : "Trash";

                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button
                          type="button"
                          onClick={() => {
                            if (activeTab === "company") {
                              const libRoot = allFolders.find(
                                (f) =>
                                  f.parentFolderId === null &&
                                  (f.name.toLowerCase() === "company_library" ||
                                    f.name.toLowerCase() === "company library"),
                              );
                              setCurrentFolderId(libRoot ? libRoot.id : null);
                            } else {
                              setCurrentFolderId(null);
                            }
                          }}
                          className={`gdrive-breadcrumb-crumb ${crumbs.length > 0 ? "muted" : ""}`}
                        >
                          <span>{rootLabel}</span>
                        </button>

                        {crumbs.map((crumb, idx) => {
                          const isLast = idx === crumbs.length - 1;
                          return (
                            <React.Fragment key={crumb.id}>
                              <ChevronRight size={16} color="#94a3b8" />
                              <button
                                type="button"
                                onClick={() => setCurrentFolderId(crumb.id)}
                                className={`gdrive-breadcrumb-crumb ${!isLast ? "muted" : ""}`}
                              >
                                <span>{crumb.name}</span>
                              </button>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Filter Chips */}
                <div className="gdrive-filter-chips">
                  {[
                    { key: "all", label: "All" },
                    { key: "docs", label: "Documents", icon: <FileText size={14} color="#4285F4" /> },
                    { key: "sheets", label: "Spreadsheets", icon: <Table size={14} color="#0F9D58" /> },
                    { key: "slides", label: "Presentations", icon: <Presentation size={14} color="#F4B400" /> },
                    { key: "images", label: "Images", icon: <ImageIcon size={14} color="#FA7B17" /> },
                    { key: "pdfs", label: "PDFs", icon: <FileText size={14} color="#EA4335" /> },
                    { key: "archives", label: "Archives", icon: <FileArchive size={14} color="#7B1FA2" /> },
                  ].map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => setActiveFilter(chip.key as FilterType)}
                      className={`gdrive-chip ${activeFilter === chip.key ? "active" : ""}`}
                    >
                      {chip.icon}
                      <span>{chip.label}</span>
                    </button>
                  ))}
                </div>

                {/* Shimmer Loading State */}
                {isLoading || isNavigating ? (
                  <div className="gdrive-skeleton-container">
                    {/* Suggested Skeletons */}
                    {currentFolderId === null && (
                      <div>
                        <div className="gdrive-skeleton-block" style={{ width: 100, height: 16, marginBottom: 12 }} />
                        <div className="gdrive-skeleton-suggested-row">
                          {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="gdrive-skeleton-suggested-card">
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                                <div className="gdrive-skeleton-block" style={{ width: 18, height: 18, borderRadius: 4 }} />
                                <div className="gdrive-skeleton-block" style={{ width: "65%", height: 14 }} />
                              </div>
                              <div className="gdrive-skeleton-block" style={{ width: 22, height: 22, borderRadius: 4 }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Folders Skeletons */}
                    <div>
                      <div className="gdrive-skeleton-block" style={{ width: 80, height: 16, marginBottom: 12 }} />
                      <div className="gdrive-skeleton-folders-grid">
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="gdrive-skeleton-folder-card">
                            <div className="gdrive-skeleton-block" style={{ width: 20, height: 20, borderRadius: 4 }} />
                            <div className="gdrive-skeleton-block" style={{ width: "65%", height: 14 }} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Files Skeletons */}
                    <div>
                      <div className="gdrive-skeleton-block" style={{ width: 60, height: 16, marginBottom: 12 }} />
                      {viewMode === "grid" ? (
                        <div className="gdrive-skeleton-files-grid">
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                            <div key={i} className="gdrive-skeleton-file-card">
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div className="gdrive-skeleton-block" style={{ width: "70%", height: 14 }} />
                                <div className="gdrive-skeleton-block" style={{ width: 16, height: 16 }} />
                              </div>
                              <div className="gdrive-skeleton-block" style={{ width: "100%", flex: 1, borderRadius: 4 }} />
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div className="gdrive-skeleton-block" style={{ width: "40%", height: 12 }} />
                                <div className="gdrive-skeleton-block" style={{ width: "20%", height: 12 }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="gdrive-skeleton-table">
                          {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="gdrive-skeleton-table-row">
                              <div style={{ display: "flex", alignItems: "center", gap: 12, width: "35%" }}>
                                <div className="gdrive-skeleton-block" style={{ width: 18, height: 18 }} />
                                <div className="gdrive-skeleton-block" style={{ width: "70%", height: 14 }} />
                              </div>
                              <div className="gdrive-skeleton-block" style={{ width: "15%", height: 14 }} />
                              <div className="gdrive-skeleton-block" style={{ width: "15%", height: 14 }} />
                              <div className="gdrive-skeleton-block" style={{ width: "10%", height: 14 }} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* SECTION 1: Suggested / Quick Access (When at root of My Drive or Recent) */}
                    {suggestedFiles.length > 0 && currentFolderId === null && activeFilter === "all" && (
                      <section>
                        <div className="gdrive-section-title">
                          <span>Suggested</span>
                        </div>
                        <div className="gdrive-suggested-grid">
                          {suggestedFiles.map((file) => (
                            <div
                              key={file.id}
                              onClick={() => handlePreviewFile(file)}
                              className="gdrive-suggested-card"
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                                {getFileIconComponent(file.mimeType, file.name, 18)}
                                <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                                  <span className="gdrive-suggested-title">{file.name}</span>
                                  <span style={{ fontSize: 11, color: "#64748b" }}>
                                    {formatStorageSize(file.sizeBytes)}
                                  </span>
                                </div>
                              </div>
                              {renderUserAvatar(
                                getDisplayOwnerName(file, userContext),
                                getDisplayOwnerPhoto(file, userContext),
                              )}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* SECTION 2: Folders */}
                    {filteredFolders.length > 0 && (
                      <section>
                        <div className="gdrive-section-title">
                          <span>Folders</span>
                          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>
                            {filteredFolders.length} items
                          </span>
                        </div>
                        <div className="gdrive-folders-grid">
                          {filteredFolders.map((folder) => (
                            <div
                              key={folder.id}
                              onClick={() => setCurrentFolderId(folder.id)}
                              className="gdrive-folder-card"
                            >
                              <div className="gdrive-folder-info">
                                <Folder size={20} color="#5f6368" />
                                <span className="gdrive-folder-name">{folder.name}</span>
                              </div>

                              {!folder.isVirtual &&
                                folder.name.toLowerCase() !== "my drive" &&
                                folder.name.toLowerCase() !== "task attachments" &&
                                folder.name.toLowerCase() !== "task_attachments" && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={(e) => e.stopPropagation()}
                                        className="btn-icon-subtle"
                                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b" }}
                                      >
                                        <MoreVertical size={16} />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="gdrive-action-dropdown-content">
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedItemForMenu({ id: folder.id, name: folder.name, isFolder: true });
                                          setOpenDeleteConfirm(true);
                                        }}
                                        className="gdrive-action-dropdown-item gdrive-action-dropdown-item-danger"
                                      >
                                        <Trash2 size={16} />
                                        <span>Delete</span>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                )}
                            </div>
                          ))}
                        </div>
                      </section>
                    )}

                    {/* SECTION 3: Files */}
                    <section>
                      <div className="gdrive-section-title">
                        <span>Files</span>
                        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 400 }}>
                          {filteredFiles.length} items
                        </span>
                      </div>

                      {filteredFiles.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "48px 0", color: "#64748b" }}>
                          <Cloud size={40} strokeWidth={1.5} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                          <p style={{ fontSize: 14, fontWeight: 500 }}>No files found in this folder</p>
                          <p style={{ fontSize: 12, color: "#94a3b8" }}>Drop files here or click "+ New" to upload</p>
                        </div>
                      ) : viewMode === "grid" ? (
                        /* GRID VIEW (Reference 2) */
                        <div className="gdrive-files-grid">
                          {filteredFiles.map((file) => {
                            const isImg = isImageFile(file);
                            const ownerDisplayName = getDisplayOwnerName(file, userContext, "card");
                            const ownerDisplayPhoto = getDisplayOwnerPhoto(file, userContext);
                            return (
                              <div
                                key={file.id}
                                onClick={() => handlePreviewFile(file)}
                                className="gdrive-file-card"
                              >
                                <div className="gdrive-file-card-header">
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                                    {getFileIconComponent(file.mimeType, file.name, 16)}
                                    <span className="gdrive-file-card-title">{file.name}</span>
                                  </div>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={(e) => e.stopPropagation()}
                                        className="btn-icon-subtle"
                                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b" }}
                                      >
                                        <MoreVertical size={16} />
                                      </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="gdrive-action-dropdown-content">
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handlePreviewFile(file);
                                        }}
                                        className="gdrive-action-dropdown-item"
                                      >
                                        <Eye size={16} />
                                        <span>Preview</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDownloadFile(file.id);
                                        }}
                                        className="gdrive-action-dropdown-item"
                                      >
                                        <Download size={16} />
                                        <span>Download</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenShareModal(file);
                                        }}
                                        className="gdrive-action-dropdown-item"
                                      >
                                        <Share2 size={16} />
                                        <span>Share</span>
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator className="gdrive-dropdown-separator" />
                                      <DropdownMenuItem
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedItemForMenu({
                                            id: file.id,
                                            name: file.name,
                                            isFolder: false,
                                            sizeBytes: file.sizeBytes,
                                          });
                                          setOpenDeleteConfirm(true);
                                        }}
                                        className="gdrive-action-dropdown-item gdrive-action-dropdown-item-danger"
                                      >
                                        <Trash2 size={16} />
                                        <span>Delete</span>
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>

                                <div className="gdrive-file-card-body">
                                  {isImg && imageUrlCache[file.id] ? (
                                    <img src={imageUrlCache[file.id]} alt={file.name} loading="lazy" />
                                  ) : (
                                    getFileIconComponent(file.mimeType, file.name, 48)
                                  )}
                                </div>

                                <div className="gdrive-file-card-footer">
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flex: 1 }}>
                                    {renderUserAvatar(ownerDisplayName, ownerDisplayPhoto)}
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {ownerDisplayName}
                                    </span>
                                  </div>
                                  <span style={{ flexShrink: 0 }}>{formatStorageSize(file.sizeBytes)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* LIST TABLE VIEW (Reference 1) */
                        <div className="gdrive-table-container">
                          <table className="gdrive-table">
                            <thead>
                              <tr>
                                <th>Name</th>
                                <th>Owner</th>
                                <th>Last modified</th>
                                <th>File size</th>
                                <th style={{ textAlign: "right" }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredFiles.map((file) => {
                                const ownerDisplayName = getDisplayOwnerName(file, userContext, "table");
                                const ownerDisplayPhoto = getDisplayOwnerPhoto(file, userContext);
                                return (
                                  <tr
                                    key={file.id}
                                    onClick={() => handlePreviewFile(file)}
                                    className="gdrive-table-row"
                                  >
                                    <td>
                                      <div className="gdrive-table-name-cell">
                                        {getFileIconComponent(file.mimeType, file.name, 18)}
                                        <span>{file.name}</span>
                                      </div>
                                    </td>
                                    <td>
                                      <div className="gdrive-avatar-cell">
                                        {renderUserAvatar(ownerDisplayName, ownerDisplayPhoto)}
                                        <span>{ownerDisplayName}</span>
                                      </div>
                                    </td>
                                    <td style={{ color: "#64748b" }}>
                                      {new Date(file.updatedAt).toLocaleDateString()}
                                    </td>
                                    <td style={{ color: "#64748b" }}>
                                      {formatStorageSize(file.sizeBytes)}
                                    </td>
                                    <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button
                                            type="button"
                                            className="btn-icon-subtle"
                                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b" }}
                                          >
                                            <MoreVertical size={16} />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="gdrive-action-dropdown-content">
                                          <DropdownMenuItem
                                            onClick={() => handlePreviewFile(file)}
                                            className="gdrive-action-dropdown-item"
                                          >
                                            <Eye size={16} />
                                            <span>Preview</span>
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => handleDownloadFile(file.id)}
                                            className="gdrive-action-dropdown-item"
                                          >
                                            <Download size={16} />
                                            <span>Download</span>
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() => handleOpenShareModal(file)}
                                            className="gdrive-action-dropdown-item"
                                          >
                                            <Share2 size={16} />
                                            <span>Share</span>
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator className="gdrive-dropdown-separator" />
                                          <DropdownMenuItem
                                            onClick={() => {
                                              setSelectedItemForMenu({
                                                id: file.id,
                                                name: file.name,
                                                isFolder: false,
                                                sizeBytes: file.sizeBytes,
                                              });
                                              setOpenDeleteConfirm(true);
                                            }}
                                            className="gdrive-action-dropdown-item gdrive-action-dropdown-item-danger"
                                          >
                                            <Trash2 size={16} />
                                            <span>Delete</span>
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  </>
                )}
              </div>
            </main>

            {/* DETAILS / INFO INSPECTOR DRAWER */}
            {inspectorOpen && selectedFileForDetails && (
              <aside className="gdrive-inspector">
                <div className="gdrive-inspector-header">
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>File Details</span>
                  <button
                    type="button"
                    onClick={() => setInspectorOpen(false)}
                    style={{ background: "transparent", border: "none", cursor: "pointer", color: "#64748b" }}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="gdrive-inspector-preview">
                  {isImageFile(selectedFileForDetails) && imageUrlCache[selectedFileForDetails.id] ? (
                    <img src={imageUrlCache[selectedFileForDetails.id]} alt={selectedFileForDetails.name} />
                  ) : (
                    getFileIconComponent(selectedFileForDetails.mimeType, selectedFileForDetails.name, 56)
                  )}
                </div>

                <div>
                  <div className="gdrive-inspector-meta-row">
                    <span className="gdrive-inspector-label">Name</span>
                    <span className="gdrive-inspector-value" style={{ wordBreak: "break-all" }}>
                      {selectedFileForDetails.name}
                    </span>
                  </div>

                  <div className="gdrive-inspector-meta-row">
                    <span className="gdrive-inspector-label">Type</span>
                    <span className="gdrive-inspector-value">{selectedFileForDetails.mimeType}</span>
                  </div>

                  <div className="gdrive-inspector-meta-row">
                    <span className="gdrive-inspector-label">Size</span>
                    <span className="gdrive-inspector-value">{formatStorageSize(selectedFileForDetails.sizeBytes)}</span>
                  </div>

                  <div className="gdrive-inspector-meta-row">
                    <span className="gdrive-inspector-label">Owner</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {renderUserAvatar(
                        getDisplayOwnerName(selectedFileForDetails, userContext, "card"),
                        getDisplayOwnerPhoto(selectedFileForDetails, userContext),
                      )}
                      <span className="gdrive-inspector-value">
                        {getDisplayOwnerName(selectedFileForDetails, userContext, "card")}
                      </span>
                    </div>
                  </div>

                  <div className="gdrive-inspector-meta-row">
                    <span className="gdrive-inspector-label">Last Modified</span>
                    <span className="gdrive-inspector-value">
                      {new Date(selectedFileForDetails.updatedAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: "auto" }}>
                  <button
                    type="button"
                    onClick={() => handleDownloadFile(selectedFileForDetails.id)}
                    className="safelock-btn-primary"
                  >
                    <Download size={16} />
                    <span>Download File</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenShareModal(selectedFileForDetails)}
                    className="safelock-btn-secondary"
                  >
                    <Share2 size={16} />
                    <span>Share with Teammates</span>
                  </button>
                </div>
              </aside>
            )}
          </div>

          {/* Create Folder Modal */}
          <Dialog open={openFolderModal} onOpenChange={setOpenFolderModal}>
            <DialogContent style={{ maxWidth: 400 }}>
              <DialogHeader>
                <DialogTitle>New folder</DialogTitle>
              </DialogHeader>
              <div style={{ padding: "16px 0" }}>
                <input
                  type="text"
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFolderSubmit()}
                  className="form-input"
                  autoFocus
                />
              </div>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setOpenFolderModal(false)}
                  className="safelock-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateFolderSubmit}
                  disabled={!newFolderName.trim()}
                  className="safelock-btn-primary"
                >
                  Create
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Upload Modal */}
          <Dialog open={openUploadModal} onOpenChange={setOpenUploadModal}>
            <DialogContent style={{ maxWidth: 440 }}>
              <DialogHeader>
                <DialogTitle>Upload File</DialogTitle>
              </DialogHeader>
              <div style={{ padding: "16px 0" }}>
                {uploadState === "form" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: "#242420", display: "block", marginBottom: 6 }}>
                        File Name in Drive
                      </label>
                      <input
                        type="text"
                        value={customFileName}
                        onChange={(e) => setCustomFileName(e.target.value)}
                        className="form-input"
                      />
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      Size: {selectedFileToUpload ? formatStorageSize(selectedFileToUpload.size) : "0 B"}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, textAlign: "center" }}>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>Uploading {uploadingFileName}...</p>
                    <div className="gdrive-storage-bar-bg" style={{ height: 6 }}>
                      <div
                        className="gdrive-storage-bar-fill"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <span style={{ fontSize: 12, color: "#64748b" }}>{uploadProgress}%</span>
                  </div>
                )}
              </div>
              {uploadState === "form" && (
                <DialogFooter>
                  <button
                    type="button"
                    onClick={() => setOpenUploadModal(false)}
                    className="safelock-btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleStartUploadSubmit}
                    className="safelock-btn-primary"
                  >
                    Upload
                  </button>
                </DialogFooter>
              )}
            </DialogContent>
          </Dialog>

          {/* Share Modal */}
          <Dialog open={openShareModal} onOpenChange={setOpenShareModal}>
            <DialogContent style={{ maxWidth: 440 }}>
              <DialogHeader>
                <DialogTitle>Share "{selectedFileForShare?.name}"</DialogTitle>
              </DialogHeader>
              <div style={{ padding: "16px 0", display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#242420", display: "block", marginBottom: 6 }}>
                    Share with
                  </label>
                  <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={() => setShareTargetType("user")}
                      className={`gdrive-chip ${shareTargetType === "user" ? "active" : ""}`}
                    >
                      Teammate
                    </button>
                    <button
                      type="button"
                      onClick={() => setShareTargetType("company")}
                      className={`gdrive-chip ${shareTargetType === "company" ? "active" : ""}`}
                    >
                      Entire Company
                    </button>
                  </div>

                  {shareTargetType === "user" && (
                    <div className="gdrive-teammate-select-box">
                      {selectedColleague ? (
                        (() => {
                          const sel = colleagues.find((c) => c.id === selectedColleague);
                          return (
                            <div className="gdrive-teammate-selected-pill">
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {renderUserAvatar(sel?.name || "User", sel?.photoUrl)}
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 500, color: "#1e3a8a" }}>
                                    {sel?.name}
                                  </div>
                                  <div style={{ fontSize: 11, color: "#3b82f6" }}>
                                    {sel?.role}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedColleague("");
                                  setColleagueSearch("");
                                }}
                                className="gdrive-teammate-clear-btn"
                                title="Change teammate"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          );
                        })()
                      ) : (
                        <>
                          <div className="gdrive-teammate-search-wrap">
                            <Search size={16} className="gdrive-teammate-search-icon" />
                            <input
                              type="text"
                              placeholder="Search teammate by name or role..."
                              value={colleagueSearch}
                              onChange={(e) => setColleagueSearch(e.target.value)}
                              className="gdrive-teammate-search-input"
                              autoFocus
                            />
                            {colleagueSearch && (
                              <button
                                type="button"
                                onClick={() => setColleagueSearch("")}
                                className="gdrive-teammate-clear-btn"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>

                          <div className="gdrive-teammate-list">
                            {(() => {
                              const filtered = colleagues.filter(
                                (c) =>
                                  c.name.toLowerCase().includes(colleagueSearch.toLowerCase()) ||
                                  c.role.toLowerCase().includes(colleagueSearch.toLowerCase()),
                              );

                              if (filtered.length === 0) {
                                return (
                                  <div style={{ padding: "16px 12px", textAlign: "center", color: "#94a3b8", fontSize: 12 }}>
                                    No teammates found
                                  </div>
                                );
                              }

                              return filtered.map((c) => (
                                <div
                                  key={c.id}
                                  onClick={() => {
                                    setSelectedColleague(c.id);
                                    setColleagueSearch("");
                                  }}
                                  className={`gdrive-teammate-item ${selectedColleague === c.id ? "selected" : ""}`}
                                >
                                  <div className="gdrive-teammate-item-info">
                                    {renderUserAvatar(c.name, c.photoUrl)}
                                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                                      <span className="gdrive-teammate-item-name">{c.name}</span>
                                      <span className="gdrive-teammate-item-role">{c.role}</span>
                                    </div>
                                  </div>
                                  {selectedColleague === c.id && <Check size={16} color="#2563eb" />}
                                </div>
                              ));
                            })()}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setOpenShareModal(false)}
                  className="safelock-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleShareFileSubmit}
                  disabled={shareTargetType === "user" && !selectedColleague}
                  className="safelock-btn-primary"
                >
                  Share
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete Confirmation Modal */}
          <Dialog open={openDeleteConfirm} onOpenChange={setOpenDeleteConfirm}>
            <DialogContent style={{ maxWidth: 380 }}>
              <DialogHeader>
                <DialogTitle>
                  Delete {selectedItemForMenu?.isFolder ? "Folder" : "File"}?
                </DialogTitle>
              </DialogHeader>
              <p style={{ fontSize: 13, color: "#64748b", margin: "8px 0 16px" }}>
                Are you sure you want to delete <strong>{selectedItemForMenu?.name}</strong>? This action cannot be undone.
              </p>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setOpenDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="safelock-btn-secondary"
                  style={{
                    opacity: isDeleting ? 0.6 : 1,
                    cursor: isDeleting ? "not-allowed" : "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteItemSubmit}
                  disabled={isDeleting}
                  className="safelock-btn-primary"
                  style={{
                    backgroundColor: "#ef4444",
                    opacity: isDeleting ? 0.8 : 1,
                    cursor: isDeleting ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    minWidth: 96,
                  }}
                >
                  {isDeleting && <Loader2 size={15} className="animate-spin" />}
                  <span>{isDeleting ? "Deleting..." : "Delete"}</span>
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </SafeLockGuard>
      </Layout>
    </TooltipProvider>
  );
}
