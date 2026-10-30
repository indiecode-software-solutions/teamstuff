import React, { useEffect, useState, useRef } from "react";
import { Bot, SendHorizontal, RotateCcw, ArrowRight, User } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface Message {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  link?: { label: string; to: string } | undefined;
}

const QUICK_ACTIONS = [
  { label: "Apply for leave", prompt: "How do I apply for leave or check my balance?" },
  { label: "View my tasks", prompt: "Where can I find my active tasks and projects?" },
  { label: "Access Drive files", prompt: "How does cloud file storage work in the HRMS?" },
  { label: "View payslips", prompt: "Where can I view my monthly salary payslips?" },
];

const INITIAL_MESSAGES: Message[] = [
  {
    id: "welcome-1",
    sender: "assistant",
    text: "Hello! I'm your indiecode Copilot. How can I assist you with your tasks, HR policies, files, or approvals today?",
    timestamp: "Just now",
  },
];

function getAssistantResponse(prompt: string): { text: string; link?: { label: string; to: string } | undefined } {
  const lower = prompt.toLowerCase();
  
  if (lower.includes("leave") || lower.includes("vacation") || lower.includes("time off") || lower.includes("holiday")) {
    return {
      text: "You can submit time-off requests, view holiday schedules, and check your leave balance under Attendance.",
      link: { label: "Go to Attendance & Leaves", to: "/attendance" },
    };
  }
  
  if (lower.includes("task") || lower.includes("kanban") || lower.includes("project") || lower.includes("todo")) {
    return {
      text: "Active sprints, project deliverables, and team boards are organized on your Kanban board.",
      link: { label: "Open Kanban Board", to: "/kanban" },
    };
  }
  
  if (lower.includes("file") || lower.includes("drive") || lower.includes("upload") || lower.includes("document") || lower.includes("folder")) {
    return {
      text: "Cloud Drive allows you to store and organize internal documents. Files can be uploaded directly into any folder.",
      link: { label: "Open Files & Drive", to: "/files" },
    };
  }
  
  if (lower.includes("salary") || lower.includes("payslip") || lower.includes("pay") || lower.includes("compensation")) {
    return {
      text: "Monthly payslips, tax summaries, and compensation breakdowns are accessible in your finance section.",
      link: { label: "View Payslips", to: "/payslips" },
    };
  }

  if (lower.includes("team") || lower.includes("directory") || lower.includes("employee")) {
    return {
      text: "Explore employee contacts, reporting lines, and department rosters in Resources.",
      link: { label: "View Directory", to: "/resources/team" },
    };
  }

  return {
    text: `I've noted your query regarding "${prompt.slice(0, 45)}${prompt.length > 45 ? '...' : ''}". You can explore related tools from the workspace navigation or ask for specific help on attendance, files, tasks, and company resources.`,
  };
}

interface AiOrbProps {
  isOpen?: boolean | undefined;
  onToggle?: (() => void) | undefined;
  onClose?: (() => void) | undefined;
}

export const AiOrb: React.FC<AiOrbProps> = ({
  isOpen: controlledIsOpen,
  onToggle: controlledOnToggle,
  onClose: controlledOnClose,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputVal, setInputVal] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalOpen;

  const handleToggle = () => {
    if (controlledOnToggle) {
      controlledOnToggle();
    } else {
      setInternalOpen((prev) => !prev);
    }
  };

  const handleClose = () => {
    if (controlledOnClose) {
      controlledOnClose();
    } else {
      setInternalOpen(false);
    }
  };

  // Focus input and scroll when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 180);
    }
  }, [isOpen]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Global keyboard shortcut: Cmd+K / Ctrl+K, Alt+A / Option+A, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey && e.code === "KeyA") || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        handleToggle();
      } else if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSendMessage = (textToSend?: string) => {
    const query = (textToSend || inputVal).trim();
    if (!query || isTyping) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputVal("");
    setIsTyping(true);

    setTimeout(() => {
      const resp = getAssistantResponse(query);
      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: resp.text,
        link: resp.link,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsTyping(false);
    }, 450);
  };

  const handleResetChat = () => {
    setMessages(INITIAL_MESSAGES);
    setInputVal("");
  };

  return (
    <div className="ai-orb-floating-container" ref={containerRef}>
      <div className="ai-orb-wrapper">
        <div className={`container-vao ${isOpen ? "is-open" : ""}`}>
          {/* Hidden checkbox toggle */}
          <input
            type="checkbox"
            className="input-orb"
            id="v.a.o."
            name="v.a.o."
            checked={isOpen}
            onChange={handleToggle}
          />

          {/* Fluid Morphing Chrome Blob with "Ask AI" text */}
          <label
            htmlFor="v.a.o."
            className="orb"
            title={isOpen ? "Close (Esc)" : "Ask AI (⌘K / Alt+A)"}
          >
            <div className="icons">
              <div className="svg-wrapper">
                <div className="icon-close">
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59L7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12L5.7 16.89a.996.996 0 1 0 1.41 1.41L12 13.41l4.89 4.89a.996.996 0 1 0 1.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4" />
                  </svg>
                </div>
                <div className="orb-text-label">
                  <span>Ask AI</span>
                </div>
              </div>
            </div>
            <div className="ball" />
          </label>

          {/* Floating Chat Window */}
          <div className="container-chat-ia" role="dialog" aria-label="indiecode Copilot">
            {/* Header */}
            <div className="container-title">
              <div className="ai-copilot-title-left">
                <Bot size={15} />
                <p className="text-title">
                  <span>indiecode</span>
                  <span>Copilot</span>
                </p>
                <span className="ai-copilot-status-dot" title="Online" />
              </div>
              <button
                type="button"
                className="ai-copilot-icon-btn"
                onClick={handleResetChat}
                title="Reset chat"
                aria-label="Reset chat"
              >
                <RotateCcw size={13} />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="container-chat">
              <div className="container-chat-limit">
                <div className="chats">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={m.sender === "user" ? "chat-user" : "chat-ia"}
                    >
                      <div className="chat-bubble-content">
                        <p>
                          <span>{m.text}</span>
                        </p>
                        {m.link && (
                          <Link
                            to={m.link.to}
                            onClick={handleClose}
                            className="chat-link-btn"
                          >
                            <span>{m.link.label}</span>
                            <ArrowRight size={12} />
                          </Link>
                        )}
                        <span className="chat-timestamp">{m.timestamp}</span>
                      </div>
                    </div>
                  ))}

                  {isTyping && (
                    <div className="chat-ia">
                      <div className="chat-bubble-content">
                        <p className="typing-p">
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                          <span className="typing-dot" />
                        </p>
                      </div>
                    </div>
                  )}

                  <div ref={chatBottomRef} />
                </div>
              </div>
            </div>

            {/* Quick Action Prompt Chips */}
            {messages.length <= 3 && !isTyping && (
              <div className="ai-copilot-quick-actions">
                {QUICK_ACTIONS.map((action, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="ai-quick-action-chip"
                    onClick={() => handleSendMessage(action.prompt)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}

            {/* Integrated Input Footer */}
            <form
              className="container-input-bar"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
            >
              <input
                ref={inputRef}
                type="text"
                className="copilot-text-input"
                placeholder="Ask Copilot..."
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                disabled={isTyping}
              />
              <button
                type="submit"
                className="copilot-send-button"
                disabled={!inputVal.trim() || isTyping}
                title="Send (Enter)"
                aria-label="Send query"
              >
                <SendHorizontal size={14} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
