import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import React, { useEffect, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { isMasterAdmin } from "../lib/master";
import { ImagePlus as UploadPhotoIcon, X as CloseIcon, FileCheck, FileText, AlertCircle, Clock, CheckCircle2, Upload, ExternalLink } from "lucide-react";
import { getCompanyTrainingSections } from "../lib/induction";
import {
  getCompanyDocumentRequirements,
  uploadEmployeeDocumentServerFn,
  checkUserPendingDocuments,
  type CompanyDocumentRequirement,
} from "../lib/employee-documents";
import { Toaster } from "../components/ui/sonner";
import {
  MAX_PROFILE_PHOTO_BYTES,
  uploadProfilePhoto,
} from "../lib/profile-photo";
import {
  getActiveBrandColor,
  applyBrandThemeCss,
  BRAND_COLOR_EVENT,
  DEFAULT_BRAND_COLOR,
  applyBrowserWhiteLabel,
  generateLetterFaviconSvg,
  getTenantFromHost,
  extractTenantSlugFromHostStr,
  getCachedTenantBranding,
  fetchTenantBranding,
  fetchTenantBrandingServerFn,
} from "../lib/tenant-brand";
import {
  getCompanyBranding,
  getCachedCompanyBranding,
  subscribeCompanyBranding,
} from "../lib/company";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import { cn } from "../lib/utils";
import { Loader2 } from "lucide-react";

// Routes that work without an authenticated session (login screens + the
// /interface screenshot reference page + /pricing page).
const PUBLIC_PATHS = ["/", "/pricing", "/login", "/master-login", "/master", "/interface", "/kanban"];
const isPublicPath = (path: string, _search?: unknown) => {
  // /kanban is always public — the kanban page itself handles auth internally:
  // unauthenticated users see a read-only board (if a valid shareToken exists) or
  // an empty board, both with a "Sign In" button in the header. This prevents the
  // root layout from ever racing to redirect guests to /login.
  return PUBLIC_PATHS.includes(path);
};


import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import {
  initializeMobileNotifications,
  triggerLocalNotification,
} from "../lib/mobile-notifications";
import { registerPushNotifications } from "../lib/push-registration";

function NotFoundComponent() {
  return (
    <div >
      <div >
        <h1 >404</h1>
        <h2 >Page not found</h2>
        <p >
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div >
          <Link
            to="/"
            
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div >
      <div >
        <h1 >
          This page didn't load
        </h1>
        <p >
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div >
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            
          >
            Try again
          </button>
          <a
            href="/"
            
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

import { getBrandConfig } from "../lib/brand-config";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => {
    const brand = getBrandConfig();
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: brand.appName },
        {
          name: "description",
          content: brand.metaDescription,
        },
        { name: "author", content: brand.companyName },
        { property: "og:title", content: brand.appName },
        {
          property: "og:description",
          content: brand.metaDescription,
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:site", content: `@${brand.shortName.toLowerCase()}` },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&family=Inter:wght@300;400;500;600;700&display=swap",
        },
        {
          rel: "icon",
          href: brand.favicon,
          type: "image/png",
        },
        { rel: "apple-touch-icon", href: brand.appleTouchIcon },
        { rel: "shortcut icon", href: brand.favicon },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const instantBrandScript = `(function() {
  try {
    var brand = null;
    var host = window.location.hostname.toLowerCase();
    var parts = host.split('.');
    var isLocal = host.indexOf('localhost') !== -1 || host.indexOf('127.0.0.1') !== -1;
    var slug = null;

    var param = new URLSearchParams(window.location.search).get('tenant');
    if (param && param !== 'master' && param !== 'admin') {
      slug = param.toLowerCase();
    } else if (isLocal && parts.length >= 2 && parts[0] !== 'localhost') {
      slug = parts[0];
    } else if (!isLocal && parts.length >= 3 && parts[0] !== 'www' && parts[0] !== 'master' && parts[0] !== 'app') {
      slug = parts[0];
    }

    if (slug) {
      var raw = localStorage.getItem('tenant_brand_cache_' + slug);
      if (raw) brand = JSON.parse(raw);
    }
    if (!brand) {
      var coRaw = localStorage.getItem('company_branding');
      if (coRaw) brand = JSON.parse(coRaw);
    }

    if (brand) {
      var s = (brand.shortName || brand.name || '').trim();
      if (s && s.toLowerCase() !== 'teamstuff' && s.toLowerCase() !== 'capoasis') {
        document.title = s + ' Intranet';
      }
      var bg = brand.brandColor || '#18181B';
      if (brand.brandColor) {
        document.documentElement.style.setProperty('--brand-primary', brand.brandColor);
        document.documentElement.style.setProperty('--brand-primary-lighter', brand.brandColor + '1A');
        document.documentElement.style.setProperty('--brand-primary-border', brand.brandColor + '40');
      }
      var fav = brand.faviconUrl || (s && s.toLowerCase() !== 'teamstuff' && s.toLowerCase() !== 'capoasis' ? 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="' + bg + '"/><text x="50%" y="54%" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif" font-size="34" font-weight="600" fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">' + s.charAt(0).toUpperCase() + '</text></svg>') : null);
      if (fav) {
        var l = document.querySelector("link[rel~='icon']");
        if (l) {
          l.href = fav;
          if (fav.indexOf('data:image/svg') === 0) l.type = 'image/svg+xml';
        }
        var sL = document.querySelector("link[rel='shortcut icon']");
        if (sL) sL.href = fav;
        var aL = document.querySelector("link[rel='apple-touch-icon']");
        if (aL) aL.href = fav;
      }
    }
  } catch(e) {}
})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: instantBrandScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const location = useLocation();
  const isPublicView = isPublicPath(location.pathname, location.search);

  const [brandColor, setBrandColor] = React.useState<string>(() => getActiveBrandColor());

  React.useEffect(() => {
    applyBrandThemeCss(brandColor);

    const handleColorChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ brandColor: string }>;
      if (customEvent.detail?.brandColor) {
        setBrandColor(customEvent.detail.brandColor);
      }
    };
    window.addEventListener(BRAND_COLOR_EVENT, handleColorChange);
    return () => window.removeEventListener(BRAND_COLOR_EVENT, handleColorChange);
  }, []);

  

  // Stable ref for navigate so the auth useEffect dependency array never changes
  const navigateRef = React.useRef(navigate);
  React.useEffect(() => { navigateRef.current = navigate; });

  // Snapshot whether this page load is a public share link — evaluated once at
  // mount so it can never race against TanStack Router updating window.location.
  // Guard with typeof window check: during SSR window is undefined.
  const isPublicViewRef = React.useRef(
    typeof window !== "undefined"
      ? isPublicPath(window.location.pathname, window.location.search)
      : false
  );

  // Onboarding blocker states
  const [sessionUser, setSessionUser] = React.useState<any>(null);
  const [profileStatus, setProfileStatus] = React.useState<string | null>(null);
  const [checkingStatus, setCheckingStatus] = React.useState(true);
  const [onboardStep, setOnboardStep] = React.useState(1);
  const [showInduction, setShowInduction] = React.useState(false);
  const [inductionSlide, setInductionSlide] = React.useState(0);
  const [companyInductionSections, setCompanyInductionSections] = React.useState<any[]>([]);
  const [inductionCompanyName, setInductionCompanyName] = React.useState<string>("Company");

  // Form Fields
  const [phoneDigits, setPhoneDigits] = React.useState<string[]>(Array(10).fill(""));
  const [gender, setGender] = React.useState("Male");
  const [dobDay, setDobDay] = React.useState("01");
  const [dobMonth, setDobMonth] = React.useState("01");
  const [dobYear, setDobYear] = React.useState("2000");
  const [addr1, setAddr1] = React.useState("");
  const [addr2, setAddr2] = React.useState("");
  const [city, setCity] = React.useState("");
  const [state, setState] = React.useState("");
  const [postal, setPostal] = React.useState("");
  const [country, setCountry] = React.useState("India");
  const [emergencyName, setEmergencyName] = React.useState("");
  const [emergencyPhoneDigits, setEmergencyPhoneDigits] = React.useState<string[]>(
    Array(10).fill(""),
  );
  const [emergencyRelation, setEmergencyRelation] = React.useState("Spouse");
  const [bank, setBank] = React.useState("");
  const [account, setAccount] = React.useState("");
  const [pan, setPan] = React.useState("");
  const [uploadedPhotoBase64, setUploadedPhotoBase64] = React.useState<string | null>(null);
  const [onboardBio, setOnboardBio] = React.useState("");
  const onboardingPhotoInputRef = React.useRef<HTMLInputElement | null>(null);
  const [postalLoading, setPostalLoading] = React.useState(false);

  // Photo adjustment state (zoom + reposition)
  const ONBOARD_ADJUST_BOX = 280;
  const [pendingOnboardPhoto, setPendingOnboardPhoto] = React.useState<{
    src: string;
    zoom: number;
    x: number;
    y: number;
  } | null>(null);
  const [onboardImgDims, setOnboardImgDims] = React.useState<{ w: number; h: number } | null>(null);
  const onboardDragRef = React.useRef<{ px: number; py: number; bx: number; by: number } | null>(null);

  // Onboarding KYC Documents state
  const [onboardDocRequirements, setOnboardDocRequirements] = React.useState<CompanyDocumentRequirement[]>([]);
  const [onboardDocFiles, setOnboardDocFiles] = React.useState<
    Record<
      string,
      Array<{
        fileName: string;
        sizeBytes: number;
        base64Data: string;
        mimeType: string;
      }>
    >
  >({});
  const [onboardDocUploadingId, setOnboardDocUploadingId] = React.useState<string | null>(null);

  // Login Notification Popup for Pending KYC Docs
  const [pendingDocAlert, setPendingDocAlert] = React.useState<{
    open: boolean;
    totalPending: number;
    missingMandatoryCount: number;
    rejectedCount: number;
    items: Array<{
      name: string;
      isMandatory: boolean;
      status: "missing" | "pending" | "rejected" | "verified";
      rejectionReason?: string | null;
    }>;
  }>({ open: false, totalPending: 0, missingMandatoryCount: 0, rejectedCount: 0, items: [] });

  // Derived combined properties
  const phone = phoneDigits.join("");
  const emergencyPhone = emergencyPhoneDigits.join("");
  const dob = `${dobYear}-${dobMonth}-${dobDay}`;

  // Auto-dismiss pending document reminder after 9s countdown
  React.useEffect(() => {
    if (!pendingDocAlert.open) return;
    const timer = setTimeout(() => {
      sessionStorage.setItem("doc_submission_reminder_dismissed", "true");
      setPendingDocAlert((prev) => ({ ...prev, open: false }));
    }, 9000);
    return () => clearTimeout(timer);
  }, [pendingDocAlert.open]);

  const handlePostalCodeChange = async (postalVal: string, currentCountry: string) => {
    setPostal(postalVal);
    const cleanVal = postalVal.trim();

    if (currentCountry.toLowerCase() === "india" && cleanVal.length === 6) {
      setPostalLoading(true);
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${cleanVal}`);
        const data = await res.json();
        if (data && data[0] && data[0].Status === "Success") {
          const postOffice = data[0].PostOffice[0];
          if (postOffice) {
            setCity(postOffice.District || "");
            setState(postOffice.State || "");
          }
        }
      } catch (err) {
        console.error("Postal API error:", err);
      } finally {
        setPostalLoading(false);
      }
    } else if (
      currentCountry.toLowerCase() === "united states" ||
      currentCountry.toLowerCase() === "us"
    ) {
      if (cleanVal.length === 5) {
        setPostalLoading(true);
        try {
          const res = await fetch(`https://api.zippopotam.us/us/${cleanVal}`);
          if (res.ok) {
            const data = await res.json();
            if (data && data.places && data.places[0]) {
              setCity(data.places[0]["place name"] || "");
              setState(data.places[0]["state"] || "");
            }
          }
        } catch (err) {
          console.error("US Zip API error:", err);
        } finally {
          setPostalLoading(false);
        }
      }
    }
  };

  const checkCompanyStatus = async (uid: string) => {
    try {
      const { success: isMaster } = await isMasterAdmin({ data: { userId: uid } });
      if (isMaster) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", uid)
        .maybeSingle();
      if (!profile?.company_id) return;
      const { data: company } = await supabase
        .from("companies")
        .select("status")
        .eq("id", profile.company_id)
        .maybeSingle();
      if (company && company.status !== "active") {
        sessionStorage.setItem(
          "login_banner",
          "Your company has been suspended. Contact your platform administrator.",
        );
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error("Company status check failed:", err);
    }
  };

  const checkOnboardingStatus = async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("onboarding_status, company_id")
        .eq("id", uid)
        .single();
      if (!error && data) {
        setProfileStatus(data.onboarding_status);
        if (data.company_id) {
          if (data.onboarding_status === "Pending") {
            const reqs = await getCompanyDocumentRequirements(data.company_id);
            setOnboardDocRequirements(reqs || []);
          } else if (data.onboarding_status === "Completed") {
            // Check if user has pending mandatory documents
            const isDismissed = sessionStorage.getItem("doc_submission_reminder_dismissed") === "true";
            if (!isDismissed) {
              const pendingInfo = await checkUserPendingDocuments(data.company_id, uid);
              if (pendingInfo.hasPending) {
                setPendingDocAlert({
                  open: true,
                  totalPending: pendingInfo.totalPending,
                  missingMandatoryCount: pendingInfo.missingMandatoryCount,
                  rejectedCount: pendingInfo.rejectedCount,
                  items: pendingInfo.items,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingStatus(false);
    }
  };

  const profileStatusRef = React.useRef(profileStatus);
  React.useEffect(() => {
    profileStatusRef.current = profileStatus;
  }, [profileStatus]);

  useEffect(() => {
    // Dynamic runtime title & favicon update based on tenant subdomain or company
    const tenantSlug = getTenantFromHost();
    let initialBrand: any = tenantSlug ? getCachedTenantBranding(tenantSlug) : null;
    if (!initialBrand) {
      initialBrand = getCachedCompanyBranding();
    }
    applyBrowserWhiteLabel(initialBrand);

    if (tenantSlug) {
      fetchTenantBranding(tenantSlug).then((tb) => {
        if (tb) {
          applyBrowserWhiteLabel(tb);
          applyBrandThemeCss(tb.brandColor);
        }
      });
    } else {
      getCompanyBranding().then((cb) => {
        if (cb) {
          applyBrowserWhiteLabel(cb);
          if (cb.brandColor) applyBrandThemeCss(cb.brandColor);
        }
      });
    }

    const unsubscribeBranding = subscribeCompanyBranding(() => {
      const cb = getCachedCompanyBranding();
      if (cb) {
        applyBrowserWhiteLabel(cb);
        if (cb.brandColor) applyBrandThemeCss(cb.brandColor);
      }
    });

    // If offline, bypass auth status check to avoid loader hanging on network timeouts
    if (typeof window !== "undefined" && !navigator.onLine) {
      setCheckingStatus(false);
    }

    // Check initial session — use the snapshotted isPublicView flag so this
    // never races against TanStack Router mutating window.location.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isPublicViewRef.current) {
        if (!session) setCheckingStatus(false);
        return;
      }

      const currentPath = window.location.pathname;
      if (!session) {
        navigateRef.current({ to: "/login" });
      } else {
        setSessionUser(session.user);
        checkOnboardingStatus(session.user.id);
        checkCompanyStatus(session.user.id);
        if (currentPath === "/login" || currentPath === "/") {
          navigateRef.current({ to: "/dashboard" });
        }
      }
    });

    // Listen to auth state changes. This subscription is registered once at mount
    // (empty dep array via stable refs) to avoid repeated re-registration which
    // would trigger extra INITIAL_SESSION events and cause spurious /login redirects.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        setSessionUser(session.user);
        if (profileStatusRef.current === null) {
          setCheckingStatus(true);
        }
        checkOnboardingStatus(session.user.id);
        checkCompanyStatus(session.user.id);
        const currentPath = window.location.pathname;
        if (currentPath === "/login" || currentPath === "/") {
          navigateRef.current({ to: "/dashboard" });
        }
        return;
      }

      if (!session) {
        setSessionUser(null);
        setProfileStatus(null);
        setCheckingStatus(false);
        const currentPath = window.location.pathname;
        if (!isPublicPath(currentPath, window.location.search)) {
          navigateRef.current({ to: "/login" });
        }
        return;
      }

      // TOKEN_REFRESHED / USER_UPDATED / INITIAL_SESSION with session: maintain session
      setSessionUser(session.user);
      if (profileStatusRef.current === null) {
        checkOnboardingStatus(session.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
      unsubscribeBranding();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — navigate and isPublicView are accessed via stable refs

  // Whenever the user transitions to an authenticated route, ensure onboarding status is verified
  useEffect(() => {
    if (!isPublicView) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session) {
          navigateRef.current({ to: "/login" });
        } else {
          setSessionUser(session.user);
          if (profileStatusRef.current === null) {
            setCheckingStatus(true);
            checkOnboardingStatus(session.user.id);
            checkCompanyStatus(session.user.id);
          }
        }
      });
    }
  }, [location.pathname, isPublicView]);

  // Mobile local notifications & realtime task assignment notifications setup
  useEffect(() => {
    if (!sessionUser?.id) return;

    // Initialize mobile local notifications permission and click handler
    initializeMobileNotifications();

    // Register FCM push notifications
    registerPushNotifications(sessionUser.id);

    const handleNotificationClick = (e: Event) => {
      const customEvent = e as CustomEvent<{ link: string }>;
      const link = customEvent.detail?.link;
      if (link) {
        navigate({ to: link });
      }
    };
    window.addEventListener("mobile-notification-click", handleNotificationClick);

    // Subscribe to supabase database notifications for real-time task assignments
    const channel = supabase
      .channel(
        `mobile-notifications-${sessionUser.id}-${Math.random().toString(36).substring(2, 9)}`,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${sessionUser.id}`,
        },
        async (payload: any) => {
          const newNotif = payload.new;
          if (newNotif && newNotif.type === "task_assigned") {
            await triggerLocalNotification(
              newNotif.title || "New Task Assigned",
              newNotif.description || "You have been assigned a new task.",
              newNotif.link || "/tasks",
            );
          }
        },
      )
      .subscribe();

    return () => {
      window.removeEventListener("mobile-notification-click", handleNotificationClick);
      supabase.removeChannel(channel);
    };
  }, [sessionUser, navigate]);

  const clampOnboardOffset = (x: number, y: number, zoom: number) => {
    if (!onboardImgDims) return { x, y };
    const scale = Math.max(ONBOARD_ADJUST_BOX / onboardImgDims.w, ONBOARD_ADJUST_BOX / onboardImgDims.h) * zoom;
    const maxX = Math.max(0, (onboardImgDims.w * scale - ONBOARD_ADJUST_BOX) / 2);
    const maxY = Math.max(0, (onboardImgDims.h * scale - ONBOARD_ADJUST_BOX) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const handleOnboardingPhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }
    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      alert("Image must be smaller than 5 MB.");
      return;
    }
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (dataUrl) {
      const img = new Image();
      img.onload = () => {
        setOnboardImgDims({ w: img.naturalWidth || 500, h: img.naturalHeight || 500 });
        setPendingOnboardPhoto({
          src: dataUrl,
          zoom: 1,
          x: 0,
          y: 0,
        });
      };
      img.onerror = () => {
        setOnboardImgDims({ w: 500, h: 500 });
        setPendingOnboardPhoto({
          src: dataUrl,
          zoom: 1,
          x: 0,
          y: 0,
        });
      };
      img.src = dataUrl;
    }
  };

  const applyOnboardAdjustedPhoto = async () => {
    if (!pendingOnboardPhoto || !onboardImgDims) return;
    try {
      // Render the visible square crop to a 512×512 JPEG
      const base64Data = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 512;
          canvas.height = 512;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas is not supported in this browser."));
          const scale =
            Math.max(ONBOARD_ADJUST_BOX / onboardImgDims.w, ONBOARD_ADJUST_BOX / onboardImgDims.h) *
            pendingOnboardPhoto.zoom;
          const drawW = onboardImgDims.w * scale;
          const drawH = onboardImgDims.h * scale;
          const left = ONBOARD_ADJUST_BOX / 2 + pendingOnboardPhoto.x - drawW / 2;
          const top = ONBOARD_ADJUST_BOX / 2 + pendingOnboardPhoto.y - drawH / 2;
          const out = 512 / ONBOARD_ADJUST_BOX;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, 512, 512);
          ctx.drawImage(img, left * out, top * out, drawW * out, drawH * out);
          resolve(canvas.toDataURL("image/jpeg", 0.92));
        };
        img.onerror = () => reject(new Error("Could not process the selected image."));
        img.src = pendingOnboardPhoto.src;
      });

      setUploadedPhotoBase64(base64Data);
      setPendingOnboardPhoto(null);
    } catch (err: any) {
      alert("Failed to process photo: " + (err.message || String(err)));
    }
  };

  const handleOnboardingSubmit = async () => {
    if (!sessionUser) return;
    setCheckingStatus(true);
    try {
      let finalPhotoUrl: string | null = null;
      if (uploadedPhotoBase64) {
        // Upload the user's own photo before persisting the profile
        const { data: profRow } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", sessionUser.id)
          .single();
        const uploadRes = await uploadProfilePhoto({
          data: {
            base64Data: uploadedPhotoBase64,
            companyId: profRow?.company_id || "unknown-company",
            userId: sessionUser.id,
          },
        });
        if (!uploadRes.success) {
          alert("Failed to upload profile photo: " + (uploadRes.error || "Unknown error"));
          return;
        }
        finalPhotoUrl = uploadRes.secure_url;
      }

      // Upload staged KYC documents to R2
      try {
        const { data: profRow } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", sessionUser.id)
          .single();
        const docEntries = Object.entries(onboardDocFiles);
        for (const [reqId, filesList] of docEntries) {
          if (Array.isArray(filesList) && filesList.length > 0) {
            await uploadEmployeeDocumentServerFn({
              data: {
                companyId: profRow?.company_id || "unknown-company",
                userId: sessionUser.id,
                requirementId: reqId,
                files: filesList,
              },
            }).catch((e) => console.warn("Onboarding doc upload warning:", e));
          }
        }
      } catch (docErr) {
        console.warn("KYC doc upload error during onboarding:", docErr);
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          phone: phone,
          gender: gender,
          date_of_birth: dob,
          address_line1: addr1,
          address_line2: addr2 || null,
          city: city,
          state: state,
          postal_code: postal,
          country: country,
          emergency_contact_name: emergencyName,
          emergency_contact_phone: emergencyPhone,
          bank_name: bank,
          account_no: account,
          pan: pan,
          profile_photo: finalPhotoUrl,
          notes: onboardBio.trim(),
          onboarding_status: "Completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionUser.id);

      if (error) {
        alert("Failed to submit onboarding: " + error.message);
      } else {
        setProfileStatus("Completed");
        setShowInduction(false);

        let hasInduction = false;
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("company_id")
            .eq("id", sessionUser.id)
            .maybeSingle();
          if (prof?.company_id) {
            const sections = await getCompanyTrainingSections(prof.company_id);
            hasInduction = Boolean(sections && sections.length > 0);
          }
        } catch (e) {
          console.warn("Failed to check induction sections:", e);
        }

        if (hasInduction) {
          navigate({ to: "/resources/induction" });
        } else {
          navigate({ to: "/dashboard" });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingStatus(false);
    }
  };

  const renderOnboardingWizard = () => {
    return (
      <div className="onboard-shell">
        {/* Left Sidebar */}
        <aside className="onboard-sidebar">
          <div>
            <div className="onboard-sidebar-brand">
              <img src="/teamstuff_icon_logo.png" alt="Teamstuff" className="onboard-sidebar-logo" />
              <div>
                <h2 className="onboard-sidebar-title">Teamstuff</h2>
                <p className="onboard-sidebar-tag">Employee Setup</p>
              </div>
            </div>

            <div className="onboard-nav-steps">
              {[
                { num: "01", label: "Personal Profile", step: 1 },
                { num: "02", label: "Address Details", step: 2 },
                { num: "03", label: "Emergency Contact", step: 3 },
                { num: "04", label: "Financial Information", step: 4 },
                { num: "05", label: "KYC Documents", step: 5 },
                { num: "06", label: "Profile Photo & Bio", step: 6 },
              ].map((s) => (
                <div
                  key={s.step}
                  className={cn(
                    "onboard-nav-item",
                    onboardStep === s.step && "active",
                    onboardStep > s.step && "completed",
                  )}
                >
                  <span className="onboard-nav-num">{s.num}</span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="onboard-sidebar-footer">
            <span className="onboard-sidebar-user">
              {sessionUser?.email || "Employee"}
            </span>
            <button
              type="button"
              onClick={async () => {
                setCheckingStatus(true);
                await supabase.auth.signOut();
                setProfileStatus(null);
                setSessionUser(null);
                setCheckingStatus(false);
                navigate({ to: "/login" });
              }}
              className="onboard-signout-link"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* Right Main Viewport */}
        <main className="onboard-main">
          <div className="onboard-content-wrap">
            <div className="onboard-section-header">
              <p className="onboard-section-step">Step {onboardStep} of 6</p>
              <h1 className="onboard-section-title">
                {onboardStep === 1
                  ? "Personal Profile"
                  : onboardStep === 2
                  ? "Address Details"
                  : onboardStep === 3
                  ? "Emergency Contact"
                  : onboardStep === 4
                  ? "Financial Information"
                  : onboardStep === 5
                  ? "Identity & KYC Documents"
                  : "Profile Photo & Bio"}
              </h1>
            </div>
            {onboardStep === 1 && (
              <>
                {/* Contact Number */}
                <div className="onboard-form-group">
                  <label className="onboard-label">
                    <span>Contact Number *</span>
                  </label>
                  <div className="onboard-phone-input-wrap">
                    <span className="onboard-phone-prefix">+91</span>
                    <input
                      type="tel"
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      value={phoneDigits.join("")}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 10).split("");
                        const arr = Array(10).fill("");
                        digits.forEach((d, i) => { arr[i] = d; });
                        setPhoneDigits(arr);
                      }}
                      className="onboard-phone-native-input"
                    />
                  </div>
                </div>

                {/* Date of Birth */}
                <div className="onboard-form-group">
                  <label className="onboard-label">
                    <span>Date of Birth *</span>
                  </label>
                  <div className="onboard-row-3">
                    <select
                      value={dobDay}
                      onChange={(e) => setDobDay(e.target.value)}
                      className="onboard-select"
                    >
                      {Array.from({ length: 31 }).map((_, i) => {
                        const d = String(i + 1).padStart(2, "0");
                        return (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        );
                      })}
                    </select>

                    <select
                      value={dobMonth}
                      onChange={(e) => setDobMonth(e.target.value)}
                      className="onboard-select"
                    >
                      {[
                        { val: "01", label: "January" },
                        { val: "02", label: "February" },
                        { val: "03", label: "March" },
                        { val: "04", label: "April" },
                        { val: "05", label: "May" },
                        { val: "06", label: "June" },
                        { val: "07", label: "July" },
                        { val: "08", label: "August" },
                        { val: "09", label: "September" },
                        { val: "10", label: "October" },
                        { val: "11", label: "November" },
                        { val: "12", label: "December" },
                      ].map((m) => (
                        <option key={m.val} value={m.val}>
                          {m.label}
                        </option>
                      ))}
                    </select>

                    <select
                      value={dobYear}
                      onChange={(e) => setDobYear(e.target.value)}
                      className="onboard-select"
                    >
                      {Array.from({ length: 80 }).map((_, i) => {
                        const y = String(new Date().getFullYear() - 18 - i);
                        return (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {/* Gender */}
                <div className="onboard-form-group">
                  <label className="onboard-label">
                    <span>Gender *</span>
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="onboard-select"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </>
            )}

            {onboardStep === 2 && (
              <>
                <div className="onboard-form-group">
                  <label className="onboard-label">
                    <span>Street Address *</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Flat / Building, Street"
                    value={addr1}
                    onChange={(e) => setAddr1(e.target.value)}
                    className="onboard-input"
                  />
                </div>
                <div className="onboard-form-group">
                  <label className="onboard-label">
                    <span>Address Line 2 (Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Apartment, suite, landmark"
                    value={addr2}
                    onChange={(e) => setAddr2(e.target.value)}
                    className="onboard-input"
                  />
                </div>
                <div className="onboard-row-2">
                  <div className="onboard-form-group">
                    <label className="onboard-label">
                      <span>Postal / PIN Code *</span>
                    </label>
                    <input
                      type="text"
                      placeholder="PIN Code"
                      value={postal}
                      onChange={(e) => handlePostalCodeChange(e.target.value, country)}
                      className="onboard-input"
                    />
                  </div>
                  <div className="onboard-form-group">
                    <label className="onboard-label">
                      <span>City *</span>
                    </label>
                    <input
                      type="text"
                      placeholder="City"
                      value={postalLoading ? "Loading..." : city}
                      onChange={(e) => setCity(e.target.value)}
                      className="onboard-input"
                    />
                  </div>
                </div>
                <div className="onboard-row-2">
                  <div className="onboard-form-group">
                    <label className="onboard-label">
                      <span>State *</span>
                    </label>
                    <input
                      type="text"
                      placeholder="State"
                      value={postalLoading ? "Loading..." : state}
                      onChange={(e) => setState(e.target.value)}
                      className="onboard-input"
                    />
                  </div>
                  <div className="onboard-form-group">
                    <label className="onboard-label">
                      <span>Country *</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Country"
                      value={country}
                      onChange={(e) => {
                        setCountry(e.target.value);
                        handlePostalCodeChange(postal, e.target.value);
                      }}
                      className="onboard-input"
                    />
                  </div>
                </div>
              </>
            )}

            {onboardStep === 3 && (
              <>
                <div className="onboard-form-group">
                  <label className="onboard-label">
                    <span>Contact Person Name *</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    className="onboard-input"
                  />
                </div>
                <div className="onboard-form-group">
                  <label className="onboard-label">
                    <span>Contact Person Phone *</span>
                  </label>
                  <div className="onboard-phone-input-wrap">
                    <span className="onboard-phone-prefix">+91</span>
                    <input
                      type="tel"
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      value={emergencyPhoneDigits.join("")}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 10).split("");
                        const arr = Array(10).fill("");
                        digits.forEach((d, i) => { arr[i] = d; });
                        setEmergencyPhoneDigits(arr);
                      }}
                      className="onboard-phone-native-input"
                    />
                  </div>
                </div>
                <div className="onboard-form-group">
                  <label className="onboard-label">
                    <span>Relationship *</span>
                  </label>
                  <select
                    value={emergencyRelation}
                    onChange={(e) => setEmergencyRelation(e.target.value)}
                    className="onboard-select"
                  >
                    <option value="Spouse">Spouse</option>
                    <option value="Parent">Parent</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Child">Child</option>
                    <option value="Friend">Friend</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </>
            )}

            {onboardStep === 4 && (
              <>
                <div className="onboard-form-group">
                  <label className="onboard-label">
                    <span>Bank Name</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. HDFC Bank, ICICI, SBI"
                    value={bank}
                    onChange={(e) => setBank(e.target.value)}
                    className="onboard-input"
                  />
                </div>
                <div className="onboard-form-group">
                  <label className="onboard-label">
                    <span>Account Number</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Account number or IBAN"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    className="onboard-input"
                  />
                </div>
                <div className="onboard-form-group">
                  <label className="onboard-label">
                    <span>PAN / Tax ID</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Tax identification code"
                    value={pan}
                    onChange={(e) => setPan(e.target.value)}
                    className="onboard-input"
                  />
                </div>
              </>
            )}

            {onboardStep === 5 && (
              <>
                {onboardDocsLoading ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "1.5rem", justifyContent: "center", color: "#71717a" }}>
                    <Loader2 size={16} className="animate-spin" />
                    <span style={{ fontSize: "0.8125rem" }}>Loading document requirements...</span>
                  </div>
                ) : onboardDocRequirements.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem", border: "1px dashed #e4e4e7", borderRadius: 4, color: "#71717a" }}>
                    <FileCheck size={28} style={{ margin: "0 auto 8px", opacity: 0.6 }} />
                    <p style={{ fontWeight: 600, color: "#09090b", margin: "0 0 4px", fontSize: "0.875rem" }}>
                      No documents required
                    </p>
                    <p style={{ fontSize: "0.75rem", margin: 0 }}>
                      You can proceed to the final step.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {onboardDocRequirements.map((req) => {
                      const filesList = onboardDocFiles[req.id] || [];
                      const hasFiles = filesList.length > 0;

                      return (
                        <div
                          key={req.id}
                          style={{
                            border: "1px solid #e4e4e7",
                            borderRadius: 4,
                            padding: "0.875rem 1rem",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                            background: "#ffffff",
                          }}
                        >
                          <input
                            id={`onboard-file-${req.id}`}
                            type="file"
                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                            multiple
                            style={{ display: "none" }}
                            onChange={async (e) => {
                              const files = e.target.files;
                              if (!files || files.length === 0) return;
                              setOnboardDocUploadingId(req.id);
                              try {
                                for (let i = 0; i < files.length; i++) {
                                  const f = files[i]!;
                                  const b64 = await new Promise<string>((resolve) => {
                                    const reader = new FileReader();
                                    reader.onload = () => resolve(reader.result as string);
                                    reader.readAsDataURL(f);
                                  });
                                  setOnboardDocFiles((prev) => ({
                                    ...prev,
                                    [req.id]: [
                                      ...(prev[req.id] || []),
                                      {
                                        fileName: f.name,
                                        fileBase64: b64,
                                        mimeType: f.type,
                                        sizeBytes: f.size,
                                      },
                                    ],
                                  }));
                                }
                              } finally {
                                setOnboardDocUploadingId(null);
                                e.target.value = "";
                              }
                            }}
                          />

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#09090b" }}>
                                {req.title}
                              </span>
                              <span style={{ fontSize: "0.6875rem", color: req.is_mandatory ? "#71717a" : "#a1a1aa", marginLeft: "0.5rem" }}>
                                {req.is_mandatory ? "(Required)" : "(Optional)"}
                              </span>
                            </div>
                            <button
                              type="button"
                              disabled={onboardDocUploadingId === req.id}
                              onClick={() => {
                                const el = document.getElementById(`onboard-file-${req.id}`) as HTMLInputElement;
                                el?.click();
                              }}
                              className="onboard-btn-secondary"
                              style={{ height: 28, padding: "0 0.625rem", fontSize: "0.75rem" }}
                            >
                              {onboardDocUploadingId === req.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Upload size={12} />
                              )}
                              <span>Upload</span>
                            </button>
                          </div>

                          {/* Uploaded files list */}
                          {hasFiles && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginTop: "0.25rem" }}>
                              {filesList.map((file, fileIdx) => (
                                <div
                                  key={fileIdx}
                                  className="onboard-file-item"
                                  style={{ padding: "0.375rem 0.625rem" }}
                                >
                                  <div className="onboard-file-item-left">
                                    <CheckCircle2 size={13} style={{ color: "#09090b", flexShrink: 0 }} />
                                    <span className="onboard-file-item-name" style={{ fontSize: "0.75rem" }}>
                                      {file.fileName}
                                    </span>
                                    <span style={{ fontSize: "0.6875rem", color: "#71717a" }}>
                                      ({(file.sizeBytes / 1024).toFixed(0)} KB)
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOnboardDocFiles((prev) => {
                                        const updated = (prev[req.id] || []).filter((_, idx) => idx !== fileIdx);
                                        return { ...prev, [req.id]: updated };
                                      });
                                    }}
                                    className="onboard-file-remove-btn"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {onboardStep === 6 && (
              <>
                <input
                  ref={onboardingPhotoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleOnboardingPhotoSelect}
                />

                <div className="onboard-photo-compact">
                  {uploadedPhotoBase64 ? (
                    <div className="onboard-photo-thumb-wrap">
                      <img
                        src={uploadedPhotoBase64}
                        alt="Profile preview"
                        className="onboard-photo-thumb-img"
                      />
                    </div>
                  ) : (
                    <div className="onboard-photo-empty">
                      <UploadPhotoIcon size={24} strokeWidth={1.5} />
                    </div>
                  )}

                  <div className="onboard-photo-info">
                    <p className="onboard-photo-info-title">
                      {uploadedPhotoBase64 ? "Profile picture selected" : "Upload your profile picture"}
                    </p>
                    <p className="onboard-photo-info-desc">
                      JPG, PNG, or WebP up to 5 MB
                    </p>
                    <div className="onboard-photo-actions">
                      <button
                        type="button"
                        onClick={() => onboardingPhotoInputRef.current?.click()}
                        className="onboard-btn-secondary"
                        style={{ height: 30, padding: "0 0.75rem", fontSize: "0.75rem" }}
                      >
                        {uploadedPhotoBase64 ? "Change Image" : "Choose File"}
                      </button>
                      {uploadedPhotoBase64 && (
                        <button
                          type="button"
                          onClick={() => setUploadedPhotoBase64(null)}
                          className="onboard-btn-secondary"
                          style={{ height: 30, padding: "0 0.75rem", fontSize: "0.75rem", color: "#dc2626" }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* About You / Bio */}
                <div className="onboard-form-group">
                  <div className="onboard-label">
                    <span>About You *</span>
                    <span style={{ fontSize: "0.6875rem", color: "#71717a" }}>
                      Min. 10 characters ({onboardBio.trim().length}/10)
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    required
                    placeholder="Short introduction for your company team directory..."
                    value={onboardBio}
                    onChange={(e) => setOnboardBio(e.target.value)}
                    className="onboard-textarea"
                  />
                </div>
              </>
            )}

            <div className="onboard-footer">
              <button
                type="button"
                disabled={onboardStep === 1}
                onClick={() => setOnboardStep((p) => p - 1)}
                className="onboard-btn-secondary"
              >
                Back
              </button>
              {onboardStep < 6 ? (
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {(onboardStep === 4 || onboardStep === 5) && (
                    <button
                      type="button"
                      onClick={() => setOnboardStep((p) => p + 1)}
                      className="onboard-btn-skip"
                    >
                      Skip
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={
                      (onboardStep === 1 && (!phone || !dob)) ||
                      (onboardStep === 2 && (!addr1 || !city || !state || !postal)) ||
                      (onboardStep === 3 && (!emergencyName || !emergencyPhone))
                    }
                    onClick={() => setOnboardStep((p) => p + 1)}
                    className="onboard-btn-primary"
                  >
                    Continue
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!uploadedPhotoBase64 || !onboardBio.trim() || onboardBio.trim().length < 10}
                  onClick={handleOnboardingSubmit}
                  className="onboard-btn-primary"
                >
                  Complete Onboarding
                </button>
              )}
            </div>
          </div>
        </main>

        {/* Photo Adjust Modal (Zoom & Reposition) */}
        <Dialog open={Boolean(pendingOnboardPhoto)} onOpenChange={(open) => !open && setPendingOnboardPhoto(null)}>
          <DialogContent style={{ maxWidth: 360, padding: "1.5rem" }}>
            <DialogHeader>
              <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
                Adjust Your Photo
              </DialogTitle>
            </DialogHeader>
            {pendingOnboardPhoto && (
              <div className="onboard-crop-content">
                <div
                  className="onboard-crop-box"
                  onPointerDown={(e) => {
                    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                    onboardDragRef.current = {
                      px: e.clientX,
                      py: e.clientY,
                      bx: pendingOnboardPhoto.x,
                      by: pendingOnboardPhoto.y,
                    };
                  }}
                  onPointerMove={(e) => {
                    const d = onboardDragRef.current;
                    if (!d) return;
                    const c = clampOnboardOffset(
                      d.bx + (e.clientX - d.px),
                      d.by + (e.clientY - d.py),
                      pendingOnboardPhoto.zoom,
                    );
                    setPendingOnboardPhoto({ ...pendingOnboardPhoto, ...c });
                  }}
                  onPointerUp={() => (onboardDragRef.current = null)}
                  onPointerCancel={() => (onboardDragRef.current = null)}
                >
                  <img
                    src={pendingOnboardPhoto.src}
                    alt="Preview"
                    draggable={false}
                    onLoad={(e) => {
                      const el = e.currentTarget;
                      setOnboardImgDims({ w: el.naturalWidth, h: el.naturalHeight });
                    }}
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      transform: `translate(calc(-50% + ${pendingOnboardPhoto.x}px), calc(-50% + ${pendingOnboardPhoto.y}px)) scale(${pendingOnboardPhoto.zoom})`,
                      minWidth: "100%",
                      minHeight: "100%",
                      objectFit: "cover",
                      pointerEvents: "none",
                    }}
                  />
                </div>

                <div className="onboard-zoom-slider-wrap">
                  <span>Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.05}
                    value={pendingOnboardPhoto.zoom}
                    onChange={(e) => {
                      const zoom = parseFloat(e.target.value);
                      const c = clampOnboardOffset(pendingOnboardPhoto.x, pendingOnboardPhoto.y, zoom);
                      setPendingOnboardPhoto({ ...pendingOnboardPhoto, zoom, ...c });
                    }}
                    style={{ flex: 1, accentColor: "var(--color-brand, #18181b)" }}
                  />
                </div>
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0, textAlign: "center" }}>
                  Drag to reposition — photo will be cropped to a square.
                </p>
              </div>
            )}
            <DialogFooter style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => setPendingOnboardPhoto(null)}
                className="onboard-btn-secondary"
                style={{ height: 36, fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyOnboardAdjustedPhoto}
                className="onboard-btn-primary"
                style={{ height: 36, fontSize: 13 }}
              >
                Save Crop
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  interface InductionSlideItem {
    id: string;
    title: string;
    description: string;
    contentType: "video" | "text" | "pdf";
    contentPath: string;
  }

  const renderInductionFlow = () => {
    // Map dynamic company training sections if configured
    const slides: InductionSlideItem[] =
      companyInductionSections.length > 0
        ? companyInductionSections.map((sec: any, idx: number) => {
            const firstEmbed = (sec.content || []).find((b: any) => b.type === "embed" && b.url);
            const firstImage = (sec.content || []).find((b: any) => b.type === "image" && b.url);
            const textBlocks = (sec.content || [])
              .filter((b: any) => b.type === "text" && b.content)
              .map((b: any) => b.content)
              .join("\n\n");

            let contentType: "video" | "text" | "pdf" = "text";
            let contentPath = "";

            if (firstEmbed?.url) {
              contentType = "video";
              contentPath = firstEmbed.url;
            } else if (firstImage?.url) {
              contentType = "text";
              contentPath = firstImage.url;
            }

            return {
              id: sec.id || String(idx + 1),
              title: sec.title || "Induction Topic",
              description: textBlocks || sec.description || "",
              contentType,
              contentPath,
            };
          })
        : [
            {
              id: "1",
              title: `Welcome to ${inductionCompanyName} Induction Hub! 🌟`,
              description: `Welcome aboard to ${inductionCompanyName}! Here you can explore our team vision, workplace guidelines, and orientation resources.`,
              contentType: "text" as const,
              contentPath: "",
            },
          ];

    const currentSlide: InductionSlideItem = slides[inductionSlide] || slides[0]!;

    const getYoutubeEmbedUrl = (urlStr: string) => {
      try {
        if (urlStr.includes("youtu.be/")) {
          const parts = urlStr.split("youtu.be/");
          const idAndParams = parts[1] || "";
          const id = idAndParams.split("?")[0] || "";
          return `https://www.youtube.com/embed/${id}`;
        }
        const url = new URL(urlStr);
        if (url.hostname.includes("youtube.com")) {
          const v = url.searchParams.get("v");
          if (v) return `https://www.youtube.com/embed/${v}`;
          if (url.pathname.includes("embed")) return urlStr;
        }
        return urlStr.replace("watch?v=", "embed/");
      } catch (e) {
        return urlStr;
      }
    };

    return (
      <div className="induction-flow-container">
        {/* Left Sidebar Checklist Panel */}
        <aside className="induction-flow-sidebar">
          <div style={{ padding: "1.5rem" }}>
            {/* Brand Logo Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, letterSpacing: "0.05em", color: "#f8fafc" }}>
                {inductionCompanyName} INDUCTION
              </span>
            </div>

            {/* Stepper items checklist */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              {slides.map((slide, idx) => {
                const isActive = idx === inductionSlide;
                const isCompleted = idx < inductionSlide;

                return (
                  <button
                    type="button"
                    key={slide.id}
                    onClick={() => setInductionSlide(idx)}
                    className={cn(
                      "induction-flow-topic-btn",
                      isActive && "active"
                    )}
                  >
                    {/* Circle Bullet Indicator */}
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 9999,
                        background: isCompleted ? "#10b981" : isActive ? "#38bdf8" : "#334155",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {isCompleted ? "✓" : idx + 1}
                    </div>

                    {/* Stepper Details */}
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: isActive ? 600 : 500, color: isActive ? "#fff" : "#cbd5e1" }}>
                        {slide.title}
                      </p>
                      <p style={{ margin: 0, fontSize: 11, color: "#64748b", textTransform: "capitalize" }}>
                        {slide.contentType} Topic
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Progress Percent footer */}
          <div style={{ padding: "1.25rem 1.5rem", borderTop: "1px solid #334155" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.05em", color: "#64748b", display: "block", marginBottom: "6px" }}>
              INDUCTION PROGRESS
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ flex: 1, height: 6, background: "#334155", borderRadius: 9999, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    background: "#38bdf8",
                    width: `${Math.round(((inductionSlide + 1) / slides.length) * 100)}%`,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#94a3b8" }}>
                {Math.round(((inductionSlide + 1) / slides.length) * 100)}%
              </span>
            </div>
          </div>
        </aside>

        {/* Right Active Viewport Panel */}
        <div className="induction-flow-main">
          {/* Fixed Small Header at top of Right Panel */}
          <header className="induction-flow-header">
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0, color: "#fff" }}>
              {currentSlide.title}
            </h2>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              Topic {inductionSlide + 1} of {slides.length}
            </span>
          </header>

          {/* Main workspace container: scrollable */}
          <div className="induction-flow-content">
            <div>
              {/* Media Block render */}
              {currentSlide.contentType === "video" && (
                <div style={{ width: "100%", aspectRatio: "16/9", borderRadius: "12px", overflow: "hidden", background: "#000", marginBottom: "1.5rem" }}>
                  <iframe
                    width="100%"
                    height="100%"
                    src={getYoutubeEmbedUrl(currentSlide.contentPath)}
                    title={currentSlide.title}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              )}

              {currentSlide.contentType === "pdf" && (
                <div style={{ padding: "2rem", background: "#1e293b", borderRadius: "12px", border: "1px solid #334155", marginBottom: "1.5rem" }}>
                  <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0 0 0.5rem", color: "#fff" }}>
                    Employee Handbook
                  </h3>
                  <p style={{ fontSize: "13px", color: "#94a3b8", margin: "0 0 1rem" }}>
                    Please download and read the official handbook layout file.
                  </p>
                  <a
                    href={currentSlide.contentPath}
                    download
                    target="_blank"
                    rel="noreferrer"
                    className="onboard-btn-primary"
                    style={{ background: "#38bdf8", color: "#0f172a", textDecoration: "none" }}
                  >
                    Download Handbook PDF
                  </a>
                </div>
              )}

              {/* Description content panel */}
              <div style={{ lineHeight: 1.6, color: "#cbd5e1", fontSize: "14px" }}>
                <p style={{ margin: 0, whiteSpace: "pre-line" }}>
                  {currentSlide.description}
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Actions footer bar: fixed/sticky to bottom */}
          <footer className="induction-flow-footer">
            <button
              type="button"
              disabled={inductionSlide === 0}
              onClick={() => setInductionSlide((p) => p - 1)}
              className="onboard-btn-secondary"
              style={{ background: "#334155", borderColor: "#475569", color: "#f8fafc" }}
            >
              Previous
            </button>

            {inductionSlide < slides.length - 1 ? (
              <button
                type="button"
                onClick={() => setInductionSlide((p) => p + 1)}
                className="onboard-btn-primary"
                style={{ background: "#38bdf8", color: "#0f172a" }}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setProfileStatus("Completed");
                  setShowInduction(false);
                }}
                className="onboard-btn-primary"
                style={{ background: "#10b981", color: "#fff" }}
              >
                Finish Journey
              </button>
            )}
          </footer>
        </div>
      </div>
    );
  };

  if (!isPublicView && checkingStatus) {
    return (
      <div className="global-app-loader">
        <Loader2 className="global-app-spinner" />
      </div>
    );
  }

  if (!isPublicView && showInduction) {
    return renderInductionFlow();
  }

  if (!isPublicView && profileStatus === "Pending") {
    return renderOnboardingWizard();
  }

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. */}
      <Outlet />

      {/* Timed Bottom-Center Notification Reminder for Pending KYC Documents */}
      {pendingDocAlert.open && (
        <aside
          role="alert"
          aria-live="polite"
          className="pending-docs-floating-banner"
        >
          <div className="pending-docs-banner-content">
            <div className="pending-docs-icon-wrap">
              <FileText size={18} />
            </div>

            <div className="pending-docs-text-group">
              <p className="pending-docs-title">
                Documents Pending
              </p>
              <p className="pending-docs-subtitle">
                {pendingDocAlert.totalPending} verification document{pendingDocAlert.totalPending > 1 ? "s" : ""} required
              </p>
            </div>

            <div className="pending-docs-actions">
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem("doc_submission_reminder_dismissed", "true");
                  setPendingDocAlert((prev) => ({ ...prev, open: false }));
                }}
                className="pending-docs-btn-secondary"
              >
                Remind Later
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem("doc_submission_reminder_dismissed", "true");
                  setPendingDocAlert((prev) => ({ ...prev, open: false }));
                  navigate({ to: "/profile" });
                  if (typeof window !== "undefined") {
                    window.location.hash = "#documents";
                  }
                }}
                className="pending-docs-btn-primary"
              >
                Upload
              </button>
            </div>

            {/* Timed progress indicator line */}
            <div className="pending-docs-progress-line" />
          </div>
        </aside>
      )}

      <Toaster richColors closeButton position="bottom-center" />
    </QueryClientProvider>
  );
}
