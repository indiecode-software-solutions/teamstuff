import React, { useState, useEffect, useRef } from "react";
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { BookDemoModal } from "../components/BookDemoModal";
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
      <span className="landing-brand-text">indiecode HRMS</span>
    </a>
  );
}

// Ticker Rotating Words
const tickerWords = ["HR?", "Attendance?", "Payroll?", "Leave?", "Tasks?", "Approvals?", "Directory?"];

// Vertical Bottom-Up Smooth Text Ticker Component
function VerticalTextTicker() {
  const [index, setIndex] = useState(0);
  const [tickerWidth, setTickerWidth] = useState<number | "auto">("auto");
  const measureRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (measureRef.current) {
      setTickerWidth(Math.ceil(measureRef.current.getBoundingClientRect().width));
    }
  }, [index]);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % tickerWords.length);
    }, 2400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="landing-ticker-chip">
      {/* Offscreen element to measure exact text width */}
      <span ref={measureRef} className="landing-ticker-measure">
        {tickerWords[index]}
      </span>

      {/* Smoothly animated width container */}
      <div
        className="landing-ticker-animated-box"
        style={{ width: tickerWidth === "auto" ? "auto" : `${tickerWidth}px` }}
      >
        <span key={index} className="landing-ticker-word-olive">
          {tickerWords[index]}
        </span>
      </div>

      {/* Brand suffix */}
      <span className="landing-ticker-brand-text">
        indiecode HRMS.
      </span>
    </div>
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

// UI Sidebar Groups & Screenshot Configuration matching exact app navigation
interface SidebarNavSection {
  sectionTitle: string;
  items: {
    id: string;
    label: string;
    icon: React.ElementType;
    image: string;
    hasSubmenu?: boolean;
  }[];
}

const sidebarSections: SidebarNavSection[] = [
  {
    sectionTitle: "MAIN",
    items: [
      {
        id: "Dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        image: "/previews/preview_1.png",
      },
      {
        id: "Corporate Hub",
        label: "Corporate Hub",
        icon: Building2,
        image: "/previews/preview_2.png",
      },
    ],
  },
  {
    sectionTitle: "WORK",
    items: [
      {
        id: "Tasks",
        label: "Tasks",
        icon: ClipboardCheck,
        image: "/previews/preview_3.png",
      },
      {
        id: "To-Do's",
        label: "To-Do's",
        icon: ListTodo,
        image: "/UI_images/TO-DO_Kanban.png",
      },
      {
        id: "Files",
        label: "Files",
        icon: FileText,
        image: "/previews/preview_5.png",
      },
      {
        id: "Approvals",
        label: "Approvals",
        icon: FileCheck,
        image: "/previews/preview_6.png",
      },
    ],
  },
  {
    sectionTitle: "PERSONAL",
    items: [
      {
        id: "Attendance",
        label: "Attendance",
        icon: Clock,
        image: "/previews/preview_7.png",
      },
      {
        id: "Payslips",
        label: "Payslips",
        icon: ReceiptText,
        image: "/previews/preview_8.png",
      },
    ],
  },
  {
    sectionTitle: "WORKSPACES",
    items: [
      {
        id: "Admin",
        label: "Admin",
        icon: ShieldAlert,
        image: "/previews/preview_9.png",
        hasSubmenu: true,
      },
    ],
  },
];

const allNavItems = sidebarSections.flatMap((s) => s.items);

