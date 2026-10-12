import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin-console/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin-console/settings" });
  },
});
