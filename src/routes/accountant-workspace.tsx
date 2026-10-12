import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import Layout from "../components/Layout";
import RequireWorkspaceRole from "../components/RequireWorkspaceRole";
import {
  FileText as Description,
  Landmark as AccountBalance,
  ReceiptText as ReceiptLong,
  CalendarCheck as EventAvailable,
} from "lucide-react";

export const Route = createFileRoute("/accountant-workspace")({
  head: () => ({
    title: "Teamstuff | Finance Workspace",
    meta: [{ name: "description", content: "Financial & Payroll Management Workspace." }],
  }),
  component: AccountantWorkspacePage,
});

function AccountantWorkspacePage() {
  return (
    <Layout activeTab="Finance">
      <RequireWorkspaceRole>
        <AccountantWorkspaceOverview />
      </RequireWorkspaceRole>
    </Layout>
  );
}

function AccountantWorkspaceOverview() {
  const [stats] = React.useState({
    totalPayroll: "₹420,000",
    pendingExpenses: 28,
    lastPayoutDate: "Aug 01, 2026",
    activeSchedules: 4,
  });

  return (
    <div >
      <h1 >
        Financial Management Overview
      </h1>

      {/* Stats Grid */}
      <div >
        <StatCard
          title="Monthly Payroll"
          value={stats.totalPayroll}
          icon={<AccountBalance size={22} />}
          color="text-zinc-900 dark:text-zinc-100"
          bgColor="bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-300 dark:border-zinc-800/50"
        />
        <StatCard
          title="Pending Claims"
          value={stats.pendingExpenses}
          icon={<ReceiptLong size={22} />}
          color="text-zinc-900 dark:text-zinc-100"
          bgColor="bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-300 dark:border-zinc-800/50"
        />
        <StatCard
          title="Last Payout"
          value={stats.lastPayoutDate}
          icon={<EventAvailable size={22} />}
          color="text-zinc-900 dark:text-zinc-100"
          bgColor="bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-300 dark:border-zinc-800/50"
        />
        <StatCard
          title="Schedules"
          value={stats.activeSchedules}
          icon={<Description size={22} />}
          color="text-zinc-700 dark:text-zinc-100"
          bgColor="bg-zinc-100 dark:bg-zinc-900/40 border border-zinc-200 dark:border-zinc-800/50"
        />
      </div>

      {/* Quick Actions Card */}
      <div >
        <h2 >
          Payroll & Expense Operations
        </h2>
        <p >
          Review and process monthly salary disbursements, verify expense reimbursement
          requests, and generate financial reports.
        </p>

        <div >
          <button >
            Process Payroll
          </button>
          <button >
            Review Claims
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
  bgColor,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}) {
  return (
    <div >
      <div>
        <p >
          {title}
        </p>
        <p >
          {value}
        </p>
      </div>
      <div className={`${color}${bgColor}`}>
        {icon}
      </div>
    </div>
  );
}
