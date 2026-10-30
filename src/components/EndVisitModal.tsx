import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Camera,
  CheckCircle,
  Navigation,
  StopCircle,
  Loader2,
  Compass,
} from "lucide-react";
import { getCurrentCoordinates } from "../lib/geolocation";
import {
  reverseGeocodeCoords,
  uploadVisitPhoto,
  FieldVisit,
} from "../lib/site-visits";
import CameraCaptureModal from "./CameraCaptureModal";
import VisualMap from "./VisualMap";

interface EndVisitModalProps {
  open: boolean;
  onClose: () => void;
  visit: FieldVisit | null;
  onSuccess: (updatedFields: Partial<FieldVisit>) => void;
  onCompleteAndStartNext?: (
    completedVisit: Partial<FieldVisit>,
    nextStartCoords?: { latitude: number; longitude: number },
    nextAddress?: string
  ) => void;
  companyId: string;
  userId: string;
  userName?: string;
}

export default function EndVisitModal({
  open,
  onClose,
  visit,
  onSuccess,
  onCompleteAndStartNext,
  companyId,
  userId,
  userName = "Employee",
}: EndVisitModalProps) {
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [addressText, setAddressText] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-acquire current GPS when modal opens
  useEffect(() => {
    if (open && visit) {
      setPhotoDataUrl(null);
      setErrorMsg(null);
      handleAcquireGPS();
    }
  }, [open, visit]);

  const handleAcquireGPS = async () => {
    setIsLocating(true);
    try {
      const pos = await getCurrentCoordinates();
      setCoords(pos);
      const addr = await reverseGeocodeCoords(pos.latitude, pos.longitude);
      setAddressText(addr);
    } catch (err: any) {
      console.warn("End visit GPS fallback:", err);
      if (visit) {
        setCoords({ latitude: visit.start_lat, longitude: visit.start_lng });
        setAddressText(visit.start_address || "Location captured");
      }
    } finally {
      setIsLocating(false);
    }
  };

  const handlePhotoCaptured = (watermarkedUrl: string) => {
    setPhotoDataUrl(watermarkedUrl);
  };

  const handleConfirmEnd = async (continueToNext: boolean = false) => {
    if (!visit) return;
    if (!photoDataUrl) {
      setErrorMsg("Please capture a photo before completing the visit.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      let uploadedUrl: string | null = null;
      try {
        const uploadRes = await uploadVisitPhoto({
          data: {
            base64Data: photoDataUrl,
            companyId,
            userId,
            visitId: visit.id,
          },
        });
        if (uploadRes.success && uploadRes.url) {
          uploadedUrl = uploadRes.url;
        } else {
          uploadedUrl = photoDataUrl;
        }
      } catch (uploadErr) {
        console.warn("R2 upload fallback:", uploadErr);
        uploadedUrl = photoDataUrl;
      }

      const updatePayload: Partial<FieldVisit> = {
        status: "completed",
        end_time: new Date().toISOString(),
        end_lat: coords?.latitude || visit.start_lat,
        end_lng: coords?.longitude || visit.start_lng,
        end_address: addressText || visit.start_address || "Location captured",
        end_photo_url: uploadedUrl,
      };

      if (continueToNext && onCompleteAndStartNext) {
        onCompleteAndStartNext(
          updatePayload,
          coords || { latitude: visit.start_lat, longitude: visit.start_lng },
          addressText || visit.start_address || ""
        );
      } else {
        onSuccess(updatePayload);
      }
      onClose();
    } catch (err: any) {
      console.error("Error ending visit:", err);
      setErrorMsg(err.message || "Failed to complete visit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visit) return null;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="site-visits-modal-overlay" />
          <Dialog.Content className="site-visits-modal-content">
            {/* Header */}
            <div className="site-visits-modal-header">
              <div className="site-visits-modal-title-group">
                <div className="site-visits-modal-icon-badge" style={{ backgroundColor: "#fef2f2", color: "#ef4444" }}>
                  <StopCircle size={18} />
                </div>
                <div>
                  <Dialog.Title className="site-visits-modal-title">
                    Complete Visit · {visit.client_name}
                  </Dialog.Title>
                  <p className="site-visits-modal-desc">
                    Capture photo proof & geotagged timestamp to complete or continue
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
              {/* Left Pane: Exit Details & Photo Trigger */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
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
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                    {isLocating ? (
                      <Loader2 size={16} className="animate-spin" style={{ color: "#2563eb" }} />
                    ) : (
                      <CheckCircle size={16} style={{ color: "#059669" }} />
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                      <span className="site-visits-gps-badge">
                        {isLocating ? "Acquiring GPS..." : "Location Captured"}
                      </span>
                      <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#334155" }}>
                        {addressText || "Capturing current location..."}
                      </p>
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

                {/* Photo Capture Section */}
                <div className="site-visits-form-group">
                  <label className="site-visits-form-label">
                    Verification Photo Proof <span style={{ color: "#ef4444" }}>*</span>
                  </label>

                  {photoDataUrl ? (
                    <div
                      style={{
                        position: "relative",
                        borderRadius: "8px",
                        overflow: "hidden",
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      <img
                        src={photoDataUrl}
                        alt="End visit photo"
                        style={{ width: "100%", height: "180px", objectFit: "cover" }}
                      />
                      <button
                        type="button"
                        onClick={() => setCameraModalOpen(true)}
                        style={{
                          position: "absolute",
                          bottom: "8px",
                          right: "8px",
                          backgroundColor: "rgba(15, 23, 42, 0.8)",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "6px",
                          padding: "6px 12px",
                          fontSize: "12px",
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        Retake Photo
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCameraModalOpen(true)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        padding: "24px 16px",
                        borderRadius: "8px",
                        border: "1.5px dashed #cbd5e1",
                        backgroundColor: "#f8fafc",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <div
                        style={{
                          width: "38px",
                          height: "38px",
                          borderRadius: "50%",
                          backgroundColor: "#eff6ff",
                          color: "#2563eb",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Camera size={18} />
                      </div>
                      <p style={{ margin: 0, fontSize: "13px", fontWeight: 500, color: "#0f172a" }}>
                        Take Geotagged Photo Proof
                      </p>
                      <p style={{ margin: 0, fontSize: "11px", color: "#64748b" }}>
                        Live camera watermark with GPS, date & time
                      </p>
                    </button>
                  )}
                </div>
              </div>

              {/* Right Pane: Visual Map */}
              <div className="site-visits-map-pane">
                <VisualMap
                  startLat={visit.start_lat}
                  startLng={visit.start_lng}
                  startLabel="Start Location"
                  endLat={coords?.latitude || visit.start_lat}
                  endLng={coords?.longitude || visit.start_lng}
                  endLabel="End Location"
                />
              </div>
            </div>

            {/* Modal Footer spanning full width in a single line */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "10px",
                paddingTop: "14px",
                borderTop: "1px solid #f1f5f9",
                flexWrap: "nowrap",
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={{
                  height: "36px",
                  padding: "0 16px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  backgroundColor: "#ffffff",
                  color: "#334155",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                Cancel
              </button>

              {onCompleteAndStartNext && (
                <button
                  type="button"
                  onClick={() => handleConfirmEnd(true)}
                  disabled={isSubmitting || !photoDataUrl}
                  style={{
                    height: "36px",
                    padding: "0 14px",
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    backgroundColor: "#f8fafc",
                    color: "#0f172a",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: isSubmitting || !photoDataUrl ? "not-allowed" : "pointer",
                    opacity: isSubmitting || !photoDataUrl ? 0.5 : 1,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    transition: "all 0.15s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Compass size={14} />
                  <span>Next Stop →</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleConfirmEnd(false)}
                disabled={isSubmitting || !photoDataUrl}
                style={{
                  height: "36px",
                  padding: "0 18px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#ef4444",
                  color: "#ffffff",
                  fontSize: "13px",
                  fontWeight: 500,
                  cursor: isSubmitting || !photoDataUrl ? "not-allowed" : "pointer",
                  opacity: isSubmitting || !photoDataUrl ? 0.5 : 1,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  transition: "all 0.15s ease",
                  boxShadow: "0 1px 2px rgba(239, 68, 68, 0.2)",
                  whiteSpace: "nowrap",
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Completing...</span>
                  </>
                ) : (
                  <>
                    <StopCircle size={14} />
                    <span>Complete Visit</span>
                  </>
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCapture={handlePhotoCaptured}
        title={`End Visit Photo · ${visit.client_name}`}
        clientName={visit.client_name}
        userName={userName}
        coords={coords}
        addressText={addressText}
      />
    </>
  );
}
