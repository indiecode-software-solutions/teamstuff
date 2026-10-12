import React from "react";
import { toast } from "sonner";
import {
  Clock as AccessTime,
  UserPlus as PersonAdd,
  ListTodo,
  ReceiptText as ReceiptLong,
  BookCheck as Policy,
  BookOpen as MenuBook,
  Camera as PhotoCamera,
  CalendarDays as CalendarRange,
  Laptop,
  LogOut,
  FileCheck,
} from "lucide-react";
import { HRWorkspaceTabs, type HRTabKey } from "./HRWorkspaceTabs";

export interface HRTabDef {
  key: HRTabKey;
  slug: string;
  label: string;
  icon: React.ReactNode;
}

export const HR_TABS: HRTabDef[] = [
  { key: "hr-attendance", slug: "attendance", label: "Attendance", icon: <AccessTime size={18} /> },
  { key: "hr-onboard", slug: "onboard", label: "Onboard", icon: <PersonAdd size={18} /> },
  { key: "hr-documents", slug: "documents", label: "Documents", icon: <FileCheck size={18} /> },
  { key: "hr-assets", slug: "assets", label: "Assets", icon: <Laptop size={18} /> },
  { key: "hr-tasks", slug: "tasks", label: "Tasks", icon: <ListTodo size={18} /> },
  { key: "hr-payslips", slug: "payslips", label: "Payslips", icon: <ReceiptLong size={18} /> },
  { key: "hr-policies", slug: "policies", label: "Policies", icon: <Policy size={18} /> },
  { key: "hr-leave", slug: "leave", label: "Leave", icon: <CalendarRange size={18} /> },
  { key: "hr-induction", slug: "induction", label: "Induction", icon: <MenuBook size={18} /> },
  { key: "hr-memories", slug: "memories", label: "Memories", icon: <PhotoCamera size={18} /> },
  { key: "hr-exit", slug: "exit", label: "Exit", icon: <LogOut size={18} /> },
];

export function hrTabFromSlug(slug: string | undefined): HRTabKey {
  const match = HR_TABS.find((t) => t.slug === slug);
  return match ? match.key : "hr-attendance";
}

interface HRWorkspaceSectionProps {
  activeTab: HRTabKey;
  onTabChange?: (tab: HRTabKey) => void;
}

export default function HRWorkspaceSection({ activeTab, onTabChange }: HRWorkspaceSectionProps) {
  const rightContentRef = React.useRef<HTMLDivElement | null>(null);

  // Reset scroll of the right panel to top when activeTab changes
  React.useEffect(() => {
    if (rightContentRef.current) {
      rightContentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  function showToast(msg: string, severity: "success" | "error" | "info" | "warning" = "success") {
    if (severity === "error") {
      toast.error(msg);
    } else if (severity === "warning" || severity === "info") {
      toast.info(msg);
    } else {
      toast.success(msg);
    }
  }

  return (
    <div className="hr-workspace-shell">
      <div className="hr-workspace-layout">
        {/* Left Column: Fixed Category Sidebar */}
        <aside className="hr-category-sidebar">
          {/* Sidebar Nav List */}
          <div className="hr-category-nav-list">
            {HR_TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  type="button"
                  key={tab.key}
                  onClick={() => onTabChange?.(tab.key)}
                  className={`hr-category-nav-item ${isActive ? "active" : ""}`}
                >
                  <div className="hr-category-nav-icon">
                    {tab.icon}
                  </div>
                  <span className="hr-category-nav-label">
                    {tab.label}
                  </span>
                  {isActive && (
                    <span className="hr-category-nav-dot" />
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Column: Active Tab Content (Scrolls independently with auto reset) */}
        <main
          ref={rightContentRef}
          className="hr-workspace-main"
        >
          <HRWorkspaceTabs activeTab={activeTab} showToast={showToast} />
        </main>
      </div>
    </div>
  );
}

