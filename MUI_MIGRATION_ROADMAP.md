# MUI to Tailwind & Radix UI Migration Roadmap

This document outlines the systematic strategy to remove `@mui/material`, `@mui/icons-material`, and `@emotion/*` runtime dependencies from the CapOasis Intranet codebase in favor of zero-runtime **Tailwind CSS (v4)**, **Radix UI Primitives (`@radix-ui/react-*`)**, and **Lucide Icons (`lucide-react`)**.

---

## 🎯 Primary Goals & Benefits
1. **Eliminate Dual UI Bundle Overhead**: Drops ~250KB–300KB minified JS bundle weight.
2. **Remove Runtime CSS-in-JS (Emotion)**: Eliminates dynamic `<style>` tag injection on every render in React 19, making Capacitor (iOS/Android) mobile webviews silky smooth.
3. **End Aesthetic Debt**: Eliminates fighting Google Material Design defaults; all components align naturally with modern SaaS styling (Linear / Vercel design system).

---

## 🗺️ Component Mapping Reference

| Legacy MUI Component | Target Modern Replacement | Source Path / Library |
| :--- | :--- | :--- |
| `<Tooltip>` | `<Tooltip>` / `<TooltipContent>` | `@radix-ui/react-tooltip` (`src/components/ui/tooltip.tsx`) |
| `<Menu>`, `<MenuItem>` | `<DropdownMenu>`, `<DropdownMenuItem>` | `@radix-ui/react-dropdown-menu` (`src/components/ui/dropdown-menu.tsx`) |
| `<Dialog>`, `<DialogContent>` | `<Dialog>`, `<DialogContent>` | `@radix-ui/react-dialog` (`src/components/ui/dialog.tsx`) |
| `<Drawer>` | `<Sheet>`, `<SheetContent>` | `src/components/ui/sheet.tsx` / `vaul` |
| `<Snackbar>`, `<Alert>` | `toast(...)` | `sonner` (`src/components/ui/sonner.tsx`) |
| `<Tabs>`, `<Tab>` | `<Tabs>`, `<TabsList>`, `<TabsTrigger>` | `@radix-ui/react-tabs` (`src/components/ui/tabs.tsx`) |
| `<Switch>` | `<Switch>` | `@radix-ui/react-switch` (`src/components/ui/switch.tsx`) |
| `<Select>`, `<MenuItem>` | `<Select>`, `<SelectItem>` | `@radix-ui/react-select` (`src/components/ui/select.tsx`) |
| `<Avatar>` | `<Avatar>`, `<AvatarImage>`, `<AvatarFallback>` | `@radix-ui/react-avatar` (`src/components/ui/avatar.tsx`) |
| `<Badge>` | `<Badge>` | `src/components/ui/badge.tsx` |
| `<Button variant="..." color="...">` | `<Button variant="...">` | `src/components/ui/button.tsx` |
| `<Card>`, `<Paper>` | `<Card>`, `<CardContent>` or `<div className="card-subtle">` | Native Tailwind containers |
| `<Box sx={{...}}>` | `<div className="...">` | Native Tailwind utility classes |
| `<Typography variant="...">` | `<h1>`, `<h2>`, `<p>`, `<span>` | Semantic HTML with Tailwind typography |
| `<CircularProgress>` | `<Loader2 className="animate-spin" />` | `lucide-react` |
| `@mui/icons-material/*` | Lucide Icons | `lucide-react` |

---

## 🚀 Execution Phases

### Phase 1: Core Shell & Interactive Overlays (Low Risk, High Impact)
- [x] **Stage 1.1: Navigation Tooltips & Popovers** *(Completed)*
  - Migrated `<Tooltip>` in `src/components/Layout.tsx` (Sidebar items & collapsed state) to Radix UI (`@radix-ui/react-tooltip`).
  - Migrated `<Menu>` dropdowns in `src/components/Layout.tsx` (Workspaces / Admin / Settings context menu) to Radix UI (`@radix-ui/react-dropdown-menu`).
  - Migrated floating test role switcher to Radix DropdownMenu.
