/**
 * send-sms — OnfonMedia SMS Edge Function
 *
 * Required env vars:
 *   SMS_PROVIDER=onfonmedia
 *   ONFON_ACCESS_KEY=<your-access-key>
 *   ONFON_API_KEY=<your-api-key>
 *   ONFON_CLIENT_ID=<your-client-id>
 *   ONFON_SENDER_ID=TASK-ME             (optional, defaults to TASK-ME)
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    ...(ao && ao !== "*" ? { Vary: "Origin" } : {}),
  };
}

/**
 * Normalise a phone number to E.164.
 * Handles common Kenyan formats:
 *   07XXXXXXXX   → +2547XXXXXXXX
 *   2547XXXXXXXX → +2547XXXXXXXX
 *   +2547XXXXXXXX → unchanged
 *   01XXXXXXXX   → +25401XXXXXXXX  (Safaricom/Airtel landlines)
 * Returns null if the number cannot be normalised.
 */
function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[\s\-().]/g, '');
  if (/^\+\d{7,15}$/.test(digits)) return digits;
  if (/^254\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  if (/^[71]\d{8}$/.test(digits)) return `+254${digits}`;
  if (/^\d{7,15}$/.test(digits)) return `+${digits}`;
  return null;
}

function parseMaybeJson(raw: string): any | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function summarisePayload(payload: unknown): string {
  try {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return text.length > 500 ? `${text.slice(0, 497)}...` : text;
  } catch {
    return String(payload);
  }
}

function extractOnfonMessageId(payload: any): string | null {
  const candidates = [
    payload?.MessageId,
    payload?.messageId,
    payload?.Data?.[0]?.MessageId,
    payload?.Data?.[0]?.messageId,
    payload?.data?.[0]?.MessageId,
    payload?.data?.[0]?.messageId,
  ];

  for (const candidate of candidates) {
    const value = typeof candidate === 'string' || typeof candidate === 'number'
      ? String(candidate).trim()
      : '';
    if (value) return value;
  }

  return null;
}

function extractOnfonError(payload: any): string | null {
  const candidates = [
    payload?.ErrorMessage,
    payload?.errorMessage,
    payload?.error,
    payload?.message,
    payload?.Message,
    payload?.StatusDescription,
    payload?.statusDescription,
    payload?.Data?.[0]?.MessageErrorDescription,
    payload?.Data?.[0]?.messageErrorDescription,
    payload?.Data?.[0]?.ErrorMessage,
    payload?.Data?.[0]?.errorMessage,
    payload?.Data?.[0]?.Message,
    payload?.Data?.[0]?.StatusDescription,
    payload?.data?.[0]?.MessageErrorDescription,
    payload?.data?.[0]?.messageErrorDescription,
    payload?.data?.[0]?.ErrorMessage,
    payload?.data?.[0]?.errorMessage,
    payload?.data?.[0]?.Message,
    payload?.data?.[0]?.StatusDescription,
  ];

  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate.trim() : '';
    if (value && value.toLowerCase() !== 'null') return value;
  }

  return null;
}

function isLikelyOnfonFailure(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.Success === false || payload.success === false) return true;
  if (payload.IsError === true || payload.isError === true) return true;
  if (typeof payload?.ErrorCode === 'number' && payload.ErrorCode !== 0) return true;
  if (typeof payload?.errorCode === 'number' && payload.errorCode !== 0) return true;

  const messageErrorCodes = [
    payload?.Data?.[0]?.MessageErrorCode,
    payload?.Data?.[0]?.messageErrorCode,
    payload?.data?.[0]?.MessageErrorCode,
    payload?.data?.[0]?.messageErrorCode,
  ];

  if (messageErrorCodes.some((value) => Number.isFinite(Number(value)) && Number(value) !== 0)) {
    return true;
  }

  return false;
}

