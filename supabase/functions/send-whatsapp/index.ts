/**
 * send-whatsapp — WhatsApp Cloud API (Meta) Edge Function
 *
 * Required env vars:
 *   WHATSAPP_API_KEY          → Permanent system user access token from Meta
 *   WHATSAPP_PHONE_NUMBER_ID  → Phone Number ID from Meta Developer Console
 *
 * Setup steps:
 *   1. Create a Meta Developer account at developers.facebook.com
 *   2. Create a WhatsApp Business app
 *   3. Add a phone number and get the Phone Number ID
 *   4. Generate a permanent access token (System User token)
 *   5. Set the env vars in Supabase Dashboard → Edge Functions → Secrets
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

// CORS: set CORS_ALLOWED_ORIGINS env var to restrict origins (comma-separated).
// Leave unset (or '*') to allow all origins — lock this down in production.
const _CORS_RAW = Deno.env.get("CORS_ALLOWED_ORIGINS") ?? "*";
const _CORS_WILDCARD = _CORS_RAW === "*";
const _CORS_LIST = _CORS_WILDCARD ? [] : _CORS_RAW.split(",").map((s) => s.trim());
function buildCors(origin: string | null): Record<string, string> {
  const ao = _CORS_WILDCARD ? "*" : (origin && _CORS_LIST.includes(origin) ? origin : "");
  return {
    "Access-Control-Allow-Origin": ao,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    ...(ao && ao !== "*" ? { Vary: "Origin" } : {}),
  };
}

const GRAPH_API_VERSION = 'v19.0';

serve(async (req: Request) => {
  const cors = buildCors(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body: { to: string; content: string; type?: 'text' | 'template'; templateName?: string; templateLang?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { to, content, type = 'text' } = body;
  if (!to || !content) {
    return new Response(JSON.stringify({ error: 'Missing required fields: to, content' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { WHATSAPP_API_KEY, WHATSAPP_PHONE_NUMBER_ID } = Deno.env.toObject();

  if (!WHATSAPP_API_KEY || !WHATSAPP_PHONE_NUMBER_ID) {
    console.warn('[send-whatsapp] WHATSAPP_API_KEY or WHATSAPP_PHONE_NUMBER_ID not set — message not delivered.');
    return new Response(JSON.stringify({
      success: false,
      error: 'WhatsApp not configured. Set WHATSAPP_API_KEY and WHATSAPP_PHONE_NUMBER_ID in Supabase secrets.',
      note: 'Get these from Meta Developer Console → WhatsApp → API Setup.',
    }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // Normalize phone number — must be in E.164 format without leading +
  const normalizedTo = to.replace(/^\+/, '').replace(/\s/g, '');

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedTo,
    type: 'text',
    text: {
      preview_url: false,
      body: content,
    },
  };

  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const metaJson = await metaRes.json();

    if (!metaRes.ok) {
      const errMsg = metaJson.error?.message || 'WhatsApp send failed';
      console.error('[send-whatsapp] Meta API error:', errMsg, metaJson);
      return new Response(JSON.stringify({ error: errMsg, detail: metaJson.error }), {
        status: 502,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const msgId = metaJson.messages?.[0]?.id;
    return new Response(JSON.stringify({
      success: true,
      messageId: msgId,
      providerRef: `WA-${msgId}`,
      provider: 'meta-cloud-api',
    }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('[send-whatsapp] Unexpected error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
