import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { canUserManageBilling, calculateWorkspaceMonthlyPrice } from "./permissions";

function getAdminClient() {
  const supabaseUrl = process.env["VITE_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service credentials missing from environment.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getRazorpayAuth(): { keyId: string; keySecret: string; basicAuth: string } {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) missing from environment.");
  }
  const basicAuth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  return { keyId, keySecret, basicAuth };
}

function computeHmacSha256Hex(message: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Creates or retrieves a monthly plan in Razorpay for a given total monthly amount.
 */
export async function createOrFetchRazorpayPlan(totalAmountInr: number, description?: string): Promise<string> {
  const { basicAuth } = getRazorpayAuth();
  const amountPaise = Math.round(totalAmountInr * 100);

  // 1. Check if a plan matching this price already exists on Razorpay
  try {
    const listRes = await fetch("https://api.razorpay.com/v1/plans?count=50", {
      headers: { Authorization: `Basic ${basicAuth}` },
    });
    if (listRes.ok) {
      const data = await listRes.json().catch(() => null);
      if (Array.isArray(data?.items)) {
        const found = data.items.find(
          (p: any) =>
            p.period === "monthly" &&
            p.interval === 1 &&
            p.item?.amount === amountPaise &&
            p.item?.currency === "INR",
        );
        if (found?.id) return found.id;
      }
    }
  } catch (err) {
    console.warn("Could not list Razorpay plans, creating new plan...", err);
  }

  // 2. Create plan if none matched
  const createRes = await fetch("https://api.razorpay.com/v1/plans", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      period: "monthly",
      interval: 1,
      item: {
        name: `Indicode HRMS Plan (₹${totalAmountInr}/mo)`,
        amount: amountPaise,
        currency: "INR",
        description: description || `Monthly workspace subscription (₹${totalAmountInr}/mo)`,
      },
      notes: {
        product: "indiecode_hrms",
        amount_inr: String(totalAmountInr),
      },
    }),
  });

  const planData = await createRes.json().catch(() => null);
  if (!createRes.ok || !planData?.id) {
    throw new Error(planData?.error?.description || "Failed to create Razorpay billing plan.");
  }

  return planData.id;
}

/**
 * Initiates a recurring Razorpay Autopay subscription for the workspace.
 */
export async function createWorkspaceSubscription(params: {
  companyId: string;
  userId: string;
  seats: number;
}) {
  const admin = getAdminClient();
  const { keyId, basicAuth } = getRazorpayAuth();

  // 1. Authorize user
  const { data: userProfile } = await admin
    .from("profiles")
    .select("id, email, name, role, permissions")
    .eq("id", params.userId)
    .single();

  const { data: company, error: compErr } = await admin
    .from("companies")
    .select("*")
    .eq("id", params.companyId)
    .single();

  if (compErr || !company) {
    return { success: false, error: "Company workspace not found." };
  }

  const isBillingAdmin = canUserManageBilling(userProfile, company);
  if (!isBillingAdmin) {
    return { success: false, error: "Unauthorized: only authorized billing users can create subscriptions." };
  }

  // Determine current active users to enforce minimum seats
  const { count: currentActiveUsers } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .or("is_active.is.null,is_active.eq.true");

  const activeCount = currentActiveUsers || 1;
  const requestedSeats = Math.max(activeCount, Math.max(1, params.seats));

  // Compute pricing: Base plan ₹2,499 for <= 10 users + ₹149 for extra users
  const pricing = calculateWorkspaceMonthlyPrice(company, requestedSeats);
  const totalMonthlyAmountInr = pricing.monthlyTotalInr;

  const planId = await createOrFetchRazorpayPlan(
    totalMonthlyAmountInr,
    `Workspace Plan: ${requestedSeats} active users (Base ₹${pricing.basePrice} + ${pricing.extraUsersCount} extra @ ₹${pricing.extraSeatPrice})`,
  );

  // 2. Ensure Razorpay customer exists
  let customerId = company.razorpay_customer_id;
  if (!customerId) {
    const custRes = await fetch("https://api.razorpay.com/v1/customers", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: company.name,
        email: company.owner_email || userProfile?.email || "billing@indiecode.in",
        contact: company.owner_phone || undefined,
        notes: {
          company_id: company.id,
          company_name: company.name,
        },
      }),
    });
    const custData = await custRes.json().catch(() => null);
    if (custRes.ok && custData?.id) {
      customerId = custData.id;
      await admin.from("companies").update({ razorpay_customer_id: customerId }).eq("id", company.id);
    }
  }

  // 3. Create recurring Razorpay subscription
  const subRes = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: planId,
      total_count: 120, // 10 years recurring
      quantity: 1,
      customer_notify: 1,
      customer_id: customerId || undefined,
      notes: {
        company_id: company.id,
        seats: String(requestedSeats),
        monthly_total_inr: String(totalMonthlyAmountInr),
        created_by_user_id: params.userId,
      },
    }),
  });

  const subData = await subRes.json().catch(() => null);
  if (!subRes.ok || !subData?.id) {
    return {
      success: false,
      error: subData?.error?.description || "Failed to initialize Razorpay subscription.",
    };
  }

  const subscriptionId = subData.id;

  // 4. Update company record with plan and seat count
  await admin
    .from("companies")
    .update({
      seat_limit: requestedSeats,
      razorpay_plan_id: planId,
    })
    .eq("id", company.id);

  // 5. Record pending transaction in ledger
  await admin.from("billing_transactions").insert({
    company_id: company.id,
    amount_inr: totalMonthlyAmountInr,
    currency: "INR",
    status: "pending",
    razorpay_order_id: subscriptionId,
    transaction_type: "initial_activation",
    seats_delta: requestedSeats,
    description: `Indicode HRMS subscription activation for ${requestedSeats} users (₹${totalMonthlyAmountInr}/mo)`,
    metadata: {
      razorpay_subscription_id: subscriptionId,
      plan_id: planId,
      monthly_total_inr: totalMonthlyAmountInr,
      base_price_inr: pricing.basePrice,
      base_seats_included: pricing.baseSeats,
      extra_seats: pricing.extraUsersCount,
      extra_seat_price: pricing.extraSeatPrice,
      user_id: params.userId,
      requested_seats: requestedSeats,
    },
  });

  return {
    success: true,
    subscriptionId,
    keyId,
    companyName: company.name,
    amountInr: totalMonthlyAmountInr,
    seats: requestedSeats,
    customerEmail: company.owner_email || userProfile?.email,
    customerPhone: company.owner_phone,
  };
}

