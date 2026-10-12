import React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import Layout from "../components/Layout";
import { OfflineScreen } from "../components/OfflineScreen";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import "../styles-driver.css";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "../lib/supabase";
import {
  getTasksAssignedToUser,
  getTasksAssignedByUser,
  getAllCompanyTasks,
  Task,
} from "../lib/tasks";
import {
  getCompanyForumPosts,
  castPollVote,
  formatPollRemaining,
  deleteForumPost,
  ForumPost,
} from "../lib/forum";
import {
  getCompanyDiscussions,
  postDiscussion,
  deleteDiscussion,
  getCompanyChatMode,
  updateCompanyChatMode,
  DiscussionMessage,
} from "../lib/discussions";
import { formatApprovalAmount } from "../lib/approvals";
import { getCompanyEmployees } from "../lib/tasks";
import {
  getCompanyHolidays,
  getEmployeeEffectiveOffDays,
  DEFAULT_COMPANY_OFF_DAYS,
  type CompanyHoliday,
} from "../lib/leave";
import { sanitizeProfilePhoto } from "../lib/profile-photo";
import { HolidayCalendar, type OnLeaveEmployee } from "../components/hr/HolidayCalendar";
import {
  Users as Group,
  ClockFading,
  ClipboardCheck,
  Clock as AccessTime,
  History as History,
  Send as Send,
  FileText as Description,
  TrendingUp as TrendingUp,
  CalendarDays as CalendarMonth,
  Cake as Cake,
  FilePlus as PostAdd,
  Ellipsis as MoreHoriz,
  TrendingUp as PerformanceIcon,
  CloudOff as CloudOff,
  Reply as ReplyIcon,
  X as Close,
  PartyPopper as Celebration,
  Trash2 as DeleteIcon,
  MessagesSquare as Forum,
  Megaphone,
  Check as Check,
  Users as Groups,
  Users as People,
  CircleAlert as ErrorOutlined,
  CircleCheck as CheckCircleOutlined,
  ChartColumn as BarChart,
  Pin as PinIcon,
  ShieldCheck,
  Award,
  Loader2,
} from "lucide-react";

