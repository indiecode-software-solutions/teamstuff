import React, { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import Layout from "../components/Layout";
import RequireWorkspaceRole from "../components/RequireWorkspaceRole";
import { Search, Download } from "lucide-react";

export const Route = createFileRoute("/accountant-workspace/payroll")({
  head: () => ({
    title: "Teamstuff | Payroll Management",
    meta: [
      {
        name: "description",
        content: "Manage employee payroll, disbursements, and financial records.",
      },
    ],
  }),
  component: AccountantPayrollPage,
});

function AccountantPayrollPage() {
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [monthFilter, setMonthFilter] = useState("August 2026");

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  const mockPayroll = [
    {
      id: 1,
      name: "Alice Johnson",
      role: "Product Designer",
      gross: 8500,
      tax: 1275,
      net: 7225,
      status: "paid",
    },
    {
      id: 2,
      name: "Bob Smith",
      role: "Senior Developer",
      gross: 12000,
      tax: 2400,
      net: 9600,
      status: "pending",
    },
    {
      id: 3,
      name: "Charlie Davis",
      role: "HR Manager",
      gross: 7800,
      tax: 1170,
      net: 6630,
      status: "paid",
    },
    {
      id: 4,
      name: "Diana Prince",
      role: "Accountant",
      gross: 8200,
      tax: 1230,
      net: 6970,
      status: "paid",
    },
    {
      id: 5,
      name: "Edward Norton",
      role: "Marketing Lead",
      gross: 9000,
      tax: 1350,
      net: 7650,
      status: "pending",
    },
  ];

  const filtered = mockPayroll.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.role.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <Layout activeTab="Finance">
      <RequireWorkspaceRole>
        <div >
          <h1 >
            Payroll Operations
          </h1>

          {/* Toolbar */}
          <div >
            <div >
              <div >
                <Search size={15}  />
                <input
                  type="text"
                  placeholder="Search by employee name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  
                />
              </div>

              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                
              >
                <option value="August 2026">August 2026</option>
                <option value="July 2026">July 2026</option>
                <option value="June 2026">June 2026</option>
              </select>
            </div>

            <div >
              <button >
                <Download size={13} />
                Export PDF
              </button>
              <button >
                Process Batch
              </button>
            </div>
          </div>

          {/* Payroll Table */}
          <div >
            <div >
              <table >
                <thead>
                  <tr >
                    <th >Employee</th>
                    <th >Gross Salary</th>
                    <th >Tax/Deduction</th>
                    <th >Net Pay</th>
                    <th >Status</th>
                  </tr>
                </thead>
                <tbody >
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} >
                        <td >
                          <div  />
                          <div  />
                        </td>
                        <td ><div  /></td>
                        <td ><div  /></td>
                        <td ><div  /></td>
                        <td ><div  /></td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} >
                        No employees found matching &quot;{searchTerm}&quot;.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr key={row.id} >
                        <td >
                          <div >{row.name}</div>
                          <div >{row.role}</div>
                        </td>
                        <td >
                          ₹{row.gross.toLocaleString()}
                        </td>
                        <td >
                          -₹{row.tax.toLocaleString()}
                        </td>
                        <td >
                          ₹{row.net.toLocaleString()}
                        </td>
                        <td >
                          <span
                            className={`rounded uppercase${ row.status === "paid" ? "" : "" }`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </RequireWorkspaceRole>
    </Layout>
  );
}
