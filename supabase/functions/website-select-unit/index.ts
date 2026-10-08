// supabase/functions/website-select-unit/index.ts
// POST /functions/v1/website-select-unit
// Body: { website_user_id, property_slug, unit_number }
// Reserves the chosen unit on the link record and returns the registration
// amount due (deposit + first month rent). Does NOT actually move the unit
// status — the unit becomes Occupied only when the M-Pesa callback confirms
// the registration payment.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildWebsiteCors, verifyWebsiteAuth } from '../_shared/website-auth.ts';

const slugify = (s: string) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Mirrors utils/tenantPaymentCycle.ts → calculateProratedFirstMonthRent.
// Keep these in sync.
function calculateProratedFirstMonthRent(baseRent: number, anchorDateStr?: string | null): number {
  const rent = Math.max(0, Number(baseRent || 0));
  if (!anchorDateStr || rent <= 0) return rent;
  const joinDate = new Date(anchorDateStr);
  if (Number.isNaN(joinDate.getTime())) return rent;
  const joinDay = joinDate.getDate();
  if (joinDay <= 9) return rent;
  const lastDay = new Date(joinDate.getFullYear(), joinDate.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(0, lastDay - joinDay);
  const prorated = Math.round((rent / 30) * daysLeft);
  return joinDay >= 25 ? prorated + rent : prorated;
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
  const property_slug = slugify(String(body.property_slug || ''));
  const unit_number = String(body.unit_number || '').trim();
  const rent_start_date_in = String(body.rent_start_date || '').trim();
  if (!website_user_id || !property_slug || !unit_number) {
    return new Response(JSON.stringify({ error: 'website_user_id, property_slug and unit_number are required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (rent_start_date_in && !/^\d{4}-\d{2}-\d{2}$/.test(rent_start_date_in)) {
    return new Response(JSON.stringify({ error: 'rent_start_date must be YYYY-MM-DD' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // Find the link.
  const { data: link } = await supabase.from('website_tenant_links').select('*').eq('website_user_id', website_user_id).maybeSingle();
  if (!link) {
    return new Response(JSON.stringify({ error: 'Call /website-signup first' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Look up property + unit.
  const { data: row } = await supabase.schema('app').from('app_state').select('value').eq('key', 'tm_properties_v11').maybeSingle();
  const properties: any[] = Array.isArray(row?.value) ? row.value : [];
  const property = properties.find(p => slugify(p.name) === property_slug || p.id === property_slug);
  if (!property) return new Response(JSON.stringify({ error: 'Property not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });

  const unit = (property.units || []).find((u: any) => String(u.unitNumber || '').toLowerCase() === unit_number.toLowerCase());
  if (!unit) return new Response(JSON.stringify({ error: 'Unit not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  if ((unit.status && unit.status !== 'Available') || unit.tenantId) {
    return new Response(JSON.stringify({ error: 'Unit is no longer available' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const rent = Math.round(Number(unit.rent || 0));
  const deposit = Math.round(Number(unit.deposit || unit.rent || 0));

  // Effective rent start: payload > existing link value > today.
  const rent_start_date = rent_start_date_in
    || (link.rent_start_date ? String(link.rent_start_date) : '')
    || new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10) /* Africa/Nairobi */;

  const first_month_rent = calculateProratedFirstMonthRent(rent, rent_start_date);
  const is_prorated = first_month_rent !== rent;
  const expected_amount = first_month_rent + deposit; // full registration payment

  const { data: updated, error: updErr } = await supabase.from('website_tenant_links').update({
    property_id: property.id,
    unit_number,
    rent_start_date,
    expected_amount,
    status: 'unit_selected',
    updated_at: new Date().toISOString(),
  }).eq('id', link.id).select().single();
  if (updErr) return new Response(JSON.stringify({ error: updErr.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({
    ok: true,
    link: updated,
    pricing: {
      rent,                     // monthly rent on the unit
      first_month_rent,         // prorated (or full) amount due now
      deposit,
      total_due: expected_amount,
      rent_start_date,
      is_prorated,
      currency: 'KES',
    },
    unit_tag: `${slugify(property.name).toUpperCase().slice(0, 6)}/${unit_number}`.slice(0, 12),
  }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
});
