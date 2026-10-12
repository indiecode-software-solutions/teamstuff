import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin-console/hr/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin-console/hr/$tab", params: { tab: "attendance" } });
  },
});
