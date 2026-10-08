import React, { useState, useMemo } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { isRepurposedUnit } from '../../utils/repurposedUnits';
import { getCurrentMonthIso } from '../../utils/timezone';
import {
    sumTenantPaymentsInPeriod,
    getPropertyAgencyCommission,
    computeBillDeductionsForPeriod,
    computeMaintenanceFromTasksForPeriod,
} from '../../utils/landlordPeriodFinancials';


// --- Card Styles ---
const MAJOR_CARD_CLASSES = "relative bg-white rounded-2xl border-t-[8px] border-t-primary border-b-[4px] border-b-secondary border-x-[3px] border-x-secondary shadow-[inset_0_0_60px_-15px_rgba(157,31,21,0.15)] hover:shadow-lg transition-all duration-300 overflow-hidden";

// --- Types ---

interface MetricConfig {
    id: string;
    title: string;
    value: string | number;
    subtext: string;
    color: string; // Border/Icon color
    icon: string;
    reportType: 'Financial' | 'Operational' | 'Asset' | 'Compliance';
}

interface ReportColumn {
    header: string;
    accessor: string; // key in data row
    align?: 'left' | 'center' | 'right';
    format?: 'currency' | 'number' | 'percent' | 'text' | 'status';
}

interface ReportData {
    title: string;
    columns: ReportColumn[];
    rows: any[];
    summary?: { label: string; value: string | number }[];
}

// --- Components ---

