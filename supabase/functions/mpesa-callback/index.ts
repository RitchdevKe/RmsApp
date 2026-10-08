// supabase/functions/mpesa-callback/index.ts
// Handles Safaricom STK callback and updates payment row.
//
// Security hardening:
//   - MPESA_VERIFY_CALLBACK_IP=true (default) restricts to Safaricom published IP ranges.
//     Set to 'false' only for local sandbox testing.
//   - Idempotency: only updates rows whose status is still 'pending' — duplicate callbacks
//     from Safaricom are silently ignored (returns 200 OK so Safaricom doesn't retry).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Safaricom published callback IP ranges ─────────────────────────────────────
// Source: Safaricom Daraja API documentation (updated 2024).
// Add any new ranges here if Safaricom publishes updates.
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

// Note: mpesa-callback is called server-to-server by Safaricom; CORS headers are irrelevant
// but Supabase Edge Functions need them for OPTIONS pre-flight from any monitoring tools.
function json(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function extractMetadata(callbackMetadata: any): Record<string, unknown> {
  const items = callbackMetadata?.Item;
  const arr = Array.isArray(items) ? items : [];
  const out: Record<string, unknown> = {};
  for (const it of arr) {
    if (it?.Name) out[String(it.Name)] = it?.Value;
  }
  return out;
}

/** Return the real caller IP from standard proxy headers. */
function resolveCallerIp(req: Request): string | null {
  // X-Forwarded-For may be comma-separated; first entry is the original client IP.
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

  // ── IP validation ──────────────────────────────────────────────────────────
  // Default ON in production. Disable only for sandbox testing:
  //   set MPESA_VERIFY_CALLBACK_IP=false in Edge Function secrets.
  const verifyIp = (Deno.env.get("MPESA_VERIFY_CALLBACK_IP") ?? "true") !== "false";
  if (verifyIp) {
    const callerIp = resolveCallerIp(req);
    if (!callerIp || !SAFARICOM_IPS.has(callerIp)) {
      // Return 200 to Safaricom regardless — never expose that we rejected it.
      // Log the IP for investigation.
      console.warn(`[mpesa-callback] Rejected request from IP: ${callerIp}`);
      return json(200, { ok: false, reason: "ip_not_allowed" });
    }
  }

  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("[mpesa-callback] Supabase env vars missing");
      return json(500, { error: "Supabase env vars missing" });
    }

    const payload = await req.json().catch(() => null) as any;
    const cb = payload?.Body?.stkCallback;
    if (!cb) {
      console.warn("[mpesa-callback] Invalid callback payload:", JSON.stringify(payload));
      return json(400, { error: "Invalid callback payload" });
    }

    const checkoutRequestId = String(cb.CheckoutRequestID ?? "").trim();
    if (!checkoutRequestId) return json(400, { error: "Missing CheckoutRequestID" });

    const resultCode = typeof cb.ResultCode === "number" ? cb.ResultCode : Number(cb.ResultCode);
    const resultDesc = String(cb.ResultDesc ?? "");

    const meta = extractMetadata(cb.CallbackMetadata);
    const transactionId = meta["MpesaReceiptNumber"] ? String(meta["MpesaReceiptNumber"]) : null;
    const amount = meta["Amount"] ? Number(meta["Amount"]) : null;

    let status: "completed" | "failed" | "cancelled" = "failed";
    if (resultCode === 0) status = "completed";
    else if (resultCode === 1032) status = "cancelled"; // user cancelled

    console.log(`[mpesa-callback] ${checkoutRequestId} → ${status} (code ${resultCode})`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Idempotency guard ────────────────────────────────────────────────────
    // Only update rows that are still 'pending'. If this callback is a duplicate
    // (Safaricom retries on non-200), the update is a no-op and we return 200 OK
    // to prevent infinite retries.
    const { error: updateErr, count } = await supabase
      .from("payments")
      .update({
        status,
        transaction_id: transactionId,
        result_code: Number.isFinite(resultCode) ? resultCode : null,
        result_desc: resultDesc,
        ...(amount != null ? { amount } : {}),
      })
      .eq("checkout_request_id", checkoutRequestId)
      .eq("status", "pending")   // ← idempotency: skip already-processed rows
      .select("id", { count: "exact", head: true });

    if (updateErr) {
      console.error("[mpesa-callback] DB update error:", updateErr.message);
      // Return 500 so Safaricom retries (genuine error, not a duplicate).
      return json(500, { error: "Failed to update payment record" });
    }

    if ((count ?? 0) === 0) {
      // Row was already processed (duplicate callback) — ack silently.
      console.log(`[mpesa-callback] Duplicate callback ignored for ${checkoutRequestId}`);
    } else if (status === 'completed') {
      // ── Website onboarding fan-out ──────────────────────────────────────────
      // If this payment was tagged purpose='registration' by website-stk-push,
      // promote the website_tenant_links row to 'onboarded' (when fully paid)
      // and credit the referrer exactly once.
      try {
        const { data: pay } = await supabase.from('payments')
          .select('amount, website_user_id, purpose, transaction_id')
          .eq('checkout_request_id', checkoutRequestId).maybeSingle();
        if (pay?.purpose === 'registration' && pay.website_user_id) {
          const { data: link } = await supabase.from('website_tenant_links')
            .select('*').eq('website_user_id', pay.website_user_id).maybeSingle();
          if (link) {
            const paid_amount = (link.paid_amount || 0) + Number(pay.amount || 0);
            const fullyPaid = paid_amount >= (link.expected_amount || 0);
            await supabase.from('website_tenant_links').update({
              paid_amount,
              status: fullyPaid ? 'onboarded' : 'awaiting_payment',
              updated_at: new Date().toISOString(),
            }).eq('id', link.id);

            // The frontend UI will pull the correct anchor from website_tenant_links.
            // We removed the heavy JSON blob update here to prevent webhook timeouts.
            if (fullyPaid && link.ref_code) {
              // Idempotent insert via (website_user_id, transaction_id) unique index.
              const commission = Math.round(paid_amount * 0.05); // 5% default
              await supabase.from('website_referral_credits').upsert({
                website_user_id: pay.website_user_id,
                ref_code: link.ref_code,
                tenant_id: link.tenant_id,
                amount: commission,
                transaction_id: pay.transaction_id,
              }, { onConflict: 'website_user_id,transaction_id' });
              console.log(`[mpesa-callback] Referral credit ${commission} → ${link.ref_code}`);
            }
          }
        }
      } catch (e) {
        console.error('[mpesa-callback] Website fan-out error:', (e as Error)?.message);
        // Don't fail the callback — the payment row is already updated.
      }
    }

    return json(200, { ok: true });
  } catch (e) {
    console.error("[mpesa-callback] Unhandled error:", (e as Error)?.message);
    return json(500, { error: "Internal server error" });
  }
});
