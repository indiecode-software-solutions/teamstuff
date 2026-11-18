import { createServerFn } from "@tanstack/react-start";
import {
  createWorkspaceSubscription,
  verifyWorkspaceSubscriptionPayment,
  syncSubscriptionSeatsWithRazorpay,
  getCompanyBillingPortalData,
} from "./billing.server";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

let razorpayScriptPromise: Promise<boolean> | null = null;

/**
 * Dynamically loads Razorpay's official checkout.js script once.
 */
export function loadRazorpayCheckoutScript(): Promise<boolean> {
  if (typeof window !== "undefined" && window.Razorpay) {
    return Promise.resolve(true);
  }
  if (razorpayScriptPromise) return razorpayScriptPromise;

  razorpayScriptPromise = new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(false);
      return;
    }
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      razorpayScriptPromise = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });

  return razorpayScriptPromise;
}

export const createSubscriptionServerFn = createServerFn({ method: "POST" })
  .validator((d: { companyId: string; userId: string; seats: number }) => d)
  .handler(async ({ data }) => {
    return await createWorkspaceSubscription(data);
  });

export const verifySubscriptionServerFn = createServerFn({ method: "POST" })
  .validator(
    (d: {
      companyId: string;
      userId: string;
      subscriptionId: string;
      paymentId: string;
      signature: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    return await verifyWorkspaceSubscriptionPayment(data);
  });

export const syncSubscriptionSeatsServerFn = createServerFn({ method: "POST" })
  .validator((d: { companyId: string }) => d)
  .handler(async ({ data }) => {
    return await syncSubscriptionSeatsWithRazorpay(data.companyId);
  });

export const getBillingPortalDataServerFn = createServerFn({ method: "POST" })
  .validator((d: { companyId: string; userId: string }) => d)
  .handler(async ({ data }) => {
    return await getCompanyBillingPortalData(data);
  });

/**
 * Helper to initiate Razorpay checkout modal for recurring subscription autopay.
 */
export async function startWorkspaceSubscriptionCheckout(params: {
  companyId: string;
  userId: string;
  seats: number;
  onSuccess: () => void;
  onError: (error: string) => void;
  onDismiss?: () => void;
}) {
  const loaded = await loadRazorpayCheckoutScript();
  if (!loaded || !window.Razorpay) {
    params.onError("Failed to load secure Razorpay gateway. Please check your internet connection.");
    return;
  }

  const res = await createSubscriptionServerFn({
    data: {
      companyId: params.companyId,
      userId: params.userId,
      seats: params.seats,
    },
  });

  if (!res.success || !res.subscriptionId || !res.keyId) {
    params.onError(res.error || "Failed to initialize subscription checkout.");
    return;
  }

  const options = {
    key: res.keyId,
    subscription_id: res.subscriptionId,
    name: res.companyName || "Indicode HRMS",
    description: `Workspace Seat Plan (${res.seats} seats)`,
    image: "https://hrms.indiecode.in/favicon.ico",
    prefill: {
      email: res.customerEmail || undefined,
      contact: res.customerPhone || undefined,
    },
    theme: {
      color: "#09090b",
    },
    handler: async function (response: {
      razorpay_payment_id: string;
      razorpay_subscription_id: string;
      razorpay_signature: string;
    }) {
      try {
        const verifyRes = await verifySubscriptionServerFn({
          data: {
            companyId: params.companyId,
            userId: params.userId,
            subscriptionId: response.razorpay_subscription_id,
            paymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          },
        });

        if (verifyRes.success) {
          params.onSuccess();
        } else {
          params.onError(verifyRes.error || "Payment verification failed.");
        }
      } catch (err: any) {
        params.onError(err.message || "Payment verification exception.");
      }
    },
    modal: {
      ondismiss: function () {
        console.log("Checkout modal dismissed by user.");
        params.onDismiss?.();
      },
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.open();
}