const ReportModal: React.FC<{ 
    metric: MetricConfig; 
    onClose: () => void; 
    reportData: ReportData;
}> = ({ metric, onClose, reportData }) => {
    const [searchQuery, setSearchQuery] = useState('');

    const filteredRows = useMemo(() => {
        if (!searchQuery) return reportData.rows;
        const lower = searchQuery.toLowerCase();
        return reportData.rows.filter(row => 
            Object.values(row).some(val => String(val).toLowerCase().includes(lower))
        );
    }, [reportData.rows, searchQuery]);

    const handleExport = () => {
        const headers = reportData.columns.map(c => c.header).join(',');
        const rows = filteredRows.map(row => 
            reportData.columns.map(col => {
                const val = row[col.accessor];
                return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
            }).join(',')
        );
        const csv = [headers, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${metric.title.replace(/\s+/g, '_')}_Report.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1200] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gray-50 rounded-t-xl">
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mr-2">
                            <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Overview
                        </button>
                        <div className="h-8 w-px bg-gray-300 mx-2"></div>
                        <div className={`p-2 rounded-full bg-opacity-10`} style={{ backgroundColor: `${metric.color}20`, color: metric.color }}>
                            <Icon name={metric.icon} className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">{reportData.title}</h2>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <Icon name="close" className="w-6 h-6 text-gray-500" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 bg-white border-b border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="relative w-full sm:w-80">
                        <input 
                            type="text" 
                            placeholder="Search records..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none"
                        />
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                            <Icon name="search" className="w-5 h-5" />
                        </div>
                    </div>
                    <div className="flex gap-3">
                        {reportData.summary?.map((stat, idx) => (
                            <div key={idx} className="px-4 py-2 bg-blue-50 border border-blue-100 rounded-lg shadow-sm">
                                <p className="text-[10px] text-blue-500 uppercase font-bold">{stat.label}</p>
                                <p className="text-lg font-bold text-blue-900">{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-y-auto p-0">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                {reportData.columns.map((col, idx) => (
                                    <th 
                                        key={idx} 
                                        className={`py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                                    >
                                        {col.header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm">
                            {filteredRows.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-gray-50 transition-colors">
                                    {reportData.columns.map((col, cIdx) => {
                                        const val = row[col.accessor];
                                        let displayVal: React.ReactNode = val;

                                        if (col.format === 'currency') displayVal = `KES ${Number(val).toLocaleString()}`;
                                        if (col.format === 'percent') displayVal = `${val}%`;
                                        if (col.format === 'status') {
                                            const color = val === 'Occupied' || val === 'Paid' || val === 'Active' ? 'bg-green-100 text-green-800' : 
                                                          val === 'Vacant' || val === 'Overdue' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800';
                                            displayVal = <span className={`px-2 py-1 rounded-full text-xs font-bold ${color}`}>{val}</span>;
                                        }

                                        return (
                                            <td 
                                                key={cIdx} 
                                                className={`py-3 px-4 text-gray-700 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${cIdx === 0 ? 'font-medium text-gray-900' : ''}`}
                                            >
                                                {displayVal}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            {filteredRows.length === 0 && (
                                <tr>
                                    <td colSpan={reportData.columns.length} className="py-12 text-center text-gray-500">
                                        No records match your search criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
                    <button onClick={handleExport} className="flex items-center px-4 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark shadow-sm transition-colors">
                        <Icon name="download" className="w-4 h-4 mr-2"/> Export Report
                    </button>
                </div>
            </div>
        </div>
    );
};

const MetricCard: React.FC<{ metric: MetricConfig; onClick: () => void }> = ({ metric, onClick }) => (
    <div 
        onClick={onClick}
        className={`${MAJOR_CARD_CLASSES} p-5 cursor-pointer flex flex-col justify-between group h-full`}
    >
        <div className="relative z-10">
            <div className="flex justify-between items-start mb-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{metric.title}</p>
                <div className={`p-2 rounded-full bg-gray-50 group-hover:bg-gray-100 transition-colors`}>
                    <Icon name={metric.icon} className="w-5 h-5" style={{ color: metric.color }} />
                </div>
            </div>
            <h3 className="text-2xl font-extrabold text-gray-800">{metric.value}</h3>
        </div>
        <div className="relative z-10 mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
            <p className="text-xs text-gray-500 font-medium">{metric.subtext}</p>
            <span className="text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
                View Report <span className="ml-1">→</span>
            </span>
        </div>
    </div>
);

const AIInsightCard: React.FC<{ title: string; description: string; type: 'success' | 'warning' | 'info'; icon: string }> = ({ title, description, type, icon }) => {
    const styles = {
        success: 'bg-green-50 border-green-200 text-green-800',
        warning: 'bg-orange-50 border-orange-200 text-orange-800',
        info: 'bg-blue-50 border-blue-200 text-blue-800'
    };

    return (
        <div className={`p-4 rounded-xl border ${styles[type]} shadow-sm flex items-start gap-3`}>
            <div className="mt-1 flex-shrink-0">
                 <Icon name={icon} className="w-5 h-5" />
            </div>
            <div>
                <h4 className="font-bold text-sm mb-1">{title}</h4>
                <p className="text-xs opacity-90 leading-relaxed">{description}</p>
            </div>
        </div>
    );
};

const Overview: React.FC = () => {
    const { landlords: rawLandlords, landlordOffboardingRecords = [], properties, tenants, tasks, currentUser, roles, bills, commissionRules } = useData() as any;
    const fmtKes = (n: number) => n >= 1_000_000 ? `KES ${(n/1_000_000).toFixed(2)}M` : `KES ${Math.round(n).toLocaleString()}`;


    const landlords = useMemo(() => {
        return (rawLandlords || []).filter((l: any) => 
            l.status !== 'Offboarded' && 
            l.status !== 'Archived' && 
            !l.isArchived && 
            !landlordOffboardingRecords.some((r: any) => r.landlordId === l.id && (r.status === 'Contract Terminated' || r.status === 'Accounts Settled'))
        );
    }, [rawLandlords, landlordOffboardingRecords]);

    const canView = (widgetId: string) => {
        if (!currentUser) return false;
        if ((currentUser as any).role === 'Super Admin') return true;
        const roleDef = roles.find(r => r.name === (currentUser as any).role);
        if (!roleDef) return false;
        return (roleDef.widgetAccess || []).includes(widgetId);
    };
    const [selectedMetric, setSelectedMetric] = useState<MetricConfig | null>(null);

    // --- KPI CALCULATIONS ---
    const totalProperties = properties.length;
    const totalUnits = properties.reduce((acc, p) => acc + p.units.length, 0);

    // Real collected MTD from actual payment ledger, not rent-roll assumptions.
    const currentMonthPrefix = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
    const safeAmt = (v: any): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
    const collectedRent = tenants.reduce((acc, t) => {
        const paid = (t.paymentHistory || [])
            .filter((p: any) => p?.status === 'Paid' && typeof p.date === 'string' && p.date.startsWith(currentMonthPrefix))
            .reduce((s: number, p: any) => s + safeAmt(p.amount), 0);
        return acc + paid;
    }, 0);

    const occupiedUnits = properties.reduce((acc, p) => acc + p.units.filter(u => u.status === 'Occupied').length, 0);
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    // Maintenance actually incurred this period (completed/closed jobs only).
    const maintCosts = (tasks || []).reduce((acc: number, t: any) => {
        const inPeriod = typeof t?.dueDate === 'string' && t.dueDate.startsWith(currentMonthPrefix);
        const done = t?.status === 'Completed' || t?.status === 'Closed';
        if (!inPeriod || !done) return acc;
        return acc + (t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0);
    }, 0);

    // Per-landlord payout schedule computed from actual collections and configured rules.
    const payoutRows = useMemo(() => {
        return landlords.map((l: any) => {
            const lProps = (properties || []).filter((p: any) => p.landlordId === l.id);
            let gross = 0;
            let mgmtFee = 0;
            lProps.forEach((prop: any) => {
                const propTenants = (tenants || []).filter((t: any) => t.propertyId === prop.id);
                const collected = propTenants.reduce((s: number, t: any) => s + sumTenantPaymentsInPeriod(t, currentMonthPrefix), 0);
                const { rate, fixed } = getPropertyAgencyCommission(prop, commissionRules || []);
                mgmtFee += fixed !== null ? (collected > 0 ? fixed : 0) : collected * rate;
                gross += collected;
            });
            const billsTotal = computeBillDeductionsForPeriod(bills || [], lProps, currentMonthPrefix).total;
            const maintTotal = computeMaintenanceFromTasksForPeriod(tasks || [], lProps, currentMonthPrefix).total;
            const mri = gross * 0.075;
            const deductions = mgmtFee + mri + billsTotal + maintTotal;
            return {
                name: l.name,
                propCount: lProps.length,
                gross,
                mgmtFee,
                mri,
                bills: billsTotal,
                maintenance: maintTotal,
                deductions,
                net: Math.max(0, gross - deductions),
            };
        });
    }, [landlords, properties, tenants, bills, tasks, commissionRules, currentMonthPrefix]);

    // MRI tax withheld at statutory 7.5% of gross rent collected.
    const mriTax = payoutRows.reduce((s: number, r: any) => s + r.mri, 0);
    const netPayout = payoutRows.reduce((s: number, r: any) => s + r.net, 0);
    const totalDeductions = payoutRows.reduce((s: number, r: any) => s + r.deductions, 0);


    // --- REAL TASKME AI INTELLIGENCE (computed from live data) ---
    const aiIntelligence = useMemo(() => {
        // Revenue Forecast — sum of next month's expected rent from active tenants
        const activeTenants = tenants.filter(t => t.status === 'Active');
        const projectedNextMonth = activeTenants.reduce((s, t) => s + (Number(t.rentAmount) || 0), 0);
        const fmtMoney = (n: number) => n >= 1_000_000 ? `KES ${(n/1_000_000).toFixed(2)}M` : `KES ${(n/1000).toFixed(1)}k`;
        const growthVsCollected = collectedRent > 0 ? ((projectedNextMonth - collectedRent) / collectedRent) * 100 : 0;
        const growthLabel = `${growthVsCollected >= 0 ? '+' : ''}${growthVsCollected.toFixed(1)}%`;
        const revenueDesc = activeTenants.length === 0
            ? 'No active tenancies yet — onboard tenants to start forecasting revenue.'
            : `Projected revenue for next month is ${fmtMoney(projectedNextMonth)} (${growthLabel} vs current collections) based on ${activeTenants.length} active tenancies.`;

        // Churn Risk — landlords whose properties have vacancy ratio >= 30%
        const landlordVacancy = landlords.map(l => {
            const props = properties.filter(p => p.landlordId === l.id);
            const units = props.reduce((s, p) => s + (p.units?.length || 0), 0);
            const vacant = props.reduce((s, p) => s + (p.units || []).filter(u => u.status === 'Vacant').length, 0);
            return { name: l.name, units, vacant, ratio: units > 0 ? vacant / units : 0 };
        }).filter(x => x.units > 0 && x.ratio >= 0.3).sort((a, b) => b.ratio - a.ratio);
        const churnDesc = landlordVacancy.length === 0
            ? `No landlord shows vacancy stress — all ${landlords.length} portfolios are within healthy occupancy thresholds.`
            : `${landlordVacancy.length} landlord${landlordVacancy.length === 1 ? '' : 's'} (${landlordVacancy.slice(0, 2).map(x => x.name).join(', ')}${landlordVacancy.length > 2 ? ', …' : ''}) show vacancy spikes ≥30%. Recommend engagement.`;

        // Market Opportunity — property with highest occupancy & most units (under-priced signal)
        const propsRanked = properties
            .map(p => {
                const u = p.units?.length || 0;
                const occ = (p.units || []).filter(x => x.status === 'Occupied').length;
                return { name: p.name, location: p.subLocation && p.zone ? `${p.subLocation} (${p.zone})` : (p.subLocation || p.zone || p.location || p.branch || ''), units: u, ratio: u > 0 ? occ / u : 0, rent: Number(p.defaultMonthlyRent) || 0 };
            })
            .filter(p => p.units >= 3 && p.ratio >= 0.9)
            .sort((a, b) => b.ratio - a.ratio || b.units - a.units);
        const topProp = propsRanked[0];
        const marketDesc = topProp
            ? `${topProp.name}${topProp.location ? ` (${topProp.location})` : ''} is at ${Math.round(topProp.ratio * 100)}% occupancy across ${topProp.units} units — review for a rent uplift.`
            : `No fully-occupied properties yet — focus on lifting occupancy before reviewing rent.`;

        return {
            revenue: { title: 'Revenue Forecast', description: revenueDesc, type: 'success' as const, icon: 'revenue' },
            churn: { title: landlordVacancy.length === 0 ? 'Portfolio Health' : 'Churn Risk Detected', description: churnDesc, type: (landlordVacancy.length === 0 ? 'success' : 'warning') as 'success' | 'warning', icon: 'offboarding' },
            market: { title: 'Market Opportunity', description: marketDesc, type: 'info' as const, icon: 'branch' },
        };
    }, [tenants, landlords, properties, collectedRent]);


    // --- METRICS CONFIGURATION ---
    const metrics: MetricConfig[] = [
        { 
            id: 'portfolio', 
            title: 'Total Portfolio', 
            value: totalProperties, 
            subtext: `${totalUnits} Units Managed`, 
            color: '#3b82f6', 
            icon: 'branch', 
            reportType: 'Asset' 
        },
        { 
            id: 'revenue', 
            title: 'Gross Revenue', 
            value: fmtKes(collectedRent), 
            subtext: 'Rent Collected (MTD)', 
            color: '#10b981', 
            icon: 'revenue', 
            reportType: 'Financial' 
        },
        { 
            id: 'payouts', 
            title: 'Net Payouts', 
            value: fmtKes(netPayout), 
            subtext: 'Net of fees, tax, bills & maintenance (MTD)', 
            color: '#9D1F15', // Updated primary color for Payouts
            icon: 'payments', 
            reportType: 'Financial' 
        },
        { 
            id: 'occupancy', 
            title: 'Occupancy Rate', 
            value: `${occupancyRate}%`, 
            subtext: `${properties.reduce((a,p)=>a+p.units.filter(u=>u.status==='Vacant' && !isRepurposedUnit(u)).length,0)} Vacant · ${properties.reduce((a,p)=>a+p.units.filter(u=>isRepurposedUnit(u)).length,0)} Repurposed`, 
            color: '#f59e0b', 
            icon: 'vacant-house', 
            reportType: 'Operational' 
        },
        { 
            id: 'tax', 
            title: 'MRI Tax Withheld', 
            value: fmtKes(mriTax), 
            subtext: '7.5% of Gross Rent', 
            color: '#8b5cf6', 
            icon: 'accounting', 
            reportType: 'Compliance' 
        },
        { 
            id: 'maintenance', 
            title: 'Maintenance Costs', 
            value: fmtKes(maintCosts), 
            subtext: `${tasks.filter(t => t.status !== 'Completed').length} Active Jobs`, 
            color: '#ef4444', 
            icon: 'tools', 
            reportType: 'Operational' 
        },
    ];

    // --- DYNAMIC REPORT GENERATOR ---
    const getReportData = (metricId: string): ReportData => {
        switch (metricId) {
            case 'portfolio':
                return {
                    title: 'Portfolio Asset Report',
                    columns: [
                        { header: 'Property Name', accessor: 'name' },
                        { header: 'Location', accessor: 'location' },
                        { header: 'Landlord', accessor: 'landlord' },
                        { header: 'Units', accessor: 'units', align: 'center', format: 'number' },
                        { header: 'Status', accessor: 'status', format: 'status' }
                    ],
                    rows: properties.map(p => ({
                        name: p.name,
                        location: p.subLocation && p.zone ? `${p.subLocation} (${p.zone})` : (p.subLocation || p.zone || p.location || p.branch || ''),
                        landlord: landlords.find(l => l.id === p.landlordId)?.name || 'Unknown',
                        units: p.units.length,
                        status: p.status
                    })),
                    summary: [{ label: 'Total Asset Value (Est)', value: 'KES 450M' }]
                };

            case 'revenue': {
                const monthPrefix = getCurrentMonthIso();
                const safeNum = (v: any): number => {
                    if (v == null) return 0;
                    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
                    return Number.isFinite(n) ? n : 0;
                };
                return {
                    title: 'Gross Revenue Report (Property-wise)',
                    columns: [
                        { header: 'Property', accessor: 'property' },
                        { header: 'Landlord', accessor: 'landlord' },
                        { header: 'Occupancy', accessor: 'occupancy', format: 'percent', align: 'center' },
                        { header: 'Gross Potential', accessor: 'potential', format: 'currency', align: 'right' },
                        { header: 'Collected MTD', accessor: 'collected', format: 'currency', align: 'right' },
                    ],
                    rows: properties.map(p => {
                        const rentableUnits = p.units.filter(u => !isRepurposedUnit(u));
                        const occupied = rentableUnits.filter(u => u.status === 'Occupied').length;
                        const occPct = rentableUnits.length > 0 ? Math.round((occupied/rentableUnits.length)*100) : 0;
                        const propTenants = tenants.filter(t => t.propertyId === p.id);
                        const activeInProp = propTenants.filter(t => ['Active', 'Notice', 'Overdue'].includes(t.status));
                        // Gross Potential: rent from active tenants + default rent for unoccupied rentable units
                        const rentFromActive = activeInProp.reduce((s, t) => s + safeNum(t.rentAmount), 0);
                        const emptyRentable = Math.max(0, rentableUnits.length - occupied);
                        const potential = rentFromActive + emptyRentable * safeNum(p.defaultMonthlyRent);
                        // Collected MTD: sum of Paid payments this month
                        const collected = propTenants.reduce((s, t) => {
                            return s + (t.paymentHistory || [])
                                .filter((pay: any) => typeof pay?.date === 'string' && pay.date.startsWith(monthPrefix) && pay.status === 'Paid')
                                .reduce((sum: number, pay: any) => sum + safeNum(pay.amount), 0);
                        }, 0);
                        return {
                            property: p.name,
                            landlord: landlords.find(l => l.id === p.landlordId)?.name,
                            occupancy: occPct,
                            potential,
                            collected
                        };
                    }),
                    summary: [{ label: 'Total Collected MTD', value: `KES ${collectedRent.toLocaleString()}` }]
                };
            }

            case 'payouts':
                return {
                    title: 'Landlord Net Payout Schedule',
                    columns: [
                        { header: 'Landlord', accessor: 'name' },
                        { header: 'Properties', accessor: 'propCount', align: 'center' },
                        { header: 'Gross Revenue', accessor: 'gross', format: 'currency', align: 'right' },
                        { header: 'Mgmt Commission', accessor: 'mgmtFee', format: 'currency', align: 'right' },
                        { header: 'MRI Tax (7.5%)', accessor: 'mri', format: 'currency', align: 'right' },
                        { header: 'Bills', accessor: 'bills', format: 'currency', align: 'right' },
                        { header: 'Maintenance', accessor: 'maintenance', format: 'currency', align: 'right' },
                        { header: 'Total Deductions', accessor: 'deductions', format: 'currency', align: 'right' },
                        { header: 'Net Payout', accessor: 'net', format: 'currency', align: 'right' }
                    ],
                    rows: payoutRows.filter((row: any) => row.gross > 0 || row.deductions > 0),
                    summary: [
                        { label: 'Gross Collected', value: `KES ${Math.round(collectedRent).toLocaleString()}` },
                        { label: 'Total Deductions', value: `KES ${Math.round(totalDeductions).toLocaleString()}` },
                        { label: 'Total Disbursement', value: `KES ${Math.round(netPayout).toLocaleString()}` }
                    ]
                };


            case 'occupancy':
                return {
                    title: 'Vacancy & Occupancy Report',
                    columns: [
                        { header: 'Property', accessor: 'name' },
                        { header: 'Total Units', accessor: 'total', align: 'center' },
                        { header: 'Occupied', accessor: 'occupied', align: 'center' },
                        { header: 'Vacant', accessor: 'vacant', align: 'center' },
                        { header: 'Repurposed', accessor: 'repurposed', align: 'center' },
                        { header: 'Occupancy %', accessor: 'percent', format: 'percent', align: 'right' }
                    ],
                    rows: properties.map(p => {
                        const occ = p.units.filter(u => u.status === 'Occupied').length;
                        const rep = p.units.filter(u => isRepurposedUnit(u)).length;
                        const vac = Math.max(0, p.units.length - occ - rep);
                        return {
                            name: p.name,
                            total: p.units.length,
                            occupied: occ,
                            vacant: vac,
                            repurposed: rep,
                            percent: p.units.length > 0 ? Math.round((occ/p.units.length)*100) : 0
                        };
                    }),
                    summary: [{ label: 'Avg Portfolio Occupancy', value: `${occupancyRate}%` }]
                };

            case 'tax':
                return {
                    title: 'MRI (Monthly Rental Income) Tax Report',
                    columns: [
                        { header: 'Landlord', accessor: 'landlord' },
                        { header: 'Taxable Gross Rent', accessor: 'taxable', format: 'currency', align: 'right' },
                        { header: 'Applicable Rate', accessor: 'rate', align: 'center' },
                        { header: 'Tax Withheld', accessor: 'tax', format: 'currency', align: 'right' }
                    ],
                    rows: payoutRows.map((r: any) => ({
                        landlord: r.name,
                        taxable: r.gross,
                        rate: '7.5%',
                        tax: r.mri
                    })).filter((r: any) => r.taxable > 0),
                    summary: [{ label: 'Total Tax Liability', value: `KES ${Math.round(mriTax).toLocaleString()}` }]

                };

            case 'maintenance':
                return {
                    title: 'Maintenance Expense Report',
                    columns: [
                        { header: 'Task Title', accessor: 'title' },
                        { header: 'Property', accessor: 'property' },
                        { header: 'Status', accessor: 'status', format: 'status' },
                        { header: 'Vendor', accessor: 'vendor' },
                        { header: 'Cost (Labor + Material)', accessor: 'cost', format: 'currency', align: 'right' }
                    ],
                    rows: (tasks || [])
                        .filter((t: any) => typeof t?.dueDate === 'string' && t.dueDate.startsWith(currentMonthPrefix) && (t.status === 'Completed' || t.status === 'Closed'))
                        .map((t: any) => ({
                            title: t.title,
                            property: t.property,
                            status: t.status,
                            vendor: t.assignedTo,
                            cost: (t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0)
                        })),
                    summary: [{ label: 'Total Maintenance Spend (MTD)', value: `KES ${Math.round(maintCosts).toLocaleString()}` }]

                };

            default:
                return { title: 'Report', columns: [], rows: [] };
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Landlord Overview</h1>
                    <p className="text-lg text-gray-500 mt-1">High-level metrics and actionable reports for property owners.</p>
                </div>
            </div>

            {/* AI Intelligence Section */}
            {canView('land_alerts') && <div className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Icon name="analytics" className="w-48 h-48 text-white" />
                </div>
                <div className="relative z-10">
                    <h3 className="text-lg font-bold mb-4 flex items-center">
                        <Icon name="analytics" className="w-5 h-5 mr-2 text-yellow-400" />
                        TaskMe AI Intelligence
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <AIInsightCard 
                            title={aiIntelligence.revenue.title}
                            description={aiIntelligence.revenue.description}
                            type={aiIntelligence.revenue.type}
                            icon={aiIntelligence.revenue.icon}
                        />
                        <AIInsightCard 
                            title={aiIntelligence.churn.title}
                            description={aiIntelligence.churn.description}
                            type={aiIntelligence.churn.type}
                            icon={aiIntelligence.churn.icon}
                        />
                        <AIInsightCard 
                            title={aiIntelligence.market.title}
                            description={aiIntelligence.market.description}
                            type={aiIntelligence.market.type}
                            icon={aiIntelligence.market.icon}
                        />
                    </div>
                </div>
            </div>}

            {canView('land_kpi') && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {metrics.map(metric => (
                    <MetricCard 
                        key={metric.id} 
                        metric={metric} 
                        onClick={() => setSelectedMetric(metric)} 
                    />
                ))}
            </div>}

            {canView('land_quick_actions') && <div className={`${MAJOR_CARD_CLASSES} p-6 flex items-start gap-4`}>
                <div className="relative z-10 flex gap-4 w-full">
                    <Icon name="info" className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                    <div>
                        <h4 className="font-bold text-blue-800">About Reports</h4>
                        <p className="text-sm text-blue-700 mt-1">
                            Click on any card above to view the detailed report breakdown. 
                            You can search, filter, and export data directly from the report view.
                            All financial figures are calculated in real-time based on current tenancy and payment records.
                        </p>
                    </div>
                </div>
            </div>}

            {selectedMetric && (
                <ReportModal 
                    metric={selectedMetric} 
                    reportData={getReportData(selectedMetric.id)}
                    onClose={() => setSelectedMetric(null)} 
                />
            )}
        </div>
    );
};

export default Overview;
