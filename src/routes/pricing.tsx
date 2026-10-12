import React, { useState, useEffect, useRef } from "react";
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { BookDemoModal } from "../components/BookDemoModal";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Lock,
  Headphones,
  Users,
  Loader2,
} from "lucide-react";
import { getBrandConfig } from "../lib/brand-config";
import { getTenantFromHost } from "../lib/tenant-brand";

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
      <img
        src="/capoasis_intranet.png"
        alt="CapOasis Intranet"
        className="pricing-brand-img"
      />
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

  useEffect(() => {
    const brand = getBrandConfig();
    const detectedTenant = getTenantFromHost();
    if (!brand.showPricing || detectedTenant) {
      navigate({ to: "/login" });
    }
  }, [navigate]);

  const [teamSize, setTeamSize] = useState<number>(30);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Lead Form State
  const [leadFormData, setLeadFormData] = useState({
    name: "",
    workEmail: "",
    phone: "",
  });
  const [leadErrors, setLeadErrors] = useState<Record<string, string>>({});
  const [isSubmittingLead, setIsSubmittingLead] = useState<boolean>(false);
  const [leadSubmitted, setLeadSubmitted] = useState<boolean>(false);

  const validateEmail = (email: string): boolean => {
    const trimmed = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(trimmed);
  };

  const handleLeadSubmit = (e: React.FormEvent) => {
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

    if (Object.keys(errors).length > 0) {
      setLeadErrors(errors);
      return;
    }

    setLeadErrors({});
    setIsSubmittingLead(true);

    setTimeout(() => {
      setIsSubmittingLead(false);
      setLeadSubmitted(true);
    }, 900);
  };

  // Demo Booking Modal State
  const [demoModalOpen, setDemoModalOpen] = useState<boolean>(false);

  const handleOpenDemoModal = () => {
    setDemoModalOpen(true);
  };

  const pricePerEmployee = 59;
  const traditionalAvgPrice = 250;
  const monthlyTotal = teamSize * pricePerEmployee;
  const traditionalMonthlyTotal = teamSize * traditionalAvgPrice;
  const monthlySavings = traditionalMonthlyTotal - monthlyTotal;

  const comparisonData = [
    {
      feature: "Monthly price per user",
      traditional: "₹150 – ₹400 / employee",
      traditionalNote: "+ module tier add-ons",
      capoasis: "₹59 / employee",
      capoasisNote: "Flat all-inclusive rate",
      highlight: true,
    },
    {
      feature: "Setup & Onboarding Fees",
      traditional: "₹10,000 – ₹50,000",
      traditionalNote: "Mandatory implementation charges",
      capoasis: "₹0 Free",
      capoasisNote: "Zero setup fee",
      highlight: false,
    },
    {
      feature: "Task Management & Sprint Kanban",
      traditional: "Not included",
      traditionalNote: "Requires Jira / Asana ($8/user)",
      capoasis: "Included",
      capoasisNote: "Built-in sprint boards & to-dos",
      highlight: false,
    },
    {
      feature: "Geofenced Attendance & Regularization",
      traditional: "Extra Add-On",
      traditionalNote: "Additional ₹40-60/user/mo",
      capoasis: "Included",
      capoasisNote: "GPS & WiFi verified logs",
      highlight: false,
    },
    {
      feature: "Automated Payroll & PDF Payslips",
      traditional: "Enterprise Tier only",
      traditionalNote: "Locked behind top tier plans",
      capoasis: "Included",
      capoasisNote: "Instant generation & download",
      highlight: false,
    },
    {
      feature: "Corporate Handbook & Induction",
      traditional: "Not available",
      traditionalNote: "Requires Notion or external wiki",
      capoasis: "Included",
      capoasisNote: "HR policy handbooks & videos",
      highlight: false,
    },
    {
      feature: "Company Cloud Drive & Storage",
      traditional: "Extra storage costs",
      traditionalNote: "Tiered gigabyte limitations",
      capoasis: "Included",
      capoasisNote: "Personal vault & team library",
      highlight: false,
    },
    {
      feature: "Internal Forum & Team Channels",
      traditional: "Not available",
      traditionalNote: "Requires Slack / MS Teams ($7/user)",
      capoasis: "Included",
      capoasisNote: "Team announcements & polls",
      highlight: false,
    },
    {
      feature: "Contracts & Commitment",
      traditional: "1 to 3 Year Lock-in",
      traditionalNote: "Strict early termination fees",
      capoasis: "Monthly, Cancel Anytime",
      capoasisNote: "Zero lock-in contract",
      highlight: false,
    },
  ];

  const faqs = [
    {
      q: "Are there any setup fees or hidden charges?",
      a: "No. Pricing is strictly ₹59 per active employee per month. There are zero onboarding fees, module unlock charges, or surprise extras.",
    },
    {
      q: "Are all modules included in the ₹59 plan?",
      a: "Yes! Every single module — Tasks & Kanban, Attendance, Leaves, Payroll & Payslips, Corporate Hub policies, Induction Guides, Files Cloud Drive, Internal Forum, and Multi-level Approvals — is included for all your employees.",
    },
    {
      q: "How does billing work when we add or remove employees?",
      a: "Your subscription automatically adjusts based on your active employee count. You only ever pay for what your organization actually uses.",
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
              No setup fees, no feature tiers, and no hidden add-on costs. Just flat{" "}
              <span className="pricing-highlight-price">
                ₹59 per employee
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
              per month.
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
                        <th className="th-capoasis">CapOasis Intranet</th>
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
                          <td className="pricing-td-capoasis">
                            <div className="pricing-capoasis-val-box">
                              <CheckCircle2 size={16} color="#18181B" />
                              <span className="pricing-capoasis-val">{row.capoasis}</span>
                            </div>
                            <p className="pricing-capoasis-note">
                              {row.capoasisNote}
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
                              <span>Headcount:</span>
                              <span className="pricing-calc-count-val">
                                {teamSize} employees
                              </span>
                            </div>
                            <input
                              type="range"
                              min={5}
                              max={250}
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
                            ₹{traditionalMonthlyTotal.toLocaleString("en-IN")} / mo
                          </p>
                          <p className="pricing-trad-note">+ mandatory setup fees</p>
                        </td>

                        {/* Col 3: CapOasis Real-Time Total */}
                        <td className="pricing-td-capoasis">
                          <div className="pricing-total-box">
                            <span className="pricing-total-price">
                              ₹{monthlyTotal.toLocaleString("en-IN")}
                            </span>
                            <span className="pricing-total-period">/ month</span>
                          </div>
                          <p className="pricing-total-savings">
                            Save ~₹{monthlySavings.toLocaleString("en-IN")}/mo • All modules
                          </p>
                        </td>
                      </tr>

                      {/* Permanent Inline Lead Form Row */}
                      <tr className="pricing-lead-form-row">
                        <td colSpan={3}>
                          <div className="pricing-lead-form-wrap">
                            {leadSubmitted ? (
                              <div className="pricing-lead-success-card">
                                <div className="pricing-lead-success-icon">
                                  <CheckCircle2 size={22} />
                                </div>
                                <h4 className="pricing-lead-success-title">
                                  Request received for {teamSize} employees
                                </h4>
                                <p className="pricing-lead-success-desc">
                                  We will reach out to <strong>{leadFormData.workEmail}</strong> shortly with your team's workspace details.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLeadSubmitted(false);
                                    setLeadFormData({ name: "", workEmail: "", phone: "" });
                                  }}
                                  className="pricing-lead-reset-btn"
                                >
                                  Submit another request
                                </button>
                              </div>
                            ) : (
                              <form onSubmit={handleLeadSubmit}>
                                <div className="pricing-lead-header">
                                  <h4 className="pricing-lead-title">
                                    Ready to get started?
                                  </h4>
                                  <span className="pricing-lead-subtitle">
                                    Instant response • Zero commitments
                                  </span>
                                </div>

                                <div className="pricing-lead-grid">
                                  {/* Name */}
                                  <div className="pricing-input-group">
                                    <label className="pricing-input-label">
                                      Your Name
                                    </label>
                                    <input
                                      type="text"
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
                                    <label className="pricing-input-label">
                                      Work Email
                                    </label>
                                    <input
                                      type="email"
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

                                  {/* Phone */}
                                  <div className="pricing-input-group">
                                    <label className="pricing-input-label">
                                      Phone Number
                                    </label>
                                    <input
                                      type="tel"
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

                                  {/* Team Size */}
                                  <div className="pricing-input-group">
                                    <label className="pricing-input-label">
                                      Team Size
                                    </label>
                                    <div className="pricing-team-size-wrap">
                                      <input
                                        type="number"
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
                                      <span className="pricing-team-size-suffix">
                                        employees
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="submit"
                                  disabled={isSubmittingLead}
                                  className="pricing-lead-submit-btn"
                                >
                                  {isSubmittingLead ? (
                                    <>
                                      <Loader2 size={16} className="animate-spin" />
                                      <span>Submitting...</span>
                                    </>
                                  ) : (
                                    <span>Submit Request</span>
                                  )}
                                </button>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Trust Guarantees */}
              <div className="pricing-trust-bar">
                <div className="pricing-trust-item">
                  <ShieldCheck size={16} color="#18181B" />
                  <span>Zero setup fee</span>
                </div>
                <div className="pricing-trust-item">
                  <Lock size={16} color="#18181B" />
                  <span>No lock-in contracts</span>
                </div>
                <div className="pricing-trust-item">
                  <Headphones size={16} color="#18181B" />
                  <span>Priority Indian support</span>
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
                Clear answers to common questions about CapOasis Intranet pricing.
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
              Start for just ₹59 per employee per month. No long-term lock-in, cancel anytime.
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
            © 2026 CapOasis Intranet. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Book Demo Modal */}
      <BookDemoModal
        open={demoModalOpen}
        onClose={() => setDemoModalOpen(false)}
        defaultTeamSize={teamSize}
      />
    </div>
  );
}
