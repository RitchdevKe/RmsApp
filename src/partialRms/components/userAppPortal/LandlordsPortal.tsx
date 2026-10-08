
import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as LucideIcons from 'lucide-react';

import { useData } from '../../context/DataContext';
import { useProfileDisplay } from '@/hooks/useProfileDisplay';
import { Property, Unit, User, Task, Bill, Fund, Investment, TenantProfile, LandlordApplication } from '@/types';
import Icon from '../Icon';
import { exportToCSV, printSection } from '@/utils/exportHelper';
import { websiteLinks } from '@/utils/websiteLinks';
import { fmtDate } from '@/utils/date';
import { sumPaidPaymentsForMonth, getRecognizedRentForMonth } from '@/utils/paymentReporting';
import { computeTenantCardBalance } from '@/utils/tenantCardBalance';
import { isRepurposedUnit, countUnitBuckets } from '@/utils/repurposedUnits';
import { supabase } from '../../utils/supabaseClient';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement, Filler } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { NewApplicationModal, ExtendedLandlordApp } from '../landlords/Applications';
import { IncomeStatementModal } from '@/components/landlords/ActiveLandlords';
import PortalShell from '@/components/userAppPortal/PortalShell';
import { usePortalGrowthActions } from '@/components/userAppPortal/PortalGrowthModals';
import ReferralFliers from '@/components/userAppPortal/ReferralFliers';
import ReferralCalculator from '@/components/userAppPortal/ReferralCalculator';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

// --- Helper Components ---

const ChartContainer: React.FC<{ type: 'line' | 'bar'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
    return (
        <div className={`relative ${height} w-full`}>
            {type === 'line' ? <Line data={data} options={options} /> : <Bar data={data} options={options} />}
        </div>
    );
};

const MetricCard: React.FC<{ title: string; value: string; subtext?: string; color: 'blue' | 'green' | 'red' | 'orange' | 'indigo' | 'purple'; iconNode?: React.ReactNode }> = ({ title, value, subtext, color, iconNode }) => {
    const colors = {
        blue:   { ring: 'ring-blue-100',   grad: 'from-blue-500 to-sky-500',         text: 'text-blue-700',   soft: 'bg-blue-50' },
        green:  { ring: 'ring-emerald-100', grad: 'from-emerald-500 to-teal-500',     text: 'text-emerald-700', soft: 'bg-emerald-50' },
        red:    { ring: 'ring-rose-100',   grad: 'from-rose-500 to-red-500',          text: 'text-rose-700',   soft: 'bg-rose-50' },
        orange: { ring: 'ring-amber-100',  grad: 'from-amber-500 to-orange-500',      text: 'text-amber-700',  soft: 'bg-amber-50' },
        indigo: { ring: 'ring-indigo-100', grad: 'from-indigo-500 to-violet-500',     text: 'text-indigo-700', soft: 'bg-indigo-50' },
        purple: { ring: 'ring-purple-100', grad: 'from-purple-500 to-fuchsia-500',    text: 'text-purple-700', soft: 'bg-purple-50' },
    } as const;
    const c = colors[color];
    return (
        <div className={`group relative overflow-hidden p-4 rounded-2xl bg-white ring-1 ${c.ring} shadow-[0_4px_14px_-6px_rgba(15,23,42,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-12px_rgba(15,23,42,0.18)]`}>
            <span aria-hidden className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${c.grad}`} />
            <span aria-hidden className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full bg-gradient-to-br ${c.grad} opacity-[0.07] blur-xl group-hover:opacity-[0.14] transition-opacity`} />
            <div className="flex items-start justify-between mb-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</p>
                {iconNode && (
                    <span className={`w-8 h-8 rounded-xl ${c.soft} ${c.text} flex items-center justify-center ring-1 ${c.ring}`}>
                        <span className="w-4 h-4">{iconNode}</span>
                    </span>
                )}
            </div>
            <p className="text-2xl font-extrabold text-gray-900 tracking-tight">{value}</p>
            {subtext && <p className="text-xs mt-1 text-gray-500">{subtext}</p>}
        </div>
    );
};

const AIInsightCard: React.FC<{ title: string; description: string; type: 'success' | 'warning' | 'info' | 'critical'; icon: string }> = ({ title, description, type, icon }) => {
    const styles: Record<string, { wrap: string; pill: string; iconBg: string }> = {
        success:  { wrap: 'from-emerald-400/20 to-emerald-300/5 ring-emerald-300/30',  pill: 'bg-emerald-400/20 text-emerald-50',  iconBg: 'bg-emerald-500/30 text-emerald-50' },
        warning:  { wrap: 'from-amber-400/20 to-amber-300/5 ring-amber-300/30',         pill: 'bg-amber-400/20 text-amber-50',      iconBg: 'bg-amber-500/30 text-amber-50' },
        info:     { wrap: 'from-sky-400/20 to-sky-300/5 ring-sky-300/30',               pill: 'bg-sky-400/20 text-sky-50',          iconBg: 'bg-sky-500/30 text-sky-50' },
        critical: { wrap: 'from-rose-400/25 to-rose-300/5 ring-rose-300/30',            pill: 'bg-rose-400/25 text-rose-50',        iconBg: 'bg-rose-500/30 text-rose-50' },
    };
    const s = styles[type] || styles.info;
    return (
        <div className={`relative p-4 rounded-2xl bg-gradient-to-br ${s.wrap} backdrop-blur-sm ring-1 ${s.pill} flex items-start gap-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]`}>
            <div className={`flex-shrink-0 w-9 h-9 rounded-xl ${s.iconBg} flex items-center justify-center ring-1 ring-white/20`}>
                <Icon name={icon} className="w-4 h-4" />
            </div>
            <div className="min-w-0">
                <h4 className="font-bold text-sm mb-0.5 capitalize tracking-tight">{title}</h4>
                <p className="text-[11px] opacity-90 leading-relaxed">{description}</p>
            </div>
        </div>
    );
};

const UnitBox: React.FC<{ unit: Unit; tenant?: TenantProfile; isNewTenant?: boolean; onManage?: () => void }> = ({ unit, tenant, isNewTenant, onManage }) => {
    const statusColor = useMemo(() => {
        if (isRepurposedUnit(unit)) return 'bg-blue-50 border-blue-300 text-blue-800';
        if (unit.status === 'Under Maintenance') return 'bg-yellow-50 border-yellow-200 text-yellow-800';
        if (unit.status === 'Vacant') return 'bg-red-50 border-red-200 text-red-800';

        if (tenant?.houseStatus?.includes('Distressed')) return 'bg-blue-50 border-blue-300 text-blue-800';
        if (tenant?.houseStatus?.includes('Under Maintenance')) return 'bg-orange-50 border-orange-200 text-orange-800';

        if (tenant?.status === 'Notice') return 'bg-orange-50 border-orange-200 text-orange-800';
        if (tenant?.status === 'Overdue') return 'bg-red-50 border-red-200 text-red-900';
        return 'bg-green-50 border-green-200 text-green-800';
    }, [unit, tenant]);

    const handleClick = () => {
        if (tenant) {
            // Landlords can view tenant details but we route carefully
            // In landlord portal context, we might not want full tenant drill down or just basic info
            // Disabling drill down for now based on "landlord should not be able to change status" implication of restricted access
        } else if (onManage) {
            onManage();
        }
    };

    return (
        <div 
            className={`p-3 rounded-lg border ${statusColor} flex flex-col justify-between h-28 text-xs relative group cursor-default transition-all hover:shadow-md overflow-hidden`} 
            onClick={handleClick}
        >
            <div className="flex justify-between items-start">
                <span className="font-bold text-lg">{unit.unitNumber}</span>
                <span className="opacity-70 bg-white/20 px-1.5 py-0.5 rounded">{unit.bedrooms}BR</span>
            </div>
           
            <div className="mt-1">
                {tenant ? (
                    <>
                        <p className="font-semibold truncate text-sm" title={tenant.name}>{tenant.name}</p>
                        {isNewTenant && (
                            <div className="inline-block bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded mt-1 font-bold uppercase shadow-sm animate-pulse">
                                New Tenant
                            </div>
                        )}
                    </>
                ) : (
                    <span className="italic opacity-80 text-sm font-semibold">{unit.status}</span>
                )}
            </div>

            <div className="mt-auto pt-2 border-t border-black/5 flex justify-between items-center">
                <span className="opacity-80 font-mono">{unit.rent ? `KES ${Number(unit.rent ?? 0).toLocaleString()}` : '-'}</span>
                {tenant?.leaseEnd && (
                    <span className="text-[9px] opacity-70">
                        End: {fmtDate(tenant.leaseEnd)}
                    </span>
                )}
            </div>

            {/* Badges */}
            {(!tenant && unit.status !== 'Occupied' && unit.status !== 'Vacant') && (
                <div className="absolute top-0 right-0 bg-gray-900 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold opacity-80">
                    {unit.status.toUpperCase()}
                </div>
            )}
            {tenant?.status === 'Notice' && (
                <div className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold">
                    VACATING
                </div>
            )}
             {tenant?.status === 'Overdue' && (
                <div className="absolute top-0 right-0 bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold">
                    ARREARS
                </div>
            )}
        </div>
    );
};

// --- Modals ---

