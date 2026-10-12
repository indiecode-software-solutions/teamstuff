// Attendance Geofence, Duration calculations and regular/overtime splits helpers.

export interface OfficeLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
}

export interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  total_minutes: number | null;
  status: string;
  office_location_id: string | null;
  notes: string | null;
}

/**
 * Calculates distance between two coordinates in meters using the Haversine formula
 */
export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Checks if user coordinate is within configured company office locations
 */
export function verifyGeofence(
  lat: number,
  lng: number,
  offices: OfficeLocation[]
): OfficeLocation | null {
  for (const office of offices) {
    const dist = getDistanceMeters(lat, lng, office.latitude, office.longitude);
    if (dist <= office.radius_meters) {
      return office;
    }
  }
  return null;
}

/**
 * Parse notes field containing serialized regularization data.
 * New Format:  "REGULARIZATION_STATUS:TYPE:TIME_OR_EMPTY:REASON"
 * Old Format:  "REGULARIZATION_STATUS:TIME:REASON"  (backward compat)
 *
 * Types: MISSING_CHECKOUT | LATE_ARRIVAL | EARLY_DEPARTURE
 */
export type RegularizationType = "MISSING_CHECKOUT" | "LATE_ARRIVAL" | "EARLY_DEPARTURE";

export const REGULARIZATION_TYPES: { value: RegularizationType; label: string; hasTime: boolean; description: string }[] = [
  {
    value: "MISSING_CHECKOUT",
    label: "Missing Clock-Out",
    hasTime: true,
    description: "Forgot to clock out — provide your actual departure time"
  },
  {
    value: "LATE_ARRIVAL",
    label: "Late Arrival",
    hasTime: false,
    description: "Arrived late due to a valid reason (meeting, travel, etc.)"
  },
  {
    value: "EARLY_DEPARTURE",
    label: "Early Departure",
    hasTime: true,
    description: "Left early for a valid reason — provide your actual departure time"
  },
];

export function parseNotesRegularization(notes: string | null): {
  regStatus: "NOT_STARTED" | "REGULARIZATION_PENDING" | "REGULARIZATION_APPROVED" | "REGULARIZATION_REJECTED" | null;
  regType: RegularizationType | null;
  regTime: string | null;
  regReason: string | null;
} {
  if (!notes || !notes.startsWith("REGULARIZATION_")) {
    return { regStatus: null, regType: null, regTime: null, regReason: null };
  }

  const parts = notes.split(":");
  const status = parts[0] as any;

  // Detect new format: second segment is a known TYPE keyword
  const knownTypes: RegularizationType[] = ["MISSING_CHECKOUT", "LATE_ARRIVAL", "EARLY_DEPARTURE"];
  if (knownTypes.includes(parts[1] as RegularizationType)) {
    // New format: STATUS:TYPE:TIME(3 parts):REASON
    const regType = parts[1] as RegularizationType;
    // TIME may be empty string for LATE_ARRIVAL
    const timePart = parts.slice(2, 5).join(":");
    const reason = parts.slice(5).join(":");
    return {
      regStatus: status,
      regType,
      regTime: timePart || null,
      regReason: reason || null
    };
  }

  // Legacy format: STATUS:TIME(3 parts):REASON
  const time = parts.slice(1, 4).join(":");
  const reason = parts.slice(4).join(":");
  return { regStatus: status, regType: "MISSING_CHECKOUT", regTime: time || null, regReason: reason || null };
}

/**
 * Evaluates internal attendance status.
 */
export function getInternalState(record: AttendanceRecord | null): string {
  if (!record || !record.clock_in) return "NOT_STARTED";
  
  const notesInfo = parseNotesRegularization(record.notes);
  if (notesInfo.regStatus) {
    return notesInfo.regStatus; // REGULARIZATION_PENDING, REGULARIZATION_APPROVED, REGULARIZATION_REJECTED
  }

  // If clock out exists, it is complete
  if (record.clock_out) {
    return "COMPLETED";
  }

  // Check if we are currently working on a previous calendar day (Forgotten Clockout)
  const todayStr = new Date().toISOString().split("T")[0];
  if (record.date !== todayStr) {
    return "CHECKOUT_MISSING";
  }

  // Check if current shift-end boundary is exceeded to declare OVERTIME
  return "WORKING";
}

/**
 * Human readable status mapping for User Interface
 */
export function getUIStatusLabel(state: string, originalStatus: string): string {
  switch (state) {
    case "NOT_STARTED":
      return "Not Started";
    case "WORKING":
      return "Working";
    case "OVERTIME":
      return "Overtime";
    case "COMPLETED":
      return originalStatus === "late" ? "Late" : originalStatus === "half_day" ? "Half Day" : "Completed";
    case "CHECKOUT_MISSING":
      return "Checkout Missing";
    case "REGULARIZATION_PENDING":
      return "Awaiting Approval";
    case "REGULARIZATION_APPROVED":
      return "Completed";
    case "REGULARIZATION_REJECTED":
      return "Rejected";
    default:
      return originalStatus || "Unknown";
  }
}

/**
 * Helper to calculate workday schedule endpoints and check if shift has ended.
 * Returns start and end Date objects for today's shift.
 */
export function getShiftStartEndDates(
  startTimeStr: string | null | undefined, // format: "09:30"
  endTimeStr: string | null | undefined, // format: "18:30"
  dateStr?: string
): { shiftStart: Date; shiftEnd: Date } {
  const baseDate = dateStr ? new Date(dateStr) : new Date();
  const startParts = (startTimeStr || "09:30").split(":");
  const endParts = (endTimeStr || "18:30").split(":");

  const shiftStart = new Date(baseDate);
  shiftStart.setHours(parseInt(startParts[0] || "9", 10), parseInt(startParts[1] || "30", 10), 0, 0);

  const shiftEnd = new Date(baseDate);
  shiftEnd.setHours(parseInt(endParts[0] || "18", 10), parseInt(endParts[1] || "30", 10), 0, 0);

  return { shiftStart, shiftEnd };
}

/**
 * Evaluates whether a punch is late based on configurable work start time and grace minutes.
 */
export function calculateIsLate(
  clockInDate: Date = new Date(),
  shiftStartTimeStr?: string | null,
  graceMinutes?: number | null
): {
  isLate: boolean;
  shiftStartTimeFormatted: string;
  allowedUntilFormatted: string;
  graceMinutes: number;
  lateByMinutes: number;
} {
  const rawStart = shiftStartTimeStr && shiftStartTimeStr.includes(":") ? shiftStartTimeStr : "09:30";
  const effectiveGrace = typeof graceMinutes === "number" && !isNaN(graceMinutes) && graceMinutes >= 0 ? graceMinutes : 10;
  const [startH, startM] = rawStart.split(":").map(Number);

  const limit = new Date(clockInDate);
  limit.setHours(startH || 9, (startM || 30) + effectiveGrace, 0, 0);

  const isLate = clockInDate.getTime() > limit.getTime();
  const lateByMinutes = isLate ? Math.max(1, Math.floor((clockInDate.getTime() - limit.getTime()) / 60000)) : 0;

  const formatHAndM = (h: number, m: number) => {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  return {
    isLate,
    shiftStartTimeFormatted: formatHAndM(startH || 9, startM || 30),
    allowedUntilFormatted: formatHAndM(startH || 9, (startM || 30) + effectiveGrace),
    graceMinutes: effectiveGrace,
    lateByMinutes,
  };
}
