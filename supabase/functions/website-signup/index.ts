// supabase/functions/website-signup/index.ts
// POST /functions/v1/website-signup
// Body: { website_user_id, name, phone, email?, ref_code? }
// Creates (or finds) the website_tenant_links row and returns the linked
// tenant id (created on first call). Idempotent on website_user_id.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildWebsiteCors, verifyWebsiteAuth } from '../_shared/website-auth.ts';

const TENANTS_KEY = 'tm_tenants_v11';

function normPhone(raw: string): string {
  const p = String(raw || '').replace(/\s+/g, '');
  if (p.startsWith('+254')) return p.slice(1);
  if (p.startsWith('254')) return p;
  if (p.startsWith('07') && p.length === 10) return `254${p.slice(1)}`;
  if (p.startsWith('7') && p.length === 9) return `254${p}`;
  return p;
}

Deno.serve(async (req) => {
  const cors = buildWebsiteCors(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const auth = verifyWebsiteAuth(req);
  if (!auth.ok) return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

  let body: any;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }); }

  const website_user_id = String(body.website_user_id || '').trim();
  const name = String(body.name || '').trim();
  const phone = normPhone(String(body.phone || ''));
  const email = String(body.email || '').trim();
  const ref_code = String(body.ref_code || '').trim() || null;
  const rent_start_date = String(body.rent_start_date || '').trim() || null;

  if (!website_user_id || !name || !phone.match(/^2547\d{8}$/)) {
    return new Response(JSON.stringify({ error: 'website_user_id, name and a valid 2547XXXXXXXX phone are required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (rent_start_date && !/^\d{4}-\d{2}-\d{2}$/.test(rent_start_date)) {
    return new Response(JSON.stringify({ error: 'rent_start_date must be YYYY-MM-DD' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // Idempotent: return existing link if we've seen this website_user_id.
  const { data: existing } = await supabase
    .from('website_tenant_links').select('*').eq('website_user_id', website_user_id).maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ ok: true, link: existing, created: false }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Create a pending tenant in the app_state blob so the RMS UI sees it.
  const { data: row } = await supabase.schema('app').from('app_state').select('value').eq('key', TENANTS_KEY).maybeSingle();
  const tenants: any[] = Array.isArray(row?.value) ? row.value : [];

  const tenantId = `tenant-web-${Date.now()}-${website_user_id.slice(0, 8)}`;
  const newTenant = {
    id: tenantId,
    name,
    phone,
    email,
    status: 'PendingWebsite',
    source: 'Website',
    referralCode: ref_code || '',
    websiteUserId: website_user_id,
    rentStartDate: rent_start_date || '',
    createdAt: new Date().toISOString(),
    leases: [],
  };

  const { error: writeErr } = await supabase.schema('app').from('app_state')
    .upsert({ key: TENANTS_KEY, value: [newTenant, ...tenants] });
  if (writeErr) {
    return new Response(JSON.stringify({ error: writeErr.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { data: link, error: linkErr } = await supabase.from('website_tenant_links').insert({
    website_user_id, tenant_id: tenantId, ref_code, phone, email, name,
    rent_start_date, status: 'pending',
  }).select().single();
  if (linkErr) {
    return new Response(JSON.stringify({ error: linkErr.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ ok: true, link, created: true }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
});
