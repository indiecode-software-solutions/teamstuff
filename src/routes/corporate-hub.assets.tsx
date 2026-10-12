import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/corporate-hub/assets")({
  beforeLoad: () => {
    throw redirect({ to: "/resources/assets" });
  },
});
