
import React, { useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { ComposeModal } from './Messages';

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

const CommunicationOverview: React.FC = () => {
    const { messages, addMessage, templates, automationRules } = useData();
    const [isComposeOpen, setIsComposeOpen] = useState(false);

    // Stats Calculation
    const stats = useMemo(() => {
        const total = messages.length;
        const inbound = messages.filter(m => m.isIncoming).length;
        const outbound = messages.filter(m => !m.isIncoming).length;
        // Mock success rate
        const successRate = 98; 

        return { total, inbound, outbound, successRate };
    }, [messages]);

    const activeRules = automationRules.filter(r => r.enabled).length;

    const handleSendMessage = (to: string, content: string, channel: string, isGroup = false, count = 1) => {
        const newMessage = {
            id: `msg-${Date.now()}`,
            recipient: { name: to, contact: isGroup ? `${count} Recipients` : to },
            content,
            channel: channel as any,
            status: 'Sent',
            timestamp: new Date().toLocaleString(),
            priority: 'Normal',
            isIncoming: false
        };
        // @ts-ignore
        addMessage(newMessage);
        setIsComposeOpen(false);
        alert(`Message sent via ${channel} to ${isGroup ? count + ' recipients' : to}`);
    };

    const modules = [
        { title: "Inbound Messages", icon: "mail", description: "View incoming inquiries and replies.", link: "#/operations/communications/inbound", color: "#3b82f6" },
        { title: "Outbound Messages", icon: "communication", description: "Track sent messages and broadcasts.", link: "#/general-operations/communications/outbound", color: "#10b981" },
        { title: "Templates", icon: "stack", description: "Manage reusable message templates.", link: "#/general-operations/communications/templates", color: "#f59e0b" },
        { title: "Automation", icon: "settings", description: "Configure auto-replies and triggers.", link: "#/general-operations/communications/automation", color: "#8b5cf6" },
    ];

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Communication Center</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage all interactions with tenants, landlords, and staff.</p>
                </div>
                <button 
                    onClick={() => setIsComposeOpen(true)}
                    className="bg-primary text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-primary-dark transition-transform active:scale-95 flex items-center"
                >
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Compose New
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total Messages" value={stats.total} subtext="All time history" color="#6366f1" icon="communication" />
                <StatCard title="Inbound (Inbox)" value={stats.inbound} subtext="Received messages" color="#f59e0b" icon="mail" />
                <StatCard title="Outbound (Sent)" value={stats.outbound} subtext="Sent messages" color="#10b981" icon="communication" />
                <StatCard title="Active Automations" value={activeRules} subtext={`${automationRules.length} Total Rules`} color="#8b5cf6" icon="settings" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {modules.map((mod) => (
                    <NavCard key={mod.title} {...mod} />
                ))}
            </div>

            {isComposeOpen && <ComposeModal onClose={() => setIsComposeOpen(false)} onSend={handleSendMessage} />}
        </div>
    );
};

export default CommunicationOverview;
