import React, { useEffect, useState, useMemo } from "react";
import {
  Search,
  Plus,
  Laptop,
  Monitor,
  Smartphone,
  CreditCard,
  Keyboard,
  Headphones,
  KeyRound,
  Car,
  Package,
  UserPlus,
  CornerDownLeft,
  History,
  Trash2,
  Edit,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Download,
  Info,
  Clock,
  X,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  CompanyAsset,
  AssetType,
  AssetStatus,
  AssetCondition,
  AssetAssignmentHistory,
  AssetRequest,
  DEFAULT_ASSET_CATEGORIES,
  getCompanyAssets,
  createCompanyAsset,
  updateCompanyAsset,
  assignAssetToEmployee,
  returnCompanyAsset,
  deleteCompanyAsset,
  getAssetAssignmentHistory,
  getCompanyAssetRequests,
  approveAssetRequest,
  rejectAssetRequest,
} from "../../lib/assets";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

interface AssetsTabProps {
  showToast: (msg: string, severity?: "success" | "error" | "info" | "warning") => void;
}

const KNOWN_ICONS: Record<string, React.ReactNode> = {
  Laptop: <Laptop  />,
  Monitor: <Monitor  />,
  Smartphone: <Smartphone  />,
  Tablet: <Smartphone  />,
  "SIM Card": <CreditCard  />,
  "Keyboard/Mouse": <Keyboard  />,
  Headphones: <Headphones  />,
  "Security Key": <KeyRound  />,
  "Office Furniture": <Package  />,
  Vehicle: <Car  />,
  Other: <Package  />,
};

const getAssetIcon = (type: string) => {
  if (KNOWN_ICONS[type]) return KNOWN_ICONS[type];
  const lower = (type || "").toLowerCase();
  if (lower.includes("mac") || lower.includes("laptop") || lower.includes("pc")) return <Laptop  />;
  if (lower.includes("monitor") || lower.includes("screen") || lower.includes("display")) return <Monitor  />;
  if (lower.includes("phone") || lower.includes("mobile") || lower.includes("ipad") || lower.includes("tab")) return <Smartphone  />;
  if (lower.includes("key") || lower.includes("yubi")) return <KeyRound  />;
  if (lower.includes("audio") || lower.includes("headset") || lower.includes("earphone") || lower.includes("mic")) return <Headphones  />;
  if (lower.includes("mouse") || lower.includes("board")) return <Keyboard  />;
  if (lower.includes("car") || lower.includes("bike") || lower.includes("vehicle")) return <Car  />;
  return <Package  />;
};

