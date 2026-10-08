// supabase/functions/c2b-validation/index.ts
//
// C2B Validation URL.
//
// Called by Safaricom BEFORE the payment is debited from the customer's
// wallet. We use a STRICT policy:
//   * If the BillRefNumber matches an active unit/tenant, respond 200 { ResultCode: 0 }
//   * If the BillRefNumber is unknown, respond 200 { ResultCode: "C2B00012" } to reject.
//   * If the DB times out or errors, fail-open and accept the payment to prevent blocking.
//
// Rationale: Strict validation prevents typos and misallocated payments from entering
// the External Unmatched queue, forcing the customer to double-check their unit tag.
//
// Hardening:
//   * Restrict to Safaricom's published IP ranges (shared with mpesa-callback).
//   * Log the raw payload so rejected tags can be debugged.
//   * Always return 200 to Safaricom (their docs treat non-200 as retryable).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SAFARICOM_IPS = new Set([
  "196.201.214.200",
  "196.201.214.206",
  "196.201.213.114",
  "196.201.214.207",
  "196.201.214.208",
  "196.201.213.44",
  "196.201.214.170",
  "196.201.214.176",
  "196.201.214.177",
  "196.201.214.167",
  "196.201.214.168",
  "196.201.214.195",
]);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function resolveCallerIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
      },
    });
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // IP check (can be disabled for sandbox via env var).
  const verifyIp = (Deno.env.get("MPESA_VERIFY_CALLBACK_IP") ?? "true") !== "false";
  if (verifyIp) {
    const ip = resolveCallerIp(req);
    if (!ip || !SAFARICOM_IPS.has(ip)) {
      console.warn(`[c2b-validation] rejected IP: ${ip}`);
      // Respond 200 with Rejected so Safaricom does not retry; we just drop it.
      return json(200, { ResultCode: "C2B00016", ResultDesc: "Rejected" });
    }
  }

  const payload = await req.json().catch(() => null) as Record<string, unknown> | null;
  console.log("[c2b-validation] payload:", JSON.stringify(payload));

  // Strict Validation: Reject unknown bill refs to prevent misallocated payments.
  try {
    const rawBillRef = String((payload as any)?.BillRefNumber ?? "");
    const normalizedRef = rawBillRef.replace(/\s+/g, "").toUpperCase();
    
    if (!normalizedRef) {
      console.warn(`[c2b-validation] missing or empty BillRefNumber`);
      return json(200, { ResultCode: "C2B00012", ResultDesc: "Invalid Account Number" });
    }

    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      // We wrap the DB call in a 3-second timeout. If the DB is slow, we "fail open"
      // and accept the payment rather than arbitrarily rejecting a customer's payment.
      const lookupPromise = sb.rpc("find_active_tenant_by_unit_tag", { p_tag: normalizedRef });
      
      const timeoutPromise = new Promise<null>((resolve) => 
        setTimeout(() => resolve(null), 3000)
      );

      const result = await Promise.race([lookupPromise, timeoutPromise]);
      
      if (result === null) {
        console.warn(`[c2b-validation] DB lookup timed out for "${normalizedRef}", failing open.`);
        return json(200, { ResultCode: 0, ResultDesc: "Accepted" });
      }

      const { data, error } = result as any;
      if (error) throw error;
      
      const match = Array.isArray(data) ? data[0] : data;
      if (!match?.unit_id) {
        console.warn(`[c2b-validation] no unit matches normalized BillRefNumber="${normalizedRef}" — REJECTING payment.`);
        return json(200, { ResultCode: "C2B00012", ResultDesc: "Invalid Account Number" });
      }
      
      console.log(`[c2b-validation] verified active tenant for "${normalizedRef}".`);
    }
  } catch (e) {
    console.error("[c2b-validation] lookup error:", (e as Error)?.message);
    // On unexpected errors, fail-open to avoid blocking payments due to a bug.
  }

  return json(200, { ResultCode: 0, ResultDesc: "Accepted" });
});
