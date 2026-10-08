
import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { PreventiveTask } from '../../types';
import Icon from '../Icon';

const ScheduleTaskModal: React.FC<{ onClose: () => void; onSave: (task: Partial<PreventiveTask>) => void; }> = ({ onClose, onSave }) => {
    const [title, setTitle] = useState('');
    const [asset, setAsset] = useState('');
    const [frequency, setFrequency] = useState<'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly'>('Monthly');
    const [nextDate, setNextDate] = useState('');

    const handleSubmit = () => {
        if (!title || !asset || !nextDate) return alert("All fields required");
        onSave({ title, asset, frequency, nextDueDate: nextDate });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1500] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800">Schedule Maintenance</h2>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Task Title</label>
                        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Generator Service" className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Asset / Location</label>
                        <input value={asset} onChange={e => setAsset(e.target.value)} placeholder="e.g. Block A Generator" className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Frequency</label>
                            <select value={frequency} onChange={e => setFrequency(e.target.value as any)} className="w-full p-3 border rounded-lg bg-white">
                                <option>Weekly</option>
                                <option>Monthly</option>
                                <option>Quarterly</option>
                                <option>Yearly</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Next Due Date</label>
                            <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} className="w-full p-3 border rounded-lg" />
                        </div>
                    </div>
                </div>
                <div className="mt-8 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg text-gray-700 font-bold hover:bg-gray-200">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2 bg-primary text-white rounded-lg font-bold hover:bg-primary-dark shadow-md">Save Schedule</button>
                </div>
            </div>
        </div>
    );
};

const PreventiveMaintenance: React.FC = () => {
    const { preventiveTasks, addPreventiveTask, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreate = isSuperAdmin || checkPermission('Maintenance', 'create');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleSave = (taskData: Partial<PreventiveTask>) => {
        if (!canCreate) return alert('You do not have permission to schedule preventive tasks.');
        addPreventiveTask({ ...taskData, id: `prev-${Date.now()}` } as PreventiveTask);
        setIsModalOpen(false);
    };

    const getDaysDue = (dateStr: string) => {
        const diff = new Date(dateStr).getTime() - new Date().getTime();
        return Math.ceil(diff / (1000 * 3600 * 24));
    };

    const sortedTasks = [...preventiveTasks].sort((a,b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/field-operations/maintenance'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Maintenance
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Preventive Maintenance</h1>
                    <p className="text-lg text-gray-500 mt-1">Scheduled upkeep to minimize downtime and extend asset life.</p>
                </div>
                {canCreate && <button
                    onClick={() => setIsModalOpen(true)}
                    className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-md flex items-center transition-transform hover:-translate-y-1"
                >
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Schedule Task
                </button>}
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-700">Upcoming Schedule</h3>
                    <span className="text-xs font-bold bg-white px-2 py-1 rounded border text-gray-500">{preventiveTasks.length} Active Schedules</span>
                </div>
                
                <div className="divide-y divide-gray-100">
                    {sortedTasks.map(task => {
                        const days = getDaysDue(task.nextDueDate);
                        const isDue = days <= 5;
                        const isOverdue = days < 0;

                        return (
                            <div key={task.id} className="p-5 hover:bg-blue-50/30 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-start gap-4">
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm ${isOverdue ? 'bg-red-100 text-red-600' : isDue ? 'bg-yellow-100 text-yellow-600' : 'bg-blue-50 text-blue-600'}`}>
                                        {days < 0 ? '!' : days}
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-800">{task.title}</h4>
                                        <p className="text-sm text-gray-500 flex items-center mt-1">
                                            <Icon name="branch" className="w-3 h-3 mr-1" /> {task.asset}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className="text-xs font-bold text-gray-400 uppercase">Frequency</p>
                                        <p className="text-sm font-semibold text-gray-700">{task.frequency}</p>
                                    </div>
                                    <div className="text-right w-24">
                                        <p className="text-xs font-bold text-gray-400 uppercase">Status</p>
                                        <p className={`text-sm font-bold ${isOverdue ? 'text-red-600' : isDue ? 'text-yellow-600' : 'text-green-600'}`}>
                                            {isOverdue ? 'Overdue' : isDue ? 'Due Soon' : 'On Track'}
                                        </p>
                                    </div>
                                    <button 
                                        className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm"
                                        onClick={() => alert(`Triggering work order for ${task.title}`)}
                                    >
                                        Start Now
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {sortedTasks.length === 0 && (
                        <div className="p-12 text-center text-gray-400">
                            No preventive tasks scheduled. Add one to get started.
                        </div>
                    )}
                </div>
            </div>

            {isModalOpen && <ScheduleTaskModal onClose={() => setIsModalOpen(false)} onSave={handleSave} />}
        </div>
    );
};

export default PreventiveMaintenance;
