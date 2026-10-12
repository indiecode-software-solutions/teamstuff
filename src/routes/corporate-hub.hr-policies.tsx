import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/corporate-hub/hr-policies")({
  beforeLoad: () => {
    throw redirect({ to: "/resources/hr-policies" });
  },
});
