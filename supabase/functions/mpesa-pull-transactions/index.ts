// supabase/functions/mpesa-pull-transactions/index.ts
//
// Safety net for missed C2B confirmation callbacks. Calls Safaricom's
// Pull Transactions API, which returns every C2B transaction seen on the
// paybill/till in a given time window, and inserts any rows we do not
// already have into the payments table.
//
// Triggered manually from the Reconciliation page ("Verify" button).
//
// Notes:
//   * Pull Transactions must be activated by Safaricom for the paybill —
//     this is a separate onboarding step outside Daraja sandbox. In sandbox
//     the endpoint returns a stub; in production it returns real data.
//   * Uses record_c2b_payment for idempotent insert — retrying is safe.
//   * Admin-only.

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
  const env = Deno.env.get("MPESA_ENV");
  if (env === "production") return "https://api.safaricom.co.ke";
  return "https://sandbox.safaricom.co.ke";
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

/** Format a Date as `YYYY-MM-DD HH:mm:ss` in Africa/Nairobi time — Safaricom's expected format. */
function darajaTimestamp(d: Date): string {
  const eat = new Date(d.getTime() + 3 * 60 * 60 * 1000); // UTC+3
  const p = (n: number) => String(n).padStart(2, "0");
  return `${eat.getUTCFullYear()}-${p(eat.getUTCMonth() + 1)}-${p(eat.getUTCDate())} ${p(eat.getUTCHours())}:${p(eat.getUTCMinutes())}:${p(eat.getUTCSeconds())}`;
}

type PullTransaction = {
  transactionId?: string;
  trxID?: string;
  TransID?: string;
  transactionTime?: string;
  transtime?: string;
  amount?: string | number;
  transamount?: string | number;
  msisdn?: string;
  sender?: string;
  billreference?: string;
  BillRefNumber?: string;
  shortCode?: string;
  shortcode?: string;
  receiptNo?: string;
  firstName?: string;
  lastName?: string;
};

function pickField<T>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k] as T;
  }
  return undefined;
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

    if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET || !MPESA_SHORTCODE) {
      return json(500, { error: "M-Pesa credentials missing" }, cors);
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Supabase env vars missing" }, cors);
    }

    // Auth — admin only.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "Authentication required" }, cors);
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(
      authHeader.slice(7),
    );
    if (authErr || !caller) return json(401, { error: "Invalid or expired token" }, cors);

    const { data: isAdmin } = await supabase.rpc("is_admin", { p_user: caller.id });
    if (!isAdmin) return json(403, { error: "Admin privileges required" }, cors);

    // Request body: optional hoursBack (default 48, max 168).
    const reqBody = (await req.json().catch(() => ({}))) as { hoursBack?: number };
    const hoursBack = Math.min(Math.max(Number(reqBody.hoursBack ?? 48), 1), 168);

    const now = new Date();
    const since = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);

    const baseUrl = getMpesaBaseUrl();
    const token = await getOAuthToken(MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, baseUrl);

    const pullPayload = {
      ShortCode: MPESA_SHORTCODE,
      StartDate: darajaTimestamp(since),
      EndDate: darajaTimestamp(now),
      OffSetValue: "0",
    };

    const pullRes = await fetch(`${baseUrl}/pulltransactions/v1/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pullPayload),
      signal: AbortSignal.timeout(30_000),
    });

    const pullBody = await pullRes.json().catch(() => ({})) as Record<string, unknown>;

    if (!pullRes.ok) {
      console.error("[mpesa-pull-transactions] Daraja error:", pullRes.status, pullBody);
      return json(502, {
        error: "Daraja pull failed",
        darajaStatus: pullRes.status,
        darajaResponse: pullBody,
        hint: "Ensure Pull Transactions is activated for this paybill (Safaricom onboarding).",
      }, cors);
    }

    // Safaricom's response shape varies slightly between sandbox and prod.
    // The transactions array sits under different keys in different versions.
    const rawList = (
      (pullBody as any).Response ??
      (pullBody as any).response ??
      (pullBody as any).Transactions ??
      (pullBody as any).transactions ??
      []
    ) as PullTransaction[];

    const list = Array.isArray(rawList) ? rawList : [];
    let inserted = 0;
    let duplicates = 0;
    let matched = 0;
    let unmatched = 0;
    const results: Array<{ transId: string; status: string; matched: boolean }> = [];

    for (const raw of list) {
      const r = raw as unknown as Record<string, unknown>;
      const transId = String(
        pickField<string>(r, "transactionId", "trxID", "TransID", "receiptNo") ?? "",
      ).trim();
      if (!transId) continue;

      const amount = Number(pickField<string | number>(r, "amount", "transamount", "TransAmount") ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const billRef = String(
        pickField<string>(r, "billreference", "BillRefNumber", "billReference") ?? "",
      ).trim();
      const msisdn = String(pickField<string>(r, "msisdn", "sender", "MSISDN") ?? "").trim() || null;
      const firstName = String(pickField<string>(r, "firstName", "FirstName") ?? "").trim() || null;
      const lastName = String(pickField<string>(r, "lastName", "LastName") ?? "").trim() || null;
      const shortcode = String(pickField<string>(r, "shortCode", "shortcode", "BusinessShortCode") ?? "").trim() || null;
      const transTime = String(pickField<string>(r, "transactionTime", "transtime", "TransTime") ?? "").trim() || null;

      const { data: partialRows, error: partialError } = await supabase.rpc("record_partial_rms_c2b_payment", {
        p_transaction_id: transId, p_amount: amount, p_msisdn: msisdn,
        p_bill_ref: billRef, p_first_name: firstName, p_middle_name: null,
        p_last_name: lastName, p_trans_time: transTime,
      });
      if (partialError) console.warn(`[mpesa-pull-transactions] Partial RMS routing failed for ${transId}:`, partialError.message);
      const partialRow = Array.isArray(partialRows) ? partialRows[0] : partialRows;
      const { data, error } = partialRow?.matched_tenant_id
        ? { data: partialRows, error: null }
        : await supabase.rpc("record_c2b_payment", {
            p_transaction_id: transId,
            p_amount: amount,
            p_msisdn: msisdn,
            p_bill_ref: billRef,
            p_business_short_code: shortcode,
            p_first_name: firstName,
            p_middle_name: null,
            p_last_name: lastName,
            p_org_balance: null,
            p_raw: r,
            p_trans_time: transTime,
          });

      if (error) {
        console.warn(`[mpesa-pull-transactions] insert failed for ${transId}:`, error.message);
        continue;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (row?.was_duplicate) {
        duplicates++;
        results.push({ transId, status: "duplicate", matched: !!row?.matched_tenant_id });
      } else {
        inserted++;
        if (row?.matched_tenant_id) {
          matched++;
          results.push({ transId, status: "inserted", matched: true });
        } else {
          unmatched++;
          results.push({ transId, status: "inserted", matched: false });
        }
      }
    }

    return json(200, {
      ok: true,
      windowHours: hoursBack,
      totalReturned: list.length,
      inserted,
      duplicates,
      matched,
      unmatched,
      results,
    }, cors);
  } catch (e) {
    console.error("[mpesa-pull-transactions] error:", (e as Error)?.message);
    return json(500, { error: "Internal server error" }, cors);
  }
});
