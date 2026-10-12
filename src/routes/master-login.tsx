import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Eye as Visibility,
  EyeOff as VisibilityOff,
  ArrowRight,
  Loader2,
  Mail,
  Lock,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { masterLogin } from "../lib/master";

export const Route = createFileRoute("/master-login")({
  head: () => ({
    title: "Master Console Login | Teamstuff",
    meta: [{ name: "description", content: "Master Admin Console authentication." }],
  }),
  component: MasterLoginPage,
});

function MasterLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "error",
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setToast({ open: true, message: "Please enter your credentials.", severity: "error" });
      return;
    }
    setLoading(true);
    try {
      const res = await masterLogin({ data: { email, password } });
      if (!res.success) throw new Error(res.error || "Invalid credentials");

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInErr) throw signInErr;

      setToast({ open: true, message: "Signed in successfully.", severity: "success" });
      setTimeout(() => {
        window.location.href = "/master";
      }, 300);
    } catch (err: any) {
      console.error("Master login error:", err);
      setToast({ open: true, message: err.message || "Failed to log in.", severity: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="master-login-page">
      <div className="master-login-card">
        {/* Header with Security Badge and Branding */}
        <div className="master-login-header">
          <div className="master-login-badge">
            <span className="master-login-badge-dot" />
            <ShieldCheck size={13} />
            <span>Platform Security</span>
          </div>

          <div className="master-login-brand">
            <img
              src="/teamstuff_logo.png"
              alt="Teamstuff Intranet"
              className="master-login-logo"
            />
          </div>

          <div className="master-login-title-group">
            <h1 className="master-login-title">Master Console</h1>
            <p className="master-login-subtitle">
              Enter root credentials to manage multi-tenant environments, storage & system accounts.
            </p>
          </div>
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleLogin} className="master-login-form">
          <div className="master-login-field">
            <label htmlFor="master-email" className="master-login-label">
              Admin Email
            </label>
            <div className="master-login-input-wrap">
              <span className="master-login-input-icon">
                <Mail size={16} />
              </span>
              <input
                id="master-email"
                type="email"
                className="master-login-input"
                placeholder="root@teamstuff.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="master-login-field">
            <label htmlFor="master-password" className="master-login-label">
              Master Password
            </label>
            <div className="master-login-input-wrap">
              <span className="master-login-input-icon">
                <Lock size={16} />
              </span>
              <input
                id="master-password"
                type={showPassword ? "text" : "password"}
                className="master-login-input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="master-login-eye-btn"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <VisibilityOff size={16} /> : <Visibility size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="master-login-submit-btn"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="master-login-spinner" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Authenticate Session</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Footer & Audit Notice */}
        <div className="master-login-footer">
          <div className="master-login-security-tag">
            <span>TLS 1.3 Encrypted • Audit Monitored</span>
          </div>
          <a href="/login" className="master-login-back-link">
            ← Return to Employee Intranet
          </a>
        </div>
      </div>

      {/* Floating Toast Notification */}
      {toast.open && (
        <div className={`master-login-toast ${toast.severity}`}>
          {toast.severity === "error" ? (
            <AlertCircle size={16} color="#ef4444" />
          ) : (
            <CheckCircle2 size={16} color="#10b981" />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            className="master-login-toast-close"
            onClick={() => setToast((t) => ({ ...t, open: false }))}
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
