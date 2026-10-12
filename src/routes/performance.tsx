import React, { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import Layout from "../components/Layout";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Plus as AddIcon,
  Send as SendIcon,
  TriangleAlert as Warning,
  X as Close,
  ChevronRight,
  Info as InfoOutlined,
  Star,
  CheckCircle,
} from "lucide-react";

export const Route = createFileRoute("/performance")({
  head: () => ({
    title: "Performance & KRA Reports | CapOasis",
    meta: [
      { name: "description", content: "KRA Reports." },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
    ],
  }),
  component: PerformancePage,
});

export type KRAReportStatus = "Draft" | "Submitted" | "Reviewed" | "Under PIP";

export type KRAReport = {
  id: string;
  title: string;
  periodType: "Weekly" | "Monthly";
  startDate: string;
  endDate: string;
  reviewer: string;
  accomplishments: string;
  selfRating: number;
  status: KRAReportStatus;
  submittedAt?: string;
  reviewedAt?: string;
  remarks?: string;
  suggestions?: string;
  pipDetails?: string;
};

const initialReports: KRAReport[] = [
  {
    id: "rep-2",
    title: "August 2026 Monthly KRA Accomplishments",
    periodType: "Monthly",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
    reviewer: "Rahul Verma",
    accomplishments:
      "Building out the Performance & KRA Reports dashboard module. Currently integrating self-ratings, submission flows, and PIP manager review triggers.",
    selfRating: 5,
    status: "Draft",
  },
  {
    id: "rep-3",
    title: "Week 32 accomplishments - Directory Fixes",
    periodType: "Weekly",
    startDate: "2026-08-03",
    endDate: "2026-08-09",
    reviewer: "Priya Sharma",
    accomplishments:
      "Optimized mobile view layout for employee details card. Resolved profile avatar cache bugs and fixed an alignment gap on the desktop search box.",
    selfRating: 4,
    status: "Submitted",
    submittedAt: "2026-08-09T18:30:00.000Z",
  },
  {
    id: "rep-4",
    title: "Week 31 accomplishments - Router integration",
    periodType: "Weekly",
    startDate: "2026-07-27",
    endDate: "2026-08-02",
    reviewer: "Siddharth Roy",
    accomplishments:
      "Integrated Tanstack router with lazy-loaded route configuration. Set up root route wrapper and global sidebar navigation elements.",
    selfRating: 3,
    status: "Under PIP",
    submittedAt: "2026-08-02T19:00:00.000Z",
    reviewedAt: "2026-08-04T09:15:00.000Z",
    remarks:
      "The routing structure works fine, but multiple compilation warnings were ignored. Sprint delivery was delayed by 2 days.",
    suggestions:
      "Ensure you run the lint/compile checker locally before opening merge requests.",
    pipDetails:
      "Requires daily progress reporting to Siddharth Roy. Code test coverage must be maintained at a minimum of 80% for all new routes.",
  },
  {
    id: "rep-1",
    title: "July 2026 Monthly KRA Accomplishments",
    periodType: "Monthly",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
    reviewer: "Rahul Verma",
    accomplishments:
      "Successfully designed and launched the employee directory lookup, implemented clean responsive header layout, resolved skeleton loaders for salary stubs, and unified the calendar indicator views.",
    selfRating: 4,
    status: "Reviewed",
    submittedAt: "2026-07-31T17:00:00.000Z",
    reviewedAt: "2026-08-02T10:30:00.000Z",
    remarks:
      "Excellent delivery. The directory lookup was a highly requested feature and has outstanding visual design. Keep up the high standards.",
    suggestions: "Look into training junior frontend developers on custom Tailwind CSS patterns.",
  },
];

function StarRating({
  value,
  onChange,
  readOnly = false,
}: {
  value: number;
  onChange?: (val: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(star)}
          className={`${ readOnly ? "" : "" }`}
        >
          <Star
            size={15}
            className={
              star <= value
                ? "text-zinc-900 fill-zinc-900"
                : "text-muted-foreground/40"
            }
          />
        </button>
      ))}
    </div>
  );
}

