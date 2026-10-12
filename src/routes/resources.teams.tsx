import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import TeamsDirectoryPage from "./teams.index";

export const Route = createFileRoute("/resources/teams")({
  head: () => ({
    meta: [
      {
        title: "Teamstuff | Teams",
      },
      {
        name: "description",
        content: "Departments, people and the teams that keep things moving.",
      },
    ],
  }),
  component: TeamsDirectoryPage,
});
