import React, { useState, useEffect, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import Layout from "../components/Layout";
import { DiscussionsSidebar } from "../components/DiscussionsSidebar";
import { supabase } from "../lib/supabase";
import {
  getCompanyForumPosts,
  createForumPost,
  toggleForumPostLike,
  addForumComment,
  uploadForumImage,
  createForumPoll,
  castPollVote,
  checkUserCanCreatePoll,
  deleteForumPost,
  ForumPost,
  FORUM_CATEGORIES,
  ForumCategory,
} from "../lib/forum";
import { sanitizeProfilePhoto } from "../lib/profile-photo";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../components/ui/dialog";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "../components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import {
  ThumbsUp,
  MessageCircle,
  MoreHorizontal,
  Camera,
  BarChart2,
  Send,
  X as Close,
  Trash2 as DeleteOutlined,
  Check,
  CheckCircle2,
  Clock,
  Lock,
  Loader2,
  Plus,
  Compass,
} from "lucide-react";

import { getDynamicPageTitle } from "../lib/tenant-brand";

export const Route = createFileRoute("/internal-forum")({
  validateSearch: (search: Record<string, unknown>): { post?: string } => {
    const raw = search["post"];
    const post = typeof raw === "string" ? raw : undefined;
    return typeof post === "string" ? { post } : {};
  },
  head: () => ({
    title: getDynamicPageTitle("Company Forum"),
    meta: [
      {
        name: "description",
        content: "Forum — share updates, celebrate successes, and collaborate with your team.",
      },
    ],
  }),
  component: InternalForumPage,
});

function InternalForumPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  // Inline composer state
  const [isComposerExpanded, setIsComposerExpanded] = useState(false);
  const [postTitle, setPostTitle] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postCategory, setPostCategory] = useState<ForumCategory>("General");
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);

  // Poll modal state
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [canCreatePoll, setCanCreatePoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollDescription, setPollDescription] = useState("");
  const [pollCategory, setPollCategory] = useState<ForumCategory>("General");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

  // Feed threads state
  const [threads, setThreads] = useState<ForumPost[]>([]);

  // Selected radio option per poll: pollId -> optionId
  const [selectedPollOptions, setSelectedPollOptions] = useState<{ [pollId: string]: string }>({});

  // Expanded comments
  const [expandedComments, setExpandedComments] = useState<{ [postId: string]: boolean }>({});
  const [replyInputs, setReplyInputs] = useState<{ [postId: string]: string }>({});
  const [isSubmittingVote, setIsSubmittingVote] = useState<{ [pollId: string]: boolean }>({});

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchParams = Route.useSearch();
  const highlightedPostId = searchParams.post;

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      let companyId: string | null = null;
      if (typeof window !== "undefined") {
        try {
          const stored = sessionStorage.getItem("impersonated_company");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.id) companyId = parsed.id;
          }
        } catch {}
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name, role, job_title, department, profile_photo, company_id")
        .eq("id", user.id)
        .single();

      if (profile) {
        profile.profile_photo = sanitizeProfilePhoto(profile.profile_photo);
        setUserProfile(profile);
        if (!companyId) companyId = profile.company_id;
      }

      if (companyId) {
        const posts = await getCompanyForumPosts(companyId, user.id);
        setThreads(posts);

        const allowedToPoll = await checkUserCanCreatePoll(companyId, user.id);
        setCanCreatePoll(allowedToPoll);
      }
    } catch (err) {
      console.error("Error loading forum feed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  // Realtime subscription for updates
  useEffect(() => {
    const channel = supabase
      .channel("public:forum-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "forum_posts" },
        () => {
          fetchInitialData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "forum_comments" },
        () => {
          fetchInitialData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Highlight scroll
  useEffect(() => {
    if (!isLoading && highlightedPostId) {
      setTimeout(() => {
        const el = document.getElementById(`forum-feed-${highlightedPostId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("highlighted");
          setTimeout(() => el.classList.remove("highlighted"), 4000);
        }
      }, 300);
    }
  }, [isLoading, highlightedPostId]);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are supported");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB");
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string;
        if (!base64Data) return;

        setIsPublishing(true);
        const toastId = toast.loading("Uploading image...");
        try {
          const res = await uploadForumImage({
            data: {
              base64Data,
              companyId: userProfile?.company_id || "default",
              userId: userProfile?.id || "anonymous",
            },
          });

          if (res?.success && res?.secure_url) {
            setSelectedImageBase64(res.secure_url);
            setIsComposerExpanded(true);
            toast.success("Image attached!", { id: toastId });
          } else {
            toast.error(res?.error || "Failed to upload image", { id: toastId });
          }
        } catch (err: any) {
          toast.error(err?.message || "Failed to upload image", { id: toastId });
        } finally {
          setIsPublishing(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error(err?.message || "Failed to read image file");
    }
  };

  const handlePublishPost = async () => {
    if (!postTitle.trim() || !postBody.trim() || isPublishing || !userProfile?.company_id) {
      if (!postTitle.trim()) toast.error("Please provide a post title.");
      else if (!postBody.trim()) toast.error("Please enter a description.");
      return;
    }

    setIsPublishing(true);
    try {
      const ok = await createForumPost({
        companyId: userProfile.company_id,
        authorId: userProfile.id,
        title: postTitle.trim(),
        content: postBody.trim(),
        category: postCategory,
        imageUrl: selectedImageBase64 || undefined,
      });

      if (ok) {
        setPostTitle("");
        setPostBody("");
        setPostCategory("General");
        setSelectedImageBase64(null);
        setIsComposerExpanded(false);
        await fetchInitialData();
        toast.success("Post published!");
      } else {
        toast.error("Failed to publish post");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to publish post");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCreatePoll = async () => {
    if (!pollQuestion.trim() || isPublishing || !userProfile?.company_id) return;
    const validOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (validOptions.length < 2) {
      toast.error("A poll requires at least 2 options.");
      return;
    }

    setIsPublishing(true);
    try {
      const created = await createForumPoll({
        companyId: userProfile.company_id,
        authorId: userProfile.id,
        question: pollQuestion.trim(),
        description: pollDescription.trim() || undefined,
        category: pollCategory,
        options: validOptions,
      });

      if (created?.success) {
        setPollQuestion("");
        setPollDescription("");
        setPollCategory("General");
        setPollOptions(["", ""]);
        setIsPollModalOpen(false);
        await fetchInitialData();
        toast.success("Poll launched!");
      } else {
        toast.error(created?.error || "Failed to create poll");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to create poll");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleVote = async (pollId: string) => {
    const chosenOptionId = selectedPollOptions[pollId];
    if (!chosenOptionId) {
      toast.error("Please select an option to vote.");
      return;
    }

    if (isSubmittingVote[pollId]) return;
    setIsSubmittingVote((prev) => ({ ...prev, [pollId]: true }));
    try {
      const ok = await castPollVote(pollId, chosenOptionId);
      if (ok) {
        await fetchInitialData();
        toast.success("Vote recorded!");
      } else {
        toast.error("Could not record vote or poll expired.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Error submitting vote");
    } finally {
      setIsSubmittingVote((prev) => ({ ...prev, [pollId]: false }));
    }
  };

  const handleLike = async (postId: string, currentLiked: boolean) => {
    setThreads((prev) =>
      prev.map((t) => {
        if (t.id === postId) {
          return {
            ...t,
            hasLiked: !currentLiked,
            likesCount: currentLiked ? Math.max(0, t.likesCount - 1) : t.likesCount + 1,
          };
        }
        return t;
      })
    );
    await toggleForumPostLike(postId, currentLiked);
  };


  const handleAddComment = async (postId: string) => {
    const text = (replyInputs[postId] || "").trim();
    if (!text) return;

    setReplyInputs((prev) => ({ ...prev, [postId]: "" }));
    const ok = await addForumComment(postId, userProfile?.id, text);
    if (ok) {
      await fetchInitialData();
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    try {
      const res = await deleteForumPost(deleteTarget.id, userProfile?.id);
      if (res.success) {
        setThreads((prev) => prev.filter((t) => t.id !== deleteTarget.id));
        toast.success("Post removed.");
        setDeleteTarget(null);
      } else {
        toast.error(res.error || "Failed to delete post.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Error deleting post");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 60) return "Just now";
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}h ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      const diffDays = Math.floor(diffSec / 86400);
      if (diffDays === 1) return "1 d ago";
      if (diffDays < 7) return `${diffDays} d ago`;
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  const formatPollRemaining = (expiresAtIso?: string) => {
    if (!expiresAtIso) return "";
    const diffMs = new Date(expiresAtIso).getTime() - Date.now();
    if (diffMs <= 0) return "Voting closed";
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (diffDays > 0) return `${diffDays} ${diffDays === 1 ? "day" : "days"} left`;
    if (diffHours > 0) return `${diffHours}h left`;
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${Math.max(1, diffMins)}m left`;
  };

  return (
    <TooltipProvider>
      <Layout activeTab="Discussions" rightSidebar={<DiscussionsSidebar />}>
        <div className="forum-feed-wrapper">
          {/* Top Composer Card */}
          <div className="forum-composer-card">
            {/* Title Row */}
            <div className="forum-composer-input-row">
              <Avatar className="forum-composer-avatar">
                <AvatarImage src={userProfile?.profile_photo} />
                <AvatarFallback>{userProfile?.name?.[0] || "U"}</AvatarFallback>
              </Avatar>

              <input
                type="text"
                placeholder="Title or topic..."
                value={postTitle}
                onFocus={() => setIsComposerExpanded(true)}
                onChange={(e) => setPostTitle(e.target.value)}
                className="forum-composer-text-input"
              />
            </div>

            {/* Description & Image Preview */}
            <div className="forum-composer-expanded-fields">
              <textarea
                placeholder="Write your thoughts, discussion points, or announcement details..."
                value={postBody}
                onFocus={() => setIsComposerExpanded(true)}
                onChange={(e) => setPostBody(e.target.value)}
                rows={isComposerExpanded ? 3 : 2}
                className="forum-composer-body-field"
              />

              {selectedImageBase64 && (
                <div className="forum-composer-img-preview-box">
                  <img src={selectedImageBase64} alt="Upload preview" />
                  <button
                    type="button"
                    onClick={() => setSelectedImageBase64(null)}
                    className="forum-composer-img-close-btn"
                  >
                    <Close style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              )}
            </div>

            {/* Composer Action Buttons Bar */}
            <div className="forum-composer-bottom-bar">
              <div className="forum-composer-tools-group">
                {/* Category Selector */}
                <select
                  value={postCategory}
                  onChange={(e) => setPostCategory(e.target.value as ForumCategory)}
                  aria-label="Post category"
                  style={{
                    height: 30,
                    padding: "0 8px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 6,
                    border: "1px solid #e4e4e7",
                    background: "#f4f4f5",
                    color: "#27272a",
                    cursor: "pointer",
                    outline: "none",
                  }}
                >
                  {FORUM_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                {/* Photo Upload */}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  ref={fileInputRef}
                  onChange={handleImageChange}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="forum-composer-tool-btn"
                >
                  <Camera style={{ width: 16, height: 16 }} />
                  <span>Photo</span>
                </button>

                {/* Poll */}
                <button
                  type="button"
                  onClick={() => setIsPollModalOpen(true)}
                  className="forum-composer-tool-btn"
                >
                  <BarChart2 style={{ width: 16, height: 16 }} />
                  <span>Poll</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handlePublishPost}
                disabled={isPublishing || !postTitle.trim() || !postBody.trim()}
                className="forum-composer-post-submit-btn"
              >
                {isPublishing ? (
                  <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                ) : (
                  "Post"
                )}
              </button>
            </div>
          </div>

          {/* Feed Posts Stream */}
          <div className="forum-feed-list">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="forum-feed-card">
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div className="skeleton-box" style={{ width: 40, height: 40, borderRadius: "50%" }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                      <div className="skeleton-box" style={{ height: 15, width: "30%" }} />
                      <div className="skeleton-box" style={{ height: 12, width: "20%" }} />
                    </div>
                  </div>
                  <div className="skeleton-box" style={{ height: 18, width: "65%", margin: "6px 0" }} />
                  <div className="skeleton-box" style={{ height: 160, width: "100%", borderRadius: 10 }} />
                </div>
              ))
            ) : threads.length === 0 ? (
              <div className="forum-feed-card" style={{ textAlign: "center", padding: "40px 16px" }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: "#18181b", margin: 0 }}>
                  No posts yet in the internal forum
                </p>
                <p style={{ fontSize: 13, color: "#71717a", margin: "4px 0 0" }}>
                  Be the first one to share an update with your team!
                </p>
              </div>
            ) : (
              threads.map((thread) => {
                const showComments = !!expandedComments[thread.id];
                const isModerator = userProfile?.role === "admin" || userProfile?.role === "hr";
                const canDelete = isModerator || (Boolean(userProfile?.id) && thread.authorId === userProfile.id);

                return (
                  <div
                    key={thread.id}
                    id={`forum-feed-${thread.id}`}
                    className="forum-feed-card"
                  >
                    {/* Header Row */}
                    <div className="forum-feed-card-header">
                      <div className="forum-feed-card-author-left">
                        <Avatar className="forum-feed-card-avatar">
                          <AvatarImage src={thread.author.avatarUrl || undefined} />
                          <AvatarFallback>{thread.author.name?.[0] || "U"}</AvatarFallback>
                        </Avatar>
                        <div className="forum-feed-card-author-meta">
                          <span className="forum-feed-card-author-name">{thread.author.name}</span>
                          <div className="forum-feed-card-subline">
                            <span>{thread.author.jobTitle || thread.author.role || thread.category}</span>
                          </div>
                        </div>
                      </div>

                      {canDelete && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget({ id: thread.id, title: thread.title })}
                              className="forum-feed-card-more-btn"
                            >
                              <MoreHorizontal style={{ width: 18, height: 18 }} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left">Delete post</TooltipContent>
                        </Tooltip>
                      )}
                    </div>

                    {/* Post Title / Headline */}
                    {thread.title && (
                      <h3 className="forum-feed-card-title">{thread.title}</h3>
                    )}

                    {/* Post Body Content */}
                    {(!thread.poll ||
                      (thread.poll.description &&
                        thread.poll.description !== `Poll: ${thread.poll.question}` &&
                        thread.poll.description !== thread.title)) && (
                      <p className="forum-feed-card-body">
                        {thread.poll?.description || thread.content}
                      </p>
                    )}

                    {/* Image Attachment */}
                    {thread.imageUrl && (
                      <div className="forum-feed-card-media">
                        <img src={thread.imageUrl} alt="Post attachment" />
                      </div>
                    )}

                    {/* Salado Reference Poll Component */}
                    {thread.postType === "poll" && thread.poll && (() => {
                      const poll = thread.poll;
                      const hasUserVoted = Boolean(poll.userVotedOptionId);
                      const showResults = hasUserVoted || poll.isExpired;
                      const selectedOptionId = selectedPollOptions[poll.id];

                      return (
                        <div className="forum-poll-container">
                          {showResults ? (
                            /* Results View (When Voted or Closed) */
                            <div className="forum-poll-options-list">
                              {poll.options.map((option) => {
                                const isUserChoice = poll.userVotedOptionId === option.id;

                                return (
                                  <div
                                    key={option.id}
                                    className={`forum-poll-result-pill ${isUserChoice ? "user-voted" : ""}`}
                                  >
                                    {/* Animated background progress fill */}
                                    <div
                                      className="forum-poll-result-fill"
                                      style={{ width: `${option.percentage}%` }}
                                    />

                                    {/* Text and percentage content sitting above fill */}
                                    <div className="forum-poll-result-content">
                                      <div className="forum-poll-result-left">
                                        {isUserChoice && (
                                          <CheckCircle2
                                            style={{
                                              width: 17,
                                              height: 17,
                                              color: "#23382c",
                                              flexShrink: 0,
                                            }}
                                          />
                                        )}
                                        <span className="forum-poll-result-text">{option.text}</span>
                                      </div>
                                      <span className="forum-poll-result-pct">{option.percentage}%</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            /* Voting View (Salado Reference: Option Cards with Radio Selection) */
                            <div className="forum-poll-options-list">
                              {poll.options.map((option) => {
                                const isSelected = selectedOptionId === option.id;

                                return (
                                  <div
                                    key={option.id}
                                    onClick={() =>
                                      setSelectedPollOptions((prev) => ({
                                        ...prev,
                                        [poll.id]: option.id,
                                      }))
                                    }
                                    className={`forum-poll-option-card ${isSelected ? "selected" : ""}`}
                                  >
                                    <span className="forum-poll-option-name">{option.text}</span>

                                    {/* Radio Button */}
                                    <div className="forum-poll-radio-outer">
                                      {isSelected && <div className="forum-poll-radio-inner" />}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Poll Footer Row */}
                          <div className="forum-poll-footer-row">
                            <span className="forum-poll-stats-text">
                              {poll.totalVotes} {poll.totalVotes === 1 ? "vote" : "votes"} ·{" "}
                              {poll.isExpired ? "Voting closed" : formatPollRemaining(poll.expiresAt)}
                            </span>

                            {!showResults && (
                              <button
                                type="button"
                                onClick={() => handleVote(poll.id)}
                                disabled={isSubmittingVote[poll.id] || !selectedOptionId}
                                className="forum-poll-submit-btn"
                              >
                                {isSubmittingVote[poll.id] ? (
                                  <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                                ) : (
                                  "Vote"
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Actions Row (Upvote, Comments, Date) */}
                    <div className="forum-feed-card-footer">
                      <span className="forum-feed-card-date-left">
                        {formatTime(thread.createdAt)}
                      </span>

                      <div className="forum-feed-card-actions-right">
                        {/* Thumbs Up / Upvote */}
                        <button
                          type="button"
                          onClick={() => handleLike(thread.id, thread.hasLiked)}
                          className={`forum-feed-action-btn ${thread.hasLiked ? "active-like" : ""}`}
                          aria-label={thread.hasLiked ? "Remove upvote" : "Upvote post"}
                          aria-pressed={thread.hasLiked}
                        >
                          <ThumbsUp
                            style={{
                              width: 18,
                              height: 18,
                              fill: thread.hasLiked ? "#23382c" : "none",
                              color: thread.hasLiked ? "#23382c" : "#71717a",
                            }}
                          />
                          <span
                            style={{
                              color: thread.hasLiked ? "#23382c" : "#52525b",
                              fontWeight: thread.hasLiked ? 600 : 500,
                            }}
                          >
                            {thread.likesCount}
                          </span>
                        </button>

                        {/* Speech Bubble / Comment */}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedComments((prev) => ({
                              ...prev,
                              [thread.id]: !prev[thread.id],
                            }))
                          }
                          className="forum-feed-action-btn"
                          aria-label={`${thread.commentsList.length} comments. Click to toggle comment thread`}
                          aria-expanded={showComments}
                        >
                          <MessageCircle style={{ width: 18, height: 18, color: "#71717a" }} />
                          <span style={{ color: "#52525b", fontWeight: 500 }}>{thread.commentsList.length}</span>
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Comments Section */}
                    {showComments && (
                      <div className="forum-feed-comments-section">
                        {/* Reply Input */}
                        <div className="forum-feed-comment-composer">
                          <Avatar style={{ width: 30, height: 30, fontSize: 11, fontWeight: 600 }}>
                            <AvatarImage src={userProfile?.profile_photo} />
                            <AvatarFallback>{userProfile?.name?.[0] || "U"}</AvatarFallback>
                          </Avatar>
                          <input
                            type="text"
                            placeholder="Write a comment..."
                            value={replyInputs[thread.id] || ""}
                            onChange={(e) =>
                              setReplyInputs((prev) => ({
                                ...prev,
                                [thread.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddComment(thread.id);
                              }
                            }}
                            className="forum-feed-comment-input"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddComment(thread.id)}
                            disabled={!(replyInputs[thread.id] || "").trim()}
                            className="forum-feed-comment-send"
                          >
                            <Send style={{ width: 13, height: 13 }} />
                          </button>
                        </div>

                        {/* Comments List */}
                        {thread.commentsList.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {thread.commentsList.map((comment) => (
                              <div key={comment.id} className="forum-feed-comment-bubble">
                                <Avatar style={{ width: 28, height: 28, fontSize: 10, fontWeight: 600 }}>
                                  <AvatarImage src={comment.author.avatarUrl || undefined} />
                                  <AvatarFallback>{comment.author.name?.[0] || "U"}</AvatarFallback>
                                </Avatar>
                                <div className="forum-feed-comment-box">
                                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span className="forum-feed-comment-author-name">{comment.author.name}</span>
                                    <span className="forum-feed-comment-time">{formatTime(comment.createdAt)}</span>
                                  </div>
                                  <p className="forum-feed-comment-text">{comment.content}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ fontSize: 12.5, color: "#a1a1aa", textAlign: "center", margin: "4px 0" }}>
                            No comments yet. Start the conversation!
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Team Poll Modal */}
        <Dialog open={isPollModalOpen} onOpenChange={(open) => !open && !isPublishing && setIsPollModalOpen(false)}>
          <DialogContent style={{ maxWidth: 540 }}>
            <DialogHeader>
              <DialogTitle>Create a 24h Team Poll</DialogTitle>
            </DialogHeader>

            <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "10px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, backgroundColor: "#f4f4f5", fontSize: 12.5, color: "#52525b" }}>
                <Clock style={{ width: 14, height: 14, flexShrink: 0 }} />
                <span>24-Hour Polling Window: Automatically closes in 24 hours.</span>
              </div>

              <input
                type="text"
                placeholder="Which activity should we plan for the next team outing?"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                disabled={isPublishing}
                className="form-input"
                style={{ fontWeight: 600, fontSize: 14 }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12.5, fontWeight: 500, color: "#52525b" }}>Category</label>
                <select
                  value={pollCategory}
                  onChange={(e) => setPollCategory(e.target.value as ForumCategory)}
                  disabled={isPublishing}
                  className="form-input"
                  style={{ height: 34, fontSize: 13, background: "#fff" }}
                >
                  {FORUM_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                placeholder="Add optional description or context..."
                rows={2}
                value={pollDescription}
                onChange={(e) => setPollDescription(e.target.value)}
                disabled={isPublishing}
                className="form-input"
                style={{ resize: "vertical", minHeight: 60, fontSize: 13 }}
              />

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#18181b" }}>
                  Poll Options (2 to 6)
                </span>
                {pollOptions.map((opt, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#a1a1aa", minWidth: 18 }}>
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      placeholder={`Option ${idx + 1} (e.g. Trek & Nature)...`}
                      value={opt}
                      onChange={(e) => {
                        const copy = [...pollOptions];
                        copy[idx] = e.target.value;
                        setPollOptions(copy);
                      }}
                      disabled={isPublishing}
                      className="form-input"
                      style={{ flex: 1, height: 34, fontSize: 13 }}
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                        className="btn-icon"
                        style={{ width: 28, height: 28 }}
                      >
                        <Close style={{ width: 13, height: 13 }} />
                      </button>
                    )}
                  </div>
                ))}

                {pollOptions.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setPollOptions([...pollOptions, ""])}
                    className="btn btn-secondary"
                    style={{ alignSelf: "flex-start", height: 28, padding: "0 10px", fontSize: 12 }}
                  >
                    <Plus style={{ width: 12, height: 12, marginRight: 4 }} />
                    Add Option ({pollOptions.length}/6)
                  </button>
                )}
              </div>
            </div>

            <DialogFooter>
              <button
                type="button"
                onClick={() => setIsPollModalOpen(false)}
                disabled={isPublishing}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreatePoll}
                disabled={isPublishing || !pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2}
                className="btn btn-primary"
                style={{ backgroundColor: "#23382c" }}
              >
                {isPublishing ? (
                  <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                ) : (
                  "Launch Poll"
                )}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Post Modal */}
        <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !isDeleting && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Post?</DialogTitle>
            </DialogHeader>
            <p style={{ fontSize: 14, color: "#52525b", margin: "10px 0" }}>
              Are you sure you want to delete <strong style={{ color: "#18181b" }}>"{deleteTarget?.title}"</strong>? This will permanently remove the post and comments.
            </p>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="btn btn-primary"
                style={{ backgroundColor: "#ef4444" }}
              >
                {isDeleting ? (
                  <Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />
                ) : (
                  "Delete Post"
                )}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Layout>
    </TooltipProvider>
  );
}
