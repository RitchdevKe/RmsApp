import React from 'react';
import Icon from '../Icon';
import { printSection } from '../../utils/exportHelper';
import { useData } from '../../context/DataContext';
import { User } from '../../types';

export const LandlordStatement: React.FC<{
    data: any;
    period: string;
    landlord: User;
    landlordProperties?: { id: string; name: string }[];
    selectedPropertyId?: string;
    onSelectProperty?: (id: string) => void;
    totalUnits?: number;
    occupiedUnits?: number;
}> = ({ data, period, landlord, landlordProperties = [], selectedPropertyId = 'all', onSelectProperty, totalUnits = 0, occupiedUnits = 0 }) => {
    const { systemSettings } = useData();
    const companyName: string = systemSettings?.companyName || 'TaskMe Realty';
    const companyAddress: string = systemSettings?.address || '';
    const companyPhone: string = systemSettings?.phone || '';
    const companyLogo: string | null = systemSettings?.logo || null;

    const revenue = Number(data.grossRevenueMonth) || 0;
    const actualCollected = Number(data.actualCollectedMonth) || 0;
    const deductions = Number(data.monthlyDeductions) || 0;
    const netIncome = actualCollected - deductions;
    const expected = Number(data.expectedRevenueMonth) || 0;
    const unpaid = Number(data.unpaidRevenue) || Math.max(0, expected - revenue);
    const collectionPct = expected > 0 ? Math.min(100, Math.round((actualCollected / expected) * 100)) : 0;
    const statusLabel: 'PAID' | 'UNPAID' = unpaid > 0 ? 'UNPAID' : 'PAID';
    const statusTone = statusLabel === 'PAID' ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-rose-100 text-rose-700 ring-rose-200';

    // Group deductions by category, with subtotals
    const groupedDeductions = React.useMemo(() => {
        const groups: Record<string, { items: Array<{ description: string; amount: number; propertyName?: string }>; total: number }> = {};
        (data.detailedDeductions || []).forEach((d: any) => {
            const k = d.category || 'Other';
            if (!groups[k]) groups[k] = { items: [], total: 0 };
            groups[k].items.push({ description: d.description, amount: Number(d.amount) || 0, propertyName: d.propertyName });
            groups[k].total += Number(d.amount) || 0;
        });
        return Object.entries(groups).sort((a, b) => b[1].total - a[1].total);
    }, [data.detailedDeductions]);

    const reference = `IS-${(landlord.id || '').toString().slice(-6).toUpperCase() || '------'}-${period.replace(/\s+/g, '').toUpperCase()}`;

    const handlePrint = () => {
        printSection('printable-income-statement', `Income Statement - ${landlord.name} - ${period}`);
    };

    const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    return (
        <div className="w-full animate-fade-in flex flex-col h-full bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
            {/* Toolbar (not printed) */}
            <div className="px-5 py-3 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                <div className="flex items-center gap-2">
                    <Icon name="reports" className="w-5 h-5 text-primary" />
                    <h3 className="font-semibold text-slate-800 text-sm">Income Statement · {period}</h3>
                </div>
                <div className="flex items-center gap-3">
                    {landlordProperties.length > 1 && onSelectProperty && (
                        <label className="flex items-center gap-2 text-xs text-slate-600 print:hidden">
                            <span className="font-semibold">Property:</span>
                            <select
                                value={selectedPropertyId}
                                onChange={e => onSelectProperty(e.target.value)}
                                className="p-1.5 border border-slate-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="all">All Properties (Consolidated)</option>
                                {landlordProperties.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </label>
                    )}
                    <button onClick={handlePrint} className="px-4 py-1.5 bg-primary text-white rounded-md font-medium flex items-center hover:bg-primary-dark shadow-sm text-xs transition-colors">
                        <Icon name="reports" className="w-4 h-4 mr-2" /> Print Statement
                    </button>
                </div>
            </div>

            {/* Document area */}
            <div className="p-6 overflow-auto flex-grow bg-slate-100">
                <div
                    id="printable-income-statement"
                    className="mx-auto bg-white rounded-xl border-2 border-slate-200 shadow-sm overflow-hidden"
                    style={{ maxWidth: '850px' }}
                >
                    {/* Letterhead band */}
                    <div className="bg-gradient-to-r from-primary to-primary-dark text-white px-8 py-6 flex justify-between items-center">
                        <div className="flex items-center gap-6">
                            <div className="w-28 h-28 rounded-2xl bg-white/95 flex flex-shrink-0 items-center justify-center overflow-hidden shadow-md ring-2 ring-white/50">
                                {companyLogo ? (
                                    <img src={companyLogo} alt={`${companyName} logo`} className="w-full h-full object-contain p-2" />
                                ) : (
                                    <div className="flex flex-col items-center justify-center">
                                        <span className="text-primary font-black text-4xl tracking-tight">TM</span>
                                        <span className="text-primary/70 font-bold text-[10px] tracking-[0.2em] -mt-1">HOLDINGS</span>
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col justify-center">
                                <h1 className="text-xl font-extrabold tracking-tight leading-tight uppercase text-amber-300">TASK-ME HOLDINGS LIMITED</h1>
                                <p className="text-[13px] text-white/95 mt-0.5 font-bold tracking-tight uppercase">COMPREHENSIVE PROPERTY MANAGEMENT</p>
                                <p className="text-[11px] text-white/80 mt-2 flex flex-col gap-0.5">
                                    <span className="flex items-center gap-1">P. O BOX 2150 - 20200</span>
                                    <span className="flex items-center gap-1">EMAIL: property@task-me.ke</span>
                                    <span className="flex items-center gap-1">Tel: 0736 712 300</span>
                                </p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-200 font-bold mb-1">
                                {data.isOccupancyBased ? 'Occupancy Based' : 'Collection Based'}
                            </p>
                            <h2 className="text-lg font-bold uppercase tracking-wide leading-tight">Income Statement</h2>
                            <p className="text-[11px] text-white/85 mt-1">Period · <strong>{period}</strong></p>
                            <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider ring-1 bg-white/90 ${statusTone.replace('bg-emerald-100', 'text-emerald-700').replace('bg-amber-100', 'text-amber-700').replace('bg-slate-100', 'text-slate-700')}`}>
                                ● {statusLabel}
                            </span>
                        </div>
                    </div>

                    <div className="relative p-8 space-y-6">
                        {/* Watermark */}
                        <div aria-hidden className="pointer-events-none select-none absolute inset-0 flex items-center justify-center opacity-[0.04]">
                            <span className="text-[110px] font-black uppercase tracking-tighter text-slate-900 -rotate-12">{statusLabel}</span>
                        </div>
                        <div className="relative">
                            {/* Bill-to + meta */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Prepared for</p>
                                    <h3 className="text-base font-bold text-slate-900">{landlord.name}</h3>
                                    <p className="text-xs text-slate-600 mt-0.5">{landlord.email}</p>
                                    <p className="text-xs text-slate-600">{landlord.phone}</p>
                                </div>
                                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Statement details</p>
                                    <div className="text-xs text-slate-700 space-y-0.5">
                                        <p><span className="text-slate-500">Issued</span> · {fmtDate(new Date())}</p>
                                        <p><span className="text-slate-500">Reference</span> · {reference}</p>
                                        <p><span className="text-slate-500">Currency</span> · KES</p>
                                    </div>
                                </div>
                            </div>

                            {/* KPI strip */}
                            <div className="grid grid-cols-4 gap-3 mt-6">
                                <div className="rounded-lg border border-slate-200 p-3">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider" title="Total expected from all occupied units">Expected Collection</p>
                                    <p className="text-base font-bold text-slate-900 mt-1">KES {expected.toLocaleString()}</p>
                                </div>
                                <div className="rounded-lg border border-cyan-200 bg-cyan-50/40 p-3">
                                    <p className="text-[10px] text-cyan-700 uppercase font-bold tracking-wider">MTD Actual Collection</p>
                                    <p className="text-base font-bold text-cyan-700 mt-1">KES {actualCollected.toLocaleString()}</p>
                                </div>
                                <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3">
                                    <p className="text-[10px] text-rose-600 uppercase font-bold tracking-wider">Deductions</p>
                                    <p className="text-base font-bold text-rose-700 mt-1">KES {deductions.toLocaleString()}</p>
                                </div>
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                                    <p className="text-[10px] text-emerald-700 uppercase font-bold tracking-wider">Payout</p>
                                    <p className="text-base font-bold text-emerald-700 mt-1">KES {netIncome.toLocaleString()}</p>
                                </div>
                            </div>

                            {/* Collection performance */}
                            {expected > 0 && (
                                <div className="rounded-lg border border-slate-200 bg-white p-4 mt-6">
                                    <div className="flex justify-between items-baseline mb-2">
                                        <p className="text-[11px] text-slate-600 uppercase font-bold tracking-wider">Collection Performance</p>
                                        <p className="text-xs text-slate-500">
                                            KES {actualCollected.toLocaleString()} <span className="text-slate-400">of</span> KES {expected.toLocaleString()} expected
                                        </p>
                                    </div>
                                    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${collectionPct >= 90 ? 'bg-emerald-500' : collectionPct >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                            style={{ width: `${collectionPct}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between mt-1.5 text-[11px]">
                                        <span className="font-bold text-slate-700">{collectionPct}% collected</span>
                                        {unpaid > 0 && (
                                            <span className="text-rose-600">KES {unpaid.toLocaleString()} outstanding</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Occupancy */}
                            {totalUnits > 0 && (
                                <div className="rounded-lg border border-slate-200 bg-white p-4 mt-6">
                                    <div className="flex justify-between items-baseline mb-2">
                                        <p className="text-[11px] text-slate-600 uppercase font-bold tracking-wider">Occupancy</p>
                                        <p className="text-xs text-slate-500">
                                            {occupiedUnits} <span className="text-slate-400">of</span> {totalUnits} units occupied
                                        </p>
                                    </div>
                                    {(() => {
                                        const occPct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
                                        return (
                                            <>
                                                <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${occPct >= 90 ? 'bg-emerald-500' : occPct >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                        style={{ width: `${occPct}%` }}
                                                    />
                                                </div>
                                                <div className="flex justify-between mt-1.5 text-[11px]">
                                                    <span className="font-bold text-slate-700">{occPct}% occupied</span>
                                                    {(totalUnits - occupiedUnits) > 0 && (
                                                        <span className="text-rose-600">{totalUnits - occupiedUnits} vacant</span>
                                                    )}
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}

                            {/* Financial Table */}
                            <div className="rounded-lg border border-slate-200 overflow-hidden mt-6">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50">
                                        <tr className="border-b border-slate-200">
                                            <th className="text-left px-4 py-2.5 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">Description</th>
                                            <th className="text-left px-4 py-2.5 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">Category</th>
                                            <th className="text-left px-4 py-2.5 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">Property</th>
                                            <th className="text-right px-4 py-2.5 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">Amount (KES)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {Array.isArray(data.revenueByProperty) && data.revenueByProperty.length > 0 ? (
                                            <>
                                                <tr className="bg-emerald-50/60">
                                                    <td colSpan={4} className="px-4 py-2 text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Gross Rental Revenue</td>
                                                </tr>
                                                {data.revenueByProperty.map((rp: any) => (
                                                    <tr key={rp.propertyId} className="bg-white hover:bg-slate-50">
                                                        <td className="px-4 py-2 pl-6 text-slate-700">Rental Revenue</td>
                                                        <td className="px-4 py-2 text-slate-500 text-xs">Rent</td>
                                                        <td className="px-4 py-2 text-slate-700 text-xs font-medium">{rp.propertyName}</td>
                                                        <td className="px-4 py-2 text-right text-slate-900 tabular-nums">{(Number(rp.amount) || 0).toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-white">
                                                    <td className="px-4 py-2 pl-6 text-xs font-semibold text-slate-700 italic" colSpan={3}>Subtotal · Gross Rental Revenue</td>
                                                    <td className="px-4 py-2 text-right text-xs font-bold text-emerald-700 tabular-nums">{revenue.toLocaleString()}</td>
                                                </tr>
                                            </>
                                        ) : (
                                            <tr className="bg-white">
                                                <td className="px-4 py-3 font-semibold text-slate-800" colSpan={3}>Gross Rental Revenue</td>
                                                <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">{revenue.toLocaleString()}</td>
                                            </tr>
                                        )}

                                        {groupedDeductions.length > 0 && (
                                            <tr className="bg-rose-50/60 border-t border-slate-200">
                                                <td colSpan={4} className="px-4 py-2 text-[10px] font-bold text-rose-700 uppercase tracking-wider">Less: Deductions</td>
                                            </tr>
                                        )}

                                        {groupedDeductions.map(([cat, group]) => (
                                            <React.Fragment key={cat}>
                                                <tr className="bg-slate-50/60">
                                                    <td colSpan={4} className="px-4 py-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">{cat}</td>
                                                </tr>
                                                {group.items.map((item: any, idx: number) => (
                                                    <tr key={`${cat}-${idx}`} className="hover:bg-slate-50">
                                                        <td className="px-4 py-2 pl-6 text-slate-700">{item.description}</td>
                                                        <td className="px-4 py-2 text-slate-500 text-xs">{cat}</td>
                                                        <td className="px-4 py-2 text-slate-500 text-xs">{item.propertyName || '—'}</td>
                                                        <td className="px-4 py-2 text-right text-rose-600 tabular-nums">({item.amount.toLocaleString()})</td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-white border-b border-slate-100 last:border-0">
                                                    <td className="px-4 py-2 pl-6 text-xs font-semibold text-slate-600 italic" colSpan={3}>Subtotal · {cat}</td>
                                                    <td className="px-4 py-2 text-right text-xs font-bold text-rose-700 tabular-nums">({group.total.toLocaleString()})</td>
                                                </tr>
                                            </React.Fragment>
                                        ))}

                                        {groupedDeductions.length === 0 && (
                                            <tr>
                                                <td colSpan={4} className="px-4 py-3 text-center text-xs text-slate-400 italic">No deductions for this period</td>
                                            </tr>
                                        )}

                                        <tr className="bg-slate-50 border-t border-slate-200">
                                            <td className="px-4 py-3 font-semibold text-slate-700" colSpan={3}>Total Deductions</td>
                                            <td className="px-4 py-3 text-right font-bold text-rose-700 tabular-nums">({deductions.toLocaleString()})</td>
                                        </tr>

                                        <tr className="bg-emerald-50 border-t-2 border-emerald-600">
                                            <td className="px-4 py-4 font-extrabold uppercase text-emerald-900 tracking-wide" colSpan={3}>Net Income (Payout)</td>
                                            <td className="px-4 py-4 text-right font-extrabold text-emerald-700 text-base tabular-nums">KES {netIncome.toLocaleString()}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Payout instructions */}
                            <div className="grid grid-cols-3 gap-3 mt-6">
                                <div className="col-span-2 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">Payout instructions</p>
                                    <p className="text-xs text-slate-700 leading-relaxed">
                                        Net payout of <strong className="text-emerald-700">KES {netIncome.toLocaleString()}</strong> will be remitted to the landlord's bank/mobile money account on file.
                                        Please quote reference <strong>{reference}</strong> for any inquiries.
                                    </p>
                                    {companyPhone && (
                                        <p className="text-[11px] text-slate-500 mt-2">For queries, contact {companyName} · {companyPhone}</p>
                                    )}
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-3 flex flex-col items-center justify-center">
                                    <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider mb-2">Verify</p>
                                    {/* Lightweight barcode-style strip — deterministic from reference */}
                                    <div className="flex items-end gap-[2px] h-10">
                                        {Array.from(reference).map((ch, i) => {
                                            const code = ch.charCodeAt(0);
                                            const w = (code % 3) + 1;
                                            const h = 60 + ((code * (i + 1)) % 40);
                                            return <span key={i} className="bg-slate-900 block" style={{ width: `${w}px`, height: `${h}%` }} />;
                                        })}
                                    </div>
                                    <p className="text-[9px] text-slate-500 font-mono mt-1 tracking-tight">{reference}</p>
                                </div>
                            </div>

                            {/* Signature block */}
                            <div className="grid grid-cols-2 gap-8 pt-8">
                                <div>
                                    <div className="h-10 border-b border-slate-300"></div>
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">Prepared by · {companyName}</p>
                                </div>
                                <div>
                                    <div className="h-10 border-b border-slate-300"></div>
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">Received by · Landlord</p>
                                </div>
                            </div>

                            <div className="text-[10px] text-slate-400 text-center border-t border-slate-100 pt-4 mt-6">
                                <p>Generated on {fmtDate(new Date())} · This is a computer generated document and does not require a signature.</p>
                                <p className="mt-1 font-medium text-slate-500">Property@taskmeholdings.com</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
