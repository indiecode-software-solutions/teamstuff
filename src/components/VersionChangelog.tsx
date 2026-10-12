import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X as Close, CircleCheck as CheckCircleOutline } from "lucide-react";

interface ChangelogEntry {
  version: string;
  date: string;
  heading: string;
  items: string[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v2.4.2",
    date: "August 2026",
    heading: "Capacitor Mobile Notifications & Development Adjustments",
    items: [
      "Native mobile local notifications for task assignments",
      "Hide mail feature from header during active development",
    ],
  },
  {
    version: "v2.4.1",
    date: "August 2026",
    heading: "Offline Asset Support",
    items: [
      "Offline screen illustration rendering using cached no_internet.gif",
      "Automatic asset pre-caching during active connection states",
    ],
  },
  {
    version: "v2.4.0",
    date: "August 2026",
    heading: "Native Geolocation Alignment",
    items: [
      "Integrated native Android location permission prompts via Capacitor",
      "Robust fallback to standard Web Geolocation API for browsers",
      "Concise sidebar/mobile drawer labeling",
    ],
  },
  {
    version: "v2.3.0",
    date: "August 2026",
    heading: "Intranet Launch",
    items: [
      "Cloud Drive with readable company/user folder paths on R2",
      "Company Library shared folder with per-company visibility",
      "Shifts, late mark policies and reporting managers for attendance",
      "Expanded avatar studio with 200 adventurer avatars",
      "Live today's-attendance feed on the Admin Console",
      "Faster file browsing and a rock-solid sidebar",
    ],
  },
  {
    version: "v2.2.0",
    date: "August 2026",
    heading: "Shifts & Attendance",
    items: [
      "Geofenced punch in/out with office location matching",
      "Custom shift management and attendance regularization",
      "Overtime tracking with end-of-shift prompts",
    ],
  },
  {
    version: "v2.1.0",
    date: "July 2026",
    heading: "Productivity Suite",
    items: [
      "Tasks with assignees and due dates",
      "Approvals for leave, reimbursements, salary and more",
      "HR workspace: onboarding, payslips, policies, induction, memories",
    ],
  },
  {
    version: "v2.0.0",
    date: "July 2026",
    heading: "Foundations",
    items: [
      "Role-based workspaces (Admin, HR, Finance)",
      "Corporate hub, internal forum and mail",
      "Profiles, avatar picker, calendar and performance reviews",
    ],
  },
];

export default function VersionChangelogDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  }) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal-content changelog-modal-content">
          {/* Header */}
          <div className="modal-header">
            <div>
              <Dialog.Title className="modal-title">
                Changelog
              </Dialog.Title>
              <p className="modal-desc">
                YoovaVentures · What's new, version by version
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="modal-close-btn"
              aria-label="Close"
            >
              <Close size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="changelog-body">
            {CHANGELOG.map((entry) => (
              <div key={entry.version} className="changelog-entry">
                <div className="changelog-entry-meta">
                  <span className="changelog-version-tag">
                    {entry.version}
                  </span>
                  <span className="changelog-date">
                    {entry.date}
                  </span>
                </div>
                <h3 className="changelog-heading">{entry.heading}</h3>
                <ul className="changelog-list">
                  {entry.items.map((item) => (
                    <li key={item} className="changelog-item">
                      <CheckCircleOutline size={15} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
