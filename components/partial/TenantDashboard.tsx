import React, { useEffect, useState } from 'react';
import { supabase } from '../../src/integrations/supabase/client';
import { useOrg } from '../../context/OrgContext';
import { PartialHeader, fmtKES } from './PartialHeader';

interface Props { userId: string; email: string | null; onSignOut: () => void; }
interface Lease {
  id: string; tenant_name: string; rent_amount: number; deposit_amount: number;
  start_date: string; status: string; unit_id: string;
  units?: { label: string; unit_tag: string; properties?: { name: string } };
}
interface Payment {
  id: string; amount: number; paid_at: string; mpesa_receipt: string | null; status: string;
}

export const TenantDashboard: React.FC<Props> = ({ userId, email, onSignOut }) => {
  const { org } = useOrg();
  const [leases, setLeases] = useState<Lease[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: ls } = await (supabase as any).from('leases')
        .select('id, tenant_name, rent_amount, deposit_amount, start_date, status, unit_id, units(label, unit_tag, properties(name))')
        .eq('tenant_user_id', userId);
      setLeases(ls || []);
      const ids = (ls || []).map((l: any) => l.id);
      if (ids.length) {
        const { data: ps } = await (supabase as any).from('partial_payments')
          .select('id, amount, paid_at, mpesa_receipt, status')
          .in('lease_id', ids).order('paid_at', { ascending: false }).limit(50);
        setPayments(ps || []);
      }
      setLoading(false);
    })();
  }, [userId]);

  const shortcode = (org as any)?.mpesa_shortcode;
  const active = leases.find(l => l.status === 'active') || leases[0];
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const mtdPaid = payments.filter(p => new Date(p.paid_at) >= monthStart).reduce((s, p) => s + Number(p.amount), 0);
  const balance = active ? Math.max(0, Number(active.rent_amount) - mtdPaid) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <PartialHeader subtitle="Tenant portal" email={email} onSignOut={onSignOut} />
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {loading ? <div className="text-sm text-slate-400">Loading…</div> :
          !active ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
              <h2 className="font-semibold text-amber-900">No lease linked yet</h2>
              <p className="text-sm text-amber-700 mt-1">Your email isn't matched to any lease in this workspace yet. Ask your landlord to register you with this email: <span className="font-mono">{email}</span>.</p>
            </div>
          ) : (
            <>
              <section>
                <h2 className="text-2xl font-semibold">Welcome, {active.tenant_name}</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {active.units?.properties?.name} · Unit {active.units?.label}
                </p>
              </section>
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat label="Monthly rent" value={fmtKES(active.rent_amount)} />
                <Stat label="Paid this month" value={fmtKES(mtdPaid)} />
                <Stat label="Balance" value={fmtKES(balance)} accent={balance > 0 ? 'rose' : 'emerald'} />
                <Stat label="Deposit on file" value={fmtKES(active.deposit_amount)} />
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-semibold mb-2">How to pay</h3>
                <p className="text-sm text-slate-600">
                  Go to M-Pesa → Lipa na M-Pesa → Pay Bill.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="p-3 rounded bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Business no.</div>
                    <div className="text-lg font-mono font-bold">{shortcode || '—'}</div>
                  </div>
                  <div className="p-3 rounded bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Account no.</div>
                    <div className="text-lg font-mono font-bold">{active.units?.unit_tag || '—'}</div>
                  </div>
                </div>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white">
                <div className="px-5 py-4 border-b border-slate-200"><h3 className="text-sm font-semibold">Payment history</h3></div>
                {payments.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No payments yet.</div> :
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr><th className="text-left px-4 py-2.5">Date</th><th className="text-left px-4 py-2.5">Receipt</th><th className="text-right px-4 py-2.5">Amount</th></tr>
                      </thead>
                      <tbody>
                        {payments.map(p => (
                          <tr key={p.id} className="border-t border-slate-100">
                            <td className="px-4 py-2.5">{new Date(p.paid_at).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{p.mpesa_receipt || '—'}</td>
                            <td className="px-4 py-2.5 text-right font-semibold">{fmtKES(Number(p.amount))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                }
              </section>
            </>
          )
        }
      </main>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; accent?: 'rose' | 'emerald' }> = ({ label, value, accent }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
    <div className={`mt-2 text-xl font-semibold ${accent === 'rose' ? 'text-rose-600' : accent === 'emerald' ? 'text-emerald-600' : 'text-slate-900'}`}>{value}</div>
  </div>
);
