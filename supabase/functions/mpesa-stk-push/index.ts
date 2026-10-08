// supabase/functions/mpesa-stk-push/index.ts
// Initiates M-Pesa STK Push (Daraja) and inserts pending payment row.
//
// Production hardening:
//   - Explicit MPESA_ENV guard: fails loudly if not set to 'sandbox' or 'production'.
//   - Amount capped at KES 150,000 (Safaricom per-transaction maximum).
//   - Safaricom error details stripped from client responses (logged server-side only).
//   - CORS locked via CORS_ALLOWED_ORIGINS env var (set to your domain in production).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Safaricom per-transaction limit (KES) ──────────────────────────────────────
const MPESA_MAX_AMOUNT = 150_000;
const MPESA_MIN_AMOUNT = 1;

type MpesaConfig = {
  shortcode?: string | number;
  paybill?: string | number;
  passkey?: string;
  consumerKey?: string;
  consumerSecret?: string;
};

type StkPushRequest = {
  phone: string;
  amount: number;
  leaseId?: string | null;
  // unitTag (e.g. "OCK/02") is the preferred AccountReference because the C2B
  // confirmation Safaricom sends back later carries the same tag in BillRefNumber,
  // which is what record_c2b_payment uses to find the tenant.
  unitTag?: string | null;
  // Partial RMS: when present, the STK is initiated against the landlord's
  // own paybill (shortcode + passkey) instead of the platform default.
  mpesaConfig?: MpesaConfig | null;
};

function sanitizeUnitTag(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Safaricom AccountReference: max 12 chars, alphanumeric + limited punctuation.
  const cleaned = String(raw).trim().toUpperCase().slice(0, 12);
  return cleaned || null;
}

// CORS: set CORS_ALLOWED_ORIGINS env var to restrict origins (comma-separated).
// In production, set this to your app domain e.g. "https://app.task-me.ke"
// Leave unset (or '*') only for local sandbox testing.
const _CORS_RAW = Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "*";
const _CORS_WILDCARD = _CORS_RAW === "*";
const _CORS_LIST = _CORS_WILDCARD ? [] : _CORS_RAW.split(",").map((s) => s.trim());
function buildCors(origin: string | null): Record<string, string> {
  const ao = _CORS_WILDCARD ? "*" : (origin && _CORS_LIST.includes(origin) ? origin : "");
  return {
    "Access-Control-Allow-Origin": ao,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    ...(ao && ao !== "*" ? { Vary: "Origin" } : {}),
  };
}

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function formatPhoneTo254(phoneRaw: string): string | null {
  const p = String(phoneRaw ?? "").trim().replace(/\s+/g, "");
  if (!p) return null;
  if (p.startsWith("+")) {
    const noPlus = p.slice(1);
    return noPlus.match(/^2547\d{8}$/) ? noPlus : null;
  }
  if (p.startsWith("254")) {
    return p.match(/^2547\d{8}$/) ? p : null;
  }
  if (p.startsWith("07") && p.length === 10) {
    return `254${p.slice(1)}`;
  }
  if (p.startsWith("7") && p.length === 9) {
    return `254${p}`;
  }
  return null;
}

