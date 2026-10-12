import React, { useState, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Camera,
  RefreshCw,
  X,
  Check,
  Zap,
  MapPin,
  RotateCcw,
  Sparkles,
  Loader2,
} from "lucide-react";
import { stampWatermarkOnPhoto } from "../lib/site-visits";

interface CameraCaptureModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (watermarkedDataUrl: string) => void;
  title?: string;
  clientName?: string;
  userName?: string;
  coords?: { latitude: number; longitude: number } | null;
  addressText?: string;
}

export default function CameraCaptureModal({
  open,
  onClose,
  onCapture,
  title = "Verify & Capture Site Photo",
  clientName = "Client Site",
  userName = "Field Executive",
  coords,
  addressText = "GPS Verified Location",
}: CameraCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isWatermarking, setIsWatermarking] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Initialize camera stream
  useEffect(() => {
    if (!open) {
      stopCameraStream();
      setCapturedImage(null);
      setCameraError(null);
      return;
    }

    startCameraStream();

    return () => {
      stopCameraStream();
    };
  }, [open, facingMode]);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startCameraStream = async () => {
    setIsInitializing(true);
    setCameraError(null);
    stopCameraStream();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera hardware is not accessible in this browser.");
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((err) => console.warn("Video play error:", err));
      }
    } catch (err: any) {
      console.warn("Camera init failed, trying fallback:", err);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (fallbackErr: any) {
        setCameraError(fallbackErr.message || "Unable to access camera. Please allow camera permissions.");
      }
    } finally {
      setIsInitializing(false);
    }
  };

  const handleFlipCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const handleTakeSnapshot = async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const rawDataUrl = canvas.toDataURL("image/jpeg", 0.95);
    setCapturedImage(rawDataUrl);
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCameraStream();
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      onClose();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-content">
          {/* Dialog Header */}
          <div className="modal-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Camera size={18} color="var(--color-primary)" />
              <Dialog.Title className="modal-title">
                {title}
              </Dialog.Title>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="modal-close-btn"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Camera / Viewfinder Body */}
          <div >
            {cameraError ? (
              <div >
                <div >
                  {cameraError}
                </div>
                <button
                  type="button"
                  onClick={startCameraStream}
                  
                >
                  Retry Camera Access
                </button>
              </div>
            ) : capturedImage ? (
              /* Preview of Photo */
              <div >
                <img
                  src={capturedImage}
                  alt="Captured proof"
                  
                />
              </div>
            ) : (
              /* Live Viewfinder */
              <div >
                <div >
                  {isInitializing && (
                    <div >
                      <Loader2 size={28}  />
                      <span >Initializing camera...</span>
                    </div>
                  )}

                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{
                      transform: facingMode === "user" ? "scaleX(-1)" : "none",
                    }}
                    
                  />

                  {/* Flip camera button */}
                  <div >
                    <button
                      type="button"
                      onClick={handleFlipCamera}
                      title="Flip Camera"
                      
                    >
                      <RotateCcw size={15} />
                    </button>
                  </div>
                </div>

                {/* Verified Location Card Below Camera */}
                <div >
                  <p >
                    {clientName} {userName ? `· ${userName}` : ""}
                  </p>
                  <p >
                    {addressText}
                  </p>
                  <p >
                    {coords ? `📍 ${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)} · ✓ Live GPS Verified` : "📍 Acquiring GPS..."}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div >
            {capturedImage ? (
              <>
                <button
                  type="button"
                  onClick={handleRetake}
                  
                >
                  <RotateCcw size={15} /> Retake
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  
                >
                  <Check size={15} /> Confirm Photo
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleTakeSnapshot}
                  disabled={isInitializing || isWatermarking || Boolean(cameraError)}
                  
                >
                  {isWatermarking ? (
                    <>
                      <Loader2 size={15}  />
                      <span>Watermarking...</span>
                    </>
                  ) : (
                    <>
                      <Camera size={15} />
                      <span>Capture Photo</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
