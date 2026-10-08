import React, { useState, useMemo } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';

// --- Card Styles ---
const MAJOR_CARD_CLASSES = "relative bg-white rounded-[2rem] border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_15px_40px_rgb(0,0,0,0.06)] hover:border-[#9D1F15]/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden";

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
        <div className="fixed inset-0 bg-[#0d1b2e]/60 backdrop-blur-md z-[1200] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-[2.5rem] shadow-[0_24px_70px_rgba(0,0,0,0.15)] w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="flex justify-between items-center p-8 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <button onClick={onClose} className="group flex items-center text-[10px] font-black uppercase tracking-widest text-[#9D1F15] hover:text-[#80170f] transition-colors mr-2">
                            <span className="transform transition-transform group-hover:-translate-x-1 mr-2 text-md">←</span> Back to Overview
                        </button>
                        <div className="h-6 w-px bg-gray-200 mx-2"></div>
                        <div className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center" style={{ borderLeft: `3px solid ${metric.color}` }}>
                            <Icon name={metric.icon} className="w-5 h-5" style={{ color: metric.color }} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-[#1a365d]">{reportData.title}</h2>
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#a52a2a]/40 mt-0.5">Interactive Audit Ledger</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full flex items-center justify-center transition-all">
                        <Icon name="close" className="w-5 h-5" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-6 bg-white border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="relative w-full sm:w-80">
                        <input 
                            type="text" 
                            placeholder="Search records..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-gray-50/50 border border-gray-100 rounded-2xl text-sm font-bold text-[#1a365d] focus:ring-2 focus:ring-[#9D1F15]/10 focus:bg-white outline-none transition-all"
                        />
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                            <Icon name="search" className="w-4 h-4" />
                        </div>
                    </div>
                    <div className="flex gap-3">
                        {reportData.summary?.map((stat, idx) => (
                            <div key={idx} className="px-6 py-3 bg-red-50 border border-red-100 rounded-2xl shadow-sm">
                                <p className="text-[9px] text-[#9D1F15] uppercase tracking-widest font-black">{stat.label}</p>
                                <p className="text-lg font-black text-[#1a365d] mt-1">{typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-y-auto p-0">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm border-b border-gray-100">
                            <tr>
                                {reportData.columns.map((col, idx) => (
                                    <th 
                                        key={idx} 
                                        className={`py-4 px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                                    >
                                        {col.header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 text-sm font-bold text-gray-600">
                            {filteredRows.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-gray-50/50 transition-colors">
                                    {reportData.columns.map((col, cIdx) => {
                                        const val = row[col.accessor];
                                        let displayVal: React.ReactNode = val;

                                        if (col.format === 'currency') displayVal = `KES ${Number(val).toLocaleString()}`;
                                        if (col.format === 'percent') displayVal = `${val}%`;
                                        if (col.format === 'status') {
                                            const color = val === 'Occupied' || val === 'Paid' || val === 'Active' ? 'bg-green-50 text-green-700 border-green-100' : 
                                                          val === 'Vacant' || val === 'Overdue' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-gray-50 text-gray-500 border-gray-100';
                                            displayVal = <span className={`px-3 py-1 rounded-full text-xs font-black border ${color}`}>{val}</span>;
                                        }

                                        return (
                                            <td 
                                                key={cIdx} 
                                                className={`py-4 px-6 text-gray-600 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'} ${cIdx === 0 ? 'font-black text-[#1a365d]' : ''}`}
                                            >
                                                {displayVal}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            {filteredRows.length === 0 && (
                                <tr>
                                    <td colSpan={reportData.columns.length} className="py-16 text-center text-sm font-bold text-gray-400">
                                        No records match your search criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end">
                    <button onClick={handleExport} className="flex items-center px-6 py-3 bg-[#9D1F15] hover:bg-[#80170f] text-white text-xs font-black uppercase tracking-wider rounded-full shadow-[0_8px_20px_rgba(157,31,21,0.2)] hover:shadow-[0_12px_24px_rgba(157,31,21,0.3)] transition-all transform hover:-translate-y-0.5">
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
        className={`${MAJOR_CARD_CLASSES} p-8 cursor-pointer flex flex-col justify-between group h-full relative`}
    >
        <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{metric.title}</span>
                <div 
                    className="w-12 h-12 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center transition-all group-hover:scale-105"
                    style={{ borderLeft: `3px solid ${metric.color}` }}
                >
                    <Icon name={metric.icon} className="w-5 h-5" style={{ color: metric.color }} />
                </div>
            </div>
            <h3 className="text-3xl font-black text-[#1a365d] tracking-tight group-hover:text-[#9D1F15] transition-colors">{metric.value}</h3>
        </div>
        <div className="relative z-10 mt-6 pt-4 border-t border-gray-50 flex justify-between items-center text-xs">
            <p className="text-gray-400 font-bold">{metric.subtext}</p>
            <span className="font-extrabold uppercase tracking-wider text-[#9D1F15] opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0 flex items-center gap-1">
                Report <Icon name="chevron-right" className="w-3 h-3" />
            </span>
        </div>
    </div>
);

const AIInsightCard: React.FC<{ title: string; description: string; type: 'success' | 'warning' | 'info'; icon: string }> = ({ title, description, type, icon }) => {
    const borderColors = {
        success: 'border-green-100 text-green-950',
        warning: 'border-orange-100 text-orange-950',
        info: 'border-blue-100 text-[#1a365d]'
    };

    const iconColors = {
        success: 'text-green-600 bg-green-50/50',
        warning: 'text-orange-600 bg-orange-50/50',
        info: 'text-[#1a365d] bg-blue-50/50'
    };

    return (
        <div className={`p-6 rounded-3xl border border-gray-100 ${borderColors[type]} bg-white shadow-sm flex items-start gap-4 transition-all hover:scale-[1.02] duration-300`}>
            <div className={`mt-0.5 p-3 rounded-2xl ${iconColors[type]} flex-shrink-0`}>
                 <Icon name={icon} className="w-5 h-5" />
            </div>
            <div>
                <h4 className="font-extrabold text-[#1a365d] text-sm tracking-tight mb-1">{title}</h4>
                <p className="text-xs text-gray-500 font-bold leading-relaxed">{description}</p>
            </div>
        </div>
    );
};


const Overview: React.FC = () => {
    const { landlords, properties, tenants, tasks, currentUser, roles } = useData();

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
    
    const collectedRent = tenants.reduce((acc, t) => {
        // Mock logic: Assuming all active tenants paid rent for this month for demo purposes
        // In real app, check paymentHistory for current month
        return acc + (t.status === 'Active' ? t.rentAmount : 0);
    }, 0);

    const directCollected = collectedRent; // In Partial RMS, all collection is direct to landlord
    const agencyCollected = 0; // Agency collects 0 rent in Partial RMS

    const occupiedUnits = properties.reduce((acc, p) => acc + p.units.filter(u => u.status === 'Occupied').length, 0);
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    // Est. Maintenance (Mock: 10% of rent for demo or sum of task costs)
    const maintCosts = tasks.reduce((acc, t) => acc + (t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0), 0);
    
    // Total Commissions Invoiced (e.g. 15% rate)
    const agencyCommissions = collectedRent * 0.15;

    // MRI Tax (7.5% of Gross)
    const mriTax = collectedRent * 0.075;

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
            title: 'Gross Revenue (Landlords)', 
            value: `KES ${(collectedRent/1000000).toFixed(2)}M`, 
            subtext: `100% Routed Directly to Landlords`, 
            color: '#10b981', 
            icon: 'revenue', 
            reportType: 'Financial' 
        },
        { 
            id: 'payouts', 
            title: 'Agency Commissions', 
            value: `KES ${(agencyCommissions/1000).toFixed(1)}k`, 
            subtext: `Pending Settlement to Agency Wallet`, 
            color: '#9D1F15', 
            icon: 'payments', 
            reportType: 'Financial' 
        },
        { 
            id: 'occupancy', 
            title: 'Occupancy Rate', 
            value: `${occupancyRate}%`, 
            subtext: `${totalUnits - occupiedUnits} Vacant Units`, 
            color: '#f59e0b', 
            icon: 'vacant-house', 
            reportType: 'Operational' 
        },
        { 
            id: 'tax', 
            title: 'MRI Tax Liability', 
            value: `KES ${(mriTax/1000).toFixed(1)}k`, 
            subtext: '7.5% of Gross Direct Rent', 
            color: '#8b5cf6', 
            icon: 'accounting', 
            reportType: 'Compliance' 
        },
        { 
            id: 'maintenance', 
            title: 'Maintenance Costs', 
            value: `KES ${(maintCosts/1000).toFixed(1)}k`, 
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
                        { header: 'Routing Model', accessor: 'routing' },
                        { header: 'Status', accessor: 'status', format: 'status' }
                    ],
                    rows: properties.map(p => ({
                        name: p.name,
                        location: p.location || p.branch,
                        landlord: landlords.find(l => l.id === p.landlordId)?.name || 'Unknown',
                        units: p.units.length,
                        routing: `Direct Paybill (${p.landlordPaybill || 'Pending Configuration'})`,
                        status: p.status
                    })),
                    summary: [{ label: 'Total Asset Value (Est)', value: 'KES 450M' }]
                };

            case 'revenue':
                return {
                    title: 'Gross Revenue Report (Property-wise)',
                    columns: [
                        { header: 'Property', accessor: 'property' },
                        { header: 'Landlord', accessor: 'landlord' },
                        { header: 'Routing Model', accessor: 'routing' },
                        { header: 'Occupancy', accessor: 'occupancy', format: 'percent', align: 'center' },
                        { header: 'Gross Potential', accessor: 'potential', format: 'currency', align: 'right' },
                        { header: 'Collected Rent', accessor: 'collected', format: 'currency', align: 'right' },
                    ],
                    rows: properties.map(p => {
                        const propUnits = p.units.length;
                        const occupied = p.units.filter(u => u.status === 'Occupied').length;
                        const occPct = propUnits > 0 ? Math.round((occupied/propUnits)*100) : 0;
                        // Mock revenue logic
                        const potential = propUnits * (p.defaultMonthlyRent || 20000);
                        const collected = occupied * (p.defaultMonthlyRent || 20000);
                        return {
                            property: p.name,
                            landlord: landlords.find(l => l.id === p.landlordId)?.name,
                            routing: `Direct (Paybill: ${p.landlordPaybill || 'Pending'})`,
                            occupancy: occPct,
                            potential,
                            collected
                        };
                    }),
                    summary: [
                        { label: 'Total Gross Collected (Direct to Landlord)', value: `KES ${directCollected.toLocaleString()}` }
                    ]
                };

            case 'payouts':
                return {
                    title: 'Agency Commission Settlement Schedule',
                    columns: [
                        { header: 'Landlord', accessor: 'name' },
                        { header: 'Properties', accessor: 'propCount', align: 'center' },
                        { header: 'Routing Channel', accessor: 'routing' },
                        { header: 'Landlord Gross Revenue', accessor: 'gross', format: 'currency', align: 'right' },
                        { header: 'Invoiced Agency Fees', accessor: 'deductions', format: 'currency', align: 'right' },
                        { header: 'Settlement Status', accessor: 'status' }
                    ],
                    rows: landlords.map(l => {
                        const lProps = properties.filter(p => p.landlordId === l.id);
                        const lGross = lProps.reduce((sum, p) => sum + (p.units.filter(u => u.status === 'Occupied').length * (p.defaultMonthlyRent || 20000)), 0);
                        const lDeduct = lGross * 0.15; // Mock 15% fee
                        return {
                            name: l.name,
                            propCount: lProps.length,
                            routing: `Direct (Paybill: ${(l as any).payment_config?.mpesaPaybill || 'Active'})`,
                            gross: lGross,
                            deductions: lDeduct,
                            status: 'Pending Settlement'
                        };
                    }).filter(row => row.gross > 0),
                    summary: [{ label: 'Total Commissions Invoiced', value: `KES ${agencyCommissions.toLocaleString()}` }]
                };

            case 'occupancy':
                return {
                    title: 'Vacancy & Occupancy Report',
                    columns: [
                        { header: 'Property', accessor: 'name' },
                        { header: 'Total Units', accessor: 'total', align: 'center' },
                        { header: 'Occupied', accessor: 'occupied', align: 'center' },
                        { header: 'Vacant', accessor: 'vacant', align: 'center' },
                        { header: 'Occupancy %', accessor: 'percent', format: 'percent', align: 'right' }
                    ],
                    rows: properties.map(p => {
                        const occ = p.units.filter(u => u.status === 'Occupied').length;
                        return {
                            name: p.name,
                            total: p.units.length,
                            occupied: occ,
                            vacant: p.units.length - occ,
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
                    rows: landlords.map(l => {
                        const lProps = properties.filter(p => p.landlordId === l.id);
                        const lGross = lProps.reduce((sum, p) => sum + (p.units.filter(u => u.status === 'Occupied').length * (p.defaultMonthlyRent || 20000)), 0);
                        return {
                            landlord: l.name,
                            taxable: lGross,
                            rate: '7.5%',
                            tax: lGross * 0.075
                        };
                    }).filter(r => r.taxable > 0),
                    summary: [{ label: 'Total Tax Liability', value: `KES ${mriTax.toLocaleString()}` }]
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
                    rows: tasks.map(t => ({
                        title: t.title,
                        property: t.property,
                        status: t.status,
                        vendor: t.assignedTo,
                        cost: (t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0)
                    })),
                    summary: [{ label: 'Total Maintenance Spend', value: `KES ${maintCosts.toLocaleString()}` }]
                };

            default:
                return { title: 'Report', columns: [], rows: [] };
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-[#1a365d] tracking-tight">Landlord Overview</h1>
                    <p className="text-xs font-black uppercase tracking-widest text-[#a52a2a]/50 mt-1">Real-time metrics & actionable intelligence for active portfolios.</p>
                </div>
            </div>

            {/* AI Intelligence Section */}
            {canView('land_alerts') && (
                <div className="bg-gradient-to-br from-[#12243d] to-[#1a365d] rounded-[2.5rem] p-8 text-white shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Icon name="analytics" className="w-64 h-64 text-white" />
                    </div>
                    <div className="relative z-10 w-full">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2.5 bg-white/10 rounded-xl">
                                <Icon name="analytics" className="w-5 h-5 text-yellow-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-black tracking-tight">TaskMe AI Intelligence</h3>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-white/30">Active Advisory Engine</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <AIInsightCard 
                                title="Revenue Forecast" 
                                description="Projected revenue for next month is KES 4.8M (+5%) based on lease renewals." 
                                type="success"
                                icon="revenue"
                            />
                            <AIInsightCard 
                                title="Churn Risk Detected" 
                                description="2 Landlords (Sarah Holdings, James Investor) show vacancy spikes. Recommend engagement." 
                                type="warning"
                                icon="offboarding"
                            />
                            <AIInsightCard 
                                title="Market Opportunity" 
                                description="Rental rates in Westlands trending up. Suggest 4% increase review for 'Highland Mall'." 
                                type="info"
                                icon="branch"
                            />
                        </div>
                    </div>
                </div>
            )}

            {canView('land_kpi') && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {metrics.map(metric => (
                        <MetricCard 
                            key={metric.id} 
                            metric={metric} 
                            onClick={() => setSelectedMetric(metric)} 
                        />
                    ))}
                </div>
            )}

            {canView('land_quick_actions') && (
                <div className="bg-red-50/20 border border-red-100 rounded-[2rem] p-8 flex items-start gap-4">
                    <div className="relative z-10 flex gap-4 w-full">
                        <div className="p-3 bg-[#9D1F15]/10 rounded-2xl flex-shrink-0">
                            <Icon name="info" className="w-6 h-6 text-[#9D1F15]" />
                        </div>
                        <div>
                            <h4 className="font-extrabold text-[#1a365d]">Analytical Report Guides</h4>
                            <p className="text-sm text-gray-500 font-bold mt-1 leading-relaxed">
                                Click on any card above to launch the interactive live Ledger. 
                                You can query, search, and export compiled CSV sheets instantly.
                                All computations of Gross Rent, Commissions, and MRI Tax are updated in real-time as payments are processed.
                            </p>
                        </div>
                    </div>
                </div>
            )}

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
