// supabase/functions/website-direct-stk-push/index.ts
// POST /functions/v1/website-direct-stk-push
//
// Simple, standalone STK Push endpoint exposed to the marketing website so the
// site can initiate a payment without going through the full RMS onboarding
// (signup → select unit → STK). The actual payment is still completed inside
// the RMS via the existing mpesa-callback fan-out.
//
// Auth: shared secret WEBSITE_SYNC_SECRET. Accepts EITHER
//       `Authorization: Bearer <secret>` OR `X-Webhook-Signature: <secret>`
//       so the website team can use whichever pattern is easier on their side.
//
// Body:
//   {
//     "phone":             "0712345678",      // 07.., 2547.., or +2547..
//     "amount":            1500,              // KES, >= 1, <= 150000
//     "accountReference":  "TASKME-WEB",      // optional, ≤12 chars
//     "transactionDesc":   "Subscription",    // optional
//     "website_user_id":   "uuid"             // optional, tags the payment row
//   }
//
// Response: 200 { ok: true, CheckoutRequestID, checkoutRequestId }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function buildCors(origin: string | null): Record<string, string> {
  const raw = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? 'https://www.task-me.ke,https://task-me.ke').trim();
  const wildcard = raw === '*';
  const list = wildcard ? [] : raw.split(',').map(s => s.trim()).filter(Boolean);
  const ao = wildcard ? '*' : (origin && list.includes(origin) ? origin : list[0] ?? '');
  return {
    'Access-Control-Allow-Origin': ao,
    'Access-Control-Allow-Headers': 'authorization, content-type, x-webhook-signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...(ao && ao !== '*' ? { Vary: 'Origin' } : {}),
  };
}

function verifyAuth(req: Request): { ok: true } | { ok: false; error: string } {
  const expected = Deno.env.get('WEBSITE_SYNC_SECRET');
  if (!expected) {
    console.warn('[website-direct-stk-push] WEBSITE_SYNC_SECRET not set — auth check skipped');
    return { ok: true };
  }
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const sig = req.headers.get('x-webhook-signature')?.trim();
  if (bearer === expected || sig === expected) return { ok: true };
  return { ok: false, error: 'Unauthorized' };
}

function normPhone(raw: string): string | null {
  const p = String(raw || '').replace(/\s+/g, '');
  if (p.startsWith('+254')) return p.slice(1).match(/^2547\d{8}$/) ? p.slice(1) : null;
  if (p.startsWith('254')) return p.match(/^2547\d{8}$/) ? p : null;
  if (p.startsWith('07') && p.length === 10) return `254${p.slice(1)}`;
  if (p.startsWith('7') && p.length === 9) return `254${p}`;
  return null;
}

function json(status: number, body: unknown, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const cors = buildCors(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' }, cors);

  const auth = verifyAuth(req);
  if (!auth.ok) return json(401, { error: auth.error }, cors);

  let body: any;
  try { body = await req.json(); }
  catch { return json(400, { error: 'Invalid JSON body' }, cors); }

  const phone = normPhone(String(body?.phone || ''));
  const amount = Math.round(Number(body?.amount || 0));
  const accountReference = body?.accountReference ? String(body.accountReference).trim().toUpperCase().slice(0, 12) : null;
  const website_user_id = body?.website_user_id ? String(body.website_user_id).trim() : null;

  if (!phone) return json(400, { error: 'Invalid phone. Use 07XXXXXXXX, 2547XXXXXXXX or +2547XXXXXXXX' }, cors);
  if (!Number.isFinite(amount) || amount < 1) return json(400, { error: 'amount must be a positive integer (KES)' }, cors);
  if (amount > 150_000) return json(400, { error: 'amount exceeds M-Pesa per-transaction maximum of KES 150,000' }, cors);

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json(500, { error: 'Server misconfigured: missing Supabase env vars' }, cors);
  }

  // Delegate to the existing mpesa-stk-push function. It validates the bearer
  // (service-role key works) and inserts the pending payments row.
  const stkRes = await fetch(`${SUPABASE_URL}/functions/v1/mpesa-stk-push`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      phone,
      amount,
      leaseId: null,
      unitTag: accountReference,
    }),
  });
  const stkBody = await stkRes.json().catch(() => ({} as any));
  if (!stkRes.ok) {
    console.error('[website-direct-stk-push] mpesa-stk-push failed', stkRes.status, stkBody);
    return json(stkRes.status, { error: stkBody?.error || 'STK push failed' }, cors);
  }

  const checkoutRequestId = String(stkBody?.checkoutRequestId || '');
  if (!checkoutRequestId) {
    return json(502, { error: 'STK push initiated but missing CheckoutRequestID' }, cors);
  }

  // Tag the pending payments row so the M-Pesa callback can fan out / reconcile.
  if (website_user_id) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from('payments').update({
      purpose: 'website',
      website_user_id,
    }).eq('checkout_request_id', checkoutRequestId);
  }

  return json(200, {
    ok: true,
    CheckoutRequestID: checkoutRequestId,
    checkoutRequestId,
  }, cors);
});
