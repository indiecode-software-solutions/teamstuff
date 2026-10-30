import { createFileRoute, Outlet } from "@tanstack/react-router";
import Layout from "../components/Layout";
import { getDynamicPageTitle } from "../lib/tenant-brand";

export const Route = createFileRoute("/resources")({
  head: () => ({
    title: getDynamicPageTitle("Resources"),
    meta: [
      { name: "description", content: "Resources portal and employee guides." },
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
