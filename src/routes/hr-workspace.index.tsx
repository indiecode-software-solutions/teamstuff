import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/hr-workspace/")({
  beforeLoad: () => {
    throw redirect({ to: "/hr-workspace/$tab", params: { tab: "attendance" } });
  },
});
