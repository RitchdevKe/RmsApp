// supabase/functions/fundi-job-submit/index.ts
// Public endpoint for website job requests into Fundi Hub.
// Persists to app.app_state key "tm_fundi_jobs_v11" so the CMS "MyFundiHub" shows real data.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type FundiJobSubmitRequest = {
  fundiId: string;
  fundiName: string;
  clientName: string;
  clientPhone: string;
  location: string;
  description: string;
  amount?: number;
};

// CORS: set CORS_ALLOWED_ORIGINS env var to restrict origins (comma-separated).
// Leave unset (or '*') to allow all origins — lock this down in production.
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

function safeText(v: unknown, max = 5000): string {
  return String(v ?? "").trim().slice(0, max);
}

Deno.serve(async (req) => {
  const cors = buildCors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" }, cors);

  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(500, { error: "Supabase env vars missing" }, cors);
    }

    const body = (await req.json().catch(() => null)) as FundiJobSubmitRequest | null;
    if (!body) return json(400, { error: "Invalid JSON body" }, cors);

    const fundiId = safeText(body.fundiId, 120);
    const fundiName = safeText(body.fundiName, 200);
    const clientName = safeText(body.clientName, 200);
    const clientPhone = safeText(body.clientPhone, 50);
    const location = safeText(body.location, 200);
    const description = safeText(body.description, 2000);
    const amount = body.amount === undefined ? undefined : Number(body.amount);

    if (!fundiId) return json(400, { error: "fundiId is required" }, cors);
    if (!fundiName) return json(400, { error: "fundiName is required" }, cors);
    if (!clientName) return json(400, { error: "clientName is required" }, cors);
    if (!clientPhone) return json(400, { error: "clientPhone is required" }, cors);
    if (!location) return json(400, { error: "location is required" }, cors);
    if (!description) return json(400, { error: "description is required" }, cors);
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
      return json(400, { error: "amount must be a positive number" }, cors);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load existing list
    const { data: stateRow, error: readErr } = await supabase
      .schema("app")
      .from("app_state")
      .select("value")
      .eq("key", "tm_fundi_jobs_v11")
      .maybeSingle();

    if (readErr) return json(500, { error: "Failed to load fundi jobs state", details: readErr.message }, cors);

    const existing = (stateRow?.value ?? []) as any[];
    const nowIso = new Date().toISOString().split("T")[0];

    const newJob = {
      id: `web-job-${Date.now()}`,
      fundiId,
      fundiName,
      clientName,
      clientPhone,
      location,
      description,
      status: "Pending",
      date: nowIso,
      amount: amount ?? undefined,
      source: "Website",
    };

    const next = [newJob, ...(Array.isArray(existing) ? existing : [])];

    const { error: upsertErr } = await supabase
      .schema("app")
      .from("app_state")
      .upsert({ key: "tm_fundi_jobs_v11", value: next });

    if (upsertErr) return json(500, { error: "Failed to persist fundi job", details: upsertErr.message }, cors);

    return json(200, { ok: true, id: newJob.id }, cors);
  } catch (e) {
    return json(500, { error: (e as Error)?.message ?? "Unknown error" }, cors);
  }
});
