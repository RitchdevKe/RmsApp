
import React, { useRef, useEffect, useMemo } from 'react';
import { PaymentKpi, Invoice, Bill, RenovationProjectBill, TenantProfile } from '../../types';
import { useData } from '../../context/DataContext';
import { parsePaymentAmount, sumPaidPaymentsForMonth } from '../../utils/paymentReporting';

// --- Card Styles ---
const MAJOR_CARD_CLASSES = "relative bg-white rounded-2xl border-t-[8px] border-t-primary border-b-[4px] border-b-secondary border-x-[3px] border-x-secondary shadow-[inset_0_0_60px_-15px_rgba(162,53,74,0.15)] hover:shadow-lg transition-all duration-300 overflow-hidden";

function monthBounds(year: number, month: number) {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return { start, end };
}

function formatKesCompact(n: number): string {
    const v = Math.max(0, n);
    if (v >= 1_000_000) return `KES ${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `KES ${(v / 1_000).toFixed(1)}k`.replace('.0k', 'k');
    return `KES ${v.toLocaleString()}`;
}

function pctVsPrev(cur: number, prev: number): { change: string; changeType: 'increase' | 'decrease' } {
    if (prev <= 0 && cur <= 0) return { change: '0%', changeType: 'increase' };
    if (prev <= 0) return { change: 'New', changeType: 'increase' };
    const p = ((cur - prev) / prev) * 100;
    const abs = Math.abs(p).toFixed(1);
    return { change: `${abs}%`, changeType: p >= 0 ? 'increase' : 'decrease' };
}

function sumCollectionsInMonth(tenants: TenantProfile[], year: number, month: number): number {
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return tenants.reduce((sum, tenant) => sum + sumPaidPaymentsForMonth(tenant, monthPrefix), 0);
}

function sumPaidExpensesInMonth(bills: Bill[], invoices: Invoice[], renovationProjectBills: RenovationProjectBill[], year: number, month: number): number {
    const { start, end } = monthBounds(year, month);
    let s = 0;
    (bills || []).forEach(b => {
        if (b.status !== 'Paid') return;
        const raw = b.invoiceDate || b.dueDate;
        if (!raw) return;
        const d = new Date(raw);
        if (isNaN(d.getTime()) || d < start || d > end) return;
        s += b.amount || 0;
    });
    (invoices || []).forEach(inv => {
        if (inv.category !== 'Outbound' || inv.status !== 'Paid') return;
        const d = new Date(inv.dueDate);
        if (isNaN(d.getTime()) || d < start || d > end) return;
        s += inv.amount || 0;
    });
    (renovationProjectBills || []).forEach(rb => {
        if (rb.status !== 'Paid') return;
        const d = new Date(rb.date);
        if (isNaN(d.getTime()) || d < start || d > end) return;
        s += rb.amount || 0;
    });
    return s;
}

const KpiCard: React.FC<{ stat: PaymentKpi; href: string }> = ({ stat, href }) => (
    <a href={href} className={`${MAJOR_CARD_CLASSES} p-4 block`}>
        <div className="relative z-10">
            <p className="text-gray-500 font-medium text-sm">{stat.title}</p>
            <p className="text-3xl font-bold text-gray-800 my-1">{stat.value}</p>
            {stat.change !== undefined && stat.changeType !== undefined && (
                <div className="flex items-center text-xs">
                    <span className={`font-semibold ${stat.changeType === 'increase' ? 'text-green-600' : 'text-red-600'}`}>
                        {stat.changeType === 'increase' ? '▲' : '▼'} {stat.change}
                    </span>
                    <span className="text-gray-400 ml-1">vs last month</span>
                </div>
            )}
        </div>
    </a>
);

const Chart: React.FC<{ type: 'line' | 'bar' | 'pie' | 'doughnut'; data: any; options?: any; }> = ({ type, data, options }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<any>(null);

    useEffect(() => {
        if (!canvasRef.current || !(window as any).Chart) return;

        if (chartRef.current) {
            chartRef.current.destroy();
        }

        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            chartRef.current = new (window as any).Chart(ctx, {
                type,
                data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                    },
                    ...options
                },
            });
        }

        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
            }
        };
    }, [type, data, options]);

    return <div className="relative h-80"><canvas ref={canvasRef}></canvas></div>;
};

const PaymentsOverview: React.FC = () => {
    const { tenants, bills, invoices, renovationProjectBills, currentUser, roles } = useData();

    const canView = (widgetId: string) => {
        if (!currentUser) return false;
        if ((currentUser as any).role === 'Super Admin') return true;
        const roleDef = roles.find(r => r.name === (currentUser as any).role);
        if (!roleDef) return false;
        return (roleDef.widgetAccess || []).includes(widgetId);
    };

    // --- Live Calculations ---
    const kpis = useMemo((): PaymentKpi[] => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const prevMonth = m === 0 ? 11 : m - 1;
        const prevYear = m === 0 ? y - 1 : y;

        let totalCollected = 0;
        tenants.forEach(t => {
            totalCollected += (t.paymentHistory || []).reduce((sum, p) => {
                if (p.status !== 'Paid') return sum;
                return sum + parsePaymentAmount(p.amount);
            }, 0);
        });

        const colCur = sumCollectionsInMonth(tenants, y, m);
        const colPrev = sumCollectionsInMonth(tenants, prevYear, prevMonth);
        const colMom = pctVsPrev(colCur, colPrev);

        const unpaidInvoices = (invoices || []).filter(i => i.status !== 'Paid');
        const outstandingCount = unpaidInvoices.length;
        const unpaidDueCur = unpaidInvoices.filter(i => {
            const d = new Date(i.dueDate);
            return !isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m;
        }).length;
        const unpaidDuePrev = unpaidInvoices.filter(i => {
            const d = new Date(i.dueDate);
            return !isNaN(d.getTime()) && d.getFullYear() === prevYear && d.getMonth() === prevMonth;
        }).length;
        const outMom = pctVsPrev(unpaidDueCur, unpaidDuePrev);

        const invoiceOverdueSum = (invoices || []).filter(i => i.status === 'Overdue').reduce((s, i) => s + (i.amount || 0), 0);
        const tenantOverdueSum = tenants.filter(t => t.status === 'Overdue').reduce((s, t) => s + (t.rentAmount || 0), 0);
        const overdueAmount = invoiceOverdueSum > 0 ? invoiceOverdueSum : tenantOverdueSum;

        const overdueInvCur = (invoices || []).filter(i => {
            if (i.status !== 'Overdue') return false;
            const d = new Date(i.dueDate);
            return !isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === m;
        }).reduce((s, i) => s + (i.amount || 0), 0);
        const overdueInvPrev = (invoices || []).filter(i => {
            if (i.status !== 'Overdue') return false;
            const d = new Date(i.dueDate);
            return !isNaN(d.getTime()) && d.getFullYear() === prevYear && d.getMonth() === prevMonth;
        }).reduce((s, i) => s + (i.amount || 0), 0);
        const ovrMom = pctVsPrev(overdueInvCur, overdueInvPrev);

        const expCur = sumPaidExpensesInMonth(bills || [], invoices || [], renovationProjectBills || [], y, m);
        const expPrev = sumPaidExpensesInMonth(bills || [], invoices || [], renovationProjectBills || [], prevYear, prevMonth);
        const expMom = pctVsPrev(expCur, expPrev);

        return [
            {
                title: 'Collected (Total)',
                value: formatKesCompact(totalCollected),
                ...colMom,
            },
            {
                title: 'Outstanding Invoices',
                value: String(outstandingCount),
                ...outMom,
            },
            {
                title: 'Overdue Amount',
                value: `KES ${Number(overdueAmount ?? 0).toLocaleString()}`,
                ...ovrMom,
            },
            {
                title: 'Total Expenses (MTD)',
                value: `KES ${Number(expCur).toLocaleString()}`,
                ...expMom,
            },
        ];
    }, [tenants, bills, invoices, renovationProjectBills]);

    const recentTransactions = useMemo(() => {
        const allPayments = tenants.flatMap(t =>
            (t.paymentHistory || []).map(p => ({
                id: `${t.id}-${p.reference}`,
                date: p.date,
                tenantName: t.name,
                amount: parsePaymentAmount(p.amount),
                method: p.method,
                status: p.status,
                reference: p.reference
            }))
        );
        return allPayments
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);
    }, [tenants]);

    const incomeExpenseChartData = useMemo(() => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentYear = new Date().getFullYear();
        const incomeData = new Array(12).fill(0);
        const expenseData = new Array(12).fill(0);
        tenants.forEach(t => {
            (t.paymentHistory || []).forEach(p => {
                const d = new Date(p.date);
                if (d.getFullYear() === currentYear && p.status === 'Paid') {
                    incomeData[d.getMonth()] += parsePaymentAmount(p.amount);
                }
            });
        });
        (bills || []).forEach((b: any) => {
            const d = new Date(b.invoiceDate || b.dueDate || 0);
            if (d.getFullYear() === currentYear && b.status === 'Paid') {
                expenseData[d.getMonth()] += b.amount || 0;
            }
        });
        const idx = new Date().getMonth();
        const start = Math.max(0, idx - 5);
        return {
            labels: months.slice(start, idx + 1),
            datasets: [
                { label: 'Income', data: incomeData.slice(start, idx + 1), borderColor: '#10b981' },
                { label: 'Expense', data: expenseData.slice(start, idx + 1), borderColor: '#ef4444' }
            ]
        };
    }, [tenants, bills]);

    const paymentMethodsChartData = useMemo(() => {
        const methods: Record<string, number> = { 'M-Pesa': 0, Bank: 0, Cash: 0 };
        tenants.forEach(t => {
            (t.paymentHistory || []).filter(p => p.status === 'Paid').forEach(p => {
                const m = (p.method || '').toLowerCase();
                if (m.includes('mpesa') || m.includes('m-pesa')) methods['M-Pesa']++;
                else if (m.includes('bank') || m.includes('transfer')) methods.Bank++;
                else methods.Cash++;
            });
        });
        return {
            labels: ['M-Pesa', 'Bank', 'Cash'],
            datasets: [{ data: [methods['M-Pesa'], methods.Bank, methods.Cash], backgroundColor: ['#10b981', '#3b82f6', '#9ca3af'] }]
        };
    }, [tenants]);

    const kpiLinks: Record<string, string> = {
        'Collected (Total)': '#/payments/inbound',
        'Outstanding Invoices': '#/payments/invoices',
        'Overdue Amount': '#/payments/invoices',
        'Total Expenses (MTD)': '#/payments/outbound'
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Payments Overview</h1>
                <p className="text-lg text-gray-500 mt-1">A real-time snapshot of your organization's financial health.</p>
            </div>

            {/* KPI Cards */}
            {canView('pay_kpi') && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {kpis.map((stat: any) => <KpiCard key={stat.title} stat={stat} href={kpiLinks[stat.title] || '#/payments/overview'} />)}
            </div>}

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                {canView('pay_income_chart') && <div className={`lg:col-span-3 ${MAJOR_CARD_CLASSES} p-6`}>
                    <div className="relative z-10">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Income vs. Expenses (Last 6 Months)</h3>
                        <Chart type="line" data={incomeExpenseChartData} />
                    </div>
                </div>}
                {canView('pay_methods_chart') && <div className={`lg:col-span-2 ${MAJOR_CARD_CLASSES} p-6`}>
                    <div className="relative z-10">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Payment Methods</h3>
                        <Chart type="doughnut" data={paymentMethodsChartData} />
                    </div>
                </div>}
            </div>

             {/* Recent Transactions */}
            {canView('pay_recent') && <div className={`${MAJOR_CARD_CLASSES} p-6`}>
                <div className="relative z-10">
                    <h3 className="text-xl font-semibold text-gray-800 mb-4">Recent Inbound Transactions</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount (KES)</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {recentTransactions.map(log => (
                                    <tr key={log.id}>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{log.date}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-800">{log.tenantName}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-800 font-semibold">{Number(log.amount ?? 0).toLocaleString()}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{log.method}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm">
                                            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">{log.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>}
        </div>
    );
};

export default PaymentsOverview;
