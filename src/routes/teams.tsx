import React from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import Layout from "../components/Layout";

export const Route = createFileRoute("/teams")({
  head: () => ({
    title: "CapOasis | Teams Workspaces",
    meta: [
      {
        name: "description",
        content: "Collaborative team workspaces, Kanban boards, and shared resources.",
      },
    ],
  }),
  component: TeamsLayout,
});

function TeamsLayout() {
  return (
    <Layout activeTab="Teams" disablePadding>
      <Outlet />
    </Layout>
  );
}
