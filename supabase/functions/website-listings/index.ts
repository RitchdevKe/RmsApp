// supabase/functions/website-listings/index.ts
// GET /functions/v1/website-listings?type=Rent&bedrooms=2&q=kilimani
// Public feed of PUBLISHED marketplace listings for the website search.
// Includes BOTH managed listings (bedrooms from the linked unit) and
// third-party / marketed-only listings (bedrooms from listing.rentConfig).
// Read-only. Auth via WEBSITE_SYNC_SECRET (X-Webhook-Signature).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildWebsiteCors, verifyWebsiteAuth } from '../_shared/website-auth.ts';

const slugify = (s: string) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Derive a bedroom count from any of the shapes the RMS stores it in. */
function resolveBedrooms(listing: any, unit: any): number | null {
  const fromConfig = listing?.rentConfig?.bedrooms;
  if (fromConfig !== undefined && fromConfig !== null && fromConfig !== '') return Number(fromConfig);
  const fromUnit = unit?.bedrooms;
  if (fromUnit !== undefined && fromUnit !== null && fromUnit !== '') return Number(fromUnit);
  // Last resort: parse "2 Bedroom" / "2BDR" out of the unit type or title.
  const text = `${unit?.unitType || ''} ${listing?.title || ''} ${listing?.description || ''}`;
  if (/studio|single\s*room/i.test(text)) return 0;
  const m = text.match(/(\d+)\s*(?:bed|bdr|br\b)/i);
  return m ? Number(m[1]) : null;
}

function houseTypeLabel(bedrooms: number | null, unit: any): string {
  const explicit = String(unit?.unitType || '').trim();
  if (explicit) return explicit;
  if (bedrooms === null) return '';
  if (bedrooms <= 0) return 'Studio';
  return `${bedrooms} Bedroom`;
}

Deno.serve(async (req) => {
  const cors = buildWebsiteCors(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const auth = verifyWebsiteAuth(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const typeFilter = (url.searchParams.get('type') || '').trim();
  const bedroomsParam = (url.searchParams.get('bedrooms') || '').trim();
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const sourceFilter = (url.searchParams.get('source') || '').trim();

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const [{ data: propertiesJson, error }, { data: normalizedRows, error: normalizedError }] = await Promise.all([
    supabase.schema('app').rpc('load_properties'),
    supabase.from('marketplace_listings').select('payload').eq('status', 'Published'),
  ]);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const listings: any[] = normalizedError ? [] : (normalizedRows || []).map((row: any) => row.payload).filter(Boolean);
  const properties: any[] = Array.isArray(propertiesJson) ? propertiesJson : [];

  const unitFor = (listing: any) => {
    const prop = properties.find(p => p.id === listing.propertyId);
    if (!prop || !Array.isArray(prop.units)) return null;
    return prop.units.find((u: any) =>
      u.id === listing.unitId ||
      String(u.unitNumber || '').toLowerCase() === String(listing.unitNumber || '').toLowerCase()
    ) || null;
  };

  const feed = listings
    .filter(l => String(l?.status || '') === 'Published')
    .map(l => {
      const unit = unitFor(l);
      const bedrooms = resolveBedrooms(l, unit);
      const price = Number(l.price || 0);
      const deposit = Number(l?.rentConfig?.depositAmount ?? unit?.deposit ?? 0);
      return {
        id: l.id,
        title: l.title || '',
        description: l.description || '',
        type: l.type || 'Rent',
        source: l.source || 'Managed',
        propertyName: l.propertyName || '',
        propertySlug: slugify(l.propertyName || ''),
        unitNumber: l.unitNumber || '',
        location: l.location || '',
        zone: l.zone || '',
        pinLocationUrl: l.pinLocationUrl || '',
        price,
        currency: l.currency || 'KES',
        deposit,
        bedrooms,
        bathrooms: l?.rentConfig?.bathrooms ?? null,
        furnished: l?.rentConfig?.furnished ?? null,
        houseType: houseTypeLabel(bedrooms, unit),
        availableFrom: l?.rentConfig?.availableFrom || null,
        images: Array.isArray(l.images) ? l.images : [],
        features: Array.isArray(l.features) ? l.features : [],
        paymentTag: l.paymentTag || null,
        dateCreated: l.dateCreated || null,
      };
    })
    .filter(l => (typeFilter ? l.type === typeFilter : true))
    .filter(l => (sourceFilter ? l.source === sourceFilter : true))
    .filter(l => (bedroomsParam === '' ? true : Number(l.bedrooms) === Number(bedroomsParam)))
    .filter(l => {
      if (!q) return true;
      const hay = `${l.title} ${l.description} ${l.location} ${l.zone} ${l.propertyName} ${l.houseType}`.toLowerCase();
      return hay.includes(q);
    });

  return new Response(JSON.stringify({ count: feed.length, listings: feed }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
