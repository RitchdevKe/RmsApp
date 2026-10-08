
import React, { useState, useMemo } from 'react';
import { Task, TaskStatus, TaskPriority } from '../../../types';
import Icon from '../../Icon';
import { useData } from '../../../context/DataContext';
import { uploadToBucket } from '../../../utils/supabaseStorage';
import { supabase } from '../../../utils/supabaseClient';
import { fmtDate } from '../../../utils/date';

const RequestDetailModal: React.FC<{ 
    task: Task; 
    onClose: () => void; 
    onUpdate: (task: Task) => void 
}> = ({ task, onClose, onUpdate }) => {
    const { staff, vendors } = useData();
    const [note, setNote] = useState('');
    const [assignedTo, setAssignedTo] = useState(task.assignedTo);
    const [status, setStatus] = useState(task.status);

    const handleSave = () => {
        const updatedTask = { ...task };
        
        if (assignedTo !== task.assignedTo) {
            updatedTask.assignedTo = assignedTo;
            updatedTask.history = [...updatedTask.history, { id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: `Re-assigned to ${assignedTo}` }];
        }
        if (status !== task.status) {
            updatedTask.status = status;
            updatedTask.history = [...updatedTask.history, { id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: `Status updated to ${status}` }];
        }
        if (note.trim()) {
            updatedTask.comments = [...(updatedTask.comments || []), { user: 'Intake Agent', text: note, date: new Date().toLocaleString() }];
        }
        
        onUpdate(updatedTask);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1600] p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">{task.title}</h3>
                        <span className="text-xs text-gray-500 font-mono">{task.id}</span>
                    </div>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                
                <div className="space-y-4">
                    <div className="bg-gray-50 p-3 rounded text-sm text-gray-700">
                        <p className="font-semibold text-xs text-gray-500 uppercase mb-1">Description</p>
                        {task.description}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Assignee</label>
                            <select 
                                value={assignedTo} 
                                onChange={e => setAssignedTo(e.target.value)}
                                className="w-full p-2 border rounded text-sm bg-white"
                            >
                                <option value="Unassigned">Unassigned</option>
                                <optgroup label="Staff">
                                    {staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                </optgroup>
                                <optgroup label="Vendors">
                                    {vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                                </optgroup>
                            </select>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                             <select 
                                value={status} 
                                onChange={e => setStatus(e.target.value as any)}
                                className="w-full p-2 border rounded text-sm bg-white"
                             >
                                 <option value="Issued">Issued</option>
                                 <option value="In Progress">In Progress</option>
                                 <option value="Pending">Pending Review</option>
                                 <option value="Completed">Completed</option>
                                 <option value="Closed">Closed</option>
                             </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Follow Up Note</label>
                        <textarea 
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            className="w-full p-2 border rounded text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                            rows={3}
                            placeholder="Add a comment or update..."
                        />
                    </div>

                    <div className="border-t pt-3">
                         <p className="text-xs font-bold text-gray-500 uppercase mb-2">History & Comments</p>
                         <div className="max-h-32 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                             {task.comments?.map((c, i) => (
                                 <div key={i} className="text-xs bg-blue-50 p-2 rounded border border-blue-100">
                                     <span className="font-bold text-primary">{c.user}</span>: {c.text}
                                     <span className="block text-[10px] text-gray-400 mt-1">{c.date}</span>
                                 </div>
                             ))}
                             {task.history?.slice().reverse().map((h, i) => (
                                  <div key={`h-${i}`} className="text-[10px] text-gray-500 pl-2 border-l-2 border-gray-200">
                                      <span className="font-mono">{h.timestamp}</span> - {h.event}
                                  </div>
                             ))}
                         </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700 font-bold hover:bg-gray-200">Cancel</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-primary text-white rounded font-bold hover:bg-primary-dark shadow-sm">Save Update</button>
                </div>
            </div>
        </div>
    );
};

