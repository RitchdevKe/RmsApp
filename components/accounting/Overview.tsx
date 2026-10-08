
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';

// --- Card Styles ---
const MAJOR_CARD_CLASSES = "relative bg-white rounded-2xl border-t-[8px] border-t-primary border-b-[4px] border-b-secondary border-x-[3px] border-x-secondary shadow-[inset_0_0_60px_-15px_rgba(157,31,21,0.15)] hover:shadow-lg transition-all duration-300 overflow-hidden";

const Chart: React.FC<{ type: 'line' | 'bar' | 'doughnut'; data: any; options?: any; height?: string }> = ({ type, data, options, height = "h-64" }) => {
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
                    plugins: { legend: { position: 'bottom' } },
                    ...options
                },
            });
        }
        return () => chartRef.current?.destroy();
    }, [type, data, options]);

    return <div className={`relative ${height}`}><canvas ref={canvasRef}></canvas></div>;
};

const KpiCard: React.FC<{ title: string; value: string; subtext: string; trend: 'up' | 'down' | 'neutral'; color: string; icon: string }> = ({ title, value, subtext, trend, color, icon }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all group">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <h3 className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</h3>
            </div>
            <div className={`p-2 rounded-lg bg-gray-50 group-hover:bg-opacity-20 transition-colors`} style={{ backgroundColor: `${color}10` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
        <div className="mt-4 flex items-center text-xs font-medium text-gray-500">
            <span className={`flex items-center mr-2 ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-400'}`}>
                {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—'} {subtext}
            </span>
            <span>vs last month</span>
        </div>
    </div>
);

const Overview: React.FC = () => {
    const { tenants, bills, invoices, tasks, properties } = useData();
    const [viewMode, setViewMode] = useState<'agency' | 'landlord'>('agency');

    // --- Live Financial Calculations ---
    const stats = useMemo(() => {
        // Gross Tenant Payments
        const grossRentCollected = tenants.reduce((acc, t) => {
            const h = t.paymentHistory || [];
            const paid = h.reduce((sum, p) => sum + (parseFloat(String(p.amount || '').replace(/[^0-9.]/g, '')) || 0), 0);
            return acc + paid;
        }, 0);

        // All-Time bills and task expenses
        const billExpenses = bills.reduce((acc, b) => acc + (b.status === 'Paid' ? (Number(b.amount) || 0) : 0), 0);
        const taskExpenses = tasks
            .filter(t => t.status === 'Completed' || t.status === 'Closed')
            .reduce((acc, t) => acc + ((t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0)), 0);

        // Receivables (overdue rent + pending tenant bills)
        const overdueRent = tenants.reduce((acc, t) => acc + (t.status === 'Overdue' ? (t.rentAmount || 0) : 0), 0);
        const pendingBills = tenants.reduce((acc, t) => acc + (t.outstandingBills || []).filter(b => b.status === 'Pending').reduce((s, b) => s + (Number(b.amount) || 0), 0), 0);
        const grossReceivables = overdueRent + pendingBills;

        // Payables (all unpaid bills)
        const grossPayables = bills.reduce((acc, b) => acc + (b.status === 'Unpaid' || b.status === 'Overdue' ? (Number(b.amount) || 0) : 0), 0);

        // Toggles based on ViewMode
        let totalRevenue = 0;
        let totalExpenses = 0;
        let receivables = 0;
        let payables = 0;

        if (viewMode === 'agency') {
            // Agency earnings: 12% commission and admin fees on rent collected
            totalRevenue = grossRentCollected * 0.12;
            // Agency expenses: Staff salaries, office override portion of bills and task expenses
            totalExpenses = billExpenses * 0.45 + taskExpenses * 0.10;
            // Agency receivables: 12% of total receivables
            receivables = grossReceivables * 0.12;
            // Agency payables: 45% of gross payables
            payables = grossPayables * 0.45;
        } else {
            // Portfolio / Landlord view: Gross rent collected (100% of tenant payments)
            totalRevenue = grossRentCollected;
            // Property/owner expenses: Property maintenance (90% of completed work order tasks) + utility bills portion of bills
            totalExpenses = taskExpenses * 0.90 + billExpenses * 0.55;
            // Landlord receivables: gross tenant dues
            receivables = grossReceivables;
            // Landlord payables: gross unpaid property utility/supplier bills
            payables = grossPayables;
        }

        const netProfit = totalRevenue - totalExpenses;
        const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

        // Arrears percentage (overdue tenants / active tenants)
        const activeTenants = tenants.filter(t => t.status !== 'Vacated' && t.status !== 'Evicted' && t.status !== 'Blacklisted');
        const arrearsPct = activeTenants.length > 0
            ? Math.round((tenants.filter(t => t.status === 'Overdue').length / activeTenants.length) * 100)
            : 0;

        // Financial Health Score (0–100)
        const profitabilityScore = Math.min(40, Math.max(0, Math.round((margin / 100) * 40)));
        const coverageRatio = receivables / (payables || 1);
        const liquidityScore = Math.min(30, Math.round(Math.min(coverageRatio, 3) / 3 * 30));
        const paidTenantCount = tenants.filter(t => t.status === 'Active').length;
        const reliabilityScore = activeTenants.length > 0 ? Math.round((paidTenantCount / activeTenants.length) * 30) : 15;
        const healthScore = Math.min(100, profitabilityScore + liquidityScore + reliabilityScore);

        return { totalRevenue, totalExpenses, receivables, payables, netProfit, margin, arrearsPct, healthScore };
    }, [tenants, bills, tasks, viewMode]);

    // --- Monthly Cashflow Calculation ---
    const monthlyCashflow = useMemo(() => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentYear = new Date().getFullYear();
        const incomeData = new Array(12).fill(0);
        const expenseData = new Array(12).fill(0);

        // Aggregate Income
        tenants.forEach(t => {
            const h = t.paymentHistory || [];
            h.forEach(p => {
                const d = new Date(p.date || '');
                if (d.getFullYear() === currentYear && p.status === 'Paid') {
                    const amt = parseFloat(String(p.amount || '').replace(/[^0-9.]/g, '')) || 0;
                    incomeData[d.getMonth()] += amt;
                }
            });
        });

        // Aggregate Expenses
        bills.forEach(b => {
             const d = new Date(b.invoiceDate || '');
             if (d.getFullYear() === currentYear && b.status === 'Paid') {
                 expenseData[d.getMonth()] += (Number(b.amount) || 0);
             }
        });

        // Slice for last 6 months relevant
        const currentMonthIndex = new Date().getMonth();
        const startMonth = Math.max(0, currentMonthIndex - 5);
        
        const slicedLabels = months.slice(startMonth, currentMonthIndex + 1);
        let slicedIncome = incomeData.slice(startMonth, currentMonthIndex + 1);
        let slicedExpenses = expenseData.slice(startMonth, currentMonthIndex + 1);

        if (viewMode === 'agency') {
            slicedIncome = slicedIncome.map(v => v * 0.12);
            slicedExpenses = slicedExpenses.map(v => v * 0.50);
        } else {
            slicedExpenses = slicedExpenses.map(v => v * 0.70);
        }
        
        return {
            labels: slicedLabels,
            income: slicedIncome,
            expenses: slicedExpenses
        };
    }, [tenants, bills, viewMode]);

    const cashflowData = {
        labels: monthlyCashflow.labels,
        datasets: [
            {
                label: 'Income',
                data: monthlyCashflow.income,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true
            },
            {
                label: 'Expenses',
                data: monthlyCashflow.expenses,
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.4,
                fill: true
            }
        ]
    };

    const receivablesPayablesData = {
        labels: ['Receivables (In)', 'Payables (Out)'],
        datasets: [{
            data: [stats.receivables, stats.payables],
            backgroundColor: ['#3b82f6', '#f59e0b'],
            borderWidth: 0
        }]
    };

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Financial Command Center</h1>
                    <p className="text-lg text-gray-500 mt-1">Real-time financial health, cashflow analysis, and liquidity tracking.</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => setViewMode('agency')}
                        className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${viewMode === 'agency' ? 'bg-white text-primary shadow' : 'text-gray-500'}`}
                    >
                        Agency View
                    </button>
                    <button
                        onClick={() => setViewMode('landlord')}
                        className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${viewMode === 'landlord' ? 'bg-white text-primary shadow' : 'text-gray-500'}`}
                    >
                        Portfolio View
                    </button>
                </div>
            </div>

            {/* Financial Health Score & Quick Stats */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white flex flex-col justify-between relative overflow-hidden shadow-lg">
                    <div className="relative z-10">
                        <div className="flex justify-between items-start">
                            <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Financial Health Score</p>
                            <Icon name="shield" className="w-5 h-5 text-green-400" />
                        </div>
                        <div className="mt-4 flex items-baseline">
                            <span className="text-5xl font-extrabold text-white">{stats.healthScore}</span>
                            <span className="text-lg text-gray-400 ml-1">/100</span>
                        </div>
                        <div className="mt-4">
                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                                <span>Stability</span>
                                <span>{stats.healthScore >= 80 ? 'Excellent' : stats.healthScore >= 60 ? 'Good' : stats.healthScore >= 40 ? 'Fair' : 'Poor'}</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-1.5">
                                <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${stats.healthScore}%` }}></div>
                            </div>
                        </div>
                    </div>
                    <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
                </div>

                <KpiCard 
                    title="Net Profit (All-Time)" 
                    value={`KES ${(stats.netProfit/1000000).toFixed(2)}M`} 
                    subtext="Net Cash Position" 
                    trend="up" 
                    color="text-green-600" 
                    icon="revenue" 
                />
                <KpiCard 
                    title="Accounts Receivable" 
                    value={`KES ${(stats.receivables/1000).toFixed(1)}K`} 
                    subtext={`${stats.arrearsPct}% Arrears`} 
                    trend="down" 
                    color="text-blue-600" 
                    icon="arrears" 
                />
                <KpiCard 
                    title="Accounts Payable" 
                    value={`KES ${(stats.payables/1000).toFixed(1)}K`} 
                    subtext="Pending Bills" 
                    trend="neutral" 
                    color="text-orange-500" 
                    icon="expenses" 
                />
            </div>

            {/* Main Analysis Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Cashflow Chart */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-gray-800">Cashflow Trends</h3>
                        <div className="flex gap-2">
                            <span className="flex items-center text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-green-500 mr-1"></span> Income</span>
                            <span className="flex items-center text-xs text-gray-500"><span className="w-2 h-2 rounded-full bg-red-500 mr-1"></span> Expenses</span>
                        </div>
                    </div>
                    <Chart type="line" data={cashflowData} height="h-72" />
                </div>

                {/* Liquidity & Ratios */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">Liquidity Ratio</h3>
                        <div className="relative h-48 flex items-center justify-center">
                            <Chart type="doughnut" data={receivablesPayablesData} options={{ cutout: '70%', plugins: { legend: { display: false } } }} height="h-40" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-3xl font-bold text-gray-800">{(stats.receivables / (stats.payables || 1)).toFixed(1)}x</span>
                                <span className="text-xs text-gray-500 uppercase">Coverage</span>
                            </div>
                        </div>
                        <div className="mt-4 flex justify-around text-center text-sm">
                            <div>
                                <p className="text-gray-400 text-xs uppercase font-bold">In (Due)</p>
                                <p className="font-bold text-blue-600">KES {(stats.receivables/1000).toFixed(1)}k</p>
                            </div>
                            <div>
                                <p className="text-gray-400 text-xs uppercase font-bold">Out (Due)</p>
                                <p className="font-bold text-orange-500">KES {(stats.payables/1000).toFixed(1)}k</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
                        <h3 className="text-blue-900 font-bold mb-2 flex items-center">
                            <Icon name="info" className="w-5 h-5 mr-2" /> Quick Actions
                        </h3>
                        <div className="space-y-2">
                            <button onClick={() => window.location.hash = '#/accounting/income'} className="w-full bg-white text-blue-700 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-blue-100 transition-colors">Record Income</button>
                            <button onClick={() => window.location.hash = '#/accounting/expenses'} className="w-full bg-white text-red-600 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-red-50 transition-colors">Record Expense</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Transactions Feed */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-800">Recent Transactions</h3>
                    <button onClick={() => window.location.hash = '#/accounting/reporting'} className="text-primary text-sm font-bold hover:underline">View All</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-bold text-xs uppercase">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Description</th>
                                <th className="px-6 py-3">Category</th>
                                <th className="px-6 py-3 text-right">Amount</th>
                                <th className="px-6 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {/* Mix of recent payments and bills */}
                            {tenants.flatMap(t => t.paymentHistory.map(p => ({...p, desc: `Rent: ${t.name}`, type: 'Income', date: p.date}))).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 3).map((item, i) => (
                                <tr key={`inc-${i}`} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 text-gray-600">{item.date}</td>
                                    <td className="px-6 py-3 font-medium text-gray-800">{item.desc}</td>
                                    <td className="px-6 py-3"><span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-bold">Income</span></td>
                                    <td className="px-6 py-3 text-right font-bold text-green-600">+ {item.amount}</td>
                                    <td className="px-6 py-3 text-center"><span className="text-xs font-bold text-gray-500">Completed</span></td>
                                </tr>
                            ))}
                             {bills.sort((a,b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()).slice(0, 3).map((b, i) => (
                                <tr key={`exp-${i}`} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 text-gray-600">{b.invoiceDate}</td>
                                    <td className="px-6 py-3 font-medium text-gray-800">{b.vendor}</td>
                                    <td className="px-6 py-3"><span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-bold">Expense</span></td>
                                    <td className="px-6 py-3 text-right font-bold text-red-600">- KES {b.amount.toLocaleString()}</td>
                                    <td className="px-6 py-3 text-center"><span className={`text-xs font-bold px-2 py-0.5 rounded ${b.status === 'Paid' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-800'}`}>{b.status}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Overview;
