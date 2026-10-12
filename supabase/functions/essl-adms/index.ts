// ESSL ADMS Protocol Receiver — Supabase Edge Function
// Receives attendance punch data from ESSL/Identix/ZKTeco biometric devices.
//
// Device configuration:
//   Menu → COMM. → Cloud Server Setting
//     Enable ADMS:        ON
//     Enable Domain Name: ON
//     Server Address:     <project-ref>.supabase.co
//     Server Port:        443
//     Server Path:        /functions/v1/essl-adms

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────
// Supabase client using service role (bypasses RLS)
// ─────────────────────────────────────────────────────────
function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// ─────────────────────────────────────────────────────────
// Parse ATTLOG body format:
//   PIN\tYYYY-MM-DD HH:MM:SS\tStatus\tVerifyType\tWorkCode\tReserved
// Each record is on its own line.
// ─────────────────────────────────────────────────────────
interface AttLogEntry {
  pin: string;
  datetime: string; // ISO 8601
  status: number;
  verifyType: number;
}

function parseAttLog(body: string): AttLogEntry[] {
  const entries: AttLogEntry[] = [];
  const lines = body.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Fields may be tab or space separated depending on firmware
    const parts = line.split(/\t| {2,}/);
    if (parts.length < 2) continue;
    const pin = (parts[0] ?? "").trim();
    const rawTime = (parts[1] ?? "").trim(); // "2026-08-20 09:30:00"
    if (!pin || !rawTime) continue;

    // Convert "YYYY-MM-DD HH:MM:SS" → ISO 8601
    const isoDatetime = rawTime.replace(" ", "T") + "+05:30"; // IST offset
    const status = parseInt(parts[2] ?? "0", 10);
    const verifyType = parseInt(parts[3] ?? "0", 10);

    entries.push({ pin, datetime: isoDatetime, status, verifyType });
  }
  return entries;
}

// ─────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  try {
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const url = new URL(req.url);
    const serial = url.searchParams.get("SN") ?? url.searchParams.get("sn") ?? "";
    const table = url.searchParams.get("table") ?? "";

    // ── Heartbeat / getrequest — device polls for commands ───
    if (
      url.pathname.endsWith("/getrequest") ||
      (req.method === "GET" && !table)
    ) {
      // Update last_seen_at if we can resolve the device
      if (serial) {
        try {
          const supabase = getSupabaseAdmin();
          await supabase
            .from("biometric_devices")
            .update({ last_seen_at: new Date().toISOString() })
            .eq("device_serial", serial)
            .eq("is_active", true);
        } catch (_) { /* non-critical */ }
      }
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ── ATTLOG push — actual attendance data ─────────────────
    if (req.method === "POST" && table === "ATTLOG") {
      if (!serial) {
        return new Response("Missing SN", { status: 400, headers: corsHeaders });
      }

      let body = "";
      try {
        body = await req.text();
      } catch {
        return new Response("Invalid body", { status: 400, headers: corsHeaders });
      }

      const supabase = getSupabaseAdmin();

      // 1. Look up the registered device
      const { data: device, error: deviceErr } = await supabase
        .from("biometric_devices")
        .select("id, company_id, office_location_id, is_active")
        .eq("device_serial", serial)
        .single();

      if (deviceErr || !device) {
        console.error(`[essl-adms] Unknown or unregistered device serial: ${serial}`);
        return new Response("Device not registered", { status: 403, headers: corsHeaders });
      }
      if (!device.is_active) {
        return new Response("Device inactive", { status: 403, headers: corsHeaders });
      }

      // 2. Update last_seen_at
      await supabase
        .from("biometric_devices")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", device.id);

      // 3. Parse ATTLOG entries
      const entries = parseAttLog(body);
      if (entries.length === 0) {
        return new Response("OK", { status: 200, headers: corsHeaders });
      }

      // 4. Batch-resolve employee_code → user_id for this company
      const pins = [...new Set(entries.map((e) => e.pin))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, employee_code")
        .eq("company_id", device.company_id)
        .in("employee_code", pins);

      const pinToUserId = new Map<string, string>();
      for (const p of profiles ?? []) {
        if (p.employee_code) pinToUserId.set(String(p.employee_code).trim(), p.id);
      }

      let processed = 0;
      let skipped = 0;

      // 5. Process each entry
      for (const entry of entries) {
        const userId = pinToUserId.get(entry.pin);
        if (!userId) {
          console.warn(`[essl-adms] No user found for PIN ${entry.pin} in company ${device.company_id}`);
          skipped++;
          continue;
        }

        const punchTime = new Date(entry.datetime);
        if (isNaN(punchTime.getTime())) {
          console.warn(`[essl-adms] Invalid datetime: ${entry.datetime}`);
          skipped++;
          continue;
        }

        // Date string in IST (YYYY-MM-DD)
        const dateStr = entry.datetime.slice(0, 10);

        // Fetch existing attendance record for this user + date
        const { data: existing } = await supabase
          .from("attendance")
          .select("id, clock_in, clock_out, status")
          .eq("user_id", userId)
          .eq("date", dateStr)
          .maybeSingle();

        if (!existing) {
          // No record → create clock_in
          const { error: insErr } = await supabase.from("attendance").insert({
            user_id: userId,
            company_id: device.company_id,
            date: dateStr,
            clock_in: punchTime.toISOString(),
            office_location_id: device.office_location_id ?? null,
            status: "present",
            source: "biometric_essl",
            biometric_device_id: device.id,
          });
          if (insErr) console.error("[essl-adms] Insert error:", insErr.message);
          else processed++;
        } else if (existing.clock_in && !existing.clock_out) {
          // Has clock_in but no clock_out — check if this punch is LATER
          const existingIn = new Date(existing.clock_in).getTime();
          if (punchTime.getTime() > existingIn) {
            // Record as clock_out
            const totalMinutes = Math.floor((punchTime.getTime() - existingIn) / 60000);
            const calculatedStatus = totalMinutes < 240 ? "half_day" : existing.status ?? "present";
            const { error: updErr } = await supabase
              .from("attendance")
              .update({
                clock_out: punchTime.toISOString(),
                total_minutes: totalMinutes,
                status: calculatedStatus,
                source: "biometric_essl",
                biometric_device_id: device.id,
              })
              .eq("id", existing.id);
            if (updErr) console.error("[essl-adms] Update error:", updErr.message);
            else processed++;
          } else {
            skipped++; // Earlier punch, ignore (duplicate heartbeat)
          }
        } else {
          skipped++; // Already fully clocked out, skip
        }
      }

      console.log(`[essl-adms] SN=${serial} | processed=${processed} skipped=${skipped}`);
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    // ── All other requests ─────────────────────────────────
    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (err: any) {
    console.error("[essl-adms] Server error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
