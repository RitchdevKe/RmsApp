
import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { Workflow } from '../../types';
import Icon from '../Icon';

// --- Extended Types for UI ---
interface WorkflowStep {
    id: string;
    type: 'Task' | 'Email' | 'SMS' | 'Approval' | 'Delay' | 'Update';
    title: string;
    description?: string;
    config?: any;
}

interface EnhancedWorkflow extends Workflow {
    description?: string;
    category?: 'Leasing' | 'Maintenance' | 'Finance' | 'Communication';
    isActive?: boolean;
    stats?: {
        runs: number;
        active: number;
        successRate: number;
    };
    stepsData?: WorkflowStep[];
}

// --- Mock Templates ---
const WORKFLOW_TEMPLATES: EnhancedWorkflow[] = [
    {
        id: 'tpl-1',
        name: 'New Tenant Onboarding',
        trigger: 'Lease Signed',
        category: 'Leasing',
        description: 'Standard procedure for welcoming new residents, ensuring all documentation is collected, and scheduling move-in.',
        isActive: true,
        stats: { runs: 124, active: 3, successRate: 98 },
        steps: [],
        stepsData: [
            { id: 's1', type: 'Email', title: 'Send Welcome Packet', description: 'Email tenant guide, house rules, and portal login.' },
            { id: 's2', type: 'Task', title: 'Verify Security Deposit', description: 'Finance team to confirm deposit reflection in bank.' },
            { id: 's3', type: 'Delay', title: 'Wait for Move-In Day', description: 'Pause workflow until lease start date.' },
            { id: 's4', type: 'Task', title: 'Key Handover & Inspection', description: 'Caretaker to conduct entry inspection and handover keys.' },
            { id: 's5', type: 'SMS', title: 'Move-in Follow-up', description: 'Automated check-in 24h after move-in.' }
        ]
    },
    {
        id: 'tpl-2',
        name: 'Late Rent Protocol',
        trigger: 'Rent Overdue > 5 Days',
        category: 'Finance',
        description: 'Automated escalation process for recovering overdue rent payments.',
        isActive: true,
        stats: { runs: 45, active: 12, successRate: 85 },
        steps: [],
        stepsData: [
            { id: 's1', type: 'SMS', title: 'Polite Reminder', description: 'Automated SMS reminder of due rent.' },
            { id: 's2', type: 'Delay', title: 'Wait 3 Days', description: 'Grace period for response.' },
            { id: 's3', type: 'Update', title: 'Apply Late Penalty', description: 'System adds KES 500 penalty to tenant ledger.' },
            { id: 's4', type: 'Email', title: 'Formal Demand Letter', description: 'Send official demand letter via email.' },
            { id: 's5', type: 'Task', title: 'Agent Call', description: 'Assign field agent to call tenant directly.' }
        ]
    },
    {
        id: 'tpl-3',
        name: 'Maintenance Approval',
        trigger: 'Task Cost > 5000',
        category: 'Maintenance',
        description: 'Approval workflow for maintenance requests exceeding the petty cash limit.',
        isActive: false,
        stats: { runs: 8, active: 1, successRate: 100 },
        steps: [],
        stepsData: [
            { id: 's1', type: 'Approval', title: 'Landlord Approval', description: 'Send quotation to landlord portal for digital sign-off.' },
            { id: 's2', type: 'Task', title: 'Assign Contractor', description: 'If approved, dispatch preferred vendor.' },
            { id: 's3', type: 'Email', title: 'Notify Tenant', description: 'Inform tenant of scheduled repair date.' },
            { id: 's4', type: 'Task', title: 'Verify Completion', description: 'Caretaker to sign off on work done.' }
        ]
    }
];

// --- Components ---

