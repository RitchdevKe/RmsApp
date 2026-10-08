// supabase/functions/mpesa-c2b-register-urls/index.ts
//
// Registers the Validation and Confirmation URLs with Safaricom's C2B API.
// Must be run once per paybill/till (sandbox and live), and again whenever
// the URLs change. Safaricom accepts updates at any time — re-registering
// overwrites the stored URLs for that ShortCode.
//
// Admin-only: the caller must have a valid Supabase JWT and be an admin.
// This endpoint is intentionally manual — we do not auto-register on boot
// because Safaricom has a quota on register calls.

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
    if (!isAdmin) {
      return json(403, { error: "Admin privileges required" }, cors);
    }

    // Derive the two public URLs from our Supabase project.
    const confirmationUrl = Deno.env.get("MPESA_C2B_CONFIRMATION_URL")
      ?? `${SUPABASE_URL}/functions/v1/c2b-confirmation`;
    const validationUrl = Deno.env.get("MPESA_C2B_VALIDATION_URL")
      ?? `${SUPABASE_URL}/functions/v1/c2b-validation`;

    // ResponseType: 'Completed' = if Safaricom cannot reach the validation
    // URL, treat the transaction as accepted. 'Cancelled' = treat as rejected.
    // Default to 'Completed' so revenue is not lost on transient outages.
    const responseType = (Deno.env.get("MPESA_C2B_RESPONSE_TYPE") ?? "Completed") as
      | "Completed"
      | "Cancelled";

    const baseUrl = getMpesaBaseUrl();
    const token = await getOAuthToken(MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, baseUrl);

    const registerPayload = {
      ShortCode: MPESA_SHORTCODE,
      ResponseType: responseType,
      ConfirmationURL: confirmationUrl,
      ValidationURL: validationUrl,
    };

    const registerRes = await fetch(`${baseUrl}/mpesa/c2b/v1/registerurl`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(registerPayload),
      signal: AbortSignal.timeout(15_000),
    });

    const registerBody = await registerRes.json().catch(() => ({}));

    if (!registerRes.ok || String((registerBody as any)?.ResponseCode ?? "") !== "0") {
      console.error("[mpesa-c2b-register-urls] Daraja rejected:", registerRes.status, registerBody);
      return json(502, {
        error: "Daraja rejected the URL registration",
        darajaStatus: registerRes.status,
        darajaResponse: registerBody,
      }, cors);
    }

    return json(200, {
      ok: true,
      confirmationUrl,
      validationUrl,
      responseType,
      daraja: registerBody,
    }, cors);
  } catch (e) {
    console.error("[mpesa-c2b-register-urls] error:", (e as Error)?.message);
    return json(500, { error: "Internal server error" }, cors);
  }
});
