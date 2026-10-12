import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/corporate-hub/teams")({
  beforeLoad: () => {
    throw redirect({ to: "/resources/teams" });
  },
});
