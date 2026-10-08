
import React, { useState, useMemo } from 'react';
import { Task, TaskStatus, TaskPriority } from '../../types';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { fmtDate } from '../../utils/date';

const RequestIntake: React.FC = () => {
    const { addTask, tasks, users, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreate = isSuperAdmin || checkPermission('Maintenance', 'create');
    // Form State
    const [requestType, setRequestType] = useState('Maintenance Request');
    const [title, setTitle] = useState('');
    const [property, setProperty] = useState('');
    const [description, setDescription] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [priority, setPriority] = useState<TaskPriority>(TaskPriority.Medium);
    const [attachments, setAttachments] = useState<string[]>([]);
    
    // Derived state for the "Live Feed"
    const recentRequests = useMemo(() => {
        return tasks
            .filter(t => t.source === 'Internal' || t.title.includes('Request'))
            .sort((a,b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()) // Mocking date sort by due date for demo
            .slice(0, 10);
    }, [tasks]);

    const assignableUsers = useMemo(() => users.filter(u => u.role !== 'Tenant'), [users]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files) as File[];
            files.forEach(file => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setAttachments(prev => [...prev, reader.result as string]);
                };
                reader.readAsDataURL(file);
            });
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

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/field-operations/maintenance'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Maintenance
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Request Intake</h1>
                    <p className="text-lg text-gray-500 mt-1">Centralized hub for logging issues from calls, walk-ins, and emails.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left: Form */}
                <div className="lg:col-span-4">
                    <div className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100 sticky top-6">
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
                                        <button type="button" key={src} className="flex-1 py-1.5 text-sm border rounded bg-gray-50 hover:bg-gray-100">{src}</button>
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

                {/* Right: Live Feed */}
                <div className="lg:col-span-8 space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800">Recent Intake Activity</h3>
                            <div className="flex gap-2">
                                <span className="flex items-center text-xs font-bold text-gray-500"><span className="w-2 h-2 rounded-full bg-green-500 mr-1"></span>New</span>
                                <span className="flex items-center text-xs font-bold text-gray-500"><span className="w-2 h-2 rounded-full bg-blue-500 mr-1"></span>Assigned</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {recentRequests.map(req => (
                                <div key={req.id} className="flex items-start p-4 bg-gray-50 rounded-xl border border-gray-100 hover:shadow-md transition-all group cursor-pointer">
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
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {recentRequests.length === 0 && (
                                <div className="text-center py-12 text-gray-400">
                                    <p>No recent requests logged.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RequestIntake;
