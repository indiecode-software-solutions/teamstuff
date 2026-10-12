# Mail Interface Design Plan

Implement a professional, clean, and minimal mail interface for the CapOasis platform. The UI will follow the "Modern Nordic" aesthetic (warm amber/off-white palette) and use Material UI components with human-readable class names.

## Proposed Changes

### Components & Routes

#### [NEW] `src/routes/mail.tsx`
- Create the main mail page route.
- Implement a 3-column layout:
  1. **Folder Sidebar (narrow)**: Inbox, Sent, Drafts, Trash, Folders (Marketing, Project A, etc.).
  2. **Message List (medium)**: Search bar at top, list of emails with sender, snippet, time, and attachment indicator. Highlight unread messages.
  3. **Message Detail (wide)**: Full email view with actions (Reply, Forward, Delete, Archive), sender details, and attachment preview.
- Seed data for 5-7 emails (HR announcements, project updates, file shares).
- Integrate with `Layout` to ensure it looks consistent with other pages.

#### `src/components/Layout.tsx`
- Add "Mail" to the `SidebarNavGroup` under "Work" or "Main".
- Update the `activeTab` type to include "Mail".
- Update the mail header icon to navigate to `/mail` on click.

### Technical Details
- Use `@mui/material` components: `Box`, `Typography`, `Avatar`, `IconButton`, `List`, `ListItem`, `Divider`.
- Use `@mui/icons-material`: `Inbox`, `Send`, `Drafts`, `Delete`, `Archive`, `Reply`, `Forward`, `Search`.
- Maintain semantic class names (e.g., `mail-container`, `mail-sidebar`, `mail-list`, `mail-detail`).
- Apply the 16px border radius for cards and 8px for smaller items as per project memory.
- Use text ellipsis for long subject lines and snippets.

## User Review Required

> [!IMPORTANT]
> I will place "Mail" in the sidebar navigation. Should it go under the **Main** category (next to Dashboard) or **Work** category (next to Tasks)? I'll default to **Main** for easy access unless specified otherwise.
