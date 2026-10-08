import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../utils/supabaseClient';

type Tier = '' | 'agency' | 'partial' | 'self_manage';
const TIERS: { id: Exclude<Tier, ''>; label: string; color: string }[] = [
  { id: 'agency', label: 'Agency', color: 'bg-primary' },
  { id: 'partial', label: 'Partial', color: 'bg-emerald-500' },
  { id: 'self_manage', label: 'Self-manage', color: 'bg-amber-500' },
];

const fmtKES = (n: number) =>
  new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 }).format(n || 0);
const fmtNum = (n: number) => new Intl.NumberFormat('en-KE').format(n || 0);

interface Metrics {
  orgs: number; landlords: number; tenants: number;
  properties: number; units: number; active_leases: number;
  mtd_collected: number; mtd_fees: number;
}

export const PlatformHub: React.FC<{ tier?: Tier }> = ({ tier = '' }) => {
  const [overall, setOverall] = useState<Metrics | null>(null);
  const [byTier, setByTier] = useState<Record<string, Metrics>>({});
  const [loading, setLoading] = useState(true);
  const [topOrgs, setTopOrgs] = useState<any[]>([]);
  const [topLandlords, setTopLandlords] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: m }, ...tiered] = await Promise.all([
      (supabase as any).rpc('platform_metrics', { _tier: tier || null }),
      ...TIERS.map(t => (supabase as any).rpc('platform_metrics', { _tier: t.id })),
    ]);
    setOverall(m || null);
    const t: Record<string, Metrics> = {};
    TIERS.forEach((cfg, i) => { t[cfg.id] = (tiered[i] as any).data; });
    setByTier(t);

    const [{ data: ll }, { data: orgs }, { data: rp }] = await Promise.all([
      (supabase as any).rpc('platform_landlords', { _tier: tier || null, _org_id: null }),
      (supabase as any).from('organizations').select('id,name,tier,primary_subdomain,status').order('name'),
      (supabase as any)
        .from('partial_partial_payments')
        .select('id, amount, paid_at, payer_name, mpesa_receipt, mgmt_fee_amount, unit_tag, org_id')
        .order('paid_at', { ascending: false })
        .limit(12),
    ]);

    setTopLandlords((ll || []).slice(0, 6));

    const orgMap = new Map((orgs || []).map((o: any) => [o.id, o]));
    const orgAgg = new Map<string, { name: string; tier: string; total: number; count: number }>();
    (rp || []).forEach((p: any) => {
      const o = orgMap.get(p.org_id) as any;
      if (!o) return;
      const cur = orgAgg.get(p.org_id) || { name: o.name, tier: o.tier, total: 0, count: 0 };
      cur.total += Number(p.amount || 0);
      cur.count += 1;
      orgAgg.set(p.org_id, cur);
    });
    setTopOrgs([...orgAgg.values()].sort((a, b) => b.total - a.total).slice(0, 5));

    setRecent((rp || []).map((p: any) => ({ ...p, org: orgMap.get(p.org_id) })));
    setLoading(false);
  }, [tier]);

  useEffect(() => { load(); }, [load]);

  const orgsByTier = useMemo(() => {
    const map: Record<string, number> = {};
    TIERS.forEach(t => { map[t.id] = byTier[t.id]?.orgs || 0; });
    return map;
  }, [byTier]);

  const totalOrgs = Math.max(1, TIERS.reduce((s, t) => s + (orgsByTier[t.id] || 0), 0));

  if (loading && !overall) return <div className="text-sm text-slate-400">Loading platform metrics…</div>;
  if (!overall) return <div className="text-sm text-rose-400">Failed to load.</div>;

  return (
    <div className="space-y-6">
      {/* Hero KPI strip */}
      <section className="rounded-2xl border border-primary/30 bg-gradient-to-br from-[#3d0a05] via-slate-900 to-[#3d0a05] p-5 sm:p-6 shadow-xl">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-secondary font-semibold">Platform Pulse</div>
            <h2 className="text-2xl font-bold text-white">Task-Me Realty · Real-time overview</h2>
            <p className="text-xs text-slate-400 mt-1">Aggregated across every Agency, Partial and Self-manage org on the platform.</p>
          </div>
          <button onClick={load} className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10">
            ↻ Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi label="Organizations" value={fmtNum(overall.orgs)} sub={`${TIERS.length} tiers`} />
          <Kpi label="Landlords" value={fmtNum(overall.landlords)} sub="across all orgs" />
          <Kpi label="Tenants" value={fmtNum(overall.tenants)} sub={`${fmtNum(overall.active_leases)} active leases`} />
          <Kpi label="Properties" value={fmtNum(overall.properties)} sub={`${fmtNum(overall.units)} units`} />
          <Kpi label="Collected MTD" value={fmtKES(overall.mtd_collected)} accent="emerald" sub="all rent in" />
          <Kpi label="Mgmt fees MTD" value={fmtKES(overall.mtd_fees)} accent="amber" sub="platform revenue" />
          <Kpi label="Avg unit rent"
               value={fmtKES(overall.units ? overall.mtd_collected / overall.units : 0)}
               sub="MTD ÷ units" />
          <Kpi label="Occupancy"
               value={`${overall.units ? Math.round((overall.active_leases / overall.units) * 100) : 0}%`}
               accent="indigo" sub={`${fmtNum(overall.active_leases)} / ${fmtNum(overall.units)}`} />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tier breakdown */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Tier breakdown</h3>
          <div className="space-y-4">
            {TIERS.map(t => {
              const m = byTier[t.id];
              const pct = Math.round(((orgsByTier[t.id] || 0) / totalOrgs) * 100);
              return (
                <div key={t.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">{t.label}</span>
                    <span className="text-slate-400">{fmtNum(orgsByTier[t.id] || 0)} orgs · {fmtKES(m?.mtd_collected || 0)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`${t.color} h-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex gap-3 mt-1.5 text-[10px] text-slate-500">
                    <span>{fmtNum(m?.landlords || 0)} landlords</span>
                    <span>·</span>
                    <span>{fmtNum(m?.tenants || 0)} tenants</span>
                    <span>·</span>
                    <span>{fmtNum(m?.units || 0)} units</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top orgs by recent collection */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Top orgs · recent collections</h3>
          {topOrgs.length === 0 ? (
            <p className="text-xs text-slate-500">No recent payments to rank.</p>
          ) : (
            <ol className="space-y-2.5">
              {topOrgs.map((o, i) => (
                <li key={o.name} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-secondary/20 text-secondary text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{o.name}</p>
                    <p className="text-[10px] text-slate-500 uppercase">{o.tier} · {o.count} payment{o.count > 1 ? 's' : ''}</p>
                  </div>
                  <span className="text-sm text-success font-semibold tabular-nums">{fmtKES(o.total)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Top landlords */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Top landlords MTD</h3>
          {topLandlords.length === 0 ? (
            <p className="text-xs text-slate-500">No landlord activity yet.</p>
          ) : (
            <ol className="space-y-2.5">
              {topLandlords.map((l, i) => (
                <li key={`${l.user_id}-${l.org_id}`} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/20 text-primary-light text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{l.email}</p>
                    <p className="text-[10px] text-slate-500">{l.org_name} · {l.properties}p · {l.units}u</p>
                  </div>
                  <span className="text-sm text-success font-semibold tabular-nums">{fmtKES(Number(l.mtd_collected))}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {/* Recent collections feed */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Live collections feed</h3>
            <p className="text-[10px] text-slate-500">Latest M-Pesa receipts across the platform</p>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-success">● Live</span>
        </div>
        {recent.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">No collections yet.</div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {recent.map(p => (
              <li key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-slate-900/80 transition-colors">
                <div className="w-9 h-9 rounded-full bg-emerald-500/15 text-success flex items-center justify-center text-xs font-bold">
                  KES
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">
                    {p.payer_name || 'Unknown payer'}
                    <span className="text-slate-500"> · </span>
                    <span className="text-slate-300">{p.org?.name || '—'}</span>
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {p.mpesa_receipt || 'no-receipt'} · {p.unit_tag || 'no-tag'} ·{' '}
                    {p.paid_at ? new Date(p.paid_at).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-success font-semibold tabular-nums">{fmtKES(Number(p.amount))}</p>
                  <p className="text-[10px] text-secondary">fee {fmtKES(Number(p.mgmt_fee_amount))}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: any; sub?: string; accent?: 'emerald' | 'amber' | 'indigo' }> = ({ label, value, sub, accent }) => (
  <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 hover:bg-white/[0.07] transition-colors">
    <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
    <div className={`mt-1.5 text-xl font-bold tabular-nums ${
      accent === 'emerald' ? 'text-success' :
      accent === 'amber' ? 'text-secondary' :
      accent === 'indigo' ? 'text-primary-light' : 'text-white'
    }`}>{value}</div>
    {sub && <div className="mt-0.5 text-[10px] text-slate-500">{sub}</div>}
  </div>
);
