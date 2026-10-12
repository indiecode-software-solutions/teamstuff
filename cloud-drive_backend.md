# Build a Production-Ready Multi-Tenant Cloud Drive for Teamstuff Intranet

We are upgrading the existing **Files** module of the Teamstuff Intranet.

The current frontend already presents Files as a company cloud-storage experience with folders, recent files, storage usage, upload, sharing, etc. Keep the existing visual language and overall design direction, but now build the **actual backend architecture and functionality** behind it.

The goal is to create a lightweight **Google Drive / OneDrive-style company cloud drive** inside the intranet.

## 1. Core Architecture

Use **Cloudflare R2** as the actual object storage provider.

Do NOT create a separate R2 bucket/account for every company.

Use a **single centralized R2 infrastructure/bucket** for the SaaS, with strict tenant isolation through the application's database and object-key structure.

Example object-key structure:

```text
companies/
  {company_id}/
    folders/
      ...
    files/
      ...
    users/
      {user_id}/
        ...
```

The exact key structure can be improved if necessary, but every stored object must be associated with a `company_id`.

### Critical rule

**The R2 folder/object path must NEVER be treated as the security mechanism.**

The database and backend authorization layer must be the source of truth.

Every operation must verify:

```text
authenticated_user
        ↓
user.company_id
        ↓
requested_file.company_id
        ↓
permission/access check
        ↓
R2 operation
```

A user from Company A must never be able to access, modify, delete, move, download, or share a file belonging to Company B.

---

# 2. Inspect Existing Application First

Before implementing anything:

1. Inspect the existing project structure.
2. Inspect the existing authentication system.
3. Inspect the existing company/tenant model.
4. Inspect the existing employee/user model.
5. Inspect the existing Files frontend.
6. Inspect whether a Files database schema/backend already exists.
7. Inspect the existing API conventions.
8. Inspect existing authorization/middleware.
9. Inspect existing subscription/plan logic.
10. Inspect existing UI components and styling.

Do NOT unnecessarily rewrite existing modules.

Do NOT break:

- Dashboard
- Corporate Hub
- Tasks
- HR
- Attendance
- Salary
- Performance
- Approvals
- Authentication
- Company management
- Existing navigation

Build the Files functionality into the existing architecture.

---

# 3. Multi-Tenant Database Design

Create or adapt the database schema so that Files are properly isolated between companies.

At minimum, the architecture should support:

### Companies

Existing company table should be reused if available.

### Users

Existing employee/user table should be reused.

### Files

Each file should contain information similar to:

```text
id
company_id
owner_user_id
folder_id
name
original_name
r2_object_key
mime_type
size_bytes
visibility
created_at
updated_at
deleted_at
```

Add other fields if required.

### Folders

Support:

```text
id
company_id
parent_folder_id
name
owner_user_id
created_at
updated_at
```

Folders must also be tenant-isolated.

### File permissions / sharing

Support sharing with:

- Individual users
- Teams/departments where applicable
- Entire company

Example:

```text
file_id
company_id
shared_with_type
shared_with_id
permission
created_at
created_by
```

Permissions should support at least:

```text
view
download
edit
```

Do not assume that knowing a file ID gives access.

### Storage usage

Maintain a company-level storage ledger:

```text
company_id
allocated_bytes
used_bytes
```

You may create additional tables for storage reservations, transactions, or usage history if required.

---

# 4. Storage Quotas

The existing UI currently shows:

> 5 GB free workspace cloud storage

However, design the system so that the storage calculation is configurable and can later support:

- Starter
- Growth
- Business
- Enterprise
- Custom storage limits\
  e.g, 10gb/user , 20gb/user etc.

Do not hardcode 5 GB throughout the application.\
The quota should ultimately come from the company's subscription/plan configuration.

---

# 5. Storage Accounting

Do NOT calculate the entire company's R2 usage every time a user uploads or opens the Files page.

Maintain a storage ledger.

Example:

```text
allocated_bytes
used_bytes
```

Before an upload:

```text
current_usage + incoming_file_size <= allocated_storage
```

If the upload would exceed the quota:

```text
Reject upload
```

The implementation must also handle concurrent uploads safely.

For example:

Two users simultaneously uploading 4 GB each to a company with only 5 GB remaining must NOT both succeed.

Use appropriate transactional/reservation logic to prevent quota races.

After a successful upload:

```text
used_bytes += file_size
```

After deletion:

```text
used_bytes -= file_size
```

Do not allow the value to become negative.

Provide a reconciliation strategy for detecting discrepancies between the database and R2.

---

# 6. Cloudflare R2 Security

R2 objects should remain **private**.

Do NOT expose the R2 bucket publicly just to make downloads easier.

Never expose:

- R2 Access Key
- R2 Secret Key
- Cloudflare credentials

to the frontend.

The browser should communicate with the application's backend.

For downloads:

```text
Frontend
   ↓
Backend
   ↓
Authenticate user
   ↓
Find file
   ↓
Verify company_id
   ↓
Verify permission
   ↓
Generate short-lived presigned R2 URL
   ↓
Return URL
   ↓
Browser downloads file
```

For uploads:

