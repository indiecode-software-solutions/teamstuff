import React from "react";
import { useNavigate } from "@tanstack/react-router";
import { NotificationDrawer } from "./notifications/NotificationDrawer";
import { useUnreadNotificationCount } from "../lib/notifications";
import { MOCK_ROLE_SWITCHER_ENABLED } from "../lib/mock-role";
import { supabase } from "../lib/supabase";
import {
  LayoutDashboard,
  Clock,
  Bell,
  LogOut,
  ShieldCheck,
  Check,
  ArrowLeft,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

interface AdminLayoutProps {
  children: React.ReactNode;
  activeTab: "Console Dashboard" | "Company Attendance";
}

export default function AdminLayout({ children, activeTab }: AdminLayoutProps) {
  const [notificationsOpen, setNotificationsOpen] = React.useState(false);
  const unreadNotifications = useUnreadNotificationCount();
  const navigate = useNavigate();

  // Floating mock role switcher state
  const [mounted, setMounted] = React.useState(false);
  const [currentRole, setCurrentRole] = React.useState("employee");

  React.useEffect(() => {
    setMounted(true);

    if (typeof window !== "undefined") {
      try {
        const impersonated = sessionStorage.getItem("impersonated_company");
        if (impersonated) {
          setCurrentRole("admin");
          return;
        }
      } catch (e) {}
    }

    if (MOCK_ROLE_SWITCHER_ENABLED) {
      const savedRole = localStorage.getItem("test_user_role") || "employee";
      setCurrentRole(savedRole);
      // Simple RBAC redirect: if a standard employee gets in, kick them out
      if (savedRole === "employee") {
        navigate({ to: "/" });
      }
      return;
    }

    let cancelled = false;
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
          setCurrentRole(role);
          // Simple RBAC redirect: if a standard employee gets in, kick them out
          if (role === "employee") {
            navigate({ to: "/" });
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleRoleChange = (role: string) => {
    if (MOCK_ROLE_SWITCHER_ENABLED) {
      localStorage.setItem("test_user_role", role);
    }
    setCurrentRole(role);
    window.location.reload();
  };

  return (
    <div >
      {/* Sidebar */}
      <aside >
        <div >
          <div >
            <div >
              <ShieldCheck  />
            </div>
            <span >
              Admin Console
            </span>
          </div>
        </div>

        <div >
          <SidebarNavGroup label="Management">
            <SidebarItem
              icon={<LayoutDashboard  />}
              label="Console Overview"
              active={activeTab === "Console Dashboard"}
              onClick={() => navigate({ to: "/admin-console" })}
            />
            <SidebarItem
              icon={<Clock  />}
              label="Company Attendance"
              active={activeTab === "Company Attendance"}
              onClick={() => navigate({ to: "/admin-console/attendance" })}
            />
          </SidebarNavGroup>

          <SidebarNavGroup label="Exit Console">
            <SidebarItem
              icon={<ArrowLeft  />}
              label="Employee Portal"
              active={false}
              onClick={() => navigate({ to: "/" })}
            />
          </SidebarNavGroup>
        </div>
      </aside>

      {/* Main Content */}
      <main >
        {/* Header */}
        <header >
          <div >
            <div >
              <ShieldCheck  />
            </div>
            <div>
              <p >
                Management Console
              </p>
              <p >
                Manage company geofences and logs
              </p>
            </div>
          </div>

          <div className="admin-header-actions">
            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="app-header-btn"
              title="Notifications"
            >
              <Bell size={18} />
              {unreadNotifications > 0 && (
                <span className="app-header-btn-badge">
                  {unreadNotifications}
                </span>
              )}
            </button>

            {/* Profile Menu Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  
                >
                  <Avatar >
                    <AvatarImage src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=256" />
                    <AvatarFallback >
                      AD
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" >
                <DropdownMenuItem
                  onClick={() => navigate({ to: "/profile" })}
                  
                >
                  My Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate({ to: "/settings" })}
                  
                >
                  Account Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator  />
                <DropdownMenuItem
                  onClick={() => {
                    localStorage.removeItem("supabase.auth.token");
                    window.location.reload();
                  }}
                  
                >
                  <LogOut  />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Viewport content */}
        <div >
          {children}
        </div>
      </main>

      {/* Floating test role switcher */}
      {mounted && MOCK_ROLE_SWITCHER_ENABLED && (
        <div >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                
              >
                <ShieldCheck  />
                <span>{currentRole.toUpperCase()}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" >
              <div >
                Switch Mock Role
              </div>
              <DropdownMenuSeparator  />
              {["Admin", "HR", "Accountant", "Employee"].map((role) => {
                const roleVal = role.toLowerCase();
                const isActive = currentRole === roleVal;
                return (
                  <DropdownMenuItem
                    key={role}
                    onClick={() => handleRoleChange(roleVal)}
                    className={`${ isActive ? "" : "" }`}
                  >
                    <span>{role}</span>
                    {isActive && <Check  />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Notification Drawer */}
      <NotificationDrawer
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onNavigate={(link) => navigate({ to: link })}
      />
    </div>
  );
}

function SidebarNavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div >
      <div >
        {label}
      </div>
      <div >{children}</div>
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick?: () => void;
  }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${ active ? "" : "" }`}
    >
      <span className={active ? "text-zinc-900" : "text-slate-400"}>
        {icon}
      </span>
      <span >{label}</span>
      {active && (
        <span  />
      )}
    </button>
  );
}
