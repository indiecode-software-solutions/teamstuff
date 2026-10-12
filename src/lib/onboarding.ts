import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { findAuthUserByEmail } from "./master.server";
import { resolveTenantPortalUrl } from "./tenant-brand";

export interface OnboardEmployeeParams {
  companyId: string;
  companyName?: string;
  tenantDomain?: string;
  name: string;
  email: string;
  jobTitle: string;
  department: string;
  employeeCode?: string;
  workLocation?: string;
  employmentType?: string;
  role: "employee" | "admin" | "accountant";
  shiftId?: string | null;
  reportingTo?: string | null;
  dateOfJoining?: string | null;
}

/**
 * Server function to register a new user in Supabase Auth using the service role client.
 * Using a separate supabase client instance initialized with the service role key to bypass client signup RLS/Auth blocks.
 */
export const adminOnboardEmployee = createServerFn({ method: "POST" })
  .validator((d: OnboardEmployeeParams) => d)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env["VITE_SUPABASE_URL"];
    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("⚠️ Supabase admin credentials missing from server env.");
      return { success: false, error: "Database configuration error" };
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      email,
      name,
      jobTitle,
      department,
      employeeCode,
      workLocation,
      employmentType,
      role,
      companyId,
      companyName,
      shiftId,
      reportingTo,
      dateOfJoining,
    } = data;

    // Generate temporary password based on first name: e.g. "Rohan@123"
    const firstName = name.trim().split(" ")[0] || "Employee";
    const cleanFirstName = firstName.replace(/[^a-zA-Z]/g, "");
    const capFirstName =
      cleanFirstName.charAt(0).toUpperCase() + cleanFirstName.slice(1).toLowerCase();
    const tempPassword = `${capFirstName || "Employee"}@123`;

    try {
      // 1. Create the Auth User stub. If the email is already registered (e.g. a
      // leftover account whose profile was deleted), reuse it instead of failing.
      const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
        email: email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name: name },
      });

      let newUserId: string;
      if (authErr) {
        if (authErr.message?.toLowerCase().includes("already")) {
          const existing = await findAuthUserByEmail(adminClient, email);
          if (!existing) return { success: false, error: authErr.message };
          newUserId = existing.id;
          const { error: resetErr } = await adminClient.auth.admin.updateUserById(newUserId, {
            password: tempPassword,
            email_confirm: true,
          });
          if (resetErr) return { success: false, error: resetErr.message };
        } else {
          console.error("Auth User Creation Error:", authErr.message);
          return { success: false, error: authErr.message };
        }
      } else {
        newUserId = authUser.user.id;
      }

      // 2. Insert the profile. Refuse to hijack an account that already belongs to another company.
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("company_id")
        .eq("id", newUserId)
        .maybeSingle();
      if (
        existingProfile &&
        existingProfile.company_id &&
        existingProfile.company_id !== companyId
      ) {
        return {
          success: false,
          error: `This email already belongs to another company's account (profile company: ${existingProfile.company_id}, target company: ${companyId}).`,
        };
      }

      // Resolve shift timing so attendance runs on the employee's shift
      let shiftStart: string | null = null;
      let shiftEnd: string | null = null;
      if (shiftId) {
        const { data: shift } = await adminClient
          .from("shifts")
          .select("start_time, end_time")
          .eq("id", shiftId)
          .maybeSingle();
        if (shift) {
          shiftStart = shift.start_time;
          shiftEnd = shift.end_time;
        }
      }

      const { error: profileErr } = await adminClient.from("profiles").upsert({
        id: newUserId,
        company_id: companyId,
        name: name,
        email: email,
        role: role,
        job_title: jobTitle,
        department: department,
        employee_code: employeeCode || null,
        work_location: workLocation || null,
        employment_type: employmentType || "Full-time",
        onboarding_status: "Pending",
        shift_id: shiftId || null,
        work_start_time: shiftStart,
        work_end_time: shiftEnd,
        reporting_to: reportingTo || null,
        date_of_joining: dateOfJoining || null,
      });

      if (profileErr) {
        console.error("Profile Stub Creation Error:", profileErr.message);
        // Only clean up if we created the auth user in this call
        if (!existingProfile && !authErr) {
          await adminClient.auth.admin.deleteUser(newUserId);
        }
        return { success: false, error: profileErr.message };
      }

      console.log(`✅ Onboarded employee ${name} successfully. Email: ${email}`);

      // 3. Query company details for tenant intranet portal link and branding
      const { data: comp } = await adminClient
        .from("companies")
        .select("name, tenant_domain, brand_color")
        .eq("id", companyId)
        .maybeSingle();

      const resolvedTenant = data.tenantDomain || comp?.tenant_domain || null;
      const { url: portalUrl, displayUrl: portalDisplayUrl } = resolveTenantPortalUrl(resolvedTenant);
      const appName = companyName || comp?.name || "CapOasis HRMS";
      const brandColor = comp?.brand_color || "#d97706";

      // 4. Send login credentials via email (Resend)
      let emailSent = false;
      const resendKey = process.env["RESEND_API"];
      if (resendKey) {
        try {
          const from = process.env["EMAIL_FROM"] || "Yoova HRMS <noreply@yoovaventures.com>";
          const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #eeeeee;">
            <tr>
              <td style="background:${brandColor};padding:24px 32px;">
                <p style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">${appName}</p>
                <p style="margin:4px 0 0 0;color:rgba(255,255,255,0.85);font-size:13px;">Corporate Intranet Portal</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 8px 0;color:#111827;font-size:18px;font-weight:bold;">Welcome aboard, ${name}!</p>
                <p style="margin:0 0 20px 0;color:#374151;font-size:14px;line-height:1.6;">Your employee account has been created by the HR team. You can access your company's intranet portal at <a href="${portalUrl}" style="color:${brandColor};font-weight:bold;text-decoration:underline;">${portalDisplayUrl}</a> using the credentials below.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:20px;">
                  <tr>
                    <td style="padding:8px 16px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">Intranet Portal</td>
                    <td style="padding:8px 16px;font-size:14px;font-weight:bold;" align="right">
                      <a href="${portalUrl}" style="color:${brandColor};text-decoration:none;">${portalDisplayUrl} &rarr;</a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 16px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">Login Email</td>
                    <td style="padding:8px 16px;color:#111827;font-size:14px;font-weight:bold;" align="right">${email}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 16px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">Temporary Password</td>
                    <td style="padding:8px 16px;color:#111827;font-size:14px;font-weight:bold;" align="right">${tempPassword}</td>
                  </tr>
                </table>
                <div style="text-align:center;margin:24px 0 20px 0;">
                  <a href="${portalUrl}" style="background:${brandColor};color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block;">Log in to Intranet Portal &rarr;</a>
                </div>
                <p style="margin:0 0 16px 0;color:#6b7280;font-size:13px;line-height:1.6;">For security, please change this temporary password after your first login.</p>
                <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">If you weren't expecting this email, you can safely ignore it.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from,
              to: [email],
              subject: `Your ${appName} intranet login credentials`,
              html,
            }),
          });

          emailSent = resp.ok;
          if (!resp.ok) {
            const errBody = await resp.text().catch(() => "");
            console.error("Resend email error:", resp.status, errBody.slice(0, 500));
          }
        } catch (err) {
          console.error("Email send exception:", err);
        }
      }

      return {
        success: true,
        emailSent,
        credentials: {
          email,
          password: tempPassword,
          portalUrl,
          portalDisplayUrl,
        },
      };
    } catch (err: any) {
      console.error("Onboarding Exception:", err);
      return { success: false, error: err.message };
    }
  });

