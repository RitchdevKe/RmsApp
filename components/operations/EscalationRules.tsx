
import React, { useState, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { EscalationRule } from '../../types';
import Icon from '../Icon';

// --- Types for UI ---
interface LogicTemplate {
    id: string;
    name: string;
    category: 'Finance' | 'Maintenance' | 'Leasing' | 'Compliance';
    condition: string;
    action: string;
    severity: 'Low' | 'Medium' | 'High' | 'Critical';
    icon: string;
}

interface ActivityLog {
    id: string;
    time: string;
    ruleName: string;
    actionTaken: string;
    status: 'Triggered' | 'Resolved' | 'Failed';
}

// --- Constants: Smart Templates ---
const LOGIC_TEMPLATES: LogicTemplate[] = [
    {
        id: 'tpl-1',
        name: 'Emergency Maintenance SLA',
        category: 'Maintenance',
        condition: 'Task Priority is High AND Unassigned > 2 Hours',
        action: 'Notify Branch Manager & Auto-Assign Senior Technician',
        severity: 'Critical',
        icon: 'tools'
    },
    {
        id: 'tpl-2',
        name: 'Rent Arrears Protocol',
        category: 'Finance',
        condition: 'Rent Overdue > 7 Days',
        action: 'Apply 5% Penalty & Send Formal Warning',
        severity: 'High',
        icon: 'arrears'
    },
    {
        id: 'tpl-3',
        name: 'Lease Expiry Watch',
        category: 'Leasing',
        condition: 'Lease Ends in < 60 Days',
        action: 'Create "Renewal Offer" Task for Leasing Agent',
        severity: 'Medium',
        icon: 'leases'
    },
    {
        id: 'tpl-4',
        name: 'Vendor Quality Control',
        category: 'Compliance',
        condition: 'Task Rating < 3 Stars',
        action: 'Flag Vendor for Review & Hold Payment',
        severity: 'High',
        icon: 'shield'
    }
];

// --- Mock Live Activity Data ---
const INITIAL_ACTIVITY_LOGS: ActivityLog[] = [
    { id: 'act-1', time: '2 mins ago', ruleName: 'Emergency Maintenance SLA', actionTaken: 'Notified Manager Mike', status: 'Triggered' },
    { id: 'act-2', time: '15 mins ago', ruleName: 'Rent Arrears Protocol', actionTaken: 'Penalty Applied (Unit B-102)', status: 'Triggered' },
    { id: 'act-3', time: '1 hour ago', ruleName: 'Lease Expiry Watch', actionTaken: 'Task Created', status: 'Resolved' },
];

const LogicBuilderModal: React.FC<{ onClose: () => void; onSave: (rule: Partial<EscalationRule>) => void; template?: LogicTemplate }> = ({ onClose, onSave, template }) => {
    const [condition, setCondition] = useState(template?.condition || '');
    const [action, setAction] = useState(template?.action || '');
    const [assignedTo, setAssignedTo] = useState('System');
    const [severity, setSeverity] = useState(template?.severity || 'Medium');

    const handleSubmit = () => {
        if (!condition || !action) return alert("Condition and Action are required");
        onSave({ condition, action, assignedTo });
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1500] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Logic Builder</h2>
                        <p className="text-xs text-gray-500">Define the 'If-This-Then-That' logic for your operations.</p>
                    </div>
                    <button onClick={onClose}><Icon name="close" className="w-6 h-6 text-gray-400 hover:text-gray-600" /></button>
                </div>

                <div className="p-8 flex-grow overflow-y-auto space-y-8">
                    {/* IF Block */}
                    <div className="relative pl-8 border-l-4 border-blue-500">
                        <div className="absolute -left-3.5 top-0 w-7 h-7 bg-blue-500 rounded-full text-white flex items-center justify-center font-bold text-xs">IF</div>
                        <h3 className="text-sm font-bold text-blue-800 uppercase mb-3">Trigger Condition</h3>
                        <div className="space-y-3">
                            <input 
                                value={condition} 
                                onChange={e => setCondition(e.target.value)} 
                                placeholder="e.g. Rent Overdue > 7 Days" 
                                className="w-full p-4 border border-blue-100 bg-blue-50/50 rounded-xl text-lg font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" 
                            />
                            <div className="flex gap-2 text-xs text-gray-500">
                                <span className="bg-gray-100 px-2 py-1 rounded cursor-pointer hover:bg-gray-200" onClick={() => setCondition(prev => prev + ' AND ')}>AND</span>
                                <span className="bg-gray-100 px-2 py-1 rounded cursor-pointer hover:bg-gray-200" onClick={() => setCondition(prev => prev + ' OR ')}>OR</span>
                                <span className="bg-gray-100 px-2 py-1 rounded cursor-pointer hover:bg-gray-200" onClick={() => setCondition(prev => prev + ' > ')}>&gt;</span>
                                <span className="bg-gray-100 px-2 py-1 rounded cursor-pointer hover:bg-gray-200" onClick={() => setCondition(prev => prev + ' < ')}>&lt;</span>
                            </div>
                        </div>
                    </div>

                    {/* THEN Block */}
                    <div className="relative pl-8 border-l-4 border-green-500">
                        <div className="absolute -left-3.5 top-0 w-7 h-7 bg-green-500 rounded-full text-white flex items-center justify-center font-bold text-xs">THEN</div>
                        <h3 className="text-sm font-bold text-green-800 uppercase mb-3">System Action</h3>
                        <div className="space-y-3">
                            <textarea 
                                value={action} 
                                onChange={e => setAction(e.target.value)} 
                                placeholder="e.g. Notify Manager & Apply Penalty" 
                                className="w-full p-4 border border-green-100 bg-green-50/50 rounded-xl text-lg font-medium focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none h-24 resize-none" 
                            />
                        </div>
                    </div>

                    {/* Settings Block */}
                    <div className="grid grid-cols-2 gap-6 pt-4 border-t">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Severity Level</label>
                            <select value={severity} onChange={e => setSeverity(e.target.value as any)} className="w-full p-2 border rounded-lg bg-white text-sm">
                                <option>Low</option>
                                <option>Medium</option>
                                <option>High</option>
                                <option>Critical</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Assignee / Owner</label>
                            <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className="w-full p-2 border rounded-lg text-sm" placeholder="System" />
                        </div>
                    </div>
                </div>

                <div className="p-6 bg-gray-50 border-t flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-100 transition-colors">Cancel</button>
                    <button onClick={handleSubmit} className="px-8 py-2.5 bg-gray-900 text-white font-bold rounded-lg hover:bg-black shadow-lg transition-transform active:scale-95">Save Logic</button>
                </div>
            </div>
        </div>
    );
};

