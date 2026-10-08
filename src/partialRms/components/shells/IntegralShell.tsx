import React, { useEffect, useMemo, useState } from 'react';
import { useOrg } from '../../context/OrgContext';
import { supabase } from '../../utils/supabaseClient';
import { IntegralAuth } from '../integral/IntegralAuth';
import IntegralSidebar, { type IntegralModule } from '../integral/IntegralSidebar';
import IntegralTopHeader from '../integral/IntegralTopHeader';
import { OrgList } from '../integral/OrgList';
import { PlatformHub } from '../integral/PlatformHub';
import { ShellLoading } from '@/components/shells/ShellLoading';

// Small inline icons (kept here so the sidebar doesn't need a new icon set)
const I = {
  hub: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12 12 3l9 9M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  orgs: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h2M9 13h2M9 17h2M13 9h2M13 13h2M13 17h2" strokeLinecap="round"/></svg>,
  people: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  cash: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>,
  gear: <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.3 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

const MODULES: IntegralModule[] = [
  { key: 'hub', name: 'Platform Hub', icon: I.hub, subModules: [
    { key: 'overview', name: 'Live Overview' },
    { key: 'tiers', name: 'Tier Breakdown' },
    { key: 'collections', name: 'Collections Feed' },
  ]},
  { key: 'orgs', name: 'Organizations', icon: I.orgs, subModules: [
    { key: 'all', name: 'All organizations' },
    { key: 'agency', name: 'Agency tier' },
    { key: 'partial', name: 'Partial tier' },
    { key: 'self', name: 'Self-manage' },
  ]},
  { key: 'people', name: 'People', icon: I.people, subModules: [
    { key: 'landlords', name: 'Landlords' },
    { key: 'tenants', name: 'Tenants' },
  ]},
  { key: 'money', name: 'Money', icon: I.cash, subModules: [
    { key: 'collections', name: 'All collections' },
    { key: 'fees', name: 'Platform fees' },
  ]},
  { key: 'settings', name: 'Settings', icon: I.gear, subModules: [
    { key: 'platform', name: 'Platform settings' },
  ]},
];

export const IntegralShell: React.FC = () => {
  const { org } = useOrg();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [isSuper, setIsSuper] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [active, setActive] = useState({ module: 'hub', sub: 'overview' });
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const refresh = async () => {
    const { data } = await supabase.auth.getUser();
    setUserId(data.user?.id ?? null);
    setEmail(data.user?.email ?? null);
    if (data.user) {
      const { data: orgsData } = await (supabase as any)
        .from('org_members')
        .select('role, organizations!inner(tier)')
        .eq('user_id', data.user.id);
      const isSa = (orgsData || []).some((m: any) => m.organizations?.tier === 'integral' && ['owner', 'admin'].includes(m.role));
      setIsSuper(isSa);
    } else {
      setIsSuper(null);
    }
  };

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) refresh();
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const signOut = async () => { supabase.auth.signOut().catch(console.error); };

  const { moduleName, subName } = useMemo(() => {
    const m = MODULES.find(x => x.key === active.module);
    const s = m?.subModules.find(x => x.key === active.sub);
    return { moduleName: m?.name || '', subName: s?.name || '' };
  }, [active]);

  if (userId === undefined) return <ShellLoading label="Checking session…" />;
  if (!userId) return <IntegralAuth onSignedIn={refresh} />;
  if (isSuper === null) return <ShellLoading label="Verifying access…" />;

  if (!isSuper) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-semibold">No super-admin access</h1>
          <p className="text-sm text-slate-400">{email} is signed in but is not a member of the Integral organization.</p>
          <button onClick={signOut} className="text-sm px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700">Sign out</button>
        </div>
      </div>
    );
  }

  const renderContent = (): React.ReactNode => {
    if (active.module === 'hub') return <PlatformHub />;
    if (active.module === 'orgs') {
      // tier-scoped views are handled inside OrgList in a later slice; for now show full list.
      return <OrgList />;
    }
    if (active.module === 'people') {
      return (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <h3 className="text-base font-semibold text-white capitalize">{active.sub}</h3>
          <p className="text-xs text-slate-400 mt-2">
            Cross-tier {active.sub} directory streams from the Platform Hub feed. Detailed drill-down view is being prepared.
          </p>
        </div>
      );
    }
    if (active.module === 'money') {
      return (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
          <h3 className="text-base font-semibold text-white capitalize">{subName}</h3>
          <p className="text-xs text-slate-400 mt-2">
            Money cockpit (filters, exports, reconciliation) lands next. Live feed is in the Platform Hub.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center text-xs text-slate-400">
        Settings module is coming up next.
      </div>
    );
  };

  const appName = org?.branding?.app_name || 'Integral';

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white flex flex-col">
      <IntegralTopHeader
        appName={appName}
        subdomain={org?.primary_subdomain || 'integral.task-me.ke'}
        email={email}
        moduleName={moduleName}
        subName={subName}
        onToggleSidebar={() => setSidebarOpen(o => !o)}
        onLogout={signOut}
      />
      <div className="flex-1 min-h-0 flex">
        {sidebarOpen && (
          <IntegralSidebar
            modules={MODULES}
            active={active}
            email={email}
            onSelect={(module, sub) => setActive({ module, sub })}
            onLogout={signOut}
          />
        )}
        <main className="flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 py-6">
          <div className="max-w-7xl mx-auto">{renderContent()}</div>
        </main>
      </div>
    </div>
  );
};
