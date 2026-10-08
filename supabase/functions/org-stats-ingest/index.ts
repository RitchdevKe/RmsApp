// supabase/functions/org-stats-ingest/index.ts
// PUBLIC endpoint. Managed organizations POST live metrics here so the
// Integral platform hub reflects their landlords / tenants / collections.
//
// Auth: HMAC. Caller sends:
//   x-org-id:   <org uuid>
//   x-signature: hex(hmac_sha256(ingest_secret, raw_body))
//
// Body:
// {
//   "landlords": 12, "tenants": 88, "properties": 7, "units": 96,
//   "active_leases": 80, "mtd_collected": 1234567, "all_time_collected": 9876543,
//   "source": "task-me-realty", "extra": { ... optional ... }
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-org-id, x-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const orgId = req.headers.get("x-org-id");
  const signature = req.headers.get("x-signature");
  if (!orgId || !signature) return json(400, { error: "Missing x-org-id or x-signature" });

  const raw = await req.text();
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .select("id, ingest_secret, status")
    .eq("id", orgId)
    .maybeSingle();
  if (orgErr || !org) return json(404, { error: "Org not found" });
  if (!org.ingest_secret) return json(400, { error: "Org has no ingest secret configured" });
  if (org.status === "suspended" || org.status === "archived") return json(403, { error: "Org not active" });

  const expected = await hmacHex(org.ingest_secret, raw);
  if (!safeEq(expected, signature.toLowerCase())) return json(401, { error: "Invalid signature" });

  let body: any = {};
  try { body = JSON.parse(raw || "{}"); } catch { return json(400, { error: "Invalid JSON" }); }

  const num = (k: string) => {
    const v = Number(body[k]);
    return Number.isFinite(v) ? v : 0;
  };

  const row = {
    org_id: orgId,
    landlords: num("landlords"),
    tenants: num("tenants"),
    properties: num("properties"),
    units: num("units"),
    active_leases: num("active_leases"),
    mtd_collected: num("mtd_collected"),
    all_time_collected: num("all_time_collected"),
    source: typeof body.source === "string" ? body.source.slice(0, 64) : null,
    payload: body.extra && typeof body.extra === "object" ? body.extra : {},
  };

  const { error: insErr } = await admin.from("org_external_stats").insert(row);
  if (insErr) return json(500, { error: insErr.message });

  return json(200, { ok: true, recorded_at: new Date().toISOString() });
});
