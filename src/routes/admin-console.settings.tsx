import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSetBreadcrumbs } from "../components/Layout";
import { SettingsPageContent } from "./settings";
import {
  getAuthenticatedUserContext,
  getCompanyStorageLedger,
  getCompanyAuditLogs,
  StorageLedger,
  FileAuditLog,
} from "../lib/cloud-drive";

export const Route = createFileRoute("/admin-console/settings")({
  head: () => ({
    title: "CapOasis | Admin Settings",
    meta: [{ name: "description", content: "System administration settings." }],
  }),
  component: AdminConsoleSettingsPage,
});

function AdminConsoleSettingsPage() {
  return <AdminConsoleSettings />;
}

function AdminConsoleSettings() {
  const [categoryLabel, setCategoryLabel] = React.useState("Company Profile");
  const [loadingData, setLoadingData] = React.useState(true);
  const [storageLedger, setStorageLedger] = React.useState<StorageLedger | null>(null);
  const [auditLogs, setAuditLogs] = React.useState<FileAuditLog[]>([]);

  useSetBreadcrumbs([
    { label: "Admin" },
    { label: "Settings", href: "/admin-console/settings" },
    { label: categoryLabel },
  ]);

  React.useEffect(() => {
    (async () => {
      try {
        setLoadingData(true);
        const userCtx = await getAuthenticatedUserContext();
        if (!userCtx) return;
        const [ledger, logs] = await Promise.all([
          getCompanyStorageLedger(userCtx.companyId),
          getCompanyAuditLogs(userCtx.companyId),
        ]);
        setStorageLedger(ledger);
        setAuditLogs(logs);
      } catch (err) {
        console.error("Error loading admin settings data:", err);
      } finally {
        setLoadingData(false);
      }
    })();
  }, []);

  const formatStorageSize = (bytes: number): string => {
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + " KB";
    return bytes + " B";
  };
  const usedGB = storageLedger
    ? (storageLedger.usedBytes / (1024 * 1024 * 1024)).toFixed(2)
    : "0.00";
  const usedDisplay = storageLedger ? formatStorageSize(storageLedger.usedBytes) : "0 B";
  const limitGB = storageLedger
    ? (storageLedger.allocatedBytes / (1024 * 1024 * 1024)).toFixed(2)
    : "5.00";
  const usedPercentage = storageLedger
    ? Math.min((storageLedger.usedBytes / storageLedger.allocatedBytes) * 100, 100)
    : 0;

  return (
    <SettingsPageContent
      isEmbedded={true}
      onCategoryChange={setCategoryLabel}
      storageLoading={loadingData}
      auditLoading={loadingData}
      storageData={{
        usedGB,
        usedDisplay,
        limitGB,
        usedPercentage,
        userStorage: storageLedger?.userStorage,
      }}
      auditLogs={auditLogs}
    />
  );
}
