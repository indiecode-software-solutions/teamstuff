import React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Search,
  Fingerprint,
  Crosshair,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../components/ui/tooltip";
import { supabase } from "../lib/supabase";
import { getDynamicPageTitle } from "../lib/tenant-brand";

export const Route = createFileRoute("/admin-console/attendance")({
  head: () => ({
    title: getDynamicPageTitle("Attendance Logs"),
    meta: [{ name: "description", content: "Review and track company employee attendance logs." }],
  }),
  component: AdminAttendanceLogs,
});

function AdminAttendanceLogs() {
  const [loading, setLoading] = React.useState(true);
  const [logs, setLogs] = React.useState<any[]>([]);
  const [filteredLogs, setFilteredLogs] = React.useState<any[]>([]);

  // Filter States
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedDate, setSelectedDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [statusFilter, setStatusFilter] = React.useState("all");

  React.useEffect(() => {
    fetchCompanyAttendance();
  }, [selectedDate]);

  React.useEffect(() => {
    applyFilters();
  }, [logs, searchTerm, statusFilter]);

  async function fetchCompanyAttendance() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (!profile?.company_id) return;
      const companyId = profile.company_id;

      // Query attendance logs joined with user profiles and office locations
      const { data: attendanceData, error } = await supabase
        .from("attendance")
        .select(
          `
          id,
          date,
          clock_in,
          clock_out,
          status,
          source,
          user_id,
          profiles:user_id ( name ),
          office_locations:office_location_id ( name )
        `,
        )
        .eq("company_id", companyId)
        .eq("date", selectedDate);

      if (error) throw error;
      setLogs(attendanceData || []);
    } catch (err) {
      console.error("Error fetching company logs:", err);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    let result = [...logs];

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((log) => {
        const empName = log.profiles?.name || "";
        return empName.toLowerCase().includes(term);
      });
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((log) => log.status === statusFilter);
    }

    setFilteredLogs(result);
  }

  function formatTime(isoStr: string | null): string {
    if (!isoStr) return "—";
    return new Date(isoStr).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }

  function formatDuration(clockIn: string | null, clockOut: string | null): string {
    if (!clockIn || !clockOut) return "—";
    const start = new Date(clockIn).getTime();
    const end = new Date(clockOut).getTime();
    const diffSec = Math.floor((end - start) / 1000);
    if (diffSec <= 0) return "00:00:00";

    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    const s = diffSec % 60;

    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return (
    <TooltipProvider>
      <div >
        <h1 >
          Company Attendance Logs
        </h1>

        {/* Filter Toolbar */}
        <div >
          <div >
            {/* Search Input */}
            <div >
              <Search  />
              <input
                type="text"
                placeholder="Search employee by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                
              />
            </div>

            {/* Date Selection */}
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              
            />

            {/* Status Select */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              
            >
              <option value="all">All Statuses</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="half_day">Half Day</option>
              <option value="absent">Absent</option>
            </select>
          </div>
        </div>

        {/* Logs Table */}
        <div >
          <div >
            <table >
              <thead>
                <tr >
                  <th >Employee</th>
                  <th >Clock In</th>
                  <th >Clock Out</th>
                  <th >Duration</th>
                  <th >Location</th>
                  <th >Status</th>
                  <th >Source</th>
                </tr>
              </thead>
              <tbody >
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} >
                      <td >
                        <div  />
                      </td>
                      <td >
                        <div  />
                      </td>
                      <td >
                        <div  />
                      </td>
                      <td >
                        <div  />
                      </td>
                      <td >
                        <div  />
                      </td>
                      <td >
                        <div  />
                      </td>
                      <td >
                        <div  />
                      </td>
                    </tr>
                  ))
                ) : filteredLogs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      
                    >
                      No records matched the active filter queries
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} >
                      <td >
                        {log.profiles?.name || "Unassigned Employee"}
                      </td>
                      <td >
                        {formatTime(log.clock_in)}
                      </td>
                      <td >
                        {formatTime(log.clock_out)}
                      </td>
                      <td >
                        {formatDuration(log.clock_in, log.clock_out)}
                      </td>
                      <td >
                        {log.office_locations?.name || "Remote / Unregistered"}
                      </td>
                      <td >
                        <StatusChip status={log.status} />
                      </td>
                      <td >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={`${ log.source === "biometric_essl" ? "" : "" }`}
                            >
                              {log.source === "biometric_essl" ? (
                                <Fingerprint  />
                              ) : (
                                <Crosshair  />
                              )}
                              {log.source === "biometric_essl" ? "Biometric" : "GPS"}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p >
                              {log.source === "biometric_essl"
                                ? "Recorded by biometric device"
                                : "Recorded via mobile GPS"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; text: string; border: string }> = {
    present: {
      label: "Present",
      bg: "bg-zinc-100",
      text: "text-zinc-900",
      border: "border-zinc-300",
    },
    absent: {
      label: "Absent",
      bg: "bg-zinc-100",
      text: "text-zinc-900",
      border: "border-zinc-300",
    },
    late: {
      label: "Late",
      bg: "bg-zinc-100",
      text: "text-zinc-900",
      border: "border-zinc-300",
    },
    half_day: {
      label: "Half Day",
      bg: "bg-zinc-100",
      text: "text-zinc-900",
      border: "border-zinc-300",
    },
  };

  const s = map[status] || {
    label: status,
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
  };

  return (
    <span
      className={`${s.bg}${s.text}${s.border}`}
    >
      {s.label}
    </span>
  );
}
