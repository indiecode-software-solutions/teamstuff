import React, { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  MapPin,
  Clock,
  Calendar,
  Building2,
  CheckCircle2,
  Navigation,
  Camera,
  Eye,
  User,
  ExternalLink,
} from "lucide-react";
import { FieldVisit } from "../lib/site-visits";
import VisualMap from "./VisualMap";

interface VisitDetailsModalProps {
  open: boolean;
  onClose: () => void;
  visit: FieldVisit | null;
}

function formatLocationDisplay(
  address?: string | null,
  lat?: number | null,
  lng?: number | null
) {
  if (!address || address.startsWith("Lat:") || address === "Location captured") {
    return lat != null && lng != null
      ? `GPS Location (${lat.toFixed(5)}, ${lng.toFixed(5)})`
      : "Location captured";
  }
  return address;
}

export default function VisitDetailsModal({
  open,
  onClose,
  visit,
}: VisitDetailsModalProps) {
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);

  if (!visit) return null;

  const startDate = new Date(visit.start_time);
  const endDate = visit.end_time ? new Date(visit.end_time) : null;
  const isCompleted = visit.status === "completed";

  // Calculate duration
  const startMs = startDate.getTime();
  const endMs = endDate ? endDate.getTime() : Date.now();
  const diffMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const startAddrFormatted = formatLocationDisplay(
    visit.start_address,
    visit.start_lat,
    visit.start_lng
  );
  const endAddrFormatted = formatLocationDisplay(
    visit.end_address,
    visit.end_lat,
    visit.end_lng
  );

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="site-visits-modal-overlay" />
          <Dialog.Content className="site-visits-vertical-modal-content">
            {/* Minimal Header */}
            <div className="site-visits-detail-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "8px",
                    backgroundColor: isCompleted ? "#ecfdf5" : "#eff6ff",
                    color: isCompleted ? "#059669" : "#2563eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Building2 size={18} />
                </div>
                <div>
                  <Dialog.Title
                    style={{
                      margin: 0,
                      fontSize: "15px",
                      fontWeight: 600,
                      color: "#0f172a",
                    }}
                  >
                    {visit.client_name}
                  </Dialog.Title>
                  <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                    {startDate.toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span
                  className={
                    isCompleted
                      ? "site-visits-badge-completed"
                      : "site-visits-badge-in-progress"
                  }
                >
                  {isCompleted ? "Completed" : "In Progress"}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="site-visits-modal-close-btn"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Hero Interactive Route Map */}
            <div className="site-visits-detail-map-hero">
              <VisualMap
                startLat={visit.start_lat}
                startLng={visit.start_lng}
                startLabel="Start Location"
                endLat={visit.end_lat}
                endLng={visit.end_lng}
                endLabel="End Location"
                height="220px"
              />
            </div>

            {/* Body Content */}
            <div className="site-visits-detail-body">
              {/* Summary Cards Row */}
              <div className="site-visits-detail-metrics-grid">
                <div className="site-visits-detail-metric-card">
                  <span className="site-visits-detail-metric-label">Employee</span>
                  <span
                    className="site-visits-detail-metric-val"
                    style={{ display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    <User size={13} style={{ color: "#64748b" }} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {visit.employee_name || "Employee"}
                    </span>
                  </span>
                </div>

                <div className="site-visits-detail-metric-card">
                  <span className="site-visits-detail-metric-label">Purpose</span>
                  <span
                    className="site-visits-detail-metric-val"
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {visit.purpose || "Client Meeting"}
                  </span>
                </div>

                <div className="site-visits-detail-metric-card">
                  <span className="site-visits-detail-metric-label">Duration</span>
                  <span
                    className="site-visits-detail-metric-val"
                    style={{
                      color: "#2563eb",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <Clock size={13} />
                    {durationStr}
                  </span>
                </div>
              </div>

              {/* Vertical Connected Timeline */}
              <div className="site-visits-detail-timeline-card">
                <div className="site-visits-detail-timeline-connector" />

                {/* Start Node */}
                <div className="site-visits-detail-timeline-node">
                  <div className="site-visits-detail-dot site-visits-detail-dot-start" />
                  <div className="site-visits-detail-node-info">
                    <div className="site-visits-detail-node-header">
                      <span className="site-visits-detail-node-title" style={{ color: "#2563eb" }}>
                        START LOCATION
                      </span>
                      <span className="site-visits-detail-node-time">
                        {startDate.toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="site-visits-detail-node-address">{startAddrFormatted}</p>
                    {visit.start_address &&
                      !visit.start_address.startsWith("Lat:") &&
                      visit.start_address !== "Location captured" && (
                        <p className="site-visits-detail-node-coords">
                          📍 {visit.start_lat.toFixed(5)}, {visit.start_lng.toFixed(5)}
                        </p>
                      )}
                  </div>
                </div>

                {/* End Node */}
                <div className="site-visits-detail-timeline-node">
                  <div className="site-visits-detail-dot site-visits-detail-dot-end" />
                  <div className="site-visits-detail-node-info">
                    <div className="site-visits-detail-node-header">
                      <span
                        className="site-visits-detail-node-title"
                        style={{ color: isCompleted ? "#059669" : "#d97706" }}
                      >
                        {isCompleted ? "END LOCATION" : "CURRENT STATUS"}
                      </span>
                      <span className="site-visits-detail-node-time">
                        {endDate
                          ? endDate.toLocaleTimeString("en-IN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "In Progress"}
                      </span>
                    </div>
                    <p className="site-visits-detail-node-address">
                      {isCompleted ? endAddrFormatted : "Visit currently ongoing"}
                    </p>
                    {isCompleted &&
                      visit.end_address &&
                      !visit.end_address.startsWith("Lat:") &&
                      visit.end_address !== "Location captured" &&
                      visit.end_lat &&
                      visit.end_lng && (
                        <p className="site-visits-detail-node-coords">
                          📍 {visit.end_lat.toFixed(5)}, {visit.end_lng.toFixed(5)}
                        </p>
                      )}
                  </div>
                </div>
              </div>

              {/* Verified Photo Proof Section */}
              {visit.end_photo_url && (
                <div
                  style={{
                    backgroundColor: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "14px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div
                      onClick={() => setPhotoPreviewOpen(true)}
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "8px",
                        overflow: "hidden",
                        border: "1px solid #cbd5e1",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={visit.end_photo_url}
                        alt="Photo Proof"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
                        Verified Photo Proof
                      </span>
                      <span style={{ fontSize: "11px", color: "#059669", fontWeight: 500 }}>
                        ✓ Geotagged with live watermark
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPhotoPreviewOpen(true)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      backgroundColor: "#ffffff",
                      fontSize: "12px",
                      fontWeight: 500,
                      color: "#334155",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Eye size={13} />
                    <span>View Photo</span>
                  </button>
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Fullscreen Photo Dialog */}
      <Dialog.Root open={photoPreviewOpen} onOpenChange={setPhotoPreviewOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="site-visits-modal-overlay" />
          <Dialog.Content
            className="site-visits-modal-content"
            style={{ maxWidth: "560px", padding: "16px" }}
          >
            {visit.end_photo_url && (
              <div style={{ position: "relative" }}>
                <img
                  src={visit.end_photo_url}
                  alt="Exit proof fullscreen"
                  style={{
                    width: "100%",
                    maxHeight: "80vh",
                    objectFit: "contain",
                    borderRadius: "8px",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setPhotoPreviewOpen(false)}
                  style={{
                    position: "absolute",
                    top: "10px",
                    right: "10px",
                    backgroundColor: "rgba(0, 0, 0, 0.6)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "50%",
                    width: "32px",
                    height: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
