import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Eye as Visibility, EyeOff as VisibilityOff, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { masterLogin } from "../lib/master";

export const Route = createFileRoute("/master-login")({
  head: () => ({
    title: "Console Login",
    meta: [{ name: "description", content: "Authentication." }],
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
    <div >
      <form
        onSubmit={handleLogin}
        
      >
        <div >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoFocus
            
          />
        </div>

        <div >
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            
          >
            {showPassword ? <VisibilityOff size={18} /> : <Visibility size={18} />}
          </button>
        </div>

        <div >
          <div />
          <button
            type="submit"
            disabled={loading}
            
          >
            {loading ? (
              <>
                <span>Signing in</span>
                <Loader2 size={16}  />
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Toast Notification */}
      {toast.open && (
        <div className="fade-in">
          <div
            className={`${ toast.severity === "error" ? "" : "" }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast((t) => ({ ...t, open: false }))}
              
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
