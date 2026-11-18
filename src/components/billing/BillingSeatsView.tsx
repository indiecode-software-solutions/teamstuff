import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  CreditCard,
  Users,
  Loader2,
  CheckCircle2,
  Receipt,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  UserCog,
  RefreshCw,
} from "lucide-react";
import {
  getBillingPortalDataServerFn,
  startWorkspaceSubscriptionCheckout,
} from "../../lib/billing";
import {
  getTrialDaysRemaining,
  calculateWorkspaceMonthlyPrice,
  type CompanyContextLike,
} from "../../lib/permissions";
import "../../styles/billing.css";

const USERS_PER_PAGE = 5;

function getPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const items: (number | string)[] = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  if (start > 2) items.push("ellipsis-left");
  for (let p = start; p <= end; p += 1) items.push(p);
  if (end < totalPages - 1) items.push("ellipsis-right");
  items.push(totalPages);
  return items;
}

export interface BillingMember {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  created_at?: string | null;
  is_active?: boolean | null;
}

export interface BillingTransaction {
  id: string;
  created_at?: string | null;
  description?: string | null;
  transaction_type?: string | null;
  seats_delta?: number | null;
  amount_inr?: number | null;
  status?: string | null;
  razorpay_payment_id?: string | null;
  razorpay_order_id?: string | null;
}

interface BillingSeatsViewProps {
  currentUser: {
    id: string;
    email?: string | null;
    role?: string | null;
    permissions?: any;
    company_id?: string | null;
  } | null;
  companyId?: string | null;
  onNavigateToUsers?: () => void;
  onCompanyUpdated?: (company: any) => void;
}