const StepIcon: React.FC<{ type: WorkflowStep['type'] }> = ({ type }) => {
    const config = {
        'Task': { icon: 'task-request', bg: 'bg-blue-100', text: 'text-blue-600' },
        'Email': { icon: 'mail', bg: 'bg-purple-100', text: 'text-purple-600' },
        'SMS': { icon: 'communication', bg: 'bg-green-100', text: 'text-green-600' },
        'Approval': { icon: 'check', bg: 'bg-orange-100', text: 'text-orange-600' },
        'Delay': { icon: 'time', bg: 'bg-gray-100', text: 'text-gray-600' },
        'Update': { icon: 'settings', bg: 'bg-indigo-100', text: 'text-indigo-600' }
    };
    const style = config[type] || config['Task'];

    return (
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${style.bg} ${style.text} shadow-sm z-10 border-2 border-white`}>
            <Icon name={style.icon} className="w-5 h-5" />
        </div>
    );
};

const WorkflowCard: React.FC<{ wf: EnhancedWorkflow; onEdit: () => void; onDelete: () => void }> = ({ wf, onEdit, onDelete }) => {
    const typeColor = {
        'Leasing': 'border-t-blue-500',
        'Maintenance': 'border-t-orange-500',
        'Finance': 'border-t-red-500',
        'Communication': 'border-t-purple-500'
    }[wf.category || 'Leasing'] || 'border-t-gray-500';

    return (
        <div className={`bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all overflow-hidden flex flex-col border-t-4 ${typeColor}`}>
            <div className="p-5 flex-grow">
                <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold uppercase text-gray-400 tracking-wider bg-gray-50 px-2 py-1 rounded">{wf.category || 'General'}</span>
                    <div className="flex items-center space-x-2">
                        <span className={`w-2 h-2 rounded-full ${wf.isActive ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                        <span className="text-xs text-gray-500">{wf.isActive ? 'Active' : 'Draft'}</span>
                    </div>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-1">{wf.name}</h3>
                <p className="text-sm text-gray-500 line-clamp-2 min-h-[40px]">{wf.description || `Triggered by: ${wf.trigger}`}</p>
                
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-500 font-medium">
                    <div className="flex items-center bg-gray-50 p-1.5 rounded"><Icon name="task-request" className="w-3 h-3 mr-1" /> {wf.stats?.runs || 0} Runs</div>
                    <div className="flex items-center bg-gray-50 p-1.5 rounded"><Icon name="check" className="w-3 h-3 mr-1" /> {wf.stats?.successRate || 0}% Success</div>
                </div>
            </div>
            <div className="border-t border-gray-100 p-3 bg-gray-50 flex justify-between items-center">
                <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50">
                    <Icon name="close" className="w-4 h-4" />
                </button>
                <button onClick={onEdit} className="text-primary font-bold text-sm hover:underline flex items-center">
                    Open Builder <Icon name="chevron-down" className="w-3 h-3 ml-1 -rotate-90" />
                </button>
            </div>
        </div>
    );
};

const WorkflowEditor: React.FC<{ 
    workflow: EnhancedWorkflow; 
    onSave: (wf: EnhancedWorkflow) => void; 
    onCancel: () => void; 
}> = ({ workflow, onSave, onCancel }) => {
    const [formData, setFormData] = useState<EnhancedWorkflow>(workflow);
    const [steps, setSteps] = useState<WorkflowStep[]>(workflow.stepsData || []);

    const addStep = (type: WorkflowStep['type']) => {
        const newStep: WorkflowStep = {
            id: `s-${Date.now()}`,
            type,
            title: `New ${type}`,
            description: 'Configure this step...'
        };
        setSteps([...steps, newStep]);
    };

    const updateStep = (id: string, field: keyof WorkflowStep, value: string) => {
        setSteps(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    const removeStep = (id: string) => {
        setSteps(prev => prev.filter(s => s.id !== id));
    };

    const handleSave = () => {
        onSave({ ...formData, stepsData: steps, steps: steps.map(s => s.title) });
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] bg-gray-100 -m-6 rounded-none overflow-hidden relative">
            {/* Toolbar */}
            <div className="bg-white border-b px-6 py-3 flex justify-between items-center shadow-sm z-30">
                <div className="flex items-center gap-4">
                    <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                        <Icon name="close" className="w-5 h-5" />
                    </button>
                    <div>
                        <input 
                            value={formData.name} 
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            className="font-bold text-lg text-gray-800 outline-none border-b border-transparent hover:border-gray-300 focus:border-primary bg-transparent"
                            placeholder="Workflow Name"
                        />
                        <div className="flex items-center text-xs text-gray-500 mt-0.5">
                            <span className="mr-2 font-medium">Trigger:</span>
                            <select 
                                value={formData.trigger} 
                                onChange={e => setFormData({...formData, trigger: e.target.value})}
                                className="bg-gray-100 rounded px-2 py-0.5 border-none outline-none text-gray-700 text-xs font-medium cursor-pointer hover:bg-gray-200"
                            >
                                <option>New Tenant</option>
                                <option>Rent Overdue</option>
                                <option>Lease Expiring</option>
                                <option>Task Created</option>
                                <option>Payment Received</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 mr-4 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
                        <span className="text-xs font-semibold text-gray-600">Status:</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="sr-only peer" />
                            <div className="w-8 h-4 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-green-500"></div>
                        </label>
                    </div>
                    <button onClick={handleSave} className="px-5 py-2 bg-gray-900 text-white font-bold text-sm rounded-lg shadow hover:bg-black transition-colors flex items-center">
                        <Icon name="check" className="w-4 h-4 mr-2" /> Save
                    </button>
                </div>
            </div>

            <div className="flex-grow flex overflow-hidden">
                {/* Canvas / Builder Area */}
                <div className="flex-grow overflow-y-auto p-8 relative">
                    {/* Visual Connector Line */}
                    {steps.length > 0 && (
                        <div className="absolute left-[calc(50%-1px)] top-16 bottom-20 w-0.5 bg-gray-300 z-0"></div>
                    )}

                    {/* Start Node */}
                    <div className="flex flex-col items-center mb-8 relative z-10">
                        <div className="bg-gray-800 text-white px-5 py-2 rounded-full font-bold text-xs shadow-md flex items-center border-4 border-gray-200 uppercase tracking-wider">
                            <Icon name="branch" className="w-3 h-3 mr-2 text-green-400" />
                            Start: {formData.trigger}
                        </div>
                    </div>

                    {/* Steps */}
                    <div className="max-w-xl mx-auto space-y-4">
                        {steps.map((step, index) => (
                            <div key={step.id} className="relative group">
                                {/* Card */}
                                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex gap-4 items-start relative hover:shadow-md hover:border-primary/50 transition-all z-10">
                                    <StepIcon type={step.type} />
                                    <div className="flex-grow">
                                        <div className="flex justify-between items-center mb-1">
                                            <input 
                                                value={step.title}
                                                onChange={e => updateStep(step.id, 'title', e.target.value)}
                                                className="font-bold text-gray-800 outline-none w-full bg-transparent focus:text-primary transition-colors text-sm"
                                            />
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => removeStep(step.id)} className="text-gray-400 hover:text-red-500 transition-colors"><Icon name="close" className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                        <input 
                                            value={step.description || ''}
                                            onChange={e => updateStep(step.id, 'description', e.target.value)}
                                            className="text-xs text-gray-500 w-full outline-none bg-transparent placeholder-gray-300"
                                            placeholder="Add description..."
                                        />
                                        <div className="mt-2 text-[9px] font-bold text-gray-400 uppercase tracking-wide bg-gray-50 inline-block px-1.5 py-0.5 rounded border border-gray-100">
                                            {step.type} Step
                                        </div>
                                    </div>
                                </div>
                                {/* Add Button Connector */}
                                {index < steps.length - 1 && (
                                    <div className="h-8 w-full flex justify-center items-center">
                                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full"></div>
                                    </div>
                                )}
                            </div>
                        ))}

                         {steps.length === 0 && (
                            <div className="text-center py-16 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50/50 text-gray-400">
                                <Icon name="stack" className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                <p className="font-medium">No steps defined</p>
                                <p className="text-xs mt-1">Use the toolbox on the right to build your process.</p>
                            </div>
                        )}
                    </div>

                    {/* End Node */}
                    <div className="flex flex-col items-center mt-8 relative z-10">
                        <div className="bg-gray-200 text-gray-500 px-6 py-1.5 rounded-full font-bold text-[10px] shadow-sm uppercase tracking-widest border-2 border-white">
                            End
                        </div>
                    </div>
                </div>

                {/* Sidebar Toolbox */}
                <div className="w-72 bg-white border-l p-5 flex flex-col gap-4 shadow-xl z-20 overflow-y-auto">
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">Communication</h4>
                        <div className="space-y-2">
                            <button onClick={() => addStep('Email')} className="w-full flex items-center p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-purple-50 hover:border-purple-200 hover:text-purple-700 transition-all text-sm font-medium text-gray-600 text-left group shadow-sm">
                                <div className="w-8 h-8 rounded-full bg-white border border-purple-100 text-purple-600 flex items-center justify-center mr-3 group-hover:scale-110 transition-transform shadow-sm">
                                    <Icon name="mail" className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="block font-bold">Send Email</span>
                                    <span className="text-[10px] opacity-70">Notifications</span>
                                </div>
                            </button>
                            <button onClick={() => addStep('SMS')} className="w-full flex items-center p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-green-50 hover:border-green-200 hover:text-green-700 transition-all text-sm font-medium text-gray-600 text-left group shadow-sm">
                                <div className="w-8 h-8 rounded-full bg-white border border-green-100 text-green-600 flex items-center justify-center mr-3 group-hover:scale-110 transition-transform shadow-sm">
                                    <Icon name="communication" className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="block font-bold">Send SMS</span>
                                    <span className="text-[10px] opacity-70">Alerts & Reminders</span>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">Operations</h4>
                        <div className="space-y-2">
                             <button onClick={() => addStep('Task')} className="w-full flex items-center p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all text-sm font-medium text-gray-600 text-left group shadow-sm">
                                <div className="w-8 h-8 rounded-full bg-white border border-blue-100 text-blue-600 flex items-center justify-center mr-3 group-hover:scale-110 transition-transform shadow-sm">
                                    <Icon name="task-request" className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="block font-bold">Create Task</span>
                                    <span className="text-[10px] opacity-70">Assign to staff</span>
                                </div>
                            </button>
                             <button onClick={() => addStep('Update')} className="w-full flex items-center p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-all text-sm font-medium text-gray-600 text-left group shadow-sm">
                                <div className="w-8 h-8 rounded-full bg-white border border-indigo-100 text-indigo-600 flex items-center justify-center mr-3 group-hover:scale-110 transition-transform shadow-sm">
                                    <Icon name="settings" className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="block font-bold">Update Record</span>
                                    <span className="text-[10px] opacity-70">Modify system data</span>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 tracking-wider">Logic Control</h4>
                        <div className="space-y-2">
                            <button onClick={() => addStep('Approval')} className="w-full flex items-center p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-orange-50 hover:border-orange-200 hover:text-orange-700 transition-all text-sm font-medium text-gray-600 text-left group shadow-sm">
                                <div className="w-8 h-8 rounded-full bg-white border border-orange-100 text-orange-600 flex items-center justify-center mr-3 group-hover:scale-110 transition-transform shadow-sm">
                                    <Icon name="check" className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="block font-bold">Require Approval</span>
                                    <span className="text-[10px] opacity-70">Pause for sign-off</span>
                                </div>
                            </button>

                             <button onClick={() => addStep('Delay')} className="w-full flex items-center p-3 rounded-lg border border-gray-100 bg-gray-50 hover:bg-gray-100 hover:border-gray-300 transition-all text-sm font-medium text-gray-600 text-left group shadow-sm">
                                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-500 flex items-center justify-center mr-3 group-hover:scale-110 transition-transform shadow-sm">
                                    <Icon name="time" className="w-4 h-4" />
                                </div>
                                <div>
                                    <span className="block font-bold">Wait / Delay</span>
                                    <span className="text-[10px] opacity-70">Time-based pause</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Workflows: React.FC = () => {
    const { workflows, addWorkflow } = useData();
    const [view, setView] = useState<'list' | 'builder'>('list');
    const [editingWorkflow, setEditingWorkflow] = useState<EnhancedWorkflow | null>(null);
    const [categoryFilter, setCategoryFilter] = useState('All');

    const allWorkflows: EnhancedWorkflow[] = workflows.length > 0 ? workflows : WORKFLOW_TEMPLATES;

    const filteredWorkflows = useMemo(() => {
        if (categoryFilter === 'All') return allWorkflows;
        return allWorkflows.filter(wf => wf.category === categoryFilter);
    }, [allWorkflows, categoryFilter]);

    const handleCreateNew = () => {
        setEditingWorkflow({
            id: `wf-${Date.now()}`,
            name: 'Untitled Workflow',
            trigger: 'New Tenant',
            category: 'Leasing',
            description: 'New custom workflow',
            isActive: false,
            stats: { runs: 0, active: 0, successRate: 0 },
            steps: [],
            stepsData: []
        });
        setView('builder');
    };

    const handleUseTemplate = (tpl: EnhancedWorkflow) => {
         setEditingWorkflow({
            ...tpl,
            id: `wf-${Date.now()}`,
            name: `${tpl.name} (Copy)`,
            isActive: false,
            stats: { runs: 0, active: 0, successRate: 0 }
        });
        setView('builder');
    };

    const handleEdit = (wf: EnhancedWorkflow) => {
        const hydratedWf = {
            ...wf,
            stepsData: wf.stepsData || wf.steps.map((s, i) => ({ id: `s-${i}`, type: 'Task', title: s, description: '' } as WorkflowStep))
        };
        setEditingWorkflow(hydratedWf);
        setView('builder');
    };

    const handleSave = (wf: EnhancedWorkflow) => {
        alert(`Workflow "${wf.name}" saved successfully!`);
        setView('list');
    };

    const handleDelete = (id: string) => {
        if(confirm("Delete this workflow?")) {
            alert("Deleted.");
        }
    }

    if (view === 'builder' && editingWorkflow) {
        return <WorkflowEditor workflow={editingWorkflow} onSave={handleSave} onCancel={() => setView('list')} />;
    }

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/general-operations/task-management'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Operations
            </button>
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Workflow Automation</h1>
                    <p className="text-lg text-gray-500 mt-1">Design and automate your property operations visually.</p>
                </div>
                <button onClick={handleCreateNew} className="px-6 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black shadow-lg transition-all flex items-center transform hover:-translate-y-1">
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Build Workflow
                </button>
            </div>

            {/* Templates Section */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-100">
                <h3 className="text-sm font-bold text-blue-800 uppercase mb-4 flex items-center">
                    <Icon name="stack" className="w-4 h-4 mr-2" /> Quick Start Templates
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {WORKFLOW_TEMPLATES.map(tpl => (
                        <div key={tpl.id} className="bg-white p-4 rounded-lg shadow-sm border border-blue-100 hover:shadow-md cursor-pointer transition-all group" onClick={() => handleUseTemplate(tpl)}>
                            <div className="flex justify-between items-start">
                                <h4 className="font-bold text-gray-800 group-hover:text-primary">{tpl.name}</h4>
                                <div className="p-1 bg-gray-100 rounded text-gray-400 group-hover:text-primary group-hover:bg-blue-50">
                                     <Icon name="download" className="w-4 h-4" />
                                </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{tpl.description}</p>
                            <div className="mt-3 flex gap-2">
                                {tpl.stepsData?.slice(0, 3).map((s, i) => (
                                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-300 group-hover:bg-blue-300"></div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Workflow List */}
            <div>
                <div className="flex items-center gap-4 mb-6 border-b pb-2">
                    {['All', 'Leasing', 'Finance', 'Maintenance', 'Communication'].map(cat => (
                        <button 
                            key={cat} 
                            onClick={() => setCategoryFilter(cat)}
                            className={`text-sm font-bold pb-2 transition-colors ${categoryFilter === cat ? 'text-primary border-b-2 border-primary' : 'text-gray-500 hover:text-gray-800'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredWorkflows.map(wf => (
                        <WorkflowCard 
                            key={wf.id} 
                            wf={wf} 
                            onEdit={() => handleEdit(wf)} 
                            onDelete={() => handleDelete(wf.id)} 
                        />
                    ))}
                    {filteredWorkflows.length === 0 && (
                        <div className="col-span-full py-12 text-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                            No workflows found in this category.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Workflows;
