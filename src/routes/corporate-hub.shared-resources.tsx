import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/corporate-hub/shared-resources")({
  beforeLoad: () => {
    throw redirect({ to: "/resources/shared-resources" });
  },
});
