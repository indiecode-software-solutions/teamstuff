import React, { useState, useEffect, useRef, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import Layout from "../components/Layout";
import { OfflineScreen } from "../components/OfflineScreen";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Clock,
  MapPin,
  MapPinOff,
  CheckCircle2,
  Circle,
  History,
  AlertTriangle,
  Crosshair,
  Fingerprint,
  Calendar,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { type AttendanceMethod } from "../lib/essl";
import {
  OfficeLocation,
  AttendanceRecord,
  verifyGeofence,
  parseNotesRegularization,
  getInternalState,
  getUIStatusLabel,
  getShiftStartEndDates,
  calculateIsLate,
  REGULARIZATION_TYPES,
  RegularizationType,
} from "../lib/attendance-helpers";
import { getCurrentCoordinates } from "../lib/geolocation";

export const Route = createFileRoute("/attendance")({
  head: () => ({
    title: "CapOasis | Attendance",
    meta: [{ name: "description", content: "Track your daily attendance with GPS verification." }],
  }),
  component: AttendancePage,
});

function formatTime(isoStr: string | null): string {
  if (!isoStr) return "—";
  return new Date(isoStr).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatDuration(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn || !clockOut) return "—";
  const start = new Date(clockIn).getTime();
  const end = new Date(clockOut).getTime();
  const diffSec = Math.floor((end - start) / 1000);
  if (diffSec <= 0) return "00:00:00";

  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function StatusChip({
  status,
  recordNotes,
  clockIn,
  clockOut,
  date,
}: {
  status: string;
  recordNotes: string | null;
  clockIn: string | null;
  clockOut: string | null;
  date?: string | undefined;
}) {
  const state = getInternalState({
    status,
    notes: recordNotes,
    clock_in: clockIn,
    clock_out: clockOut,
    date: date || "",
  } as any);
  const label = getUIStatusLabel(state, status);

  const stateClassMap: Record<string, string> = {
    NOT_STARTED: "attendance-status-chip",
    WORKING: "attendance-status-chip working",
    OVERTIME: "attendance-status-chip overtime",
    COMPLETED: "attendance-status-chip present",
    CHECKOUT_MISSING: "attendance-status-chip pending",
    REGULARIZATION_PENDING: "attendance-status-chip pending",
    REGULARIZATION_APPROVED: "attendance-status-chip present",
    REGULARIZATION_REJECTED: "attendance-status-chip absent",
  };

  const chipClass = stateClassMap[state] || "attendance-status-chip";
  const chipLabel =
    state === "NOT_STARTED" ? "Not Started" :
    state === "WORKING" ? "Working" :
    state === "OVERTIME" ? "Overtime" :
    state === "COMPLETED" ? "Completed" :
    state === "CHECKOUT_MISSING" ? "Checkout Missing" :
    state === "REGULARIZATION_PENDING" ? "Awaiting Approval" :
    state === "REGULARIZATION_APPROVED" ? "Completed" :
    state === "REGULARIZATION_REJECTED" ? "Rejected" :
    label;

  return (
    <span className={chipClass}>
      {state === "WORKING" && (
        <span className="attendance-status-chip-dot" />
      )}
      {chipLabel}
    </span>
  );
}

function AttendancePage() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [officeLocations, setOfficeLocations] = useState<OfficeLocation[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<string>("00:00:00");
  const [overtimeElapsed, setOvertimeElapsed] = useState<string>("00:00:00");
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? navigator.onLine : true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [userProfile, setUserProfile] = useState<any>(null);
  const [attendanceMethod, setAttendanceMethod] = useState<AttendanceMethod>("gps");

  const [showShiftEndPrompt, setShowShiftEndPrompt] = useState(false);
  const [showRegularizeDialog, setShowRegularizeDialog] = useState(false);
  const [regTypeInput, setRegTypeInput] = useState<RegularizationType | "">("");
  const [regTimeInput, setRegTimeInput] = useState("");
  const [regReasonInput, setRegReasonInput] = useState("");

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const currentNow = useRef(new Date()).current;
  const [selectedMonth, setSelectedMonth] = useState({
    year: currentNow.getFullYear(),
    month: currentNow.getMonth(),
  });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const initLoadedRef = useRef(false);

  async function loadMonthlyHistory(year: number, month: number, uid: string) {
    setHistoryLoading(true);
    try {
      const startStr = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const endStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const { data: hist } = await supabase
        .from("attendance")
        .select("*, source")
        .eq("user_id", uid)
        .gte("date", startStr)
        .lte("date", endStr)
        .order("date", { ascending: false });
      setHistory(hist || []);
    } catch (err) {
      console.error("Failed to load monthly attendance history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Load history when user manually navigates months (after initial load)
  useEffect(() => {
    if (!initLoadedRef.current || !userId) return;
    loadMonthlyHistory(selectedMonth.year, selectedMonth.month, userId);
  }, [selectedMonth.year, selectedMonth.month]);

  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(currentNow.getFullYear(), currentNow.getMonth() - i, 1);
      opts.push({
        year: d.getFullYear(),
        month: d.getMonth(),
        label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        value: `${d.getFullYear()}-${d.getMonth()}`,
      });
    }
    return opts;
  }, [currentNow]);

  const selectedMonthLabel = new Date(selectedMonth.year, selectedMonth.month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const isCurrentMonth =
    selectedMonth.year === currentNow.getFullYear() && selectedMonth.month === currentNow.getMonth();

  function handlePrevMonth() {
    setSelectedMonth((prev) => {
      if (prev.month === 0) return { year: prev.year - 1, month: 11 };
      return { year: prev.year, month: prev.month - 1 };
    });
  }

  function handleNextMonth() {
    setSelectedMonth((prev) => {
      if (prev.year === currentNow.getFullYear() && prev.month === currentNow.getMonth()) {
        return prev;
      }
      if (prev.month === 11) return { year: prev.year + 1, month: 0 };
      return { year: prev.year, month: prev.month + 1 };
    });
  }

  function handleResetToThisMonth() {
    setSelectedMonth({
      year: currentNow.getFullYear(),
      month: currentNow.getMonth(),
    });
  }

  const monthlyStats = useMemo(() => {
    let totalSec = 0;
    let completedCount = 0;
    let missingCount = 0;

    history.forEach((rec) => {
      const notesDetails = parseNotesRegularization(rec.notes);
      const clockOut =
        notesDetails.regStatus === "REGULARIZATION_APPROVED" ? notesDetails.regTime : rec.clock_out;
      if (rec.clock_in && clockOut) {
        const inTime = new Date(rec.clock_in).getTime();
        const outTime = new Date(clockOut).getTime();
        const diff = Math.max(0, Math.floor((outTime - inTime) / 1000));
        totalSec += diff;
        completedCount++;
      } else if (rec.clock_in && !clockOut) {
        missingCount++;
      }
    });

    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);

    return {
      daysCount: history.length,
      totalHoursStr: `${hours}h ${mins}m`,
      completedCount,
      missingCount,
    };
  }, [history]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => {
      setIsOnline(true);
      initAttendance();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (initLoadedRef.current) return;
    initLoadedRef.current = true;
    initAttendance();
  }, []);

  async function initAttendance() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const probe = await fetch("/favicon.png?_=" + Date.now(), {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!probe.ok) {
        setIsOnline(false);
        setLoading(false);
        return;
      }
    } catch {
      setIsOnline(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const startStr = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(selectedMonth.year, selectedMonth.month + 1, 0).getDate();
      const endStr = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const [profileRes, officesRes, todayRes, historyRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("company_id, work_start_time, work_end_time, shift_id")
          .eq("id", user.id)
          .single(),
        supabase.from("office_locations").select("*").eq("is_active", true),
        supabase
          .from("attendance")
          .select("*")
          .eq("user_id", user.id)
          .eq("date", todayStr)
          .maybeSingle(),
        supabase
          .from("attendance")
          .select("*, source")
          .eq("user_id", user.id)
          .gte("date", startStr)
          .lte("date", endStr)
          .order("date", { ascending: false }),
      ]);

      let effectiveStart = profileRes.data?.work_start_time;
      let effectiveEnd = profileRes.data?.work_end_time;
      let effectiveGrace = 10;
      if (profileRes.data?.company_id) {
        const { data: comp } = await supabase
          .from("companies")
          .select("default_work_start_time, default_work_end_time, late_grace_minutes, late_mark_policy_id, attendance_method")
          .eq("id", profileRes.data.company_id)
          .single();
        if (comp) {
          effectiveStart = effectiveStart || comp.default_work_start_time || "09:30";
          effectiveEnd = effectiveEnd || comp.default_work_end_time || "18:30";
          effectiveGrace = typeof (comp as any).late_grace_minutes === "number" ? (comp as any).late_grace_minutes : 10;
          setAttendanceMethod((comp.attendance_method as AttendanceMethod) || "gps");
        }
      }

      if (profileRes.data?.shift_id) {
        const { data: shiftRow } = await supabase
          .from("shifts")
          .select("start_time, end_time, late_mark_policy_id, late_mark_policies:late_mark_policy_id(grace_minutes)")
          .eq("id", profileRes.data.shift_id)
          .maybeSingle();
        if (shiftRow) {
          if (shiftRow.start_time) effectiveStart = shiftRow.start_time;
          if (shiftRow.end_time) effectiveEnd = shiftRow.end_time;
          const shiftGrace = (shiftRow as any)?.late_mark_policies?.grace_minutes;
          if (typeof shiftGrace === "number") effectiveGrace = shiftGrace;
        }
      }

      setUserProfile(
        profileRes.data
          ? {
              ...profileRes.data,
              work_start_time: effectiveStart || "09:30",
              work_end_time: effectiveEnd || "18:30",
              late_grace_minutes: effectiveGrace,
            }
          : null,
      );

      if (officesRes.data && profileRes.data?.company_id) {
        setOfficeLocations(
          officesRes.data.filter((o) => o.company_id === profileRes.data.company_id),
        );
      } else {
        setOfficeLocations(officesRes.data || []);
      }

      setTodayRecord(todayRes.data || null);
      setHistory(historyRes.data || []);
    } catch (err: any) {
      console.error("Attendance init error:", err);
      setIsOnline(false);
    } finally {
      setLoading(false);
    }
  }

  const loadData = initAttendance;

  const internalState = getInternalState(todayRecord);

  useEffect(() => {
    if (
      todayRecord?.clock_in &&
      !todayRecord?.clock_out &&
      internalState !== "CHECKOUT_MISSING" &&
      !internalState.startsWith("REGULARIZATION_")
    ) {
      const startTime = new Date(todayRecord.clock_in).getTime();
      const { shiftEnd } = getShiftStartEndDates(
        userProfile?.work_start_time,
        userProfile?.work_end_time,
      );

      timerRef.current = setInterval(() => {
        const now = Date.now();
        const diffSec = Math.floor((now - startTime) / 1000);
        if (diffSec <= 0) return;

        const h = Math.floor(diffSec / 3600);
        const m = Math.floor((diffSec % 3600) / 60);
        const s = diffSec % 60;
        setElapsed(
          `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
        );

        if (now > shiftEnd.getTime()) {
          if (todayRecord.status !== "OVERTIME" && !showShiftEndPrompt && !todayRecord.clock_out) {
            setShowShiftEndPrompt(true);
          }

          const otDiffSec = Math.floor((now - shiftEnd.getTime()) / 1000);
          if (otDiffSec > 0) {
            const oth = Math.floor(otDiffSec / 3600);
            const otm = Math.floor((otDiffSec % 3600) / 60);
            const ots = otDiffSec % 60;
            setOvertimeElapsed(
              `${String(oth).padStart(2, "0")}:${String(otm).padStart(2, "0")}:${String(ots).padStart(2, "0")}`,
            );
          }
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [todayRecord, userProfile, internalState, showShiftEndPrompt]);

  async function handlePunch(type: "in" | "out") {
    setGpsError(null);
    setActionLoading(true);

    if (officeLocations.length === 0) {
      setGpsError("No office location configured for your company. Please contact your HR admin.");
      setActionLoading(false);
      return;
    }

    try {
      const { latitude, longitude } = await getCurrentCoordinates();

      const matchedOffice = verifyGeofence(latitude, longitude, officeLocations);

      if (!matchedOffice) {
        setGpsError(
          type === "in"
            ? "You are outside the permitted attendance location."
            : "You must be within the permitted attendance location to clock out.",
        );
        setActionLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user!.id)
        .single();

      if (type === "in") {
        const { data } = await supabase
          .from("attendance")
          .upsert(
            {
              user_id: user!.id,
              company_id: profile!.company_id,
              office_location_id: matchedOffice.id,
              date: todayStr,
              clock_in: new Date().toISOString(),
              latitude_in: latitude,
              longitude_in: longitude,
              status: isLate() ? "late" : "present",
            },
            { onConflict: "user_id,date" },
          )
          .select()
          .single();
        setTodayRecord(data);
      } else {
        const now = new Date();
        const clockInTime = new Date(todayRecord!.clock_in!);
        const totalMinutes = Math.floor((now.getTime() - clockInTime.getTime()) / 60000);

        let calculatedStatus = todayRecord!.status || "present";
        if (totalMinutes < 240) {
          calculatedStatus = "half_day";
        }

        const { data } = await supabase
          .from("attendance")
          .update({
            clock_out: now.toISOString(),
            total_minutes: totalMinutes,
            latitude_out: latitude,
            longitude_out: longitude,
            status: calculatedStatus,
          })
          .eq("user_id", user!.id)
          .eq("date", todayStr)
          .select()
          .single();
        setTodayRecord(data);
        if (userId) {
          await loadMonthlyHistory(selectedMonth.year, selectedMonth.month, userId);
        }
      }
    } catch (err: any) {
      console.error("GPS punch error:", err);
      if (err.message && err.message.toLowerCase().includes("denied")) {
        setGpsError("Location access was denied. Please allow location permission and try again.");
      } else {
        setGpsError(err.message || "Failed to record attendance.");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleContinueWorking() {
    setShowShiftEndPrompt(false);
    try {
      const { data } = await supabase
        .from("attendance")
        .update({ status: "OVERTIME" })
        .eq("user_id", todayRecord!.user_id)
        .eq("date", todayStr)
        .select()
        .single();
      setTodayRecord(data);
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSubmitRegularize() {
    if (!regTypeInput || !regReasonInput.trim()) return;
    const selectedRegType = REGULARIZATION_TYPES.find((t) => t.value === regTypeInput)!;
    if (selectedRegType.hasTime && !regTimeInput) return;

    setActionLoading(true);
    try {
      const targetDateStr = todayRecord ? todayRecord.date : todayStr;
      let timeISO = "";
      if (selectedRegType.hasTime && regTimeInput) {
        const parsedTime = new Date(`${targetDateStr}T${regTimeInput}:00`);
        timeISO = parsedTime.toISOString();
      }
      const serializedNotes = `REGULARIZATION_PENDING:${regTypeInput}:${timeISO}:${regReasonInput.replace(/:/g, " ")}`;

      const { data } = await supabase
        .from("attendance")
        .update({ notes: serializedNotes })
        .eq("id", todayRecord!.id)
        .select()
        .single();

      setTodayRecord(data);
      setShowRegularizeDialog(false);
      setRegTypeInput("");
      setRegTimeInput("");
      setRegReasonInput("");
      if (userId) {
        await loadMonthlyHistory(selectedMonth.year, selectedMonth.month, userId);
      }
    } catch (err: any) {
      setGpsError(err.message || "Failed to submit regularization.");
    } finally {
      setActionLoading(false);
    }
  }

  function isLate(): boolean {
    const res = calculateIsLate(
      new Date(),
      userProfile?.work_start_time,
      userProfile?.late_grace_minutes,
    );
    return res.isLate;
  }

  const isClockedIn = Boolean(todayRecord?.clock_in && !todayRecord?.clock_out);
  const isClockedOut = Boolean(todayRecord?.clock_out);

  return (
    <Layout activeTab="Attendance">
      <div className="attendance-page-container">
        {/* Page Header Date Badge */}
        <div className="attendance-page-header">
          <div className="attendance-date-badge">
            <Calendar className="attendance-date-badge-icon" />
            <span className="attendance-date-badge-text">
              {new Date().toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        {/* GPS Error Banner */}
        {gpsError && (
          <div className="attendance-error-banner">
            <div className="attendance-error-content">
              <MapPinOff className="attendance-error-icon" />
              <span>{gpsError}</span>
            </div>
            <button
              onClick={() => setGpsError(null)}
              className="attendance-error-close"
            >
              <X className="attendance-error-close-icon" />
            </button>
          </div>
        )}

        {!isOnline ? (
          <OfflineScreen
            onRetry={() => {
              setIsOnline(navigator.onLine);
              if (navigator.onLine) initAttendance();
            }}
            message="You are currently offline. CapOasis requires an active internet connection to load and log your attendance."
          />
        ) : (
          <>
            {/* Today's Status Card */}
            <div className="attendance-status-card">
              {/* Header banner */}
              <div className="attendance-status-header">
                <div className="attendance-presence-group">
                  <span className="attendance-presence-label">
                    Today's Presence
                  </span>
                  {loading ? (
                    <span
                      className="skeleton-shimmer"
                      style={{ width: "120px", height: "24px", display: "inline-block", borderRadius: "4px" }}
                    />
                  ) : (
                    <div className="attendance-presence-title-row">
                      <span className="attendance-presence-title">
                        {getUIStatusLabel(internalState, todayRecord?.status || "")}
                      </span>
                      <StatusChip
                        status={todayRecord?.status || ""}
                        recordNotes={todayRecord?.notes ?? null}
                        clockIn={todayRecord?.clock_in ?? null}
                        clockOut={todayRecord?.clock_out ?? null}
                        date={todayRecord?.date || todayStr}
                      />
                    </div>
                  )}
                </div>

                {/* Live Active Timer or Shift Duration */}
                <div className="attendance-timer-cluster">
                  {loading ? (
                    <div className="attendance-timer-item">
                      <span className="attendance-timer-label">Session</span>
                      <span
                        className="skeleton-shimmer"
                        style={{ width: "80px", height: "24px", display: "inline-block", borderRadius: "4px" }}
                      />
                    </div>
                  ) : (
                    <>
                      {isClockedIn && internalState !== "CHECKOUT_MISSING" && (
                        <div className="attendance-timer-group">
                          {todayRecord?.status === "OVERTIME" && (
                            <div className="attendance-timer-item">
                              <span className="attendance-timer-label">Overtime</span>
                              <span className="attendance-timer-value">{overtimeElapsed}</span>
                            </div>
                          )}
                          <div className="attendance-timer-item">
                            <span className="attendance-timer-label">Session Elapsed</span>
                            <span className="attendance-timer-value">{elapsed}</span>
                          </div>
                        </div>
                      )}

                      {isClockedOut && todayRecord?.clock_out && (
                        <div className="attendance-timer-item">
                          <span className="attendance-timer-label">Total Duration</span>
                          <span className="attendance-timer-value">
                            {formatDuration(todayRecord.clock_in, todayRecord.clock_out)}
                          </span>
                        </div>
                      )}

                      {internalState === "CHECKOUT_MISSING" && (
                        <div className="attendance-timer-item">
                          <span className="attendance-timer-label">Missing Checkout</span>
                          <span className="attendance-missing-action-text">Action required</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Card content: Stats & Actions */}
              <div className="attendance-status-body">
                <div className="attendance-action-row">
                  {/* Stat Metrics */}
                  <div className="attendance-stats-cluster">
                    {/* Clock In */}
                    <div className="attendance-stat-item">
                      <span className="attendance-presence-label">
                        Clock In
                      </span>
                      <div className="attendance-clock-time-row">
                        {todayRecord?.clock_in ? (
                          <CheckCircle2 className="attendance-clock-icon attendance-clock-icon--active" />
                        ) : (
                          <Circle className="attendance-clock-icon attendance-clock-icon--inactive" />
                        )}
                        {loading ? (
                          <span
                            className="skeleton-shimmer"
                            style={{ width: "64px", height: "18px", display: "inline-block", borderRadius: "4px" }}
                          />
                        ) : (
                          <span className={todayRecord?.clock_in ? "attendance-clock-value" : "attendance-clock-value attendance-clock-value--empty"}>
                            {formatTime(todayRecord?.clock_in ?? null)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="attendance-stat-divider" />

                    {/* Clock Out */}
                    <div className="attendance-stat-item">
                      <span className="attendance-presence-label">
                        Clock Out
                      </span>
                      <div className="attendance-clock-time-row">
                        {todayRecord?.clock_out ? (
                          <CheckCircle2 className="attendance-clock-icon attendance-clock-icon--active" />
                        ) : (
                          <Circle className="attendance-clock-icon attendance-clock-icon--inactive" />
                        )}
                        {loading ? (
                          <span
                            className="skeleton-shimmer"
                            style={{ width: "64px", height: "18px", display: "inline-block", borderRadius: "4px" }}
                          />
                        ) : (
                          <span className={todayRecord?.clock_out ? "attendance-clock-value" : "attendance-clock-value attendance-clock-value--empty"}>
                            {formatTime(todayRecord?.clock_out ?? null)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="attendance-stat-divider" />

                    {/* Shift Schedule */}
                    <div className="attendance-stat-item">
                      <span className="attendance-presence-label">
                        Shift Schedule
                      </span>
                      {loading ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span
                            className="skeleton-shimmer"
                            style={{ width: "160px", height: "16px", display: "inline-block", borderRadius: "4px" }}
                          />
                          <span
                            className="skeleton-shimmer"
                            style={{ width: "120px", height: "12px", display: "inline-block", borderRadius: "4px" }}
                          />
                        </div>
                      ) : (
                        <>
                          <p className="attendance-shift-name">
                            {userProfile?.work_shift?.name || "General Shift"} (
                            {userProfile?.work_start_time || "09:30"} – {userProfile?.work_end_time || "18:30"})
                          </p>
                          <p className="attendance-grace-note">
                            Late mark after{" "}
                            {
                              calculateIsLate(
                                new Date(),
                                userProfile?.work_start_time,
                                userProfile?.late_grace_minutes,
                              ).allowedUntilFormatted
                            }{" "}
                            ({userProfile?.late_grace_minutes ?? 10}m grace)
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action Area */}
                  <div className="attendance-action-btn-group">
                    {loading ? (
                      <span
                        className="skeleton-shimmer"
                        style={{ width: "110px", height: "38px", display: "inline-block", borderRadius: "6px" }}
                      />
                    ) : (
                      <>
                        {attendanceMethod === "biometric" &&
                          !isClockedIn &&
                          !isClockedOut &&
                          internalState !== "CHECKOUT_MISSING" &&
                          internalState !== "REGULARIZATION_PENDING" && (
                            <div className="attendance-verification-box">
                              <Fingerprint className="attendance-verif-icon" />
                              <span>Biometric attendance active. Please punch in at office device.</span>
                            </div>
                          )}

                        {!isClockedIn &&
                          !isClockedOut &&
                          internalState !== "CHECKOUT_MISSING" &&
                          internalState !== "REGULARIZATION_PENDING" &&
                          attendanceMethod !== "biometric" && (
                            <button
                              onClick={() => handlePunch("in")}
                              disabled={actionLoading}
                              title="GPS will verify you're within office range"
                              className="attendance-btn-primary"
                            >
                              {actionLoading ? (
                                <Loader2 className="attendance-btn-spinner" />
                              ) : (
                                <Crosshair className="attendance-btn-icon-sm" />
                              )}
                              <span>{actionLoading ? "Verifying GPS..." : "Clock In"}</span>
                            </button>
                          )}

                        {isClockedIn &&
                          internalState !== "CHECKOUT_MISSING" &&
                          attendanceMethod !== "biometric" && (
                            <button
                              onClick={() => handlePunch("out")}
                              disabled={actionLoading}
                              title="GPS will verify you're within office range"
                              className="attendance-btn-primary"
                            >
                              {actionLoading ? (
                                <Loader2 className="attendance-btn-spinner" />
                              ) : (
                                <Crosshair className="attendance-btn-icon-sm" />
                              )}
                              <span>{actionLoading ? "Verifying GPS..." : "Clock Out"}</span>
                            </button>
                          )}

                        {(internalState === "CHECKOUT_MISSING" ||
                          internalState === "REGULARIZATION_REJECTED") && (
                          <button
                            onClick={() => setShowRegularizeDialog(true)}
                            className="attendance-btn-secondary"
                          >
                            Regularize Attendance
                          </button>
                        )}

                        {internalState === "REGULARIZATION_PENDING" && (
                          <div className="attendance-verification-box">
                            <Clock className="attendance-verif-icon" />
                            <span>Approval Pending</span>
                          </div>
                        )}

                        {isClockedOut && !todayRecord?.notes?.startsWith("REGULARIZATION_") && (
                          <div className="attendance-verification-box">
                            <CheckCircle2 className="attendance-verif-icon" />
                            <span>Shift Completed</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly Summary Metrics: Fixed cards & icons, shimmer only for dynamic values */}
            <div className="attendance-metrics-grid">
              <div className="attendance-stat-card">
                <div className="attendance-stat-icon-box attendance-stat-icon-blue">
                  <CalendarCheck size={20} />
                </div>
                <div className="attendance-stat-content">
                  <span className="attendance-stat-label">Days Logged</span>
                  {loading || historyLoading ? (
                    <span
                      className="skeleton-shimmer"
                      style={{ width: "36px", height: "20px", display: "inline-block", borderRadius: "4px" }}
                    />
                  ) : (
                    <span className="attendance-stat-value">{monthlyStats.daysCount}</span>
                  )}
                </div>
              </div>

              <div className="attendance-stat-card">
                <div className="attendance-stat-icon-box attendance-stat-icon-purple">
                  <Clock size={20} />
                </div>
                <div className="attendance-stat-content">
                  <span className="attendance-stat-label">Total Work Hours</span>
                  {loading || historyLoading ? (
                    <span
                      className="skeleton-shimmer"
                      style={{ width: "56px", height: "20px", display: "inline-block", borderRadius: "4px" }}
                    />
                  ) : (
                    <span className="attendance-stat-value">{monthlyStats.totalHoursStr}</span>
                  )}
                </div>
              </div>

              <div className="attendance-stat-card">
                <div className="attendance-stat-icon-box attendance-stat-icon-emerald">
                  <CheckCircle2 size={20} />
                </div>
                <div className="attendance-stat-content">
                  <span className="attendance-stat-label">Completed Shifts</span>
                  {loading || historyLoading ? (
                    <span
                      className="skeleton-shimmer"
                      style={{ width: "36px", height: "20px", display: "inline-block", borderRadius: "4px" }}
                    />
                  ) : (
                    <span className="attendance-stat-value">{monthlyStats.completedCount}</span>
                  )}
                </div>
              </div>

              <div className="attendance-stat-card">
                <div className="attendance-stat-icon-box attendance-stat-icon-amber">
                  <AlertTriangle size={20} />
                </div>
                <div className="attendance-stat-content">
                  <span className="attendance-stat-label">Action / Regularize</span>
                  {loading || historyLoading ? (
                    <span
                      className="skeleton-shimmer"
                      style={{ width: "36px", height: "20px", display: "inline-block", borderRadius: "4px" }}
                    />
                  ) : (
                    <span className="attendance-stat-value">{monthlyStats.missingCount}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Attendance History Section */}
            <div className="attendance-section-header">
              <div>
                <div className="attendance-section-title-row">
                  <History className="attendance-section-icon" />
                  <h2 className="attendance-section-title">Attendance History</h2>
                </div>
                <p className="attendance-section-subtitle">
                  {selectedMonthLabel} • {monthlyStats.daysCount} days recorded ({monthlyStats.totalHoursStr} logged)
                </p>
              </div>

              {/* Monthly Selector */}
              <div className="attendance-month-selector-group">
                {!isCurrentMonth && (
                  <button
                    onClick={handleResetToThisMonth}
                    className="attendance-btn-secondary attendance-btn-secondary--sm"
                  >
                    Current Month
                  </button>
                )}

                <div className="attendance-month-nav">
                  <button
                    onClick={handlePrevMonth}
                    className="attendance-month-nav-btn"
                    title="Previous Month"
                  >
                    <ChevronLeft className="attendance-nav-icon" />
                  </button>

                  <select
                    value={`${selectedMonth.year}-${selectedMonth.month}`}
                    onChange={(e) => {
                      const parts = e.target.value.split("-").map(Number);
                      if (parts[0] !== undefined && parts[1] !== undefined) {
                        setSelectedMonth({ year: parts[0], month: parts[1] });
                      }
                    }}
                    className="attendance-month-select"
                  >
                    {monthOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={handleNextMonth}
                    disabled={isCurrentMonth}
                    className={isCurrentMonth ? "attendance-month-nav-btn attendance-month-nav-btn--disabled" : "attendance-month-nav-btn"}
                    title="Next Month"
                  >
                    <ChevronRight className="attendance-nav-icon" />
                  </button>
                </div>
              </div>
            </div>

            {/* History Table */}
            <div className="attendance-table-container">
              <div className="attendance-table-scroll">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th style={{ width: "22%" }}>Date</th>
                      <th style={{ width: "16%" }}>Clock In</th>
                      <th style={{ width: "16%" }}>Clock Out</th>
                      <th style={{ width: "16%" }}>Duration</th>
                      <th style={{ width: "20%", textAlign: "right" }}>Status</th>
                      <th style={{ width: "10%" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading || historyLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="attendance-table-row">
                          <td className="attendance-table-cell--first">
                            <div
                              className="skeleton-shimmer"
                              style={{ width: "80px", height: "14px", borderRadius: "4px" }}
                            />
                          </td>
                          <td className="attendance-table-cell">
                            <div
                              className="skeleton-shimmer"
                              style={{ width: "55px", height: "14px", borderRadius: "4px" }}
                            />
                          </td>
                          <td className="attendance-table-cell">
                            <div
                              className="skeleton-shimmer"
                              style={{ width: "55px", height: "14px", borderRadius: "4px" }}
                            />
                          </td>
                          <td className="attendance-table-cell">
                            <div
                              className="skeleton-shimmer"
                              style={{ width: "60px", height: "14px", borderRadius: "4px" }}
                            />
                          </td>
                          <td className="attendance-table-cell attendance-table-cell--right">
                            <div
                              className="skeleton-shimmer"
                              style={{ width: "70px", height: "20px", borderRadius: "6px", marginLeft: "auto" }}
                            />
                          </td>
                          <td className="attendance-table-cell--last" />
                        </tr>
                      ))
                    ) : history.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="attendance-table-empty-cell">
                          <Clock className="attendance-empty-icon" />
                          <p className="attendance-empty-text">
                            No attendance records logged for {selectedMonthLabel}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      history.map((rec) => {
                        const notesDetails = parseNotesRegularization(rec.notes);
                        let displayClockOut = rec.clock_out;
                        if (notesDetails.regStatus === "REGULARIZATION_APPROVED") {
                          displayClockOut = notesDetails.regTime;
                        }

                        return (
                          <tr key={rec.id} className="attendance-table-row">
                            <td className="attendance-table-cell--first attendance-table-cell--date">
                              {formatDate(rec.date)}
                            </td>
                            <td className="attendance-table-cell attendance-table-cell--mono">
                              {formatTime(rec.clock_in)}
                            </td>
                            <td className="attendance-table-cell attendance-table-cell--mono">
                              {formatTime(displayClockOut)}
                            </td>
                            <td className="attendance-table-cell attendance-table-cell--mono">
                              {formatDuration(rec.clock_in, displayClockOut)}
                            </td>
                            <td className="attendance-table-cell attendance-table-cell--right">
                              <StatusChip
                                status={rec.status}
                                recordNotes={rec.notes}
                                clockIn={rec.clock_in}
                                clockOut={rec.clock_out}
                                date={rec.date}
                              />
                            </td>
                            <td className="attendance-table-cell--last">
                              {(rec as any).source === "biometric_essl" && (
                                <span className="attendance-biometric-badge">
                                  <Fingerprint className="attendance-biometric-icon" />
                                  Biometric
                                </span>
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
          </>
        )}
      </div>

      {/* Shift End Confirmation Prompt Dialog */}
      <Dialog.Root open={showShiftEndPrompt} onOpenChange={setShowShiftEndPrompt}>
        <Dialog.Portal>
          <Dialog.Overlay className="attendance-dialog-overlay" />
          <Dialog.Content className="attendance-dialog-content">
            <Dialog.Title className="attendance-dialog-title">
              Your scheduled workday has ended
            </Dialog.Title>
            <Dialog.Description className="attendance-dialog-description">
              You're still marked as working. Are you still working or ready to clock out?
            </Dialog.Description>
            <div className="attendance-dialog-footer">
              <button
                type="button"
                onClick={() => {
                  setShowShiftEndPrompt(false);
                  handlePunch("out");
                }}
                className="attendance-dialog-btn-secondary"
              >
                I'm Done
              </button>
              <button
                type="button"
                onClick={handleContinueWorking}
                className="attendance-dialog-btn-primary"
              >
                Continue Working
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Regularization Request Dialog */}
      <Dialog.Root
        open={showRegularizeDialog}
        onOpenChange={(open) => {
          setShowRegularizeDialog(open);
          if (!open) {
            setRegTypeInput("");
            setRegTimeInput("");
            setRegReasonInput("");
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="attendance-dialog-overlay" />
          <Dialog.Content className="attendance-dialog-content attendance-dialog-content--lg">
            <div className="attendance-dialog-header">
              <Dialog.Title className="attendance-dialog-title--lg">
                Submit Regularization Request
              </Dialog.Title>
              <Dialog.Close className="attendance-dialog-close">
                <X className="attendance-dialog-close-icon" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="attendance-dialog-description--sm">
              Select the reason for regularization and provide supporting details for HR approval.
            </Dialog.Description>

            <div className="attendance-reg-form">
              {/* Step 1: Type Selection */}
              <div >
                {REGULARIZATION_TYPES.map((t) => (
                  <div
                    key={t.value}
                    onClick={() => setRegTypeInput(t.value)}
                    className={regTypeInput === t.value ? "attendance-reg-type-item attendance-reg-type-item--selected" : "attendance-reg-type-item"}
                  >
                    <div className={regTypeInput === t.value ? "attendance-reg-type-label attendance-reg-type-label--active" : "attendance-reg-type-label"}>
                      {t.label}
                    </div>
                    <div className="attendance-reg-type-desc">{t.description}</div>
                  </div>
                ))}
              </div>

              {/* Step 2: Time input (conditional) */}
              {regTypeInput &&
                REGULARIZATION_TYPES.find((t) => t.value === regTypeInput)?.hasTime && (
                  <div className="attendance-reg-field">
                    <label className="attendance-reg-field-label">
                      {regTypeInput === "EARLY_DEPARTURE"
                        ? "Actual Departure Time"
                        : "Actual Clock-Out Time"}
                    </label>
                    <input
                      type="time"
                      value={regTimeInput}
                      onChange={(e) => setRegTimeInput(e.target.value)}
                      className="attendance-reg-input"
                    />
                  </div>
                )}

              {/* Step 3: Reason */}
              {regTypeInput && (
                <div className="attendance-reg-field">
                  <label className="attendance-reg-field-label">Reason</label>
                  <textarea
                    rows={3}
                    placeholder={
                      regTypeInput === "LATE_ARRIVAL"
                        ? "e.g. Had an off-site client meeting in the morning"
                        : "e.g. Had to leave early for a doctor's appointment"
                    }
                    value={regReasonInput}
                    onChange={(e) => setRegReasonInput(e.target.value)}
                    className="attendance-reg-textarea"
                  />
                </div>
              )}
            </div>

            <div className="attendance-dialog-footer">
              <button
                type="button"
                onClick={() => {
                  setShowRegularizeDialog(false);
                  setRegTypeInput("");
                  setRegTimeInput("");
                  setRegReasonInput("");
                }}
                className="attendance-reg-cancel-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !regTypeInput ||
                  !regReasonInput.trim() ||
                  (REGULARIZATION_TYPES.find((t) => t.value === regTypeInput)?.hasTime
                    ? !regTimeInput
                    : false) ||
                  actionLoading
                }
                onClick={handleSubmitRegularize}
                className="attendance-dialog-btn-primary"
              >
                {actionLoading ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Layout>
  );
}