- [x] **Stage 1.2: Toast Notifications & Alerts** *(Completed)*
  - Mounted `<Toaster />` from `sonner` globally in `src/routes/__root.tsx`.
  - Migrated toast notifications and removed MUI `<Snackbar>` / `<Alert>` from `HRWorkspaceSection.tsx`, `settings.tsx`, `dashboard.tsx`, and `profile.tsx`.
  - Standardized notification calls to `toast.success()` and `toast.error()`.
- [x] **Stage 1.3: Shell Primitives & Header** *(Completed)*
  - Migrated mobile bottom navigation drawer to Radix `<Sheet>` (`@radix-ui/react-dialog`) with smooth native feel.
  - Replaced all header and profile avatars with Radix `<Avatar>` (`@radix-ui/react-avatar`).
  - Verified 100% of Shell icons use `lucide-react`.
  - Removed `Avatar`, `Menu`, `MenuItem`, `Tooltip` imports from MUI in `Layout.tsx`.

---

### Phase 2: Self-Contained Modules & Workspaces (Route by Route)
- [x] **Stage 2.1: HR Workspace Tabs (`src/components/hr/*`)** *(Completed)*
  - `DocumentsTab.tsx` ✅
  - `LeaveTab.tsx` ✅
  - `PayslipsTab.tsx` ✅
  - `AssetsTab.tsx` ✅
  - `ExitTab.tsx` ✅
  - `HolidayCalendar.tsx` ✅
  - `MemoriesTab.tsx` ✅
  - `InductionTab.tsx` ✅
  - `ProfileExitSection.tsx` ✅
  - `PoliciesTab.tsx` ✅
  - `HRWorkspaceSection.tsx` ✅
  - `HRWorkspaceTabs.tsx` ✅
- [x] **Stage 2.2: Admin Console & Settings** *(Completed)*
  - `src/routes/settings.tsx` ✅
  - `src/routes/admin-console.attendance.tsx` ✅
  - `src/components/AdminLayout.tsx` ✅
- [x] **Stage 2.3: Tasks & Approvals** *(Completed)*
  - `src/routes/tasks.tsx` ✅
  - `src/routes/approvals.tsx` ✅
  - `src/routes/kanban.tsx` ✅
  - `src/components/tasks/CreateTaskDialog.tsx` ✅
- [x] **Stage 2.4: Internal Forum, Lists & Files** *(Completed)*
  - `src/routes/internal-forum.tsx` ✅
  - `src/routes/lists.tsx` ✅
  - `src/routes/files.tsx` ✅
  - `src/routes/mail.tsx` ✅


---

### Phase 3: Core High-Traffic Pages & Data Tables
- [x] **Stage 3.1: Dashboard (`src/routes/dashboard.tsx`)** *(Completed)*
  - Migrated `src/routes/dashboard.tsx` to zero MUI, Tailwind CSS v4 & Radix UI. ✅
  - Migrated `src/components/dashboard/WhosOutWidget.tsx` to Radix DropdownMenu & Tailwind. ✅
  - Migrated `src/components/dashboard/MyRequestsWidget.tsx` to Tailwind. ✅
  - Attendance check-in / GPS punch card widget with live clock. ✅
  - Realtime discussions feed, reply context, and company announcements/polls. ✅
  - Who's Out, Celebrations, and Holiday Calendar widgets. ✅
  - Driver.js guided tour modal with audio narrator support. ✅

- [x] **Stage 3.2: Attendance Tracker (`src/routes/attendance.tsx`)** *(Completed)*
  - Migrated `src/routes/attendance.tsx` to zero MUI, Tailwind CSS v4 & Radix UI. ✅
  - Monthly attendance calendar, time logs, and regularization dialogs. ✅
