import React from "react";
import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import {
  Tooltip as UiTooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";
import {
  Avatar as UiAvatar,
  AvatarImage,
  AvatarFallback,
} from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { NotificationDrawer } from "./notifications/NotificationDrawer";
import VersionChangelogDialog from "./VersionChangelog";
import { MOCK_ROLE_SWITCHER_ENABLED } from "../lib/mock-role";
import {
  getCachedCompanyBranding,
  getCompanyBranding,
  subscribeCompanyBranding,
  type CompanyBranding,
} from "../lib/company";
import { applyBrandThemeCss } from "../lib/tenant-brand";
import { supabase } from "../lib/supabase";
import { useUnreadNotificationCount } from "../lib/notifications";
import { getCompanyDiscussions, postDiscussion, DiscussionMessage } from "../lib/discussions";
import {
  LayoutDashboard as DashboardIcon,
  Building2 as CorporateFare,
  TrendingUp,
  FileText as Description,
  Plus as AddIcon,
  Clock as AccessTime,
  CircleDollarSign as AttachMoney,
  Ellipsis as MoreHoriz,
  Mail as MailIcon,
  Bell as Notifications,
  Smile as EmojiEmotions,
  LogOut as Logout,
  ShieldCheck as AdminPanelSettings,
  ShieldUser as UserShieldIcon,
  Check,
  Settings,
  UserCog as SupervisorAccountIcon,
  ClipboardCheck,
  MessagesSquare as Forum,
  House as Home,
  Building2 as Business,
  ListChecks as FactCheck,
  Search,
  X as Close,
  Folder as FolderOutlined,
  ClipboardCheck as AssignmentTurnedInOutlined,
  Clock as AccessTimeOutlined,
  Banknote as PaymentsOutlined,
  Settings as SettingsOutlined,
  LogOut as LogoutOutlined,
  Smartphone as PhoneAndroid,
  CircleCheckBig as TaskAlt,
  ListTodo,
  Signature,
  ClockFading,
  ScrollText,
  ChevronDown,
  Navigation as NavigationIcon,
  Users as UsersIcon,
  Loader2,
  User,
  Sparkles,
  X,
} from "lucide-react";
import { getAppDownloadUrl } from "../lib/cloud-drive";
import { triggerHapticSelection } from "../lib/haptics";
import { sanitizeProfilePhoto } from "../lib/profile-photo";
import { Stars } from "lucide-react";

// Custom media query hook to replace MUI useMediaQuery
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    setMatches(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);

  return matches;
}

// Module-level cache so the profile name/photo/role survive Layout remounts
let cachedProfile: { photo: string | null; name: string; role: string | null } | null = null;

