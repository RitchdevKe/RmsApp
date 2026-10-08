// supabase/functions/website-lookup-property/index.ts
// GET /functions/v1/website-lookup-property?slug=baraka-heights&unit=A1
// Returns available units + pricing for the website to display before unit
// selection. Read-only. Auth via WEBSITE_SYNC_SECRET (X-Webhook-Signature).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildWebsiteCors, verifyWebsiteAuth } from '../_shared/website-auth.ts';

Deno.serve(async (req) => {
  const cors = buildWebsiteCors(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const auth = verifyWebsiteAuth(req);
  if (!auth.ok) return new Response(JSON.stringify({ error: auth.error }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });

  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') || '').trim().toLowerCase();
  const unit = (url.searchParams.get('unit') || '').trim();

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const { data: row, error } = await supabase
    .schema('app').from('app_state')
    .select('value').eq('key', 'tm_properties_v11').maybeSingle();
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const properties: any[] = Array.isArray(row?.value) ? row.value : [];

  const slugify = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  let property = properties.find(p => slugify(p.name) === slug || p.id === slug);
  if (!property) {
    return new Response(JSON.stringify({ error: 'Property not found' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const units = Array.isArray(property.units) ? property.units : [];
  const filtered = unit ? units.filter((u: any) => String(u.unitNumber || '').toLowerCase() === unit.toLowerCase()) : units;
  const publishable = filtered.map((u: any) => ({
    unitNumber: u.unitNumber,
    rent: Number(u.rent || 0),
    deposit: Number(u.deposit || u.rent || 0),
    bedrooms: u.bedrooms ?? null,
    available: (u.status || 'Available') === 'Available' && !u.tenantId,
  }));

  return new Response(JSON.stringify({
    property: {
      id: property.id,
      name: property.name,
      slug: slugify(property.name),
      address: property.address ?? '',
      lateFee: Number(property.lateFee || 0),
      units: publishable,
    },
  }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
});
