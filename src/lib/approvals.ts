import { createServerFn } from "@tanstack/react-start";
import crypto from "crypto";
import { getR2Path, uploadR2Base64 } from "./r2-storage";

export interface UploadApprovalAttachmentParams {
  base64Data: string;
  fileName: string;
  companyId: string;
}

export const uploadApprovalAttachment = createServerFn({ method: "POST" })
  .validator((d: UploadApprovalAttachmentParams) => d)
  .handler(async ({ data }) => {
    const { base64Data, fileName, companyId } = data;
    const key = getR2Path.approvalAttachment(companyId, "receipts", fileName);

    try {
      const res = await uploadR2Base64({
        key,
        base64Data,
      });

      if (!res.success) {
        throw new Error(res.error || "R2 approval attachment upload failed");
      }

      return { success: true, secure_url: res.url };
    } catch (err: any) {
      console.error("R2 approval attachment upload error:", err.message);
      return { success: false, error: err.message };
    }
  });

export interface WhatsAppApprovalParams {
  to: string;
  approverName: string;
  applicantName: string;
  requestType: string;
  requestTitle: string;
  reason: string;
}

export const sendApprovalWhatsAppNotification = createServerFn({ method: "POST" })
  .validator((d: WhatsAppApprovalParams) => d)
  .handler(async ({ data }) => {
    const accountSid = process.env["TWILIO_ACCOUNT_SID"];
    const authToken = process.env["TWILIO_AUTH_TOKEN"];
    const fromNumber = process.env["TWILIO_WHATSAPP_NUMBER"] || "whatsapp:+14155238886";

    if (!accountSid || !authToken) {
      console.warn("⚠️ Twilio credentials missing from server environment variables.");
      return { success: false, error: "Twilio credentials missing" };
    }

    const { to, approverName, applicantName, requestType, requestTitle, reason } = data;

    // Clean and format number to E.164
    let recipient = to.replace(/[\s-()]/g, "");
    if (recipient.length === 10 && /^\d+$/.test(recipient)) {
      recipient = `+91${recipient}`; // Default India code prefix if 10-digit
    }
    if (!recipient.startsWith("+")) {
      recipient = `+${recipient}`;
    }

    const toFormatted = `whatsapp:${recipient}`;
    const fromFormatted = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;

    // Construct a friendly, descriptive fallback message body
    const body = `*New Approval Request*\n\n` +
                 `Dear *${approverName}*,\n` +
                 `*${applicantName}* has submitted a *${requestType}* request:\n` +
                 `_"${requestTitle}"_\n\n` +
                 `*Reason:* ${reason}\n\n` +
                 `Please log into the HRMS Approvals Center to Approve or Reject.`;

    const params = new URLSearchParams();
    params.append("From", fromFormatted);
    params.append("To", toFormatted);
    params.append("Body", body);

    try {
      const authHeader = "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: params
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Twilio responded with status ${res.status}: ${errText}`);
      }

      const resData = await res.json();
      console.log(`✅ Twilio Approval WhatsApp sent to ${toFormatted}:`, resData.sid);
      return { success: true, sid: resData.sid };
    } catch (err: any) {
      console.error("❌ Twilio Approval WhatsApp Send Error:", err.message);
      return { success: false, error: err.message };
    }
  });

/**
 * Safely format an approval request amount into INR currency string (e.g. ₹500, ₹0.22),
 * preventing `NaN` when amounts are stored with prefixes like "$" or "₹" or numeric strings.
 */
export function formatApprovalAmount(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val).trim();
  if (!str || str.toLowerCase() === "nan") return "";
  const clean = str.replace(/[^\d.]/g, "");
  if (!clean) return "";
  const num = parseFloat(clean);
  if (isNaN(num)) return "";
  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: num % 1 !== 0 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

