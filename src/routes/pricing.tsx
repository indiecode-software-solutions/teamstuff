import React, { useState, useEffect, useRef } from "react";
import { createFileRoute, useNavigate, useLocation, redirect } from "@tanstack/react-router";
import { BookDemoModal } from "../components/BookDemoModal";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lock,
  Headphones,
  Users,
  Loader2,
  ArrowRight,
  Copy,
  Check,
} from "lucide-react";
import { getBrandConfig } from "../lib/brand-config";
import { getTenantFromHost } from "../lib/tenant-brand";
import { supabase } from "../lib/supabase";
import { enrollTrialServerFn } from "../lib/trial";
import {
  trackFormStart,
  trackCompleteRegistration,
  markPendingTrialActivation,
  trackTrialActivated,
} from "../lib/meta-pixel";

export const Route = createFileRoute("/pricing")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const brand = getBrandConfig();
      if (!brand.showPricing) {
        throw redirect({ to: "/login" });
      }
      const detectedTenant = getTenantFromHost();
      if (detectedTenant) {
        throw redirect({ to: "/login" });
      }
    }
  },
  head: () => {
    const brand = getBrandConfig();
    return {
      title: `${brand.appName} | Transparent Pricing`,
      meta: [
        {
          name: "description",
          content: `Transparent and simple pricing for ${brand.appName}.`,
        },
      ],
    };
  },
  component: PricingPage,
});

// Brand Logo Component
function BrandLogo() {
  return (
    <a href="/" className="pricing-brand-link">
      <span className="pricing-brand-text">indiecode HRMS</span>
    </a>
  );
}

