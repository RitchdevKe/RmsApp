import React, { useEffect, useState, useCallback } from 'react';
import { useOrg } from '../../context/OrgContext';
import { supabase } from '../../utils/supabaseClient';
import { PartialAuth } from '../partial/PartialAuth';
import { LandlordView } from '../partial/LandlordView';
import { AgencyConsole } from '../partial/AgencyConsole';
import { TenantDashboard } from '../partial/TenantDashboard';
import { ShellLoading } from '@/components/shells/ShellLoading';

type Role = 'owner' | 'admin' | 'staff' | 'landlord' | 'tenant' | null;

interface Membership {
  org_id: string;
  role: Exclude<Role, null>;
  org_name: string;
}

/**
 * Multi-tenant Partial portal.
 *
 * The host `pms.task-me.ke` (and `?shell=pms` preview) is a universal entry
 * point — many landlord/agency orgs share it. We therefore IGNORE any host-
 * resolved org and instead choose the org from the signed-in user's
 * memberships:
 *   - 0 memberships → "Pending access" screen
 *   - 1 membership  → auto-select that org
 *   - 2+            → org picker
 *
 * The selected org id is pushed into OrgContext via setOrgOverride() so the
 * rest of the Partial UI (which reads useOrg().org) sees the right tenant.
 */
export const PartialShell: React.FC = () => {
  const { org, setOrgOverride } = useOrg();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [email, setEmail] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(() => {
    try { return sessionStorage.getItem('lovable.org_override') || null; } catch { return null; }
  });
  const [role, setRole] = useState<Role | 'unknown'>('unknown');

  const loadMemberships = useCallback(async (uid: string): Promise<Membership[]> => {
    // Tenant-claim is a no-op when no matching lease — safe to call.
    try { await (supabase as any).rpc('claim_tenant_lease'); } catch { /* ignore */ }

    const { data } = await (supabase as any)
      .from('org_members')
      .select('org_id, role, organizations:org_id ( id, name, tier )')
      .eq('user_id', uid);

    const list: Membership[] = (data || [])
      .filter((r: any) => r.organizations?.tier === 'partial')
      .map((r: any) => ({
        org_id: r.org_id,
        role: r.role,
        org_name: r.organizations?.name || 'Unknown',
      }));
    return list;
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    setUserId(uid);
    setEmail(data.user?.email ?? null);
    if (!uid) {
      setMemberships(null);
      setRole(null);
      return;
    }

    const list = await loadMemberships(uid);
    setMemberships(list);

    // Decide which org to enter
    let pick: Membership | null = null;
    if (selectedOrgId) {
      pick = list.find(m => m.org_id === selectedOrgId) || null;
    }
    if (!pick && list.length === 1) pick = list[0];

    if (pick) {
      await setOrgOverride(pick.org_id);
      setSelectedOrgId(pick.org_id);
      setRole(pick.role);
    } else {
      // Either 0 (no access) or 2+ (needs picker) — clear any stale override
      await setOrgOverride(null);
      setSelectedOrgId(null);
      setRole(null);
    }
  }, [loadMemberships, selectedOrgId, setOrgOverride]);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') refresh();
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [refresh]);

  const signOut = async () => {
    await setOrgOverride(null);
    setSelectedOrgId(null);
    supabase.auth.signOut().catch(console.error);
  };

  const pickOrg = async (m: Membership) => {
    await setOrgOverride(m.org_id);
    setSelectedOrgId(m.org_id);
    setRole(m.role);
  };

  // 1. Session check
  if (userId === undefined) return <ShellLoading label="Checking session…" />;

  // 2. Not signed in → universal Partial login
  if (!userId) return <PartialAuth onSignedIn={refresh} />;

  // 3. Loading memberships
  if (memberships === null) return <ShellLoading label="Loading your workspace…" />;

  // 4. No access anywhere
  if (memberships.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-semibold text-slate-900">Pending access</h1>
          <p className="text-sm text-slate-600">
            {email} is signed in but isn't a member of any Partial workspace yet.
            If you're a tenant, ask your landlord to register your lease with this email.
            If you're a landlord, ask your agency to add you, or contact support.
          </p>
          <button onClick={signOut} className="text-xs px-3 py-1.5 rounded-md bg-slate-200 hover:bg-slate-300">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // 5. Multiple orgs, none picked yet → picker
  if (!selectedOrgId || !role || role === 'unknown') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center space-y-1">
            <h1 className="text-xl font-semibold text-slate-900">Choose a workspace</h1>
            <p className="text-sm text-slate-600">{email}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl divide-y">
            {memberships.map(m => (
              <button
                key={m.org_id}
                onClick={() => pickOrg(m)}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between"
              >
                <span className="font-medium text-slate-900">{m.org_name}</span>
                <span className="text-xs uppercase tracking-wider text-slate-500">{m.role}</span>
              </button>
            ))}
          </div>
          <button onClick={signOut} className="w-full text-xs text-slate-500 hover:text-slate-800">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // 6. OrgContext might still be catching up to the override
  if (!org || org.id !== selectedOrgId) {
    return <ShellLoading label="Opening workspace…" />;
  }

  // 7. Render shell for the chosen role
  if (role === 'landlord') return <LandlordView userId={userId} email={email} onSignOut={signOut} />;
  if (role === 'owner' || role === 'admin' || role === 'staff') return <AgencyConsole email={email} onSignOut={signOut} />;
  if (role === 'tenant') return <TenantDashboard userId={userId} email={email} onSignOut={signOut} />;

  return <ShellLoading label="Loading…" />;
};
