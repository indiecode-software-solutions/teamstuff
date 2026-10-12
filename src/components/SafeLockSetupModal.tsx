import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ShieldCheck,
  X,
  ArrowRight,
  Loader2,
} from "lucide-react";
import {
  SafeLockConfig,
  RECOVERY_QUESTIONS,
  AVAILABLE_SERVICES,
  hashString,
  saveSafeLockConfig,
  unlockSession,
} from "../lib/safelock";

// Invisible input + 4 visual custom styled boxes (100% immune to browser/iCloud password autofill popups)
const PinInputBoxes: React.FC<{
  value: string;
  onChange: (val: string) => void;
  onEnter?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
}> = ({ value, onChange, onEnter, autoFocus = true, disabled = false }) => {
  const hiddenInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (autoFocus && !disabled) {
      const timer = setTimeout(() => {
        hiddenInputRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoFocus, disabled]);

  const digits = [value[0] || "", value[1] || "", value[2] || "", value[3] || ""];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const clean = e.target.value.replace(/\D/g, "").slice(0, 4);
    onChange(clean);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.length === 4 && onEnter && !disabled) {
      onEnter();
    }
  };

  return (
    <div
      onClick={() => {
        if (!disabled) hiddenInputRef.current?.focus();
      }}
      className={`safelock-setup-input-wrap ${disabled ? "disabled" : ""}`}
    >
      {/* Hidden single input controlling the value */}
      <input
        ref={hiddenInputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        disabled={disabled}
        autoComplete="off"
        data-form-type="other"
        data-lpignore="true"
        data-1p-ignore="true"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        className="safelock-setup-hidden-input"
        style={{ cursor: disabled ? "not-allowed" : "text" }}
      />

      {/* 4 Visual Digit Boxes */}
      <div className="safelock-setup-boxes">
        {[0, 1, 2, 3].map((idx) => {
          const isFilled = Boolean(digits[idx]);
          const isCurrent = !disabled && value.length === idx;
          return (
            <div
              key={idx}
              className={`safelock-setup-box ${isCurrent ? "current" : isFilled ? "filled" : ""}`}
            >
              {isFilled ? (
                <div className="safelock-setup-dot" />
              ) : isCurrent ? (
                <div className="safelock-setup-cursor" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface SafeLockSetupModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  existingConfig?: SafeLockConfig | null;
  onSuccess: (config: SafeLockConfig) => void;
  mandatory?: boolean;
}

export const SafeLockSetupModal: React.FC<SafeLockSetupModalProps> = ({
  open,
  onClose,
  userId,
  existingConfig,
  onSuccess,
  mandatory = false,
}) => {
  const [step, setStep] = useState<number>(1);
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [question, setQuestion] = useState(existingConfig?.recoveryQuestion || RECOVERY_QUESTIONS[0]);
  const [answer, setAnswer] = useState("");
  const [hint, setHint] = useState(existingConfig?.hint || "");
  const [protectedServices, setProtectedServices] = useState<string[]>(
    existingConfig?.protectedTabs || ["Salary"]
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [updateMode, setUpdateMode] = useState<"all" | "services_only">("all");

  const isUpdating = Boolean(existingConfig && existingConfig.pinHash);

  useEffect(() => {
    if (open) {
      setStep(isUpdating ? 0 : 1);
      setUpdateMode("all");
      setCurrentPin("");
      setPin("");
      setConfirmPin("");
      setAnswer("");
      setError(null);
      setHint(existingConfig?.hint || "");
      setQuestion(existingConfig?.recoveryQuestion || RECOVERY_QUESTIONS[0]);
      setProtectedServices(existingConfig?.protectedTabs || ["Salary"]);
    }
  }, [open, existingConfig, isUpdating]);

  const handleToggleService = (key: string) => {
    if (key === "Salary") return; // mandatory
    setProtectedServices((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const handleVerifyCurrentPin = async () => {
    setError(null);
    if (currentPin.length !== 4) {
      setError("Please enter your 4-digit current PIN.");
      return;
    }
    const hash = await hashString(currentPin);
    if (existingConfig && hash !== existingConfig.pinHash) {
      setError("Incorrect current PIN. Please enter the valid PIN to update settings.");
      return;
    }
    setStep(1);
  };

  const handleKeepPinAndModifyServices = async () => {
    setError(null);
    if (currentPin.length !== 4) {
      setError("Please enter your 4-digit current PIN.");
      return;
    }
    const hash = await hashString(currentPin);
    if (existingConfig && hash !== existingConfig.pinHash) {
      setError("Incorrect current PIN. Please enter the valid PIN to update settings.");
      return;
    }
    setUpdateMode("services_only");
    setStep(3);
  };

  const handleProceedFromStep1 = () => {
    setError(null);
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError("PIN must be exactly 4 numeric digits.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match. Please re-enter.");
      return;
    }
    setStep(2);
  };

  const handleProceedFromStep2 = () => {
    setError(null);
    if (!answer.trim()) {
      setError("Please provide an answer to your recovery security question.");
      return;
    }
    setStep(3);
  };

  const handleSave = async () => {
    setError(null);
    setIsSubmitting(true);

    try {
      let pinHash = existingConfig?.pinHash;
      let finalHint = existingConfig?.hint || "";
      let finalQuestion = existingConfig?.recoveryQuestion || RECOVERY_QUESTIONS[0];
      let recoveryAnswerHash = existingConfig?.recoveryAnswerHash || "";

      if (updateMode === "all" || !existingConfig) {
        pinHash = await hashString(pin);
        recoveryAnswerHash = await hashString(answer.trim().toLowerCase());
        finalHint = hint.trim();
        finalQuestion = question;
      }

      const config: SafeLockConfig = {
        enabled: true,
        pinHash: pinHash!,
        hint: finalHint,
        recoveryQuestion: finalQuestion || RECOVERY_QUESTIONS[0] || "What is your mother's maiden name?",
        recoveryAnswerHash,
        protectedTabs: Array.from(new Set(["Salary", ...protectedServices])),
        updatedAt: new Date().toISOString(),
      };

      await saveSafeLockConfig(userId, config);
      unlockSession(userId);
      onSuccess(config);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save SafeLock configuration.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={mandatory ? () => {} : (v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fade-in" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0, 0, 0, 0.4)", zIndex: 999 }} />
        <Dialog.Content className="safelock-modal-content">
          {/* Header */}
          <div className="safelock-modal-header">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div className="safelock-icon-box" style={{ margin: 0, width: 36, height: 36, borderRadius: 8 }}>
                <ShieldCheck size={18} />
              </div>
              <div>
                <Dialog.Title style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#242420" }}>
                  {mandatory ? "Welcome! Setup SafeLock" : existingConfig ? "Manage SafeLock" : "Set Up SafeLock"}
                </Dialog.Title>
                <p style={{ margin: 0, fontSize: 11, color: "#736f63" }}>
                  {step === 0
                    ? "Choose what you'd like to update"
                    : step === 1
                    ? "Set a 4-digit PIN for sensitive data"
                    : step === 2
                    ? "Recovery details in case you forget"
                    : "Select services to lock"}
                </p>
              </div>
            </div>

            {!mandatory && (
              <button
                onClick={onClose}
                className="btn-icon-subtle"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#736f63" }}
              >
                <X size={18} />
              </button>
            )}
          </div>

          <div className="safelock-modal-body">
            {/* Decoy fields */}
            <input type="text" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />
            <input type="password" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

            {error && (
              <div className="safelock-error">
                {error}
              </div>
            )}

            {mandatory && !existingConfig && (
              <div style={{ marginBottom: 16, padding: "10px 12px", borderRadius: 8, fontSize: 12, backgroundColor: "#FAF7EE", border: "0.5px solid #EAE5D8", color: "#545045" }}>
                To safeguard sensitive confidential data like <strong style={{ color: "#242420" }}>Payslips</strong>, creating a SafeLock 4-digit PIN is required before accessing this section.
              </div>
            )}

            {/* STEP 0: Verify Current PIN */}
            {step === 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#242420", margin: "0 0 4px 0" }}>
                    Enter Current 4-Digit PIN
                  </p>
                  <p style={{ fontSize: 11.5, color: "#736f63", margin: "0 0 16px 0" }}>
                    To change your PIN or modify settings, please enter your current PIN.
                  </p>

                  <PinInputBoxes
                    value={currentPin}
                    onChange={(val) => setCurrentPin(val)}
                    onEnter={handleVerifyCurrentPin}
                    autoFocus={true}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleVerifyCurrentPin}
                    className="safelock-btn-primary"
                  >
                    <span>Change PIN & Settings</span>
                    <ArrowRight size={16} />
                  </button>

                  <button
                    type="button"
                    onClick={handleKeepPinAndModifyServices}
                    className="safelock-btn-secondary"
                  >
                    Keep Current PIN & Change Protected Services Only
                  </button>
                </div>
              </div>
            )}

            {/* STEP 1: Set 4-digit PIN */}
            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: "#242420", margin: "0 0 8px 0" }}>
                    Enter New 4-Digit PIN
                  </p>
                  <PinInputBoxes
                    value={pin}
                    onChange={(val) => setPin(val)}
                    autoFocus={true}
                  />
                </div>

                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: pin.length === 4 ? "#242420" : "#A8A29E", margin: "0 0 8px 0" }}>
                    Confirm 4-Digit PIN
                  </p>
                  <PinInputBoxes
                    value={confirmPin}
                    onChange={(val) => setConfirmPin(val)}
                    disabled={pin.length < 4}
                    autoFocus={pin.length === 4}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#242420", marginBottom: 6 }}>
                    PIN Hint <span style={{ fontSize: 11, fontWeight: 400, color: "#736f63" }}>(Optional · Revealed on 3 wrong attempts)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Birthday year or bike number"
                    value={hint}
                    onChange={(e) => setHint(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  {isUpdating && (
                    <button
                      type="button"
                      onClick={() => setStep(0)}
                      className="safelock-btn-secondary"
                      style={{ flex: 1 }}
                    >
                      Back
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleProceedFromStep1}
                    className="safelock-btn-primary"
                    style={{ flex: isUpdating ? 2 : 1 }}
                  >
                    <span>Continue to Recovery Info</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: Recovery Question & Hint */}
            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#242420", marginBottom: 2 }}>
                    Security Recovery Question
                  </label>
                  <p style={{ fontSize: 11, color: "#736f63", margin: "0 0 8px 0" }}>
                    Used to reset your PIN if you forget it.
                  </p>
                  <select
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="form-input"
                  >
                    {RECOVERY_QUESTIONS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#242420", marginBottom: 6 }}>
                    Your Answer
                  </label>
                  <input
                    type="text"
                    placeholder="Enter recovery answer..."
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="safelock-btn-secondary"
                    style={{ flex: 1 }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleProceedFromStep2}
                    className="safelock-btn-primary"
                    style={{ flex: 2 }}
                  >
                    <span>Choose Protected Services</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: Protected Services Selection */}
            {step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: "#242420", margin: 0 }}>
                  Select features to protect with SafeLock PIN:
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {AVAILABLE_SERVICES.map((srv) => {
                    const isChecked = srv.mandatory || protectedServices.includes(srv.key);
                    return (
                      <div
                        key={srv.key}
                        onClick={() => !srv.mandatory && handleToggleService(srv.key)}
                        className={`safelock-service-item ${isChecked ? "checked" : ""}`}
                        style={{ cursor: srv.mandatory ? "default" : "pointer" }}
                      >
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#242420" }}>
                              {srv.label}
                            </span>
                            {srv.mandatory && (
                              <span style={{ fontSize: 10, fontWeight: 600, color: "#3B6D11", backgroundColor: "#EAF3DE", padding: "2px 6px", borderRadius: 4 }}>
                                MANDATORY
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: 11, color: "#736F63", margin: "2px 0 0 0" }}>
                            {srv.description}
                          </p>
                        </div>

                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={srv.mandatory}
                          onChange={() => {}}
                          style={{ accentColor: "#242420", width: 16, height: 16 }}
                        />
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (updateMode === "services_only") {
                        setStep(0);
                      } else {
                        setStep(2);
                      }
                    }}
                    disabled={isSubmitting}
                    className="safelock-btn-secondary"
                    style={{ flex: 1 }}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSubmitting}
                    className="safelock-btn-primary"
                    style={{ flex: 2 }}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={16} className="spin-animation" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={16} />
                        <span>Save SafeLock Settings</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
