import { supabase } from "./supabase";
import { createNotification, getProfileName } from "./notifications";
import { sanitizeProfilePhoto } from "./profile-photo";
import { saveCompanyChatMode } from "./company";

export interface DiscussionAuthor {
  name: string;
  role: string;
  avatarUrl?: string | undefined;
}

export interface DiscussionMessage {
  id: string;
  companyId: string;
  authorId: string;
  content: string;
  parentId: string | null;
  mentionUserId: string | null;
  mentionUserName?: string | undefined;
  parentSnippet?: string;
  createdAt: string;
  isAnonymous: boolean;
  author: DiscussionAuthor;
  replies: DiscussionMessage[];
}

/**
 * Fetch all top-level discussion messages (with replies attached) for a company.
 * When a message is marked anonymous (is_anonymous !== false), author details are
 * permanently masked to guarantee anonymity even if chat mode is later switched.
 */
export async function getCompanyDiscussions(companyId: string): Promise<DiscussionMessage[]> {
  try {
    const { data, error } = await supabase
      .from("company_discussions")
      .select(
        `
        *,
        author:profiles!company_discussions_author_id_fkey ( id, name, role, profile_photo ),
        mention:profiles!company_discussions_mention_user_id_fkey ( name )
      `,
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const rows = (data || []) as any[];
    const byId = new Map<string, DiscussionMessage>();

    for (const r of rows) {
      // Any message where is_anonymous is true (or undefined for legacy rows) is strictly anonymous.
      const isAnon = r.is_anonymous !== false;
      const msg: DiscussionMessage = {
        id: r.id,
        companyId: r.company_id,
        authorId: isAnon ? "" : r.author_id,
        content: r.content,
        parentId: r.parent_id,
        mentionUserId: r.mention_user_id,
        mentionUserName: r.mention?.name || undefined,
        createdAt: r.created_at,
        isAnonymous: isAnon,
        author: isAnon
          ? {
              name: "Anonymous",
              role: "Employee",
              avatarUrl: undefined,
            }
          : {
              name: r.author?.name || "Team Member",
              role: r.author?.role || "Employee",
              avatarUrl:
                sanitizeProfilePhoto(r.author?.profile_photo || r.author?.avatar_url) || undefined,
            },
        replies: [],
      };
      byId.set(msg.id, msg);
    }

    const top: DiscussionMessage[] = [];
    for (const msg of byId.values()) {
      const parent = msg.parentId ? byId.get(msg.parentId) : null;
      if (parent) {
        msg.parentSnippet =
          parent.content.length > 48 ? `${parent.content.slice(0, 48)}…` : parent.content;
        parent.replies.push(msg);
      } else {
        top.push(msg);
      }
    }

    const sortRecursive = (list: DiscussionMessage[]) => {
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      list.forEach((m) => sortRecursive(m.replies));
    };
    sortRecursive(top);

    return top;
  } catch (err) {
    console.error("Error fetching discussions:", err);
    return [];
  }
}

/**
 * Delete a discussion message. Only allowed for HR/Admin via the
 * "hr or admin can delete discussions" RLS policy; replies are removed
 * by on delete cascade. Returns false when the caller lacks permission.
 */
export async function deleteDiscussion(messageId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("company_discussions").delete().eq("id", messageId);
    if (error) throw error;
    const { count, error: countError } = await supabase
      .from("company_discussions")
      .select("id", { count: "exact", head: true })
      .eq("id", messageId);
    if (countError) throw countError;
    if (count && count > 0) return false;
    return true;
  } catch (err) {
    console.error("Error deleting discussion message:", err);
    return false;
  }
}

/**
 * Post a new discussion message (or a reply when parentId is provided).
 * Sets is_anonymous based on current company chat mode.
 * Returns the inserted row so the UI can merge it locally without refetching.
 */
export async function postDiscussion(params: {
  companyId: string;
  authorId: string;
  content: string;
  parentId?: string | null;
  mentionUserId?: string | null;
  isAnonymous?: boolean;
}): Promise<{
  id: string;
  company_id: string;
  author_id: string;
  content: string;
  parent_id: string | null;
  mention_user_id: string | null;
  created_at: string;
  is_anonymous?: boolean;
} | null> {
  const isAnonymous = params.isAnonymous ?? true;
  try {
    let { data, error } = await supabase
      .from("company_discussions")
      .insert({
        company_id: params.companyId,
        author_id: params.authorId,
        content: params.content,
        parent_id: params.parentId ?? null,
        mention_user_id: params.mentionUserId ?? null,
        is_anonymous: isAnonymous,
      })
      .select()
      .single();

    if (error && (error.code === "PGRST204" || error.message?.includes("is_anonymous"))) {
      // Graceful fallback if is_anonymous column hasn't been created yet in DB
      const fallback = await supabase
        .from("company_discussions")
        .insert({
          company_id: params.companyId,
          author_id: params.authorId,
          content: params.content,
          parent_id: params.parentId ?? null,
          mention_user_id: params.mentionUserId ?? null,
        })
        .select()
        .single();
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;

    // In-app notifications: mention the @-mentioned user, or notify the
    // parent-message author when this is a reply.
    try {
      if (params.mentionUserId && params.mentionUserId !== params.authorId) {
        const mentionerName = isAnonymous ? "Someone" : await getProfileName(params.authorId);
        await createNotification({
          userId: params.mentionUserId,
          actorId: params.authorId,
          type: "forum_post",
          title: "You were mentioned",
          description: `${mentionerName} mentioned you in a comment`,
          link: "/",
        });
      } else if (params.parentId) {
        const { data: parent } = await supabase
          .from("company_discussions")
          .select("author_id")
          .eq("id", params.parentId)
          .single();
        if (parent && parent.author_id !== params.authorId) {
          const replierName = isAnonymous ? "Someone" : await getProfileName(params.authorId);
          await createNotification({
            userId: parent.author_id,
            actorId: params.authorId,
            type: "forum_post",
            title: "New reply to your comment",
            description: `${replierName} replied to your comment`,
            link: "/",
          });
        }
      }
    } catch (notifErr) {
      console.error("Failed to create discussion notification:", notifErr);
    }

    return (data as any) || null;
  } catch (err) {
    console.error("Error posting discussion message:", err);
    return null;
  }
}

/**
 * Fetch active chat mode for a company ('anonymous' | 'transparent').
 */
export async function getCompanyChatMode(
  companyId: string,
): Promise<"anonymous" | "transparent"> {
  try {
    const { data, error } = await supabase
      .from("companies")
      .select("chat_mode")
      .eq("id", companyId)
      .maybeSingle();
    if (error || !data?.chat_mode) return "anonymous";
    return (data.chat_mode as "anonymous" | "transparent") || "anonymous";
  } catch {
    return "anonymous";
  }
}

/**
 * Update the company chat mode (Admin / HR only).
 * Uses the server function with service role to ensure the change is saved through RLS.
 */
export async function updateCompanyChatMode(
  companyId: string,
  mode: "anonymous" | "transparent",
): Promise<boolean> {
  try {
    const res = await saveCompanyChatMode({
      data: { companyId, chatMode: mode },
    });
    if (!res.success) {
      console.error("Failed to update company chat mode:", res.error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to update company chat mode:", err);
    return false;
  }
}