interface LayoutProps {
  children: React.ReactNode;
  activeTab:
    | "Dashboard"
    | "AI Workplace"
    | "Corporate Hub"
    | "Resources"
    | "Teams"
    | "Tasks"
    | "Lists"
    | "Files"
    | "Approvals"
    | "Salary"
    | "Performance"
    | "Mail"
    | "Attendance"
    | "Settings"
    | "Discussions"
    | "Admin Console"
    | "HR Workspace"
    | "Finance"
    | "Calendar"
    | "Field Visits"
    | "Site Visits";
  disablePadding?: boolean;
  rightSidebar?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsContextType {
  setBreadcrumbs: (crumbs: BreadcrumbItem[] | null) => void;
}

export const BreadcrumbsContext = React.createContext<BreadcrumbsContextType>({
  setBreadcrumbs: () => {},
});

export function useSetBreadcrumbs(crumbs: BreadcrumbItem[] | null | undefined) {
  const { setBreadcrumbs } = React.useContext(BreadcrumbsContext);
  const key = crumbs ? JSON.stringify(crumbs) : "";
  React.useEffect(() => {
    if (crumbs && crumbs.length > 0) {
      setBreadcrumbs(crumbs);
      return () => setBreadcrumbs(null);
    }
  }, [key, setBreadcrumbs]);
}

function getBreadcrumbsForPath(
  pathname: string,
  activeTab?: string,
  customBreadcrumbs?: BreadcrumbItem[]
): BreadcrumbItem[] {
  if (customBreadcrumbs && customBreadcrumbs.length > 0) {
    return customBreadcrumbs;
  }

  const path = pathname.replace(/\/$/, "");

  // Section 1: Main
  if (!path || path === "" || path === "/dashboard") {
    return [
      { label: "Main", href: "/dashboard" },
      { label: "Dashboard" },
    ];
  }

  if (path === "/resources" || path === "/corporate-hub") {
    return [
      { label: "Main", href: "/dashboard" },
      { label: "Resources" },
    ];
  }

  if (path.startsWith("/resources") || path.startsWith("/corporate-hub")) {
    const hubCrumbs: BreadcrumbItem[] = [
      { label: "Main", href: "/dashboard" },
      { label: "Resources", href: "/resources" },
    ];
    if (path.includes("/hr-policies")) {
      hubCrumbs.push({ label: "HR Policies" });
    } else if (path.includes("/induction")) {
      hubCrumbs.push({ label: "Induction" });
    } else if (path.includes("/assets")) {
      hubCrumbs.push({ label: "Assets" });
    } else if (path.includes("/memories")) {
      hubCrumbs.push({ label: "Memories" });
    } else if (path.includes("/shared-resources")) {
      hubCrumbs.push({ label: "Credentials Vault" });
    } else if (path.includes("/team")) {
      hubCrumbs.push({ label: "Team Directory" });
    } else if (path.includes("/teams")) {
      hubCrumbs.push({ label: "Teams" });
    }
    return hubCrumbs;
  }

  // Section 2: Work
  if (path === "/teams") {
    return [
      { label: "Work" },
      { label: "Teams" },
    ];
  }

  if (path.startsWith("/teams/")) {
    return [
      { label: "Work" },
      { label: "Teams", href: "/teams" },
      { label: "Team Space" },
    ];
  }

  if (path === "/tasks") {
    return [
      { label: "Work" },
      { label: "Tasks" },
    ];
  }

  if (path === "/lists") {
    return [
      { label: "Work" },
      { label: "To-Do's" },
    ];
  }

  if (path === "/files") {
    return [
      { label: "Work" },
      { label: "Files" },
    ];
  }

  if (path === "/approvals") {
    return [
      { label: "Work" },
      { label: "Approvals" },
    ];
  }

  if (path === "/site-visits") {
    return [
      { label: "Work" },
      { label: "Field Visits" },
    ];
  }

  if (path === "/kanban") {
    return [
      { label: "Work" },
      { label: "Projects", href: "/kanban" },
      { label: "Board" },
    ];
  }

  // Section 3: Personal
  if (path === "/attendance") {
    return [
      { label: "Personal" },
      { label: "Attendance" },
    ];
  }

  if (path === "/salary") {
    return [
      { label: "Personal" },
      { label: "Payslips" },
    ];
  }

  if (path === "/profile") {
    return [
      { label: "Personal" },
      { label: "My Profile" },
    ];
  }

  if (path === "/calendar") {
    return [
      { label: "Personal" },
      { label: "Calendar" },
    ];
  }

  if (path === "/mail") {
    return [
      { label: "Personal" },
      { label: "Mail" },
    ];
  }

  if (path === "/internal-forum") {
    return [
      { label: "Main", href: "/dashboard" },
      { label: "Forum" },
    ];
  }

  if (path === "/performance") {
    return [
      { label: "Personal" },
      { label: "Performance" },
    ];
  }

  if (path === "/ai-workplace") {
    return [
      { label: "Work" },
      { label: "AI Workplace" },
    ];
  }

  // Workspaces: Admin / HR / Finance
  if (path.startsWith("/admin-console")) {
    const adminCrumbs: BreadcrumbItem[] = [
      { label: "Admin" },
    ];
    if (path.includes("/settings")) {
      adminCrumbs.push({ label: "Settings" });
    } else if (path.startsWith("/admin-console/hr")) {
      adminCrumbs.push({ label: "HR Management", href: "/admin-console/hr" });
      const subMatch = path.split("/admin-console/hr/")[1];
      if (subMatch) {
        const HR_LABELS: Record<string, string> = {
          attendance: "Attendance",
          onboard: "Onboard",
          documents: "Documents",
          assets: "Assets",
          tasks: "Tasks",
          payslips: "Payslips",
          policies: "Policies",
          leave: "Leave",
          induction: "Induction",
          memories: "Memories",
          exit: "Exit",
        };
        adminCrumbs.push({ label: HR_LABELS[subMatch] || subMatch.charAt(0).toUpperCase() + subMatch.slice(1) });
      }
    } else if (path.includes("/attendance")) {
      adminCrumbs.push({ label: "Attendance Logs" });
    } else {
      adminCrumbs.push({ label: "Console" });
    }
    return adminCrumbs;
  }

  if (path.startsWith("/hr-workspace")) {
    const hrCrumbs: BreadcrumbItem[] = [
      { label: "HR" },
      { label: "Workspace", href: "/hr-workspace" },
    ];
    const subMatch = path.split("/hr-workspace/")[1];
    if (subMatch) {
      const HR_LABELS: Record<string, string> = {
        attendance: "Attendance",
        onboard: "Onboard",
        documents: "Documents",
        assets: "Assets",
        tasks: "Tasks",
        payslips: "Payslips",
        policies: "Policies",
        leave: "Leave",
        induction: "Induction",
        memories: "Memories",
        exit: "Exit",
      };
      hrCrumbs.push({ label: HR_LABELS[subMatch] || subMatch.charAt(0).toUpperCase() + subMatch.slice(1) });
    }
    return hrCrumbs;
  }

  if (path.startsWith("/accountant-workspace")) {
    const finCrumbs: BreadcrumbItem[] = [
      { label: "Finance", href: "/accountant-workspace" },
    ];
    if (path.includes("/payroll")) {
      finCrumbs.push({ label: "Payroll" });
    } else {
      finCrumbs.push({ label: "Dashboard" });
    }
    return finCrumbs;
  }

  if (activeTab) {
    return [
      { label: "Main", href: "/dashboard" },
      { label: activeTab },
    ];
  }

  const segments = path.split("/").filter(Boolean);
  return [
    { label: "Main", href: "/dashboard" },
    ...segments.map((seg, i) => {
      const isLast = i === segments.length - 1;
      const formatted = seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
      return isLast
        ? { label: formatted }
        : { label: formatted, href: "/" + segments.slice(0, i + 1).join("/") };
    }),
  ];
}

export default function Layout({
  children,
  activeTab,
  disablePadding,
  rightSidebar,
  breadcrumbs,
}: LayoutProps) {
  const [contextBreadcrumbs, setContextBreadcrumbs] = React.useState<BreadcrumbItem[] | null>(null);

  const unreadNotifications = useUnreadNotificationCount();
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const effectiveBreadcrumbs = breadcrumbs || contextBreadcrumbs || undefined;
  const breadcrumbsList = React.useMemo(
    () => getBreadcrumbsForPath(location.pathname, activeTab, effectiveBreadcrumbs),
    [location.pathname, activeTab, effectiveBreadcrumbs]
  );
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [moreOpen, setMoreOpen] = React.useState(false);

  // Detect if running inside the native Capacitor app
  const isNativeApp =
    typeof window !== "undefined" &&
    !!(
      window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }
    ).Capacitor?.isNativePlatform?.();

  // Mobile active tab local override for inline discussions screen rendering
  const [activeMobileTab, setActiveMobileTab] = React.useState<string>(activeTab);
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [userId, setUserId] = React.useState<string | null>(null);

  // Discussions state
  const [discussions, setDiscussions] = React.useState<DiscussionMessage[]>([]);
  const [discussionsLoading, setDiscussionsLoading] = React.useState(true);
  const [replyTarget, setReplyTarget] = React.useState<DiscussionMessage | null>(null);
  const [postBody, setPostBody] = React.useState("");
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [activeTabSub, setActiveTabSub] = React.useState<"All" | "Following" | "Unanswered">("All");

  React.useEffect(() => {
    setActiveMobileTab(activeTab);
  }, [activeTab]);

  const isPanelOpen =
    activeTab === "Admin Console" ||
    activeTab === "HR Workspace" ||
    activeTab === "Settings" ||
    location.pathname.startsWith("/admin-console") ||
    location.pathname.startsWith("/hr-workspace") ||
    location.pathname.startsWith("/settings");

  const screenIsCompact = useMediaQuery("(min-width: 769px) and (max-width: 1024px)");
  const isCompactSidebar = isPanelOpen || screenIsCompact;
  const drawerWidthClass = isCompactSidebar ? "w-[84px]" : "w-[224px]";
  const [mounted, setMounted] = React.useState(() => cachedProfile !== null);
  const [currentRole, setCurrentRole] = React.useState(() =>
    MOCK_ROLE_SWITCHER_ENABLED
      ? localStorage.getItem("test_user_role") || "employee"
      : cachedProfile?.role || "employee",
  );

  const [profilePhoto, setProfilePhoto] = React.useState<string | null>(null);
  const [profileName, setProfileName] = React.useState<string>("");
  const [profileLoading, setProfileLoading] = React.useState(true);

  const [branding, setBranding] = React.useState<CompanyBranding | null>(() =>
    getCachedCompanyBranding(),
  );
  const [changelogOpen, setChangelogOpen] = React.useState(false);

