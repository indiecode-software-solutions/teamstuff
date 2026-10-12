import React, { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Users,
  Shield,
  Code2,
  TrendingUp,
  Megaphone,
  UserCheck,
  CreditCard,
  Headphones,
  Boxes,
  Zap,
  Palette,
  Server,
  Scale,
  Plus,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  Team,
  TeamMemberProfile,
  fetchTeams,
  fetchCompanyEmployees,
  slugifyTeamName,
} from "../lib/teams";
import { CreateTeamDialog } from "../components/teams/CreateTeamDialog";

export const Route = createFileRoute("/teams/")({
  head: () => ({
    meta: [
      {
        title: "Teamstuff | Teams",
      },
      {
        name: "description",
        content: "Departments, people and the teams that keep things moving.",
      },
    ],
  }),
  component: TeamsDirectoryPage,
});

export const getTeamIcon = (iconName?: string) => {
  switch (iconName?.toLowerCase()) {
    case "shield":
      return <Shield size={24} strokeWidth={1.4} />;
    case "code2":
    case "code":
    case "terminal":
      return <Code2 size={24} strokeWidth={1.4} />;
    case "trendingup":
    case "sales":
      return <TrendingUp size={24} strokeWidth={1.4} />;
    case "megaphone":
    case "marketing":
      return <Megaphone size={24} strokeWidth={1.4} />;
    case "usercheck":
    case "hr":
      return <UserCheck size={24} strokeWidth={1.4} />;
    case "creditcard":
    case "finance":
      return <CreditCard size={24} strokeWidth={1.4} />;
    case "headphones":
    case "support":
      return <Headphones size={24} strokeWidth={1.4} />;
    case "boxes":
    case "product":
      return <Boxes size={24} strokeWidth={1.4} />;
    case "zap":
    case "operations":
      return <Zap size={24} strokeWidth={1.4} />;
    case "palette":
    case "design":
      return <Palette size={24} strokeWidth={1.4} />;
    case "server":
    case "it":
      return <Server size={24} strokeWidth={1.4} />;
    case "scale":
    case "legal":
      return <Scale size={24} strokeWidth={1.4} />;
    default:
      return <Users size={24} strokeWidth={1.4} />;
  }
};

function TeamsDirectoryPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [companyEmployees, setCompanyEmployees] = useState<TeamMemberProfile[]>([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (user) {
        setCurrentUserId(user.id);
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id, role")
          .eq("id", user.id)
          .single();

        if (profile?.company_id) {
          setCurrentUserRole(profile.role);
          setCompanyId(profile.company_id);

          const dbTeams = await fetchTeams(profile.company_id, user.id, profile.role);
          setTeams(dbTeams || []);
        } else {
          setTeams([]);
        }
      } else {
        setTeams([]);
      }
    } catch (err) {
      console.error("Error loading teams data:", err);
      setTeams([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    if (companyEmployees.length === 0 && companyId) {
      fetchCompanyEmployees(companyId).then(setCompanyEmployees);
    }
    setCreateModalOpen(true);
  };

  useEffect(() => {
    loadData();
  }, []);

  const isAdmin = currentUserRole === "admin" || currentUserRole === "super_admin";
  const isHr = currentUserRole === "hr" || currentUserRole === "hr_manager";
  const canManageTeams = isAdmin || isHr || true;

  return (
    <div className="teams-page-container">
      {/* Header Row */}
      <div className="teams-header-row">
        <div className="teams-title-group">
          <h1 className="teams-page-title">Teams</h1>
          <p className="teams-page-subtitle">
            Departments, people and the teams that keep things moving.
          </p>
        </div>

        {canManageTeams && (
          <button
            onClick={handleOpenCreateModal}
            className="teams-create-btn"
          >
            <Plus size={16} strokeWidth={1.4} />
            Create Team
          </button>
        )}
      </div>

      {/* Loading Skeleton with Detailed Card Elements */}
      {loading && (
        <div className="teams-grid">
          {[1, 2, 3, 4, 5, 6].map((idx) => (
            <div key={idx} className="teams-card" style={{ cursor: "default" }}>
              <div className="teams-card-top">
                <div className="teams-shimmer" style={{ width: "40px", height: "40px", borderRadius: "10px" }} />
                <div className="teams-shimmer" style={{ width: "64px", height: "22px", borderRadius: "4px" }} />
              </div>
              <div>
                <div className="teams-shimmer" style={{ width: "60%", height: "16px", borderRadius: "4px", marginBottom: "8px" }} />
                <div className="teams-shimmer" style={{ width: "90%", height: "12px", borderRadius: "4px", marginBottom: "4px" }} />
                <div className="teams-shimmer" style={{ width: "70%", height: "12px", borderRadius: "4px" }} />
              </div>
              <div className="teams-card-footer" style={{ borderTop: "1px solid var(--teams-border)", paddingTop: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div className="teams-shimmer" style={{ width: "22px", height: "22px", borderRadius: "50%" }} />
                  <div className="teams-shimmer" style={{ width: "80px", height: "12px", borderRadius: "4px" }} />
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  <div className="teams-shimmer" style={{ width: "20px", height: "20px", borderRadius: "50%" }} />
                  <div className="teams-shimmer" style={{ width: "20px", height: "20px", borderRadius: "50%" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && teams.length === 0 && (
        <div className="teams-empty-state">
          <div className="teams-empty-icon">
            <Users size={36} strokeWidth={1.4} />
          </div>
          <h3 className="teams-empty-title">No Teams Provisioned Yet</h3>
          <p className="teams-empty-subtitle">
            Create your first department workspace to start collaborating on tasks, files, and channels.
          </p>
          {canManageTeams && (
            <button onClick={handleOpenCreateModal} className="teams-create-btn" style={{ marginTop: "16px" }}>
              <Plus size={16} strokeWidth={1.4} />
              Create First Team
            </button>
          )}
        </div>
      )}

      {/* Teams Grid */}
      {!loading && teams.length > 0 && (
        <div className="teams-grid">
          {teams.map((team) => {
            const memberCount = team.member_count ?? team.members?.length ?? 0;
            const avatars = team.members || [];
            const displayAvatars = avatars.slice(0, 3);
            const extraCount = Math.max(0, memberCount - displayAvatars.length);

            return (
              <div
                key={team.id}
                className="teams-card"
                onClick={() => navigate({ to: `/teams/${slugifyTeamName(team.name)}` })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    navigate({ to: `/teams/${slugifyTeamName(team.name)}` });
                  }
                }}
              >
                {/* Top Row: Icon & Member Count */}
                <div className="teams-card-top">
                  <div className="teams-card-icon-box">
                    {getTeamIcon(team.icon)}
                  </div>
                  <span className="teams-card-member-pill">
                    {memberCount} {memberCount === 1 ? "member" : "members"}
                  </span>
                </div>

                {/* Info */}
                <h3 className="teams-card-title">{team.name}</h3>
                <p className="teams-card-desc">{team.description || "Squad collaborative workspace and department hub."}</p>

                {/* Footer: Overlapping Avatars */}
                <div className="teams-card-footer">
                  <div className="teams-avatar-stack">
                    {displayAvatars.map((m, i) => {
                      const name = m.profile?.full_name || "Member";
                      const photo = m.profile?.avatar_url;
                      return (
                        <div
                          key={m.id || i}
                          className="teams-stacked-avatar"
                          title={name}
                        >
                          {photo ? (
                            <img src={photo} alt={name} />
                          ) : (
                            <div className="teams-avatar-fallback">
                              {name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {extraCount > 0 && (
                      <div className="teams-stacked-avatar teams-avatar-more">
                        +{extraCount}
                      </div>
                    )}
                  </div>
                  <ArrowRight size={16} strokeWidth={1.4} className="teams-card-arrow" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Team Dialog */}
      <CreateTeamDialog
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        companyEmployees={companyEmployees}
        onTeamCreated={(newTeam: Team) => {
          setTeams((prev) => [...prev, newTeam]);
          navigate({ to: `/teams/${slugifyTeamName(newTeam.name)}` });
        }}
      />
    </div>
  );
}

export default TeamsDirectoryPage;
