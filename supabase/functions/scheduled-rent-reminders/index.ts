/**
 * scheduled-rent-reminders — Automated rent SMS dispatcher
 *
 * Triggered by pg_cron (see migration 0078_rent_reminder_cron.sql).
 * Can also be called manually via POST for testing.
 *
 * Logic:
 *   Day 25 (at 16:00 EAT): Upcoming rent reminder  → template id: sms-rent-25th
 *   Day  1 (at 09:00 EAT): Rent due today          → template id: sms-rent-1st
 *   Day  5 (at 09:00 EAT): Last day to pay         → template id: sms-rent-5th
 *   Day  7 (at 09:00 EAT): Arrears & fines notice  → template id: sms-rent-7th
 *
 * Only sends to tenants who have NOT paid rent for the current month.
 * Respects the bulkSmsEnabled flag in system settings.
 *
 * Required env vars (shared with send-sms):
 *   SMS_PROVIDER=onfonmedia
 *   ONFON_ACCESS_KEY, ONFON_API_KEY, ONFON_CLIENT_ID
 *   ONFON_SENDER_ID=TASK-ME  (optional)
 *
 * Supabase env vars (auto-injected):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DAY_TEMPLATE_MAP: Record<number, string> = {
  25: 'sms-rent-25th',
  1:  'sms-rent-1st',
  5:  'sms-rent-5th',
  7:  'sms-rent-7th',
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** Replace {placeholder} tokens in a template string */
function renderTemplate(content: string, vars: Record<string, string>): string {
  return content.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

/** Determine if a tenant has paid rent in the given month (YYYY-MM) */
function hasPaidThisMonth(tenant: any, monthIso: string): boolean {
  const history: any[] = tenant.paymentHistory || [];
  return history.some(
    (p: any) =>
      typeof p.date === 'string' &&
      p.date.startsWith(monthIso) &&
      p.status === 'Paid'
  );
}

/** Send one SMS via the generic send-sms Edge Function (provider-agnostic) */
async function sendSmsViaEdge(
  to: string,
  text: string,
  env: Record<string, string>
): Promise<{ ok: boolean; msgId?: string; error?: string }> {
  const supabaseUrl  = env.SUPABASE_URL;
  const serviceKey   = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set' };
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ to, content: text }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data as any)?.error) {
      return { ok: false, error: (data as any)?.error || `HTTP ${res.status}` };
    }

    const msgId = (data as any)?.messageId || `sms-${Date.now()}`;
    return { ok: true, msgId: String(msgId) };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

async function loadReminderSettings(db: ReturnType<typeof createClient>) {
  const { data, error } = await db
    .from('system_settings')
    .select('bulk_sms_enabled, shortcode, agency_paybill')
    .eq('id', 'singleton')
    .maybeSingle();

  if (error) throw error;

  return {
    bulkSmsEnabled: data?.bulk_sms_enabled ?? false,
    paybill: data?.shortcode || data?.agency_paybill || '',
  };
}

