// supabase/functions/_shared/website-auth.ts
// Helpers shared by all website-* edge functions.
// (Each function inlines this snippet because Supabase edge functions
//  don't share modules across invocations cleanly — keep it copy-paste safe.)

/**
 * Build CORS headers that lock down to the website domain(s).
 * Set CORS_ALLOWED_ORIGINS env to override.
 */
export function buildWebsiteCors(origin: string | null): Record<string, string> {
  const raw = (Deno.env.get('CORS_ALLOWED_ORIGINS') ?? 'https://www.task-me.ke,https://task-me.ke').trim();
  const wildcard = raw === '*';
  const list = wildcard ? [] : raw.split(',').map(s => s.trim()).filter(Boolean);
  const ao = wildcard ? '*' : (origin && list.includes(origin) ? origin : list[0] ?? '');
  return {
    'Access-Control-Allow-Origin': ao,
    'Access-Control-Allow-Headers': 'authorization, content-type, x-webhook-signature',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    ...(ao && ao !== '*' ? { Vary: 'Origin' } : {}),
  };
}

/**
 * Reject the request if WEBSITE_SYNC_SECRET is configured and the caller did
 * not send a matching X-Webhook-Signature. If the secret env var is not set,
 * the check is skipped with a warning (matches receive-lead semantics so the
 * site team can start building before the secret is provisioned).
 */
export function verifyWebsiteAuth(req: Request): { ok: true } | { ok: false; error: string } {
  const expected = Deno.env.get('WEBSITE_SYNC_SECRET');
  if (!expected) {
    console.warn('[website-api] WEBSITE_SYNC_SECRET not set — auth check skipped');
    return { ok: true };
  }
  const sig = req.headers.get('x-webhook-signature');
  if (sig !== expected) return { ok: false, error: 'Unauthorized' };
  return { ok: true };
}
