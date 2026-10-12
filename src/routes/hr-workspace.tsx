import { createFileRoute, Outlet } from "@tanstack/react-router";
import Layout from "../components/Layout";
import RequireWorkspaceRole from "../components/RequireWorkspaceRole";

export const Route = createFileRoute("/hr-workspace")({
  component: () => (
    <Layout activeTab="HR Workspace">
      <RequireWorkspaceRole>
        <Outlet />
      </RequireWorkspaceRole>
    </Layout>
  ),
});
