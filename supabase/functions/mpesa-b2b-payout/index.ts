// supabase/functions/mpesa-b2b-payout/index.ts
// Initiates an M-Pesa B2B PayBill request that moves funds from a landlord
// paybill (PartyA) to the agency paybill (PartyB) using Daraja's
// /mpesa/b2b/v1/paymentrequest endpoint.
//
// Required secrets (Supabase project secrets):
//   MPESA_ENV                       'sandbox' | 'production'
//   MPESA_CONSUMER_KEY              OAuth consumer key
//   MPESA_CONSUMER_SECRET           OAuth consumer secret
//   MPESA_B2B_INITIATOR_NAME        Daraja initiator username (org-level)
//   MPESA_B2B_SECURITY_CREDENTIAL   Encrypted password produced by Daraja
//   MPESA_AGENCY_SHORTCODE          Agency paybill that receives the funds
//   MPESA_B2B_QUEUE_TIMEOUT_URL     Public URL Safaricom will hit on timeout
//   MPESA_B2B_RESULT_URL            Public URL Safaricom will hit with result
//
// Request body:
//   { amount, fromShortcode, toShortcode?, accountReference?, remarks?, sourcePaymentId? }
//
// Notes:
//   - The agency operates as the initiator across all landlord paybills, so
//     the same MPESA_B2B_INITIATOR_NAME/SECURITY_CREDENTIAL pair is reused.
//   - Every request is persisted to public.mpesa_b2b_payouts (status pending);
//     a separate result handler should patch the row when Safaricom calls back.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function resolveBaseUrl(): string {
  const env = (Deno.env.get("MPESA_ENV") || "sandbox").toLowerCase();
  return env === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

async function getOAuthToken(key: string, secret: string, baseUrl: string): Promise<string> {
  const creds = btoa(`${key}:${secret}`);
  const resp = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  if (!resp.ok) {
    throw new Error(`OAuth failed: HTTP ${resp.status}`);
  }
  const data = await resp.json();
  if (!data?.access_token) throw new Error("OAuth: missing access_token");
  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const amount = Number(body?.amount);
  const fromShortcode = String(body?.fromShortcode || "").trim();
  const toShortcode = String(body?.toShortcode || Deno.env.get("MPESA_AGENCY_SHORTCODE") || "").trim();
  const accountReference = String(body?.accountReference || "AGENCY-PAYOUT").slice(0, 13);
  const remarks = String(body?.remarks || "Agency commission auto-deduction").slice(0, 100);
  const sourcePaymentId = body?.sourcePaymentId ? String(body.sourcePaymentId) : null;

  if (!Number.isFinite(amount) || amount < 1) return json(400, { error: "amount must be >= 1" });
  if (amount > 150_000) return json(400, { error: "amount exceeds KES 150,000 per-transaction cap" });
  if (!fromShortcode) return json(400, { error: "fromShortcode is required" });
  if (!toShortcode) return json(400, { error: "toShortcode (agency paybill) is required" });

  const {
    MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET,
    MPESA_B2B_INITIATOR_NAME,
    MPESA_B2B_SECURITY_CREDENTIAL,
    MPESA_B2B_QUEUE_TIMEOUT_URL,
    MPESA_B2B_RESULT_URL,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
  } = Deno.env.toObject();

  for (const [k, v] of Object.entries({
    MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_B2B_INITIATOR_NAME,
    MPESA_B2B_SECURITY_CREDENTIAL, MPESA_B2B_QUEUE_TIMEOUT_URL, MPESA_B2B_RESULT_URL,
  })) {
    if (!v) return json(500, { error: `Missing secret: ${k}` });
  }

  const baseUrl = resolveBaseUrl();
  let conversationId: string | null = null;
  let originatorConversationId: string | null = null;
  let responseCode: string | null = null;
  let responseDescription: string | null = null;
  let status: "pending" | "failed" = "pending";

  try {
    const token = await getOAuthToken(MPESA_CONSUMER_KEY!, MPESA_CONSUMER_SECRET!, baseUrl);

    const payload = {
      Initiator: MPESA_B2B_INITIATOR_NAME,
      SecurityCredential: MPESA_B2B_SECURITY_CREDENTIAL,
      CommandID: "BusinessPayBill",
      SenderIdentifierType: "4", // 4 = paybill
      RecieverIdentifierType: "4",
      Amount: Math.round(amount),
      PartyA: fromShortcode,
      PartyB: toShortcode,
      AccountReference: accountReference,
      Remarks: remarks,
      QueueTimeOutURL: MPESA_B2B_QUEUE_TIMEOUT_URL,
      ResultURL: MPESA_B2B_RESULT_URL,
    };

    const resp = await fetch(`${baseUrl}/mpesa/b2b/v1/paymentrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));

    conversationId = data?.ConversationID ?? null;
    originatorConversationId = data?.OriginatorConversationID ?? null;
    responseCode = data?.ResponseCode != null ? String(data.ResponseCode) : null;
    responseDescription = data?.ResponseDescription ?? null;

    if (!resp.ok || responseCode !== "0") {
      status = "failed";
      console.warn("[mpesa-b2b-payout] Daraja rejected:", resp.status, data);
    }
  } catch (e) {
    status = "failed";
    responseDescription = (e as Error)?.message || "B2B request failed";
    console.error("[mpesa-b2b-payout]", e);
  }

  // Persist the attempt (best-effort)
  try {
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await sb.from("mpesa_b2b_payouts").insert({
        amount: Math.round(amount),
        from_shortcode: fromShortcode,
        to_shortcode: toShortcode,
        account_reference: accountReference,
        remarks,
        source_payment_id: sourcePaymentId,
        conversation_id: conversationId,
        originator_conversation_id: originatorConversationId,
        response_code: responseCode,
        response_description: responseDescription,
        status,
      });
    }
  } catch (e) {
    console.warn("[mpesa-b2b-payout] persist failed:", (e as Error)?.message);
  }

  if (status === "failed") {
    return json(502, { ok: false, responseCode, responseDescription });
  }
  return json(200, {
    ok: true,
    conversationId,
    originatorConversationId,
    responseCode,
    responseDescription,
  });
});
