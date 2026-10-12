import { supabase } from "./supabase";

export type AssetType = string;

export const DEFAULT_ASSET_CATEGORIES: string[] = [
  "Laptop",
  "Monitor",
  "Smartphone",
  "Tablet",
  "SIM Card",
  "Keyboard/Mouse",
  "Headphones",
  "Security Key",
  "Office Furniture",
  "Vehicle",
  "Other",
];

export type AssetStatus = "available" | "assigned" | "maintenance" | "damaged" | "retired";

export type AssetCondition = "brand_new" | "good" | "fair" | "damaged";

export interface CompanyAsset {
  id: string;
  company_id: string;
  asset_name: string;
  asset_type: AssetType;
  serial_number: string | null;
  asset_code: string | null;
  brand: string | null;
  model: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  warranty_expiry: string | null;
  status: AssetStatus;
  condition: AssetCondition;
  assigned_to: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined relations
  assigned_user?: {
    id: string;
    name: string;
    email: string;
    profile_photo: string | null;
    job_title: string | null;
    department: string | null;
  } | null;
}

export interface AssetAssignmentHistory {
  id: string;
  asset_id: string;
  company_id: string;
  employee_id: string;
  assigned_at: string;
  returned_at: string | null;
  condition_on_assign: string;
  condition_on_return: string | null;
  notes: string | null;
  performed_by: string | null;
  created_at: string;
  employee?: {
    id: string;
    name: string;
    email: string;
    profile_photo: string | null;
  } | null;
}

const LOCAL_STORAGE_KEY_PREFIX = "capoasis_assets_";

/**
 * Fetch all assets for the company with fallback to localStorage
 */
export async function getCompanyAssets(companyId: string): Promise<CompanyAsset[]> {
  try {
    const { data, error } = await supabase
      .from("company_assets")
      .select(`
        *,
        assigned_user:assigned_to (
          id,
          name,
          email,
          profile_photo,
          job_title,
          department
        )
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      if (typeof window !== "undefined") {
        localStorage.setItem(
          `${LOCAL_STORAGE_KEY_PREFIX}${companyId}`,
          JSON.stringify(data)
        );
      }
      return data as CompanyAsset[];
    }
  } catch (err) {
    console.warn("Error fetching company assets from supabase:", err);
  }

  // Local storage fallback
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${companyId}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
  }

  return [];
}

/**
 * Create a new asset
 */
export async function createCompanyAsset(
  companyId: string,
  assetData: Partial<CompanyAsset>
): Promise<CompanyAsset> {
  const newAsset: Partial<CompanyAsset> = {
    ...assetData,
    company_id: companyId,
    status: assetData.assigned_to ? "assigned" : assetData.status || "available",
    condition: assetData.condition || "good",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from("company_assets")
      .insert(newAsset)
      .select(`
        *,
        assigned_user:assigned_to (
          id,
          name,
          email,
          profile_photo,
          job_title,
          department
        )
      `)
      .single();

    if (!error && data) {
      return data as CompanyAsset;
    }
  } catch (err) {
    console.warn("Supabase create asset error:", err);
  }

  // Fallback in-memory / local storage
  const created: CompanyAsset = {
    id: `local-ast-${Date.now()}`,
    company_id: companyId,
    asset_name: assetData.asset_name || "Asset",
    asset_type: assetData.asset_type || "Laptop",
    serial_number: assetData.serial_number || null,
    asset_code: assetData.asset_code || `AST-${Math.floor(100 + Math.random() * 900)}`,
    brand: assetData.brand || null,
    model: assetData.model || null,
    purchase_date: assetData.purchase_date || null,
    purchase_cost: assetData.purchase_cost || null,
    warranty_expiry: assetData.warranty_expiry || null,
    status: assetData.assigned_to ? "assigned" : assetData.status || "available",
    condition: assetData.condition || "good",
    assigned_to: assetData.assigned_to || null,
    assigned_at: assetData.assigned_to ? new Date().toISOString() : null,
    assigned_by: assetData.assigned_by || null,
    image_url: assetData.image_url || null,
    notes: assetData.notes || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    const existing = await getCompanyAssets(companyId);
    const updated = [created, ...existing];
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_PREFIX}${companyId}`,
      JSON.stringify(updated)
    );
  }

  return created;
}