  React.useEffect(() => {
    if (branding?.brandColor) {
      applyBrandThemeCss(branding.brandColor);
    }
  }, [branding?.brandColor]);

  React.useEffect(() => {
    getCompanyBranding().then(setBranding).catch((err) => console.warn("Failed to fetch branding:", err));
    const unsubscribe = subscribeCompanyBranding(() => {
      getCompanyBranding().then(setBranding).catch((err) => console.warn("Failed to fetch branding:", err));
    });

    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname === "0.0.0.0";

      if (import.meta.env.DEV || isLocalhost) {
        // In local development, unregister any service worker and clear offline caches
        // so changes reflect instantly without stale-while-revalidate delay.
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const registration of registrations) {
            registration.unregister();
          }
        });
        if ("caches" in window) {
          caches.keys().then((names) => {
            for (const name of names) {
              caches.delete(name);
            }
          });
        }
      } else {
        navigator.serviceWorker.register("/sw.js").then(
          (reg) => console.log("Service Worker registered successfully:", reg.scope),
          (err) => console.warn("Service Worker registration failed:", err),
        );
      }
    }

    return unsubscribe;
  }, []);

  // Impersonation state
  const [impersonatedCompany, setImpersonatedCompany] = React.useState<{
    id: string;
    name: string;
    shortName: string;
    role: string;
  } | null>(null);

  React.useEffect(() => {
    try {
      const stored = sessionStorage.getItem("impersonated_company");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.id) {
          setImpersonatedCompany(parsed);
          setCompanyId(parsed.id);
          setCurrentRole("admin");
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleExitImpersonation = () => {
    try {
      sessionStorage.removeItem("impersonated_company");
      window.location.href = "/master";
    } catch (e) {
      console.error(e);
    }
  };

  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [userMenuOpen]);

  React.useEffect(() => {
    setMounted(true);
    if (MOCK_ROLE_SWITCHER_ENABLED) {
      const savedRole = localStorage.getItem("test_user_role") || "employee";
      setCurrentRole(savedRole);
    }

    if (cachedProfile) {
      setProfilePhoto(cachedProfile.photo);
      setProfileName(cachedProfile.name);
      setProfileLoading(false);
    }
    const loadProfile = async () => {
      try {
        const { data: { user } = { user: null } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          const { data } = await supabase
            .from("profiles")
            .select("profile_photo, name, role, company_id")
            .eq("id", user.id)
            .single();

          const impersonated = sessionStorage.getItem("impersonated_company");
          if (impersonated) {
            try {
              const parsed = JSON.parse(impersonated);
              if (parsed?.id) {
                setCompanyId(parsed.id);
                setCurrentRole("admin");
                return;
              }
            } catch (e) {}
          }

          if (data?.role && !MOCK_ROLE_SWITCHER_ENABLED) {
            setCurrentRole(data.role);
          }
          const cleanPhoto = sanitizeProfilePhoto(data?.profile_photo);
          setProfilePhoto(cleanPhoto);
          if (data?.name) {
            setProfileName(data.name);
          }
          if (data?.company_id) {
            setCompanyId(data.company_id);
          }
          cachedProfile = {
            photo: cleanPhoto,
            name: data?.name || "User",
            role: data?.role || null,
          };
        }
      } catch (err) {
        console.warn("Failed to fetch profile:", err);
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, []);

  React.useEffect(() => {
    if (!companyId) return;
    setDiscussionsLoading(true);
    getCompanyDiscussions(companyId)
      .then((list) => {
        setDiscussions(list);
      })
      .finally(() => {
        setDiscussionsLoading(false);
      });

    let channel: { unsubscribe: () => void } | null = null;
    try {
      channel = supabase
        .channel(`layout-discussions-${companyId}-${Math.random().toString(36).substring(2, 9)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "company_discussions" },
          () => {
            getCompanyDiscussions(companyId).then((list) => setDiscussions(list));
          },
        )
        .subscribe();
    } catch {}

    return () => {
      if (channel) supabase.removeChannel(channel as any);
    };
  }, [companyId]);

  const handleQuickPost = async () => {
    if (!postBody.trim() || !companyId || !userId) return;
    setIsPublishing(true);
    try {
      const res = await postDiscussion({
        companyId: companyId,
        authorId: userId,
        content: postBody.trim(),
        parentId: replyTarget ? replyTarget.id : null,
        isAnonymous: branding?.chatMode !== "transparent",
      });
      if (res) {
        setPostBody("");
        setReplyTarget(null);
        const discList = await getCompanyDiscussions(companyId);
        setDiscussions(discList);
      }
    } catch (err) {
      console.error("Error posting inline discussion:", err);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleRoleChange = (role: string) => {
    if (MOCK_ROLE_SWITCHER_ENABLED) {
      localStorage.setItem("test_user_role", role);
    }
    setCurrentRole(role);
    window.location.reload();
  };

  const [shouldAnimate, setShouldAnimate] = React.useState(() => {
    if (typeof window !== "undefined") {
      return !sessionStorage.getItem("sidebar_animated");
    }
    return false;
  });

  React.useEffect(() => {
    if (shouldAnimate) {
      sessionStorage.setItem("sidebar_animated", "true");
      const timer = setTimeout(() => {
        setShouldAnimate(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
    return;
  }, [shouldAnimate]);

  if (isMobile) {
    return (
      <BreadcrumbsContext.Provider value={{ setBreadcrumbs: setContextBreadcrumbs }}>
        <div className="mobile-app-shell">
        {/* Mobile Header Box Wrapper */}
        <div className="mobile-header-box">
          <header className="mobile-header">
            {/* Logo/Name on Left */}
            <div
              className="mobile-header-brand"
              onClick={() => navigate({ to: "/" })}
            >
              {location.pathname.startsWith("/internal-forum") ? (
                <>
                  <Forum color={"#185FA5"} size={20} />
                  <span className="mobile-header-title">
                    Forum
                  </span>
                </>
              ) : activeMobileTab === "Dashboard" ? (
                branding?.logoUrl ? (
                  <img
                    src={branding.logoUrl}
                    alt={`${branding.shortName} logo`}
                    className="mobile-header-logo"
                  />
                ) : (
                  <span className="mobile-header-title">
                    {branding?.shortName || "CapOasis"}
                  </span>
                )
              ) : activeMobileTab === "AI Workplace" || location.pathname.startsWith("/ai-workplace") ? (
                <>
                  <Stars color={"#18181b"} size={20} strokeWidth={1.75} />
                  <span className="mobile-header-title">
                    AI Workplace
                  </span>
                </>
              ) : activeMobileTab === "Corporate Hub" || activeMobileTab === "Resources" ? (
                <>
                  <Business color={"#6FA83C"} size={20} />
                  <span className="mobile-header-title">
                    Resources
                  </span>
                </>
              ) : activeMobileTab === "Discussions" ? (
                <>
                  <Forum color={"#18181b"} size={20} />
                  <span className="mobile-header-title">
                    Discussions
                  </span>
                </>
              ) : activeMobileTab === "Tasks" ? (
                <>
                  <FactCheck color={"#C4741F"} size={20} />
                  <span className="mobile-header-title">
                    Tasks
                  </span>
                </>
              ) : activeMobileTab === "Files" ? (
                <>
                  <FolderOutlined color={"#B45309"} size={20} />
                  <span className="mobile-header-title">
                    Files
                  </span>
                </>
              ) : activeMobileTab === "Approvals" ? (
                <>
                  <AssignmentTurnedInOutlined color={"#B45309"} size={20} />
                  <span className="mobile-header-title">
                    Approvals
                  </span>
                </>
              ) : activeMobileTab === "Attendance" ? (
                <>
                  <AccessTimeOutlined color={"#B45309"} size={20} />
                  <span className="mobile-header-title">
                    Attendance
                  </span>
                </>
              ) : activeMobileTab === "Salary" ? (
                <>
                  <PaymentsOutlined color={"#B45309"} size={20} />
                  <span className="mobile-header-title">
                    Salary & Payslips
                  </span>
                </>
              ) : activeMobileTab === "Settings" ? (
                <>
                  <SettingsOutlined color={"#B45309"} size={20} />
                  <span className="mobile-header-title">
                    Settings
                  </span>
                </>
              ) : activeMobileTab === "Admin Console" ? (
                <>
                  <UserShieldIcon color={"#B91C1C"} size={20} />
                  <span className="mobile-header-title">
                    Admin Console
                  </span>
                </>
              ) : activeMobileTab === "HR Workspace" ? (
                <>
                  <SupervisorAccountIcon color={"#059669"} size={20} />
                  <span className="mobile-header-title">
                    HR Workspace
                  </span>
                </>
              ) : activeMobileTab === "Finance" ? (
                <>
                  <AttachMoney color={"#2563EB"} size={20} />
                  <span className="mobile-header-title">
                    Finance
                  </span>
                </>
              ) : (
                <span className="mobile-header-title">
                  {activeMobileTab}
                </span>
              )}
            </div>

            {/* Icons on Right */}
            <div className="mobile-header-actions">
              {activeMobileTab === "Dashboard" ? (
                <>
                  <HeaderIconButton
                    icon={<Notifications color={"#18181b"} size={18} />}
                    badge={unreadNotifications > 0 ? unreadNotifications : null}
                    onClick={() => setNotificationsOpen(true)}
                  />
                  <button type="button" onClick={() => navigate({ to: "/profile" })} className="mobile-avatar-btn">
                    <UiAvatar className="mobile-avatar">
                      <AvatarImage src={profilePhoto || undefined} className="mobile-avatar-img" />
                      <AvatarFallback className="mobile-avatar">
                        {(profileName || "U").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </UiAvatar>
                  </button>
                </>
              ) : activeMobileTab === "Corporate Hub" || activeMobileTab === "Resources" ? (
                <button type="button" onClick={() => navigate({ to: "/profile" })} className="mobile-avatar-btn">
                  <UiAvatar className="mobile-avatar">
                    <AvatarImage src={profilePhoto || undefined} className="mobile-avatar-img" />
                    <AvatarFallback className="mobile-avatar">
                      {(profileName || "U").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </UiAvatar>
                </button>
              ) : activeMobileTab === "Discussions" ? (
                <button
                  type="button"
                  className="mobile-icon-btn"
                >
                  <Search size={20} />
                </button>
              ) : (
                <button type="button" onClick={() => navigate({ to: "/profile" })} className="mobile-avatar-btn">
                  <UiAvatar className="mobile-avatar">
                    <AvatarImage src={profilePhoto || undefined} className="mobile-avatar-img" />
                    <AvatarFallback className="mobile-avatar">
                      {(profileName || "U").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </UiAvatar>
                </button>
              )}
            </div>
          </header>
        </div>

        {/* Scrollable Children Viewport */}
        <div
          className={cn(
            "mobile-viewport",
            disablePadding ? "mobile-viewport-flush" : "mobile-viewport-default",
            !disablePadding && (activeMobileTab === "Discussions" ? "" : "")
          )}
        >
          {activeMobileTab === "Discussions" ? (
            <div className="mobile-discussions-container">
              {/* Filter Chips */}
              <div className="mobile-filter-row">
                {(["All", "Following", "Unanswered"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveTabSub(cat)}
                    className={cn(
                      "mobile-filter-btn",
                      activeTabSub === cat && "mobile-filter-btn-active"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Threads List */}
              <div >
                {discussionsLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="mobile-thread-card">
                      <div  />
                      <div  />
                      <div  />
                    </div>
                  ))
                ) : (activeTabSub === "Unanswered"
                    ? discussions.filter((d) => d.replies.length === 0)
                    : discussions
                  ).length === 0 ? (
                  <div className="mobile-thread-card">
                    <p >
                      No discussions found. Be the first to say something!
                    </p>
                  </div>
                ) : (
                  (activeTabSub === "Unanswered"
                    ? discussions.filter((d) => d.replies.length === 0)
                    : discussions
                  ).map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "mobile-thread-card",
                        replyTarget?.id === msg.id && "mobile-thread-card-active"
                      )}
                      onClick={() => setReplyTarget(msg)}
                    >
                      {/* Meta */}
                      <div className="mobile-thread-meta">
                        <span className="mobile-thread-meta-author">
                          {msg.isAnonymous !== false
                            ? "Posted by Anonymous"
                            : `Posted by ${msg.author?.name || "Team Member"}`}
                        </span>
                        <span>
                          {(() => {
                            const date = new Date(msg.createdAt);
                            const diffMs = new Date().getTime() - date.getTime();
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHours = Math.floor(diffMins / 60);
                            const diffDays = Math.floor(diffHours / 24);
                            if (diffMins < 1) return "Just now";
                            if (diffMins < 60) return `${diffMins}m ago`;
                            if (diffHours < 24) return `${diffHours}h ago`;
                            if (diffDays === 1) return "Yesterday";
                            return date.toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            });
                          })()}
                        </span>
                      </div>

                      {/* Question */}
                      <div className="mobile-thread-title">
                        {msg.content}
                      </div>

                      {/* Replies List */}
                      {msg.replies.length > 0 && (
                        <div className="mobile-thread-replies">
                          {msg.replies.map((reply) => (
                            <div key={reply.id} className="mobile-reply-item">
                              <span >↳</span>
                              <span>{reply.content}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Stats & Actions */}
                      <div className="mobile-thread-footer">
                        <div>
                          <span>💬 {msg.replies.length} replies</span>
                        </div>
                        <span className="mobile-reply-badge">
                          {msg.replies.length}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Quick Comment Input Bar at Bottom */}
              <div className="mobile-input-bar">
                {replyTarget && (
                  <div className="mobile-reply-preview">
                    <span className="mobile-reply-preview-text">
                      Replying to {replyTarget.isAnonymous !== false ? "Anonymous" : replyTarget.author?.name || "Team Member"}: &quot;{replyTarget.content.slice(0, 30)}...&quot;
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReplyTarget(null);
                      }}
                      className="btn-icon"
                      aria-label="Cancel reply"
                    >
                      <Close size={14} />
                    </button>
                  </div>
                )}

                <div className="mobile-input-pill">
                  <input
                    type="text"
                    placeholder={
                      replyTarget
                        ? (branding?.chatMode === "transparent"
                            ? `Reply to ${replyTarget.isAnonymous !== false ? "Anonymous" : replyTarget.author?.name}...`
                            : "Reply to Anonymous...")
                        : (branding?.chatMode === "transparent"
                            ? "Say something to the team..."
                            : "Say it anonymously...")
                    }
                    value={postBody}
                    onChange={(e) => setPostBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleQuickPost();
                    }}
                    className="mobile-input-field"
                  />
                  <button
                    type="button"
                    onClick={handleQuickPost}
                    disabled={isPublishing || !postBody.trim()}
                    className="mobile-send-btn"
                  >
                    {isPublishing ? <Loader2 size={12}  /> : "➔"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            children
          )}
        </div>

        {/* Bottom Navigation Bar */}
        <div >
          {/* Dashboard (Home) */}
          <button
            type="button"
            onClick={() => {
              triggerHapticSelection();
              setActiveMobileTab("Dashboard");
              navigate({ to: "/dashboard" });
            }}
            className={cn(
              "mobile-bottom-nav-item",
              activeMobileTab === "Dashboard" && "mobile-bottom-nav-item-active"
            )}
          >
            <Home size={24} />
          </button>

          {/* Resources */}
          <button
            type="button"
            onClick={() => {
              triggerHapticSelection();
              setActiveMobileTab("Resources");
              navigate({ to: "/resources" });
            }}
            className={cn(
              "mobile-bottom-nav-item",
              (activeMobileTab === "Corporate Hub" || activeMobileTab === "Resources") && "mobile-bottom-nav-item-active"
            )}
          >
            <Business size={24} />
          </button>

          {/* Discussions (Forum) */}
          <button
            type="button"
            onClick={() => {
              triggerHapticSelection();
              setActiveMobileTab("Discussions");
            }}
            className={cn(
              "mobile-bottom-nav-item",
              activeMobileTab === "Discussions" && "mobile-bottom-nav-item-active"
            )}
          >
            <Forum size={24} />
          </button>

          {/* Tasks */}
          <button
            type="button"
            onClick={() => {
              triggerHapticSelection();
              setActiveMobileTab("Tasks");
              navigate({ to: "/tasks" });
            }}
            className={cn(
              "mobile-bottom-nav-item",
              activeMobileTab === "Tasks" && "mobile-bottom-nav-item-active"
            )}
          >
            <FactCheck size={24} />
          </button>

          {/* More */}
          <button
            type="button"
            onClick={() => {
              triggerHapticSelection();
              setMoreOpen(true);
            }}
            className={cn(
              "mobile-bottom-nav-item",
              moreOpen && "mobile-bottom-nav-item-active"
            )}
          >
            <MoreHoriz size={24} />
          </button>
        </div>

        {/* More Slide-Up Sheet */}
        {/* More Slide-Up Sheet */}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="bottom" className="mobile-menu-sheet">
            <div className="mobile-menu-handle" />
            <SheetHeader >
              <SheetTitle className="mobile-menu-title">Menu</SheetTitle>
            </SheetHeader>
            <div>
              <div className="mobile-menu-section">
                <button
                  type="button"
                  onClick={() => {
                    triggerHapticSelection();
                    setMoreOpen(false);
                    const lastTeamId = localStorage.getItem("last_team_id");
                    if (lastTeamId) {
                      navigate({ to: `/teams/${lastTeamId}` });
                    } else {
                      navigate({ to: "/teams" });
                    }
                  }}
                  className="mobile-menu-item"
                >
                  <UsersIcon color="#18181b" size={20} />
                  <span>Teams</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHapticSelection();
                    setMoreOpen(false);
                    navigate({ to: "/lists" });
                  }}
                  className="mobile-menu-item"
                >
                  <TaskAlt color="#18181b" size={20} />
                  <span>To-Do's</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHapticSelection();
                    setMoreOpen(false);
                    navigate({ to: "/files" });
                  }}
                  className="mobile-menu-item"
                >
                  <FolderOutlined color="#18181b" size={20} />
                  <span>Files</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHapticSelection();
                    setMoreOpen(false);
                    navigate({ to: "/site-visits" });
                  }}
                  className="mobile-menu-item"
                >
                  <NavigationIcon color="#18181b" size={20} />
                  <span>Site Visits (GPS)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHapticSelection();
                    setMoreOpen(false);
                    navigate({ to: "/approvals" });
                  }}
                  className="mobile-menu-item"
                >
                  <AssignmentTurnedInOutlined color="#18181b" size={20} />
                  <span>Approvals</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHapticSelection();
                    setMoreOpen(false);
                    navigate({ to: "/attendance" });
                  }}
                  className="mobile-menu-item"
                >
                  <AccessTimeOutlined color="#18181b" size={20} />
                  <span>Attendance</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHapticSelection();
                    setMoreOpen(false);
                    navigate({ to: "/salary" });
                  }}
                  className="mobile-menu-item"
                >
                  <PaymentsOutlined color="#18181b" size={20} />
                  <span>Salary & Payslips</span>
                </button>

              </div>

              {(mounted && (currentRole === "admin" || currentRole === "hr" || currentRole === "accountant")) && (
                <>
                  <div className="mobile-menu-divider" />
                  <div className="mobile-menu-section">
                    {currentRole === "admin" && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHapticSelection();
                          setMoreOpen(false);
                          navigate({ to: "/admin-console/settings" });
                        }}
                        className="mobile-menu-item"
                      >
                        <UserShieldIcon color="#18181b" size={20} />
                        <span>Admin Settings</span>
                      </button>
                    )}
                    {currentRole === "hr" && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHapticSelection();
                          setMoreOpen(false);
                          navigate({ to: "/hr-workspace" });
                        }}
                        className="mobile-menu-item"
                      >
                        <SupervisorAccountIcon color="#18181b" size={20} />
                        <span>HR Workspace</span>
                      </button>
                    )}
                    {currentRole === "accountant" && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHapticSelection();
                          setMoreOpen(false);
                          navigate({ to: "/accountant-workspace" });
                        }}
                        className="mobile-menu-item"
                      >
                        <AttachMoney color="#18181b" size={20} />
                        <span>Finance</span>
                      </button>
                    )}
                  </div>
                </>
              )}

              <div className="mobile-menu-divider" />
              <div className="mobile-menu-section">
                {isMobile && !isNativeApp && (
                  <button
                    type="button"
                    onClick={async () => {
                      setMoreOpen(false);
                      try {
                        const result = await getAppDownloadUrl();
                        if ("url" in result) {
                          const a = document.createElement("a");
                          a.href = result.url;
                          a.download = "CapOasis.apk";
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                        }
                      } catch (e) {
                        console.error("Download failed", e);
                      }
                    }}
                    className="mobile-menu-item"
                  >
                    <PhoneAndroid color="#18181b" size={20} />
                    <div>
                      <div>Download App</div>
                      <div >Get the Android app</div>
                    </div>
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    setMoreOpen(false);
                    await supabase.auth.signOut();
                    navigate({ to: "/login" });
                  }}
                  className="mobile-menu-item"
                  style={{ color: "#18181b" }}
                >
                  <LogoutOutlined color="#18181b" size={20} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <NotificationDrawer
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          onNavigate={(link) => navigate({ to: link })}
        />
      </div>
      </BreadcrumbsContext.Provider>
    );
  }

  return (
    <BreadcrumbsContext.Provider value={{ setBreadcrumbs: setContextBreadcrumbs }}>
      <CompactSidebarContext.Provider value={isCompactSidebar}>
      <TooltipProvider delayDuration={120}>
        <div className="app-shell">
          {/* Desktop Sidebar */}
          <aside
            className={cn(
              "app-sidebar sidebar-container",
              isCompactSidebar && "app-sidebar-compact"
            )}
          >
            {/* Top Logo Brand Area */}
            <div className="app-brand-wrapper">
              {isCompactSidebar ? (
                <button
                  type="button"
                  onClick={() => navigate({ to: "/dashboard" })}
                  className="app-brand-btn-compact"
                  title={branding?.shortName || "Dashboard"}
                >
                  <div className="app-brand-badge">
                    {(branding?.shortName || "C").charAt(0).toUpperCase()}
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate({ to: "/dashboard" })}
                  className="app-brand"
                >
                  {branding?.logoUrl ? (
                    <>
                      <img
                        src={branding.logoUrl}
                        alt={`${branding.shortName || "Company"} logo`}
                        className="app-brand-logo"
                      />
                      {branding.logoDisplay === "logo_only" ? null : (
                        <span className="app-brand-title">
                          {branding?.shortName || "CapOasis"}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="app-brand-title">
                      {branding?.shortName || "CapOasis"}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Navigation Items - Auto-fits with height using flex */}
            <div className="app-nav-wrapper">
              <div className="app-nav-scroll-area">
                <SidebarNavGroup label="Main">
                  <SidebarItem
                    icon={<DashboardIcon size={18} strokeWidth={1.75} />}
                    label="Dashboard"
                    active={activeTab === "Dashboard"}
                    onClick={() => navigate({ to: "/dashboard" })}
                    delay={80}
                    animate={shouldAnimate}
                  />
                  <SidebarItem
                    icon={<Forum size={18} strokeWidth={1.75} />}
                    label="Forum"
                    active={activeTab === "Discussions" || location.pathname.startsWith("/internal-forum")}
                    onClick={() => navigate({ to: "/internal-forum" })}
                    delay={110}
                    animate={shouldAnimate}
                  />
                  <SidebarItem
                    icon={<CorporateFare size={18} strokeWidth={1.75} />}
                    label="Resources"
                    active={activeTab === "Corporate Hub" || activeTab === "Resources" || location.pathname.startsWith("/resources") || location.pathname.startsWith("/corporate-hub")}
                    onClick={() => navigate({ to: "/resources" })}
                    delay={140}
                    animate={shouldAnimate}
                  />
                </SidebarNavGroup>

                <SidebarNavGroup label="Work">
                  <SidebarItem
                    icon={<UsersIcon size={18} strokeWidth={1.75} />}
                    label="Teams"
                    active={activeTab === "Teams" || location.pathname.startsWith("/teams")}
                    onClick={() => {
                      const lastTeamId = localStorage.getItem("last_team_id");
                      if (lastTeamId) {
                        navigate({ to: `/teams/${lastTeamId}` });
                      } else {
                        navigate({ to: "/teams" });
                      }
                    }}
                    delay={280}
                    animate={shouldAnimate}
                  />
                  <SidebarItem
                    icon={<ClipboardCheck size={18} strokeWidth={1.75} />}
                    label="Tasks"
                    active={activeTab === "Tasks"}
                    onClick={() => navigate({ to: "/tasks" })}
                    delay={300}
                    animate={shouldAnimate}
                  />
                  <SidebarItem
                    icon={<ListTodo size={18} strokeWidth={1.75} />}
                    label="To-Do's"
                    active={activeTab === "Lists"}
                    onClick={() => navigate({ to: "/lists" })}
                    delay={320}
                    animate={shouldAnimate}
                  />
                  <SidebarItem
                    icon={<Description size={18} strokeWidth={1.75} />}
                    label="Files"
                    active={activeTab === "Files"}
                    onClick={() => navigate({ to: "/files" })}
                    delay={340}
                    animate={shouldAnimate}
                  />
                  <SidebarItem
                    icon={<Signature size={18} strokeWidth={1.75} />}
                    label="Approvals"
                    active={activeTab === "Approvals"}
                    onClick={() => navigate({ to: "/approvals" })}
                    delay={360}
                    animate={shouldAnimate}
                  />
                  <SidebarItem
                    icon={<NavigationIcon size={18} strokeWidth={1.75} />}
                    label="Field Visits"
                    active={activeTab === "Field Visits" || activeTab === "Site Visits" || location.pathname === "/site-visits"}
                    onClick={() => navigate({ to: "/site-visits" })}
                    delay={370}
                    animate={shouldAnimate}
                  />
                </SidebarNavGroup>

                <SidebarNavGroup label="Personal">
                  <SidebarItem
                    icon={<ClockFading size={18} strokeWidth={1.75} />}
                    label="Attendance"
                    active={activeTab === "Attendance"}
                    onClick={() => navigate({ to: "/attendance" })}
                    delay={380}
                    animate={shouldAnimate}
                  />
                  <SidebarItem
                    icon={<ScrollText size={18} strokeWidth={1.75} />}
                    label="Payslips"
                    active={activeTab === "Salary"}
                    onClick={() => navigate({ to: "/salary" })}
                    delay={420}
                    animate={shouldAnimate}
                  />
                </SidebarNavGroup>
              </div>

              {mounted &&
                (currentRole === "admin" || currentRole === "hr" || currentRole === "accountant") && (
                  <div className="app-workspaces-wrapper">
                    {currentRole === "admin" && (
                      <SidebarDropdown
                        icon={<UserShieldIcon size={18} strokeWidth={1.75} />}
                        label="Admin"
                        basePath="/admin-console"
                        items={[
                          {
                            label: "Settings",
                            path: "/admin-console/settings",
                            icon: <Settings size={16} strokeWidth={1.75} />,
                          },
                          {
                            label: "HR",
                            path: "/admin-console/hr",
                            icon: <SupervisorAccountIcon size={16} strokeWidth={1.75} />,
                          },
                        ]}
                      />
                    )}

                    {currentRole === "hr" && (
                      <SidebarItem
                        icon={<SupervisorAccountIcon size={18} strokeWidth={1.75} />}
                        label="HR Workspace"
                        active={location.pathname.startsWith("/hr-workspace")}
                        onClick={() => navigate({ to: "/hr-workspace" })}
                        delay={220}
                        animate={shouldAnimate}
                      />
                    )}

                    {currentRole === "accountant" && (
                      <SidebarDropdown
                        icon={<AttachMoney size={18} strokeWidth={1.75} />}
                        label="Finance"
                        basePath="/accountant-workspace"
                        items={[
                          {
                            label: "Dashboard",
                            path: "/accountant-workspace",
                            icon: <DashboardIcon size={16} strokeWidth={1.75} />,
                          },
                          {
                            label: "Payroll",
                            path: "/accountant-workspace/payroll",
                            icon: <AttachMoney size={16} strokeWidth={1.75} />,
                          },
                        ]}
                      />
                    )}
                  </div>
                )}
            </div>

            {/* Bottom Impersonate Button */}
            {!isCompactSidebar && impersonatedCompany && (
              <div className="app-sidebar-footer">
                <button
                  type="button"
                  onClick={handleExitImpersonation}
                  className="btn btn-primary"
                >
                  <Logout size={14} />
                  <span>Exit Impersonate</span>
                </button>
              </div>
            )}
          </aside>

          <VersionChangelogDialog open={changelogOpen} onClose={() => setChangelogOpen(false)} />

          {/* Main Content Area */}
          <main className="app-main-viewport main-viewport">
            {/* Desktop Header */}
            <header className="main-header">
              <div className="app-header-left">
                <nav className="app-header-breadcrumbs" aria-label="Breadcrumb">
                  {breadcrumbsList.map((crumb, idx) => {
                    const isLast = idx === breadcrumbsList.length - 1;
                    return (
                      <React.Fragment key={idx}>
                        {idx > 0 && (
                          <span className="app-header-breadcrumb-separator" aria-hidden="true">
                            /
                          </span>
                        )}
                        {isLast || !crumb.href ? (
                          <span
                            className={cn(
                              "app-header-breadcrumb-item",
                              isLast ? "app-header-breadcrumb-current" : "app-header-breadcrumb-parent"
                            )}
                            aria-current={isLast ? "page" : undefined}
                          >
                            {crumb.label}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => crumb.href && navigate({ to: crumb.href as any })}
                            className="app-header-breadcrumb-item app-header-breadcrumb-link"
                          >
                            {crumb.label}
                          </button>
                        )}
                      </React.Fragment>
                    );
                  })}
                </nav>
              </div>

              <div className="app-header-right">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(true)}
                  className="app-header-btn"
                  title="Notifications"
                >
                  <Notifications size={18} />
                  {unreadNotifications > 0 && (
                    <span className="app-header-btn-badge">{unreadNotifications}</span>
                  )}
                </button>
                <div className="app-user-menu-wrap" ref={userMenuRef}>
                  <button
                    type="button"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="app-avatar-btn"
                    aria-label={profileName || "User Menu"}
                  >
                    {profileLoading ? (
                      <div className="app-avatar-fallback is-loading" />
                    ) : profilePhoto ? (
                      <img src={profilePhoto} alt={profileName || "User"} className="app-avatar-img" />
                    ) : (
                      <div className="app-avatar-fallback">
                        {(profileName || "U")
                          .split(" ")
                          .map((n) => n[0])
                          .filter(Boolean)
                          .slice(0, 2)
                          .join("")
                          .toUpperCase()}
                      </div>
                    )}
                  </button>

                  {userMenuOpen && (
                    <div className="user-menu-dropdown">
                      {/* User Header */}
                      <div className="user-menu-header">
                        <div className="user-menu-avatar">
                          {profilePhoto ? (
                            <img src={profilePhoto} alt={profileName} className="user-menu-avatar-img" />
                          ) : (
                            <div className="user-menu-avatar-fallback">
                              {(profileName || "U").slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="user-menu-info">
                          <p className="user-menu-name">{profileName || "User"}</p>
                          <span className="user-menu-role-badge">
                            {currentRole ? currentRole.toUpperCase() : "MEMBER"}
                          </span>
                        </div>
                      </div>

                      <div className="user-menu-divider" />

                      {/* Menu Navigation Links */}
                      <div className="user-menu-items">
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false);
                            navigate({ to: "/profile" });
                          }}
                          className="user-menu-item"
                        >
                          <User size={15} />
                          <span>My Profile</span>
                        </button>

                      </div>

                      <div className="user-menu-divider" />

                      {/* Sign Out */}
                      <div className="user-menu-items">
                        <button
                          type="button"
                          onClick={async () => {
                            setUserMenuOpen(false);
                            await supabase.auth.signOut();
                            navigate({ to: "/login" });
                          }}
                          className="user-menu-item is-danger"
                        >
                          <Logout size={15} />
                          <span>Log Out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </header>

            {/* Content Viewport Container */}
            <div className="app-content-wrapper">
              {/* Content viewport wrapper */}
              <div
                className={cn(
                  "app-content-area dashboard-content",
                  disablePadding && "layout-viewport-no-padding"
                )}
                style={disablePadding ? { padding: 0 } : undefined}
              >
                {children}
              </div>

              {/* Right Sidebar */}
              {rightSidebar && (
                <aside className="app-right-sidebar">
                  {rightSidebar}
                </aside>
              )}
            </div>
          </main>

          <NotificationDrawer
            open={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
            onNavigate={(link) => navigate({ to: link })}
          />

          {/* Floating test role switcher */}
          {MOCK_ROLE_SWITCHER_ENABLED && (
            <div className="floating-role-switcher-container">
              <DropdownMenu>
                <UiTooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="floating-role-btn"
                      >
                        <AdminPanelSettings size={16} color="#ffffff" />
                        <span>{currentRole.toUpperCase()}</span>
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="left" sideOffset={8}>
                    {`Current Role: ${currentRole.toUpperCase()} (Click to Switch)`}
                  </TooltipContent>
                </UiTooltip>
                <DropdownMenuContent
                  side="top"
                  align="end"
                  sideOffset={8}
                  className="floating-role-menu"
                >
                  <div className="floating-role-menu-header">
                    Switch Mock Role
                  </div>
                  <div className="floating-role-menu-divider" />
                  {["Admin", "HR", "Accountant", "Employee"].map((role) => {
                    const roleVal = role.toLowerCase();
                    const isActive = currentRole === roleVal;
                    return (
                      <DropdownMenuItem
                        key={role}
                        onClick={() => handleRoleChange(roleVal)}
                        className={cn(
                          "floating-role-menu-item",
                          isActive && "floating-role-menu-item-active"
                        )}
                      >
                        <span>{role}</span>
                        {isActive && <Check size={16} />}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </TooltipProvider>
    </CompactSidebarContext.Provider>
    </BreadcrumbsContext.Provider>
  );
}

export const CompactSidebarContext = React.createContext<boolean>(false);

function useCompactSidebar() {
  const forceCompact = React.useContext(CompactSidebarContext);
  const screenIsCompact = useMediaQuery("(min-width: 769px) and (max-width: 1024px)");
  return forceCompact || screenIsCompact;
}

function SidebarNavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const compact = useCompactSidebar();
  return (
    <div className={cn("app-nav-group", compact && "app-nav-group-compact")}>
      {!compact && (
        <span className="app-nav-group-title">
          {label}
        </span>
      )}
      <div className="app-nav-list">{children}</div>
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  active = false,
  badge = null,
  onClick,
  delay = 0,
  animate = false,
}: any) {
  const compact = useCompactSidebar();

  const handleItemClick = () => {
    if (onClick) {
      const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
      const isExactlyActive =
        active &&
        ((label === "AI Workplace" && currentPath === "/ai-workplace") ||
          (label === "Forum" && currentPath === "/internal-forum") ||
          ((label === "Corporate Hub" || label === "Resources") && (currentPath === "/resources" || currentPath === "/corporate-hub")) ||
          (label === "Dashboard" && currentPath === "/") ||
          (label === "Tasks" && currentPath === "/tasks") ||
          (label === "Files" && currentPath === "/files") ||
          (label === "All Approvals" && currentPath === "/approvals") ||
          (label === "Salary" && currentPath === "/salary") ||
          (label === "Performance" && currentPath === "/performance") ||
          (label === "Mail" && currentPath === "/mail"));

      if (isExactlyActive) return;

      setTimeout(() => {
        onClick();
      }, 180);
    }
  };

  const itemContent = (
    <div
      className={cn(
        "app-nav-item-wrapper",
        compact && "app-nav-item-wrapper-compact",
        animate && "sidebar-item-animate"
      )}
      style={animate ? { animationDelay: `${delay}ms` } : undefined}
    >
      <button
        type="button"
        onClick={handleItemClick}
        className={cn(
          "app-nav-item",
          active && "app-nav-item-active"
        )}
      >
        <span className="app-nav-icon">
          {icon}
        </span>
        {!compact && (
          <span className="app-nav-label">{label}</span>
        )}
        {badge && (
          <span className="app-nav-badge">
            {badge}
          </span>
        )}
      </button>
    </div>
  );

  if (!compact) {
    return itemContent;
  }

  return (
    <UiTooltip>
      <TooltipTrigger asChild>{itemContent}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </UiTooltip>
  );
}

function SidebarDropdown({
  icon,
  label,
  basePath,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  basePath: string;
  items: { label: string; path: string; icon?: React.ReactNode }[];
}) {
  const compact = useCompactSidebar();
  const location = useLocation();
  const navigate = useNavigate();

  const currentPath = location.pathname;
  const isPathMatch = (targetPath: string) => {
    const p = (typeof window !== "undefined" ? window.location.pathname : currentPath).replace(/\/$/, "");
    const t = targetPath.replace(/\/$/, "");
    if (p === t) return true;
    if (p.startsWith(t + "/") || p.startsWith(t)) return true;
    if (t === "/admin-console/settings" && p === "/admin-console") return true;
    return false;
  };

  const isActive = currentPath.startsWith(basePath) || items.some((it) => isPathMatch(it.path));

  const [isOpen, setIsOpen] = React.useState(isActive);
  const [compactMenuOpen, setCompactMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (isActive) {
      setIsOpen(true);
    }
  }, [isActive]);

  if (compact) {
    return (
      <div className="app-nav-item-wrapper app-nav-item-wrapper-compact">
        <DropdownMenu open={compactMenuOpen} onOpenChange={setCompactMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "app-nav-item",
                isActive && "app-nav-item-active"
              )}
              title={label}
            >
              <span className="app-nav-icon">
                {icon}
              </span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side="right"
            sideOffset={14}
            align="end"
            avoidCollisions={false}
            className="app-dropdown-popover"
          >
            {items.map((item) => {
              const childActive = isPathMatch(item.path);
              return (
                <DropdownMenuItem
                  key={item.path}
                  onClick={() => navigate({ to: item.path as any })}
                  className={cn(
                    "app-dropdown-item",
                    childActive && "app-dropdown-item-active"
                  )}
                >
                  {item.icon && (
                    <span className="app-nav-icon">
                      {item.icon}
                    </span>
                  )}
                  <span className="app-dropdown-label">{item.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // Expanded sidebar mode - Full-width inline collapsible expanding above toggle (borderless)
  return (
    <div className="app-sidebar-accordion">
      {isOpen && (
        <div className="app-submenu-list">
          {items.map((item) => {
            const childActive = isPathMatch(item.path);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate({ to: item.path as any })}
                className={cn(
                  "app-nav-item",
                  childActive && "app-nav-item-active"
                )}
              >
                {item.icon && (
                  <span className="app-nav-icon">
                    {item.icon}
                  </span>
                )}
                <span className="app-nav-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "app-nav-item app-dropdown-toggle",
          isActive && !isOpen && "app-nav-item-active"
        )}
      >
        <div className="app-dropdown-toggle-left">
          <span className="app-nav-icon">
            {icon}
          </span>
          <span className="app-nav-label">{label}</span>
        </div>
        <ChevronDown
          size={16}
          className={cn(
            "app-dropdown-chevron",
            isOpen && "app-dropdown-chevron-open"
          )}
        />
      </button>
    </div>
  );
}

function HeaderIconButton({
  icon,
  badge,
  onClick,
  className,
}: {
  icon: React.ReactNode;
  badge?: boolean | string | number | null;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "header-icon-button",
        className
      )}
    >
      {badge && (
        <span
          className={badge === true ? "header-icon-badge-dot" : "header-icon-badge-pill"}
        >
          {badge === true ? "" : badge}
        </span>
      )}
      {icon}
    </button>
  );
}

