// supabase/functions/admin-create-org-user/index.ts
// Super-admin only. Creates (or finds) a user with email+password and adds
// them as a member of the given org with the given role.
//
// Body: { org_id: string, email: string, password: string, role: 'owner'|'admin'|'staff'|'viewer'|'landlord' }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY } = Deno.env.toObject();
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json(401, { error: "Missing bearer token" });

  // Verify caller via their JWT
  const userClient = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json(401, { error: "Invalid session" });

  // Check super-admin
  const admin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  const { data: sa, error: saErr } = await admin
    .from("org_members")
    .select("role, organizations!inner(tier)")
    .eq("user_id", userData.user.id);
  if (saErr) return json(500, { error: saErr.message });
  const isSuper = (sa || []).some(
    (m: any) => m.organizations?.tier === "integral" && ["owner", "admin"].includes(m.role),
  );
  if (!isSuper) return json(403, { error: "Super-admin required" });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }

  const org_id = String(body.org_id || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const role = String(body.role || "admin");

  if (!org_id || !email || !password) return json(400, { error: "org_id, email, password required" });
  if (password.length < 8) return json(400, { error: "Password must be at least 8 characters" });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "Invalid email" });
  if (!["owner", "admin", "staff", "viewer", "landlord", "tenant"].includes(role)) {
    return json(400, { error: "Invalid role" });
  }

  // Find or create user
  let targetUserId: string | null = null;
  let created = false;

  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) {
    // Likely already exists — look it up
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) return json(500, { error: listErr.message });
    const found = list.users.find((u) => (u.email || "").toLowerCase() === email);
    if (!found) return json(500, { error: createErr.message });
    targetUserId = found.id;
    // Update their password so admin's chosen password works
    await admin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
  } else {
    targetUserId = createData.user!.id;
    created = true;
  }

  // Upsert into org_members
  const { error: memErr } = await admin.from("org_members").upsert(
    { org_id, user_id: targetUserId!, role, invited_by: userData.user.id },
    { onConflict: "org_id,user_id" },
  );
  if (memErr) return json(500, { error: memErr.message });

  await admin.from("org_audit_log").insert({
    org_id,
    actor_user_id: userData.user.id,
    action: created ? "user_created_and_added" : "user_added",
    target_type: "org_member",
    target_id: targetUserId,
    metadata: { email, role },
  });

  return json(200, { ok: true, user_id: targetUserId, created });
});
