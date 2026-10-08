// supabase/functions/mpesa-verify-transaction/index.ts
//
// Verify a single M-Pesa transaction code with Safaricom.
//
// Used by Payments → Reconciliation → "Verify with Safaricom" when a payment
// was made to the paybill but never reached the system (missed C2B callback).
//
// Flow:
//   1. Look the code up in public.payments (already recorded → return it).
//   2. Otherwise call Safaricom's Pull Transactions API over a rolling window
//      (default 7 days, max 30 days, queried in 7-day chunks) and search for
//      the code.
//   3. If Safaricom returns it, insert it idempotently via record_c2b_payment
//      and return the resulting payment row so the operator can attach it to a
//      tenant from the UI.
//
// Admin-only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function getMpesaBaseUrl(): string {
  const explicit = Deno.env.get("MPESA_BASE_URL");
  if (explicit) return explicit;
  return Deno.env.get("MPESA_ENV") === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

async function getOAuthToken(key: string, secret: string, baseUrl: string): Promise<string> {
  const basic = btoa(`${key}:${secret}`);
  const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: "GET",
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OAuth token request failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error("OAuth response missing access_token");
  return data.access_token;
}

/** `YYYY-MM-DD HH:mm:ss` in Africa/Nairobi — Safaricom's expected format. */
function darajaTimestamp(d: Date): string {
  const eat = new Date(d.getTime() + 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${eat.getUTCFullYear()}-${p(eat.getUTCMonth() + 1)}-${p(eat.getUTCDate())} ${p(eat.getUTCHours())}:${p(eat.getUTCMinutes())}:${p(eat.getUTCSeconds())}`;
}

function pick<T>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k] as T;
  }
  return undefined;
}

async function pullWindow(
  baseUrl: string,
  token: string,
  shortCode: string,
  start: Date,
  end: Date,
): Promise<{ ok: boolean; list: Record<string, unknown>[]; body: unknown; status: number }> {
  const res = await fetch(`${baseUrl}/pulltransactions/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      ShortCode: shortCode,
      StartDate: darajaTimestamp(start),
      EndDate: darajaTimestamp(end),
      OffSetValue: "0",
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  const raw = (body.Response ?? body.response ?? body.Transactions ?? body.transactions ?? []) as unknown;
  return {
    ok: res.ok,
    status: res.status,
    body,
    list: Array.isArray(raw) ? raw as Record<string, unknown>[] : [],
  };
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
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
    } = Deno.env.toObject();

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Supabase env vars missing" }, cors);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "Authentication required" }, cors);
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(authHeader.slice(7));
    if (authErr || !caller) return json(401, { error: "Invalid or expired token" }, cors);
    const { data: isAdmin } = await supabase.rpc("is_admin", { p_user: caller.id });
    if (!isAdmin) return json(403, { error: "Admin privileges required" }, cors);

    const body = (await req.json().catch(() => ({}))) as { code?: string; daysBack?: number };
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{6,20}$/.test(code)) {
      return json(400, { error: "Enter a valid M-Pesa transaction code (e.g. SGH4XYZ12A)" }, cors);
    }
    const daysBack = Math.min(Math.max(Number(body.daysBack ?? 7), 1), 30);

    // ── 1. Already in our ledger? ──────────────────────────────────────────
    const { data: existing } = await supabase
      .from("payments")
      .select("id,created_at,source,amount,transaction_id,bill_ref_number,msisdn,phone,first_name,middle_name,last_name,result_desc,matched_tenant_id,status")
      .eq("transaction_id", code)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return json(200, { found: true, origin: "ledger", payment: existing }, cors);
    }

    // ── 2. Ask Safaricom ───────────────────────────────────────────────────
    if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET || !MPESA_SHORTCODE) {
      return json(500, { error: "M-Pesa credentials missing" }, cors);
    }

    const baseUrl = getMpesaBaseUrl();
    const token = await getOAuthToken(MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, baseUrl);

    const now = new Date();
    let scanned = 0;
    let match: Record<string, unknown> | null = null;

    for (let offsetDays = 0; offsetDays < daysBack && !match; offsetDays += 7) {
      const end = new Date(now.getTime() - offsetDays * 24 * 60 * 60 * 1000);
      const chunk = Math.min(7, daysBack - offsetDays);
      const start = new Date(end.getTime() - chunk * 24 * 60 * 60 * 1000);

      const pulled = await pullWindow(baseUrl, token, MPESA_SHORTCODE, start, end);
      if (!pulled.ok) {
        return json(502, {
          error: "Daraja pull failed",
          darajaStatus: pulled.status,
          darajaResponse: pulled.body,
          hint: "Ensure Pull Transactions is activated for this paybill (Safaricom onboarding).",
        }, cors);
      }
      scanned += pulled.list.length;
      match = pulled.list.find((r) => {
        const id = String(pick<string>(r, "transactionId", "trxID", "TransID", "receiptNo") ?? "")
          .trim().toUpperCase();
        return id === code;
      }) ?? null;
    }

    if (!match) {
      return json(200, {
        found: false,
        scanned,
        daysBack,
        hint: "Safaricom did not return this code in the searched window. Widen the window or confirm the code.",
      }, cors);
    }

    // ── 3. Record it idempotently, then return the stored row ──────────────
    const amount = Number(pick<string | number>(match, "amount", "transamount", "TransAmount") ?? 0);
    const billRef = String(pick<string>(match, "billreference", "BillRefNumber", "billReference") ?? "").trim();
    const msisdn = String(pick<string>(match, "msisdn", "sender", "MSISDN") ?? "").trim() || null;
    const firstName = String(pick<string>(match, "firstName", "FirstName") ?? "").trim() || null;
    const lastName = String(pick<string>(match, "lastName", "LastName") ?? "").trim() || null;
    const shortcode = String(pick<string>(match, "shortCode", "shortcode", "BusinessShortCode") ?? "").trim() || null;
    const transTime = String(pick<string>(match, "transactionTime", "transtime", "TransTime") ?? "").trim() || null;

    const { error: recErr } = await supabase.rpc("record_c2b_payment", {
      p_transaction_id: code,
      p_amount: amount,
      p_msisdn: msisdn,
      p_bill_ref: billRef,
      p_business_short_code: shortcode,
      p_first_name: firstName,
      p_middle_name: null,
      p_last_name: lastName,
      p_org_balance: null,
      p_raw: match,
      p_trans_time: transTime,
    });
    if (recErr) {
      return json(500, { error: `Verified with Safaricom but could not record: ${recErr.message}` }, cors);
    }

    const { data: stored } = await supabase
      .from("payments")
      .select("id,created_at,source,amount,transaction_id,bill_ref_number,msisdn,phone,first_name,middle_name,last_name,result_desc,matched_tenant_id,status")
      .eq("transaction_id", code)
      .limit(1)
      .maybeSingle();

    return json(200, { found: true, origin: "safaricom", scanned, payment: stored }, cors);
  } catch (e) {
    console.error("[mpesa-verify-transaction] error:", (e as Error)?.message);
    return json(500, { error: (e as Error)?.message ?? "Internal server error" }, cors);
  }
});
