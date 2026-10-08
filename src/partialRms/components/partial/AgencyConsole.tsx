import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { useOrg } from '../../context/OrgContext';
import { PropertiesGrid } from './PropertiesGrid';
import { TenantsList } from './TenantsList';
import { LeasesView } from './LeasesView';
import { PaymentsTable } from './PaymentsTable';
import { PayoutsTable } from './PayoutsTable';
import PartialShellLayout from './PartialShellLayout';
import { FeeSettings as MgmtFeeSettings, ProfileSettings } from './SettingsPanel';
import { PARTIAL_MODULES } from './modules';
import { ComingSoon } from './ComingSoon';
import {
  KpiCard, SectionHeader, ListCard, ListSkeleton, EmptyState, MoneyCell, Avatar, StatusPill, fmtKES,
} from './ui/primitives';

interface Props { email: string | null; onSignOut: () => void; }

export const AgencyConsole: React.FC<Props> = ({ email, onSignOut }) => {
  return (
    <PartialShellLayout
      modules={PARTIAL_MODULES}
      email={email}
      onLogout={onSignOut}
      role="owner"
      renderContent={(m, s) => {
        switch (m) {
          case 'dashboard':
            return <AgencyOverview />;

          case 'properties':
            if (s === 'manage') return <PropertiesGrid landlordUserId={null} />;
            return <ComingSoon title="Occupancy map" icon="leases" description="Visual occupancy by property — heatmap and quick-fill drag-and-drop." />;

          case 'tenants':
            if (s === 'active') return <TenantsList landlordUserId={null} />;
            if (s === 'arrears') return <TenantsList landlordUserId={null} />;
            return <ComingSoon title="Applications" icon="tenants" description="Onboarding pipeline for new tenant applications." />;

          case 'leases':
            if (s === 'renewals')     return <LeasesView landlordUserId={null} status="renewals" />;
            if (s === 'terminations') return <LeasesView landlordUserId={null} status="terminations" />;
            return <LeasesView landlordUserId={null} status="active" />;

          case 'payments':
            if (s === 'inbound') return <PaymentsTable landlordUserId={null} />;
            return <ComingSoon title={s === 'receipts' ? 'Receipts' : 'Reconciliation'} icon="payments" description="Slice 3 — receipts PDF + M-Pesa reconciliation drawer." />;

          case 'payouts':
            return s === 'runs'
              ? <PayoutsTable landlordUserId={null} canManage />
              : <ComingSoon title="Statements" icon="accounting" description="Per-landlord statements with downloadable PDF." />;

          case 'comms':
            return <ComingSoon title={s === 'broadcast' ? 'Broadcast' : 'Tenant inbox'} icon="communication" description="WhatsApp-style threads + segmented broadcast — Slice 4." />;

          case 'maintenance':
            return <ComingSoon title={s === 'vendors' ? 'Vendors' : s === 'orders' ? 'Work orders' : 'Tickets'} icon="maintenance" description="Tickets, work orders and vendor assignments — Slice 4." />;

          case 'reports':
            return <ComingSoon title={s === 'landlords' ? 'Landlord performance' : s === 'arrears' ? 'Arrears aging' : 'Collections'} icon="reports" description="Charts and exports — Slice 3." />;

          case 'settings':
            if (s === 'profile')  return <ProfileSettings email={email} />;
            if (s === 'mpesa')    return <MgmtFeeSettings />;
            if (s === 'team')     return <LandlordsRoster />;
            return <ComingSoon title={s === 'org' ? 'Organization' : 'Branding'} icon="settings" description="Org-level settings — Slice 5." />;

          default:
            return null;
        }
      }}
    />
  );
};

/* ============================================================
   Agency Overview — upgraded KPI grid + payouts queue preview.
   ============================================================ */
