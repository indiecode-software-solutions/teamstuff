import React, { useState, useEffect, useCallback } from "react";
import { LogOut, Eye, Printer, Loader2, AlertCircle } from "lucide-react";
import {
  fetchMyExitRequest,
  type ExitRequest,
} from "../../lib/exit-management";
import {
  statusConfig,
  fmtDate,
  printRelievingLetter,
  DetailDialog,
  InitiateExitDialog,
} from "./ExitTab";
import { supabase } from "../../lib/supabase";

interface ProfileExitSectionProps {
  profile?: {
    id: string;
    company_id?: string;
    name: string;
  } | null;
  showToast?: (msg: string, severity?: "success" | "error" | "info" | "warning") => void;
}

export function ProfileExitSection({ profile, showToast }: ProfileExitSectionProps) {
  const [loading, setLoading] = useState(true);
  const [myExitRequest, setMyExitRequest] = useState<ExitRequest | null>(null);
  const [showInitiate, setShowInitiate] = useState(false);
  const [selectedReq, setSelectedReq] = useState<ExitRequest | null>(null);
  const [companyName, setCompanyName] = useState("Teamstuff");

  const load = useCallback(async () => {
    if (!profile?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [req, co] = await Promise.all([
        fetchMyExitRequest(profile.id),
        profile.company_id
          ? supabase.from("companies").select("name").eq("id", profile.company_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setMyExitRequest(req);
      if (co?.data?.name) setCompanyName(co.data.name);
    } catch (err) {
      console.error("Error fetching exit request:", err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.company_id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div style={{ padding: "12px 0" }}>
        <div className="skeleton-shimmer" style={{ height: 60, borderRadius: 10 }} />
      </div>
    );
  }

  return (
    <div className="profile-exit-wrapper">
      <div className="profile-exit-header">
        <div>
          <h3 className="profile-exit-title">Employment Separation & Offboarding</h3>
          <p className="profile-exit-desc">
            Manage formal resignation, departmental clearances, handover, and relieving documentation.
          </p>
        </div>
      </div>

      {!myExitRequest ? (
        <div className="profile-exit-card">
          <div className="profile-exit-card-info">
            <h4 className="profile-exit-card-title">Initiate Formal Resignation</h4>
            <p className="profile-exit-card-text">
              Submit an exit request to start the notice period review, handover assignments, and clearance procedure.
            </p>
          </div>
          <button
            type="button"
            className="hr-btn hr-btn-secondary profile-exit-btn"
            onClick={() => setShowInitiate(true)}
          >
            <LogOut size={14} />
            <span>Apply for Resignation</span>
          </button>
        </div>
      ) : (
        (() => {
          const sc = statusConfig(myExitRequest.status);
          return (
            <div className="profile-exit-active-card">
              <div className="profile-exit-active-top">
                <div className="profile-exit-badge-group">
                  <span
                    className="profile-exit-status-badge"
                    style={{ backgroundColor: sc.bg, color: sc.color, borderColor: sc.color }}
                  >
                    {sc.icon && React.cloneElement(sc.icon, { style: { width: 13, height: 13 } })}
                    <span>{sc.label}</span>
                  </span>
                  <span className="profile-exit-meta-date">
                    Submitted on {fmtDate(myExitRequest.created_at)}
                  </span>
                </div>
                <div className="profile-exit-last-day">
                  Last Working Day: <strong>{fmtDate(myExitRequest.last_working_day)}</strong>
                </div>
              </div>

              <p className="profile-exit-status-desc">
                {myExitRequest.status === "pending" && "Your resignation request is awaiting review and approval from HR / Management."}
                {myExitRequest.status === "in_clearance" && "Your separation is approved. Department handover and clearance checks are underway."}
                {myExitRequest.status === "completed" && "Your clearance is completed. Your official relieving documentation is ready for download."}
                {myExitRequest.status === "rejected" && `Your resignation request was declined. ${myExitRequest.manager_remarks || ""}`}
              </p>

              <div className="profile-exit-btn-row">
                <button
                  type="button"
                  className="hr-btn hr-btn-secondary"
                  onClick={() => setSelectedReq(myExitRequest)}
                >
                  <Eye size={14} />
                  <span>View Details & Handover</span>
                </button>

                {myExitRequest.status === "completed" && (
                  <button
                    type="button"
                    className="hr-btn hr-btn-primary"
                    onClick={() => printRelievingLetter(myExitRequest, companyName)}
                  >
                    <Printer size={14} />
                    <span>Download Relieving Letter</span>
                  </button>
                )}
              </div>
            </div>
          );
        })()
      )}

      {/* Initiate Resignation Dialog (Self-Service Mode) */}
      {showInitiate && profile && (
        <InitiateExitDialog
          companyId={profile.company_id || ""}
          currentUserId={profile.id}
          employees={[]}
          selfOnly
          selfProfile={{ id: profile.id, name: profile.name }}
          onDone={() => {
            setShowInitiate(false);
            showToast?.("Resignation submitted successfully", "success");
            load();
          }}
          onClose={() => setShowInitiate(false)}
        />
      )}

      {/* Details & Clearance Dialog */}
      {selectedReq && profile && (
        <DetailDialog
          req={selectedReq}
          isHR={false}
          currentUserId={profile.id}
          companyName={companyName}
          onClose={() => setSelectedReq(null)}
          onRefresh={() => {
            load();
            showToast?.("Exit request updated", "success");
          }}
        />
      )}
    </div>
  );
}
