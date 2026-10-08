
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useData } from '../../context/DataContext';
import { Task, TaskStatus } from '../../types';
import { exportToCSV } from '../../utils/exportHelper';
import { fmtDate } from '../../utils/date';
import Icon from '../Icon';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

// --- Chart Helper ---
const Chart: React.FC<{ type: 'doughnut'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
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

const KpiCard: React.FC<{ title: string; value: number; onClick: () => void; isActive: boolean }> = ({ title, value, onClick, isActive }) => (
    <button onClick={onClick} className={`block w-full text-left p-4 rounded-xl shadow-sm transition-all duration-200 border ${isActive ? 'bg-primary text-white border-primary shadow-lg transform scale-105' : 'bg-white border-gray-200 hover:shadow-md hover:border-primary/50'}`}>
        <p className={`font-bold text-xs uppercase ${isActive ? 'text-white/80' : 'text-gray-500'}`}>{title}</p>
        <p className={`text-3xl font-extrabold mt-1 ${isActive ? 'text-white' : 'text-gray-800'}`}>{value}</p>
    </button>
);

const TaskAndOperationsReports: React.FC = () => {
    const { tasks } = useData();
    const [filter, setFilter] = useState<TaskStatus | 'All'>('All');
    
    // Deep Linking Logic
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('?')) {
            const params = new URLSearchParams(hash.split('?')[1]);
            const status = params.get('status');
            
            if (status && (Object.values(TaskStatus).includes(status as TaskStatus) || status === 'All')) {
                setFilter(status as TaskStatus | 'All');
            }
        }
    }, []);

    const taskCounts = useMemo(() => {
        const counts = { All: tasks.length } as Record<TaskStatus | 'All', number>;
        for (const status of Object.values(TaskStatus)) {
            counts[status] = tasks.filter(t => t.status === status).length;
        }
        return counts;
    }, [tasks]);

    const filteredTasks = useMemo(() => {
        if (filter === 'All') return tasks;
        return tasks.filter(task => task.status === filter);
    }, [filter, tasks]);

    const priorityDistribution = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredTasks.forEach(t => counts[t.priority] = (counts[t.priority] || 0) + 1);
        return {
            labels: Object.keys(counts),
            datasets: [{
                data: Object.values(counts),
                backgroundColor: ['#ef4444', '#f97316', '#3b82f6', '#10b981'],
                borderWidth: 0
            }]
        };
    }, [filteredTasks]);

    const handleExport = () => {
        const exportData = filteredTasks.map(t => ({
            ID: t.id,
            Title: t.title,
            Description: t.description,
            Property: t.property,
            Tenant: t.tenant.name,
            AssignedTo: t.assignedTo,
            Status: t.status,
            Priority: t.priority,
            DueDate: t.dueDate
        }));
        exportToCSV(exportData, `TaskReport_${filter}`);
    };

    return (
        <div className="space-y-8 pb-10">
            <button onClick={() => window.location.hash = '#/reports-analytics/reports'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-4">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Reports Center
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Task & Operations Reports</h1>
                    <p className="text-lg text-gray-500 mt-1">Operational efficiency analysis and task tracking.</p>
                </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <KpiCard title="Total" value={taskCounts.All} onClick={() => setFilter('All')} isActive={filter === 'All'} />
                {Object.values(TaskStatus).map(status => (
                    <KpiCard key={status} title={status} value={taskCounts[status] || 0} onClick={() => setFilter(status)} isActive={filter === status} />
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Chart */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4">Priority Distribution ({filter})</h3>
                    <div className="flex justify-center h-64">
                         <Chart type="doughnut" data={priorityDistribution} options={{ cutout: '70%', plugins: { legend: { position: 'bottom' } } }} />
                    </div>
                </div>

                {/* Table */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-gray-800">Task List</h2>
                        <button onClick={handleExport} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-semibold rounded hover:bg-gray-200 flex items-center">
                            <Icon name="download" className="w-4 h-4 mr-2"/> Export List
                        </button>
                    </div>
                    <div className="overflow-x-auto h-[350px]">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Task ID</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
                                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Priority</th>
                                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {filteredTasks.map(task => (
                                    <tr key={task.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{task.id}</td>
                                        <td className="px-4 py-3 font-medium text-gray-900">{task.title}</td>
                                        <td className="px-4 py-3 text-gray-600">{task.assignedTo || 'Unassigned'}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                                                task.priority === 'High' ? 'bg-orange-100 text-orange-800' : 
                                                task.priority === 'Very High' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                {task.priority}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-full bg-blue-50 text-blue-800`}>{task.status}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-500 font-mono text-xs">{fmtDate(task.dueDate)}</td>
                                    </tr>
                                ))}
                                {filteredTasks.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No tasks found with status "{filter}".</td>
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

export default TaskAndOperationsReports;