/**
 * Update an existing asset
 */
export async function updateCompanyAsset(
  assetId: string,
  companyId: string,
  updates: Partial<CompanyAsset>
): Promise<CompanyAsset | null> {
  const updatePayload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from("company_assets")
      .update(updatePayload)
      .eq("id", assetId)
      .select(`
        *,
        assigned_user:assigned_to (
          id,
          name,
          email,
          profile_photo,
          job_title,
          department
        )
      `)
      .single();

    if (!error && data) {
      return data as CompanyAsset;
    }
  } catch (err) {
    console.warn("Supabase update asset error:", err);
  }

  // Local fallback
  if (typeof window !== "undefined") {
    const existing = await getCompanyAssets(companyId);
    const updated = existing.map((a) => (a.id === assetId ? { ...a, ...updatePayload } : a));
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_PREFIX}${companyId}`,
      JSON.stringify(updated)
    );
    return updated.find((a) => a.id === assetId) || null;
  }

  return null;
}

/**
 * Assign an asset to an employee
 */
export async function assignAssetToEmployee(
  assetId: string,
  companyId: string,
  employeeId: string,
  assignedByUserId: string,
  condition: AssetCondition = "good",
  notes?: string
): Promise<boolean> {
  const now = new Date().toISOString();

  try {
    // 1. Update asset table
    await supabase
      .from("company_assets")
      .update({
        assigned_to: employeeId,
        assigned_at: now,
        assigned_by: assignedByUserId,
        status: "assigned",
        condition,
        updated_at: now,
      })
      .eq("id", assetId);

    // 2. Insert assignment history
    await supabase.from("asset_assignment_history").insert({
      asset_id: assetId,
      company_id: companyId,
      employee_id: employeeId,
      assigned_at: now,
      condition_on_assign: condition,
      performed_by: assignedByUserId,
      notes: notes || null,
    });

    return true;
  } catch (err) {
    console.warn("Supabase assign asset error:", err);
  }

  // Local fallback
  if (typeof window !== "undefined") {
    const existing = await getCompanyAssets(companyId);
    const updated = existing.map((a) =>
      a.id === assetId
        ? {
            ...a,
            assigned_to: employeeId,
            assigned_at: now,
            assigned_by: assignedByUserId,
            status: "assigned" as AssetStatus,
            condition,
          }
        : a
    );
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_PREFIX}${companyId}`,
      JSON.stringify(updated)
    );
  }

  return true;
}

/**
 * Return / Check-in an assigned asset
 */
