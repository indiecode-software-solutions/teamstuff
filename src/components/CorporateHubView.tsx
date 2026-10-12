import React, { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Users,
  MessagesSquare,
  ShieldCheck,
  KeyRound,
  MonitorPlay,
  Laptop,
  IdCard,
  Images,
  ArrowRight,
} from "lucide-react";

export type HubTheme =
  | "indigo"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "sky"
  | "teal"
  | "fuchsia";

export interface HubCardItem {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  theme: HubTheme;
}

const HUB_CARDS: HubCardItem[] = [
  {
    id: "teams-workspace",
    title: "Teams Workspaces",
    description: "Cross-functional squads, project Kanban boards, and shared resources.",
    icon: <Users size={26} strokeWidth={1.4} />,
    theme: "indigo",
  },
  {
    id: "corp-comm",
    title: "Forum",
    description: "Connect with colleagues, discussions, and company announcements.",
    icon: <MessagesSquare size={26} strokeWidth={1.4} />,
    theme: "violet",
  },
  {
    id: "hr-policies",
    title: "HR Policies",
    description: "Guidelines, leave policies, benefits, and code of conduct.",
    icon: <ShieldCheck size={26} strokeWidth={1.4} />,
    theme: "emerald",
  },
  {
    id: "shared-resources",
    title: "Credentials Vault",
    description: "Common login credentials, shared accounts, and access keys.",
    icon: <KeyRound size={26} strokeWidth={1.4} />,
    theme: "amber",
  },
  {
    id: "induction",
    title: "Induction & Training",
    description: "Welcome checklists, training modules, and onboarding files.",
    icon: <MonitorPlay size={26} strokeWidth={1.4} />,
    theme: "rose",
  },
  {
    id: "my-assets",
    title: "My Assets",
    description: "View company hardware, laptops, and devices assigned to you.",
    icon: <Laptop size={26} strokeWidth={1.4} />,
    theme: "sky",
  },
  {
    id: "team-directory",
    title: "Team Directory",
    description: "Meet the team, organization hierarchy, and contact info.",
    icon: <IdCard size={26} strokeWidth={1.4} />,
    theme: "teal",
  },
  {
    id: "memories",
    title: "Memories",
    description: "Photo gallery of events, milestones, and celebrations.",
    icon: <Images size={26} strokeWidth={1.4} />,
    theme: "fuchsia",
  },
];

export default function CorporateHubView() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="hub-portal-container">
      <div className="hub-portal-grid">
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="hub-portal-card hub-portal-card-skeleton">
                <div className="hub-portal-card-left">
                  <div className="hub-portal-skeleton-icon hub-portal-shimmer-box" />
                  <div className="hub-portal-info">
                    <div className="hub-portal-skeleton-line-title hub-portal-shimmer-box" />
                    <div className="hub-portal-skeleton-line-desc hub-portal-shimmer-box" />
                  </div>
                </div>
                <div className="hub-portal-skeleton-circle hub-portal-shimmer-box" />
              </div>
            ))
          : HUB_CARDS.map((card) => (
              <HubCard key={card.id} item={card} />
            ))}
      </div>
    </div>
  );
}

function HubCard({ item, index }: { item: HubCardItem; index?: number }) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (item.id === "teams-workspace") {
      navigate({ to: "/resources/teams" });
    } else if (item.id === "corp-comm") {
      navigate({ to: "/internal-forum" });
    } else if (item.id === "hr-policies") {
      navigate({ to: "/resources/hr-policies" });
    } else if (item.id === "shared-resources") {
      navigate({ to: "/resources/shared-resources" });
    } else if (item.id === "induction") {
      navigate({ to: "/resources/induction" });
    } else if (item.id === "my-assets") {
      navigate({ to: "/resources/assets" });
    } else if (item.id === "team-directory") {
      navigate({ to: "/resources/team" });
    } else if (item.id === "memories") {
      navigate({ to: "/resources/memories" });
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`hub-portal-card hub-portal-theme-${item.theme}`}
    >
      <div className="hub-portal-card-left">
        <div className="hub-portal-icon-box">
          {item.icon}
        </div>
        <div className="hub-portal-info">
          <h3 className="hub-portal-title">{item.title}</h3>
          <p className="hub-portal-desc">{item.description}</p>
        </div>
      </div>
      <div className="hub-portal-arrow-btn">
        <ArrowRight size={16} strokeWidth={1.4} />
      </div>
    </div>
  );
}