const LegacyIncomeStatementModal: React.FC<{ 
    data: any; 
    period: string;
    landlord: User;
    onClose: () => void; 
}> = ({ data, period, landlord, onClose }) => {
    
    const handlePrint = () => {
        printSection('printable-income-statement', `Income Statement - ${landlord.name} - ${period}`);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1400] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[90vh] animate-fade-in">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="font-bold text-gray-800">Statement View</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="p-8 overflow-y-auto flex-grow bg-white" id="printable-income-statement">
                    {/* Header */}
                    <div className="flex justify-between items-start border-b-2 border-primary pb-6 mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-xl bg-primary text-white flex flex-shrink-0 items-center justify-center font-bold text-2xl shadow-sm">
                                TM
                            </div>
                            <div>
                                <h1 className="text-xl font-extrabold text-gray-900 tracking-tight leading-tight uppercase">TASK-ME HOLDINGS LIMITED</h1>
                                <p className="text-[13px] text-primary font-bold uppercase tracking-tight mt-0.5">COMPREHENSIVE PROPERTY MANAGEMENT</p>
                                <div className="text-xs text-gray-500 mt-2 space-y-0.5">
                                    <p className="font-medium text-[11px] text-gray-500">P. O BOX 2150 - 20200</p>
                                    <p className="font-medium text-[11px] text-gray-500">EMAIL: property@task-me.ke</p>
                                    <p className="font-medium text-[11px] text-gray-500">Tel: 0736 712 300</p>
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-wide">Income Statement</h2>
                            <p className="text-sm text-gray-600">Period: <strong>{period}</strong></p>
                        </div>
                    </div>

                    <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-100">
                        <p className="text-xs text-gray-500 uppercase font-bold mb-1">Landlord</p>
                        <h3 className="text-lg font-bold text-gray-900">{landlord.name}</h3>
                        <p className="text-sm text-gray-600">{landlord.phone}</p>
                    </div>

                    {/* Financial Table */}
                    <table className="w-full text-sm mb-6">
                        <thead>
                            <tr className="border-b-2 border-gray-800">
                                <th className="text-left py-2 font-bold text-gray-700 uppercase text-xs">Description</th>
                                <th className="text-left py-2 font-bold text-gray-700 uppercase text-xs">Category</th>
                                <th className="text-left py-2 font-bold text-gray-700 uppercase text-xs">Property</th>
                                <th className="text-right py-2 font-bold text-gray-700 uppercase text-xs">Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            <tr>
                                <td className="py-3 font-bold text-gray-800" colSpan={3}>Gross Rental Revenue</td>
                                <td className="py-3 text-right font-bold text-gray-800">KES {Number(data?.grossRevenueMonth ?? 0).toLocaleString()}</td>
                            </tr>

                            {/* Deductions Breakdown */}
                            {data.detailedDeductions.length > 0 && (
                                <tr className="bg-red-50">
                                    <td colSpan={4} className="py-2 pl-2 text-xs font-bold text-red-800 uppercase tracking-wider">Less: Deductions (per property)</td>
                                </tr>
                            )}

                            {data.detailedDeductions.map((item: any, idx: number) => (
                                <tr key={idx}>
                                    <td className="py-2 pl-4 text-gray-600">{item.description}</td>
                                    <td className="py-2 text-gray-500 text-xs">{item.category}</td>
                                    <td className="py-2 text-gray-500 text-xs">{item.property || '—'}</td>
                                    <td className="py-2 text-right text-red-600">- KES {Number(item?.amount ?? 0).toLocaleString()}</td>
                                </tr>
                            ))}

                            {/* Per-property subtotals when multiple properties */}
                            {(() => {
                                const byProp = new Map<string, number>();
                                (data.detailedDeductions || []).forEach((i: any) => {
                                    const k = i.property || '—';
                                    byProp.set(k, (byProp.get(k) || 0) + (Number(i.amount) || 0));
                                });
                                if (byProp.size < 2) return null;
                                return (
                                    <>
                                        <tr className="bg-amber-50">
                                            <td colSpan={4} className="py-2 pl-2 text-xs font-bold text-amber-800 uppercase tracking-wider">Subtotal by Property</td>
                                        </tr>
                                        {Array.from(byProp.entries()).map(([prop, amt]) => (
                                            <tr key={`sub-${prop}`}>
                                                <td className="py-2 pl-4 text-gray-700 font-medium" colSpan={2}>Subtotal</td>
                                                <td className="py-2 text-gray-700 text-xs font-bold">{prop}</td>
                                                <td className="py-2 text-right text-red-700 font-bold">- KES {Number(amt).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </>
                                );
                            })()}

                            <tr className="border-t-2 border-gray-200">
                                <td className="py-3 font-bold text-gray-700" colSpan={3}>Total Deductions</td>
                                <td className="py-3 text-right font-bold text-red-700">- KES {Number(data?.monthlyDeductions ?? 0).toLocaleString()}</td>
                            </tr>

                            <tr className="bg-gray-100 font-extrabold border-t-2 border-gray-800 text-lg">
                                <td className="py-4 pl-4 uppercase text-gray-900" colSpan={3}>Net Income (Payout)</td>
                                <td className="py-4 text-right pr-4 text-green-700">KES {Number(data?.netIncome ?? 0).toLocaleString()}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="mt-12 text-xs text-gray-400 text-center border-t pt-4">
                        <p>Generated on {fmtDate(new Date())}</p>
                        <p>This is a computer generated document and does not require a signature.</p>
                    </div>
                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md font-medium hover:bg-gray-300">Close</button>
                    <button onClick={handlePrint} className="px-4 py-2 bg-primary text-white rounded-md font-medium flex items-center hover:bg-primary-dark shadow-sm">
                        <Icon name="download" className="w-4 h-4 mr-2" /> Print / PDF
                    </button>
                </div>
            </div>
        </div>
    );
};
export const NewRequestModal: React.FC<{ 
    type: 'General' | 'Maintenance' | 'Eviction';
    landlord: User;
    onClose: () => void;
    onSubmit: (req: any) => void;
}> = ({ type, landlord, onClose, onSubmit }) => {
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [property, setProperty] = useState('');

    const handleSubmit = () => {
        onSubmit({ title, description: desc, property, type });
    };

    const typeMeta = {
        General:     { tone: 'from-sky-600 to-indigo-600',     icon: <LucideIcons.MessageSquare className="w-5 h-5" />, blurb: 'Send a general note to your account manager.' },
        Maintenance: { tone: 'from-amber-500 to-orange-600',   icon: <LucideIcons.Wrench className="w-5 h-5" />,         blurb: 'Flag a unit that needs attention or repairs.' },
        Eviction:    { tone: 'from-rose-600 to-red-700',       icon: <LucideIcons.ShieldAlert className="w-5 h-5" />,    blurb: 'Initiate the eviction workflow for a tenant.' },
    } as const;
    const meta = typeMeta[type];

    return (
        <div className="fixed inset-0 z-[1400] flex justify-end">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
            <div className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col animate-slide-in-right">
                <div className={`relative px-6 py-5 text-white bg-gradient-to-br ${meta.tone} overflow-hidden`}>
                    <div aria-hidden className="absolute -right-6 -bottom-8 opacity-15">
                        <LucideIcons.Sparkles className="w-32 h-32" strokeWidth={1.2} />
                    </div>
                    <div className="relative flex items-start justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/25">
                                {meta.icon}
                            </div>
                            <div>
                                <p className="text-[11px] uppercase tracking-widest opacity-80 font-bold">New Request</p>
                                <h3 className="text-lg font-extrabold tracking-tight">{type} Request</h3>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"><Icon name="close" className="w-5 h-5" /></button>
                    </div>
                    <p className="relative text-xs opacity-90 mt-3">{meta.blurb}</p>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 bg-gray-50/40">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Subject</label>
                        <input placeholder="E.g. Roof leak in Block C" value={title} onChange={e => setTitle(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition"/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Property (optional)</label>
                        <input placeholder="Property name" value={property} onChange={e => setProperty(e.target.value)} className="w-full p-3 border border-gray-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition"/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Details</label>
                        <textarea placeholder="Describe the request — include unit numbers, dates, and any context that helps us act faster." value={desc} onChange={e => setDesc(e.target.value)} rows={6} className="w-full p-3 border border-gray-200 rounded-xl bg-white text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary outline-none transition resize-none"/>
                    </div>
                    <div className="text-[11px] text-gray-500 bg-white border border-gray-100 rounded-xl p-3 flex items-start gap-2">
                        <LucideIcons.Info className="w-4 h-4 mt-0.5 text-sky-500 flex-shrink-0" />
                        <span>Your account manager is notified instantly and will respond within <strong>1 business day</strong>.</span>
                    </div>
                </div>
                <div className="px-6 py-4 border-t border-gray-100 bg-white flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-gray-700 rounded-xl hover:bg-gray-100 transition">Cancel</button>
                    <button onClick={handleSubmit} className={`px-5 py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r ${meta.tone} shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all`}>Submit Request</button>
                </div>
            </div>
        </div>
    );
};
export const LandlordInvestModal: React.FC<{ 
    fund: Fund; 
    landlordName: string;
    onClose: () => void; 
    onConfirm: (amount: number) => void;
}> = ({ fund, landlordName, onClose, onConfirm }) => {
    const [amount, setAmount] = useState('');
    const [step, setStep] = useState<'input' | 'success'>('input');

    const handleInvest = () => {
        if (!amount || parseFloat(amount) <= 0) return alert("Enter a valid amount");
        setTimeout(() => { setStep('success'); }, 800);
    };

    const handleFinish = () => { onConfirm(parseFloat(amount)); };

    const quickAmounts = [10000, 25000, 50000, 100000];

    return (
        <div className="fixed inset-0 z-[1500] flex justify-end">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
            <div className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col animate-slide-in-right">
                <div className="relative px-6 py-6 text-white bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-700 overflow-hidden">
                    <div aria-hidden className="absolute -right-10 -bottom-12 opacity-15">
                        <LucideIcons.TrendingUp className="w-44 h-44" strokeWidth={1.2} />
                    </div>
                    <div className="relative flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center ring-1 ring-white/25">
                                <LucideIcons.Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[11px] uppercase tracking-widest opacity-80 font-bold">Invest in</p>
                                <h3 className="text-lg font-extrabold tracking-tight">{fund.name}</h3>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/15"><Icon name="close" className="w-5 h-5" /></button>
                    </div>
                    <div className="relative grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-white/10 rounded-lg px-3 py-2 ring-1 ring-white/15">
                            <p className="opacity-80">Investor</p>
                            <p className="font-bold truncate">{landlordName}</p>
                        </div>
                        <div className="bg-white/10 rounded-lg px-3 py-2 ring-1 ring-white/15">
                            <p className="opacity-80">Target APY</p>
                            <p className="font-bold">{fund.targetApy}</p>
                        </div>
                    </div>
                </div>

                {step === 'input' ? (
                    <>
                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-gray-50/40">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Investment Amount</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">KES</span>
                                    <input 
                                        type="number" 
                                        value={amount} 
                                        onChange={e => setAmount(e.target.value)} 
                                        className="w-full pl-14 pr-4 py-4 border border-gray-200 rounded-2xl text-2xl font-extrabold tracking-tight bg-white focus:ring-2 focus:ring-emerald-400/40 focus:border-emerald-500 outline-none"
                                        placeholder="50,000"
                                    />
                                </div>
                                <div className="grid grid-cols-4 gap-2 mt-3">
                                    {quickAmounts.map(q => (
                                        <button key={q} onClick={() => setAmount(String(q))} className={`py-2 rounded-xl text-xs font-bold border transition ${String(q) === amount ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-emerald-700'}`}>
                                            {q >= 1000 ? `${q/1000}k` : q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="text-[11px] text-gray-500 bg-white border border-gray-100 rounded-xl p-3 flex items-start gap-2">
                                <LucideIcons.Info className="w-4 h-4 mt-0.5 text-emerald-500 flex-shrink-0" />
                                <span>Funds are deducted from your pending payout or payable via M-Pesa. Investments compound monthly.</span>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 bg-white">
                            <button onClick={handleInvest} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all">
                                Confirm Investment
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-10 bg-gradient-to-b from-white to-emerald-50/40">
                        <div className="relative">
                            <div className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping" />
                            <div className="relative w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center ring-4 ring-emerald-200">
                                <Icon name="check" className="w-10 h-10 text-emerald-600" />
                            </div>
                        </div>
                        <h3 className="text-xl font-extrabold text-gray-900 mt-6">Investment Confirmed</h3>
                        <p className="text-gray-600 mt-2 text-sm">You have invested <strong className="text-emerald-700">KES {parseFloat(amount).toLocaleString()}</strong> in {fund.name}.</p>
                        <button onClick={handleFinish} className="mt-8 px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-black transition">
                            Done
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

// --- Rich Gross Revenue hero card with breakdown (Gross → Deductions → Net) ---
const GrossRevenueHero: React.FC<{
    financials: any;
    occupancyRate: number;
    allTimeRevenue: number;
    monthlyRevenue?: number[];
    propertiesCount: number;
    totalUnits: number;
    onOpenFinancials: () => void;
    onOpenProperties: () => void;
}> = ({ financials, occupancyRate, allTimeRevenue, monthlyRevenue = [], propertiesCount, totalUnits, onOpenFinancials, onOpenProperties }) => {
    const [open, setOpen] = useState(false);
    const [ytdOpen, setYtdOpen] = useState(false);
    const gross = Number(financials?.grossRevenueMonth ?? 0);
    const totalDed = Number(financials?.monthlyDeductions ?? 0);
    const net = Number(financials?.netIncome ?? (gross - totalDed));
    const unpaid = Number(financials?.unpaidRevenue ?? 0);
    const fmt = (n: number) => `KES ${Math.round(n).toLocaleString()}`;

    // Aggregate deductions by category for a compact breakdown
    const byCategory: Record<string, number> = {};
    (financials?.detailedDeductions || []).forEach((d: any) => {
        byCategory[d.category] = (byCategory[d.category] || 0) + (Number(d.amount) || 0);
    });
    // Also expose Management & Rules line items individually (Agency fee, MRI, etc.)
    const ruleLines: Array<{ name: string; amount: number }> = (financials?.detailedDeductions || [])
        .filter((d: any) => d.category === 'Management & Rules')
        .map((d: any) => ({ name: d.description, amount: Number(d.amount) || 0 }));

    const tone: 'up' | 'down' | 'neutral' = occupancyRate >= 80 ? 'up' : occupancyRate >= 50 ? 'neutral' : 'down';
    const toneClass = tone === 'up' ? 'bg-emerald-500/25 text-emerald-50 ring-emerald-200/40'
        : tone === 'down' ? 'bg-rose-500/25 text-rose-50 ring-rose-200/40'
        : 'bg-white/20 text-white ring-white/30';

    return (
        <div className="grid gap-3 md:grid-cols-2">
            {/* Rich Gross Revenue card */}
            <div className="relative overflow-hidden rounded-2xl p-4 pt-5 text-white shadow-[0_16px_32px_-12px_rgba(0,0,0,0.3)] bg-gradient-to-br from-primary via-primary to-primary-dark ring-1 ring-white/10">
                <div aria-hidden className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/20 opacity-60 pointer-events-none" />
                <div aria-hidden className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
                    <LucideIcons.TrendingUp className="w-44 h-44" strokeWidth={1.6} />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/25 shadow-inner">
                                <LucideIcons.TrendingUp className="w-4 h-4" strokeWidth={1.8} />
                            </div>
                            <p className="text-sm font-semibold opacity-95 truncate">Revenue (Period)</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${toneClass}`}>{occupancyRate}%</span>
                    </div>

                    {/* Three-stat row */}
                    <div className="grid grid-cols-3 gap-2 mb-2">
                        <div>
                            <p className="text-[10px] uppercase tracking-wider opacity-80">Gross</p>
                            <p className="text-base sm:text-lg font-extrabold tabular-nums leading-tight">{fmt(gross)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider opacity-80">Deductions</p>
                            <p className="text-base sm:text-lg font-extrabold tabular-nums leading-tight text-rose-100">-{fmt(totalDed)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase tracking-wider opacity-80">Net</p>
                            <p className="text-base sm:text-lg font-extrabold tabular-nums leading-tight text-emerald-100">{fmt(net)}</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                        <p className="text-[11px] opacity-85 flex items-center gap-1">
                            <span className="inline-block w-1 h-1 rounded-full bg-white/70" />
                            Unpaid {fmt(unpaid)}
                        </p>
                        <button
                            type="button"
                            onClick={() => setOpen(o => !o)}
                            className="text-[11px] font-bold px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 ring-1 ring-white/25 flex items-center gap-1"
                        >
                            {open ? 'Hide' : 'Breakdown'}
                            <LucideIcons.ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                    </div>

                    {open && (
                        <div className="mt-3 rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20 p-3 space-y-1.5 text-[12px]">
                            {Object.keys(byCategory).length === 0 && (
                                <p className="opacity-80">No deductions this period.</p>
                            )}
                            {byCategory['Placement Fees'] > 0 && (
                                <div className="flex justify-between"><span className="opacity-90">Placement Fees</span><span className="font-bold tabular-nums">-{fmt(byCategory['Placement Fees'])}</span></div>
                            )}
                            {ruleLines.map((r, i) => (
                                <div key={i} className="flex justify-between"><span className="opacity-90 truncate pr-2">{r.name}</span><span className="font-bold tabular-nums">-{fmt(r.amount)}</span></div>
                            ))}
                            {byCategory['Bills & Utilities'] > 0 && (
                                <div className="flex justify-between"><span className="opacity-90">Bills & Utilities</span><span className="font-bold tabular-nums">-{fmt(byCategory['Bills & Utilities'])}</span></div>
                            )}
                            {byCategory['Maintenance'] > 0 && (
                                <div className="flex justify-between"><span className="opacity-90">Maintenance</span><span className="font-bold tabular-nums">-{fmt(byCategory['Maintenance'])}</span></div>
                            )}
                            <div className="border-t border-white/25 pt-1.5 mt-1.5 flex justify-between font-bold">
                                <span>Total Deductions</span><span className="tabular-nums">-{fmt(totalDed)}</span>
                            </div>
                            <div className="flex justify-between font-extrabold text-emerald-100">
                                <span>Net Revenue</span><span className="tabular-nums">{fmt(net)}</span>
                            </div>
                            <button
                                type="button"
                                onClick={onOpenFinancials}
                                className="mt-2 w-full text-center text-[11px] font-bold py-1.5 rounded-lg bg-white/20 hover:bg-white/30 ring-1 ring-white/30"
                            >
                                View full statement →
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* All-time Revenue (YTD) card with sparkline + monthly breakdown */}
            <YtdRevenueCard
                allTimeRevenue={allTimeRevenue}
                monthlyRevenue={monthlyRevenue}
                propertiesCount={propertiesCount}
                totalUnits={totalUnits}
                open={ytdOpen}
                onToggle={() => setYtdOpen(o => !o)}
                onOpenProperties={onOpenProperties}
            />
        </div>
    );
};

// --- YTD Revenue card with background sparkline + monthly breakdown ---
const YtdRevenueCard: React.FC<{
    allTimeRevenue: number;
    monthlyRevenue: number[];
    propertiesCount: number;
    totalUnits: number;
    open: boolean;
    onToggle: () => void;
    onOpenProperties: () => void;
}> = ({ allTimeRevenue, monthlyRevenue, propertiesCount, totalUnits, open, onToggle, onOpenProperties }) => {
    const fmt = (n: number) => `KES ${Math.round(n).toLocaleString()}`;
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const currentMonthIdx = new Date().getMonth();
    // Only render up to current month (inclusive)
    const visibleMonths = monthlyRevenue.slice(0, currentMonthIdx + 1);
    const maxVal = Math.max(1, ...visibleMonths);

    // Build sparkline path (cumulative growth) across visible months
    const W = 320, H = 90;
    let cumulative = 0;
    const points = visibleMonths.map((v, i) => {
        cumulative += v;
        const x = visibleMonths.length === 1 ? W / 2 : (i / (visibleMonths.length - 1)) * W;
        return { x, y: cumulative };
    });
    const maxCum = Math.max(1, points[points.length - 1]?.y ?? 1);
    const linePts = points.map(p => `${p.x.toFixed(1)},${(H - (p.y / maxCum) * (H - 10) - 4).toFixed(1)}`).join(' ');
    const areaPath = points.length > 0
        ? `M0,${H} L${points.map(p => `${p.x.toFixed(1)},${(H - (p.y / maxCum) * (H - 10) - 4).toFixed(1)}`).join(' L')} L${W},${H} Z`
        : '';

    return (
        <div className="relative overflow-hidden rounded-2xl p-4 pt-5 text-white shadow-[0_16px_32px_-12px_rgba(0,0,0,0.3)] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 ring-1 ring-white/10">
            {/* Background sparkline */}
            <svg
                aria-hidden
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="absolute inset-x-0 bottom-0 w-full h-[90px] opacity-60 pointer-events-none"
            >
                <defs>
                    <linearGradient id="ytdSparkFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="rgb(16,185,129)" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="rgb(16,185,129)" stopOpacity="0" />
                    </linearGradient>
                </defs>
                {areaPath && <path d={areaPath} fill="url(#ytdSparkFill)" />}
                {points.length > 1 && (
                    <polyline points={linePts} fill="none" stroke="rgb(110,231,183)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                )}
                {points.length > 0 && (
                    <circle
                        cx={points[points.length - 1].x}
                        cy={H - (points[points.length - 1].y / maxCum) * (H - 10) - 4}
                        r="3"
                        fill="rgb(167,243,208)"
                    />
                )}
            </svg>
            <div aria-hidden className="absolute -right-8 -top-4 opacity-10 pointer-events-none">
                <LucideIcons.Landmark className="w-36 h-36" strokeWidth={1.6} />
            </div>
            <div className="relative z-10">
                <button type="button" onClick={onOpenProperties} className="block text-left w-full">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/25 shadow-inner">
                            <LucideIcons.Landmark className="w-4 h-4" strokeWidth={1.8} />
                        </div>
                        <p className="text-sm font-semibold opacity-95 truncate">Gross Revenue (YTD)</p>
                    </div>
                    <p className="text-[26px] leading-tight font-extrabold tracking-tight drop-shadow-sm">{fmt(allTimeRevenue)}</p>
                    <p className="text-xs opacity-85 mt-1.5 flex items-center gap-1">
                        <span className="inline-block w-1 h-1 rounded-full bg-white/70" />
                        Since 1 Jan · {propertiesCount} properties · {totalUnits} units
                    </p>
                </button>

                <div className="mt-3 flex justify-end">
                    <button
                        type="button"
                        onClick={onToggle}
                        className="text-[11px] font-bold px-2 py-1 rounded-full bg-white/15 hover:bg-white/25 ring-1 ring-white/25 flex items-center gap-1"
                    >
                        {open ? 'Hide monthly' : 'Monthly breakdown'}
                        <LucideIcons.ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                </div>

                {open && (
                    <div className="mt-3 rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/20 p-3 text-[12px]">
                        <ul className="space-y-1.5">
                            {visibleMonths.map((v, i) => {
                                const pct = (v / maxVal) * 100;
                                return (
                                    <li key={i} className="flex items-center gap-2">
                                        <span className="w-8 opacity-80 shrink-0">{MONTH_NAMES[i]}</span>
                                        <div className="flex-1 h-2 rounded-full bg-white/15 overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-emerald-400 to-emerald-300 rounded-full"
                                                style={{ width: `${Math.max(2, pct)}%` }}
                                            />
                                        </div>
                                        <span className="font-bold tabular-nums shrink-0 w-24 text-right">{fmt(v)}</span>
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="border-t border-white/25 pt-2 mt-2 flex justify-between font-extrabold">
                            <span>YTD Total</span>
                            <span className="tabular-nums">{fmt(allTimeRevenue)}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};



const LandlordsPortal: React.FC = () => {
    const { landlords, properties, tenants, tasks, deductionRules, bills, addInvestment, currentUser, funds, rfTransactions, investments, isDataLoading } = useData();

    // Tab State
    const [activeTab, setActiveTab] = useState<'dashboard' | 'properties' | 'financials' | 'requests' | 'growth'>('dashboard');
    const [tabCollapsed, setTabCollapsed] = useState(false);
    const [quickDrawerView, setQuickDrawerView] = useState<null | 'properties' | 'financials' | 'requests' | 'growth' | 'vacancies' | 'statements'>(null);
    const [financialView, setFinancialView] = useState<'summary' | 'revenue'>('summary');
    const [financialPeriod, setFinancialPeriod] = useState(getCurrentMonthIso()); // YYYY-MM
    const [selectedDayFilter, setSelectedDayFilter] = useState<number>(30); // Default to end of month
    
    const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
    const [selectedInvestFund, setSelectedInvestFund] = useState<Fund | null>(null);

    const [isStatementOpen, setIsStatementOpen] = useState(false);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [requestType, setRequestType] = useState<'General' | 'Maintenance' | 'Eviction'>('General');

    // Lock background page scroll while any overlay (drawer or refer modal) is open
    // so the wheel/touch scroll happens inside the drawer instead of the main page.
    React.useEffect(() => {
        const overlayOpen = quickDrawerView !== null || isRequestModalOpen || isStatementOpen;
        if (!overlayOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [quickDrawerView, isRequestModalOpen, isStatementOpen]);

    const [monthPayments, setMonthPayments] = useState<Array<{ amount: number; date: string; created_at: string }>>([]);
    const [monthPaymentsLoading, setMonthPaymentsLoading] = useState(false);
    // allTimeRevenueTotal is derived below via useMemo (YTD gross from payments).

    // 1. Identify Current Landlord (Use Logged In User)
    // Resolve to the canonical landlord record so ids referenced by
    // properties/deduction rules (`landlordId` / `targetId`) match the
    // logged-in user, even when the auth id differs from the landlord
    // record id.
    const currentLandlord = useMemo(() => {
        const isLandlordRole = (u: any) => !!u && (u.role === 'Landlord' || u.role === 'Landlord (Individual)' || u.role === 'Landlord (Corporate)');
        const matchByUser = (l: any) => {
            if (!currentUser) return false;
            if (l.id && (l.id === (currentUser as any).id)) return true;
            const emailA = String(l.email || '').toLowerCase().trim();
            const emailB = String((currentUser as any).email || '').toLowerCase().trim();
            if (emailA && emailB && emailA === emailB) return true;
            const phoneA = String(l.phone || '').replace(/\D/g, '');
            const phoneB = String((currentUser as any).phone || '').replace(/\D/g, '');
            if (phoneA && phoneB && phoneA === phoneB) return true;
            return false;
        };
        const matched = (landlords || []).find(matchByUser);
        if (matched) return matched as User;
        if (isLandlordRole(currentUser)) return currentUser as User;
        return landlords[0];
    }, [currentUser, landlords]);


    const { displayName, initial: displayNameInitial } = useProfileDisplay({ nameFallback: currentLandlord?.name });

    useEffect(() => {
        let cancelled = false;

        const loadPayments = async () => {
            try {
                setMonthPaymentsLoading(true);
                const { data: authData } = await supabase.auth.getUser();
                const userId = authData?.user?.id;
                if (!userId) {
                    if (!cancelled) setMonthPayments([]);
                    return;
                }

                const start = `${financialPeriod}-01T00:00:00.000Z`;
                const [y, m] = financialPeriod.split('-').map(Number);
                const nextMonth = new Date(Date.UTC(y, (m ?? 1), 1));
                const end = nextMonth.toISOString();

                const { data, error } = await supabase
                    .from('partial_rms_payments')
                    .select('amount, created_at')
                    .eq('user_id', userId)
                    .eq('status', 'completed')
                    .gte('created_at', start)
                    .lt('created_at', end)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                const normalized = (data || []).map(p => {
                    const iso = p.created_at;
                    const date = iso.slice(0, 10);
                    return { amount: Number(p.amount ?? 0), created_at: iso, date };
                });

                if (!cancelled) setMonthPayments(normalized);
            } catch (e) {
                console.warn('[LandlordsPortal] Failed to load payments', e);
                if (!cancelled) setMonthPayments([]);
            } finally {
                if (!cancelled) setMonthPaymentsLoading(false);
            }
        };

        loadPayments();
        const onFocus = () => { if (!cancelled) loadPayments(); };
        window.addEventListener('focus', onFocus);
        return () => {
            cancelled = true;
            window.removeEventListener('focus', onFocus);
        };
    }, [financialPeriod]);

    // All-time (YTD) gross revenue is now computed from tenant payment history
    // below (useMemo, after myTenants is declared).

    // Handle Deep Linking / Routing based on Hash
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.endsWith('/properties')) setActiveTab('properties');
        else if (hash.endsWith('/financials')) setActiveTab('financials');
        else if (hash.endsWith('/requests')) setActiveTab('requests');
        else if (hash.endsWith('/growth')) setActiveTab('growth');
        else setActiveTab('dashboard'); 
    }, []);

    const navigateToTab = (tab: string, opts?: { scroll?: boolean; drawer?: boolean }) => {
        // Reset sub-views when changing main tabs
        if (tab !== 'financials') setFinancialView('summary');

        window.location.hash = `#/partial-rms/user-app-portal/landlords-portal/${tab === 'dashboard' ? '' : tab}`;
        setActiveTab(tab as any);
        setTabCollapsed(false);

        if (opts?.drawer) {
            const drawerTab = tab === 'properties' || tab === 'financials' || tab === 'requests' || tab === 'growth'
                ? tab
                : 'properties';
            setQuickDrawerView(drawerTab);
            return;
        }

        // Smooth-scroll the tab section into view so quick actions never feel
        // like a long page-scroll. Defer to next frame so the new tab content
        // has time to render before we measure offsets.
        if (opts?.scroll !== false) {
            requestAnimationFrame(() => {
                const el = document.getElementById('landlord-tab-section');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    };

    const openQuickDrawer = (view: NonNullable<typeof quickDrawerView>) => {
        if (view === 'statements') setFinancialView('summary');
        if (view === 'financials') setFinancialView('summary');
        setQuickDrawerView(view);
    };

    // 2. Filter Data Context
    const allLandlordProperties = useMemo(() => properties.filter(p => p.landlordId === currentLandlord?.id), [properties, currentLandlord]);
    
    const myProperties = useMemo(() => {
        if (selectedPropertyIds.length === 0) return allLandlordProperties;
        return allLandlordProperties.filter(p => selectedPropertyIds.includes(p.id));
    }, [allLandlordProperties, selectedPropertyIds]);

    const myTenants = useMemo(() => tenants.filter(t => myProperties.some(p => p.id === t.propertyId)), [tenants, myProperties]);
    const myTasks = useMemo(() => tasks.filter(t => myProperties.some(p => p.name === t.property)), [tasks, myProperties]);

    // YTD gross revenue: sum of all paid tenant payments since Jan 1 of current year
    // for this landlord's properties. Replaces the previous payments-table query so
    // the figure reflects actual gross rent collected from the landlord's properties.
    const allTimeRevenueTotal = useMemo(() => {
        const yearPrefix = `${new Date().getFullYear()}-`;
        let total = 0;
        myTenants.forEach(t => {
            (t.paymentHistory || []).forEach(p => {
                if (p?.status === 'Paid' && typeof p.date === 'string' && p.date.startsWith(yearPrefix)) {
                    total += parseFloat(String(p.amount).replace(/[^0-9.]/g, '')) || 0;
                }
            });
        });
        return total;
    }, [myTenants]);

    // Per-month YTD revenue (Jan..Dec) for the sparkline + breakdown.
    const monthlyYtdRevenue = useMemo(() => {
        const year = new Date().getFullYear();
        const months = Array.from({ length: 12 }, () => 0);
        myTenants.forEach(t => {
            (t.paymentHistory || []).forEach(p => {
                if (p?.status !== 'Paid' || typeof p.date !== 'string') return;
                if (!p.date.startsWith(`${year}-`)) return;
                const m = parseInt(p.date.slice(5, 7), 10) - 1;
                if (m >= 0 && m < 12) {
                    months[m] += parseFloat(String(p.amount).replace(/[^0-9.]/g, '')) || 0;
                }
            });
        });
        return months;
    }, [myTenants]);

    const isPortfolioEmpty = !isDataLoading && myProperties.length === 0;

    const landlordRequests = useMemo(() => {
        return myTasks
            .filter(t => t.title?.toLowerCase().includes('request'))
            .slice(0, 3);
    }, [myTasks]);

    // 3. Calculate Financials
    const financials = useMemo(() => {
        // Gross revenue = amount actually PAID in the period (not expected rent).
        // Management/agency fees are calculated on collected rent only.
        const grossRevenueMonth = myTenants.reduce(
            (sum, t) => sum + sumPaidPaymentsForMonth(t, financialPeriod),
            0
        );
        const expectedRevenueMonth = myTenants.reduce((sum, t) => sum + (t.rentAmount || 0), 0);
        const allTimeRevenue = allTimeRevenueTotal;
        const unpaidRevenue = Math.max(0, expectedRevenueMonth - grossRevenueMonth);
       
        const detailedDeductions: Array<{ category: string; description: string; amount: number; property: string }> = [];

        // Placement Fees
        const newTenants = myTenants.filter(t => t.onboardingDate.startsWith(financialPeriod));
        const placementFeeDeduction = newTenants.reduce((sum, t) => sum + (t.rentAmount || 0), 0);
        if (placementFeeDeduction > 0) {
             newTenants.forEach(t => detailedDeductions.push({
                 category: 'Placement Fees',
                 description: `Placement Fee: ${t.name}`,
                 amount: t.rentAmount || 0,
                 property: t.propertyName || (allLandlordProperties.find(p => p.id === t.propertyId)?.name) || '—',
             }));
        }

        // Rule Deductions
        let ruleDeductionsTotal = 0;
        const activeRules = deductionRules.filter(r => 
            r.status === 'Active' &&
            (r.applicability === 'Global' || 
            (r.applicability === 'Specific Landlord' && r.targetId === currentLandlord?.id) ||
            (r.applicability === 'Specific Property' && myProperties.some(p => p.id === r.targetId)))
        );

        activeRules.forEach(r => {
            let amount = 0;
            let ruleProperty = 'All properties';
            if (r.type === 'Fixed') {
                amount = r.value;
            } else {
                if (r.applicability === 'Specific Property') {
                    const prop = myProperties.find(p => p.id === r.targetId);
                    if (prop) {
                        const propRevenue = myTenants.filter(t => t.propertyId === prop.id).reduce((s, t) => s + sumPaidPaymentsForMonth(t, financialPeriod), 0);
                        amount = (propRevenue * (r.value / 100));
                        ruleProperty = prop.name;
                    }
                } else {
                    amount = (grossRevenueMonth * (r.value / 100));
                }
            }
            if (r.applicability === 'Specific Property' && ruleProperty === 'All properties') {
                const prop = myProperties.find(p => p.id === r.targetId);
                if (prop) ruleProperty = prop.name;
            }
            ruleDeductionsTotal += amount;
            detailedDeductions.push({
                category: 'Management & Rules',
                description: r.name,
                amount,
                property: ruleProperty,
            });
        });

        // Bills
        const periodBills = bills.filter(b => myProperties.some(p => p.id === b.propertyId) && b.invoiceDate.startsWith(financialPeriod));
        const billDeductionsTotal = periodBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
        periodBills.forEach(b => detailedDeductions.push({
            category: 'Bills & Utilities',
            description: `${b.category} - ${b.vendor}`,
            amount: Number(b.amount) || 0,
            property: (allLandlordProperties.find(p => p.id === b.propertyId)?.name) || '—',
        }));

        // Maintenance
        const periodTasks = myTasks.filter(t => (t.status === 'Completed' || t.status === 'Closed') && t.dueDate.startsWith(financialPeriod));
        const maintenanceDeductionsTotal = periodTasks.reduce((sum, t) => sum + ((t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0)), 0);
        periodTasks.forEach(t => {
            const cost = (t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0);
            if (cost > 0) detailedDeductions.push({
                category: 'Maintenance',
                description: `Maint: ${t.title}`,
                amount: cost,
                property: t.property || '—',
            });
        });

        const totalDeductions = ruleDeductionsTotal + billDeductionsTotal + maintenanceDeductionsTotal + placementFeeDeduction;
       
        return { 
            grossRevenueMonth, 
            allTimeRevenue, 
            unpaidRevenue, 
            ruleDeductions: ruleDeductionsTotal,
            billDeductions: billDeductionsTotal,
            maintenanceDeductions: maintenanceDeductionsTotal,
            placementFeeDeduction,
            newTenants,
            monthlyDeductions: totalDeductions, 
            netIncome: grossRevenueMonth - totalDeductions,
            activeRules,
            detailedDeductions
        };
    }, [myTenants, myProperties, deductionRules, bills, myTasks, financialPeriod, currentLandlord, allTimeRevenueTotal]);

    // Occupancy — exclude repurposed (distressed/uninhabitable/landlords residence/caretaker/store)
    const _ub = myProperties.reduce((acc, p) => {
        const b = countUnitBuckets(p.units || []);
        acc.total += b.total; acc.occupied += b.occupied; acc.vacant += b.vacant; acc.repurposed += b.repurposed;
        return acc;
    }, { total: 0, occupied: 0, vacant: 0, repurposed: 0 });
    const totalUnits = _ub.total;
    const occupiedUnits = _ub.occupied;
    const vacantCount = _ub.vacant;
    const repurposedCount = _ub.repurposed;
    const rentableUnits = totalUnits - repurposedCount;
    const occupancyRate = rentableUnits > 0 ? Math.round((occupiedUnits / rentableUnits) * 100) : 0;

    // Collection Rate
    const collectionStats = useMemo(() => {
        const expected = myTenants
            .filter(t => t.status !== 'Vacated' && t.status !== 'Evicted')
            .reduce((sum, t) => sum + (t.rentAmount || 0), 0);
        
        const collected = myTenants.reduce((sum, t) => {
            return sum + t.paymentHistory
                .filter(p => p.date.startsWith(financialPeriod))
                .reduce((s, p) => s + (parseFloat(p.amount.replace(/[^0-9.]/g, '')) || 0), 0);
        }, 0);

        const rate = expected > 0 ? Math.round((collected / expected) * 100) : 0;
        const health = Math.round((occupancyRate * 0.5) + (rate * 0.5));
        
        return { expected, collected, rate, health };
    }, [myTenants, financialPeriod, occupancyRate]);

    // Payment Performance Graph Data Logic
    const paymentPerformanceLogic = useMemo(() => {
        const days = [1, 5, 10, 15, 20, 25, 30];
        const tenantDerivedPayments = myTenants.flatMap(t => t.paymentHistory.filter(p => p.date.startsWith(financialPeriod)).map(p => ({
            ...p,
            tenantName: t.name,
            unit: t.unit,
            amountVal: parseFloat(p.amount.replace(/[^0-9.]/g, '')) || 0,
            day: parseInt(p.date.split('-')[2])
        })));

        const supabasePayments = monthPayments.map(p => {
            const d = new Date(p.created_at);
            return {
                tenantName: '—',
                unit: '—',
                amountVal: Number(p.amount ?? 0),
                day: d.getUTCDate(),
                date: p.date,
                amount: `KES ${Number(p.amount ?? 0).toLocaleString()}`
            };
        });

        const currentMonthPayments = (supabasePayments.length > 0 ? supabasePayments : tenantDerivedPayments)
            .sort((a: any, b: any) => (b.day ?? 0) - (a.day ?? 0));

        const graphData = days.map(day => {
            const collectedUntilDay = currentMonthPayments.filter(p => p.day <= day).reduce((sum, p) => sum + p.amountVal, 0);
            const percentage = collectionStats.expected > 0 ? Math.round((collectedUntilDay / collectionStats.expected) * 100) : 0;
            return { day, percentage };
        });

        const tablePayments = currentMonthPayments.filter(p => p.day <= selectedDayFilter);

        const currentBucket = graphData.find(d => d.day === selectedDayFilter) || graphData[graphData.length-1];

        return { graphData, tablePayments, currentPercentage: currentBucket.percentage };
    }, [myTenants, financialPeriod, collectionStats, selectedDayFilter, monthPayments]);

    const paymentTrendData = {
        labels: paymentPerformanceLogic.graphData.map(d => `${d.day}${d.day === 1 ? 'st' : d.day === 2 ? 'nd' : 'th'}`),
        datasets: [{
            label: 'Collection %',
            data: paymentPerformanceLogic.graphData.map(d => d.percentage),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.4
        }]
    };

    // Alerts Logic
    const alerts = useMemo(() => {
        const list = [];
        if (vacantCount > 0) {
            list.push({ 
                type: 'critical', 
                title: `${vacantCount} Vacant Units`,
                text: `Action required to fill vacancies in ${myProperties.filter(p => p.units.some(u => u.status === 'Vacant')).map(p => p.name).join(', ')}.` 
            });
        }
        if (financials.unpaidRevenue > 0) {
            list.push({ 
                type: 'warning', 
                title: 'Collections Alert',
                text: `KES ${Number(financials.unpaidRevenue ?? 0).toLocaleString()} outstanding from ${myTenants.filter(t => t.status === 'Overdue').length} tenants.` 
            });
        }
        
        list.push({ 
            type: 'info', 
            title: 'Performance',
            text: 'Revenue is stable compared to last month.' 
        });
        
        return list;
    }, [vacantCount, financials.unpaidRevenue, myProperties, myTenants]);


    // Group units by property and floor
    const propertyLayouts = useMemo(() => {
        return myProperties.map(prop => {
            const unitMap: Record<number, Unit[]> = {};
            if (prop.floors) {
                for(let i=0; i<prop.floors; i++) unitMap[i] = [];
            }
            prop.units.forEach(u => {
                const floorNum = u.floor !== undefined ? u.floor : 0;
                if (!unitMap[floorNum]) unitMap[floorNum] = [];
                unitMap[floorNum].push(u);
            });
            
            const propTenants = tenants.filter(t => t.propertyId === prop.id);
            const newTenantsCount = propTenants.filter(t => new Date(t.onboardingDate) >= new Date(new Date().setDate(new Date().getDate() - 30))).length;
            const arrearsCount = propTenants.filter(t => t.status === 'Overdue').length;
            const distressedCount = propTenants.filter(t => t.houseStatus?.includes('Distressed')).length;
            const maintenanceCount = propTenants.filter(t => t.houseStatus?.includes('Under Maintenance')).length;

            return { ...prop, unitMap, newTenantsCount, arrearsCount, distressedCount, maintenanceCount };
        });
    }, [myProperties, tenants]);

    // Invest & Earn Data
    const referralEarnings = useMemo(() => {
        return rfTransactions.filter(tx => 
            tx.type === 'Referral Commission' && 
            tx.partyName === currentLandlord?.name
        ).reduce((sum, tx) => sum + tx.amount, 0);
    }, [rfTransactions, currentLandlord]);

    const myActiveInvestments = useMemo(() => {
        return investments.filter(inv => inv.status === 'Active');
    }, [investments]);

    const activeInvestmentTotal = myActiveInvestments.reduce((sum, inv) => sum + inv.amount, 0);

    const commissionHistory = useMemo(() => {
        return rfTransactions.filter(tx => tx.type === 'Referral Commission' && tx.partyName === currentLandlord?.name);
    }, [rfTransactions, currentLandlord]);

    // Referrals
    const referralLinkAgency = websiteLinks.joinLandlord(currentLandlord?.id);
    const referralLinkInvestor = websiteLinks.invest(currentLandlord?.id);

    const handleCopy = (text: string) => { navigator.clipboard.writeText(text); };
    const handleShare = (platform: string, link: string) => {
        const msg = encodeURIComponent(`Join TaskMe using my referral link: ${link}`);
        if (platform === 'WhatsApp') {
            window.open(`https://wa.me/?text=${msg}`, '_blank');
        } else if (platform === 'Message' || platform === 'SMS') {
            window.open(`sms:?body=${msg}`, '_blank');
        } else {
            window.open(`https://wa.me/?text=${msg}`, '_blank');
        }
    };

    const handleDownloadStatement = (type: 'Revenue' | 'Income') => {
        if (type === 'Income') {
            setIsStatementOpen(true);
        } else {
            const data = myTenants.map(t => ({
                Tenant: t.name,
                Property: t.propertyName,
                Unit: t.unit,
                Rent: t.rentAmount,
                Status: t.status,
                New_Tenant: t.onboardingDate.startsWith(financialPeriod) ? 'Yes' : 'No',
                Date: fmtDate(new Date())
            }));
            exportToCSV(data, `${currentLandlord.name}_Revenue_Report`);
        }
    };

    const handleNewRequest = (type: 'General' | 'Maintenance' | 'Eviction') => {
        setRequestType(type);
        setIsRequestModalOpen(true);
    };

    const submitRequest = (req: any) => {
        alert(`${req.type} request submitted: ${req.title}`);
        setIsRequestModalOpen(false);
    };

    const togglePropertySelection = (id: string) => {
        setSelectedPropertyIds(prev => 
            prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
        );
    };

    const handleInvestmentConfirm = (amount: number) => {
        if (selectedInvestFund && currentLandlord) {
            const newInv: Investment = { id: `inv-${Date.now()}`, fundId: selectedInvestFund.id, fundName: selectedInvestFund.name, amount: amount, date: getTodayIsoDate(), strategy: 'Monthly Payout', status: 'Active', accruedInterest: 0 };
            addInvestment(newInv);
            setSelectedInvestFund(null);
            alert(`Investment of KES ${amount.toLocaleString()} confirmed.`);
        }
    };

    // Calculate arrears count for AI card usage
    const arrearsCount = myTenants.filter(t => t.status === 'Overdue').length;
    const arrearsAmount = myTenants.filter(t => t.status === 'Overdue').reduce((sum, t) => sum + t.rentAmount, 0);

    // Task Data for Doughnut Chart
    const taskData = {
        labels: ['Completed', 'Pending', 'In Progress'],
        datasets: [{
            data: [
                myTasks.filter(t => t.status === 'Completed' || t.status === 'Closed').length,
                myTasks.filter(t => t.status === 'Issued' || t.status === 'Pending').length,
                myTasks.filter(t => t.status === 'In Progress').length
            ],
            backgroundColor: ['#10b981', '#f59e0b', '#3b82f6'],
            borderWidth: 0
        }]
    };

    if (!currentLandlord) return <div className="p-8 text-center text-gray-500">Loading Profile...</div>;

    const growth = usePortalGrowthActions();

    return (
        <div className="flex flex-col min-h-screen bg-gray-50 pb-16">

            <div className="w-full max-w-7xl mx-auto p-3 sm:p-4 space-y-3">
                {/* Revenue hero row: rich Gross Revenue breakdown + All-time */}
                <GrossRevenueHero
                    financials={financials}
                    occupancyRate={occupancyRate}
                    allTimeRevenue={allTimeRevenueTotal}
                    monthlyRevenue={monthlyYtdRevenue}
                    propertiesCount={myProperties.length}
                    totalUnits={totalUnits}
                    onOpenFinancials={() => navigateToTab('financials')}
                    onOpenProperties={() => navigateToTab('properties')}
                />
                <PortalShell
                    actions={[
                        { label: 'Portfolio',    iconNode: <LucideIcons.Building2 className="w-full h-full" strokeWidth={1.8} />,    onClick: () => openQuickDrawer('properties') },
                        { label: 'Financials',   iconNode: <LucideIcons.BarChart3 className="w-full h-full" strokeWidth={1.8} />,   onClick: () => openQuickDrawer('financials') },
                        { label: 'Requests',     iconNode: <LucideIcons.Wrench className="w-full h-full" strokeWidth={1.8} />,      onClick: () => openQuickDrawer('requests') },
                        { label: 'Invest',       iconNode: <LucideIcons.Sparkles className="w-full h-full" strokeWidth={1.8} />,    onClick: () => openQuickDrawer('growth') },
                        { label: 'Vacancies',    iconNode: <LucideIcons.DoorOpen className="w-full h-full" strokeWidth={1.8} />,    onClick: () => openQuickDrawer('vacancies'), badge: vacantCount || undefined },
                        { label: 'Statements',   iconNode: <LucideIcons.Receipt className="w-full h-full" strokeWidth={1.8} />,     onClick: () => openQuickDrawer('statements') },
                        { label: 'My Profile',   iconNode: <LucideIcons.UserCircle className="w-full h-full" strokeWidth={1.8} />,  onClick: () => { window.location.hash = '#/partial-rms/user-app-portal/my-profile'; } },
                        ...growth.actions,
                    ]}
                    metrics={[
                        { label: 'Properties', value: myProperties.length.toString() },
                        { label: 'Units',      value: totalUnits.toString() },
                        { label: 'Occupancy',  value: `${occupancyRate}%`, tone: 'text-emerald-600' },
                        { label: 'Vacant',     value: vacantCount.toString(), tone: vacantCount > 0 ? 'text-amber-600' : 'text-gray-700' },
                    ]}
                />
                {growth.modals}

                {/* Earn-with-referrals fliers */}
                <ReferralFliers hiddenKinds={['tenant']} />
                <ReferralCalculator hideTenant={true} />





                {/* Global Month Selector — drives all activity sections (financials, tenants paid/unpaid, deductions, expenses, payouts, income) */}
                <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-sm flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                        <LucideIcons.Calendar className="w-4 h-4 text-primary" />
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Viewing Month:</label>
                    </div>
                    <input
                        type="month"
                        value={financialPeriod}
                        onChange={e => setFinancialPeriod(e.target.value || getCurrentMonthIso())}
                        className="p-2 border rounded-lg bg-gray-50 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-primary/50 outline-none"
                    />
                    <button
                        type="button"
                        onClick={() => setFinancialPeriod(getCurrentMonthIso())}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                        Current Month
                    </button>
                    <span className="text-xs text-gray-400 ml-auto">All activity below is filtered to this month.</span>
                </div>

                {quickDrawerView && (
                    <div className="fixed inset-0 z-[1500] flex justify-end animate-fade-in">
                        <div className="absolute inset-0 bg-black/45" onClick={() => setQuickDrawerView(null)} />
                        <aside className="relative h-full w-full sm:w-[min(94vw,560px)] bg-white shadow-2xl border-l-4 border-secondary flex flex-col animate-slide-in-right overscroll-contain">
                            <div className="flex-shrink-0 bg-white border-b border-secondary/30 px-5 py-4 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] uppercase tracking-wider text-secondary font-bold">Quick action</p>
                                    <h3 className="text-lg font-extrabold text-gray-900">{quickDrawerView === 'properties' ? 'Portfolio' : quickDrawerView === 'financials' ? 'Financials' : quickDrawerView === 'requests' ? 'Requests' : quickDrawerView === 'growth' ? 'Invest & Earn' : quickDrawerView === 'vacancies' ? 'Vacancies' : 'Statements'}</h3>
                                </div>
                                <button onClick={() => setQuickDrawerView(null)} aria-label="Close drawer" className="p-2 rounded-lg text-gray-500 hover:bg-gray-100">
                                    <LucideIcons.X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto overscroll-contain p-5 space-y-4">
                                {quickDrawerView === 'properties' && myProperties.map(p => (
                                    <div key={p.id} className="p-4 rounded-xl border border-secondary/30 bg-gray-50">
                                        <p className="font-bold text-gray-900">{p.name}</p>
                                        <p className="text-xs text-gray-500 mt-1">{p.location || p.branch || '—'} · {p.units.length} units · {p.units.filter(u => u.status === 'Vacant').length} vacant</p>
                                    </div>
                                ))}
                                {quickDrawerView === 'financials' && (
                                    <div className="grid grid-cols-1 gap-3">
                                        <MetricCard title="Gross Revenue" value={`KES ${Number(financials.grossRevenueMonth ?? 0).toLocaleString()}`} subtext={financialPeriod} color="green" iconNode={<LucideIcons.Wallet className="w-full h-full" />} />
                                        <MetricCard title="Net Payout" value={`KES ${Number(financials.netIncome ?? 0).toLocaleString()}`} subtext="After deductions" color="blue" iconNode={<LucideIcons.Receipt className="w-full h-full" />} />
                                        <button onClick={() => { setQuickDrawerView(null); navigateToTab('financials'); setFinancialView('revenue'); }} className="w-full px-4 py-3 rounded-xl bg-primary text-white font-bold text-sm">Open Tenant Revenue</button>
                                    </div>
                                )}
                                {quickDrawerView === 'requests' && (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-3 gap-2">
                                            {(['General', 'Maintenance', 'Eviction'] as const).map(type => <button key={type} onClick={() => handleNewRequest(type)} className="py-2 rounded-lg border border-secondary/30 text-xs font-bold text-gray-700 hover:bg-secondary/10">{type}</button>)}
                                        </div>
                                        {landlordRequests.map(req => <div key={req.id} className="p-3 rounded-xl border border-gray-200"><p className="text-sm font-bold">{req.title}</p><p className="text-xs text-gray-500">{req.property} · {req.status}</p></div>)}
                                        {landlordRequests.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No requests submitted yet.</p>}
                                    </div>
                                )}
                                {quickDrawerView === 'growth' && (
                                    <div className="space-y-3">
                                        <MetricCard title="Referral Earnings" value={`KES ${referralEarnings.toLocaleString()}`} subtext="Total earned" color="purple" iconNode={<LucideIcons.Share2 className="w-full h-full" />} />
                                        <MetricCard title="Active Investments" value={`KES ${activeInvestmentTotal.toLocaleString()}`} subtext="Renovation funds" color="orange" iconNode={<LucideIcons.TrendingUp className="w-full h-full" />} />
                                    </div>
                                )}
                                {quickDrawerView === 'vacancies' && myProperties.flatMap(p => p.units.filter(u => u.status === 'Vacant').map(u => ({ p, u }))).map(({ p, u }) => (
                                    <div key={u.id} className="p-4 rounded-xl border border-secondary/30 bg-amber-50/40"><p className="font-bold text-gray-900">{p.name} · Unit {u.unitNumber}</p><p className="text-xs text-gray-500 mt-1">KES {Number(u.rent || p.defaultMonthlyRent || 0).toLocaleString()} · {u.unitType || `${u.bedrooms}BR`}</p></div>
                                ))}
                                {quickDrawerView === 'statements' && (
                                    <div className="space-y-3">
                                        <button onClick={() => handleDownloadStatement('Income')} className="w-full px-4 py-3 rounded-xl bg-primary text-white font-bold text-sm">Download Income Statement</button>
                                        <button onClick={() => { setQuickDrawerView(null); navigateToTab('financials'); setFinancialView('revenue'); }} className="w-full px-4 py-3 rounded-xl border border-secondary/40 text-secondary font-bold text-sm">View Tenant Revenue</button>
                                    </div>
                                )}
                            </div>
                        </aside>
                    </div>
                )}

                {/* Tab Navigation — pill style. */}
                <div
                    id="landlord-tab-section"
                    className="scroll-mt-4 bg-gradient-to-br from-white via-white to-gray-50 border border-gray-200 rounded-2xl p-1.5 shadow-sm"
                >
                    <div className="flex items-center gap-1.5">
                        <div className="flex gap-1.5 overflow-x-auto flex-1">
                            {([
                                { id: 'dashboard',  label: 'Dashboard',    icon: <LucideIcons.LayoutDashboard className="w-4 h-4" /> },
                                { id: 'properties', label: 'Portfolio',    icon: <LucideIcons.Building2 className="w-4 h-4" /> },
                                { id: 'financials', label: 'Financials',   icon: <LucideIcons.BarChart3 className="w-4 h-4" /> },
                                { id: 'requests',   label: 'Requests',     icon: <LucideIcons.Wrench className="w-4 h-4" /> },
                                { id: 'growth',     label: 'Invest & Earn',icon: <LucideIcons.Sparkles className="w-4 h-4" /> },
                            ] as const).map(tab => {
                                const isActive = activeTab === tab.id && !tabCollapsed;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => { navigateToTab(tab.id); }}
                                        className={`flex items-center gap-1.5 py-2 px-3 sm:px-4 text-sm rounded-xl transition-all whitespace-nowrap
                                            ${isActive
                                                ? 'bg-gradient-to-r from-primary to-primary-dark text-white font-bold shadow-md ring-1 ring-primary/30'
                                                : 'text-gray-600 hover:bg-white hover:text-primary hover:shadow-sm ring-1 ring-transparent hover:ring-gray-200 font-medium'}`}
                                    >
                                        <span className={isActive ? 'opacity-100' : 'opacity-70'}>{tab.icon}</span>
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => setTabCollapsed(c => !c)}
                            title={tabCollapsed ? 'Show panel' : 'Collapse panel'}
                            aria-label={tabCollapsed ? 'Show panel' : 'Collapse panel'}
                            className="shrink-0 p-2 rounded-xl text-gray-500 hover:text-primary hover:bg-white ring-1 ring-gray-200"
                        >
                            <LucideIcons.ChevronUp className={`w-4 h-4 transition-transform ${tabCollapsed ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>
               
                {!tabCollapsed && activeTab === 'dashboard' && (
                    <div className="grid grid-cols-1 gap-6 animate-fade-in">
                        {/* Property Selector */}
                        {allLandlordProperties.length > 1 && (
                            <div className="mb-2 bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
                                <label className="text-xs font-bold text-gray-500 uppercase">Viewing Data For:</label>
                                <select
                                    className="p-2 border rounded-lg bg-gray-50 text-sm font-bold text-gray-700 focus:ring-2 focus:ring-primary/50 outline-none flex-grow md:w-64"
                                    value={selectedPropertyIds.length === 1 ? selectedPropertyIds[0] : 'all'}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setSelectedPropertyIds(val === 'all' ? [] : [val]);
                                    }}
                                >
                                    <option value="all">All Properties ({allLandlordProperties.length})</option>
                                    {allLandlordProperties.map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* AI Intelligence Section */}
                        <div className="relative rounded-3xl p-6 text-white shadow-xl overflow-hidden bg-[radial-gradient(circle_at_top_left,#3730a3,transparent_55%),radial-gradient(circle_at_bottom_right,#7c3aed,transparent_55%),linear-gradient(135deg,#0f172a,#1e1b4b)]">
                            <div aria-hidden className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '18px 18px' }} />
                            <div aria-hidden className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
                            <div aria-hidden className="absolute -bottom-20 -left-20 w-80 h-80 rounded-full bg-indigo-500/20 blur-3xl" />
                            <div className="relative z-10">
                                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                                    <div className="flex items-center gap-2.5">
                                        <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 text-slate-900 shadow-lg shadow-amber-500/20">
                                            <LucideIcons.Sparkles className="w-4 h-4" strokeWidth={2.4} />
                                            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400 ring-2 ring-slate-900" />
                                            </span>
                                        </span>
                                        <div>
                                            <h3 className="text-sm font-extrabold tracking-tight">TaskMe Intelligence</h3>
                                            <p className="text-[10px] uppercase tracking-[0.18em] text-white/60 font-bold">Live portfolio signals</p>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white/10 ring-1 ring-white/20 px-2.5 py-1 rounded-full">
                                        {alerts.length} insights
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                     {alerts.map((insight: any, i: number) => (
                                        <AIInsightCard 
                                            key={i}
                                            title={insight.title} 
                                            description={insight.text}
                                            type={insight.type}
                                            icon={insight.type === 'critical' ? 'arrears' : insight.type === 'warning' ? 'task-escalated' : 'check'}
                                        />
                                     ))}
                                </div>
                            </div>
                        </div>


                        {/* Top KPIs */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {isDataLoading ? (
                                <>
                                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
                                        <div className="h-3 w-20 bg-gray-200 rounded mb-3"></div>
                                        <div className="h-7 w-24 bg-gray-200 rounded mb-2"></div>
                                        <div className="h-3 w-32 bg-gray-200 rounded"></div>
                                    </div>
                                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
                                        <div className="h-3 w-20 bg-gray-200 rounded mb-3"></div>
                                        <div className="h-7 w-24 bg-gray-200 rounded mb-2"></div>
                                        <div className="h-3 w-32 bg-gray-200 rounded"></div>
                                    </div>
                                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
                                        <div className="h-3 w-20 bg-gray-200 rounded mb-3"></div>
                                        <div className="h-7 w-24 bg-gray-200 rounded mb-2"></div>
                                        <div className="h-3 w-32 bg-gray-200 rounded"></div>
                                    </div>
                                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
                                        <div className="h-3 w-20 bg-gray-200 rounded mb-3"></div>
                                        <div className="h-7 w-24 bg-gray-200 rounded mb-2"></div>
                                        <div className="h-3 w-32 bg-gray-200 rounded"></div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <MetricCard title="Properties" value={myProperties.length.toString()} subtext={isPortfolioEmpty ? 'No managed properties yet' : 'Managed Assets'} color="blue" iconNode={<LucideIcons.Building2 className="w-full h-full" strokeWidth={1.8} />} />
                                    <MetricCard title="Total Units" value={totalUnits.toString()} subtext={isPortfolioEmpty ? 'Portfolio has no units yet' : 'Portfolio Size'} color="indigo" iconNode={<LucideIcons.LayoutGrid className="w-full h-full" strokeWidth={1.8} />} />
                                    <MetricCard title="Occupancy" value={isPortfolioEmpty ? '—' : `${occupancyRate}%`} subtext={isPortfolioEmpty ? 'Portfolio occupancy: No units added' : `${occupiedUnits} Occupied`} color="green" iconNode={<LucideIcons.DoorOpen className="w-full h-full" strokeWidth={1.8} />} />
                                    <MetricCard title="Collection (MTD)" value={`KES ${(collectionStats.collected/1000).toFixed(1)}k`} subtext={isPortfolioEmpty ? 'No collections this month' : `${collectionStats.rate}% Collected`} color="purple" iconNode={<LucideIcons.Wallet className="w-full h-full" strokeWidth={1.8} />} />

                                </>
                            )}
                        </div>

                        {/* Main Content Grid */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Left Column: Performance Graph & Table */}
                            <div className="lg:col-span-2 space-y-6">
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                    <h3 className="font-bold text-gray-800 mb-4">Payment Performance</h3>
                                    
                                    <div className="grid grid-cols-1 gap-8">
                                        {/* Graph */}
                                        <div>
                                            <div className="flex justify-end mb-2">
                                                <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100">
                                                    Collection %
                                                </span>
                                            </div>
                                            <ChartContainer type="line" data={paymentTrendData} options={{ 
                                                responsive: true, 
                                                maintainAspectRatio: false,
                                                scales: { y: { beginAtZero: true, max: 100 } },
                                                plugins: { legend: { display: false } }
                                            }} height="h-64" />
                                            <p className="text-center text-xs text-gray-400 mt-4 italic">Typically 60% of rent is collected by the 10th.</p>
                                        </div>
                                        
                                        {/* Interactive Table */}
                                        <div>
                                            {/* Date Buttons */}
                                            <div className="flex flex-wrap gap-2 mb-4 bg-gray-50 p-1 rounded-lg">
                                                {[1, 5, 10, 15, 20, 25, 30].map(day => (
                                                    <button
                                                        key={day}
                                                        onClick={() => setSelectedDayFilter(day)}
                                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                                                            selectedDayFilter === day 
                                                            ? 'bg-green-600 text-white shadow-sm' 
                                                            : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                                        }`}
                                                    >
                                                        {day === 1 ? '1st' : day === 2 ? '2nd' : day === 3 ? '3rd' : `${day}th`}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="flex justify-between items-center mb-3 bg-green-50 p-3 rounded-lg border border-green-100">
                                                <span className="text-sm font-bold text-green-800">Collection by Day {selectedDayFilter}</span>
                                                <span className="text-xl font-extrabold text-green-600">{paymentPerformanceLogic.currentPercentage}%</span>
                                            </div>

                                            <div className="border rounded-lg overflow-hidden h-48 overflow-y-auto">
                                                <table className="min-w-full text-xs text-left">
                                                    <thead className="bg-gray-100 text-gray-600 font-bold sticky top-0">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left">TENANT</th>
                                                            <th className="px-3 py-2 text-left">UNIT</th>
                                                            <th className="px-3 py-2 text-right">PAID</th>
                                                            <th className="px-3 py-2 text-right">DATE</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100">
                                                        {paymentPerformanceLogic.tablePayments.slice(0, 5).map((p: any, i: number) => (
                                                            <tr key={i} className="border-b border-gray-50 last:border-0">
                                                                <td className="py-2 font-medium text-gray-800">{p.tenantName} <span className="text-gray-400 text-[9px] ml-1">{p.unit}</span></td>
                                                                <td className="py-2 text-gray-500">{p.unit}</td>
                                                                <td className="py-2 text-right text-green-600 font-bold">
                                                                    {p.amount ? p.amount : `KES ${Number(p.amountVal ?? 0).toLocaleString()}`}
                                                                </td>
                                                                <td className="py-2 text-right text-gray-500">{p.date}</td>
                                                            </tr>
                                                        ))}
                                                        {paymentPerformanceLogic.tablePayments.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-gray-400 italic">No payments recorded by this date.</td></tr>}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right Column: Health & Insights */}
                            <div className="space-y-6">
                                {/* Portfolio Health Card */}
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden">
                                    <span aria-hidden className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gradient-to-br from-primary/15 to-secondary/15 blur-2xl" />
                                    <div className="relative flex items-center justify-between mb-5">
                                        <h3 className="font-bold text-gray-800 tracking-tight">Portfolio Health</h3>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 px-2 py-0.5 rounded-full">Score {collectionStats.health}%</span>
                                    </div>
                                    <div className="relative space-y-5">
                                        {[
                                            { label: 'Occupancy', value: occupancyRate, threshold: 80, goodGrad: 'from-blue-500 to-indigo-500', badGrad: 'from-rose-500 to-rose-600' },
                                            { label: 'Collection Efficiency', value: collectionStats.rate, threshold: 80, goodGrad: 'from-emerald-500 to-teal-500', badGrad: 'from-amber-500 to-orange-500' },
                                        ].map((m) => (
                                            <div key={m.label}>
                                                <div className="flex justify-between items-end mb-1.5">
                                                    <span className="text-xs font-semibold text-gray-600">{m.label}</span>
                                                    <span className="text-sm font-extrabold text-gray-900 tabular-nums">{m.value}%</span>
                                                </div>
                                                <div className="relative w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                                    <div
                                                        className={`h-2 rounded-full transition-all duration-700 bg-gradient-to-r ${m.value < m.threshold ? m.badGrad : m.goodGrad} shadow-[0_0_10px_-2px_currentColor]`}
                                                        style={{ width: `${Math.min(m.value, 100)}%` }}
                                                    />
                                                    <span aria-hidden className="absolute inset-y-0 left-0 w-full pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.4) 0 1px, transparent 1px 25%)' }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Insights & Alerts Cards */}
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-bold text-gray-800 tracking-tight">Insights & Alerts</h3>
                                        <span className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center ring-1 ring-amber-200">
                                            <LucideIcons.Bell className="w-4 h-4" />
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2.5">
                                        {alerts.map((alert, idx) => {
                                            const tone = alert.type === 'critical'
                                                ? { stripe: 'bg-rose-500', bg: 'bg-rose-50/70', text: 'text-rose-800', ring: 'ring-rose-200', iconBg: 'bg-rose-100 text-rose-600' }
                                                : alert.type === 'warning'
                                                ? { stripe: 'bg-amber-500', bg: 'bg-amber-50/70', text: 'text-amber-800', ring: 'ring-amber-200', iconBg: 'bg-amber-100 text-amber-600' }
                                                : { stripe: 'bg-sky-500',   bg: 'bg-sky-50/70',   text: 'text-sky-800',   ring: 'ring-sky-200',   iconBg: 'bg-sky-100 text-sky-600' };
                                            return (
                                                <div key={idx} className={`relative pl-4 pr-3 py-3 rounded-xl ${tone.bg} ring-1 ${tone.ring} ${tone.text} flex items-start gap-3 transition hover:shadow-sm`}>
                                                    <span aria-hidden className={`absolute left-0 top-2 bottom-2 w-1 rounded-r-full ${tone.stripe}`} />
                                                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone.iconBg} flex-shrink-0`}>
                                                        <Icon name={alert.type === 'critical' ? 'vacant-house' : alert.type === 'warning' ? 'arrears' : 'analytics'} className="w-4 h-4" />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-sm">{alert.title}</p>
                                                        <p className="text-xs opacity-90 mt-0.5 leading-relaxed">{alert.text}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                )}

                {!tabCollapsed && activeTab === 'properties' && (
                    <div className="space-y-8 animate-fade-in">
                        {/* Multi-Select Filter */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-2">Filter Properties</p>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setSelectedPropertyIds([])}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${selectedPropertyIds.length === 0 ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                >
                                    All Properties
                                </button>
                                {allLandlordProperties.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => togglePropertySelection(p.id)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors flex items-center ${selectedPropertyIds.includes(p.id) ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                                    >
                                        {p.name}
                                        {selectedPropertyIds.includes(p.id) && <Icon name="check" className="w-3 h-3 ml-1" />}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {propertyLayouts.map(prop => {
                            const propOccupied = prop.units.filter(u => u.status === 'Occupied').length;
                            const propOccRate = prop.units.length > 0 ? Math.round((propOccupied / prop.units.length) * 100) : 0;
                            return (
                            <div key={prop.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                {/* Banner header */}
                                <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-5 text-white overflow-hidden">
                                    <div aria-hidden className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                                    <div aria-hidden className="absolute -top-12 -right-10 w-56 h-56 rounded-full bg-primary/25 blur-3xl" />
                                    <div className="relative flex flex-col md:flex-row justify-between md:items-center gap-4">
                                        <div className="flex items-start gap-3 min-w-0">
                                            <div className="w-12 h-12 rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">
                                                <LucideIcons.Building2 className="w-6 h-6" strokeWidth={1.6} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="text-xl font-extrabold tracking-tight truncate">{prop.name}</h3>
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ring-1 ${prop.status === 'Active' ? 'bg-emerald-400/20 text-emerald-100 ring-emerald-300/30' : 'bg-rose-400/20 text-rose-100 ring-rose-300/30'}`}>
                                                        {prop.status}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-white/70 mt-1 flex items-center gap-1.5">
                                                    <LucideIcons.MapPin className="w-3 h-3" />
                                                    {prop.location || prop.branch} · {prop.units.length} Units · {propOccRate}% occupied
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5 flex-wrap">
                                            {prop.newTenantsCount > 0 && (
                                                <span className="px-2.5 py-1 bg-sky-400/15 text-sky-100 ring-1 ring-sky-300/30 rounded-full text-[11px] font-bold flex items-center backdrop-blur">
                                                    <span className="w-1.5 h-1.5 bg-sky-300 rounded-full mr-1.5 animate-pulse" />
                                                    {prop.newTenantsCount} New
                                                </span>
                                            )}
                                            {prop.arrearsCount > 0 && (
                                                <span className="px-2.5 py-1 bg-rose-400/15 text-rose-100 ring-1 ring-rose-300/30 rounded-full text-[11px] font-bold flex items-center backdrop-blur">
                                                    <span className="w-1.5 h-1.5 bg-rose-300 rounded-full mr-1.5" />
                                                    {prop.arrearsCount} Arrears
                                                </span>
                                            )}
                                            {prop.distressedCount > 0 && (
                                                <span className="px-2.5 py-1 bg-fuchsia-400/15 text-fuchsia-100 ring-1 ring-fuchsia-300/30 rounded-full text-[11px] font-bold flex items-center backdrop-blur">
                                                    <span className="w-1.5 h-1.5 bg-fuchsia-300 rounded-full mr-1.5 animate-pulse" />
                                                    {prop.distressedCount} Distressed
                                                </span>
                                            )}
                                            {prop.maintenanceCount > 0 && (
                                                <span className="px-2.5 py-1 bg-amber-400/15 text-amber-100 ring-1 ring-amber-300/30 rounded-full text-[11px] font-bold flex items-center backdrop-blur">
                                                    <span className="w-1.5 h-1.5 bg-amber-300 rounded-full mr-1.5" />
                                                    {prop.maintenanceCount} Maint.
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Occupancy slim bar */}
                                    <div className="relative mt-4 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 shadow-[0_0_8px_-1px_rgba(52,211,153,0.6)] transition-all duration-700" style={{ width: `${propOccRate}%` }} />
                                    </div>
                                </div>

                                <div className="p-6 space-y-6">
                                    {Object.entries(prop.unitMap).sort((a,b) => Number(a[0]) - Number(b[0])).map(([floorNum, units]: [string, Unit[]]) => (
                                        <div key={floorNum}>
                                            <div className="flex items-center gap-2 mb-2.5">
                                                <span className="w-1 h-4 rounded-full bg-gradient-to-b from-primary to-secondary" />
                                                <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                                    {Number(floorNum) === 0 ? 'Ground Floor' : `Floor ${floorNum}`}
                                                </h4>
                                                <span className="text-[10px] text-gray-400 font-semibold ml-auto">{units.length} units</span>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                                {units.map(u => {
                                                    const t = myTenants.find(tn => tn.unitId === u.id);
                                                    const isNew = t ? (new Date(t.onboardingDate) >= new Date(new Date().setDate(new Date().getDate() - 30))) : false;
                                                    return <UnitBox 
                                                                key={u.id} 
                                                                unit={u} 
                                                                tenant={t} 
                                                                isNewTenant={isNew} 
                                                            />;
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            );
                        })}

                    </div>
                )}

                {/* FINANCIALS TAB */}
                {!tabCollapsed && activeTab === 'financials' && (
                    <div className="space-y-6 animate-fade-in">
                        {financialView === 'summary' ? (
                            <>
                                <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center ring-1 ring-primary/20">
                                            <LucideIcons.CalendarRange className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Statement Period</p>
                                            <input
                                                type="month"
                                                value={financialPeriod}
                                                onChange={e => setFinancialPeriod(e.target.value)}
                                                className="text-sm font-bold bg-transparent border-none p-0 focus:outline-none text-gray-800 cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setFinancialView('revenue')} className="px-4 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 text-xs flex items-center transition">
                                            <LucideIcons.Users className="w-3.5 h-3.5 mr-1.5" /> Tenant Revenue
                                        </button>
                                        <button onClick={() => handleDownloadStatement('Income')} className="px-4 py-2.5 bg-gradient-to-r from-primary to-primary-dark text-white font-bold rounded-xl hover:shadow-lg hover:-translate-y-0.5 text-xs flex items-center transition shadow-md">
                                            <LucideIcons.FileDown className="w-3.5 h-3.5 mr-1.5" /> Income Statement
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                                    {/* Income Statement Preview - hero */}
                                    <div className="lg:col-span-2 relative overflow-hidden rounded-2xl p-6 text-white shadow-lg bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                                        <div aria-hidden className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-emerald-500/25 blur-3xl" />
                                        <div aria-hidden className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full bg-primary/25 blur-3xl" />
                                        <div className="relative">
                                            <div className="flex items-center gap-2 mb-5">
                                                <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-emerald-400 to-teal-300" />
                                                <h3 className="text-sm font-bold tracking-tight uppercase opacity-90">Income Statement</h3>
                                            </div>
                                            <div className="space-y-3 text-sm">
                                                <div className="flex justify-between items-baseline">
                                                    <span className="text-white/70">Gross Revenue</span>
                                                    <span className="font-bold tabular-nums">KES {Number(financials.grossRevenueMonth ?? 0).toLocaleString()}</span>
                                                </div>
                                                <div className="flex justify-between items-baseline text-rose-200">
                                                    <span>Total Deductions</span>
                                                    <span className="font-bold tabular-nums">- KES {Number(financials.monthlyDeductions ?? 0).toLocaleString()}</span>
                                                </div>
                                                <div className="h-px bg-white/15 my-2" />
                                                <div className="pt-1">
                                                    <p className="text-[10px] uppercase tracking-widest text-emerald-300 font-bold">Net Payout</p>
                                                    <p className="text-3xl font-extrabold text-emerald-300 tabular-nums tracking-tight mt-1 drop-shadow">
                                                        KES {Number(financials.netIncome ?? 0).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Deductions Summary */}
                                    <div className="lg:col-span-3 grid grid-cols-2 gap-3">
                                        {[
                                            { label: 'Placement Fees', value: financials.placementFeeDeduction, sub: `${financials.newTenants.length} new tenants`, grad: 'from-indigo-500 to-violet-500', icon: <LucideIcons.UserPlus className="w-4 h-4" /> },
                                            { label: 'Bills & Utilities', value: financials.billDeductions, sub: 'Vendor invoices', grad: 'from-orange-500 to-amber-500', icon: <LucideIcons.Receipt className="w-4 h-4" /> },
                                            { label: 'Mgmt & Rules', value: financials.ruleDeductions, sub: `${financials.activeRules.length} active rules`, grad: 'from-sky-500 to-blue-500', icon: <LucideIcons.Settings2 className="w-4 h-4" /> },
                                            { label: 'Maintenance', value: financials.maintenanceDeductions, sub: 'Completed jobs', grad: 'from-slate-500 to-gray-600', icon: <LucideIcons.Wrench className="w-4 h-4" /> },
                                        ].map((d) => (
                                            <div key={d.label} className="group relative overflow-hidden bg-white p-4 rounded-2xl ring-1 ring-gray-100 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
                                                <span aria-hidden className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${d.grad}`} />
                                                <div className="flex items-start justify-between mb-2">
                                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">{d.label}</p>
                                                    <span className={`w-7 h-7 rounded-lg bg-gradient-to-br ${d.grad} text-white flex items-center justify-center shadow-sm opacity-90`}>
                                                        {d.icon}
                                                    </span>
                                                </div>
                                                <p className="text-lg font-extrabold text-rose-600 tabular-nums tracking-tight">- KES {Number(d.value ?? 0).toLocaleString()}</p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">{d.sub}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                            </>
                        ) : (
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-fade-in">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-800">Tenant Revenue Report</h3>
                                        <p className="text-sm text-gray-500">Period: {financialPeriod}</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={() => setFinancialView('summary')} className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded hover:bg-gray-200 text-sm">
                                            Back to Financials
                                        </button>
                                        <button onClick={() => handleDownloadStatement('Revenue')} className="px-4 py-2 bg-primary text-white font-medium rounded hover:bg-primary-dark text-sm flex items-center">
                                            <Icon name="download" className="w-4 h-4 mr-2" /> Download CSV
                                        </button>
                                    </div>
                                </div>
                               
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Tenant</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Property</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Unit</th>
                                                <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase">Rent Amount</th>
                                                <th className="px-4 py-3 text-right font-medium text-gray-500 uppercase">Amount Paid</th>
                                                <th className="px-4 py-3 text-center font-medium text-gray-500 uppercase">Status</th>
                                                <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase">Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {(() => {
                                                let totalRent = 0;
                                                let totalPaid = 0;
                                                const naturalUnit = (t: TenantProfile) => {
                                                    const label = String((t as any).unitTag || (t as any).paymentAccount || t.unit || '').trim();
                                                    const numbers = [...label.matchAll(/\d+/g)].map(m => parseInt(m[0], 10)).filter(n => !Number.isNaN(n));
                                                    return { number: numbers.length ? numbers[numbers.length - 1] : Number.MAX_SAFE_INTEGER, label: label.toLowerCase() };
                                                };
                                                const sortedTenants = [...myTenants].sort((a, b) => {
                                                    const na = naturalUnit(a), nb = naturalUnit(b);
                                                    if (na.number !== nb.number) return na.number - nb.number;
                                                    const u = na.label.localeCompare(nb.label, undefined, { numeric: true, sensitivity: 'base' });
                                                    if (u !== 0) return u;
                                                    return String(a.propertyName || '').localeCompare(String(b.propertyName || ''));
                                                });
                                                const rows = sortedTenants.map((t, idx) => {
                                                    const isNew = t.onboardingDate.startsWith(financialPeriod);
                                                    const rentDisplayed = Number(t.rentAmount ?? 0);
                                                    const card = computeTenantCardBalance(t, financialPeriod, { isAllocated: true });
                                                    const paidThisMonth = card.amountPaidThisMonth || 0;
                                                    const advanceApplied = card.advanceFromPriorMonths || 0;
                                                    const combinedPaid = paidThisMonth + advanceApplied;
                                                    const status: 'Paid' | 'Partial' | 'Unpaid' =
                                                        rentDisplayed > 0 && combinedPaid + 0.5 >= rentDisplayed ? 'Paid'
                                                        : combinedPaid > 0.5 ? 'Partial'
                                                        : 'Unpaid';
                                                    totalRent += rentDisplayed;
                                                    totalPaid += combinedPaid;
                                                    const statusClass = status === 'Paid'
                                                        ? 'bg-green-100 text-green-800'
                                                        : status === 'Partial'
                                                            ? 'bg-amber-100 text-amber-800'
                                                            : 'bg-red-100 text-red-800';
                                                    const amtClass = status === 'Paid' ? 'text-green-700' : status === 'Partial' ? 'text-amber-600' : 'text-red-600';
                                                    return (
                                                        <tr key={idx} className="hover:bg-gray-50">
                                                            <td className="px-4 py-3 font-medium text-gray-800">{t.name}</td>
                                                            <td className="px-4 py-3 text-gray-600">{t.propertyName}</td>
                                                            <td className="px-4 py-3 text-gray-600">{t.unit}</td>
                                                            <td className="px-4 py-3 text-right font-bold text-gray-800">KES {rentDisplayed.toLocaleString()}</td>
                                                            <td className={`px-4 py-3 text-right font-bold ${amtClass}`}>
                                                                KES {Math.round(combinedPaid).toLocaleString()}
                                                                {advanceApplied > 0 && paidThisMonth > 0 && (
                                                                    <div className="text-[10px] font-normal text-gray-500">KES {Math.round(paidThisMonth).toLocaleString()} this month + KES {Math.round(advanceApplied).toLocaleString()} advance</div>
                                                                )}
                                                                {advanceApplied > 0 && paidThisMonth === 0 && (
                                                                    <div className="text-[10px] font-normal text-gray-500">from advance payment</div>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusClass}`}>{status}</span>
                                                            </td>
                                                            <td className="px-4 py-3 text-xs">
                                                                {isNew ? (
                                                                    <span className="text-red-600 font-bold">NEW · Placement Fee Applied (100%)</span>
                                                                ) : (
                                                                    <span className="text-green-600">Revenue Recognized</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                });
                                                return (
                                                    <>
                                                        {rows}
                                                        {myTenants.length === 0 && (
                                                            <tr><td colSpan={7} className="text-center py-8 text-gray-500">No tenant records found.</td></tr>
                                                        )}
                                                        {myTenants.length > 0 && (
                                                            <tr className="bg-gray-50 font-bold border-t-2 border-gray-300">
                                                                <td className="px-4 py-3 text-gray-800" colSpan={3}>Totals</td>
                                                                <td className="px-4 py-3 text-right text-gray-900">KES {totalRent.toLocaleString()}</td>
                                                                <td className={`px-4 py-3 text-right ${totalPaid >= totalRent ? 'text-green-700' : 'text-amber-700'}`}>KES {totalPaid.toLocaleString()}</td>
                                                                <td colSpan={2}></td>
                                                            </tr>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {!tabCollapsed && activeTab === 'requests' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                        {/* Request Management */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-primary to-secondary" />
                                    <h3 className="text-base font-extrabold text-gray-800 tracking-tight">Requests & Feedback</h3>
                                </div>
                                <div className="flex gap-1.5">
                                    <button onClick={() => handleNewRequest('General')} className="text-[11px] font-bold bg-sky-50 text-sky-700 ring-1 ring-sky-200 px-3 py-1.5 rounded-lg hover:bg-sky-100 transition flex items-center gap-1"><LucideIcons.MessageSquare className="w-3 h-3" /> General</button>
                                    <button onClick={() => handleNewRequest('Maintenance')} className="text-[11px] font-bold bg-amber-50 text-amber-700 ring-1 ring-amber-200 px-3 py-1.5 rounded-lg hover:bg-amber-100 transition flex items-center gap-1"><LucideIcons.Wrench className="w-3 h-3" /> Maintenance</button>
                                    <button onClick={() => handleNewRequest('Eviction')} className="text-[11px] font-bold bg-rose-50 text-rose-700 ring-1 ring-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-100 transition flex items-center gap-1"><LucideIcons.ShieldAlert className="w-3 h-3" /> Eviction</button>
                                </div>
                            </div>
                            <div className="space-y-2.5">
                                {landlordRequests.map((req) => (
                                    <div key={req.id} className="group relative pl-4 p-3 bg-gradient-to-br from-gray-50 to-white rounded-xl ring-1 ring-gray-100 hover:ring-primary/30 hover:shadow-sm transition">
                                        <span aria-hidden className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-primary to-secondary" />
                                        <div className="flex justify-between items-start gap-2">
                                            <span className="font-bold text-sm text-gray-800">{req.title}</span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full ring-1 ring-amber-200 whitespace-nowrap">{req.status}</span>
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1"><LucideIcons.Calendar className="w-3 h-3" /> {new Date(req.dueDate).toISOString().slice(0, 10)} · {req.property}</p>
                                    </div>
                                ))}
                                {landlordRequests.length === 0 && (
                                    <div className="p-6 bg-gray-50 rounded-xl ring-1 ring-dashed ring-gray-200 text-center">
                                        <LucideIcons.Inbox className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                        <p className="text-xs text-gray-500 italic">No requests submitted yet.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Notices & Tasks */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <div className="flex items-center gap-2 mb-4">
                                <span className="w-1.5 h-5 rounded-full bg-gradient-to-b from-amber-500 to-orange-500" />
                                <h3 className="text-base font-extrabold text-gray-800 tracking-tight">Notices & Active Tasks</h3>
                            </div>
                            <div className="space-y-2.5">
                                {myTenants.filter(t => t.status === 'Notice').map(t => (
                                    <div key={t.id} className="relative pl-4 p-3 rounded-xl bg-orange-50/60 ring-1 ring-orange-200 flex items-start gap-3">
                                        <span aria-hidden className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-orange-500" />
                                        <span className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center flex-shrink-0 ring-1 ring-orange-200">
                                            <LucideIcons.LogOut className="w-4 h-4" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-bold text-sm text-orange-900">Vacate Notice</p>
                                            <p className="text-[11px] text-orange-800/90">Tenant <strong>{t.name}</strong> (Unit {t.unit}) vacating on {t.leaseEnd}.</p>
                                        </div>
                                    </div>
                                ))}
                                {myTasks.slice(0, 3).map(t => (
                                    <div key={t.id} className="relative pl-4 p-3 rounded-xl bg-sky-50/60 ring-1 ring-sky-200 flex items-start gap-3">
                                        <span aria-hidden className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-sky-500" />
                                        <span className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center flex-shrink-0 ring-1 ring-sky-200">
                                            <LucideIcons.Wrench className="w-4 h-4" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-bold text-sm text-sky-900">{t.title}</p>
                                            <p className="text-[11px] text-sky-800/90">{t.property} · {t.status}</p>
                                        </div>
                                    </div>
                                ))}
                                {myTenants.filter(t => t.status === 'Notice').length === 0 && myTasks.length === 0 && (
                                    <div className="p-6 bg-gray-50 rounded-xl ring-1 ring-dashed ring-gray-200 text-center">
                                        <LucideIcons.CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                                        <p className="text-xs text-gray-500 italic">All clear — no active notices.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                
                 {!tabCollapsed && activeTab === 'growth' && (
                    <div className="animate-fade-in space-y-8">
                        {/* Hero Section */}
                        <div className="bg-gradient-to-r from-indigo-900 to-blue-900 rounded-2xl p-8 text-white relative overflow-hidden shadow-lg">
                            <div className="relative z-10 max-w-3xl">
                                <h2 className="text-3xl font-bold mb-4">Grow Your Wealth with TaskMe</h2>
                                <p className="text-blue-100 mb-8 text-lg">
                                    Leverage your position. Earn passive income by referring peers or investing your payout surplus into high-yield projects.
                                </p>
                                <div className="flex flex-wrap gap-6">
                                    <div>
                                        <p className="text-xs text-blue-300 uppercase font-bold mb-1">Total Referral Earnings</p>
                                        <p className="text-3xl font-extrabold">KES {referralEarnings.toLocaleString()}</p>
                                    </div>
                                    <div className="w-px bg-blue-700 h-12 hidden sm:block"></div>
                                    <div>
                                        <p className="text-xs text-blue-300 uppercase font-bold mb-1">Active R-REIT Investments</p>
                                        <p className="text-3xl font-extrabold">KES {activeInvestmentTotal.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                            <Icon name="reits" className="absolute -right-10 -bottom-10 w-80 h-80 text-white/5" />
                        </div>

                        {/* My Investments & Earnings */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Active Investments */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="font-bold text-gray-800 mb-4">My Active Investments</h3>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                                            <tr>
                                                <th className="px-3 py-2">Fund</th>
                                                <th className="px-3 py-2 text-right">Amount</th>
                                                <th className="px-3 py-2 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {myActiveInvestments.length > 0 ? myActiveInvestments.map((inv, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-3 py-2 font-medium">{inv.fundName}</td>
                                                    <td className="px-3 py-2 text-right">KES {inv.amount.toLocaleString()}</td>
                                                    <td className="px-3 py-2 text-center">
                                                        <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded font-bold">{inv.status}</span>
                                                    </td>
                                                </tr>
                                            )) : (
                                                <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400 italic">No active investments found.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                             {/* Commission History */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="font-bold text-gray-800 mb-4">Commission History</h3>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                                            <tr>
                                                <th className="px-3 py-2">Date</th>
                                                <th className="px-3 py-2">Description</th>
                                                <th className="px-3 py-2 text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {commissionHistory.length > 0 ? commissionHistory.map((tx, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-3 py-2 text-gray-600">{tx.date}</td>
                                                    <td className="px-3 py-2 font-medium">{tx.description || 'Referral Commission'}</td>
                                                    <td className="px-3 py-2 text-right text-green-600 font-bold">KES {tx.amount.toLocaleString()}</td>
                                                </tr>
                                            )) : (
                                                <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400 italic">No commissions earned yet.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Referral Center */}
                        <div>
                            <h3 className="text-xl font-bold text-gray-800 mb-6">Referral Center</h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Refer Landlord */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-full">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                                            <Icon name="landlords" className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-800 text-lg">Refer a Landlord</h4>
                                            <p className="text-xs text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded inline-block mt-1">Earn 10% of Mgmt Fee</p>
                                        </div>
                                    </div>
                                    <p className="text-gray-600 text-sm mb-6 flex-grow">
                                        Invite other property owners to join TaskMe Realty. You earn a recurring commission on the management fees we collect from their properties.
                                    </p>
                                    <div className="space-y-3">
                                        <div className="flex gap-2">
                                            <input readOnly value={referralLinkAgency} className="flex-grow p-2.5 bg-gray-50 border rounded-lg text-sm text-gray-600 focus:ring-2 focus:ring-blue-100 outline-none" />
                                            <button onClick={() => handleCopy(referralLinkAgency)} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-300">Copy</button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={() => handleShare('WhatsApp', referralLinkAgency)} className="py-2 bg-green-50 text-green-700 text-sm font-bold rounded-lg hover:bg-green-100 flex items-center justify-center">
                                                <Icon name="communication" className="w-4 h-4 mr-2" /> WhatsApp
                                            </button>
                                            <button onClick={() => handleShare('SMS', referralLinkAgency)} className="py-2 bg-blue-50 text-blue-700 text-sm font-bold rounded-lg hover:bg-blue-100 flex items-center justify-center">
                                                <Icon name="mail" className="w-4 h-4 mr-2" /> Message
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Refer Investor */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col h-full">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
                                            <Icon name="revenue" className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-gray-800 text-lg">Refer R-REIT Investor</h4>
                                            <p className="text-xs text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded inline-block mt-1">Earn 2.5% Commission</p>
                                        </div>
                                    </div>
                                    <p className="text-gray-600 text-sm mb-6 flex-grow">
                                        Know someone looking for high-yield investments? Invite them to our Renovation Funds. You earn a one-off commission on their invested capital.
                                    </p>
                                    <div className="space-y-3">
                                        <div className="flex gap-2">
                                            <input readOnly value={referralLinkInvestor} className="flex-grow p-2.5 bg-gray-50 border rounded-lg text-sm text-gray-600 focus:ring-2 focus:ring-purple-100 outline-none" />
                                            <button onClick={() => handleCopy(referralLinkInvestor)} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-bold rounded-lg hover:bg-gray-300">Copy</button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button onClick={() => handleShare('WhatsApp', referralLinkInvestor)} className="py-2 bg-green-50 text-green-700 text-sm font-bold rounded-lg hover:bg-green-100 flex items-center justify-center">
                                                <Icon name="communication" className="w-4 h-4 mr-2" /> WhatsApp
                                            </button>
                                            <button onClick={() => handleShare('SMS', referralLinkInvestor)} className="py-2 bg-blue-50 text-blue-700 text-sm font-bold rounded-lg hover:bg-blue-100 flex items-center justify-center">
                                                <Icon name="mail" className="w-4 h-4 mr-2" /> Message
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Investment Section */}
                        <div>
                            <div className="flex items-center justify-between mb-6">
                                 <h3 className="text-xl font-bold text-gray-800">Invest in R-REITs</h3>
                                 <button onClick={() => window.location.hash = '#/partial-rms/reits/investment-plans'} className="text-sm text-primary font-bold hover:underline">View All Funds</button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {funds.filter(f => f.status === 'Active').slice(0, 3).map(fund => (
                                    <div key={fund.id} className="p-5 border border-gray-200 rounded-xl hover:shadow-md transition-shadow bg-white">
                                        <div className="flex justify-between items-start mb-3">
                                            <h4 className="font-bold text-gray-800 text-lg line-clamp-1">{fund.name}</h4>
                                            <span className="text-xs font-bold bg-green-100 text-green-800 px-2 py-0.5 rounded whitespace-nowrap">30% APY</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mb-4 line-clamp-2">{fund.description}</p>
                                        
                                        <div className="space-y-2 mb-4">
                                            <div className="flex justify-between text-xs font-bold text-gray-600">
                                                <span>Raised: KES {(fund.capitalRaised/1000000).toFixed(1)}M</span>
                                                <span>{Math.round((fund.capitalRaised/fund.targetCapital)*100)}%</span>
                                            </div>
                                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-primary" style={{ width: `${(fund.capitalRaised/fund.targetCapital)*100}%` }}></div>
                                            </div>
                                        </div>

                                        <button 
                                            onClick={() => setSelectedInvestFund(fund)}
                                            className="w-full py-2.5 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-black transition-colors"
                                        >
                                            Invest Now
                                        </button>
                                    </div>
                                ))}
                                {funds.filter(f => f.status === 'Active').length === 0 && (
                                    <div className="col-span-full text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-gray-500">
                                        No active funds available for investment right now.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                 )}
            </div>
            
             {/* MODALS */}
            {isStatementOpen && (
                <IncomeStatementModal 
                    data={financials} 
                    period={financialPeriod} 
                    landlord={currentLandlord} 
                    landlordProperties={allLandlordProperties.map(p => ({ id: p.id, name: p.name }))}
                    selectedPropertyId={selectedPropertyIds.length === 1 ? selectedPropertyIds[0] : 'all'}
                    onSelectProperty={(id) => setSelectedPropertyIds(id === 'all' ? [] : [id])}
                    totalUnits={totalUnits}
                    occupiedUnits={occupiedUnits}
                    onClose={() => setIsStatementOpen(false)} 
                />

            )}

            {isRequestModalOpen && (
                <NewRequestModal 
                    type={requestType} 
                    landlord={currentLandlord} 
                    onClose={() => setIsRequestModalOpen(false)} 
                    onSubmit={submitRequest} 
                />
            )}

            {selectedInvestFund && currentLandlord && (
                <LandlordInvestModal 
                    fund={selectedInvestFund} 
                    landlordName={currentLandlord.name} 
                    onClose={() => setSelectedInvestFund(null)} 
                    onConfirm={handleInvestmentConfirm} 
                />
            )}
        </div>
    );
};

export default LandlordsPortal;
