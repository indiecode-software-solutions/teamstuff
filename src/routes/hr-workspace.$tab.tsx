import React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import HRWorkspaceSection, { HR_TABS, hrTabFromSlug } from "../components/hr/HRWorkspaceSection";
import type { HRTabKey } from "../components/hr/HRWorkspaceTabs";

export const Route = createFileRoute("/hr-workspace/$tab")({
  head: () => ({
    title: "Teamstuff | HR Workspace",
    meta: [{ name: "description", content: "Human Resources Management Workspace." }],
  }),
  component: HRWorkspaceTabPage,
});

function HRWorkspaceTabPage() {
  const { tab } = Route.useParams();
  const navigate = useNavigate();
  const isValid = HR_TABS.some((t) => t.slug === tab);
  const activeTab = hrTabFromSlug(tab);

  React.useEffect(() => {
    if (!isValid) {
      navigate({ to: "/hr-workspace/$tab", params: { tab: "attendance" }, replace: true });
    }
  }, [isValid, navigate]);

  return (
    <HRWorkspaceSection
      activeTab={activeTab}
      onTabChange={(key: HRTabKey) => {
        const target = HR_TABS.find((t) => t.key === key);
        if (target) {
          navigate({ to: "/hr-workspace/$tab", params: { tab: target.slug } });
        }
      }}
    />
  );
}
