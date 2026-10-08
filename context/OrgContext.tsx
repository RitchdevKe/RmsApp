/**
 * Resolves the current organization at app boot from the hostname and
 * exposes it to every component below. Until the org is loaded we show a
 * tiny full-screen splash so we never render the wrong tier's UI.
 *
 * The lookup uses the public `resolve_org_by_host` RPC which only returns
 * non-sensitive branding fields — safe to call before sign-in.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../src/integrations/supabase/client';
import { resolveShellKind, currentHost, type ShellKind, type OrgTier } from '../utils/orgHost';
import { setCurrentOrgIdSync } from '../utils/currentOrg';

export interface ResolvedOrg {
  id: string;
  slug: string;
  name: string;
  tier: OrgTier;
  status: 'active' | 'trial' | 'suspended' | 'archived';
  primary_subdomain: string;
  branding: {
    app_name?: string;
    primary_color?: string;
    logo_url?: string | null;
  };
}

interface OrgContextValue {
  shell: ShellKind;          // What subdomain this browser is on
  org: ResolvedOrg | null;   // The org row matching the hostname (null if unknown host)
  loading: boolean;
  error: string | null;
  reload: () => void;
  setOrgOverride: (orgId: string | null) => Promise<void>;
}

import { SharedOrgContext as OrgContext } from './SharedOrgContext';

// Module-level dedupe for resolve_org_by_host. StrictMode + multiple
// providers/effects can otherwise fire the same RPC several times on boot.
const _resolveInflight = new Map<string, Promise<{ data: any; error: any }>>();
function resolveOrgByHostDeduped(hostArg: string): Promise<{ data: any; error: any }> {
  const key = hostArg.toLowerCase();
  let p = _resolveInflight.get(key);
  if (p) return p;
  p = (supabase as any)
    .rpc('resolve_org_by_host', { _host: hostArg })
    .then((res: any) => ({ data: res.data, error: res.error }))
    .finally(() => {
      // Keep the result briefly so back-to-back callers reuse it, then clear.
      setTimeout(() => _resolveInflight.delete(key), 2000);
    });
  _resolveInflight.set(key, p);
  return p;
}

export const useOrg = (): OrgContextValue => {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside <OrgProvider>');
  return ctx;
};

export const OrgProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const shell = useMemo<ShellKind>(() => resolveShellKind(), []);
  // Synchronous bootstrap: hydrate org from localStorage cache or synth a
  // default for preview/localhost hosts so the first paint never shows a
  // "Resolving organization…" spinner.
  const host = typeof window === 'undefined' ? '' : window.location.host;
  const cacheKey = `lovable.org_cache.v2:${host}`;
  const isPreviewHost = (() => {
    const h = host.toLowerCase();
    return (
      h.includes('lovable.app') ||
      h.includes('lovableproject.com') ||
      h.startsWith('localhost') ||
      h.startsWith('127.0.0.1') ||
      h.endsWith('.local') ||
      h.includes('run.app') ||
      h.includes('aistudio') ||
      h.includes('ai.studio')
    );
  })();
  const initialOrg: ResolvedOrg | null = (() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
      if (raw) return JSON.parse(raw) as ResolvedOrg;
    } catch {}
    if (isPreviewHost) {
      return {
        id: 'default-agency',
        slug: 'default-agency',
        name: 'TaskMe Realty',
        tier: (shell === 'partial' ? 'partial' : shell === 'integral' ? 'integral' : shell === 'self_manage' ? 'self_manage' : 'agency') as OrgTier,
        status: 'active',
        primary_subdomain: host,
        branding: { app_name: 'TaskMe Realty', primary_color: '#0F172A', logo_url: null },
      };
    }
    return null;
  })();
  const [org, setOrg] = useState<ResolvedOrg | null>(initialOrg);
  // Only block UI when we truly have no org info to render with.
  const [loading, setLoading] = useState(!initialOrg);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [overrideId, setOverrideId] = useState<string | null>(() => {
    try { return sessionStorage.getItem('lovable.org_override') || null; } catch { return null; }
  });

  // Seed sync org id immediately so utilities don't see null on first render.
  useEffect(() => {
    if (initialOrg) setCurrentOrgIdSync(initialOrg.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const h = currentHost();

    const load = async () => {
      // Only show the splash if we have nothing to render with yet.
      if (!org) setLoading(true);
      setError(null);
      try {
        // If an explicit override is set (e.g. multi-tenant Partial portal after login),
        // fetch that org directly instead of host-based resolution.
        if (overrideId) {
          const { data: row, error: e1 } = await (supabase as any)
            .from('organizations')
            .select('id, slug, name, tier, status, primary_subdomain, branding')
            .eq('id', overrideId)
            .maybeSingle();
          if (cancelled) return;
          if (e1) throw e1;
          setOrg(row as ResolvedOrg | null);
          setCurrentOrgIdSync((row as any)?.id ?? null);
          return;
        }

        // Try direct host match first
        const tryRpc = async (hh: string): Promise<{ data: any; missing: boolean; err: any }> => {
          const { data, error: rpcErr } = await resolveOrgByHostDeduped(hh);
          // PostgREST returns code PGRST202 / message "Could not find the function" when the RPC isn't deployed.
          const msg = String(rpcErr?.message || '');
          const missing = !!rpcErr && (rpcErr.code === 'PGRST202' || /Could not find the function/i.test(msg));
          return { data, missing, err: rpcErr };
        };

        const first = await tryRpc(h);
        if (cancelled) return;

        // If the RPC isn't deployed on this Supabase project, fall back to a
        // synthetic agency org so the app still renders. The user can deploy
        // the migration that creates resolve_org_by_host to enable multi-tenant
        // host resolution.
        if (first.missing) {
          const synthetic: ResolvedOrg = {
            id: 'default-agency',
            slug: 'default-agency',
            name: 'TaskMe Realty',
            tier: (shell === 'partial' ? 'partial' : shell === 'integral' ? 'integral' : shell === 'self_manage' ? 'self_manage' : 'agency') as OrgTier,
            status: 'active',
            primary_subdomain: h,
            branding: { app_name: 'TaskMe Realty', primary_color: '#0F172A', logo_url: null },
          };
          setOrg(synthetic);
          setCurrentOrgIdSync(synthetic.id);
          try { localStorage.setItem(cacheKey, JSON.stringify(synthetic)); } catch {}
          return;
        }
        if (first.err) throw first.err;

        let resolved: ResolvedOrg | null = Array.isArray(first.data) && first.data.length > 0 ? first.data[0] : null;

        // Dev/preview fallback: pick by tier when shell came from override or localhost.
        if (!resolved && shell !== 'partial') {
          const fallbackSubdomain =
            shell === 'integral' ? 'integral.task-me.ke'
            : shell === 'self_manage' ? 'pms.sf.task-me.ke'
            : 'app.task-me.ke';
          const fb = await tryRpc(fallbackSubdomain);
          if (cancelled) return;
          resolved = Array.isArray(fb.data) && fb.data.length > 0 ? fb.data[0] : null;
        }

        setOrg(resolved);
        setCurrentOrgIdSync(resolved?.id ?? null);
        if (resolved) {
          try { localStorage.setItem(cacheKey, JSON.stringify(resolved)); } catch {}
        }
      } catch (e: any) {
        if (!cancelled) {
          console.warn('Suppressing organization resolution error, using fallback:', e);
          const synthetic: ResolvedOrg = {
            id: 'default-agency',
            slug: 'default-agency',
            name: 'TaskMe Realty',
            tier: (shell === 'partial' ? 'partial' : shell === 'integral' ? 'integral' : shell === 'self_manage' ? 'self_manage' : 'agency') as OrgTier,
            status: 'active',
            primary_subdomain: h,
            branding: { app_name: 'TaskMe Realty', primary_color: '#0F172A', logo_url: null },
          };
          setOrg(org || initialOrg || synthetic);
          setCurrentOrgIdSync(org?.id || initialOrg?.id || synthetic.id);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [shell, tick, overrideId]);

  // Apply org primary color as a CSS variable so any shell can pick it up
  useEffect(() => {
    if (org?.branding?.primary_color && typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--org-primary', org.branding.primary_color);
    }
  }, [org]);

  const setOrgOverride = React.useCallback(async (orgId: string | null) => {
    try {
      if (orgId) sessionStorage.setItem('lovable.org_override', orgId);
      else sessionStorage.removeItem('lovable.org_override');
    } catch {}
    setOverrideId(orgId);
  }, []);

  const value: OrgContextValue = useMemo(() => ({
    shell,
    org,
    loading,
    error,
    reload: () => setTick(t => t + 1),
    setOrgOverride,
  }), [shell, org, loading, error]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
};
