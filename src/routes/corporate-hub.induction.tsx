import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/corporate-hub/induction")({
  beforeLoad: () => {
    throw redirect({ to: "/resources/induction" });
  },
});
