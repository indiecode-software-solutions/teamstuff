import React, { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import {
  Search,
  ArrowLeft,
  Mail,
  Phone,
  Briefcase,
  Cake,
  User,
  Users,
  Building,
  ShieldCheck,
  Copy,
  Check,
  ExternalLink,
  X,
  Sparkles,
} from "lucide-react";

import { supabase } from "../lib/supabase";
import { sanitizeProfilePhoto } from "../lib/profile-photo";

export const Route = createFileRoute("/resources/team")({
  head: () => ({
    title: "Teamstuff | Team Directory",
    meta: [
      {
        name: "description",
        content: "Explore the team directory, connect with colleagues, and view organization contact profiles at Teamstuff.",
      },
    ],
  }),
  component: TeamPage,
});

interface Employee {
  id: string;
  name: string;
  role: string;
  department: string;
  email: string;
  phone: string;
  avatar: string | null;
  bio: string;
  dateOfBirth: string | null;
  status: "Active" | "Remote" | "OOF";
  reportsTo: string | null;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "U";
}

function TeamPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState("All");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchTeam = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;

        const { data: me } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", user.id)
          .single();

        if (!me?.company_id || cancelled) return;

        const { data: profiles, error } = await supabase
          .from("profiles")
          .select(
            "id, name, role, job_title, department, email, phone, profile_photo, notes, date_of_birth, company_id"
          )
          .eq("company_id", me.company_id)
          .order("name", { ascending: true });

        if (error || !profiles || cancelled) return;

        const mapped: Employee[] = profiles.map((p) => ({
          id: p.id,
          name: p.name || "Colleague",
          role: p.job_title || p.role || "Team Member",
          department: p.department || "General",
          email: p.email || "",
          phone: p.phone || "",
          avatar: sanitizeProfilePhoto(p.profile_photo),
          bio: p.notes || "No bio provided.",
          dateOfBirth: p.date_of_birth || null,
          status: "Active",
          reportsTo: null,
        }));

        setEmployees(mapped);
      } catch (err) {
        console.error("Team fetch error:", err);
        toast.error("Failed to load team directory.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchTeam();
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute unique departments dynamically
  const departments = useMemo(() => {
    const depts = new Set<string>();
    employees.forEach((emp) => {
      if (emp.department) depts.add(emp.department);
    });
    return Array.from(depts).sort((a, b) => a.localeCompare(b));
  }, [employees]);

  // Department counts
  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = { All: employees.length };
    employees.forEach((emp) => {
      const d = emp.department || "General";
      counts[d] = (counts[d] || 0) + 1;
    });
    return counts;
  }, [employees]);

  // Filtered employees based on search and selected department
  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return employees.filter((emp) => {
      const matchesDept = selectedDept === "All" || emp.department === selectedDept;
      if (!matchesDept) return false;

      if (!q) return true;
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.role.toLowerCase().includes(q) ||
        emp.department.toLowerCase().includes(q) ||
        emp.email.toLowerCase().includes(q) ||
        emp.phone.toLowerCase().includes(q)
      );
    });
  }, [employees, selectedDept, searchQuery]);

  const handleCopy = (text: string, label: string, keyId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    toast.success(`${label} copied to clipboard`);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === keyId ? null : curr));
    }, 2000);
  };

  return (
    <div className="directory-page-wrapper">
      {/* Header & Breadcrumb Card */}
      <div className="directory-header-card">
        <div className="directory-breadcrumb-row">
          <Link to="/resources" className="directory-breadcrumb-link">
            Resources
          </Link>
          <span className="directory-breadcrumb-sep">/</span>
          <span className="directory-breadcrumb-current">Team Directory</span>
        </div>

        <div className="directory-header-main">
          <div className="directory-title-group">
            <h1 className="directory-title">Team Directory & Organization</h1>
            <p className="directory-subtitle">
              Explore your company organization, connect with colleagues, and view organization contact profiles.
            </p>
          </div>

          <div className="directory-header-actions">
            <div className="directory-search-wrap">
              <Search size={15} className="directory-search-icon" />
              <input
                type="text"
                placeholder="Search colleagues, roles, departments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="directory-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute",
                    right: "10px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--color-text-muted)",
                    padding: 0,
                    display: "flex",
                  }}
                  title="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <Link
              to="/resources"
              className="btn btn-secondary"
              style={{ height: "38px", gap: "6px" }}
            >
              <ArrowLeft size={14} />
              <span>Back to Resources</span>
            </Link>
          </div>
        </div>

        {/* Live Organization Metrics Bar */}
        <div className="directory-stats-bar">
          <div className="directory-stat-item">
            <Users size={14} style={{ color: "var(--color-text-secondary)" }} />
            <span>Total Colleagues:</span>
            <strong>{employees.length}</strong>
          </div>

          <div className="directory-stat-item">
            <Building size={14} style={{ color: "var(--color-text-secondary)" }} />
            <span>Active Departments:</span>
            <strong>{departments.length}</strong>
          </div>

          <div className="directory-stat-item" style={{ marginLeft: "auto" }}>
            <ShieldCheck size={14} style={{ color: "#059669" }} />
            <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)" }}>
              Official Organization Directory
            </span>
          </div>
        </div>
      </div>

      {/* Department Filter Pills */}
      {departments.length > 0 && (
        <div className="directory-filter-bar">
          <button
            onClick={() => setSelectedDept("All")}
            className={`directory-filter-pill ${selectedDept === "All" ? "is-active" : ""}`}
          >
            All Colleagues
            <span className="directory-filter-count">{deptCounts["All"] || 0}</span>
          </button>

          {departments.map((dept) => (
            <button
              key={dept}
              onClick={() => setSelectedDept(dept)}
              className={`directory-filter-pill ${selectedDept === dept ? "is-active" : ""}`}
            >
              {dept}
              <span className="directory-filter-count">{deptCounts[dept] || 0}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main Grid Content */}
      {isLoading ? (
        <div className="directory-grid">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="directory-card" style={{ gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div className="skeleton-box" style={{ width: "48px", height: "48px", borderRadius: "50%" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                  <div className="skeleton-box" style={{ width: "60%", height: "18px", borderRadius: "4px" }} />
                  <div className="skeleton-box" style={{ width: "40%", height: "12px", borderRadius: "4px" }} />
                </div>
              </div>
              <div className="skeleton-box" style={{ width: "100%", height: "30px", borderRadius: "6px" }} />
              <div className="skeleton-box" style={{ width: "100%", height: "30px", borderRadius: "6px" }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: "8px" }}>
                <div className="skeleton-box" style={{ width: "80px", height: "18px", borderRadius: "10px" }} />
                <div className="skeleton-box" style={{ width: "70px", height: "24px", borderRadius: "6px" }} />
              </div>
            </div>
          ))}
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="hub-empty-state" style={{ minHeight: "320px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: "var(--color-surface-subtle, #f4f4f5)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "14px",
              color: "var(--color-text-muted)",
            }}
          >
            <Users size={22} />
          </div>
          <h2 className="hub-empty-title">
            {searchQuery ? "No matching colleagues found" : "No colleagues found in this department"}
          </h2>
          <p className="hub-empty-desc" style={{ maxWidth: "420px", textAlign: "center" }}>
            {searchQuery
              ? `No colleagues matched "${searchQuery}". Try searching by full name, job designation, or department.`
              : "Try switching to 'All Colleagues' to see team members across other departments."}
          </p>
          <div style={{ marginTop: "16px", display: "flex", gap: "10px" }}>
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="btn btn-secondary">
                Clear Search
              </button>
            )}
            {selectedDept !== "All" && (
              <button onClick={() => setSelectedDept("All")} className="btn btn-secondary">
                Show All Departments
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="directory-grid">
          {filteredEmployees.map((emp) => {
            const initials = getInitials(emp.name);
            const isEmailCopied = copiedKey === `${emp.id}-email`;
            const isPhoneCopied = copiedKey === `${emp.id}-phone`;

            return (
              <div key={emp.id} className="directory-card">
                <div>
                  {/* Card Header: Avatar, Name & Designation */}
                  <div className="directory-card-header">
                    <div className="directory-avatar-box">
                      {emp.avatar ? (
                        <img
                          src={emp.avatar}
                          alt={emp.name}
                          className="directory-avatar-img"
                        />
                      ) : (
                        <span>{initials}</span>
                      )}
                    </div>

                    <div className="directory-card-title-group">
                      <h3 className="directory-card-name" title={emp.name}>
                        {emp.name}
                      </h3>
                      <p className="directory-card-role" title={emp.role}>
                        {emp.role}
                      </p>
                    </div>
                  </div>

                  {/* Contact rows */}
                  <div className="directory-card-contact-list">
                    {emp.email && emp.email !== "—" && (
                      <div className="directory-contact-item">
                        <div className="directory-contact-left">
                          <Mail size={12} className="directory-contact-icon" />
                          <span className="directory-contact-text" title={emp.email}>
                            {emp.email}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(emp.email, "Email address", `${emp.id}-email`)}
                          className={`directory-contact-copy-btn ${isEmailCopied ? "is-copied" : ""}`}
                          title={isEmailCopied ? "Copied!" : "Copy email"}
                        >
                          {isEmailCopied ? <Check size={11} /> : <Copy size={11} />}
                        </button>
                      </div>
                    )}

                    {emp.phone && emp.phone !== "—" && (
                      <div className="directory-contact-item">
                        <div className="directory-contact-left">
                          <Phone size={12} className="directory-contact-icon" />
                          <span className="directory-contact-text" title={emp.phone}>
                            {emp.phone}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopy(emp.phone, "Phone number", `${emp.id}-phone`)}
                          className={`directory-contact-copy-btn ${isPhoneCopied ? "is-copied" : ""}`}
                          title={isPhoneCopied ? "Copied!" : "Copy phone"}
                        >
                          {isPhoneCopied ? <Check size={11} /> : <Copy size={11} />}
                        </button>
                      </div>
                    )}

                    {emp.dateOfBirth && (
                      <div className="directory-contact-item">
                        <div className="directory-contact-left">
                          <Cake size={12} className="directory-contact-icon" />
                          <span className="directory-contact-text">
                            Birthday:{" "}
                            {new Date(emp.dateOfBirth).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bio Excerpt */}
                  {emp.bio && emp.bio !== "No bio provided." && (
                    <p className="directory-card-bio" title={emp.bio}>
                      {emp.bio}
                    </p>
                  )}
                </div>

                {/* Card Footer: Department Pill & Action Buttons */}
                <div className="directory-card-footer">
                  <span className="directory-dept-badge" title={emp.department}>
                    {emp.department}
                  </span>

                  <button
                    type="button"
                    onClick={() => setSelectedEmployee(emp)}
                    className="directory-view-btn"
                  >
                    <span>View Profile</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Colleague Detail Slide-over Modal */}
      <Dialog.Root
        open={!!selectedEmployee}
        onOpenChange={(open) => !open && setSelectedEmployee(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="hub-modal-overlay" />
          <Dialog.Content className="hub-modal-content" style={{ maxWidth: "460px" }}>
            {selectedEmployee && (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
                  <Dialog.Close asChild>
                    <button className="btn-icon" title="Close profile">
                      <X size={16} />
                    </button>
                  </Dialog.Close>
                </div>

                {/* Profile Header */}
                <div className="directory-profile-header">
                  <div className="directory-profile-avatar-large">
                    {selectedEmployee.avatar ? (
                      <img src={selectedEmployee.avatar} alt={selectedEmployee.name} />
                    ) : (
                      <span>{getInitials(selectedEmployee.name)}</span>
                    )}
                  </div>

                  <Dialog.Title
                    className="hub-modal-title"
                    style={{ fontSize: "18px", margin: "0 0 2px 0" }}
                  >
                    {selectedEmployee.name}
                  </Dialog.Title>

                  <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", margin: "0 0 8px 0", fontWeight: 500 }}>
                    {selectedEmployee.role}
                  </p>

                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span className="directory-dept-badge">
                      {selectedEmployee.department}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        backgroundColor: "#ecfdf5",
                        color: "#059669",
                        border: "1px solid #a7f3d0",
                      }}
                    >
                      Active Colleague
                    </span>
                  </div>

                  {/* Action Bar */}
                  <div className="directory-profile-actions-bar">
                    {selectedEmployee.email && selectedEmployee.email !== "—" && (
                      <a
                        href={`mailto:${selectedEmployee.email}`}
                        className="btn btn-primary"
                        style={{ height: "34px", fontSize: "12.5px", gap: "6px" }}
                      >
                        <Mail size={13} />
                        <span>Send Email</span>
                      </a>
                    )}
                    {selectedEmployee.email && selectedEmployee.email !== "—" && (
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            selectedEmployee.email,
                            "Email address",
                            `modal-${selectedEmployee.id}-email`
                          )
                        }
                        className="btn btn-secondary"
                        style={{ height: "34px", fontSize: "12.5px", gap: "6px" }}
                      >
                        {copiedKey === `modal-${selectedEmployee.id}-email` ? (
                          <Check size={13} style={{ color: "#059669" }} />
                        ) : (
                          <Copy size={13} />
                        )}
                        <span>
                          {copiedKey === `modal-${selectedEmployee.id}-email`
                            ? "Copied"
                            : "Copy Email"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Profile Details List */}
                <div
                  style={{
                    borderTop: "1px solid var(--color-border)",
                    paddingTop: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    fontSize: "12.5px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <Building size={16} style={{ color: "var(--color-text-muted)", marginTop: "2px", flexShrink: 0 }} />
                    <div>
                      <div className="hub-form-label" style={{ fontSize: "11px", marginBottom: "2px" }}>
                        Department
                      </div>
                      <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                        {selectedEmployee.department}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <Briefcase size={16} style={{ color: "var(--color-text-muted)", marginTop: "2px", flexShrink: 0 }} />
                    <div>
                      <div className="hub-form-label" style={{ fontSize: "11px", marginBottom: "2px" }}>
                        Designation / Role
                      </div>
                      <div style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>
                        {selectedEmployee.role}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                    <Mail size={16} style={{ color: "var(--color-text-muted)", marginTop: "2px", flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="hub-form-label" style={{ fontSize: "11px", marginBottom: "2px" }}>
                        Work Email
                      </div>
                      <div style={{ fontWeight: 500, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {selectedEmployee.email || "Not provided"}
                      </div>
                    </div>
                  </div>

                  {selectedEmployee.phone && selectedEmployee.phone !== "—" && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                      <Phone size={16} style={{ color: "var(--color-text-muted)", marginTop: "2px", flexShrink: 0 }} />
                      <div>
                        <div className="hub-form-label" style={{ fontSize: "11px", marginBottom: "2px" }}>
                          Phone Number
                        </div>
                        <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                          {selectedEmployee.phone}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedEmployee.dateOfBirth && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                      <Cake size={16} style={{ color: "var(--color-text-muted)", marginTop: "2px", flexShrink: 0 }} />
                      <div>
                        <div className="hub-form-label" style={{ fontSize: "11px", marginBottom: "2px" }}>
                          Birthday
                        </div>
                        <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                          {new Date(selectedEmployee.dateOfBirth).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "long",
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedEmployee.bio && selectedEmployee.bio !== "No bio provided." && (
                    <div style={{ paddingTop: "12px", borderTop: "1px solid var(--color-border-subtle)" }}>
                      <div className="hub-form-label" style={{ fontSize: "11px", marginBottom: "6px" }}>
                        About & Biography
                      </div>
                      <p style={{ color: "var(--color-text-secondary)", lineHeight: 1.55, margin: 0, whiteSpace: "pre-line" }}>
                        {selectedEmployee.bio}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
