/**
 * receive-lead — Webhook endpoint for your website to POST new leads
 *
 * Usage: Configure your website to POST to this endpoint when a user submits
 * a contact/inquiry form.
 *
 * Endpoint: POST /functions/v1/receive-lead
 *
 * Security: Set RECEIVE_LEAD_SECRET env var in Supabase → Edge Functions → Secrets.
 * Configure the same value in your website's outgoing webhook header:
 *   X-Webhook-Signature: <your-secret>
 * If not set, the check is skipped (not recommended for production).
 *
 * Request body (JSON):
 * {
 *   tenantName: string;      // Required — full name of the lead
 *   contact?: string;        // Phone number
 *   email?: string;          // Email address
 *   interest?: string;       // What they're interested in (e.g. "3-bed in Westlands")
 *   listingTitle?: string;   // Listing they enquired about
 *   source?: string;         // "Website" | "Walk-in" | "Referral" | "Social Media"
 *   notes?: string;          // Additional message from the form
 *   referrerId?: string;     // Optional referral ID
 * }
 *
 * Response:
 * { ok: true, id: string }
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// CORS: set CORS_ALLOWED_ORIGINS env var to restrict origins (comma-separated).
// Leave unset (or '*') to allow all origins — lock this down in production.
const _CORS_RAW = Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "*";
const _CORS_WILDCARD = _CORS_RAW === "*";
const _CORS_LIST = _CORS_WILDCARD ? [] : _CORS_RAW.split(",").map((s) => s.trim());
function buildCors(origin: string | null): Record<string, string> {
  const ao = _CORS_WILDCARD ? "*" : (origin && _CORS_LIST.includes(origin) ? origin : "");
  return {
    "Access-Control-Allow-Origin": ao,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature",
    ...(ao && ao !== "*" ? { Vary: "Origin" } : {}),
  };
}

serve(async (req: Request) => {
  const cors = buildCors(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  // Webhook source validation — reject requests without the correct shared secret.
  const webhookSecret = Deno.env.get('RECEIVE_LEAD_SECRET');
  if (webhookSecret) {
    const sig = req.headers.get('X-Webhook-Signature');
    if (sig !== webhookSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = Deno.env.toObject();
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration: missing Supabase env vars' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const { tenantName, contact, email, interest, listingTitle, source, notes, referrerId } = body;

  if (!tenantName || typeof tenantName !== 'string' || !tenantName.trim()) {
    return new Response(JSON.stringify({ error: 'Missing required field: tenantName' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Load existing leads from app_state
  const { data: stateRow, error: readError } = await supabase
    .schema('app')
    .from('app_state')
    .select('value')
    .eq('key', 'tm_leads_v11')
    .maybeSingle();

  if (readError) {
    console.error('[receive-lead] Failed to read app_state:', readError);
    return new Response(JSON.stringify({ error: 'Failed to read leads state' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const existingLeads: any[] = Array.isArray(stateRow?.value) ? stateRow.value : [];

  const newLead = {
    id: `lead-web-${Date.now()}`,
    tenantName: tenantName.trim(),
    status: 'New',
    assignedAgent: '',
    listingTitle: listingTitle || 'Website Enquiry',
    contact: contact || '',
    email: email || '',
    interest: interest || '',
    date: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().split('T')[0] /* Africa/Nairobi */,
    source: source || 'Website',
    notes: notes || '',
    referrerId: referrerId || '',
  };

  const updatedLeads = [newLead, ...existingLeads];

  const { error: writeError } = await supabase
    .schema('app')
    .from('app_state')
    .upsert({ key: 'tm_leads_v11', value: updatedLeads });

  if (writeError) {
    console.error('[receive-lead] Failed to write lead:', writeError);
    return new Response(JSON.stringify({ error: 'Failed to save lead' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  console.log(`[receive-lead] New lead received: ${newLead.id}`);
  return new Response(JSON.stringify({ ok: true, id: newLead.id }), {
    status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