/**
 * Fetch list of all company employees with their onboarding status.
 */
export async function getCompanyEmployeesWithStatus(companyId: string) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email, job_title, department, role, onboarding_status")
      .eq("company_id", companyId);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Error fetching company employees:", err);
    return [];
  }
}

/**
 * Complete the employee self-service onboarding questionnaire.
 */
export async function completeEmployeeOnboarding(
  userId: string,
  details: {
    phone: string;
    gender: string;
    dateOfBirth: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    bankName: string;
    accountNo: string;
    pan: string;
    uan?: string;
  },
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("profiles")
      .update({
        phone: details.phone,
        gender: details.gender,
        date_of_birth: details.dateOfBirth,
        address_line1: details.addressLine1,
        address_line2: details.addressLine2 || null,
        city: details.city,
        state: details.state,
        postal_code: details.postalCode,
        country: details.country,
        emergency_contact_name: details.emergencyContactName,
        emergency_contact_phone: details.emergencyContactPhone,
        bank_name: details.bankName,
        account_no: details.accountNo,
        pan: details.pan,
        uan: details.uan || null,
        onboarding_status: "Completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Error completing employee onboarding:", err);
    return false;
  }
}

/**
 * Server function to delete an employee's auth user record and corresponding profile records
 * using the Supabase admin client.
 */
