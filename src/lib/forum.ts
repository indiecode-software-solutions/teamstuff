import { supabase } from "./supabase";
import { createNotification, getProfileName } from "./notifications";
import { sanitizeProfilePhoto } from "./profile-photo";
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { getR2Path, uploadR2Base64 } from "./r2-storage";

export interface ForumComment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: string;
  author: {
    name: string;
    role: string;
    jobTitle?: string;
    avatarUrl?: string;
  };
}

export interface PollOption {
  id: string;
  text: string;
  votesCount: number;
  percentage: number;
}

export interface ForumPoll {
  id: string;
  companyId: string;
  authorId: string;
  question: string;
  description?: string;
  options: PollOption[];
  expiresAt: string;
  isExpired: boolean;
  totalVotes: number;
  userVotedOptionId?: string;
  createdAt: string;
}

export interface ForumPost {
  id: string;
  companyId: string;
  authorId: string;
  title: string;
  content: string;
  category: "Announcements" | "General" | "Tech" | "HR" | "Events";
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
  isPinned: boolean;
  postType: "discussion" | "poll";
  poll?: ForumPoll | null;
  author: {
    name: string;
    role: string;
    jobTitle?: string;
    avatarUrl?: string;
  };
  commentsList: ForumComment[];
  likesCount: number;
  hasLiked: boolean;
}

/**
 * Server function to securely upload post attachments to Cloudflare R2
 * (companies/<companyId>/forum/<userId>/<timestamp>_post_attachment.webp)
 */
export const uploadForumImage = createServerFn({ method: "POST" })
  .validator((d: { base64Data: string; companyId: string; userId: string }) => d)
  .handler(async ({ data }) => {
    const { base64Data, companyId, userId } = data;
    const key = getR2Path.forumAttachment(companyId, userId, "post_attachment.webp");

    try {
      const res = await uploadR2Base64({
        key,
        base64Data,
        contentType: "image/webp",
      });

      if (!res.success) {
        throw new Error(res.error || "R2 forum image upload failed");
      }

      return { success: true, secure_url: res.url };
    } catch (err: any) {
      console.error("❌ R2 Forum Upload Error:", err.message);
      return { success: false, error: err.message };
    }
  });

/**
 * Fetch all posts for a company
 */