export async function returnCompanyAsset(
  assetId: string,
  companyId: string,
  performedByUserId: string,
  returnCondition: AssetCondition = "good",
  returnNotes?: string
): Promise<boolean> {
  const now = new Date().toISOString();

  try {
    // 1. Get current asset to identify previous employee
    const { data: asset } = await supabase
      .from("company_assets")
      .select("assigned_to")
      .eq("id", assetId)
      .single();

    // 2. Update asset status to available (or maintenance/damaged if condition warrants)
    const newStatus: AssetStatus =
      returnCondition === "damaged" ? "maintenance" : "available";

    await supabase
      .from("company_assets")
      .update({
        assigned_to: null,
        assigned_at: null,
        assigned_by: null,
        status: newStatus,
        condition: returnCondition,
        updated_at: now,
      })
      .eq("id", assetId);

    // 3. Update active history log
    if (asset?.assigned_to) {
      await supabase
        .from("asset_assignment_history")
        .update({
          returned_at: now,
          condition_on_return: returnCondition,
          notes: returnNotes || null,
        })
        .eq("asset_id", assetId)
        .eq("employee_id", asset.assigned_to)
        .is("returned_at", null);
    }

    return true;
  } catch (err) {
    console.warn("Supabase return asset error:", err);
  }

  // Local fallback
  if (typeof window !== "undefined") {
    const existing = await getCompanyAssets(companyId);
    const updated = existing.map((a) =>
      a.id === assetId
        ? {
            ...a,
            assigned_to: null,
            assigned_at: null,
            assigned_by: null,
            status: (returnCondition === "damaged" ? "maintenance" : "available") as AssetStatus,
            condition: returnCondition,
          }
        : a
    );
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_PREFIX}${companyId}`,
      JSON.stringify(updated)
    );
  }

  return true;
}

/**
 * Fetch assets assigned to a specific employee
 */
export async function getEmployeeAssignedAssets(
  employeeId: string,
  companyId?: string
): Promise<CompanyAsset[]> {
  try {
    let query = supabase
      .from("company_assets")
      .select("*")
      .eq("assigned_to", employeeId);

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query;
    if (!error && data) {
      return data as CompanyAsset[];
    }
  } catch (err) {
    console.warn("Supabase getEmployeeAssignedAssets error:", err);
  }

  // Local fallback
  if (typeof window !== "undefined" && companyId) {
    const all = await getCompanyAssets(companyId);
    return all.filter((a) => a.assigned_to === employeeId);
  }

  return [];
}

/**
 * Fetch assignment history for an asset
 */
export async function getAssetAssignmentHistory(
  assetId: string
): Promise<AssetAssignmentHistory[]> {
  try {
    const { data, error } = await supabase
      .from("asset_assignment_history")
      .select(`
        *,
        employee:employee_id (
          id,
          name,
          email,
          profile_photo
        )
      `)
      .eq("asset_id", assetId)
      .order("assigned_at", { ascending: false });

    if (!error && data) {
      return data as AssetAssignmentHistory[];
    }
  } catch (err) {
    console.warn("Supabase getAssetAssignmentHistory error:", err);
  }

  return [];
}

/**
 * Delete an asset
 */
export async function deleteCompanyAsset(
  assetId: string,
  companyId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("company_assets")
      .delete()
      .eq("id", assetId);

    if (!error) {
      return true;
    }
  } catch (err) {
    console.warn("Supabase delete asset error:", err);
  }

  if (typeof window !== "undefined") {
    const existing = await getCompanyAssets(companyId);
    const filtered = existing.filter((a) => a.id !== assetId);
    localStorage.setItem(
      `${LOCAL_STORAGE_KEY_PREFIX}${companyId}`,
      JSON.stringify(filtered)
    );
  }

  return true;
}

// ==========================================
// ASSET REQUESTS WORKFLOW
// ==========================================

export type RequestPriority = "low" | "medium" | "high" | "urgent";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface AssetRequest {
  id: string;
  company_id: string;
  employee_id: string;
  asset_type: AssetType;
  reason: string;
  priority: RequestPriority;
  status: RequestStatus;
  rejection_reason: string | null;
  assigned_asset_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined relation
  employee?: {
    id: string;
    name: string;
    email: string;
    profile_photo: string | null;
    job_title: string | null;
    department: string | null;
  } | null;
  assigned_asset?: CompanyAsset | null;
}

const LOCAL_STORAGE_REQUESTS_PREFIX = "capoasis_asset_requests_";

export async function createAssetRequest(params: {
  company_id: string;
  employee_id: string;
  asset_type: AssetType;
  reason: string;
  priority?: RequestPriority;
}): Promise<AssetRequest> {
  const newReq: AssetRequest = {
    id: crypto.randomUUID(),
    company_id: params.company_id,
    employee_id: params.employee_id,
    asset_type: params.asset_type,
    reason: params.reason,
    priority: params.priority || "medium",
    status: "pending",
    rejection_reason: null,
    assigned_asset_id: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from("asset_requests")
      .insert([
        {
          company_id: params.company_id,
          employee_id: params.employee_id,
          asset_type: params.asset_type,
          reason: params.reason,
          priority: params.priority || "medium",
          status: "pending",
        },
      ])
      .select(`
        *,
        employee:profiles!asset_requests_employee_id_fkey(
          id,
          name,
          email,
          profile_photo,
          job_title,
          department
        )
      `)
      .single();

    if (!error && data) {
      return data as AssetRequest;
    }
  } catch (err) {
    console.warn("Supabase createAssetRequest error:", err);
  }

  // Local fallback
  if (typeof window !== "undefined") {
    const key = `${LOCAL_STORAGE_REQUESTS_PREFIX}${params.company_id}`;
    const raw = localStorage.getItem(key);
    const list: AssetRequest[] = raw ? JSON.parse(raw) : [];
    list.unshift(newReq);
    localStorage.setItem(key, JSON.stringify(list));
  }

  return newReq;
}

export async function getCompanyAssetRequests(
  companyId: string
): Promise<AssetRequest[]> {
  try {
    const { data, error } = await supabase
      .from("asset_requests")
      .select(`
        *,
        employee:profiles!asset_requests_employee_id_fkey(
          id,
          name,
          email,
          profile_photo,
          job_title,
          department
        ),
        assigned_asset:company_assets!asset_requests_assigned_asset_id_fkey(
          id,
          asset_name,
          asset_code,
          serial_number,
          brand,
          model
        )
      `)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      return data as AssetRequest[];
    }
  } catch (err) {
    console.warn("Supabase getCompanyAssetRequests error:", err);
  }

  if (typeof window !== "undefined") {
    const key = `${LOCAL_STORAGE_REQUESTS_PREFIX}${companyId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      return JSON.parse(raw);
    }
  }

  return [];
}