function timestampNairobi(): string {
  // Daraja expects YYYYMMDDHHmmss in EAT (UTC+3).
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

function getMpesaBaseUrl(): string {
  const explicit = Deno.env.get("MPESA_BASE_URL");
  if (explicit) return explicit;
  const env = Deno.env.get("MPESA_ENV");
  if (env === "production") return "https://api.safaricom.co.ke";
  if (env === "sandbox") return "https://sandbox.safaricom.co.ke";
  // Default to sandbox if env var is missing — log a clear warning.
  console.warn("[mpesa-stk-push] MPESA_ENV is not set. Defaulting to SANDBOX. Set MPESA_ENV=production for live payments.");
  return "https://sandbox.safaricom.co.ke";
}

async function getOAuthToken(consumerKey: string, consumerSecret: string, baseUrl: string): Promise<string> {
  const basic = btoa(`${consumerKey}:${consumerSecret}`);
  const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: "GET",
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(10_000), // 10 s timeout
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OAuth token request failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error("OAuth response missing access_token");
  return data.access_token;
}

Deno.serve(async (req) => {
  const cors = buildCors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, cors);

  try {
    const {
      MPESA_CONSUMER_KEY,
      MPESA_CONSUMER_SECRET,
      MPESA_SHORTCODE,
      MPESA_PASSKEY,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    } = Deno.env.toObject();

    if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET || !MPESA_SHORTCODE || !MPESA_PASSKEY) {
      return json(500, { error: "Unable to trigger STK push due to missing Mpesa Api key" }, cors);
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Supabase env vars missing" }, cors);
    }

    // Verify caller identity — userId always comes from the verified JWT, never from request body.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "Authentication required" }, cors);
    }
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user: callerUser }, error: authErr } = await supabaseAuth.auth.getUser(
      authHeader.slice(7),
    );
    if (authErr || !callerUser) {
      return json(401, { error: "Invalid or expired token" }, cors);
    }
    const userId = callerUser.id;

    const body = (await req.json().catch(() => null)) as StkPushRequest | null;
    if (!body) return json(400, { error: "Invalid JSON body" }, cors);

    const phone = formatPhoneTo254(body.phone);
    const leaseId = body.leaseId ?? null;
    const unitTag = sanitizeUnitTag(body.unitTag);
    const amount = Math.round(Number(body.amount ?? 0));

    if (!phone) {
      return json(400, { error: "Invalid phone number. Use 07XXXXXXXX, 2547XXXXXXXX or +2547XXXXXXXX" }, cors);
    }
    if (!Number.isFinite(amount) || amount < MPESA_MIN_AMOUNT) {
      return json(400, { error: `Amount must be at least KES ${MPESA_MIN_AMOUNT}` }, cors);
    }
    if (amount > MPESA_MAX_AMOUNT) {
      return json(400, { error: `Amount exceeds the per-transaction maximum of KES ${MPESA_MAX_AMOUNT.toLocaleString()}` }, cors);
    }

    // Partial RMS override: if the caller provided a landlord mpesaConfig with
    // its own shortcode + passkey, prompt against THAT paybill so the tenant is
    // only asked to pay the landlord. Fall back to the platform defaults.
    const cfg = body.mpesaConfig ?? null;
    const landlordShortcode = cfg?.shortcode ?? cfg?.paybill ?? null;
    const shortcode = landlordShortcode ? String(landlordShortcode).trim() : String(MPESA_SHORTCODE);
    const passkey = (cfg?.passkey && String(cfg.passkey).trim()) || String(MPESA_PASSKEY);
    const consumerKey = (cfg?.consumerKey && String(cfg.consumerKey).trim()) || String(MPESA_CONSUMER_KEY);
    const consumerSecret = (cfg?.consumerSecret && String(cfg.consumerSecret).trim()) || String(MPESA_CONSUMER_SECRET);

    const baseUrl = getMpesaBaseUrl();
    const timestamp = timestampNairobi();
    const password = btoa(`${shortcode}${passkey}${timestamp}`);
    const token = await getOAuthToken(consumerKey, consumerSecret, baseUrl);

    const stkPayload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: `${SUPABASE_URL}/functions/v1/mpesa-callback`,
      // Prefer the unit tag so the C2B confirmation (when Safaricom relays the
      // transaction as a paybill) lands with the same BillRefNumber and can be
      // matched back to this tenant's unit by record_c2b_payment.
      AccountReference: unitTag ?? leaseId ?? userId,
      TransactionDesc: "TaskMe Rent Payment",
    };

    const stkRes = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(stkPayload),
      signal: AbortSignal.timeout(15_000), // 15 s timeout
    });

    const stkJson = await stkRes.json().catch(() => ({} as any)) as any;

    if (!stkRes.ok) {
      // Log full details server-side; send a clean message to the client.
      console.error(`[mpesa-stk-push] Safaricom STK error (${stkRes.status}):`, JSON.stringify(stkJson));
      const userMessage = stkJson?.errorMessage ?? stkJson?.CustomerMessage ?? "STK push request failed. Please try again.";
      return json(502, { error: userMessage }, cors);
    }

    const checkoutRequestId = String(stkJson.CheckoutRequestID ?? "").trim();
    if (!checkoutRequestId) {
      console.error("[mpesa-stk-push] Missing CheckoutRequestID in response:", JSON.stringify(stkJson));
      return json(502, { error: "Payment could not be initiated. Please try again." }, cors);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: insertErr } = await supabase
      .from("payments")
      .insert({
        user_id: userId,
        lease_id: leaseId,
        amount,
        phone,
        msisdn: phone,
        checkout_request_id: checkoutRequestId,
        transaction_id: null,
        status: "pending",
        result_code: null,
        result_desc: null,
        // Store the account reference we just sent so the C2B confirmation
        // arriving later can be paired with this STK row.
        bill_ref_number: unitTag,
      });

    if (insertErr) {
      console.error("[mpesa-stk-push] DB insert error:", insertErr.message);
      return json(500, { error: "Payment initiated but record could not be saved. Contact support." }, cors);
    }

    return json(200, { checkoutRequestId }, cors);
  } catch (e) {
    const msg = (e as Error)?.message ?? "Unknown error";
    console.error("[mpesa-stk-push] Unhandled error:", msg);
    // Timeout errors have a specific message
    if (msg.includes("timed out") || msg.includes("AbortError")) {
      return json(504, { error: "M-Pesa API is taking too long. Please try again in a moment." }, cors);
    }
    return json(500, { error: "An unexpected error occurred. Please try again." }, cors);
  }
});
