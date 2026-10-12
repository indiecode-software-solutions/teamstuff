# Plan: Role-Based Workspaces for Admin, HR, and Accountant

Implement specialized workspaces for different corporate roles to manage role-specific data (like attendance, payroll, and company-wide performance) without cluttering the main employee dashboard.

## Proposed Changes

### 1. Unified Workspace Strategy
- We will maintain the clean employee dashboard for all users.
- Specialized features (like HR attendance logs, payroll administration, etc.) will be moved into dedicated "Workspace" routes.
- Access to these routes will be guarded by the user's role (stored in `localStorage` for now, but ready for DB integration).

### 2. Create HR Workspace
- **Route**: `src/routes/hr-workspace.tsx`
- **Purpose**: Central hub for HR-specific management tasks.
- **Initial Feature**: A new, dedicated Attendance Management section for HR to view and manage company-wide attendance.

### 3. Create Accountant Workspace
- **Route**: `src/routes/accountant-workspace.tsx`
- **Purpose**: Management of payroll, expense claims, and financial reporting.
- **Initial Feature**: Overview of company salary distributions and pending financial approvals.

### 4. Enhance Admin Console
- The existing `src/routes/admin-console.tsx` will serve as the "Admin Workspace".
- It will focus on system-level settings, geofence configuration, and high-level company stats.

### 5. Layout & Navigation Updates
- **`src/components/Layout.tsx`**: Update the sidebar to include links to these workspaces based on the user's active role.
- **Role Switcher**: The floating role switcher in the preview will be used to test these distinct views.

## Technical Details
- Use `localStorage` key `test_user_role` to determine which workspaces to show.
- Create a reusable `WorkspaceLayout` (or extend `AdminLayout`) for these management views to maintain the premium Nordic aesthetic.
- Ensure all new routes use the same human-readable class names and design tokens (radius, spacing).

## User Review Required
- Does this "Workspace" terminology align with your vision?
- Should we migrate existing Admin Console features (like geofences) into these specialized workspaces, or keep the Admin Console as a master dashboard for all management?
