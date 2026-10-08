
import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { TaskStatus, TaskPriority, Task, TenantProfile, Message, CollectionLog, FineItem, Notification } from '@/types';
import Icon from '../Icon';
import { uploadToBucket } from '@/utils/supabaseStorage';
import { supabase } from '../../utils/supabaseClient';
import { fmtDate } from '@/utils/date';
import { getTodayIsoDate } from '../../utils/timezone';

const CURRENT_USER = 'System Admin'; // Simulated logged-in user

// --- EXISTING MODALS (Maintenance) ---

const CreateTaskModal: React.FC<{ onClose: () => void; onSave: (task: Partial<Task>) => void; }> = ({ onClose, onSave }) => {
    const { properties, staff, vendors } = useData();
    const [formData, setFormData] = useState<Partial<Task>>({
        title: '',
        description: '',
        priority: TaskPriority.Medium,
        status: TaskStatus.Issued,
        property: '',
        assignedTo: '',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        tenant: { name: '', unit: '' },
        attachments: []
    });
    const [unitInput, setUnitInput] = useState('');
    const [attachments, setAttachments] = useState<string[]>([]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files) as File[];
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const urls: string[] = [];
                    for (const file of files) {
                        const ext = file.name.split('.').pop() || 'jpg';
                        const path = `${user.id}/maint-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()}.${ext}`;
                        const url = await uploadToBucket('maintenance-photos', path, file);
                        urls.push(url);
                    }
                    setAttachments(prev => [...prev, ...urls]);
                } else {
                    files.forEach(file => {
                        const reader = new FileReader();
                        reader.onloadend = () => setAttachments(prev => [...prev, reader.result as string]);
                        reader.readAsDataURL(file);
                    });
                }
            } catch (err) {
                console.warn('Upload failed, using base64', err);
                files.forEach(file => {
                    const reader = new FileReader();
                    reader.onloadend = () => setAttachments(prev => [...prev, reader.result as string]);
                    reader.readAsDataURL(file);
                });
            }
        }
    };

    const handleSubmit = () => {
        if (!formData.title || !formData.property || !formData.assignedTo) {
            alert("Please fill in Title, Property, and Assigned To");
            return;
        }
        onSave({ 
            ...formData, 
            tenant: { name: 'Tenant', unit: unitInput },
            attachments: attachments
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1500] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Create New Task</h2>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Task Title</label>
                        <input name="title" value={formData.title} onChange={handleChange} className="w-full p-2 border rounded-md" placeholder="e.g. Fix Leaking Tap" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
                            <select name="property" value={formData.property} onChange={handleChange} className="w-full p-2 border rounded-md bg-white">
                                <option value="">Select Property</option>
                                {properties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Unit (Optional)</label>
                            <input value={unitInput} onChange={e => setUnitInput(e.target.value)} className="w-full p-2 border rounded-md" placeholder="e.g. A1" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                            <select name="priority" value={formData.priority} onChange={handleChange} className="w-full p-2 border rounded-md bg-white">
                                {Object.values(TaskPriority).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                            <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} className="w-full p-2 border rounded-md" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Assign To</label>
                        <select name="assignedTo" value={formData.assignedTo} onChange={handleChange} className="w-full p-2 border rounded-md bg-white">
                            <option value="">Select Staff or Vendor</option>
                            <optgroup label="Staff">
                                {staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                            </optgroup>
                            <optgroup label="Vendors">
                                {vendors.map(v => <option key={v.id} value={v.name}>{v.name} ({v.specialty})</option>)}
                            </optgroup>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea name="description" value={formData.description} onChange={handleChange} className="w-full p-2 border rounded-md" rows={3} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Initial Attachments</label>
                        <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"/>
                        {attachments.length > 0 && <p className="text-xs text-green-600 mt-1">{attachments.length} images selected</p>}
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-md text-gray-700 hover:bg-gray-200">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark">Create Task</button>
                </div>
            </div>
        </div>
    );
};

const CompleteTaskModal: React.FC<{ task: Task; onClose: () => void; onComplete: (taskId: string, completionImages: string[], notes: string) => void; }> = ({ task, onClose, onComplete }) => {
    const [notes, setNotes] = useState('');
    const [images, setImages] = useState<string[]>([]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files) as File[];
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    const urls: string[] = [];
                    for (const file of files) {
                        const ext = file.name.split('.').pop() || 'jpg';
                        const path = `${user.id}/complete-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()}.${ext}`;
                        const url = await uploadToBucket('maintenance-photos', path, file);
                        urls.push(url);
                    }
                    setImages(prev => [...prev, ...urls]);
                } else {
                    files.forEach(file => {
                        const reader = new FileReader();
                        reader.onloadend = () => setImages(prev => [...prev, reader.result as string]);
                        reader.readAsDataURL(file);
                    });
                }
            } catch (err) {
                console.warn('Upload failed, using base64', err);
                files.forEach(file => {
                    const reader = new FileReader();
                    reader.onloadend = () => setImages(prev => [...prev, reader.result as string]);
                    reader.readAsDataURL(file);
                });
            }
        }
    };

    const handleSubmit = () => {
        if (images.length === 0) {
            alert("You must upload at least one image as proof of completion.");
            return;
        }
        onComplete(task.id, images, notes);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1500] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                <h2 className="text-xl font-bold mb-4 text-gray-800">Complete Task: {task.title}</h2>
                <div className="space-y-4">
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                        <strong>Proof of Work Required:</strong> Please upload images of the completed maintenance task to proceed.
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Upload Completion Photos*</label>
                        <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"/>
                        <div className="flex gap-2 mt-2 flex-wrap">
                            {images.map((img, idx) => (
                                <img key={idx} src={img} alt="proof" className="w-12 h-12 object-cover rounded border" />
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Completion Notes</label>
                        <textarea 
                            value={notes} 
                            onChange={e => setNotes(e.target.value)} 
                            className="w-full p-2 border rounded-md" 
                            rows={3} 
                            placeholder="Describe work done..."
                        />
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-md text-gray-700 hover:bg-gray-200">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 shadow-sm font-bold">Mark Completed</button>
                </div>
            </div>
        </div>
    );
};

const TaskDetailModal: React.FC<{ task: Task; onClose: () => void; onUpdate: (t: Task) => void }> = ({ task, onClose, onUpdate }) => {
    const { staff, vendors } = useData();
    const [editedTask, setEditedTask] = useState<Task>(task);
    const [note, setNote] = useState('');
    const [isEscalating, setIsEscalating] = useState(false);
    const [escalationData, setEscalationData] = useState({ assignee: '', reason: '' });
    
    // Rework State
    const [isReworking, setIsReworking] = useState(false);
    const [reworkReason, setReworkReason] = useState('');

    const handleChange = (e: any) => {
        const { name, value } = e.target;
        setEditedTask(prev => ({ ...prev, [name]: value }));
    };

    const handleAddNote = () => {
        if (!note.trim()) return;
        const newComment = { user: CURRENT_USER, text: note, date: new Date().toLocaleString() }; 
        const updated = { ...editedTask, comments: [...(editedTask.comments || []), newComment] };
        setEditedTask(updated);
        setNote('');
    };

    const handleEscalate = () => {
        if (!escalationData.assignee || !escalationData.reason) return alert("Assignee and reason required");
        
        const historyEntry = {
            id: `h-${Date.now()}`,
            timestamp: new Date().toLocaleString(),
            event: `Escalated by ${CURRENT_USER} from ${task.assignedTo || 'Unassigned'} to ${escalationData.assignee}. Reason: ${escalationData.reason}`
        };

        const updated = {
            ...editedTask,
            assignedTo: escalationData.assignee,
            priority: TaskPriority.VeryHigh,
            status: TaskStatus.Escalated,
            history: [...(editedTask.history || []), historyEntry]
        };
        
        onUpdate(updated);
        onClose();
    };

    const handleRework = () => {
         if (!reworkReason.trim()) return alert("Please provide a reason for rework.");

         const historyEntry = {
            id: `h-${Date.now()}`,
            timestamp: new Date().toLocaleString(),
            event: `Rework Requested by Tenant (Logged by ${CURRENT_USER}). Reason: ${reworkReason}`
        };

        const updated = {
            ...editedTask,
            status: TaskStatus.InProgress, // Re-open task
            history: [...(editedTask.history || []), historyEntry]
        };
        onUpdate(updated);
        setIsReworking(false);
        setReworkReason('');
        alert("Task flagged for rework and status updated to 'In Progress'.");
    };

    const handleSave = () => {
        onUpdate(editedTask);
        onClose();
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1500] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between mb-4">
                    <h2 className="text-xl font-bold">Manage Task</h2>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5" /></button>
                </div>

                <div className="space-y-4">
                    <input name="title" value={editedTask.title} onChange={handleChange} className="w-full font-bold text-lg border-b p-1" />
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                             <label className="block text-xs font-bold text-gray-500 uppercase">Status</label>
                             <select name="status" value={editedTask.status} onChange={handleChange} className="w-full p-2 border rounded">
                                {Object.values(TaskStatus).map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-gray-500 uppercase">Priority</label>
                             <select name="priority" value={editedTask.priority} onChange={handleChange} className="w-full p-2 border rounded">
                                {Object.values(TaskPriority).map(s => <option key={s} value={s}>{s}</option>)}
                             </select>
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase">Description</label>
                        <textarea name="description" value={editedTask.description} onChange={handleChange} className="w-full p-2 border rounded" rows={3}/>
                    </div>

                    <div className="border-t pt-4 flex flex-wrap gap-4">
                         <button onClick={() => setIsEscalating(!isEscalating)} className="text-red-600 font-bold text-sm flex items-center hover:underline">
                            <Icon name="task-escalated" className="w-4 h-4 mr-1"/> Escalate Task
                         </button>

                         {editedTask.status === TaskStatus.Completed && (
                             <button onClick={() => setIsReworking(!isReworking)} className="text-orange-600 font-bold text-sm flex items-center hover:underline">
                                <Icon name="tools" className="w-4 h-4 mr-1"/> Request Rework (Tenant)
                             </button>
                         )}
                    </div>
                    
                    {isEscalating && (
                        <div className="mt-2 bg-red-50 p-4 rounded border border-red-100 animate-fade-in">
                            <label className="block text-xs font-bold text-gray-700 mb-1">New Assignee</label>
                            <select 
                                value={escalationData.assignee} 
                                onChange={e => setEscalationData({...escalationData, assignee: e.target.value})}
                                className="w-full p-2 border rounded mb-2 bg-white"
                            >
                                <option value="">Select Staff/Vendor</option>
                                <optgroup label="Staff">{staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</optgroup>
                                <optgroup label="Vendors">{vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}</optgroup>
                            </select>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Reason</label>
                            <textarea 
                                value={escalationData.reason} 
                                onChange={e => setEscalationData({...escalationData, reason: e.target.value})}
                                className="w-full p-2 border rounded mb-2 bg-white"
                                placeholder="Why is this being escalated?"
                            />
                            <button onClick={handleEscalate} className="bg-red-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-red-700">Confirm Escalation</button>
                        </div>
                    )}

                    {isReworking && (
                        <div className="mt-2 bg-orange-50 p-4 rounded border border-orange-100 animate-fade-in">
                            <label className="block text-xs font-bold text-orange-800 mb-1">Rework Request Details</label>
                            <p className="text-xs text-orange-600 mb-2">This will reopen the task and set status to 'In Progress'.</p>
                            <textarea 
                                value={reworkReason} 
                                onChange={e => setReworkReason(e.target.value)}
                                className="w-full p-2 border rounded mb-2 bg-white"
                                placeholder="Reason for rework (e.g. Leak persists, paint peeling...)"
                            />
                            <button onClick={handleRework} className="bg-orange-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-orange-700">Submit Rework Request</button>
                        </div>
                    )}

                     <div className="border-t pt-4">
                        <h4 className="font-bold text-gray-700 mb-2 text-sm">Audit Log</h4>
                        <div className="max-h-32 overflow-y-auto text-xs space-y-1 bg-gray-50 p-2 rounded">
                            {editedTask.history?.map((h, i) => (
                                <div key={i} className="flex gap-2">
                                    <span className="text-gray-400 font-mono">{h.timestamp}</span>
                                    <span className="text-gray-700">{h.event}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div>
                         <h4 className="font-bold text-gray-700 mb-2 text-sm">Comments</h4>
                         <div className="flex gap-2 mb-2">
                            <input value={note} onChange={e => setNote(e.target.value)} className="flex-grow p-2 border rounded text-sm" placeholder="Add note..."/>
                            <button onClick={handleAddNote} className="px-3 bg-gray-200 rounded text-sm font-bold">Add</button>
                         </div>
                         <div className="space-y-2 max-h-40 overflow-y-auto">
                            {editedTask.comments?.map((c, i) => (
                                <div key={i} className="text-sm bg-gray-50 p-2 rounded border border-gray-100">
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
    )
}

// --- NEW COMPONENT: Comprehensive Collection Manager Modal ---
export const CollectionManagerModal: React.FC<{ 
    tenant: TenantProfile; 
    onClose: () => void;
    onUpdateTenant: (id: string, data: Partial<TenantProfile>) => void;
    onSendMessage: (msg: Message) => void;
}> = ({ tenant, onClose, onUpdateTenant, onSendMessage }) => {
    const { fines: fineRules, addNotification } = useData();
    const [actionType, setActionType] = useState<'Call' | 'Message' | 'Visit'>('Call');
    const [feedback, setFeedback] = useState('');
    const [ptpDate, setPtpDate] = useState('');
    const [outcome, setOutcome] = useState<'Promise to Pay' | 'No Answer' | 'Refusal' | 'Left Message' | 'Paid'>('Promise to Pay');
    const [houseStatus, setHouseStatus] = useState<string[]>(tenant.houseStatus || []);

    const availableStatuses = [
        'Locked', 'Electricity Disconnected', 'Water Disconnected',
        'Gate Access Revoked', 'Gas Disconnected', 'Eviction notice issued', 'Forced eviction', 'Forced Entry'
    ];

    const toggleStatus = (status: string) => {
        setHouseStatus(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
    };

    const handleLogInteraction = () => {
        if (!feedback) return alert("Please enter feedback notes.");

        const log: CollectionLog = {
            id: `log-${Date.now()}`,
            date: new Date().toLocaleString(),
            type: actionType,
            feedback,
            outcome,
            expectedCompletionDate: ptpDate || undefined,
            loggedBy: CURRENT_USER
        };

        const updatedHistory = [log, ...(tenant.collectionHistory || [])];
        
        // Automated Fines Logic
        const oldStatuses = tenant.houseStatus || [];
        const newStatuses = houseStatus;
        const addedStatuses = newStatuses.filter(s => !oldStatuses.includes(s));
        
        let newFines = [...(tenant.outstandingFines || [])];
        let finesAddedCount = 0;

        const applyFine = (type: string, amount: number, description: string) => {
             const fine: FineItem = {
                id: `fine-${Date.now()}-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : '0'}`,
                type: type,
                amount: amount,
                date: getTodayIsoDate(),
                status: 'Pending'
            };
            newFines.push(fine);
            finesAddedCount++;

             addNotification({
                id: `notif-fine-${Date.now()}`,
                title: 'Automated Fine Applied',
                message: `Fine of KES ${amount.toLocaleString()} applied to ${tenant.name} for ${description}.`,
                date: new Date().toLocaleString(),
                read: false,
                type: 'Warning',
                recipientRole: 'Tenant'
            });
        };

        addedStatuses.forEach(status => {
            if (status === 'Forced Entry') {
                const rule = fineRules.find(r => r.type === 'Forced Entry');
                const amount = rule ? rule.value : 2000;
                applyFine('Forced Entry', amount, 'Forced Entry Violation');
            } else if (status === 'Locked' || status === 'House Locked') {
                const rule = fineRules.find(r => r.type === 'House Lock');
                const amount = rule ? rule.value : 500;
                applyFine('House Lock Fee', amount, 'House Locked enforcement');
            } else if (status === 'Electricity Disconnected') {
                const rule = fineRules.find(r => r.type === 'Electricity Reconnection');
                const amount = rule ? rule.value : 200;
                applyFine('Electricity Reconnection Fee', amount, 'Electricity Disconnected');
            } else if (status === 'Water Disconnected') {
                const rule = fineRules.find(r => r.type === 'Water Reconnection');
                const amount = rule ? rule.value : 200;
                applyFine('Water Reconnection Fee', amount, 'Water Disconnected');
            }
        });

        // If message type, also send actual message
        if (actionType === 'Message') {
             const msg: Message = {
                id: `msg-${Date.now()}`,
                recipient: { name: tenant.name, contact: tenant.phone },
                content: feedback,
                channel: 'SMS',
                status: 'Sent',
                timestamp: new Date().toLocaleString(),
                priority: 'High'
            };
            onSendMessage(msg);
        }

        // Update Tenant with new history and house status (if changed)
        onUpdateTenant(tenant.id, { 
            collectionHistory: updatedHistory,
            houseStatus: houseStatus,
            outstandingFines: newFines
        });
        
        let successMsg = "Interaction logged successfully.";
        if (finesAddedCount > 0) successMsg += ` ${finesAddedCount} fine(s) applied automatically.`;
        alert(successMsg);
        
        setFeedback('');
        setPtpDate('');
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1500] p-4 backdrop-blur-sm" onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-red-800 text-lg">Collection Task: {tenant.name}</h3>
                        <p className="text-xs text-red-600">Arrears: KES {tenant.rentAmount.toLocaleString()} • {tenant.unit}</p>
                    </div>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>

                <div className="flex-grow overflow-y-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Interaction Form */}
                        <div className="space-y-4">
                            <h4 className="font-bold text-gray-700 border-b pb-2 mb-2">Log Interaction</h4>
                            
                            <div className="flex gap-2">
                                {['Call', 'Message', 'Visit'].map(t => (
                                    <button 
                                        key={t}
                                        onClick={() => setActionType(t as any)}
                                        className={`flex-1 py-2 text-sm font-bold rounded border ${actionType === t ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-600'}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Outcome</label>
                                <select value={outcome} onChange={e => setOutcome(e.target.value as any)} className="w-full p-2 border rounded bg-white">
                                    <option>Promise to Pay</option>
                                    <option>No Answer</option>
                                    <option>Refusal</option>
                                    <option>Left Message</option>
                                    <option>Paid</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Feedback Notes</label>
                                <textarea 
                                    value={feedback} 
                                    onChange={e => setFeedback(e.target.value)} 
                                    className="w-full p-2 border rounded h-24"
                                    placeholder="Tenant comments, reasons for delay..."
                                ></textarea>
                            </div>

                            {outcome === 'Promise to Pay' && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Expected Payment Date</label>
                                    <input type="date" value={ptpDate} onChange={e => setPtpDate(e.target.value)} className="w-full p-2 border rounded" />
                                </div>
                            )}

                            <button onClick={handleLogInteraction} className="w-full py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700">
                                Save Log
                            </button>
                            
                             {/* Quick Action: Call Button */}
                             <a href={`tel:${tenant.phone}`} className="block text-center w-full py-2 border border-green-500 text-green-600 font-bold rounded hover:bg-green-50 mt-2">
                                <Icon name="communication" className="w-4 h-4 inline mr-2"/> Call Now ({tenant.phone})
                            </a>
                        </div>

                        {/* Right Side: Status & History */}
                        <div className="space-y-6">
                             {/* House Status */}
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <h4 className="font-bold text-gray-700 text-sm mb-3">Enforcement Actions</h4>
                                <div className="space-y-2">
                                    {availableStatuses.map(status => (
                                        <label key={status} className="flex items-center space-x-2 cursor-pointer">
                                            <input type="checkbox" checked={houseStatus.includes(status)} onChange={() => toggleStatus(status)} className="h-4 w-4 text-red-600 rounded" />
                                            <span className={`text-xs ${houseStatus.includes(status) ? 'text-red-700 font-bold' : 'text-gray-600'}`}>{status}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* History Feed */}
                            <div>
                                <h4 className="font-bold text-gray-700 border-b pb-2 mb-2 text-sm">Interaction History</h4>
                                <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                                    {tenant.collectionHistory && tenant.collectionHistory.length > 0 ? (
                                        tenant.collectionHistory.map((log, i) => (
                                            <div key={i} className="text-xs border-l-2 border-blue-300 pl-3 pb-2.5 bg-gray-50/50 p-2 rounded mb-2">
                                                <div className="flex justify-between text-gray-500 mb-1">
                                                    <span>{log.date}</span>
                                                    <span className="font-bold">{log.type}</span>
                                                </div>
                                                <p className="font-medium text-gray-800">{log.outcome}</p>
                                                <p className="text-gray-600 italic">"{log.feedback}"</p>
                                                {log.expectedCompletionDate && <p className="text-blue-600 font-bold mt-1">PTP: {log.expectedCompletionDate}</p>}

                                                {/* Comments/Replies Sync Section */}
                                                {log.comments && log.comments.length > 0 && (
                                                    <div className="mt-2 bg-gray-100 p-2 rounded space-y-1.5">
                                                        <p className="font-extrabold text-[9px] text-gray-500 uppercase tracking-tight">Replies & Admin Comments:</p>
                                                        {log.comments.map((cm, cIdx) => (
                                                            <div key={cIdx} className="bg-white p-1.5 rounded shadow-3xs text-[10px] text-gray-700">
                                                                <div className="flex justify-between font-bold text-[8px] text-blue-700 uppercase pb-0.5">
                                                                    <span>{cm.user}</span>
                                                                    <span className="font-mono text-gray-400 normal-case">{cm.date}</span>
                                                                </div>
                                                                <p className="mt-0.5 text-gray-800">{cm.text}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Inline Reply input for field agents */}
                                                <div className="mt-2 flex gap-1">
                                                    <input 
                                                        type="text"
                                                        placeholder="Type reply to Admin..."
                                                        className="flex-grow p-1 text-[10px] border border-gray-200 rounded bg-white outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault();
                                                                const val = e.currentTarget.value.trim();
                                                                if (val) {
                                                                    const updatedHistory = (tenant.collectionHistory || []).map(h => {
                                                                        if (h.id === log.id) {
                                                                            return {
                                                                                ...h,
                                                                                comments: [...(h.comments || []), {
                                                                                    user: 'Agent',
                                                                                    text: val,
                                                                                    date: new Date().toLocaleString()
                                                                                }]
                                                                            };
                                                                        }
                                                                        return h;
                                                                    });
                                                                    onUpdateTenant(tenant.id, { collectionHistory: updatedHistory });
                                                                    e.currentTarget.value = '';
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-xs text-gray-400 italic">No previous interactions logged.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const TaskManagement: React.FC = () => {
    const { tasks, addTask, updateTask, tenants, updateTenant, addMessage, properties, staff, isDataLoading } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'Maintenance' | 'Collections'>('Maintenance');
    const [statusFilter, setStatusFilter] = useState<TaskStatus | 'All'>('All');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [taskToComplete, setTaskToComplete] = useState<Task | null>(null);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    
    // Collection Action State
    const [selectedCollectionTenant, setSelectedCollectionTenant] = useState<TenantProfile | null>(null);
    const [dailyFollowUp, setDailyFollowUp] = useState<Record<string, boolean>>({}); // Local state for daily follow-up checklist

    // --- Maintenance Tasks ---
    const filteredTasks = useMemo(() => {
        return tasks.filter(t => {
            const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  t.tenant.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesStatus = statusFilter === 'All' || t.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [tasks, searchQuery, statusFilter]);

    // --- Collection Tasks (Derived from Tenants) ---
    const collectionTasks = useMemo(() => {
        return tenants.filter(t => t.status === 'Overdue' && (
            t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            t.unit.toLowerCase().includes(searchQuery.toLowerCase())
        ));
    }, [tenants, searchQuery]);

    const handleSaveTask = (taskData: Partial<Task>) => {
        const newTask: Task = {
            id: `task-${Date.now()}`,
            sla: 24,
            comments: [],
            history: [{ id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: `Task Created by ${CURRENT_USER}` }],
            attachments: [],
            source: 'Internal',
            costs: { labor: 0, materials: 0, travel: 0 },
            ...taskData
        } as Task;
        addTask(newTask);
        setIsModalOpen(false);
    };

    const handleUpdateTask = (updatedTask: Task) => {
        updateTask(updatedTask.id, updatedTask);
    };

    const handleCompleteTask = (taskId: string, completionImages: string[], notes: string) => {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            updateTask(taskId, {
                status: TaskStatus.Completed,
                completionAttachments: completionImages,
                history: [...task.history, { id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: `Completed by ${CURRENT_USER}: ${notes}` }]
            });
        }
        setTaskToComplete(null);
    };
    
    const getAssignedAgent = (propertyId?: string) => {
        if (!propertyId) return 'Unassigned';
        const prop = properties.find(p => p.id === propertyId);
        if (prop && prop.assignedAgentId) {
            const agent = staff.find(s => s.id === prop.assignedAgentId);
            return agent ? agent.name : 'Unassigned';
        }
        return 'Unassigned';
    };

    const handleFollowUpToggle = (tenantId: string) => {
        setDailyFollowUp(prev => ({ ...prev, [tenantId]: !prev[tenantId] }));
    };

    if (isDataLoading) {
        return <div className="text-center py-8">Loading data...</div>;
    }

    if (!isDataLoading && tasks.length === 0 && tenants.length === 0) {
        return <div className="text-center py-8 text-gray-500">No tasks yet. Add your first one.</div>;
    }

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/partial-rms/general-operations/task-management'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Operations
            </button>
            
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Task Management</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage maintenance orders and rent collection efforts.</p>
                </div>
                <div className="flex gap-2">
                     <button 
                        onClick={() => setActiveTab('Maintenance')}
                        className={`px-6 py-2 rounded-lg font-bold shadow-sm transition-all ${activeTab === 'Maintenance' ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                    >
                        Maintenance
                    </button>
                     <button 
                        onClick={() => setActiveTab('Collections')}
                        className={`px-6 py-2 rounded-lg font-bold shadow-sm transition-all ${activeTab === 'Collections' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                    >
                        Collections
                    </button>
                    <button onClick={() => setIsModalOpen(true)} className="px-6 py-2 bg-gray-900 text-white font-semibold rounded-lg hover:bg-black shadow-sm flex items-center ml-2">
                        <Icon name="plus" className="w-4 h-4 mr-2" /> New Task
                    </button>
                </div>
            </div>

            <div className="flex gap-4 bg-white p-4 rounded-xl shadow-sm flex-wrap items-center">
                <div className="flex-grow min-w-[200px] relative">
                    <input 
                        placeholder={`Search ${activeTab}...`} 
                        value={searchQuery} 
                        onChange={e => setSearchQuery(e.target.value)} 
                        className="w-full p-2 pl-8 border rounded-md focus:ring-primary focus:border-primary"
                    />
                    <div className="absolute left-2.5 top-2.5 text-gray-400"><Icon name="search" className="w-4 h-4" /></div>
                </div>
                {activeTab === 'Maintenance' && (
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="p-2 border rounded-md bg-white">
                        <option value="All">All Statuses</option>
                        {Object.values(TaskStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                )}
            </div>

            {/* CONTENT: MAINTENANCE */}
            {activeTab === 'Maintenance' && (
                <div className="grid grid-cols-1 gap-4">
                    {filteredTasks.map(task => (
                        <div 
                            key={task.id} 
                            onClick={() => setSelectedTask(task)}
                            className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex justify-between items-center hover:shadow-md transition-all cursor-pointer group"
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-2 h-12 rounded-full ${task.priority === TaskPriority.VeryHigh ? 'bg-red-500' : task.priority === TaskPriority.High ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
                                <div>
                                    <h3 className="font-bold text-gray-800 text-lg group-hover:text-primary transition-colors">{task.title}</h3>
                                    <p className="text-sm text-gray-500">{task.property} • {task.tenant.name} {task.tenant.unit ? `(${task.tenant.unit})` : ''}</p>
                                    <p className="text-xs text-gray-400 mt-1">Due: {fmtDate(task.dueDate)} • Assigned: {task.assignedTo}</p>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                                    task.status === 'Completed' ? 'bg-green-100 text-green-800' : 
                                    task.status === 'Issued' ? 'bg-blue-100 text-blue-800' : 
                                    task.status === 'Escalated' ? 'bg-red-100 text-red-800' :
                                    'bg-yellow-100 text-yellow-800'
                                }`}>
                                    {task.status}
                                </span>
                                {task.status !== TaskStatus.Completed && task.status !== TaskStatus.Closed && (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setTaskToComplete(task); }}
                                        className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded hover:bg-green-100 font-bold"
                                    >
                                        Mark Complete
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                    {filteredTasks.length === 0 && <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg">No maintenance tasks found.</div>}
                </div>
            )}

            {/* CONTENT: COLLECTIONS */}
            {activeTab === 'Collections' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {collectionTasks.map(tenant => (
                        <div key={tenant.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-all">
                            <div className="bg-red-50 p-4 border-b border-red-100 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-gray-800">{tenant.name}</h3>
                                    <p className="text-xs text-red-600 font-medium">Arrears: KES {tenant.rentAmount.toLocaleString()}</p>
                                </div>
                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-red-600 font-bold text-sm shadow-sm border border-red-100">
                                    {Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), new Date().getMonth(), tenant.rentDueDate || 5).getTime()) / (1000 * 3600 * 24))}d
                                </div>
                            </div>
                            
                            <div className="p-4 space-y-3">
                                <div className="flex justify-between text-xs text-gray-500">
                                    <span>Unit: {tenant.unit}</span>
                                    <span>Agent: {getAssignedAgent(tenant.propertyId)}</span>
                                </div>
                                <div className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-100">
                                    <span className="text-xs font-bold text-gray-600">Daily Follow-up</span>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={!!dailyFollowUp[tenant.id]} onChange={() => handleFollowUpToggle(tenant.id)} className="sr-only peer"/>
                                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                                    </label>
                                </div>

                                <div className="grid grid-cols-1 pt-2">
                                    <button onClick={() => setSelectedCollectionTenant(tenant)} className="flex items-center justify-center py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-bold shadow-sm">
                                        <Icon name="mail" className="w-4 h-4 mr-2" /> Open Task Actions
                                    </button>
                                </div>
                            </div>
                            <div className="bg-gray-50 p-2 text-center text-[10px] text-gray-400 border-t border-gray-100 flex justify-between px-4">
                                <span>Auto-closes on payment</span>
                                {tenant.collectionHistory && tenant.collectionHistory.length > 0 && <span>Last: {tenant.collectionHistory[0].date.split(',')[0]}</span>}
                            </div>
                        </div>
                    ))}
                    {collectionTasks.length === 0 && <div className="col-span-full text-center py-12 bg-green-50 text-green-800 rounded-lg">No collection tasks! All rent paid.</div>}
                </div>
            )}
            
            {isModalOpen && <CreateTaskModal onClose={() => setIsModalOpen(false)} onSave={handleSaveTask} />}
            {taskToComplete && <CompleteTaskModal task={taskToComplete} onClose={() => setTaskToComplete(null)} onComplete={handleCompleteTask} />}
            {selectedTask && <TaskDetailModal task={selectedTask} onClose={() => setSelectedTask(null)} onUpdate={handleUpdateTask} />}
            {selectedCollectionTenant && (
                <CollectionManagerModal 
                    tenant={selectedCollectionTenant} 
                    onClose={() => setSelectedCollectionTenant(null)} 
                    onUpdateTenant={updateTenant} 
                    onSendMessage={addMessage} 
                />
            )}
        </div>
    );
};

export default TaskManagement;
