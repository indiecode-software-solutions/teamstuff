import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  Camera,
  MapPin,
  X,
  Gauge,
  Receipt,
  Sparkles,
  ArrowRight,
  Route,
  Loader2,
} from "lucide-react";
import { getCurrentCoordinates } from "../lib/geolocation";
import {
  reverseGeocodeCoords,
  uploadVisitPhoto,
  calculateGeodesicDistanceKm,
  TRAVEL_MODES,
  SiteVisit,
} from "../lib/site-visits";
import CameraCaptureModal from "./CameraCaptureModal";

interface SiteVisitCheckOutModalProps {
  open: boolean;
  onClose: () => void;
  visit: SiteVisit | null;
  onSuccess: (updatedVisit: any) => void;
  companyId: string;
  userId: string;
  userName?: string;
}

export default function SiteVisitCheckOutModal({
  open,
  onClose,
  visit,
  onSuccess,
  companyId,
  userId,
  userName = "Field Executive",
}: SiteVisitCheckOutModalProps) {
  const [outcomeSummary, setOutcomeSummary] = useState("");
  const [odometerEnd, setOdometerEnd] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  // GPS State
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [addressText, setAddressText] = useState("");

  // Distance computation
  const [calculatedKm, setCalculatedKm] = useState(0);
  const [finalDistanceKm, setFinalDistanceKm] = useState(0);

  // Camera State
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  // Submit loading
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Initialize
  useEffect(() => {
    if (open && visit) {
      handleAcquireGPS();
      setSubmitError(null);
      setOutcomeSummary("");
      setAdditionalNotes("");
      setPhotoDataUrl(null);
    }
  }, [open, visit]);

  const handleAcquireGPS = async () => {
    setIsLocating(true);
    try {
      const pos = await getCurrentCoordinates();
      setCoords(pos);
      const addr = await reverseGeocodeCoords(pos.latitude, pos.longitude);
      setAddressText(addr);

      // Calculate distance between check-in and check-out coordinates
      if (visit?.check_in_lat && visit?.check_in_lng) {
        const dist = calculateGeodesicDistanceKm(
          visit.check_in_lat,
          visit.check_in_lng,
          pos.latitude,
          pos.longitude
        );
        setCalculatedKm(dist);
        setFinalDistanceKm(dist > 0 ? dist : 0);
      }
    } catch (err: any) {
      console.warn("Check out GPS fetch error:", err);
    } finally {
      setIsLocating(false);
    }
  };

  // Recompute distance when odometer input changes
  useEffect(() => {
    if (visit?.odometer_start_km && odometerEnd) {
      const end = parseFloat(odometerEnd);
      const start = visit.odometer_start_km;
      if (!isNaN(end) && end >= start) {
        const odoDiff = Math.round((end - start) * 100) / 100;
        setFinalDistanceKm(odoDiff);
        return;
      }
    }
    setFinalDistanceKm(calculatedKm);
  }, [odometerEnd, calculatedKm, visit]);

  const handleCapturePhoto = (dataUrl: string) => {
    setPhotoDataUrl(dataUrl);
  };

  const handleSubmitCheckOut = async () => {
    if (!outcomeSummary.trim()) {
      setSubmitError("Please provide a brief outcome summary of the site meeting.");
      return;
    }
    if (!coords) {
      setSubmitError("GPS coordinates are required to complete check-out.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      let uploadedUrl: string | null = null;
      if (photoDataUrl) {
        const uploadRes = await uploadVisitPhoto({
          data: {
            base64Data: photoDataUrl,
            companyId,
            userId,
            ...(visit?.id ? { visitId: visit.id } : {}),
          },
        });
        if (uploadRes.success && uploadRes.url) {
          uploadedUrl = uploadRes.url;
        } else {
          uploadedUrl = photoDataUrl;
        }
      }

      const ratePerKm = visit?.rate_per_km || 6.0;
      const reimbursementAmount = Math.round(finalDistanceKm * ratePerKm * 100) / 100;

      const updatePayload = {
        status: "completed",
        check_out_time: new Date().toISOString(),
        check_out_lat: coords.latitude,
        check_out_lng: coords.longitude,
        check_out_photo_url: uploadedUrl,
        check_out_address: addressText,
        odometer_end_km: odometerEnd ? parseFloat(odometerEnd) : null,
        calculated_distance_km: finalDistanceKm,
        reimbursement_amount: reimbursementAmount,
        outcome_summary: outcomeSummary.trim(),
        notes: additionalNotes.trim() ? `${visit?.notes || ""}\n${additionalNotes.trim()}`.trim() : visit?.notes,
      };

      onSuccess(updatePayload);
      onClose();
    } catch (err: any) {
      console.error("Check-out error:", err);
      setSubmitError(err.message || "Failed to complete check-out.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visit) return null;

  const rate = visit.rate_per_km || 6.0;
  const estimatedReimbursement = Math.round(finalDistanceKm * rate * 100) / 100;

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal-content site-visits-modal-content">
            {/* Header */}
            <div className="modal-header">
              <div>
                <Dialog.Title className="modal-title">
                  Complete Site Check-Out
                </Dialog.Title>
                <p className="modal-desc">
                  {visit.client_name} · Checked in at {new Date(visit.start_time || visit.check_in_time || "").toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="modal-close-btn"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div >
              {submitError && (
                <div >
                  {submitError}
                </div>
              )}

              {/* Travel & Reimbursement Calculation Card */}
              <div >
                <div >
                  <span >
                    Distance & Reimbursement
                  </span>
                  <span >
                    ₹{rate}/km · {(visit.travel_mode || "two_wheeler").replace("_", " ")}
                  </span>
                </div>

                <div >
                  <div>
                    <span >Tracked Distance</span>
                    <span >
                      {finalDistanceKm.toFixed(2)} <span >km</span>
                    </span>
                  </div>
                  <div >
                    <span >Eligible Expense</span>
                    <span >
                      ₹{estimatedReimbursement.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Inputs */}
              <div >
                <div>
                  <label >
                    Meeting Outcome & Summary <span >*</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Completed product demo. Received positive feedback and requested commercial quote."
                    value={outcomeSummary}
                    onChange={(e) => setOutcomeSummary(e.target.value)}
                    required
                    
                  />
                </div>

                <div >
                  <div>
                    <label >
                      Ending Odometer Reading (km)
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 14275.0"
                      value={odometerEnd}
                      onChange={(e) => setOdometerEnd(e.target.value)}
                      
                    />
                    {visit.odometer_start_km && (
                      <span >
                        Start: {visit.odometer_start_km} km
                      </span>
                    )}
                  </div>

                  <div>
                    <label >
                      Check-Out Location
                    </label>
                    <input
                      type="text"
                      disabled
                      value={addressText || (coords ? `Lat: ${coords.latitude.toFixed(4)}, Lng: ${coords.longitude.toFixed(4)}` : "Acquiring GPS...")}
                      
                    />
                  </div>
                </div>

                {/* Check-Out Photo */}
                <div>
                  <p >
                    Exit / Sign-Off Photo (Optional)
                  </p>
                  {photoDataUrl ? (
                    <div >
                      <img
                        src={photoDataUrl}
                        alt="Exit preview"
                        
                      />
                      <button
                        type="button"
                        onClick={() => setCameraModalOpen(true)}
                        
                      >
                        Retake
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCameraModalOpen(true)}
                      
                    >
                      <Camera size={16}  />
                      <span >
                        Take Exit Photo or Signature Document
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div >
              <button
                type="button"
                onClick={onClose}
                
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleSubmitCheckOut}
                disabled={isSubmitting || !outcomeSummary.trim() || !coords}
                
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16}  />
                    <span>Completing Visit...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Confirm Check-Out</span>
                  </>
                )}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <CameraCaptureModal
        open={cameraModalOpen}
        onClose={() => setCameraModalOpen(false)}
        onCapture={handleCapturePhoto}
        title={`Check-Out Photo · ${visit.client_name}`}
        clientName={visit.client_name}
        userName={userName}
        coords={coords}
        addressText={addressText}
      />
    </>
  );
}
