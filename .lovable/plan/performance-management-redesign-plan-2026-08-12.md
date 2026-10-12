# Performance Management Redesign Plan

Redesign and implement a functional Performance Management workflow in `src/routes/performance.tsx`, replacing the current static metrics with an action-oriented cycle and goal management system.

## User Review Required
> [!IMPORTANT]
> - The initial state will be seeded with an "August 2026 Monthly Cycle" and 3 placeholder goals.
> - The submission process will lock editing and show a "Pending Evaluation" state for managers.

## Proposed Changes

### Data Models & Types
- Define `PerformanceCycle` type: `id, name, type (Monthly/Weekly), startDate, endDate, reviewer, status (Draft/Submitted/Evaluated), description, submittedAt`.
- Define `KRAGoal` type: `id, category, title, target, measurementType (%/number/completion), weightage, dueDate, description, progress, status (Not Started/In Progress/At Risk/Completed), remarks`.

### Core Workflow
1. **Cycle Management**:
   - `Create Cycle` dialog to initialize a new performance period.
   - Cycle summary header showing key metadata and weighted progress.
2. **Goal Management**:
   - `Add Goal` dialog for defining KRA items.
   - Goals table with inline/dialog progress updates.
   - Progress updates include status, percentage, and evidence remarks.
3. **Review & Evaluation**:
   - `Review & Submit` dialog for self-evaluation.
   - After submission, the UI shifts to a "View Only" mode with a "Manager Evaluation Pending" panel.

### Visual Design
- **Theme**: Clean Nordic (amber/off-white) with 1.25rem/1.5rem radii.
- **Layout**: 1200px max-width, professional white cards with subtle dividers.
- **Components**: MUI `Box`, `Card`, `Table`, `Dialog`, `TextField`, `Select`, `LinearProgress`.

## Technical Details
- Use React `useState` for local state management (cycles and goals).
- Implement validation for goal submission (ensure goals exist, weightage total etc. if applicable).
- Adhere to the `Layout activeTab="Performance"` pattern.
- Ensure TypeScript type safety throughout.

## Verification Plan
- Build and compile check.
- Verify `Create Cycle` dialog correctly initializes state.
- Verify `Add Goal` updates the goal list.
- Verify `Progress Update` updates both the row and the cycle-wide weighted progress.
- Verify `Submit` locks the UI and shows the pending evaluation panel.
