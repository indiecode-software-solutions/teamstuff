import React, { useState, useEffect, useRef } from "react";
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { BookDemoModal } from "../components/BookDemoModal";
import { useScrollReveal, useSpotlightSurface } from "../hooks/useKineticMotion";
import { trackPricingClick, trackStartTrialClick } from "../lib/meta-pixel";
import {
  ArrowRight,
  LayoutDashboard,
  Building2,
  ListTodo,
  FolderOpen,
  ClipboardCheck,
  ReceiptText,
  ChevronRight,
  Users,
  Clock,
  Calendar,
  ListCheck,
  Megaphone,
  FolderLock,
  MessageSquare,
  UserCheck,
  ShieldAlert,
  Linkedin,
  Twitter,
  Youtube,
  Instagram,
  FileText,
  FileCheck,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { getBrandConfig } from "../lib/brand-config";
import { getTenantFromHost } from "../lib/tenant-brand";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window !== "undefined") {
      const brand = getBrandConfig();
      if (!brand.showMarketingLanding) {
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
      title: `${brand.appName} | ${brand.tagline}`,
      meta: [
        {
          name: "description",
          content: brand.metaDescription,
        },
        {
          name: "keywords",
          content: `${brand.shortName.toLowerCase()}, hrms, workspace, task management, collaboration, attendance, payroll`,
        },
        { property: "og:title", content: `${brand.appName} | ${brand.tagline}` },
        {
          property: "og:description",
          content: brand.metaDescription,
        },
        { property: "og:type", content: "website" },
        { name: "robots", content: "index, follow" },
      ],
    };
  },
  component: LandingPage,
});

// Brand Logo Component
function BrandLogo() {
  return (
    <a href="/" className="landing-brand-link">
      <span className="landing-brand-name">indiecode hrms</span>
    </a>
  );
}

