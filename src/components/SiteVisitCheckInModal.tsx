import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  MapPin,
  Camera,
  Navigation,
  X,
  CheckCircle,
  AlertCircle,
  Building,
  User,
  Phone,
  Gauge,
  Sparkles,
  Loader2,
} from "lucide-react";
import { getCurrentCoordinates } from "../lib/geolocation";
import { reverseGeocodeCoords, uploadVisitPhoto, TRAVEL_MODES, TravelModeKey, calculateGeodesicDistanceKm } from "../lib/site-visits";
import CameraCaptureModal from "./CameraCaptureModal";

interface SiteVisitCheckInModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (newVisit: any) => void;
  companyId: string;
  userId: string;
  userName?: string;
  previousVisit?: any | null;
  officeLocations?: Array<{ id: string; name: string; latitude: number; longitude: number }>;
}

export default function SiteVisitCheckInModal({
  open,
  onClose,
  onSuccess,
  companyId,
  userId,
  userName = "Field Executive",
  previousVisit = null,
  officeLocations = [],
}: SiteVisitCheckInModalProps) {
  const [clientName, setClientName] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [purpose, setPurpose] = useState("Client Meeting / Demo");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [travelMode, setTravelMode] = useState<TravelModeKey>("two_wheeler");
  const [odometerStart, setOdometerStart] = useState("");
  const [notes, setNotes] = useState("");

  // Origin / Starting Location State
  const [originType, setOriginType] = useState<"office" | "previous_site" | "home" | "custom_location">("office");
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>("");
  const [customOriginLabel, setCustomOriginLabel] = useState("");
  const [originCoords, setOriginCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  // GPS State (Destination Site)
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [addressText, setAddressText] = useState("");

  // Estimated origin-to-site travel distance
  const [travelDistanceKm, setTravelDistanceKm] = useState<number>(0);

  // Camera State
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);

  // Submit loading
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Set default office when available
  useEffect(() => {
    if (officeLocations.length > 0 && !selectedOfficeId) {
      const firstOffice = officeLocations[0];
      if (firstOffice) {
        setSelectedOfficeId(firstOffice.id);
        setOriginCoords({
          latitude: firstOffice.latitude,
          longitude: firstOffice.longitude,
        });
      }
    }
  }, [officeLocations, selectedOfficeId]);

  // Update origin coordinates based on selected origin type
  useEffect(() => {
    if (originType === "office") {
      const office = officeLocations.find((o) => o.id === selectedOfficeId) || officeLocations[0];
      if (office) {
        setOriginCoords({ latitude: office.latitude, longitude: office.longitude });
      }
    } else if (originType === "previous_site" && previousVisit) {
      const prevLat = previousVisit.check_out_lat || previousVisit.check_in_lat;
      const prevLng = previousVisit.check_out_lng || previousVisit.check_in_lng;
      if (prevLat && prevLng) {
        setOriginCoords({ latitude: prevLat, longitude: prevLng });
      }
    } else if (originType === "home") {
      setOriginCoords(null);
    }
  }, [originType, selectedOfficeId, previousVisit, officeLocations]);

  // Compute origin to destination distance whenever coordinates update
  useEffect(() => {
    if (originCoords && coords) {
      const dist = calculateGeodesicDistanceKm(
        originCoords.latitude,
        originCoords.longitude,
        coords.latitude,
        coords.longitude
      );
      setTravelDistanceKm(dist);
    } else {
      setTravelDistanceKm(0);
    }
  }, [originCoords, coords]);

  // Auto-acquire GPS coordinate on modal open
  useEffect(() => {
    if (open) {
      handleAcquireGPS();
      setSubmitError(null);
    } else {
      setClientName("");
      setClientAddress("");
      setPurpose("Client Meeting / Demo");
      setContactPerson("");
      setContactPhone("");
      setOdometerStart("");
      setNotes("");
      setPhotoDataUrl(null);
      setGpsError(null);
    }
  }, [open]);

  const handleAcquireGPS = async () => {
    setIsLocating(true);
    setGpsError(null);
    try {
      const pos = await getCurrentCoordinates();
      setCoords(pos);
      const addr = await reverseGeocodeCoords(pos.latitude, pos.longitude);
      setAddressText(addr);
      if (!clientAddress) {
        setClientAddress(addr);
      }
    } catch (err: any) {
      console.error("GPS error:", err);
      setGpsError(err.message || "Failed to acquire GPS location. Please check device permissions.");
    } finally {
      setIsLocating(false);
    }
  };

  const handleOpenPhotoCapture = () => {
    if (!coords) {
      handleAcquireGPS();
    }
    setCameraModalOpen(true);
  };

  const handleCapturePhoto = (dataUrl: string) => {
    setPhotoDataUrl(dataUrl);
  };

  const handleSubmitCheckIn = async () => {
    if (!clientName.trim()) {
      setSubmitError("Please specify the client / company name.");
      return;
    }
    if (!coords) {
      setSubmitError("GPS coordinates are mandatory to lock your field check-in.");
      return;
    }
    if (!photoDataUrl) {
      setSubmitError("Please capture a live photo to verify your site presence.");
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
          },
        });
        if (uploadRes.success && uploadRes.url) {
          uploadedUrl = uploadRes.url;
        } else {
          console.warn("Cloudinary upload issue, continuing with fallback:", uploadRes.error);
          uploadedUrl = photoDataUrl;
        }
      }

      const selectedModeConfig = TRAVEL_MODES.find((m) => m.id === travelMode);
      const defaultRate = selectedModeConfig?.defaultRate || 6.0;

      let originLabel = "Main Office";
      if (originType === "office") {
        const off = officeLocations.find((o) => o.id === selectedOfficeId);
        originLabel = off ? `Office: ${off.name}` : "Company Office";
      } else if (originType === "previous_site" && previousVisit) {
        originLabel = `Previous Site: ${previousVisit.client_name}`;
      } else if (originType === "home") {
        originLabel = "Starting from Home / Residence";
      } else {
        originLabel = customOriginLabel.trim() || "Custom Starting Location";
      }

      const calculatedKm = travelDistanceKm > 0 ? travelDistanceKm : 0;
      const reimbursementAmount = Math.round(calculatedKm * defaultRate * 100) / 100;

      const visitPayload = {
        company_id: companyId,
        user_id: userId,
        client_name: clientName.trim(),
        client_address: clientAddress.trim() || addressText,
        purpose: purpose.trim(),
        status: "in_progress",

        origin_type: originType,
        origin_label: originLabel,
        origin_lat: originCoords?.latitude || null,
        origin_lng: originCoords?.longitude || null,

        check_in_time: new Date().toISOString(),
        check_in_lat: coords.latitude,
        check_in_lng: coords.longitude,
        check_in_accuracy: accuracy || 10,
        check_in_photo_url: uploadedUrl,
        check_in_address: addressText,

        odometer_start_km: odometerStart ? parseFloat(odometerStart) : null,
        travel_mode: travelMode,
        rate_per_km: defaultRate,
        calculated_distance_km: calculatedKm,
        reimbursement_amount: reimbursementAmount,
        reimbursement_status: "unclaimed",

        contact_person: contactPerson.trim() || null,
        contact_phone: contactPhone.trim() || null,
        notes: notes.trim() || null,
      };

      onSuccess(visitPayload);
      onClose();
    } catch (err: any) {
      console.error("Check-in error:", err);
      setSubmitError(err.message || "Failed to complete check-in.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
                  Client Site Check-In
                </Dialog.Title>
                <p className="modal-desc">
                  GPS verification & live photo capture
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

              {/* 1. Origin Starting Point & Auto Distance HUD */}
              <div >
                <p >
                  Starting Point (Travel Origin)
                </p>

                <div >
                  {[
                    { id: "office", label: "Company Office" },
                    { id: "previous_site", label: previousVisit ? "Previous Site" : "Last Client", disabled: !previousVisit },
                    { id: "home", label: "From Home" },
                    { id: "custom_location", label: "Other Point" },
                  ].map((opt) => {
                    const isSel = originType === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={opt.disabled}
                        onClick={() => {
                          if (!opt.disabled) setOriginType(opt.id as any);
                        }}
                        className={`${ isSel ? "" : opt.disabled ? "" : "" }`}
                      >
                        <p >{opt.label}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Office dropdown if multiple offices */}
                {originType === "office" && officeLocations.length > 0 && (
                  <div >
                    <label >Select Office Branch</label>
                    <select
                      value={selectedOfficeId}
                      onChange={(e) => setSelectedOfficeId(e.target.value)}
                      
                    >
                      {officeLocations.map((off) => (
                        <option key={off.id} value={off.id}>
                          {off.name} ({off.latitude.toFixed(3)}, {off.longitude.toFixed(3)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Previous site info preview */}
                {originType === "previous_site" && previousVisit && (
                  <div >
                    <p >
                      Departing from: {previousVisit.client_name}
                    </p>
                    <p >
                      {previousVisit.client_address || previousVisit.check_in_address}
                    </p>
                  </div>
                )}

                {/* Custom Location input */}
                {originType === "custom_location" && (
                  <div >
                    <input
                      type="text"
                      placeholder="e.g. Metro Station, Client Hub, Warehouse..."
                      value={customOriginLabel}
                      onChange={(e) => setCustomOriginLabel(e.target.value)}
                      
                    />
                  </div>
                )}

                {/* Calculated Geodesic Distance from Origin */}
                {travelDistanceKm > 0 && (
                  <div >
                    <span >Auto-calculated distance from origin:</span>
                    <span >{travelDistanceKm.toFixed(1)} km</span>
                  </div>
                )}
              </div>

              {/* 2. Destination Site GPS Lock Status Box */}
              <div className={`${ coords ? "" : "" }`}>
                <div >
                  <div className={`${ coords ? "" : "" }`}>
                    {isLocating ? (
                      <Loader2 size={16}  />
                    ) : coords ? (
                      <CheckCircle size={16} />
                    ) : (
                      <AlertCircle size={16} />
                    )}
                  </div>
                  <div >
                    <p className={`${coords ? "" : ""}`}>
                      {coords ? "Target Site GPS Locked" : isLocating ? "Acquiring GPS..." : "GPS Signal Required"}
                    </p>
                    <p >
                      {addressText || (coords ? `Lat: ${coords.latitude.toFixed(4)}, Lng: ${coords.longitude.toFixed(4)}` : "Click to refresh")}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAcquireGPS}
                  disabled={isLocating}
                  
                >
                  {coords ? "Re-lock" : "Locate"}
                </button>
              </div>

              {/* 3. Form Inputs */}
              <div >
                <div>
                  <label >
                    Client / Company Name <span >*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Apex Healthcare Solutions"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    required
                    
                  />
                </div>

                <div >
                  <div>
                    <label >Visit Purpose</label>
                    <select
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                      
                    >
                      <option value="Client Meeting">Client Meeting</option>
                      <option value="On-Site Inspection">On-Site Inspection</option>
                      <option value="Service / Maintenance">Service / Maintenance</option>
                      <option value="Contract Discussion">Contract Discussion</option>
                      <option value="Product Demonstration">Product Demonstration</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label >Travel Mode</label>
                    <select
                      value={travelMode}
                      onChange={(e) => setTravelMode(e.target.value as TravelModeKey)}
                      
                    >
                      {TRAVEL_MODES.map((mode) => (
                        <option key={mode.id} value={mode.id}>
                          {mode.label} ({mode.defaultRate > 0 ? `₹${mode.defaultRate}/km` : "No Rate"})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div >
                  <div>
                    <label >Contact Person</label>
                    <input
                      type="text"
                      placeholder="e.g. Rajesh Sharma"
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      
                    />
                  </div>
                  <div>
                    <label >Contact Phone</label>
                    <input
                      type="text"
                      placeholder="e.g. +91 98765 43210"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      
                    />
                  </div>
                </div>

                <div>
                  <label >Starting Odometer Reading (km)</label>
                  <input
                    type="number"
                    placeholder="e.g. 14250.5"
                    value={odometerStart}
                    onChange={(e) => setOdometerStart(e.target.value)}
                    
                  />
                </div>

                {/* Photo Capture Card */}
                <div>
                  <p >
                    Live Site Photo Proof <span >*</span>
                  </p>
                  {photoDataUrl ? (
                    <div >
                      <img
                        src={photoDataUrl}
                        alt="Captured preview"
                        
                      />
                      <div >
                        <button
                          type="button"
                          onClick={handleOpenPhotoCapture}
                          
                        >
                          <Camera size={13} /> Retake
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenPhotoCapture}
                      
                    >
                      <div >
                        <Camera size={18} />
                      </div>
                      <p >Take Site Photo</p>
                      <p >Live GPS location and timestamp watermarking</p>
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
                onClick={handleSubmitCheckIn}
                disabled={isSubmitting || !coords || !photoDataUrl || !clientName.trim()}
                
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16}  />
                    <span>Locking Check-In...</span>
                  </>
                ) : (
                  <>
                    <Navigation size={16} />
                    <span>Confirm Site Check-In</span>
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
        onCapture={handleCapturePhoto}
        title={`Take Photo at ${clientName || "Client Site"}`}
        clientName={clientName || "Client Site"}
        userName={userName}
        coords={coords}
        addressText={addressText}
      />
    </>
  );
}
