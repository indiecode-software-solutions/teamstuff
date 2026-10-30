import React, { useState, useRef, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import Layout from "../components/Layout";
import {
  Stars,
  MessageSquare,
  Plus,
  Globe,
  Mic,
  ArrowUp,
  ChevronRight,
  MoreVertical,
  Bot,
  User,
  Pencil,
  BarChart3,
  GitBranch,
  FileText,
  Play,
  Check,
  Database,
  Users,
  Calendar as CalendarIcon,
  Megaphone,
  ClipboardList,
  ShieldCheck,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

export const Route = createFileRoute("/ai-workplace")({
  component: AiWorkplacePage,
});

interface ChatSession {
  id: string;
  title: string;
  snippet: string;
  group: "Today" | "Yesterday" | "This Week";
  messages: Array<{
    id: string;
    sender: "user" | "assistant";
    text: string;
    link?: { label: string; to: string } | undefined;
    timestamp: string;
  }>;
}

const DEFAULT_SESSIONS: ChatSession[] = [
  {
    id: "session-1",
    title: "Leave balance",
    snippet: "How many casual leaves do I h...",
    group: "Today",
    messages: [
      {
        id: "m1",
        sender: "user",
        text: "How many casual leaves do I have left for this quarter?",
        timestamp: "10:15 AM",
      },
      {
        id: "m2",
        sender: "assistant",
        text: "You currently have **4 Casual Leaves** and **6 Paid Leaves** available for Q4. You can submit a new leave request directly in the Attendance module.",
        link: { label: "Go to Attendance & Leaves", to: "/attendance" },
        timestamp: "10:15 AM",
      },
    ],
  },
  {
    id: "session-2",
    title: "Attendance report",
    snippet: "Show my attendance for this...",
    group: "Today",
    messages: [
      {
        id: "m1",
        sender: "user",
        text: "Show my attendance for this month.",
        timestamp: "09:30 AM",
      },
      {
        id: "m2",
        sender: "assistant",
        text: "For this month, your logged attendance is **100% on-time** across 18 working days, with 0 late check-ins and 1 approved work-from-home day.",
        link: { label: "View Full Attendance Log", to: "/attendance" },
        timestamp: "09:30 AM",
      },
    ],
  },
  {
    id: "session-3",
    title: "Create announcement",
    snippet: "Draft an announcement for to...",
    group: "Today",
    messages: [
      {
        id: "m1",
        sender: "user",
        text: "Draft an announcement for tomorrow's all-hands company meeting.",
        timestamp: "08:45 AM",
      },
      {
        id: "m2",
        sender: "assistant",
        text: "Here is a draft announcement for the team:\n\n**Subject: Reminder: Q4 Company All-Hands Meeting Tomorrow at 3:00 PM**\n\nHi Team,\n\nPlease join us tomorrow at 3:00 PM for our monthly All-Hands gathering. We will celebrate team milestones, review our Q3 achievements, and share company-wide updates.\n\nSee you there!",
        link: { label: "Publish to Internal Forum", to: "/internal-forum" },
        timestamp: "08:45 AM",
      },
    ],
  },
  {
    id: "session-4",
    title: "Reimbursement process",
    snippet: "Explain the reimbursement p...",
    group: "Yesterday",
    messages: [
      {
        id: "m1",
        sender: "user",
        text: "Explain the reimbursement process.",
        timestamp: "Yesterday",
      },
      {
        id: "m2",
        sender: "assistant",
        text: "To claim expense reimbursements:\n1. Keep valid GST/tax invoices.\n2. Submit an expense claim under **Finance > Approvals** within 30 days.\n3. Your department manager reviews and accounting processes payment in the next payroll cycle.",
        link: { label: "View Approvals", to: "/approvals" },
        timestamp: "Yesterday",
      },
    ],
  },
  {
    id: "session-5",
    title: "Team summary",
    snippet: "Give me my team's weekly sum...",
    group: "Yesterday",
    messages: [],
  },
  {
    id: "session-6",
    title: "Q3 project progress",
    snippet: "Summarize the current status...",
    group: "Yesterday",
    messages: [],
  },
  {
    id: "session-7",
    title: "WFH policy",
    snippet: "Show me the work from home ...",
    group: "This Week",
    messages: [],
  },
  {
    id: "session-8",
    title: "Create a task",
    snippet: "Create a task for designing th...",
    group: "This Week",
    messages: [],
  },
  {
    id: "session-9",
    title: "Meeting notes",
    snippet: "Summarize the meeting notes ...",
    group: "This Week",
    messages: [],
  },
];

const STARTER_PROMPTS = [
  "How many leaves do I have left?",
  "Create an announcement for tomorrow's holiday",
  "Summarize this document",
  "Give me my team's attendance this month",
  "Draft an email to a client",
  "Explain the reimbursement process",
];

const AI_TOOLS = [
  {
    icon: <MessageSquare size={16} />,
    name: "Chat",
    desc: "Get answers & information",
    prompt: "I need assistance understanding company policies or finding HR documents.",
  },
  {
    icon: <Pencil size={16} />,
    name: "Create",
    desc: "Write, design or generate content",
    prompt: "Help me write a professional announcement for the entire team.",
  },
  {
    icon: <BarChart3 size={16} />,
    name: "Analyze",
    desc: "Turn data into insights & reports",
    prompt: "Analyze our team's project deliverable completion rate this sprint.",
  },
  {
    icon: <GitBranch size={16} />,
    name: "Automate",
    desc: "Build workflows and save time",
    prompt: "How can I automate recurring approval reminders for my department?",
  },
  {
    icon: <FileText size={16} />,
    name: "Documents",
    desc: "Summarize, extract, analyze",
    prompt: "Summarize the key takeaways from our corporate travel policy.",
  },
  {
    icon: <Play size={16} />,
    name: "Execute",
    desc: "Take actions across the HRMS",
    prompt: "Create a new task assigned to Design for UI refinements.",
  },
];

const CONNECTED_SOURCES = [
  { label: "HR & Attendance", icon: <Users size={14} /> },
  { label: "Tasks & Projects", icon: <ClipboardList size={14} /> },
  { label: "Employees & Teams", icon: <Users size={14} /> },
  { label: "Documents & Policies", icon: <FileText size={14} /> },
  { label: "Announcements", icon: <Megaphone size={14} /> },
  { label: "Calendar", icon: <CalendarIcon size={14} /> },
];

function getAssistantAnswer(query: string): { text: string; link?: { label: string; to: string } | undefined } {
  const lower = query.toLowerCase();

  if (lower.includes("leave") || lower.includes("vacation") || lower.includes("time off")) {
    return {
      text: "You currently have **4 Casual Leaves** and **6 Paid Leaves** available. You can submit a time-off request in the Attendance portal.",
      link: { label: "Go to Attendance & Leaves", to: "/attendance" },
    };
  }

  if (lower.includes("announcement") || lower.includes("holiday")) {
    return {
      text: "Here is a drafted announcement:\n\n**Notice: Office Closed for Upcoming Holiday**\n\nDear Team,\n\nPlease be informed that our office will remain closed tomorrow in observance of the public holiday. Regular business operations will resume on the following day.\n\nEnjoy your time with family and friends!",
      link: { label: "Post on Internal Forum", to: "/internal-forum" },
    };
  }

  if (lower.includes("attendance") || lower.includes("clock")) {
    return {
      text: "Your logged attendance for this month stands at **100%**. Your average check-in time is **9:12 AM** with zero unaccounted absences.",
      link: { label: "Open Attendance Portal", to: "/attendance" },
    };
  }

  if (lower.includes("reimburse") || lower.includes("expense") || lower.includes("claim")) {
    return {
      text: "To file a reimbursement claim:\n1. Navigate to **Approvals**.\n2. Click **+ New Request** > **Expense Claim**.\n3. Attach invoice PDF/receipts and submit for managerial sign-off.",
      link: { label: "Open Approvals", to: "/approvals" },
    };
  }

  if (lower.includes("task") || lower.includes("project") || lower.includes("kanban")) {
    return {
      text: "You have **3 active tasks** in progress on the engineering sprint board, with 1 milestone due this Friday.",
      link: { label: "Open Kanban Board", to: "/kanban" },
    };
  }

  if (lower.includes("document") || lower.includes("file") || lower.includes("drive")) {
    return {
      text: "All shared corporate assets, handbook PDFs, and team folders are synchronized in Cloud Drive.",
      link: { label: "Open Files & Drive", to: "/files" },
    };
  }

  return {
    text: `I've analyzed your query regarding "${query.slice(0, 50)}${query.length > 50 ? '...' : ''}". Based on your company's live context and permission policies, you can access connected resources or ask for deeper details on HR, tasks, finance, and team data.`,
  };
}

export function AiWorkplacePage() {
  const [sessions, setSessions] = useState<ChatSession[]>(DEFAULT_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [useCompanyContext, setUseCompanyContext] = useState(true);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeSession?.messages, isTyping]);

  const handleStartNewChat = () => {
    setActiveSessionId(null);
    setInputVal("");
  };

  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    setInputVal("");
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
    }
  };

  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputVal).trim();
    if (!text || isTyping) return;

    const userMsg = {
      id: `msg-${Date.now()}`,
      sender: "user" as const,
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    let targetSessionId = activeSessionId;

    if (!targetSessionId) {
      // Create new session
      const newSession: ChatSession = {
        id: `session-${Date.now()}`,
        title: text.slice(0, 24) + (text.length > 24 ? "..." : ""),
        snippet: text.slice(0, 30) + (text.length > 30 ? "..." : ""),
        group: "Today",
        messages: [userMsg],
      };
      setSessions((prev) => [newSession, ...prev]);
      targetSessionId = newSession.id;
      setActiveSessionId(newSession.id);
    } else {
      // Append to existing session
      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? { ...s, messages: [...s.messages, userMsg] }
            : s
        )
      );
    }

    setInputVal("");
    setIsTyping(true);

    // Simulate AI reasoning delay
    setTimeout(() => {
      const resp = getAssistantAnswer(text);
      const assistantMsg = {
        id: `asst-${Date.now()}`,
        sender: "assistant" as const,
        text: resp.text,
        link: resp.link,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? { ...s, messages: [...s.messages, assistantMsg] }
            : s
        )
      );
      setIsTyping(false);
    }, 550);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Layout activeTab="AI Workplace" disablePadding>
      <div className="ai-workplace-container">
        {/* ==========================================================================
            1. Left Panel: Chat History
            ========================================================================== */}
        <aside className="ai-wp-history-sidebar">
          <div className="ai-wp-history-header">
            <h1 className="ai-wp-history-title">AI Workplace</h1>
          </div>

          <button
            type="button"
            className="ai-wp-new-chat-btn"
            onClick={handleStartNewChat}
          >
            <Plus size={15} />
            <span>New Chat</span>
          </button>

          <div className="ai-wp-history-groups">
            {(["Today", "Yesterday", "This Week"] as const).map((grp) => {
              const groupSessions = sessions.filter((s) => s.group === grp);
              if (groupSessions.length === 0) return null;

              return (
                <div key={grp} className="ai-wp-history-group">
                  <span className="ai-wp-history-group-label">{grp}</span>
                  {groupSessions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectSession(s.id)}
                      className={`ai-wp-history-item ${activeSessionId === s.id ? "active" : ""}`}
                    >
                      <div className="ai-wp-history-item-left">
                        <MessageSquare size={14} className="ai-wp-history-item-icon" />
                        <div className="ai-wp-history-item-texts">
                          <p className="ai-wp-history-item-title">{s.title}</p>
                          <p className="ai-wp-history-item-snippet">{s.snippet}</p>
                        </div>
                      </div>

                      <div className="ai-wp-history-item-actions">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <span
                              role="button"
                              tabIndex={0}
                              className="ai-wp-item-menu-btn"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Session options"
                            >
                              <MoreVertical size={13} />
                            </span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-32 bg-white shadow-lg border">
                            <DropdownMenuItem
                              onClick={(e) => handleDeleteSession(s.id, e)}
                              className="text-red-600 cursor-pointer text-xs"
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </aside>

        {/* ==========================================================================
            2. Center Panel: Hero / Active Conversation
            ========================================================================== */}
        <main className="ai-wp-main-panel">
          <div className="ai-wp-content-wrapper">
            {!activeSession || activeSession.messages.length === 0 ? (
              <>
                {/* Hero View */}
                <div className="ai-wp-hero">
                  <div className="ai-wp-hero-badge">
                    <Stars size={13} />
                    <span>AI Workplace</span>
                  </div>
                  <h2 className="ai-wp-hero-title">How can I help you today?</h2>
                  <p className="ai-wp-hero-subtitle">
                    Ask questions, create content, analyze data, automate workflows or get things done across indiecode HRMS.
                  </p>
                </div>

                {/* Prompt Input Box */}
                <div className="ai-wp-input-card">
                  <textarea
                    ref={textareaRef}
                    className="ai-wp-textarea"
                    placeholder="Ask anything about your work..."
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                  />

                  <div className="ai-wp-input-bottom-bar">
                    <div className="ai-wp-input-controls-left">
                      <button
                        type="button"
                        className="ai-wp-attach-btn"
                        title="Add context file"
                        aria-label="Add context file"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setUseCompanyContext((prev) => !prev)}
                        className={`ai-wp-context-pill ${useCompanyContext ? "active" : ""}`}
                        title="Include live company HRMS data in responses"
                      >
                        <Globe size={12} />
                        <span>Company context</span>
                        {useCompanyContext && <Check size={11} />}
                      </button>
                    </div>

                    <div className="ai-wp-input-controls-right">
                      <button
                        type="button"
                        className="ai-wp-mic-btn"
                        title="Voice input"
                        aria-label="Voice input"
                      >
                        <Mic size={15} />
                      </button>
                      <button
                        type="button"
                        className="ai-wp-send-submit-btn"
                        onClick={() => handleSendMessage()}
                        disabled={!inputVal.trim() || isTyping}
                        title="Send (Enter)"
                        aria-label="Send message"
                      >
                        <ArrowUp size={16} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Prompts List */}
                <div className="ai-wp-prompts-list">
                  {STARTER_PROMPTS.map((promptText, idx) => (
                    <button
                      key={idx}
                      type="button"
                      className="ai-wp-prompt-card"
                      onClick={() => handleSendMessage(promptText)}
                    >
                      <span>{promptText}</span>
                      <ChevronRight size={15} className="ai-wp-prompt-card-chevron" />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Active Conversation View */}
                <div className="ai-wp-messages-stream">
                  {activeSession.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`ai-wp-msg-row ${m.sender === "user" ? "user" : "assistant"}`}
                    >
                      {m.sender === "assistant" && (
                        <div className="ai-wp-msg-avatar assistant">
                          <Bot size={15} />
                        </div>
                      )}
                      <div className="ai-wp-msg-bubble-wrap">
                        <div className={`ai-wp-msg-bubble ${m.sender}`}>
                          <p className="ai-wp-msg-text">{m.text}</p>
                          {m.link && (
                            <Link to={m.link.to} className="ai-wp-msg-nav-card">
                              <span>{m.link.label}</span>
                              <ArrowRight size={12} />
                            </Link>
                          )}
                        </div>
                      </div>
                      {m.sender === "user" && (
                        <div className="ai-wp-msg-avatar user">
                          <User size={15} />
                        </div>
                      )}
                    </div>
                  ))}

                  {isTyping && (
                    <div className="ai-wp-msg-row assistant">
                      <div className="ai-wp-msg-avatar assistant">
                        <Bot size={15} />
                      </div>
                      <div className="ai-wp-msg-bubble-wrap">
                        <div className="ai-wp-msg-bubble assistant typing-bubble">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Bottom Input for Active Chat */}
                <div className="ai-wp-input-card mt-auto">
                  <textarea
                    ref={textareaRef}
                    className="ai-wp-textarea"
                    placeholder="Ask a follow up question..."
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                  />

                  <div className="ai-wp-input-bottom-bar">
                    <div className="ai-wp-input-controls-left">
                      <button
                        type="button"
                        className="ai-wp-attach-btn"
                        title="Add context file"
                        aria-label="Add context file"
                      >
                        <Plus size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setUseCompanyContext((prev) => !prev)}
                        className={`ai-wp-context-pill ${useCompanyContext ? "active" : ""}`}
                      >
                        <Globe size={12} />
                        <span>Company context</span>
                        {useCompanyContext && <Check size={11} />}
                      </button>
                    </div>

                    <div className="ai-wp-input-controls-right">
                      <button
                        type="button"
                        className="ai-wp-mic-btn"
                        title="Voice input"
                        aria-label="Voice input"
                      >
                        <Mic size={15} />
                      </button>
                      <button
                        type="button"
                        className="ai-wp-send-submit-btn"
                        onClick={() => handleSendMessage()}
                        disabled={!inputVal.trim() || isTyping}
                        title="Send (Enter)"
                        aria-label="Send message"
                      >
                        <ArrowUp size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>

        {/* ==========================================================================
            3. Right Panel: AI Tools, Connected Live Data & Trust Card
            ========================================================================== */}
        <aside className="ai-wp-tools-sidebar">
          {/* AI Tools Grid */}
          <div className="ai-wp-tools-section">
            <div className="ai-wp-tools-header">
              <h3 className="ai-wp-tools-title">AI Tools</h3>
              <p className="ai-wp-tools-subtitle">Do more with AI across your work.</p>
            </div>

            <div className="ai-wp-tools-grid">
              {AI_TOOLS.map((tool, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="ai-wp-tool-card"
                  onClick={() => handleSendMessage(tool.prompt)}
                >
                  <span className="ai-wp-tool-icon">{tool.icon}</span>
                  <p className="ai-wp-tool-name">{tool.name}</p>
                  <p className="ai-wp-tool-desc">{tool.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Connected Data Sources */}
          <div className="ai-wp-tools-section">
            <div className="ai-wp-tools-title-row">
              <h3 className="ai-wp-tools-title">Connected to</h3>
              <button type="button" className="ai-wp-manage-btn">
                Manage
              </button>
            </div>
            <p className="ai-wp-tools-subtitle">Your company data (based on permissions).</p>

            <div className="ai-wp-connected-list">
              {CONNECTED_SOURCES.map((source, idx) => (
                <div key={idx} className="ai-wp-connected-item">
                  <div className="ai-wp-connected-item-left">
                    <span className="ai-wp-connected-item-icon">{source.icon}</span>
                    <span>{source.label}</span>
                  </div>
                  <Check size={14} className="ai-wp-connected-item-check" />
                </div>
              ))}
            </div>
          </div>

          {/* Trust Card */}
          <div className="ai-wp-trust-card">
            <Database size={18} className="ai-wp-trust-icon" />
            <div className="ai-wp-trust-texts">
              <p className="ai-wp-trust-title">Uses indiecode internal data</p>
              <p className="ai-wp-trust-desc">
                Answers are based on your company's information, documents, and live data.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </Layout>
  );
}
