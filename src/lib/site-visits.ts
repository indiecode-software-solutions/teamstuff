import { supabase } from "./supabase";
import { getCurrentCoordinates } from "./geolocation";
import { createServerFn } from "@tanstack/react-start";
import crypto from "crypto";

export type TravelModeKey = "two_wheeler" | "four_wheeler" | "public_transport" | "walking" | "other";

export interface TravelModeConfig {
  id: TravelModeKey;
  label: string;
  defaultRate: number;
}

export const TRAVEL_MODES: TravelModeConfig[] = [
  { id: "two_wheeler", label: "Bike / 2-Wheeler", defaultRate: 6.0 },
  { id: "four_wheeler", label: "Car / 4-Wheeler", defaultRate: 12.0 },
  { id: "public_transport", label: "Public Transport / Cab", defaultRate: 0.0 },
  { id: "walking", label: "Walking / Nearby", defaultRate: 0.0 },
];

export interface FieldVisit {
  id: string;
  company_id: string;
  user_id: string;
  client_name: string;
  purpose?: string | null;
  status: "in_progress" | "completed" | "cancelled";
  
  // Start visit
  start_time: string;
  start_lat: number;
  start_lng: number;
  start_address?: string | null;

  // End visit
  end_time?: string | null;
  end_lat?: number | null;
  end_lng?: number | null;
  end_address?: string | null;
  end_photo_url?: string | null;

  // Optional extended tracking fields
  check_in_time?: string;
  check_in_lat?: number;
  check_in_lng?: number;
  check_in_address?: string | null;
  check_in_photo_url?: string | null;
  check_out_time?: string | null;
  check_out_lat?: number | null;
  check_out_lng?: number | null;
  check_out_address?: string | null;
  check_out_photo_url?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  origin_label?: string | null;
  client_address?: string | null;
  odometer_start_km?: number | null;
  odometer_end_km?: number | null;
  travel_mode?: TravelModeKey | string;
  rate_per_km?: number;
  calculated_distance_km?: number;
  reimbursement_amount?: number;
  notes?: string | null;
  outcome_summary?: string | null;

  // Metadata / joins
  employee_name?: string | null;
  employee_role?: string | null;
  employee_avatar?: string | null;
  created_at: string;
  updated_at?: string;
}

// Alias for backward compatibility
export type SiteVisit = FieldVisit;

/**
 * Calculates distance between two coordinates in km using the Haversine formula.
 */
export function calculateGeodesicDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Math.round(distance * 100) / 100;
}

/**
 * Reverse geocode to a precise, human-readable location address including building/landmark, street, locality, and city.
 */
export async function reverseGeocodeCoords(lat: number, lng: number): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          "User-Agent": "Teamstuff-SiteVisitTracker/1.0",
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);
    if (!res.ok) throw new Error("Reverse geocode failed");
    const json = await res.json();
    if (json.address) {
      const addr = json.address;
      
      // Collect precise elements in descending order of specificity
      const specificPoint = addr.building || addr.amenity || addr.shop || addr.office || addr.commercial || addr.house_name || addr.house_number;
      const road = addr.road || addr.street || addr.pedestrian || addr.footway;
      const subArea = addr.suburb || addr.neighbourhood || addr.residential || addr.subdistrict || addr.quarter;
      const city = addr.city || addr.town || addr.municipality || addr.county || addr.district;
      const postalCode = addr.postcode;

      const orderedParts = [
        specificPoint,
        road,
        subArea,
        city,
        postalCode ? `${postalCode}` : undefined,
      ].filter(Boolean);

      // Deduplicate consecutive or identical segments
      const uniqueParts = orderedParts.filter((item, index, self) => item && self.indexOf(item) === index);

      if (uniqueParts.length > 0) {
        return uniqueParts.join(", ");
      }
    }
    
    if (json.display_name) {
      const segments = json.display_name.split(",").map((s: string) => s.trim()).filter(Boolean);
      return segments.slice(0, 4).join(", ");
    }
    
    return `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
  } catch {
    return `Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}`;
  }
}

/**
 * Server function to securely upload site visit photos to Cloudinary
 */
export const uploadVisitPhoto = createServerFn({ method: "POST" })
  .validator((d: { base64Data: string; companyId: string; userId: string; visitId?: string }) => d)
  .handler(async ({ data }) => {
    const { base64Data, companyId, userId, visitId } = data;
    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = `Intranet/companies/${companyId}/users/${userId}/site_visits`;
    const apiSecret = "TqdPN3VMRk_eQbUjnC1mz-4MwI0";
    const apiKey = "122886755481348";
    const cloudName = "dfqyaawjv";

    // Sort parameters alphabetically to sign
    const signatureStr = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash("sha1").update(signatureStr).digest("hex");

    const formData = new FormData();
    formData.append("file", base64Data);
    formData.append("api_key", apiKey);
    formData.append("timestamp", timestamp.toString());
    formData.append("signature", signature);
    formData.append("folder", folder);

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const resData = await response.json();
      if (resData.secure_url) {
        return { success: true, url: resData.secure_url };
      }
      return { success: false, error: resData.error?.message || "Upload failed" };
    } catch (e: any) {
      console.error("Cloudinary upload failed for site visit:", e);
      return { success: false, error: e.message || "Failed to upload photo" };
    }
  });

/**
 * Returns raw image data url for clean photo storage without burnt overlay
 */
export function stampWatermarkOnPhoto(
  imageDataUrl: string,
  _metadata: {
    clientName: string;
    lat: number;
    lng: number;
    addressText: string;
    timestamp: Date;
    userName?: string;
  }
): Promise<string> {
  return Promise.resolve(imageDataUrl);
}
