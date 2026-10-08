import React, { useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { supabase } from '@/utils/supabaseClient';
import { determinePayee, PAYEE_AGENCY } from '@/utils/paymentRouting';

/**
 * Partial RMS: because tenants always pay into their landlord's paybill, the
 * agency's cut (management fee, placement fee, agency-designated fines, etc.)
 * sits inside the landlord shortcode until it is swept out via M-Pesa B2B.
 *
 * This panel:
 *   - lists each landlord paybill together with the outstanding agency-owed
 *     amount computed from recent payment history
 *   - lets an admin trigger the `mpesa-b2b-payout` edge function once per row
 */
const AgencyFeeSweepPanel: React.FC = () => {
    const { landlords, properties, tenants } = useData();
    const [busyId, setBusyId] = useState<string | null>(null);
    const [flash, setFlash] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

    const rows = useMemo(() => {
        return landlords.map((landlord) => {
            const cfg: any = (landlord as any).mpesaConfig || {};
            const shortcode: string = String(cfg.shortcode || cfg.paybill || (landlord as any).landlordPaybill || '').trim();
            const props = properties.filter((p) => p.landlordId === landlord.id);
            const propIds = new Set(props.map((p) => p.id));

            let agencyOwed = 0;
            tenants.forEach((t) => {
                if (!t.propertyId || !propIds.has(t.propertyId)) return;
                const prop = props.find((p) => p.id === t.propertyId);
                (t.paymentHistory || []).forEach((row: any) => {
                    const amt = Number(row.amount || 0);
                    if (!Number.isFinite(amt) || amt <= 0) return;
                    const alreadySwept = row.agencySwept === true || String(row.method || '').includes('B2B');
                    if (alreadySwept) return;
                    const cat = String(row.category || row.type || 'rent');
                    const isFirstMonth = /placement|1st\s*month|first\s*month/i.test(cat);
                    const payee = determinePayee(cat, prop, isFirstMonth);
                    if (payee === PAYEE_AGENCY) agencyOwed += amt;
                });
            });

            return { landlord, shortcode, propertyCount: props.length, agencyOwed };
        }).filter((r) => r.agencyOwed > 0 && r.shortcode);
    }, [landlords, properties, tenants]);

    const totalOwed = rows.reduce((s, r) => s + r.agencyOwed, 0);

    const sweep = async (row: (typeof rows)[number]) => {
        setBusyId(row.landlord.id);
        setFlash(null);
        try {
            const { data, error } = await supabase.functions.invoke('mpesa-b2b-payout', {
                body: {
                    amount: Math.min(150_000, Math.round(row.agencyOwed)),
                    fromShortcode: row.shortcode,
                    accountReference: `AGCY-${row.landlord.id.slice(0, 8)}`,
                    remarks: `Agency fee sweep from ${row.landlord.name}`,
                },
            });
            if (error) throw error;
            setFlash({ id: row.landlord.id, ok: (data as any)?.ok !== false, msg: 'Sweep initiated. Safaricom will confirm asynchronously.' });
        } catch (e: any) {
            setFlash({ id: row.landlord.id, ok: false, msg: e?.message || 'Sweep failed' });
        } finally {
            setBusyId(null);
        }
    };

    if (!landlords.length) return null;

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-indigo-100 overflow-hidden">
            <div className="p-5 bg-gradient-to-r from-indigo-50 to-white border-b border-indigo-100 flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-bold text-indigo-900">Agency Fee Sweep · M-Pesa B2B</h2>
                    <p className="text-xs text-indigo-700/80 mt-1">
                        Tenants pay directly into each landlord's paybill. Sweep the agency's share back to the agency paybill in one click.
                    </p>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-[10px] font-bold uppercase text-indigo-600 tracking-wide">Total pending</div>
                    <div className="text-xl font-black text-indigo-900">KES {Math.round(totalOwed).toLocaleString()}</div>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase text-xs">Landlord</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase text-xs">Paybill</th>
                            <th className="px-4 py-2 text-center font-medium text-gray-500 uppercase text-xs">Properties</th>
                            <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase text-xs">Agency Due</th>
                            <th className="px-4 py-2 text-right font-medium text-gray-500 uppercase text-xs">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.length === 0 && (
                            <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-sm">No pending agency-owed balances across landlord paybills.</td></tr>
                        )}
                        {rows.map((r) => (
                            <tr key={r.landlord.id} className="hover:bg-indigo-50/40">
                                <td className="px-4 py-3 font-semibold text-gray-800">{r.landlord.name}</td>
                                <td className="px-4 py-3 font-mono text-xs text-indigo-700">{r.shortcode}</td>
                                <td className="px-4 py-3 text-center text-gray-600">{r.propertyCount}</td>
                                <td className="px-4 py-3 text-right font-bold text-indigo-800">KES {Math.round(r.agencyOwed).toLocaleString()}</td>
                                <td className="px-4 py-3 text-right">
                                    <button
                                        onClick={() => sweep(r)}
                                        disabled={busyId === r.landlord.id}
                                        className="text-xs font-bold bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        {busyId === r.landlord.id ? 'Sweeping…' : 'Sweep to Agency'}
                                    </button>
                                    {flash?.id === r.landlord.id && (
                                        <div className={`text-[11px] mt-1 ${flash.ok ? 'text-emerald-700' : 'text-red-600'}`}>{flash.msg}</div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AgencyFeeSweepPanel;