async function loadReminderTemplate(db: ReturnType<typeof createClient>, templateId: string) {
  const { data, error } = await db
    .from('communication_templates')
    .select('id, content, type, enabled')
    .eq('id', templateId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function loadReminderTenants(db: ReturnType<typeof createClient>) {
  const { data, error } = await db
    .from('tenants')
    .select('id, name, unit, phone, status, rent_amount, payment_history, outstanding_fines');

  if (error) throw error;

  return (data ?? []).map((tenant: any) => ({
    id: tenant.id,
    name: tenant.name,
    unit: tenant.unit,
    phone: tenant.phone,
    status: tenant.status,
    rentAmount: Number(tenant.rent_amount ?? 0),
    paymentHistory: Array.isArray(tenant.payment_history) ? tenant.payment_history : [],
    outstandingFines: Array.isArray(tenant.outstanding_fines) ? tenant.outstanding_fines : [],
  }));
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const env = Deno.env.toObject();

  // Allow optional override of day (for manual testing)
  let body: { day?: number } = {};
  try { body = await req.json(); } catch { /* ignore */ }

  // EAT = UTC+3
  const nowUtc = new Date();
  const nowEat = new Date(nowUtc.getTime() + 3 * 60 * 60 * 1000);
  const dayOfMonth: number = body.day ?? nowEat.getUTCDate();
  const monthIso = `${nowEat.getUTCFullYear()}-${String(nowEat.getUTCMonth() + 1).padStart(2, '0')}`;

  const templateId = DAY_TEMPLATE_MAP[dayOfMonth];
  if (!templateId) {
    return json(200, { message: `No reminder scheduled for day ${dayOfMonth}. Skipping.` });
  }

  // Connect to Supabase
  const supabaseUrl  = env.SUPABASE_URL;
  const serviceKey   = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json(500, { error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set' });
  }
  const db = createClient(supabaseUrl, serviceKey);

  const settings = await loadReminderSettings(db);

  const template = await loadReminderTemplate(db, templateId);
  if (!template?.content) {
    return json(500, { error: `Template '${templateId}' not found in communication_templates. Visit Operations > Communications > Templates to seed it.` });
  }

  // Per-template disable switch: skip entirely (no queueing) when admin has turned it off.
  if ((template as any).enabled === false) {
    return json(200, { message: `Template '${templateId}' is disabled. Skipping — no messages queued.` });
  }

  const channel: 'SMS' | 'App' = (template as any).type === 'App' ? 'App' : 'SMS';

  // Bulk-SMS gate only applies when the template is configured for SMS.
  // When disabled, return immediately so nothing is queued; reminders will only fire
  // on subsequent scheduled runs after Bulk SMS is re-enabled.
  if (channel === 'SMS' && !settings.bulkSmsEnabled) {
    return json(200, { message: 'Bulk SMS is disabled in system settings and template is set to SMS. Skipping — no messages queued.' });
  }

  const paybill = settings.paybill;

  const allTenants = await loadReminderTenants(db);

  // Filter: active tenants who haven't paid this month
  const unpaidTenants = allTenants.filter((t: any) => {
    if (!['Active', 'Overdue', 'Notice'].includes(t.status)) return false;
    if (channel === 'SMS' && !t.phone) return false;
    return !hasPaidThisMonth(t, monthIso);
  });

  if (unpaidTenants.length === 0) {
    return json(200, { message: `All tenants have paid for ${monthIso}. No messages sent.` });
  }

  const results: { name: string; phone: string; channel: string; ok: boolean; error?: string }[] = [];
  const nowIso = new Date().toISOString();

  for (const tenant of unpaidTenants) {
    const rentBalance = Number(tenant.rentAmount ?? 0);
    const fines = (tenant.outstandingFines ?? [])
      .filter((f: any) => f.status === 'Pending')
      .reduce((sum: number, f: any) => sum + Number(f.amount ?? 0), 0);
    const totalDue = rentBalance + fines;

    const vars: Record<string, string> = {
      name:         tenant.name || 'Tenant',
      unit:         tenant.unit || '',
      amount:       rentBalance.toLocaleString(),
      rent_balance: rentBalance.toLocaleString(),
      fines:        fines.toLocaleString(),
      total_due:    totalDue.toLocaleString(),
      paybill:      paybill,
      account:      tenant.unit || tenant.id || '',
    };

    const text = renderTemplate(template.content, vars);

    if (channel === 'App') {
      // Insert directly into messages table so the tenant sees it In-App.
      const msgId = `reminder-${templateId}-${tenant.id}-${Date.now()}`;
      const { error: insertErr } = await db.from('messages').insert({
        id: msgId,
        recipient: { name: tenant.name || 'Tenant', contact: tenant.phone || tenant.id },
        content: text,
        channel: 'App',
        status: 'Delivered',
        timestamp: nowIso,
        priority: 'Normal',
        is_incoming: false,
      });
      results.push({
        name: tenant.name,
        phone: tenant.phone || '',
        channel: 'App',
        ok: !insertErr,
        error: insertErr?.message,
      });
    } else {
      const result = await sendSmsViaEdge(tenant.phone, text, env);
      results.push({
        name: tenant.name,
        phone: tenant.phone,
        channel: 'SMS',
        ok: result.ok,
        error: result.error,
      });
    }
  }

  const sent  = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;

  console.log(`[scheduled-rent-reminders] Day ${dayOfMonth} | Template: ${templateId} | Channel: ${channel} | Sent: ${sent} | Failed: ${failed}`);

  return json(200, {
    day: dayOfMonth,
    templateId,
    channel,
    monthIso,
    totalUnpaid: unpaidTenants.length,
    sent,
    failed,
    results,
  });
});