const EscalationCard: React.FC<{ rule: EscalationRule; onDelete: () => void }> = ({ rule, onDelete }) => (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 hover:shadow-md transition-all group relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 to-purple-600"></div>
        <div className="flex justify-between items-start mb-4 pl-3">
            <div>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1">Condition (Trigger)</p>
                <p className="font-mono text-sm bg-gray-50 p-2 rounded border border-gray-100 text-gray-700">{rule.condition}</p>
            </div>
            <button onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors"><Icon name="close" className="w-4 h-4" /></button>
        </div>
        
        <div className="flex justify-center my-2">
            <Icon name="chevron-down" className="w-5 h-5 text-gray-300" />
        </div>

        <div className="pl-3">
            <p className="text-xs font-bold text-green-600 uppercase tracking-wide mb-1">Action (Execution)</p>
            <p className="font-bold text-gray-800 text-lg">{rule.action}</p>
            {rule.assignedTo && (
                <div className="flex items-center mt-3 text-xs text-gray-500 bg-gray-50 inline-block px-2 py-1 rounded">
                    <span className="font-semibold mr-1">Owner:</span> {rule.assignedTo}
                </div>
            )}
        </div>
    </div>
);

const EscalationRules: React.FC = () => {
    const { escalationRules, addEscalationRule } = useData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<LogicTemplate | undefined>(undefined);
    const [activeTab, setActiveTab] = useState<'Active' | 'Library'>('Active');

    const handleSave = (ruleData: Partial<EscalationRule>) => {
        addEscalationRule({ ...ruleData, id: `esc-${Date.now()}` } as EscalationRule);
        setIsModalOpen(false);
        setActiveTab('Active');
    };

    const handleUseTemplate = (tpl: LogicTemplate) => {
        setSelectedTemplate(tpl);
        setIsModalOpen(true);
    };

    const handleOpenBuilder = () => {
        setSelectedTemplate(undefined);
        setIsModalOpen(true);
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/general-operations/task-management'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Operations
            </button>
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Escalation Logic Engine</h1>
                    <p className="text-lg text-gray-500 mt-1">Configure automated responses to critical operational events.</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button 
                        onClick={() => setActiveTab('Active')}
                        className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'Active' ? 'bg-white shadow text-primary' : 'text-gray-500'}`}
                    >
                        Active Rules ({escalationRules.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('Library')}
                        className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === 'Library' ? 'bg-white shadow text-primary' : 'text-gray-500'}`}
                    >
                        Template Library
                    </button>
                </div>
            </div>

            {/* Stats Header */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-6 rounded-xl shadow-lg text-white">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-blue-100 text-xs font-bold uppercase">System Status</p>
                            <h3 className="text-2xl font-extrabold mt-1">Operational</h3>
                        </div>
                        <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse shadow-[0_0_10px_#4ade80]"></div>
                    </div>
                    <p className="text-xs text-blue-100 mt-4 opacity-80">Logic engine is monitoring 24/7</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-orange-500">
                    <p className="text-gray-500 text-xs font-bold uppercase">Escalations Today</p>
                    <h3 className="text-2xl font-extrabold text-gray-800 mt-1">12</h3>
                    <p className="text-xs text-orange-600 font-bold mt-1">Requires Attention</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-green-500">
                     <p className="text-gray-500 text-xs font-bold uppercase">Auto-Resolved</p>
                    <h3 className="text-2xl font-extrabold text-gray-800 mt-1">85%</h3>
                    <p className="text-xs text-green-600 font-bold mt-1">Efficiency Rate</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main Content Area */}
                <div className="lg:col-span-2 space-y-6">
                    {activeTab === 'Active' && (
                        <div className="grid grid-cols-1 gap-6">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-lg font-bold text-gray-700">Configured Logic</h3>
                                <button onClick={handleOpenBuilder} className="text-primary text-sm font-bold hover:underline flex items-center">
                                    <Icon name="plus" className="w-4 h-4 mr-1"/> Custom Rule
                                </button>
                            </div>
                            {escalationRules.length > 0 ? (
                                escalationRules.map(rule => (
                                    <EscalationCard key={rule.id} rule={rule} onDelete={() => {}} />
                                ))
                            ) : (
                                <div className="p-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300 text-gray-400">
                                    <p>No active rules. Use the library or builder to create one.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'Library' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {LOGIC_TEMPLATES.map(tpl => (
                                <div key={tpl.id} className="bg-white p-5 rounded-xl border border-gray-200 hover:border-primary hover:shadow-md transition-all cursor-pointer group" onClick={() => handleUseTemplate(tpl)}>
                                    <div className="flex justify-between items-start mb-3">
                                        <div className={`p-2 rounded-lg bg-opacity-10 ${tpl.severity === 'Critical' ? 'bg-red-500 text-red-600' : 'bg-blue-500 text-blue-600'}`}>
                                            <Icon name={tpl.icon} className="w-6 h-6" />
                                        </div>
                                        <span className="text-[10px] font-bold uppercase bg-gray-100 px-2 py-1 rounded text-gray-500">{tpl.category}</span>
                                    </div>
                                    <h4 className="font-bold text-gray-800 mb-1 group-hover:text-primary">{tpl.name}</h4>
                                    <p className="text-xs text-gray-500 mb-3">{tpl.condition}</p>
                                    <div className="text-xs font-medium text-gray-700 bg-gray-50 p-2 rounded">
                                        <span className="text-gray-400">Action:</span> {tpl.action}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Sidebar: Live Monitor */}
                <div className="bg-gray-900 rounded-2xl p-6 text-white h-fit shadow-xl">
                    <div className="flex items-center justify-between mb-6 border-b border-gray-700 pb-4">
                        <h3 className="font-bold flex items-center">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-3"></span>
                            Live Monitor
                        </h3>
                        <span className="text-[10px] bg-gray-800 px-2 py-1 rounded text-gray-400">Real-time</span>
                    </div>

                    <div className="space-y-6 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-800">
                        {INITIAL_ACTIVITY_LOGS.map(log => (
                            <div key={log.id} className="relative pl-6">
                                <div className={`absolute left-0 top-1 w-4 h-4 rounded-full border-2 border-gray-900 ${log.status === 'Triggered' ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                                <p className="text-xs text-gray-400 font-mono mb-0.5">{log.time}</p>
                                <p className="font-bold text-sm text-gray-200">{log.ruleName}</p>
                                <p className="text-xs text-gray-500 mt-1">{log.actionTaken}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {isModalOpen && <LogicBuilderModal onClose={() => setIsModalOpen(false)} onSave={handleSave} template={selectedTemplate} />}
        </div>
    );
};

export default EscalationRules;
