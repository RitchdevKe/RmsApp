// @ts-nocheck

import React, { useState, useMemo } from 'react';
import * as LucideIcons from 'lucide-react';

import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { Task, TaskPriority, TaskStatus } from '../../types';
import AdBanners from './AdBanners';
import ReferralFliers from './ReferralFliers';
import ReferralCalculator from './ReferralCalculator';
import ReferTenantModal from './ReferTenantModal';
import PortalShell from './PortalShell';
import { usePortalGrowthActions } from './PortalGrowthModals';
import { useStandardWalletCards } from './walletCards';
import { useProfileFirstName } from '../../hooks/useProfileFirstName';
import { getTodayIsoDate } from '../../utils/timezone';

const CaretakerPortal: React.FC = () => {
    const { tasks, staff, addTask, updateTask, currentUser, isDataLoading } = useData();
    const [isReferModalOpen, setIsReferModalOpen] = useState(false);
    const [reportDescription, setReportDescription] = useState('');
    const [activeTab, setActiveTab] = useState<'Tasks' | 'Report' | 'Utility'>('Tasks');

    const caretaker = useMemo(() => {
        if (currentUser && currentUser.role === 'Caretaker') return currentUser;
        return staff.find(s => s.role === 'Caretaker') || staff[0];
    }, [currentUser, staff]);
    const caretakerName = (caretaker as any)?.name as string | undefined;
    const { firstName } = useProfileFirstName({ nameFallback: caretakerName });

    const myTasks = useMemo(() => {
        if (!caretakerName) return [];
        return tasks
            .filter(t => t.assignedTo === caretakerName && t.status !== 'Closed')
            .sort((a, b) => (b.priority === 'High' ? 1 : -1));
    }, [tasks, caretakerName]);

    const openTasks = myTasks.filter(t => t.status !== 'Completed');
    const highPriority = myTasks.filter(t => t.priority === 'High' || t.priority === 'Very High').length;
    const completedTotal = useMemo(
        () => (!caretakerName ? 0 : tasks.filter(t => t.assignedTo === caretakerName && t.status === 'Completed').length),
        [tasks, caretakerName]
    );
    const completedToday = useMemo(() => {
        const today = getTodayIsoDate();
        if (!caretakerName) return 0;
        return tasks.filter(t => {
            if (t.assignedTo !== caretakerName || t.status !== 'Completed') return false;
            const stamp = t.history?.[t.history.length - 1]?.timestamp || '';
            return String(stamp).includes(today.slice(5));
        }).length;
    }, [tasks, caretakerName]);

    const growth = usePortalGrowthActions();
    const walletTrio = useStandardWalletCards(growth);

    const handleReportIssue = (e: React.FormEvent) => {
        e.preventDefault();
        if (!reportDescription) return;
        const newTask: Task = {
            id: `TASK-${Date.now()}`,
            title: 'Issue Reported by Caretaker',
            description: reportDescription,
            status: TaskStatus.Issued,
            priority: TaskPriority.Medium,
            dueDate: new Date(Date.now() + 86400000).toISOString(),
            sla: 24,
            assignedTo: 'Unassigned',
            tenant: { name: 'N/A', unit: 'Common Area' },
            property: (caretaker as any)?.branch || 'General',
            comments: [],
            history: [{ id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: 'Reported by Caretaker' }],
            attachments: [],
            source: 'Internal',
            costs: { labor: 0, materials: 0, travel: 0 }
        };
        addTask(newTask);
        alert('Issue reported successfully.');
        setReportDescription('');
        setActiveTab('Tasks');
    };

    const handleMarkComplete = (task: Task) => {
        updateTask(task.id, {
            status: TaskStatus.Completed,
            history: [...(task.history || []), { id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: 'Completed by Caretaker' }]
        });
    };

    if (!caretakerName) {
        return <div className="p-8 text-center">{isDataLoading ? 'Loading caretaker portal...' : 'Profile loading or not found...'}</div>;
    }

    return (
        <div className="space-y-3 pb-16">
            <PortalShell
                cards={[
                    {
                        label: 'Open Tasks',
                        value: openTasks.length.toString(),
                        sublabel: `${highPriority} high priority`,
                        iconNode: <LucideIcons.ClipboardList className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-primary via-primary to-primary-dark',
                        trend: openTasks.length > 0 ? 'In queue' : 'All clear',
                        trendTone: openTasks.length > 0 ? 'down' : 'up',
                        onClick: () => setActiveTab('Tasks'),
                    },
                    {
                        label: 'Done Today',
                        value: completedToday.toString(),
                        sublabel: `${completedTotal} all-time`,
                        iconNode: <LucideIcons.CheckCircle2 className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-emerald-600 via-emerald-700 to-emerald-800',
                        trend: completedToday > 0 ? `+${completedToday}` : '—',
                        trendTone: completedToday > 0 ? 'up' : 'neutral',
                    },
                    {
                        label: 'Property',
                        value: ((caretaker as any)?.branch || 'Assigned'),
                        sublabel: 'Your active site',
                        iconNode: <LucideIcons.Building className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-slate-900 via-slate-800 to-slate-700',
                    },
                    ...walletTrio,
                ]}
                actions={[
                    { label: 'My Tasks',     iconNode: <LucideIcons.ListChecks className="w-full h-full" strokeWidth={1.8} />, onClick: () => setActiveTab('Tasks'), badge: openTasks.length || undefined },
                    { label: 'Report Issue', iconNode: <LucideIcons.AlertTriangle className="w-full h-full" strokeWidth={1.8} />, onClick: () => setActiveTab('Report') },
                    { label: 'Utility Log',  iconNode: <LucideIcons.Gauge className="w-full h-full" strokeWidth={1.8} />, onClick: () => setActiveTab('Utility') },
                    { label: 'Refer Tenant', iconNode: <LucideIcons.UserPlus className="w-full h-full" strokeWidth={1.8} />, onClick: () => setIsReferModalOpen(true) },
                    ...growth.actions,
                ]}
                metrics={[
                    { label: 'Open',       value: openTasks.length.toString(), tone: 'text-blue-600' },
                    { label: 'High Pri',   value: highPriority.toString(),     tone: 'text-rose-600' },
                    { label: 'Done Today', value: completedToday.toString(),   tone: 'text-emerald-600' },
                    { label: 'All-time',   value: completedTotal.toString(),   tone: 'text-amber-600' },
                ]}
            />
            {growth.modals}

            {/* Tab strip */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-1.5 flex gap-1.5 overflow-x-auto">
                {(['Tasks', 'Report', 'Utility'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 min-w-[100px] px-4 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                            activeTab === tab ? 'bg-gradient-to-br from-primary to-primary-dark text-white shadow' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        {tab === 'Tasks' && 'My Tasks'}
                        {tab === 'Report' && 'Report Issue'}
                        {tab === 'Utility' && 'Utility Log'}
                    </button>
                ))}
            </div>

            {activeTab === 'Tasks' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <LucideIcons.ListChecks className="w-5 h-5 text-primary" />
                        Assignments ({myTasks.length})
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-1">
                        {myTasks.map(task => (
                            <div key={task.id} className="group p-4 bg-gradient-to-br from-white to-gray-50 rounded-2xl border border-gray-100 hover:shadow-md hover:border-primary/30 transition-all">
                                <div className="flex justify-between items-center mb-2">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                        task.priority === 'High' || task.priority === 'Very High'
                                            ? 'bg-rose-100 text-rose-700'
                                            : task.priority === 'Medium'
                                                ? 'bg-amber-100 text-amber-700'
                                                : 'bg-sky-100 text-sky-700'
                                    }`}>{task.priority}</span>
                                    <span className="text-[11px] text-gray-400 font-medium truncate ml-2">{task.property}</span>
                                </div>
                                <p className="font-bold text-gray-800 text-sm mb-1 line-clamp-1">{task.title}</p>
                                <p className="text-xs text-gray-600 mb-3 line-clamp-2">{task.description}</p>
                                {task.status !== 'Completed' ? (
                                    <button
                                        onClick={() => handleMarkComplete(task)}
                                        className="w-full py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-bold rounded-xl hover:shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                                    >
                                        <LucideIcons.Check className="w-3.5 h-3.5" /> Mark Done
                                    </button>
                                ) : (
                                    <div className="text-center text-xs font-bold text-emerald-700 bg-emerald-50 py-2 rounded-xl flex items-center justify-center gap-1.5">
                                        <LucideIcons.CheckCircle2 className="w-3.5 h-3.5" /> Completed
                                    </div>
                                )}
                            </div>
                        ))}
                        {myTasks.length === 0 && (
                            <div className="col-span-full text-center text-gray-400 py-12">
                                <LucideIcons.Sparkles className="w-10 h-10 mx-auto mb-3 text-emerald-300" />
                                <p className="font-semibold">All caught up — great job!</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'Report' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <LucideIcons.AlertTriangle className="w-5 h-5 text-amber-500" />
                        Report an Issue
                    </h3>
                    <form onSubmit={handleReportIssue} className="space-y-3">
                        <textarea
                            value={reportDescription}
                            onChange={e => setReportDescription(e.target.value)}
                            placeholder="Describe the issue (e.g. Broken light in corridor, water leak in unit B4)..."
                            rows={5}
                            className="w-full p-4 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none text-sm transition-all"
                            required
                        />
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                            <button type="button" className="p-2 bg-gray-50 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors">
                                <LucideIcons.Camera className="w-4 h-4" />
                            </button>
                            <span>Attach a photo (optional)</span>
                        </div>
                        <button type="submit" className="w-full py-3 bg-gradient-to-r from-primary to-primary-dark text-white font-bold rounded-2xl shadow hover:shadow-lg active:scale-[0.99] transition-all flex items-center justify-center gap-2">
                            <LucideIcons.Send className="w-4 h-4" /> Submit Report
                        </button>
                    </form>
                </div>
            )}

            {activeTab === 'Utility' && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <LucideIcons.Gauge className="w-5 h-5 text-sky-500" />
                        Log Utility Reading
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input placeholder="Unit Number" className="p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
                        <select className="p-3 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none">
                            <option>Water</option>
                            <option>Electricity</option>
                            <option>Gas</option>
                        </select>
                        <input type="number" placeholder="Current Reading" className="p-3 border border-gray-200 rounded-xl text-sm sm:col-span-2 focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none" />
                        <button className="sm:col-span-2 py-3 bg-gradient-to-r from-sky-500 to-sky-600 text-white font-bold rounded-xl text-sm shadow hover:shadow-lg active:scale-[0.99] transition-all flex items-center justify-center gap-2">
                            <LucideIcons.Save className="w-4 h-4" /> Save Reading
                        </button>
                    </div>
                </div>
            )}

            <ReferralFliers />
            <ReferralCalculator />

            <AdBanners section="listings" />

            {isReferModalOpen && (
                <ReferTenantModal
                    referrerId={String((caretaker as any)?.id ?? '')}
                    referralCode={(caretaker as any)?.referralCode || `${String((caretaker as any)?.name ?? 'CTK').split(' ')[0].toUpperCase().slice(0, 4)}${String((caretaker as any)?.id ?? '').slice(-4).toUpperCase()}`}
                    onClose={() => setIsReferModalOpen(false)}
                />
            )}
        </div>
    );
};

export default CaretakerPortal;
