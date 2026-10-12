import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X as CloseIcon,
  MessagesSquare as ForumIcon,
  Megaphone as AnnouncementIcon,
  FileText as FileIcon,
  ClipboardList as TaskIcon,
  Banknote as SalaryIcon,
  CheckCircle2 as CheckCircleIcon,
  TrendingUp as PerformanceIcon,
  Ellipsis as MoreIcon,
  BellOff as NotificationsOffIcon,
  CheckCheck,
  Check,
} from "lucide-react";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  formatRelativeTime,
  type NotificationRow,
  type NotificationType,
} from "../../lib/notifications";
import { supabase } from "../../lib/supabase";

const getCategoryIcon = (type: NotificationType, size = 16) => {
  switch (type) {
    case "forum_post":
      return <ForumIcon size={size} />;
    case "announcement":
      return <AnnouncementIcon size={size} />;
    case "file_shared":
      return <FileIcon size={size} />;
    case "task_assigned":
      return <TaskIcon size={size} />;
    case "salary":
      return <SalaryIcon size={size} />;
    case "approval":
      return <CheckCircleIcon size={size} />;
    case "performance":
      return <PerformanceIcon size={size} />;
    default:
      return <MoreIcon size={size} />;
  }
};

function getTimelineGroup(dateStr: string): "Today" | "Yesterday" | "This Week" | "Earlier" {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
    const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000);

    if (date >= startOfToday) return "Today";
    if (date >= startOfYesterday) return "Yesterday";
    if (date >= startOfWeek) return "This Week";
    return "Earlier";
  } catch {
    return "Earlier";
  }
}

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  onNavigate?: (link: string) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  open,
  onClose,
  onNavigate,
}) => {
  const [notifications, setNotifications] = React.useState<NotificationRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [filter, setFilter] = React.useState<"all" | "unread">("all");
  const loadedRef = React.useRef(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const items = await getNotifications(50);
    setNotifications(items);
    setLoading(false);
  }, []);

  // Refresh every time the drawer opens.
  React.useEffect(() => {
    if (open) {
      load();
      loadedRef.current = true;
    }
  }, [open, load]);

  // Live inserts while this component is mounted.
  React.useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`notifications-drawer-${Math.random().toString(36).substring(2, 9)}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
          },
          async (payload: any) => {
            if (!payload?.new) return;
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (!user || payload.new.user_id !== user.id) return;
            let actor: { name?: string; profile_photo?: string } | undefined;
            if (payload.new.actor_id) {
              const { data: actorRow } = await supabase
                .from("profiles")
                .select("name, profile_photo")
                .eq("id", payload.new.actor_id)
                .maybeSingle();
              actor = actorRow || undefined;
            }
            setNotifications((prev) =>
              [
                {
                  id: payload.new.id,
                  userId: payload.new.user_id,
                  actorId: payload.new.actor_id,
                  type: payload.new.type,
                  title: payload.new.title,
                  description: payload.new.description,
                  link: payload.new.link,
                  isRead: payload.new.is_read ?? false,
                  createdAt: payload.new.created_at,
                  actorName: actor?.name,
                  actorPhoto: actor?.profile_photo,
                },
                ...prev,
              ].slice(0, 50),
            );
          },
        )
        .subscribe();
    } catch {
      channel = null;
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const handleItemClick = (notification: NotificationRow) => {
    if (!notification.isRead) {
      markNotificationRead(notification.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)),
      );
    }
    onClose();
    if (notification.link && onNavigate) {
      onNavigate(notification.link);
    }
  };

  const handleToggleRead = (e: React.MouseEvent, notification: NotificationRow) => {
    e.stopPropagation();
    markNotificationRead(notification.id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === notification.id ? { ...n, isRead: !n.isRead } : n)),
    );
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const displayedNotifications =
    filter === "unread" ? notifications.filter((n) => !n.isRead) : notifications;

  // Group notifications by timeline
  const groupedNotifications = React.useMemo(() => {
    const groups: { [key in "Today" | "Yesterday" | "This Week" | "Earlier"]?: NotificationRow[] } = {};
    const order: Array<"Today" | "Yesterday" | "This Week" | "Earlier"> = [
      "Today",
      "Yesterday",
      "This Week",
      "Earlier",
    ];

    displayedNotifications.forEach((notif) => {
      const group = getTimelineGroup(notif.createdAt);
      if (!groups[group]) {
        groups[group] = [];
      }
      groups[group]!.push(notif);
    });

    return order
      .filter((label) => groups[label] && groups[label]!.length > 0)
      .map((label) => ({
        label,
        items: groups[label]!,
      }));
  }, [displayedNotifications]);

  const renderNotificationTitle = (n: NotificationRow) => {
    if (n.type === "task_assigned" && n.actorName) {
      return (
        <>
          <span className="notif-actor-highlight">{n.actorName}</span> assigned you a task
        </>
      );
    }
    return n.title;
  };

  const renderDescription = (desc?: string | null) => {
    if (!desc) return null;
    const parts = desc.split(/(".*?")/g);
    return (
      <p className="notif-drawer-item-desc">
        {parts.map((part, i) => {
          if (part.startsWith('"') && part.endsWith('"')) {
            return (
              <span key={i} className="notif-entity-name">
                {part.slice(1, -1)}
              </span>
            );
          }
          return part;
        })}
      </p>
    );
  };

  const renderAvatar = (notification: NotificationRow) => {
    if (notification.actorPhoto) {
      return (
        <div className="notif-drawer-avatar">
          <img src={notification.actorPhoto} alt={notification.actorName || ""} />
        </div>
      );
    }
    if (notification.actorName) {
      return (
        <div className="notif-drawer-avatar notif-avatar-initials">
          <span>{notification.actorName.charAt(0).toUpperCase()}</span>
        </div>
      );
    }
    return (
      <div className="notif-category-icon-box">
        {getCategoryIcon(notification.type, 15)}
      </div>
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="notif-drawer-overlay" />
        <Dialog.Content className="notif-drawer-content">
          {/* Header */}
          <div className="notif-drawer-header">
            <div className="notif-drawer-title-group">
              <Dialog.Title className="notif-drawer-title">Notifications</Dialog.Title>
              {unreadCount > 0 && (
                <span className="notif-drawer-badge">{unreadCount}</span>
              )}
            </div>
            <Dialog.Description style={{ display: "none" }}>
              List of notifications
            </Dialog.Description>

            <div className="notif-drawer-actions">
              <button
                type="button"
                disabled={unreadCount === 0}
                onClick={handleMarkAll}
                className="notif-drawer-action-btn"
                title="Mark all as read"
              >
                <CheckCheck size={14} />
                <span>Mark all read</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="notif-drawer-close-btn"
                title="Close"
              >
                <CloseIcon size={16} />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="notif-drawer-tabs">
            <button
              type="button"
              className={`notif-drawer-tab ${filter === "all" ? "is-active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              className={`notif-drawer-tab ${filter === "unread" ? "is-active" : ""}`}
              onClick={() => setFilter("unread")}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Content List */}
          <div className="notif-drawer-body">
            {loading && notifications.length === 0 ? (
              <div>
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="notif-drawer-skeleton-item">
                    <div className="notif-skeleton-avatar" />
                    <div className="notif-skeleton-content">
                      <div className="notif-skeleton-line short" />
                      <div className="notif-skeleton-line medium" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="notif-drawer-empty">
                <div className="notif-drawer-empty-icon">
                  <NotificationsOffIcon size={24} />
                </div>
                <h3 className="notif-drawer-empty-title">
                  {filter === "unread" ? "No unread notifications" : "You're all caught up"}
                </h3>
                <p className="notif-drawer-empty-desc">
                  {filter === "unread"
                    ? "You have marked all notifications as read."
                    : "Task assignments, approvals, payslips and mentions will appear here."}
                </p>
              </div>
            ) : (
              <div>
                {groupedNotifications.map((group) => (
                  <div key={group.label} className="notif-section-group">
                    <div className="notif-section-header">{group.label}</div>
                    {group.items.map((notification) => {
                      const isUnread = !notification.isRead;
                      return (
                        <div
                          key={notification.id}
                          onClick={() => handleItemClick(notification)}
                          className={`notif-drawer-item ${isUnread ? "notif-drawer-item-unread" : ""}`}
                        >
                          {isUnread && <div className="notif-drawer-unread-dot" />}
                          {renderAvatar(notification)}
                          <div className="notif-drawer-content-main">
                            <div className="notif-drawer-row-top">
                              <h4
                                className={`notif-drawer-item-title ${isUnread ? "is-unread" : ""}`}
                              >
                                {renderNotificationTitle(notification)}
                              </h4>
                              <span className="notif-drawer-item-time">
                                {formatRelativeTime(notification.createdAt)}
                              </span>
                            </div>
                            {renderDescription(notification.description)}
                          </div>
                          <div className="notif-quick-actions">
                            <button
                              type="button"
                              className="notif-quick-btn"
                              title={isUnread ? "Mark as read" : "Mark as unread"}
                              onClick={(e) => handleToggleRead(e, notification)}
                            >
                              <Check size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
