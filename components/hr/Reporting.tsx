
import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';

// --- Chart helper (uses Chart.js loaded via CDN in index.html) ---
const Chart: React.FC<{ type: 'bar' | 'doughnut' | 'line'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
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
                    ...options,
                },
            });
        }
        return () => chartRef.current?.destroy();
    }, [type, data, options]);

    return <div className={`relative ${height}`}><canvas ref={canvasRef}></canvas></div>;
};

// --- KPI Card ---
const KpiCard: React.FC<{ title: string; value: string; sub: string; icon: string; color: string }> = ({ title, value, sub, icon, color }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all">
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">{title}</p>
                <p className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-1">{sub}</p>
            </div>
            <div className="p-2 rounded-lg bg-gray-50">
                <Icon name={icon} className={`w-6 h-6 ${color}`} />
            </div>
        </div>
    </div>
);

const HRReporting: React.FC = () => {
    const { staff, tasks, commissionRules, deductionRules, properties } = useData();
    const [period, setPeriod] = useState<'All Time' | 'This Month' | 'This Quarter'>('This Month');

    // --- Core metrics from real data ---
    const metrics = useMemo(() => {
        const active = staff.filter(s => s.status === 'Active');
        const inactive = staff.filter(s => s.status !== 'Active');

        const totalPayroll = active.reduce((sum, s) => sum + (s.salaryConfig?.amount || 0), 0);
        const avgSalary = active.length > 0 ? Math.round(totalPayroll / active.length) : 0;

        // Commission earned: sum commissions array on each staff member
        const totalCommissions = staff.reduce((sum, s) => {
            const c = (s as any).commissions;
            if (!Array.isArray(c)) return sum;
            return sum + c.reduce((cs: number, rule: any) => cs + (Number(rule.amount) || 0), 0);
        }, 0);

        // Leave balances
        const avgLeave = active.length > 0
            ? Math.round(active.reduce((sum, s) => sum + ((s as any).leaveBalance?.annual || 0), 0) / active.length)
            : 0;

        // Staff by role
        const byRole: Record<string, number> = {};
        staff.forEach(s => { byRole[s.role] = (byRole[s.role] || 0) + 1; });

        // Staff by branch
        const byBranch: Record<string, number> = {};
        staff.forEach(s => {
            const b = s.branch || 'Unassigned';
            byBranch[b] = (byBranch[b] || 0) + 1;
        });

        // Salary type split
        const fixed = staff.filter(s => (s.salaryConfig as any)?.type === 'Fixed').length;
        const targetBased = staff.filter(s => (s.salaryConfig as any)?.type === 'Target Based').length;

        // Task performance per staff member
        const staffNames = staff.map(s => s.name);
        const staffTasks = tasks.filter(t => staffNames.includes(t.assignedTo || ''));
        const completedTasks = staffTasks.filter(t => t.status === 'Completed' || t.status === 'Closed').length;
        const taskCompletion = staffTasks.length > 0 ? Math.round((completedTasks / staffTasks.length) * 100) : 0;

        return {
            totalStaff: staff.length,
            activeCount: active.length,
            inactiveCount: inactive.length,
            totalPayroll,
            avgSalary,
            totalCommissions,
            avgLeave,
            byRole,
            byBranch,
            fixed,
            targetBased,
            taskCompletion,
            completedTasks,
            totalTasks: staffTasks.length,
        };
    }, [staff, tasks]);

    // --- Per-staff performance table (top 10 by task completion) ---
    const staffPerformance = useMemo(() => {
        return staff.map(s => {
            const myTasks = tasks.filter(t => t.assignedTo === s.name);
            const done = myTasks.filter(t => t.status === 'Completed' || t.status === 'Closed').length;
            const rate = myTasks.length > 0 ? Math.round((done / myTasks.length) * 100) : 0;
            const commissionTotal = Array.isArray((s as any).commissions)
                ? (s as any).commissions.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0)
                : 0;
            return {
                id: s.id,
                name: s.name,
                role: s.role,
                branch: s.branch || '—',
                status: s.status,
                salary: s.salaryConfig?.amount || 0,
                salaryType: (s.salaryConfig as any)?.type || '—',
                tasksTotal: myTasks.length,
                tasksDone: done,
                taskRate: rate,
                commissionTotal,
            };
        }).sort((a, b) => b.taskRate - a.taskRate).slice(0, 15);
    }, [staff, tasks]);

    // --- Chart Data ---
    const roleChartData = {
        labels: Object.keys(metrics.byRole),
        datasets: [{
            label: 'Staff Count',
            data: Object.values(metrics.byRole),
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'],
            borderRadius: 4,
            barPercentage: 0.6,
        }],
    };

    const salaryTypeData = {
        labels: ['Fixed Salary', 'Target Based'],
        datasets: [{
            data: [metrics.fixed, metrics.targetBased],
            backgroundColor: ['#6366f1', '#f59e0b'],
            borderWidth: 0,
        }],
    };

    const branchChartData = {
        labels: Object.keys(metrics.byBranch),
        datasets: [{
            label: 'Staff',
            data: Object.values(metrics.byBranch),
            backgroundColor: '#3b82f6',
            borderRadius: 4,
            barPercentage: 0.5,
        }],
    };

    const payrollByRole = useMemo(() => {
        const byRole: Record<string, number> = {};
        staff.forEach(s => {
            byRole[s.role] = (byRole[s.role] || 0) + (s.salaryConfig?.amount || 0);
        });
        return byRole;
    }, [staff]);

    const payrollChartData = {
        labels: Object.keys(payrollByRole),
        datasets: [{
            label: 'Monthly Payroll (KES)',
            data: Object.values(payrollByRole),
            backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'],
            borderWidth: 0,
        }],
    };

    const statusColors: Record<string, string> = {
        Active: 'bg-green-100 text-green-700',
        Inactive: 'bg-gray-100 text-gray-500',
        Suspended: 'bg-red-100 text-red-600',
    };

    return (
        <div className="space-y-8 pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                <div>
                    <button
                        onClick={() => window.location.hash = '#/hr-payroll/staff-management'}
                        className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-3"
                    >
                        <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Staff Management
                    </button>
                    <h1 className="text-3xl font-bold text-gray-800">HR & Payroll Analytics</h1>
                    <p className="text-lg text-gray-500 mt-1">Live workforce insights from Supabase — {staff.length} staff members.</p>
                </div>
                <select
                    value={period}
                    onChange={e => setPeriod(e.target.value as any)}
                    className="bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm font-bold text-gray-700 shadow-sm outline-none"
                >
                    <option>This Month</option>
                    <option>This Quarter</option>
                    <option>All Time</option>
                </select>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <KpiCard
                    title="Total Staff"
                    value={metrics.totalStaff.toString()}
                    sub={`${metrics.activeCount} active · ${metrics.inactiveCount} inactive`}
                    icon="hr"
                    color="text-blue-600"
                />
                <KpiCard
                    title="Monthly Payroll"
                    value={`KES ${(metrics.totalPayroll / 1000).toFixed(1)}K`}
                    sub={`Avg KES ${metrics.avgSalary.toLocaleString()}/mo`}
                    icon="revenue"
                    color="text-green-600"
                />
                <KpiCard
                    title="Commissions Earned"
                    value={`KES ${(metrics.totalCommissions / 1000).toFixed(1)}K`}
                    sub={`Across ${staff.length} staff`}
                    icon="commission"
                    color="text-purple-600"
                />
                <KpiCard
                    title="Task Completion"
                    value={`${metrics.taskCompletion}%`}
                    sub={`${metrics.completedTasks} of ${metrics.totalTasks} tasks done`}
                    icon="task-completed"
                    color="text-orange-500"
                />
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Staff by Role */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-base font-bold text-gray-800 mb-4">Staff by Role</h3>
                    {Object.keys(metrics.byRole).length > 0 ? (
                        <Chart
                            type="bar"
                            data={roleChartData}
                            options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }}
                            height="h-56"
                        />
                    ) : (
                        <div className="h-56 flex items-center justify-center text-gray-400 text-sm">No staff data yet.</div>
                    )}
                </div>

                {/* Salary Type Split */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-base font-bold text-gray-800 mb-4">Salary Type Split</h3>
                    {(metrics.fixed + metrics.targetBased) > 0 ? (
                        <>
                            <Chart
                                type="doughnut"
                                data={salaryTypeData}
                                options={{ cutout: '65%', plugins: { legend: { position: 'bottom' } } }}
                                height="h-44"
                            />
                            <div className="mt-3 flex justify-around text-xs text-center text-gray-600">
                                <div>
                                    <p className="font-bold text-indigo-600 text-lg">{metrics.fixed}</p>
                                    <p>Fixed</p>
                                </div>
                                <div>
                                    <p className="font-bold text-yellow-500 text-lg">{metrics.targetBased}</p>
                                    <p>Target Based</p>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="h-44 flex items-center justify-center text-gray-400 text-sm">No staff data yet.</div>
                    )}
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Payroll by Role */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-base font-bold text-gray-800 mb-4">Monthly Payroll by Role (KES)</h3>
                    {Object.keys(payrollByRole).length > 0 ? (
                        <Chart
                            type="doughnut"
                            data={payrollChartData}
                            options={{ cutout: '55%' }}
                            height="h-56"
                        />
                    ) : (
                        <div className="h-56 flex items-center justify-center text-gray-400 text-sm">No payroll data yet.</div>
                    )}
                </div>

                {/* Staff by Branch */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-base font-bold text-gray-800 mb-4">Staff by Branch</h3>
                    {Object.keys(metrics.byBranch).length > 0 ? (
                        <Chart
                            type="bar"
                            data={branchChartData}
                            options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }}
                            height="h-56"
                        />
                    ) : (
                        <div className="h-56 flex items-center justify-center text-gray-400 text-sm">No branch data yet.</div>
                    )}
                </div>
            </div>

            {/* Staff Performance Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <div>
                        <h3 className="text-base font-bold text-gray-800">Staff Performance Overview</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Ranked by task completion rate — live data from Supabase</p>
                    </div>
                    <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-200">
                        {staff.length} members
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3">Role</th>
                                <th className="px-4 py-3">Branch</th>
                                <th className="px-4 py-3">Salary Type</th>
                                <th className="px-4 py-3 text-right">Monthly (KES)</th>
                                <th className="px-4 py-3 text-right">Commission (KES)</th>
                                <th className="px-4 py-3 text-center">Tasks</th>
                                <th className="px-4 py-3 text-center">Completion</th>
                                <th className="px-4 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {staffPerformance.map(s => (
                                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 font-semibold text-gray-800">{s.name}</td>
                                    <td className="px-4 py-3 text-gray-600 text-xs">{s.role}</td>
                                    <td className="px-4 py-3 text-gray-500 text-xs">{s.branch}</td>
                                    <td className="px-4 py-3 text-xs">
                                        <span className={`px-2 py-0.5 rounded font-bold ${s.salaryType === 'Fixed' ? 'bg-indigo-100 text-indigo-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {s.salaryType}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-gray-800">{s.salary.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-purple-700 font-bold">{s.commissionTotal.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-center text-gray-600">{s.tasksDone}/{s.tasksTotal}</td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                                <div
                                                    className={`h-1.5 rounded-full ${s.taskRate >= 80 ? 'bg-green-500' : s.taskRate >= 50 ? 'bg-yellow-500' : 'bg-red-400'}`}
                                                    style={{ width: `${s.taskRate}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-bold text-gray-600 w-8">{s.taskRate}%</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${statusColors[s.status] || 'bg-gray-100 text-gray-500'}`}>
                                            {s.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {staffPerformance.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                                        No staff records found. Add staff via Registration → Users.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer summary */}
                {staff.length > 0 && (
                    <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-6 text-xs text-gray-500">
                        <span>Total Headcount: <strong className="text-gray-700">{metrics.totalStaff}</strong></span>
                        <span>Active: <strong className="text-green-700">{metrics.activeCount}</strong></span>
                        <span>Monthly Payroll: <strong className="text-gray-700">KES {metrics.totalPayroll.toLocaleString()}</strong></span>
                        <span>Commissions: <strong className="text-purple-700">KES {metrics.totalCommissions.toLocaleString()}</strong></span>
                        <span className="ml-auto">Avg Leave Balance: <strong className="text-gray-700">{metrics.avgLeave} days</strong></span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default HRReporting;
