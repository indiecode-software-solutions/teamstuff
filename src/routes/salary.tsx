import React, { useState, useEffect, useRef, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import Layout from "../components/Layout";
import { supabase } from "../lib/supabase";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "../components/ui/tooltip";
import {
  getMyPayslips,
  getPayslipColumns,
  getDefaultPayslipColumns,
  getPayslipBranding,
  type PayslipColumns,
  type PayslipSignMode,
} from "../lib/payslips";
import {
  Eye,
  Download,
  Wallet,
  Landmark,
  Receipt,
  Printer,
  X,
  TrendingUp,
  IndianRupee,
} from "lucide-react";
import { SafeLockGuard } from "../components/SafeLockGuard";
import { SafeLockConfig, getSafeLockConfig } from "../lib/safelock";
import { getDynamicPageTitle } from "../lib/tenant-brand";

export const Route = createFileRoute("/salary")({
  head: () => ({
    title: getDynamicPageTitle("Salary & Payslips"),
    meta: [
      {
        name: "description",
        content: "View and manage your payslips, salary details, and tax documents.",
      },
    ],
  }),
  component: SalaryPage,
});

interface Payslip {
  id: string;
  month: string;
  payDate: string;
  grossPay: number;
  deductions: number;
  netPay: number;
  status: "Paid" | "Processing";
  metadataMap?: Record<string, string | number>;
  earningsMap: Record<string, number>;
  deductionsMap: Record<string, number>;
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #FFFFFF !important;
  }
  body * { visibility: hidden; }
  #payslip-doc, #payslip-doc * { visibility: visible; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  #payslip-doc {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    max-width: 100%;
    margin: 0 !important;
    padding: 12mm 15mm !important;
    box-sizing: border-box !important;
    box-shadow: none !important;
    page-break-inside: avoid;
    page-break-after: avoid;
  }
  #payslip-doc .payslip-header {
    margin-bottom: 16px !important;
  }
  #payslip-doc .payslip-top-grid {
    margin-bottom: 16px !important;
    border: 1px solid #E2E8F0 !important;
    border-collapse: collapse !important;
  }
  #payslip-doc .payslip-top-grid td {
    padding: 6px 10px !important;
    border: 1px solid #E2E8F0 !important;
  }
  #payslip-doc .payslip-field-label {
    font-size: 9.5px !important;
    font-weight: 600 !important;
    letter-spacing: 0.5px !important;
    color: #475569 !important;
    text-transform: uppercase !important;
    background-color: #f4f4f5 !important;
  }
  #payslip-doc .payslip-field-value {
    font-size: 11.5px !important;
    font-weight: 600 !important;
    color: #0F172A !important;
  }
  #payslip-doc .payslip-field-subtext {
    font-size: 10px !important;
    font-weight: 400 !important;
    color: #64748B !important;
  }
  #payslip-doc .net-pay-banner {
    margin-bottom: 16px !important;
    padding: 10px 16px !important;
    border: 1.5px solid #CBD5E1 !important;
    background-color: #f4f4f5 !important;
    border-radius: 4px !important;
  }
  #payslip-doc .payslip-breakdown-table {
    margin-bottom: 16px !important;
    border: 1.5px solid #CBD5E1 !important;
    border-collapse: collapse !important;
  }
  #payslip-doc .payslip-breakdown-table td,
  #payslip-doc .payslip-breakdown-table th {
    padding: 5px 8px !important;
    border: 1px solid #E2E8F0 !important;
  }
  #payslip-doc .payslip-breakdown-table .border-divider {
    border-left: 2px solid #CBD5E1 !important;
  }
  #payslip-doc .payslip-footer {
    padding-top: 14px !important;
  }
}
`;

function formatINR(n: number): string {
  return `₹${inrFormatter.format(n || 0)}`;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseMonth(month: string): Date {
  const m = month.match(/([A-Za-z]+)\s+(\d{4})/);
  const idx = MONTH_NAMES.indexOf(m?.[1] ?? "");
  const year = Number(m?.[2] ?? 0) || 0;
  return new Date(year, idx === -1 ? 0 : idx, 1);
}

const INDIAN_ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const INDIAN_TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function indianTwoDigits(n: number): string {
  if (n < 20) return INDIAN_ONES[n] || "";
  const tens = INDIAN_TENS[Math.floor(n / 10)] || "";
  const ones = INDIAN_ONES[n % 10] || "";
  return ones ? `${tens} ${ones}` : tens;
}

function indianThreeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let out = "";
  if (hundreds) out = `${INDIAN_ONES[hundreds] || ""} Hundred`;
  if (rest) out += (out ? " " : "") + indianTwoDigits(rest);
  return out;
}

function indianCurrencyInWords(n: number): string {
  let amount = Math.floor(n || 0);
  if (!amount) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = Math.floor(amount / 1e7);
  amount %= 1e7;
  const lakh = Math.floor(amount / 1e5);
  amount %= 1e5;
  const thousand = Math.floor(amount / 1e3);
  amount %= 1e3;
  if (crore) parts.push(`${indianThreeDigits(crore)} Crore`);
  if (lakh) parts.push(`${indianThreeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${indianThreeDigits(thousand)} Thousand`);
  if (amount) parts.push(indianThreeDigits(amount));
  return `${parts.join(" ")} Rupees Only`;
}

function SalaryPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [userInfo, setUserInfo] = useState<{
    name: string;
    title: string;
    employeeCode: string;
    company: string;
    logoUrl?: string | null;
    stampUrl?: string | null;
    signatureUrl?: string | null;
    signMode?: PayslipSignMode;
    fullName?: string | null;
    cin?: string | null;
    panNumber?: string | null;
    address?: string | null;
  } | null>(null);
  const [selectedPayslip, setSelectedPayslip] = useState<Payslip | null>(null);
  const [columns, setColumns] = useState<PayslipColumns>(getDefaultPayslipColumns());
  const [chartYear, setChartYear] = useState<number>(new Date().getFullYear());
  const [userId, setUserId] = useState<string>("");
  const [safelockConfig, setSafelockConfig] = useState<SafeLockConfig | null>(null);
  const [safelockLoading, setSafelockLoading] = useState(true);
  const initLoadedRef = useRef(false);

  useEffect(() => {
    if (initLoadedRef.current) return;
    initLoadedRef.current = true;

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        let name = "Employee";
        let title = "";
        let employeeCode = "";
        let company = "";
        let logoUrl: string | null = null;
        let stampUrl: string | null = null;
        let signatureUrl: string | null = null;
        let signMode: PayslipSignMode = "digital_notice";
        let fullName: string | null = null;
        let cin: string | null = null;
        let panNumber: string | null = null;
        let address: string | null = null;
        let columnsForCompany = getDefaultPayslipColumns();

        if (user) {
          setUserId(user.id);
          try {
            const cfg = await getSafeLockConfig(user.id);
            setSafelockConfig(cfg);
          } catch (e) {
            console.error("Error loading safelock config:", e);
          } finally {
            setSafelockLoading(false);
          }

          const { data: profile } = await supabase
            .from("profiles")
            .select("name, job_title, employee_code, company_id")
            .eq("id", user.id)
            .single();

          if (profile) {
            name = profile.name || name;
            title = profile.job_title || "";
            employeeCode = profile.employee_code || "";
            if (profile.company_id) {
              const [loadedCols, branding] = await Promise.all([
                getPayslipColumns(profile.company_id),
                getPayslipBranding(profile.company_id),
              ]);
              if (loadedCols) columnsForCompany = loadedCols;
              if (branding.logoUrl) logoUrl = branding.logoUrl;
              if (branding.stampUrl) stampUrl = branding.stampUrl;
              if (branding.signatureUrl) signatureUrl = branding.signatureUrl;
              if (branding.signMode) signMode = branding.signMode;
              if (branding.fullName) fullName = branding.fullName;
              if (branding.cin) cin = branding.cin;
              if (branding.panNumber) panNumber = branding.panNumber;
              if (branding.address) address = branding.address;

              const { data: companyRow } = await supabase
                .from("companies")
                .select("name")
                .eq("id", profile.company_id)
                .single();
              if (companyRow?.name) company = companyRow.name;
            }
          }
        }

        setUserInfo({
          name,
          title,
          employeeCode,
          company,
          logoUrl,
          stampUrl,
          signatureUrl,
          signMode,
          fullName,
          cin,
          panNumber,
          address,
        });
        setColumns(columnsForCompany);

        const records = await getMyPayslips();

        const mapped: Payslip[] = records.map((r) => {
          const month = r.pay_period;
          const payDate =
            r.pay_date ||
            (() => {
              const m = month.match(/([A-Za-z]+)\s+(\d{4})/);
              if (!m) return month;
              const monthIdx = [
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December",
              ].indexOf(m[1] || "");
              if (monthIdx === -1) return month;
              const lastDay = new Date(Number(m[2]), monthIdx + 1, 0);
              return lastDay.toISOString().slice(0, 10) || month;
            })();
          return {
            id: r.id,
            month,
            payDate,
            grossPay: r.gross_pay,
            deductions: r.total_deductions,
            netPay: r.net_pay,
            status: "Paid",
            metadataMap: r.metadata || {},
            earningsMap: Object.keys(r.earnings || {}).length
              ? r.earnings
              : {
                  basic: r.basic,
                  hra: r.hra,
                  allowance: r.allowance,
                  reimbursements: r.reimbursements,
                },
            deductionsMap: Object.keys(r.deductions || {}).length
              ? r.deductions
              : {
                  provident_fund: r.provident_fund,
                  professional_tax: r.professional_tax,
                  health_insurance: r.health_insurance,
                  tds: r.tds,
                },
          };
        });
        setPayslips(mapped);
      } catch (err) {
        console.error("Error loading payslips:", err);
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadMock = (month: string) => {
    alert(`Downloading PDF Payslip for ${month}...`);
  };

  const sortedPayslips = useMemo(
    () =>
      [...payslips].sort(
        (a, b) => parseMonth(a.month).getTime() - parseMonth(b.month).getTime(),
      ),
    [payslips],
  );

  const latest = sortedPayslips[sortedPayslips.length - 1];
  const totalNet = payslips.reduce((s, p) => s + (p.netPay || 0), 0);
  const totalDeductions = payslips.reduce((s, p) => s + (p.deductions || 0), 0);
  const avgNet = payslips.length > 0 ? totalNet / payslips.length : 0;

  const chartYears = useMemo(
    () =>
      Array.from(new Set(payslips.map((p) => parseMonth(p.month).getFullYear())))
        .filter((y) => y > 0)
        .sort((a, b) => b - a),
    [payslips],
  );

  const activeChartYear = chartYears.includes(chartYear)
    ? chartYear
    : chartYears[0] ?? new Date().getFullYear();

  const yearRecords = useMemo(() => {
    const map = new Map<number, Payslip>();
    sortedPayslips
      .filter((p) => parseMonth(p.month).getFullYear() === activeChartYear)
      .forEach((p) => map.set(parseMonth(p.month).getMonth(), p));
    return map;
  }, [sortedPayslips, activeChartYear]);

  const yearMaxNet = useMemo(
    () => Math.max(...[...yearRecords.values()].map((p) => p.netPay || 0), 0),
    [yearRecords],
  );

  const hasYearData = yearRecords.size > 0;

  return (
    <Layout activeTab="Salary">
      <SafeLockGuard
        tabName="Salary"
        userId={userId}
        config={safelockConfig}
        loadingConfig={safelockLoading}
        onConfigUpdated={(newCfg) => setSafelockConfig(newCfg)}
        mandatorySetup={true}
      >
        <div className="salary-page-container">


          {/* 4 Summary Metric Cards: Fixed cards & icons, shimmer only for dynamic values */}
          <div className="salary-metrics-grid">
            <div className="salary-stat-card">
              <div className="salary-stat-icon-box salary-stat-icon-blue">
                <Wallet size={20} />
              </div>
              <div className="salary-stat-content">
                <span className="salary-stat-label">Total Earnings</span>
                {isLoading ? (
                  <span
                    className="skeleton-shimmer"
                    style={{ width: "80px", height: "20px", display: "inline-block", borderRadius: "4px" }}
                  />
                ) : (
                  <span className="salary-stat-value">{formatINR(totalNet)}</span>
                )}
                <span className="salary-stat-subtitle">
                  {payslips.length === 0 ? "No payslips yet" : `Across ${payslips.length} payslip${payslips.length === 1 ? "" : "s"}`}
                </span>
              </div>
            </div>

            <div className="salary-stat-card">
              <div className="salary-stat-icon-box salary-stat-icon-emerald">
                <IndianRupee size={20} />
              </div>
              <div className="salary-stat-content">
                <span className="salary-stat-label">Latest Month</span>
                {isLoading ? (
                  <span
                    className="skeleton-shimmer"
                    style={{ width: "80px", height: "20px", display: "inline-block", borderRadius: "4px" }}
                  />
                ) : (
                  <span className="salary-stat-value">{latest ? formatINR(latest.netPay) : "—"}</span>
                )}
                <span className="salary-stat-subtitle">
                  {latest ? `Net for ${latest.month}` : "No payslips yet"}
                </span>
              </div>
            </div>

            <div className="salary-stat-card">
              <div className="salary-stat-icon-box salary-stat-icon-amber">
                <TrendingUp size={20} />
              </div>
              <div className="salary-stat-content">
                <span className="salary-stat-label">Total Deductions</span>
                {isLoading ? (
                  <span
                    className="skeleton-shimmer"
                    style={{ width: "80px", height: "20px", display: "inline-block", borderRadius: "4px" }}
                  />
                ) : (
                  <span className="salary-stat-value">{formatINR(totalDeductions)}</span>
                )}
                <span className="salary-stat-subtitle">Tax, PF, insurance etc.</span>
              </div>
            </div>

            <div className="salary-stat-card">
              <div className="salary-stat-icon-box salary-stat-icon-purple">
                <Landmark size={20} />
              </div>
              <div className="salary-stat-content">
                <span className="salary-stat-label">Avg Net Pay</span>
                {isLoading ? (
                  <span
                    className="skeleton-shimmer"
                    style={{ width: "80px", height: "20px", display: "inline-block", borderRadius: "4px" }}
                  />
                ) : (
                  <span className="salary-stat-value">{formatINR(avgNet)}</span>
                )}
                <span className="salary-stat-subtitle">Per published cycle</span>
              </div>
            </div>
          </div>

          {/* Monthly Net Pay Trend Chart */}
          <div className="salary-chart-card">
            <div className="salary-chart-header">
              <div className="salary-chart-title-group">
                <Receipt className="salary-chart-icon" />
                <h2 className="salary-chart-title">Net Pay Trend</h2>
              </div>
              <select
                value={activeChartYear}
                onChange={(e) => setChartYear(Number(e.target.value))}
                className="salary-year-select"
              >
                {(chartYears.length > 0 ? chartYears : [activeChartYear]).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {isLoading ? (
              <div className="salary-chart-bars-container">
                {MONTH_NAMES.map((name) => (
                  <div key={name} className="salary-chart-bar-col">
                    <div className="salary-chart-bar-track">
                      <div
                        className="salary-chart-bar-fill skeleton-shimmer"
                        style={{ height: "40%", borderRadius: "4px 4px 0 0" }}
                      />
                    </div>
                    <span className="salary-chart-bar-label">{name.slice(0, 3)}</span>
                  </div>
                ))}
              </div>
            ) : !hasYearData ? (
              <div className="salary-chart-empty">
                No earnings records for {activeChartYear} — payslips will appear here once published.
              </div>
            ) : (
              <TooltipProvider delayDuration={100}>
                <div className="salary-chart-bars-container">
                  {MONTH_NAMES.map((name, idx) => {
                    const rec = yearRecords.get(idx);
                    const pct =
                      rec && yearMaxNet > 0 ? Math.max((rec.netPay / yearMaxNet) * 100, 8) : 0;
                    return (
                      <Tooltip key={name}>
                        <TooltipTrigger asChild>
                          <div className="salary-chart-bar-col" tabIndex={0}>
                            <div className="salary-chart-bar-track">
                              <div
                                style={{ height: rec ? `${pct}%` : "0%" }}
                                className={rec ? "salary-chart-bar-fill" : "salary-chart-bar-fill salary-chart-bar-fill--empty"}
                              />
                            </div>
                            <span className="salary-chart-bar-label">{name.slice(0, 3)}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" align="center" className="salary-tooltip-content">
                          {rec ? (
                            <div className="salary-chart-tooltip">
                              <div className="salary-chart-tooltip-header">
                                <span className="salary-chart-tooltip-month">{rec.month}</span>
                                <span className="salary-status-badge paid">{rec.status}</span>
                              </div>
                              <div className="salary-chart-tooltip-net">
                                <span className="salary-chart-tooltip-net-label">Net Disbursed</span>
                                <span className="salary-chart-tooltip-net-value">{formatINR(rec.netPay)}</span>
                              </div>
                              <div className="salary-chart-tooltip-breakdown">
                                <span>Gross: {formatINR(rec.grossPay)}</span>
                                <span>•</span>
                                <span>Deductions: -{formatINR(rec.deductions)}</span>
                              </div>
                              {rec.payDate && (
                                <div className="salary-chart-tooltip-footer">
                                  Pay Date: {rec.payDate}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="salary-chart-tooltip salary-chart-tooltip--empty">
                              <span className="salary-chart-tooltip-month">{name} {activeChartYear}</span>
                              <span className="salary-chart-tooltip-muted">No payslip generated</span>
                            </div>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </TooltipProvider>
            )}
          </div>

          {/* Payslips Table Section */}
          <div className="salary-section-header">
            <h2 className="salary-section-title">Payslip Statements</h2>
          </div>

          <div className="salary-table-container">
            <div className="salary-table-scroll">
              <table className="salary-table">
                <thead>
                  <tr>
                    <th style={{ width: "18%" }}>Month</th>
                    <th style={{ width: "16%" }}>Pay Date</th>
                    <th style={{ width: "16%" }}>Gross Pay</th>
                    <th style={{ width: "16%" }}>Deductions</th>
                    <th style={{ width: "16%" }}>Net Pay</th>
                    <th style={{ width: "10%" }}>Status</th>
                    <th style={{ width: "8%", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, idx) => (
                      <tr key={idx}>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "90px", height: "14px", borderRadius: "4px" }} />
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "75px", height: "14px", borderRadius: "4px" }} />
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "70px", height: "14px", borderRadius: "4px" }} />
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "65px", height: "14px", borderRadius: "4px" }} />
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "75px", height: "14px", borderRadius: "4px" }} />
                        </td>
                        <td>
                          <div className="skeleton-shimmer" style={{ width: "50px", height: "20px", borderRadius: "6px" }} />
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="skeleton-shimmer" style={{ width: "60px", height: "26px", borderRadius: "6px", marginLeft: "auto" }} />
                        </td>
                      </tr>
                    ))
                  ) : payslips.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="salary-empty-state">
                        <Wallet className="salary-empty-icon" />
                        <p className="salary-empty-title">No payslips published yet</p>
                        <p className="salary-empty-subtitle">
                          Once your company's HR generates a payslip cycle, it will appear here.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    payslips.map((payslip) => (
                      <tr
                        key={payslip.id}
                        onClick={() => setSelectedPayslip(payslip)}
                        style={{ cursor: "pointer" }}
                      >
                        <td style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>
                          {payslip.month}
                        </td>
                        <td className="salary-cell--mono">{payslip.payDate}</td>
                        <td className="salary-cell--mono">₹{payslip.grossPay.toFixed(2)}</td>
                        <td className="salary-cell--deductions">-₹{payslip.deductions.toFixed(2)}</td>
                        <td className="salary-cell--net">₹{payslip.netPay.toFixed(2)}</td>
                        <td>
                          <span className="salary-status-badge paid">
                            {payslip.status}
                          </span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="salary-action-group">
                            <button
                              onClick={() => setSelectedPayslip(payslip)}
                              className="salary-action-btn"
                              title="View Payslip"
                            >
                              <Eye size={14} />
                              <span>View</span>
                            </button>
                            <button
                              onClick={() => handleDownloadMock(payslip.month)}
                              className="salary-action-btn salary-action-btn--icon"
                              title="Download PDF"
                            >
                              <Download size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed Payslip View Dialog */}
          <style>{PRINT_CSS}</style>
          <Dialog.Root open={!!selectedPayslip} onOpenChange={(open) => !open && setSelectedPayslip(null)}>
            <Dialog.Portal>
              <Dialog.Overlay className="payslip-modal-overlay" />
              <Dialog.Content className="payslip-modal-content" aria-describedby={undefined}>
                {selectedPayslip && (
                  <>
                    {/* Header Toolbar */}
                    <div className="payslip-modal-toolbar">
                      <Dialog.Title className="payslip-modal-title">
                        Payslip · {selectedPayslip.month}
                      </Dialog.Title>
                      <div className="payslip-modal-actions">
                        <button
                          onClick={handlePrint}
                          className="payslip-modal-print-btn"
                        >
                          <Printer size={15} />
                          <span>Print</span>
                        </button>
                        <button
                          onClick={() => setSelectedPayslip(null)}
                          className="payslip-modal-close-btn"
                          aria-label="Close"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Document Body */}
                    <div className="payslip-doc-wrapper">
                      <div id="payslip-doc">
                        {/* Company Header */}
                        <div className="payslip-header">
                          {userInfo?.logoUrl && (
                            <img
                              src={userInfo.logoUrl}
                              alt={userInfo.fullName || userInfo.company || "Company Logo"}
                              className="payslip-header-logo"
                            />
                          )}

                          {(userInfo?.fullName || userInfo?.company) && (
                            <h2 className="payslip-header-company">
                              {userInfo.fullName || userInfo.company}
                            </h2>
                          )}

                          {userInfo?.address && (
                            <p className="payslip-header-address">
                              {userInfo.address}
                            </p>
                          )}

                          {(userInfo?.cin || userInfo?.panNumber) && (
                            <div className="payslip-header-statutory">
                              {userInfo.cin && (
                                <span>
                                  <strong style={{ color: "#334155", fontWeight: 600 }}>CIN:</strong> {userInfo.cin}
                                </span>
                              )}
                              {userInfo.panNumber && (
                                <span>
                                  <strong style={{ color: "#334155", fontWeight: 600 }}>PAN:</strong> {userInfo.panNumber}
                                </span>
                              )}
                            </div>
                          )}

                          <div className="payslip-month-badge">
                            <span>
                              Payslip for the month of {selectedPayslip.month}
                            </span>
                          </div>
                        </div>

                        {/* Employee & Work Info Grid */}
                        <table className="payslip-top-grid">
                          <tbody>
                            {(() => {
                              const fields: Array<{ label: string; value: React.ReactNode; sub?: string | undefined }> = [
                                {
                                  label: "Employee Name",
                                  value: userInfo?.name || "Employee",
                                  sub: userInfo?.title || undefined,
                                },
                                {
                                  label: "Employee Code",
                                  value: userInfo?.employeeCode || "—",
                                  sub: `ID: ${selectedPayslip.id.slice(0, 8).toUpperCase()}`,
                                },
                                {
                                  label: "Pay Period",
                                  value: selectedPayslip.month,
                                  sub: "Monthly Statement",
                                },
                              ];

                              (columns?.metadata || []).forEach((col) => {
                                const isDuplicatePeriod =
                                  col.label.toLowerCase() === "pay period" || col.key === "pay_period";
                                const val =
                                  selectedPayslip.metadataMap?.[col.key] ??
                                  (col.key === "pay_date" ? selectedPayslip.payDate : undefined);
                                const displayLabel = isDuplicatePeriod ? "Pay Cycle Dates" : col.label;
                                fields.push({
                                  label: displayLabel,
                                  value:
                                    val !== undefined && val !== null && String(val).trim() !== ""
                                      ? String(val)
                                      : "—",
                                });
                              });

                              const rows: Array<Array<{ label: string; value: React.ReactNode; sub?: string | undefined }>> = [];
                              for (let i = 0; i < fields.length; i += 2) {
                                rows.push(fields.slice(i, i + 2));
                              }

                              return rows.map((pair, rIdx) => {
                                const first = pair[0];
                                const second = pair[1];
                                if (!first) return null;
                                return (
                                  <tr key={rIdx}>
                                    <td className="payslip-field-label">
                                      {first.label}
                                    </td>
                                    <td
                                      colSpan={pair.length === 1 ? 3 : 1}
                                      className="payslip-field-value"
                                    >
                                      <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                                        <span>{first.value}</span>
                                        {first.sub && (
                                          <span className="payslip-field-subtext">
                                            ({first.sub})
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    {second && (
                                      <>
                                        <td className="payslip-field-label">
                                          {second.label}
                                        </td>
                                        <td className="payslip-field-value">
                                          <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                                            <span>{second.value}</span>
                                            {second.sub && (
                                              <span className="payslip-field-subtext">
                                                ({second.sub})
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                      </>
                                    )}
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>

                        {/* Salary Breakdown Table */}
                        <table className="payslip-breakdown-table">
                          <thead>
                            <tr>
                              <th colSpan={3} className="earnings-head">
                                Earnings (Gross Additions)
                              </th>
                              <th colSpan={3} className="deductions-head">
                                Deductions (Statutory & Other)
                              </th>
                            </tr>
                            <tr className="subhead-row">
                              <th style={{ width: "5%", textAlign: "center" }}>#</th>
                              <th style={{ width: "25%", textAlign: "left" }}>Component</th>
                              <th style={{ width: "20%", textAlign: "right" }}>Amount</th>
                              <th style={{ width: "5%", textAlign: "center" }} className="border-divider">#</th>
                              <th style={{ width: "25%", textAlign: "left" }}>Component</th>
                              <th style={{ width: "20%", textAlign: "right" }}>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({
                              length: Math.max(columns.earnings.length, columns.deductions.length),
                            }).map((_, rowIdx) => {
                              const earn = columns.earnings[rowIdx];
                              const deduct = columns.deductions[rowIdx];
                              const isEven = rowIdx % 2 === 1;
                              return (
                                <tr key={rowIdx} className={isEven ? "row-even" : "row-odd"}>
                                  <td className="cell-idx">
                                    {rowIdx + 1}
                                  </td>
                                  <td className="cell-name">
                                    {earn?.label || "—"}
                                  </td>
                                  <td className="cell-amount">
                                    {formatINR(earn ? (selectedPayslip.earningsMap[earn.key] ?? 0) : 0)}
                                  </td>
                                  <td className="cell-idx border-divider">
                                    {rowIdx + 1}
                                  </td>
                                  <td className="cell-name">
                                    {deduct?.label || "—"}
                                  </td>
                                  <td className="cell-deduct-amount">
                                    −{formatINR(deduct ? (selectedPayslip.deductionsMap[deduct.key] ?? 0) : 0)}
                                  </td>
                                </tr>
                              );
                            })}
                            <tr className="payslip-totals-row">
                              <td colSpan={2} className="total-label">
                                Gross Earnings
                              </td>
                              <td className="gross-val">
                                {formatINR(selectedPayslip.grossPay)}
                              </td>
                              <td colSpan={2} className="total-label border-divider">
                                Total Deductions
                              </td>
                              <td className="deduct-val">
                                −{formatINR(selectedPayslip.deductions)}
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        {/* Net Pay Banner */}
                        <div className="net-pay-banner">
                          <div className="net-pay-banner-left">
                            <div className="net-pay-banner-title-row">
                              <span className="net-pay-banner-title">
                                Net Take-Home Pay
                              </span>
                              <span className="net-pay-transfer-badge">
                                Transfer Amount
                              </span>
                            </div>
                            <span className="net-pay-in-words">
                              {indianCurrencyInWords(selectedPayslip.netPay)}
                            </span>
                          </div>
                          <div className="net-pay-amount-display">
                            {formatINR(selectedPayslip.netPay)}
                          </div>
                        </div>

                        {/* Document Footer */}
                        <div className="payslip-footer">
                          <div className="payslip-footer-main">
                            <div className="payslip-footer-logo-col">
                              {userInfo?.logoUrl ? (
                                <img
                                  src={userInfo.logoUrl}
                                  alt={userInfo.company}
                                  className="payslip-footer-logo"
                                />
                              ) : userInfo?.company ? (
                                <div className="payslip-footer-company">
                                  {userInfo.company}
                                </div>
                              ) : null}
                              <span className="payslip-footer-confidential">
                                Confidential & Private
                              </span>
                            </div>

                            {userInfo?.signMode === "stamp_and_signature" ? (
                              <div className="payslip-footer-sign-col">
                                <div className="payslip-footer-sign-images">
                                  {userInfo?.stampUrl && (
                                    <img
                                      src={userInfo.stampUrl}
                                      alt="Company Stamp"
                                      className="payslip-footer-stamp"
                                    />
                                  )}
                                  {userInfo?.signatureUrl && (
                                    <img
                                      src={userInfo.signatureUrl}
                                      alt="Authorized Signatory"
                                      className="payslip-footer-sig"
                                    />
                                  )}
                                </div>
                                <div className="payslip-footer-sign-line">
                                  Authorized Signatory
                                </div>
                                <div className="payslip-footer-sign-for">
                                  For {userInfo?.company || "Indiecode Software Solutions"}
                                </div>
                              </div>
                            ) : (
                              <div className="payslip-footer-digital-notice">
                                This is a digitally generated payslip, no signature required.
                              </div>
                            )}
                          </div>

                          <div className="payslip-footer-quote">
                            “Thank you for being an invaluable part of our team”
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </SafeLockGuard>
    </Layout>
  );
}
