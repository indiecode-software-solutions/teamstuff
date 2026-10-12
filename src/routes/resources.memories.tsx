import React, { useState, useEffect, useMemo, useRef } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, EffectCards, Navigation, Pagination } from "swiper/modules";
import "swiper/css";
import "swiper/css/effect-cards";
import "swiper/css/navigation";
import "swiper/css/pagination";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import {
  Images,
  X,
  Heart,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Search,
  MapPin,
  Calendar,
  Sparkles,
  Camera,
  Layers,
  Smile,
  ShieldCheck,
} from "lucide-react";
import { getMyCompanyId, getCompanyMemories, toggleMemoryLike } from "../lib/memories";
import { supabase } from "../lib/supabase";

export const Route = createFileRoute("/resources/memories")({
  head: () => ({
    title: "CapOasis | Company Memories & Photo Gallery",
    meta: [
      {
        name: "description",
        content: "Showcasing company milestones, celebrations, offsites, and team memories at CapOasis.",
      },
    ],
  }),
  component: MemoriesPage,
});

interface Memory {
  id: string;
  title: string;
  date: string;
  rawDate: string;
  location: string;
  image: string;
  category: "Team Building" | "Celebrations" | "Workshops" | "Offsite";
  likes: number;
  hasLiked: boolean;
  attendees: string[];
}

function formatMemoryDate(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
}

const CATEGORIES: Array<"Team Building" | "Celebrations" | "Workshops" | "Offsite"> = [
  "Offsite",
  "Team Building",
  "Celebrations",
  "Workshops",
];

function MemoriesPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const companyId = await getMyCompanyId();
        if (!companyId || cancelled) {
          setIsLoading(false);
          return;
        }

        const rows = await getCompanyMemories(companyId);
        if (cancelled) return;

        setMemories(
          rows.map((r) => ({
            id: r.id,
            title: r.title,
            date: formatMemoryDate(r.date),
            rawDate: r.date,
            location: r.location || "",
            image: r.image,
            category: r.category,
            likes: r.likes,
            hasLiked: r.hasLiked,
            attendees: r.attendees || [],
          }))
        );
      } catch (err) {
        console.error("Error loading memories:", err);
        toast.error("Failed to load company photo gallery.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const totalLikes = useMemo(
    () => memories.reduce((sum, m) => sum + (m.likes || 0), 0),
    [memories]
  );

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: memories.length };
    memories.forEach((m) => {
      counts[m.category] = (counts[m.category] || 0) + 1;
    });
    return counts;
  }, [memories]);

  // Grouped memories for carousel sections
  const groupedMemories = useMemo(
    () => ({
      Offsite: memories.filter((m) => m.category === "Offsite"),
      Workshops: memories.filter((m) => m.category === "Workshops"),
      "Team Building": memories.filter((m) => m.category === "Team Building"),
      Celebrations: memories.filter((m) => m.category === "Celebrations"),
    }),
    [memories]
  );

  // Filtered list based on search and selected category
  const filteredMemories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return memories.filter((m) => {
      const matchCat = activeCategory === "All" || m.category === activeCategory;
      if (!matchCat) return false;

      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.location.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.attendees.some((a) => a.toLowerCase().includes(q))
      );
    });
  }, [memories, activeCategory, searchQuery]);

  const handleLike = async (memoryId: string, currentLikedState: boolean) => {
    if (!currentUserId) {
      toast.info("Please log in to like photos.");
      return;
    }

    const prevMemories = memories;
    // Optimistic UI update
    setMemories((all) =>
      all.map((m) =>
        m.id === memoryId
          ? {
              ...m,
              likes: m.likes + (m.hasLiked ? -1 : 1),
              hasLiked: !m.hasLiked,
            }
          : m
      )
    );

    if (selectedMemory && selectedMemory.id === memoryId) {
      setSelectedMemory((prev) =>
        prev
          ? {
              ...prev,
              likes: prev.likes + (prev.hasLiked ? -1 : 1),
              hasLiked: !prev.hasLiked,
            }
          : null
      );
    }

    const ok = await toggleMemoryLike(memoryId, currentUserId, currentLikedState);
    if (!ok) {
      setMemories(prevMemories);
      toast.error("Failed to update like status.");
    }
  };

  return (
    <div className="memories-page-wrapper">
      {/* Header & Breadcrumb Card */}
      <div className="memories-header-card">
        <div className="memories-breadcrumb-row">
          <Link to="/resources" className="memories-breadcrumb-link">
            Resources
          </Link>
          <span className="memories-breadcrumb-sep">/</span>
          <span className="memories-breadcrumb-current">Company Memories</span>
        </div>

        <div className="memories-header-main">
          <div className="memories-title-group">
            <h1 className="memories-title">Company Memories & Gallery</h1>
            <p className="memories-subtitle">
              Capturing milestones, celebrations, team retreats, and daily wins that define our culture.
            </p>
          </div>

          <div className="memories-header-actions">
            <div className="memories-search-wrap">
              <Search size={15} className="memories-search-icon" />
              <input
                type="text"
                placeholder="Search memories, locations, tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="memories-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: "10px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
                    padding: 0,
                    display: "flex",
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <Link
              to="/resources"
              className="btn btn-secondary"
              style={{ height: "38px", gap: "6px" }}
            >
              <ArrowLeft size={14} />
              <span>Back to Resources</span>
            </Link>
          </div>
        </div>

        {/* Live Gallery Metrics Bar */}
        <div className="memories-stats-bar">
          <div className="memories-stat-item">
            <Images size={14} style={{ color: "var(--color-text-secondary)" }} />
            <span>Total Memories:</span>
            <strong>{memories.length}</strong>
          </div>

          <div className="memories-stat-item">
            <Heart size={14} style={{ color: "#ef4444" }} />
            <span>Appreciations:</span>
            <strong>{totalLikes}</strong>
          </div>

          <div className="memories-stat-item">
            <Layers size={14} style={{ color: "var(--color-text-secondary)" }} />
            <span>Categories:</span>
            <strong>{CATEGORIES.length}</strong>
          </div>

          <div className="memories-stat-item" style={{ marginLeft: "auto" }}>
            <ShieldCheck size={14} style={{ color: "#059669" }} />
            <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>
              Culture & Team Milestones
            </span>
          </div>
        </div>
      </div>

      {/* Category Filter Bar */}
      <div className="memories-filter-bar">
        <button
          onClick={() => setActiveCategory("All")}
          className={`memories-filter-pill ${activeCategory === "All" ? "is-active" : ""}`}
        >
          All Memories
          <span className="memories-filter-count">{categoryCounts["All"] || 0}</span>
        </button>

        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`memories-filter-pill ${activeCategory === cat ? "is-active" : ""}`}
          >
            {cat}
            <span className="memories-filter-count">{categoryCounts[cat] || 0}</span>
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="memories-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="skeleton-box"
              style={{ height: "240px", borderRadius: "14px" }}
            />
          ))}
        </div>
      ) : memories.length === 0 ? (
        <div className="hub-empty-state" style={{ minHeight: "340px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "50%",
              backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "14px",
              color: "var(--color-text-muted)",
            }}
          >
            <Camera size={24} />
          </div>
          <h2 className="hub-empty-title">No memories published yet</h2>
          <p className="hub-empty-desc" style={{ maxWidth: "420px", textAlign: "center" }}>
            Check back soon — the HR and leadership teams will publish photos from retreats, celebrations, and workshops right here.
          </p>
          <div style={{ marginTop: "16px" }}>
            <Link to="/resources" className="btn btn-secondary">
              Return to Resources
            </Link>
          </div>
        </div>
      ) : activeCategory === "All" && !searchQuery ? (
        /* Default curated view with Carousels & Highlights */
        <div>
          {/* Section 1: Offsites */}
          <MemorySection
            title="Company Offsites & Retreats"
            memories={groupedMemories.Offsite}
            onSelectMemory={setSelectedMemory}
            onLike={handleLike}
          />

          {/* Highlights & Milestone Banner */}
          <div className="memories-highlights-card">
            {/* Left Column: Highlight Moments 3D Swiper */}
            <div style={{ minWidth: 0 }}>
              <Swiper
                effect="cards"
                grabCursor
                modules={[EffectCards, Autoplay, Pagination]}
                autoplay={{ delay: 3500, disableOnInteraction: false }}
                pagination={{ clickable: true }}
                style={{ width: "260px", height: "340px", margin: "0 auto" }}
              >
                {memories.slice(0, 8).map((m) => (
                  <SwiperSlide
                    key={m.id}
                    onClick={() => setSelectedMemory(m)}
                    style={{
                      borderRadius: "14px",
                      overflow: "hidden",
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.2)",
                      cursor: "pointer",
                      backgroundColor: "#000",
                    }}
                  >
                    <img
                      src={m.image}
                      alt={m.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </SwiperSlide>
                ))}
              </Swiper>
            </div>

            {/* Right Column: Statistics & Milestone info */}
            <div className="memories-highlights-info">
              <span className="memories-highlights-tag">
                <Sparkles size={13} />
                Culture Milestones
              </span>

              <h3 className="memories-highlights-title">
                {memories.length} Moments Captured & Counting
              </h3>

              <p className="memories-highlights-desc">
                Every team milestone, quarterly celebration, product launch, and daily win is archived here. Our workplace culture is created and shaped by the teammates who live it.
              </p>

              <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => setActiveCategory("Celebrations")}
                  className="btn btn-primary"
                  style={{ height: "36px", padding: "0 16px" }}
                >
                  View Celebrations
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCategory("Team Building")}
                  className="btn btn-secondary"
                  style={{ height: "36px", padding: "0 16px" }}
                >
                  View Team Bonding
                </button>
              </div>
            </div>
          </div>

          {/* Section 2: Team Building */}
          <MemorySection
            title="Team Bonding & Activities"
            memories={groupedMemories["Team Building"]}
            onSelectMemory={setSelectedMemory}
            onLike={handleLike}
          />

          {/* Section 3: Celebrations */}
          <MemorySection
            title="Company Celebrations"
            memories={groupedMemories.Celebrations}
            onSelectMemory={setSelectedMemory}
            onLike={handleLike}
          />

          {/* Section 4: Workshops */}
          {groupedMemories.Workshops.length > 0 && (
            <MemorySection
              title="Workshops & Learning"
              memories={groupedMemories.Workshops}
              onSelectMemory={setSelectedMemory}
              onLike={handleLike}
            />
          )}

          {/* Interactive Polaroid Memory Deck */}
          {memories.length >= 5 && (
            <InteractivePolaroidStack
              memories={memories}
              onSelectMemory={setSelectedMemory}
            />
          )}
        </div>
      ) : (
        /* Filtered Grid View */
        filteredMemories.length === 0 ? (
          <div className="hub-empty-state" style={{ minHeight: "320px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
                border: "1px solid var(--color-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "14px",
                color: "var(--color-text-muted)",
              }}
            >
              <Images size={22} />
            </div>
            <h2 className="hub-empty-title">
              {searchQuery ? "No matching memories found" : "No memories in this category"}
            </h2>
            <p className="hub-empty-desc" style={{ maxWidth: "420px", textAlign: "center" }}>
              {searchQuery
                ? `No photos matched "${searchQuery}". Try searching by event name or city location.`
                : "Try selecting 'All Memories' to view photos across all categories."}
            </p>
            <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="btn btn-secondary">
                  Clear Search
                </button>
              )}
              {activeCategory !== "All" && (
                <button onClick={() => setActiveCategory("All")} className="btn btn-secondary">
                  Show All Memories
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="memories-grid">
            {filteredMemories.map((memory) => (
              <div
                key={memory.id}
                onClick={() => setSelectedMemory(memory)}
                className="memories-card"
              >
                <img
                  src={memory.image}
                  alt={memory.title}
                  className="memories-card-img"
                  loading="lazy"
                />

                <div className="memories-card-overlay" />

                <div className="memories-card-content">
                  <div className="memories-card-top-tags">
                    <span className="memories-card-cat-badge">{memory.category}</span>
                    <span className="memories-card-date">{memory.date}</span>
                  </div>

                  <h3 className="memories-card-title">{memory.title}</h3>

                  <div className="memories-card-bottom-row">
                    <div className="memories-card-location">
                      {memory.location && (
                        <>
                          <MapPin size={12} style={{ flexShrink: 0 }} />
                          <span>{memory.location}</span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLike(memory.id, memory.hasLiked);
                      }}
                      className={`memories-like-btn ${memory.hasLiked ? "is-liked" : ""}`}
                      title={memory.hasLiked ? "Unlike" : "Like"}
                    >
                      <Heart size={12} fill={memory.hasLiked ? "#ffffff" : "none"} />
                      <span>{memory.likes}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Cinematic Image Viewer Modal / Lightbox */}
      <Dialog.Root
        open={!!selectedMemory}
        onOpenChange={(open) => !open && setSelectedMemory(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay
            className="hub-modal-overlay"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.94)" }}
          />
          <Dialog.Content
            style={{
              position: "fixed",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              zIndex: 60,
              outline: "none",
            }}
          >
            <Dialog.Close asChild>
              <button
                className="btn-icon"
                style={{
                  position: "absolute",
                  top: "20px",
                  right: "20px",
                  width: "40px",
                  height: "40px",
                  color: "#ffffff",
                  backgroundColor: "rgba(255, 255, 255, 0.15)",
                  borderRadius: "50%",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  cursor: "pointer",
                }}
                title="Close viewer"
              >
                <X size={20} />
              </button>
            </Dialog.Close>

            {selectedMemory &&
              (() => {
                const list = filteredMemories.length > 0 ? filteredMemories : memories;
                const activeIndex = list.findIndex((m) => m.id === selectedMemory.id);

                const handlePrev = () => {
                  if (activeIndex > 0) {
                    setSelectedMemory(list[activeIndex - 1]);
                  } else if (list.length > 0) {
                    setSelectedMemory(list[list.length - 1]);
                  }
                };

                const handleNext = () => {
                  if (activeIndex < list.length - 1) {
                    setSelectedMemory(list[activeIndex + 1]);
                  } else if (list.length > 0) {
                    setSelectedMemory(list[0]);
                  }
                };

                return (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      maxWidth: "1040px",
                      width: "100%",
                      gap: "16px",
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        maxHeight: "72vh",
                        maxWidth: "92vw",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <img
                        src={selectedMemory.image}
                        alt={selectedMemory.title}
                        style={{
                          maxHeight: "72vh",
                          maxWidth: "92vw",
                          objectFit: "contain",
                          borderRadius: "12px",
                          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                        }}
                      />
                    </div>

                    {/* Bottom Navigation & Meta Bar */}
                    <div
                      style={{
                        padding: "10px 20px",
                        borderRadius: "30px",
                        backgroundColor: "rgba(255, 255, 255, 0.12)",
                        backdropFilter: "blur(12px)",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "20px",
                        maxWidth: "680px",
                        width: "100%",
                        color: "#ffffff",
                      }}
                    >
                      <button
                        type="button"
                        onClick={handlePrev}
                        className="btn-icon"
                        style={{ color: "#ffffff", width: "32px", height: "32px" }}
                        title="Previous photo"
                      >
                        <ChevronLeft size={22} />
                      </button>

                      <div style={{ textAlign: "center", minWidth: 0, flex: 1 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "#ffffff",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {selectedMemory.title}
                        </p>
                        <p style={{ margin: "2px 0 0 0", fontSize: "11.5px", color: "rgba(255, 255, 255, 0.75)" }}>
                          {selectedMemory.category} • {selectedMemory.date}
                          {selectedMemory.location ? ` • ${selectedMemory.location}` : ""}
                        </p>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <button
                          type="button"
                          onClick={() => handleLike(selectedMemory.id, selectedMemory.hasLiked)}
                          className={`memories-like-btn ${selectedMemory.hasLiked ? "is-liked" : ""}`}
                          style={{ padding: "6px 12px" }}
                        >
                          <Heart size={14} fill={selectedMemory.hasLiked ? "#ffffff" : "none"} />
                          <span>{selectedMemory.likes}</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleNext}
                          className="btn-icon"
                          style={{ color: "#ffffff", width: "32px", height: "32px" }}
                          title="Next photo"
                        >
                          <ChevronRight size={22} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

// Reusable Category Section Component
function MemorySection({
  title,
  memories,
  onSelectMemory,
  onLike,
}: {
  title: string;
  memories: Memory[];
  onSelectMemory: (m: Memory) => void;
  onLike: (memoryId: string, hasLiked: boolean) => void;
}) {
  if (memories.length === 0) return null;

  const slug = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const prevClass = `swiper-prev-${slug}`;
  const nextClass = `swiper-next-${slug}`;

  return (
    <div className="memories-section">
      <div className="memories-section-header">
        <div className="memories-section-title-wrap">
          <h2 className="memories-section-title">{title}</h2>
          <span className="memories-section-count">
            {memories.length} photo{memories.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="memories-carousel-nav">
          <button
            type="button"
            className={`${prevClass} memories-nav-btn`}
            title="Previous photos"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            className={`${nextClass} memories-nav-btn`}
            title="Next photos"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div style={{ width: "100%" }}>
        <Swiper
          modules={[Navigation, Pagination, Autoplay]}
          spaceBetween={18}
          slidesPerView={1}
          navigation={{
            prevEl: `.${prevClass}`,
            nextEl: `.${nextClass}`,
          }}
          pagination={{ clickable: true }}
          autoplay={{ delay: 6000, disableOnInteraction: false }}
          breakpoints={{
            640: { slidesPerView: 2 },
            1024: { slidesPerView: 3 },
          }}
          style={{ paddingBottom: "28px" }}
        >
          {memories.map((memory) => (
            <SwiperSlide key={memory.id} style={{ height: "auto" }}>
              <div
                onClick={() => onSelectMemory(memory)}
                className="memories-card"
              >
                <img
                  src={memory.image}
                  alt={memory.title}
                  className="memories-card-img"
                  loading="lazy"
                />

                <div className="memories-card-overlay" />

                <div className="memories-card-content">
                  <div className="memories-card-top-tags">
                    <span className="memories-card-cat-badge">{memory.category}</span>
                    <span className="memories-card-date">{memory.date}</span>
                  </div>

                  <h3 className="memories-card-title">{memory.title}</h3>

                  <div className="memories-card-bottom-row">
                    <div className="memories-card-location">
                      {memory.location && (
                        <>
                          <MapPin size={12} style={{ flexShrink: 0 }} />
                          <span>{memory.location}</span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLike(memory.id, memory.hasLiked);
                      }}
                      className={`memories-like-btn ${memory.hasLiked ? "is-liked" : ""}`}
                      title={memory.hasLiked ? "Unlike" : "Like"}
                    >
                      <Heart size={12} fill={memory.hasLiked ? "#ffffff" : "none"} />
                      <span>{memory.likes}</span>
                    </button>
                  </div>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </div>
  );
}

// Interactive Polaroid Stack Component
function InteractivePolaroidStack({
  memories,
  onSelectMemory,
}: {
  memories: Memory[];
  onSelectMemory: (m: Memory) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const inView = rect.top < viewportHeight * 0.6 && rect.bottom > viewportHeight * 0.4;
      setIsOpen(inView);
    };

    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll, { capture: true });
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        margin: "24px 0 36px",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "16px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 4px 0" }}>
          Polaroid Keepsakes
        </h3>
        <p style={{ fontSize: "12.5px", color: "var(--color-text-muted)", margin: 0 }}>
          Scroll or hover over the deck to spread the collection
        </p>
      </div>

      <div
        style={{
          height: "320px",
          width: "100%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
          overflow: "visible",
          perspective: "1500px",
        }}
      >
        {memories.slice(0, 7).map((memory, index) => {
          const rotation = isOpen ? (index - 3) * 12 : (index - 3) * 3;
          const translationX = isOpen ? (index - 3) * 120 : 0;
          const translationY = isOpen ? Math.abs(index - 3) * 10 - 15 : 0;

          return (
            <div
              key={memory.id}
              onClick={() => onSelectMemory(memory)}
              style={{
                position: "absolute",
                width: "200px",
                height: "260px",
                padding: "10px",
                paddingBottom: "24px",
                backgroundColor: "var(--color-surface, #ffffff)",
                border: "1px solid var(--color-border)",
                borderRadius: "10px",
                boxShadow: "0 8px 24px -4px rgba(0, 0, 0, 0.12)",
                cursor: "pointer",
                transition: "all 700ms cubic-bezier(0.16, 1, 0.3, 1)",
                transform: `translateX(${translationX}px) translateY(${translationY}px) rotate(${rotation}deg)`,
                zIndex: 10 - Math.abs(index - 3),
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "180px",
                  overflow: "hidden",
                  borderRadius: "6px",
                  backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
                }}
              >
                <img
                  src={memory.image}
                  alt={memory.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  loading="lazy"
                />
              </div>
              <div style={{ marginTop: "8px", textAlign: "center", padding: "0 4px" }}>
                <p
                  style={{
                    fontWeight: 500,
                    fontSize: "12px",
                    color: "var(--color-text-primary)",
                    margin: "0 0 2px 0",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {memory.title}
                </p>
                <p style={{ fontSize: "11px", color: "var(--color-text-muted)", margin: 0 }}>
                  {memory.date}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
