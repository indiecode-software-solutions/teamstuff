import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import CorporateHubView from "../components/CorporateHubView";

export const Route = createFileRoute("/resources/")({
  component: ResourcesIndexPage,
});

function ResourcesIndexPage() {
  return <CorporateHubView />;
}