export const adminDeleteEmployee = createServerFn({ method: "POST" })
  .validator((d: { employeeId: string }) => d)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env["VITE_SUPABASE_URL"];
    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("⚠️ Supabase admin credentials missing from server env.");
      return { success: false, error: "Database configuration error" };
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { employeeId } = data;

    try {
      // 1. Delete profiles record (will cascading delete references if any, or standard drop)
      const { error: profileErr } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", employeeId);

      if (profileErr) throw profileErr;

      // 2. Delete Auth User container
      const { error: authErr } = await adminClient.auth.admin.deleteUser(employeeId);
      if (authErr) {
        console.warn("Could not delete from Auth container directly:", authErr.message);
      }

      return { success: true };
    } catch (err: any) {
      console.error("Delete exception:", err);
      return { success: false, error: err.message };
    }
  });

export interface UpdateEmployeeParams {
  employeeId: string;
  name: string;
  role: string;
  department?: string | null;
  jobTitle?: string | null;
  employeeCode?: string | null;
  workLocation?: string | null;
  employmentType?: string | null;
  onboardingStatus: string;
  shiftId?: string | null;
  reportingTo?: string | null;
  dateOfJoining?: string | null;
}

export const adminUpdateEmployee = createServerFn({ method: "POST" })
  .validator((d: UpdateEmployeeParams) => d)
  .handler(async ({ data }) => {
    const supabaseUrl = process.env["VITE_SUPABASE_URL"];
    const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("⚠️ Supabase admin credentials missing from server env.");
      return { success: false, error: "Database configuration error" };
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      employeeId,
      name,
      role,
      department,
      jobTitle,
      employeeCode,
      workLocation,
      employmentType,
      onboardingStatus,
      shiftId,
      reportingTo,
      dateOfJoining,
    } = data;

    try {
      let shiftStart: string | null = null;
      let shiftEnd: string | null = null;
      const updatePayload: any = {
        name: name,
        role: role,
        department: department || null,
        job_title: jobTitle || null,
        employee_code: employeeCode || null,
        work_location: workLocation || null,
        employment_type: employmentType || null,
        onboarding_status: onboardingStatus,
        reporting_to: reportingTo || null,
        date_of_joining: dateOfJoining || null,
        updated_at: new Date().toISOString(),
      };
      if (shiftId === null) {
        // Explicitly unassign — fall back to company default timing
        updatePayload.shift_id = null;
        updatePayload.work_start_time = null;
        updatePayload.work_end_time = null;
      } else if (shiftId) {
        const { data: shift } = await adminClient
          .from("shifts")
          .select("start_time, end_time")
          .eq("id", shiftId)
          .maybeSingle();
        if (shift) {
          shiftStart = shift.start_time;
          shiftEnd = shift.end_time;
        }
        updatePayload.shift_id = shiftId;
        updatePayload.work_start_time = shiftStart;
        updatePayload.work_end_time = shiftEnd;
      }

      const { error } = await adminClient
        .from("profiles")
        .update(updatePayload)
        .eq("id", employeeId);

      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error("Update profile exception:", err);
      return { success: false, error: err.message };
    }
  });
