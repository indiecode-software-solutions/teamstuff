import { createClient } from "@supabase/supabase-js";
import { getAdminClient, findAuthUserByEmail } from "./master.server";

export function generateHumanTempPassword(name = ""): string {
  const cleanName = String(name || "")
    .trim()
    .split(/\s+/)[0]
    .replace(/[^a-zA-Z]/g, "");

  const prefix =
    cleanName.length >= 2
      ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1).toLowerCase()
      : "Welcome";

  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const digits = 1000 + (buf[0] % 9000);
  return `${prefix}@${digits}`;
}

export function deriveCompanySlug(input: string): string {
  const base = String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return base || `company-${Date.now().toString(36)}`;
}

interface SendTrialEmailParams {
  to: string;
  name: string;
  companyName: string;
  tempPassword: string;
  trialEndsAt: Date;
  seats: number;
}

async function sendTrialWelcomeEmail(params: SendTrialEmailParams): Promise<{ sent: boolean; reason?: string }> {
  const resendKey = process.env["RESEND_API"];
  if (!resendKey) return { sent: false, reason: "RESEND_API not configured" };

  try {
    const trialEndDisplay = params.trialEndsAt.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    const portalUrl = "https://indiecode-software-solutions-teamstuff.pranav-p.workers.dev/login";
    const from = process.env["EMAIL_FROM"] || "indiecode HRMS <noreply@indiecode.in>";

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #09090b; background: #ffffff;">
        <div style="font-size: 16px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 20px;">indiecode HRMS</div>
        <h2 style="font-size: 21px; font-weight: 600; margin: 0 0 10px; color: #09090b;">Your 14-day free trial is ready, ${escapeHtml(params.name)}</h2>
        <p style="font-size: 14px; color: #52525b; line-height: 1.6; margin: 0 0 18px;">
          We provisioned your isolated <strong>${escapeHtml(params.companyName)}</strong> workspace with <strong>${params.seats}</strong> team seats active through <strong>${escapeHtml(trialEndDisplay)}</strong>.
        </p>
        <div style="background: #f8fafc; border: 1px solid #e4e4e7; border-radius: 10px; padding: 20px; margin: 20px 0;">
          <div style="margin-bottom: 14px;">
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; font-weight: 600; display: block; margin-bottom: 3px;">Work Account Email</span>
            <strong style="font-size: 15px; color: #09090b;">${escapeHtml(params.to)}</strong>
          </div>
          <div>
            <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #71717a; font-weight: 600; display: block; margin-bottom: 3px;">Temporary Password</span>
            <code style="font-size: 16px; font-weight: 700; color: #18181b; background: #ffffff; padding: 6px 10px; border-radius: 6px; border: 1px solid #d4d4d8; display: inline-block;">${escapeHtml(params.tempPassword)}</code>
          </div>
        </div>
        <p style="font-size: 12.5px; color: #71717a; line-height: 1.5; margin: 0 0 22px;">
          All HRMS modules — Tasks & Kanban, Attendance, Leaves, Payroll, Induction, and Cloud Drive — are fully active.
        </p>
        <div>
          <a href="${portalUrl}" style="background: #18181b; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-size: 13.5px; font-weight: 500; display: inline-block;">
            Sign In to HRMS Workspace &rarr;
          </a>
        </div>
      </div>
    `;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: `Your 14-day trial is ready — ${params.companyName}`,
        html,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.warn("[trial-provisioner] Resend API error:", resp.status, errText);
      return { sent: false, reason: errText };
    }
    return { sent: true };
  } catch (err: any) {
    console.error("[trial-provisioner] Failed to send trial welcome email:", err);
    return { sent: false, reason: err?.message };
  }
}

function escapeHtml(raw: string): string {
  return String(raw || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EnrollTrialParams {
  name: string;
  companyName: string;
  workEmail: string;
  phone: string;
  seats: number;
}

export async function enrollTrialAndProvision(params: EnrollTrialParams) {
  const admin = getAdminClient();
  if (!admin) {
    return { ok: false, error: "Database configuration error." };
  }

  const name = String(params.name || "").trim();
  const companyName = String(params.companyName || "").trim();
  const workEmail = String(params.workEmail || "").trim().toLowerCase();
  const phone = String(params.phone || "").trim();
  const seats = Math.max(1, Math.min(500, Math.round(Number(params.seats) || 10)));

  if (!name) return { ok: false, error: "Please enter your name." };
  if (!companyName) return { ok: false, error: "Please enter your company or workspace name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) {
    return { ok: false, error: "Please enter a valid work email address." };
  }
  if (phone.length < 8) return { ok: false, error: "Please enter a valid phone number." };

  // 1. Check globally unique work email
  const existingAuth = await findAuthUserByEmail(admin, workEmail);
  if (existingAuth) {
    return {
      ok: false,
      code: "EMAIL_EXISTS",
      error: "An account with this email already exists on indiecode HRMS. Please sign in instead.",
    };
  }

  // 2. Prevent duplicate submissions within 10 minutes
  const tenMinsAgoIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("trial_enrollments")
    .select("id")
    .ilike("work_email", workEmail)
    .gte("created_at", tenMinsAgoIso)
    .limit(1)
    .maybeSingle();

  if (recent) {
    return {
      ok: false,
      code: "DUPLICATE_ENROLLMENT",
      error: "A trial request for this email was submitted recently. Please check your inbox or try signing in.",
    };
  }

  // 3. Record intake lead in trial_enrollments (Status: pending)
  const { data: enrollment, error: enrollErr } = await admin
    .from("trial_enrollments")
    .insert([{
      full_name: name,
      company_name: companyName,
      work_email: workEmail,
      phone,
      requested_seats: seats,
      status: "pending",
    }])
    .select("id")
    .single();

  if (enrollErr || !enrollment) {
    console.error("[trial-provisioner] Enrollment insert error:", enrollErr);
    return { ok: false, error: "Failed to record trial intake." };
  }

  // 4. Provision Company Workspace
  const trialStartsAt = new Date();
  const trialEndsAt = new Date(trialStartsAt.getTime() + 14 * 24 * 60 * 60 * 1000);
  const baseSlug = deriveCompanySlug(companyName);

  let createdCompany: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidateSlug = attempt === 0 ? baseSlug : `${baseSlug}-${crypto.randomUUID().slice(0, 5)}`;
    const { data: comp, error: compErr } = await admin
      .from("companies")
      .insert([{
        name: companyName,
        short_name: companyName.slice(0, 30),
        tenant_domain: candidateSlug,
        plan: "Trial",
        seat_limit: seats,
        storage_quota_gb: 5,
        status: "active",
        subscription_status: "trialing",
        trial_starts_at: trialStartsAt.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
        price_per_seat_inr: 149,
        base_price_inr: 2499,
        base_seats_included: 10,
        is_billing_exempt: false,
        owner_email: workEmail,
        owner_phone: phone,
        brand_color: "#18181B",
      }])
      .select("*")
      .single();

    if (!compErr && comp) {
      createdCompany = comp;
      break;
    }
    if (compErr?.code === "23505") continue; // duplicate slug, retry with suffix
    console.error("[trial-provisioner] Company provision error:", compErr);
    return { ok: false, error: compErr?.message || "Failed to create company workspace." };
  }

  if (!createdCompany) {
    return { ok: false, error: "Could not allocate a unique company workspace domain." };
  }

  try {
    // 5. Generate human-friendly temporary password & create auth user
    const tempPassword = generateHumanTempPassword(name);

    const { data: authCreated, error: authErr } = await admin.auth.admin.createUser({
      email: workEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name },
      app_metadata: {
        company_id: createdCompany.id,
        app_role: "admin",
      },
    });

    if (authErr || !authCreated?.user) {
      throw new Error(`Auth user creation failed: ${authErr?.message || "unknown"}`);
    }

    // 6. Upsert user Profile with admin role & billing access
    const { error: profileErr } = await admin
      .from("profiles")
      .upsert({
        id: authCreated.user.id,
        company_id: createdCompany.id,
        name,
        email: workEmail,
        work_email: workEmail,
        phone,
        role: "admin",
        job_title: "Workspace Administrator",
        permissions: {
          admin: {
            manage_users: true,
            manage_billing: true,
          },
        },
        is_active: true,
        must_change_password: true,
        onboarding_status: "Completed",
      }, { onConflict: "id" });

    if (profileErr) {
      throw new Error(`Profile creation failed: ${profileErr.message}`);
    }

    // 7. Seed HRMS Fixtures: Default Shift
    await admin.from("shifts").insert([{
      company_id: createdCompany.id,
      name: "General Shift",
      start_time: "09:30",
      end_time: "18:30",
      is_default: true,
    }]);

    // 8. Seed HRMS Fixtures: Default Leave Policies
    await admin.from("leave_policies").insert([
      { company_id: createdCompany.id, leave_type: "Casual Leave (CL)", annual_quota: 12, quota_period: "annual" },
      { company_id: createdCompany.id, leave_type: "Sick Leave (SL)", annual_quota: 6, quota_period: "annual" },
      { company_id: createdCompany.id, leave_type: "Paid Leave (PL)", annual_quota: 15, quota_period: "annual" },
    ]);

    // 9. Update trial enrollment status to 'provisioned'
    await admin
      .from("trial_enrollments")
      .update({
        status: "provisioned",
        provisioned_company_id: createdCompany.id,
      })
      .eq("id", enrollment.id);

    // 10. Attempt to mint instant session tokens using magiclink exchange
    let session: { access_token: string; refresh_token: string } | null = null;
    try {
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: workEmail,
      });

      if (linkData?.properties?.hashed_token) {
        const supabaseUrl = process.env["VITE_SUPABASE_URL"]!;
        const anonKey = process.env["VITE_SUPABASE_ANON_KEY"]!;
        const anonClient = createClient(supabaseUrl, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: verified } = await anonClient.auth.verifyOtp({
          token_hash: linkData.properties.hashed_token,
          type: "magiclink",
        });

        if (verified?.session) {
          session = {
            access_token: verified.session.access_token,
            refresh_token: verified.session.refresh_token,
          };
        }
      }
    } catch (e) {
      console.warn("[trial-provisioner] Session minting skipped; fallback to password:", e);
    }

    // 11. Send welcome email via Resend
    const emailResult = await sendTrialWelcomeEmail({
      to: workEmail,
      name,
      companyName,
      tempPassword,
      trialEndsAt,
      seats,
    });

    return {
      ok: true,
      provisioned: true,
      company: {
        id: createdCompany.id,
        name: createdCompany.name,
        slug: createdCompany.tenant_domain,
        trial_ends_at: createdCompany.trial_ends_at,
        seat_limit: createdCompany.seat_limit,
      },
      adminEmail: workEmail,
      tempPassword,
      session,
      emailSent: emailResult.sent,
    };
  } catch (err: any) {
    console.error("[trial-provisioner] Critical rollback during provisioning:", err);
    try {
      await admin.from("companies").delete().eq("id", createdCompany.id);
    } catch {}
    return { ok: false, error: err?.message || "Failed to provision workspace." };
  }
}
