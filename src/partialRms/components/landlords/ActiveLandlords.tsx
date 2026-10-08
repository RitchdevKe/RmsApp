


import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { User, Property, TenantProfile, Task, Unit, TaskStatus, TaskPriority, Bill, Fund, Investment } from '@/types';
import Icon from '../Icon';
import { exportToCSV, printSection } from '@/utils/exportHelper';
import { isAgencyFeeOnRentRule, getPropertyAgencyCommission } from '@/utils/landlordPeriodFinancials';
import { fmtDate } from '@/utils/date';
import { getPaidPaymentsForMonth, parsePaymentAmount, sumPaidPaymentsForMonth, getRecognizedRentForMonth } from '@/utils/paymentReporting';
import { computeTenantCardBalance } from '@/utils/tenantCardBalance';
import { computeTenantArrears } from '@/utils/tenantArrears';
import { isAgencyRevenueStream } from '@/utils/revenueSplit';
import { isRepurposedUnit, countUnitBuckets } from '@/utils/repurposedUnits';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, BarElement, Filler } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { supabase } from '../../utils/supabaseClient';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

class LandlordDetailErrorBoundary extends React.Component<
    { onClose: () => void; children: React.ReactNode },
    { error: Error | null }
> {
    state = { error: null as Error | null };
    static getDerivedStateFromError(error: Error) { return { error }; }
    componentDidCatch(error: Error, info: React.ErrorInfo) {
        // eslint-disable-next-line no-console
        console.error('LandlordDetailView crashed:', error, info?.componentStack);
    }
    render() {
        if (this.state.error) {
            return (
                <div className="p-6 max-w-3xl mx-auto">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-6 space-y-3">
                        <h2 className="text-xl font-bold text-red-700">Couldn't open landlord profile</h2>
                        <p className="text-sm text-red-700">{String(this.state.error?.message || this.state.error)}</p>
                        <pre className="text-[11px] bg-white border border-red-100 rounded p-3 overflow-auto max-h-60">{String(this.state.error?.stack || '')}</pre>
                        <button onClick={this.props.onClose} className="px-4 py-2 bg-red-600 text-white rounded font-bold">Back to Landlords</button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

// --- Helper Components ---


const ChartContainer: React.FC<{ type: 'line' | 'bar'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
    return (
        <div className={`relative ${height} w-full`}>
            {type === 'line' ? <Line data={data} options={options} /> : <Bar data={data} options={options} />}
        </div>
    );
};

const MetricCard: React.FC<{ title: string; value: string; subtext?: string; color: 'blue' | 'green' | 'red' | 'orange' | 'indigo' | 'purple' }> = ({ title, value, subtext, color }) => {
    const colors = {
        blue: 'bg-blue-50 text-blue-700 border-blue-200',
        green: 'bg-green-50 text-green-700 border-green-200',
        red: 'bg-red-50 text-red-700 border-red-200',
        orange: 'bg-orange-50 text-orange-700 border-orange-200',
        indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        purple: 'bg-purple-50 text-purple-700 border-purple-200',
    };
    return (
        <div className={`p-4 rounded-xl border ${colors[color]} flex flex-col justify-between h-full transition-transform hover:-translate-y-1 shadow-sm`}>
            <p className="text-xs font-bold uppercase tracking-wider opacity-80">{title}</p>
            <div>
                <p className="text-2xl font-extrabold mt-1">{value}</p>
                {subtext && <p className="text-xs mt-1 opacity-80">{subtext}</p>}
            </div>
        </div>
    );
};

const AIInsightCard: React.FC<{ title: string; description: string; type: 'success' | 'warning' | 'info'; icon: string }> = ({ title, description, type, icon }) => {
    const styles = {
        success: 'bg-green-50 border-green-200 text-green-800',
        warning: 'bg-orange-50 border-orange-200 text-orange-800',
        info: 'bg-blue-50 border-blue-200 text-blue-800'
    };

    return (
        <div className={`p-4 rounded-xl border ${styles[type]} shadow-sm flex items-start gap-3 bg-white`}>
            <div className="mt-1 flex-shrink-0 p-1.5 rounded-lg bg-white/50">
                 <Icon name={icon} className="w-5 h-5" />
            </div>
            <div>
                <h4 className="font-bold text-sm mb-1">{title}</h4>
                <p className="text-xs opacity-90 leading-relaxed">{description}</p>
            </div>
        </div>
    );
};

const UnitBox: React.FC<{ unit: Unit; tenant?: TenantProfile; isNewTenant?: boolean; onManage?: () => void }> = ({ unit, tenant, isNewTenant, onManage }) => {
    const statusColor = useMemo(() => {
        if (isRepurposedUnit(unit)) return 'bg-blue-50 border-blue-300 text-blue-800';
        if (unit.status === 'Under Maintenance') return 'bg-yellow-50 border-yellow-200 text-yellow-800';
        if (!tenant && unit.status === 'Vacant') return 'bg-red-50 border-red-200 text-red-800';
        if (!tenant && unit.status === 'Occupied') return 'bg-amber-50 border-amber-300 text-amber-800';

        if (tenant?.houseStatus?.includes('Distressed')) return 'bg-blue-50 border-blue-300 text-blue-800';
        if (tenant?.houseStatus?.includes('Under Maintenance')) return 'bg-orange-50 border-orange-200 text-orange-800';

        if (tenant?.status === 'Notice') return 'bg-orange-50 border-orange-200 text-orange-800';
        if (tenant?.status === 'Overdue') return 'bg-red-50 border-red-200 text-red-900';
        return 'bg-green-50 border-green-200 text-green-800';
    }, [unit, tenant]);


    const handleClick = () => {
        if (tenant) {
            window.location.hash = `#/partial-rms/tenants/active-tenants?tenantId=${tenant.id}`;
        } else if (onManage) {
            onManage();
        }
    };

    return (
        <div 
            className={`p-3 rounded-lg border ${statusColor} flex flex-col justify-between h-28 text-xs relative group cursor-pointer transition-all hover:shadow-md overflow-hidden`} 
            onClick={handleClick}
        >
            <div className="flex justify-between items-start">
                <span className="font-bold text-lg">{unit.unitNumber}</span>
                <span className="opacity-70 bg-white/20 px-1.5 py-0.5 rounded text-[10px]">{unit.unitType || `${unit.bedrooms}BR`}</span>
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
                    <span className="italic opacity-80 text-sm font-semibold">
                        {isRepurposedUnit(unit) ? 'Repurposed' : unit.status}
                    </span>
                )}
            </div>

            <div className="mt-auto pt-2 border-t border-black/5 flex justify-between items-center">
                <span className="opacity-80 font-mono">{unit.rent ? `KES ${unit.rent.toLocaleString()}` : '-'}</span>
                {tenant?.leaseEnd && (
                    <span className="text-[9px] opacity-70">
                        End: {fmtDate(tenant.leaseEnd)}
                    </span>
                )}
            </div>

            {/* Badges for Unit Status */}
            {(unit.status === 'Landlords residence' || unit.landlordResidence) && (
                <div className="absolute top-0 right-0 bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold uppercase">
                    Residence
                </div>
            )}
            {!tenant && unit.status === 'Distressed' && (
                <div className="absolute top-0 right-0 bg-purple-600 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold">
                    DISTRESSED
                </div>
            )}
            {!tenant && unit.status === 'Unhabitable' && (
                <div className="absolute top-0 right-0 bg-gray-900 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold">
                    UNHABITABLE
                </div>
            )}
            {!tenant && unit.status === 'Under Maintenance' && (
                <div className="absolute top-0 right-0 bg-yellow-600 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold">
                    MAINTENANCE
                </div>
            )}

            {/* Badges for Tenant Status */}
            {tenant?.houseStatus?.includes('Distressed') && (
                <div className="absolute top-0 right-0 bg-purple-600 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold">
                    DISTRESSED
                </div>
            )}
             {tenant?.houseStatus?.includes('Under Maintenance') && !tenant?.houseStatus?.includes('Distressed') && (
                <div className="absolute top-0 right-0 bg-orange-600 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold">
                    MAINTENANCE
                </div>
            )}

            {!tenant?.houseStatus?.includes('Distressed') && !tenant?.houseStatus?.includes('Under Maintenance') && tenant?.status === 'Notice' && (
                <div className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold">
                    VACATING
                </div>
            )}
             {!tenant?.houseStatus?.includes('Distressed') && !tenant?.houseStatus?.includes('Under Maintenance') && tenant?.status === 'Overdue' && (
                <div className="absolute top-0 right-0 bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded-bl shadow-sm font-bold">
                    ARREARS
                </div>
            )}

            {/* Caretaker — additional status chip that coexists with any primary status */}
            {unit.caretakerAssigned && (
                <div
                    className="absolute bottom-0 left-0 bg-secondary text-white text-[9px] px-1.5 py-0.5 rounded-tr shadow-sm font-bold uppercase tracking-wide"
                    title={unit.caretakerName ? `Caretaker: ${unit.caretakerName}` : 'Caretaker assigned'}
                >
                    Caretaker
                </div>
            )}

            {/* Store — additional status chip for units used for storage */}
            {unit.usedAsStore && (
                <div
                    className={`absolute ${unit.caretakerAssigned ? 'bottom-0 left-[72px]' : 'bottom-0 left-0'} bg-indigo-600 text-white text-[9px] px-1.5 py-0.5 rounded-tr shadow-sm font-bold uppercase tracking-wide`}
                    title="Used as Store"
                >
                    Store
                </div>
            )}

            {/* Landlords Residence — additional status chip */}
            {unit.landlordResidence && (
                <div
                    className={`absolute ${
                        unit.caretakerAssigned && unit.usedAsStore
                            ? 'bottom-0 left-[144px]'
                            : unit.caretakerAssigned || unit.usedAsStore
                            ? 'bottom-0 left-[72px]'
                            : 'bottom-0 left-0'
                    } bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded-tr shadow-sm font-bold uppercase tracking-wide`}
                    title="Landlords residence"
                >
                    Residence
                </div>
            )}
        </div>
    );
};

// --- Modals ---

export const UnitStatusModal: React.FC<{ 
    unit: Unit; 
    property: Property;
    onClose: () => void;
    onSave: (status: Unit['status'], caretakerAssigned: boolean, caretakerName: string | undefined, usedAsStore: boolean, landlordResidence: boolean) => void;
}> = ({ unit, property, onClose, onSave }) => {
    const [selectedStatus, setSelectedStatus] = useState<Unit['status']>(unit.status);
    const [caretakerAssigned, setCaretakerAssigned] = useState<boolean>(!!unit.caretakerAssigned);
    const [caretakerName, setCaretakerName] = useState<string>(unit.caretakerName || '');
    const [usedAsStore, setUsedAsStore] = useState<boolean>(!!unit.usedAsStore);
    const [landlordResidence, setLandlordResidence] = useState<boolean>(!!unit.landlordResidence);

    const statuses: Array<{ value: Unit['status']; label: string; color: string }> = [
        { value: 'Vacant', label: 'Vacant (Ready to Let)', color: 'bg-green-100 text-green-800' },
        { value: 'Under Maintenance', label: 'Under Maintenance', color: 'bg-yellow-100 text-yellow-800' },
        { value: 'Distressed', label: 'Distressed', color: 'bg-purple-100 text-purple-800' },
        { value: 'Unhabitable', label: 'Unhabitable', color: 'bg-gray-800 text-white' },
        { value: 'Landlords residence', label: 'Landlords residence', color: 'bg-blue-100 text-blue-800' },
    ];

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1300] p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Manage Unit Status</h3>
                <p className="text-sm text-gray-500 mb-6">
                    {property.name} - Unit <strong>{unit.unitNumber}</strong>
                </p>
                
                <div className="space-y-3 mb-6">
                    {statuses.map(option => (
                        <button
                            key={option.value}
                            onClick={() => setSelectedStatus(option.value)}
                            className={`w-full text-left p-3 rounded-lg border transition-all ${
                                selectedStatus === option.value 
                                ? `border-primary ring-2 ring-primary/20 ${option.color}` 
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <span className="font-bold text-sm">{option.label}</span>
                        </button>
                    ))}
                </div>

                {/* Landlords Residence — additional status indicating the unit is used as a landlord's residence */}
                <div className="mb-6 p-3 rounded-lg border border-secondary/40 bg-secondary/5">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={landlordResidence}
                            onChange={e => setLandlordResidence(e.target.checked)}
                            className="w-4 h-4 accent-primary"
                        />
                        <span className="font-bold text-sm text-gray-800">Landlords residence</span>
                    </label>
                    <p className="text-[11px] text-gray-500 mt-1 ml-6">
                        Shown alongside the unit's status. Use when a unit is occupied by the landlord.
                    </p>
                </div>

                {/* Caretaker — additional status that stacks with any primary status above */}
                <div className="mb-6 p-3 rounded-lg border border-secondary/40 bg-secondary/5">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={caretakerAssigned}
                            onChange={e => setCaretakerAssigned(e.target.checked)}
                            className="w-4 h-4 accent-primary"
                        />
                        <span className="font-bold text-sm text-gray-800">Caretaker assigned</span>
                    </label>
                    <p className="text-[11px] text-gray-500 mt-1 ml-6">
                        Shown alongside the unit's primary status.
                    </p>
                    {caretakerAssigned && (
                        <input
                            type="text"
                            value={caretakerName}
                            onChange={e => setCaretakerName(e.target.value)}
                            placeholder="Caretaker name (optional)"
                            className="mt-2 w-full text-sm p-2 border border-gray-200 rounded focus:ring-1 focus:ring-primary"
                        />
                    )}
                </div>

                {/* Store — additional status indicating the unit is used as a storage room */}
                <div className="mb-6 p-3 rounded-lg border border-secondary/40 bg-secondary/5">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={usedAsStore}
                            onChange={e => setUsedAsStore(e.target.checked)}
                            className="w-4 h-4 accent-primary"
                        />
                        <span className="font-bold text-sm text-gray-800">Used as Store</span>
                    </label>
                    <p className="text-[11px] text-gray-500 mt-1 ml-6">
                        Shown alongside the unit's primary status. Use when a vacant unit is being used for storage.
                    </p>
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-medium hover:bg-gray-200">Cancel</button>
                    <button onClick={() => onSave(selectedStatus, caretakerAssigned, caretakerName.trim() || undefined, usedAsStore, landlordResidence)} className="px-6 py-2 bg-primary text-white rounded font-bold hover:bg-primary-dark shadow-sm">Save Status</button>
                </div>
            </div>
        </div>
    );
};

export const IncomeStatementModal: React.FC<{ 
    data: any; 
    period: string;
    landlord: User;
    onClose: () => void; 
}> = ({ data, period, landlord, onClose }) => {
    const { systemSettings } = useData();
    const companyName: string = systemSettings?.companyName || 'TaskMe Realty';
    const companyAddress: string = systemSettings?.address || '';
    const companyPhone: string = systemSettings?.phone || '';
    const companyLogo: string | null = systemSettings?.logo || null;
    const initials = companyName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w: string) => w[0])
        .join('')
        .toUpperCase();
    const revenue = Number(data.grossRevenueMonth) || 0;
    const actualCollected = Number(data.actualCollectedMonth) || 0;
    const deductions = Number(data.monthlyDeductions) || 0;
    const netIncome = actualCollected - deductions;
    const marginPct = revenue > 0 ? Math.round((netIncome / revenue) * 100) : 0;
    const expected = Number(data.expectedRevenueMonth) || 0;
    const unpaid = Number(data.unpaidRevenue) || Math.max(0, expected - revenue);
    const collectionPct = expected > 0 ? Math.min(100, Math.round((actualCollected / expected) * 100)) : 0;
    const statusLabel: 'PAID' | 'UNPAID' =
        unpaid > 0 ? 'UNPAID' : 'PAID';
    const statusTone =
        statusLabel === 'PAID'
            ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
            : 'bg-rose-100 text-rose-700 ring-rose-200';

    // Group deductions by category, with subtotals
    const groupedDeductions = React.useMemo(() => {
        const groups: Record<string, { items: Array<{ description: string; amount: number }>; total: number }> = {};
        (data.detailedDeductions || []).forEach((d: any) => {
            const k = d.category || 'Other';
            if (!groups[k]) groups[k] = { items: [], total: 0 };
            groups[k].items.push({ description: d.description, amount: Number(d.amount) || 0 });
            groups[k].total += Number(d.amount) || 0;
        });
        return Object.entries(groups).sort((a, b) => b[1].total - a[1].total);
    }, [data.detailedDeductions]);

    const reference = `IS-${(landlord.id || '').toString().slice(-6).toUpperCase() || '------'}-${period.replace(/\s+/g, '').toUpperCase()}`;

    const handlePrint = () => {
        printSection('printable-income-statement', `Income Statement - ${landlord.name} - ${period}`);
    };

    return (
        <div className="fixed inset-0 bg-slate-900/70 z-[1400] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-50 rounded-2xl shadow-2xl max-w-3xl w-full flex flex-col max-h-[92vh] animate-fade-in overflow-hidden">
                {/* Toolbar (not printed) */}
                <div className="px-5 py-3 border-b border-slate-200 flex justify-between items-center bg-white">
                    <div className="flex items-center gap-2">
                        <Icon name="reports" className="w-5 h-5 text-primary" />
                        <h3 className="font-semibold text-slate-800 text-sm">Income Statement · {period}</h3>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-md hover:bg-slate-100" aria-label="Close">
                        <Icon name="close" className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Document area */}
                <div className="p-6 overflow-auto flex-grow bg-slate-100">
                    <div
                        id="printable-income-statement"
                        className="mx-auto bg-white rounded-xl border-2 border-slate-200 shadow-sm overflow-hidden min-w-[780px]"
                        style={{ maxWidth: '780px' }}
                    >
                        {/* Letterhead band */}
                        <div className="bg-gradient-to-r from-primary to-primary-dark text-white px-8 py-6 flex justify-between items-center">
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 rounded-xl bg-white/95 flex flex-shrink-0 items-center justify-center overflow-hidden shadow-sm ring-1 ring-white/40">
                                    {companyLogo ? (
                                        <img src={companyLogo} alt={`${companyName} logo`} className="w-full h-full object-contain p-2" />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center">
                                            <span className="text-primary font-black text-xl tracking-tight">TM</span>
                                            <span className="text-primary/70 font-bold text-[8px] tracking-[0.2em] -mt-1">HOLDINGS</span>
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
                            <div className="grid grid-cols-4 gap-3">
                                <div className="rounded-lg border border-slate-200 p-3">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Revenue {data.isOccupancyBased ? '(Occupancy)' : ''}</p>
                                    <p className="text-base font-bold text-slate-900 mt-1">KES {revenue.toLocaleString()}</p>
                                    <p className="text-[9px] text-slate-500 mt-0.5">100% Direct to Landlord</p>
                                </div>
                                <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3">
                                    <p className="text-[10px] text-rose-600 uppercase font-bold tracking-wider">Deductions</p>
                                    <p className="text-base font-bold text-rose-700 mt-1">KES {deductions.toLocaleString()}</p>
                                    <p className="text-[9px] text-rose-500 mt-0.5">Invoiced Agency Commission</p>
                                </div>
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                                    <p className="text-[10px] text-emerald-700 uppercase font-bold tracking-wider">Net Capital Position</p>
                                    <p className="text-base font-bold text-emerald-700 mt-1">KES {netIncome.toLocaleString()}</p>
                                    <p className="text-[10px] text-emerald-600/80 mt-0.5">Margin {marginPct}%</p>
                                </div>
                                <div className="rounded-lg border border-cyan-200 bg-cyan-50/40 p-3">
                                    <p className="text-[10px] text-cyan-700 uppercase font-bold tracking-wider">Collected MTD</p>
                                    <p className="text-base font-bold text-cyan-700 mt-1">KES {actualCollected.toLocaleString()}</p>
                                    <p className="text-[10px] text-cyan-600/80 mt-0.5">Reporting only</p>
                                </div>
                            </div>

                            {/* Collection performance */}
                            {expected > 0 && (
                                <div className="rounded-lg border border-slate-200 bg-white p-4">
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

                            {/* Financial Table */}
                            <div className="rounded-lg border border-slate-200 overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50">
                                        <tr className="border-b border-slate-200">
                                            <th className="text-left px-4 py-2.5 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">Description</th>
                                            <th className="text-left px-4 py-2.5 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">Category</th>
                                            <th className="text-right px-4 py-2.5 font-semibold text-slate-600 uppercase text-[10px] tracking-wider">Amount (KES)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        <tr className="bg-white">
                                            <td className="px-4 py-3 font-semibold text-slate-800" colSpan={2}>Gross Rental Revenue</td>
                                            <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">{revenue.toLocaleString()}</td>
                                        </tr>

                                        {groupedDeductions.length > 0 && (
                                            <tr className="bg-rose-50/60">
                                                <td colSpan={3} className="px-4 py-2 text-[10px] font-bold text-rose-700 uppercase tracking-wider">Less: Deductions</td>
                                            </tr>
                                        )}

                                        {groupedDeductions.map(([cat, group]) => (
                                            <React.Fragment key={cat}>
                                                <tr className="bg-slate-50/60">
                                                    <td colSpan={3} className="px-4 py-1.5 text-[10px] font-semibold text-slate-600 uppercase tracking-wider">{cat}</td>
                                                </tr>
                                                {group.items.map((item, idx) => (
                                                    <tr key={`${cat}-${idx}`} className="hover:bg-slate-50">
                                                        <td className="px-4 py-2 pl-6 text-slate-700">{item.description}</td>
                                                        <td className="px-4 py-2 text-slate-500 text-xs">{cat}</td>
                                                        <td className="px-4 py-2 text-right text-rose-600 tabular-nums">({item.amount.toLocaleString()})</td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-white">
                                                    <td className="px-4 py-2 pl-6 text-xs font-semibold text-slate-600 italic" colSpan={2}>Subtotal · {cat}</td>
                                                    <td className="px-4 py-2 text-right text-xs font-bold text-rose-700 tabular-nums">({group.total.toLocaleString()})</td>
                                                </tr>
                                            </React.Fragment>
                                        ))}

                                        {groupedDeductions.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-3 text-center text-xs text-slate-400 italic">No deductions for this period</td>
                                            </tr>
                                        )}

                                        <tr className="bg-slate-50 border-t border-slate-200">
                                            <td className="px-4 py-3 font-semibold text-slate-700" colSpan={2}>Total Deductions</td>
                                            <td className="px-4 py-3 text-right font-bold text-rose-700 tabular-nums">({deductions.toLocaleString()})</td>
                                        </tr>

                                        <tr className="bg-emerald-50 border-t-2 border-emerald-600">
                                            <td className="px-4 py-4 font-extrabold uppercase text-emerald-900 tracking-wide" colSpan={2}>Net Income (Payout)</td>
                                            <td className="px-4 py-4 text-right font-extrabold text-emerald-700 text-base tabular-nums">KES {netIncome.toLocaleString()}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Payout instructions */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2 rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">Payout instructions</p>
                                    {data.isDirectCollectionActive ? (
                                        <p className="text-xs text-slate-700 leading-relaxed">
                                            ⚡ <strong className="text-indigo-700">Direct Paybill Routing Model</strong>: Gross revenue of <strong className="text-indigo-700">KES {revenue.toLocaleString()}</strong> has been collected directly into your M-Pesa shortcode on property file.
                                            TaskMe agency commissions & service fees of <strong className="text-rose-600">KES {deductions.toLocaleString()}</strong> are billed directly to you for cash/reference settlement. Reference: <strong>{reference}</strong>.
                                            {data.settlementStatus === 'Settled' ? (
                                                <span className="block mt-2 font-bold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-md text-[10px] uppercase w-fit">✓ Dues Settled (Paid to Agency)</span>
                                            ) : (
                                                <span className="block mt-2 font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md text-[10px] uppercase w-fit">⚡ settlement outstanding</span>
                                            )}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-slate-700 leading-relaxed">
                                            Net payout of <strong className="text-emerald-700">KES {netIncome.toLocaleString()}</strong> will be remitted to the landlord's bank/mobile money account on file.
                                            Please quote reference <strong>{reference}</strong> for any inquiries.
                                        </p>
                                    )}
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
                            <div className="grid grid-cols-2 gap-8 pt-4">
                                <div>
                                    <div className="h-10 border-b border-slate-300"></div>
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">Prepared by · {companyName}</p>
                                </div>
                                <div>
                                    <div className="h-10 border-b border-slate-300"></div>
                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mt-1">Received by · Landlord</p>
                                </div>
                            </div>

                            <div className="text-[10px] text-slate-400 text-center border-t border-slate-100 pt-4">
                                <p>Generated on {fmtDate(new Date())} · This is a computer generated document and does not require a signature.</p>
                                <p className="mt-1 font-medium text-slate-500">Property@taskmeholdings.com</p>
                            </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-5 py-3 border-t border-slate-200 bg-white flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md font-medium hover:bg-slate-200 text-sm">Close</button>
                    <button onClick={handlePrint} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-md font-medium flex items-center hover:bg-slate-200 text-sm">
                        <Icon name="download" className="w-4 h-4 mr-2" /> Download PDF
                    </button>
                    <button onClick={handlePrint} className="px-4 py-2 bg-primary text-white rounded-md font-medium flex items-center hover:bg-primary-dark shadow-sm text-sm">
                        <Icon name="reports" className="w-4 h-4 mr-2" /> Print Statement
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

    return (
        <div className="fixed inset-0 bg-black/50 z-[1400] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
                <h3 className="text-xl font-bold mb-4 text-gray-800">{type} Request</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                        <input placeholder="Subject" value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2 border rounded-md focus:ring-2 focus:ring-primary/50 outline-none"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
                        <input placeholder="Property Name (Optional)" value={property} onChange={e => setProperty(e.target.value)} className="w-full p-2 border rounded-md focus:ring-2 focus:ring-primary/50 outline-none"/>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Details</label>
                        <textarea placeholder="Describe the request..." value={desc} onChange={e => setDesc(e.target.value)} rows={4} className="w-full p-2 border rounded-md focus:ring-2 focus:ring-primary/50 outline-none"/>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200">Cancel</button>
                        <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded-md font-medium hover:bg-primary-dark shadow-sm">Submit Request</button>
                    </div>
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
        // Simulate processing
        setTimeout(() => {
            setStep('success');
        }, 1000);
    };

    const handleFinish = () => {
        onConfirm(parseFloat(amount));
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1500] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-800">Invest in {fund.name}</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>

                {step === 'input' ? (
                    <div className="space-y-4">
                        <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                            <p><strong>Investor:</strong> {landlordName}</p>
                            <p><strong>Target APY:</strong> {fund.targetApy}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES)</label>
                            <input 
                                type="number" 
                                value={amount} 
                                onChange={e => setAmount(e.target.value)} 
                                className="w-full p-3 border rounded-lg font-bold"
                                placeholder="50,000"
                            />
                        </div>
                        <div className="text-xs text-gray-500">
                            Funds will be deducted from your pending payout or payable via M-Pesa.
                        </div>
                        <button onClick={handleInvest} className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary-dark">
                            Confirm Investment
                        </button>
                    </div>
                ) : (
                    <div className="text-center py-6">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icon name="check" className="w-8 h-8 text-green-600" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800">Investment Successful!</h3>
                        <p className="text-gray-600 mt-2">You have invested KES {parseFloat(amount).toLocaleString()}.</p>
                        <button onClick={handleFinish} className="mt-6 px-6 py-2 bg-gray-100 text-gray-700 font-bold rounded-lg">
                            Done
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Comprehensive Detail View (REPLACES MODAL, NOW FULL PAGE STYLE) ---

export const LandlordDetailView: React.FC<{
    landlord: User;
    onClose: () => void;
}> = ({ landlord, onClose }) => {
    const { properties, tenants, tasks, deductionRules, bills, addInvestment, updateProperty, updateLandlord } = useData();
    const [activeTab, setActiveTab] = useState<'overview' | 'portfolio' | 'financials' | 'communication'>('overview');
    const [financialView, setFinancialView] = useState<'summary' | 'revenue'>('summary');
    const [financialPeriod, setFinancialPeriod] = useState(getCurrentMonthIso()); // YYYY-MM
    const [selectedDayFilter, setSelectedDayFilter] = useState<number>(30); // Default to end of month
    
    const [isMovingToFull, setIsMovingToFull] = useState(false);

    const handleUpgradeToFull = async () => {
        const mode = window.confirm(
            `Move ${landlord.name} to Full RMS?\n\n` +
            `OK   → Move landlord PROFILE ONLY (properties/tenants stay in Partial RMS).\n` +
            `Cancel → Choose 'Move EVERYTHING' instead?`
        ) ? 'profile' : null;

        let chosenMode: 'profile' | 'full' | null = mode as any;
        if (!chosenMode) {
            const everything = window.confirm(
                `Move EVERYTHING for ${landlord.name}?\n\n` +
                `This carries the landlord, their properties, units, active tenants, ` +
                `bills and payment history into the Full RMS workspace, and removes ` +
                `them from Partial RMS.\n\nProceed?`
            );
            if (!everything) return;
            chosenMode = 'full';
        }

        try {
            setIsMovingToFull(true);
            // Optimistically reflect the change locally so the badge updates.
            updateLandlord(landlord.id, { managementType: 'Full RMS' });
            properties.filter(p => p.landlordId === landlord.id).forEach(prop => {
                updateProperty(prop.id, { remittanceType: 'Occupancy Based', managementType: 'Full' });
            });

            const { data, error } = await (supabase as any).schema('app').rpc(
                'move_partial_landlord_to_full',
                { p_landlord_id: landlord.id, p_mode: chosenMode }
            );

            if (error) {
                console.error('[move_partial_landlord_to_full]', error);
                alert(
                    `Move failed: ${error.message}\n\n` +
                    `Make sure scripts/0125_move_partial_landlord_to_full.sql has been ` +
                    `applied to your Supabase database.`
                );
                return;
            }

            const s = data || {};
            alert(
                `${landlord.name} moved to Full RMS (${chosenMode}).\n\n` +
                `Properties: ${s.properties_moved ?? 0}\n` +
                `Tenants: ${s.tenants_moved ?? 0}\n` +
                `Bills: ${s.bills_moved ?? 0}\n` +
                `Applications: ${s.applications_moved ?? 0}`
            );
            onClose();
        } finally {
            setIsMovingToFull(false);
        }
    };
    
    const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
    const [selectedInvestFund, setSelectedInvestFund] = useState<Fund | null>(null);

    const [isStatementOpen, setIsStatementOpen] = useState(false);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [requestType, setRequestType] = useState<'General' | 'Maintenance' | 'Eviction'>('General');
    
    // State for Unit Status Modal
    const [unitToManage, setUnitToManage] = useState<{unit: Unit, property: Property} | null>(null);

    // --- Data Aggregation ---
    const allLandlordProperties = useMemo(() => properties.filter(p => p.landlordId === landlord.id), [properties, landlord.id]);

    const myProperties = useMemo(() => {
        if (selectedPropertyIds.length === 0) return allLandlordProperties;
        return allLandlordProperties.filter(p => selectedPropertyIds.includes(p.id));
    }, [allLandlordProperties, selectedPropertyIds]);

    const myTenants = useMemo(() => tenants.filter(t => myProperties.some(p => p.id === t.propertyId)), [tenants, myProperties]);

    // Self-heal: correct mismatches between unit.status and actual tenant occupancy.
    //
    // Vacant→Occupied  (forward, safe direction):
    //   Fires when a tenant with an OCCUPYING status has unitId pointing to a Vacant unit.
    //   Uses OCCUPYING_STATUSES so that Vacated/Evicted/etc. tenants don't keep a unit Occupied.
    //
    // Occupied→Vacant  (reverse direction):
    //   Fires ONLY when NO tenant of ANY status has unitId pointing to the unit.
    //   This prevents false-vacancy for tenants whose status is Vacated/Evicted/Blacklisted/
    //   Inactive but whose unitId hasn't been cleared yet — those units must stay Occupied
    //   until the tenant record is fully unlinked.
    //
    // Guard: skip entirely if either properties or the global tenants array haven't loaded.
    //   tenantsSettled uses tenants.length (full array), not myTenants.length (filtered subset),
    //   so a partial hydration state (some tenants present, others not yet) can't pass the guard.
    const OCCUPYING_STATUSES = ['Active', 'Pending', 'PendingAllocation', 'PendingPayment', 'Overdue', 'Notice'];
    useEffect(() => {
        if (allLandlordProperties.length === 0) return;
        const tenantsSettled = tenants.length > 0;
        myProperties.forEach(prop => {
            const staleUnits = (prop.units || []).filter(u => {
                // Forward: any active-status tenant linked to this unit → must be Occupied
                const hasActiveTenant = myTenants.some(t => t.unitId === u.id && OCCUPYING_STATUSES.includes(t.status));
                // Reverse: no tenant of ANY status linked to this unit → must be Vacant
                const hasAnyTenant = tenants.some(t => t.unitId === u.id);
                if (hasActiveTenant && u.status === 'Vacant') return true;
                if (!hasAnyTenant && u.status === 'Occupied' && tenantsSettled) return true;
                return false;
            });
            if (staleUnits.length > 0) {
                const updatedUnits = (prop.units || []).map(u => {
                    const hasActiveTenant = myTenants.some(t => t.unitId === u.id && OCCUPYING_STATUSES.includes(t.status));
                    const hasAnyTenant = tenants.some(t => t.unitId === u.id);
                    if (hasActiveTenant && u.status === 'Vacant') return { ...u, status: 'Occupied' as const };
                    if (!hasAnyTenant && u.status === 'Occupied' && tenantsSettled) return { ...u, status: 'Vacant' as const };
                    return u;
                });
                updateProperty(prop.id, { units: updatedUnits });
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenants, myTenants, myProperties, allLandlordProperties.length]);

    const myTasks = useMemo(() => tasks.filter(t => myProperties.some(p => p.name === t.property)), [tasks, myProperties]);
   
    // Live Financials
    const financials = useMemo(() => {
        // Gross revenue = amount actually PAID in the period (not expected rent).
        // Management/agency fees must be calculated on collected rent, not on
        // expected/billed rent — landlord-period semantics.
        // Revenue calculation based on property remittance type (Collection vs Occupancy)
        let grossRevenueMonth = 0;
        let expectedRevenueMonth = 0;
        let isOccupancyBased = false;
        let directRevenueMonth = 0;
        let agencyRevenueMonth = 0;

        const occupyingStatuses = ['active', 'pending', 'pendingallocation', 'pendingpayment', 'pendingapproval', 'overdue', 'notice'];
        const normalizeUnit = (value: any) => String(value || '').trim().toLowerCase();
        const expectedOccupiedRentForProperty = (property: Property) => {
            return (property.units || [])
                .filter(unit => !isRepurposedUnit(unit))
                .reduce((sum, unit) => {
                    const unitRent = myTenants
                        .filter(t =>
                            t.propertyId === property.id &&
                            occupyingStatuses.includes((t.status || '').toLowerCase()) &&
                            (
                                (t.unitId && t.unitId === unit.id) ||
                                (normalizeUnit(t.unit) && [unit.unitNumber, unit.unitTag, (unit as any).name]
                                    .some(candidate => normalizeUnit(candidate) === normalizeUnit(t.unit)))
                            )
                        )
                        .reduce((max, t) => Math.max(max, Number(t.rentAmount) || 0), 0);
                    return sum + unitRent;
                }, 0);
        };

        myProperties.forEach(p => {
             const pTenants = myTenants.filter(t => t.propertyId === p.id);
             let pRevenue = 0;
             const pExpected = expectedOccupiedRentForProperty(p);

             if (p.remittanceType === 'Occupancy Based') {
                 isOccupancyBased = true;
                 pRevenue = pExpected;
             } else {
                 pRevenue = pTenants.reduce((sum, t) => sum + sumPaidPaymentsForMonth(t, financialPeriod), 0);
             }
             grossRevenueMonth += pRevenue;
             expectedRevenueMonth += pExpected;
        });


        directRevenueMonth = grossRevenueMonth;
        agencyRevenueMonth = 0;

        // Add any tenants that somehow do NOT map to myProperties
        const matchedTenantIds = new Set(myProperties.flatMap(p => myTenants.filter(t => t.propertyId === p.id).map(t => t.id)));
        myTenants.forEach(t => {
            if (!matchedTenantIds.has(t.id)) {
                 grossRevenueMonth += sumPaidPaymentsForMonth(t, financialPeriod);
                 expectedRevenueMonth += (t.rentAmount || 0);
            }
        });
        
        // MTD actual collections for reporting (the real money collected, ignoring occupancy logic)
        const actualCollectedMonth = myTenants.reduce((sum, t) => sum + sumPaidPaymentsForMonth(t, financialPeriod), 0);
        const allTimeRevenue = expectedRevenueMonth * 12; // Mock projection
        const unpaidRevenue = Math.max(0, expectedRevenueMonth - grossRevenueMonth);
       
        const detailedDeductions: Array<{ category: string; description: string; amount: number }> = [];

        // 1. Placement Fees (New Tenants in Period, based on property setting)
        const newTenants = myTenants.filter(t => t.onboardingDate && String(t.onboardingDate).startsWith(financialPeriod));
        let placementFeeDeduction = 0;
        
        newTenants.forEach(t => {
            const prop = properties.find(p => p.id === t.propertyId);
            // Check property-specific placement fee setting via new `collectionSplit`
            let isPlacementFeeActive = prop?.placementFee !== false; 
            if (prop?.collectionSplit) {
                 isPlacementFeeActive = isAgencyRevenueStream(prop, 'placementFee');
            }

            if (isPlacementFeeActive) {
                const firstMonthRent = Number((t as any).firstMonthRent || 0);
                const amount = firstMonthRent > 0 ? firstMonthRent : (t.rentAmount || 0);
                placementFeeDeduction += amount;
                detailedDeductions.push({
                    category: 'Placement Fees',
                    description: `Placement Fee: ${t.name}`,
                    amount: amount
                });
            }
        });

        // 2. Rule Deductions
        let ruleDeductionsTotal = 0;
        const activeRules = deductionRules.filter(r => {
            if (r.status !== 'Active') return false;
            
            // Check One-Off date if present
            if (r.frequency === 'One-Off') {
                if (r.date) {
                    if (r.date !== financialPeriod) return false;
                } else {
                    // Legacy fallback: extract timestamp from id if possible
                    const parts = r.id.split('-');
                    if (parts[1]) {
                        const ts = parseInt(parts[1], 10);
                        if (!isNaN(ts)) {
                            const ruleDate = new Date(ts);
                            const ruleMonth = `${ruleDate.getFullYear()}-${String(ruleDate.getMonth() + 1).padStart(2, '0')}`;
                            if (ruleMonth !== financialPeriod) return false;
                        }
                    }
                }
            }

            return (r.applicability === 'Global' || 
            (r.applicability === 'Specific Landlord' && r.targetId === landlord.id) ||
            (r.applicability === 'Specific Property' && myProperties.some(p => p.id === r.targetId)));
        });

        activeRules.forEach(r => {
            let amount = 0;
            if (r.type === 'Fixed') {
                amount = r.value;
            } else {
                // Helper: per-property revenue base for this rule
                const perPropAmount = (prop: Property) => {
                    let propRevenue = 0;
                    const pTenants = myTenants.filter(t => t.propertyId === prop.id);
                    propRevenue = prop.remittanceType === 'Occupancy Based'
                        ? expectedOccupiedRentForProperty(prop)
                        : pTenants.reduce((s, t) => s + sumPaidPaymentsForMonth(t, financialPeriod), 0);
                    // For the agency-fee rule, prefer per-property override (set on Property registration form)
                    if (isAgencyFeeOnRentRule(r.name)) {
                        const { rate, fixed } = getPropertyAgencyCommission(prop, [r] as any);
                        if (fixed !== null && fixed !== undefined) return fixed;
                        return propRevenue * (rate || (r.value / 100));
                    }
                    return propRevenue * (r.value / 100);
                };


                if (r.applicability === 'Specific Property') {
                    const prop = myProperties.find(p => p.id === r.targetId);
                    if (prop) amount = perPropAmount(prop);
                } else if (isAgencyFeeOnRentRule(r.name)) {
                    // Global agency fee — apply per-property so per-property overrides flow through
                    amount = myProperties.reduce((s, p) => s + perPropAmount(p), 0);
                } else {
                    const base = grossRevenueMonth;
                    amount = base * (r.value / 100);
                }
            }
            ruleDeductionsTotal += amount;
            detailedDeductions.push({
                category: 'Management & Rules',
                description: r.name,
                amount: amount
            });
        });


        // 3. Bill Deductions
        const periodBills = bills.filter(b => 
                myProperties.some(p => p.id === b.propertyId) && 
                b.invoiceDate && String(b.invoiceDate).startsWith(financialPeriod)
        );
        const billDeductionsTotal = periodBills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
        
        periodBills.forEach(b => {
            detailedDeductions.push({
                category: 'Bills & Utilities',
                description: `${b.category} - ${b.vendor}`,
                amount: Number(b.amount) || 0
            });
        });

        // 4. Maintenance Deductions
        const periodTasks = myTasks.filter(t => 
            (t.status === 'Completed' || t.status === 'Closed') &&
            t.dueDate && String(t.dueDate).startsWith(financialPeriod) 
        );
        const maintenanceDeductionsTotal = periodTasks.reduce((sum, t) => sum + ((t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0)), 0);

        periodTasks.forEach(t => {
            const cost = (t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0);
            if (cost > 0) {
                detailedDeductions.push({
                    category: 'Maintenance',
                    description: `Maint: ${t.title} (${t.property})`,
                    amount: cost
                });
            }
        });

        const totalDeductions = ruleDeductionsTotal + billDeductionsTotal + maintenanceDeductionsTotal + placementFeeDeduction;
       
        // In Partial RMS, all landlords handle collection directly (Direct Route)
        const isDirectCollectionActive = true;
        const settledPeriods = landlord.settledPeriods || [];
        const settlementStatus = settledPeriods.includes(financialPeriod) ? 'Settled' : 'Unsettled';

        return { 
            grossRevenueMonth, 
            actualCollectedMonth,
            isOccupancyBased,
            allTimeRevenue, 
            unpaidRevenue, 
            ruleDeductions: ruleDeductionsTotal,
            billDeductions: billDeductionsTotal,
            maintenanceDeductions: maintenanceDeductionsTotal,
            placementFeeDeduction,
            newTenants,
            monthlyDeductions: totalDeductions, 
            netIncome: actualCollectedMonth - totalDeductions,
            activeRules,
            detailedDeductions,
            directRevenueMonth,
            agencyRevenueMonth,
            isDirectCollectionActive,
            settledPeriods,
            settlementStatus
        };
    }, [myTenants, myProperties, deductionRules, bills, myTasks, financialPeriod, landlord.id, properties]);

    // Occupancy Stats — exclude repurposed (Distressed/Unhabitable/Landlords residence/caretaker/store) from rentable base
    const unitBuckets = myProperties.reduce((acc, p) => {
        const b = countUnitBuckets(p.units || []);
        acc.total += b.total; acc.occupied += b.occupied; acc.vacant += b.vacant; acc.repurposed += b.repurposed;
        return acc;
    }, { total: 0, occupied: 0, vacant: 0, repurposed: 0 });
    const totalUnits = unitBuckets.total;
    const occupiedUnits = unitBuckets.occupied;
    const vacantCount = unitBuckets.vacant;
    const repurposedCount = unitBuckets.repurposed;
    const rentableUnits = totalUnits - repurposedCount;
    const occupancyRate = rentableUnits > 0 ? Math.round((occupiedUnits / rentableUnits) * 100) : 0;

    // Collection Rate — expected = monthly rent + outstanding deposit (when required); bar caps at 100% width; label can exceed 100% if overpaid
    const collectionStats = useMemo(() => {
        const expectedRentOnly = myTenants
            .filter(t => t.status !== 'Vacated' && t.status !== 'Evicted')
            .reduce((sum, t) => sum + (t.rentAmount || 0), 0);

        const depositOutstanding = myTenants
            .filter(t => t.status !== 'Vacated' && t.status !== 'Evicted')
            .reduce((sum, t) => {
                const prop = properties.find(p => p.id === t.propertyId);
                if (!prop?.deposit?.required) return sum;
                const months = prop.deposit.months ?? 1;
                const full = (t.rentAmount || 0) * months;
                return sum + Math.max(0, full - (t.depositPaid || 0));
            }, 0);

        const expected = expectedRentOnly + depositOutstanding;

        const collected = myTenants.reduce((sum, t) => sum + sumPaidPaymentsForMonth(t, financialPeriod), 0);

        const rate = expected > 0 ? Math.round((collected / expected) * 100) : 0;
        const barWidth = Math.min(rate, 100);
        const health = Math.round((occupancyRate * 0.5) + (rate * 0.5));

        return { expected, collected, rate, health, barWidth };
    }, [myTenants, financialPeriod, occupancyRate, properties]);


    // Payment Performance Graph Data Logic
    const paymentPerformanceLogic = useMemo(() => {
        const days = [1, 5, 10, 15, 20, 25, 30];
        const currentMonthPayments = myTenants.flatMap(t => getPaidPaymentsForMonth(t.paymentHistory, financialPeriod).map(p => ({
             ...p,
             tenantName: t.name,
             unit: t.unit,
             amountVal: parsePaymentAmount(p.amount),
             day: parseInt(p.date.split('-')[2])
        }))).sort((a,b) => b.day - a.day);

        const graphData = days.map(day => {
            const collectedUntilDay = currentMonthPayments.filter(p => p.day <= day).reduce((sum, p) => sum + p.amountVal, 0);
            const percentage = collectionStats.expected > 0 ? Math.round((collectedUntilDay / collectionStats.expected) * 100) : 0;
            return { day, percentage };
        });

        const tablePayments = currentMonthPayments.filter(p => p.day <= selectedDayFilter);

        const currentBucket = graphData.find(d => d.day === selectedDayFilter) || graphData[graphData.length-1];

        return { graphData, tablePayments, currentPercentage: currentBucket.percentage };
    }, [myTenants, financialPeriod, collectionStats, selectedDayFilter]);

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
                text: `Action required to fill vacancies in ${myProperties.filter(p => (p.units || []).some(u => u.status === 'Vacant')).map(p => p.name).join(', ')}.` 
            });
        }
        if (financials.unpaidRevenue > 0) {
            list.push({ 
                type: 'warning', 
                title: 'Collections Alert',
                text: `KES ${financials.unpaidRevenue.toLocaleString()} outstanding from ${myTenants.filter(t => t.status === 'Overdue').length} tenants.` 
            });
        }
        
        list.push({ 
            type: 'info', 
            title: 'Performance',
            text: 'Revenue is stable compared to last month.' 
        });
        
        return list;
    }, [vacantCount, financials.unpaidRevenue, myProperties, myTenants]);


    // Group units by property and floor for visual map
    const propertyLayouts = useMemo(() => {
        return myProperties.map(prop => {
            const unitMap: Record<number, Unit[]> = {};
            if (prop.floors) {
                for(let i=0; i<prop.floors; i++) unitMap[i] = [];
            }
            (prop.units || []).forEach(u => {
                const floorNum = u.floor !== undefined ? u.floor : 0;
                if (!unitMap[floorNum]) unitMap[floorNum] = [];
                unitMap[floorNum].push(u);
            });
            
            const propTenants = tenants.filter(t => t.propertyId === prop.id);
            const newTenantsCount = propTenants.filter(t => new Date(t.onboardingDate) >= new Date(new Date().setDate(new Date().getDate() - 30))).length;
            const arrearsCount = propTenants.filter(t => t.status === 'Overdue').length;
            const distressedCount = propTenants.filter(t => t.houseStatus?.includes('Distressed')).length;
            const maintenanceCount = propTenants.filter(t => t.houseStatus?.includes('Under Maintenance')).length;

            const buckets = countUnitBuckets(prop.units || []);
            return { ...prop, unitMap, newTenantsCount, arrearsCount, distressedCount, maintenanceCount, unitBuckets: buckets };
        });
    }, [myProperties, tenants]);

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
                New_Tenant: (t.onboardingDate && String(t.onboardingDate).startsWith(financialPeriod)) ? 'Yes' : 'No',
                Date: fmtDate(new Date())
            }));
            exportToCSV(data, `${landlord.name}_Revenue_Report`);
        }
    };

    const handleNewRequest = (type: 'General' | 'Maintenance' | 'Eviction') => {
        setRequestType(type);
        setIsRequestModalOpen(true);
    }

    const submitRequest = (req: any) => {
        alert(`${req.type} request submitted: ${req.title}`);
        setIsRequestModalOpen(false);
    }

    const togglePropertySelection = (id: string) => {
        setSelectedPropertyIds(prev => 
            prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
        );
    };

    const handleInvestmentConfirm = (amount: number) => {
        if (selectedInvestFund && landlord) {
            const newInv: Investment = { id: `inv-${Date.now()}`, fundId: selectedInvestFund.id, fundName: selectedInvestFund.name, amount: amount, date: getTodayIsoDate(), strategy: 'Monthly Payout', status: 'Active', accruedInterest: 0 };
            addInvestment(newInv);
            setSelectedInvestFund(null);
            alert(`Investment of KES ${amount.toLocaleString()} confirmed.`);
        }
    };

    const handleUpdateUnitStatus = (newStatus: Unit['status'], caretakerAssigned: boolean, caretakerName: string | undefined, usedAsStore: boolean, landlordResidence: boolean) => {
        if (!unitToManage) return;
        const property = unitToManage.property;
        const updatedUnits = (property.units || []).map(u =>
            u.id === unitToManage.unit.id
                ? { ...u, status: newStatus, caretakerAssigned, caretakerName: caretakerAssigned ? caretakerName : undefined, usedAsStore, landlordResidence }
                : u
        );
        updateProperty(property.id, { units: updatedUnits });
        setUnitToManage(null);
    };
    
    // Calculate arrears count for AI card usage
    const arrearsCount = myTenants.filter(t => t.status === 'Overdue').length;

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in"> 
            
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center flex-shrink-0 bg-white">
                <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary border-2 border-white shadow-sm">
                        {landlord.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">{landlord.name}</h1>
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                            <Icon name="mail" className="w-3 h-3" /> {landlord.email}
                            <span className="text-gray-300">|</span>
                            <Icon name="communication" className="w-3 h-3" /> {landlord.phone}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-bold rounded border border-blue-100">
                                {myProperties.length} Properties
                            </span>
                            <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs font-bold rounded border border-purple-100">
                                {totalUnits} Units
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    {(landlord.managementType === 'Partial RMS' || !landlord.managementType) && (
                        <button 
                            onClick={handleUpgradeToFull} 
                            disabled={isMovingToFull}
                            title="Move this landlord (and optionally their properties/tenants) back into the Full RMS workspace"
                            className="px-4 py-2 bg-green-100 text-green-700 font-bold rounded-lg border border-green-200 hover:bg-green-200 hover:shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isMovingToFull ? 'Moving…' : '→ Move to Full RMS'}
                        </button>
                    )}
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg text-gray-700 font-bold hover:bg-gray-200 flex items-center shadow-sm transition-colors">
                        Close
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="px-6 border-b border-gray-200 bg-gray-50 flex-shrink-0 overflow-x-auto">
                <div className="flex space-x-6">
                    {['overview', 'portfolio', 'financials', 'communication'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => { setActiveTab(tab as any); setFinancialView('summary'); }}
                            className={`py-4 px-2 text-sm font-medium border-b-2 transition-colors capitalize ${
                                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab === 'portfolio' ? 'Properties & Units' : tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-grow overflow-y-auto p-8 bg-gray-50/30">
               
                {activeTab === 'overview' && (
                    <div className="grid grid-cols-1 gap-6">
                        {/* Property Selector */}
                        {allLandlordProperties.length > 1 && (
                            <div className="mb-2">
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Viewing Data For:</label>
                                <select
                                    className="p-2 border rounded-lg bg-white shadow-sm text-sm font-medium text-gray-700 focus:ring-2 focus:ring-primary/50 outline-none w-full md:w-64"
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
                        <div className="bg-gradient-to-r from-indigo-900 to-purple-900 rounded-xl p-5 text-white shadow-md relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-6 opacity-10">
                                <Icon name="analytics" className="w-32 h-32 text-white" />
                            </div>
                            <div className="relative z-10">
                                <h3 className="text-sm font-bold mb-3 flex items-center uppercase tracking-wider opacity-90">
                                    <Icon name="analytics" className="w-4 h-4 mr-2 text-yellow-400" />
                                    TaskMe AI Intelligence
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-gray-800">
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
                            <MetricCard title="Properties" value={myProperties.length.toString()} subtext="Managed Assets" color="blue" />
                            <MetricCard title="Total Units" value={totalUnits.toString()} subtext="Portfolio Size" color="indigo" />
                            <MetricCard title="Occupancy" value={`${occupancyRate}%`} subtext={`${occupiedUnits} Occupied`} color="green" />
                            <MetricCard title="Collection (MTD)" value={`KES ${(collectionStats.collected/1000).toFixed(1)}k`} subtext={`${collectionStats.rate}% Collected`} color="purple" />
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
                                                                    {p.amount ? p.amount : `KES ${p.amountVal.toLocaleString()}`}
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
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                    <h3 className="font-bold text-gray-800 mb-4">Portfolio Health</h3>
                                    <div className="space-y-6">
                                        <div>
                                            <div className="flex justify-between items-end mb-1">
                                                <span className="text-sm font-medium text-gray-600">Occupancy</span>
                                                <span className="text-sm font-bold text-gray-900">{occupancyRate}%</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-2">
                                                <div
                                                    className={`h-2 rounded-full transition-all duration-500 ${occupancyRate < 80 ? 'bg-red-500' : 'bg-blue-600'}`}
                                                    style={{ width: `${occupancyRate}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-end mb-1">
                                                <span className="text-sm font-medium text-gray-600">Collection Efficiency</span>
                                                <span className="text-sm font-bold text-gray-900">{collectionStats.rate}%</span>
                                            </div>
                                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                                <div
                                                    className={`h-2 rounded-full transition-all duration-500 max-w-full ${collectionStats.rate < 80 ? 'bg-orange-500' : 'bg-green-500'}`}
                                                    style={{ width: `${collectionStats.barWidth}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Insights & Alerts Cards */}
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                    <h3 className="font-bold text-gray-800 mb-4">Insights & Alerts</h3>
                                    <div className="grid grid-cols-1 gap-3">
                                        {alerts.map((alert, idx) => (
                                            <div key={idx} className={`p-4 rounded-lg border-l-4 flex items-start ${
                                                alert.type === 'critical' ? 'bg-red-50 border-red-400 text-red-800' :
                                                alert.type === 'warning' ? 'bg-orange-50 border-orange-400 text-orange-800' :
                                                'bg-blue-50 border-blue-400 text-blue-800'
                                            }`}>
                                                <Icon name={alert.type === 'critical' ? 'vacant-house' : alert.type === 'warning' ? 'arrears' : 'analytics'} className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" />
                                                <div>
                                                    <p className="font-bold text-sm mb-1">{alert.title}</p>
                                                    <p className="text-xs opacity-90">{alert.text}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'portfolio' && (
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

                        {propertyLayouts.map(prop => (
                            <div key={prop.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 border-b border-gray-100 pb-4 gap-4">
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                                            {prop.name}
                                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold border ${prop.status === 'Active' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                                {prop.status}
                                            </span>
                                        </h3>
                                        <p className="text-sm text-gray-500">{prop.location || prop.branch} • {prop.unitBuckets.total} Units · <span className="text-green-700 font-semibold">{prop.unitBuckets.occupied} Occupied</span> · <span className="text-red-600 font-semibold">{prop.unitBuckets.vacant} Vacant</span>{prop.unitBuckets.repurposed > 0 && (<> · <span className="text-blue-600 font-semibold">{prop.unitBuckets.repurposed} Repurposed</span></>)}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        {prop.newTenantsCount > 0 && (
                                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold flex items-center">
                                                <span className="w-2 h-2 bg-blue-600 rounded-full mr-1.5 animate-pulse"></span>
                                                {prop.newTenantsCount} New Tenants
                                            </span>
                                        )}
                                        {prop.arrearsCount > 0 && (
                                            <span className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-xs font-bold flex items-center">
                                                <span className="w-2 h-2 bg-red-600 rounded-full mr-1.5"></span>
                                                {prop.arrearsCount} Arrears
                                            </span>
                                        )}
                                        {prop.distressedCount > 0 && (
                                            <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold flex items-center">
                                                <span className="w-2 h-2 bg-purple-600 rounded-full mr-1.5 animate-pulse"></span>
                                                {prop.distressedCount} Distressed
                                            </span>
                                        )}
                                        {prop.maintenanceCount > 0 && (
                                            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-lg text-xs font-bold flex items-center">
                                                <span className="w-2 h-2 bg-orange-600 rounded-full mr-1.5"></span>
                                                {prop.maintenanceCount} Maint.
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    {Object.entries(prop.unitMap).sort((a,b) => Number(a[0]) - Number(b[0])).map(([floorNum, units]: [string, Unit[]]) => (
                                        <div key={floorNum}>
                                            <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">
                                                {Number(floorNum) === 0 ? 'Ground Floor' : `Floor ${floorNum}`}
                                            </h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                                                {units.map(u => {
                                                    const t = myTenants.find(tn => tn.unitId === u.id);
                                                    const isNew = t ? (new Date(t.onboardingDate) >= new Date(new Date().setDate(new Date().getDate() - 30))) : false;
                                                    return <UnitBox 
                                                                key={u.id} 
                                                                unit={u} 
                                                                tenant={t} 
                                                                isNewTenant={isNew} 
                                                                onManage={() => setUnitToManage({unit: u, property: prop})}
                                                            />;
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* FINANCIALS TAB */}
                {activeTab === 'financials' && (
                    <div className="space-y-6">
                        {financialView === 'summary' ? (
                            <>
                                <div className="flex justify-between items-center bg-white p-4 rounded-lg shadow-sm border border-gray-200">
                                    <div className="flex items-center gap-4">
                                        <label className="text-sm font-medium text-gray-700">Statement Period:</label>
                                        <input
                                            type="month"
                                            value={financialPeriod}
                                            onChange={e => setFinancialPeriod(e.target.value)}
                                            className="p-2 border rounded-md text-sm font-medium bg-gray-50"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setFinancialView('revenue')} className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded hover:bg-gray-200 text-sm flex items-center">
                                            <Icon name="revenue" className="w-4 h-4 mr-2" /> View Tenant Revenue
                                        </button>
                                        <button onClick={() => handleDownloadStatement('Income')} className="px-4 py-2 bg-primary text-white font-medium rounded hover:bg-primary-dark text-sm flex items-center">
                                            <Icon name="download" className="w-4 h-4 mr-2" /> Income Statement
                                        </button>
                                    </div>
                                </div>
                                
                                {financials.isDirectCollectionActive && (
                                    <div className="bg-indigo-950 text-white p-6 rounded-2xl shadow-xl border-l-8 border-indigo-500 grid grid-cols-1 md:grid-cols-3 gap-6 items-center animate-fade-in">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="p-1 bg-indigo-900 rounded-full text-yellow-400 text-xs">⚡</span>
                                                <h4 className="text-xs font-bold uppercase tracking-wider opacity-90">Direct Paybill Collection</h4>
                                            </div>
                                            <p className="text-2xl font-black text-indigo-100">KES {financials.directRevenueMonth.toLocaleString()}</p>
                                            <p className="text-xs text-indigo-300">Deposited directly to shortcode: <strong className="text-white">{(landlord as any).payment_config?.mpesaPaybill || 'Sync Active'}</strong></p>
                                        </div>
                                        <div className="space-y-1 border-y md:border-y-0 md:border-x border-indigo-900 py-4 md:py-0 md:px-6">
                                            <p className="text-xs font-bold uppercase tracking-wider text-indigo-400">Agency Invoice (Deductions)</p>
                                            <p className="text-lg font-extrabold text-rose-400">KES {financials.monthlyDeductions.toLocaleString()}</p>
                                            <div className="text-xs mt-1">
                                                {financials.settlementStatus === 'Settled' ? (
                                                    <span className="text-emerald-400 font-bold flex items-center gap-1.5 text-xs">
                                                        ✓ Dues Settled (Paid to Agency)
                                                    </span>
                                                ) : (
                                                    <span className="text-amber-400 font-bold flex items-center gap-1.5 text-xs">
                                                        ⚠ Settlement Outstanding
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex md:justify-end gap-2">
                                            {financials.settlementStatus !== 'Settled' ? (
                                                <button
                                                    onClick={() => {
                                                        const ref = prompt("Enter settlement payment verification code / M-Pesa reference:");
                                                        if (ref) {
                                                            const currentSettled = landlord.settledPeriods || [];
                                                            updateLandlord(landlord.id, {
                                                                settledPeriods: [...currentSettled, financialPeriod]
                                                            });
                                                            alert(`Successfully recorded settlement of KES ${financials.monthlyDeductions.toLocaleString()} for ${financialPeriod}. Ref: ${ref}`);
                                                        }
                                                    }}
                                                    className="px-4 py-2.5 bg-yellow-400 hover:bg-yellow-300 text-indigo-950 font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm transition-all w-full md:w-auto"
                                                >
                                                    Record Cash Settlement
                                                </button>
                                            ) : (
                                                <div className="p-3 bg-indigo-900 rounded-lg text-center text-xs font-semibold w-full md:w-auto text-indigo-200">
                                                    Settlement Cleared ✓
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Income Statement Preview */}
                                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                                        <h3 className="text-lg font-bold text-gray-800 mb-4">Income Statement Preview</h3>
                                        <div className="space-y-3 text-sm">
                                            <div className="flex justify-between pb-2 border-b border-gray-100">
                                                <span className="text-gray-600">Total Gross Revenue</span>
                                                <span className="font-bold text-gray-900">KES {financials.grossRevenueMonth.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between pb-2 border-b border-gray-100 text-red-600">
                                                <span>Total Deductions</span>
                                                <span>- KES {financials.monthlyDeductions.toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between pt-2 text-lg font-extrabold text-green-700">
                                                <span>Net Income</span>
                                                <span>KES {financials.netIncome.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Deductions Summary */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-white p-4 rounded-xl border-t-4 border-indigo-500 shadow-sm">
                                            <p className="text-xs text-gray-500 uppercase">Placement Fees</p>
                                            <p className="text-xl font-extrabold text-red-600">- KES {financials.placementFeeDeduction.toLocaleString()}</p>
                                            <p className="text-xs text-gray-400">
                                                {financials.newTenants.filter(t => {
                                                    const prop = properties.find(p => p.id === t.propertyId);
                                                    return prop?.placementFee !== false;
                                                }).length} Fees Charged
                                            </p>
                                        </div>
                                        <div className="bg-white p-4 rounded-xl border-t-4 border-orange-500 shadow-sm">
                                            <p className="text-xs text-gray-500 uppercase">Bills & Utilities</p>
                                            <p className="text-xl font-extrabold text-red-600">- KES {financials.billDeductions.toLocaleString()}</p>
                                        </div>
                                        <div className="bg-white p-4 rounded-xl border-t-4 border-blue-500 shadow-sm">
                                            <p className="text-xs text-gray-500 uppercase">Mgmt & Rules</p>
                                            <p className="text-xl font-extrabold text-red-600">- KES {financials.ruleDeductions.toLocaleString()}</p>
                                        </div>
                                        <div className="bg-white p-4 rounded-xl border-t-4 border-gray-500 shadow-sm">
                                            <p className="text-xs text-gray-500 uppercase">Maintenance</p>
                                            <p className="text-xl font-extrabold text-red-600">- KES {financials.maintenanceDeductions.toLocaleString()}</p>
                                        </div>
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
                                                const rows = myTenants.map((t, idx) => {
                                                    const isNew = !!(t.onboardingDate && String(t.onboardingDate).startsWith(financialPeriod));
                                                    const prop = properties.find(p => p.id === t.propertyId);
                                                    const isPlacementFeeActive = prop?.placementFee !== false;
                                                    const rentDisplayed = (isNew && Number((t as any).firstMonthRent || 0) > 0 ? Number((t as any).firstMonthRent) : (t.rentAmount || 0));
                                                    // Feed directly from Balance Overview (computeTenantCardBalance):
                                                    // Amount Paid = rent + rent-arrears only (deposit, late fees, bills,
                                                    // utilities, fines are excluded per business rule).
                                                    const card = computeTenantCardBalance(t, financialPeriod, { isAllocated: true });
                                                    const paidThisMonth = card.amountPaidThisMonth || 0;
                                                    const advanceApplied = card.advanceFromPriorMonths || 0;
                                                    const grossPaid = paidThisMonth + advanceApplied;
                                                    let rentArrearsPaidThisMonth = 0;
                                                    try {
                                                        const arr = computeTenantArrears(t, financialPeriod);
                                                        rentArrearsPaidThisMonth = arr.paymentsAppliedToRent || 0;
                                                    } catch { /* ignore */ }
                                                    const combinedPaid = Math.min(grossPaid, rentDisplayed + rentArrearsPaidThisMonth);
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
                                                                    isPlacementFeeActive ? (
                                                                        <span className="text-red-600 font-bold">NEW · Placement Fee Applied</span>
                                                                    ) : (
                                                                        <span className="text-green-600 font-bold">NEW · Placement Fee Inactive (Paid to Landlord)</span>
                                                                    )
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


                {activeTab === 'communication' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Request Management */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-bold text-gray-800">Requests & Feedback</h3>
                                <div className="flex gap-2">
                                    <button onClick={() => handleNewRequest('General')} className="text-xs bg-gray-100 px-3 py-1 rounded hover:bg-gray-200">General</button>
                                    <button onClick={() => handleNewRequest('Maintenance')} className="text-xs bg-gray-100 px-3 py-1 rounded hover:bg-gray-200">Maintenance</button>
                                    <button onClick={() => handleNewRequest('Eviction')} className="text-xs bg-red-100 text-red-700 px-3 py-1 rounded hover:bg-red-200">Eviction</button>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {/* Mock requests for landlord view */}
                                <div className="p-3 bg-gray-50 rounded border border-gray-100">
                                    <div className="flex justify-between">
                                        <span className="font-bold text-sm">Roof Repair Request</span>
                                        <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">Pending</span>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-1">Submitted on 2025-11-10 regarding Block A.</p>
                                </div>
                            </div>
                        </div>

                        {/* Notices & Tasks */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                            <h3 className="text-lg font-bold text-gray-800 mb-4">Notices & Active Tasks</h3>
                            <div className="space-y-3">
                                {myTenants.filter(t => t.status === 'Notice').map(t => (
                                    <div key={t.id} className="p-3 bg-orange-50 rounded border border-orange-100 flex items-start">
                                        <Icon name="offboarding" className="w-5 h-5 text-orange-600 mr-2 mt-0.5" />
                                        <div>
                                            <p className="font-bold text-sm text-orange-800">Vacate Notice</p>
                                            <p className="text-xs text-orange-700">Tenant <strong>{t.name}</strong> (Unit {t.unit}) is vacating on {t.leaseEnd}.</p>
                                        </div>
                                    </div>
                                ))}
                                {myTasks.slice(0, 3).map(t => (
                                    <div key={t.id} className="p-3 bg-blue-50 rounded border border-blue-100 flex items-start">
                                        <Icon name="maintenance" className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
                                        <div>
                                            <p className="font-bold text-sm text-blue-800">{t.title}</p>
                                            <p className="text-xs text-blue-700">{t.property} • {t.status}</p>
                                        </div>
                                    </div>
                                ))}
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
                    landlord={landlord} 
                    onClose={() => setIsStatementOpen(false)} 
                />
            )}

            {isRequestModalOpen && (
                <NewRequestModal 
                    type={requestType} 
                    landlord={landlord} 
                    onClose={() => setIsRequestModalOpen(false)} 
                    onSubmit={submitRequest} 
                />
            )}

            {selectedInvestFund && landlord && (
                <LandlordInvestModal 
                    fund={selectedInvestFund} 
                    landlordName={landlord.name} 
                    onClose={() => setSelectedInvestFund(null)} 
                    onConfirm={handleInvestmentConfirm} 
                />
            )}
            
            {unitToManage && (
                <UnitStatusModal
                    unit={unitToManage.unit}
                    property={unitToManage.property}
                    onClose={() => setUnitToManage(null)}
                    onSave={handleUpdateUnitStatus}
                />
            )}
        </div>
    );
};

// --- Landlord Card Component ---

const LandlordCard: React.FC<{ landlord: User; onClick: () => void }> = ({ landlord, onClick }) => {
    const { properties, tenants } = useData();
    const currentMonth = getCurrentMonthIso();
   
    const myProps = useMemo(() => properties.filter(p => p.landlordId === landlord.id), [properties, landlord.id]);
    const propertyIds = myProps.map(p => p.id);

    // Units
    const totalUnits = myProps.reduce((acc, p) => acc + (p.units || []).length, 0);
    const occupiedUnits = myProps.reduce((acc, p) => acc + (p.units || []).filter(u => u.status === 'Occupied').length, 0);
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
   
    // Collection MTD — expected includes monthly rent plus any security deposit still owed (when property requires deposit)
    const myTenants = tenants.filter(t => propertyIds.includes(t.propertyId || ''));
    
    const expectedRent = myTenants
        .filter(t => t.status !== 'Vacated' && t.status !== 'Evicted')
        .reduce((sum, t) => sum + (t.rentAmount || 0), 0);

    const depositOutstanding = myTenants
        .filter(t => t.status !== 'Vacated' && t.status !== 'Evicted')
        .reduce((sum, t) => {
            const prop = myProps.find(p => p.id === t.propertyId);
            if (!prop?.deposit?.required) return sum;
            const months = prop.deposit.months ?? 1;
            const full = (t.rentAmount || 0) * months;
            return sum + Math.max(0, full - (t.depositPaid || 0));
        }, 0);

    const expectedTotal = expectedRent + depositOutstanding;

    const collectedRent = myTenants.reduce((sum, t) => sum + sumPaidPaymentsForMonth(t, currentMonth), 0);

    const collectionRate = expectedTotal > 0 ? Math.round((collectedRent / expectedTotal) * 100) : 0;
    const collectionBarWidth = Math.min(collectionRate, 100);

    return (
        <div
            onClick={onClick}
            className="bg-white rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.02)] border border-gray-100 hover:shadow-[0_15px_40px_rgb(0,0,0,0.06)] hover:border-[#9D1F15]/10 hover:-translate-y-1 transition-all duration-300 cursor-pointer group flex flex-col h-full relative"
        >
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <div className="h-14 w-14 rounded-2xl bg-gray-50/50 flex items-center justify-center text-md font-black text-[#1a365d] border border-gray-100 group-hover:bg-[#9D1F15]/5 group-hover:border-[#9D1F15]/10 group-hover:text-[#9D1F15] transition-all duration-300">
                    {landlord.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                    <h3 className="font-extrabold text-[#1a365d] text-lg leading-tight group-hover:text-[#9D1F15] transition-colors">{landlord.name}</h3>
                    <p className="text-xs text-gray-400 font-bold mt-1">{landlord.phone}</p>
                </div>
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50/50 p-3.5 rounded-2xl border border-gray-100/50 text-center">
                    <p className="text-[9px] text-gray-400 uppercase font-black tracking-wider">Properties</p>
                    <p className="text-xl font-black text-[#1a365d] mt-1">{myProps.length}</p>
                </div>
                <div className="bg-gray-50/50 p-3.5 rounded-2xl border border-gray-100/50 text-center">
                    <p className="text-[9px] text-gray-400 uppercase font-black tracking-wider">Total Units</p>
                    <p className="text-xl font-black text-[#1a365d] mt-1">{totalUnits}</p>
                </div>
            </div>

            {/* Bars */}
            <div className="space-y-4 mb-6">
                <div>
                    <div className="flex justify-between items-end mb-1.5">
                        <span className="text-xs font-bold text-gray-500">Occupancy</span>
                        <span className={`text-[11px] font-black ${occupancyRate < 80 ? 'text-red-500' : 'text-green-600'}`}>{occupancyRate}%</span>
                    </div>
                    <div className="w-full bg-gray-100/70 rounded-full h-1.5">
                        <div
                            className={`h-1.5 rounded-full transition-all duration-500 ${occupancyRate < 80 ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${occupancyRate}%` }}
                        ></div>
                    </div>
                </div>
                <div>
                    <div className="flex justify-between items-end mb-1.5">
                        <span className="text-xs font-bold text-gray-500">Collection (MTD)</span>
                        <span className={`text-[11px] font-black ${collectionRate < 80 ? 'text-[#9D1F15]' : 'text-indigo-600'}`}>{collectionRate}%</span>
                    </div>
                    <div className="w-full bg-gray-100/70 rounded-full h-1.5">
                        <div
                            className={`h-1.5 rounded-full transition-all duration-500 max-w-full ${collectionRate < 80 ? 'bg-[#9D1F15]' : 'bg-indigo-600'}`}
                            style={{ width: `${collectionBarWidth}%` }}
                        ></div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-auto pt-4 border-t border-gray-50 flex justify-between items-center">
                <div>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wider font-extrabold font-mono">Amount Collected MTD</p>
                    <p className="text-sm font-black text-[#1a365d] mt-0.5">KES {(collectedRent/1000).toFixed(1)}k</p>
                </div>
                <div className="w-10 h-10 bg-gray-50 hover:bg-[#9D1F15]/5 hover:text-[#9D1F15] text-gray-400 rounded-xl flex items-center justify-center transition-colors">
                    <Icon name="chevron-right" className="w-5 h-5" />
                </div>
            </div>
        </div>
    );
};

// --- Main Page Component ---

const ActiveLandlords: React.FC = () => {
    const { landlords } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLandlord, setSelectedLandlord] = useState<User | null>(null);

    // Auto-open logic if URL param exists (Requested Feature)
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('?')) {
            const params = new URLSearchParams(hash.split('?')[1]);
            const id = params.get('id');
            if (id) {
                const l = landlords.find(u => u.id === id);
                if (l) setSelectedLandlord(l);
            }
        }
    }, [landlords]);

    const filteredLandlords = useMemo(() =>
        landlords
            .filter(l => (l as any).role !== 'Affiliate' && l.name.toLowerCase().includes(searchQuery.toLowerCase()))
            .slice()
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
    , [landlords, searchQuery]);

    if (selectedLandlord) {
        const handleClose = () => { setSelectedLandlord(null); window.history.pushState(null, '', '#/partial-rms/landlords/active-landlords'); };
        return (
            <LandlordDetailErrorBoundary onClose={handleClose}>
                <LandlordDetailView
                    landlord={selectedLandlord}
                    onClose={handleClose}
                />
            </LandlordDetailErrorBoundary>
        );
    }


    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-[#1a365d] tracking-tight">Active Landlords</h1>
                    <p className="text-xs font-black uppercase tracking-widest text-[#a52a2a]/50 mt-1">Manage landlord portfolios, financials, and property health.</p>
                </div>
            </div>

            {/* Search Bar */}
            <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search landlords by name..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50/50 border border-gray-100 rounded-2xl text-sm font-bold text-[#1a365d] focus:ring-2 focus:ring-[#9D1F15]/10 focus:bg-white outline-none transition-all animate-fade-in"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><Icon name="search" className="w-4 h-4" /></div>
                </div>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredLandlords.map(landlord => (
                    <LandlordCard
                        key={landlord.id}
                        landlord={landlord}
                        onClick={() => setSelectedLandlord(landlord)}
                    />
                ))}
            </div>

            {filteredLandlords.length === 0 && (
                <div className="text-center py-16 bg-gray-50/50 rounded-[2rem] border border-dashed border-gray-200">
                    <p className="text-gray-400 font-bold text-sm">No landlords matched your search.</p>
                </div>
            )}
        </div>
    );
};

export default ActiveLandlords;
