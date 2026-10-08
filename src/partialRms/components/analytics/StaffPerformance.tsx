
import React, { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';

const StaffPerformance: React.FC = () => {
    const { staff, tasks } = useData();

    // Live calculations
    const leaderboard = useMemo(() => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return staff.map(s => {
            const mine = tasks.filter(t => t.assignedTo === s.name);
            const completed = mine.filter(t => t.status === 'Completed' || t.status === 'Closed').length;
            const completedThisMonth = mine.filter(t => {
                if (!(t.status === 'Completed' || t.status === 'Closed') || !t.dueDate) return false;
                const d = new Date(t.dueDate);
                return !isNaN(d.getTime()) && d >= monthStart;
            }).length;
            const highPriorityDone = mine.filter(t => (t.priority === 'High' || t.priority === 'Very High') && (t.status === 'Completed' || t.status === 'Closed')).length;
            const points = completedThisMonth * 12 + highPriorityDone * 5 + completed;
            return { ...s, completedTasks: completed, points };
        }).sort((a,b) => b.points - a.points);
    }, [staff, tasks]);

    const teamVelocity = useMemo(() => {
        const closed = tasks.filter(t => t.status === 'Completed' || t.status === 'Closed');
        const avgSla = closed.length ? closed.reduce((s, t) => s + (t.sla || 0), 0) / closed.length : 0;
        const responseHours = closed.length ? Math.max(1, Math.round((avgSla || 8) * 4)) : 0;
        const leaseTasks = tasks.filter(t => /lease/i.test(`${t.title} ${t.description}`));
        const leaseSla = leaseTasks.length ? leaseTasks.reduce((s, t) => s + (t.sla || 0), 0) / leaseTasks.length : 0;
        return {
            taskResolutionDays: avgSla.toFixed(1),
            leaseProcessingDays: leaseSla ? leaseSla.toFixed(1) : '0.0',
            responseHours
        };
    }, [tasks]);

    return (
        <div className="space-y-8 pb-10">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Staff Performance</h1>
                <p className="text-lg text-gray-500 mt-1">Gamified leaderboards and productivity tracking.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Leaderboard - Main Feature */}
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b bg-gradient-to-r from-indigo-900 to-blue-800 text-white flex justify-between items-center">
                        <h3 className="text-xl font-bold">Agent Leaderboard</h3>
                        <Icon name="hr" className="w-6 h-6 opacity-80" />
                    </div>
                    <div className="p-2">
                        {leaderboard.map((s, index) => (
                            <div key={s.id} className={`flex items-center p-4 rounded-lg mb-2 ${index === 0 ? 'bg-yellow-50 border border-yellow-200' : 'hover:bg-gray-50'}`}>
                                <div className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center font-bold text-lg mr-4 ${
                                    index === 0 ? 'bg-yellow-400 text-yellow-900' : 
                                    index === 1 ? 'bg-gray-300 text-gray-800' : 
                                    index === 2 ? 'bg-orange-300 text-orange-900' : 'bg-gray-100 text-gray-500'
                                }`}>
                                    {index + 1}
                                </div>
                                <div className="flex-grow">
                                    <h4 className="font-bold text-gray-800">{s.name}</h4>
                                    <p className="text-xs text-gray-500">{s.role} • {s.branch}</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-extrabold text-lg text-indigo-600">{s.points} XP</p>
                                    <p className="text-xs text-gray-400">{s.completedTasks} Tasks</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Side Stats */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 text-center">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
                            <Icon name="check" className="w-10 h-10" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800">Top Performer</h3>
                        <p className="text-primary font-bold text-xl mt-1">{leaderboard[0]?.name}</p>
                        <p className="text-sm text-gray-500 mt-2">Highest completion rate this month.</p>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-800 mb-4">Team Velocity</h3>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span>Task Resolution</span>
                                    <span className="font-bold">{teamVelocity.taskResolutionDays} Days</span>
                                </div>
                                <div className="w-full bg-gray-100 h-2 rounded-full"><div className="bg-blue-500 h-2 rounded-full" style={{width: `${Math.min(100, Math.max(5, 100 - Number(teamVelocity.taskResolutionDays) * 10))}%`}}></div></div>
                            </div>
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span>Lease Processing</span>
                                    <span className="font-bold">{teamVelocity.leaseProcessingDays} Days</span>
                                </div>
                                <div className="w-full bg-gray-100 h-2 rounded-full"><div className="bg-green-500 h-2 rounded-full" style={{width: `${Math.min(100, Math.max(5, 100 - Number(teamVelocity.leaseProcessingDays) * 12))}%`}}></div></div>
                            </div>
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span>Response Time</span>
                                    <span className="font-bold">{teamVelocity.responseHours} Hrs</span>
                                </div>
                                <div className="w-full bg-gray-100 h-2 rounded-full"><div className="bg-purple-500 h-2 rounded-full" style={{width: `${Math.min(100, Math.max(5, 100 - teamVelocity.responseHours * 3))}%`}}></div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StaffPerformance;
