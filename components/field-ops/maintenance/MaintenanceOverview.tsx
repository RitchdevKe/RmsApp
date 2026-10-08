
import React, { useState, useMemo } from 'react';
import { useData } from '../../../context/DataContext';
import Icon from '../../Icon';
import { TaskStatus, TaskPriority, Task, Vendor } from '../../../types';

// Reusing modal logic locally since original components don't export them
const CreateMaintenanceTaskModal: React.FC<{ onClose: () => void; onSave: (task: Partial<Task>) => void; }> = ({ onClose, onSave }) => {
    const { properties, staff, vendors } = useData();
    const [formData, setFormData] = useState<Partial<Task>>({
        title: '',
        description: '',
        priority: TaskPriority.Medium,
        status: TaskStatus.Issued,
        property: '',
        assignedTo: '',
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        tenant: { name: '', unit: '' },
    });
    const [unitInput, setUnitInput] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = () => {
        if (!formData.title || !formData.property) {
            alert("Please fill in Title and Property");
            return;
        }
        onSave({ 
            ...formData, 
            tenant: { name: 'Maintenance', unit: unitInput },
            source: 'Internal'
        });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1500] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Initiate Maintenance Task</h2>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="space-y-4">
                    <input name="title" value={formData.title} onChange={handleChange} className="w-full p-2 border rounded-md" placeholder="Task Title" />
                    <div className="grid grid-cols-2 gap-4">
                        <select name="property" value={formData.property} onChange={handleChange} className="w-full p-2 border rounded-md bg-white">
                            <option value="">Select Property</option>
                            {properties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                        <input value={unitInput} onChange={e => setUnitInput(e.target.value)} className="w-full p-2 border rounded-md" placeholder="Unit (Optional)" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <select name="priority" value={formData.priority} onChange={handleChange} className="w-full p-2 border rounded-md bg-white">
                            {Object.values(TaskPriority).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select name="assignedTo" value={formData.assignedTo} onChange={handleChange} className="w-full p-2 border rounded-md bg-white">
                            <option value="">Assign To...</option>
                            <optgroup label="Staff">{staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</optgroup>
                            <optgroup label="Vendors">{vendors.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}</optgroup>
                        </select>
                    </div>
                    <textarea name="description" value={formData.description} onChange={handleChange} className="w-full p-2 border rounded-md" rows={3} placeholder="Description..." />
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-md text-gray-700">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded-md">Create Task</button>
                </div>
            </div>
        </div>
    );
};

const AddVendorModal: React.FC<{ onClose: () => void; onSave: (vendor: Vendor) => void }> = ({ onClose, onSave }) => {
    const [formData, setFormData] = useState<Partial<Vendor>>({ name: '', specialty: '', rating: 0 });
    
    const handleSubmit = () => {
        if (!formData.name) return alert("Name required");
        onSave({ ...formData, id: `v-${Date.now()}`, rating: 5 } as Vendor);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1500] p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
                <h3 className="text-xl font-bold mb-4">Add New Vendor</h3>
                <div className="space-y-4">
                    <input className="w-full p-2 border rounded" placeholder="Vendor Name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    <input className="w-full p-2 border rounded" placeholder="Specialty (e.g. Plumbing)" value={formData.specialty} onChange={e => setFormData({...formData, specialty: e.target.value})} />
                    <button onClick={handleSubmit} className="w-full py-2 bg-primary text-white rounded font-bold">Add Vendor</button>
                    <button onClick={onClose} className="w-full py-2 bg-gray-100 text-gray-700 rounded">Cancel</button>
                </div>
            </div>
        </div>
    );
};

const MaintenanceOverview: React.FC = () => {
    const { tasks, vendors, addTask, addVendor, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreate = isSuperAdmin || checkPermission('Maintenance', 'create');
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);

    // Stats
    const stats = useMemo(() => {
        const totalTasks = tasks.length;
        const pending = tasks.filter(t => t.status !== TaskStatus.Completed && t.status !== TaskStatus.Closed).length;
        const critical = tasks.filter(t => t.priority === TaskPriority.VeryHigh && t.status !== TaskStatus.Completed).length;
        // Mock cost calc
        const totalSpend = tasks.reduce((sum, t) => sum + ((t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0)), 0);
        return { totalTasks, pending, critical, totalSpend };
    }, [tasks]);

    const handleSaveTask = (task: Partial<Task>) => {
        if (!canCreate) return alert('You do not have permission to initiate maintenance tasks.');
        const newTask = {
            ...task,
            id: `TASK-${Date.now()}`,
            comments: [],
            history: [{ id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: 'Task Initiated from Maintenance Hub' }],
            attachments: [],
            costs: { labor: 0, materials: 0, travel: 0 }
        } as Task;
        addTask(newTask);
        setIsTaskModalOpen(false);
    };

    const handleSaveVendor = (v: Vendor) => {
        if (!canCreate) return alert('You do not have permission to add vendors.');
        addVendor(v);
        setIsVendorModalOpen(false);
    };

    const navCards = [
        { title: "Work Orders", icon: "tools", desc: "Manage active jobs & Kanban board.", link: "#/operations/maintenance/work-orders", color: "blue" },
        { title: "Request Intake", icon: "task-request", desc: "Log new issues from tenants.", link: "#/operations/maintenance/request-intake", color: "green" },
        { title: "Vendor Management", icon: "agent", desc: "Contractor directory & ratings.", link: "#/operations/maintenance/vendor-management", color: "purple" },
        { title: "Preventive Maint.", icon: "time", desc: "Scheduled asset upkeep.", link: "#/operations/maintenance/preventive-maintenance", color: "orange" },
        { title: "Cost Tracking", icon: "expenses", desc: "Budget monitoring & spend analysis.", link: "#/operations/maintenance/cost-tracking", color: "red" },
        { title: "Quality Control", icon: "check", desc: "Inspect completed work.", link: "#/operations/maintenance/quality-control", color: "indigo" },
        { title: "Reporting", icon: "analytics", description: "Maintenance performance metrics.", link: "#/operations/maintenance/reporting", color: "yellow" },
    ];

    return (
        <div className="space-y-8 pb-10">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Maintenance Hub</h1>
                    <p className="text-lg text-gray-500 mt-1">Central command for all property maintenance operations.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => {
                            try {
                                // Treat Add Vendor as shortcut to Contractors registration
                                window.location.hash = '#/registration/users?category=contractors';
                            } catch {
                                setIsVendorModalOpen(true);
                            }
                        }}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg hover:bg-gray-50 shadow-sm flex items-center"
                    >
                        <Icon name="plus" className="w-4 h-4 mr-2" /> Add Vendor
                    </button>
                    <button onClick={() => setIsTaskModalOpen(true)} className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg shadow-lg hover:bg-black transition-transform active:scale-95 flex items-center">
                        <Icon name="tools" className="w-4 h-4 mr-2" /> Initiate Maintenance
                    </button>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Active Tasks</p>
                    <p className="text-2xl font-extrabold text-gray-800 mt-1">{stats.pending}</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-red-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Critical Issues</p>
                    <p className="text-2xl font-extrabold text-red-600 mt-1">{stats.critical}</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Vendors</p>
                    <p className="text-2xl font-extrabold text-gray-800 mt-1">{vendors.length}</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-orange-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Total Spend</p>
                    <p className="text-2xl font-extrabold text-gray-800 mt-1">KES {(stats.totalSpend/1000).toFixed(1)}k</p>
                </div>
            </div>

            {/* Navigation Grid - Two Vertical Columns on Medium+ screens as requested */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {navCards.map((card, idx) => (
                    <div 
                        key={idx} 
                        onClick={() => window.location.hash = card.link}
                        className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer transition-all group flex items-center"
                    >
                        <div className={`p-4 rounded-full bg-opacity-10 mr-5 group-hover:scale-110 transition-transform`} style={{ backgroundColor: `${card.color === 'blue' ? '#3b82f6' : card.color === 'green' ? '#10b981' : card.color === 'purple' ? '#8b5cf6' : card.color === 'orange' ? '#f97316' : card.color === 'red' ? '#ef4444' : card.color === 'indigo' ? '#6366f1' : '#eab308'}20` }}>
                            <Icon name={card.icon} className={`w-8 h-8 text-${card.color}-600`} style={{ color: card.color === 'blue' ? '#3b82f6' : card.color === 'green' ? '#10b981' : card.color === 'purple' ? '#8b5cf6' : card.color === 'orange' ? '#f97316' : card.color === 'red' ? '#ef4444' : card.color === 'indigo' ? '#6366f1' : '#eab308' }} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 group-hover:text-primary transition-colors">{card.title}</h3>
                            <p className="text-sm text-gray-500 mt-1">{card.desc}</p>
                        </div>
                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                            <Icon name="chevron-down" className="w-5 h-5 text-gray-400 -rotate-90" />
                        </div>
                    </div>
                ))}
            </div>

            {isTaskModalOpen && <CreateMaintenanceTaskModal onClose={() => setIsTaskModalOpen(false)} onSave={handleSaveTask} />}
            {isVendorModalOpen && <AddVendorModal onClose={() => setIsVendorModalOpen(false)} onSave={handleSaveVendor} />}
        </div>
    );
};

export default MaintenanceOverview;
