import React, { useState, useEffect, useRef, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import Layout from "../components/Layout";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  Search,
  Inbox,
  Send,
  MailOpen,
  Trash2,
  Archive,
  Reply,
  Forward,
  MoreVertical,
  Paperclip,
  SquarePen,
  X,
  Columns2,
  AlignJustify,
  ArrowLeft,
  RefreshCw,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Loader2,
  Mail as MailIcon,
} from "lucide-react";
import {
  MailConnection,
  MailSummary,
  MailMessage,
  FolderListResult,
  fetchConnections,
  getGoogleAuthUrl,
  connectHostinger,
  disconnectConnection,
  listMessages,
  getMessage,
  sendMessage,
  deleteMessage,
  fetchUnreadCount,
} from "../lib/mail";
import { SafeLockGuard } from "../components/SafeLockGuard";
import { SafeLockConfig, getSafeLockConfig } from "../lib/safelock";
import { supabase } from "../lib/supabase";

export const Route = createFileRoute("/mail")({
  component: MailPage,
});

const FOLDERS = [
  { key: "inbox", label: "Inbox", icon: <Inbox  /> },
  { key: "sent", label: "Sent", icon: <Send  /> },
  { key: "drafts", label: "Drafts", icon: <MailOpen  /> },
  { key: "trash", label: "Trash", icon: <Trash2  /> },
  { key: "archive", label: "Archive", icon: <Archive  /> },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMailDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

// ── Connect Form ──────────────────────────────────────────────

function ConnectForm({
  onHostingerConnect,
  connecting,
  error,
}: {
  onHostingerConnect: (email: string, password: string) => void;
  connecting: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleGoogle = async () => {
    try {
      const url = await getGoogleAuthUrl();
      window.location.href = url;
    } catch (e) {
      console.error("Failed to start Google flow:", e);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleGoogle}
        
      >
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path
            fill="#FFC107"
            d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
          />
          <path
            fill="#FF3D00"
            d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
          />
          <path
            fill="#1976D2"
            d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
          />
        </svg>
        <span>Continue with Google</span>
      </button>

      <div >
        <div >
          <div ></div>
        </div>
        <span >
          or
        </span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onHostingerConnect(email, password);
        }}
        
      >
        <div>
          <input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            
          />
        </div>
        <div>
          <input
            type="password"
            placeholder="Mailbox password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            
          />
          <p >
            Hostinger / IMAP mailbox credentials
          </p>
        </div>

        {error && (
          <p >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={connecting || !email || !password}
          
        >
          {connecting ? (
            <>
              <Loader2  />
              <span>Verifying…</span>
            </>
          ) : (
            "Connect mailbox"
          )}
        </button>
      </form>
    </div>
  );
}

function ConnectGate({
  onHostingerConnect,
  connecting,
  error,
}: {
  onHostingerConnect: (email: string, password: string) => void;
  connecting: boolean;
  error: string | null;
}) {
  return (
    <div >
      <div >
        <div >
          <Inbox  />
        </div>
        <h2 >
          Connect your mailbox
        </h2>
        <p >
          Link your work email to send and receive mail right here.
        </p>
        <ConnectForm
          onHostingerConnect={onHostingerConnect}
          connecting={connecting}
          error={error}
        />
      </div>
    </div>
  );
}

function ConnectDialog({
  open,
  onClose,
  onHostingerConnect,
  connecting,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onHostingerConnect: (email: string, password: string) => void;
  connecting: boolean;
  error: string | null;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(val) => !val && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-content">
          <div className="modal-header">
            <Dialog.Title className="modal-title">
              Add another mailbox
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="modal-close-btn" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          <ConnectForm
            onHostingerConnect={onHostingerConnect}
            connecting={connecting}
            error={error}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Main Page ────────────────────────────────────────────────

function MailPage() {
  const [viewMode, setViewMode] = useState<"split" | "normal">(() => {
    if (typeof window === "undefined") return "split";
    return localStorage.getItem("mail_view_mode") === "normal" ? "normal" : "split";
  });
  const [emailOpened, setEmailOpened] = useState(false);

  const handleViewModeChange = (mode: "split" | "normal") => {
    setViewMode(mode);
    localStorage.setItem("mail_view_mode", mode);
  };

  // Connections
  const [connections, setConnections] = useState<MailConnection[] | null>(null);
  const [activeConnId, setActiveConnId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectDialogOpen, setConnectDialogOpen] = useState(false);

  // Folder + list
  const [folder, setFolder] = useState("inbox");
  const [page, setPage] = useState(1);
  const [listData, setListData] = useState<FolderListResult | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // Reading pane
  const [selectedSummary, setSelectedSummary] = useState<MailSummary | null>(null);
  const [fullMessage, setFullMessage] = useState<MailMessage | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);

  // Compose
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string>("");
  const [safelockConfig, setSafelockConfig] = useState<SafeLockConfig | null>(null);
  const [safelockLoading, setSafelockLoading] = useState(true);
  const replyContextRef = useRef<{ messageIdHeader?: string; references?: string } | null>(
    null,
  );

  const activeConn = useMemo(
    () => connections?.find((c) => c.id === activeConnId) ?? null,
    [connections, activeConnId],
  );

  // Load user & safelock config
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          const cfg = await getSafeLockConfig(user.id);
          setSafelockConfig(cfg);
        }
      } catch (e) {
        console.error("Error loading safelock config for mail:", e);
      } finally {
        setSafelockLoading(false);
      }
    })();
  }, []);

  // Initial load: URL notices + connections
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      setNotice(`Connected ${params.get("connected")} ✓`);
      window.history.replaceState({}, "", "/mail");
    } else if (params.get("google")) {
      const reason = params.get("google");
      setNotice(
        reason === "denied"
          ? "Google access was denied."
          : "Google sign-in failed. Please try again.",
      );
      window.history.replaceState({}, "", "/mail");
    }

    (async () => {
      try {
        const conns = await fetchConnections();
        setConnections(conns);
        const firstActive = conns.find((c) => c.status === "active") ?? conns[0];
        if (firstActive) setActiveConnId(firstActive.id);
      } catch (e) {
        console.error("Failed to load connections:", e);
        setConnections([]);
      }
    })();
  }, []);

  // Load list when connection/folder/page changes
  useEffect(() => {
    if (!activeConnId) return;
    let cancelled = false;
    setListLoading(true);

    (async () => {
      try {
        const result = await listMessages(activeConnId, folder, page, 25);
        if (!cancelled) setListData(result);
      } catch (e) {
        console.error("Failed to load list:", e);
        if (!cancelled) setListData({ emails: [], total: 0, page: 1, perPage: 25 });
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeConnId, folder, page]);

  // Refresh unread badge when connection changes
  useEffect(() => {
    if (!activeConnId) return;
    fetchUnreadCount(activeConnId)
      .then(setUnreadCount)
      .catch(() => {});
  }, [activeConnId]);

  const refreshUnread = () => {
    if (activeConnId) {
      fetchUnreadCount(activeConnId)
        .then(setUnreadCount)
        .catch(() => {});
    }
  };

  const handleFolderChange = (key: string) => {
    setFolder(key);
    setPage(1);
    setSelectedSummary(null);
    setFullMessage(null);
    setEmailOpened(false);
  };

  const handleEmailClick = async (summary: MailSummary) => {
    if (!activeConnId) return;
    setSelectedSummary(summary);
    setFullMessage(null);
    setMessageLoading(true);
    if (viewMode === "normal") setEmailOpened(true);

    if (summary.unread) {
      summary.unread = false;
      setListData((prev) =>
        prev
          ? {
              ...prev,
              emails: prev.emails.map((e) => (e.id === summary.id ? { ...e, unread: false } : e)),
            }
          : prev,
      );
      setTimeout(() => refreshUnread(), 50);
    }

    try {
      const msg = await getMessage(activeConnId, summary.id, folder);
      if (msg && typeof msg === "object" && ("messageIdHeader" in msg || "bodyHtml" in msg)) {
        setFullMessage(msg);
        replyContextRef.current = {
          ...(msg.messageIdHeader ? { messageIdHeader: msg.messageIdHeader } : {}),
          ...(msg.references ? { references: msg.references } : {}),
        };
      } else {
        console.error("Failed to load message: Invalid response structure", msg);
      }
    } catch (e) {
      console.error("Failed to load message:", e);
    } finally {
      setMessageLoading(false);
    }
  };

  const handleDeleteCurrent = async () => {
    if (!activeConnId || !selectedSummary) return;
    try {
      await deleteMessage(activeConnId, selectedSummary.id, folder);
      setSelectedSummary(null);
      setFullMessage(null);
      setEmailOpened(false);
      setListData((prev) =>
        prev
          ? {
              ...prev,
              emails: prev.emails.filter((e) => e.id !== selectedSummary.id),
              total: prev.total - 1,
            }
          : prev,
      );
      refreshUnread();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  };

  const openReply = () => {
    if (!fullMessage) return;
    setComposeTo(fullMessage.fromEmail);
    setComposeSubject(
      fullMessage.subject.startsWith("Re:") ? fullMessage.subject : `Re: ${fullMessage.subject}`,
    );
    setComposeBody(
      `<br><br><hr><p>On ${new Date(fullMessage.date).toLocaleString()}, ${fullMessage.fromName} wrote:</p><blockquote>${fullMessage.bodyText ?? fullMessage.bodyHtml ?? ""}</blockquote>`,
    );
    setIsComposeOpen(true);
  };

  const handleSend = async () => {
    if (!activeConnId || !composeTo.trim()) return;
    setSending(true);
    try {
      await sendMessage({
        connectionId: activeConnId,
        to: composeTo.trim(),
        subject: composeSubject,
        body: composeBody,
        ...(composeFiles.length > 0 ? { attachments: composeFiles } : {}),
        ...(replyContextRef.current?.messageIdHeader
          ? { inReplyTo: replyContextRef.current.messageIdHeader }
          : {}),
        ...(replyContextRef.current?.references
          ? { references: replyContextRef.current.references }
          : {}),
      });
      setIsComposeOpen(false);
      resetCompose();
      if (folder === "sent") setPage(1);
    } catch (e) {
      console.error("Send failed:", e);
      alert(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const resetCompose = () => {
    setComposeTo("");
    setComposeSubject("");
    setComposeBody("");
    setComposeFiles([]);
    replyContextRef.current = null;
  };

  const handleHostingerConnect = async (email: string, password: string) => {
    setConnecting(true);
    setConnectError(null);
    try {
      const conn = await connectHostinger(email, password);
      setConnections((prev) => [...(prev ?? []), conn]);
      setConnectDialogOpen(false);
      setNotice(`Connected ${conn.email} ✓`);
      setActiveConnId(conn.id);
      setFolder("inbox");
      setPage(1);
      setListData(null);
      setSelectedSummary(null);
      setFullMessage(null);
      setEmailOpened(false);
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const switchAccount = (id: string) => {
    if (id === activeConnId) return;
    setActiveConnId(id);
    setFolder("inbox");
    setPage(1);
    setListData(null);
    setSelectedSummary(null);
    setFullMessage(null);
    setEmailOpened(false);
    setNotice(null);
  };

  const handleDisconnect = async () => {
    if (!activeConnId) return;
    try {
      await disconnectConnection(activeConnId);
      const remaining = (connections ?? []).filter((c) => c.id !== activeConnId);
      setConnections(remaining);
      setActiveConnId(remaining[0]?.id ?? null);
      setListData(null);
      setSelectedSummary(null);
      setFullMessage(null);
      setEmailOpened(false);
      setFolder("inbox");
      setPage(1);
      setNotice(null);
    } catch (e) {
      console.error("Disconnect failed:", e);
    }
  };

  const totalPages = listData ? Math.max(1, Math.ceil(listData.total / listData.perPage)) : 1;
  const compactSidebar = viewMode === "split";

  return (
    <Tooltip.Provider delayDuration={200}>
      <Layout activeTab="Mail">
        <SafeLockGuard
          tabName="Mail"
          userId={userId}
          config={safelockConfig}
          loadingConfig={safelockLoading}
          onConfigUpdated={(newCfg) => setSafelockConfig(newCfg)}
        >
          <div className="mail-page-container">
            {/* Mail Sidebar */}
            <div
              className={`mail-sidebar${ compactSidebar ? "" : "" }`}
            >
              <div
                className={`${ compactSidebar ? "2" : "4" }${compactSidebar ? "center" : "stretch"}`}
              >
                {compactSidebar ? (
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        type="button"
                        onClick={() => {
                          resetCompose();
                          setIsComposeOpen(true);
                        }}
                        
                      >
                        <SquarePen  />
                      </button>
                    </Tooltip.Trigger>
                    <Tooltip.Portal>
                      <Tooltip.Content
                        side="right"
                        
                      >
                        Compose
                        <Tooltip.Arrow  />
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      resetCompose();
                      setIsComposeOpen(true);
                    }}
                    
                  >
                    <SquarePen  />
                    <span>Compose</span>
                  </button>
                )}
              </div>

              <div >
                {FOLDERS.map((f) => (
                  <MailSidebarItem
                    key={f.key}
                    icon={f.icon}
                    label={f.label}
                    count={f.key === "inbox" && unreadCount > 0 ? unreadCount : undefined}
                    active={folder === f.key}
                    onClick={() => handleFolderChange(f.key)}
                    compact={compactSidebar}
                  />
                ))}
              </div>

              {/* View mode & Accounts in bottom sidebar */}
              <div >
                {connections && connections.length > 0 && (
                  <>
                    <div  />
                    <div className={`${compactSidebar ? "" : ""}`}>
                      {!compactSidebar && (
                        <div >
                          <span >
                            Accounts
                          </span>
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                type="button"
                                onClick={() => setConnectDialogOpen(true)}
                                
                              >
                                <Plus  />
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                side="top"
                                
                              >
                                Add mailbox
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        </div>
                      )}

                      <div
                        className={`${ compactSidebar ? "" : "" }`}
                      >
                        {connections.map((c) => {
                          const isActive = c.id === activeConnId;
                          return compactSidebar ? (
                            <Tooltip.Root key={c.id}>
                              <Tooltip.Trigger asChild>
                                <button
                                  type="button"
                                  onClick={() => switchAccount(c.id)}
                                  className={`${ isActive ? "" : "" }`}
                                >
                                  {c.photo ? (
                                    <img
                                      src={c.photo}
                                      alt={c.email}
                                      
                                    />
                                  ) : (
                                    <div
                                      className={`${ isActive ? "" : "" }`}
                                    >
                                      {c.email[0]?.toUpperCase()}
                                    </div>
                                  )}
                                </button>
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Content
                                  side="right"
                                  
                                >
                                  {c.email}
                                </Tooltip.Content>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                          ) : (
                            <div
                              key={c.id}
                              onClick={() => switchAccount(c.id)}
                              className={`${ isActive ? "" : "" }`}
                            >
                              {c.photo ? (
                                <img
                                  src={c.photo}
                                  alt={c.email}
                                  
                                />
                              ) : (
                                <div
                                  className={`${ isActive ? "" : "" }`}
                                >
                                  {c.email[0]?.toUpperCase()}
                                </div>
                              )}
                              <span
                                className={`${ isActive ? "" : "" }`}
                              >
                                {c.email}
                              </span>
                              {isActive && (
                                <Tooltip.Root>
                                  <Tooltip.Trigger asChild>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDisconnect();
                                      }}
                                      
                                    >
                                      <LogOut  />
                                    </button>
                                  </Tooltip.Trigger>
                                  <Tooltip.Portal>
                                    <Tooltip.Content
                                      side="top"
                                      
                                    >
                                      Disconnect account
                                    </Tooltip.Content>
                                  </Tooltip.Portal>
                                </Tooltip.Root>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {compactSidebar && activeConn && (
                        <>
                          <div  />
                          <div >
                            <Tooltip.Root>
                              <Tooltip.Trigger asChild>
                                <button
                                  type="button"
                                  onClick={() => setConnectDialogOpen(true)}
                                  
                                >
                                  <Plus  />
                                </button>
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Content
                                  side="right"
                                  
                                >
                                  Add mailbox
                                </Tooltip.Content>
                              </Tooltip.Portal>
                            </Tooltip.Root>

                            <Tooltip.Root>
                              <Tooltip.Trigger asChild>
                                <button
                                  type="button"
                                  onClick={handleDisconnect}
                                  
                                >
                                  <LogOut  />
                                </button>
                              </Tooltip.Trigger>
                              <Tooltip.Portal>
                                <Tooltip.Content
                                  side="right"
                                  
                                >
                                  Disconnect account
                                </Tooltip.Content>
                              </Tooltip.Portal>
                            </Tooltip.Root>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                )}

                <div  />
                <div
                  className={`${ compactSidebar ? "" : "" }`}
                >
                  {!compactSidebar && (
                    <span >
                      Layout
                    </span>
                  )}
                  <div >
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <button
                          type="button"
                          onClick={() => handleViewModeChange("split")}
                          className={`${ viewMode === "split" ? "" : "" }`}
                        >
                          <Columns2  />
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          side={compactSidebar ? "right" : "top"}
                          
                        >
                          Split view
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>

                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <button
                          type="button"
                          onClick={() => handleViewModeChange("normal")}
                          className={`${ viewMode === "normal" ? "" : "" }`}
                        >
                          <AlignJustify  />
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content
                          side={compactSidebar ? "right" : "top"}
                          
                        >
                          Normal view
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </div>
                </div>
              </div>
            </div>

            {/* Connection gate OR list + reading */}
            {connections !== null && !activeConn ? (
              <ConnectGate
                onHostingerConnect={handleHostingerConnect}
                connecting={connecting}
                error={connectError}
              />
            ) : (
              <>
                {/* Mail List */}
                {!(viewMode === "normal" && emailOpened) && (
                  <div
                    className={`mail-list-section${ viewMode === "split" ? "" : "" }`}
                  >
                    {/* Search Bar */}
                    <div >
                      <div >
                        <Search  />
                        <input
                          type="text"
                          placeholder="Search mail..."
                          className="placeholder-slate-400"
                        />
                      </div>
                    </div>

                    {/* Pagination Bar */}
                    <div >
                      <span >
                        {listData
                          ? `Page ${page} of ${totalPages} · ${listData.total} mails`
                          : " "}
                      </span>
                      <div >
                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <button
                              type="button"
                              onClick={() => {
                                setListLoading(true);
                                if (activeConnId)
                                  listMessages(activeConnId, folder, page, 25)
                                    .then(setListData)
                                    .finally(() => setListLoading(false));
                              }}
                              
                            >
                              <RefreshCw  />
                            </button>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content
                              side="top"
                              
                            >
                              Refresh
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>

                        <button
                          type="button"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          
                        >
                          <ChevronLeft  />
                        </button>
                        <button
                          type="button"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => p + 1)}
                          
                        >
                          <ChevronRight  />
                        </button>
                      </div>
                    </div>

                    {/* Mail Items List */}
                    <div>
                      {listLoading ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px" }}>
                          {Array.from({ length: 7 }).map((_, i) => (
                            <div
                              key={i}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "14px",
                                padding: "12px 14px",
                                borderRadius: "8px",
                                backgroundColor: "var(--color-surface)",
                                border: "1px solid var(--color-border-subtle, #f4f4f5)",
                              }}
                            >
                              <div className="ui-skeleton ui-skeleton-circle" style={{ width: 14, height: 14 }} />
                              <div className="ui-skeleton" style={{ width: "18%", height: 14, borderRadius: 4 }} />
                              <div className="ui-skeleton" style={{ width: "45%", height: 14, borderRadius: 4 }} />
                              <div className="ui-skeleton" style={{ width: "15%", height: 12, borderRadius: 4, marginLeft: "auto" }} />
                            </div>
                          ))}
                        </div>
                      ) : (listData?.emails.length ?? 0) === 0 ? (
                        <div >
                          <div >
                            <Inbox  />
                          </div>
                          <p >
                            Nothing here yet
                          </p>
                        </div>
                      ) : (
                        listData!.emails.map((email) => {
                          const isSelected = selectedSummary?.id === email.id;
                          return (
                            <div
                              key={email.id}
                              onClick={() => handleEmailClick(email)}
                              className={`${ isSelected ? "" : email.unread ? "" : "" }`}
                            >
                              {viewMode === "normal" ? (
                                /* Full-width table row style */
                                <div >
                                  <div >
                                    {email.unread && (
                                      <div  />
                                    )}
                                  </div>

                                  <div >
                                    <span
                                      className={`${ email.unread ? "" : "" }`}
                                    >
                                      {email.fromName}
                                    </span>
                                  </div>

                                  <div >
                                    <span
                                      className={`${ email.unread ? "" : "" }`}
                                    >
                                      {email.subject}
                                    </span>
                                    <span >
                                      {decodeHtmlEntities(email.snippet)}
                                    </span>
                                  </div>

                                  <div >
                                    <span
                                      className={`${ email.unread ? "" : "" }`}
                                    >
                                      {formatMailDate(email.date)}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                /* Split view compact card */
                                <div >
                                  <div >
                                    <div >
                                      {email.unread && (
                                        <div  />
                                      )}
                                      <span
                                        className={`${ email.unread ? "" : "" }`}
                                      >
                                        {email.fromName}
                                      </span>
                                    </div>
                                    <span
                                      className={`${ email.unread ? "" : "" }`}
                                    >
                                      {formatMailDate(email.date)}
                                    </span>
                                  </div>

                                  <div
                                    className={`${ email.unread ? "" : "" }`}
                                  >
                                    {email.subject}
                                  </div>

                                  <p >
                                    {decodeHtmlEntities(email.snippet)}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Mail Detail */}
                {(viewMode === "split" || emailOpened) && (
                  <div className="mail-detail-section">
                    {/* Action Toolbar */}
                    <div >
                      <div >
                        {viewMode === "normal" && (
                          <Tooltip.Root>
                            <Tooltip.Trigger asChild>
                              <button
                                type="button"
                                onClick={() => setEmailOpened(false)}
                                
                              >
                                <ArrowLeft  />
                              </button>
                            </Tooltip.Trigger>
                            <Tooltip.Portal>
                              <Tooltip.Content
                                side="top"
                                
                              >
                                Back
                              </Tooltip.Content>
                            </Tooltip.Portal>
                          </Tooltip.Root>
                        )}

                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <button
                              type="button"
                              disabled={!selectedSummary}
                              
                            >
                              <Archive  />
                            </button>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content
                              side="top"
                              
                            >
                              Archive
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>

                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <button
                              type="button"
                              disabled={!selectedSummary}
                              onClick={handleDeleteCurrent}
                              
                            >
                              <Trash2  />
                            </button>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content
                              side="top"
                              
                            >
                              Delete
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>

                        <div  />

                        <button
                          type="button"
                          disabled={!fullMessage}
                          onClick={openReply}
                          
                        >
                          <Reply  />
                          <span>Reply</span>
                        </button>

                        <button
                          type="button"
                          disabled={!fullMessage}
                          onClick={() => {
                            if (!fullMessage) return;
                            setComposeTo("");
                            setComposeSubject(`Fwd: ${fullMessage.subject}`);
                            setComposeBody(
                              `<br><br><hr><p>---------- Forwarded message ----------</p><p>From: ${fullMessage.from}</p><p>Date: ${new Date(fullMessage.date).toLocaleString()}</p><p>Subject: ${fullMessage.subject}</p><blockquote>${fullMessage.bodyText ?? fullMessage.bodyHtml ?? ""}</blockquote>`,
                            );
                            replyContextRef.current = null;
                            setIsComposeOpen(true);
                          }}
                          
                        >
                          <Forward  />
                          <span>Forward</span>
                        </button>
                      </div>

                      <div>
                        <Tooltip.Root>
                          <Tooltip.Trigger asChild>
                            <button
                              type="button"
                              
                            >
                              <MoreVertical  />
                            </button>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content
                              side="top"
                              
                            >
                              More
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      </div>
                    </div>

                    {/* Email Content Container */}
                    <div >
                      {!selectedSummary ? (
                        <div >
                          <div >
                            <MailIcon  />
                          </div>
                          <p >
                            Select an email to read
                          </p>
                        </div>
                      ) : messageLoading || !fullMessage ? (
                        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
                          <div className="ui-skeleton" style={{ height: 24, width: "65%", borderRadius: 6 }} />
                          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                            <div className="ui-skeleton ui-skeleton-circle" style={{ width: 40, height: 40 }} />
                            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                              <div className="ui-skeleton" style={{ height: 14, width: "25%", borderRadius: 4 }} />
                              <div className="ui-skeleton" style={{ height: 11, width: "35%", borderRadius: 4 }} />
                            </div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
                            <div className="ui-skeleton" style={{ height: 14, width: "100%", borderRadius: 4 }} />
                            <div className="ui-skeleton" style={{ height: 14, width: "95%", borderRadius: 4 }} />
                            <div className="ui-skeleton" style={{ height: 14, width: "88%", borderRadius: 4 }} />
                            <div className="ui-skeleton" style={{ height: 14, width: "60%", borderRadius: 4 }} />
                          </div>
                        </div>
                      ) : (
                        <div >
                          {/* Subject and Sender */}
                          <div >
                            <div >
                              <h2 >
                                {fullMessage.subject}
                              </h2>
                              <div >
                                <div >
                                  {fullMessage.fromName[0]?.toUpperCase() ?? "?"}
                                </div>
                                <div>
                                  <div >
                                    {fullMessage.fromName}
                                  </div>
                                  <div >
                                    {fullMessage.fromEmail}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div >
                              <div >
                                {new Date(fullMessage.date).toLocaleString()}
                              </div>
                              {fullMessage.attachments.length > 0 && (
                                <span >
                                  <Paperclip  />
                                  <span>
                                    {fullMessage.attachments.length} attachment
                                    {fullMessage.attachments.length > 1 ? "s" : ""}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Sandboxed Body Iframe */}
                          <div >
                            <iframe
                              title="Email content"
                              sandbox="allow-popups"
                              referrerPolicy="no-referrer"
                              
                              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_blank"><style>
                                body { margin:24px; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; font-size:15px; line-height:1.7; color:#334155; word-wrap:break-word; overflow-wrap:break-word; }
                                img { max-width:100%; height:auto; }
                                a { color:#2563eb; }
                                blockquote { border-left:3px solid #e2e8f0; margin:8px 0; padding-left:12px; color:#64748b; }
                              </style></head><body>${
                                fullMessage.bodyHtml ??
                                `<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${escapeHtml(
                                  fullMessage.bodyText ?? "",
                                )}</pre>`
                              }</body></html>`}
                            />
                          </div>

                          {/* Attachments */}
                          {fullMessage.attachments.length > 0 && (
                            <div >
                              <h3 >
                                Attachments ({fullMessage.attachments.length})
                              </h3>
                              <div >
                                {fullMessage.attachments.map((att) => (
                                  <div
                                    key={att.filename}
                                    onClick={() => downloadAttachment(att)}
                                    className="group"
                                  >
                                    <div >
                                      <Paperclip  />
                                    </div>
                                    <div>
                                      <p >
                                        {att.filename}
                                      </p>
                                      <p >
                                        {formatBytes(att.size)}
                                      </p>
                                    </div>
                                    <Download  />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Floating Notice Toast */}
          {notice && (
            <div className="fade-in">
              <span>{notice}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                
              >
                <X  />
              </button>
            </div>
          )}

          {/* Compose Modal */}
          <Dialog.Root open={isComposeOpen} onOpenChange={(val) => !val && setIsComposeOpen(false)}>
            <Dialog.Portal>
              <Dialog.Overlay className="modal-overlay" />
              <Dialog.Content className="modal-content" style={{ maxWidth: "680px" }}>
                {/* Header */}
                <div className="modal-header">
                  <Dialog.Title className="modal-title">
                    New Message
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button type="button" className="modal-close-btn" aria-label="Close">
                      <X size={16} />
                    </button>
                  </Dialog.Close>
                </div>

                {/* Body Form */}
                <div >
                  <div >
                    <input
                      type="text"
                      placeholder="To"
                      value={composeTo}
                      onChange={(e) => setComposeTo(e.target.value)}
                      className="placeholder-slate-400"
                    />
                  </div>

                  <div >
                    <input
                      type="text"
                      placeholder="Subject"
                      value={composeSubject}
                      onChange={(e) => setComposeSubject(e.target.value)}
                      className="placeholder-slate-400"
                    />
                  </div>

                  <div >
                    <textarea
                      rows={9}
                      placeholder="Write your message here..."
                      value={composeBody}
                      onChange={(e) => setComposeBody(e.target.value)}
                      className="placeholder-slate-400"
                    />
                  </div>

                  {composeFiles.length > 0 && (
                    <div >
                      {composeFiles.map((f, i) => (
                        <span
                          key={`${f.name}-${i}`}
                          
                        >
                          <Paperclip  />
                          <span>
                            {f.name} ({formatBytes(f.size)})
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setComposeFiles((prev) => prev.filter((_, idx) => idx !== i))
                            }
                            
                          >
                            <X  />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div >
                  <div >
                    <label >
                      <Paperclip  />
                      <input
                        type="file"
                        multiple
                        
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          setComposeFiles((prev) => [...prev, ...files]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>

                  <div >
                    <button
                      type="button"
                      onClick={() => {
                        setIsComposeOpen(false);
                        resetCompose();
                      }}
                      
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      disabled={sending || !composeTo.trim()}
                      onClick={handleSend}
                      
                    >
                      {sending ? (
                        <>
                          <Loader2  />
                          <span>Sending…</span>
                        </>
                      ) : (
                        <>
                          <span>Send</span>
                          <Send  />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          {/* Add Account Dialog */}
          <ConnectDialog
            open={connectDialogOpen}
            onClose={() => setConnectDialogOpen(false)}
            onHostingerConnect={handleHostingerConnect}
            connecting={connecting}
            error={connectError}
          />
        </SafeLockGuard>
      </Layout>
    </Tooltip.Provider>
  );

  async function downloadAttachment(att: { filename: string; attachmentId?: string }) {
    if (!activeConnId || !selectedSummary) return;
    try {
      const { supabase } = await import("../lib/supabase");
      const { data, error } = await supabase.functions.invoke("mail", {
        body: {
          action: "attachment",
          connectionId: activeConnId,
          id: selectedSummary.id,
          filename: att.filename,
          folder,
        },
      });
      if (error || !data?.data) throw new Error(error?.message ?? "Download failed");
      const bin = atob(data.data);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(
        new Blob([bytes], { type: data.contentType ?? "application/octet-stream" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = att.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Attachment download failed:", e);
    }
  }
}

function MailSidebarItem({
  icon,
  label,
  count,
  active = false,
  onClick,
  compact = false,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number | undefined;
  active?: boolean;
  onClick?: () => void;
  compact?: boolean;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={`${ compact ? "" : "" }${ active ? "" : "" }`}
        >
          <div >{icon}</div>
          {!compact && (
            <span
              className={`${ active ? "" : "" }`}
            >
              {label}
            </span>
          )}
          {!compact && count !== undefined && count > 0 && (
            <span
              className={`${ active ? "" : "" }`}
            >
              {count}
            </span>
          )}
          {compact && count !== undefined && count > 0 && (
            <span  />
          )}
        </button>
      </Tooltip.Trigger>
      {compact && (
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            
          >
            {label}
            {count !== undefined && count > 0 ? ` (${count})` : ""}
          </Tooltip.Content>
        </Tooltip.Portal>
      )}
    </Tooltip.Root>
  );
}