export function BillingSeatsView({
  currentUser,
  companyId,
  onNavigateToUsers,
  onCompanyUpdated,
}: BillingSeatsViewProps) {
  const activeCompanyId = companyId || currentUser?.company_id;

  const [company, setCompany] = useState<CompanyContextLike | null>(null);
  const [activeUsersCount, setActiveUsersCount] = useState<number>(0);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [teamMembers, setTeamMembers] = useState<BillingMember[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [rosterPage, setRosterPage] = useState(1);

  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showManageMenu, setShowManageMenu] = useState(false);
  const manageMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showManageMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (manageMenuRef.current && !manageMenuRef.current.contains(e.target as Node)) {
        setShowManageMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showManageMenu]);

  const loadSnapshot = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!activeCompanyId || !currentUser?.id) {
      setIsLoading(false);
      return;
    }
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const res = await getBillingPortalDataServerFn({
        data: {
          companyId: activeCompanyId,
          userId: currentUser.id,
        },
      });

      if (res.success) {
        if (res.company) {
          setCompany(res.company);
          if (onCompanyUpdated) onCompanyUpdated(res.company);
        }
        if (typeof res.activeEmployeesCount === "number") {
          setActiveUsersCount(res.activeEmployeesCount);
        }
        if (Array.isArray(res.transactions)) {
          setTransactions(res.transactions);
        }
        if (Array.isArray(res.teamMembers)) {
          setTeamMembers(res.teamMembers);
        }
      } else if (res.error) {
        setErrorMsg(res.error);
      }
    } catch (err: any) {
      console.error("Failed to load billing snapshot:", err);
      setErrorMsg("Unable to retrieve billing records.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSnapshot({ silent: false });
  }, [activeCompanyId, currentUser?.id]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    if (!q) return teamMembers;
    return teamMembers.filter(
      (m) =>
        String(m.name || "").toLowerCase().includes(q) ||
        String(m.email || "").toLowerCase().includes(q) ||
        String(m.role || "").toLowerCase().includes(q),
    );
  }, [teamMembers, memberQuery]);

  const isExempt = Boolean(company?.is_billing_exempt);
  const billableUsersCount = Math.max(1, activeUsersCount || teamMembers.length || 1);
  const pricing = calculateWorkspaceMonthlyPrice(company, billableUsersCount);
  const { basePrice, baseSeats, extraSeatPrice, extraUsersCount, monthlyTotalInr } = pricing;
  const trialDaysLeft = getTrialDaysRemaining(company);
  const status = String(company?.subscription_status || "trialing").toLowerCase();
  const isTrialStatus = status === "trialing";
  const hasPaidBefore = Boolean(company?.current_period_end) || status === "active";
  const hasAutopay = Boolean(company?.razorpay_subscription_id);
  const isAutopayHealthy = hasAutopay && status === "active";

  const formattedPeriodEnd = company?.current_period_end
    ? new Date(company.current_period_end).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const showPrimaryPayCta = !isExempt && !isAutopayHealthy;

  const handleActivateOrRenew = async () => {
    if (!activeCompanyId || !currentUser?.id) return;
    setErrorMsg("");
    setSuccessMsg("");
    setIsPaying(true);

    await startWorkspaceSubscriptionCheckout({
      companyId: activeCompanyId,
      userId: currentUser.id,
      seats: billableUsersCount,
      onSuccess: async () => {
        setIsPaying(false);
        setSuccessMsg(
          hasPaidBefore
            ? `Autopay renewed successfully for ${billableUsersCount} active user${billableUsersCount > 1 ? "s" : ""}!`
            : `Autopay activated successfully for ${billableUsersCount} active user${billableUsersCount > 1 ? "s" : ""}!`,
        );
        await loadSnapshot({ silent: true });
      },
      onError: (err) => {
        setIsPaying(false);
        setErrorMsg(err || "Could not process Razorpay checkout.");
      },
      onDismiss: () => {
        setIsPaying(false);
      },
    });
  };

  const renderPlanStatus = () => {
    if (isExempt) {
      return (
        <span className="billing-plan-status active">
          <span className="billing-plan-status-dot" aria-hidden="true" />
          <span>Enterprise Exempt</span>
        </span>
      );
    }
    if (status === "active") {
      return (
        <span className="billing-plan-status active">
          <span className="billing-plan-status-dot" aria-hidden="true" />
          <span>{hasAutopay ? "Autopay Active" : "Active Monthly"}</span>
        </span>
      );
    }
    if (isTrialStatus) {
      return (
        <span className="billing-plan-status trialing">
          <span className="billing-plan-status-dot" aria-hidden="true" />
          <span>14-Day Trial · {trialDaysLeft}d left</span>
        </span>
      );
    }
    return (
      <span className="billing-plan-status expired">
        <span className="billing-plan-status-dot" aria-hidden="true" />
        <span>{hasPaidBefore ? "Renewal Required" : "Trial Ended"}</span>
      </span>
    );
  };

  const totalPages = Math.max(1, Math.ceil(filteredMembers.length / USERS_PER_PAGE));
  const safePage = Math.min(rosterPage, totalPages);
  const pageStart = (safePage - 1) * USERS_PER_PAGE;
  const visibleMembers = filteredMembers.slice(pageStart, pageStart + USERS_PER_PAGE);
  const paginationItems = getPaginationItems(safePage, totalPages);

  return (
    <div className="billing-view-container">
      {/* Top Header & Live Status Pill */}
      <div className="billing-header">
        <div className="billing-header-title-group">
          <h1 className="billing-header-title">Billing &amp; Plans</h1>
          <p className="billing-header-subtitle">
            Manage your subscription, dynamic seat capacity, and Razorpay autopay.
          </p>
        </div>

        <div>
          {isLoading ? (
            <div style={{ width: "110px", height: "34px", background: "#f4f4f5", borderRadius: "8px" }} />
          ) : (
            renderPlanStatus()
          )}
        </div>
      </div>

      {/* Alert Messages */}
      {successMsg && (
        <div className="billing-alert-box success" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="billing-alert-box error" role="alert">
          <span>{errorMsg}</span>
        </div>
      )}

      {/* CARD 1: Workspace Plan Overview */}
      <section className="billing-overview-card billing-plan-overview-card">
        <div className="billing-card-header-row">
          <div className="billing-card-title-group">
            <Users size={18} strokeWidth={1.75} className="billing-card-icon" aria-hidden="true" />
            <h2 className="billing-card-title">Workspace Plan</h2>
          </div>

          <span className="billing-overview-badge">
            {formattedPeriodEnd
              ? hasAutopay
                ? `Autopay Renews ${formattedPeriodEnd}`
                : `Renews ${formattedPeriodEnd}`
              : `Base Plan (${baseSeats} users incl.)`}
          </span>
        </div>

        {/* 3 Metrics Tiles */}
        <div className="billing-tiles-row">
          <div className="billing-tile">
            <span className="billing-tile-val">{billableUsersCount}</span>
            <span className="billing-tile-lbl">
              {billableUsersCount <= baseSeats
                ? `Active Users (up to ${baseSeats} incl.)`
                : `Active Users (${extraUsersCount} billable extra)`}
            </span>
          </div>

          <div className="billing-tile">
            <span className="billing-tile-val">
              ₹{basePrice.toLocaleString("en-IN")}
            </span>
            <span className="billing-tile-lbl">
              Base Plan ({baseSeats} users) · +₹{extraSeatPrice}/extra
            </span>
          </div>

          <div className="billing-tile">
            <span className="billing-tile-val">
              {isExempt ? "Exempt" : `₹${monthlyTotalInr.toLocaleString("en-IN")}`}
            </span>
            <span className="billing-tile-lbl">
              {hasAutopay
                ? "Next Autopay Debit / mo"
                : hasPaidBefore
                ? "Next Renewal Estimate / mo"
                : "Plan Total / mo"}
            </span>
          </div>
        </div>

        {/* Footnote & Action Buttons */}
        <div className={`billing-plan-actions-row ${!showPrimaryPayCta && !isExempt ? "end" : ""}`}>
          {isExempt && (
            <p className="billing-plan-footnote">
              Internal billing-exempt workspace. Team size scales automatically without checkout.
            </p>
          )}

          {!isExempt && isAutopayHealthy && (
            <p className="billing-plan-footnote">
              Autopay active via e-mandate · Next debit of ₹{monthlyTotalInr.toLocaleString("en-IN")} on {formattedPeriodEnd}. (₹{basePrice.toLocaleString("en-IN")} base tier for up to {baseSeats} users{extraUsersCount > 0 ? ` + ${extraUsersCount} extra @ ₹${extraSeatPrice}/user` : ""})
            </p>
          )}

          {!isExempt && !isAutopayHealthy && (
            <p className="billing-plan-footnote">
              Base tier is ₹{basePrice.toLocaleString("en-IN")}/mo including up to {baseSeats} users. Any additional users above {baseSeats} are billed at +₹{extraSeatPrice}/user/mo automatically as your team scales.
            </p>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {showPrimaryPayCta && (
              <button
                type="button"
                className="billing-plan-cta-btn"
                onClick={handleActivateOrRenew}
                disabled={isPaying}
              >
                {isPaying ? (
                  <>
                    <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <CreditCard size={15} strokeWidth={1.75} aria-hidden="true" />
                    <span>
                      {hasPaidBefore
                        ? `Reactivate Autopay · ₹${monthlyTotalInr.toLocaleString("en-IN")}`
                        : `Set up Autopay · ₹${monthlyTotalInr.toLocaleString("en-IN")}`}
                    </span>
                  </>
                )}
              </button>
            )}

            <div className="billing-manage-menu-container" ref={manageMenuRef}>
              <button
                type="button"
                className="billing-secondary-btn"
                onClick={() => setShowManageMenu((prev) => !prev)}
                aria-expanded={showManageMenu}
              >
                <UserCog size={14} aria-hidden="true" />
                <span>Manage</span>
                <ChevronDown
                  size={13}
                  className={`billing-manage-chevron ${showManageMenu ? "open" : ""}`}
                  aria-hidden="true"
                />
              </button>

              {showManageMenu && (
                <div className="billing-manage-dropdown" role="menu">
                  <button
                    type="button"
                    className="billing-dropdown-item"
                    onClick={() => {
                      setShowManageMenu(false);
                      handleActivateOrRenew();
                    }}
                    role="menuitem"
                  >
                    <CreditCard size={14} aria-hidden="true" />
                    <span>Change Payment Method</span>
                  </button>

                  {typeof onNavigateToUsers === "function" && (
                    <button
                      type="button"
                      className="billing-dropdown-item"
                      onClick={() => {
                        setShowManageMenu(false);
                        onNavigateToUsers();
                      }}
                      role="menuitem"
                    >
                      <Users size={14} aria-hidden="true" />
                      <span>Manage Users</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CARD 2: Active Team Roster */}
      <section className="billing-overview-card">
        <div className="billing-card-header-row">
          <div className="billing-card-title-group">
            <Users size={18} strokeWidth={1.75} className="billing-card-icon" aria-hidden="true" />
            <h2 className="billing-card-title">Active Team Roster</h2>
            <span className="billing-overview-badge">
              {teamMembers.length} active {teamMembers.length === 1 ? "user" : "users"}
            </span>
          </div>

          {teamMembers.length > 4 && (
            <div className="billing-search-region">
              <div className="billing-search-wrapper">
                <Search size={14} strokeWidth={1.75} className="billing-search-icon" aria-hidden="true" />
                <input
                  type="search"
                  value={memberQuery}
                  onChange={(e) => {
                    setMemberQuery(e.target.value);
                    setRosterPage(1);
                  }}
                  placeholder="Search users..."
                  className="billing-search-input"
                />
              </div>
            </div>
          )}
        </div>

        {filteredMembers.length === 0 ? (
          <div className="billing-empty-inline">
            No active team members match &ldquo;{memberQuery}&rdquo;.
          </div>
        ) : (
          <>
            <div className="billing-table-wrapper">
              <table className="billing-bordered-table">
                <thead>
                  <tr>
                    <th scope="col" className="billing-col-index">#</th>
                    <th scope="col">Member</th>
                    <th scope="col">Role</th>
                    <th scope="col" className="billing-col-action">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMembers.map((member, idx) => (
                    <tr key={member.id}>
                      <td className="billing-col-index">{pageStart + idx + 1}</td>

                      <td>
                        <div className="billing-member-cell">
                          <span className="billing-member-name">{member.name || "Workspace Member"}</span>
                          <span className="billing-member-email">{member.email || "—"}</span>
                        </div>
                      </td>

                      <td>
                        <span className={`billing-role-text ${member.role === "admin" ? "is-admin" : ""}`}>
                          {member.role === "admin" ? "Admin" : "Member"}
                        </span>
                      </td>

                      <td className="billing-col-action">
                        <span className="billing-added-date">
                          {member.created_at
                            ? new Date(member.created_at).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="billing-pagination-bar">
                <span className="billing-pagination-meta">
                  Showing {pageStart + 1}–{pageStart + visibleMembers.length} of {filteredMembers.length} users
                </span>

                <nav className="billing-pagination-controls" aria-label="Team roster pagination">
                  <button
                    type="button"
                    className="billing-page-btn"
                    onClick={() => setRosterPage(Math.max(1, safePage - 1))}
                    disabled={safePage <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={14} aria-hidden="true" />
                  </button>

                  {paginationItems.map((item, i) =>
                    typeof item === "number" ? (
                      <button
                        key={item}
                        type="button"
                        className={`billing-page-btn ${item === safePage ? "active" : ""}`}
                        onClick={() => setRosterPage(item)}
                        aria-current={item === safePage ? "page" : undefined}
                      >
                        {item}
                      </button>
                    ) : (
                      <span key={`ellipsis-${i}`} className="billing-page-ellipsis" aria-hidden="true">
                        …
                      </span>
                    ),
                  )}

                  <button
                    type="button"
                    className="billing-page-btn"
                    onClick={() => setRosterPage(Math.min(totalPages, safePage + 1))}
                    disabled={safePage >= totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                </nav>
              </div>
            )}
          </>
        )}
      </section>

      {/* CARD 3: Payment & Billing History */}
      <section className="billing-overview-card">
        <div className="billing-card-header-row">
          <div className="billing-card-title-group">
            <Receipt size={18} strokeWidth={1.75} className="billing-card-icon" aria-hidden="true" />
            <h2 className="billing-card-title">Payment &amp; Billing History</h2>
            <span className="billing-overview-badge">
              {transactions.length} {transactions.length === 1 ? "payment" : "payments"}
            </span>
          </div>

          <button
            type="button"
            className="billing-secondary-btn"
            style={{ height: "30px", padding: "0 10px", fontSize: "0.75rem" }}
            onClick={() => loadSnapshot({ silent: false })}
            disabled={isLoading}
            title="Refresh history"
          >
            <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>

        {transactions.length === 0 ? (
          <div className="billing-empty-state">
            <Receipt size={26} strokeWidth={1.5} className="billing-card-icon" aria-hidden="true" />
            <h3>No payments recorded yet</h3>
            <p>
              When your monthly Razorpay Autopay renewals execute, the full receipt and ledger records will appear here.
            </p>
          </div>
        ) : (
          <div className="billing-table-wrapper">
            <table className="billing-bordered-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col" className="billing-col-num">Users</th>
                  <th scope="col" className="billing-col-num">Amount</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reference</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <span className="billing-added-date">
                        {tx.created_at
                          ? new Date(tx.created_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "—"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 500, color: "#09090b" }}>
                        {tx.description || tx.transaction_type}
                      </span>
                    </td>
                    <td className="billing-col-num">
                      <span>{tx.seats_delta || "—"}</span>
                    </td>
                    <td className="billing-col-num">
                      <span style={{ fontWeight: 500, color: "#09090b" }}>
                        ₹{Number(tx.amount_inr || 0).toLocaleString("en-IN")}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 500,
                          padding: "3px 8px",
                          borderRadius: "6px",
                          backgroundColor:
                            tx.status === "captured" || tx.status === "paid" || tx.status === "active"
                              ? "#f0fdf4"
                              : "#fafafa",
                          color:
                            tx.status === "captured" || tx.status === "paid" || tx.status === "active"
                              ? "#166534"
                              : "#71717a",
                          border: `1px solid ${
                            tx.status === "captured" || tx.status === "paid" || tx.status === "active"
                              ? "#bbf7d0"
                              : "#e4e4e7"
                          }`,
                        }}
                      >
                        {tx.status || "completed"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "#71717a" }}>
                        {tx.razorpay_payment_id || tx.razorpay_order_id || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
