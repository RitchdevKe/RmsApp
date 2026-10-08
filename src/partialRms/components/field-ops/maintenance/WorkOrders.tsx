
import React, { useState, useMemo } from 'react';
import { useData } from '../../../context/DataContext';
import { Task, TaskStatus, TaskPriority, Quotation } from '@/types';
import Icon from '../../Icon';

// Reusing Task Detail Modal Structure from Operations/TaskManagement
const TaskDetailModal: React.FC<{ task: Task; onClose: () => void; onUpdate: (task: Task) => void }> = ({ task, onClose, onUpdate }) => {
    const { staff, vendors } = useData();
    const [editedTask, setEditedTask] = useState<Task>(task);
    const [note, setNote] = useState('');

    const handleChange = (e: any) => {
        const { name, value } = e.target;
        setEditedTask(prev => ({ ...prev, [name]: value }));
    };

    const handleAddNote = () => {
        if (!note.trim()) return;
        const newComment = { user: 'Admin', text: note, date: new Date().toLocaleString() }; 
        const updated = { ...editedTask, comments: [...(editedTask.comments || []), newComment] };
        setEditedTask(updated);
        setNote('');
    };

    const handleSave = () => {
        onUpdate(editedTask);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1600] p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-800">Task Details</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                
                <div className="space-y-4">
                    <input 
                        name="title" 
                        value={editedTask.title} 
                        onChange={handleChange} 
                        className="w-full font-bold text-lg border-b p-1 focus:border-primary outline-none" 
                    />

                    <div className="grid grid-cols-2 gap-4">
                         <div>
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                             <select name="status" value={editedTask.status} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                {Object.values(TaskStatus).map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Priority</label>
                             <select name="priority" value={editedTask.priority} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                                {Object.values(TaskPriority).map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                        <textarea name="description" value={editedTask.description} onChange={handleChange} className="w-full p-2 border rounded" rows={3}/>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Assigned To</label>
                        <select name="assignedTo" value={editedTask.assignedTo} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                            <option value="">Unassigned</option>
                            <optgroup label="Staff">{staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</optgroup>
                            <optgroup label="Vendors">{vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}</optgroup>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-gray-200">
                         <div>
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1 text-gray-700">Payment Option</label>
                             <select 
                                 name="paymentMethod" 
                                 value={editedTask.paymentMethod || 'LandlordDirect'} 
                                 onChange={handleChange} 
                                 className="w-full p-1.5 border rounded bg-white text-xs"
                             >
                                 <option value="LandlordDirect">Landlord Pays vendor directly</option>
                                 <option value="AgencyPaysInvoice">Agency pays, bills Landlord</option>
                             </select>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1 text-gray-700">Landlord approval</label>
                             <select 
                                 name="landlordApproval" 
                                 value={editedTask.landlordApproval || 'N/A'} 
                                 onChange={handleChange} 
                                 className="w-full p-1.5 border rounded bg-white text-xs"
                             >
                                 <option value="N/A">Not Applicable</option>
                                 <option value="Pending">Pending Approval</option>
                                 <option value="Approved">Landlord Approved</option>
                                 <option value="Rejected">Landlord Rejected</option>
                             </select>
                        </div>
                        <div className="col-span-2 flex items-center justify-between pt-2 border-t mt-1 border-gray-200">
                             <div className="flex items-center gap-2">
                                 <input 
                                     id="visibleToLandlord"
                                     type="checkbox" 
                                     checked={!!editedTask.visibleToLandlord} 
                                     onChange={e => setEditedTask(p => ({ ...p, visibleToLandlord: e.target.checked }))}
                                     className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                                 />
                                 <label htmlFor="visibleToLandlord" className="text-xs font-semibold text-gray-700">
                                     Visible on Landlord Report
                                 </label>
                             </div>
                             <span className="text-[10px] text-gray-400">Helps justify management fee</span>
                        </div>
                    </div>
                    
                    <div>
                         <h4 className="font-bold text-gray-700 mb-2 text-sm">Comments</h4>
                         <div className="flex gap-2 mb-2">
                            <input value={note} onChange={e => setNote(e.target.value)} className="flex-grow p-2 border rounded text-sm" placeholder="Add note..."/>
                            <button onClick={handleAddNote} className="px-3 bg-gray-200 rounded text-sm font-bold hover:bg-gray-300">Add</button>
                         </div>
                         <div className="space-y-2 max-h-40 overflow-y-auto bg-gray-50 p-2 rounded">
                            {editedTask.comments?.map((c, i) => (
                                <div key={i} className="text-sm bg-white p-2 rounded border border-gray-100 shadow-sm">
                                    <span className="font-bold text-xs text-primary">{c.user}</span>: {c.text}
                                    <span className="block text-[10px] text-gray-400 mt-1">{c.date}</span>
                                </div>
                            ))}
                         </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t pt-4">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-medium">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded font-medium hover:bg-primary-dark">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

const ReviewQuoteModal: React.FC<{ 
    quote: Quotation; 
    task: Task; 
    onClose: () => void; 
    onDecision: (status: 'Approved' | 'Rejected', notes: string) => void;
}> = ({ quote, task, onClose, onDecision }) => {
    const [reviewNotes, setReviewNotes] = useState('');

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1600] p-4 backdrop-blur-sm" onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800">Review Quotation</h2>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-200 text-sm">
                    <p className="mb-2"><strong>Task:</strong> {task.title}</p>
                    <p className="mb-2"><strong>Contractor:</strong> {quote.contractorName}</p>
                    <div className="border-t pt-2 mt-2">
                        <p className="font-bold text-gray-600 mb-1">Items:</p>
                        <ul className="list-disc pl-4 space-y-1 text-gray-600">
                            {quote.items.map((item, i) => (
                                <li key={i}>{item.description} - KES {item.amount.toLocaleString()}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="flex justify-between items-center mt-4 pt-2 border-t font-bold text-lg">
                        <span>Total Quote:</span>
                        <span className="text-blue-600">KES {quote.totalAmount.toLocaleString()}</span>
                    </div>
                    {quote.notes && <p className="mt-2 text-xs text-gray-500 italic">Vendor Note: "{quote.notes}"</p>}
                </div>

                <textarea 
                    value={reviewNotes} 
                    onChange={e => setReviewNotes(e.target.value)} 
                    className="w-full p-3 border rounded-lg mb-6" 
                    placeholder="Enter review notes (required for rejection)..." 
                    rows={3}
                />

                <div className="flex gap-3">
                    <button 
                        onClick={() => {
                            if (!reviewNotes && confirm("Reject without notes?")) onDecision('Rejected', 'Rejected by admin.');
                            else if (reviewNotes) onDecision('Rejected', reviewNotes);
                        }} 
                        className="flex-1 py-2.5 bg-red-50 text-red-700 font-bold rounded-lg hover:bg-red-100 transition-colors border border-red-200"
                    >
                        Reject Quote
                    </button>
                    <button 
                        onClick={() => onDecision('Approved', reviewNotes || 'Approved')} 
                        className="flex-1 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-md transition-all"
                    >
                        Approve Quote
                    </button>
                </div>
            </div>
        </div>
    );
};

const KanbanColumn: React.FC<{ 
    title: string; 
    tasks: Task[]; 
    status: TaskStatus; 
    onMove: (task: Task, newStatus: TaskStatus) => void;
    color: string;
    onReviewQuote?: (task: Task) => void;
    quotations?: Quotation[];
    onTaskClick: (task: Task) => void;
}> = ({ title, tasks, status, onMove, color, onReviewQuote, quotations, onTaskClick }) => {
    return (
        <div className="flex-1 min-w-[300px] bg-gray-50 rounded-xl p-4 flex flex-col h-full border border-gray-200">
            <div className={`flex justify-between items-center mb-4 pb-2 border-b-2 ${color}`}>
                <h3 className="font-bold text-gray-700">{title}</h3>
                <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold text-gray-500 shadow-sm border">{tasks.length}</span>
            </div>
            
            <div className="space-y-3 overflow-y-auto flex-grow pr-1 custom-scrollbar">
                {tasks.map(task => {
                    const quote = quotations?.find(q => q.taskId === task.id);
                    return (
                        <div 
                            key={task.id} 
                            onClick={() => onTaskClick(task)}
                            className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-all group relative cursor-pointer"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    task.priority === TaskPriority.VeryHigh ? 'bg-red-100 text-red-700' :
                                    task.priority === 'High' ? 'bg-orange-100 text-orange-700' :
                                    'bg-blue-50 text-blue-700'
                                }`}>
                                    {task.priority}
                                </span>
                                <span className="text-[10px] text-gray-400 font-mono">{task.id.slice(-6)}</span>
                            </div>
                            
                            <h4 className="font-bold text-gray-800 text-sm mb-1">{task.title}</h4>
                            <p className="text-xs text-gray-500 mb-3 line-clamp-2">{task.description}</p>
                            
                            {quote && quote.status === 'Pending' && (
                                <div className="mb-3">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onReviewQuote && onReviewQuote(task); }}
                                        className="w-full py-1.5 bg-yellow-100 text-yellow-800 text-xs font-bold rounded flex items-center justify-center hover:bg-yellow-200 animate-pulse"
                                    >
                                        <Icon name="check" className="w-3 h-3 mr-1" /> Review Quote (KES {quote.totalAmount.toLocaleString()})
                                    </button>
                                </div>
                            )}

                            {quote && quote.status === 'Approved' && (
                                <div className="mb-3 text-[10px] text-green-600 font-bold bg-green-50 px-2 py-1 rounded border border-green-100">
                                    Quote Approved: KES {quote.totalAmount.toLocaleString()}
                                </div>
                            )}
                            
                            {task.paymentMethod === 'AgencyPaysInvoice' && (
                                <div className="mb-2 text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full w-max font-semibold">
                                    💳 Agency pays, bills Landlord
                                </div>
                            )}
                            {task.paymentMethod === 'LandlordDirect' && (
                                <div className="mb-2 text-[10px] text-fuchsia-700 bg-fuchsia-50 border border-fuchsia-100 px-2 py-0.5 rounded-full w-max font-semibold">
                                    🏢 Landlord pays vendor directly
                                </div>
                            )}
                            {task.landlordApproval === 'Pending' && (
                                <div className="mb-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-bold animate-pulse">
                                    ⚠️ Awaiting Landlord Approval
                                </div>
                            )}
                            {task.landlordApproval === 'Approved' && (
                                <div className="mb-2 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded font-bold">
                                    ✓ Landlord Approved
                                </div>
                            )}
                            {task.landlordApproval === 'Rejected' && (
                                <div className="mb-2 text-[10px] text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded font-bold">
                                    ✗ Landlord Rejected
                                </div>
                            )}
                            {task.visibleToLandlord && (
                                <div className="mb-2 text-[9px] text-teal-600 font-medium font-sans">
                                    👁️ Visible on Landlord Report
                                </div>
                            )}

                            <div className="flex items-center text-xs text-gray-500 mb-3">
                                <Icon name="branch" className="w-3 h-3 mr-1" /> {task.property}
                            </div>

                            <div className="flex justify-between items-center pt-3 border-t border-gray-50">
                                <div className="flex items-center" title={task.assignedTo}>
                                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">
                                        {task.assignedTo ? task.assignedTo.charAt(0) : '?'}
                                    </div>
                                    <span className="ml-2 text-xs text-gray-600 truncate max-w-[80px]">{task.assignedTo || 'Unassigned'}</span>
                                </div>
                                
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {status !== TaskStatus.Completed && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); onMove(task, getNextStatus(status)); }}
                                            className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100"
                                            title="Move Forward"
                                        >
                                            <Icon name="check" className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                {tasks.length === 0 && (
                    <div className="text-center py-8 text-gray-400 text-xs italic border-2 border-dashed border-gray-100 rounded-lg">
                        No tasks
                    </div>
                )}
            </div>
        </div>
    );
};

const getNextStatus = (current: TaskStatus): TaskStatus => {
    if (current === TaskStatus.Issued) return TaskStatus.InProgress;
    if (current === TaskStatus.InProgress) return TaskStatus.Pending; // Review
    if (current === TaskStatus.Pending) return TaskStatus.Completed;
    return TaskStatus.Closed;
};

const WorkOrders: React.FC = () => {
    const { 
        tasks, 
        updateTask, 
        quotations, 
        updateQuotation, 
        checkPermission, 
        currentUser,
        landlords = [],
        properties = [],
        invoices = [],
        addInvoice
    } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canEdit = isSuperAdmin || checkPermission('Maintenance', 'edit');
    const [filterPriority, setFilterPriority] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Modal State
    const [reviewTask, setReviewTask] = useState<Task | null>(null);
    const [detailTask, setDetailTask] = useState<Task | null>(null);

    const filteredTasks = useMemo(() => {
        return tasks.filter(t => {
            const matchesPriority = filterPriority === 'All' || t.priority === filterPriority;
            const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  t.property.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                  t.assignedTo.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesPriority && matchesSearch;
        });
    }, [tasks, filterPriority, searchQuery]);

    // AUTOMATED REIMBURSEMENT INVOICING TRIGGER FOR LANDLORD
    const triggerInvoiceIfCompleted = (task: Task, targetStatus: TaskStatus) => {
        const isTargetCompleted = targetStatus === TaskStatus.Completed || targetStatus === TaskStatus.Closed;
        const isCurrentCompleted = task.status === TaskStatus.Completed || task.status === TaskStatus.Closed;
        
        if (isTargetCompleted && !isCurrentCompleted) {
            // Task completed, check payment options
            if (task.paymentMethod === 'AgencyPaysInvoice') {
                // Prevent duplicate invoicing using short Task ID
                const alreadyInvoiced = invoices.some(inv => inv.invoiceNumber?.includes(task.id.slice(-6)));
                if (alreadyInvoiced) return;

                // Match landlord of the property
                const prop = properties.find(p => p.name === task.property);
                const landlord = prop ? landlords.find(l => l.id === prop.landlordId) : null;
                const landlordName = landlord ? landlord.name : (prop ? `Landlord of ${prop.name}` : 'Property Landlord');
                
                const laborCost = task.costs?.labor || 0;
                const materialsCost = task.costs?.materials || 0;
                const travelCost = task.costs?.travel || 0;
                const totalCost = laborCost + materialsCost + travelCost;

                if (totalCost > 0) {
                    const invoiceId = `inv-out-${Date.now()}`;
                    const invNo = `REIMB-${task.id.slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

                    const newInvoice = {
                        id: invoiceId,
                        invoiceNumber: invNo,
                        category: 'Outbound' as const,
                        tenantName: landlordName,
                        email: landlord?.email || '',
                        phone: landlord?.phone || '',
                        billingAddress: prop ? `${prop.name} - Reimbursement` : 'Property Reimbursement',
                        amount: totalCost,
                        dueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0], // 7 Days due
                        status: 'Due' as const,
                        items: [
                            { description: `Labor Reimbursement: ${task.title}`, amount: laborCost, quantity: 1, unitPrice: laborCost },
                            { description: `Materials Reimbursement for ${task.title}`, amount: materialsCost, quantity: 1, unitPrice: materialsCost },
                            { description: `Travel / Logistical Coordination`, amount: travelCost, quantity: 1, unitPrice: travelCost }
                        ].filter(item => item.amount > 0)
                    };

                    addInvoice(newInvoice);
                    
                    // Add systemic comment on task history
                    updateTask(task.id, {
                        history: [
                            ...(task.history || []),
                            { 
                                id: `h-${Date.now()}`, 
                                timestamp: new Date().toLocaleString(), 
                                event: `Reimbursement Invoice generated to landlord. Invoice No: ${invNo}. Amount: KES ${totalCost.toLocaleString()}` 
                            }
                        ]
                    });

                    // Immediate feedback
                    alert(`💰 [Partial RMS Auto-Invoicing] Outbound Invoice ${invNo} of KES ${totalCost.toLocaleString()} generated to Landlord ${landlordName} for upfront maintenance reimbursements.`);
                }
            }
        }
    };

    const handleMoveTask = (task: Task, newStatus: TaskStatus) => {
        if (!canEdit) return alert('You do not have permission to update work orders.');
        
        // Under Partial RMS, check if there is an unapproved high-cost quotation over 5,000 before proceeding to progress
        const quote = quotations.find(q => q.taskId === task.id);
        if (newStatus === TaskStatus.InProgress && quote && quote.totalAmount > 5000 && task.landlordApproval !== 'Approved') {
            alert(`🚫 Action Denied: Quotation cost is KES ${quote.totalAmount.toLocaleString()} (> KES 5,000). You must obtain digital Landlord Approval before marking this task as 'In Progress'.`);
            return;
        }

        triggerInvoiceIfCompleted(task, newStatus);
        updateTask(task.id, { status: newStatus });
    };

    const handleQuoteDecision = (status: 'Approved' | 'Rejected', notes: string) => {
        if (!canEdit) return alert('You do not have permission to approve/reject quotes.');
        if (!reviewTask) return;
        const quote = quotations.find(q => q.taskId === reviewTask.id);
        if (quote) {
            updateQuotation(quote.id, { status, notes });
            
            if (status === 'Approved') {
                const requiresLandlordApproval = quote.totalAmount > 5000;
                
                updateTask(reviewTask.id, { 
                     history: [
                         ...reviewTask.history, 
                         { 
                             id: `h-${Date.now()}`, 
                             timestamp: new Date().toLocaleString(), 
                             event: `Quote Approved by Admin. Cost: ${quote.totalAmount}. ${requiresLandlordApproval ? 'Pending Landlord Portal Approval (Above KES 5,000).' : ''}` 
                         }
                     ],
                     costs: { labor: quote.totalAmount, materials: 0, travel: 0 },
                     landlordApproval: requiresLandlordApproval ? 'Pending' : 'N/A'
                });

                if (requiresLandlordApproval) {
                    alert(`⚠️ Quotation exceeds KES 5,000 threshold. Under Partial RMS rules, this task has been locked until the digital Landlord Approval is logged!`);
                }
            }
        }
        setReviewTask(null);
    };

    const handleUpdateTask = (updated: Task) => {
        const original = tasks.find(t => t.id === updated.id);
        if (original) {
            triggerInvoiceIfCompleted(original, updated.status);
        }
        updateTask(updated.id, updated);
        setDetailTask(null);
    }

    return (
        <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
            <button onClick={() => window.location.hash = '#/partial-rms/field-operations/maintenance'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors flex-shrink-0 w-fit">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Maintenance
            </button>
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 flex-shrink-0">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Work Orders Board</h1>
                    <p className="text-lg text-gray-500 mt-1">Drag and drop management of field operations.</p>
                </div>
                <div className="flex gap-3">
                     <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Search tasks..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 border rounded-lg focus:ring-primary focus:border-primary w-64"
                        />
                        <div className="absolute left-3 top-2.5 text-gray-400"><Icon name="search" className="w-4 h-4" /></div>
                    </div>
                    <select 
                        value={filterPriority} 
                        onChange={(e) => setFilterPriority(e.target.value)} 
                        className="p-2 border rounded-lg bg-white"
                    >
                        <option value="All">All Priorities</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                    </select>
                </div>
            </div>
            
            <div className="flex-grow overflow-x-auto pb-4">
                <div className="flex gap-6 h-full min-w-[1200px]">
                    <KanbanColumn 
                        title="To Do / Issued" 
                        tasks={filteredTasks.filter(t => t.status === TaskStatus.Issued || t.status === TaskStatus.Received)} 
                        status={TaskStatus.Issued}
                        onMove={handleMoveTask}
                        color="border-gray-400"
                        onReviewQuote={setReviewTask}
                        quotations={quotations}
                        onTaskClick={setDetailTask}
                    />
                    <KanbanColumn 
                        title="In Progress" 
                        tasks={filteredTasks.filter(t => t.status === TaskStatus.InProgress)} 
                        status={TaskStatus.InProgress}
                        onMove={handleMoveTask}
                        color="border-blue-500"
                        quotations={quotations}
                        onTaskClick={setDetailTask}
                    />
                    <KanbanColumn 
                        title="Review / QC" 
                        tasks={filteredTasks.filter(t => t.status === TaskStatus.Pending)} 
                        status={TaskStatus.Pending}
                        onMove={handleMoveTask}
                        color="border-yellow-500"
                        quotations={quotations}
                        onTaskClick={setDetailTask}
                    />
                    <KanbanColumn 
                        title="Completed" 
                        tasks={filteredTasks.filter(t => t.status === TaskStatus.Completed || t.status === TaskStatus.Closed)} 
                        status={TaskStatus.Completed}
                        onMove={handleMoveTask}
                        color="border-green-500"
                        quotations={quotations}
                        onTaskClick={setDetailTask}
                    />
                </div>
            </div>

            {reviewTask && (
                <ReviewQuoteModal 
                    task={reviewTask}
                    quote={quotations.find(q => q.taskId === reviewTask.id)!}
                    onClose={() => setReviewTask(null)}
                    onDecision={handleQuoteDecision}
                />
            )}

            {detailTask && (
                <TaskDetailModal 
                    task={detailTask} 
                    onClose={() => setDetailTask(null)}
                    onUpdate={handleUpdateTask}
                />
            )}
        </div>
    );
};

export default WorkOrders;
