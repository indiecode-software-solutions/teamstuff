import React, { useState, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X as CloseIcon, Crown, Search, Check, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  createTeam,
  fetchCompanyEmployees,
  Team,
  TeamMemberProfile,
} from "../../lib/teams";
import { sanitizeProfilePhoto } from "../../lib/profile-photo";

interface CreateTeamDialogProps {
  open: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  onCreated?: (team: Team) => void;
  onTeamCreated?: (team: Team) => void;
  companyId?: string | null;
  currentUserId?: string | null;
  employees?: TeamMemberProfile[];
  companyEmployees?: TeamMemberProfile[];
  initialName?: string;
  initialDescription?: string;
  initialIcon?: string;
}

export function CreateTeamDialog({
  open,
  onClose,
  onOpenChange,
  onCreated,
  onTeamCreated,
  companyId: propCompanyId,
  currentUserId: propCurrentUserId,
  employees: propEmployees,
  companyEmployees,
  initialName,
  initialDescription,
  initialIcon,
}: CreateTeamDialogProps) {
  const [creating, setCreating] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(propCurrentUserId || null);
  const [companyId, setCompanyId] = useState<string | null>(propCompanyId || null);
  const [employees, setEmployees] = useState<TeamMemberProfile[]>(propEmployees || companyEmployees || []);

  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [teamLeadId, setTeamLeadId] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<TeamMemberProfile[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState("");
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);

  const handleClose = () => {
    if (onClose) onClose();
    if (onOpenChange) onOpenChange(false);
  };

  const handleCreated = (t: Team) => {
    if (onCreated) onCreated(t);
    if (onTeamCreated) onTeamCreated(t);
  };

  useEffect(() => {
    if (!open) {
      setTeamName("");
      setTeamDescription("");
      setTeamLeadId("");
      setSelectedMembers([]);
      setMemberSearchQuery("");
      return;
    }

    setTeamName(initialName || "");
    setTeamDescription(initialDescription || "");


    (async () => {
      try {
        let uid = propCurrentUserId;
        let cid = propCompanyId;

        if (!uid || !cid) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (user) {
            uid = user.id;
            setCurrentUserId(user.id);
            const { data: profile } = await supabase
              .from("profiles")
              .select("company_id")
              .eq("id", user.id)
              .single();
            if (profile?.company_id) {
              cid = profile.company_id;
              setCompanyId(profile.company_id);
            }
          }
        }

        if (cid && (!propEmployees || propEmployees.length === 0)) {
          const empList = await fetchCompanyEmployees(cid);
          setEmployees(empList);
        } else if (propEmployees && propEmployees.length > 0) {
          setEmployees(propEmployees);
        }
      } catch (err) {
        console.error("Error initializing CreateTeamDialog:", err);
      }
    })();
  }, [open, propCompanyId, propCurrentUserId, propEmployees]);

  // Reset form on open
  useEffect(() => {
    if (open) {
      setTeamName("");
      setTeamDescription("");
      setTeamLeadId("");
      setSelectedMembers([]);
      setMemberSearchQuery("");
      setShowMemberDropdown(false);
    }
  }, [open]);

  // Progressive unlocking flags
  const isNameFilled = teamName.trim().length > 0;
  const isLeadSelected = Boolean(teamLeadId);

  // Handle Team Lead selection: auto-add & lock in members, replacing previous lead
  const handleLeadChange = (newLeadId: string) => {
    const previousLeadId = teamLeadId;
    setTeamLeadId(newLeadId);

    if (newLeadId) {
      const leadObj = employees.find((e) => e.id === newLeadId);
      if (leadObj) {
        setSelectedMembers((prev) => {
          const nonLeadMembers = prev.filter(
            (m) => m.id !== previousLeadId && m.id !== newLeadId
          );
          return [leadObj, ...nonLeadMembers];
        });
      }
    } else if (previousLeadId) {
      setSelectedMembers((prev) => prev.filter((m) => m.id !== previousLeadId));
    }
  };

  const toggleMemberSelection = (emp: TeamMemberProfile) => {
    if (emp.id === teamLeadId) return; // lead cannot be toggled off here
    if (selectedMembers.some((m) => m.id === emp.id)) {
      setSelectedMembers((prev) => prev.filter((m) => m.id !== emp.id));
    } else {
      setSelectedMembers((prev) => [...prev, emp]);
    }
  };

  const removeMember = (empId: string) => {
    if (empId === teamLeadId) return;
    setSelectedMembers((prev) => prev.filter((m) => m.id !== empId));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim() || !companyId || !currentUserId) return;

    setCreating(true);
    try {
      const memberIds = selectedMembers.map((m) => m.id);
      const finalMemberIds = Array.from(
        new Set([
          currentUserId,
          ...(teamLeadId ? [teamLeadId] : []),
          ...memberIds,
        ])
      );

      const created = await createTeam({
        name: teamName.trim(),
        description: teamDescription.trim(),
        lead_id: teamLeadId || currentUserId,
        is_private: true,
        color: "var(--color-primary)",
        icon: initialIcon || "Users",
        company_id: companyId,
        created_by: currentUserId,
        member_ids: finalMemberIds,
      });

      if (created) {
        handleClose();
        handleCreated(created);
      }
    } catch (err: any) {
      console.error("Error creating team:", err);
      alert(err?.message || "Failed to create team. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const selectedLead = employees.find((e) => e.id === teamLeadId);

  const filteredEmployeesForAdd = employees.filter((e) => {
    if (!memberSearchQuery.trim()) return true;
    const q = memberSearchQuery.toLowerCase();
    return (
      (e.full_name || "").toLowerCase().includes(q) ||
      (e.department_name || "").toLowerCase().includes(q)
    );
  });

  return (
    <Dialog.Root open={open} onOpenChange={(val) => !creating && !val && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="hub-modal-overlay" />
        <Dialog.Content className="hub-modal-content">
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
            {/* Header */}
            <div className="hub-modal-header" style={{ paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--color-border)" }}>
              <Dialog.Title className="hub-modal-title">
                New Team
              </Dialog.Title>
              <button
                type="button"
                onClick={handleClose}
                disabled={creating}
                className="btn-icon"
                aria-label="Close"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            {/* Form Body */}
            <div style={{ padding: "var(--space-5) 0", overflowY: "auto", display: "flex", flexDirection: "column", gap: "var(--space-4)", flex: 1 }}>
              {/* Step 1: Team Name */}
              <div>
                <label className="hub-form-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>
                  Name *
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Engineering, Marketing, Design"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  disabled={creating}
                  className="form-input"
                  style={{ width: "100%" }}
                />
              </div>

              {/* Step 2: Description (Unlocked when Name is provided) */}
              <div style={{ opacity: isNameFilled ? 1 : 0.5, pointerEvents: isNameFilled ? "auto" : "none", transition: "opacity var(--transition-fast)" }}>
                <label className="hub-form-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder={isNameFilled ? "What is this team responsible for?" : "Enter team name first"}
                  value={teamDescription}
                  onChange={(e) => setTeamDescription(e.target.value)}
                  disabled={creating || !isNameFilled}
                  className="form-input"
                  style={{ width: "100%", resize: "none" }}
                />
              </div>

              {/* Step 3: Team Lead (Unlocked when Name is provided) */}
              <div style={{ opacity: isNameFilled ? 1 : 0.5, pointerEvents: isNameFilled ? "auto" : "none", transition: "opacity var(--transition-fast)" }}>
                <label className="hub-form-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>
                  Team Lead *
                </label>
                <select
                  value={teamLeadId}
                  onChange={(e) => handleLeadChange(e.target.value)}
                  disabled={creating || !isNameFilled}
                  className="form-input"
                  style={{ width: "100%" }}
                >
                  <option value="" disabled>
                    {isNameFilled ? "Select team lead" : "Enter team name first"}
                  </option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} {emp.department_name ? `(${emp.department_name})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 4: Add Members (Unlocked when Team Lead is selected) */}
              <div style={{ opacity: isLeadSelected ? 1 : 0.5, pointerEvents: isLeadSelected ? "auto" : "none", transition: "opacity var(--transition-fast)" }}>
                <label className="hub-form-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>
                  Members
                </label>

                {/* Selected members chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1-5)", marginBottom: "var(--space-2)", minHeight: "36px", padding: "var(--space-2)", backgroundColor: "var(--color-surface-subtle)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)" }}>
                  {selectedMembers.length === 0 ? (
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", padding: "2px 0" }}>
                      {isLeadSelected ? "No additional members selected" : "Select a team lead first"}
                    </span>
                  ) : (
                    selectedMembers.map((option) => {
                      const isLead = option.id === teamLeadId;
                      return (
                        <span
                          key={option.id}
                          className="hub-badge hub-badge-neutral"
                          style={{ gap: "var(--space-1-5)", padding: "2px 6px" }}
                        >
                          {isLead ? (
                            <Crown size={12} />
                          ) : (
                            <img
                              src={sanitizeProfilePhoto(option.avatar_url) || undefined}
                              alt=""
                              className="hub-avatar-xs"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          )}
                          <span>{option.full_name}{isLead ? " (Lead)" : ""}</span>
                          {!isLead && (
                            <button
                              type="button"
                              onClick={() => removeMember(option.id)}
                              className="btn-icon"
                              style={{ width: "14px", height: "14px" }}
                            >
                              <CloseIcon size={12} />
                            </button>
                          )}
                        </span>
                      );
                    })
                  )}
                </div>

                {/* Member Search & Selection Box */}
                {isLeadSelected && (
                  <div style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", padding: "var(--space-1-5) var(--space-2-5)", backgroundColor: "var(--color-surface)", borderBottom: "1px solid var(--color-border-subtle)" }}>
                      <Search size={14} className="ui-icon-muted" style={{ marginRight: "var(--space-2)", flexShrink: 0 }} />
                      <input
                        type="text"
                        placeholder="Search colleagues to add..."
                        value={memberSearchQuery}
                        onChange={(e) => {
                          setMemberSearchQuery(e.target.value);
                          setShowMemberDropdown(true);
                        }}
                        onFocus={() => setShowMemberDropdown(true)}
                        style={{ border: "none", background: "transparent", width: "100%", outline: "none", fontSize: "var(--font-size-xs)", color: "var(--color-text-primary)" }}
                      />
                    </div>

                    <div style={{ maxHeight: "140px", overflowY: "auto", backgroundColor: "var(--color-surface)" }}>
                      {filteredEmployeesForAdd.length === 0 ? (
                        <div style={{ padding: "var(--space-3)", textAlign: "center", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                          No matching employees found
                        </div>
                      ) : (
                        filteredEmployeesForAdd.map((emp) => {
                          const isLead = emp.id === teamLeadId;
                          const isSelected = selectedMembers.some((m) => m.id === emp.id);

                          return (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => toggleMemberSelection(emp)}
                              disabled={isLead}
                              style={{
                                width: "100%",
                                padding: "var(--space-2) var(--space-3)",
                                textAlign: "left",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                backgroundColor: isSelected ? "var(--color-surface-hover)" : "transparent",
                                border: "none",
                                borderBottom: "1px solid var(--color-border-subtle)",
                                cursor: isLead ? "default" : "pointer",
                                opacity: isLead ? 0.7 : 1,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", minWidth: 0 }}>
                                <div className="hub-avatar-sm" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "var(--font-weight-semibold)", backgroundColor: "var(--color-primary)", color: "var(--color-primary-contrast)", flexShrink: 0 }}>
                                  {emp.full_name?.charAt(0) || "U"}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-medium)", color: "var(--color-text-primary)" }} >
                                    {emp.full_name}
                                  </div>
                                  {emp.department_name && (
                                    <div style={{ fontSize: "var(--font-size-2xs)", color: "var(--color-text-muted)" }} >
                                      {emp.department_name}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div style={{ flexShrink: 0, marginLeft: "var(--space-2)" }}>
                                {isLead ? (
                                  <span className="hub-badge hub-badge-approved">
                                    Team Lead
                                  </span>
                                ) : isSelected ? (
                                  <div style={{ width: "16px", height: "16px", borderRadius: "var(--radius-xs)", backgroundColor: "var(--color-primary)", color: "var(--color-primary-contrast)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <Check size={11} />
                                  </div>
                                ) : (
                                  <div style={{ width: "16px", height: "16px", borderRadius: "var(--radius-xs)", border: "1px solid var(--color-border)" }} />
                                )}
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{ padding: "var(--space-4) 0 0", borderTop: "1px solid var(--color-border)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "var(--space-2)", flexShrink: 0 }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={creating}
                className="btn btn-secondary"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!teamName.trim() || !teamLeadId || creating}
                className="btn btn-primary"
              >
                {creating ? (
                  <>
                    <Loader2 size={13}  />
                    Creating...
                  </>
                ) : (
                  "Create Team"
                )}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

