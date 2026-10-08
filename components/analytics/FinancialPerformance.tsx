
import React, { useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { computePartialManagementInvoice, getPropertyAgencyCommission } from '../../utils/landlordPeriodFinancials';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement);

const FinancialPerformance: React.FC = () => {
    const { tenants, bills, tasks, properties, commissionRules } = useData();
    const [period, setPeriod] = useState('6 Months');

    // --- Live Data Calculations ---
    // Period → number of months to include (ending with current month)
    const periodMonths = useMemo(() => {
        switch (period) {
            case 'Per Month': return 1;
            case 'Per Quarter': {
                const now = new Date();
                return (now.getMonth() % 3) + 1; // months elapsed in current quarter
            }
            case '6 Months': return 6;
            case 'Year to Date': return new Date().getMonth() + 1;
            default: return 6;
        }
    }, [period]);

    const monthSeries = useMemo(() => {
        const now = new Date();
        const points = Array.from({ length: periodMonths }).map((_, i) => {
            const d = new Date(now.getFullYear(), now.getMonth() - (periodMonths - 1 - i), 1);
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const fullProps = properties.filter(p => (p.managementType ?? 'Full') === 'Full');
            const partialProps = properties.filter(p => p.managementType === 'Partial');

            const managementFees = tenants.reduce((acc, t) => {
                const prop = properties.find(p => p.id === t.propertyId);
                if (prop?.managementType === 'Partial') return acc;
                const { rate, fixed } = getPropertyAgencyCommission(prop, commissionRules);
                const paid = t.paymentHistory.reduce((sum, p) => {
                    if (p.status !== 'Paid' || !p.date.startsWith(ym)) return sum;
                    return sum + (parseFloat(String(p.amount).replace(/[^0-9.]/g, '')) || 0);
                }, 0);
                if (paid <= 0) return acc;
                return acc + (fixed !== null ? fixed : paid * rate);
            }, 0);
            const placementFees = tenants.reduce((acc, t) => {
                if (!t.onboardingDate || !t.onboardingDate.startsWith(ym)) return acc;
                const prop = properties.find(p => p.id === t.propertyId);
                if (prop?.managementType === 'Partial') return acc;
                const isPlacementFeeActive = prop?.placementFee !== false;
                if (!isPlacementFeeActive) return acc;
                return acc + (t.rentAmount || 0);
            }, 0);

            const partialTenants = tenants.filter(t => t.propertyId && partialProps.some(p => p.id === t.propertyId));
            const partialInv = partialProps.length > 0
                ? computePartialManagementInvoice(partialTenants, partialProps, bills, tasks, commissionRules, ym)
                : { totalAmount: 0 };

            const revenue = managementFees + placementFees + partialInv.totalAmount;
            const billExpense = bills.reduce((acc, b) => {
                const stamp = (b.invoiceDate || b.dueDate || '').slice(0, 7);
                if (b.status !== 'Paid' || stamp !== ym) return acc;
                return acc + (b.amount || 0);
            }, 0);
            const taskExpense = tasks.reduce((acc, t) => {
                if (!t.dueDate || !t.dueDate.startsWith(ym)) return acc;
                return acc + (t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0);
            }, 0);
            const label = periodMonths <= 3
                ? d.toLocaleString('default', { month: 'short', year: '2-digit' })
                : d.toLocaleString('default', { month: 'short' });
            return { label, ym, revenue, expenses: billExpense + taskExpense };
        });
        return points;
    }, [tenants, bills, tasks, properties, commissionRules, periodMonths]);


    const revenueData = useMemo(() => monthSeries.map(m => m.revenue), [monthSeries]);

    const expensesData = useMemo(() => {
        return monthSeries.map(m => m.expenses);
    }, [monthSeries]);

    const netIncomeData = revenueData.map((rev, i) => rev - expensesData[i]);

    const expenseCategories = useMemo(() => {
        const cats: Record<string, number> = {};
        const allowedMonths = new Set(monthSeries.map(m => m.ym));
        bills.forEach(b => {
            const stamp = (b.invoiceDate || b.dueDate || '').slice(0, 7);
            if (b.status === 'Paid' && allowedMonths.has(stamp)) {
                cats[b.category] = (cats[b.category] || 0) + (b.amount || 0);
            }
        });
        return cats;
    }, [bills, monthSeries]);

    // --- Chart Configs ---
    const cashFlowChart = {
        labels: monthSeries.map(m => m.label),
        datasets: [
            { label: 'Revenue', data: revenueData, backgroundColor: '#10b981' },
            { label: 'Expenses', data: expensesData, backgroundColor: '#ef4444' }
        ]
    };

    const profitTrendChart = {
        labels: monthSeries.map(m => m.label),
        datasets: [{
            label: 'Net Profit',
            data: netIncomeData,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4
        }]
    };

    const expenseLabels = Object.keys(expenseCategories);
    const expenseValues = Object.values(expenseCategories);
    const expenseDoughnut = {
        labels: expenseLabels.length ? expenseLabels : ['No paid bills'],
        datasets: [{
            data: expenseValues.length ? expenseValues : [1],
            backgroundColor: ['#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6', '#10b981'],
            borderWidth: 0
        }]
    };

    const last = revenueData.length - 1;
    let previousRevenue = last > 0 ? (revenueData[last - 1] || 0) : 0;
    let previousExpense = last > 0 ? (expensesData[last - 1] || 0) : 0;
    const currentRevenue = revenueData[last] || 0;
    const currentExpense = expensesData[last] || 0;
    
    // If we only have 1 month, we need to explicitly compute last month to get a valid delta
    if (last === 0) {
        const dPrev = new Date();
        dPrev.setMonth(dPrev.getMonth() - 1);
        const ymPrev = `${dPrev.getFullYear()}-${String(dPrev.getMonth() + 1).padStart(2, '0')}`;
        
        let prevRev = 0;
        let prevExp = 0;
        
        const fullProps = properties.filter(p => (p.managementType ?? 'Full') === 'Full');
        const partialProps = properties.filter(p => p.managementType === 'Partial');
        
        const mgmtFees = tenants.reduce((acc, t) => {
            const prop = properties.find(p => p.id === t.propertyId);
            if (prop?.managementType === 'Partial') return acc;
            const { rate, fixed } = getPropertyAgencyCommission(prop, commissionRules);
            const paid = t.paymentHistory.reduce((sum, p) => {
                if (p.status !== 'Paid' || !p.date.startsWith(ymPrev)) return sum;
                return sum + (parseFloat(String(p.amount).replace(/[^0-9.]/g, '')) || 0);
            }, 0);
            if (paid <= 0) return acc;
            return acc + (fixed !== null ? fixed : paid * rate);
        }, 0);
        
        const placeFees = tenants.reduce((acc, t) => {
            if (!t.onboardingDate || !t.onboardingDate.startsWith(ymPrev)) return acc;
            const prop = properties.find(p => p.id === t.propertyId);
            if (prop?.managementType === 'Partial') return acc;
            const isPlacementFeeActive = prop?.placementFee !== false;
            if (!isPlacementFeeActive) return acc;
            return acc + (t.rentAmount || 0);
        }, 0);
        
        const partialTenants = tenants.filter(t => t.propertyId && partialProps.some(p => p.id === t.propertyId));
        const partialInv = partialProps.length > 0
            ? computePartialManagementInvoice(partialTenants, partialProps, bills, tasks, commissionRules, ymPrev)
            : { totalAmount: 0 };
            
        prevRev = mgmtFees + placeFees + partialInv.totalAmount;
        
        prevExp = bills.reduce((acc, b) => {
            const stamp = (b.invoiceDate || b.dueDate || '').slice(0, 7);
            if (b.status !== 'Paid' || stamp !== ymPrev) return acc;
            return acc + (b.amount || 0);
        }, 0) + tasks.reduce((acc, t) => {
            if (!t.dueDate || !t.dueDate.startsWith(ymPrev)) return acc;
            return acc + (t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0);
        }, 0);
        
        previousRevenue = prevRev;
        previousExpense = prevExp;
    }
    
    const revenueDelta = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;
    const expenseDelta = previousExpense > 0 ? ((currentExpense - previousExpense) / previousExpense) * 100 : 0;
    const periodRevenueTotal = revenueData.reduce((s, v) => s + v, 0);
    const periodExpenseTotal = expensesData.reduce((s, v) => s + v, 0);
    const periodNetTotal = periodRevenueTotal - periodExpenseTotal;
    // Keep arrears ratio meaningful in agency context by comparing overdue rent fee-equivalent.
    const overdueRent = tenants
        .filter(t => t.status === 'Overdue')
        .reduce((s, t) => {
            const prop = properties.find(p => p.id === t.propertyId);
            const { rate, fixed } = getPropertyAgencyCommission(prop, commissionRules);
            const base = t.rentAmount || 0;
            return s + (fixed !== null ? fixed : base * rate);
        }, 0);
    const arrearsRatio = periodRevenueTotal > 0 ? (overdueRent / periodRevenueTotal) * 100 : 0;

    const propertyRows = useMemo(() => {
        const allowedMonths = monthSeries.map(m => m.ym);
        return properties.map(p => {
            const propTenants = tenants.filter(t => t.propertyId === p.id);
            const isPartial = p.managementType === 'Partial';
            let revenue = 0;
            
            allowedMonths.forEach(ym => {
                if (isPartial) {
                    // Partial: agency income = current-month invoice total charged to landlord
                    const inv = computePartialManagementInvoice(propTenants, [p], bills, tasks, commissionRules, ym);
                    revenue += inv.totalAmount;
                } else {
                    // Full: agency income = per-property commission % on collected rent + placement fee
                    const { rate, fixed } = getPropertyAgencyCommission(p, commissionRules);
                    const managementFees = propTenants.reduce((sum, t) => {
                        const paid = t.paymentHistory.reduce((s, pay) => {
                            if (pay.status !== 'Paid' || !pay.date.startsWith(ym)) return s;
                            return s + (parseFloat(String(pay.amount).replace(/[^0-9.]/g, '')) || 0);
                        }, 0);
                        if (paid <= 0) return sum;
                        return sum + (fixed !== null ? fixed : paid * rate);
                    }, 0);
                    const placementFees = propTenants.reduce((sum, t) => {
                        if (!p.placementFee && p.placementFee !== undefined) return sum;
                        if (!t.onboardingDate || !t.onboardingDate.startsWith(ym)) return sum;
                        return sum + (t.rentAmount || 0);
                    }, 0);
                    revenue += (managementFees + placementFees);
                }
            });
            
            const expenses = bills
                .filter(b => b.propertyId === p.id && b.status === 'Paid')
                .reduce((sum, b) => {
                    const stamp = (b.invoiceDate || b.dueDate || '').slice(0, 7);
                    if (allowedMonths.includes(stamp)) return sum + (b.amount || 0);
                    return sum;
                }, 0);
                
            const noi = revenue - expenses;
            const margin = revenue > 0 ? Math.round((noi / revenue) * 100) : 0;
            return { id: p.id, name: p.name, revenue, expenses, noi, margin, isPartial };
        }).sort((a, b) => b.noi - a.noi);
    }, [properties, tenants, bills, tasks, commissionRules, monthSeries]);

    return (
        <div className="space-y-8 pb-10">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Financial Performance</h1>
                    <p className="text-lg text-gray-500 mt-1">Deep dive into revenue, expenses, and profitability metrics.</p>
                </div>
                <select 
                    value={period} 
                    onChange={e => setPeriod(e.target.value)}
                    className="p-2 border rounded-lg bg-white shadow-sm text-sm font-bold"
                >
                    <option>Per Month</option>
                    <option>Per Quarter</option>
                    <option>6 Months</option>
                    <option>Year to Date</option>
                </select>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Gross Revenue ({period})</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">KES {(periodRevenueTotal/1000).toFixed(1)}k</p>
                    <p className={`text-xs mt-1 font-bold ${revenueDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>{revenueDelta >= 0 ? '▲' : '▼'} {Math.abs(revenueDelta).toFixed(1)}% vs prior month</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-red-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Total Expenses ({period})</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">KES {(periodExpenseTotal/1000).toFixed(1)}k</p>
                    <p className={`text-xs mt-1 font-bold ${expenseDelta <= 0 ? 'text-green-600' : 'text-red-600'}`}>{expenseDelta >= 0 ? '▲' : '▼'} {Math.abs(expenseDelta).toFixed(1)}% vs prior month</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Net Operating Income</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">KES {(periodNetTotal/1000).toFixed(1)}k</p>
                    <p className="text-xs text-blue-600 mt-1 font-bold">{period}</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-purple-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Arrears Ratio</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{arrearsRatio.toFixed(1)}%</p>
                    <p className="text-xs text-gray-500 mt-1">Acceptable Range</p>
                </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Cash Flow (In vs Out)</h3>
                    <div className="h-64">
                        <Bar data={cashFlowChart} options={{ responsive: true, maintainAspectRatio: false }} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Net Profit Trend</h3>
                    <div className="h-64">
                        <Line data={profitTrendChart} options={{ responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Expense Analysis</h3>
                    <div className="h-64 flex justify-center">
                        <Doughnut data={expenseDoughnut} options={{ cutout: '60%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }} />
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-800">Property Profitability Matrix</h3>
                        <button className="text-primary text-xs font-bold hover:underline">Export CSV</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                                <tr>
                                    <th className="px-4 py-3">Property</th>
                                    <th className="px-4 py-3 text-right">Revenue</th>
                                    <th className="px-4 py-3 text-right">Expenses</th>
                                    <th className="px-4 py-3 text-right">NOI</th>
                                    <th className="px-4 py-3 text-right">Margin</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {propertyRows.map((row) => (
                                    <tr key={row.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-800">{row.name}</td>
                                        <td className="px-4 py-3 text-right text-green-600">KES {row.revenue.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right text-red-500">KES {row.expenses.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-bold text-blue-700">KES {row.noi.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-right font-bold">{row.margin}%</td>
                                    </tr>
                                ))}
                                {propertyRows.length === 0 && (
                                    <tr><td colSpan={5} className="p-6 text-center text-gray-400">No property performance data yet.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FinancialPerformance;