export async function getCompanyForumPosts(
  companyId: string,
  currentUserId: string,
): Promise<ForumPost[]> {
  try {
    let postsData: any[] = [];
    try {
      const { data: posts, error } = await supabase
        .from("forum_posts")
        .select(
          `
          *,
          author:profiles!forum_posts_author_id_fkey ( id, name, role, job_title, profile_photo ),
          comments:forum_comments (
            id,
            post_id,
            author_id,
            content,
            created_at,
            author:profiles!forum_comments_author_id_fkey ( id, name, role, job_title, profile_photo )
          ),
          likes:forum_likes ( user_id ),
          poll:forum_polls (
            id,
            company_id,
            author_id,
            question,
            description,
            options,
            expires_at,
            created_at,
            votes:forum_poll_votes ( id, user_id, option_id, created_at )
          )
        `,
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      postsData = posts || [];
    } catch {
      // Fallback query without poll relations if tables haven't been migrated yet
      const { data: fallbackPosts } = await supabase
        .from("forum_posts")
        .select(
          `
          *,
          author:profiles!forum_posts_author_id_fkey ( id, name, role, job_title, profile_photo ),
          comments:forum_comments (
            id,
            post_id,
            author_id,
            content,
            created_at,
            author:profiles!forum_comments_author_id_fkey ( id, name, role, job_title, profile_photo )
          ),
          likes:forum_likes ( user_id )
        `,
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      postsData = fallbackPosts || [];
    }

    return postsData.map((p: any) => {
      const likesList = p.likes || [];
      const hasLiked = likesList.some((l: any) => l.user_id === currentUserId);
      const commentsList = (p.comments || [])
        .map((c: any) => ({
          id: c.id,
          postId: c.post_id,
          authorId: c.author_id,
          content: c.content,
          createdAt: c.created_at,
          author: {
            name: c.author?.name || "Unknown User",
            role: c.author?.role || "Employee",
            jobTitle: c.author?.job_title || undefined,
            avatarUrl: sanitizeProfilePhoto(c.author?.profile_photo) || undefined,
          },
        }))
        .sort(
          (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        );

      let formattedPoll: ForumPoll | null = null;
      if (p.poll) {
        const rawPoll = Array.isArray(p.poll) ? p.poll[0] : p.poll;
        if (rawPoll) {
          const rawVotes = (rawPoll.votes || []) as any[];
          const rawOptions = (Array.isArray(rawPoll.options) ? rawPoll.options : []) as {
            id: string;
            text: string;
          }[];
          const totalVotes = rawVotes.length;
          const userVote = rawVotes.find((v: any) => v.user_id === currentUserId);
          const isExpired = new Date(rawPoll.expires_at).getTime() <= Date.now();

          const options: PollOption[] = rawOptions.map((opt) => {
            const count = rawVotes.filter((v: any) => v.option_id === opt.id).length;
            const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            return {
              id: opt.id,
              text: opt.text,
              votesCount: count,
              percentage,
            };
          });

          formattedPoll = {
            id: rawPoll.id,
            companyId: rawPoll.company_id,
            authorId: rawPoll.author_id,
            question: rawPoll.question,
            description: rawPoll.description || undefined,
            options,
            expiresAt: rawPoll.expires_at,
            isExpired,
            totalVotes,
            userVotedOptionId: userVote?.option_id || undefined,
            createdAt: rawPoll.created_at,
          };
        }
      }

      return {
        id: p.id,
        companyId: p.company_id,
        authorId: p.author_id,
        title: p.title,
        content: p.content,
        category: p.category,
        imageUrl: p.image_url || undefined,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        isPinned: p.is_pinned || false,
        postType: p.post_type || (formattedPoll ? "poll" : "discussion"),
        poll: formattedPoll,
        author: {
          name: p.author?.name || "Unknown User",
          role: p.author?.role || "Employee",
          jobTitle: p.author?.job_title || undefined,
          avatarUrl: sanitizeProfilePhoto(p.author?.profile_photo) || undefined,
        },
        commentsList,
        likesCount: likesList.length,
        hasLiked,
      };
    });
  } catch (err) {
    console.error("Error fetching forum posts:", err);
    return [];
  }
}

/**
 * Create a new forum post
 */
export async function createForumPost(post: {
  companyId: string;
  authorId?: string;
  title: string;
  content: string;
  category: "Announcements" | "General" | "Tech" | "HR" | "Events";
  imageUrl?: string;
  isPinned?: boolean;
}): Promise<boolean> {
  try {
    let authorId = post.authorId;
    if (!authorId) {
      const { data: authData } = await supabase.auth.getUser();
      authorId = authData?.user?.id;
    }
    if (!authorId) {
      throw new Error("You must be logged in to create a post.");
    }

    const { error } = await supabase.from("forum_posts").insert([
      {
        company_id: post.companyId,
        author_id: authorId,
        title: post.title,
        content: post.content,
        category: post.category,
        image_url: post.imageUrl || null,
        is_pinned: post.isPinned || false,
      },
    ]);

    if (error) throw error;

    // Announcements are broadcast to every member of the company.
    if (post.category === "Announcements") {
      try {
        const authorName = await getProfileName(post.authorId);
        const { data: members } = await supabase
          .from("profiles")
          .select("id")
          .eq("company_id", post.companyId);
        const targets = (members || [])
          .map((m: any) => m.id)
          .filter((id: string) => id !== post.authorId);
        if (targets.length > 0) {
          await supabase.from("notifications").insert(
            targets.map((userId: string) => ({
              user_id: userId,
              actor_id: post.authorId,
              type: "announcement",
              title: "Company announcement",
              description: `${authorName} posted "${post.title}".`,
              link: "/internal-forum",
            })),
          );
        }
      } catch (notifErr) {
        console.error("Failed to broadcast announcement notification:", notifErr);
      }
    }

    return true;
  } catch (err) {
    console.error("Error creating forum post:", err);
    return false;
  }
}

/**
 * Toggle like status on a post
 */
export async function toggleForumPostLike(
  postId: string,
  userId: string,
  hasLiked: boolean,
): Promise<boolean> {
  try {
    if (hasLiked) {
      const { error } = await supabase
        .from("forum_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", userId);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("forum_likes")
        .insert([{ post_id: postId, user_id: userId }]);
      if (error) throw error;
    }
    return true;
  } catch (err) {
    console.error("Error toggling like:", err);
    return false;
  }
}

/**
 * Add a comment to a forum post
 */
export async function addForumComment(
  postId: string,
  authorIdOrContent: string,
  maybeContent?: string,
): Promise<boolean> {
  try {
    let authorId: string | undefined;
    let content: string;

    if (maybeContent !== undefined) {
      authorId = authorIdOrContent;
      content = maybeContent;
    } else {
      content = authorIdOrContent;
    }

    if (!authorId) {
      const { data: authData } = await supabase.auth.getUser();
      authorId = authData?.user?.id;
    }

    if (!authorId) {
      throw new Error("You must be logged in to comment.");
    }

    const { error } = await supabase.from("forum_comments").insert([
      {
        post_id: postId,
        author_id: authorId,
        content: content,
      },
    ]);

    if (error) throw error;

    // Notify the post author when someone else comments on their post.
    try {
      const { data: post } = await supabase
        .from("forum_posts")
        .select("author_id, title")
        .eq("id", postId)
        .single();
      if (post && post.author_id !== authorId) {
        const commenterName = await getProfileName(authorId);
        await createNotification({
          userId: post.author_id,
          actorId: authorId,
          type: "forum_post",
          title: "New reply on your post",
          description: `${commenterName} commented on "${post.title}".`,
          link: "/internal-forum",
        });
      }
    } catch (notifErr) {
      console.error("Failed to create comment notification:", notifErr);
    }

    return true;
  } catch (err) {
    console.error("Error adding comment:", err);
    return false;
  }
}

/**
 * Create a new forum poll and linked post.
 * Poll voting remains open for exactly 24 hours from creation.
 */
export async function createForumPoll(poll: {
  companyId: string;
  authorId?: string;
  question: string;
  description?: string;
  options: string[];
  category: "Announcements" | "General" | "Tech" | "HR" | "Events";
}): Promise<{ success: boolean; error?: string }> {
  try {
    let authorId = poll.authorId;
    if (!authorId) {
      const { data: authData } = await supabase.auth.getUser();
      authorId = authData?.user?.id;
    }
    if (!authorId) {
      return { success: false, error: "You must be logged in to create a poll." };
    }

    const validOptions = poll.options.map((o) => o.trim()).filter(Boolean);
    if (validOptions.length < 2) {
      return { success: false, error: "A poll must have at least 2 options." };
    }

    const optionsJson = validOptions.map((text, idx) => ({
      id: `opt-${idx + 1}-${Math.random().toString(36).substring(2, 7)}`,
      text,
    }));

    // Poll is valid for 24 hours from creation
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // 1. Insert into forum_polls
    const { data: pollRow, error: pollError } = await supabase
      .from("forum_polls")
      .insert([
        {
          company_id: poll.companyId,
          author_id: authorId,
          question: poll.question.trim(),
          description: poll.description?.trim() || null,
          options: optionsJson,
          expires_at: expiresAt,
        },
      ])
      .select()
      .single();

    if (pollError) throw pollError;

    // 2. Insert into forum_posts as post_type = 'poll'
    const { error: postError } = await supabase.from("forum_posts").insert([
      {
        company_id: poll.companyId,
        author_id: poll.authorId,
        title: poll.question.trim(),
        content: poll.description?.trim() || `Poll: ${poll.question.trim()}`,
        category: poll.category,
        poll_id: pollRow.id,
        post_type: "poll",
      },
    ]);

    if (postError) throw postError;

    // If category is Announcements, broadcast notification
    if (poll.category === "Announcements") {
      try {
        const authorName = await getProfileName(poll.authorId);
        const { data: members } = await supabase
          .from("profiles")
          .select("id")
          .eq("company_id", poll.companyId);
        const targets = (members || [])
          .map((m: any) => m.id)
          .filter((id: string) => id !== poll.authorId);
        if (targets.length > 0) {
          await supabase.from("notifications").insert(
            targets.map((userId: string) => ({
              user_id: userId,
              actor_id: poll.authorId,
              type: "announcement",
              title: "New company poll",
              description: `${authorName} posted a poll: "${poll.question.trim()}".`,
              link: "/internal-forum",
            })),
          );
        }
      } catch (notifErr) {
        console.error("Failed to broadcast poll announcement notification:", notifErr);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error("Error creating forum poll:", err);
    return { success: false, error: err.message || "Failed to create poll." };
  }
}

/**
 * Cast a vote on a forum poll.
 * Checks that the poll is within its 24-hour expiration window.
 */
export async function castPollVote(
  pollId: string,
  userId: string,
  optionId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Fetch poll to check expiration
    const { data: poll, error: pollFetchError } = await supabase
      .from("forum_polls")
      .select("expires_at")
      .eq("id", pollId)
      .single();

    if (pollFetchError) throw pollFetchError;
    if (!poll) return { success: false, error: "Poll not found." };

    if (new Date(poll.expires_at).getTime() <= Date.now()) {
      return { success: false, error: "Voting for this poll has closed (24-hour limit)." };
    }

    // 2. Upsert vote into forum_poll_votes (1 vote per user)
    const { error: voteError } = await supabase.from("forum_poll_votes").upsert(
      {
        poll_id: pollId,
        user_id: userId,
        option_id: optionId,
      },
      { onConflict: "poll_id,user_id" },
    );

    if (voteError) throw voteError;

    return { success: true };
  } catch (err: any) {
    console.error("Error casting poll vote:", err);
    return { success: false, error: err.message || "Failed to submit vote." };
  }
}

/**
 * Check if the user is authorized to create polls on the internal forum.
 * - HR & Admins can always create polls.
 * - Team leads can create polls if company setting `allow_team_lead_polls` is true.
 * - Regular employees cannot create polls.
 */
export async function checkUserCanCreatePoll(
  companyId: string,
  userId: string,
  userRole?: string | null,
): Promise<boolean> {
  const role = (userRole || "").toLowerCase();
  if (role === "admin" || role === "hr" || role === "founder" || role === "superadmin") {
    return true;
  }

  try {
    const { data: comp } = await supabase
      .from("companies")
      .select("allow_team_lead_polls")
      .eq("id", companyId)
      .maybeSingle();

    if (!comp?.allow_team_lead_polls) {
      return false;
    }

    // Check if user is a team lead in teams or team_members
    const { data: leadTeams } = await supabase
      .from("teams")
      .select("id")
      .eq("company_id", companyId)
      .eq("lead_id", userId)
      .limit(1);

    if (leadTeams && leadTeams.length > 0) return true;

    const { data: leadMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "lead")
      .limit(1);

    if (leadMember && leadMember.length > 0) return true;

    return false;
  } catch {
    return false;
  }
}

export function formatPollRemaining(expiresAtStr: string): string {
  const expiresAt = new Date(expiresAtStr).getTime();
  const now = Date.now();
  const remainingMs = expiresAt - now;

  if (remainingMs <= 0) return "Voting closed";

  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m remaining`;
}

function getAdminClient() {
  const url = process.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

/**
 * Server function to delete a forum post with authorization:
 * Admin and HR can delete any post; Authors can delete their own post.
 */
export const deleteForumPostServerFn = createServerFn({ method: "POST" })
  .validator((d: { postId: string; requesterId: string }) => d)
  .handler(async ({ data }): Promise<{ success: boolean; error?: string }> => {
    const admin = getAdminClient();
    if (!admin) return { success: false, error: "Database configuration error" };

    // 1. Fetch post to check ownership and poll association
    const { data: post, error: fetchErr } = await admin
      .from("forum_posts")
      .select("id, author_id, company_id, poll_id")
      .eq("id", data.postId)
      .maybeSingle();

    if (fetchErr || !post) {
      return { success: false, error: "Post not found" };
    }

    // 2. Fetch requester profile to verify role and company
    const { data: requester, error: reqErr } = await admin
      .from("profiles")
      .select("id, role, company_id")
      .eq("id", data.requesterId)
      .maybeSingle();

    if (reqErr || !requester) {
      return { success: false, error: "User profile not found" };
    }

    // Requester must belong to same company
    if (requester.company_id !== post.company_id) {
      return { success: false, error: "Unauthorized" };
    }

    const isHrOrAdmin = requester.role === "admin" || requester.role === "hr";
    const isAuthor = post.author_id === requester.id;

    if (!isHrOrAdmin && !isAuthor) {
      return { success: false, error: "You do not have permission to delete this post." };
    }

    // 3. Delete the post
    const { error: delErr } = await admin
      .from("forum_posts")
      .delete()
      .eq("id", data.postId);

    if (delErr) {
      console.error("Error deleting forum post:", delErr);
      return { success: false, error: delErr.message };
    }

    // 4. If linked to a poll, clean up the poll row as well
    if (post.poll_id) {
      await admin.from("forum_polls").delete().eq("id", post.poll_id);
    }

    return { success: true };
  });

export async function deleteForumPost(postId: string, requesterId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    let resolvedRequesterId = requesterId;
    if (!resolvedRequesterId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      resolvedRequesterId = user?.id;
    }

    if (!resolvedRequesterId) {
      console.error("deleteForumPost: No authenticated user or requester ID found");
      return { success: false, error: "Authentication required to delete post." };
    }

    const res = await deleteForumPostServerFn({ data: { postId, requesterId: resolvedRequesterId } });
    if (!res.success) {
      console.error("Failed to delete post:", res.error);
      return { success: false, error: res.error || "Failed to delete post" };
    }
    return { success: true };
  } catch (err: any) {
    console.error("deleteForumPost exception:", err);
    return { success: false, error: err?.message || "Error deleting post" };
  }
}

