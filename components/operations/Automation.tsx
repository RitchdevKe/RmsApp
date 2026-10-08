
import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { CommunicationAutomationRule } from '../../types';
import Icon from '../Icon';

// --- Extended Type for UI ---
interface EnhancedRule extends CommunicationAutomationRule {
    category?: 'Communication' | 'Finance' | 'Operations';
    executions?: number;
    lastRun?: string;
    description?: string;
}

const CreateRuleModal: React.FC<{ onClose: () => void; onSave: (rule: Partial<CommunicationAutomationRule>) => void; }> = ({ onClose, onSave }) => {
    const [name, setName] = useState('');
    const [trigger, setTrigger] = useState('Rent Due');
    const [template, setTemplate] = useState('Rent Reminder');
    const [channels, setChannels] = useState<string[]>(['SMS']);
    const [category, setCategory] = useState('Communication');

    const handleChannelToggle = (channel: string) => {
        setChannels(prev => prev.includes(channel) ? prev.filter(c => c !== channel) : [...prev, channel]);
    };

    const handleSubmit = () => {
        if (!name) return alert("Rule Name required");
        if (channels.length === 0) return alert("Select at least one channel");
        onSave({ name, trigger, templateName: template, channels, enabled: true });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1500] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 animate-fade-in">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <h2 className="text-xl font-bold text-gray-800">Configure Automation</h2>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                </div>

                <div className="space-y-5">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Rule Name</label>
                        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Monthly Rent Reminder" className="w-full p-2.5 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Trigger Event</label>
                            <select value={trigger} onChange={e => setTrigger(e.target.value)} className="w-full p-2.5 border rounded-lg bg-white">
                                <option value="Rent Due">Rent Due (5th)</option>
                                <option value="Payment Received">Payment Received</option>
                                <option value="Lease Expiring">Lease Expiring (60d)</option>
                                <option value="New Tenant">New Tenant Added</option>
                                <option value="Task Completed">Task Completed</option>
                                <option value="Rent Overdue > 1 Day">Rent Overdue &gt; 1 Day</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Action Type</label>
                            <select value={template} onChange={e => setTemplate(e.target.value)} className="w-full p-2.5 border rounded-lg bg-white">
                                <option value="Rent Reminder">Send Rent Reminder</option>
                                <option value="Payment Receipt">Send Receipt</option>
                                <option value="Welcome Message">Send Welcome Pack</option>
                                <option value="Lease Renewal">Send Renewal Offer</option>
                                <option value="Task Update">Send Task Update</option>
                                <option value="Fine Alert">Send Fine Alert</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Delivery Channels</label>
                        <div className="flex gap-3">
                            {['SMS', 'Email', 'WhatsApp'].map(c => (
                                <label key={c} className={`flex-1 border rounded-lg p-3 text-center cursor-pointer transition-all ${channels.includes(c) ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold shadow-sm' : 'hover:bg-gray-50 text-gray-600'}`}>
                                    <input type="checkbox" className="hidden" checked={channels.includes(c)} onChange={() => handleChannelToggle(c)} />
                                    <span className="flex items-center justify-center">
                                        <Icon name={c === 'Email' ? 'mail' : 'communication'} className="w-4 h-4 mr-2" />
                                        {c}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                    
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm text-gray-600 flex items-start">
                        <Icon name="info" className="w-5 h-5 text-blue-500 mr-2 mt-0.5" />
                        <p>This rule will automatically trigger for all eligible tenants/events. You can pause it anytime from the dashboard.</p>
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-3 border-t pt-4">
                    <button onClick={onClose} className="px-5 py-2.5 bg-gray-100 rounded-lg text-gray-700 font-medium hover:bg-gray-200">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2.5 bg-primary text-white rounded-lg font-bold hover:bg-primary-dark shadow-md">Create Rule</button>
                </div>
            </div>
        </div>
    );
};

const AutomationCard: React.FC<{ rule: EnhancedRule; onToggle: (id: string) => void }> = ({ rule, onToggle }) => {
    const isCommunication = rule.category === 'Communication' || !rule.category;
    
    return (
        <div className={`bg-white rounded-xl p-5 shadow-sm border transition-all duration-300 hover:shadow-md ${rule.enabled ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-gray-300 opacity-70'}`}>
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-full ${rule.enabled ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                        <Icon name={isCommunication ? 'communication' : 'operations'} className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg">{rule.name}</h3>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{rule.id}</p>
                    </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={rule.enabled} onChange={() => onToggle(rule.id)} className="sr-only peer"/>
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                </label>
            </div>
            
            <div className="grid grid-cols-2 gap-4 my-4 text-sm">
                <div className="bg-gray-50 p-2 rounded border border-gray-100">
                    <p className="text-xs text-gray-400 uppercase font-bold">Trigger</p>
                    <p className="font-semibold text-gray-700">{rule.trigger}</p>
                </div>
                <div className="bg-gray-50 p-2 rounded border border-gray-100">
                    <p className="text-xs text-gray-400 uppercase font-bold">Action</p>
                    <p className="font-semibold text-gray-700">{rule.templateName}</p>
                </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex gap-2">
                    {rule.channels.map(c => (
                        <span key={c} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 uppercase">
                            {c}
                        </span>
                    ))}
                </div>
                <div className="text-xs text-gray-400 flex items-center">
                    <Icon name="check" className="w-3 h-3 mr-1" /> {rule.executions || 0} Runs
                </div>
            </div>
        </div>
    );
};

const ActivityItem: React.FC<{ title: string; time: string; icon: string; color: string }> = ({ title, time, icon, color }) => (
    <div className="flex items-start gap-3 pb-4 border-b border-gray-50 last:border-0 last:pb-0">
        <div className={`mt-0.5 p-1.5 rounded-full bg-${color}-100 text-${color}-600`}>
            <Icon name={icon} className="w-4 h-4" />
        </div>
        <div>
            <p className="text-sm font-medium text-gray-700">{title}</p>
            <p className="text-xs text-gray-400">{time}</p>
        </div>
    </div>
);

const Automation: React.FC = () => {
    const { automationRules, updateAutomationRule, addAutomationRule } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('All');

    const rules: EnhancedRule[] = useMemo(() => automationRules.map(r => ({
        ...r,
        category: r.name.toLowerCase().includes('fine') || r.name.toLowerCase().includes('rent') ? 'Finance' : 'Communication',
        executions: 0,
        lastRun: '2 mins ago'
    })), [automationRules]);

    const filteredRules = useMemo(() => {
        if (activeTab === 'All') return rules;
        return rules.filter(r => r.category === activeTab);
    }, [rules, activeTab]);

    const handleToggle = (ruleId: string) => {
        const rule = automationRules.find(r => r.id === ruleId);
        if (rule) {
            updateAutomationRule(ruleId, { enabled: !rule.enabled });
        }
    };

    const handleSave = (ruleData: Partial<CommunicationAutomationRule>) => {
        const newRule = { ...ruleData, id: `auto-${Date.now()}` } as CommunicationAutomationRule;
        addAutomationRule(newRule);
        setIsModalOpen(false);
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/general-operations/task-management'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Operations
            </button>
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Intelligent Automation</h1>
                    <p className="text-lg text-gray-500 mt-1">Set it and forget it. Your 24/7 operational autopilot.</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="px-6 py-3 bg-gray-900 text-white font-bold rounded-xl shadow-lg hover:bg-black transition-all flex items-center transform hover:-translate-y-1">
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Create Automation
                </button>
            </div>
            
            {/* Impact Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-6 rounded-xl shadow-lg text-white">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-blue-100 text-xs font-bold uppercase tracking-wider">Automations Active</p>
                            <h3 className="text-3xl font-extrabold mt-1">{rules.filter(r => r.enabled).length} / {rules.length}</h3>
                        </div>
                        <div className="p-2 bg-white/20 rounded-lg"><Icon name="settings" className="w-6 h-6 text-white" /></div>
                    </div>
                    <p className="text-xs text-blue-100 mt-4 bg-white/10 inline-block px-2 py-1 rounded">System Healthy</p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-green-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Actions Triggered (MTD)</p>
                            <h3 className="text-3xl font-extrabold text-gray-800 mt-1">4,285</h3>
                        </div>
                        <div className="p-2 bg-green-50 rounded-lg text-green-600"><Icon name="check" className="w-6 h-6" /></div>
                    </div>
                    <p className="text-xs text-green-600 font-bold mt-4">▲ 12% vs last month</p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-purple-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Est. Time Saved</p>
                            <h3 className="text-3xl font-extrabold text-gray-800 mt-1">128 Hrs</h3>
                        </div>
                        <div className="p-2 bg-purple-50 rounded-lg text-purple-600"><Icon name="time" className="w-6 h-6" /></div>
                    </div>
                    <p className="text-xs text-purple-600 font-bold mt-4">~2 FTE Equivalent</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content: Rules Grid */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center gap-2 border-b border-gray-200 pb-1">
                        {['All', 'Communication', 'Finance', 'Operations'].map(tab => (
                            <button 
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-2 text-sm font-bold transition-colors border-b-2 ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredRules.map(rule => (
                            <AutomationCard key={rule.id} rule={rule} onToggle={handleToggle} />
                        ))}
                        {filteredRules.length === 0 && (
                            <div className="col-span-full py-16 text-center text-gray-400 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                                <Icon name="settings" className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                <p>No automations found in this category.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar: Live Activity Feed */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                    <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center">
                        <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                        Live Activity
                    </h3>
                    <div className="space-y-4">
                         <ActivityItem title="Sent Daily Fine SMS to Ritch" time="Just now" icon="communication" color="red" />
                         <ActivityItem title="Triggered 'Automated Daily Fine' Rule" time="1 min ago" icon="settings" color="blue" />
                        <ActivityItem title="Sent Rent Reminder to John Doe" time="2 mins ago" icon="mail" color="blue" />
                        <ActivityItem title="Generated Invoice #INV-1029" time="15 mins ago" icon="revenue" color="green" />
                        <ActivityItem title="Escalated Task #TSK-992" time="1 hour ago" icon="task-escalated" color="red" />
                        <ActivityItem title="Payment Receipt Sent (SMS)" time="3 hours ago" icon="communication" color="green" />
                    </div>
                    <button className="w-full mt-6 py-2 text-xs font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 rounded transition-colors">
                        View Full Log
                    </button>
                </div>
            </div>

            {isModalOpen && <CreateRuleModal onClose={() => setIsModalOpen(false)} onSave={handleSave} />}
        </div>
    );
};

export default Automation;
