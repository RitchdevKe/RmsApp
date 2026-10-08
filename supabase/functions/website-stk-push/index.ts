// supabase/functions/website-stk-push/index.ts
// POST /functions/v1/website-stk-push
// Body: { website_user_id, phone, amount }
//
// Thin wrapper over the existing mpesa-stk-push function so the website
// never needs Daraja credentials. We tag the resulting payments row with
// purpose='registration' + website_user_id so the M-Pesa callback knows to
// flip the link to 'onboarded' and credit the referrer.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildWebsiteCors, verifyWebsiteAuth } from '../_shared/website-auth.ts';

function normPhone(raw: string): string | null {
  const p = String(raw || '').replace(/\s+/g, '');
  if (p.startsWith('+254')) return p.slice(1).match(/^2547\d{8}$/) ? p.slice(1) : null;
  if (p.startsWith('254')) return p.match(/^2547\d{8}$/) ? p : null;
  if (p.startsWith('07') && p.length === 10) return `254${p.slice(1)}`;
  if (p.startsWith('7') && p.length === 9) return `254${p}`;
  return null;
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
  const phone = normPhone(String(body.phone || ''));
  const amount = Math.round(Number(body.amount || 0));
  if (!website_user_id || !phone || !Number.isFinite(amount) || amount < 1) {
    return new Response(JSON.stringify({ error: 'website_user_id, valid phone and amount are required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const { data: link } = await supabase.from('website_tenant_links').select('*').eq('website_user_id', website_user_id).maybeSingle();
  if (!link || !link.unit_number) {
    return new Response(JSON.stringify({ error: 'Select a unit first via /website-select-unit' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (link.status === 'onboarded') {
    return new Response(JSON.stringify({ error: 'Tenant is already onboarded' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (amount < (link.expected_amount || 0)) {
    return new Response(JSON.stringify({ error: `Amount must cover the full registration payment of KES ${link.expected_amount}` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Delegate to the existing mpesa-stk-push function. We call it server-to-server
  // using the service role token as the Authorization header — mpesa-stk-push
  // validates the bearer to derive userId, which we set to the tenant_id so the
  // payment row links to the right RMS tenant.
  const stkRes = await fetch(`${SUPABASE_URL}/functions/v1/mpesa-stk-push`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone, amount,
      leaseId: null,
      unitTag: `${(link.property_id || '').toUpperCase().slice(0, 6)}/${link.unit_number}`.slice(0, 12),
    }),
  });
  const stkBody = await stkRes.json().catch(() => ({}));
  if (!stkRes.ok) {
    return new Response(JSON.stringify({ error: stkBody?.error || 'STK push failed' }), { status: stkRes.status, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const checkoutRequestId = String(stkBody.checkoutRequestId || '');

  // Tag the payment row with purpose + website_user_id so mpesa-callback can fan out.
  if (checkoutRequestId) {
    await supabase.from('payments').update({
      purpose: 'registration',
      website_user_id,
    }).eq('checkout_request_id', checkoutRequestId);

    await supabase.from('website_tenant_links').update({
      status: 'awaiting_payment',
      last_checkout_request_id: checkoutRequestId,
      updated_at: new Date().toISOString(),
    }).eq('id', link.id);
  }

  return new Response(JSON.stringify({ ok: true, checkoutRequestId }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
});
