
import React, { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { TaskStatus, TaskPriority } from '../../types';

const NavCard: React.FC<{ title: string; icon: string; description: string; link: string; color: string }> = ({ title, icon, description, link, color }) => (
    <div 
        onClick={() => window.location.hash = link}
        className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group flex flex-col items-center text-center hover:border-primary/50"
    >
        <div className={`p-4 rounded-full bg-opacity-10 mb-4 transition-transform group-hover:scale-110`} style={{ backgroundColor: `${color}15`, color: color }}>
            <Icon name={icon} className="w-8 h-8" />
        </div>
        <h3 className="font-bold text-gray-800 mb-2">{title}</h3>
        <p className="text-xs text-gray-500">{description}</p>
    </div>
);

const StatCard: React.FC<{ title: string; value: string | number; subtext: string; color: string; icon: string }> = ({ title, value, subtext, color, icon }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4`} style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <p className="text-2xl font-extrabold text-gray-800 mt-1">{value}</p>
                <p className="text-xs text-gray-400 mt-1">{subtext}</p>
            </div>
            <div className={`p-2 rounded-full bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

const OperationsOverview: React.FC = () => {
    const { tasks, workflows, automationRules, escalationRules } = useData();

    // Stats Calculation
    const stats = useMemo(() => {
        const totalTasks = tasks.length;
        const pending = tasks.filter(t => t.status === TaskStatus.Pending || t.status === TaskStatus.Issued || t.status === TaskStatus.Received).length;
        const escalated = tasks.filter(t => t.status === TaskStatus.Escalated || t.priority === TaskPriority.VeryHigh).length;
        const completed = tasks.filter(t => t.status === TaskStatus.Completed || t.status === TaskStatus.Closed).length;
        
        // Mock efficiency calculation
        const efficiency = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

        return { totalTasks, pending, escalated, efficiency };
    }, [tasks]);

    const activeWorkflows = workflows.length; 
    const activeRules = automationRules.filter(r => r.enabled).length;

    const modules = [
        { title: "Task Board", icon: "task-request", description: "Manage daily tasks via Kanban board.", link: "#/operations/board", color: "#3b82f6" },
        { title: "Workflows", icon: "branch", description: "Design operational process flows.", link: "#/operations/workflows", color: "#8b5cf6" },
        { title: "Automation", icon: "settings", description: "Configure automated triggers and actions.", link: "#/operations/automation", color: "#10b981" },
        { title: "Escalation Rules", icon: "task-escalated", description: "Set priority rules for overdue items.", link: "#/operations/escalation-rules", color: "#ef4444" },
        { title: "Audit Trail", icon: "shield", description: "View system logs and user activity.", link: "#/operations/audit-trail", color: "#64748b" },
        { title: "Reporting", icon: "analytics", description: "Operational performance metrics.", link: "#/operations/reporting", color: "#f59e0b" },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Operations Hub</h1>
                <p className="text-lg text-gray-500 mt-1">Central control for tasks, automation, and system logic.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Pending Tasks" value={stats.pending} subtext="Requires Attention" color="#f59e0b" icon="pending-task" />
                <StatCard title="Escalations" value={stats.escalated} subtext="High Priority" color="#ef4444" icon="task-escalated" />
                <StatCard title="Active Automations" value={activeRules} subtext="Running Rules" color="#10b981" icon="settings" />
                <StatCard title="Efficiency Score" value={`${stats.efficiency}%`} subtext="Task Completion Rate" color="#3b82f6" icon="analytics" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {modules.map((mod) => (
                    <NavCard key={mod.title} {...mod} />
                ))}
            </div>
        </div>
    );
};

export default OperationsOverview;
