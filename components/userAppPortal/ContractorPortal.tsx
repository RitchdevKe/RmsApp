
import React, { useState, useMemo } from 'react';
import * as LucideIcons from 'lucide-react';

import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { Task, TaskStatus, QuotationItem, Quotation, Bill, TaskPriority } from '../../types';
import AdBanners from './AdBanners';
import ReferralFliers from './ReferralFliers';
import ReferralCalculator from './ReferralCalculator';
import ReferTenantModal from './ReferTenantModal';
import { generateUserReferralCode } from '../../utils/referralCode';
import PortalShell from './PortalShell';
import { usePortalGrowthActions } from './PortalGrowthModals';
import { useStandardWalletCards } from './walletCards';
import { getTodayIsoDate } from '../../utils/timezone';

const SubmitQuoteModal: React.FC<{ 
    task: Task; 
    contractorName: string;
    existingQuote?: Quotation;
    onClose: () => void; 
    onSubmit: (items: QuotationItem[], total: number, notes: string) => void; 
}> = ({ task, contractorName, existingQuote, onClose, onSubmit }) => {
    const [items, setItems] = useState<QuotationItem[]>(existingQuote?.items || [{ description: '', amount: 0, type: 'Labor' }]);
    const [notes, setNotes] = useState(existingQuote?.notes || '');

    const handleItemChange = (index: number, field: keyof QuotationItem, value: any) => {
        const newItems = [...items];
        (newItems[index] as any)[field] = value;
        setItems(newItems);
    };

    const addItem = () => setItems([...items, { description: '', amount: 0, type: 'Materials' }]);
    const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

    const total = items.reduce((sum, i) => sum + (parseFloat(i.amount as any) || 0), 0);

    const handleSubmit = () => {
        if (total <= 0) return alert("Please add at least one item with an amount.");
        onSubmit(items, total, notes);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-2">{existingQuote ? 'Amend Quotation' : 'Submit Quotation'}</h2>
                <p className="text-sm text-gray-500 mb-4">For Task: <strong>{task.title}</strong></p>
                
                {existingQuote && existingQuote.status === 'Rejected' && (
                    <div className="bg-red-50 p-3 rounded mb-4 text-sm text-red-800 border border-red-200">
                        <strong>Feedback:</strong> Please review your pricing. (Admin note simulation)
                    </div>
                )}

                <div className="max-h-60 overflow-y-auto mb-4 border rounded p-2 bg-gray-50">
                    {items.map((item, idx) => (
                        <div key={idx} className="flex gap-2 mb-2 items-center">
                            <select 
                                value={item.type} 
                                onChange={e => handleItemChange(idx, 'type', e.target.value)}
                                className="p-2 border rounded text-sm w-24"
                            >
                                <option>Labor</option>
                                <option>Materials</option>
                                <option>Travel</option>
                            </select>
                            <input 
                                placeholder="Description" 
                                value={item.description} 
                                onChange={e => handleItemChange(idx, 'description', e.target.value)}
                                className="flex-grow p-2 border rounded text-sm"
                            />
                            <input 
                                type="number" 
                                placeholder="Amount" 
                                value={item.amount} 
                                onChange={e => handleItemChange(idx, 'amount', parseFloat(e.target.value))}
                                className="w-24 p-2 border rounded text-sm text-right"
                            />
                            <button onClick={() => removeItem(idx)} className="text-red-500 font-bold px-2 hover:bg-red-50 rounded">&times;</button>
                        </div>
                    ))}
                    <button onClick={addItem} className="text-sm text-primary hover:underline font-bold mt-1">+ Add Line Item</button>
                </div>
                
                <div className="flex justify-end items-center mb-4 border-t pt-2">
                    <span className="font-bold mr-2 text-gray-600">Total Quote:</span>
                    <span className="text-xl font-extrabold text-green-600">KES {total.toLocaleString()}</span>
                </div>

                <textarea 
                    placeholder="Additional notes for the manager..." 
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full p-3 border rounded-lg mb-4 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    rows={3}
                />

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 font-bold rounded hover:bg-gray-200">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2 bg-primary text-white font-bold rounded hover:bg-primary-dark shadow-sm">Submit Quote</button>
                </div>
            </div>
        </div>
    );
};

