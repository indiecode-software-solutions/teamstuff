import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import TeamsDirectoryPage from "./teams.index";
import { getDynamicPageTitle } from "../lib/tenant-brand";

export const Route = createFileRoute("/resources/teams")({
  head: () => ({
    meta: [
      {
        title: getDynamicPageTitle("Teams"),
      },
      {
        name: "description",
        content: "Departments, people and the teams that keep things moving.",
      },
    ],
  }),
  component: TeamsDirectoryPage,
});
