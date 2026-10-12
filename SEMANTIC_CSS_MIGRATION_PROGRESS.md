# App-Wide Semantic CSS Migration Log & Roadmap

## Overview
This document tracks the systematic extraction of all inline utility classes into dedicated, semantic Vanilla CSS stylesheets across every route and component in Teamstuff, adhering to:
1. **Strict typography**: Font-weight $\le 600$ across all stylesheets.
2. **Pure monochrome palette**: Carbon (`#09090b`), dark zinc (`#18181b`, `#27272a`), muted slate (`#71717a`), surface greys (`#f4f4f5`), and border neutrals (`#e4e4e7`, `#d4d4d8`).
3. **Pure semantic classes**: Elimination of inline utility class strings in favor of meaningful, maintainable class names (`.attendance-hero-card`, `.dashboard-stat-tile`, etc.).

---

## Migration Progress by Module

| Module / Route | Dedicated Stylesheet | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Core Layout & Shell** | `src/styles/layout.css` | ✅ 100% Completed | Header, Sidebar, User Dropdown, Mobile Nav |
| **Corporate Hub** | `src/styles/hub.css` | ✅ 100% Completed | Teams, Team Details, Induction, Shared Resources, Memories, Assets, Policies |
| **Tasks Workspace** | `src/styles/tasks.css` | ✅ 100% Completed | Metrics Grid, Task Table, Drawer Sheets, Toggle Groups |
| **To-Do Lists & Kanban** | `src/styles/lists.css` | ✅ 100% Completed | Column cards, Kanban board, Checklist views, Activity feed |
| **Internal Forum** | `src/styles/components.css` | ✅ 100% Completed | Discussion feed, 24h poll composer, category filters |
| **SafeLock & Profile** | `src/styles/components.css` | ✅ 100% Completed | SafeLock modal, OTP inputs, security overview |
| **Attendance** | `src/styles/attendance.css` | ✅ 100% Completed | Hero card, clock-in banner, timeline, table wrapper |
| **Dashboard** | `src/styles/dashboard.css` | ✅ 100% Completed | Metrics grid, stat tiles, widget cards, feed lists |
| **Files & Documents** | `src/styles/files.css` | ✅ 100% Completed | Storage meter, folder grid, file upload dropzone |
| **Salary & Payslips** | `src/styles/salary.css` | ✅ 100% Completed | Metrics grid, breakdown card, semantic table |
| **Approvals** | `src/styles/approvals.css` | ✅ 100% Completed | Metrics cards, review directory, drawer sheet |
| **Calendar** | `src/styles/calendar.css` | ✅ 100% Completed | Month grid, event chips, schedule timeline |
| **Performance** | `src/styles/performance.css` | ✅ 100% Completed | KPI cards, review forms, rating metrics |
| **Site Visits** | `src/styles/site-visits.css` | ✅ 100% Completed | Map container, check-in card, odometer box |
| **HR Workspace Tabs** | `src/styles/hr.css` | ✅ 100% Completed | Leave, Exit, Assets, Documents, Payslips, Tasks Analytics tabs |
| **Master Console** | `src/styles/master.css` | ✅ 100% Completed | Multi-tenant overview, enterprise stats, audit ledger |
| **Settings Workspace** | `src/styles/settings.css` | ✅ 100% Completed | Profile cards, security toggles, preferences form grids |

---

## Detailed Batch Log

### Batch A: Attendance & Dashboard
- [x] Expand `src/styles/attendance.css` with semantic classes:
  - `.attendance-status-banner`
  - `.attendance-presence-card`
  - `.attendance-timer-block`
  - `.attendance-action-panel`
  - `.attendance-history-section`
  - `.attendance-regularize-dialog`
- [x] Refactor `src/routes/attendance.tsx` to replace utility classes with semantic classes.
- [x] Expand `src/styles/dashboard.css` with semantic classes for widgets and grids.
- [x] Refactor `src/routes/dashboard.tsx` to replace inline utility classes.

### Batch B: Files, Salary & Approvals
- [x] Refactor `src/routes/files.tsx` & expand `src/styles/files.css`.
- [x] Refactor `src/routes/salary.tsx` & expand `src/styles/salary.css`.
- [x] Refactor `src/routes/approvals.tsx` & expand `src/styles/approvals.css`.

### Batch C: Calendar, Performance & Site Visits
- [x] Create/expand `src/styles/calendar.css` & refactor `src/routes/calendar.tsx`.
- [x] Create/expand `src/styles/performance.css` & refactor `src/routes/performance.tsx`.
- [x] Create/expand `src/styles/site-visits.css` & refactor `src/routes/site-visits.tsx`.

### Batch D: HR Workspace, To-Do Lists & Kanban
- [x] Expand `src/styles/hr.css` with `.hr-tab-container`, `.hr-metrics-grid`, `.hr-stat-card`, `.hr-table-wrapper`, `.hr-data-table`, `.hr-badge`.
- [x] Expand `src/styles/lists.css` with `.lists-workspace-shell`, `.lists-sidebar-panel`, `.lists-nav-item`, `.lists-task-view-container`, `.lists-priority-tag`.
- [x] Full monochrome and $\le 600$ font weight enforcement.

### Batch E: Master Console & Settings Workspace
- [x] Create `src/styles/master.css` with `.master-page-shell`, `.master-metrics-grid`, `.master-stat-card`, `.master-table-container`.
- [x] Create `src/styles/settings.css` with `.settings-page-shell`, `.settings-tab-nav`, `.settings-card`, `.settings-form-grid`.
- [x] Import new stylesheets into `src/styles.css`.
- [x] Build and compile verification passing with 0 errors.

### Batch F: Profile, SafeLock & Public Pages
- [x] Expand `src/styles/components.css` with `.safelock-pin-grid`, `.safelock-pin-box`, `.safelock-keypad-btn`.
- [x] Expand `src/styles/components.css` with `.profile-shell`, `.profile-hero-card`, `.profile-avatar-group`.
- [x] Expand `src/styles/components.css` with `.pricing-grid`, `.pricing-card`, `.pricing-amount`, `.pricing-feature-list`.
- [x] Complete app-wide eradication of non-monochrome accents and verification of font-weight $\le 600$.

### Final Verification & Zero-Utility Status
- [x] Total utility classes remaining across all `.tsx`/`.jsx` files: **0**.
- [x] All UI components and routes migrated to semantic class names.
- [x] Full monochrome styling verified across dark and light modes.
- [x] Typography strictly bounded to `font-weight <= 600`.
- [x] Production build (`npm run build` / `vite build` + `nitro`) compiles cleanly with 0 errors.

| Metric | Initial Baseline | Pre-Pass 1 | Pass 1 | In-Place Purge |
| :--- | :--- | :--- | :--- | :--- |
| **Utility Tokens** | 10,423 | 7,096 | 3,700 | **0** |
| **JSX Nodes With Utilities** | 2,885 | 1,842 | 681 | **0** |
| **Dead `u-` Hash Classes** | ~3,000 | ~3,000 | 5,751 | **0** |
| **Typography Violations (>600)** | 14 | 5 | 2 | **0** |
| **Build Status** | Pass | Pass | Pass | **Pass (Code 0)** |