const RequestIntake: React.FC = () => {
    const { addTask, updateTask, tasks, users, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreate = isSuperAdmin || checkPermission('Maintenance', 'create');
    const canEdit = isSuperAdmin || checkPermission('Maintenance', 'edit');
    
    // Form State
    const [requestType, setRequestType] = useState('Maintenance Request');
    const [title, setTitle] = useState('');
    const [property, setProperty] = useState('');
    const [description, setDescription] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [priority, setPriority] = useState<TaskPriority>(TaskPriority.Medium);
    const [attachments, setAttachments] = useState<string[]>([]);
    
    // Modal State
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    
    // Derived state for the "Live Feed"
    const allRequests = useMemo(() => {
        return tasks
            .filter(t => t.source === 'Internal' || t.title.includes('Request'))
            .sort((a,b) => new Date(b.history[0]?.timestamp || b.dueDate).getTime() - new Date(a.history[0]?.timestamp || a.dueDate).getTime());
    }, [tasks]);

    const assignableUsers = useMemo(() => users.filter(u => u.role !== 'Tenant'), [users]);

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

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canCreate) { alert('You do not have permission to submit maintenance requests.'); return; }
        if (!title || !property || !description) {
            alert('Please fill in Title, Property and Description.');
            return;
        }

        const newTask: Task = {
            id: `REQ-${Date.now()}`,
            title: `${requestType}: ${title}`,
            description: description,
            status: TaskStatus.Issued,
            priority: priority,
            dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            sla: 48,
            assignedTo: assignedTo || 'Unassigned',
            tenant: { name: 'Walk-in / Phone', unit: 'N/A' },
            property: property,
            comments: [],
            history: [{ id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: 'Request Logged via Intake' }],
            attachments: attachments,
            source: 'Internal', 
            costs: { labor: 0, materials: 0, travel: 0 }
        };

        addTask(newTask);
        alert(`Request submitted successfully! Ticket #${newTask.id} created.`);
        
        // Reset form
        setTitle('');
        setProperty('');
        setDescription('');
        setAssignedTo('');
        setPriority(TaskPriority.Medium);
        setAttachments([]);
    };

    const handleUpdateTask = (updatedTask: Task) => {
        if (!canEdit) { alert('You do not have permission to update tasks.'); return; }
        updateTask(updatedTask.id, updatedTask);
        // Toast or notification could go here
    };

    return (
        <div className="space-y-8 h-[calc(100vh-140px)] flex flex-col">
            <div className="flex-shrink-0">
                <button onClick={() => window.location.hash = '#/field-operations/maintenance'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-4">
                    <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Maintenance
                </button>
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">Request Intake</h1>
                        <p className="text-lg text-gray-500 mt-1">Centralized hub for logging issues from calls, walk-ins, and emails.</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-grow overflow-hidden">
                {/* Left: Form */}
                <div className="lg:col-span-4 overflow-y-auto pr-2 custom-scrollbar">
                    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
                        <div className="flex items-center mb-6 text-primary">
                            <div className="p-2 bg-primary/10 rounded-lg mr-3">
                                <Icon name="register" className="w-6 h-6" />
                            </div>
                            <h2 className="text-xl font-bold text-gray-800">New Ticket</h2>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Source</label>
                                <div className="flex gap-2">
                                    {['Call', 'Walk-in', 'Email'].map(src => (
                                        <button type="button" key={src} className="flex-1 py-1.5 text-sm border rounded bg-gray-50 hover:bg-gray-100 transition-colors">{src}</button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Issue Summary</label>
                                <input 
                                    type="text" 
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="e.g., Leaking Sink in Unit 4" 
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none" 
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Type</label>
                                    <select 
                                        value={requestType} 
                                        onChange={e => setRequestType(e.target.value)} 
                                        className="w-full p-2.5 border border-gray-200 rounded-lg bg-white text-sm"
                                    >
                                        <option>Maintenance</option>
                                        <option>Inquiry</option>
                                        <option>Complaint</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Priority</label>
                                    <select 
                                        value={priority} 
                                        onChange={e => setPriority(e.target.value as TaskPriority)} 
                                        className="w-full p-2.5 border border-gray-200 rounded-lg bg-white text-sm"
                                    >
                                        {Object.values(TaskPriority).map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Property / Unit</label>
                                <input 
                                    type="text" 
                                    value={property}
                                    onChange={e => setProperty(e.target.value)}
                                    placeholder="e.g., Riverside Apts, A-101" 
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none" 
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                                <textarea 
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="Detailed notes..." 
                                    rows={4} 
                                    className="w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/50 outline-none resize-none"
                                ></textarea>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Assign Immediately (Optional)</label>
                                <select 
                                    value={assignedTo} 
                                    onChange={e => setAssignedTo(e.target.value)} 
                                    className="w-full p-3 border border-gray-200 rounded-lg bg-white text-sm"
                                >
                                    <option value="">Do not assign yet</option>
                                    {assignableUsers.map(u => (
                                        <option key={u.id} value={u.name}>{u.name} ({u.role})</option>
                                    ))}
                                </select>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Attachments</label>
                                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:bg-gray-50 relative">
                                    <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer"/>
                                    <span className="text-sm text-gray-500 flex items-center justify-center">
                                        <Icon name="plus" className="w-4 h-4 mr-2" /> Upload Photos
                                    </span>
                                </div>
                                {attachments.length > 0 && (
                                    <div className="flex gap-2 mt-2 flex-wrap">
                                        {attachments.map((img, idx) => (
                                            <div key={idx} className="relative w-12 h-12 rounded border overflow-hidden">
                                                <img src={img} alt="attachment" className="w-full h-full object-cover" />
                                                <button type="button" onClick={() => removeAttachment(idx)} className="absolute top-0 right-0 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">&times;</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <button type="submit" className="w-full px-6 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black shadow-lg transition-transform active:scale-95 flex items-center justify-center">
                                <Icon name="check" className="w-4 h-4 mr-2" /> Create Ticket
                            </button>
                        </form>
                    </div>
                </div>

                {/* Right: Live Feed (Scrollable) */}
                <div className="lg:col-span-8 flex flex-col h-full overflow-hidden">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex-grow flex flex-col overflow-hidden">
                        <div className="flex justify-between items-center mb-6 flex-shrink-0">
                            <h3 className="text-xl font-bold text-gray-800">Intake Log & Follow Up</h3>
                            <div className="flex gap-2">
                                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold">{allRequests.length} Records</span>
                            </div>
                        </div>

                        <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-grow">
                            {allRequests.map(req => (
                                <div 
                                    key={req.id} 
                                    onClick={() => setSelectedTask(req)}
                                    className="flex items-start p-4 bg-gray-50 rounded-xl border border-gray-100 hover:shadow-md transition-all group cursor-pointer relative"
                                >
                                    <div className={`p-3 rounded-full mr-4 flex-shrink-0 ${req.priority === 'Very High' ? 'bg-red-100 text-red-600' : 'bg-white border text-gray-400'}`}>
                                        <Icon name="task-request" className="w-5 h-5" />
                                    </div>
                                    <div className="flex-grow">
                                        <div className="flex justify-between items-start">
                                            <h4 className="font-bold text-gray-800 text-sm group-hover:text-primary transition-colors">{req.title}</h4>
                                            <span className="text-[10px] text-gray-400">{fmtDate(req.dueDate)}</span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{req.description}</p>
                                        <div className="flex items-center gap-3 mt-3">
                                            <span className="text-xs bg-white px-2 py-1 rounded border text-gray-500">{req.property}</span>
                                            {req.assignedTo ? (
                                                <span className="text-xs flex items-center text-blue-600 bg-blue-50 px-2 py-1 rounded font-bold">
                                                    <Icon name="user-circle" className="w-3 h-3 mr-1" /> {req.assignedTo}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded font-bold">Unassigned</span>
                                            )}
                                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${req.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                                {req.status}
                                            </span>
                                        </div>
                                    </div>
                                    
                                    {/* Follow Up Button (Visible on Hover) */}
                                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                         <button className="text-xs bg-white border border-blue-200 text-blue-600 px-3 py-1 rounded-full font-bold shadow-sm hover:bg-blue-50">
                                             Follow Up
                                         </button>
                                    </div>
                                </div>
                            ))}
                            {allRequests.length === 0 && (
                                <div className="text-center py-12 text-gray-400">
                                    <p>No intake records found.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {selectedTask && (
                <RequestDetailModal 
                    task={selectedTask} 
                    onClose={() => setSelectedTask(null)} 
                    onUpdate={handleUpdateTask} 
                />
            )}
        </div>
    );
};

export default RequestIntake;