- [x] **Stage 3.3: Employee Profile, Salary & Teams Workspace** *(Completed)*
  - `src/routes/profile.tsx` & `src/components/profile/*` ✅
  - `src/routes/salary.tsx` ✅
  - `src/routes/teams.index.tsx` & `src/routes/teams.$teamId.tsx` ✅
  - `src/routes/corporate-hub.teams.tsx` & `src/components/teams/CreateTeamDialog.tsx` ✅

- [x] **Stage 3.4: Corporate Hub Subpages** *(Completed)*
  - `src/components/CorporateHubView.tsx` ✅
  - `src/routes/corporate-hub.assets.tsx` ✅
  - `src/routes/corporate-hub.memories.tsx` ✅
  - `src/routes/corporate-hub.team.tsx` ✅
  - `src/routes/corporate-hub.hr-policies.tsx` ✅
  - `src/routes/corporate-hub.induction.tsx` ✅
  - `src/routes/corporate-hub.shared-resources.tsx` ✅

- [x] **Stage 3.5: Operations, Finance & Visits Workspaces** *(Completed)*
  - `src/routes/accountant-workspace.tsx` & `accountant-workspace.payroll.tsx` ✅
  - `src/routes/calendar.tsx` ✅
  - `src/routes/performance.tsx` ✅
  - `src/routes/site-visits.tsx` & associated modals (`SiteVisitCheckInModal.tsx`, `SiteVisitCheckOutModal.tsx`, `StartVisitModal.tsx`, `VisitDetailsModal.tsx`, `SiteVisitsMap.tsx`, `VisualMap.tsx`) ✅
  - `src/components/OdometerCalculatorCard.tsx`, `CameraCaptureModal.tsx`, `BookDemoModal.tsx`, `SafeLockGuard.tsx`, `SafeLockSetupModal.tsx`, `VersionChangelog.tsx`, `LeaveBalanceCards.tsx`, `TeamActivityHeader.tsx`, `RequireWorkspaceRole.tsx`, `OfflineScreen.tsx` ✅

- [x] **Stage 3.6: Auth, Landing & Master Admin** *(Completed)*
  - `src/routes/index.tsx`, `pricing.tsx`, `login.tsx`, `master.tsx`, `master-login.tsx`, `interface.tsx` ✅
  - `src/components/notifications/NotificationDrawer.tsx`, `src/components/profile/EmployeeDocumentsSection.tsx` ✅

---

### Phase 4: Deprecation, Cleanup & Verification (100% COMPLETED)
- [x] **Stage 4.1: Root Theme & Provider Removal** *(Completed)*
  - Removed `createAppTheme`, `CssBaseline`, and MUI `<ThemeProvider>` from `src/routes/__root.tsx`. ✅
  - Migrated `src/components/Layout.tsx` to pure Tailwind CSS, custom `useMediaQuery`, and Radix UI primitives. ✅
- [x] **Stage 4.2: Dependency Uninstall** *(Completed)*
  - Uninstalled `@mui/material`, `@mui/icons-material`, `@emotion/react`, `@emotion/styled`. ✅
  - Verified 0 imports of `@mui/*` and `@emotion/*` remain across `src/`. ✅
- [x] **Stage 4.3: Verification & Performance Audit** *(Completed)*
  - Verified full production build (`npm run build`) builds cleanly with 0 errors in under 1 second. ✅
  - Zero runtime CSS-in-JS emotion overhead; minified bundle sizes reduced substantially. ✅
  - Typography weights strictly conform to `fontWeight <= 600` across all pages. ✅

---

## 📋 Best Practices During Migration
1. **Typography Rule**: Ensure no `font-weight` exceeds `600` (`font-semibold` / `font-medium`).
2. **Preserve Functionality**: Keep all Supabase queries, TanStack query hooks, and event handlers intact when refactoring markup.
3. **Component Reusability**: Use or extend components in `src/components/ui/` rather than writing ad-hoc inline styles.
