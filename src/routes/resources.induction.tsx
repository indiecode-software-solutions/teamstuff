import React, { useState, useEffect, useMemo, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  Lock,
  Play,
  FileText,
  Volume2,
  Users,
  ExternalLink,
  RotateCcw,
  Sparkles,
  Trophy,
  BookOpen,
  Compass,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
} from "lucide-react";
import { getMyCompanyId, getCompanyTrainingSections, type TrainingBlock } from "../lib/induction";
import { supabase } from "../lib/supabase";
import { sanitizeProfilePhoto } from "../lib/profile-photo";
import { getDynamicPageTitle } from "../lib/tenant-brand";

export const Route = createFileRoute("/resources/induction")({
  head: () => ({
    title: getDynamicPageTitle("Onboarding & Induction"),
    meta: [
      {
        name: "description",
        content: "Complete your employee onboarding journey, company orientation, and training modules.",
      },
    ],
  }),
  component: InductionPage,
});

function getYoutubeEmbedUrl(urlStr: string) {
  try {
    const url = new URL(urlStr);
    if (url.hostname === "youtu.be") {
      return `https://www.youtube.com/embed${url.pathname}`;
    }
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return `https://www.youtube.com/embed/${v}`;
      if (url.pathname.includes("embed")) return urlStr;
    }
    return urlStr.replace("watch?v=", "embed/");
  } catch {
    return urlStr;
  }
}

interface DisplaySection {
  id: string;
  title: string;
  description: string;
  content: TrainingBlock[];
  isMandatory: boolean;
  orderIndex: number;
}

interface TeamMember {
  id: string;
  name: string;
  job_title?: string;
  role?: string;
  department?: string;
  profile_photo?: string | null;
  notes?: string | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "U";
}

function InductionPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [sections, setSections] = useState<DisplaySection[]>([]);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [journeyFinished, setJourneyFinished] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const companyIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const companyId = await getMyCompanyId();
        if (!companyId || cancelled) {
          setIsLoading(false);
          return;
        }

        companyIdRef.current = companyId;
        const records = await getCompanyTrainingSections(companyId);
        if (cancelled) return;

        if (records && records.length > 0) {
          setSections(
            records.map((r) => ({
              id: r.id,
              title: r.title,
              description: r.description || "",
              content: r.content || [],
              isMandatory: r.is_mandatory,
              orderIndex: r.order_index,
            }))
          );
        } else {
          setSections([]);
        }

        // Fetch company team members for "Meet the Team" blocks
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, name, job_title, role, department, profile_photo, notes")
          .eq("company_id", companyId)
          .order("name", { ascending: true });

        if (!cancelled && profiles) {
          setTeamMembers(
            profiles.map((p) => ({
              ...p,
              profile_photo: sanitizeProfilePhoto(p.profile_photo),
            }))
          );
        }

        // Load persisted completed step IDs
        try {
          const saved = JSON.parse(
            localStorage.getItem(`induction_completed_${companyId}`) || "[]"
          );
          if (Array.isArray(saved)) {
            setCompletedIds(saved);
          }
        } catch {
          setCompletedIds([]);
        }
      } catch (err) {
        console.error("Error loading induction journey:", err);
        toast.error("Failed to load onboarding modules.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeStep = sections[currentStepIndex];

  // Progress metrics calculation
  const totalSteps = sections.length;
  const mandatorySteps = useMemo(() => sections.filter((s) => s.isMandatory), [sections]);
  const completedMandatoryCount = useMemo(
    () => mandatorySteps.filter((s) => completedIds.includes(s.id)).length,
    [mandatorySteps, completedIds]
  );
  const completedTotalCount = useMemo(
    () => sections.filter((s) => completedIds.includes(s.id)).length,
    [sections, completedIds]
  );

  const progressPercent = useMemo(() => {
    if (mandatorySteps.length > 0) {
      return Math.round((completedMandatoryCount / mandatorySteps.length) * 100);
    }
    return totalSteps > 0 ? Math.round((completedTotalCount / totalSteps) * 100) : 0;
  }, [mandatorySteps, completedMandatoryCount, totalSteps, completedTotalCount]);

  const isStepUnlocked = (idx: number) => {
    if (idx === 0) return true;
    for (let i = 0; i < idx; i++) {
      const step = sections[i];
      if (!step || !completedIds.includes(step.id)) return false;
    }
    return true;
  };

  const handleStepClick = (index: number) => {
    if (!isStepUnlocked(index)) {
      toast.info("Complete previous steps to unlock this module.");
      return;
    }
    setCurrentStepIndex(index);
    setJourneyFinished(false);
  };

  const handleToggleComplete = (stepId: string) => {
    setCompletedIds((prev) => {
      const isAlreadyDone = prev.includes(stepId);
      const next = isAlreadyDone ? prev.filter((id) => id !== stepId) : [...prev, stepId];

      if (companyIdRef.current) {
        try {
          localStorage.setItem(
            `induction_completed_${companyIdRef.current}`,
            JSON.stringify(next)
          );
        } catch {
          // ignore storage error
        }
      }

      if (!isAlreadyDone) {
        toast.success("Module marked as completed!");
      } else {
        toast.info("Module marked as incomplete.");
      }

      return next;
    });
  };

  const handleNext = () => {
    let nextCompletedIds = completedIds;

    // Automatically mark active step completed on next if not already marked
    if (activeStep && !completedIds.includes(activeStep.id)) {
      nextCompletedIds = [...completedIds, activeStep.id];
      setCompletedIds(nextCompletedIds);
      if (companyIdRef.current) {
        try {
          localStorage.setItem(
            `induction_completed_${companyIdRef.current}`,
            JSON.stringify(nextCompletedIds)
          );
        } catch {
          // ignore
        }
      }
    }

    if (currentStepIndex < sections.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      const allMandatoryDone = mandatorySteps.every((s) => nextCompletedIds.includes(s.id));
      if (allMandatoryDone || mandatorySteps.length === 0) {
        setJourneyFinished(true);
        toast.success("Congratulations on completing your onboarding journey!");
      } else {
        toast.error("Please complete all mandatory onboarding tasks first!");
      }
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
      setJourneyFinished(false);
    }
  };

  const handleResetJourney = () => {
    setCompletedIds([]);
    setCurrentStepIndex(0);
    setJourneyFinished(false);
    if (companyIdRef.current) {
      try {
        localStorage.removeItem(`induction_completed_${companyIdRef.current}`);
      } catch {
        // ignore
      }
    }
    toast.success("Onboarding progress has been reset.");
  };

  const renderBlock = (block: TrainingBlock, key: number) => {
    if (block.type === "text" && block.content) {
      const rawLines = block.content.split("\n");
      const firstLine = rawLines[0]?.trim() || "";
      const isAutoHeading =
        !block.caption &&
        rawLines.length > 1 &&
        (/^\d+[\.\)]\s+/.test(firstLine) ||
          /^#{1,4}\s+/.test(firstLine) ||
          (firstLine.length <= 60 && !/[.!?]$/.test(firstLine)));

      const displayTitle =
        block.caption || (isAutoHeading ? firstLine.replace(/^#{1,4}\s+/, "") : null);
      const displayBody = isAutoHeading ? rawLines.slice(1).join("\n").trim() : block.content;

      return (
        <div key={key} className="induction-block-text">
          {displayTitle && (
            <h4 className="induction-block-text-title">{displayTitle}</h4>
          )}
          {displayBody && (
            <p className="induction-block-text-body">{displayBody}</p>
          )}
        </div>
      );
    }

    if (block.type === "image" && block.url) {
      return (
        <div key={key}>
          <div className="induction-block-image-wrap">
            <img src={block.url} alt={block.caption || "Onboarding Guide"} />
          </div>
          {block.caption && (
            <p className="induction-block-image-caption">{block.caption}</p>
          )}
        </div>
      );
    }

    if (block.type === "embed" && block.url) {
      const isYoutube = /youtube\.com|youtu\.be/i.test(block.url);
      return (
        <div key={key}>
          {isYoutube ? (
            <div className="induction-block-video-wrap">
              <iframe
                width="100%"
                height="100%"
                src={getYoutubeEmbedUrl(block.url)}
                title={block.caption || "Video Guide"}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="induction-block-link-card">
              <div style={{ minWidth: 0, flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: "13px", color: "var(--color-text-primary)", margin: "0 0 2px 0" }}>
                  {block.caption || "External Onboarding Resource"}
                </p>
                <p style={{ fontSize: "11.5px", color: "var(--color-text-muted)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {block.url}
                </p>
              </div>
              <a
                href={block.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
                style={{ flexShrink: 0, gap: "6px" }}
              >
                <span>Open Resource</span>
                <ExternalLink size={12} />
              </a>
            </div>
          )}
          {block.caption && isYoutube && (
            <p className="induction-block-image-caption">{block.caption}</p>
          )}
        </div>
      );
    }

    if (block.type === "audio" && block.url) {
      return (
        <div key={key} className="induction-block-audio-card">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                backgroundColor: "var(--color-surface, #ffffff)",
                border: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-primary)",
                flexShrink: 0,
              }}
            >
              <Volume2 size={16} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: "13px", color: "var(--color-text-primary)", margin: 0 }}>
                {block.caption || "Audio Orientation Guide"}
              </p>
              <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: 0 }}>
                Listen to this recorded orientation message
              </p>
            </div>
          </div>
          <audio controls src={block.url} style={{ width: "100%", height: "36px", marginTop: "4px" }} />
        </div>
      );
    }

    if (block.type === "team") {
      return (
        <div key={key} className="induction-team-container">
          <h4 className="induction-team-title">
            {block.caption || "Meet the Team & Key Contacts"}
          </h4>

          {teamMembers.length === 0 ? (
            <div style={{ padding: "20px", border: "1px dashed var(--color-border)", borderRadius: "10px", textAlign: "center", fontSize: "12.5px", color: "var(--color-text-muted)" }}>
              No active team profiles found yet.
            </div>
          ) : (
            <div className="induction-team-grid">
              {teamMembers.map((member) => {
                const initials = getInitials(member.name || "Colleague");
                const roleTitle = member.job_title || member.role || "Team Member";

                return (
                  <div key={member.id} className="induction-team-card">
                    <div className="induction-team-header">
                      <div className="induction-team-avatar">
                        {member.profile_photo ? (
                          <img src={member.profile_photo} alt={member.name} />
                        ) : (
                          initials
                        )}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p className="induction-team-name">{member.name}</p>
                        <p className="induction-team-role">{roleTitle}</p>
                      </div>
                    </div>

                    {member.notes && (
                      <p className="induction-team-notes">{member.notes}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div className="induction-page-wrapper">
      {/* Streamlined Top Navigation Bar */}
      <div className="induction-top-bar">
        <div className="induction-top-bar-left">
          <Link
            to="/resources"
            className="induction-back-link"
            title="Return to Resources"
          >
            <ArrowLeft size={15} />
            <span>Resources</span>
          </Link>
          <span className="induction-top-bar-divider" />
          <h1 className="induction-top-bar-title">Onboarding & Induction</h1>

          {sections.length > 0 && (
            <div className="induction-top-bar-progress-pill">
              <div className="induction-top-bar-progress-stat">
                <span className="induction-top-bar-progress-text">
                  {completedTotalCount}/{totalSteps} completed
                </span>
                <span className="induction-top-bar-progress-pct">
                  ({progressPercent}%)
                </span>
              </div>
              <div className="induction-top-bar-mini-track">
                <div
                  className="induction-top-bar-mini-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {progressPercent === 100 && (
                <ShieldCheck size={13} style={{ color: "#059669" }} />
              )}
            </div>
          )}
        </div>

        <div className="induction-top-bar-right">
          {completedIds.length > 0 && (
            <button
              type="button"
              onClick={handleResetJourney}
              className="induction-top-action-btn"
              title="Reset completion progress"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          )}
          <Link
            to="/resources"
            className="induction-top-action-btn"
          >
            <span>Exit Journey</span>
          </Link>
        </div>
      </div>

      {/* Main Content Areas */}
      {isLoading ? (
        <div className="induction-workspace">
          <div className="induction-sidebar-card" style={{ padding: "16px", gap: "10px" }}>
            <div className="skeleton-box" style={{ height: "20px", width: "50%", borderRadius: "4px" }} />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton-box" style={{ height: "48px", borderRadius: "8px" }} />
            ))}
          </div>

          <div className="induction-viewport-card" style={{ padding: "24px", gap: "16px" }}>
            <div className="skeleton-box" style={{ height: "28px", width: "40%", borderRadius: "6px" }} />
            <div className="skeleton-box" style={{ height: "200px", borderRadius: "10px" }} />
            <div className="skeleton-box" style={{ height: "80px", borderRadius: "8px" }} />
          </div>
        </div>
      ) : sections.length === 0 ? (
        <div className="induction-celebration-card" style={{ padding: "80px 24px" }}>
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-text-muted)",
              marginBottom: "4px",
            }}
          >
            <BookOpen size={26} />
          </div>
          <h2 className="induction-celebration-title" style={{ fontSize: "20px" }}>
            No Induction Modules Published Yet
          </h2>
          <p className="induction-celebration-desc" style={{ maxWidth: "440px" }}>
            Your organization hasn't published any onboarding training sections yet. As soon as HR publishes orientation modules, they will appear right here.
          </p>
          <div style={{ marginTop: "12px", display: "flex", gap: "10px" }}>
            <Link to="/resources" className="btn btn-secondary">
              Return to Resources
            </Link>
            <Link to="/dashboard" className="btn btn-primary">
              Go to Dashboard
            </Link>
          </div>
        </div>
      ) : journeyFinished ? (
        <div className="induction-celebration-card">
          <div className="induction-celebration-badge">
            <Trophy size={36} />
          </div>
          <h2 className="induction-celebration-title">Journey Completed!</h2>
          <p className="induction-celebration-desc">
            Congratulations! You have completed all onboarding steps and induction modules. You are now officially orientation-certified and ready to dive into your daily work.
          </p>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center", margin: "8px 0 16px 0" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "20px",
                backgroundColor: "#ecfdf5",
                color: "#059669",
                border: "1px solid #a7f3d0",
                fontSize: "12.5px",
                fontWeight: 500,
              }}
            >
              <CheckCircle2 size={14} />
              <span>{completedTotalCount} Modules Completed</span>
            </div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "20px",
                backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
                fontSize: "12.5px",
                fontWeight: 500,
              }}
            >
              <Sparkles size={14} />
              <span>Orientation Complete</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
            <Link to="/dashboard" className="btn btn-primary" style={{ padding: "0 20px", height: "38px" }}>
              Go to Dashboard
            </Link>
            <button
              onClick={() => {
                setJourneyFinished(false);
                setCurrentStepIndex(0);
              }}
              className="btn btn-secondary"
              style={{ padding: "0 16px", height: "38px" }}
            >
              Review Modules
            </button>
            <button
              onClick={handleResetJourney}
              className="btn btn-secondary"
              style={{ padding: "0 16px", height: "38px", gap: "6px" }}
            >
              <RotateCcw size={13} />
              Reset Journey
            </button>
          </div>
        </div>
      ) : (
        <div className="induction-workspace">
          {/* Stepper Navigation Sidebar */}
          <div className="induction-sidebar-card">
            <div className="induction-sidebar-header">
              <h3 className="induction-sidebar-title">Course Modules</h3>
              <span className="induction-sidebar-count">
                {completedTotalCount}/{sections.length} done
              </span>
            </div>

            <div className="induction-step-list">
              {sections.map((step, idx) => {
                const unlocked = isStepUnlocked(idx);
                const isSelected = currentStepIndex === idx;
                const isDone = completedIds.includes(step.id);

                return (
                  <button
                    key={step.id}
                    disabled={!unlocked}
                    onClick={() => handleStepClick(idx)}
                    className={`induction-step-item ${isSelected ? "is-active" : ""}`}
                    title={
                      !unlocked
                        ? "Complete previous modules to unlock"
                        : step.title
                    }
                  >
                    <div
                      className={`induction-step-indicator ${
                        isDone
                          ? "is-completed"
                          : !unlocked
                          ? "is-locked"
                          : ""
                      }`}
                    >
                      {isDone ? (
                        <Check size={14} />
                      ) : !unlocked ? (
                        <Lock size={12} />
                      ) : (
                        <span>{idx + 1}</span>
                      )}
                    </div>

                    <div className="induction-step-content">
                      <p className="induction-step-title">{step.title}</p>
                      <div className="induction-step-meta">
                        <span
                          className={
                            step.isMandatory
                              ? "induction-badge-required"
                              : "induction-badge-optional"
                          }
                        >
                          {step.isMandatory ? "Required" : "Optional"}
                        </span>
                        <span>•</span>
                        <span>
                          {step.content.length} item
                          {step.content.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Module Viewport */}
          {activeStep && (
            <div className="induction-viewport-card">
              {/* Viewport Top Bar */}
              <div className="induction-viewport-header">
                <div className="induction-viewport-title-group">
                  <h2 className="induction-viewport-title">
                    {activeStep.title}
                  </h2>
                  <span
                    className={
                      activeStep.isMandatory
                        ? "induction-badge-required"
                        : "induction-badge-optional"
                    }
                  >
                    {activeStep.isMandatory ? "Mandatory" : "Optional"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleComplete(activeStep.id)}
                  className={`induction-toggle-complete-btn ${
                    completedIds.includes(activeStep.id) ? "is-completed" : ""
                  }`}
                >
                  <Check size={14} />
                  <span>
                    {completedIds.includes(activeStep.id)
                      ? "Completed"
                      : "Mark Complete"}
                  </span>
                </button>
              </div>

              {/* Viewport Body Content */}
              <div className="induction-viewport-body">
                {activeStep.content.length === 0 && (
                  <p style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
                    {activeStep.description || "No specific content attached to this section."}
                  </p>
                )}

                {activeStep.content.map((block, idx) => renderBlock(block, idx))}

                {activeStep.content.length > 0 && activeStep.description && (
                  <div
                    style={{
                      padding: "16px 18px",
                      borderRadius: "10px",
                      backgroundColor: "var(--color-surface-subtle, #f8f9fa)",
                      border: "1px solid var(--color-border-subtle)",
                      marginTop: "4px",
                    }}
                  >
                    <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0, whiteSpace: "pre-line" }}>
                      {activeStep.description}
                    </p>
                  </div>
                )}
              </div>

              {/* Viewport Bottom Footer Navigation */}
              <div className="induction-viewport-footer">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={currentStepIndex === 0}
                  className="btn btn-secondary"
                  style={{ gap: "6px" }}
                >
                  <ChevronLeft size={14} />
                  <span>Previous Module</span>
                </button>

                <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                  Module {currentStepIndex + 1} of {sections.length}
                </span>

                <button
                  type="button"
                  onClick={handleNext}
                  className="btn btn-primary"
                  style={{ gap: "6px" }}
                >
                  <span>
                    {currentStepIndex === sections.length - 1
                      ? "Finish Journey"
                      : "Next Module"}
                  </span>
                  {currentStepIndex === sections.length - 1 ? (
                    <Sparkles size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
