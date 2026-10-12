import React, { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import Layout from "../components/Layout";
import {
  MapPin,
  Clock,
  Plus,
  Search,
  Navigation,
  CheckCircle,
  Building2,
  Calendar,
  Layers,
  StopCircle,
  X,
  Camera as CameraIcon,
  Eye,
  Image as ImageIcon,
  Loader2,
  ShieldCheck,
  Compass,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { FieldVisit, reverseGeocodeCoords } from "../lib/site-visits";
import { getCurrentCoordinates } from "../lib/geolocation";
import { sanitizeProfilePhoto } from "../lib/profile-photo";
import StartVisitModal from "../components/StartVisitModal";
import EndVisitModal from "../components/EndVisitModal";
import VisitDetailsModal from "../components/VisitDetailsModal";

export const Route = createFileRoute("/site-visits")({
  head: () => ({
    title: "CapOasis | Field Visits",
    meta: [
      {
        name: "description",
        content: "Record and manage employee client & site visits outside the office.",
      },
    ],
  }),
  component: FieldVisitsPage,
});

/**
 * Calculates human readable duration between two ISO strings or start time to now
 */
function formatVisitDuration(startTimeIso: string, endTimeIso?: string | null): string {
  const start = new Date(startTimeIso).getTime();
  const end = endTimeIso ? new Date(endTimeIso).getTime() : Date.now();
  const diffMinutes = Math.max(1, Math.round((end - start) / 60000));

  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function FieldVisitsPage() {
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    name: string;
    role: string;
    companyId: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState<FieldVisit[]>([]);
  const [activeVisit, setActiveVisit] = useState<FieldVisit | null>(null);
  const [activeElapsed, setActiveElapsed] = useState("00:00:00");
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [endModalOpen, setEndModalOpen] = useState(false);
  const [selectedVisitForPhoto, setSelectedVisitForPhoto] = useState<FieldVisit | null>(null);
  const [detailsModalVisit, setDetailsModalVisit] = useState<FieldVisit | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "in_progress" | "completed">("ALL");
  const [isEndingVisit, setIsEndingVisit] = useState(false);

  const initLoadedRef = React.useRef(false);

  const loadVisits = async (targetUser = currentUser) => {
    if (!targetUser?.companyId) return;
    try {
      const isManager = targetUser.role === "admin" || targetUser.role === "hr";

      let query = supabase
        .from("field_visits")
        .select(`
          *,
          profiles:user_id (name, role, profile_photo)
        `)
        .eq("company_id", targetUser.companyId)
        .order("start_time", { ascending: false });

      if (!isManager) {
        query = query.eq("user_id", targetUser.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching field visits:", error.message);
        setVisits([]);
        setActiveVisit(null);
        return;
      }

      const formatted: FieldVisit[] = (data || []).map((v: any) => ({
        ...v,
        employee_name: v.profiles?.name || "Employee",
        employee_role: v.profiles?.role || "Staff",
        employee_avatar: sanitizeProfilePhoto(v.profiles?.profile_photo),
      }));

      setVisits(formatted);

      // Check if current user has an ongoing in-progress visit
      const ongoing = formatted.find(
        (v) => v.user_id === targetUser.id && v.status === "in_progress"
      );
      setActiveVisit(ongoing || null);
    } catch (e) {
      console.error("Failed to load visits:", e);
    } finally {
      setLoading(false);
    }
  };

  // 1. Single Unified Initialization (No Double Loading Glitch)
  useEffect(() => {
    if (initLoadedRef.current) return;
    initLoadedRef.current = true;

    const initSiteVisits = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setLoading(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, name, role, company_id")
          .eq("id", user.id)
          .single();

        if (!profile) {
          setLoading(false);
          return;
        }

        const userObj = {
          id: profile.id,
          name: profile.name || "Employee",
          role: profile.role || "employee",
          companyId: profile.company_id,
        };
        setCurrentUser(userObj);

        // Fetch visits immediately with userObj
        await loadVisits(userObj);
      } catch (err) {
        console.error("Error initializing site visits page:", err);
        setLoading(false);
      }
    };

    initSiteVisits();
  }, []);

  // Live timer for active visit
  useEffect(() => {
    if (!activeVisit) return;
    const interval = setInterval(() => {
      const start = new Date(activeVisit.start_time).getTime();
      const diffSec = Math.floor((Date.now() - start) / 1000);
      if (diffSec <= 0) {
        setActiveElapsed("00:00:00");
        return;
      }
      const h = Math.floor(diffSec / 3600);
      const m = Math.floor((diffSec % 3600) / 60);
      const s = diffSec % 60;
      setActiveElapsed(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [activeVisit]);

  const [nextVisitStartData, setNextVisitStartData] = useState<{
    coords: { latitude: number; longitude: number };
    address: string;
  } | null>(null);

  // Handle Start Visit Success
  const handleStartVisitSuccess = async (payload: any) => {
    try {
      const { data, error } = await supabase
        .from("field_visits")
        .insert([payload])
        .select()
        .single();

      const newRecord: FieldVisit = data || {
        ...payload,
        id: `local-${Date.now()}`,
        employee_name: currentUser?.name || "Employee",
        employee_role: currentUser?.role || "Staff",
        created_at: new Date().toISOString(),
      };

      setVisits((prev) => [newRecord, ...prev]);
      setActiveVisit(newRecord);
      setNextVisitStartData(null);
    } catch (e) {
      console.error("Error creating visit:", e);
    }
  };

  // Handle End Visit Success from Modal
  const handleEndVisitSuccess = async (updatePayload: Partial<FieldVisit>) => {
    if (!activeVisit) return;
    setIsEndingVisit(true);
    try {
      await supabase
        .from("field_visits")
        .update(updatePayload)
        .eq("id", activeVisit.id);

      setVisits((prev) =>
        prev.map((v) => (v.id === activeVisit.id ? { ...v, ...updatePayload } : v))
      );
      setActiveVisit(null);
    } catch (err) {
      console.error("Failed to update completed visit:", err);
    } finally {
      setIsEndingVisit(false);
    }
  };

  // Handle Complete current visit and immediately launch next visit modal with current GPS
  const handleCompleteAndStartNext = async (
    updatePayload: Partial<FieldVisit>,
    nextStartCoords?: { latitude: number; longitude: number },
    nextAddress?: string
  ) => {
    await handleEndVisitSuccess(updatePayload);
    if (nextStartCoords) {
      setNextVisitStartData({
        coords: nextStartCoords,
        address: nextAddress || "",
      });
    }
    setStartModalOpen(true);
  };

  // Compute Summary Statistics
  const todayStr = new Date().toISOString().split("T")[0] || "";
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const todayCount = visits.filter((v) => (v.start_time ? v.start_time.startsWith(todayStr) : false)).length;
  const inProgressCount = visits.filter((v) => v.status === "in_progress").length;
  const thisMonthVisits = visits.filter((v) => {
    const d = new Date(v.start_time);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });
  const thisMonthCount = thisMonthVisits.length;

  // Calculate Total Field Hours (for this month's visits or total logged)
  const totalFieldMinutes = visits.reduce((acc, v) => {
    if (!v.start_time) return acc;
    const start = new Date(v.start_time).getTime();
    const end = v.end_time ? new Date(v.end_time).getTime() : Date.now();
    const diff = Math.max(0, Math.round((end - start) / 60000));
    return acc + diff;
  }, 0);

  const totalFieldHoursStr =
    totalFieldMinutes >= 60
      ? `${(totalFieldMinutes / 60).toFixed(1)} hrs`
      : `${totalFieldMinutes} mins`;

  // Calculate Average Visit Duration
  const completedVisits = visits.filter(
    (v) => v.status === "completed" && v.start_time && v.end_time
  );
  const totalCompletedMinutes = completedVisits.reduce((acc, v) => {
    const start = new Date(v.start_time).getTime();
    const end = new Date(v.end_time!).getTime();
    return acc + Math.max(0, Math.round((end - start) / 60000));
  }, 0);
  const avgMinutes =
    completedVisits.length > 0 ? Math.round(totalCompletedMinutes / completedVisits.length) : 0;
  const avgDurationStr =
    avgMinutes >= 60
      ? `${(avgMinutes / 60).toFixed(1)} hrs`
      : `${avgMinutes} mins`;

  const isManager = currentUser?.role === "admin" || currentUser?.role === "hr";

  // Filtered visits
  const filteredVisits = visits.filter((v) => {
    if (statusFilter !== "ALL" && v.status !== statusFilter) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      v.client_name.toLowerCase().includes(query) ||
      (v.purpose && v.purpose.toLowerCase().includes(query)) ||
      (v.start_address && v.start_address.toLowerCase().includes(query)) ||
      (v.employee_name && v.employee_name.toLowerCase().includes(query))
    );
  });

  return (
    <Layout activeTab="Field Visits">
      <div className="site-visits-page-container">
        {/* Top Header Actions */}
        {!activeVisit && (
          <div className="site-visits-header-actions">
            <button
              type="button"
              onClick={() => setStartModalOpen(true)}
              className="site-visits-primary-btn"
            >
              <Plus size={16} />
              <span>Start New Visit</span>
            </button>
          </div>
        )}

        {/* Top Summary Metrics: Fixed cards & icons, shimmer only for dynamic values */}
        <div className="site-visits-stats-grid">
          <div className="site-visits-stat-card">
            <div className="site-visits-stat-icon-box site-visits-stat-icon-blue">
              <Calendar size={20} />
            </div>
            <div className="site-visits-stat-content">
              <span className="site-visits-stat-label">Today's Visits</span>
              {loading ? (
                <span
                  className="skeleton-shimmer"
                  style={{ width: "36px", height: "20px", display: "inline-block", borderRadius: "4px" }}
                />
              ) : (
                <span className="site-visits-stat-value">{todayCount}</span>
              )}
            </div>
          </div>

          <div className="site-visits-stat-card">
            <div className="site-visits-stat-icon-box site-visits-stat-icon-purple">
              <Layers size={20} />
            </div>
            <div className="site-visits-stat-content">
              <span className="site-visits-stat-label">This Month</span>
              {loading ? (
                <span
                  className="skeleton-shimmer"
                  style={{ width: "36px", height: "20px", display: "inline-block", borderRadius: "4px" }}
                />
              ) : (
                <span className="site-visits-stat-value">{thisMonthCount}</span>
              )}
            </div>
          </div>

          <div className="site-visits-stat-card">
            <div className="site-visits-stat-icon-box site-visits-stat-icon-amber">
              <Clock size={20} />
            </div>
            <div className="site-visits-stat-content">
              <span className="site-visits-stat-label">Total Field Hours</span>
              {loading ? (
                <span
                  className="skeleton-shimmer"
                  style={{ width: "56px", height: "20px", display: "inline-block", borderRadius: "4px" }}
                />
              ) : (
                <span className="site-visits-stat-value">{totalFieldHoursStr}</span>
              )}
            </div>
          </div>

          <div className="site-visits-stat-card">
            <div className="site-visits-stat-icon-box site-visits-stat-icon-emerald">
              <Compass size={20} />
            </div>
            <div className="site-visits-stat-content">
              <span className="site-visits-stat-label">Avg Duration</span>
              {loading ? (
                <span
                  className="skeleton-shimmer"
                  style={{ width: "56px", height: "20px", display: "inline-block", borderRadius: "4px" }}
                />
              ) : (
                <span className="site-visits-stat-value">{avgDurationStr}</span>
              )}
            </div>
          </div>
        </div>

        {/* Active Visit Hero Banner */}
        {activeVisit && (
          <div className="site-visits-active-hero">
            <div className="site-visits-active-hero-left">
              <div className="site-visits-active-beacon">
                <Navigation size={20} />
              </div>
              <div className="site-visits-active-info">
                <div className="site-visits-active-header-line">
                  <h2 className="site-visits-active-client-title">{activeVisit.client_name}</h2>
                  <span className="site-visits-active-badge">
                    <span className="site-visits-active-dot" />
                    Visit In Progress
                  </span>
                </div>
                <p className="site-visits-active-meta">
                  {activeVisit.purpose || "Client Meeting"} · Started at{" "}
                  {new Date(activeVisit.start_time).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  ({activeVisit.start_address || "Location captured"})
                </p>
              </div>
            </div>

            <div className="site-visits-active-hero-right">
              <div className="site-visits-active-timer-box">
                <span className="site-visits-active-timer-val">{activeElapsed}</span>
              </div>

              <button
                type="button"
                onClick={() => setEndModalOpen(true)}
                disabled={isEndingVisit}
                className="site-visits-btn-next-stop"
              >
                <Compass size={14} />
                <span>+ Add Next Stop</span>
              </button>

              <button
                type="button"
                onClick={() => setEndModalOpen(true)}
                disabled={isEndingVisit}
                className="site-visits-btn-end"
              >
                <StopCircle size={15} />
                <span>End Visit</span>
              </button>
            </div>
          </div>
        )}

        {/* History Section Card */}
        <div className="site-visits-history-card">
          {/* Table Controls */}
          <div className="site-visits-history-toolbar">
            <div className="site-visits-history-title-box">
              <h2 className="site-visits-history-title">Visit History</h2>
              <p className="site-visits-history-subtitle">
                Audit log of all completed and recorded field visits
              </p>
            </div>

            <div className="site-visits-filter-group">
              <div className="site-visits-search-box">
                <Search size={14} className="site-visits-search-icon" />
                <input
                  type="text"
                  placeholder="Search by client or employee..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="site-visits-search-input"
                />
              </div>

              <div className="site-visits-status-filters">
                <button
                  type="button"
                  onClick={() => setStatusFilter("ALL")}
                  className={`site-visits-filter-chip ${statusFilter === "ALL" ? "active" : ""}`}
                >
                  All ({visits.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("in_progress")}
                  className={`site-visits-filter-chip ${statusFilter === "in_progress" ? "active" : ""}`}
                >
                  Active ({inProgressCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter("completed")}
                  className={`site-visits-filter-chip ${statusFilter === "completed" ? "active" : ""}`}
                >
                  Completed ({visits.filter((v) => v.status === "completed").length})
                </button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="site-visits-table-wrap">
            <table className="site-visits-table">
              <thead>
                <tr>
                  {isManager && <th>Employee</th>}
                  <th>Client / Site</th>
                  <th>Date</th>
                  {isManager && (
                    <>
                      <th>Start Time</th>
                      <th>End Time</th>
                    </>
                  )}
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="site-visits-row" style={{ cursor: "default" }}>
                      {isManager && (
                        <td>
                          <div className="site-visits-employee-cell">
                            <div
                              className="skeleton-shimmer"
                              style={{ width: "32px", height: "32px", borderRadius: "50%", flexShrink: 0 }}
                            />
                            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                              <div
                                className="skeleton-shimmer"
                                style={{
                                  width: i % 2 === 0 ? "90px" : "110px",
                                  height: "13px",
                                  borderRadius: "4px",
                                }}
                              />
                              <div
                                className="skeleton-shimmer"
                                style={{ width: "55px", height: "10px", borderRadius: "3px" }}
                              />
                            </div>
                          </div>
                        </td>
                      )}
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                          <div
                            className="skeleton-shimmer"
                            style={{
                              width: i % 2 === 0 ? "130px" : "150px",
                              height: "13px",
                              borderRadius: "4px",
                            }}
                          />
                          <div
                            className="skeleton-shimmer"
                            style={{ width: "80px", height: "10px", borderRadius: "3px" }}
                          />
                        </div>
                      </td>
                      <td>
                        <div
                          className="skeleton-shimmer"
                          style={{ width: "75px", height: "13px", borderRadius: "4px" }}
                        />
                      </td>
                      {isManager && (
                        <>
                          <td>
                            <div
                              className="skeleton-shimmer"
                              style={{ width: "55px", height: "13px", borderRadius: "4px" }}
                            />
                          </td>
                          <td>
                            <div
                              className="skeleton-shimmer"
                              style={{ width: "55px", height: "13px", borderRadius: "4px" }}
                            />
                          </td>
                        </>
                      )}
                      <td>
                        <div
                          className="skeleton-shimmer"
                          style={{ width: "50px", height: "20px", borderRadius: "6px" }}
                        />
                      </td>
                      <td>
                        <div
                          className="skeleton-shimmer"
                          style={{ width: "75px", height: "20px", borderRadius: "6px" }}
                        />
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <div
                            className="site-visits-shimmer"
                            style={{ width: "24px", height: "24px", borderRadius: "4px" }}
                          />
                          <div
                            className="site-visits-shimmer"
                            style={{ width: "24px", height: "24px", borderRadius: "4px" }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : filteredVisits.length === 0 ? (
                  <tr>
                    <td colSpan={isManager ? 7 : 5}>
                      <div className="site-visits-empty-state">
                        <div className="site-visits-empty-icon">
                          <MapPin size={24} />
                        </div>
                        <h4 className="site-visits-empty-title">No field visits found</h4>
                        <p className="site-visits-empty-desc">
                          {searchQuery
                            ? "Try adjusting your search query or filter"
                            : "Start your first client visit using the button above."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredVisits.map((v) => {
                    const isOngoing = v.status === "in_progress";
                    const startDate = new Date(v.start_time);
                    const endDate = v.end_time ? new Date(v.end_time) : null;

                    return (
                      <tr
                        key={v.id}
                        onClick={() => setDetailsModalVisit(v)}
                        className="site-visits-row"
                      >
                        {isManager && (
                          <td>
                            <div className="site-visits-employee-cell">
                              <div className="site-visits-avatar">
                                {v.employee_avatar ? (
                                  <img
                                    src={v.employee_avatar}
                                    alt={v.employee_name || "Employee"}
                                  />
                                ) : (
                                  v.employee_name ? v.employee_name.charAt(0) : "E"
                                )}
                              </div>
                              <div className="site-visits-emp-meta">
                                <p className="site-visits-emp-name">{v.employee_name}</p>
                                <p className="site-visits-emp-role">{v.employee_role}</p>
                              </div>
                            </div>
                          </td>
                        )}

                        <td>
                          <div className="site-visits-client-cell">
                            <span className="site-visits-client-name">{v.client_name}</span>
                            <span className="site-visits-purpose-tag">
                              {v.purpose || "Client Visit"}
                            </span>
                          </div>
                        </td>

                        <td>
                          <span className="site-visits-date-text">
                            {startDate.toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </td>

                        {isManager && (
                          <>
                            <td>
                              <span className="site-visits-time-text">
                                {startDate.toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </td>
                            <td>
                              <span className="site-visits-time-text">
                                {endDate
                                  ? endDate.toLocaleTimeString("en-IN", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "—"}
                              </span>
                            </td>
                          </>
                        )}

                        <td>
                          <span className="site-visits-duration-pill">
                            <Clock size={12} />
                            {formatVisitDuration(v.start_time, v.end_time)}
                          </span>
                        </td>

                        <td>
                          <div className="site-visits-status-container">
                            {isOngoing ? (
                              <span className="site-visits-badge-in-progress">
                                <span className="site-visits-active-dot" />
                                In Progress
                              </span>
                            ) : (
                              <span className="site-visits-badge-completed">
                                <CheckCircle size={12} />
                                Completed
                              </span>
                            )}
                          </div>
                        </td>

                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            {v.end_photo_url && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedVisitForPhoto(v);
                                }}
                                title="View Geotagged Photo"
                                className="site-visits-photo-btn"
                              >
                                <CameraIcon size={13} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailsModalVisit(v);
                              }}
                              title="View Route Details"
                              style={{
                                border: "none",
                                background: "none",
                                color: "#64748b",
                                cursor: "pointer",
                                padding: "4px",
                                borderRadius: "4px",
                              }}
                            >
                              <Eye size={14} />
                            </button>
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

        {/* Start Visit Modal */}
        {currentUser && (
          <StartVisitModal
            open={startModalOpen}
            onClose={() => {
              setStartModalOpen(false);
              setNextVisitStartData(null);
            }}
            onSuccess={handleStartVisitSuccess}
            companyId={currentUser.companyId}
            userId={currentUser.id}
            initialCoords={nextVisitStartData ? nextVisitStartData.coords : undefined}
            initialAddress={nextVisitStartData ? nextVisitStartData.address : undefined}
          />
        )}

        {/* End Visit Modal with Photo Capture */}
        {currentUser && activeVisit && (
          <EndVisitModal
            open={endModalOpen}
            onClose={() => setEndModalOpen(false)}
            visit={activeVisit}
            onSuccess={handleEndVisitSuccess}
            onCompleteAndStartNext={handleCompleteAndStartNext}
            companyId={currentUser.companyId}
            userId={currentUser.id}
            userName={currentUser.name}
          />
        )}

        {/* Visit Details Dual-Pane Modal */}
        <VisitDetailsModal
          open={Boolean(detailsModalVisit)}
          onClose={() => setDetailsModalVisit(null)}
          visit={detailsModalVisit}
        />

        {/* Photo View Dialog with Details Card Below */}
        <Dialog.Root
          open={Boolean(selectedVisitForPhoto?.end_photo_url)}
          onOpenChange={(v) => !v && setSelectedVisitForPhoto(null)}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="site-visits-modal-overlay" />
            <Dialog.Content className="site-visits-modal-content" style={{ maxWidth: "480px" }}>
              {selectedVisitForPhoto && selectedVisitForPhoto.end_photo_url && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div
                    style={{
                      position: "relative",
                      borderRadius: "10px",
                      overflow: "hidden",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <img
                      src={selectedVisitForPhoto.end_photo_url}
                      alt="End Visit Verification"
                      style={{ width: "100%", maxHeight: "360px", objectFit: "cover" }}
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedVisitForPhoto(null)}
                      style={{
                        position: "absolute",
                        top: "10px",
                        right: "10px",
                        backgroundColor: "rgba(0, 0, 0, 0.6)",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "50%",
                        width: "30px",
                        height: "30px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      backgroundColor: "#f8fafc",
                      padding: "14px",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#0f172a",
                      }}
                    >
                      {selectedVisitForPhoto.client_name}{" "}
                      {selectedVisitForPhoto.employee_name
                        ? `· ${selectedVisitForPhoto.employee_name}`
                        : ""}
                    </p>
                    <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                      {selectedVisitForPhoto.end_address ||
                        selectedVisitForPhoto.start_address ||
                        "Location captured"}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        marginTop: "4px",
                        fontSize: "11px",
                        color: "#475569",
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        📍{" "}
                        {selectedVisitForPhoto.end_lat?.toFixed(4) ||
                          selectedVisitForPhoto.start_lat.toFixed(4)}
                        ,{" "}
                        {selectedVisitForPhoto.end_lng?.toFixed(4) ||
                          selectedVisitForPhoto.start_lng.toFixed(4)}
                      </span>
                      <span>
                        🕒{" "}
                        {selectedVisitForPhoto.end_time
                          ? new Date(selectedVisitForPhoto.end_time).toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                      <span style={{ color: "#059669", fontWeight: 500 }}>✓ Verified Photo</span>
                    </div>
                  </div>
                </div>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </Layout>
  );
}
