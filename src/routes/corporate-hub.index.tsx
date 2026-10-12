import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/corporate-hub/")({
  beforeLoad: () => {
    throw redirect({ to: "/resources" });
  },
});