```text
Frontend
   ↓
Backend
   ↓
Authenticate user
   ↓
Verify company
   ↓
Verify folder
   ↓
Check permissions
   ↓
Check storage quota
   ↓
Generate temporary upload URL
   ↓
Browser uploads directly to R2
```

Prefer direct browser-to-R2 uploads using temporary presigned URLs so large files do not unnecessarily pass through the application server.

---

# 7. NEVER Trust Client-Supplied Company IDs

This is extremely important.

Do NOT allow the frontend to determine which company a request belongs to.

Bad:

```text
POST /files
{
  company_id: "123"
}
```

and then trusting that value.

Instead:

```text
authenticated session
        ↓
backend identifies user
        ↓
backend retrieves user's company_id
        ↓
backend uses that company_id
```

If the frontend sends `company_id`, treat it as untrusted input.

The backend must derive tenant identity from authenticated user/session data.

---

# 8. Prevent IDOR / Cross-Tenant Access

Every endpoint must verify ownership/tenant association.

Examples:

```text
GET /files/:id
GET /files/:id/download
DELETE /files/:id
PATCH /files/:id
POST /files/:id/share
POST /folders/:id
DELETE /folders/:id
```

For every request:

```text
requested_resource.company_id === authenticated_user.company_id
```

must be verified.

Do NOT rely only on:

```text
file_id
```

being difficult to guess.

Use database-level filtering and backend authorization.

---

# 9. Folder Security

Users should never be able to manipulate arbitrary R2 paths.

Do NOT accept arbitrary R2 object keys from the frontend.

For example, prevent malicious inputs attempting:

```text
../../company_002/
```

or manually specifying another company's R2 object path.

The backend should construct the R2 object key itself based on trusted database values.

---

# 10. File Upload Flow

Implement a secure upload workflow.

When a user uploads:

1. Authenticate the user.
2. Determine their company.
3. Validate destination folder.
4. Verify folder belongs to their company.
5. Validate filename.
6. Validate file type where appropriate.
7. Validate file size.
8. Check company storage quota.
9. Reserve storage.
10. Generate temporary R2 upload URL.
11. Upload directly to R2.
12. Confirm upload.
13. Create/finalize database file record.
14. Finalize storage accounting.

If the upload fails:

- Release the storage reservation.
- Do not leave an incorrect usage value.
- Clean up any orphaned R2 object if necessary.

---

# 11. File Download Flow

When downloading/viewing a file:

1. Authenticate user.
2. Find file.
3. Verify company.
4. Verify permission.
5. Generate short-lived signed URL.
6. Return URL.

Never expose permanent public R2 URLs.

Do not allow a user to manually modify the R2 key to access another object.

---

# 12. File Sharing

Build the sharing functionality into the Files module.

Users should be able to share files with:

### Specific people

Example:

```text
Share with:
Pranav
Rahul
Kamal
```

### Entire team/department

If the application already has teams/departments, integrate with them.

### Entire company

Example:

```text
Anyone in Teamstuff
```

Permission levels:

```text
View
Download
Edit
```

Only allow sharing actions that the current user is authorized to perform.

For example, someone with only `view` permission should not be able to reshare a document unless explicitly allowed.

---

# 13. Company-Wide Files

Company/HR/Admin users should be able to create company documents such as:

- Employee Handbook
- HR Policies
- Company Policies
- Training Material
- Brand Guidelines
- Marketing Assets
- Forms
- Announcements
- Templates

These should be accessible according to company permissions.

Do not mix company-wide files with personal employee files without clearly defining their ownership and permissions.

---

# 14. Personal Files

Each employee can have their own private area.

Example:

```text
My Drive
```

Files inside My Drive should initially be private unless explicitly shared.

A user must not automatically gain access to another employee's My Drive.

---

# 15. File Deletion

Implement safe deletion.

Do not immediately destroy the object if the architecture supports future trash/recovery.

Prefer:

```text
Active
  ↓
Trash
  ↓
Permanent deletion
```

If Trash is implemented, storage accounting should remain correct until permanent deletion.

If Trash is not implemented initially, clearly document that deletion is permanent.

---

# 16. Rename / Move / Folder Operations

Support:

- Create folder
- Rename folder
- Rename file
- Move file
- Move folder
- Delete file
- Delete folder

All operations must verify:

```text
source resource belongs to user's company
destination belongs to user's company
user has permission
```

Never allow cross-company moves.

---

# 17. File Listing

The Files page should show only files the current user is authorized to see.

Potential categories:

```text
My Drive
Shared With Me
Company Library
Recent
```

If useful, also support:

```text
Starred
Trash
```

Do not fetch all files from the entire R2 bucket and filter them in the frontend.

Use database queries with:

```text
company_id
user_id
permissions
folder_id
```

and pagination.

---

# 18. Admin Storage Management

Company admins should be able to see:

- Total allocated storage
- Used storage
- Remaining storage
- Largest files
- Storage by user
- Storage by folder

This can be added progressively, but design the backend so that these metrics are possible.\
In the Admin Workspace only - never clutter the general dashboard

---

# 19. Audit Logging