serve(async (req: Request) => {
  const cors = buildCors(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body: { to: string; content: string; senderId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { to: rawTo, content, senderId } = body;
  if (!rawTo || !content) {
    return new Response(JSON.stringify({ error: 'Missing required fields: to, content' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const to = normalisePhone(rawTo);
  if (!to) {
    return new Response(JSON.stringify({ error: `Invalid phone number: ${rawTo}` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const env = Deno.env.toObject();
  const provider = (env.SMS_PROVIDER || '').toLowerCase();

  async function logSms(status: string, providerName: string, providerRef: string | null, error: string | null) {
    const supabaseUrl = env.SUPABASE_URL;
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return;
    try {
      const sb = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await sb
        .schema('app')
        .from('sms_logs')
        .insert({
          to_number: to,
          body: content,
          provider: providerName,
          provider_ref: providerRef,
          status,
          error,
        });
    } catch (_) {
      // ignore logging failures
    }
  }

  try {
    if (provider !== 'onfonmedia') {
      const errMsg = provider
        ? `Unsupported SMS_PROVIDER: ${provider}. Only onfonmedia is supported.`
        : 'SMS_PROVIDER is not configured. Set it to onfonmedia.';
      await logSms('failed', provider || 'none', null, errMsg);
      return new Response(JSON.stringify({ error: errMsg }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const accessKey = env.ONFON_ACCESS_KEY;
    const apiKey = env.ONFON_API_KEY;
    const clientId = env.ONFON_CLIENT_ID;
    const senderIdEnv = (env.ONFON_SENDER_ID || '').trim();
    const requestedSenderId = (senderId || '').trim();
    const effectiveSenderId = requestedSenderId || senderIdEnv;

    if (senderIdEnv && requestedSenderId && senderIdEnv !== requestedSenderId) {
      console.warn('[send-sms OnfonMedia] Using client senderId in favor of ONFON_SENDER_ID secret');
    }

    if (!accessKey || !apiKey || !clientId || !effectiveSenderId) {
      const errMsg = 'OnfonMedia env vars not configured (ONFON_ACCESS_KEY, ONFON_API_KEY, ONFON_CLIENT_ID, ONFON_SENDER_ID)';
      await logSms('failed', 'onfonmedia', null, errMsg);
      return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const onfonPayload = {
      SenderId: effectiveSenderId,
      MessageParameters: [{ Number: to, Text: content }],
      ApiKey: apiKey,
      ClientId: clientId,
    };

    const onfonRes = await fetch('https://api.onfonmedia.co.ke/v1/sms/SendBulkSMS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'AccessKey': accessKey,
      },
      body: JSON.stringify(onfonPayload),
    });

    const onfonRaw = await onfonRes.text();
    const onfonJson = parseMaybeJson(onfonRaw);
    const onfonSummary = summarisePayload(onfonJson ?? onfonRaw);
    console.log('[send-sms OnfonMedia] Response:', onfonRes.status, onfonSummary);

    if (!onfonRes.ok) {
      const errMsg = extractOnfonError(onfonJson) || `OnfonMedia HTTP ${onfonRes.status}. Response: ${onfonSummary}`;
      console.error('[send-sms OnfonMedia] Error:', errMsg);
      await logSms('failed', 'onfonmedia', null, errMsg);
      return new Response(JSON.stringify({ error: errMsg }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (isLikelyOnfonFailure(onfonJson)) {
      const errMsg = extractOnfonError(onfonJson) || `OnfonMedia returned a failure response: ${onfonSummary}`;
      console.error('[send-sms OnfonMedia] Failure response:', errMsg);
      await logSms('failed', 'onfonmedia', null, errMsg);
      return new Response(JSON.stringify({ error: errMsg }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const msgId = extractOnfonMessageId(onfonJson);
    if (!msgId) {
      const fallbackMessageId = `onfon-accepted-${Date.now()}`;
      const providerRef = `ONFON-${fallbackMessageId}`;
      const note = `OnfonMedia accepted the request but returned no traceable message ID. Response: ${onfonSummary}`;
      console.warn('[send-sms OnfonMedia] Accepted without message ID:', note);
      await logSms('accepted_unverified', 'onfonmedia', providerRef, note);
      return new Response(JSON.stringify({
        success: true,
        messageId: fallbackMessageId,
        providerRef,
        provider: 'onfonmedia',
        status: 'accepted_unverified',
        note,
      }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const providerRef = `ONFON-${msgId}`;
    await logSms('submitted', 'onfonmedia', providerRef, null);

    return new Response(JSON.stringify({
      success: true,
      messageId: String(msgId),
      providerRef,
      provider: 'onfonmedia',
      status: 'submitted',
    }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    const errMsg = err?.message || 'Internal server error';
    console.error('[send-sms] Unexpected error:', errMsg);
    await logSms('failed', 'onfonmedia', null, errMsg);
    return new Response(JSON.stringify({ error: errMsg }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
