
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { Task, TaskStatus, TaskPriority } from '@/types';
import { getCurrentMonthIso } from '../../utils/timezone';

// Helper Chart Component
const Chart: React.FC<{ type: 'line' | 'bar' | 'doughnut'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
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

const KpiCard: React.FC<{ title: string; value: string | number; change?: string; isPositive?: boolean; icon: string; color: string; subtext?: string }> = ({ title, value, change, isPositive, icon, color, subtext }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 hover:shadow-md transition-shadow" style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <h3 className="text-2xl font-extrabold text-gray-800 mt-1">{value}</h3>
            </div>
            <div className={`p-2 rounded-full bg-opacity-10`} style={{ backgroundColor: `${color}20`, color: color }}>
                <Icon name={icon} className="w-6 h-6" />
            </div>
        </div>
        {change && (
            <p className={`text-xs font-semibold mt-2 flex items-center ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {isPositive ? '▲' : '▼'} {change} <span className="text-gray-400 font-normal ml-1">vs last period</span>
            </p>
        )}
        {subtext && <p className="text-xs text-gray-400 mt-2">{subtext}</p>}
    </div>
);

const OperationsReporting: React.FC = () => {
    const { tasks, staff } = useData();
    const [period, setPeriod] = useState('Last 30 Days');
    const currentYm = getCurrentMonthIso();

    const completedMtdForStaff = (name: string) =>
        tasks.filter(
            (t) =>
                t.assignedTo === name &&
                (t.status === TaskStatus.Completed || t.status === TaskStatus.Closed) &&
                (String(t.dueDate).startsWith(currentYm) ||
                    (t.history || []).some(
                        (h) => String(h.timestamp).slice(0, 7) === currentYm && /completed|closed/i.test(h.event)
                    ))
        ).length;

    // --- Metrics Calculation ---
    const metrics = useMemo(() => {
        const total = tasks.length;
        const completed = tasks.filter(t => t.status === TaskStatus.Completed || t.status === TaskStatus.Closed).length;
        const escalated = tasks.filter(t => t.status === TaskStatus.Escalated || t.priority === TaskPriority.VeryHigh).length;
        const overdue = tasks.filter(t => new Date(t.dueDate) < new Date() && t.status !== TaskStatus.Completed).length;

        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const efficiencyScore = Math.max(0, 100 - (escalated * 5) - (overdue * 2)); // Mock score logic based on penalties

        return {
            total,
            completed,
            escalated,
            overdue,
            completionRate,
            efficiencyScore
        };
    }, [tasks]);

    // --- Chart Data ---
    const statusData = {
        labels: ['Completed', 'In Progress', 'Pending', 'Escalated'],
        datasets: [{
            data: [
                metrics.completed,
                tasks.filter(t => t.status === TaskStatus.InProgress).length,
                tasks.filter(t => t.status === TaskStatus.Pending || t.status === TaskStatus.Issued).length,
                metrics.escalated
            ],
            backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'],
            borderWidth: 0
        }]
    };

    const workloadData = {
        labels: staff.slice(0, 5).map(s => s.name.split(' ')[0]),
        datasets: [
            {
                label: 'Active Tasks',
                data: staff.slice(0, 5).map(s => tasks.filter(t => t.assignedTo === s.name && t.status !== 'Completed').length),
                backgroundColor: '#3b82f6',
                borderRadius: 4
            },
            {
                label: 'Completed (MTD)',
                data: staff.slice(0, 5).map((s) => completedMtdForStaff(s.name)),
                backgroundColor: '#cbd5e1',
                borderRadius: 4
            }
        ]
    };

    return (
        <div className="space-y-8 pb-10">
            <button onClick={() => window.location.hash = '#/partial-rms/general-operations/task-management'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Operations
            </button>
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Operations Intelligence</h1>
                    <p className="text-lg text-gray-500 mt-1">Real-time pulse on field efficiency and task resolution.</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    {['Last 7 Days', 'Last 30 Days', 'This Year'].map(p => (
                        <button 
                            key={p} 
                            onClick={() => setPeriod(p)}
                            className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${period === p ? 'bg-white text-primary shadow' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard 
                    title="Ops Health Score" 
                    value={`${metrics.efficiencyScore}/100`} 
                    change="+2.4" 
                    isPositive={true} 
                    icon="analytics" 
                    color="#8b5cf6" 
                />
                <KpiCard 
                    title="Task Completion" 
                    value={`${metrics.completionRate}%`} 
                    change="+5%" 
                    isPositive={true} 
                    icon="check" 
                    color="#10b981" 
                />
                <KpiCard 
                    title="Active Workload" 
                    value={metrics.total - metrics.completed} 
                    subtext={`${metrics.overdue} Overdue`} 
                    change="-3" 
                    isPositive={true} 
                    icon="task-in-progress" 
                    color="#3b82f6" 
                />
                <KpiCard 
                    title="Critical Escalations" 
                    value={metrics.escalated} 
                    change="+1" 
                    isPositive={false} 
                    icon="task-escalated" 
                    color="#ef4444" 
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Status Chart */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Task Status Distribution</h3>
                    <div className="h-64 flex justify-center">
                        <Chart type="doughnut" data={statusData} options={{ cutout: '70%', plugins: { legend: { position: 'bottom' } } }} />
                    </div>
                </div>

                {/* Workload Chart */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Staff Workload Analysis</h3>
                    <Chart type="bar" data={workloadData} options={{ scales: { y: { beginAtZero: true } } }} />
                </div>
            </div>

            {/* AI Insights & Detailed Table */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 text-white p-6 rounded-xl shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <Icon name="reits" className="w-24 h-24 text-white" />
                    </div>
                    <h3 className="text-xl font-bold mb-4 flex items-center">
                        <Icon name="branch" className="w-5 h-5 mr-2 text-yellow-400" />
                        Predictive Insights
                    </h3>
                    <div className="space-y-4 text-sm text-gray-300">
                        <div className="bg-white/10 p-3 rounded-lg border border-white/10">
                            <p className="font-bold text-white mb-1">High Volume Alert</p>
                            <p>Plumbing requests are trending up 15% this week. Consider stocking spare parts.</p>
                        </div>
                        <div className="bg-white/10 p-3 rounded-lg border border-white/10">
                            <p className="font-bold text-white mb-1">Performance Tip</p>
                            <p>Agent Ann closes tasks 20% faster than average. Assign critical tasks to her.</p>
                        </div>
                         <div className="bg-white/10 p-3 rounded-lg border border-white/10">
                            <p className="font-bold text-white mb-1">Maintenance Forecast</p>
                            <p>Based on lease expiries, painting requests will spike in 2 weeks.</p>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-800">Critical Task Watchlist</h3>
                        <button className="text-xs font-bold text-primary hover:underline">View All</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-6 py-3">Task</th>
                                    <th className="px-6 py-3">Priority</th>
                                    <th className="px-6 py-3">Assignee</th>
                                    <th className="px-6 py-3 text-right">Age</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {tasks.filter(t => t.priority === TaskPriority.High || t.priority === TaskPriority.VeryHigh).slice(0, 5).map(t => (
                                    <tr key={t.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-3 font-medium text-gray-800">{t.title}</td>
                                        <td className="px-6 py-3">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${t.priority === 'Very High' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {t.priority}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3 text-gray-600">{t.assignedTo}</td>
                                        <td className="px-6 py-3 text-right text-gray-500 font-mono">
                                            {Math.floor((new Date().getTime() - new Date(t.history[0]?.timestamp || t.dueDate).getTime()) / (1000 * 3600 * 24))} days
                                        </td>
                                    </tr>
                                ))}
                                {tasks.filter(t => t.priority === TaskPriority.High || t.priority === TaskPriority.VeryHigh).length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-6 text-center text-gray-400 italic">No critical tasks pending.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OperationsReporting;
