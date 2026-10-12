import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/corporate-hub/memories")({
  beforeLoad: () => {
    throw redirect({ to: "/resources/memories" });
  },
});