// Reveal on Scroll Component
function RevealOnScroll({
  children,
  delay = 0,
  direction = "up",
  distance = 32,
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
        threshold: 0.12,
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
        return "translate3d(0, 0, 0) scale(0.97)";
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

function LandingPage() {
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [emailSubscribed, setEmailSubscribed] = useState(false);
  const [emailInput, setEmailInput] = useState("");

  const pageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useScrollReveal(pageRef);
  useSpotlightSurface(ctaRef);

  useEffect(() => {
    const brand = getBrandConfig();
    if (!brand.showMarketingLanding) {
      navigate({ to: "/login" });
      return;
    }

    const detectedTenant = getTenantFromHost();
    if (detectedTenant) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          navigate({ to: "/dashboard" });
        } else {
          navigate({ to: "/login" });
        }
      });
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate({ to: "/dashboard" });
      } else {
        setCheckingAuth(false);
      }
    });
  }, [navigate]);

  // Subtle Parallax Scroll Effect for Hero Background
  useEffect(() => {
    let ticking = false;

    const updateTransforms = () => {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      document.documentElement.style.setProperty("--scroll-y", `${scrollY}`);
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateTransforms);
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (checkingAuth) {
    return null;
  }

  return (
    <div ref={pageRef} className="landing-page-root">
      {/* Outer Curved Architectural Window Container Frame */}
      <div className="landing-outer-frame">
        {/* Main Sky Hero Shell */}
        <div ref={heroRef} className="landing-sky-hero">
          {/* Parallax Sky Background */}
          <div className="landing-sky-bg" />

          {/* Soft Contrast Gradient Overlay */}
          <div className="landing-sky-gradient" />

          {/* 1. Header Navigation Bar */}
          <header className="landing-hero-header">
            {/* Logo */}
            <BrandLogo />

            {/* Right Action Buttons */}
            <div className="landing-hero-actions">
              <button
                type="button"
                className="landing-pill-btn-pricing"
                onClick={() => {
                  trackPricingClick({ location: "header" });
                  navigate({ to: "/pricing" });
                }}
              >
                Pricing
              </button>
              <button
                type="button"
                className="landing-pill-btn-signin"
                onClick={() => navigate({ to: "/login" })}
              >
                Sign In
              </button>
            </div>
          </header>

          {/* 2. Hero Headline & Subtitle */}
          <div className="landing-hero-content">
            {/* Main Display Headline (Clean, minimal aesthetic) */}
            <div className="hero-headline-container">
              <h1 className="hero-main-title">
                <span className="hero-title-row-1">
                  Work has a lot of stuff.
                </span>
                <span className="hero-title-row-2">
                  We put it in one place.
                </span>
              </h1>
            </div>

            {/* Subtitle */}
            <p className="hero-subtitle">
              Designed for high-output teams that value their time. Strip away administrative friction, eliminate hours of weekly busywork, and give your people the clarity they need to move fast and do their best work.
            </p>

            {/* Two Clean Hero CTA Action Buttons */}
            <div className="hero-cta-wrapper">
              <button
                type="button"
                className="hero-cta-pill"
                onClick={() => {
                  trackStartTrialClick({ location: "hero" });
                  navigate({ to: "/pricing", hash: "trial-form", hashScrollIntoView: false });
                }}
              >
                <span>Start 14-day free trial</span>
                <span className="hero-cta-arrow">
                  <ArrowRight size={15} strokeWidth={2.5} />
                </span>
              </button>

              <button
                type="button"
                className="hero-cta-secondary"
                onClick={() => setDemoModalOpen(true)}
              >
                Book a demo
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Editorial Vertical Flow Narrative (Feature Breakdown) */}
      <section id="features" className="editorial-flow-section" aria-label="Product Workflow">
        <div className="editorial-flow-container">
          {/* Section Headline */}
          <div className="editorial-section-header" data-scroll-reveal="header">
            <h2 className="editorial-section-title">
              Feature Breakdown<span className="editorial-title-dot">.</span>
            </h2>
          </div>

          {/* BLOCK 01: GEOFENCED ATTENDANCE */}
          <article className="editorial-story-block" data-scroll-reveal="story">
            <div className="editorial-lead-meta">
              <span className="editorial-index">01</span>
              <span className="editorial-category">Attendance & Time</span>
            </div>
            <div className="editorial-main-content">
              <h3 className="editorial-statement">
                Attendance without the friction.<br />
                <span className="editorial-statement-accent">Geofenced, automated, and tamper-proof.</span>
              </h3>
              <p className="editorial-description">
                Eliminate proxy clock-ins, biometric hardware failures, and messy manual spreadsheets. indiecode HRMS enforces real-time GPS geofenced check-ins, automated shift rosters, and instant timesheet aggregation directly from mobile or desktop.
              </p>
              <div className="editorial-highlight-row" data-stagger-group="stats">
                <div className="editorial-stat-item">
                  <span className="editorial-stat-value">12ms</span>
                  <span className="editorial-stat-label">Geofence coordinate verification</span>
                </div>
                <div className="editorial-stat-item">
                  <span className="editorial-stat-value">Zero</span>
                  <span className="editorial-stat-label">Hardware biometric failure rates</span>
                </div>
                <div className="editorial-stat-item">
                  <span className="editorial-stat-value">100%</span>
                  <span className="editorial-stat-label">Real-time attendance audit trail</span>
                </div>
              </div>
            </div>
          </article>

          {/* Subtle Divider */}
          <div className="editorial-divider" data-scroll-reveal="divider" aria-hidden="true" />

          {/* BLOCK 02: PAYROLL & STATUTORY COMPLIANCE */}
          <article className="editorial-story-block" data-scroll-reveal="story">
            <div className="editorial-lead-meta">
              <span className="editorial-index">02</span>
              <span className="editorial-category">Payroll & Salary</span>
            </div>
            <div className="editorial-main-content">
              <h3 className="editorial-statement">
                Salary disbursements in minutes,<br />
                <span className="editorial-statement-accent">not the final week of every month.</span>
              </h3>
              <p className="editorial-description">
                Seamlessly sync verified attendance, leave balances, and overtime deductions into automated monthly payroll calculations. Generate compliant, professional payslips and itemized salary structures ready for instant PDF export.
              </p>
              <div className="editorial-highlight-row" data-stagger-group="stats">
                <div className="editorial-stat-item">
                  <span className="editorial-stat-value">1-Click</span>
                  <span className="editorial-stat-label">Automated monthly payroll run</span>
                </div>
                <div className="editorial-stat-item">
                  <span className="editorial-stat-value">Zero</span>
                  <span className="editorial-stat-label">Manual Excel formula errors</span>
                </div>
                <div className="editorial-stat-item">
                  <span className="editorial-stat-value">PDF</span>
                  <span className="editorial-stat-label">Instant employee self-serve payslips</span>
                </div>
              </div>
            </div>
          </article>

          {/* Subtle Divider */}
          <div className="editorial-divider" data-scroll-reveal="divider" aria-hidden="true" />

          {/* BLOCK 03: TASKS & SPRINT MANAGEMENT */}
          <article className="editorial-story-block" data-scroll-reveal="story">
            <div className="editorial-lead-meta">
              <span className="editorial-index">03</span>
              <span className="editorial-category">Work & Sprints</span>
            </div>
            <div className="editorial-main-content">
              <h3 className="editorial-statement">
                Stop paying for five separate tools.<br />
                <span className="editorial-statement-accent">Tasks and HR in the exact same workspace.</span>
              </h3>
              <p className="editorial-description">
                Keep your teams aligned without context switching. Assign priorities, manage Kanban sprint boards, track deliverables, and run team check-ins alongside company holidays, leaves, and employee directories.
              </p>
              <div className="editorial-highlight-row" data-stagger-group="stats">
                <div className="editorial-stat-item">
                  <span className="editorial-stat-value">Kanban</span>
                  <span className="editorial-stat-label">Interactive drag-and-drop boards</span>
                </div>
                <div className="editorial-stat-item">
                  <span className="editorial-stat-value">Zero</span>
                  <span className="editorial-stat-label">Extra subscription fees for Jira/Trello</span>
                </div>
                <div className="editorial-stat-item">
                  <span className="editorial-stat-value">Unified</span>
                  <span className="editorial-stat-label">Seamless link between team & work</span>
                </div>
              </div>
            </div>
          </article>

          {/* Subtle Divider */}
          <div className="editorial-divider" data-scroll-reveal="divider" aria-hidden="true" />

          {/* BLOCK 04: ORGANIZATION & CULTURE */}
          <article className="editorial-story-block" data-scroll-reveal="story">
            <div className="editorial-lead-meta">
              <span className="editorial-index">04</span>
              <span className="editorial-category">People & Culture</span>
            </div>
            <div className="editorial-main-content">
              <h3 className="editorial-statement">
                One clean home for policies,<br />
                <span className="editorial-statement-accent">announcements, documents, and approvals.</span>
              </h3>
              <p className="editorial-description">
                Give your company a single source of truth. Manage multi-tier leave approval chains, publish corporate policies, store employee identity documents securely, and facilitate team discussions in a private internal forum.
              </p>
              <div className="editorial-highlight-row" data-stagger-group="stats">
                <div className="editorial-stat-item">
                  <span className="editorial-stat-value">Cloud</span>
                  <span className="editorial-stat-label">Encrypted company document vault</span>
                </div>
                <div className="editorial-stat-item">
                  <span className="editorial-stat-value">Multi-Tier</span>
                  <span className="editorial-stat-label">Custom approval hierarchy</span>
                </div>
                <div className="editorial-stat-item">
                  <span className="editorial-stat-value">100%</span>
                  <span className="editorial-stat-label">Centralized team announcements</span>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* 4. Dark CTA Architectural Banner with Interactive Cursor Spotlight */}
      <section className="landing-cta-section" aria-label="Get Started Banner">
        <div ref={ctaRef} className="cta-box spotlight-surface" data-scroll-reveal="dark-cta">
          <div className="spotlight-grid-overlay" aria-hidden="true" />
          <h2 className="cta-box-title">Start your 14-day free trial today.</h2>
          <p className="cta-box-subtitle">
            Equip your company with indiecode HRMS for 14 days at zero upfront cost.
            Everything included — attendance, payroll, tasks, and directory.
          </p>
          <div className="cta-box-actions">
            <button
              type="button"
              className="cta-btn-white"
              onClick={() => {
                trackStartTrialClick({ location: "bottom_cta" });
                navigate({ to: "/pricing", hash: "trial-form", hashScrollIntoView: false });
              }}
            >
              Start 14-day free trial &rarr;
            </button>
            <button
              type="button"
              className="cta-btn-outline"
              onClick={() => setDemoModalOpen(true)}
            >
              Book A Free Demo
            </button>
          </div>
        </div>
      </section>

      {/* 7. Modern Footer */}
      <footer className="landing-footer">
        <div className="landing-section-container">
          <div className="landing-footer-grid">
            {/* Col 1: Brand */}
            <div>
              <BrandLogo />
              <p className="landing-footer-brand-desc">
                indiecode connects your people, tasks, and information in one clean place.
              </p>

              <div className="landing-footer-socials">
                {[
                  { icon: Linkedin, href: "#" },
                  { icon: Twitter, href: "#" },
                  { icon: Youtube, href: "#" },
                  { icon: Instagram, href: "#" },
                ].map((social, i) => {
                  const SocialIcon = social.icon;
                  return (
                    <a
                      key={i}
                      href={social.href}
                      className="landing-social-btn"
                      aria-label="Social link"
                    >
                      <SocialIcon size={15} />
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Col 2: Product */}
            <div>
              <h4 className="landing-footer-col-title">Product</h4>
              <div className="landing-footer-links-list">
                {[
                  { label: "Features", href: "/#features" },
                  { label: "Pricing", href: "/pricing" },
                  { label: "Integrations", href: "/#features" },
                  { label: "What's New", href: "/#features" },
                ].map((link, idx) => (
                  <a
                    key={idx}
                    href={link.href}
                    className="landing-footer-link"
                    onClick={
                      link.href === "/pricing"
                        ? (e) => {
                            e.preventDefault();
                            trackPricingClick({ location: "footer" });
                            navigate({ to: "/pricing" });
                          }
                        : undefined
                    }
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>

            {/* Col 3: Company */}
            <div>
              <h4 className="landing-footer-col-title">Company</h4>
              <div className="landing-footer-links-list">
                {["About Us", "Careers", "Blog", "Contact Us"].map((link, idx) => (
                  <a key={idx} href="#about" className="landing-footer-link">
                    {link}
                  </a>
                ))}
              </div>
            </div>

            {/* Col 4: Resources */}
            <div>
              <h4 className="landing-footer-col-title">Resources</h4>
              <div className="landing-footer-links-list">
                {[
                  { label: "Help Centre", href: "#" },
                  { label: "Guides", href: "#" },
                  { label: "Privacy Policy", href: "/privacy-policy.html" },
                  { label: "Terms of Service", href: "/terms.html" },
                ].map((link, idx) => (
                  <a
                    key={idx}
                    href={link.href}
                    target={link.href.endsWith(".html") ? "_blank" : "_self"}
                    rel="noreferrer"
                    className="landing-footer-link"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            </div>

            {/* Col 5: Newsletter */}
            <div>
              <h4 className="landing-footer-col-title">Stay in the loop</h4>
              <p className="landing-footer-brand-desc" style={{ marginTop: 0 }}>
                Subscribe to get the latest updates and announcements.
              </p>

              {emailSubscribed ? (
                <div className="landing-newsletter-success">
                  ✓ Thank you for subscribing!
                </div>
              ) : (
                <form
                  className="landing-newsletter-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (emailInput.trim()) setEmailSubscribed(true);
                  }}
                >
                  <input
                    type="email"
                    required
                    placeholder="Enter your email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="landing-newsletter-input"
                  />
                  <button type="submit" className="landing-newsletter-btn" aria-label="Subscribe">
                    <ArrowRight size={15} />
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Bottom Copyright Bar */}
          <div className="landing-footer-bottom">
            <p className="landing-copyright-text">
              © 2026 indiecode. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Book Demo Modal */}
      <BookDemoModal open={demoModalOpen} onClose={() => setDemoModalOpen(false)} />
    </div>
  );
}