const AgencyOverview: React.FC = () => {
  const { org } = useOrg();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!org?.id) return;
    (async () => {
      setLoading(true);
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const [ll, props, units, leases, pays] = await Promise.all([
        (supabase as any).from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('role', 'landlord'),
        (supabase as any).from('partial_properties').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
        (supabase as any).from('partial_units').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
        (supabase as any).from('partial_leases').select('id', { count: 'exact', head: true }).eq('org_id', org.id).eq('status', 'active'),
        (supabase as any).from('partial_partial_payments').select('amount,mgmt_fee_amount').eq('org_id', org.id).gte('paid_at', monthStart.toISOString()),
      ]);
      const mtd = (pays.data || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
      const mtdFee = (pays.data || []).reduce((s: number, p: any) => s + Number(p.mgmt_fee_amount), 0);
      setStats({
        landlords: ll.count || 0, properties: props.count || 0, units: units.count || 0,
        activeLeases: leases.count || 0, mtd, mtdFee,
      });
      setLoading(false);
    })();
  }, [org?.id]);

  const feePct = Number((org as any)?.feature_flags?.mgmt_fee_pct ?? 10);
  const v = (n: number | undefined) => loading || n === undefined ? '…' : n.toLocaleString();

  return (
    <div className="space-y-6">
      <SectionHeader
        title={`Hi ${(org?.name || 'team').split(' ')[0]} 👋`}
        subtitle={`Portfolio snapshot — management fee ${feePct}% of collected rent.`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Landlords"    value={v(stats?.landlords)}    icon="landlords" tone="info" />
        <KpiCard label="Properties"   value={v(stats?.properties)}   icon="leases"    tone="neutral" />
        <KpiCard label="Units"        value={v(stats?.units)}        icon="leases"    tone="neutral" />
        <KpiCard label="Active leases" value={v(stats?.activeLeases)} icon="tenants"   tone="neutral" />
        <KpiCard label="Collected MTD" value={loading ? '…' : fmtKES(stats?.mtd)}    icon="payments"  tone="success" />
        <KpiCard label="Mgmt fees MTD" value={loading ? '…' : fmtKES(stats?.mtdFee)} icon="accounting" tone="warning" />
      </div>

      <div>
        <SectionHeader title="Recent collections" subtitle="Latest M-Pesa receipts across the portfolio." />
        <RecentPayments />
      </div>
    </div>
  );
};

const RecentPayments: React.FC = () => {
  const { org } = useOrg();
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    if (!org?.id) return;
    (async () => {
      const { data } = await (supabase as any).from('partial_partial_payments')
        .select('id, amount, payer_name, payer_phone, paid_at, mpesa_receipt, unit_tag')
        .eq('org_id', org.id).order('paid_at', { ascending: false }).limit(6);
      setRows(data || []);
    })();
  }, [org?.id]);

  if (rows === null) return <ListSkeleton rows={4} />;
  if (rows.length === 0) return <EmptyState icon="payments" title="No collections yet" description="When tenants pay via M-Pesa, receipts will land here in real time." />;

  return (
    <div className="space-y-2">
      {rows.map(r => (
        <ListCard
          key={r.id}
          leading={<Avatar name={r.payer_name || r.payer_phone || 'P'} />}
          title={r.payer_name || r.payer_phone || 'Anonymous payer'}
          subtitle={`${r.unit_tag || '—'} · ${r.mpesa_receipt || 'no ref'}`}
          meta={<MoneyCell amount={r.amount} />}
          metaSub={<span className="text-[10px] text-slate-400">{new Date(r.paid_at).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })}</span>}
        />
      ))}
    </div>
  );
};

/* ============================================================
   Landlords roster — moved from a sub-module to Settings > Team
   in the new map, but the component itself is unchanged in logic.
   ============================================================ */
const LandlordsRoster: React.FC = () => {
  const { org } = useOrg();
  const [rows, setRows] = useState<any[] | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!org?.id) return;
    const { data: mems } = await (supabase as any).from('org_members')
      .select('user_id, role').eq('org_id', org.id);
    setRows(mems || []);
  }, [org?.id]);
  useEffect(() => { load(); }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault(); setInviting(true); setInviteMsg(null);
    try {
      const token = crypto.randomUUID().replace(/-/g, '');
      const { error } = await (supabase as any).from('org_invitations').insert({
        org_id: org!.id, email: inviteEmail.trim().toLowerCase(), role: 'landlord', accept_token: token,
      });
      if (error) throw error;
      const link = `${window.location.origin}/?invite=${token}`;
      setInviteMsg(`Invite created. Share this link: ${link}`);
      setInviteEmail(''); await load();
    } catch (err: any) {
      setInviteMsg('Error: ' + (err?.message || 'failed'));
    } finally { setInviting(false); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Team & roles" subtitle="Invite landlords or agency staff to this workspace." />

      <form onSubmit={invite} className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-medium text-slate-500 mb-1">Invite landlord by email</label>
          <input
            required type="email" value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="landlord@example.com"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary outline-none"
          />
        </div>
        <button
          disabled={inviting}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary hover:bg-primary-dark text-white disabled:opacity-60"
        >
          {inviting ? 'Inviting…' : 'Send invite'}
        </button>
        {inviteMsg && <div className="w-full text-xs text-slate-600 break-all">{inviteMsg}</div>}
      </form>

      {rows === null ? <ListSkeleton rows={3} /> :
        rows.length === 0 ? <EmptyState icon="landlords" title="No team members yet" description="Invite your first landlord above to get started." /> :
        <div className="space-y-2">
          {rows.map(r => (
            <ListCard
              key={r.user_id}
              leading={<Avatar name={r.user_id} />}
              title={r.user_id}
              subtitle="Workspace member"
              metaSub={<StatusPill tone={r.role === 'landlord' ? 'info' : r.role === 'owner' ? 'success' : 'neutral'}>{r.role}</StatusPill>}
            />
          ))}
        </div>
      }
    </div>
  );
};
