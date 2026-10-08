
import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { Task, TaskStatus, TaskPriority, Quotation } from '../../types';
import Icon from '../Icon';

const ReviewQuoteModal: React.FC<{ 
    quote: Quotation; 
    task: Task; 
    onClose: () => void; 
    onDecision: (status: 'Approved' | 'Rejected', notes: string) => void;
}> = ({ quote, task, onClose, onDecision }) => {
    const [reviewNotes, setReviewNotes] = useState('');

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1500] p-4 backdrop-blur-sm">
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
                                <li key={i}>{item.description} - KES {Number(item.amount ?? 0).toLocaleString()}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="flex justify-between items-center mt-4 pt-2 border-t font-bold text-lg">
                        <span>Total Quote:</span>
                        <span className="text-blue-600">KES {Number(quote.totalAmount ?? 0).toLocaleString()}</span>
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
}> = ({ title, tasks, status, onMove, color, onReviewQuote, quotations }) => {
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
                        <div key={task.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-all group relative">
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
                                        onClick={() => onReviewQuote && onReviewQuote(task)}
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
                                            onClick={() => onMove(task, getNextStatus(status))}
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
    const { tasks, updateTask, quotations, updateQuotation, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canEdit = isSuperAdmin || checkPermission('Maintenance', 'edit');
    const [filterPriority, setFilterPriority] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Modal State
    const [reviewTask, setReviewTask] = useState<Task | null>(null);

    const filteredTasks = useMemo(() => {
        return tasks.filter(t => {
            const matchesPriority = filterPriority === 'All' || t.priority === filterPriority;
            const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  t.property.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                  t.assignedTo.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesPriority && matchesSearch;
        });
    }, [tasks, filterPriority, searchQuery]);

    const handleMoveTask = (task: Task, newStatus: TaskStatus) => {
        if (!canEdit) return alert('You do not have permission to update work orders.');
        updateTask(task.id, { status: newStatus });
    };

    const handleQuoteDecision = (status: 'Approved' | 'Rejected', notes: string) => {
        if (!canEdit) return alert('You do not have permission to approve/reject quotes.');
        if (!reviewTask) return;
        const quote = quotations.find(q => q.taskId === reviewTask.id);
        if (quote) {
            updateQuotation(quote.id, { status, notes });
            
            // If approved, update task history?
            if (status === 'Approved') {
                updateTask(reviewTask.id, { 
                     // Keep status as Issued or whatever it was, contractor will move to InProgress
                     history: [...reviewTask.history, { id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: `Quote Approved by Admin. Cost: ${quote.totalAmount}` }],
                     costs: { labor: quote.totalAmount, materials: 0, travel: 0 } // Simple cost tracking update
                });
            }
        }
        setReviewTask(null);
    };

    return (
        <div className="space-y-6 h-[calc(100vh-140px)] flex flex-col">
            <button onClick={() => window.location.hash = '#/field-operations/maintenance'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors flex-shrink-0 w-fit">
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
                    />
                    <KanbanColumn 
                        title="In Progress" 
                        tasks={filteredTasks.filter(t => t.status === TaskStatus.InProgress)} 
                        status={TaskStatus.InProgress}
                        onMove={handleMoveTask}
                        color="border-blue-500"
                        quotations={quotations}
                    />
                    <KanbanColumn 
                        title="Review / QC" 
                        tasks={filteredTasks.filter(t => t.status === TaskStatus.Pending)} 
                        status={TaskStatus.Pending}
                        onMove={handleMoveTask}
                        color="border-yellow-500"
                        quotations={quotations}
                    />
                    <KanbanColumn 
                        title="Completed" 
                        tasks={filteredTasks.filter(t => t.status === TaskStatus.Completed || t.status === TaskStatus.Closed)} 
                        status={TaskStatus.Completed}
                        onMove={handleMoveTask}
                        color="border-green-500"
                        quotations={quotations}
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
        </div>
    );
};

export default WorkOrders;