For important actions, consider recording audit events:\
You can Add the Audit Tab in 'Admin Workspace'

```text
file_uploaded
file_downloaded
file_deleted
file_shared
file_unshared
file_renamed
file_moved
folder_created
folder_deleted
```

At minimum, record sensitive sharing/deletion actions.

Include:

```text
user
company
resource
action
timestamp
```

---

# 20. Error Handling

Do not expose raw R2 credentials, database errors, stack traces, or infrastructure details to users.

Provide useful frontend messages such as:

```text
Storage limit reached.

You don't have enough storage remaining to upload this file.
```

or:

```text
You don't have permission to access this file.
```

or:

```text
The upload failed. Please try again.
```

Handle:

- Upload failure
- Network interruption
- Expired presigned URL
- R2 failure
- Quota exceeded
- Permission denied
- Missing file
- Deleted file
- Invalid file
- Concurrent modification

---

# 21. Orphaned Object Protection

Think carefully about files that exist in R2 but do not have a database record.

Examples:

- Browser upload succeeds but API request fails.
- User closes the browser during upload.
- Database transaction fails after R2 upload.

Implement a strategy for cleanup/reconciliation.

Possible approaches:

- Pending upload records
- Upload IDs
- Temporary object prefixes
- Periodic reconciliation
- Cleanup jobs

Do not assume R2 and the database will always succeed simultaneously.

---

# 22. Performance

The application should remain fast even when a company has thousands of files.

Use:

- Pagination
- Database indexes
- Lazy loading
- Efficient folder queries
- Direct-to-R2 uploads
- Presigned downloads
- Metadata stored in the database

Do not load every company file into memory.

Add appropriate indexes around:

```text
company_id
owner_user_id
folder_id
created_at
```

and permission lookup fields.

---

# 23. Security Checklist

Before considering the implementation complete, verify:

- [ ] R2 bucket is private.
- [ ] R2 credentials never reach the frontend.
- [ ] Every file has a company association.
- [ ] Every folder has a company association.
- [ ] Every request derives company identity from authentication.
- [ ] Client-supplied company IDs are never trusted.
- [ ] Cross-company file access is impossible.
- [ ] Cross-company folder access is impossible.
- [ ] Cross-company sharing is impossible.
- [ ] R2 object keys cannot be manually controlled by users.
- [ ] Path traversal is prevented.
- [ ] File permissions are checked server-side.
- [ ] Presigned URLs are short-lived.
- [ ] Storage quotas are enforced server-side.
- [ ] Concurrent uploads cannot bypass quotas.
- [ ] Failed uploads do not corrupt storage accounting.
- [ ] Deleted files correctly update storage usage.
- [ ] Database and R2 reconciliation is possible.
- [ ] Unauthorized users cannot access admin storage information.
- [ ] API endpoints do not expose sensitive infrastructure information.

---

# 25. Frontend UX

Keep the existing Teamstuff visual identity and current Files page direction.

The Files page should feel like a **real cloud drive**, not an HR document list.

Retain concepts already present:

- Cloud Storage
- Storage usage
- Folders
- Recent Files
- New Folder
- Upload File
- Shared files

Improve where necessary with:

- Search
- Sort
- File actions
- Share dialog
- Move dialog
- Rename
- Delete
- File details
- Shared With Me
- My Drive
- Company Library

Do not overcomplicate the interface.

The goal is a clean business cloud drive integrated into the intranet.

---

# 26. SaaS / Billing Architecture (We can add this in admin workspace to upgrade the company intranet)

Do not hardcode the storage business model into the Files module.

The Files module should ask the company's subscription/plan system for its storage entitlement.

Example concept:

```text
Company
   ↓
Subscription
   ↓
Plan
   ↓
Storage entitlement
   ↓
Files
```

This will allow us later to sell:

```text
Starter
Growth
Business
Enterprise
```

with different storage allocations.

Potentially support:

```text
Base storage
+
Additional purchased storage
```

without rewriting the Files system.

---

# 27. Important: Do Not Overengineer the First Version

Build the architecture correctly, but don't unnecessarily build every advanced cloud-drive feature immediately.

### V1 should prioritize:

1. Multi-tenant isolation
2. R2 integration
3. Secure upload
4. Secure download
5. Folder creation
6. Rename
7. Delete
8. Storage quotas
9. My Drive
10. Company Library
11. Share with users
12. Share with company
13. Recent files
14. Storage dashboard

Features like:

- File versioning
- Trash recovery
- Starred files
- Advanced search
- Preview generation
- Full audit history
- Storage analytics
- External public links

can be added later if the architecture supports them.

---

# Final Requirement

Before making implementation changes, inspect the existing Teamstuff Intranet architecture and adapt this design to the actual codebase.

Do not blindly create duplicate authentication, company, employee, or subscription systems if they already exist.

Use the existing database and authentication architecture wherever possible.

The most important requirement is:

> **One SaaS infrastructure, many companies, strict tenant isolation.**

A user should never be able to access another company's data, even if they manipulate API requests, file IDs, folder IDs, object keys, URLs, or frontend state.

Build this as a **production-oriented multi-tenant cloud storage system**, not merely a frontend simulation of file storage.
