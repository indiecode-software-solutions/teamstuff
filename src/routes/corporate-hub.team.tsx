import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/corporate-hub/team")({
  beforeLoad: () => {
    throw redirect({ to: "/resources/team" });
  },
});
