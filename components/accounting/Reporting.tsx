
import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { isRepurposedUnit } from '../../utils/repurposedUnits';
import { getCurrentMonthIso } from '../../utils/timezone';

const Chart: React.FC<{ type: 'bar' | 'line'; data: any; options?: any; height?: string }> = ({ type, data, options, height = "h-80" }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<any>(null);

    useEffect(() => {
        if (!canvasRef.current || !(window as any).Chart) return;
        if (chartRef.current) chartRef.current.destroy();

        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            chartRef.current = new (window as any).Chart(ctx, {
                type,
                data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    ...options
                },
            });
        }
        return () => chartRef.current?.destroy();
    }, [type, data, options]);

    return <div className={`relative ${height}`}><canvas ref={canvasRef}></canvas></div>;
};

const safeNum = (v: any): number => {
    if (v == null) return 0;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};

type Report = { title: string; columns: { header: string; accessor: string; align?: 'left' | 'right' | 'center'; format?: 'currency' | 'number' | 'percent' }[]; rows: any[]; summary?: { label: string; value: string }[] };

const ReportModal: React.FC<{ report: Report; onClose: () => void }> = ({ report, onClose }) => {
    const handleExport = () => {
        const headers = report.columns.map(c => c.header).join(',');
        const rows = report.rows.map(r => report.columns.map(c => {
            const v = r[c.accessor];
            const s = String(v ?? '');
            return s.includes(',') ? `"${s}"` : s;
        }).join(','));
        const csv = [headers, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.title.replace(/\s+/g, '_')}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    return (
        <div className="fixed inset-0 bg-black/60 z-[1200] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-6 border-b bg-gray-50 rounded-t-xl">
                    <h2 className="text-xl font-bold text-gray-800">{report.title}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full">
                        <Icon name="close" className="w-6 h-6 text-gray-500" />
                    </button>
                </div>
                {report.summary && report.summary.length > 0 && (
                    <div className="p-4 border-b flex gap-3 flex-wrap">
                        {report.summary.map((s, i) => (
                            <div key={i} className="px-4 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                                <p className="text-[10px] text-blue-500 uppercase font-bold">{s.label}</p>
                                <p className="text-lg font-bold text-blue-900">{s.value}</p>
                            </div>
                        ))}
                    </div>
                )}
                <div className="flex-1 overflow-y-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                {report.columns.map((c, i) => (
                                    <th key={i} className={`py-3 px-4 text-xs font-semibold text-gray-500 uppercase ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>{c.header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {report.rows.length === 0 ? (
                                <tr><td colSpan={report.columns.length} className="py-12 text-center text-gray-400">No data available.</td></tr>
                            ) : report.rows.map((row, ri) => (
                                <tr key={ri} className="hover:bg-gray-50">
                                    {report.columns.map((c, ci) => {
                                        let v = row[c.accessor];
                                        if (c.format === 'currency') v = `KES ${safeNum(v).toLocaleString()}`;
                                        else if (c.format === 'percent') v = `${safeNum(v).toFixed(1)}%`;
                                        else if (c.format === 'number') v = safeNum(v).toLocaleString();
                                        return <td key={ci} className={`py-3 px-4 text-gray-700 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>{v}</td>;
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-4 border-t bg-gray-50 flex justify-end">
                    <button onClick={handleExport} className="flex items-center px-4 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark">
                        <Icon name="download" className="w-4 h-4 mr-2" /> Export CSV
                    </button>
                </div>
            </div>
        </div>
    );
};

const Reporting: React.FC = () => {
    const { properties, tenants, bills, tasks, landlords } = useData();
    const [activeReport, setActiveReport] = useState<Report | null>(null);

    const monthPrefix = getCurrentMonthIso();

    // Live Profitability
    const propProfitability = useMemo(() => {
        return properties.map(p => {
            const revenue = tenants
                .filter(t => t.propertyId === p.id && t.status !== 'Overdue')
                .reduce((s, t) => s + safeNum(t.rentAmount), 0);
            const propBills = bills.filter(b => b.propertyId === p.id).reduce((s, b) => s + safeNum(b.amount), 0);
            const propTasks = tasks.filter(t => t.property === p.name).reduce((s, t) => s + (safeNum(t.costs?.labor) + safeNum(t.costs?.materials)), 0);
            const expense = propBills + propTasks;
            return { name: p.name, revenue, expense, net: revenue - expense };
        }).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    }, [properties, tenants, bills, tasks]);

    const chartData = {
        labels: propProfitability.map(p => p.name.substring(0, 10) + (p.name.length > 10 ? '...' : '')),
        datasets: [
            { label: 'Revenue', data: propProfitability.map(p => p.revenue), backgroundColor: '#10b981', borderRadius: 4 },
            { label: 'Expenses', data: propProfitability.map(p => p.expense), backgroundColor: '#ef4444', borderRadius: 4 }
        ]
    };

    // --- Report generators ---
    const buildRoiReport = (): Report => {
        const rows = properties.map(p => {
            const propTenants = tenants.filter(t => t.propertyId === p.id);
            const collected = propTenants.reduce((s, t) => {
                return s + (t.paymentHistory || [])
                    .filter((pay: any) => pay?.status === 'Paid')
                    .reduce((sum: number, pay: any) => sum + safeNum(pay.amount), 0);
            }, 0);
            const expenses = bills.filter(b => b.propertyId === p.id).reduce((s, b) => s + safeNum(b.amount), 0)
                + tasks.filter(t => t.property === p.name).reduce((s, t) => s + safeNum(t.costs?.labor) + safeNum(t.costs?.materials) + safeNum(t.costs?.travel), 0);
            const net = collected - expenses;
            const invested = safeNum((p as any).acquisitionValue) || safeNum(p.defaultMonthlyRent) * (p.units?.length || 0) * 120; // rough estimate
            const roi = invested > 0 ? (net / invested) * 100 : 0;
            return { property: p.name, landlord: landlords.find(l => l.id === p.landlordId)?.name || '—', collected, expenses, net, roi };
        }).sort((a, b) => b.roi - a.roi);
        return {
            title: 'ROI Analysis Report',
            columns: [
                { header: 'Property', accessor: 'property' },
                { header: 'Landlord', accessor: 'landlord' },
                { header: 'Collected', accessor: 'collected', format: 'currency', align: 'right' },
                { header: 'Expenses', accessor: 'expenses', format: 'currency', align: 'right' },
                { header: 'Net', accessor: 'net', format: 'currency', align: 'right' },
                { header: 'ROI', accessor: 'roi', format: 'percent', align: 'right' },
            ],
            rows,
            summary: [
                { label: 'Total Net', value: `KES ${rows.reduce((s, r) => s + r.net, 0).toLocaleString()}` },
                { label: 'Properties', value: String(rows.length) },
            ]
        };
    };

    const buildVendorReport = (): Report => {
        const byVendor: Record<string, { name: string; jobs: number; completed: number; totalCost: number }> = {};
        tasks.forEach(t => {
            const name = t.assignedTo || 'Unassigned';
            if (!byVendor[name]) byVendor[name] = { name, jobs: 0, completed: 0, totalCost: 0 };
            byVendor[name].jobs++;
            if (t.status === 'Completed' || t.status === 'Closed') byVendor[name].completed++;
            byVendor[name].totalCost += safeNum(t.costs?.labor) + safeNum(t.costs?.materials) + safeNum(t.costs?.travel);
        });
        const rows = Object.values(byVendor).map(v => ({
            ...v,
            completionRate: v.jobs > 0 ? (v.completed / v.jobs) * 100 : 0,
            avgCost: v.jobs > 0 ? v.totalCost / v.jobs : 0,
        })).sort((a, b) => b.jobs - a.jobs);
        return {
            title: 'Vendor Performance Report',
            columns: [
                { header: 'Vendor', accessor: 'name' },
                { header: 'Jobs', accessor: 'jobs', align: 'center', format: 'number' },
                { header: 'Completed', accessor: 'completed', align: 'center', format: 'number' },
                { header: 'Completion Rate', accessor: 'completionRate', format: 'percent', align: 'right' },
                { header: 'Total Cost', accessor: 'totalCost', format: 'currency', align: 'right' },
                { header: 'Avg Cost/Job', accessor: 'avgCost', format: 'currency', align: 'right' },
            ],
            rows,
            summary: [{ label: 'Vendors Tracked', value: String(rows.length) }]
        };
    };

    const buildVacancyLossReport = (): Report => {
        const rows = properties.map(p => {
            const rentable = p.units.filter(u => !isRepurposedUnit(u));
            const vacant = rentable.filter(u => u.status === 'Vacant').length;
            const potentialPerUnit = safeNum(p.defaultMonthlyRent);
            const monthlyLoss = vacant * potentialPerUnit;
            const annualLoss = monthlyLoss * 12;
            const vacancyRate = rentable.length > 0 ? (vacant / rentable.length) * 100 : 0;
            return {
                property: p.name,
                totalUnits: p.units.length,
                rentable: rentable.length,
                vacant,
                vacancyRate,
                monthlyLoss,
                annualLoss,
            };
        }).filter(r => r.vacant > 0)
          .sort((a, b) => b.monthlyLoss - a.monthlyLoss);
        return {
            title: 'Vacancy Loss Report',
            columns: [
                { header: 'Property', accessor: 'property' },
                { header: 'Total Units', accessor: 'totalUnits', align: 'center', format: 'number' },
                { header: 'Rentable', accessor: 'rentable', align: 'center', format: 'number' },
                { header: 'Vacant', accessor: 'vacant', align: 'center', format: 'number' },
                { header: 'Vacancy Rate', accessor: 'vacancyRate', format: 'percent', align: 'right' },
                { header: 'Monthly Loss', accessor: 'monthlyLoss', format: 'currency', align: 'right' },
                { header: 'Annual Loss', accessor: 'annualLoss', format: 'currency', align: 'right' },
            ],
            rows,
            summary: [
                { label: 'Total Monthly Loss', value: `KES ${rows.reduce((s, r) => s + r.monthlyLoss, 0).toLocaleString()}` },
                { label: 'Total Annual Loss', value: `KES ${rows.reduce((s, r) => s + r.annualLoss, 0).toLocaleString()}` },
            ]
        };
    };

    const buildTaxSummary = (): Report => {
        const rows = landlords.map(l => {
            const lProps = properties.filter(p => p.landlordId === l.id);
            const gross = lProps.reduce((sum, p) => {
                const propTenants = tenants.filter(t => t.propertyId === p.id);
                return sum + propTenants.reduce((s, t) => {
                    return s + (t.paymentHistory || [])
                        .filter((pay: any) => pay?.status === 'Paid')
                        .reduce((ss: number, pay: any) => ss + safeNum(pay.amount), 0);
                }, 0);
            }, 0);
            const rate = 7.5;
            const tax = gross * (rate / 100);
            return { landlord: l.name, properties: lProps.length, gross, rate, tax };
        }).filter(r => r.gross > 0)
          .sort((a, b) => b.tax - a.tax);
        return {
            title: 'Tax Summary Report (MRI 7.5%)',
            columns: [
                { header: 'Landlord', accessor: 'landlord' },
                { header: 'Properties', accessor: 'properties', align: 'center', format: 'number' },
                { header: 'Gross Rent (YTD)', accessor: 'gross', format: 'currency', align: 'right' },
                { header: 'Rate', accessor: 'rate', format: 'percent', align: 'right' },
                { header: 'Tax Liability', accessor: 'tax', format: 'currency', align: 'right' },
            ],
            rows,
            summary: [{ label: 'Total Tax Liability', value: `KES ${rows.reduce((s, r) => s + r.tax, 0).toLocaleString()}` }]
        };
    };

    const quickReports: { name: string; build: () => Report }[] = [
        { name: 'ROI Analysis', build: buildRoiReport },
        { name: 'Vendor Performance', build: buildVendorReport },
        { name: 'Vacancy Loss', build: buildVacancyLossReport },
        { name: 'Tax Summary', build: buildTaxSummary },
    ];

    return (
        <div className="space-y-8 pb-10">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Advanced Reporting</h1>
                <p className="text-lg text-gray-500 mt-1">Custom reports and deep analytical insights.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="bg-gradient-to-br from-indigo-900 to-blue-800 rounded-2xl p-8 text-white lg:col-span-1 shadow-lg">
                    <Icon name="analytics" className="w-12 h-12 text-blue-300 mb-4" />
                    <h3 className="text-2xl font-bold mb-2">Custom Report Builder</h3>
                    <p className="text-indigo-200 mb-6 text-sm leading-relaxed">
                        Drag and drop metrics to create tailored financial reports for stakeholders.
                    </p>
                    <button
                        onClick={() => window.location.hash = '#/reports-analytics/reports/custom-reports'}
                        className="w-full py-3 bg-white text-indigo-900 font-bold rounded-xl hover:bg-indigo-50 transition-colors"
                    >
                        Start Building
                    </button>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-2">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Profitability by Property</h3>
                    <Chart type="bar" data={chartData} />
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {quickReports.map(r => (
                    <button
                        key={r.name}
                        onClick={() => setActiveReport(r.build())}
                        className="text-left bg-white p-6 rounded-2xl border border-gray-200 hover:border-primary hover:shadow-md cursor-pointer transition-all group"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-blue-50 transition-colors">
                                <Icon name="download" className="w-6 h-6 text-gray-400 group-hover:text-primary" />
                            </div>
                        </div>
                        <h4 className="font-bold text-gray-800">{r.name}</h4>
                        <p className="text-xs text-gray-500 mt-1">Click to open live report</p>
                    </button>
                ))}
            </div>

            {activeReport && <ReportModal report={activeReport} onClose={() => setActiveReport(null)} />}
        </div>
    );
};

export default Reporting;