// Reveal on Scroll Component
function RevealOnScroll({
  children,
  delay = 0,
  direction = "up",
  distance = 28,
  duration = 0.7,
  className = "",
  style = {},
}: {
  children: React.ReactNode;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  distance?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(element);
        }
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const getTransform = () => {
    if (isVisible) return "translate3d(0, 0, 0) scale(1)";
    switch (direction) {
      case "up":
        return `translate3d(0, ${distance}px, 0)`;
      case "down":
        return `translate3d(0, -${distance}px, 0)`;
      case "left":
        return `translate3d(${distance}px, 0, 0)`;
      case "right":
        return `translate3d(-${distance}px, 0, 0)`;
      default:
        return "translate3d(0, 0, 0) scale(0.98)";
    }
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: getTransform(),
        transition: `opacity ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
        willChange: "opacity, transform",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PricingPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const brand = getBrandConfig();
    const detectedTenant = getTenantFromHost();
    if (!brand.showPricing || detectedTenant) {
      navigate({ to: "/login" });
    }
  }, [navigate]);

  useEffect(() => {
    const scrollToHashTarget = () => {
      const currentHash = (location.hash || window.location.hash || "").replace(/^#/, "");
      if (currentHash !== "trial-form") return;

      const target = document.getElementById("trial-form");
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };

    const currentHash = (location.hash || window.location.hash || "").replace(/^#/, "");
    let timerId: number | undefined;
    let rafId: number | undefined;

    if (currentHash === "trial-form") {
      rafId = window.requestAnimationFrame(() => {
        timerId = window.setTimeout(scrollToHashTarget, 100);
      });
    }

    window.addEventListener("hashchange", scrollToHashTarget);
    return () => {
      if (rafId !== undefined) window.cancelAnimationFrame(rafId);
      if (timerId !== undefined) window.clearTimeout(timerId);
      window.removeEventListener("hashchange", scrollToHashTarget);
    };
  }, [location.hash]);

  const [teamSize, setTeamSize] = useState<number>(20);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Lead Form State
  const [leadFormData, setLeadFormData] = useState({
    name: "",
    workEmail: "",
    phone: "",
    companyName: "",
  });
  const [leadErrors, setLeadErrors] = useState<Record<string, string>>({});
  const [isSubmittingLead, setIsSubmittingLead] = useState<boolean>(false);
  const [leadSubmitted, setLeadSubmitted] = useState<boolean>(false);
  const [isEnteringWorkspace, setIsEnteringWorkspace] = useState<boolean>(false);
  const [copiedPass, setCopiedPass] = useState<boolean>(false);
  const hasStartedFormRef = useRef<boolean>(false);

  const handleFormFocusCapture = (e: React.FocusEvent<HTMLFormElement>) => {
    if (hasStartedFormRef.current) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) {
      hasStartedFormRef.current = true;
      const fieldName =
        target.getAttribute("name") ||
        target.getAttribute("type") ||
        "unknown";
      trackFormStart({ first_field: fieldName });
    }
  };
  const [trialResult, setTrialResult] = useState<{
    provisioned: boolean;
    company: { id: string; name: string; slug: string; trial_ends_at: string; seat_limit: number } | null;
    adminEmail: string;
    tempPassword?: string;
    session?: { access_token: string; refresh_token: string } | null;
    emailSent: boolean;
  } | null>(null);

  const validateEmail = (email: string): boolean => {
    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed);
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!leadFormData.name.trim()) {
      errors.name = "Please enter your name";
    }

    if (!leadFormData.workEmail.trim()) {
      errors.workEmail = "Please enter your work email";
    } else if (!validateEmail(leadFormData.workEmail)) {
      errors.workEmail = "Please enter a valid email address";
    }

    if (!leadFormData.phone.trim()) {
      errors.phone = "Please enter your phone number";
    } else if (leadFormData.phone.trim().length < 8) {
      errors.phone = "Please enter a valid phone number";
    }

    if (!leadFormData.companyName.trim()) {
      errors.companyName = "Please enter your company or workspace name";
    }

    if (Object.keys(errors).length > 0) {
      setLeadErrors(errors);
      return;
    }

    setLeadErrors({});
    setIsSubmittingLead(true);

    try {
      const res = await enrollTrialServerFn({
        data: {
          name: leadFormData.name.trim(),
          companyName: leadFormData.companyName.trim(),
          workEmail: leadFormData.workEmail.trim().toLowerCase(),
          phone: leadFormData.phone.trim(),
          seats: teamSize,
        },
      });

      if (!res.ok) {
        if (res.code === "EMAIL_EXISTS") {
          setLeadErrors({
            workEmail: res.error || "An account with this email already exists.",
            form: res.error || "An account with this email already exists. Please sign in instead.",
          });
        } else {
          setLeadErrors({
            form: res.error || "Could not provision your trial. Please try again.",
          });
        }
        return;
      }

      const provisionedSeats = res.company?.seat_limit || teamSize;
      const provisionedCompanyName = res.company?.name || leadFormData.companyName.trim();

      trackCompleteRegistration({
        seats: provisionedSeats,
        company_name: provisionedCompanyName,
        estimated_monthly_value: monthlyTotal,
      });

      if (res.company?.id) {
        markPendingTrialActivation(res.company.id, provisionedSeats);
      }

      setTrialResult({
        provisioned: Boolean(res.provisioned),
        company: res.company || null,
        adminEmail: res.adminEmail || leadFormData.workEmail.trim(),
        tempPassword: res.tempPassword,
        session: res.session || null,
        emailSent: Boolean(res.emailSent),
      });
      setLeadSubmitted(true);
    } catch (err: any) {
      setLeadErrors({
        form: err?.message || "Network error while provisioning workspace. Please try again.",
      });
    } finally {
      setIsSubmittingLead(false);
    }
  };

  const handleEnterWorkspace = async () => {
    if (trialResult?.session?.access_token) {
      try {
        setIsEnteringWorkspace(true);
        await supabase.auth.setSession(trialResult.session);
        trackTrialActivated({
          companyId: trialResult?.company?.id,
          seats: trialResult?.company?.seat_limit || teamSize,
          method: "instant_enter",
        });
        navigate({ to: "/dashboard" });
      } catch (err) {
        console.error("Direct session navigation error:", err);
        navigate({ to: "/login" });
      } finally {
        setIsEnteringWorkspace(false);
      }
    } else {
      navigate({ to: "/login" });
    }
  };

  // Demo Booking Modal State
  const [demoModalOpen, setDemoModalOpen] = useState<boolean>(false);

  const handleOpenDemoModal = () => {
    setDemoModalOpen(true);
  };

  const basePlanPrice = 2499;
  const baseEmployeesIncluded = 10;
  const additionalPricePerEmployee = 149;
  const traditionalAvgPrice = 250;

  const isEnterprise = teamSize > 100;

  const monthlyTotal =
    teamSize <= baseEmployeesIncluded
      ? basePlanPrice
      : basePlanPrice + (teamSize - baseEmployeesIncluded) * additionalPricePerEmployee;

  const traditionalMonthlyTotal = teamSize * traditionalAvgPrice;

  const comparisonData = [
    {
      feature: "Monthly pricing model",
      traditional: "₹150 – ₹400 / employee",
      traditionalNote: "+ module tier add-ons",
      teamstuff: "₹2,499 / mo (10 included)",
      teamstuffNote: "+ ₹149/mo per additional employee",
      highlight: true,
    },
    {
      feature: "Setup & Onboarding Fees",
      traditional: "₹10,000 – ₹50,000",
      traditionalNote: "Mandatory implementation charges",
      teamstuff: "₹0 Free",
      teamstuffNote: "Zero setup fee",
      highlight: false,
    },
    {
      feature: "Task Management & Sprint Kanban",
      traditional: "Not included",
      traditionalNote: "Requires Jira / Asana ($8/user)",
      teamstuff: "Included",
      teamstuffNote: "Built-in sprint boards & to-dos",
      highlight: false,
    },
    {
      feature: "Geofenced Attendance & Regularization",
      traditional: "Extra Add-On",
      traditionalNote: "Additional ₹40-60/user/mo",
      teamstuff: "Included",
      teamstuffNote: "GPS & WiFi verified logs",
      highlight: false,
    },
    {
      feature: "Automated Payroll & PDF Payslips",
      traditional: "Enterprise Tier only",
      traditionalNote: "Locked behind top tier plans",
      teamstuff: "Included",
      teamstuffNote: "Instant generation & download",
      highlight: false,
    },
    {
      feature: "Corporate Handbook & Induction",
      traditional: "Not available",
      traditionalNote: "Requires Notion or external wiki",
      teamstuff: "Included",
      teamstuffNote: "HR policy handbooks & videos",
      highlight: false,
    },
    {
      feature: "Company Cloud Drive & Storage",
      traditional: "Extra storage costs",
      traditionalNote: "Tiered gigabyte limitations",
      teamstuff: "Included",
      teamstuffNote: "Personal vault & team library",
      highlight: false,
    },
    {
      feature: "Internal Forum & Team Channels",
      traditional: "Not available",
      traditionalNote: "Requires Slack / MS Teams ($7/user)",
      teamstuff: "Included",
      teamstuffNote: "Team announcements & polls",
      highlight: false,
    },
    {
      feature: "Contracts & Commitment",
      traditional: "1 to 3 Year Lock-in",
      traditionalNote: "Strict early termination fees",
      teamstuff: "Monthly, Cancel Anytime",
      teamstuffNote: "Zero lock-in contract",
      highlight: false,
    },
  ];

  const faqs = [
    {
      q: "Are there any setup fees or hidden charges?",
      a: "No. Pricing is strictly ₹2,499/month for your first 10 employees, and ₹149 per additional employee per month thereafter. There are zero onboarding fees, module unlock charges, or surprise extras.",
    },
    {
      q: "Are all modules included in the plan?",
      a: "Yes! Every single module — Tasks & Kanban, Attendance, Leaves, Payroll & Payslips, Corporate Hub policies, Induction Guides, Files Cloud Drive, Internal Forum, and Multi-level Approvals — is included for all your active team members.",
    },
    {
      q: "How does billing work when we add or remove employees?",
      a: "Your base plan covers up to 10 employees. For teams larger than 10, your subscription automatically scales at ₹149 per additional active employee per month. You can add or remove team members anytime.",
    },
    {
      q: "Can we test the platform before committing?",
      a: "Absolutely! You can book a free demo and get a fully-featured trial workspace for your company with zero credit card required.",
    },
    {
      q: "What payment methods are supported?",
      a: "We support UPI, Net Banking, Debit/Credit cards, and GST invoice billing for Indian and international corporate entities.",
    },
  ];

  return (
    <div className="pricing-page-root">
      {/* Outer Curved Tablet Container Frame */}
      <div className="pricing-outer-frame">
        {/* Main Sky Hero Shell */}
        <div className="pricing-sky-hero">
          {/* Parallax Sky Background */}
          <div className="pricing-sky-bg" />

          {/* Soft Contrast Gradient Overlay */}
          <div className="pricing-sky-gradient" />

          {/* Navbar */}
          <header className="pricing-header">
            <BrandLogo />
            <div className="pricing-header-actions">
              <button
                type="button"
                className="pricing-btn-demo"
                onClick={handleOpenDemoModal}
              >
                Book Demo
              </button>
              <button
                type="button"
                className="pricing-btn-signin"
                onClick={() => navigate({ to: "/login" })}
              >
                Sign In
              </button>
            </div>
          </header>

          {/* Hero Content & Pricing Headline */}
          <div className="pricing-hero-content">
            <h1 className="pricing-hero-h1">
              <span className="pricing-word" style={{ animationDelay: "0.08s", marginRight: "0.26em" }}>One</span>
              <span className="pricing-word" style={{ animationDelay: "0.16s", marginRight: "0.26em" }}>flat</span>
              <span className="pricing-word" style={{ animationDelay: "0.24s", marginRight: "0.38em" }}>price.</span>
              <span className="pricing-word" style={{ animationDelay: "0.34s", marginRight: "0.26em" }}>Every</span>
              <span className="pricing-word" style={{ animationDelay: "0.42s", marginRight: "0.26em" }}>module</span>
              <span className="pricing-word" style={{ animationDelay: "0.50s" }}>included.</span>
            </h1>

            <p className="pricing-hero-subtitle">
              No setup fees, no feature tiers, and no hidden add-on costs. Base plan{" "}
              <span className="pricing-highlight-price">
                ₹2,499 / month
                <svg
                  viewBox="0 0 160 14"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="pricing-svg-underline"
                >
                  <path
                    d="M3 8.5C38 3.5 118 2 157 9.5C132 12.5 75 13 42 11"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pricing-svg-path"
                  />
                </svg>
              </span>{" "}
              includes up to 10 employees, then just ₹149 per additional employee.
            </p>

            {/* Comparison & Calculator Table */}
            <div className="pricing-table-wrapper">
              <div className="pricing-table-card">
                <div className="pricing-table-scroll">
                  <table className="pricing-table">
                    <thead>
                      <tr>
                        <th style={{ width: "36%" }}>Features & Capabilities</th>
                        <th style={{ width: "30%" }}>Traditional HRMS</th>
                        <th className="th-teamstuff">indiecode HRMS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonData.map((row, idx) => (
                        <tr
                          key={idx}
                          className={row.highlight ? "row-highlight" : ""}
                        >
                          <td>
                            <span className={`pricing-feature-name ${row.highlight ? "highlight" : ""}`}>
                              {row.feature}
                            </span>
                          </td>
                          <td>
                            <p className="pricing-trad-val">{row.traditional}</p>
                            <p className="pricing-trad-note">{row.traditionalNote}</p>
                          </td>
                          <td className="pricing-td-teamstuff">
                            <div className="pricing-teamstuff-val-box">
                              <CheckCircle2 size={16} color="#18181B" />
                              <span className="pricing-teamstuff-val">{row.teamstuff}</span>
                            </div>
                            <p className="pricing-teamstuff-note">
                              {row.teamstuffNote}
                            </p>
                          </td>
                        </tr>
                      ))}

                      {/* Headcount Calculator Row */}
                      <tr className="pricing-calculator-row">
                        {/* Col 1: Slider */}
                        <td>
                          <div className="pricing-calc-label-box">
                            <Users size={17} color="#18181B" />
                            <span>Calculate For Your Team</span>
                          </div>
                          <div className="pricing-calc-slider-box">
                            <div className="pricing-calc-count-header">
                              <span>Seats:</span>
                              <span className="pricing-calc-count-val">
                                {isEnterprise ? "100+ (Custom Enterprise)" : `${teamSize} seats`}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={5}
                              max={105}
                              step={5}
                              value={teamSize}
                              onChange={(e) => setTeamSize(Number(e.target.value))}
                              className="pricing-range-slider"
                              aria-label="Select Team Size"
                            />
                          </div>
                        </td>

                        {/* Col 2: Traditional Cost */}
                        <td>
                          <p className="pricing-trad-total-val">
                            {isEnterprise ? "Custom" : `₹${traditionalMonthlyTotal.toLocaleString("en-IN")} / mo`}
                          </p>
                          <p className="pricing-trad-note">
                            {isEnterprise ? "Volume licensing & SLA" : "+ mandatory setup fees"}
                          </p>
                        </td>

                        {/* Col 3: Real-Time Total */}
                        <td className="pricing-td-teamstuff">
                          <div className="pricing-total-box">
                            <span className="pricing-total-price">
                              {isEnterprise ? "Custom" : `₹${monthlyTotal.toLocaleString("en-IN")}`}
                            </span>
                            <span className="pricing-total-period">
                              {isEnterprise ? "Enterprise" : "/ month"}
                            </span>
                          </div>
                          {!isEnterprise && (
                            <p className="pricing-total-savings">
                              Save ~₹{(traditionalMonthlyTotal - monthlyTotal > 0 ? traditionalMonthlyTotal - monthlyTotal : 0).toLocaleString("en-IN")}/mo • All modules
                            </p>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Standalone Trial / Lead Form Card (Separated from the table above) */}
              <div id="trial-form" className="pricing-trial-card">
                {leadSubmitted ? (
                  <div className="pricing-lead-success-wrap">
                    <div className="pricing-success-badge">
                      <Check size={20} strokeWidth={2.4} />
                    </div>
                    <h3 className="pricing-lead-success-title">
                      {trialResult?.company?.name ? `${trialResult.company.name} is Ready!` : "Your 14-Day Free Trial is Ready!"}
                    </h3>
                    <p className="pricing-lead-success-desc">
                      {trialResult?.emailSent ? (
                        <>
                          Your 14-day trial workspace ({trialResult.company?.seat_limit || teamSize} seats) has been provisioned. We sent your sign-in details to <strong style={{ color: "#09090B", fontWeight: 600 }}>{trialResult.adminEmail}</strong>.
                        </>
                      ) : (
                        <>
                          Your 14-day trial workspace ({trialResult?.company?.seat_limit || teamSize} seats) is active with all HRMS modules unlocked.
                        </>
                      )}
                    </p>

                    {trialResult?.tempPassword && (
                      <div className="pricing-credentials-box">
                        <div className="pricing-credential-row">
                          <span className="pricing-credential-label">Work Email</span>
                          <span className="pricing-credential-value">{trialResult.adminEmail}</span>
                        </div>

                        <div className="pricing-credential-divider" />

                        <div className="pricing-credential-row">
                          <span className="pricing-credential-label">Temporary Password</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <code className="pricing-credential-pass">{trialResult.tempPassword}</code>
                            <button
                              type="button"
                              onClick={() => {
                                if (trialResult?.tempPassword) {
                                  navigator.clipboard.writeText(trialResult.tempPassword);
                                  setCopiedPass(true);
                                  setTimeout(() => setCopiedPass(false), 2000);
                                }
                              }}
                              className="pricing-copy-btn"
                              title="Copy password"
                            >
                              {copiedPass ? <Check size={12} color="#16A34A" /> : <Copy size={12} />}
                              <span>{copiedPass ? "Copied" : "Copy"}</span>
                            </button>
                          </div>
                        </div>

                        <div className="pricing-credential-note">
                          You can change this password anytime in HRMS Settings.
                        </div>
                      </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                      <button
                        type="button"
                        onClick={handleEnterWorkspace}
                        disabled={isEnteringWorkspace}
                        className="pricing-trial-submit-btn"
                        style={{ maxWidth: 440, margin: "0 auto" }}
                      >
                        {isEnteringWorkspace ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            <span>Opening workspace...</span>
                          </>
                        ) : (
                          <>
                            <span>{trialResult?.session?.access_token ? "Enter Workspace Immediately" : "Sign In to Workspace"}</span>
                            <ArrowRight size={16} />
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setLeadSubmitted(false);
                          setTrialResult(null);
                          hasStartedFormRef.current = false;
                          setLeadFormData({ name: "", workEmail: "", phone: "", companyName: "" });
                        }}
                        className="pricing-lead-reset-btn"
                      >
                        Provision another workspace
                      </button>
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={handleLeadSubmit}
                    onFocusCapture={handleFormFocusCapture}
                    className="pricing-trial-form"
                  >
                    <div className="pricing-trial-header">
                      <h3 className="pricing-trial-title">Start your 14-day free trial</h3>
                      <span className="pricing-trial-subtitle">
                        Zero upfront cost • Instant workspace setup
                      </span>
                    </div>

                    {leadErrors.form && (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: "10px 14px",
                          borderRadius: 8,
                          backgroundColor: "#FEF2F2",
                          border: "1px solid #FECACA",
                          color: "#DC2626",
                          fontSize: "0.85rem",
                        }}
                      >
                        {leadErrors.form}
                      </div>
                    )}

                    <div className="pricing-trial-grid">
                      {/* Your Name */}
                      <div className="pricing-input-group">
                        <label className="pricing-input-label">Your Name</label>
                        <input
                          type="text"
                          name="name"
                          placeholder="e.g. Rahul Sharma"
                          value={leadFormData.name}
                          onChange={(e) => {
                            setLeadFormData({ ...leadFormData, name: e.target.value });
                            if (leadErrors.name) setLeadErrors({ ...leadErrors, name: "" });
                          }}
                          className={`pricing-input-field ${leadErrors.name ? "error" : ""}`}
                        />
                        {leadErrors.name && (
                          <p className="pricing-input-error-msg">{leadErrors.name}</p>
                        )}
                      </div>

                      {/* Work Email */}
                      <div className="pricing-input-group">
                        <label className="pricing-input-label">Work Email</label>
                        <input
                          type="email"
                          name="workEmail"
                          placeholder="name@company.com"
                          value={leadFormData.workEmail}
                          onChange={(e) => {
                            setLeadFormData({ ...leadFormData, workEmail: e.target.value });
                            if (leadErrors.workEmail) setLeadErrors({ ...leadErrors, workEmail: "" });
                          }}
                          className={`pricing-input-field ${leadErrors.workEmail ? "error" : ""}`}
                        />
                        {leadErrors.workEmail && (
                          <p className="pricing-input-error-msg">{leadErrors.workEmail}</p>
                        )}
                      </div>

                      {/* Phone Number */}
                      <div className="pricing-input-group">
                        <label className="pricing-input-label">Phone Number</label>
                        <input
                          type="tel"
                          name="phone"
                          placeholder="+91 98765 43210"
                          value={leadFormData.phone}
                          onChange={(e) => {
                            setLeadFormData({ ...leadFormData, phone: e.target.value });
                            if (leadErrors.phone) setLeadErrors({ ...leadErrors, phone: "" });
                          }}
                          className={`pricing-input-field ${leadErrors.phone ? "error" : ""}`}
                        />
                        {leadErrors.phone && (
                          <p className="pricing-input-error-msg">{leadErrors.phone}</p>
                        )}
                      </div>

                      {/* Seats Needed */}
                      <div className="pricing-input-group">
                        <label className="pricing-input-label">Seats Needed</label>
                        <div className="pricing-team-size-wrap">
                          <input
                            type="number"
                            name="seats"
                            value={teamSize}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10);
                              if (!isNaN(val) && val >= 1) {
                                setTeamSize(Math.min(val, 2000));
                              }
                            }}
                            className="pricing-team-size-input"
                            min={1}
                            max={2000}
                          />
                          <span className="pricing-team-size-suffix">seats</span>
                        </div>
                      </div>

                      {/* Company or Workspace Name */}
                      <div className="pricing-input-group pricing-input-fullwidth">
                        <label className="pricing-input-label">Company or Workspace Name</label>
                        <input
                          type="text"
                          name="companyName"
                          placeholder="e.g. Acme Growth Studio"
                          value={leadFormData.companyName}
                          onChange={(e) => {
                            setLeadFormData({ ...leadFormData, companyName: e.target.value });
                            if (leadErrors.companyName) setLeadErrors({ ...leadErrors, companyName: "" });
                          }}
                          className={`pricing-input-field ${leadErrors.companyName ? "error" : ""}`}
                        />
                        {leadErrors.companyName && (
                          <p className="pricing-input-error-msg">{leadErrors.companyName}</p>
                        )}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingLead}
                      className="pricing-trial-submit-btn"
                    >
                      {isSubmittingLead ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          <span>Starting trial...</span>
                        </>
                      ) : (
                        <span>Start 14-Day Free Trial</span>
                      )}
                    </button>
                  </form>
                )}
              </div>

              {/* Trust Guarantees */}
              <div className="pricing-trust-bar">
                <div className="pricing-trust-pill">
                  <CheckCircle2 size={15} />
                  <span>14-day free trial • ₹0 upfront</span>
                </div>
                <div className="pricing-trust-pill">
                  <Lock size={14} />
                  <span>No lock-in contracts</span>
                </div>
                <div className="pricing-trust-pill">
                  <Headphones size={14} />
                  <span>Priority support</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Frequently Asked Questions Section */}
      <section className="pricing-faq-section">
        <div className="pricing-faq-container">
          <RevealOnScroll direction="up" distance={20}>
            <div className="pricing-faq-header">
              <h2 className="pricing-faq-title">
                Frequently Asked Questions
              </h2>
              <p className="pricing-faq-subtitle">
                Clear answers to common questions about indiecode HRMS pricing.
              </p>
            </div>
          </RevealOnScroll>

          <div className="pricing-faq-list">
            {faqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <RevealOnScroll key={idx} delay={idx * 0.04}>
                  <div
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className={`pricing-faq-item ${isOpen ? "open" : ""}`}
                  >
                    <div className="pricing-faq-q-row">
                      <h3 className="pricing-faq-question">
                        {faq.q}
                      </h3>
                      <span className="pricing-faq-icon">
                        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </span>
                    </div>

                    {isOpen && (
                      <p className="pricing-faq-answer">
                        {faq.a}
                      </p>
                    )}
                  </div>
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      {/* Full-Width Pre-Footer CTA */}
      <section className="pricing-bottom-cta">
        <div className="pricing-bottom-cta-bg" />
        <div className="pricing-bottom-cta-gradient" />

        <div className="pricing-bottom-cta-content">
          <RevealOnScroll direction="up" distance={25} duration={0.8}>
            <h2 className="pricing-bottom-cta-h2">
              Ready to simplify your workspace?
            </h2>
            <p className="pricing-bottom-cta-subtitle">
              Start with 10 employees for ₹2,499/mo, or ₹149 per employee beyond. No long-term lock-in, cancel anytime.
            </p>
            <div className="pricing-bottom-cta-actions">
              <button
                type="button"
                onClick={handleOpenDemoModal}
                className="pricing-bottom-btn-demo"
              >
                Book A Free Demo
              </button>
              <button
                type="button"
                onClick={() => navigate({ to: "/" })}
                className="pricing-bottom-btn-home"
              >
                Back to Home
              </button>
            </div>
          </RevealOnScroll>
        </div>
      </section>

      {/* Pricing Footer */}
      <footer className="pricing-footer">
        <div className="pricing-footer-content">
          <BrandLogo />
          <p className="pricing-footer-copy">
            © 2026 indiecode. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Book Demo Modal */}
      <BookDemoModal
        open={demoModalOpen}
        onClose={() => setDemoModalOpen(false)}
        defaultTeamSize={isEnterprise ? 100 : teamSize}
      />
    </div>
  );
}
