# Teamstuff — Modern Enterprise Intranet & HRMS Platform

**Teamstuff** is an all-in-one, multi-tenant corporate intranet and HR management system designed for modern teams. Built with a minimal, high-performance architecture, Teamstuff unifies company culture, workforce operations, field tracking, and employee self-service into a single cohesive workspace.

---

## 🚀 Key Modules & Features

### 🏢 Corporate Hub & Company Culture
- **Employee Directory & Teams**: Organogram, department structure, and direct/channel team communications.
- **Company Memories**: Curated culture albums, milestone celebrations, and photo sections with interactive reactions.
- **Company Knowledge & Policies**: Centralized HR policy hub with versioning, attachments, and mandatory read acknowledgements.
- **Induction & Onboarding**: Structured multi-step onboarding journeys for new team members.
- **Company Assets Tracker**: Full lifecycle tracking of company hardware, asset assignment history, and repair/request workflows.
- **Shared Resources**: Quick-access portals, internal tools, and company documentation.

### ⏱️ Workforce & Operations
- **Attendance & Shifts**: Flexible shift schedules, biometric/eSSL machine sync, and manual regularizations.
- **Field & Site Visits Tracker**: GPS-verified check-ins, client visit logs, route recording, and manager reporting.
- **Leave & Approvals**: Multi-tier approval workflows for leaves, expenses, and asset requests.
- **Exit & Offboarding**: Formal exit requests, handover clearance tasks across departments, and exit interviews.

### 📋 Productivity & Collaboration
- **Kanban & Task Management**: Drag-and-drop workflow boards with checklists, assignees, priorities, and file attachments.
- **Collaborative Lists**: Fast personal and shared checklists with reminders.
- **Internal Community Forum**: Discussion boards, company announcements, interactive polls, and threads.
- **Mail Integration**: Direct inbox sync with Google Workspace and IMAP connections.

### 💼 Payroll & Administration
- **Payslips & Salary**: Automated salary slip generation, configurable earning/deduction columns, digital stamps, and PDF exports.
- **SafeLock Security**: Granular workspace role enforcement and sensitive action guards.
- **Multi-Tenant White-Labeling**: Custom subdomain routing, brand colors, custom logos, and dynamic favicon generation per organization.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Framework** | [TanStack Start](https://tanstack.com/start) / React 18 |
| **Routing** | [TanStack Router](https://tanstack.com/router) (Type-safe file-based routing) |
| **Database** | [Supabase](https://supabase.com/) (PostgreSQL 17, Row Level Security, Stored Functions) |
| **Styling** | Semantic Vanilla CSS Design System (Minimalist monotone design tokens) |
| **Object Storage** | [Cloudflare R2](https://www.cloudflare.com/developer-platform/r2/) (S3-compatible file storage) |
| **Notifications** | Resend (Transactional emails) & Twilio (SMS / WhatsApp alerts) |
| **Mobile Runtime** | [Capacitor](https://capacitorjs.com/) (Native iOS & Android runtime with GPS & Haptics) |

---

## 💻 Local Development Setup

### Prerequisites
- Node.js 18+ or Node.js 20+
- npm or bun

### 1. Clone & Install
```bash
git clone https://github.com/indiecode-software-solutions/teamstuff.git
cd teamstuff
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the project root:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://<YOUR_PROJECT_ID>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<YOUR_PUBLISHABLE_KEY>
VITE_SUPABASE_ANON_KEY=<YOUR_ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_ROLE_KEY>

# Cloudflare R2 Storage
VITE_R2_ACCESS_KEY_ID=<YOUR_R2_ACCESS_KEY>
VITE_R2_SECRET_ACCESS_KEY=<YOUR_R2_SECRET_KEY>
VITE_R2_ENDPOINT=<YOUR_R2_S3_ENDPOINT>
VITE_R2_BUCKET_NAME=intranet-storage

# Twilio & Notifications (Optional)
TWILIO_ACCOUNT_SID=<YOUR_SID>
TWILIO_AUTH_TOKEN=<YOUR_AUTH_TOKEN>
TWILIO_WHATSAPP_NUMBER=whatsapp:<YOUR_NUMBER>
RESEND_API=<YOUR_RESEND_KEY>
EMAIL_FROM="Teamstuff <noreply@yourdomain.com>"
```

### 3. Database Initialization
Run the clean schema migration located in `supabase/schema_export.sql` in your Supabase project's SQL Editor (run as `postgres` / without RLS).

### 4. Start Development Server
```bash
npm run dev
```
The app will be available at `http://localhost:8080`.

---

## 📱 Mobile Builds (Capacitor)

Teamstuff includes native configurations for Android and iOS:

```bash
# Sync web build to native shells
npm run build
npx cap sync

# Open Android Studio
npx cap open android

# Open Xcode (macOS only)
npx cap open ios
```

---

## 🔒 Security & Data Isolation
- **Row-Level Security (RLS)**: Enforced across all tables with company-level tenant isolation.
- **Role-Based Access Control (RBAC)**: Master Admin, Company Admin, HR Manager, Department Lead, and Employee tiers.
- **Zero Raw Credentials**: Production secrets are decoupled from git via environment variables.

---

## 📄 License
Proprietary software. Developed and maintained by **Indiecode Software Solutions**.