const InvoiceModal: React.FC<{
    task: Task;
    quote: Quotation;
    onClose: () => void;
    onRaise: (amount: number, details: string) => void;
}> = ({ task, quote, onClose, onRaise }) => {
    const [details, setDetails] = useState('');
    
    return (
        <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4 text-gray-800">Raise Invoice</h2>
                
                <div className="bg-blue-50 p-4 rounded-lg mb-4 border border-blue-100">
                    <div className="flex justify-between mb-2">
                        <span className="text-sm text-gray-600">Task:</span>
                        <span className="font-bold text-gray-800">{task.title}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Approved Amount:</span>
                        <span className="font-bold text-blue-600">KES {quote.totalAmount.toLocaleString()}</span>
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Details / Bank Info</label>
                    <textarea 
                        value={details}
                        onChange={e => setDetails(e.target.value)}
                        placeholder="e.g. Bank Name, Account Number, MPesa..."
                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                        rows={3}
                    />
                </div>

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded font-medium">Cancel</button>
                    <button onClick={() => onRaise(quote.totalAmount, details)} className="px-6 py-2 bg-green-600 text-white font-bold rounded shadow-sm hover:bg-green-700">Send Invoice</button>
                </div>
            </div>
        </div>
    );
};

const ContractorPortal: React.FC = () => {
    const { vendors, tasks, updateTask, quotations, addQuotation, updateQuotation, addBill, currentUser } = useData();

    const vendor = useMemo(() => {
        if (!vendors.length) return undefined;
        if (currentUser) {
            const byId = vendors.find(v => v.id === currentUser.id);
            if (byId) return byId;
            const em = (currentUser.email || '').toLowerCase();
            if (em) {
                const byEmail = vendors.find(v => (v.email || '').toLowerCase() === em);
                if (byEmail) return byEmail;
            }
        }
        return vendors[0];
    }, [vendors, currentUser]);

    // Tabs
    const [activeTab, setActiveTab] = useState<'Jobs' | 'Quotations' | 'Invoices'>('Jobs');

    // Modals
    const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [isReferModalOpen, setIsReferModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);

    const myTasks = useMemo(() => {
        if (!vendor) return [];
        return tasks.filter(t => t.assignedTo === vendor.name);
    }, [tasks, vendor]);

    // Derived Lists
    const activeJobs = myTasks.filter(t => t.status === 'In Progress');
    const pendingReviewJobs = myTasks.filter(t => t.status === 'Issued' || t.status === 'Received'); // New assignments
    const completedJobs = myTasks.filter(t => t.status === 'Completed' || t.status === 'Closed');

    const myQuotations = useMemo(() => {
        if (!vendor) return [];
        return quotations.filter(q => q.contractorName === vendor.name);
    }, [quotations, vendor]);

    // Helper to check if a task has a quote
    const getQuoteForTask = (taskId: string) => myQuotations.find(q => q.taskId === taskId);

    // --- ACTIONS ---

    const handleSubmitQuote = (items: QuotationItem[], total: number, notes: string) => {
        if (!selectedTask || !vendor) return;

        const existingQuote = getQuoteForTask(selectedTask.id);

        if (existingQuote) {
            // Update existing
            updateQuotation(existingQuote.id, { 
                items, 
                totalAmount: total, 
                notes, 
                status: 'Pending', // Resubmit for review
                submittedDate: getTodayIsoDate()
            });
            alert(`Quotation for ${selectedTask.title} updated and resubmitted.`);
        } else {
            // Create new
            const newQuote: Quotation = {
                id: `qt-${Date.now()}`,
                taskId: selectedTask.id,
                contractorName: vendor.name,
                totalAmount: total,
                items,
                status: 'Pending',
                notes,
                submittedDate: getTodayIsoDate()
            };
            addQuotation(newQuote);
            alert(`Quotation for KES ${total.toLocaleString()} submitted successfully!`);
        }
        setIsQuoteModalOpen(false);
        setSelectedTask(null);
    };

    const handleStartJob = (task: Task) => {
        const quote = getQuoteForTask(task.id);
        if (quote && quote.status === 'Approved') {
            updateTask(task.id, { 
                status: TaskStatus.InProgress,
                history: [...(task.history||[]), { id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: 'Job Started by Contractor' }]
            });
        } else {
            alert("Cannot start job. Quotation not yet approved.");
        }
    };

    const handleMarkComplete = (task: Task) => {
        if (confirm("Are you sure this job is complete? This will notify the admin for inspection.")) {
             updateTask(task.id, { 
                 status: TaskStatus.Completed,
                 history: [...(task.history||[]), { id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: 'Marked Completed by Contractor' }]
             });
             alert("Job marked as complete. You can now raise an invoice.");
        }
    };

    const handleRaiseInvoice = (amount: number, details: string) => {
        if (!selectedTask || !vendor) return;
        
        const newBill: Bill = {
            id: `inv-${Date.now()}`,
            vendor: vendor.name,
            category: 'Maintenance',
            amount: amount,
            invoiceDate: getTodayIsoDate(),
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Net 14
            status: 'Unpaid',
            propertyId: 'General', // Would link to task property in real app
            description: `Inv for Task: ${selectedTask.title}. Details: ${details}`,
            metadata: { taskId: selectedTask.id }
        };

        addBill(newBill);
        setIsInvoiceModalOpen(false);
        setSelectedTask(null);
        alert("Invoice raised successfully! Sent to Finance.");
    };

    if (!vendor) {
        return (
            <div className="p-8 text-center text-gray-600">
                {vendors.length === 0
                    ? 'No contractor profile found. Ask an admin to register your vendor account.'
                    : 'Loading contractor profile...'}
            </div>
        );
    }

    const growth = usePortalGrowthActions();
    const walletTrio = useStandardWalletCards(growth);

    return (
        <div className="space-y-3 pb-16">
            <PortalShell
                cards={[
                    {
                        label: 'Active Jobs',
                        value: activeJobs.length.toString(),
                        sublabel: `${completedJobs.length} completed all-time`,
                        iconNode: <LucideIcons.HardHat className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-sky-700 via-sky-800 to-indigo-900',
                        trend: activeJobs.length > 0 ? 'In progress' : 'Idle',
                        trendTone: activeJobs.length > 0 ? 'up' : 'neutral',
                        onClick: () => setActiveTab('Jobs'),
                    },
                    ...walletTrio,
                    {
                        label: 'Vendor Rating',
                        value: `${vendor.rating} ★`,
                        sublabel: vendor.specialty,
                        iconNode: <LucideIcons.Award className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-slate-900 via-slate-800 to-slate-700',
                    },
                ]}
                actions={[
                    { label: 'My Jobs',      iconNode: <LucideIcons.Wrench className="w-full h-full" strokeWidth={1.8} />,        onClick: () => setActiveTab('Jobs'), badge: activeJobs.length || undefined },
                    { label: 'Quotations',   iconNode: <LucideIcons.FileText className="w-full h-full" strokeWidth={1.8} />,      onClick: () => setActiveTab('Quotations') },
                    { label: 'Completed',    iconNode: <LucideIcons.CheckCircle2 className="w-full h-full" strokeWidth={1.8} />,  onClick: () => setActiveTab('Jobs') },
                    { label: 'Refer Tenant', iconNode: <LucideIcons.UserPlus className="w-full h-full" strokeWidth={1.8} />,      onClick: () => setIsReferModalOpen(true) },
                    ...growth.actions,
                ]}
                metrics={[
                    { label: 'Specialty', value: vendor.specialty || '—' },
                    { label: 'Active',    value: activeJobs.length.toString(), tone: 'text-blue-600' },
                    { label: 'Done',      value: completedJobs.length.toString(), tone: 'text-emerald-600' },
                    { label: 'Rating',    value: `${vendor.rating} ★`, tone: 'text-amber-600' },
                ]}
            />
            {growth.modals}


            {/* Tabs */}
            <div className="flex gap-2 bg-gray-100 p-1 rounded-2xl w-fit">
                {['Jobs', 'Quotations'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        className={`px-6 py-2 rounded-xl text-sm font-bold transition-all ${activeTab === tab ? 'bg-white shadow text-primary' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {activeTab === 'Jobs' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Active Jobs */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-gray-700 uppercase text-sm tracking-wider border-b pb-2 flex justify-between">
                            Active Jobs 
                            <span className="bg-blue-100 text-blue-700 px-2 rounded-full text-xs flex items-center">{activeJobs.length}</span>
                        </h3>
                        {activeJobs.length > 0 ? activeJobs.map(task => (
                            <div key={task.id} className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500 hover:shadow-md transition-all">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-bold text-gray-800">{task.title}</h4>
                                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">In Progress</span>
                                </div>
                                <p className="text-sm text-gray-600 mb-3">{task.property} - {task.tenant.unit}</p>
                                <p className="text-xs text-gray-500 mb-4 bg-gray-50 p-2 rounded">{task.description}</p>
                                
                                <div className="flex gap-2">
                                    <button className="flex-1 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded hover:bg-gray-200">Log Update</button>
                                    <button onClick={() => handleMarkComplete(task)} className="flex-1 py-2 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700">Mark Complete</button>
                                </div>
                            </div>
                        )) : <p className="text-gray-400 text-sm italic py-4">No jobs currently in progress.</p>}
                    </div>

                    {/* Pending Requests / New Assignments */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-gray-700 uppercase text-sm tracking-wider border-b pb-2 flex justify-between">
                            New Assignments 
                            <span className="bg-yellow-100 text-yellow-700 px-2 rounded-full text-xs flex items-center">{pendingReviewJobs.length}</span>
                        </h3>
                        {pendingReviewJobs.length > 0 ? pendingReviewJobs.map(task => {
                            const quote = getQuoteForTask(task.id);
                            return (
                                <div key={task.id} className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-yellow-500 hover:shadow-md transition-all">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-gray-800">{task.title}</h4>
                                        <span className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded font-bold">New</span>
                                    </div>
                                    <p className="text-sm text-gray-600 mb-3">{task.property} - {task.tenant.unit}</p>
                                    
                                    {/* Workflow Status Logic */}
                                    <div className="mt-3">
                                        {!quote ? (
                                            <button 
                                                onClick={() => { setSelectedTask(task); setIsQuoteModalOpen(true); }} 
                                                className="w-full py-2 bg-white border border-gray-300 text-gray-700 text-xs font-bold rounded hover:bg-gray-50"
                                            >
                                                Submit Quote
                                            </button>
                                        ) : quote.status === 'Pending' ? (
                                            <div className="text-center p-2 bg-yellow-50 rounded text-xs text-yellow-700 font-bold border border-yellow-200">
                                                Quote Under Review (KES {quote.totalAmount.toLocaleString()})
                                            </div>
                                        ) : quote.status === 'Approved' ? (
                                            <div className="space-y-2">
                                                <div className="text-center p-1 text-xs text-green-600 font-bold flex items-center justify-center">
                                                    <Icon name="check" className="w-3 h-3 mr-1"/> Quote Approved
                                                </div>
                                                <button 
                                                    onClick={() => handleStartJob(task)} 
                                                    className="w-full py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 shadow-sm"
                                                >
                                                    Start Job
                                                </button>
                                            </div>
                                        ) : quote.status === 'Rejected' ? (
                                            <div className="space-y-2">
                                                 <div className="text-center p-1 text-xs text-red-600 font-bold">
                                                    Quote Rejected - Action Needed
                                                </div>
                                                <button 
                                                    onClick={() => { setSelectedTask(task); setIsQuoteModalOpen(true); }} 
                                                    className="w-full py-2 bg-red-50 text-red-700 border border-red-200 text-xs font-bold rounded hover:bg-red-100"
                                                >
                                                    Amend Quote
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        }) : <p className="text-gray-400 text-sm italic py-4">No new requests.</p>}
                    </div>

                    {/* Completed / Ready for Invoice */}
                    <div className="space-y-4 md:col-span-2">
                        <h3 className="font-bold text-gray-700 uppercase text-sm tracking-wider border-b pb-2">Ready for Invoice</h3>
                        {completedJobs.filter(t => t.status === 'Completed').length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {completedJobs.filter(t => t.status === 'Completed').map(task => (
                                    <div key={task.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex justify-between items-center">
                                        <div>
                                            <h4 className="font-bold text-gray-800 text-sm">{task.title}</h4>
                                            <p className="text-xs text-green-600 font-bold">Work Completed</p>
                                        </div>
                                        <button 
                                            onClick={() => { 
                                                const q = getQuoteForTask(task.id);
                                                if(q) { setSelectedTask(task); setIsInvoiceModalOpen(true); }
                                            }} 
                                            className="px-4 py-2 bg-green-600 text-white text-xs font-bold rounded shadow-sm hover:bg-green-700"
                                        >
                                            Raise Invoice
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="text-gray-400 text-sm italic py-4">No completed jobs waiting for invoicing.</p>}
                    </div>
                </div>
            )}

            {activeTab === 'Quotations' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Quotation History</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-2">Date</th>
                                    <th className="px-4 py-2">Task</th>
                                    <th className="px-4 py-2 text-right">Amount</th>
                                    <th className="px-4 py-2 text-center">Status</th>
                                    <th className="px-4 py-2">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {myQuotations.map(quote => {
                                    const t = tasks.find(t => t.id === quote.taskId);
                                    return (
                                        <tr key={quote.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-gray-600">{quote.submittedDate}</td>
                                            <td className="px-4 py-3 font-medium text-gray-800">{t ? t.title : 'Unknown Task'}</td>
                                            <td className="px-4 py-3 text-right font-mono">KES {quote.totalAmount.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                                    quote.status === 'Approved' ? 'bg-green-100 text-green-800' :
                                                    quote.status === 'Rejected' ? 'bg-red-100 text-red-800' :
                                                    'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                    {quote.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{quote.notes}</td>
                                        </tr>
                                    );
                                })}
                                {myQuotations.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-gray-400">No quotations found.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            
            {isQuoteModalOpen && selectedTask && (
                <SubmitQuoteModal 
                    task={selectedTask} 
                    contractorName={vendor.name}
                    existingQuote={getQuoteForTask(selectedTask.id)}
                    onClose={() => { setIsQuoteModalOpen(false); setSelectedTask(null); }} 
                    onSubmit={handleSubmitQuote} 
                />
            )}

            {isInvoiceModalOpen && selectedTask && (
                <InvoiceModal 
                    task={selectedTask} 
                    quote={getQuoteForTask(selectedTask.id)!}
                    onClose={() => { setIsInvoiceModalOpen(false); setSelectedTask(null); }} 
                    onRaise={handleRaiseInvoice} 
                />
            )}

            {isReferModalOpen && (
                <ReferTenantModal
                    referrerId={vendor.id}
                    referralCode={(vendor as any).referralCode || generateUserReferralCode(vendor.name, vendor.id)}
                    onClose={() => setIsReferModalOpen(false)}
                />
            )}

            {/* Earn-with-referrals fliers */}
            <ReferralFliers />
            <ReferralCalculator />

            {/* Advert Banners */}
            <AdBanners section="listings" />
        </div>
    );
};

export default ContractorPortal;
