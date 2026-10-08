import React, { useEffect, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';
import { useOrg } from '../../context/OrgContext';

interface Props {
  userId: string;
  email: string | null;
  onSignOut: () => void;
  embedded?: boolean;
}

interface Stats {
  properties: number;
  units: number;
  activeLeases: number;
  mtdCollected: number;
  pendingPayout: number;
  mgmtFeePct: number;
}

interface RecentPayment {
  id: string;
  amount: number;
  paid_at: string;
  payer_name: string | null;
  payer_phone: string | null;
  mpesa_receipt: string | null;
  unit_tag: string | null;
  landlord_payout_amount: number;
  mgmt_fee_amount: number;
}

const fmtKES = (n: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n || 0);

export const LandlordDashboard: React.FC<Props> = ({ userId, email, onSignOut, embedded }) => {
  const { org } = useOrg();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!org?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const orgId = org.id;
        const mgmtFeePct = Number((org as any)?.feature_flags?.mgmt_fee_pct ?? 10);

        // Fetch everything in parallel!
        const [propsRes, unitsRes, leasesRes, paymentsRes] = await Promise.all([
          (supabase as any).from('partial_properties').select('id').eq('org_id', orgId).eq('landlord_user_id', userId),
          (supabase as any).from('partial_units').select('id, property_id').eq('org_id', orgId),
          (supabase as any).from('partial_leases').select('id, unit_id, status').eq('org_id', orgId),
          (supabase as any).from('partial_partial_payments').select('id, lease_id, amount, paid_at, payer_name, payer_phone, mpesa_receipt, unit_tag, landlord_payout_amount, mgmt_fee_amount, status').eq('org_id', orgId).order('paid_at', { ascending: false }).limit(200)
        ]);

        if (propsRes.error) throw propsRes.error;
        if (unitsRes.error) throw unitsRes.error;
        if (leasesRes.error) throw leasesRes.error;
        if (paymentsRes.error) throw paymentsRes.error;

        const propertyIds = (propsRes.data || []).map((p: any) => p.id);

        const filteredUnits = (unitsRes.data || []).filter((u: any) => propertyIds.includes(u.property_id));
        const unitIds = filteredUnits.map((u: any) => u.id);

        const filteredLeases = (leasesRes.data || []).filter((l: any) => unitIds.includes(l.unit_id));
        const leaseIds = filteredLeases.map((l: any) => l.id);
        const activeLeases = filteredLeases.filter((l: any) => l.status === 'active').length;

        // Month-to-date payments
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        let mtdCollected = 0;
        let pendingPayout = 0;

        const filteredPayments = (paymentsRes.data || []).filter((p: any) => leaseIds.includes(p.lease_id));

        for (const p of filteredPayments) {
          const paid = new Date(p.paid_at);
          if (paid >= monthStart) mtdCollected += Number(p.amount) || 0;
          if (p.status !== 'paid_out' && p.status !== 'reversed') {
            pendingPayout += Number(p.landlord_payout_amount) || 0;
          }
        }
        const recentRows = filteredPayments.slice(0, 10);

        if (cancelled) return;
        setStats({
          properties: propertyIds.length,
          units: unitIds.length,
          activeLeases,
          mtdCollected,
          pendingPayout,
          mgmtFeePct,
        });
        setRecent(recentRows);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org?.id, userId]);

  const appName = org?.branding?.app_name || 'Partial Management';
  const shortcode = (org as any)?.mpesa_shortcode;

  const content = (
    <>
      <main className={embedded ? 'space-y-8' : 'max-w-6xl mx-auto px-6 py-8 space-y-8'}>
        <section>
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
          <p className="text-sm text-slate-500 mt-1">
            Tenants pay rent directly to{' '}
            {shortcode ? (
              <>PayBill <span className="font-mono font-semibold text-slate-700">{shortcode}</span></>
            ) : (
              'your PayBill'
            )}
            . The agency keeps {stats?.mgmtFeePct ?? 10}% as the management fee; the rest is your payout.
          </p>
        </section>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Properties" value={loading ? '…' : String(stats?.properties ?? 0)} />
          <StatCard label="Units" value={loading ? '…' : String(stats?.units ?? 0)} />
          <StatCard label="Active leases" value={loading ? '…' : String(stats?.activeLeases ?? 0)} />
          <StatCard label="Collected this month" value={loading ? '…' : fmtKES(stats?.mtdCollected ?? 0)} accent />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-xs uppercase tracking-wider text-slate-500">Pending payout to you</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-600">
              {loading ? '…' : fmtKES(stats?.pendingPayout ?? 0)}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Net of the {stats?.mgmtFeePct ?? 10}% management fee. Settled on the next payout run.
            </p>
          </div>
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Manage your portfolio</h3>
              <span className="text-[10px] uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                Coming soon
              </span>
            </div>
            <p className="text-sm text-slate-500">
              Add properties, units and leases, and download payout statements. We're shipping this in the next update.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                disabled
                className="px-3 py-1.5 rounded-md text-xs bg-slate-100 text-slate-400 cursor-not-allowed"
              >
                Manage properties
              </button>
              <button
                disabled
                className="px-3 py-1.5 rounded-md text-xs bg-slate-100 text-slate-400 cursor-not-allowed"
              >
                Manage tenants
              </button>
              <button
                disabled
                className="px-3 py-1.5 rounded-md text-xs bg-slate-100 text-slate-400 cursor-not-allowed"
              >
                Payout history
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent payments</h3>
            <span className="text-xs text-slate-500">Last 10</span>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-slate-400">Loading…</div>
          ) : recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No payments yet. They'll appear here as tenants pay your PayBill.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5">Date</th>
                    <th className="text-left px-4 py-2.5">Unit</th>
                    <th className="text-left px-4 py-2.5">Tenant</th>
                    <th className="text-left px-4 py-2.5">Receipt</th>
                    <th className="text-right px-4 py-2.5">Amount</th>
                    <th className="text-right px-4 py-2.5">Your payout</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5 text-slate-600">
                        {new Date(p.paid_at).toLocaleDateString('en-KE', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs">{p.unit_tag || '—'}</td>
                      <td className="px-4 py-2.5">
                        {p.payer_name || p.payer_phone || '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                        {p.mpesa_receipt || '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">{fmtKES(Number(p.amount))}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600">
                        {fmtKES(Number(p.landlord_payout_amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
  if (embedded) return content;
  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-sm font-bold">
            {appName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h1 className="text-base font-semibold">{appName}</h1>
            <p className="text-xs text-slate-500">Landlord portal</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 hidden sm:inline">{email}</span>
          <button onClick={onSignOut} className="text-xs px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700">Sign out</button>
        </div>
      </header>
      {content}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`mt-2 text-2xl font-semibold ${accent ? 'text-emerald-600' : 'text-slate-900'}`}>{value}</div>
  </div>
);
