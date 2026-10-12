import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "../lib/supabase";
import { MOCK_ROLE_SWITCHER_ENABLED } from "../lib/mock-role";

const WORKSPACE_ROLES = ["admin", "hr", "accountant"];

function getInitialCheck(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const impersonated = sessionStorage.getItem("impersonated_company");
    if (impersonated) return true;
  } catch (e) {}

  if (MOCK_ROLE_SWITCHER_ENABLED) {
    try {
      const savedRole = localStorage.getItem("test_user_role") || "employee";
      return WORKSPACE_ROLES.includes(savedRole);
    } catch (e) {
      return true;
    }
  }
  return true;
}

export default function RequireWorkspaceRole({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [checked, setChecked] = React.useState<boolean>(getInitialCheck);

  React.useEffect(() => {
    let cancelled = false;

    if (typeof window !== "undefined") {
      try {
        const impersonated = sessionStorage.getItem("impersonated_company");
        if (impersonated) {
          setChecked(true);
          return;
        }
      } catch (e) {}
    }

    if (MOCK_ROLE_SWITCHER_ENABLED) {
      const savedRole = localStorage.getItem("test_user_role") || "employee";
      if (!WORKSPACE_ROLES.includes(savedRole)) {
        navigate({ to: "/" });
        return;
      }
      setChecked(true);
      return;
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || cancelled) return;
      supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return;
          const role = data?.role || "employee";
          if (!WORKSPACE_ROLES.includes(role)) {
            navigate({ to: "/" });
            return;
          }
          setChecked(true);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return <>{children}</>;
}
