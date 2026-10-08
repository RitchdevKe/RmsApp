import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../src/integrations/supabase/client';
import { useOrg } from '../../context/OrgContext';
import { fmtKES } from './PartialHeader';

interface Props { landlordUserId: string | null; canManage: boolean; }
interface Row {
  id: string; landlord_user_id: string; period_start: string; period_end: string;
  total_collected: number; total_fee: number; total_payout: number; status: string; paid_at: string | null;
}

export const PayoutsTable: React.FC<Props> = ({ landlordUserId, canManage }) => {
  const { org } = useOrg();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [landlords, setLandlords] = useState<{ user_id: string; email: string }[]>([]);
  const [form, setForm] = useState({ landlord: '', start: '', end: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!org?.id) return;
    setLoading(true);
    let q = (supabase as any).from('partial_payout_runs').select('*').eq('org_id', org.id).order('period_end', { ascending: false });
    if (landlordUserId) q = q.eq('landlord_user_id', landlordUserId);
    const { data } = await q;
    setRows(data || []);
    if (canManage) {
      const { data: lls } = await (supabase as any).from('org_members')
        .select('user_id').eq('org_id', org.id).eq('role', 'landlord');
      setLandlords((lls || []).map((l: any) => ({ user_id: l.user_id, email: l.user_id.slice(0, 8) + '…' })));
    }
    setLoading(false);
  }, [org?.id, landlordUserId, canManage]);
  useEffect(() => { load(); }, [load]);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const { error } = await (supabase as any).rpc('generate_payout_run', {
        _org_id: org!.id, _landlord_user_id: form.landlord,
        _period_start: form.start, _period_end: form.end,
      });
      if (error) throw error;
      setForm({ landlord: '', start: '', end: '' });
      await load();
    } catch (e: any) { setErr(e?.message || 'Failed'); } finally { setBusy(false); }
  };

  const markPaid = async (id: string) => {
    const { error } = await (supabase as any).rpc('mark_payout_run_paid', { _run_id: id, _notes: null });
    if (error) alert(error.message); else await load();
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <form onSubmit={generate} className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-slate-500 mb-1">Landlord</label>
            <select required value={form.landlord} onChange={e => setForm({ ...form, landlord: e.target.value })} className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded">
              <option value="">Select…</option>
              {landlords.map(l => <option key={l.user_id} value={l.user_id}>{l.email}</option>)}
            </select>
          </div>
          <div><label className="block text-xs text-slate-500 mb-1">From</label><input required type="date" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-300 rounded" /></div>
          <div><label className="block text-xs text-slate-500 mb-1">To</label><input required type="date" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} className="px-2 py-1.5 text-sm border border-slate-300 rounded" /></div>
          <button disabled={busy} className="px-3 py-1.5 text-sm rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60">{busy ? '…' : 'Generate run'}</button>
          {err && <div className="w-full text-xs text-rose-600">{err}</div>}
        </form>
      )}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-4 border-b border-slate-200"><h3 className="text-sm font-semibold">Payout runs</h3></div>
        {loading ? <div className="p-6 text-sm text-slate-400">Loading…</div> :
          rows.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No payout runs yet.</div> :
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5">Period</th>
                    <th className="text-right px-4 py-2.5">Collected</th>
                    <th className="text-right px-4 py-2.5">Fee</th>
                    <th className="text-right px-4 py-2.5">Payout</th>
                    <th className="text-left px-4 py-2.5">Status</th>
                    {canManage && <th className="px-4 py-2.5"></th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5">{r.period_start} → {r.period_end}</td>
                      <td className="px-4 py-2.5 text-right">{fmtKES(Number(r.total_collected))}</td>
                      <td className="px-4 py-2.5 text-right text-amber-600">{fmtKES(Number(r.total_fee))}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600 font-semibold">{fmtKES(Number(r.total_payout))}</td>
                      <td className="px-4 py-2.5 text-xs"><span className="px-2 py-0.5 rounded bg-slate-100">{r.status}</span></td>
                      {canManage && (
                        <td className="px-4 py-2.5 text-right">
                          {r.status !== 'paid' && <button onClick={() => markPaid(r.id)} className="text-xs px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-800">Mark paid</button>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        }
      </div>
    </div>
  );
};
