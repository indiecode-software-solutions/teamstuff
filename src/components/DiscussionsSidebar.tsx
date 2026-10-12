import React, { useState, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  MessagesSquare as Forum,
  Send,
  Loader2,
  X as Close,
  CornerDownRight as ReplyIcon,
  Trash2 as DeleteIcon,
  Users as Group,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import {
  getCompanyDiscussions,
  postDiscussion,
  deleteDiscussion,
  getCompanyChatMode,
  updateCompanyChatMode,
  DiscussionMessage,
} from "../lib/discussions";

interface DiscussionsSidebarProps {
  className?: string;
}

export function DiscussionsSidebar({ className }: DiscussionsSidebarProps) {
  const [discussions, setDiscussions] = useState<DiscussionMessage[]>([]);
  const [loadingDiscussions, setLoadingDiscussions] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<DiscussionMessage | null>(null);
  const [mentionUserId, setMentionUserId] = useState<string | null>(null);
  const [mentionOptions, setMentionOptions] = useState<{ id: string; name: string }[]>([]);
  const [activeMention, setActiveMention] = useState(false);

  // Modals & Chat Mode
  const [deleteTarget, setDeleteTarget] = useState<DiscussionMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [chatModeDialogOpen, setChatModeDialogOpen] = useState(false);
  const [savingChatMode, setSavingChatMode] = useState(false);
  const [chatMode, setChatMode] = useState<"anonymous" | "transparent">("anonymous");

  // User & Company Context
  const [myCompanyId, setMyCompanyId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<string | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);

  const canModerate = myRole === "hr" || myRole === "admin" || myRole === "super_admin";

  // Load User & Company Context
  useEffect(() => {
    let isMounted = true;
    const initUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !isMounted) return;
        setCurrentUserId(user.id);

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, name, role, company_id")
          .eq("id", user.id)
          .maybeSingle();

        if (profile && isMounted) {
          setProfileName(profile.name);
          setMyRole(profile.role);
          setMyCompanyId(profile.company_id);

          if (profile.company_id) {
            // Load employees for mention options
            const { data: emps } = await supabase
              .from("profiles")
              .select("id, name")
              .eq("company_id", profile.company_id);
            if (emps && isMounted) {
              setMentionOptions(emps.map((e) => ({ id: e.id, name: e.name || "Employee" })));
            }

            // Load company chat mode
            const mode = await getCompanyChatMode(profile.company_id);
            if (isMounted) setChatMode(mode);

            // Load discussions
            const msgs = await getCompanyDiscussions(profile.company_id);
            if (isMounted) {
              setDiscussions(msgs);
              setLoadingDiscussions(false);
            }
          }
        }
      } catch (err) {
        console.error("Error loading discussion context:", err);
      } finally {
        if (isMounted) setLoadingDiscussions(false);
      }
    };

    initUser();
    return () => {
      isMounted = false;
    };
  }, []);

  // Realtime subscription for discussion messages
  useEffect(() => {
    if (!myCompanyId) return;
    let channel: any = null;
    try {
      channel = supabase
        .channel(`discussions-feed-${myCompanyId}-${Math.random().toString(36).substring(2, 9)}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "company_discussions" },
          async () => {
            // Refresh discussions list cleanly
            const msgs = await getCompanyDiscussions(myCompanyId);
            setDiscussions(msgs);
          }
        )
        .subscribe();
    } catch {}

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [myCompanyId]);

  // Realtime subscription for chat mode updates
  useEffect(() => {
    if (!myCompanyId) return;
    let modeChannel: any = null;
    try {
      modeChannel = supabase
        .channel(`chatmode-feed-${myCompanyId}-${Math.random().toString(36).substring(2, 9)}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "companies", filter: `id=eq.${myCompanyId}` },
          (payload: any) => {
            if (payload?.new?.chat_mode) {
              setChatMode(payload.new.chat_mode);
            }
          }
        )
        .subscribe();
    } catch {}

    return () => {
      if (modeChannel) supabase.removeChannel(modeChannel);
    };
  }, [myCompanyId]);

  // Scroll to bottom when new discussions arrive
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [discussions.length]);

  // Handle @mentions in input
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setReplyText(text);

    const lastWord = text.split(/\s+/).pop() || "";
    if (lastWord.startsWith("@") && lastWord.length > 1) {
      setActiveMention(true);
    } else {
      setActiveMention(false);
    }
  };

  const selectMention = (emp: { id: string; name: string }) => {
    const words = replyText.split(/\s+/);
    words.pop();
    const updated = [...words, `@${emp.name} `].join(" ");
    setReplyText(updated);
    setMentionUserId(emp.id);
    setActiveMention(false);
  };

  // Send message handler
  const handleSendDiscussion = async () => {
    if (!replyText.trim() || !myCompanyId || !currentUserId || replySending) return;
    setReplySending(true);

    try {
      const row = await postDiscussion({
        companyId: myCompanyId,
        authorId: currentUserId,
        content: replyText.trim(),
        parentId: replyTarget ? replyTarget.id : null,
        mentionUserId,
        isAnonymous: chatMode === "anonymous",
      });

      if (row) {
        setReplyText("");
        setReplyTarget(null);
        setMentionUserId(null);
        const msgs = await getCompanyDiscussions(myCompanyId);
        setDiscussions(msgs);
      } else {
        toast.error("Failed to send message");
      }
    } catch {
      toast.error("Failed to send message");
    } finally {
      setReplySending(false);
    }
  };

  // Confirm delete handler
  const confirmDeleteDiscussion = async () => {
    if (!deleteTarget || !myCompanyId) return;
    setDeleting(true);
    try {
      const ok = await deleteDiscussion(deleteTarget.id);
      if (ok) {
        toast.success("Message deleted");
        const msgs = await getCompanyDiscussions(myCompanyId);
        setDiscussions(msgs);
      } else {
        toast.error("Failed to delete. Verify HR/Admin permissions.");
      }
    } catch {
      toast.error("Failed to delete message");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Chat mode switch handler
  const handleSwitchChatMode = async (mode: "anonymous" | "transparent") => {
    if (!myCompanyId || savingChatMode) return;
    setSavingChatMode(true);
    try {
      const ok = await updateCompanyChatMode(myCompanyId, mode);
      if (ok) {
        setChatMode(mode);
        toast.success(`Chat mode switched to ${mode === "anonymous" ? "Anonymous" : "Transparent"}`);
        setChatModeDialogOpen(false);
      } else {
        toast.error("Failed to update chat mode");
      }
    } catch {
      toast.error("Failed to update chat mode");
    } finally {
      setSavingChatMode(false);
    }
  };

  return (
    <div id="discussions-sidebar-card" className={`hub-sidebar ${className || ""}`}>
      {/* Dedicated Header for Discussions */}
      <div className="hub-sidebar-header">
        <div className="hub-sidebar-header-title">
          <Forum size={18} strokeWidth={1.75} />
          <span>Team Discussions</span>
        </div>
      </div>

      {/* Sidebar Content */}
      <div className="hub-content">
        <div className="hub-chat-tab">
          {/* Thread List */}
          <div ref={threadRef} className="hub-thread-list">
            {loadingDiscussions ? (
              [1, 2, 3, 4].map((idx) => (
                <div key={idx} className="hub-chat-skeleton-item">
                  <div
                    className="skeleton-shimmer skeleton-avatar"
                    style={{ width: "32px", height: "32px" }}
                  />
                  <div className="hub-chat-skeleton-bubble">
                    <div
                      className="skeleton-shimmer skeleton-line-title"
                      style={{ width: "40%" }}
                    />
                    <div
                      className="skeleton-shimmer skeleton-line-sub"
                      style={{ width: idx % 2 === 0 ? "85%" : "60%" }}
                    />
                  </div>
                </div>
              ))
            ) : discussions.length > 0 ? (
              discussions.map((msg) => (
                <MessageThread
                  key={msg.id}
                  msg={msg}
                  onReply={setReplyTarget}
                  canDelete={canModerate}
                  onDelete={setDeleteTarget}
                />
              ))
            ) : (
              <div className="hub-empty-state">
                No discussions yet. Start the conversation below.
              </div>
            )}
          </div>

          {/* Composer Box */}
          <div className="hub-composer-container">
            {replyTarget && (
              <div className="hub-reply-banner">
                <ReplyIcon size={14} />
                <span className="hub-reply-text">
                  Replying to{" "}
                  {replyTarget?.isAnonymous !== false
                    ? "Anonymous"
                    : replyTarget?.author?.name || "Team Member"}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReplyTarget(null);
                    setMentionUserId(null);
                  }}
                  className="modal-close-btn"
                  style={{ padding: "2px" }}
                >
                  <Close size={14} />
                </button>
              </div>
            )}

            {activeMention && mentionOptions.length > 0 && (
              <div className="hub-mention-picker-popover">
                {mentionOptions.map((emp) => (
                  <div
                    key={emp.id}
                    onClick={() => selectMention(emp)}
                    className="hub-mention-picker-item"
                  >
                    <div className="hub-mention-picker-avatar">
                      {emp.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="hub-mention-picker-name">{emp.name}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="hub-composer-box">
              <textarea
                rows={1}
                className="hub-composer-input"
                placeholder={
                  replyTarget
                    ? chatMode === "anonymous"
                      ? "Reply anonymously..."
                      : `Reply as ${profileName || "Team Member"}...`
                    : chatMode === "anonymous"
                    ? "Say something anonymously..."
                    : `Say something as ${profileName || "Team Member"}...`
                }
                value={replyText}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendDiscussion();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleSendDiscussion}
                disabled={replySending || !replyText.trim()}
                className="hub-send-btn"
              >
                {replySending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
              </button>
            </div>

            {/* Mode & Status Row */}
            <div className="hub-composer-status-row">
              <div className="hub-composer-status-badge">
                {chatMode === "anonymous" ? (
                  <>
                    <img
                      src="/anonymous-stroke-rounded.svg"
                      alt="Anonymous"
                      className="hub-composer-status-icon"
                    />
                    <span>
                      Posting as <strong>Anonymous</strong>
                    </span>
                  </>
                ) : (
                  <>
                    <Group size={13} />
                    <span>
                      Posting openly as <strong>{profileName || "Team Member"}</strong>
                    </span>
                  </>
                )}
              </div>

              {canModerate && (
                <button
                  type="button"
                  onClick={() => setChatModeDialogOpen(true)}
                  className="dashboard-card-action-btn"
                >
                  Change
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Discussion Message Dialog */}
      <Dialog.Root
        open={!!deleteTarget}
        onOpenChange={(val) => !val && !deleting && setDeleteTarget(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal-content modal-content--confirm">
            <div className="modal-header">
              <Dialog.Title className="modal-title">
                Delete message?
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="modal-close-btn" aria-label="Close">
                  <Close size={16} />
                </button>
              </Dialog.Close>
            </div>
            <p className="modal-desc">
              This permanently removes the anonymous message
              {deleteTarget?.replies.length
                ? ` and its ${deleteTarget.replies.length} reply(ies)`
                : ""}{" "}
              from the discussion. This action cannot be undone.
            </p>
            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteDiscussion}
                disabled={deleting}
                className="btn btn-danger"
              >
                {deleting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                <span>Delete</span>
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Company Chat Mode Dialog */}
      <Dialog.Root
        open={chatModeDialogOpen}
        onOpenChange={(val) =>
          !val && !savingChatMode && setChatModeDialogOpen(false)
        }
      >
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className="modal-content chat-mode-modal">
            <div className="modal-header">
              <Dialog.Title className="modal-title">
                Change Company Chat Mode
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="modal-close-btn" aria-label="Close">
                  <Close size={16} />
                </button>
              </Dialog.Close>
            </div>
            <p className="chat-mode-desc">
              Decide whether employees communicate anonymously or openly with
              their names and profiles in the company discussion channel.
            </p>

            <div className="chat-mode-options">
              <div
                onClick={() => handleSwitchChatMode("anonymous")}
                className={`chat-mode-card ${chatMode === "anonymous" ? "is-active" : ""}`}
              >
                <div className="chat-mode-card-header">
                  <div className="chat-mode-card-title">
                    <img
                      src="/anonymous-stroke-rounded.svg"
                      alt="Anonymous"
                      className="chat-mode-card-icon"
                    />
                    <span>Anonymous Chat</span>
                  </div>
                  <input
                    type="radio"
                    className="chat-mode-radio"
                    checked={chatMode === "anonymous"}
                    readOnly
                  />
                </div>
                <p className="chat-mode-card-body">
                  Names and avatars are masked to encourage candid and open
                  feedback.
                </p>
              </div>

              <div
                onClick={() => handleSwitchChatMode("transparent")}
                className={`chat-mode-card ${chatMode === "transparent" ? "is-active" : ""}`}
              >
                <div className="chat-mode-card-header">
                  <div className="chat-mode-card-title">
                    <Group size={16} />
                    <span>Transparent Group Chat</span>
                  </div>
                  <input
                    type="radio"
                    className="chat-mode-radio"
                    checked={chatMode === "transparent"}
                    readOnly
                  />
                </div>
                <p className="chat-mode-card-body">
                  Employees post openly with their real names, photos, and
                  roles.
                </p>
              </div>
            </div>

            <div className="chat-mode-privacy-note">
              <ShieldCheck size={18} />
              <p style={{ margin: 0 }}>
                <strong>Privacy Invariant:</strong>{" "}
                Past anonymous messages permanently stay private. Their
                authors will never be revealed.
              </p>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setChatModeDialogOpen(false)}
                disabled={savingChatMode}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────

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
        {i > 0 && <span className="hub-mention-text">@{name}</span>}
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
        <div className="hub-message-dash">—</div>
      ) : msg.isAnonymous ? (
        <div className="hub-message-avatar hub-message-avatar-anon">
          <img src="/anonymous-stroke-rounded.svg" alt="Anonymous" />
        </div>
      ) : msg.author.avatarUrl ? (
        <div className="hub-message-avatar">
          <img src={msg.author.avatarUrl} alt={msg.author.name} />
        </div>
      ) : (
        <div className="hub-message-avatar">
          {(msg.author.name || "U").slice(0, 2).toUpperCase()}
        </div>
      )}

      <div className="hub-message-body">
        {!msg.isAnonymous && (
          <div className="hub-message-header">
            <span className="hub-message-author">{msg.author.name}</span>
            <span className="hub-message-time">• {formattedTime}</span>
          </div>
        )}
        <p className="hub-message-text">{renderContent(msg)}</p>
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
        <div
          className={`hub-thread-nested ${
            isRoot ? "hub-thread-nested-root" : "hub-thread-nested-sub"
          }`}
        >
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
