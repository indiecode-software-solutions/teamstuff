import React from "react";
import { supabase } from "./supabase";

export type NotificationType =
  | "forum_post"
  | "announcement"
  | "file_shared"
  | "task_assigned"
  | "salary"
  | "approval"
  | "performance";

export interface NotificationRow {
  id: string;
  userId: string;
  actorId: string | null;
  type: NotificationType;
  title: string;
  description: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
  actorName?: string | undefined;
  actorPhoto?: string | null | undefined;
}

export interface CreateNotificationParams {
  userId: string;
  actorId?: string | null;
  type: NotificationType;
  title: string;
  description: string;
  link?: string | null;
}

/**
 * Fetch the latest notifications for the current user, newest first,
 * with the actor's name/photo joined for avatars.
 */
export async function getNotifications(limit = 50): Promise<NotificationRow[]> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("notifications")
      .select("*, actor:actor_id ( name, profile_photo )")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data || []).map((n: any) => ({
      id: n.id,
      userId: n.user_id,
      actorId: n.actor_id,
      type: n.type,
      title: n.title,
      description: n.description,
      link: n.link,
      isRead: n.is_read,
      createdAt: n.created_at,
      actorName: n.actor?.name,
      actorPhoto: n.actor?.profile_photo,
    }));
  } catch (err) {
    console.error("Error fetching notifications:", err);
    return [];
  }
}

export async function getUnreadNotificationCount(): Promise<number> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 0;

    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (error) throw error;
    return count || 0;
  } catch (err) {
    console.error("Error fetching unread count:", err);
    return 0;
  }
}

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);
    if (error) throw error;
    notifyNotificationsChanged();
    return true;
  } catch (err) {
    console.error("Error marking notification read:", err);
    return false;
  }
}

export async function markAllNotificationsRead(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);
    if (error) throw error;
    notifyNotificationsChanged();
    return true;
  } catch (err) {
    console.error("Error marking all notifications read:", err);
    return false;
  }
}

/**
 * Create an in-app notification for a user. Never throws — failures are
 * logged so this can be fired from action handlers without breaking them.
 */
export async function createNotification(params: CreateNotificationParams): Promise<boolean> {
  try {
    const { error } = await supabase.from("notifications").insert({
      user_id: params.userId,
      actor_id: params.actorId ?? null,
      type: params.type,
      title: params.title,
      description: params.description,
      link: params.link ?? null,
    });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Error creating notification:", err);
    return false;
  }
}

/** Short name of a profile, fetched for notification descriptions. */
export async function getProfileName(userId: string): Promise<string> {
  try {
    const { data } = await supabase.from("profiles").select("name").eq("id", userId).single();
    return data?.name || "Someone";
  } catch {
    return "Someone";
  }
}

/**
 * Broadcasts that notification rows changed (mark read / mark all) so any
 * open badge counters refresh in the same tab.
 */
export function notifyNotificationsChanged(): void {
  window.dispatchEvent(new Event("intranet:notifications-changed"));
}

const NOTIFICATIONS_CHANGED_EVENT = "intranet:notifications-changed";

/**
 * Live unread-count for header badges. Subscribes to realtime INSERTs for
 * the current user and refreshes on mark-read events.
 */
export function useUnreadNotificationCount(): number {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const refresh = () => {
      getUnreadNotificationCount().then((c) => {
        if (!cancelled) setCount(c);
      });
    };

    const onChanged = () => refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      refresh();
      try {
        channel = supabase
          .channel(`notifications-count-${user.id}-${Math.random().toString(36).substring(2, 9)}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${user.id}`,
            },
            refresh,
          )
          .subscribe();
      } catch {
        channel = null;
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return count;
}

/** "5 mins ago" / "2 hours ago" / "Yesterday" style relative time. */
export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