function LandingPage() {
  const navigate = useNavigate();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [activeBoardTab, setActiveBoardTab] = useState("Dashboard");
  const [emailSubscribed, setEmailSubscribed] = useState(false);
  const [emailInput, setEmailInput] = useState("");

  const heroRef = useRef<HTMLDivElement>(null);
  const previewBoxRef = useRef<HTMLDivElement>(null);

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

  // Viewport-aware scroll tracking with dynamic scale & 3D tilt
  useEffect(() => {
    let ticking = false;

    const updateTransforms = () => {
      const scrollY = window.scrollY || window.pageYOffset || 0;
      document.documentElement.style.setProperty("--scroll-y", `${scrollY}`);

      if (previewBoxRef.current) {
        const rect = previewBoxRef.current.getBoundingClientRect();
        const windowHeight = window.innerHeight || 800;

        const startY = windowHeight * 0.90;
        const endY = windowHeight * 0.10;
        const rawProgress = (startY - rect.top) / (startY - endY);
        const progress = Math.min(Math.max(rawProgress, 0), 1);

        document.documentElement.style.setProperty("--scroll-progress", `${progress.toFixed(4)}`);

        const innerCard = previewBoxRef.current.firstElementChild as HTMLElement | null;
        if (innerCard) {
          const currentTilt = (28 * (1 - progress)).toFixed(2);
          const currentScale = (0.76 + progress * 0.28).toFixed(3);
          innerCard.style.transform = `rotateX(${currentTilt}deg) scale(${currentScale})`;
        }
      }
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateTransforms);
        ticking = true;
      }
    };

    setTimeout(updateTransforms, 50);

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, []);

  if (checkingAuth) {
    return null;
  }

  const currentTab = allNavItems.find((t) => t.id === activeBoardTab) || allNavItems[0];

  return (
    <div className="landing-page-root">
      {/* Outer Curved Tablet/Window Container Frame */}
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
                onClick={() => navigate({ to: "/pricing" })}
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
            {/* Vertical Smooth Text Ticker Chip */}
            <VerticalTextTicker />

            {/* Animated Floating Words Headline */}
            <h1 className="landing-hero-h1">
              <span style={{ display: "inline-block" }}>
                <span className="hero-word-wrap" style={{ animationDelay: "0.12s", marginRight: "0.26em" }}>
                  <span className="hero-float-inner" style={{ animationDelay: "0s", color: "#09090B", fontWeight: 600 }}>Work</span>
                </span>
                <span className="hero-word-wrap" style={{ animationDelay: "0.20s", marginRight: "0.26em" }}>
                  <span className="hero-float-inner" style={{ animationDelay: "0.35s", color: "#71717A" }}>has</span>
                </span>
                <span className="hero-word-wrap" style={{ animationDelay: "0.28s", marginRight: "0.26em" }}>
                  <span className="hero-float-inner" style={{ animationDelay: "0.7s", color: "#71717A" }}>a</span>
                </span>
                <span className="hero-word-wrap" style={{ animationDelay: "0.36s", marginRight: "0.26em" }}>
                  <span className="hero-float-inner" style={{ animationDelay: "1.05s", color: "#71717A" }}>lot</span>
                </span>
                <span className="hero-word-wrap" style={{ animationDelay: "0.44s", marginRight: "0.26em" }}>
                  <span className="hero-float-inner" style={{ animationDelay: "1.4s", color: "#71717A" }}>of</span>
                </span>
                <span className="hero-word-wrap" style={{ animationDelay: "0.52s" }}>
                  <span className="hero-float-inner" style={{ animationDelay: "1.75s", color: "#71717A" }}>stuff.</span>
                </span>
              </span>
              <br />
              <span style={{ display: "inline-block" }}>
                <span className="hero-word-wrap" style={{ animationDelay: "0.62s", marginRight: "0.26em" }}>
                  <span className="hero-float-inner" style={{ animationDelay: "2.1s", color: "#71717A" }}>We</span>
                </span>
                <span className="hero-word-wrap" style={{ animationDelay: "0.70s", marginRight: "0.26em" }}>
                  <span className="hero-float-inner" style={{ animationDelay: "2.45s", color: "#71717A" }}>put</span>
                </span>
                <span className="hero-word-wrap" style={{ animationDelay: "0.78s", marginRight: "0.26em" }}>
                  <span className="hero-float-inner" style={{ animationDelay: "2.8s", color: "#71717A" }}>it</span>
                </span>
                <span className="hero-word-wrap" style={{ animationDelay: "0.86s", marginRight: "0.26em" }}>
                  <span className="hero-float-inner" style={{ animationDelay: "3.15s", color: "#71717A" }}>in</span>
                </span>
                <span className="hero-word-wrap" style={{ animationDelay: "0.94s", marginRight: "0.26em" }}>
                  <span className="hero-float-inner" style={{ animationDelay: "3.5s", color: "#71717A" }}>one</span>
                </span>
                <span className="hero-word-wrap" style={{ animationDelay: "1.02s" }}>
                  <span className="hero-float-inner" style={{ animationDelay: "3.85s", color: "#09090B", fontWeight: 600 }}>place.</span>
                </span>
              </span>
            </h1>

            {/* Hero Subtitle */}
            <div className="landing-hero-subtitle-box">
              <p className="landing-hero-subtitle">
                From <strong>attendance</strong> and <strong>payroll</strong> to <strong>tasks</strong>, <strong>files</strong> and <strong>team discussions</strong> — it's all here.
              </p>
            </div>

            {/* Dark Pill CTA Demo Button */}
            <div className="landing-hero-cta-wrap">
              <button
                type="button"
                className="landing-hero-cta-btn"
                onClick={() => setDemoModalOpen(true)}
              >
                Book A Free Demo
              </button>
            </div>
          </div>

          {/* 3. Floating 3D Showcase App Window */}
          <div ref={previewBoxRef} className="landing-preview-perspective">
            <div className="landing-preview-card">
              {/* App Navigation Sidebar matching exact UI */}
              <div className="landing-showcase-sidebar">
                {sidebarSections.map((section, sIdx) => (
                  <div key={sIdx}>
                    <div className="landing-showcase-section-title">
                      {section.sectionTitle}
                    </div>

                    <div className="landing-showcase-item-group">
                      {section.items.map((item) => {
                        const isSelected = activeBoardTab === item.id;
                        const IconComponent = item.icon;
                        return (
                          <div
                            key={item.id}
                            onClick={() => setActiveBoardTab(item.id)}
                            className={`landing-sidebar-item ${isSelected ? "active" : ""}`}
                          >
                            <div className="landing-sidebar-item-content">
                              <IconComponent
                                size={18}
                                strokeWidth={isSelected ? 2.2 : 1.8}
                                color={isSelected ? "#0F172A" : "#5A6A80"}
                              />
                              <span>{item.label}</span>
                            </div>

                            {/* Orange status dot for active item */}
                            {isSelected && <div className="landing-sidebar-dot" />}

                            {/* Submenu arrow for Admin */}
                            {item.hasSubmenu && !isSelected && (
                              <ChevronRight size={15} color="#94A3B8" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Dynamic Tab Image View Pane */}
              <div className="landing-showcase-pane">
                {/* Mobile Tab Switcher */}
                <div className="landing-mobile-tabs">
                  {allNavItems.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveBoardTab(tab.id)}
                      className={`landing-mobile-tab-btn ${activeBoardTab === tab.id ? "active" : ""}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Screenshot Container with smooth blur-in */}
                <div key={currentTab.id} className="landing-preview-frame">
                  <img
                    src={currentTab.image}
                    alt={currentTab.label}
                    className="landing-preview-img"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Core System Modules Overview */}
      <section id="features" className="landing-modules-section">
        <div className="landing-section-container">
          {/* Section Header */}
          <RevealOnScroll direction="up" distance={25}>
            <div className="landing-section-header">
              <div className="landing-section-tag">Built-In Modules</div>
              <h2 className="landing-section-title">
                One login. Every daily tool in place.
              </h2>
              <p className="landing-section-subtitle">
                Everything connects directly to your company database — from tasks and biometric attendance to payslips and document storage.
              </p>
            </div>
          </RevealOnScroll>

          {/* Module 1: Tasks & Sprint Tracking */}
          <div className="landing-module-row">
            <RevealOnScroll direction="right" distance={36} duration={0.8}>
              <div>
                <div className="landing-module-badge">
                  <ClipboardCheck size={16} color="#18181B" />
                  <span>Task Management</span>
                </div>

                <h3 className="landing-module-h3">
                  Organize work with Kanban boards & personal to-dos.
                </h3>

                <p className="landing-module-desc">
                  Create tasks, assign team members, attach relevant documents, set priority levels, and track progress from backlog to completion.
                </p>

                <div className="landing-module-points">
                  {[
                    "Kanban columns with custom status workflows",
                    "Personal To-Do checklists for daily priorities",
                    "Direct file attachments & assignee notifications",
                  ].map((item, idx) => (
                    <div key={idx} className="landing-module-point-item">
                      <CheckCircle2 size={18} color="#18181B" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </RevealOnScroll>

            <RevealOnScroll direction="left" distance={36} duration={0.8} delay={0.15}>
              <div className="landing-module-card-box">
                <img
                  src="/UI_images/TO-DO_Kanban.png"
                  alt="Kanban Board preview"
                  className="landing-module-card-img"
                />
              </div>
            </RevealOnScroll>
          </div>

          {/* Module 2: Attendance, Clock-In & Leaves */}
          <div className="landing-module-row">
            <RevealOnScroll
              direction="right"
              distance={36}
              duration={0.8}
              delay={0.15}
              style={{ order: typeof window !== "undefined" && window.innerWidth >= 900 ? 1 : 2 }}
            >
              <div className="landing-module-card-box">
                <img
                  src="/previews/preview_7.png"
                  alt="Attendance preview"
                  className="landing-module-card-img"
                />
              </div>
            </RevealOnScroll>

            <RevealOnScroll
              direction="left"
              distance={36}
              duration={0.8}
              style={{ order: typeof window !== "undefined" && window.innerWidth >= 900 ? 2 : 1 }}
            >
              <div>
                <div className="landing-module-badge">
                  <Clock size={16} color="#18181B" />
                  <span>Attendance & Time Tracking</span>
                </div>

                <h3 className="landing-module-h3">
                  Effortless clock-ins, biometric logs & leave approvals.
                </h3>

                <p className="landing-module-desc">
                  Empower employees with self-service attendance punches, monthly timesheet histories, and fast leave requests with real-time manager approvals.
                </p>

                <div className="landing-module-points">
                  {[
                    "Daily clock-in and clock-out with geolocation stamps",
                    "Automated leave quotas and entitlement tracking",
                    "Monthly attendance summaries ready for payroll sync",
                  ].map((item, idx) => (
                    <div key={idx} className="landing-module-point-item">
                      <CheckCircle2 size={18} color="#18181B" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </RevealOnScroll>
          </div>
        </div>
      </section>

      {/* 5. Complete App Features Matrix */}
      <section className="landing-matrix-section">
        <div className="landing-section-container">
          <RevealOnScroll direction="up" distance={25}>
            <div className="landing-section-header">
              <h3 className="landing-section-title">
                All features included in indiecode HRMS
              </h3>
              <p className="landing-section-subtitle">
                The complete set of workspace tools available out of the box.
              </p>
            </div>
          </RevealOnScroll>

          <div className="landing-matrix-grid">
            {[
              {
                title: "Tasks & Kanban",
                desc: "Task assignment, priorities, subtasks, and sprint progress boards.",
                icon: ClipboardCheck,
              },
              {
                title: "Attendance & Clock-In",
                desc: "Geofenced check-ins, monthly summaries, and timesheet records.",
                icon: Clock,
              },
              {
                title: "Leaves & Holidays",
                desc: "Leave request workflow, balance tracking, and company calendars.",
                icon: Calendar,
              },
              {
                title: "Payslips & Salary",
                desc: "Monthly payslip view, salary breakdowns, and PDF downloads.",
                icon: ReceiptText,
              },
              {
                title: "Corporate Policies",
                desc: "Categorized HR guidelines, conduct rules, and policy documents.",
                icon: Building2,
              },
              {
                title: "Files & Cloud Storage",
                desc: "Personal drive and shared company library with file permissions.",
                icon: FolderOpen,
              },
              {
                title: "Internal Forum",
                desc: "Company-wide discussions, announcements, and team feedback.",
                icon: MessageSquare,
              },
              {
                title: "Multi-Level Approvals",
                desc: "Leave requests, asset allocations, and reimbursement approvals.",
                icon: UserCheck,
              },
            ].map((feature, idx) => {
              const IconComp = feature.icon;
              return (
                <RevealOnScroll
                  key={idx}
                  direction="up"
                  distance={24}
                  delay={idx * 0.06}
                  duration={0.65}
                >
                  <div className="landing-feature-card">
                    <div className="landing-feature-icon-box">
                      <IconComp size={20} />
                    </div>
                    <h4 className="landing-feature-card-title">{feature.title}</h4>
                    <p className="landing-feature-card-desc">{feature.desc}</p>
                  </div>
                </RevealOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      {/* 6. Full-Width CTA Section with Hero Sky Background */}
      <section className="landing-bottom-cta">
        {/* Background Hero Sky Image */}
        <div className="landing-bottom-cta-bg" />

        {/* Soft Contrast Gradient Overlay matching Hero */}
        <div className="landing-bottom-cta-gradient" />

        <div className="landing-bottom-cta-content">
          <RevealOnScroll direction="up" distance={30} duration={0.8}>
            <h2 className="landing-bottom-cta-h2">
              Experience the simpler way to run work.
            </h2>

            <p className="landing-bottom-cta-subtitle">
              Join teams using indiecode HRMS to bring attendance, payroll, tasks, files and discussions into one unified workspace.
            </p>

            <div className="landing-bottom-cta-actions">
              <button
                type="button"
                className="landing-bottom-btn-demo"
                onClick={() => setDemoModalOpen(true)}
              >
                Book A Free Demo
              </button>

              <button
                type="button"
                className="landing-bottom-btn-signin"
                onClick={() => navigate({ to: "/login" })}
              >
                Sign In
              </button>
            </div>
          </RevealOnScroll>
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
                  <a key={idx} href={link.href} className="landing-footer-link">
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