export function AssetsTab({ showToast }: AssetsTabProps) {
  const [assets, setAssets] = useState<CompanyAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; email: string; job_title?: string; department?: string }>>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");

  // Derive all active and known categories
  const allCategories = useMemo(() => {
    const fromAssets = assets.map((a) => a.asset_type).filter(Boolean);
    const combined = Array.from(new Set([...DEFAULT_ASSET_CATEGORIES, ...fromAssets, ...customCategories]));
    return combined.sort((a, b) => a.localeCompare(b));
  }, [assets, customCategories]);

  // Create / Edit Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<CompanyAsset | null>(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<AssetType>("Laptop");
  const [formQuantity, setFormQuantity] = useState<number>(1);
  const [formCode, setFormCode] = useState("");
  const [formSerial, setFormSerial] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formPurchaseDate, setFormPurchaseDate] = useState("");
  const [formCost, setFormCost] = useState("");
  const [formWarranty, setFormWarranty] = useState("");
  const [formCondition, setFormCondition] = useState<AssetCondition>("good");
  const [formAssignee, setFormAssignee] = useState<string>("");
  const [formNotes, setFormNotes] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Quick Assign Modal State
  const [assignModalAsset, setAssignModalAsset] = useState<CompanyAsset | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [assignCondition, setAssignCondition] = useState<AssetCondition>("good");
  const [assignNotes, setAssignNotes] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);

  // Return / Check-in Modal State
  const [returnModalAsset, setReturnModalAsset] = useState<CompanyAsset | null>(null);
  const [returnCondition, setReturnCondition] = useState<AssetCondition>("good");
  const [returnNotes, setReturnNotes] = useState("");
  const [returnLoading, setReturnLoading] = useState(false);

  // History Drawer State
  const [historyDrawerAsset, setHistoryDrawerAsset] = useState<CompanyAsset | null>(null);
  const [assetHistory, setAssetHistory] = useState<AssetAssignmentHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Sub-view: "inventory" vs "requests"
  const [subView, setSubView] = useState<"inventory" | "requests">("inventory");
  const [requests, setRequests] = useState<AssetRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  // Approve Request Modal
  const [approvingReq, setApprovingReq] = useState<AssetRequest | null>(null);
  const [assignAssetId, setAssignAssetId] = useState<string>("");
  const [assignReqCondition, setAssignReqCondition] = useState<AssetCondition>("good");
  const [approvingLoading, setApprovingLoading] = useState(false);

  // Reject Request Modal
  const [rejectingReq, setRejectingReq] = useState<AssetRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectingLoading, setRejectingLoading] = useState(false);

  // Delete Confirm State
  const [deletingAsset, setDeletingAsset] = useState<CompanyAsset | null>(null);

  const fetchRequests = async (cId: string) => {
    setRequestsLoading(true);
    try {
      const data = await getCompanyAssetRequests(cId);
      setRequests(data);
    } catch (err) {
      console.error("Error loading asset requests:", err);
    } finally {
      setRequestsLoading(false);
    }
  };

  // Load context and assets
  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, company_id")
            .eq("id", user.id)
            .single();

          if (profile?.company_id) {
            setCompanyId(profile.company_id);
            setCurrentUserId(profile.id);
            const [data] = await Promise.all([
              getCompanyAssets(profile.company_id),
              fetchRequests(profile.company_id),
            ]);
            setAssets(data);

            // Fetch employees list for assigning
            const { data: emps } = await supabase
              .from("profiles")
              .select("id, name, email, job_title, department")
              .eq("company_id", profile.company_id)
              .order("name", { ascending: true });
            if (emps) setEmployees(emps);
          }
        }
      } catch (err) {
        console.error("Error loading assets:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Filtered Assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesSearch =
        !searchTerm.trim() ||
        asset.asset_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (asset.asset_code && asset.asset_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (asset.serial_number && asset.serial_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (asset.assigned_user?.name && asset.assigned_user.name.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesType = selectedType === "All" || asset.asset_type === selectedType;
      const matchesStatus = selectedStatus === "All" || asset.status === selectedStatus;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [assets, searchTerm, selectedType, selectedStatus]);

  // Metrics & Quotas
  const totalCount = assets.length;
  const assignedCount = assets.filter((a) => a.status === "assigned").length;
  const availableCount = assets.filter((a) => a.status === "available").length;
  const maintenanceCount = assets.filter((a) => a.status === "maintenance" || a.status === "damaged").length;
  const deployedRate = totalCount ? Math.round((assignedCount / totalCount) * 100) : 0;

  // Category-wise Breakdown
  const categoryStats = useMemo(() => {
    const map: Record<string, { total: number; available: number; assigned: number }> = {};
    assets.forEach((a) => {
      if (!map[a.asset_type]) {
        map[a.asset_type] = { total: 0, available: 0, assigned: 0 };
      }
      map[a.asset_type].total += 1;
      if (a.status === "available") map[a.asset_type].available += 1;
      if (a.status === "assigned") map[a.asset_type].assigned += 1;
    });
    return map;
  }, [assets]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingAsset(null);
    setFormName("");
    setFormType("Laptop");
    setFormQuantity(1);
    setFormCode(`AST-${Math.floor(100 + Math.random() * 900)}`);
    setFormSerial("");
    setFormBrand("");
    setFormModel("");
    setFormPurchaseDate("");
    setFormCost("");
    setFormWarranty("");
    setFormCondition("good");
    setFormAssignee("");
    setFormNotes("");
    setCreateModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (asset: CompanyAsset) => {
    setEditingAsset(asset);
    setFormName(asset.asset_name);
    setFormType(asset.asset_type);
    setFormQuantity(1);
    setFormCode(asset.asset_code || "");
    setFormSerial(asset.serial_number || "");
    setFormBrand(asset.brand || "");
    setFormModel(asset.model || "");
    setFormPurchaseDate(asset.purchase_date || "");
    setFormCost(asset.purchase_cost ? String(asset.purchase_cost) : "");
    setFormWarranty(asset.warranty_expiry || "");
    setFormCondition(asset.condition);
    setFormAssignee(asset.assigned_to || "");
    setFormNotes(asset.notes || "");
    setCreateModalOpen(true);
  };

  // Save Asset Form (Single or Batch Quota Creation)
  const handleSaveAsset = async () => {
    if (!formName.trim()) {
      showToast("Please enter an asset name", "warning");
      return;
    }
    if (!companyId) return;

    setFormSubmitting(true);
    try {
      if (editingAsset) {
        // Update Single Asset
        const updated = await updateCompanyAsset(editingAsset.id, companyId, {
          asset_name: formName.trim(),
          asset_type: formType,
          asset_code: formCode.trim() || null,
          serial_number: formSerial.trim() || null,
          brand: formBrand.trim() || null,
          model: formModel.trim() || null,
          purchase_date: formPurchaseDate || null,
          purchase_cost: formCost ? parseFloat(formCost) : null,
          warranty_expiry: formWarranty || null,
          condition: formCondition,
          notes: formNotes.trim() || null,
        });
        if (updated) {
          setAssets((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
          showToast("Asset updated successfully", "success");
        }
      } else {
        // Batch / Single Asset Creation
        const qty = Math.max(1, Math.min(formQuantity || 1, 50));
        const serialList = formSerial
          ? formSerial
              .split(/[\n,]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

        const baseCodeMatch = formCode.trim().match(/^(.*?)-?(\d+)$/);
        const codePrefix = baseCodeMatch ? baseCodeMatch[1] : (formCode.trim() || "AST");
        let startNum = baseCodeMatch ? parseInt(baseCodeMatch[2], 10) : Math.floor(100 + Math.random() * 800);

        const createdItems: CompanyAsset[] = [];

        for (let i = 0; i < qty; i++) {
          const itemCode =
            qty === 1 && formCode.trim()
              ? formCode.trim()
              : `${codePrefix}-${String(startNum + i).padStart(3, "0")}`;
          const itemSerial = serialList[i] || (qty === 1 ? formSerial.trim() : null);

          // For the first item, if assignee was picked, assign it
          const itemAssignee = i === 0 ? formAssignee || null : null;

          const created = await createCompanyAsset(companyId, {
            asset_name: formName.trim(),
            asset_type: formType,
            asset_code: itemCode,
            serial_number: itemSerial,
            brand: formBrand.trim() || null,
            model: formModel.trim() || null,
            purchase_date: formPurchaseDate || null,
            purchase_cost: formCost ? parseFloat(formCost) : null,
            warranty_expiry: formWarranty || null,
            condition: formCondition,
            assigned_to: itemAssignee,
            assigned_by: itemAssignee ? currentUserId : null,
            notes: formNotes.trim() || null,
          });

          if (itemAssignee && currentUserId) {
            await assignAssetToEmployee(
              created.id,
              companyId,
              itemAssignee,
              currentUserId,
              formCondition,
              "Initial assignment upon batch creation"
            );
          }

          createdItems.push(created);
        }

        setAssets((prev) => [...createdItems, ...prev]);
        showToast(
          qty > 1
            ? `Successfully created ${qty} units of ${formName.trim()} in stock`
            : "Asset added to company registry",
          "success"
        );
      }
      setCreateModalOpen(false);
      // Reload fresh list
      const fresh = await getCompanyAssets(companyId);
      setAssets(fresh);
    } catch (err: any) {
      showToast("Error saving asset: " + err.message, "error");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Quick Assign
  const handleAssignSubmit = async () => {
    if (!assignModalAsset || !assigneeId || !companyId || !currentUserId) return;
    setAssignLoading(true);
    try {
      await assignAssetToEmployee(
        assignModalAsset.id,
        companyId,
        assigneeId,
        currentUserId,
        assignCondition,
        assignNotes
      );
      showToast(`Asset assigned to employee`, "success");
      setAssignModalAsset(null);
      setAssigneeId("");
      setAssignNotes("");
      const fresh = await getCompanyAssets(companyId);
      setAssets(fresh);
    } catch (err: any) {
      showToast("Failed to assign asset: " + err.message, "error");
    } finally {
      setAssignLoading(false);
    }
  };

  // Quick Return
  const handleReturnSubmit = async () => {
    if (!returnModalAsset || !companyId || !currentUserId) return;
    setReturnLoading(true);
    try {
      await returnCompanyAsset(
        returnModalAsset.id,
        companyId,
        currentUserId,
        returnCondition,
        returnNotes
      );
      showToast(`Asset returned to available inventory`, "success");
      setReturnModalAsset(null);
      setReturnNotes("");
      const fresh = await getCompanyAssets(companyId);
      setAssets(fresh);
    } catch (err: any) {
      showToast("Failed to return asset: " + err.message, "error");
    } finally {
      setReturnLoading(false);
    }
  };

  // Open History Drawer
  const handleOpenHistory = async (asset: CompanyAsset) => {
    setHistoryDrawerAsset(asset);
    setHistoryLoading(true);
    try {
      const logs = await getAssetAssignmentHistory(asset.id);
      setAssetHistory(logs);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Delete Asset
  const handleDeleteConfirm = async () => {
    if (!deletingAsset || !companyId) return;
    try {
      await deleteCompanyAsset(deletingAsset.id, companyId);
      setAssets((prev) => prev.filter((a) => a.id !== deletingAsset.id));
      showToast("Asset deleted from registry", "success");
      setDeletingAsset(null);
    } catch (err: any) {
      showToast("Failed to delete asset: " + err.message, "error");
    }
  };

  // Open Approve Modal
  const handleOpenApprove = (req: AssetRequest) => {
    setApprovingReq(req);
    // Find matching available asset of the requested type if available
    const availableOfType = assets.filter((a) => a.status === "available" && a.asset_type === req.asset_type);
    setAssignAssetId(availableOfType.length > 0 ? availableOfType[0].id : "");
    setAssignReqCondition("good");
  };

  // Submit Approval
  const handleSubmitApproval = async () => {
    if (!approvingReq || !companyId || !currentUserId) return;
    if (!assignAssetId) {
      showToast("Please select an available asset to assign", "warning");
      return;
    }

    setApprovingLoading(true);
    try {
      await approveAssetRequest({
        requestId: approvingReq.id,
        companyId,
        assignedAssetId: assignAssetId,
        employeeId: approvingReq.employee_id,
        reviewerId: currentUserId,
        condition: assignReqCondition,
      });

      showToast("Asset request approved and hardware assigned!", "success");
      setApprovingReq(null);

      // Refresh both assets and requests
      const [newAssets] = await Promise.all([
        getCompanyAssets(companyId),
        fetchRequests(companyId),
      ]);
      setAssets(newAssets);
    } catch (err: any) {
      showToast("Failed to approve request: " + err.message, "error");
    } finally {
      setApprovingLoading(false);
    }
  };

  // Open Reject Modal
  const handleOpenReject = (req: AssetRequest) => {
    setRejectingReq(req);
    setRejectionReason("");
  };

  // Submit Rejection
  const handleSubmitRejection = async () => {
    if (!rejectingReq || !companyId || !currentUserId) return;
    if (!rejectionReason.trim()) {
      showToast("Please enter a rejection reason", "warning");
      return;
    }

    setRejectingLoading(true);
    try {
      await rejectAssetRequest({
        requestId: rejectingReq.id,
        companyId,
        reviewerId: currentUserId,
        rejectionReason: rejectionReason.trim(),
      });

      showToast("Asset request rejected", "info");
      setRejectingReq(null);
      await fetchRequests(companyId);
    } catch (err: any) {
      showToast("Failed to reject request: " + err.message, "error");
    } finally {
      setRejectingLoading(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!assets.length) return;
    const headers = [
      "Asset Code",
      "Asset Name",
      "Type",
      "Serial Number",
      "Brand",
      "Model",
      "Status",
      "Condition",
      "Assigned To",
      "Assigned Email",
      "Purchase Cost",
      "Purchase Date",
    ];

    const rows = assets.map((a) => [
      `"${a.asset_code || ""}"`,
      `"${a.asset_name}"`,
      `"${a.asset_type}"`,
      `"${a.serial_number || ""}"`,
      `"${a.brand || ""}"`,
      `"${a.model || ""}"`,
      `"${a.status}"`,
      `"${a.condition}"`,
      `"${a.assigned_user?.name || "Unassigned"}"`,
      `"${a.assigned_user?.email || ""}"`,
      `"${a.purchase_cost || ""}"`,
      `"${a.purchase_date || ""}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Company_Assets_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusChip = (status: AssetStatus) => {
    switch (status) {
      case "available":
        return {
          label: "Available",
          badgeClass: "hr-badge-present",
          icon: <CheckCircle2 size={12} />,
        };
      case "assigned":
        return {
          label: "Assigned",
          badgeClass: "hr-badge-active",
          icon: <ShieldCheck size={12} />,
        };
      case "maintenance":
        return {
          label: "In Repair",
          badgeClass: "hr-badge-late",
          icon: <Wrench size={12} />,
        };
      case "damaged":
        return {
          label: "Damaged",
          badgeClass: "hr-badge-absent",
          icon: <AlertTriangle size={12} />,
        };
      case "retired":
        return {
          label: "Retired",
          badgeClass: "hr-badge-missing",
          icon: <Info size={12} />,
        };
    }
  };

  const getConditionChip = (condition: AssetCondition) => {
    switch (condition) {
      case "brand_new":
        return { label: "Brand New", badgeClass: "hr-badge-present" };
      case "good":
        return { label: "Good", badgeClass: "hr-badge-present" };
      case "fair":
        return { label: "Fair", badgeClass: "hr-badge-late" };
      case "damaged":
        return { label: "Damaged", badgeClass: "hr-badge-absent" };
    }
  };

  return (
    <TooltipProvider>
      <div className="hr-tab-container">
        {/* Top Header */}
        <div className="hr-tab-header">
          <div className="hr-tab-title-group">
            <h2 className="hr-tab-title">Asset Management</h2>
            <p className="hr-tab-subtitle">
              Track hardware inventory, manage device allocations, and review equipment requisitions.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              onClick={handleExportCSV}
              className="hr-btn hr-btn-secondary"
            >
              <Download size={15} />
              <span>Export Register</span>
            </button>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="hr-btn hr-btn-primary"
            >
              <Plus size={15} />
              <span>Add New Asset</span>
            </button>
          </div>
        </div>

        {/* Top 4 Summary Cards */}
        <div className="hr-metrics-grid">
          <div className="hr-stat-card">
            <div className="hr-stat-header">
              <div className="hr-stat-icon-wrapper">
                <Package size={18} />
              </div>
              <span className="hr-stat-label">Total Assets</span>
            </div>
            <div className="hr-stat-value">
              {loading ? <div className="skeleton-shimmer" style={{ width: 40, height: 28, borderRadius: 6 }} /> : totalCount}
            </div>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Fleet inventory in system</span>
          </div>

          <div className="hr-stat-card">
            <div className="hr-stat-header">
              <div className="hr-stat-icon-wrapper">
                <ShieldCheck size={18} style={{ color: "var(--color-primary)" }} />
              </div>
              <span className="hr-stat-label">Assigned (In Use)</span>
            </div>
            <div className="hr-stat-value">
              {loading ? <div className="skeleton-shimmer" style={{ width: 40, height: 28, borderRadius: 6 }} /> : assignedCount}
            </div>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{deployedRate}% deployed to staff</span>
          </div>

          <div className="hr-stat-card">
            <div className="hr-stat-header">
              <div className="hr-stat-icon-wrapper">
                <CheckCircle2 size={18} style={{ color: "#16a34a" }} />
              </div>
              <span className="hr-stat-label">Available in Stock</span>
            </div>
            <div className="hr-stat-value">
              {loading ? <div className="skeleton-shimmer" style={{ width: 40, height: 28, borderRadius: 6 }} /> : availableCount}
            </div>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Ready for instant allocation</span>
          </div>

          <div className="hr-stat-card">
            <div className="hr-stat-header">
              <div className="hr-stat-icon-wrapper">
                <Wrench size={18} style={{ color: "#d97706" }} />
              </div>
              <span className="hr-stat-label">Maintenance / Issues</span>
            </div>
            <div className="hr-stat-value">
              {loading ? <div className="skeleton-shimmer" style={{ width: 40, height: 28, borderRadius: 6 }} /> : maintenanceCount}
            </div>
            <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Under inspection or repairs</span>
          </div>
        </div>

        {/* Sub-view Navigation Tabs */}
        <div className="hr-tabs-bar">
          <button
            type="button"
            onClick={() => setSubView("inventory")}
            className={`hr-tab-btn ${subView === "inventory" ? "active" : ""}`}
          >
            <Package size={15} />
            <span>Fleet Inventory ({assets.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView("requests")}
            className={`hr-tab-btn ${subView === "requests" ? "active" : ""}`}
          >
            <span>Asset Requests</span>
            {requests.filter((r) => r.status === "pending").length > 0 && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "1px 6px",
                  borderRadius: 9999,
                  fontSize: 10,
                  fontWeight: 600,
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                }}
              >
                {requests.filter((r) => r.status === "pending").length}
              </span>
            )}
          </button>
        </div>

        {/* Sub-view: REQUESTS TABLE */}
        {subView === "requests" ? (
          <div className="hr-table-wrapper">
            <div className="hr-table-toolbar">
              <div>
                <h3 className="hr-table-title">Employee Hardware Requisitions</h3>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                  Review, approve, assign inventory, or reject requests with explanation.
                </p>
              </div>
            </div>

            <div className="hr-table-scroll">
              <table className="hr-data-table">
                <thead>
                  <tr>
                    <th style={{ width: "22%" }}>Employee</th>
                    <th style={{ width: "15%" }}>Asset Category</th>
                    <th style={{ width: "25%" }}>Business Justification</th>
                    <th style={{ width: "10%" }}>Priority</th>
                    <th style={{ width: "10%" }}>Status</th>
                    <th style={{ width: "8%" }}>Date</th>
                    <th style={{ width: "10%", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {requestsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={7}>
                          <div className="skeleton-shimmer" style={{ width: "100%", height: 32, borderRadius: 4 }} />
                        </td>
                      </tr>
                    ))
                  ) : requests.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="hr-table-empty">
                        No asset requests submitted yet
                      </td>
                    </tr>
                  ) : (
                    requests.map((req) => {
                      const icon = getAssetIcon(req.asset_type);
                      const isPending = req.status === "pending";

                      return (
                        <tr key={req.id}>
                          {/* Employee */}
                          <td>
                            <div className="hr-avatar-cell">
                              <div className="hr-avatar">
                                {req.employee?.name ? req.employee.name.charAt(0) : "E"}
                              </div>
                              <div>
                                <p style={{ fontWeight: 600, color: "var(--color-text-primary)", margin: 0, fontSize: 13 }}>
                                  {req.employee?.name || "Unknown"}
                                </p>
                                <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
                                  {req.employee?.job_title || req.employee?.email || ""}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Category */}
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                              {icon}
                              <span>{req.asset_type}</span>
                            </div>
                          </td>

                          {/* Reason */}
                          <td>
                            <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-primary)" }}>{req.reason}</p>
                            {req.rejection_reason && (
                              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#dc2626" }}>
                                Rejected: {req.rejection_reason}
                              </p>
                            )}
                            {req.assigned_asset && (
                              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#16a34a" }}>
                                Assigned: {req.assigned_asset.asset_name} ({req.assigned_asset.asset_code || "No Code"})
                              </p>
                            )}
                          </td>

                          {/* Priority */}
                          <td>
                            <span
                              className={`hr-badge ${
                                req.priority === "urgent" || req.priority === "high"
                                  ? "hr-badge-priority-high"
                                  : req.priority === "medium"
                                  ? "hr-badge-priority-med"
                                  : "hr-badge-priority-low"
                              }`}
                            >
                              {req.priority}
                            </span>
                          </td>

                          {/* Status */}
                          <td>
                            <span
                              className={`hr-badge ${
                                req.status === "approved"
                                  ? "hr-badge-present"
                                  : req.status === "rejected"
                                  ? "hr-badge-absent"
                                  : "hr-badge-late"
                              }`}
                            >
                              {req.status}
                            </span>
                          </td>

                          {/* Date */}
                          <td className="hr-cell-mono">
                            {new Date(req.created_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}
                          </td>

                          {/* Actions */}
                          <td style={{ textAlign: "right" }}>
                            {isPending ? (
                              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenApprove(req)}
                                  className="hr-btn hr-btn-primary"
                                  style={{ height: 26, fontSize: 11, padding: "0 8px" }}
                                >
                                  Approve & Assign
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenReject(req)}
                                  className="hr-btn hr-btn-danger"
                                  style={{ height: 26, fontSize: 11, padding: "0 8px" }}
                                >
                                  Reject
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Resolved</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Main Table Card Container (Fleet Inventory) */
          <div className="hr-table-wrapper">
            {/* Category Stock Quota Pills */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--color-border-subtle)", overflowX: "auto", background: "var(--color-surface)" }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--color-text-muted)", letterSpacing: "0.04em", flexShrink: 0 }}>
                Stock Quotas:
              </span>
              {allCategories.map((cat) => {
                const stat = categoryStats[cat] || { total: 0, available: 0, assigned: 0 };
                if (stat.total === 0) return null;
                const isSelected = selectedType === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedType(isSelected ? "All" : cat)}
                    className={`hr-req-chip ${isSelected ? "hr-badge-active" : ""}`}
                    style={{ cursor: "pointer", border: isSelected ? "1px solid var(--color-primary)" : "1px solid var(--color-border)", padding: "3px 10px", fontSize: 12 }}
                  >
                    {getAssetIcon(cat)}
                    <span>
                      {cat}: {stat.available}/{stat.total} Avail
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Actions Bar */}
            <div className="hr-table-toolbar">
              {/* Search & Selects */}
              <div className="hr-toolbar-filter-group">
                <div className="hr-search-bar">
                  <Search size={15} style={{ color: "var(--color-text-muted)" }} />
                  <input
                    type="text"
                    placeholder="Search by name, code, serial, employee…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="hr-btn-icon"
                      style={{ width: 20, height: 20 }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="hr-select"
                >
                  <option value="All">All Categories</option>
                  {allCategories.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="hr-select"
                >
                  <option value="All">All Statuses</option>
                  <option value="available">Available</option>
                  <option value="assigned">Assigned</option>
                  <option value="maintenance">In Repair</option>
                  <option value="damaged">Damaged</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>

            {/* Table Content */}
            <div className="hr-table-scroll">
              <table className="hr-data-table">
                <thead>
                  <tr>
                    <th style={{ width: "24%" }}>Asset Details</th>
                    <th style={{ width: "12%" }}>Category</th>
                    <th style={{ width: "14%" }}>Serial / Tag</th>
                    <th style={{ width: "12%" }}>Status</th>
                    <th style={{ width: "18%" }}>Assigned To</th>
                    <th style={{ width: "10%" }}>Condition</th>
                    <th style={{ width: "10%", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        <td>
                          <div className="hr-avatar-cell">
                            <div className="skeleton-shimmer" style={{ width: 34, height: 34, borderRadius: 8 }} />
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              <div className="skeleton-shimmer" style={{ width: 120, height: 14, borderRadius: 4 }} />
                              <div className="skeleton-shimmer" style={{ width: 80, height: 11, borderRadius: 4 }} />
                            </div>
                          </div>
                        </td>
                        <td><div className="skeleton-shimmer" style={{ width: 70, height: 14, borderRadius: 4 }} /></td>
                        <td><div className="skeleton-shimmer" style={{ width: 60, height: 14, borderRadius: 4 }} /></td>
                        <td><div className="skeleton-shimmer" style={{ width: 70, height: 20, borderRadius: 6 }} /></td>
                        <td><div className="skeleton-shimmer" style={{ width: 90, height: 14, borderRadius: 4 }} /></td>
                        <td><div className="skeleton-shimmer" style={{ width: 50, height: 14, borderRadius: 4 }} /></td>
                        <td style={{ textAlign: "right" }}><div className="skeleton-shimmer" style={{ width: 60, height: 24, borderRadius: 6, marginLeft: "auto" }} /></td>
                      </tr>
                    ))
                  ) : filteredAssets.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="hr-table-empty">
                        <Package size={30} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                        <p style={{ fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 4px" }}>No assets found</p>
                        <p style={{ margin: 0 }}>
                          {searchTerm || selectedType !== "All" || selectedStatus !== "All"
                            ? "Try adjusting your filters or search query"
                            : "Add your first company asset to begin tracking equipment"}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredAssets.map((asset) => {
                      const statusInfo = getStatusChip(asset.status);
                      const conditionInfo = getConditionChip(asset.condition);
                      const icon = getAssetIcon(asset.asset_type);

                      return (
                        <tr key={asset.id}>
                          {/* Asset Details */}
                          <td>
                            <div className="hr-avatar-cell">
                              <div
                                style={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 8,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: "var(--color-surface-subtle)",
                                  border: "1px solid var(--color-border)",
                                  color: "var(--color-text-primary)",
                                  flexShrink: 0,
                                }}
                              >
                                {icon}
                              </div>
                              <div>
                                <p style={{ fontWeight: 600, color: "var(--color-text-primary)", margin: 0, fontSize: 13 }}>
                                  {asset.asset_name}
                                </p>
                                <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: 0 }}>
                                  {[asset.brand, asset.model].filter(Boolean).join(" • ") || "Standard Asset"}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Category */}
                          <td>
                            <span style={{ fontWeight: 500, fontSize: 13 }}>
                              {asset.asset_type}
                            </span>
                          </td>

                          {/* Serial / Tag */}
                          <td>
                            <span className="hr-cell-mono" style={{ fontWeight: 600, color: "var(--color-text-primary)", display: "block" }}>
                              {asset.asset_code || "—"}
                            </span>
                            {asset.serial_number && (
                              <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                                SN: {asset.serial_number}
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td>
                            <span className={`hr-badge ${statusInfo.badgeClass}`}>
                              {statusInfo.icon} {statusInfo.label}
                            </span>
                          </td>

                          {/* Assigned To */}
                          <td>
                            {asset.assigned_user ? (
                              <div className="hr-avatar-cell">
                                <div className="hr-avatar hr-avatar-sm">
                                  {asset.assigned_user.name ? asset.assigned_user.name.charAt(0) : "U"}
                                </div>
                                <div>
                                  <p style={{ fontWeight: 500, color: "var(--color-text-primary)", margin: 0, fontSize: 12 }}>
                                    {asset.assigned_user.name}
                                  </p>
                                  <p style={{ fontSize: 10, color: "var(--color-text-muted)", margin: 0 }}>
                                    {asset.assigned_user.job_title || asset.assigned_user.department || ""}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Unassigned</span>
                            )}
                          </td>

                          {/* Condition */}
                          <td>
                            <span className={`hr-badge ${conditionInfo.badgeClass}`}>
                              {conditionInfo.label}
                            </span>
                          </td>

                          {/* Actions */}
                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                              {/* Quick Assign / Return Button */}
                              {asset.status === "available" ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAssignModalAsset(asset);
                                        setAssigneeId("");
                                        setAssignCondition(asset.condition);
                                      }}
                                      className="hr-btn-icon"
                                    >
                                      <UserPlus size={15} />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Assign to Employee</TooltipContent>
                                </Tooltip>
                              ) : asset.status === "assigned" ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setReturnModalAsset(asset);
                                        setReturnCondition(asset.condition);
                                      }}
                                      className="hr-btn-icon"
                                    >
                                      <CornerDownLeft size={15} />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Check-in / Return Asset</TooltipContent>
                                </Tooltip>
                              ) : null}

                              {/* History Drawer */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenHistory(asset)}
                                    className="hr-btn-icon"
                                  >
                                    <History size={15} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Assignment History Log</TooltipContent>
                              </Tooltip>

                              {/* Edit */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEdit(asset)}
                                    className="hr-btn-icon"
                                  >
                                    <Edit size={15} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Edit Asset Info</TooltipContent>
                              </Tooltip>

                              {/* Delete */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => setDeletingAsset(asset)}
                                    className="hr-btn-icon"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Delete Asset</TooltipContent>
                              </Tooltip>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* ADD / EDIT ASSET MODAL */}
        {/* ============================================================ */}
        <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
          <DialogContent style={{ maxWidth: 520, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 22 }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
                {editingAsset ? "Edit Asset Details" : "Add New Asset"}
              </DialogTitle>
            </DialogHeader>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "16px 0" }}>
              <div className="hr-form-field">
                <label className="hr-form-label">
                  Asset Name <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. MacBook Pro 14 M3, Dell UltraSharp 27"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="hr-input"
                />
              </div>

              {!editingAsset ? (
                <div className="hr-form-grid hr-form-grid-2">
                  <div className="hr-form-field">
                    <label className="hr-form-label">
                      Asset Category
                    </label>
                    <select
                      value={formType}
                      onChange={(e) => {
                        if (e.target.value === "__NEW_CUSTOM_CATEGORY__") {
                          setShowNewCatInput(true);
                        } else {
                          setFormType(e.target.value);
                        }
                      }}
                      className="hr-select"
                    >
                      {allCategories.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                      <option value="__NEW_CUSTOM_CATEGORY__">+ Create Custom Category...</option>
                    </select>
                  </div>

                  <div className="hr-form-field">
                    <label className="hr-form-label">
                      Quantity / Units
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={formQuantity}
                      onChange={(e) => setFormQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="hr-input"
                    />
                    {formQuantity > 1 && (
                      <span style={{ fontSize: 11, color: "var(--color-primary)" }}>
                        Will create {formQuantity} serialized units
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="hr-form-field">
                  <label className="hr-form-label">
                    Asset Category
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => {
                      if (e.target.value === "__NEW_CUSTOM_CATEGORY__") {
                        setShowNewCatInput(true);
                      } else {
                        setFormType(e.target.value);
                      }
                    }}
                    className="hr-select"
                  >
                    {allCategories.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    <option value="__NEW_CUSTOM_CATEGORY__">+ Create Custom Category...</option>
                  </select>
                </div>
              )}

              {showNewCatInput && (
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder="Custom category name..."
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="hr-input"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    disabled={!newCatName.trim()}
                    onClick={() => {
                      const trimmed = newCatName.trim();
                      if (trimmed) {
                        setCustomCategories((prev) => Array.from(new Set([...prev, trimmed])));
                        setFormType(trimmed);
                        setNewCatName("");
                        setShowNewCatInput(false);
                        showToast(`Custom category "${trimmed}" added`, "success");
                      }
                    }}
                    className="hr-btn hr-btn-primary"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowNewCatInput(false)}
                    className="hr-btn-icon"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              {!editingAsset && formQuantity > 1 ? (
                <div className="hr-form-grid hr-form-grid-2">
                  <div className="hr-form-field">
                    <label className="hr-form-label">
                      Base Tag Prefix
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. MON or AST-100"
                      value={formCode}
                      onChange={(e) => setFormCode(e.target.value)}
                      className="hr-input"
                    />
                  </div>
                  <div className="hr-form-field">
                    <label className="hr-form-label">
                      Serial Numbers (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Comma separated serials"
                      value={formSerial}
                      onChange={(e) => setFormSerial(e.target.value)}
                      className="hr-input"
                    />
                  </div>
                </div>
              ) : null}

              <div className="hr-form-grid hr-form-grid-2">
                <div className="hr-form-field">
                  <label className="hr-form-label">
                    Brand / Manufacturer
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Apple, Dell, Lenovo"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    className="hr-input"
                  />
                </div>

                {(!formQuantity || formQuantity === 1) && (
                  <div className="hr-form-field">
                    <label className="hr-form-label">
                      Serial Number (SN)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. C02G99XXMD6R"
                      value={formSerial}
                      onChange={(e) => setFormSerial(e.target.value)}
                      className="hr-input"
                    />
                  </div>
                )}
              </div>

              <div className="hr-form-grid hr-form-grid-2">
                <div className="hr-form-field">
                  <label className="hr-form-label">
                    Purchase Date
                  </label>
                  <input
                    type="date"
                    value={formPurchaseDate}
                    onChange={(e) => setFormPurchaseDate(e.target.value)}
                    className="hr-input"
                  />
                </div>

                <div className="hr-form-field">
                  <label className="hr-form-label">
                    Purchase Cost (₹)
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 125000"
                    value={formCost}
                    onChange={(e) => setFormCost(e.target.value)}
                    className="hr-input"
                  />
                </div>
              </div>

              <div className="hr-form-grid hr-form-grid-2">
                <div className="hr-form-field">
                  <label className="hr-form-label">
                    Warranty Expiry
                  </label>
                  <input
                    type="date"
                    value={formWarranty}
                    onChange={(e) => setFormWarranty(e.target.value)}
                    className="hr-input"
                  />
                </div>

                <div className="hr-form-field">
                  <label className="hr-form-label">
                    Condition
                  </label>
                  <select
                    value={formCondition}
                    onChange={(e) => setFormCondition(e.target.value as AssetCondition)}
                    className="hr-select"
                  >
                    <option value="brand_new">Brand New</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="damaged">Damaged</option>
                  </select>
                </div>
              </div>

              {!editingAsset && (
                <div className="hr-form-field">
                  <label className="hr-form-label">
                    Assign to Employee (Optional)
                  </label>
                  <select
                    value={formAssignee}
                    onChange={(e) => setFormAssignee(e.target.value)}
                    className="hr-select"
                  >
                    <option value="">Unassigned (Keep in stock)</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} {emp.job_title ? `(${emp.job_title})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="hr-form-field">
                <label className="hr-form-label">
                  Notes / Specifications
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. 16GB RAM / 512GB SSD, includes power adapter"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="hr-input"
                  style={{ height: "auto", padding: "8px 12px", resize: "vertical" }}
                />
              </div>
            </div>

            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={formSubmitting}
                onClick={handleSaveAsset}
                className="hr-btn hr-btn-primary"
              >
                {editingAsset ? "Update Asset" : "Save Asset"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================================ */}
        {/* QUICK ASSIGN MODAL */}
        {/* ============================================================ */}
        <Dialog open={Boolean(assignModalAsset)} onOpenChange={(o) => !o && setAssignModalAsset(null)}>
          <DialogContent style={{ maxWidth: 460, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 22 }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>Assign Equipment</DialogTitle>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                {assignModalAsset?.asset_name} ({assignModalAsset?.asset_code})
              </p>
            </DialogHeader>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "16px 0" }}>
              <div className="hr-form-field">
                <label className="hr-form-label">
                  Select Employee <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="hr-select"
                >
                  <option value="" disabled>
                    Select employee...
                  </option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} {emp.job_title ? `— ${emp.job_title}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">
                  Handover Condition
                </label>
                <select
                  value={assignCondition}
                  onChange={(e) => setAssignCondition(e.target.value as AssetCondition)}
                  className="hr-select"
                >
                  <option value="brand_new">Brand New</option>
                  <option value="good">Good Condition</option>
                  <option value="fair">Fair / Used</option>
                </select>
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">
                  Handover Notes
                </label>
                <textarea
                  rows={2}
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                  placeholder="e.g. Handed over with charger, laptop bag, and wireless mouse"
                  className="hr-input"
                  style={{ height: "auto", padding: "8px 12px", resize: "vertical" }}
                />
              </div>
            </div>

            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setAssignModalAsset(null)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!assigneeId || assignLoading}
                onClick={handleAssignSubmit}
                className="hr-btn hr-btn-primary"
              >
                Confirm Handover
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================================ */}
        {/* QUICK RETURN / CHECK-IN MODAL */}
        {/* ============================================================ */}
        <Dialog open={Boolean(returnModalAsset)} onOpenChange={(o) => !o && setReturnModalAsset(null)}>
          <DialogContent style={{ maxWidth: 460, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 22 }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>Check-in / Return Asset</DialogTitle>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                Currently with: {returnModalAsset?.assigned_user?.name || "Employee"}
              </p>
            </DialogHeader>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "16px 0" }}>
              <div className="hr-form-field">
                <label className="hr-form-label">
                  Return Condition <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value as AssetCondition)}
                  className="hr-select"
                >
                  <option value="good">Good / Ready for re-use</option>
                  <option value="fair">Fair (Normal wear & tear)</option>
                  <option value="damaged">Damaged / Needs Repair</option>
                </select>
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">
                  Return Inspection Notes
                </label>
                <textarea
                  rows={2}
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="e.g. Returned in good shape with original charging adapter"
                  className="hr-input"
                  style={{ height: "auto", padding: "8px 12px", resize: "vertical" }}
                />
              </div>
            </div>

            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setReturnModalAsset(null)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={returnLoading}
                onClick={handleReturnSubmit}
                className="hr-btn hr-btn-primary"
              >
                Accept Return
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================================ */}
        {/* ASSET ASSIGNMENT HISTORY DRAWER */}
        {/* ============================================================ */}
        <Sheet open={Boolean(historyDrawerAsset)} onOpenChange={(o) => !o && setHistoryDrawerAsset(null)}>
          <SheetContent style={{ backgroundColor: "var(--color-surface)", borderLeft: "1px solid var(--color-border)", padding: 24, maxWidth: 440 }}>
            <SheetHeader>
              <SheetTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>Assignment History</SheetTitle>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                {historyDrawerAsset?.asset_name} ({historyDrawerAsset?.asset_code})
              </p>
            </SheetHeader>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              {historyLoading ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="skeleton-shimmer" style={{ width: "100%", height: 60, borderRadius: 8 }} />
                  <div className="skeleton-shimmer" style={{ width: "100%", height: 60, borderRadius: 8 }} />
                </div>
              ) : assetHistory.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-text-muted)" }}>
                  <History size={28} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                  <p style={{ fontWeight: 600, margin: "0 0 4px", color: "var(--color-text-primary)" }}>No assignment history</p>
                  <p style={{ margin: 0, fontSize: 12 }}>Transfers and returns for this asset will be logged here.</p>
                </div>
              ) : (
                assetHistory.map((log) => (
                  <div key={log.id} style={{ padding: 12, borderRadius: 8, backgroundColor: "var(--color-surface-subtle)", border: "1px solid var(--color-border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div className="hr-avatar-cell">
                        <div className="hr-avatar hr-avatar-sm">
                          {log.employee?.name ? log.employee.name.charAt(0) : "E"}
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: 12, margin: 0, color: "var(--color-text-primary)" }}>{log.employee?.name || "Employee"}</p>
                          <p style={{ fontSize: 10, color: "var(--color-text-muted)", margin: 0 }}>{log.employee?.email || ""}</p>
                        </div>
                      </div>
                      <span className={`hr-badge ${log.returned_at ? "hr-badge-missing" : "hr-badge-present"}`}>
                        {log.returned_at ? "Returned" : "Current Custody"}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, fontSize: 11, color: "var(--color-text-muted)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={12} />
                        <span>Assigned: {new Date(log.assigned_at).toLocaleDateString()}</span>
                      </div>
                      {log.returned_at && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <CornerDownLeft size={12} />
                          <span>Returned: {new Date(log.returned_at).toLocaleDateString()}</span>
                        </div>
                      )}
                      {log.notes && (
                        <p style={{ margin: "4px 0 0", fontStyle: "italic", color: "var(--color-text-secondary)" }}>
                          "{log.notes}"
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* ============================================================ */}
        {/* DELETE CONFIRM DIALOG */}
        {/* ============================================================ */}
        <Dialog open={Boolean(deletingAsset)} onOpenChange={(o) => !o && setDeletingAsset(null)}>
          <DialogContent style={{ maxWidth: 440, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 22 }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
                Delete Asset
              </DialogTitle>
            </DialogHeader>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "12px 0" }}>
              Are you sure you want to delete <strong>{deletingAsset?.asset_name}</strong> (
              {deletingAsset?.asset_code})? This will permanently remove it from inventory.
            </p>
            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setDeletingAsset(null)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                className="hr-btn hr-btn-danger"
              >
                Delete Asset
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================================ */}
        {/* APPROVE REQUEST & ASSIGN MODAL */}
        {/* ============================================================ */}
        <Dialog open={Boolean(approvingReq)} onOpenChange={(o) => !o && setApprovingReq(null)}>
          <DialogContent style={{ maxWidth: 480, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 22 }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
                Approve Asset Requisition & Allocate Hardware
              </DialogTitle>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                Request from <strong>{approvingReq?.employee?.name}</strong> for {approvingReq?.asset_type}
              </p>
            </DialogHeader>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, margin: "16px 0" }}>
              <div style={{ padding: 10, borderRadius: 8, backgroundColor: "var(--color-surface-subtle)", border: "1px solid var(--color-border-subtle)" }}>
                <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--color-text-muted)" }}>
                  Employee Request Reason:
                </span>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--color-text-primary)" }}>{approvingReq?.reason}</p>
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">
                  Select Available {approvingReq?.asset_type || "Hardware"} from Stock <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <select
                  value={assignAssetId}
                  onChange={(e) => setAssignAssetId(e.target.value)}
                  className="hr-select"
                >
                  <option value="" disabled>
                    Select inventory item...
                  </option>
                  {assets
                    .filter(
                      (a) => a.status === "available" && (!approvingReq || a.asset_type === approvingReq.asset_type)
                    )
                    .map((ast) => (
                      <option key={ast.id} value={ast.id}>
                        {ast.asset_name} ({ast.asset_code || "No Tag"}) • Condition: {ast.condition}
                      </option>
                    ))}
                </select>
                {assets.filter(
                  (a) => a.status === "available" && (!approvingReq || a.asset_type === approvingReq.asset_type)
                ).length === 0 && (
                  <span style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>
                    No available {approvingReq?.asset_type || "assets"} in stock. Please add stock via "Add Asset" first.
                  </span>
                )}
              </div>

              <div className="hr-form-field">
                <label className="hr-form-label">
                  Handover Condition Assessment
                </label>
                <select
                  value={assignReqCondition}
                  onChange={(e) => setAssignReqCondition(e.target.value as AssetCondition)}
                  className="hr-select"
                >
                  <option value="brand_new">Brand New (Unboxed)</option>
                  <option value="good">Good (Clean / Working)</option>
                  <option value="fair">Fair (Minor Scratches)</option>
                  <option value="damaged">Damaged / Needs Repair</option>
                </select>
              </div>
            </div>

            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setApprovingReq(null)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={approvingLoading || !assignAssetId}
                onClick={handleSubmitApproval}
                className="hr-btn hr-btn-primary"
              >
                {approvingLoading ? "Assigning..." : "Confirm & Allocate Asset"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================================ */}
        {/* REJECT REQUEST MODAL */}
        {/* ============================================================ */}
        <Dialog open={Boolean(rejectingReq)} onOpenChange={(o) => !o && setRejectingReq(null)}>
          <DialogContent style={{ maxWidth: 440, backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 12, padding: 22 }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)" }}>
                Reject Asset Requisition
              </DialogTitle>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                Explain why this request is being declined so the employee understands.
              </p>
            </DialogHeader>

            <div style={{ margin: "14px 0" }} className="hr-form-field">
              <label className="hr-form-label">
                Rejection Reason <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Current laptop meets performance requirements; procurement budget exhausted until Q3..."
                className="hr-input"
                style={{ height: "auto", padding: "8px 12px", resize: "vertical" }}
              />
            </div>

            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => setRejectingReq(null)}
                className="hr-btn hr-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={rejectingLoading || !rejectionReason.trim()}
                onClick={handleSubmitRejection}
                className="hr-btn hr-btn-danger"
              >
                {rejectingLoading ? "Rejecting..." : "Decline Requisition"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