function PerformancePage() {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<KRAReport[]>(initialReports);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<KRAReport | null>(null);

  // Form State for creating a new report
  const [newReport, setNewReport] = useState<Partial<KRAReport>>({
    title: "",
    periodType: "Monthly",
    startDate: "",
    endDate: "",
    reviewer: "Rahul Verma",
    accomplishments: "",
    selfRating: 5,
  });

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  // Simulator Form State (Manager Remarks)
  const [evalRemarks, setEvalRemarks] = useState("");
  const [evalSuggestions, setEvalSuggestions] = useState("");
  const [evalInitiatePip, setEvalInitiatePip] = useState(false);
  const [evalPipDetails, setEvalPipDetails] = useState(
    "Needs weekly goal checks on code test coverage and sprint deadline adherence.",
  );

  const handleOpenDetails = (report: KRAReport) => {
    setSelectedReport(report);
    setEvalRemarks(report.remarks || "");
    setEvalSuggestions(report.suggestions || "");
    setEvalInitiatePip(report.status === "Under PIP");
    setEvalPipDetails(
      report.pipDetails ||
        "Needs weekly goal checks on code test coverage and sprint deadline adherence.",
    );
  };

  const handleCreateReport = () => {
    if (newReport.title && newReport.startDate && newReport.endDate && newReport.accomplishments) {
      const created: KRAReport = {
        id: Math.random().toString(36).substring(2, 9),
        title: newReport.title,
        periodType: newReport.periodType || "Monthly",
        startDate: newReport.startDate,
        endDate: newReport.endDate,
        reviewer: newReport.reviewer || "Rahul Verma",
        accomplishments: newReport.accomplishments,
        selfRating: newReport.selfRating || 5,
        status: "Draft",
      };

      setReports([created, ...reports]);
      setCreateDialogOpen(false);
      setNewReport({
        title: "",
        periodType: "Monthly",
        startDate: "",
        endDate: "",
        reviewer: "Rahul Verma",
        accomplishments: "",
        selfRating: 5,
      });
    }
  };

  const handleSubmitDraft = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setReports((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: "Submitted", submittedAt: new Date().toISOString() } : r,
      ),
    );
  };

  const handleSimulateEvaluation = () => {
    if (!selectedReport) return;

    const updatedStatus: KRAReportStatus = evalInitiatePip ? "Under PIP" : "Reviewed";

    setReports((prev) =>
      prev.map((r) => {
        if (r.id === selectedReport.id) {
          const updated: KRAReport = {
            ...r,
            status: updatedStatus,
            remarks: evalRemarks,
            suggestions: evalSuggestions,
            reviewedAt: new Date().toISOString(),
          };
          if (evalInitiatePip) {
            updated.pipDetails = evalPipDetails;
          } else {
            delete updated.pipDetails;
          }
          return updated;
        }
        return r;
      }),
    );

    setSelectedReport((prev) => {
      if (!prev) return null;
      const updated: KRAReport = {
        ...prev,
        status: updatedStatus,
        remarks: evalRemarks,
        suggestions: evalSuggestions,
        reviewedAt: new Date().toISOString(),
      };
      if (evalInitiatePip) {
        updated.pipDetails = evalPipDetails;
      } else {
        delete updated.pipDetails;
      }
      return updated;
    });
  };

  const getStatusBadgeClass = (status: KRAReportStatus) => {
    switch (status) {
      case "Draft":
        return "bg-muted text-muted-foreground border-border/70";
      case "Submitted":
        return "bg-zinc-900/10 text-zinc-900 dark:text-zinc-100 border-zinc-900/20";
      case "Reviewed":
        return "bg-zinc-900/10 text-zinc-900 dark:text-zinc-100 border-zinc-300/20";
      case "Under PIP":
        return "bg-zinc-900/10 text-zinc-900 dark:text-zinc-100 border-zinc-900/20";
    }
  };

  return (
    <Layout activeTab="Performance">
      <div >
        {/* Page Title */}
        <div >
          <div>
            <h1 >
              Performance & KRA Reports
            </h1>
          </div>

          <button
            onClick={() => setCreateDialogOpen(true)}
            
          >
            <AddIcon size={14} />
            Create KRA Report
          </button>
        </div>

        {/* Reports History Card */}
        <div >
          <div >
            <h2 >My Submissions</h2>
          </div>

          <div >
            <table >
              <thead>
                <tr >
                  <th >Report</th>
                  <th >Period</th>
                  <th >Reviewer</th>
                  <th >Self Rating</th>
                  <th >Status</th>
                  <th >Actions</th>
                </tr>
              </thead>
              <tbody >
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} >
                      <td ><div  /></td>
                      <td ><div  /></td>
                      <td ><div  /></td>
                      <td ><div  /></td>
                      <td ><div  /></td>
                      <td ><div  /></td>
                    </tr>
                  ))
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan={6} >
                      No KRA reports created yet. Click &quot;Create KRA Report&quot; to begin.
                    </td>
                  </tr>
                ) : (
                  reports.map((report) => (
                    <tr
                      key={report.id}
                      onClick={() => handleOpenDetails(report)}
                      
                    >
                      <td >
                        {report.title}
                      </td>
                      <td >
                        {report.periodType}
                      </td>
                      <td >{report.reviewer}</td>
                      <td >
                        <StarRating value={report.selfRating} readOnly />
                      </td>
                      <td >
                        <span
                          className={`rounded uppercase${getStatusBadgeClass( report.status, )}`}
                        >
                          {report.status}
                        </span>
                      </td>
                      <td
                        
                        onClick={(e) => e.stopPropagation()}
                      >
                        {report.status === "Draft" ? (
                          <button
                            onClick={(e) => handleSubmitDraft(report.id, e)}
                            
                          >
                            <SendIcon size={10} />
                            Submit
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenDetails(report)}
                            
                          >
                            <ChevronRight size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dialog: Create KRA Report */}
        <Dialog.Root open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="modal-overlay" />
            <Dialog.Content className="modal-content">
              <div className="modal-header">
                <Dialog.Title className="modal-title">
                  New KRA Accomplishments Report
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button type="button" className="modal-close-btn" aria-label="Close">
                    <Close size={16} />
                  </button>
                </Dialog.Close>
              </div>

              <div >
                <div>
                  <label >Report Title *</label>
                  <input
                    type="text"
                    placeholder="e.g., August 2026 Accomplishments"
                    value={newReport.title}
                    onChange={(e) => setNewReport({ ...newReport, title: e.target.value })}
                    
                  />
                </div>

                <div >
                  <div>
                    <label >Period Type</label>
                    <select
                      value={newReport.periodType}
                      onChange={(e) =>
                        setNewReport({ ...newReport, periodType: e.target.value as any })
                      }
                      
                    >
                      <option value="Monthly">Monthly Report</option>
                      <option value="Weekly">Weekly Report</option>
                    </select>
                  </div>

                  <div>
                    <label >
                      Reviewer / Approver
                    </label>
                    <select
                      value={newReport.reviewer}
                      onChange={(e) => setNewReport({ ...newReport, reviewer: e.target.value })}
                      
                    >
                      <option value="Rahul Verma">Rahul Verma (Engineering Director)</option>
                      <option value="Priya Sharma">Priya Sharma (Lead UI Designer)</option>
                      <option value="Amit Patel">Amit Patel (VP of Product)</option>
                      <option value="Siddharth Roy">Siddharth Roy (Engineering Manager)</option>
                    </select>
                  </div>
                </div>

                <div >
                  <div>
                    <label >Start Date *</label>
                    <input
                      type="date"
                      value={newReport.startDate}
                      onChange={(e) => setNewReport({ ...newReport, startDate: e.target.value })}
                      
                    />
                  </div>

                  <div>
                    <label >End Date *</label>
                    <input
                      type="date"
                      value={newReport.endDate}
                      onChange={(e) => setNewReport({ ...newReport, endDate: e.target.value })}
                      
                    />
                  </div>
                </div>

                <div>
                  <label >
                    Key KRA Accomplishments *
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Outline what goals you reached, metrics met, or deliverables completed..."
                    value={newReport.accomplishments}
                    onChange={(e) =>
                      setNewReport({ ...newReport, accomplishments: e.target.value })
                    }
                    
                  />
                </div>

                <div >
                  <span >
                    Self Assessment Rating
                  </span>
                  <div >
                    <StarRating
                      value={newReport.selfRating || 5}
                      onChange={(val) => setNewReport({ ...newReport, selfRating: val })}
                    />
                    <span >
                      ({newReport.selfRating || 5} / 5 Stars)
                    </span>
                  </div>
                </div>
              </div>

              <div >
                <button
                  type="button"
                  onClick={() => setCreateDialogOpen(false)}
                  
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateReport}
                  disabled={
                    !newReport.title ||
                    !newReport.startDate ||
                    !newReport.endDate ||
                    !newReport.accomplishments
                  }
                  
                >
                  Save Draft
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        {/* Dialog: Report Inspection & Evaluation Simulator */}
        <Dialog.Root
          open={Boolean(selectedReport)}
          onOpenChange={(open) => !open && setSelectedReport(null)}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="modal-overlay" />
            <Dialog.Content className="modal-content" style={{ maxWidth: "600px" }}>
              {selectedReport && (
                <div>
                  <div className="modal-header">
                    <Dialog.Title className="modal-title">
                      KRA Accomplishments Report
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <button type="button" className="modal-close-btn" aria-label="Close">
                        <Close size={16} />
                      </button>
                    </Dialog.Close>
                  </div>

                  <div >
                    <div>
                      <h3 >
                        {selectedReport.title}
                      </h3>
                      <div >
                        <span >
                          {selectedReport.periodType}
                        </span>
                        <span>
                          Period: {selectedReport.startDate} to {selectedReport.endDate}
                        </span>
                      </div>
                    </div>

                    <div >
                      <div>
                        <span >
                          Reviewer
                        </span>
                        <span >
                          {selectedReport.reviewer}
                        </span>
                      </div>
                      <div>
                        <span >
                          Self Rating
                        </span>
                        <div >
                          <StarRating value={selectedReport.selfRating} readOnly />
                        </div>
                      </div>
                      <div>
                        <span >
                          Status
                        </span>
                        <span
                          className={`rounded uppercase${getStatusBadgeClass( selectedReport.status, )}`}
                        >
                          {selectedReport.status}
                        </span>
                      </div>
                    </div>

                    <div>
                      <span >
                        Key Accomplishments & KRAs Met
                      </span>
                      <div >
                        {selectedReport.accomplishments}
                      </div>
                    </div>

                    {/* Evaluated / PIP Remarks panel */}
                    {(selectedReport.status === "Reviewed" ||
                      selectedReport.status === "Under PIP") && (
                      <div >
                        <span >
                          Reviewer Feedback & Suggestions
                        </span>
                        {selectedReport.remarks && (
                          <div >
                            <span >
                              Reviewer Remarks
                            </span>
                            <p >{selectedReport.remarks}</p>
                          </div>
                        )}
                        {selectedReport.suggestions && (
                          <div >
                            <span >
                              Suggestions & Steps for Growth
                            </span>
                            <p >{selectedReport.suggestions}</p>
                          </div>
                        )}
                        {selectedReport.status === "Under PIP" && (
                          <div >
                            <Warning size={16}  />
                            <div>
                              <span >
                                Performance Improvement Plan (PIP) Active
                              </span>
                              <p >
                                {selectedReport.pipDetails ||
                                  "Needs weekly goal checks on code test coverage and sprint deadline adherence."}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Simulation panel: Manager Reviews Report */}
                    {selectedReport.status === "Submitted" && (
                      <div >
                        <div >
                          <div >
                            <InfoOutlined size={15} />
                            <span>Manager Evaluation Panel (Demo Simulator)</span>
                          </div>

                          <div>
                            <label >
                              Reviewer Remarks / Comments
                            </label>
                            <textarea
                              rows={2}
                              placeholder="e.g. Excellent delivery on directory. Focus on mentoring next."
                              value={evalRemarks}
                              onChange={(e) => setEvalRemarks(e.target.value)}
                              
                            />
                          </div>

                          <div>
                            <label >
                              Growth Suggestions
                            </label>
                            <textarea
                              rows={2}
                              placeholder="e.g. Host a workshop, take intermediate design principles."
                              value={evalSuggestions}
                              onChange={(e) => setEvalSuggestions(e.target.value)}
                              
                            />
                          </div>

                          <div >
                            <div>
                              <span >
                                Initiate PIP
                              </span>
                              <span >
                                Flag report for close monitoring
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setEvalInitiatePip(!evalInitiatePip)}
                              className={`rounded${ evalInitiatePip ? "" : "" }`}
                            >
                              {evalInitiatePip ? "PIP Active" : "No PIP"}
                            </button>
                          </div>

                          {evalInitiatePip && (
                            <div>
                              <label >
                                PIP Action Details
                              </label>
                              <textarea
                                rows={2}
                                value={evalPipDetails}
                                onChange={(e) => setEvalPipDetails(e.target.value)}
                                
                              />
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={handleSimulateEvaluation}
                            
                          >
                            Submit Evaluation & Feedback
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div >
                    <button
                      type="button"
                      onClick={() => setSelectedReport(null)}
                      
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>
    </Layout>
  );
}
