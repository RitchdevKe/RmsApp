import React, { useEffect, useState } from 'react';
import { supabase } from '../../src/integrations/supabase/client';
import { useOrg } from '../../context/OrgContext';
import { fmtKES } from './PartialHeader';

interface Props { landlordUserId: string | null; }
interface Row {
  id: string; amount: number; paid_at: string; payer_name: string | null;
  mpesa_receipt: string | null; unit_tag: string | null;
  landlord_payout_amount: number; mgmt_fee_amount: number; status: string;
}

export const PaymentsTable: React.FC<Props> = ({ landlordUserId }) => {
  const { org } = useOrg();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!org?.id) return;
    (async () => {
      setLoading(true);
      let leaseIds: string[] | null = null;
      if (landlordUserId) {
        const { data: props } = await (supabase as any).from('properties').select('id')
          .eq('org_id', org.id).eq('landlord_user_id', landlordUserId);
        const propIds = (props || []).map((p: any) => p.id);
        if (propIds.length === 0) { setRows([]); setLoading(false); return; }
        const { data: us } = await (supabase as any).from('units').select('id').in('property_id', propIds);
        const unitIds = (us || []).map((u: any) => u.id);
        if (unitIds.length === 0) { setRows([]); setLoading(false); return; }
        const { data: ls } = await (supabase as any).from('leases').select('id').in('unit_id', unitIds);
        leaseIds = (ls || []).map((l: any) => l.id);
        if (leaseIds!.length === 0) { setRows([]); setLoading(false); return; }
      }
      let q = (supabase as any).from('partial_payments')
        .select('id,amount,paid_at,payer_name,mpesa_receipt,unit_tag,landlord_payout_amount,mgmt_fee_amount,status')
        .eq('org_id', org.id).order('paid_at', { ascending: false }).limit(200);
      if (leaseIds) q = q.in('lease_id', leaseIds);
      const { data } = await q;
      setRows(data || []); setLoading(false);
    })();
  }, [org?.id, landlordUserId]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="px-5 py-4 border-b border-slate-200">
        <h3 className="text-sm font-semibold">Payments</h3>
      </div>
      {loading ? <div className="p-6 text-sm text-slate-400">Loading…</div> :
        rows.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">No payments yet.</div> :
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-left px-4 py-2.5">Unit</th>
                  <th className="text-left px-4 py-2.5">Tenant</th>
                  <th className="text-left px-4 py-2.5">Receipt</th>
                  <th className="text-right px-4 py-2.5">Amount</th>
                  <th className="text-right px-4 py-2.5">Fee</th>
                  <th className="text-right px-4 py-2.5">Payout</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 text-slate-600">{new Date(p.paid_at).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{p.unit_tag || '—'}</td>
                    <td className="px-4 py-2.5">{p.payer_name || '—'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{p.mpesa_receipt || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{fmtKES(Number(p.amount))}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600">{fmtKES(Number(p.mgmt_fee_amount))}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-600">{fmtKES(Number(p.landlord_payout_amount))}</td>
                    <td className="px-4 py-2.5 text-xs"><span className="px-2 py-0.5 rounded bg-slate-100">{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      }
    </div>
  );
};
