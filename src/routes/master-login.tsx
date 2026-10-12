import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Eye as Visibility,
  EyeOff as VisibilityOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { masterLogin } from "../lib/master";

export const Route = createFileRoute("/master-login")({
  head: () => ({
    title: "Console Login",
    meta: [{ name: "description", content: "Master Admin Authentication." }],
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

  const handleLogin = async (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      setToast({ open: true, message: "Please fill in all credentials.", severity: "error" });
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      handleLogin(e);
    }
  };

  return (
    <div className="master-login-page">
      <div className="master-login-simple-container">
        {/* Simple & Clean Form identical to Employee Login */}
        <form onSubmit={handleLogin} onKeyDown={handleKeyDown} className="login-form">
          <div className="login-field-group">
            <label className="login-field-label">Email</label>
            <div className="login-input-wrapper">
              <input
                type="email"
                required
                autoFocus
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={handleKeyDown}
                className="login-input"
              />
            </div>
          </div>

          <div className="login-field-group">
            <label className="login-field-label">Password</label>
            <div className="login-input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                required
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="login-input login-input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                tabIndex={-1}
                className="login-password-toggle"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <VisibilityOff size={18} /> : <Visibility size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="login-submit-btn"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Signing In...</span>
              </>
            ) : (
              <span>Sign In</span>
            )}
          </button>
        </form>
      </div>

      {/* Toast Notification */}
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
