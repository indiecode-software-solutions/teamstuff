import React from "react";
import { ChevronRight, Users, Loader2, Sparkles, Check, Activity, CheckCircle2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { getCompanyWork, updateMyStatus, type CompanyWorkItem } from "../lib/team-activity";

const initials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

// Global module-level cache to persist state across tab unmounts/re-mounts
let cachedItems: CompanyWorkItem[] = [];
let isCacheLoaded = false;
let isGreetingShownGlobally = false;

export default function TeamActivityHeader() {
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<CompanyWorkItem[]>(cachedItems);
  const [loading, setLoading] = React.useState(!isCacheLoaded);
  const [open, setOpen] = React.useState(false);
  const [statusText, setStatusText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [justUpdated, setJustUpdated] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "working" | "available">("all");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [userName, setUserName] = React.useState<string>("");
  const [showGreeting, setShowGreeting] = React.useState(() => {
    if (isGreetingShownGlobally) return false;
    isGreetingShownGlobally = true;
    return true;
  });
  const [greetingStep, setGreetingStep] = React.useState<0 | 1>(0);
  const myIdRef = React.useRef<string | null>(null);

  const refresh = React.useCallback(async (cid: string) => {
    const list = await getCompanyWork(cid);
    cachedItems = list;
    isCacheLoaded = true;
    setItems(list);
    setLoading(false);
  }, []);

  // Resolve own company id once, then load the feed
  React.useEffect(() => {
    let cancelled = false;

    if (typeof window !== "undefined") {
      try {
        const impersonated = sessionStorage.getItem("impersonated_company");
        if (impersonated) {
          const parsed = JSON.parse(impersonated);
          if (parsed?.id) {
            setCompanyId(parsed.id);
            refresh(parsed.id);
            return;
          }
        }
      } catch (e) { }
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      myIdRef.current = user.id;
      supabase
        .from("profiles")
        .select("company_id, name")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return;
          if (data?.name) {
            setUserName(data.name.trim().split(/\s+/)[0]);
          }
          if (data?.company_id) {
            setCompanyId(data.company_id);
            refresh(data.company_id);
          } else {
            setLoading(false);
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Live: refetch when anyone updates their profile status
  React.useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel(`team-activity-live-${companyId}-${Math.random().toString(36).substring(2, 9)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => refresh(companyId), 400);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [companyId, refresh]);

  // Active & Working: ONLY users who have given an explicit status update today
  const working = React.useMemo(() => items.filter((i) => Boolean(i.status)), [items]);
  const available = React.useMemo(() => items.filter((i) => !i.status), [items]);

  React.useEffect(() => {
    setActiveIndex(0);

    // Step 1 -> Step 2 transition: Switch to productive text at 2.8s
    const textTimer = setTimeout(() => {
      setGreetingStep(1);
    }, 2800);

    // Dismiss cinematic greeting completely after 6 seconds
    const greetingTimer = setTimeout(() => {
      setShowGreeting(false);
    }, 6000);

    if (working.length <= 1) {
      return () => {
        clearTimeout(textTimer);
        clearTimeout(greetingTimer);
      };
    }

    // Delay ticker cycle until greeting ends
    const t = setInterval(() => {
      setActiveIndex((i) => (i + 1) % working.length);
    }, 3000);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(greetingTimer);
      clearInterval(t);
    };
  }, [working.length]);

  const current = working.length > 0 ? working[Math.min(activeIndex, working.length - 1)] : null;

  async function submitStatus() {
    const text = statusText.trim();
    if (!text || sending) return;
    setSending(true);
    const ok = await updateMyStatus(text);
    setSending(false);
    if (ok) {
      setStatusText("");
      setJustUpdated(true);
      setTimeout(() => setJustUpdated(false), 1600);
      if (companyId) refresh(companyId);
    }
  }

  const filteredItems = React.useMemo(() => {
    if (filter === "working") return working;
    if (filter === "available") return available;
    return [...working, ...available];
  }, [filter, working, available]);

  return (
    <div
      id="team-activity-card"
      className="team-activity-card"
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        position: "absolute",
      }}
    >
      {/* Top Bar Trigger */}
      <div
        id="team-activity-trigger"
        onClick={() => setOpen(!open)}
        className={`team-activity-trigger ${open ? "is-open" : ""}`}
        style={{
          borderBottomLeftRadius: open ? 0 : undefined,
          borderBottomRightRadius: open ? 0 : undefined,
        }}
      >
        <div className="team-activity-trigger-inner">
          <div className="team-activity-icon">
            <Users size={16} />
          </div>

          <div className="team-activity-content">
            {loading ? (
              <div className="team-activity-skeleton-bar" style={{ width: "140px" }} />
            ) : showGreeting ? (
              <div
                key={`greeting-${greetingStep}`}
                className="team-activity-animated-text"
              >
                {greetingStep === 0 ? (
                  <span className="team-activity-greeting-title">
                    {(() => {
                      const hour = new Date().getHours();
                      const welcome = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
                      return userName ? `${welcome}, ${userName} ✨` : `${welcome} ✨`;
                    })()}
                  </span>
                ) : (
                  <span className="team-activity-greeting-sub">
                    {(() => {
                      const hour = new Date().getHours();
                      if (hour >= 5 && hour < 12) {
                        return "Let's make today count";
                      } else if (hour >= 12 && hour < 17) {
                        return "Hope you're having a productive day";
                      } else {
                        return "Time to wind down soon";
                      }
                    })()}
                  </span>
                )}
              </div>
            ) : current ? (
              <div
                key={`working-${activeIndex}-${current.id}`}
                className="team-activity-animated-text"
              >
                <p className="team-activity-status-text">
                  <span className="team-activity-status-bold">{current.name.split(" ")[0]}</span>
                  {" is working on "}
                  <span className="team-activity-status-bold">"{current.status}"</span>
                </p>
              </div>
            ) : (
              <div
                key="available"
                className="team-activity-animated-text"
              >
                <p className="team-activity-available-text">
                  All team members available ✨
                </p>
              </div>
            )}
          </div>

          <ChevronRight
            size={18}
            className={`team-activity-chevron ${open ? "is-open" : ""}`}
          />
        </div>
      </div>

      {/* Smooth Attached Collapsible Drawer */}
      <div
        id="team-activity-dropdown"
        className={`team-activity-accordion ${open ? "is-open" : ""}`}
      >
        <div className="team-activity-accordion-inner">
          <div className="team-activity-dropdown">
            {/* Status Composer Capsule */}
            <div className="team-activity-composer-capsule">
              <div className="team-activity-composer-icon">
                <Sparkles size={14} />
              </div>
              <input
                type="text"
                placeholder="Share what you're working on today..."
                value={statusText}
                onChange={(e) => setStatusText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitStatus();
                }}
                className="team-activity-composer-input"
              />
              <button
                type="button"
                onClick={submitStatus}
                disabled={sending || !statusText.trim()}
                className="team-activity-composer-btn"
              >
                {sending ? (
                  <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                ) : justUpdated ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                    <Check size={13} /> Updated
                  </span>
                ) : (
                  "Update"
                )}
              </button>
            </div>

            {/* Filter Tabs Bar */}
            <div className="team-activity-filter-bar">
              <div className="team-activity-tabs">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  className={`team-activity-tab ${filter === "all" ? "is-active" : ""}`}
                >
                  All
                  <span className="team-activity-tab-count">{items.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("working")}
                  className={`team-activity-tab ${filter === "working" ? "is-active" : ""}`}
                >
                  Working
                  <span className="team-activity-tab-count">{working.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFilter("available")}
                  className={`team-activity-tab ${filter === "available" ? "is-active" : ""}`}
                >
                  Available
                  <span className="team-activity-tab-count">{available.length}</span>
                </button>
              </div>
            </div>

            {/* Teammates List */}
            <div className="team-activity-cards-container">
              {loading ? (
                <div className="team-activity-cards-grid">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="team-activity-card-skeleton">
                      <div className="team-activity-skeleton-bar" style={{ width: "36px", height: "36px", borderRadius: "50%" }} />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div className="team-activity-skeleton-bar" style={{ width: "90px", height: "13px" }} />
                        <div className="team-activity-skeleton-bar" style={{ width: "140px", height: "11px" }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredItems.length > 0 ? (
                <div className="team-activity-cards-grid">
                  {filteredItems.map((item) => (
                    <ActivityCard key={item.id} item={item} me={myIdRef.current} />
                  ))}
                </div>
              ) : (
                <div className="team-activity-empty-state">
                  <Activity size={22} className="team-activity-empty-icon" />
                  <p className="team-activity-empty-title">
                    {filter === "working"
                      ? "No one is actively logging tasks right now"
                      : "No team members found"}
                  </p>
                  <p className="team-activity-empty-sub">
                    {filter === "working"
                      ? "Share an update above to let your team know what you're up to!"
                      : "Team members will show up here once registered."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityCard({ item, me }: { item: CompanyWorkItem; me: string | null }) {
  const isWorking = Boolean(item.status);

  let availableDesc = "Available · No active tasks";
  if (item.activeTaskCount > 0) {
    const taskNoun = item.activeTaskCount === 1 ? "1 task" : `${item.activeTaskCount} tasks`;
    if (item.oldestTaskDays >= 2) {
      availableDesc = `working on ${taskNoun} from past ${item.oldestTaskDays}d`;
    } else {
      availableDesc = `working on ${taskNoun}`;
    }
  }

  return (
    <div className={`team-activity-item-card ${isWorking ? "is-working" : ""}`}>
      <div className="team-activity-item-avatar-wrap">
        <div className={`team-activity-row-avatar ${me === item.id ? "is-me" : ""}`}>
          {item.profilePhoto ? (
            <img src={item.profilePhoto} alt={item.name} className="team-activity-row-avatar-img" />
          ) : (
            initials(item.name)
          )}
        </div>
        <span
          className={`team-activity-avatar-dot ${isWorking ? "is-online" : "is-idle"}`}
          title={isWorking ? "Working on a task" : "Available"}
        />
      </div>

      <div className="team-activity-item-body">
        <div className="team-activity-item-header">
          <span className="team-activity-item-name">{item.name}</span>
          {me === item.id && <span className="team-activity-badge-you">You</span>}
        </div>

        {isWorking ? (
          <div className="team-activity-status-pill-wrap">
            <span className="team-activity-status-pill" title={item.status || ""}>
              {item.status}
            </span>
            {item.activeTaskCount > 0 && (
              <span className="team-activity-item-task-badge">
                +{item.activeTaskCount}
              </span>
            )}
          </div>
        ) : (
          <p className="team-activity-item-available-text">
            {availableDesc}
          </p>
        )}
      </div>
    </div>
  );
}
