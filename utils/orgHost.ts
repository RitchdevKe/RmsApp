/**
 * Pure host → subdomain/tier mapping. No DB calls, no React.
 * Used at app boot to decide which shell to render before we've
 * fetched the org row from the database.
 */

import type { Database } from '../src/integrations/supabase/types';

export type OrgTier = Database['public']['Enums']['org_tier'];

export type ShellKind = OrgTier | 'unknown';

/**
 * Map a hostname to the shell kind it should render.
 *
 *   app.task-me.ke           -> agency
 *   integral.task-me.ke      -> integral
 *   pms.task-me.ke           -> partial
 *   pms.sf.task-me.ke        -> self_manage
 *   <anything else>          -> agency  (preview / localhost / lovable.app)
 *
 * Localhost and *.lovable.app preview URLs intentionally fall through
 * to `agency` so the existing TaskMe app keeps working in dev/preview
 * without DNS gymnastics. To preview the Integral shell locally, append
 * `?shell=integral` to the URL (handled below).
 */
export function shellFromHost(host: string): ShellKind {
  const h = (host || '').toLowerCase().trim().split(':')[0];

  if (h === 'integral.task-me.ke') return 'integral';
  if (h === 'pms.sf.task-me.ke') return 'self_manage';
  if (h === 'pms.task-me.ke') return 'partial';
  if (h === 'app.task-me.ke') return 'agency';

  // Subdomain prefix fallback (in case the apex shifts later)
  if (h.startsWith('integral.')) return 'integral';
  if (h.startsWith('pms.sf.')) return 'self_manage';
  if (h.startsWith('pms.')) return 'partial';

  // Preview, localhost, lovable.app — default to Agency
  return 'agency';
}

/**
 * Allow `?shell=integral|partial|self_manage|agency` to override host detection
 * during local development and on preview URLs. Production hosts ignore this.
 */
export function resolveShellKind(): ShellKind {
  if (typeof window === 'undefined') return 'agency';

  const normalize = (v: string | null): ShellKind | null => {
    if (!v) return null;
    const s = v.toLowerCase();
    if (s === 'integral') return 'integral';
    if (s === 'partial' || s === 'pms') return 'partial';
    if (
      s === 'self_manage' ||
      s === 'selfmanage' ||
      s === 'self-manage' ||
      s === 'pms.sf' ||
      s === 'pmssf' ||
      s === 'sf'
    ) return 'self_manage';
    if (s === 'agency') return 'agency';
    return null;
  };

  const params = new URLSearchParams(window.location.search);
  const override = normalize(params.get('shell'));
  if (override) {
    try { sessionStorage.setItem('lovable.shell_override', override); } catch {}
    return override;
  }

  return shellFromHost(window.location.host);
}

export function currentHost(): string {
  return typeof window === 'undefined' ? '' : window.location.host;
}
