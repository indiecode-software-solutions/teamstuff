import { createFileRoute, Outlet } from "@tanstack/react-router";
import Layout from "../components/Layout";

export const Route = createFileRoute("/resources")({
  head: () => ({
    title: "Teamstuff | Resources",
    meta: [
      { name: "description", content: "Resources portal and employee guides for Teamstuff." },
    ],
  }),
  component: ResourcesLayout,
});

function ResourcesLayout() {
  return (
    <Layout activeTab="Resources">
      <Outlet />
    </Layout>
  );
}
