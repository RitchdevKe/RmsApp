
import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { TaskStatus } from '../../types';
import { fmtDate } from '../../utils/date';
import { computeTenantArrears } from '../../utils/tenantArrears';

const Chart: React.FC<{ type: 'bar' | 'line' | 'doughnut'; data: any; options?: any; height?: string }> = ({ type, data, options, height = "h-72" }) => {
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
                    plugins: { legend: { position: 'top' } },
                    ...options
                },
            });
        }
        return () => chartRef.current?.destroy();
    }, [type, data, options]);

    return <div className={`relative ${height}`}><canvas ref={canvasRef}></canvas></div>;
};

type ReportView = 'revenue' | 'expenses' | 'arrears' | 'net';

const FinancialReports: React.FC = () => {
    const { tenants, tasks, staff, bills, properties } = useData();
    const [activeView, setActiveView] = useState<ReportView>('revenue');
    const [agentFilter, setAgentFilter] = useState('All');
    const [propertyFilter, setPropertyFilter] = useState('All');

    // Real agent list: Field Agents who are assigned to at least one property
    const agentList = useMemo(() => {
        const assignedIds = new Set(properties.map(p => p.assignedAgentId).filter(Boolean));
        return staff.filter(s => s.role === 'Field Agent' && assignedIds.has(s.id));
    }, [staff, properties]);

    // Cascading property list: filter to agent's properties when an agent is selected
    const filteredPropertyList = useMemo(() => {
        if (agentFilter === 'All') return properties;
        return properties.filter(p => p.assignedAgentId === agentFilter);
    }, [properties, agentFilter]);

    // Filtered tenants based on agent + property selectors
    const filteredTenants = useMemo(() => {
        let result = tenants;
        if (propertyFilter !== 'All') {
            result = result.filter(t => t.propertyId === propertyFilter);
        }
        if (agentFilter !== 'All') {
            const agentPropIds = new Set(properties.filter(p => p.assignedAgentId === agentFilter).map(p => p.id));
            result = result.filter(t => t.propertyId && agentPropIds.has(t.propertyId));
        }
        return result;
    }, [tenants, properties, agentFilter, propertyFilter]);

    // Handle Deep Linking
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('?')) {
            const params = new URLSearchParams(hash.split('?')[1]);
            const view = params.get('view');
            if (view && ['revenue', 'expenses', 'arrears', 'net'].includes(view)) {
                setActiveView(view as ReportView);
            }
        }
    }, []);

    const handleTabChange = (view: ReportView) => {
        setActiveView(view);
        const url = new URL(window.location.href);
        url.hash = `#/reports/financial-reports?view=${view}`;
        window.history.replaceState(null, '', url.toString());
    };

    // --- DATA CALCULATIONS ---

    // 1. Collections (Revenue)
    const collectionsByDate = useMemo(() => {
        const data: Record<string, number> = {};
        filteredTenants.forEach(t => {
            const history = t.paymentHistory || [];
            history.forEach(p => {
                if (p.status === 'Paid') {
                    const date = (p.date || '').split(',')[0]; 
                    const amount = parseFloat(String(p.amount || '').replace(/[^0-9.]/g, '')) || 0;
                    data[date] = (data[date] || 0) + amount;
                }
            });
        });
        return Object.entries(data)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .reduce((acc, [key, val]) => ({ ...acc, [key]: val }), {} as Record<string, number>);
    }, [filteredTenants]);

    const totalRevenue = useMemo(() => Object.values(collectionsByDate).reduce((a: number, b: number) => a + b, 0), [collectionsByDate]);

    // 2. Arrears — real per-tenant arrears from payment ledger, not just 'Overdue' status flag.
    const arrearsData = useMemo(() => {
        const now = new Date();
        const currentMonthIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const rows: any[] = [];
        filteredTenants.forEach(t => {
            if (['Vacated', 'Evicted', 'Blacklisted', 'Inactive', 'PendingApproval', 'PendingAllocation', 'PendingPayment'].includes(String(t.status))) return;
            if (!Number(t.rentAmount ?? 0)) return;
            let breakdown;
            let finalArrears = 0;
            try { 
                breakdown = computeTenantArrears(t as any, currentMonthIso, { allTenants: filteredTenants }); 
                const accrued = breakdown.totalArrears || 0;
                const adminArrears = Math.max(0, Number((t as any).arrears ?? 0));
                finalArrears = Math.max(accrued, adminArrears);
            } catch { return; }
            if (finalArrears <= 0) return;
            // Oldest unpaid slot drives the age bucket.
            const oldest = breakdown && breakdown.items && breakdown.items.length > 0 ? breakdown.items[0] : null;
            const oldestDate = oldest ? new Date(`${oldest.monthIso}-15T00:00:00`) : now;
            const daysOverdue = Math.max(0, Math.ceil((now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24)));
            rows.push({
                tenant: t.name,
                property: t.propertyName,
                unit: t.unit,
                amount: Math.round(finalArrears),
                dueDate: fmtDate(oldestDate),
                daysOverdue,
                ageGroup: daysOverdue <= 15 ? '1-15 days' : daysOverdue <= 30 ? '16-30 days' : daysOverdue <= 60 ? '31-60 days' : '60+ days',
            });
        });
        return rows.sort((a, b) => b.amount - a.amount);
    }, [filteredTenants]);

    // 3. Expenses
    const expenseData = useMemo(() => {
        const maintenanceCosts = tasks.reduce((acc, t) => acc + (t.costs?.labor || 0) + (t.costs?.materials || 0), 0);
        const salaries = staff.reduce((acc, s) => acc + (s.payrollInfo?.baseSalary || 0), 0);
        const utilityKeys = new Set(['Water', 'Electricity', 'Garbage', 'Gas', 'Internet', 'Service Charge', 'Utilities']);
        const utilities = bills
            .filter(b => utilityKeys.has(b.category) || b.category.toLowerCase().includes('util'))
            .reduce((acc, b) => acc + (Number(b.amount) || 0), 0);
        const other = bills
            .filter(b => !(utilityKeys.has(b.category) || b.category.toLowerCase().includes('util')))
            .reduce((acc, b) => acc + (Number(b.amount) || 0), 0);

        return {
            breakdown: {
                'Maintenance': maintenanceCosts,
                'Salaries': salaries,
                'Utilities': utilities,
                'Marketing & Other': other
            },
            total: maintenanceCosts + salaries + utilities + other
        };
    }, [tasks, staff, bills]);

    // --- CHARTS ---

    const collectionsChartData = {
        labels: Object.keys(collectionsByDate),
        datasets: [{
            label: 'Collections (KES)',
            data: Object.values(collectionsByDate),
            backgroundColor: '#9D1F15',
            borderColor: '#9D1F15',
            fill: false,
            tension: 0.1
        }]
    };

    const arrearsByAgeData = {
        labels: ['1-15 days', '16-30 days', '31-60 days', '60+ days'],
        datasets: [{
            label: 'Arrears by Age (KES)',
            data: [
                arrearsData.filter(a => a.ageGroup === '1-15 days').reduce((s, a) => s + (a.amount || 0), 0),
                arrearsData.filter(a => a.ageGroup === '16-30 days').reduce((s, a) => s + (a.amount || 0), 0),
                arrearsData.filter(a => a.ageGroup === '31-60 days').reduce((s, a) => s + (a.amount || 0), 0),
                arrearsData.filter(a => a.ageGroup === '60+ days').reduce((s, a) => s + (a.amount || 0), 0)
            ],
            backgroundColor: '#F39C2A',
        }]
    };

    const expenseChartData = {
        labels: Object.keys(expenseData.breakdown),
        datasets: [{
            label: 'Expenses (KES)',
            data: Object.values(expenseData.breakdown),
            backgroundColor: ['#ef4444', '#3b82f6', '#eab308', '#6b7280'],
        }]
    };

    return (
        <div className="space-y-8 pb-10">
            <button onClick={() => window.location.hash = '#/reports-analytics/reports'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-4">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Reports Center
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Financial Reports</h1>
                <p className="text-lg text-gray-500 mt-1">Deep dive into revenue, expenses, and payment behaviors.</p>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8 overflow-x-auto">
                    <button onClick={() => handleTabChange('revenue')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeView === 'revenue' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                        Revenue & Collections
                    </button>
                    <button onClick={() => handleTabChange('expenses')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeView === 'expenses' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                        Expenses
                    </button>
                    <button onClick={() => handleTabChange('arrears')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeView === 'arrears' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                        Arrears & Debt
                    </button>
                    <button onClick={() => handleTabChange('net')} className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeView === 'net' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                        Net Performance
                    </button>
                </nav>
            </div>

            {/* REVENUE VIEW */}
            {activeView === 'revenue' && (
                <div className="bg-white p-6 rounded-xl shadow-sm animate-fade-in">
                    <h2 className="text-xl font-bold text-gray-800 mb-4">Monthly Collections Breakdown</h2>
                    <div className="flex gap-4 mb-4 flex-wrap">
                        <select value={agentFilter} onChange={e => { setAgentFilter(e.target.value); setPropertyFilter('All'); }} className="p-2 border rounded-md bg-white text-sm">
                            <option value="All">All Agents</option>
                            {agentList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <select value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)} className="p-2 border rounded-md bg-white text-sm">
                            <option value="All">All Properties</option>
                            {filteredPropertyList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <h3 className="font-semibold text-center mb-2 text-gray-600">Daily Collection Trend</h3>
                            <Chart type="line" data={collectionsChartData} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-center mb-2 text-gray-600">Recent Transactions</h3>
                            <div className="overflow-y-auto h-72 border rounded-lg">
                                 <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50 sticky top-0"><tr>
                                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Date</th><th className="px-3 py-2 text-left font-semibold text-gray-600">Ref</th><th className="px-3 py-2 text-right font-semibold text-gray-600">Amount</th>
                                    </tr></thead>
                                    <tbody>
                                        {Object.entries(collectionsByDate).map(([date, amt], i) => (
                                            <tr key={i} className="hover:bg-gray-50"><td className="px-3 py-2">{date}</td><td className="px-3 py-2 text-gray-500">Consolidated</td><td className="px-3 py-2 text-right font-bold text-green-600">KES {Number(amt ?? 0).toLocaleString()}</td></tr>
                                        ))}
                                    </tbody>
                                 </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* EXPENSES VIEW */}
            {activeView === 'expenses' && (
                <div className="bg-white p-6 rounded-xl shadow-sm animate-fade-in">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-gray-800">Operational Expenses</h2>
                        <p className="text-2xl font-bold text-red-600">Total: KES {Number(expenseData?.total ?? 0).toLocaleString()}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="font-semibold text-center mb-4 text-gray-600">Expense Distribution</h3>
                            <Chart type="doughnut" data={expenseChartData} />
                        </div>
                        <div>
                            <h3 className="font-semibold mb-4 text-gray-600">Breakdown</h3>
                            <div className="space-y-3">
                                {Object.entries(expenseData.breakdown).map(([cat, amt], i) => (
                                    <div key={cat} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                        <div className="flex items-center">
                                            <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: expenseChartData.datasets[0].backgroundColor[i] }}></span>
                                            <span className="font-medium text-gray-700">{cat}</span>
                                        </div>
                                        <span className="font-bold text-gray-900">KES {Number(amt ?? 0).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ARREARS VIEW */}
            {activeView === 'arrears' && (
                <div className="bg-white p-6 rounded-xl shadow-sm animate-fade-in">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-gray-800">Overdue Payments (Arrears)</h2>
                        <div className="text-right">
                            <p className="text-sm text-gray-500">Total Outstanding</p>
                            <p className="text-2xl font-bold text-red-600">
                                KES {Number(arrearsData.reduce((sum, a) => sum + (a.amount || 0), 0) ?? 0).toLocaleString()}
                            </p>
                        </div>
                    </div>
                     <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1">
                            <h3 className="font-semibold text-center mb-2 text-gray-600">Arrears by Age</h3>
                            <Chart type="bar" data={arrearsByAgeData} height="h-64" />
                        </div>
                        <div className="lg:col-span-2">
                            <h3 className="font-semibold text-gray-700 mb-2">Detailed Arrears List</h3>
                            <div className="overflow-y-auto h-72 border rounded-lg">
                                 <table className="min-w-full divide-y divide-gray-200 text-sm">
                                    <thead className="bg-gray-50 sticky top-0 shadow-sm">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-gray-500 font-bold bg-gray-100 uppercase text-xs tracking-wider">Tenant</th>
                                            <th className="px-4 py-2 text-left text-gray-500 font-bold bg-gray-100 uppercase text-xs tracking-wider">Unit</th>
                                            <th className="px-4 py-2 text-center text-gray-500 font-bold bg-gray-100 uppercase text-xs tracking-wider">Due Date</th>
                                            <th className="px-4 py-2 text-center text-gray-500 font-bold bg-gray-100 uppercase text-xs tracking-wider">Days Overdue</th>
                                            <th className="px-4 py-2 text-right text-gray-500 font-bold bg-gray-100 uppercase text-xs tracking-wider">Arrears Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-100">
                                        {arrearsData.length > 0 ? arrearsData.map((a, i) => (
                                            <tr key={i} className="hover:bg-red-50/50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-gray-900">{a.tenant}</td>
                                                <td className="px-4 py-3 text-gray-600 text-xs">{a.property} - {a.unit}</td>
                                                <td className="px-4 py-3 text-center text-gray-600 font-mono text-xs">{a.dueDate}</td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${a.daysOverdue > 30 ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                                                        {a.daysOverdue} Days
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-red-600">KES {Number(a.amount ?? 0).toLocaleString()}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No tenants in arrears.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                 </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* NET PERFORMANCE VIEW */}
            {activeView === 'net' && (() => {
                const totalExp = expenseData?.total ?? 0;
                const netProfit = totalRevenue - totalExp;
                const maxVal = Math.max(totalRevenue, totalExp, Math.abs(netProfit), 1);
                const revHeight = Math.max(4, Math.round((totalRevenue / maxVal) * 200));
                const expHeight = Math.max(4, Math.round((totalExp / maxVal) * 200));
                const netHeight = Math.max(4, Math.round((Math.abs(netProfit) / maxVal) * 200));
                
                return (
                    <div className="bg-white p-6 rounded-xl shadow-sm animate-fade-in text-center">
                        <h2 className="text-xl font-bold text-gray-800 mb-6">Net Performance (Profit/Loss)</h2>
                        <div className="flex justify-center gap-12 items-end h-64 border-b pb-2">
                            <div className="text-center w-32">
                                <p className="mb-2 font-bold text-green-600">KES {Number(totalRevenue ?? 0).toLocaleString()}</p>
                                <div className="bg-green-500 w-full rounded-t-lg transition-all duration-500" style={{ height: `${revHeight}px` }}></div>
                                <p className="mt-2 font-semibold text-gray-600">Revenue</p>
                            </div>
                            <div className="text-center w-32">
                                <p className="mb-2 font-bold text-red-600">KES {Number(totalExp).toLocaleString()}</p>
                                <div className="bg-red-500 w-full rounded-t-lg transition-all duration-500" style={{ height: `${expHeight}px` }}></div>
                                <p className="mt-2 font-semibold text-gray-600">Expenses</p>
                            </div>
                            <div className="text-center w-32">
                                <p className={`mb-2 font-bold ${netProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>KES {netProfit.toLocaleString()}</p>
                                <div className={`${netProfit >= 0 ? 'bg-blue-500' : 'bg-red-600'} w-full rounded-t-lg transition-all duration-500`} style={{ height: `${netHeight}px` }}></div>
                                <p className="mt-2 font-semibold text-gray-600">{netProfit >= 0 ? 'Net Profit' : 'Net Loss'}</p>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default FinancialReports;