import { getCurrentCoordinates } from "../lib/geolocation";
import { WhosOutWidget, type OutEmployee } from "../components/dashboard/WhosOutWidget";
import { MyRequestsWidget } from "../components/dashboard/MyRequestsWidget";
import { calculateIsLate } from "../lib/attendance-helpers";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    title: "CapOasis | Employee Dashboard",
    meta: [
      {
        name: "description",
        content: "Professional HRMS for modern enterprises built with Material UI.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const [isMobile, setIsMobile] = React.useState(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);
  React.useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const [isLoading, setIsLoading] = React.useState(true);
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = React.useState<boolean | null>(null);
  const [tourDialogOpen, setTourDialogOpen] = React.useState(false);
  const [tourLanguage, setTourLanguage] = React.useState<"en" | "hi" | "mr">("hi");
  const [isTourActive, setIsTourActive] = React.useState(false);
  const [hubTab, setHubTab] = React.useState<"chat" | "posts">("chat");

  // Keep a reference to the active tour audio to control play/pause transitions
  const tourAudioRef = React.useRef<HTMLAudioElement | null>(null);

  // Audio source map matching step index + selected language
  const audioSrcMap = React.useMemo<Record<string, string>>(
    () => ({
      "0_en": "/tour-audios/English/step1_english.mp3",
      "0_hi": "/tour-audios/Hindi/step1_hindi.mp3",
      "0_mr": "/tour-audios/Marathi/step1_Marathi.mp3",

      "1_en": "/tour-audios/English/step2_english.mp3",
      "1_hi": "/tour-audios/Hindi/step2_hindi.mp3",
      "1_mr": "/tour-audios/Marathi/step2_Marathi.mp3",

      "2_en": "/tour-audios/English/step3_english.mp3",
      "2_hi": "/tour-audios/Hindi/step3_hindi.mp3",
      "2_mr": "/tour-audios/Marathi/step3_Marathi.mp3",

      "3_en": "/tour-audios/English/step4_english.mp3",
      "3_hi": "/tour-audios/Hindi/step4_hindi.mp3",
      "3_mr": "/tour-audios/Marathi/step4_Marathi.mp3",

      "4_en": "/tour-audios/English/step5_english.mp3",
      "4_hi": "/tour-audios/Hindi/step5_hindi.mp3",
      "4_mr": "/tour-audios/Marathi/step5_Marathi.mp3",

      "5_en": "/tour-audios/English/step6_english.mp3",
      "5_hi": "/tour-audios/Hindi/step6_hindi.mp3",
      "5_mr": "/tour-audios/Marathi/step6_Marathi.mp3",

      "6_en": "/tour-audios/English/step7_english.mp3",
      "6_hi": "/tour-audios/Hindi/step7_hindi.mp3",
      "6_mr": "/tour-audios/Marathi/step7_Marathi.mp3",
    }),
    [],
  );

  // Expose toggle capability globally so the HTML buttons inside the popovers can trigger audio.
  React.useEffect(() => {
    (window as any).toggleTourAudio = () => {
      const audio = tourAudioRef.current;
      if (!audio) return;

      const btn = document.getElementById("popover-play-btn");
      if (!btn) return;

      if (audio.paused) {
        audio.play().catch((e) => console.warn("Audio play blocked:", e));
        btn.classList.add("playing");
        btn.innerHTML = `
          <svg class="progress-ring" width="54" height="54">
            <circle class="progress-ring__track" stroke="rgba(0,0,0,0.1)" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
            <circle class="progress-ring__circle" stroke="#000000" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
          </svg>
          <span class="play-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
          </span>
        `;
      } else {
        audio.pause();
        btn.classList.remove("playing");
        btn.innerHTML = `
          <svg class="progress-ring" width="54" height="54">
            <circle class="progress-ring__track" stroke="rgba(0,0,0,0.1)" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
            <circle class="progress-ring__circle" stroke="#000000" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
          </svg>
          <span class="play-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <line x1="23" y1="9" x2="17" y2="15"></line>
              <line x1="17" y1="9" x2="23" y2="15"></line>
            </svg>
          </span>
        `;
      }
      // Re-bind circle offset
      const circle = btn.querySelector(".progress-ring__circle") as SVGCircleElement | null;
      if (circle) {
        const radius = circle.r.baseVal.value;
        const circumference = radius * 2 * Math.PI;
        circle.style.strokeDasharray = `${circumference} ${circumference}`;
        const percent = (audio.currentTime / audio.duration) * 100 || 0;
        const offset = circumference - (percent / 100) * circumference;
        circle.style.strokeDashoffset = `${offset}`;
      }
    };

    return () => {
      delete (window as any).toggleTourAudio;
    };
  }, []);

  const playStepAudio = React.useCallback(
    (stepIndex: number, lang: "en" | "hi" | "mr") => {
      if (tourAudioRef.current) {
        tourAudioRef.current.pause();
        tourAudioRef.current = null;
      }

      const key = `${stepIndex}_${lang}`;
      const src = audioSrcMap[key];

      if (src) {
        const audio = new Audio(src);
        tourAudioRef.current = audio;

        // Handle progress update to rotate stroke outline around the button
        audio.addEventListener("timeupdate", () => {
          const btn = document.getElementById("popover-play-btn");
          const circle = btn?.querySelector(".progress-ring__circle") as SVGCircleElement | null;
          if (circle && audio.duration) {
            const radius = circle.r.baseVal.value;
            const circumference = radius * 2 * Math.PI;
            circle.style.strokeDasharray = `${circumference} ${circumference}`;
            const percent = (audio.currentTime / audio.duration) * 100;
            const offset = circumference - (percent / 100) * circumference;
            circle.style.strokeDashoffset = `${offset}`;
          }
        });

        // Handle end of audio playback
        audio.addEventListener("ended", () => {
          const btn = document.getElementById("popover-play-btn");
          if (btn) {
            btn.classList.remove("playing");
            btn.innerHTML = `
            <svg class="progress-ring" width="54" height="54">
              <circle class="progress-ring__track" stroke="rgba(0,0,0,0.1)" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
              <circle class="progress-ring__circle" stroke="#000000" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
            </svg>
            <span class="play-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
              </svg>
            </span>
          `;
          }
        });

        // Auto start audio
        audio
          .play()
          .then(() => {
            const btn = document.getElementById("popover-play-btn");
            if (btn) {
              btn.classList.add("playing");
              btn.innerHTML = `
            <svg class="progress-ring" width="54" height="54">
              <circle class="progress-ring__track" stroke="rgba(0,0,0,0.1)" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
              <circle class="progress-ring__circle" stroke="#000000" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
            </svg>
            <span class="play-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </span>
          `;
            }
          })
          .catch((err) => {
            console.warn(`Auto-play blocked: ${src}`, err);
          });
      }
    },
    [audioSrcMap],
  );

  // ─── Driver.js tour ───────────────────────────────────────────────────────
  const startTour = React.useCallback(() => {
    setIsTourActive(true);
    if (tourAudioRef.current) {
      tourAudioRef.current.pause();
      tourAudioRef.current = null;
    }

    const driverObj = driver({
      animate: true,
      smoothScroll: true,
      overlayColor: "#000",
      overlayOpacity: 0.65,
      allowClose: false,
      allowKeyboardControl: false,
      popoverClass: "capoasis-tour-popover",
      showProgress: true,
      progressText: "Step: {{current}} of {{total}}",
      popoverOffset: 18,
      stagePadding: 0,
      steps: [
        {
          element: "#team-activity-card",
          popover: {
            title: `
              <div class="popover-title-wrapper">
                <span>Team Activity & Status</span>
                <button id="popover-play-btn" onclick="window.toggleTourAudio()">
                  <svg class="progress-ring" width="54" height="54">
                    <circle class="progress-ring__track" stroke="rgba(0,0,0,0.1)" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
                    <circle class="progress-ring__circle" stroke="#000000" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
                  </svg>
                  <span class="play-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                  </span>
                </button>
              </div>
            `,
            description:
              "This is your company's live pulse. See what everyone is working on in real time and submit your own status update directly from the dashboard.",
            side: "bottom",
            align: "start",
          },
          onHighlighted: () => {
            playStepAudio(0, tourLanguage);
          },
        },
        {
          element: "#dashboard-attendance-card",
          popover: {
            title: `
              <div class="popover-title-wrapper">
                <span>Attendance & Clock</span>
                <button id="popover-play-btn" onclick="window.toggleTourAudio()">
                  <svg class="progress-ring" width="54" height="54">
                    <circle class="progress-ring__track" stroke="rgba(0,0,0,0.1)" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
                    <circle class="progress-ring__circle" stroke="#000000" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
                  </svg>
                  <span class="play-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                  </span>
                </button>
              </div>
            `,
            description:
              "Punch in/out with coordinates verified via geolocation, and track daily attendance metrics.",
            side: "right",
            align: "start",
            onPrevClick: () => {
              const trigger = document.getElementById("team-activity-trigger");
              // Open the dropdown first
              if (trigger) trigger.click();
              // Transition back to step 2 once dropdown is open
              setTimeout(() => driverObj.movePrevious(), 350);
            },
          },
          onHighlighted: () => {
            playStepAudio(2, tourLanguage);
          },
        },
        {
          element: "#dashboard-calendar-card",
          popover: {
            title: `
              <div class="popover-title-wrapper">
                <span>Company Calendar</span>
                <button id="popover-play-btn" onclick="window.toggleTourAudio()">
                  <svg class="progress-ring" width="54" height="54">
                    <circle class="progress-ring__track" stroke="rgba(0,0,0,0.1)" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
                    <circle class="progress-ring__circle" stroke="#000000" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
                  </svg>
                  <span class="play-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                  </span>
                </button>
              </div>
            `,
            description:
              "Track public holidays, company weekly off days, and see which teammates are on leave today.",
            side: "right",
            align: "start",
          },
          onHighlighted: () => {
            playStepAudio(3, tourLanguage);
          },
        },
        {
          element: "#dashboard-forum-card",
          popover: {
            title: `
              <div class="popover-title-wrapper">
                <span>Corporate Forum & Discussions</span>
                <button id="popover-play-btn" onclick="window.toggleTourAudio()">
                  <svg class="progress-ring" width="54" height="54">
                    <circle class="progress-ring__track" stroke="rgba(0,0,0,0.1)" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
                    <circle class="progress-ring__circle" stroke="#000000" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
                  </svg>
                  <span class="play-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                  </span>
                </button>
              </div>
            `,
            description:
              "Read company announcements, drop replies, or chat anonymously using active @mentions.",
            side: "top",
            align: "center",
          },
          onHighlighted: () => {
            playStepAudio(4, tourLanguage);
          },
        },
        {
          element: "#dashboard-birthdays-card",
          popover: {
            title: `
              <div class="popover-title-wrapper">
                <span>Celebrations</span>
                <button id="popover-play-btn" onclick="window.toggleTourAudio()">
                  <svg class="progress-ring" width="54" height="54">
                    <circle class="progress-ring__track" stroke="rgba(0,0,0,0.1)" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
                    <circle class="progress-ring__circle" stroke="#000000" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
                  </svg>
                  <span class="play-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                  </span>
                </button>
              </div>
            `,
            description:
              "Keep up with upcoming team birthdays and work anniversaries over the next 3 months and wish colleagues directly.",
            side: "left",
            align: "start",
          },
          onHighlighted: () => {
            playStepAudio(5, tourLanguage);
          },
        },
        {
          element: "#dashboard-overview-card",
          popover: {
            title: `
              <div class="popover-title-wrapper">
                <span>Tasks Overview Status</span>
                <button id="popover-play-btn" onclick="window.toggleTourAudio()">
                  <svg class="progress-ring" width="54" height="54">
                    <circle class="progress-ring__track" stroke="rgba(0,0,0,0.1)" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
                    <circle class="progress-ring__circle" stroke="#000000" stroke-width="4" fill="transparent" r="23" cx="27" cy="27"/>
                  </svg>
                  <span class="play-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                  </span>
                </button>
              </div>
            `,
            description:
              "A high-level count of your total, in-progress, pending, and completed tasks at a glance.",
            side: "left",
            align: "start",
            doneBtnText: "Finish Tour!",
          },
          onHighlighted: () => {
            playStepAudio(6, tourLanguage);
          },
        },
      ],
      onDestroyStarted: () => {
        setIsTourActive(false);
        // Stop audio when tour exits
        if (tourAudioRef.current) {
          tourAudioRef.current.pause();
          tourAudioRef.current = null;
        }
        driverObj.destroy();
      },
    });
    driverObj.drive();
  }, [tourLanguage, playStepAudio]);
  // ──────────────────────────────────────────────────────────────────────────

  // Keyboard shortcut: Ctrl+Shift+Enter (Windows) or Cmd+Shift+Enter (Mac)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isEnter = e.key === "Enter" || e.code === "Enter" || e.keyCode === 13;

      if (isEnter && e.shiftKey) {
        // macOS: Cmd + Shift + Enter | Windows: Ctrl + Shift + Enter
        const hasModifier = e.ctrlKey || e.metaKey;
        if (hasModifier) {
          e.preventDefault();
          setTourDialogOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => {
      setIsOnline(true);
      loadDashboardAndAttendance();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Granular Per-Card Loading States (Each card stops skeleton independently when its data arrives)
  const [loadingAttendance, setLoadingAttendance] = React.useState(true);
  const [loadingCalendar, setLoadingCalendar] = React.useState(true);
  const [loadingForum, setLoadingForum] = React.useState(true);
  const [loadingDiscussions, setLoadingDiscussions] = React.useState(true);
  const [loadingCelebrations, setLoadingCelebrations] = React.useState(true);
  const [loadingTasks, setLoadingTasks] = React.useState(true);
  const [whosOutItems, setWhosOutItems] = React.useState<OutEmployee[]>([]);
  const [loadingWhosOut, setLoadingWhosOut] = React.useState(true);
  const [myTeammateUserIds, setMyTeammateUserIds] = React.useState<string[]>([]);
  const isWhosOutFetchingRef = React.useRef(false);
  const hasWhosOutLoadedOnceRef = React.useRef(false);

  // Approvals & Requests Widget state
  const [requestsItems, setRequestsItems] = React.useState<import("../components/dashboard/MyRequestsWidget").DashboardRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = React.useState(true);
  const [canUserApprove, setCanUserApprove] = React.useState(false);
  const isRequestsFetchingRef = React.useRef(false);
  const hasRequestsLoadedOnceRef = React.useRef(false);

  // Attendance States
  const [todayRecord, setTodayRecord] = React.useState<any>(null);
  const [workStartTime, setWorkStartTime] = React.useState<string>("09:30");
  const [lateGraceMinutes, setLateGraceMinutes] = React.useState<number>(10);
  const [officeLocations, setOfficeLocations] = React.useState<any[]>([]);
  const [priorityTasks, setPriorityTasks] = React.useState<Task[]>([]);
  const [allTasks, setAllTasks] = React.useState<Task[]>([]);
  const [holidays, setHolidays] = React.useState<CompanyHoliday[]>([]);
  // The signed-in user's effective weekly off days (custom schedule if set, else company default)
  const [myOffDays, setMyOffDays] = React.useState<number[]>(DEFAULT_COMPANY_OFF_DAYS);
  const [onLeaveToday, setOnLeaveToday] = React.useState<OnLeaveEmployee[]>([]);
  const [recentPosts, setRecentPosts] = React.useState<ForumPost[]>([]);
  const [discussions, setDiscussions] = React.useState<DiscussionMessage[]>([]);
  const [companyEmployees, setCompanyEmployees] = React.useState<
    { id: string; name: string; avatarUrl?: string | undefined; role?: string | undefined }[]
  >([]);
  const [myCompanyId, setMyCompanyId] = React.useState<string | null>(null);
  const [myUserId, setMyUserId] = React.useState<string | null>(null);
  const [isSubmittingPollVote, setIsSubmittingPollVote] = React.useState<Record<string, boolean>>({});

  const sortPostsWithUnvotedPollsOnTop = React.useCallback((postsList: ForumPost[]) => {
    return [...postsList].sort((a, b) => {
      const aIsActiveUnvotedPoll =
        a.postType === "poll" &&
        Boolean(a.poll) &&
        !a.poll?.userVotedOptionId &&
        !a.poll?.isExpired &&
        new Date(a.poll?.expiresAt || 0).getTime() > Date.now();

      const bIsActiveUnvotedPoll =
        b.postType === "poll" &&
        Boolean(b.poll) &&
        !b.poll?.userVotedOptionId &&
        !b.poll?.isExpired &&
        new Date(b.poll?.expiresAt || 0).getTime() > Date.now();

      if (aIsActiveUnvotedPoll && !bIsActiveUnvotedPoll) return -1;
      if (!aIsActiveUnvotedPoll && bIsActiveUnvotedPoll) return 1;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, []);

  const hasActiveUnvotedPoll = React.useMemo(() => {
    return recentPosts.some(
      (p) =>
        p.postType === "poll" &&
        p.poll &&
        !p.poll.userVotedOptionId &&
        !p.poll.isExpired &&
        new Date(p.poll.expiresAt).getTime() > Date.now(),
    );
  }, [recentPosts]);

  const handleDashboardPollVote = async (pollId: string, optionId: string) => {
    if (!myUserId || !myCompanyId) return;
    setIsSubmittingPollVote((prev) => ({ ...prev, [pollId]: true }));
    try {
      const res = await castPollVote(pollId, myUserId, optionId);
      if (res.success) {
        const updated = await getCompanyForumPosts(myCompanyId, myUserId);
        const sorted = sortPostsWithUnvotedPollsOnTop(updated || []);
        setRecentPosts(sorted.slice(0, 3));
      } else if (res.error) {
        alert(res.error);
      }
    } catch (err: any) {
      console.error("Dashboard poll vote error:", err);
      alert(err.message || "Failed to submit vote.");
    } finally {
      setIsSubmittingPollVote((prev) => ({ ...prev, [pollId]: false }));
    }
  };
  const [upcomingBirthdays, setUpcomingBirthdays] = React.useState<
    {
      id: string;
      name: string;
      profilePhoto: string | null;
      days: number;
      next: Date;
      type: "birthday" | "anniversary";
      years?: number;
    }[]
  >([]);
  const [replyTarget, setReplyTarget] = React.useState<DiscussionMessage | null>(null);
  const [mentionUserId, setMentionUserId] = React.useState<string | null>(null);
  const [replyText, setReplyText] = React.useState("");
  const [replySending, setReplySending] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<DiscussionMessage | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [lastAddedId, setLastAddedId] = React.useState<string | null>(null);
  const [myRole, setMyRole] = React.useState<string | null>(null);
  const [profileName, setProfileName] = React.useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = React.useState<string | null>(null);
  const [chatMode, setChatMode] = React.useState<"anonymous" | "transparent">("anonymous");
  const [chatModeDialogOpen, setChatModeDialogOpen] = React.useState(false);
  const [savingChatMode, setSavingChatMode] = React.useState(false);
  const [priorityImageFailed, setPriorityImageFailed] = React.useState(false);
  const firstScrollRef = React.useRef(true);
  const threadRef = React.useRef<HTMLDivElement | null>(null);
  const [attendanceStats, setAttendanceStats] = React.useState({
    present: 0,
    absent: 0,
    late: 0,
  });
  const [actionLoading, setActionLoading] = React.useState(false);
  const [deleteForumPostTarget, setDeleteForumPostTarget] = React.useState<{ id: string; title: string } | null>(null);
  const [isDeletingForumPost, setIsDeletingForumPost] = React.useState(false);

  function showToast(message: string, severity: "success" | "error" = "success") {
    if (severity === "error") {
      toast.error(message);
    } else {
      toast.success(message);
    }
  }

  async function handleConfirmDeleteForumPost() {
    if (!deleteForumPostTarget || !myUserId) return;
    setIsDeletingForumPost(true);
    try {
      const res = await deleteForumPost(deleteForumPostTarget.id, myUserId);
      if (res.success) {
        setRecentPosts((prev) => prev.filter((p) => p.id !== deleteForumPostTarget.id));
        showToast("Post deleted successfully.", "success");
        setDeleteForumPostTarget(null);
      } else {
        showToast(res.error || "Failed to delete post. Please verify permissions.", "error");
      }
    } catch {
      showToast("Error deleting post.", "error");
    } finally {
      setIsDeletingForumPost(false);
    }
  }

  async function handleSwitchChatMode(newMode: "anonymous" | "transparent") {
    if (!myCompanyId || newMode === chatMode) {
      setChatModeDialogOpen(false);
      return;
    }
    setSavingChatMode(true);
    try {
      const ok = await updateCompanyChatMode(myCompanyId, newMode);
      if (ok) {
        setChatMode(newMode);
        showToast(
          newMode === "transparent"
            ? "Switched to Transparent Group Chat mode."
            : "Switched to Anonymous Chat mode.",
          "success",
        );
      } else {
        showToast("Failed to change chat mode. Verify Admin/HR permissions.", "error");
      }
    } catch {
      showToast("Error updating chat mode.", "error");
    } finally {
      setSavingChatMode(false);
      setChatModeDialogOpen(false);
    }
  }

  React.useEffect(() => {
    loadDashboardAndAttendance();
  }, []);

  async function checkRealConnectivity(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("/favicon.png?_=" + Date.now(), {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return res.ok;
    } catch {
      return false;
    }
  }

  async function loadDashboardAndAttendance() {
    setLoadingAttendance(true);
    setLoadingCalendar(true);
    setLoadingForum(true);
    setLoadingDiscussions(true);
    setLoadingCelebrations(true);
    setLoadingTasks(true);
    setIsLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoadingAttendance(false);
        setLoadingCalendar(false);
        setLoadingForum(false);
        setLoadingDiscussions(false);
        setLoadingCelebrations(false);
        setLoadingTasks(false);
        setIsLoading(false);
        return;
      }

      setMyUserId(user.id);

      let targetCompanyId: string | null = null;
      if (typeof window !== "undefined") {
        try {
          const stored = sessionStorage.getItem("impersonated_company");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.id) targetCompanyId = parsed.id;
          }
        } catch (e) { }
      }

      // 1. Get user profile company ID, name, photo, work_start_time, and shift_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, name, profile_photo, role, work_start_time, shift_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.name) {
        setProfileName(profile.name);
      }
      if (profile?.profile_photo) {
        setProfileAvatarUrl(sanitizeProfilePhoto(profile.profile_photo));
      }

      if (!targetCompanyId && profile?.company_id) {
        targetCompanyId = profile.company_id;
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const isImpersonating =
        typeof window !== "undefined" && Boolean(sessionStorage.getItem("impersonated_company"));

      const userRole: string = isImpersonating ? "admin" : (profile?.role ?? "employee");

      // Loader A: Attendance (Today record + monthly stats)
      (async () => {
        try {
          const [todayRes] = await Promise.all([
            supabase
              .from("attendance")
              .select("*")
              .eq("user_id", user.id)
              .eq("date", todayStr)
              .maybeSingle(),
            loadAttendanceStats(user.id),
          ]);
          setTodayRecord(todayRes.data || null);
        } finally {
          setLoadingAttendance(false);
        }
      })();

      if (targetCompanyId) {
        setMyCompanyId(targetCompanyId);
        const compId = targetCompanyId;

        // Loader B: Office Locations
        supabase
          .from("office_locations")
          .select("*")
          .eq("company_id", compId)
          .eq("is_active", true)
          .then(({ data }) => setOfficeLocations(data || []));

        // Loader B.1: Shift & Late Mark Settings
        (async () => {
          try {
            const { data: compSettings } = await supabase
              .from("companies")
              .select("default_work_start_time, late_grace_minutes, late_mark_policy_id")
              .eq("id", compId)
              .maybeSingle();

            let effectiveStartTime = profile?.work_start_time || compSettings?.default_work_start_time || "09:30";
            let effectiveGrace = compSettings?.late_grace_minutes ?? 10;

            if (profile?.shift_id) {
              const { data: shiftData } = await supabase
                .from("shifts")
                .select("start_time, late_mark_policy_id")
                .eq("id", profile.shift_id)
                .maybeSingle();
              if (shiftData?.start_time) {
                effectiveStartTime = shiftData.start_time;
              }
              if (shiftData?.late_mark_policy_id) {
                const { data: pol } = await supabase
                  .from("late_mark_policies")
                  .select("grace_minutes")
                  .eq("id", shiftData.late_mark_policy_id)
                  .maybeSingle();
                if (pol?.grace_minutes !== undefined && pol?.grace_minutes !== null) {
                  effectiveGrace = pol.grace_minutes;
                }
              }
            } else if (compSettings?.late_mark_policy_id) {
              const { data: pol } = await supabase
                .from("late_mark_policies")
                .select("grace_minutes")
                .eq("id", compSettings.late_mark_policy_id)
                .maybeSingle();
              if (pol?.grace_minutes !== undefined && pol?.grace_minutes !== null) {
                effectiveGrace = pol.grace_minutes;
              }
            }

            setWorkStartTime(effectiveStartTime);
            setLateGraceMinutes(effectiveGrace);
          } catch (err) {
            console.error("Failed to load shift / late grace settings", err);
          }
        })();

        // Loader C: Priority & Overview Tasks
        (async () => {
          try {
            let combined: Task[] = [];
            if (isImpersonating) {
              combined = await getAllCompanyTasks(compId);
            } else {
              const [assignedList, sentList] = await Promise.all([
                getTasksAssignedToUser(compId, user.id),
                getTasksAssignedByUser(compId, user.id),
              ]);
              const byId = new Map<string, Task>();
              [...assignedList, ...sentList].forEach((t) => byId.set(t.id, t));
              combined = [...byId.values()];
            }
            setAllTasks(combined);
            const active = combined.filter((t) => t.status !== "Completed");
            active.sort((a, b) => {
              if (!a.dueDate) return 1;
              if (!b.dueDate) return -1;
              return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            });
            setPriorityTasks(active.slice(0, 5));
          } finally {
            setLoadingTasks(false);
          }
        })();

        // Loader D: Forum Posts
        getCompanyForumPosts(compId, user.id)
          .then((posts) => {
            const rawPosts = posts || [];
            const sorted = sortPostsWithUnvotedPollsOnTop(rawPosts);
            setRecentPosts(sorted.slice(0, 3));

            // If there's an active unvoted poll with time remaining, automatically switch default tab to Announcements
            const pendingUnvotedPoll = sorted.some(
              (p) =>
                p.postType === "poll" &&
                p.poll &&
                !p.poll.userVotedOptionId &&
                !p.poll.isExpired &&
                new Date(p.poll.expiresAt).getTime() > Date.now(),
            );
            if (pendingUnvotedPoll) {
              setHubTab("posts");
            }
          })
          .finally(() => {
            setLoadingForum(false);
          });

        // Loader E: Discussions + Employees (for @mentions) + Company Chat Mode
        Promise.all([
          getCompanyEmployees(compId),
          getCompanyDiscussions(compId),
          getCompanyChatMode(compId),
        ])
          .then(([employees, msgs, mode]) => {
            setCompanyEmployees(
              (employees || []).map((e: any) => ({
                id: e.id,
                name: e.name || "Unknown",
                avatarUrl: sanitizeProfilePhoto(e.profile_photo || e.avatar_url) || undefined,
                role: e.role || undefined,
              })),
            );
            setDiscussions(msgs || []);
            setChatMode(mode);
          })
          .finally(() => {
            setLoadingDiscussions(false);
          });

        // Loader F: Calendar Holidays + Effective Off Days + Leave Today
        (async () => {
          try {
            const [hol, myOff, leaveRes] = await Promise.all([
              getCompanyHolidays(compId),
              getEmployeeEffectiveOffDays(compId, user.id),
              supabase
                .from("approvals")
                .select("employee_id, profiles!employee_id(name, profile_photo)")
                .eq("company_id", compId)
                .eq("type", "Leave")
                .eq("status", "Approved")
                .lte("start_date", todayStr)
                .gte("end_date", todayStr),
            ]);
            setHolidays(hol || []);
            setMyOffDays(myOff || []);
            const leaveRows = leaveRes.data;
            if (leaveRows && leaveRows.length > 0) {
              setOnLeaveToday(
                leaveRows
                  .filter((r: any) => r.profiles?.name)
                  .map((r: any) => ({
                    name: r.profiles.name,
                    profilePhoto: sanitizeProfilePhoto(r.profiles.profile_photo),
                  })),
              );
            } else {
              setOnLeaveToday([]);
            }
            loadWhosOutData(compId, todayStr, hol || [], myOff || [0, 6], user.id);
          } finally {
            setLoadingCalendar(false);
          }
        })();

        // Loader G: Upcoming Celebrations
        (async () => {
          try {
            const todayMidnight = new Date();
            todayMidnight.setHours(0, 0, 0, 0);
            const { data: empProfiles } = await supabase
              .from("profiles")
              .select("id, name, profile_photo, date_of_birth, date_of_joining")
              .eq("company_id", compId)
              .or("date_of_birth.not.is.null,date_of_joining.not.is.null");
            const bdays: {
              id: string;
              name: string;
              profilePhoto: string | null;
              days: number;
              next: Date;
              type: "birthday" | "anniversary";
              years?: number;
            }[] = [];
            const nextOccurrence = (dateStr: string) => {
              const d = new Date(dateStr);
              if (isNaN(d.getTime())) return null;
              const next = new Date(todayMidnight.getFullYear(), d.getMonth(), d.getDate());
              if (next.getTime() < todayMidnight.getTime()) {
                next.setFullYear(next.getFullYear() + 1);
              }
              return {
                next,
                days: Math.round((next.getTime() - todayMidnight.getTime()) / 86400000),
              };
            };
            for (const e of (empProfiles as any[]) || []) {
              const name = e.name || "Unknown";
              const photo = sanitizeProfilePhoto(e.profile_photo);
              if (e.date_of_birth) {
                const occ = nextOccurrence(e.date_of_birth);
                if (occ && occ.days <= 90) {
                  bdays.push({
                    id: `bday-${e.id}`,
                    name,
                    profilePhoto: photo,
                    type: "birthday",
                    ...occ,
                  });
                }
              }
              const joinTs = e.date_of_joining ? new Date(e.date_of_joining).getTime() : null;
              const dobTs = e.date_of_birth ? new Date(e.date_of_birth).getTime() : null;
              if (e.date_of_joining && joinTs !== dobTs) {
                const occ = nextOccurrence(e.date_of_joining);
                const years = occ
                  ? occ.next.getFullYear() - new Date(e.date_of_joining).getFullYear()
                  : 0;
                if (occ && occ.days <= 90 && years >= 1) {
                  bdays.push({
                    id: `ann-${e.id}`,
                    name,
                    profilePhoto: photo,
                    type: "anniversary",
                    years,
                    ...occ,
                  });
                }
              }
            }
            bdays.sort((a, b) => a.days - b.days);
            setUpcomingBirthdays(bdays.slice(0, 5));
          } catch (err: any) {
            console.error("Failed to load birthdays:", err);
          } finally {
            setLoadingCelebrations(false);
          }
        })();

        // Loader H: Approvals & Requests Widget
        loadMyRequestsData(compId, user.id, userRole);

      } else {
        setLoadingCalendar(false);
        setLoadingForum(false);
        setLoadingDiscussions(false);
        setLoadingCelebrations(false);
        setLoadingTasks(false);
        setLoadingRequests(false);
      }
    } catch (err: any) {
      console.error("Dashboard init error:", err);
      setLoadingAttendance(false);
      setLoadingCalendar(false);
      setLoadingForum(false);
      setLoadingDiscussions(false);
      setLoadingCelebrations(false);
      setLoadingTasks(false);
      setLoadingWhosOut(false);
      setLoadingRequests(false);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAttendanceStats(userId: string) {
    const now = new Date();
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const monthStart = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    const { data } = await supabase
      .from("attendance")
      .select("status")
      .eq("user_id", userId)
      .gte("date", monthStart)
      .lte("date", monthEnd);

    const records = data || [];
    setAttendanceStats({
      present: records.filter((r) => r.status === "present" || r.status === "half_day").length,
      late: records.filter((r) => r.status === "late").length,
      absent: records.filter((r) => r.status === "absent").length,
    });
  }

  async function loadWhosOutData(
    compId: string,
    todayDateStr: string,
    holidaysList: any[] = [],
    companyOffDays: number[] = [0, 6],
    currentUserId?: string | null,
  ) {
    if (isWhosOutFetchingRef.current) return;
    isWhosOutFetchingRef.current = true;

    // Only display skeleton on the very first initial load, never on subsequent fetches
    if (!hasWhosOutLoadedOnceRef.current) {
      setLoadingWhosOut(true);
    }
    try {
      const currentUid = currentUserId || myUserId;
      const todayDate = new Date(todayDateStr + "T00:00:00");
      const tomorrowDate = new Date(todayDate);
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

      // Current week bounds: Monday to Sunday of current week
      const dayOfWeek = todayDate.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(todayDate);
      monday.setDate(todayDate.getDate() + mondayOffset);
      const weekStartStr = monday.toISOString().slice(0, 10);

      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const weekEndStr = sunday.toISOString().slice(0, 10);

      const [profilesRes, approvalsRes, attendanceRes, myMembershipsRes, myLedTeamsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, name, role, job_title, department, profile_photo")
          .eq("company_id", compId),
        supabase
          .from("approvals")
          .select("id, employee_id, type, title, details, reason, start_date, end_date")
          .eq("company_id", compId)
          .eq("status", "Approved")
          .in("type", ["Leave", "WFH"])
          .lte("start_date", weekEndStr)
          .gte("end_date", todayDateStr),
        supabase
          .from("attendance")
          .select("user_id, clock_in, clock_out, status")
          .eq("company_id", compId)
          .eq("date", todayDateStr),
        currentUid
          ? supabase.from("team_members").select("team_id").eq("user_id", currentUid)
          : Promise.resolve({ data: [] as any }),
        currentUid
          ? supabase
            .from("teams")
            .select("id")
            .eq("company_id", compId)
            .or(`lead_id.eq.${currentUid},created_by.eq.${currentUid}`)
          : Promise.resolve({ data: [] as any }),
      ]);

      // Resolve teammates for team filtering
      try {
        const userTeamIds = Array.from(
          new Set([
            ...((myMembershipsRes.data as any[]) || []).map((m: any) => m.team_id).filter(Boolean),
            ...((myLedTeamsRes.data as any[]) || []).map((t: any) => t.id).filter(Boolean),
          ]),
        );

        if (userTeamIds.length > 0) {
          const [membersRes, teamsRes] = await Promise.all([
            supabase.from("team_members").select("user_id").in("team_id", userTeamIds),
            supabase.from("teams").select("lead_id").in("id", userTeamIds),
          ]);
          const teammateIds = new Set<string>();
          if (currentUid) teammateIds.add(currentUid);
          membersRes.data?.forEach((m: any) => {
            if (m.user_id) teammateIds.add(m.user_id);
          });
          teamsRes.data?.forEach((t: any) => {
            if (t.lead_id) teammateIds.add(t.lead_id);
          });
          setMyTeammateUserIds(Array.from(teammateIds));
        } else {
          setMyTeammateUserIds(currentUid ? [currentUid] : []);
        }
      } catch (teamErr) {
        console.warn("Could not determine team members for Who's Out:", teamErr);
      }

      const employees = profilesRes.data || [];
      const approvals = approvalsRes.data || [];
      const attendanceToday = attendanceRes.data || [];

      const empMap = new Map<string, any>();
      employees.forEach((e) => empMap.set(e.id, e));

      const clockedInUserIds = new Set<string>();
      attendanceToday.forEach((att) => {
        if (att.clock_in) {
          clockedInUserIds.add(att.user_id);
        }
      });

      const todayDayOfWeek = todayDate.getDay();
      const isTodayOffDay = companyOffDays.includes(todayDayOfWeek);
      const isTodayHoliday = holidaysList.some((h) => h.date === todayDateStr);
      const isWorkingDayToday = !isTodayOffDay && !isTodayHoliday;

      const items: OutEmployee[] = [];
      const employeesAccountedForToday = new Set<string>();

      // 1. TODAY: Approved leaves & WFH
      approvals.forEach((app) => {
        const startDate = app.start_date;
        const endDate = app.end_date || app.start_date;
        if (startDate <= todayDateStr && endDate >= todayDateStr) {
          const emp = empMap.get(app.employee_id);
          if (emp) {
            employeesAccountedForToday.add(emp.id);
            const isWfh = app.type === "WFH";
            items.push({
              id: `today-${app.id}`,
              userId: emp.id,
              name: emp.name || "Employee",
              role: emp.job_title || emp.role || "Team Member",
              department: emp.department || "General",
              avatarUrl: sanitizeProfilePhoto(emp.profile_photo) || null,
              statusType: isWfh ? "wfh" : "leave",
              statusLabel: isWfh ? "Work From Home" : (app.title || "On Leave"),
              detail: app.details || app.reason || (isWfh ? "Approved remote work shift" : "Approved leave"),
              dateScope: "today",
            });
          }
        }
      });

      // 1b. TODAY: Unclocked employees (only during working days)
      if (isWorkingDayToday) {
        employees.forEach((emp) => {
          if (!employeesAccountedForToday.has(emp.id) && !clockedInUserIds.has(emp.id)) {
            items.push({
              id: `today-unclocked-${emp.id}`,
              userId: emp.id,
              name: emp.name || "Employee",
              role: emp.job_title || emp.role || "Team Member",
              department: emp.department || "General",
              avatarUrl: sanitizeProfilePhoto(emp.profile_photo) || null,
              statusType: "unclocked",
              statusLabel: "Not Clocked In",
              detail: "",
              dateScope: "today",
            });
          }
        });
      }

      // 2. TOMORROW: Approved leaves & WFH
      approvals.forEach((app) => {
        const startDate = app.start_date;
        const endDate = app.end_date || app.start_date;
        if (startDate <= tomorrowStr && endDate >= tomorrowStr) {
          const emp = empMap.get(app.employee_id);
          if (emp) {
            const isWfh = app.type === "WFH";
            items.push({
              id: `tomorrow-${app.id}`,
              userId: emp.id,
              name: emp.name || "Employee",
              role: emp.job_title || emp.role || "Team Member",
              department: emp.department || "General",
              avatarUrl: sanitizeProfilePhoto(emp.profile_photo) || null,
              statusType: isWfh ? "wfh" : "leave",
              statusLabel: isWfh ? "Work From Home" : (app.title || "Scheduled Leave"),
              detail: app.details || app.reason || (isWfh ? "Approved remote shift" : "Approved leave"),
              dateScope: "tomorrow",
            });
          }
        }
      });

      // 3. THIS WEEK: Approved leaves & WFH
      approvals.forEach((app) => {
        const startDate = app.start_date;
        const endDate = app.end_date || app.start_date;
        if (startDate <= weekEndStr && endDate >= todayDateStr) {
          const emp = empMap.get(app.employee_id);
          if (emp) {
            const isWfh = app.type === "WFH";
            const dateRangeLabel =
              startDate === endDate
                ? new Date(startDate + "T00:00:00").toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })
                : `${new Date(startDate + "T00:00:00").toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })} - ${new Date(endDate + "T00:00:00").toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}`;
            items.push({
              id: `thisWeek-${app.id}`,
              userId: emp.id,
              name: emp.name || "Employee",
              role: emp.job_title || emp.role || "Team Member",
              department: emp.department || "General",
              avatarUrl: sanitizeProfilePhoto(emp.profile_photo) || null,
              statusType: isWfh ? "wfh" : "leave",
              statusLabel: isWfh ? "Work From Home" : (app.title || "Scheduled Leave"),
              detail: `${dateRangeLabel} • ${app.details || app.reason || (isWfh ? "Approved remote shift" : "Approved leave")}`,
              dateScope: "thisWeek",
            });
          }
        }
      });

      setWhosOutItems(items);
      hasWhosOutLoadedOnceRef.current = true;
    } catch (err) {
      console.error("Error loading Who's Out data:", err);
    } finally {
      isWhosOutFetchingRef.current = false;
      setLoadingWhosOut(false);
    }
  }

  async function loadMyRequestsData(
    compId: string,
    currentUserId: string,
    userRole: string,
  ) {
    if (isRequestsFetchingRef.current) return;
    isRequestsFetchingRef.current = true;

    // Only show skeleton on the very first load, never on background re-fetches
    if (!hasRequestsLoadedOnceRef.current) {
      setLoadingRequests(true);
    }

    try {
      // Helper: relative time label
      const relativeTime = (isoStr: string): string => {
        const diff = Date.now() - new Date(isoStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "just now";
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days === 1) return "yesterday";
        if (days < 7) return `${days} days ago`;
        return new Date(isoStr).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      };

      // Helper: human-readable detail for a request row
      const buildDetail = (r: any): string => {
        if (r.type === "Leave" || r.type === "WFH") {
          if (r.start_date && r.end_date && r.start_date !== r.end_date) {
            const fmt = (d: string) =>
              new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
            return `${fmt(r.start_date)} – ${fmt(r.end_date)}`;
          }
          if (r.start_date) {
            return new Date(r.start_date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "short", month: "short", day: "numeric",
            });
          }
        }
        if (r.amount) {
          const amtStr = formatApprovalAmount(r.amount);
          if (amtStr) {
            return `${amtStr}${r.details ? ` • ${r.details}` : ""}`;
          }
        }
        return r.details || r.reason || r.title || "";
      };

      const isAdminOrHr = userRole === "admin" || userRole === "hr";

      // 1. Own submissions
      const { data: ownRows } = await supabase
        .from("approvals")
        .select(
          "id, type, title, details, amount, status, reason, start_date, end_date, created_at, approver_id",
        )
        .eq("company_id", compId)
        .eq("employee_id", currentUserId)
        .order("created_at", { ascending: false })
        .limit(20);

      // Resolve approver names for own rows
      const approverIds = [...new Set((ownRows || []).map((r: any) => r.approver_id).filter(Boolean))];
      let approverNameMap: Record<string, string> = {};
      if (approverIds.length > 0) {
        const { data: approverProfiles } = await supabase
          .from("profiles")
          .select("id, name, job_title, role")
          .in("id", approverIds);
        (approverProfiles || []).forEach((p: any) => {
          approverNameMap[p.id] = p.name || "Manager";
        });
      }

      // 2. Incoming requests — explicitly assigned to this user OR (for admin/hr) unassigned requests
      let incomingRows: any[] = [];
      if (isAdminOrHr) {
        // Admin/HR: their own assigned requests + requests with no designated approver
        const [assignedRes, unassignedRes] = await Promise.all([
          supabase
            .from("approvals")
            .select(
              "id, type, title, details, amount, status, reason, start_date, end_date, created_at, employee_id, profiles!employee_id(name, job_title, role, profile_photo)",
            )
            .eq("company_id", compId)
            .eq("approver_id", currentUserId)
            .eq("status", "Pending")
            .neq("employee_id", currentUserId)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("approvals")
            .select(
              "id, type, title, details, amount, status, reason, start_date, end_date, created_at, employee_id, profiles!employee_id(name, job_title, role, profile_photo)",
            )
            .eq("company_id", compId)
            .is("approver_id", null)
            .eq("status", "Pending")
            .neq("employee_id", currentUserId)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);
        const seen = new Set<string>();
        for (const row of [...(assignedRes.data || []), ...(unassignedRes.data || [])]) {
          if (!seen.has(row.id)) { seen.add(row.id); incomingRows.push(row); }
        }
      } else {
        // Regular employee: only requests where they are the explicit approver
        const res = await supabase
          .from("approvals")
          .select(
            "id, type, title, details, amount, status, reason, start_date, end_date, created_at, employee_id, profiles!employee_id(name, job_title, role, profile_photo)",
          )
          .eq("company_id", compId)
          .eq("approver_id", currentUserId)
          .eq("status", "Pending")
          .neq("employee_id", currentUserId)
          .order("created_at", { ascending: false })
          .limit(20);
        incomingRows = res.data || [];
      }

      // Map own rows → DashboardRequestItem[]
      const myItems: import("../components/dashboard/MyRequestsWidget").DashboardRequestItem[] = (ownRows || []).map((r: any) => ({
        id: r.id,
        type: (r.type as import("../components/dashboard/MyRequestsWidget").RequestCategory) || "Leave",
        title: r.title || r.type || "Request",
        detail: buildDetail(r),
        approverName: r.approver_id ? (approverNameMap[r.approver_id] || "Manager") : "HR",
        submittedAt: relativeTime(r.created_at),
        status: (r.status as import("../components/dashboard/MyRequestsWidget").RequestStatus) || "Pending",
        direction: "mine" as const,
      }));

      // Map incoming rows → DashboardRequestItem[]
      const incomingItems: import("../components/dashboard/MyRequestsWidget").DashboardRequestItem[] = (incomingRows || []).map((r: any) => ({
        id: `inc-${r.id}`,
        type: (r.type as import("../components/dashboard/MyRequestsWidget").RequestCategory) || "Leave",
        title: `${r.title || r.type} — ${r.profiles?.name || "Employee"}`,
        detail: buildDetail(r),
        applicantName: r.profiles?.name || "Employee",
        applicantRole: r.profiles?.job_title || r.profiles?.role || "Team Member",
        applicantAvatar: r.profiles?.profile_photo ? r.profiles.profile_photo : null,
        submittedAt: relativeTime(r.created_at),
        status: (r.status as import("../components/dashboard/MyRequestsWidget").RequestStatus) || "Pending",
        direction: "incoming" as const,
      }));

      setRequestsItems([...myItems, ...incomingItems]);
      setCanUserApprove(isAdminOrHr || (incomingRows || []).length > 0);
      hasRequestsLoadedOnceRef.current = true;
    } catch (err) {
      console.error("Error loading Approvals & Requests data:", err);
    } finally {
      isRequestsFetchingRef.current = false;
      setLoadingRequests(false);
    }
  }

  function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Merge a freshly inserted message into the tree locally (no full refetch)
  const mergeNewDiscussion = (row: any) => {
    if (!row || !row.id) return;
    const isAnon = row.is_anonymous !== false;
    const authorEmp = companyEmployees.find((e) => e.id === row.author_id);
    const mentionUserName = companyEmployees.find((e) => e.id === row.mention_user_id)?.name;
    const isMe = !isAnon && (!row.author_id || row.author_id === myUserId);
    const authorAvatar = isAnon
      ? undefined
      : (authorEmp?.avatarUrl || (isMe ? (profileAvatarUrl || undefined) : undefined));
    const authorRole = isAnon
      ? "Employee"
      : (authorEmp?.role || (isMe && myRole ? myRole : "Employee"));
    const authorName = isAnon
      ? "Anonymous"
      : (authorEmp?.name || (isMe ? profileName : "") || "Team Member");

    const msg: DiscussionMessage = {
      id: row.id,
      companyId: row.company_id,
      authorId: isAnon ? "" : row.author_id,
      content: row.content,
      parentId: row.parent_id ?? null,
      mentionUserId: row.mention_user_id ?? null,
      mentionUserName,
      createdAt: row.created_at,
      isAnonymous: isAnon,
      author: {
        name: authorName,
        role: authorRole,
        avatarUrl: authorAvatar,
      },
      replies: [],
    };
    setDiscussions((prev) => {
      const exists = (list: DiscussionMessage[]): boolean =>
        list.some((m) => m.id === msg.id || exists(m.replies));
      if (exists(prev)) return prev;
      const next = prev.map((m) => ({ ...m, replies: [...m.replies] }));
      const attach = (list: DiscussionMessage[]): boolean => {
        for (const m of list) {
          if (m.id === msg.parentId) {
            m.replies.push(msg);
            return true;
          }
          if (attach(m.replies)) return true;
        }
        return false;
      };
      if (!attach(next)) {
        next.push(msg);
        next.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      }
      return next;
    });
    setLastAddedId(msg.id);

    // If transparent/open message and author was not in companyEmployees, fetch profile asynchronously
    if (!isAnon && !authorEmp && !isMe && row.author_id) {
      Promise.resolve(
        supabase
          .from("profiles")
          .select("id, name, role, profile_photo")
          .eq("id", row.author_id)
          .maybeSingle()
      )
        .then(({ data: authorProfile }) => {
          if (authorProfile) {
            const resolvedName = authorProfile.name || "Team Member";
            const resolvedAvatar = authorProfile.profile_photo || undefined;
            const resolvedRole = authorProfile.role || "Employee";
            setDiscussions((prev) => {
              const updateAuthor = (list: DiscussionMessage[]): DiscussionMessage[] => {
                return list.map((m) => {
                  if (m.id === row.id) {
                    return {
                      ...m,
                      author: {
                        name: resolvedName,
                        role: resolvedRole,
                        avatarUrl: resolvedAvatar,
                      },
                    };
                  }
                  return { ...m, replies: updateAuthor(m.replies) };
                });
              };
              return updateAuthor(prev);
            });
          }
        })
        .catch(() => { });
    }
  };

  // Load the user's real role from the DB profile (admin/hr moderation gates)
  React.useEffect(() => {
    let cancelled = false;

    if (typeof window !== "undefined") {
      try {
        const impersonated = sessionStorage.getItem("impersonated_company");
        if (impersonated) {
          setMyRole("admin");
          return;
        }
      } catch (e) { }
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled) setMyRole(data?.role ?? null);
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendDiscussion() {
    if (!replyText.trim() || !myCompanyId) return;
    setReplySending(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const row = await postDiscussion({
        companyId: myCompanyId,
        authorId: user.id,
        content: replyText.trim(),
        parentId: replyTarget ? replyTarget.id : null,
        mentionUserId,
        isAnonymous: chatMode === "anonymous",
      });
      if (row) {
        setReplyText("");
        setReplyTarget(null);
        setMentionUserId(null);
        mergeNewDiscussion(row);
      } else {
        showToast("Failed to send message.", "error");
      }
    } catch {
      showToast("Failed to send message.", "error");
    } finally {
      setReplySending(false);
    }
  }

  async function confirmDeleteDiscussion() {
    if (!deleteTarget || !myCompanyId) return;
    setDeleting(true);
    try {
      const ok = await deleteDiscussion(deleteTarget.id);
      if (ok) {
        showToast("Message deleted.", "success");
        setLastAddedId(null);
        const msgs = await getCompanyDiscussions(myCompanyId);
        setDiscussions(msgs);
      } else {
        showToast("Failed to delete. Verify HR/Admin permission.", "error");
      }
    } catch {
      showToast("Failed to delete message.", "error");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const currentRole = myRole;
  const canModerate = currentRole === "hr" || currentRole === "admin";

  // Live updates for the quick chat — merge the new row locally, no refetch
  React.useEffect(() => {
    if (!myCompanyId) return;
    let channel: { unsubscribe: () => void } | null = null;
    try {
      channel = supabase
        .channel(`dash-discussions-${myCompanyId}-${Math.random().toString(36).substring(2, 9)}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "company_discussions" },
          (payload: any) => {
            mergeNewDiscussion(payload?.new);
          },
        )
        .subscribe();
    } catch { }
    return () => {
      if (channel) supabase.removeChannel(channel as any);
    };
  }, [myCompanyId]);

  // Realtime subscription for company chat mode changes
  React.useEffect(() => {
    if (!myCompanyId) return;
    let modeChannel: { unsubscribe: () => void } | null = null;
    try {
      modeChannel = supabase
        .channel(`dash-chatmode-${myCompanyId}-${Math.random().toString(36).substring(2, 9)}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "companies", filter: `id=eq.${myCompanyId}` },
          (payload: any) => {
            if (payload?.new?.chat_mode) {
              setChatMode(payload.new.chat_mode);
            }
          },
        )
        .subscribe();
    } catch { }
    return () => {
      if (modeChannel) supabase.removeChannel(modeChannel as any);
    };
  }, [myCompanyId]);

  // Realtime subscription for approvals changes → re-fetch Approvals & Requests widget
  React.useEffect(() => {
    if (!myCompanyId || !myUserId) return;
    let approvalsChannel: { unsubscribe: () => void } | null = null;
    try {
      approvalsChannel = supabase
        .channel(`dash-approvals-${myCompanyId}-${Math.random().toString(36).substring(2, 9)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "approvals", filter: `company_id=eq.${myCompanyId}` },
          () => {
            const roleForRefetch =
              typeof window !== "undefined" && sessionStorage.getItem("impersonated_company")
                ? "admin"
                : (myRole ?? "employee");
            loadMyRequestsData(myCompanyId, myUserId, roleForRefetch);
          },
        )
        .subscribe();
    } catch { }
    return () => {
      if (approvalsChannel) supabase.removeChannel(approvalsChannel as any);
    };
  }, [myCompanyId, myUserId, myRole]);

  // Auto-scroll: instant to the bottom on first load, smooth to the new message after
  const flatDiscussions = React.useMemo(() => {
    const all: DiscussionMessage[] = [];
    const collect = (list: DiscussionMessage[]) => {
      list.forEach((m) => {
        all.push(m);
        collect(m.replies);
      });
    };
    collect(discussions);
    all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return all;
  }, [discussions]);

  const recentActivityTasks = React.useMemo(() => {
    return [...allTasks]
      .sort((a, b) => {
        const timeA = new Date(a.updatedAt || a.createdAt).getTime();
        const timeB = new Date(b.updatedAt || b.createdAt).getTime();
        return timeB - timeA;
      })
      .slice(0, 3);
  }, [allTasks]);

  React.useEffect(() => {
    if (isLoading) return;
    const raf = requestAnimationFrame(() => {
      if (threadRef.current) {
        if (firstScrollRef.current) {
          threadRef.current.scrollTop = threadRef.current.scrollHeight;
          firstScrollRef.current = false;
        } else {
          threadRef.current.scrollTo({
            top: threadRef.current.scrollHeight,
            behavior: "smooth",
          });
        }
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [flatDiscussions.length, isLoading, lastAddedId]);

  // Active "@mention" detection in the composer
  const atIdx = replyText.lastIndexOf("@");
  const activeMention =
    atIdx >= 0 && (atIdx >= replyText.lastIndexOf(" ") || replyText.slice(0, atIdx).trim() === "");
  const mentionQuery = activeMention
    ? (replyText.slice(atIdx + 1).split(" ")[0] || "").toLowerCase()
    : "";
  const mentionOptions =
    mentionQuery.length > 0
      ? companyEmployees.filter((e) => e.name.toLowerCase().includes(mentionQuery))
      : activeMention
        ? companyEmployees
        : [];

  function selectMention(emp: { id: string; name: string }) {
    const idx = replyText.lastIndexOf("@");
    const before = replyText.slice(0, idx);
    const after = replyText.slice(idx).replace(/^\S+/, "");
    setReplyText(`${before}@${emp.name} ${after}`);
    setMentionUserId(emp.id);
  }

  function isLate(): boolean {
    return calculateIsLate(new Date(), workStartTime, lateGraceMinutes).isLate;
  }

  async function handlePunch() {
    setActionLoading(true);
    if (officeLocations.length === 0) {
      showToast("No office locations configured. Setup a geofence in Settings.", "error");
      setActionLoading(false);
      return;
    }

    try {
      const { latitude, longitude } = await getCurrentCoordinates();

      // Find matched office within its geofence radius
      const matchedOffice = officeLocations.find((office) => {
        const dist = getDistanceMeters(latitude, longitude, office.latitude, office.longitude);
        return dist <= office.radius_meters;
      });

      if (!matchedOffice) {
        showToast("Geofence violation: You are not within any registered office radius.", "error");
        setActionLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated.");

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) {
        throw new Error("User profile is not linked to any company.");
      }

      const todayStr = new Date().toISOString().slice(0, 10);

      if (!todayRecord || !todayRecord.clock_in) {
        // Clock In
        const lateInfo = calculateIsLate(new Date(), workStartTime, lateGraceMinutes);
        const { data, error } = await supabase
          .from("attendance")
          .upsert(
            {
              user_id: user.id,
              company_id: profile.company_id,
              office_location_id: matchedOffice.id,
              date: todayStr,
              clock_in: new Date().toISOString(),
              latitude_in: latitude,
              longitude_in: longitude,
              status: lateInfo.isLate ? "late" : "present",
            },
            { onConflict: "user_id,date" },
          )
          .select()
          .single();

        if (error) throw error;
        setTodayRecord(data);
        showToast("Clocked in successfully!", "success");
        loadAttendanceStats(user.id);
        const compId = profile.company_id;
        if (compId) {
          loadWhosOutData(compId, todayStr, holidays, myOffDays, user.id);
        }
      } else {
        // Clock Out
        const now = new Date();
        const clockInTime = new Date(todayRecord.clock_in);
        const totalMinutes = Math.floor((now.getTime() - clockInTime.getTime()) / 60000);

        const { data, error } = await supabase
          .from("attendance")
          .update({
            clock_out: now.toISOString(),
            total_minutes: totalMinutes,
            latitude_out: latitude,
            longitude_out: longitude,
            status: totalMinutes < 240 ? "half_day" : todayRecord.status || "present",
          })
          .eq("user_id", user.id)
          .eq("date", todayStr)
          .select()
          .single();

        if (error) throw error;
        setTodayRecord(data);
        showToast("Clocked out successfully!", "success");
        loadAttendanceStats(user.id);
        const compId = profile.company_id;
        if (compId) {
          loadWhosOutData(compId, todayStr, holidays, myOffDays, user.id);
        }
      }
    } catch (err: any) {
      console.error("Dashboard GPS punch error:", err);
      if (err.message && err.message.toLowerCase().includes("denied")) {
        showToast("Location access denied. Please check location permissions.", "error");
      } else {
        showToast(err.message || "Failed to save attendance record.", "error");
      }
    } finally {
      setActionLoading(false);
    }
  }


  const dashboardRightSidebar = (
    <div
      id="dashboard-forum-card"
      className="hub-sidebar"
    >
      {/* Broadcast-only Header */}
      <div className="hub-sidebar-header">
        <div className="hub-sidebar-header-title">
          <Megaphone size={18} strokeWidth={1.75} />
          <span>Announcements</span>
        </div>
      </div>

      {/* Sidebar Content */}
      <div
        id="dashboard-discussions-card"
        className="hub-content"
      >
        <div className="hub-announcements-tab" style={{ flex: 1, overflowY: "auto" }}>
          {loadingForum ? (
            [1, 2, 3].map((idx) => (
              <div key={idx} className="hub-announcement-skeleton-card">
                <div className="hub-announcement-header">
                  <div
                    className="skeleton-shimmer skeleton-avatar"
                    style={{ width: "32px", height: "32px" }}
                  />
                  <div className="skeleton-text-group">
                    <div
                      className="skeleton-shimmer skeleton-line-title"
                      style={{ width: "45%" }}
                    />
                    <div
                      className="skeleton-shimmer skeleton-line-sub"
                      style={{ width: "30%" }}
                    />
                  </div>
                  <div className="skeleton-shimmer skeleton-pill-badge" />
                </div>
                <div
                  className="skeleton-shimmer skeleton-line-title"
                  style={{ width: "80%" }}
                />
                <div
                  className="skeleton-shimmer skeleton-line-sub"
                  style={{ width: "95%" }}
                />
              </div>
            ))
          ) : recentPosts.length > 0 ? (
            recentPosts.map((post) => {
              const isUnvotedActivePoll =
                post.postType === "poll" &&
                Boolean(post.poll) &&
                !post.poll?.userVotedOptionId &&
                !post.poll?.isExpired &&
                new Date(post.poll?.expiresAt || 0).getTime() > Date.now();

              return (
                <div
                  key={post.id}
                  className={`hub-announcement-card ${isUnvotedActivePoll ? "is-live-poll" : ""}`}
                >
                  <div className="hub-announcement-header">
                    {post.author.avatarUrl ? (
                      <img
                        src={post.author.avatarUrl}
                        alt={post.author.name}
                        className="hub-announcement-avatar"
                      />
                    ) : (
                      <div className="hub-announcement-avatar-initials">
                        {post.author.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="hub-announcement-author-details">
                      <p className="hub-announcement-author-name">
                        {post.author.name}
                      </p>
                      <p className="hub-announcement-meta">
                        {post.category} · {formatForumTime(post.createdAt)}
                      </p>
                    </div>

                    {isUnvotedActivePoll ? (
                      <span className="hub-announcement-chip hub-announcement-chip-live">
                        Live Poll
                      </span>
                    ) : (
                      <span className="hub-announcement-chip">
                        {post.category}
                      </span>
                    )}

                    {(canModerate ||
                      (Boolean(myUserId) && post.authorId === myUserId)) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteForumPostTarget({
                              id: post.id,
                              title: post.title,
                            });
                          }}
                          className="hub-announcement-delete-btn"
                          title="Delete post"
                        >
                          <DeleteIcon size={14} />
                        </button>
                      )}
                  </div>

                  <h4 className="hub-announcement-title">
                    {post.title}
                  </h4>

                  {post.content && (
                    <p className="hub-announcement-body">
                      {post.content}
                    </p>
                  )}

                  {/* Interactive Poll in Dashboard */}
                  {post.postType === "poll" &&
                    post.poll &&
                    (() => {
                      const poll = post.poll;
                      const hasVoted = Boolean(poll.userVotedOptionId);
                      const showResults = hasVoted || poll.isExpired;
                      const isSubmitting = Boolean(
                        isSubmittingPollVote[poll.id]
                      );

                      return (
                        <div className="hub-poll-container">
                          <div className="hub-poll-options">
                            {poll.options.map((option) => {
                              const isUserChoice =
                                poll.userVotedOptionId === option.id;

                              if (showResults) {
                                return (
                                  <div
                                    key={option.id}
                                    className={`hub-poll-option-result ${isUserChoice ? "is-user-choice" : ""}`}
                                  >
                                    <div
                                      className="hub-poll-progress-fill"
                                      style={{ width: `${option.percentage}%` }}
                                    />
                                    <div className="hub-poll-option-content">
                                      <div className="hub-poll-option-left">
                                        {isUserChoice && (
                                          <Check size={13} className="hub-poll-check-icon" />
                                        )}
                                        <span
                                          className={`hub-poll-option-text ${isUserChoice ? "is-choice" : ""}`}
                                        >
                                          {option.text}
                                        </span>
                                      </div>
                                      <span
                                        className={`hub-poll-option-percentage ${isUserChoice ? "is-choice" : ""}`}
                                      >
                                        {option.percentage}%
                                      </span>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={option.id}
                                  onClick={() => {
                                    if (!isSubmitting) {
                                      handleDashboardPollVote(
                                        poll.id,
                                        option.id
                                      );
                                    }
                                  }}
                                  className="hub-poll-option-vote"
                                >
                                  <div className="hub-poll-option-left">
                                    <div className="hub-poll-radio" />
                                    <span className="hub-poll-option-text">
                                      {option.text}
                                    </span>
                                  </div>
                                  <span className="hub-poll-vote-btn">
                                    Vote
                                  </span>
                                </div>
                              );
                            })}
                          </div>

                          <div className="hub-poll-footer">
                            <span>
                              {poll.totalVotes}{" "}
                              {poll.totalVotes === 1 ? "vote" : "votes"} ·{" "}
                              {poll.isExpired
                                ? "Closed"
                                : formatPollRemaining(poll.expiresAt)}
                            </span>
                            <span
                              onClick={() =>
                                navigate({
                                  to: "/internal-forum",
                                  search: { post: post.id },
                                })
                              }
                              className="hub-poll-link"
                            >
                              Open forum →
                            </span>
                          </div>
                        </div>
                      );
                    })()}

                  {/* Attachment Image Preview */}
                  {post.imageUrl && (
                    <div
                      className="hub-announcement-image-wrap"
                      onClick={() =>
                        navigate({
                          to: "/internal-forum",
                          search: { post: post.id },
                        })
                      }
                    >
                      <img
                        src={post.imageUrl}
                        alt={post.title || "Announcement attachment"}
                        className="hub-announcement-image"
                      />
                    </div>
                  )}

                  {post.postType !== "poll" && (
                    <button
                      type="button"
                      onClick={() =>
                        navigate({
                          to: "/internal-forum",
                          search: { post: post.id },
                        })
                      }
                      className="hub-announcement-forum-btn"
                    >
                      <PostAdd size={14} />
                      <span>Open in Corporate Forum →</span>
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="hub-empty-state">
              <p>
                No announcements published yet.
              </p>
              <button
                type="button"
                onClick={() => navigate({ to: "/internal-forum" })}
                className="hub-announcement-forum-btn"
              >
                Visit Forum
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Tooltip.Provider delayDuration={200}>
      <Layout activeTab="Dashboard" rightSidebar={dashboardRightSidebar}>
        {/* Tour Start Confirmation Dialog */}
        <Dialog.Root open={tourDialogOpen} onOpenChange={setTourDialogOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="modal-overlay" />
            <Dialog.Content className="modal-content">
              <div className="modal-header">
                <Dialog.Title className="modal-title">
                  ✨ Start Product Tour?
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className="modal-close-btn" aria-label="Close">
                    <Close size={16} />
                  </button>
                </Dialog.Close>
              </div>
              <p className="modal-desc">
                Let's walk through the Employee Dashboard widgets and features.
                Select your preferred tour language below:
              </p>

              <div className="tour-modal-select-wrap">
                <label className="tour-modal-label">
                  Select Narrator Language
                </label>
                <select
                  className="tour-modal-select"
                  value={tourLanguage}
                  onChange={(e) => setTourLanguage(e.target.value as any)}
                >
                  <option value="hi">Hindi (हिंदी)</option>
                  <option value="mr">Marathi (मराठी)</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setTourDialogOpen(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTourDialogOpen(false);
                    setTimeout(startTour, 250);
                  }}
                  className="btn btn-primary"
                >
                  Start Tour
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {isOnline === false ? (
          <div >
            <OfflineScreen
              onRetry={() => {
                checkRealConnectivity().then((connected) => {
                  if (connected) {
                    setIsOnline(true);
                    loadDashboardAndAttendance();
                  } else {
                    setIsOnline(false);
                  }
                });
              }}
            />
          </div>
        ) : isMobile ? (
          /* Mobile Layout */
          <div>
            {/* Attendance Mobile Card */}
            <div >
              <div >
                <div >
                  <People />
                  <span>Attendance</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/attendance" })}

                >
                  View
                </button>
              </div>

              <div >
                <div >
                  <div >
                    {attendanceStats.present}
                  </div>
                  <div >
                    Present
                  </div>
                </div>
                <div >
                  <div >
                    {attendanceStats.absent}
                  </div>
                  <div >
                    Absent
                  </div>
                </div>
                <div >
                  <div >
                    {attendanceStats.late}
                  </div>
                  <div >
                    Late
                  </div>
                </div>
              </div>

              <div >
                <button
                  type="button"
                  disabled={
                    actionLoading ||
                    (!!todayRecord?.clock_in && !!todayRecord?.clock_out)
                  }
                  onClick={handlePunch}
                  className={cn(
                    "dashboard-btn-clock",
                    todayRecord?.clock_in && !todayRecord?.clock_out && "dashboard-btn-clock-out",
                    todayRecord?.clock_in && todayRecord?.clock_out && "dashboard-btn-clocked-out"
                  )}
                >
                  {actionLoading ? (
                    <Loader2 />
                  ) : (
                    <AccessTime />
                  )}
                  <span>
                    {actionLoading
                      ? "Verifying GPS..."
                      : !todayRecord?.clock_in
                        ? "Clock In"
                        : !todayRecord?.clock_out
                          ? "Clock Out"
                          : "Clocked Out"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isTourActive) return;
                    navigate({ to: "/attendance" });
                  }}
                  disabled={isTourActive}

                >
                  <History />
                  <span>History</span>
                </button>
              </div>
            </div>

            {/* Tasks Mobile Card */}
            <div >
              <div >
                <div >
                  <BarChart />
                  <span>Tasks</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/tasks" })}

                >
                  View All
                </button>
              </div>

              <div >
                <div >
                  <div >
                    {allTasks.length}
                  </div>
                  <div >
                    Total
                  </div>
                </div>
                <div >
                  <div >
                    {allTasks.filter((t) => t.status === "In Progress").length}
                  </div>
                  <div >
                    In Progress
                  </div>
                </div>
                <div >
                  <div >
                    {
                      allTasks.filter(
                        (t) =>
                          t.status === "Pending" || t.status === "Not Started"
                      ).length
                    }
                  </div>
                  <div >
                    Pending
                  </div>
                </div>
              </div>

              {recentActivityTasks.length > 0 && (
                <div >
                  <div >
                    Recent Activity
                  </div>
                  {recentActivityTasks.slice(0, 3).map((task) => (
                    <TaskActivityItem
                      key={task.id}
                      task={task}
                      currentUserId={myUserId}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Celebrations Mobile Card */}
            <div >
              <div >
                <Celebration />
                <span>Celebrations</span>
              </div>
              {upcomingBirthdays.length > 0 ? (
                <div >
                  {upcomingBirthdays.map((b) => (
                    <div
                      key={b.id}

                    >
                      <div >
                        {b.profilePhoto ? (
                          <img
                            src={b.profilePhoto}
                            alt={b.name}

                          />
                        ) : (
                          <div >
                            {getEventInitials(b.name)}
                          </div>
                        )}
                        <div >
                          <p >
                            {b.name}
                          </p>
                          <p >
                            {b.type === "birthday"
                              ? "Birthday"
                              : b.years && b.years > 0
                                ? `${b.years} Year${b.years === 1 ? "" : "s"} Work Anniversary`
                                : "Work Anniversary"}
                          </p>
                        </div>
                      </div>
                      <span >
                        {b.days === 0
                          ? "Today"
                          : b.days === 1
                            ? "Tomorrow"
                            : `${b.days} days`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <BirthdayEmptyState compact />
              )}
            </div>

            {/* Calendar Widget Mobile */}
            <HolidayCalendar
              id="mobile-dashboard-calendar-card"
              holidays={holidays}
              onLeaveToday={onLeaveToday}
              title="Calendar"
              offDays={myOffDays}
            />

            {/* Who's Out Widget Mobile */}
            <WhosOutWidget
              id="mobile-dashboard-whos-out-card"
              items={whosOutItems}
              loading={loadingWhosOut}
              teammateUserIds={myTeammateUserIds}
            />

            {/* Approvals Widget Mobile */}
            <MyRequestsWidget
              id="mobile-dashboard-my-requests-card"
              items={requestsItems}
              loading={loadingRequests}
              canApprove={canUserApprove}
            />
          </div>
        ) : (
          /* Desktop Two-Column Grid */
          <div className="dashboard-main-layout">
            <div className="dashboard-two-col-grid">
              {/* Column 1: Attendance + Who's Out + Tasks Overview */}
              <div className="dashboard-column">
                {/* Attendance Card */}
                <div
                  id="dashboard-attendance-card"
                  className="dashboard-card"
                >
                  <SectionHeader
                    icon={<ClockFading />}
                    title="Attendance"
                  />

                  <div className="dashboard-stat-grid">
                    <AttendanceBox
                      value={
                        loadingAttendance ? (
                          <span className="skeleton-shimmer skeleton-stat-num" />
                        ) : (
                          String(attendanceStats.present)
                        )
                      }
                      label="Present"
                    />
                    <AttendanceBox
                      value={
                        loadingAttendance ? (
                          <span className="skeleton-shimmer skeleton-stat-num" />
                        ) : (
                          String(attendanceStats.absent)
                        )
                      }
                      label="Absent"
                    />
                    <AttendanceBox
                      value={
                        loadingAttendance ? (
                          <span className="skeleton-shimmer skeleton-stat-num" />
                        ) : (
                          String(attendanceStats.late)
                        )
                      }
                      label="Late"
                    />
                  </div>

                  <div className="dashboard-btn-row">
                    <button
                      type="button"
                      onClick={handlePunch}
                      disabled={
                        actionLoading ||
                        loadingAttendance ||
                        (!!todayRecord?.clock_in && !!todayRecord?.clock_out)
                      }
                      className={cn(
                        "dashboard-btn-clock",
                        todayRecord?.clock_in && !todayRecord?.clock_out && "dashboard-btn-clock-out",
                        todayRecord?.clock_in && todayRecord?.clock_out && "dashboard-btn-clocked-out"
                      )}
                    >
                      {actionLoading ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <AccessTime size={16} />
                      )}
                      <span>
                        {actionLoading
                          ? "Verifying GPS..."
                          : loadingAttendance
                            ? "Clock In"
                            : !todayRecord?.clock_in
                              ? "Clock In"
                              : !todayRecord?.clock_out
                                ? "Clock Out"
                                : "Clocked Out"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (isTourActive) return;
                        navigate({ to: "/attendance" });
                      }}
                      disabled={isTourActive}
                      className="dashboard-btn-secondary"
                    >
                      <History size={16} />
                      <span>History</span>
                    </button>
                  </div>
                </div>

                {/* Who's Out Widget */}
                <WhosOutWidget
                  id="dashboard-whos-out-card"
                  items={whosOutItems}
                  loading={loadingWhosOut}
                  teammateUserIds={myTeammateUserIds}
                />

                {/* Tasks Overview Card */}
                <div
                  id="dashboard-overview-card"
                  className="dashboard-card"
                >
                  <SectionHeader
                    icon={<ClipboardCheck />}
                    title="Tasks Overview"
                    action="View All"
                    onActionClick={() => navigate({ to: "/tasks" })}
                  />

                  <div className="dashboard-stat-grid">
                    <OverviewBox
                      value={
                        loadingTasks ? (
                          <span className="skeleton-shimmer skeleton-stat-num" />
                        ) : (
                          String(allTasks.length)
                        )
                      }
                      label="Total"
                    />
                    <OverviewBox
                      value={
                        loadingTasks ? (
                          <span className="skeleton-shimmer skeleton-stat-num" />
                        ) : (
                          String(
                            allTasks.filter((t) => t.status === "In Progress")
                              .length
                          )
                        )
                      }
                      label="In Progress"
                    />
                    <OverviewBox
                      value={
                        loadingTasks ? (
                          <span className="skeleton-shimmer skeleton-stat-num" />
                        ) : (
                          String(
                            allTasks.filter(
                              (t) =>
                                t.status === "Pending" ||
                                t.status === "Not Started"
                            ).length
                          )
                        )
                      }
                      label="Pending"
                    />
                  </div>

                  {/* Recent Activity Section */}
                  <div className="dashboard-sub-header">
                    <div className="dashboard-sub-title">
                      <span className="dashboard-sub-dot" />
                      <span>Recent Activity</span>
                      {!loadingTasks && recentActivityTasks.length > 0 && (
                        <span>({allTasks.length})</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => navigate({ to: "/tasks" })}
                      className="dashboard-btn-new-task"
                    >
                      + New Task
                    </button>
                  </div>

                  <div className="dashboard-task-activity-list">
                    {loadingTasks ? (
                      [1, 2, 3].map((idx) => (
                        <div key={idx} className="dashboard-skeleton-row">
                          <div className="skeleton-text-group">
                            <div
                              className="skeleton-shimmer skeleton-line-title"
                              style={{ width: "70%" }}
                            />
                            <div
                              className="skeleton-shimmer skeleton-line-sub"
                              style={{ width: "40%" }}
                            />
                          </div>
                          <div className="skeleton-shimmer skeleton-pill-badge" />
                        </div>
                      ))
                    ) : recentActivityTasks.length > 0 ? (
                      recentActivityTasks.slice(0, 3).map((t) => (
                        <TaskActivityItem
                          key={t.id}
                          task={t}
                          currentUserId={myUserId}
                        />
                      ))
                    ) : (
                      <div className="dashboard-empty-activity">
                        No recent task activity
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Column 2: Celebrations + Calendar + Approvals & Requests */}
              <div className="dashboard-column">
                {/* Celebrations Card */}
                <div
                  id="dashboard-birthdays-card"
                  className="dashboard-card"
                >
                  <SectionHeader
                    icon={<Celebration />}
                    title="Celebrations"
                  />
                  <div className="dashboard-celebration-list">
                    {loadingCelebrations ? (
                      [1, 2, 3].map((idx) => (
                        <div key={idx} className="dashboard-skeleton-row">
                          <div className="skeleton-shimmer skeleton-avatar" />
                          <div className="skeleton-text-group">
                            <div className="skeleton-shimmer skeleton-line-title" />
                            <div className="skeleton-shimmer skeleton-line-sub" />
                          </div>
                          <div className="skeleton-shimmer skeleton-pill-badge" />
                        </div>
                      ))
                    ) : upcomingBirthdays.length > 0 ? (
                      upcomingBirthdays.map((b) => (
                        <EventItem
                          key={b.id}
                          name={b.name}
                          type={b.type}
                          years={b.years}
                          date={
                            b.days === 0
                              ? "Today"
                              : b.days === 1
                                ? "Tomorrow"
                                : b.next.toLocaleDateString(undefined, {
                                  day: "numeric",
                                  month: "short",
                                })
                          }
                          avatarUrl={b.profilePhoto || undefined}
                          isToday={b.days === 0}
                        />
                      ))
                    ) : (
                      <BirthdayEmptyState />
                    )}
                  </div>
                </div>

                {/* Holiday Calendar */}
                <HolidayCalendar
                  id="dashboard-calendar-card"
                  holidays={holidays}
                  onLeaveToday={onLeaveToday}
                  title="Calendar"
                  offDays={myOffDays}
                  loading={loadingCalendar}
                />

                {/* Approvals & Requests Widget */}
                <MyRequestsWidget
                  id="dashboard-my-requests-card"
                  items={requestsItems}
                  loading={loadingRequests}
                  canApprove={canUserApprove}
                />
              </div>
            </div>
          </div>
        )}

        {/* Delete Forum Post Dialog */}
        <Dialog.Root
          open={Boolean(deleteForumPostTarget)}
          onOpenChange={(val) =>
            !val && !isDeletingForumPost && setDeleteForumPostTarget(null)
          }
        >
          <Dialog.Portal>
            <Dialog.Overlay className="modal-overlay" />
            <Dialog.Content className="modal-content modal-content--confirm">
              <div className="modal-header">
                <Dialog.Title className="modal-title">
                  Delete Post?
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className="modal-close-btn" aria-label="Close">
                    <Close size={16} />
                  </button>
                </Dialog.Close>
              </div>
              <p className="modal-desc">
                Are you sure you want to delete{" "}
                <strong>
                  "{deleteForumPostTarget?.title}"
                </strong>
                ? This will permanently remove the post and all its comments.
                This action cannot be undone.
              </p>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setDeleteForumPostTarget(null)}
                  disabled={isDeletingForumPost}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteForumPost}
                  disabled={isDeletingForumPost}
                  className="btn btn-danger"
                >
                  {isDeletingForumPost ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <DeleteIcon size={14} />
                  )}
                  <span>Delete Post</span>
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </Layout>
    </Tooltip.Provider>
  );
}

// ── Helper Subcomponents ────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  action,
  onActionClick,
  mb = 3,
}: {
  icon: React.ReactNode;
  title: string;
  action?: string;
  onActionClick?: () => void;
  mb?: number;
}) {
  return (
    <div className="dashboard-card-header">
      <div className="dashboard-card-title-wrap">
        {React.isValidElement(icon)
          ? React.cloneElement(icon as React.ReactElement<any>, {
            className: "dashboard-card-title-icon",
            size: 18,
          })
          : icon}
        <h3 className="dashboard-card-title">{title}</h3>
      </div>
      {action && (
        <button
          type="button"
          onClick={onActionClick}
          className="dashboard-card-action-btn"
        >
          {action}
        </button>
      )}
    </div>
  );
}

function MessageRow({
  msg,
  onReply,
  canDelete = false,
  onDelete,
}: {
  msg: DiscussionMessage;
  onReply: (m: DiscussionMessage) => void;
  canDelete?: boolean;
  onDelete?: ((m: DiscussionMessage) => void) | undefined;
}) {
  const isReply = !!msg.parentId;

  const renderContent = (m: DiscussionMessage) => {
    const name = m.mentionUserName;
    if (!name || !m.content.includes(`@${name}`)) return m.content;
    const parts = m.content.split(`@${name}`);
    return parts.map((part, i) => (
      <React.Fragment key={i}>
        {i > 0 && (
          <span className="hub-mention-text">@{name}</span>
        )}
        {part}
      </React.Fragment>
    ));
  };

  const formattedTime = (() => {
    const d = new Date(msg.createdAt);
    const diffMins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  })();

  return (
    <div
      id={`discmsg-${msg.id}`}
      className={`hub-message-item ${isReply ? "is-reply" : "is-root"}`}
    >
      {isReply && msg.isAnonymous ? (
        <div className="hub-message-dash">
          —
        </div>
      ) : msg.isAnonymous ? (
        <div className="hub-message-avatar hub-message-avatar-anon">
          <img
            src="/anonymous-stroke-rounded.svg"
            alt="Anonymous"
          />
        </div>
      ) : msg.author.avatarUrl ? (
        <div className="hub-message-avatar">
          <img
            src={msg.author.avatarUrl}
            alt={msg.author.name}
          />
        </div>
      ) : (
        <div className="hub-message-avatar">
          {(msg.author.name || "U").slice(0, 2).toUpperCase()}
        </div>
      )}

      <div className="hub-message-body">
        {!msg.isAnonymous && (
          <div className="hub-message-header">
            <span className="hub-message-author">
              {msg.author.name}
            </span>
            <span className="hub-message-time">
              • {formattedTime}
            </span>
          </div>
        )}
        <p className="hub-message-text">
          {renderContent(msg)}
        </p>
      </div>

      <div className="hub-message-actions">
        <button
          type="button"
          onClick={() => onReply(msg)}
          className="hub-message-btn"
          title="Reply"
        >
          <ReplyIcon size={13} />
        </button>
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(msg)}
            className="hub-message-btn hub-message-btn-delete"
            title="Delete (HR/Admin)"
          >
            <DeleteIcon size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function MessageThread({
  msg,
  onReply,
  canDelete = false,
  onDelete,
}: {
  msg: DiscussionMessage;
  onReply: (m: DiscussionMessage) => void;
  canDelete?: boolean;
  onDelete?: ((m: DiscussionMessage) => void) | undefined;
}) {
  const isRoot = !msg.parentId;
  return (
    <div className={`hub-thread-node ${isRoot ? "is-root" : "is-reply"}`}>
      <MessageRow
        msg={msg}
        onReply={onReply}
        canDelete={canDelete}
        onDelete={onDelete}
      />
      {msg.replies.length > 0 && (
        <div className={`hub-thread-nested ${isRoot ? "hub-thread-nested-root" : "hub-thread-nested-sub"}`}>
          {msg.replies.map((r) => (
            <MessageThread
              key={r.id}
              msg={r}
              onReply={onReply}
              canDelete={canDelete}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AttendanceBox({
  value,
  label,
}: {
  value: React.ReactNode;
  label: string;
  color?: string;
  textColor?: string;
}) {
  return (
    <div className="dashboard-stat-card">
      <div className="dashboard-stat-card-value">
        {value}
      </div>
      <div className="dashboard-stat-card-label">
        {label}
      </div>
    </div>
  );
}

function OverviewBox({
  value,
  label,
}: {
  value: React.ReactNode;
  label: string;
  color?: string;
  textColor?: string;
}) {
  return (
    <div className="dashboard-stat-card">
      <div className="dashboard-stat-card-value">
        {value}
      </div>
      <div className="dashboard-stat-card-label">
        {label}
      </div>
    </div>
  );
}

function formatForumTime(timeStr: string): string {
  const date = new Date(timeStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDashboardDate(iso: string): string {
  if (!iso) return "No date";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatTurnaroundTime(
  createdAtStr?: string,
  completedAtStr?: string
): string {
  if (!createdAtStr) return "Done";
  const start = new Date(createdAtStr).getTime();
  const end = completedAtStr ? new Date(completedAtStr).getTime() : Date.now();
  const diffMs = Math.max(0, end - start);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    const remHours = diffHours % 24;
    return remHours > 0 ? `${diffDays}d ${remHours}h` : `${diffDays}d`;
  }
  if (diffHours > 0) {
    const remMins = diffMins % 60;
    return remMins > 0 ? `${diffHours}h ${remMins}m` : `${diffHours}h`;
  }
  return `${Math.max(1, diffMins)}m`;
}

function formatTaskElapsedTime(timeStr?: string): string {
  if (!timeStr) return "Just now";
  const start = new Date(timeStr).getTime();
  const diffMs = Math.max(0, Date.now() - start);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    const remHours = diffHours % 24;
    return remHours > 0 ? `${diffDays}d ${remHours}h` : `${diffDays}d`;
  }
  if (diffHours > 0) {
    const remMins = diffMins % 60;
    return remMins > 0 ? `${diffHours}h ${remMins}m` : `${diffHours}h`;
  }
  return `${Math.max(1, diffMins)}m`;
}

function TaskActivityItem({
  task,
  currentUserId,
}: {
  task: Task;
  currentUserId?: string | null;
}) {
  const navigate = useNavigate();
  const isCompleted = task.status === "Completed";

  const timeValue = isCompleted
    ? formatTurnaroundTime(task.createdAt, task.updatedAt)
    : `${formatTaskElapsedTime(task.createdAt)} ago`;

  let assignmentText = "";
  if (
    currentUserId &&
    task.assignedTo === currentUserId &&
    task.assignedBy !== currentUserId
  ) {
    assignmentText = `Assigned by ${task.assignerName && task.assignerName !== "Unknown User"
        ? task.assignerName
        : "Manager"
      }`;
  } else if (
    currentUserId &&
    task.assignedBy === currentUserId &&
    task.assignedTo !== currentUserId
  ) {
    assignmentText = `Assigned to ${task.assigneeName && task.assigneeName !== "Unknown User"
        ? task.assigneeName
        : "Assignee"
      }`;
  } else if (task.assigneeName && task.assigneeName !== "Unknown User") {
    assignmentText = `Assigned to ${task.assigneeName}`;
  } else if (task.assignerName && task.assignerName !== "Unknown User") {
    assignmentText = `Assigned by ${task.assignerName}`;
  } else {
    assignmentText = `Assigned to ${task.assigneeName || "Team"}`;
  }

  return (
    <div
      onClick={() =>
        task.id && navigate({ to: "/tasks", search: { task: task.id } })
      }
      className="dashboard-task-activity-row"
    >
      <div className="dashboard-task-activity-info">
        <span className="dashboard-task-activity-title">
          {task.title}
        </span>
        <span className="dashboard-task-activity-meta">
          {assignmentText}
        </span>
      </div>

      <span className="dashboard-task-activity-badge">
        <AccessTime size={14} />
        <span>{timeValue}</span>
      </span>
    </div>
  );
}

function TaskItem({
  title,
  date,
  status,
  taskId,
}: {
  title: string;
  date: string;
  status: string;
  taskId?: string;
}) {
  const navigate = useNavigate();
  const isUrgent = status === "Urgent";

  return (
    <div
      onClick={() =>
        taskId && navigate({ to: "/tasks", search: { task: taskId } })
      }

    >
      <div >
        <div
          className={`${isUrgent ? "" : ""}`}
        />
        <span >
          {title}
        </span>
      </div>
      <span >
        {date && date !== "No date" ? `by ${date}` : "No date"}
      </span>
    </div>
  );
}

function BirthdayEmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <div className="dashboard-celebration-container">
      <div className="dashboard-celebration-icon-circle">
        <Celebration size={20} />
      </div>
      <p className="dashboard-celebration-heading">
        No Celebrations coming up
      </p>
      <p className="dashboard-celebration-subtext">
        When teammates celebrate in the next 3 months, they'll show up here.
      </p>
    </div>
  );
}

function getEventInitials(name: string): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function EventItem({
  name,
  type,
  years,
  date,
  avatarUrl,
  isToday = false,
}: {
  name: string;
  type: "birthday" | "anniversary";
  years?: number;
  date: string;
  avatarUrl?: string | undefined;
  isToday?: boolean;
}) {
  const isBirthday = type === "birthday";

  return (
    <div className="dashboard-event-item">
      <div className="dashboard-event-left">
        <div className="dashboard-event-avatar-wrap">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="dashboard-event-avatar"
            />
          ) : (
            <div className="dashboard-event-avatar-initials">
              {getEventInitials(name)}
            </div>
          )}
          <span
            className={cn(
              "dashboard-event-type-badge",
              isBirthday
                ? "dashboard-event-type-badge-birthday"
                : "dashboard-event-type-badge-anniversary"
            )}
            title={isBirthday ? "Birthday" : "Work Anniversary"}
          >
            {isBirthday ? (
              <Cake size={13} strokeWidth={2.2} />
            ) : (
              <Award size={13} strokeWidth={2.2} />
            )}
          </span>
        </div>

        <div className="dashboard-event-details">
          <p className="dashboard-event-title">{name}</p>
          {isToday ? (
            <span className="dashboard-event-badge-today">
              <Celebration size={12} />
              <span>Celebrating today!</span>
            </span>
          ) : (
            <span className="dashboard-event-sub">
              {isBirthday
                ? "Birthday"
                : `${years ? `${years} Year${years === 1 ? "" : "s"} ` : ""}Work Anniversary`}
            </span>
          )}
        </div>
      </div>
      <span className="dashboard-event-date-pill">{date}</span>
    </div>
  );
}

function PerformerItem({
  name,
  role,
  score,
  avatar,
}: {
  name: string;
  role: string;
  score: string;
  avatar: string;
}) {
  return (
    <div >
      <div >
        <img
          src={avatar}
          alt={name}

        />
        <div>
          <p >{name}</p>
          <p >{role}</p>
        </div>
      </div>
      <span >
        {score}
      </span>
    </div>
  );
}
