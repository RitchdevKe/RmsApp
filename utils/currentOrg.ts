/**
 * Exposes the current organization id to the existing Agency app so any
 * write that lands in the database (or a future normalized table) can be
 * stamped with the owning org_id.
 *
 * Phase 1: most Agency data still lives in `app_state` blobs in the
 * browser; this helper returns the org id resolved by OrgContext so blob
 * payloads include `org_id` going forward. Phase 1+ migrations that move
 * blobs into normalized tables will read this same helper.
 */
import { useOrg } from '../context/OrgContext';

export function useCurrentOrgId(): string | null {
  const { org } = useOrg();
  return org?.id ?? null;
}

/**
 * Synchronous fallback for non-React code (utility functions, edge-of-app
 * persistence). Reads the last-resolved org id from sessionStorage —
 * OrgProvider writes it on every successful resolve.
 */
export function getCurrentOrgIdSync(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem('lovable.current_org_id');
  } catch {
    return null;
  }
}

export function setCurrentOrgIdSync(orgId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (orgId) sessionStorage.setItem('lovable.current_org_id', orgId);
    else sessionStorage.removeItem('lovable.current_org_id');
  } catch {}
}

/**
 * Decorates a payload with `org_id` if it doesn't already have one.
 * Use this wherever the Agency app is about to write to Supabase or to a
 * blob — no-op if the field is already set or no org is resolved.
 */
export function stampOrgId<T extends Record<string, any>>(payload: T): T {
  if (payload && typeof payload === 'object' && !payload.org_id) {
    const orgId = getCurrentOrgIdSync();
    if (orgId) return { ...payload, org_id: orgId };
  }
  return payload;
}
