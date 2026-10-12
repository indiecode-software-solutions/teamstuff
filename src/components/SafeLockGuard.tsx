import React, { useState, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Lock,
  Unlock,
  KeyRound,
  Delete,
  ShieldAlert,
  HelpCircle,
  X,
  Sparkles,
  Loader2,
} from "lucide-react";
import {
  SafeLockConfig,
  hashString,
  unlockSession,
  isSessionUnlocked,
  saveSafeLockConfig,
} from "../lib/safelock";
import { SafeLockSetupModal } from "./SafeLockSetupModal";

interface SafeLockGuardProps {
  children: React.ReactNode;
  tabName: string;
  userId: string;
  config: SafeLockConfig | null;
  loadingConfig: boolean;
  onConfigUpdated: (newConfig: SafeLockConfig) => void;
  mandatorySetup?: boolean;
  fallback?: React.ReactNode;
}

export const SafeLockGuard: React.FC<SafeLockGuardProps> = ({
  children,
  tabName,
  userId,
  config,
  loadingConfig,
  onConfigUpdated,
  mandatorySetup = false,
  fallback,
}) => {
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(() => isSessionUnlocked(userId));
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [recoveryModalOpen, setRecoveryModalOpen] = useState(false);
  const [recoveryAnswer, setRecoveryAnswer] = useState("");
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Sync session unlock state when userId changes
  useEffect(() => {
    if (userId && isSessionUnlocked(userId)) {
      setIsUnlocked(true);
    }
  }, [userId]);

  // Check if this tab is protected
  const isProtected = React.useMemo(() => {
    if (!config || !config.enabled) {
      return tabName === "Salary"; // Mandatory protection trigger
    }
    if (tabName === "Salary") return true;
    return config.protectedTabs?.includes(tabName) ?? false;
  }, [config, tabName]);

  // If no config and this is mandatory setup (e.g. Salary), prompt setup modal automatically
  useEffect(() => {
    if (!loadingConfig && !config && (mandatorySetup || tabName === "Salary")) {
      setSetupModalOpen(true);
    }
  }, [loadingConfig, config, mandatorySetup, tabName]);

  // Handle number pad / keyboard input
  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMsg(null);
      if (nextPin.length === 4) {
        verifyPinInput(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const verifyPinInput = async (inputPin: string) => {
    if (!config) return;
    setIsVerifying(true);
    try {
      const hashed = await hashString(inputPin);
      if (hashed === config.pinHash) {
        unlockSession(userId);
        setIsUnlocked(true);
        setErrorMsg(null);
        setAttempts(0);
      } else {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setPin("");
        if (nextAttempts >= 3 && config.hint) {
          setErrorMsg(`Incorrect PIN. Password Hint: "${config.hint}"`);
        } else {
          setErrorMsg(`Incorrect PIN. ${3 - (nextAttempts % 3)} attempts remaining until hint.`);
        }
      }
    } catch (e) {
      setErrorMsg("Verification error. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Physical keyboard listener
  useEffect(() => {
    if (!isProtected || isUnlocked || !config) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (recoveryModalOpen || setupModalOpen) return;
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        handleBackspace();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pin, isProtected, isUnlocked, config, recoveryModalOpen, setupModalOpen]);

  const handleRecoverySubmit = async () => {
    if (!config || !recoveryAnswer.trim()) return;
    setRecoveryError(null);
    setIsVerifying(true);
    try {
      const hashed = await hashString(recoveryAnswer.trim().toLowerCase());
      if (hashed === config.recoveryAnswerHash) {
        setRecoveryModalOpen(false);
        setRecoveryAnswer("");
        setSetupModalOpen(true);
      } else {
        setRecoveryError("Incorrect recovery answer. Please try again.");
      }
    } catch (err) {
      setRecoveryError("Could not verify recovery answer.");
    } finally {
      setIsVerifying(false);
    }
  };

  if (loadingConfig) {
    if (fallback) return <>{fallback}</>;
    // For non-mandatory tabs (where tabName !== 'Salary'), render children while loading config
    // so pages with their own skeleton loaders (like Files) can render their skeleton layout immediately
    if (!mandatorySetup && tabName !== "Salary") {
      return <>{children}</>;
    }
    return (
      <div className="safelock-wrapper">
        <Loader2 size={32} className="spin-animation" style={{ color: "#736f63" }} />
      </div>
    );
  }

  // Not protected or already unlocked
  if (!isProtected || isUnlocked) {
    return <>{children}</>;
  }

  // If no PIN set yet
  if (!config) {
    return (
      <div className="safelock-wrapper">
        <div className="safelock-card">
          <div className="safelock-icon-box">
            <Lock size={24} />
          </div>
          <h2 className="safelock-title">
            SafeLock PIN Required
          </h2>
          <p className="safelock-subtitle">
            To safeguard sensitive confidential data in <strong style={{ color: "#242420" }}>{tabName}</strong>, you must configure your 4-digit SafeLock PIN first.
          </p>
          <button
            type="button"
            onClick={() => setSetupModalOpen(true)}
            className="safelock-btn-primary"
            style={{ marginTop: 16 }}
          >
            <KeyRound size={16} />
            <span>Set Up SafeLock PIN</span>
          </button>

          <SafeLockSetupModal
            open={setupModalOpen}
            onClose={() => setSetupModalOpen(false)}
            userId={userId}
            mandatory={mandatorySetup || tabName === "Salary"}
            onSuccess={(newCfg) => {
              onConfigUpdated(newCfg);
              setIsUnlocked(true);
            }}
          />
        </div>
      </div>
    );
  }

  // SafeLock PIN Unlock Interface
  return (
    <div className="safelock-wrapper">
      <div
        className={`safelock-card ${shake ? "safelock-shake" : ""}`}
      >
        <div className="safelock-icon-box">
          <Lock size={22} />
        </div>

        <h2 className="safelock-title">
          SafeLock Protected
        </h2>
        <p className="safelock-subtitle">
          Enter your 4-digit PIN to access {tabName}
        </p>

        {/* 4-Digit Dot Indicators */}
        <div className="safelock-dots-row">
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`safelock-dot ${isFilled ? "filled" : ""}`}
              />
            );
          })}
        </div>

        {errorMsg && (
          <div className="safelock-error">
            {errorMsg}
          </div>
        )}

        {/* Tactile Keypad */}
        <div className="safelock-keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num)}
              disabled={isVerifying}
              className="safelock-keypad-btn"
            >
              {num}
            </button>
          ))}
          <div />
          <button
            type="button"
            onClick={() => handleDigit("0")}
            disabled={isVerifying}
            className="safelock-keypad-btn"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            disabled={pin.length === 0 || isVerifying}
            className="safelock-keypad-btn action-btn"
          >
            <Delete size={18} />
          </button>
        </div>

        {/* Forgot PIN Action */}
        <button
          type="button"
          onClick={() => setRecoveryModalOpen(true)}
          className="safelock-forgot-btn"
        >
          Forgot SafeLock PIN?
        </button>
      </div>

      {/* Recovery Question Modal */}
      <Dialog.Root open={recoveryModalOpen} onOpenChange={setRecoveryModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fade-in" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0, 0, 0, 0.4)", zIndex: 999 }} />
          <Dialog.Content className="safelock-modal-content">
            <div className="safelock-modal-header">
              <Dialog.Title style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#242420" }}>
                SafeLock PIN Recovery
              </Dialog.Title>
              <button
                onClick={() => setRecoveryModalOpen(false)}
                className="btn-icon-subtle"
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "#736f63" }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="safelock-modal-body">
              {recoveryError && (
                <div className="safelock-error">
                  {recoveryError}
                </div>
              )}

              <p style={{ fontSize: 12, color: "#736f63", margin: "0 0 4px 0" }}>
                Answer your security question to reset your PIN:
              </p>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#242420", margin: "0 0 16px 0" }}>
                {config?.recoveryQuestion}
              </p>

              <input
                type="text"
                placeholder="Your answer..."
                value={recoveryAnswer}
                onChange={(e) => setRecoveryAnswer(e.target.value)}
                className="form-input"
                style={{ marginBottom: 16 }}
              />

              <button
                type="button"
                onClick={handleRecoverySubmit}
                disabled={!recoveryAnswer.trim() || isVerifying}
                className="safelock-btn-primary"
              >
                {isVerifying ? <Loader2 size={16} className="spin-animation" /> : "Verify & Reset PIN"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Setup / Reset Modal */}
      <SafeLockSetupModal
        open={setupModalOpen}
        onClose={() => setSetupModalOpen(false)}
        userId={userId}
        existingConfig={config}
        onSuccess={(newCfg) => {
          onConfigUpdated(newCfg);
          setIsUnlocked(true);
        }}
      />
    </div>
  );
};
