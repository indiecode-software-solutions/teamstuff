import React from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import Layout from "../components/Layout";
import RequireWorkspaceRole from "../components/RequireWorkspaceRole";

export const Route = createFileRoute("/admin-console")({
  head: () => ({
    title: "CapOasis | Admin Settings",
    meta: [
      {
        name: "description",
        content: "HR & System Administration Console with Storage & Audit log security.",
      },
    ],
  }),
  component: AdminConsolePage,
});

function AdminConsolePage() {
  return (
    <Layout activeTab="Admin Console">
      <RequireWorkspaceRole>
        <Outlet />
      </RequireWorkspaceRole>
    </Layout>
  );
}