export async function getEmployeeAssetRequests(
  employeeId: string,
  companyId: string
): Promise<AssetRequest[]> {
  try {
    const { data, error } = await supabase
      .from("asset_requests")
      .select(`
        *,
        assigned_asset:company_assets!asset_requests_assigned_asset_id_fkey(
          id,
          asset_name,
          asset_code,
          serial_number,
          brand,
          model
        )
      `)
      .eq("employee_id", employeeId)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      return data as AssetRequest[];
    }
  } catch (err) {
    console.warn("Supabase getEmployeeAssetRequests error:", err);
  }

  if (typeof window !== "undefined") {
    const key = `${LOCAL_STORAGE_REQUESTS_PREFIX}${companyId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const list: AssetRequest[] = JSON.parse(raw);
      return list.filter((r) => r.employee_id === employeeId);
    }
  }

  return [];
}

export async function approveAssetRequest(params: {
  requestId: string;
  companyId: string;
  assignedAssetId: string;
  employeeId: string;
  reviewerId: string;
  condition?: AssetCondition;
}): Promise<boolean> {
  // 1. Assign the asset to employee
  await assignAssetToEmployee(
    params.assignedAssetId,
    params.companyId,
    params.employeeId,
    params.reviewerId,
    params.condition || "good",
    `Assigned via approved request #${params.requestId.slice(0, 8)}`
  );

  // 2. Update request status to approved
  try {
    const { error } = await supabase
      .from("asset_requests")
      .update({
        status: "approved",
        assigned_asset_id: params.assignedAssetId,
        reviewed_by: params.reviewerId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.requestId);

    if (!error) return true;
  } catch (err) {
    console.warn("Supabase approveAssetRequest error:", err);
  }

  // Local fallback
  if (typeof window !== "undefined") {
    const key = `${LOCAL_STORAGE_REQUESTS_PREFIX}${params.companyId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const list: AssetRequest[] = JSON.parse(raw);
      const updated = list.map((r) =>
        r.id === params.requestId
          ? {
              ...r,
              status: "approved" as RequestStatus,
              assigned_asset_id: params.assignedAssetId,
              reviewed_by: params.reviewerId,
              reviewed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          : r
      );
      localStorage.setItem(key, JSON.stringify(updated));
    }
  }

  return true;
}

export async function rejectAssetRequest(params: {
  requestId: string;
  companyId: string;
  reviewerId: string;
  rejectionReason: string;
}): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("asset_requests")
      .update({
        status: "rejected",
        rejection_reason: params.rejectionReason,
        reviewed_by: params.reviewerId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.requestId);

    if (!error) return true;
  } catch (err) {
    console.warn("Supabase rejectAssetRequest error:", err);
  }

  // Local fallback
  if (typeof window !== "undefined") {
    const key = `${LOCAL_STORAGE_REQUESTS_PREFIX}${params.companyId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const list: AssetRequest[] = JSON.parse(raw);
      const updated = list.map((r) =>
        r.id === params.requestId
          ? {
              ...r,
              status: "rejected" as RequestStatus,
              rejection_reason: params.rejectionReason,
              reviewed_by: params.reviewerId,
              reviewed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          : r
      );
      localStorage.setItem(key, JSON.stringify(updated));
    }
  }

  return true;
}