/**
 * Verifies the payment signature returned by the Razorpay Checkout modal
 * and activates the workspace subscription.
 */
export async function verifyWorkspaceSubscriptionPayment(params: {
  companyId: string;
  userId: string;
  subscriptionId: string;
  paymentId: string;
  signature: string;
}) {
  const admin = getAdminClient();
  const { keySecret } = getRazorpayAuth();

  const { subscriptionId, paymentId, signature, companyId } = params;
  if (!subscriptionId || !paymentId || !signature || !companyId) {
    return { success: false, error: "Missing required verification parameters." };
  }

  // Razorpay subscription signature: HMAC_SHA256(payment_id + "|" + subscription_id, secret)
  const expectedHex = computeHmacSha256Hex(`${paymentId}|${subscriptionId}`, keySecret);
  const isValid = constantTimeEqual(expectedHex, signature.trim().toLowerCase());

  if (!isValid) {
    console.error("⚠️ Razorpay subscription signature mismatch for company:", companyId);
    return { success: false, error: "Invalid payment signature verification failed." };
  }

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // 1. Mark transaction as paid
  await admin
    .from("billing_transactions")
    .update({
      status: "paid",
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
      updated_at: now.toISOString(),
      metadata: {
        verified_at: now.toISOString(),
        verified_by: params.userId,
        razorpay_subscription_id: subscriptionId,
      },
    })
    .eq("razorpay_order_id", subscriptionId);

  // 2. Fetch transaction seats
  const { data: tx } = await admin
    .from("billing_transactions")
    .select("seats_delta")
    .eq("razorpay_order_id", subscriptionId)
    .maybeSingle();

  const seatsPurchased = Math.max(1, Number(tx?.seats_delta || 5));

  // 3. Update company workspace to active
  const { data: updatedCompany, error: compErr } = await admin
    .from("companies")
    .update({
      subscription_status: "active",
      razorpay_subscription_id: subscriptionId,
      seat_limit: seatsPurchased,
      is_billing_exempt: false,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", companyId)
    .select("*")
    .single();

  if (compErr) {
    return { success: false, error: compErr.message };
  }

  // 4. Mark trial enrollment converted if applicable
  await admin
    .from("trial_enrollments")
    .update({ status: "converted" })
    .eq("provisioned_company_id", companyId);

  return {
    success: true,
    company: updatedCompany,
    message: "Workspace subscription successfully activated with Razorpay Autopay!",
  };
}

/**
 * Synchronizes the Razorpay subscription quantity with the actual active seat count.
 * Automatically invoked when team members are added or offboarded.
 */
export async function syncSubscriptionSeatsWithRazorpay(companyId: string) {
  const admin = getAdminClient();
  const { basicAuth } = getRazorpayAuth();

  const { data: company, error } = await admin
    .from("companies")
    .select("id, name, razorpay_subscription_id, razorpay_plan_id, seat_limit, subscription_status, is_billing_exempt, base_price_inr, base_seats_included, price_per_seat_inr")
    .eq("id", companyId)
    .single();

  if (error || !company) {
    return { success: false, error: "Company not found" };
  }

  if (company.is_billing_exempt) {
    return { success: true, message: "Company is billing exempt, no subscription adjustment required." };
  }

  const subId = company.razorpay_subscription_id;
  if (!subId || company.subscription_status !== "active") {
    return { success: true, message: "No active Razorpay autopay subscription to sync." };
  }

  // Count active employees in workspace
  const { count, error: countErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .or("is_active.is.null,is_active.eq.true");

  if (countErr) {
    return { success: false, error: countErr.message };
  }

  const targetQuantity = Math.max(1, count || 1);

  // If already matches, no action needed
  if (company.seat_limit === targetQuantity) {
    return { success: true, quantity: targetQuantity, synced: true };
  }

  const pricing = calculateWorkspaceMonthlyPrice(company, targetQuantity);
  const targetMonthlyTotal = pricing.monthlyTotalInr;

  const newPlanId = await createOrFetchRazorpayPlan(
    targetMonthlyTotal,
    `Workspace Plan: ${targetQuantity} active users (Base ₹${pricing.basePrice} + ${pricing.extraUsersCount} extra @ ₹${pricing.extraSeatPrice})`,
  );

  // Update subscription plan in Razorpay
  try {
    const patchRes = await fetch(`https://api.razorpay.com/v1/subscriptions/${subId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        plan_id: newPlanId,
        quantity: 1,
        schedule_change_at: "now",
      }),
    });

    const patchData = await patchRes.json().catch(() => null);
    if (!patchRes.ok) {
      console.error("Razorpay subscription patch error:", patchData);
      return {
        success: false,
        error: patchData?.error?.description || "Failed to update Razorpay subscription plan.",
      };
    }

    // Update seat limit and plan in companies table
    await admin
      .from("companies")
      .update({
        seat_limit: targetQuantity,
        razorpay_plan_id: newPlanId,
      })
      .eq("id", company.id);

    // Record dynamic seat change in billing ledger
    await admin.from("billing_transactions").insert({
      company_id: company.id,
      amount_inr: targetMonthlyTotal,
      currency: "INR",
      status: "active",
      razorpay_order_id: subId,
      transaction_type: targetQuantity > (company.seat_limit || 0) ? "seat_add" : "seat_reduce",
      seats_delta: targetQuantity,
      description: `Dynamic seat update: ${targetQuantity} active users (₹${targetMonthlyTotal}/mo)`,
      metadata: {
        razorpay_subscription_id: subId,
        plan_id: newPlanId,
        active_users: targetQuantity,
        monthly_total_inr: targetMonthlyTotal,
        base_price_inr: pricing.basePrice,
        base_seats_included: pricing.baseSeats,
        extra_seats: pricing.extraUsersCount,
        extra_seat_price: pricing.extraSeatPrice,
      },
    });

    console.log(`✅ Synced Razorpay subscription ${subId} to ${targetQuantity} seats (₹${targetMonthlyTotal}/mo) for ${company.name}`);
    return {
      success: true,
      quantity: targetQuantity,
      monthlyTotalInr: targetMonthlyTotal,
      synced: true,
    };
  } catch (err: any) {
    console.error("Exception syncing Razorpay seats:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Loads the complete billing snapshot and transaction history for the Settings page.
 */
export async function getCompanyBillingPortalData(params: { companyId: string; userId: string }) {
  const admin = getAdminClient();

  const { data: userProfile } = await admin
    .from("profiles")
    .select("id, email, name, role, permissions")
    .eq("id", params.userId)
    .single();

  const { data: company, error: compErr } = await admin
    .from("companies")
    .select(
      "id, name, subscription_status, trial_starts_at, trial_ends_at, is_billing_exempt, price_per_seat_inr, base_price_inr, base_seats_included, seat_limit, current_period_start, current_period_end, razorpay_subscription_id, owner_email, owner_phone",
    )
    .eq("id", params.companyId)
    .single();

  if (compErr || !company) {
    return { success: false, error: "Company workspace not found." };
  }

  const canManage = canUserManageBilling(userProfile, company);
  if (!canManage) {
    return { success: false, error: "Access denied: you do not have billing management privileges." };
  }

  // Active employees count
  const { count: activeEmployeesCount } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("company_id", company.id)
    .or("is_active.is.null,is_active.eq.true");

  // Team members list for Active Team Roster
  const { data: teamMembers } = await admin
    .from("profiles")
    .select("id, name, email, role, created_at, is_active")
    .eq("company_id", company.id)
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: true });

  // Ledger history
  const { data: transactions } = await admin
    .from("billing_transactions")
    .select("*")
    .eq("company_id", company.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return {
    success: true,
    company,
    activeEmployeesCount: activeEmployeesCount || 0,
    teamMembers: teamMembers || [],
    transactions: transactions || [],
    isOwner: String(userProfile?.email || "").toLowerCase() === String(company.owner_email || "").toLowerCase(),
  };
}
