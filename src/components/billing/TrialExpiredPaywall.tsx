import React, { useState } from "react";
import { ShieldAlert, Zap, Loader2, Users, CheckCircle2, Lock } from "lucide-react";
import { startWorkspaceSubscriptionCheckout } from "../../lib/billing";
import {
  canUserManageBilling,
  getTrialDaysRemaining,
  calculateWorkspaceMonthlyPrice,
  type CompanyContextLike,
} from "../../lib/permissions";

interface TrialExpiredPaywallProps {
  company: CompanyContextLike;
  user: {
    id: string;
    email?: string | null;
    role?: string | null;
    permissions?: any;
  };
  activeSeatsCount: number;
  onActivated: () => void;
}

export function TrialExpiredPaywall({
  company,
  user,
  activeSeatsCount,
  onActivated,
}: TrialExpiredPaywallProps) {
  const isBillingAdmin = canUserManageBilling(user, company);
  const activeCount = Math.max(1, activeSeatsCount || Number(company.seat_limit || 1));
  const pricing = calculateWorkspaceMonthlyPrice(company, activeCount);
  const { basePrice, baseSeats, extraSeatPrice, extraUsersCount, monthlyTotalInr } = pricing;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleActivate = async () => {
    if (!company.id) return;
    setLoading(true);
    setErrorMsg("");

    await startWorkspaceSubscriptionCheckout({
      companyId: company.id,
      userId: user.id,
      seats: activeCount,
      onSuccess: () => {
        setLoading(false);
        onActivated();
      },
      onError: (err) => {
        setLoading(false);
        setErrorMsg(err);
      },
      onDismiss: () => {
        setLoading(false);
      },
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(9, 9, 11, 0.85)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "#ffffff",
          borderRadius: "16px",
          border: "1px solid #e4e4e7",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "#09090b",
            color: "#ffffff",
            padding: "1.75rem 2rem 1.5rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              background: "#27272a",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1rem",
              border: "1px solid #3f3f46",
            }}
          >
            <Lock size={22} color="#f4f4f5" />
          </div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.02em" }}>
            Your 14-Day Free Trial Has Ended
          </h2>
          <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", color: "#a1a1aa", lineHeight: 1.5 }}>
            Activate your monthly subscription to unlock uninterrupted access for{" "}
            <span style={{ color: "#ffffff", fontWeight: 600 }}>{company.name || "your team"}</span>.
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: "1.75rem 2rem" }}>
          {isBillingAdmin ? (
            <>
              {errorMsg && (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "8px",
                    color: "#b91c1c",
                    fontSize: "0.8125rem",
                    marginBottom: "1.25rem",
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {/* Team Breakdown & Price Calculation Box */}
              <div
                style={{
                  background: "#fafafa",
                  borderRadius: "10px",
                  border: "1px solid #f4f4f5",
                  padding: "1rem 1.25rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.8125rem", color: "#52525b" }}>Active workspace team</span>
                  <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#18181b" }}>{activeCount} active user{activeCount > 1 ? "s" : ""}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.8125rem", color: "#52525b" }}>Base tier (up to {baseSeats} users incl.)</span>
                  <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#18181b" }}>₹{basePrice.toLocaleString("en-IN")} / mo</span>
                </div>
                {extraUsersCount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.8125rem", color: "#52525b" }}>Additional members ({extraUsersCount} × ₹{extraSeatPrice})</span>
                    <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#18181b" }}>+₹{(extraUsersCount * extraSeatPrice).toLocaleString("en-IN")} / mo</span>
                  </div>
                )}
                <div
                  style={{
                    borderTop: "1px solid #e4e4e7",
                    paddingTop: "0.75rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#09090b" }}>Total Recurring</span>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "1.25rem", fontWeight: 600, color: "#09090b" }}>
                      ₹{monthlyTotalInr.toLocaleString("en-IN")}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#71717a" }}> / month</span>
                  </div>
                </div>
              </div>

              {/* Value Highlights */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.5rem" }}>
                {[
                  "Dynamic Seat Sync — Autopay automatically updates when seats change",
                  "Automated monthly GST invoicing delivered to your billing email",
                  "Cancel or adjust seats anytime without long-term lock-in",
                ].map((feat, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "#52525b" }}>
                    <CheckCircle2 size={14} color="#166534" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>

              {/* Action Button */}
              <button
                type="button"
                onClick={handleActivate}
                disabled={loading}
                style={{
                  width: "100%",
                  height: "44px",
                  background: "#09090b",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  transition: "opacity 0.2s",
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Connecting Razorpay...</span>
                  </>
                ) : (
                  <>
                    <Zap size={15} />
                    <span>Activate Autopay with Razorpay (₹{monthlyTotalInr.toLocaleString("en-IN")}/mo)</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              <p style={{ fontSize: "0.875rem", color: "#52525b", lineHeight: 1.6, margin: "0 0 1rem" }}>
                Only authorized billing administrators can activate the workspace subscription.
              </p>
              <div
                style={{
                  padding: "0.75rem 1rem",
                  background: "#f4f4f5",
                  borderRadius: "8px",
                  fontSize: "0.8125rem",
                  color: "#27272a",
                }}
              >
                Please contact your workspace owner:{" "}
                <span style={{ fontWeight: 600 }}>{company.owner_email || "the company administrator"}</span>.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
