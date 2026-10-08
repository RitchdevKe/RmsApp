// supabase/functions/website-tenant-status/index.ts
// GET /functions/v1/website-tenant-status?website_user_id=...
// Polled by the website wizard during/after STK to know when to advance
// to the success screen.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildWebsiteCors, verifyWebsiteAuth } from '../_shared/website-auth.ts';

Deno.serve(async (req) => {
  const cors = buildWebsiteCors(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

  const auth = verifyWebsiteAuth(req);
  if (!auth.ok) return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

  const url = new URL(req.url);
  const website_user_id = (url.searchParams.get('website_user_id') || '').trim();
  if (!website_user_id) {
    return new Response(JSON.stringify({ error: 'website_user_id required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const { data: link } = await supabase.from('website_tenant_links').select('*').eq('website_user_id', website_user_id).maybeSingle();
  if (!link) {
    return new Response(JSON.stringify({ error: 'No link found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Latest payment for this user (if any) — surfaces failure messages to the wizard.
  const { data: pay } = await supabase.from('payments')
    .select('status, amount, transaction_id, result_desc, checkout_request_id, created_at')
    .eq('website_user_id', website_user_id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  return new Response(JSON.stringify({
    ok: true,
    status: link.status,
    expected_amount: link.expected_amount,
    paid_amount: link.paid_amount,
    property_id: link.property_id,
    unit_number: link.unit_number,
    ref_code: link.ref_code,
    last_payment: pay ?? null,
  }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
});
