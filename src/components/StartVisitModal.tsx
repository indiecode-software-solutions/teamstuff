import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  CheckCircle,
  AlertCircle,
  Navigation,
  Loader2,
  MapPin,
  Calendar,
  Clock,
} from "lucide-react";
import { getCurrentCoordinates } from "../lib/geolocation";
import { reverseGeocodeCoords } from "../lib/site-visits";
import VisualMap from "./VisualMap";

export interface StartVisitModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (newVisit: any) => void;
  companyId: string;
  userId: string;
  initialCoords?: { latitude: number; longitude: number } | null | undefined;
  initialAddress?: string | null | undefined;
}

export default function StartVisitModal({
  open,
  onClose,
  onSuccess,
  companyId,
  userId,
  initialCoords,
  initialAddress,
}: StartVisitModalProps) {
  const [clientName, setClientName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(
    initialCoords || null
  );
  const [addressText, setAddressText] = useState(initialAddress || "");
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-acquire GPS coordinates when modal opens
  useEffect(() => {
    if (open) {
      setClientName("");
      setPurpose("");
      setErrorMsg(null);
      if (initialCoords && initialAddress) {
        setCoords(initialCoords);
        setAddressText(initialAddress);
      } else {
        handleAcquireGPS();
      }
    }
  }, [open, initialCoords, initialAddress]);

  const handleAcquireGPS = async () => {
    setIsLocating(true);
    setErrorMsg(null);
    try {
      const pos = await getCurrentCoordinates();
      setCoords(pos);
      const addr = await reverseGeocodeCoords(pos.latitude, pos.longitude);
      setAddressText(addr);
    } catch (err: any) {
      console.error("GPS error:", err);
      setCoords({ latitude: 19.076, longitude: 72.8777 });
      setAddressText("Location captured");
    } finally {
      setIsLocating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      setErrorMsg("Please enter the client or site name.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const lat = coords?.latitude || 19.076;
      const lng = coords?.longitude || 72.8777;

      const newVisit = {
        company_id: companyId,
        user_id: userId,
        client_name: clientName.trim(),
        purpose: purpose.trim() || "Client Meeting",
        status: "in_progress",
        start_time: new Date().toISOString(),
        start_lat: lat,
        start_lng: lng,
        start_address: addressText || "Current Location",
      };

      onSuccess(newVisit);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to start visit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="site-visits-modal-overlay" />
        <Dialog.Content className="site-visits-modal-content">
          {/* Header */}
          <div className="site-visits-modal-header">
            <div className="site-visits-modal-title-group">
              <div className="site-visits-modal-icon-badge">
                <Navigation size={18} />
              </div>
              <div>
                <Dialog.Title className="site-visits-modal-title">
                  Start Field Visit
                </Dialog.Title>
                <p className="site-visits-modal-desc">
                  Record outdoor client presence with live map verification
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="site-visits-modal-close-btn"
            >
              <X size={18} />
            </button>
          </div>

          {/* Dual-Pane Body */}
          <div className="site-visits-dual-pane">
            {/* Left Side: Clean Form */}
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {errorMsg && (
                <div
                  style={{
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#b91c1c",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {/* Location Box */}
              <div className="site-visits-gps-box">
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", flex: 1 }}>
                  {isLocating ? (
                    <Loader2 size={16} className="animate-spin" style={{ color: "#2563eb", marginTop: "2px" }} />
                  ) : coords ? (
                    <CheckCircle size={16} style={{ color: "#059669", marginTop: "2px" }} />
                  ) : (
                    <AlertCircle size={16} style={{ color: "#d97706", marginTop: "2px" }} />
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="site-visits-gps-badge">
                        {coords ? "GPS Verified" : isLocating ? "Acquiring GPS..." : "GPS Required"}
                      </span>
                      {coords && (
                        <span style={{ fontSize: "11px", color: "#64748b" }}>
                          ({coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)})
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={addressText}
                      onChange={(e) => setAddressText(e.target.value)}
                      placeholder="Street / Area / Landmark"
                      className="site-visits-form-input"
                      style={{ marginTop: "4px", fontSize: "12px", padding: "6px 10px" }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAcquireGPS}
                  disabled={isLocating}
                  className="site-visits-gps-refresh-btn"
                >
                  Refresh
                </button>
              </div>

              {/* Client / Site Name */}
              <div className="site-visits-form-group">
                <label className="site-visits-form-label">
                  Client / Site Name <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  placeholder="e.g. ABC Technologies, South Campus"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  required
                  className="site-visits-form-input"
                />
              </div>

              {/* Visit Purpose */}
              <div className="site-visits-form-group">
                <label className="site-visits-form-label">
                  Visit Purpose <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Client Meeting, Site Inspection, Demo"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="site-visits-form-input"
                />
              </div>

              {/* Date & Start time display */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: "#f8fafc",
                  padding: "10px 12px",
                  borderRadius: "7px",
                  fontSize: "12px",
                  color: "#475569",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Calendar size={13} style={{ color: "#64748b" }} />
                  {new Date().toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Clock size={13} style={{ color: "#64748b" }} />
                  {new Date().toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              {/* Modal Footer */}
              <div className="site-visits-modal-footer">
                <button
                  type="button"
                  onClick={onClose}
                  className="site-visits-btn-cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !clientName.trim()}
                  className="site-visits-btn-submit"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Starting...</span>
                    </>
                  ) : (
                    <>
                      <Navigation size={14} />
                      <span>Start Visit</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Right Side: Visual Map */}
            <div className="site-visits-map-pane">
              <VisualMap
                startLat={coords?.latitude}
                startLng={coords?.longitude}
                startLabel="Start Location"
              />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
