
import React, { useMemo } from 'react';
import { useData } from '../../context/DataContext';

const Performance: React.FC = () => {
    const { staff, tasks } = useData();

    const performanceData = useMemo(() => {
        return staff.map(s => {
            const myTasks = tasks.filter(t => t.assignedTo === s.name);
            const completed = myTasks.filter(t => t.status === 'Completed' || t.status === 'Closed').length;
            const total = myTasks.length;
            const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
            
            // Calculate commissions earned
            const totalCommission = (s.commissions || []).reduce((acc, c) => acc + c.amount, 0);

            return {
                ...s,
                taskStats: { completed, total, rate },
                totalCommission
            };
        });
    }, [staff, tasks]);

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/hr-payroll/staff-management'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Staff Management
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Performance Management</h1>
                <p className="text-lg text-gray-500 mt-1">Track team productivity and results.</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead className="bg-gray-50 uppercase text-gray-500 font-bold text-xs">
                            <tr>
                                <th className="px-4 py-3">Staff Member</th>
                                <th className="px-4 py-3">Role</th>
                                <th className="px-4 py-3 text-center">Tasks Completed</th>
                                <th className="px-4 py-3 text-center">Completion Rate</th>
                                <th className="px-4 py-3 text-right">Commissions Earned</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {performanceData.map(p => (
                                <tr key={p.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-800">{p.name}</td>
                                    <td className="px-4 py-3 text-gray-600">{p.role}</td>
                                    <td className="px-4 py-3 text-center">{p.taskStats.completed} / {p.taskStats.total}</td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500" style={{ width: `${p.taskStats.rate}%` }}></div>
                                            </div>
                                            <span className="text-xs font-bold">{p.taskStats.rate}%</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">KES {p.totalCommission.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Performance;
