
import React, { useState, useMemo } from 'react';
import { useData } from '../../../context/DataContext';
import Icon from '../../Icon';
import { Vendor, Task, TaskStatus, TaskPriority } from '../../../types';

const VendorCard: React.FC<{ 
    vendor: Vendor; 
    jobCount: number; 
    earnings: number;
    onView: () => void;
    onAssign: () => void;
}> = ({ vendor, jobCount, earnings, onView, onAssign }) => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 overflow-hidden group flex flex-col h-full">
        <div className="h-24 bg-gradient-to-r from-gray-800 to-gray-700 relative flex-shrink-0">
            <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm px-2 py-1 rounded text-white text-xs font-bold flex items-center">
                <span className="text-yellow-400 mr-1">★</span> {vendor.rating}
            </div>
        </div>
        <div className="px-6 relative flex-shrink-0">
            <div className="w-16 h-16 rounded-full bg-white border-4 border-white shadow-md absolute -top-8 flex items-center justify-center text-2xl font-bold text-gray-700">
                {vendor.name.charAt(0)}
            </div>
        </div>
        <div className="p-6 pt-10 flex-grow flex flex-col">
            <h3 className="font-bold text-lg text-gray-800 mb-1">{vendor.name}</h3>
            <span className="inline-block px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider mb-4 w-fit">
                {vendor.specialty}
            </span>
            
            <div className="grid grid-cols-2 gap-4 text-sm mb-6 flex-grow">
                <div className="bg-gray-50 p-2 rounded text-center h-fit">
                    <p className="text-gray-500 text-xs uppercase font-bold">Jobs Done</p>
                    <p className="text-gray-800 font-bold text-lg">{jobCount}</p>
                </div>
                <div className="bg-gray-50 p-2 rounded text-center h-fit">
                    <p className="text-gray-500 text-xs uppercase font-bold">Earned</p>
                    <p className="text-green-600 font-bold text-lg">{(earnings/1000).toFixed(1)}k</p>
                </div>
            </div>

            <div className="flex gap-2 mt-auto">
                <button 
                    onClick={onView}
                    className="flex-1 py-2 text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                >
                    View Profile
                </button>
                <button 
                    onClick={onAssign}
                    className="flex-1 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-dark rounded transition-colors"
                >
                    Assign Task
                </button>
            </div>
        </div>
    </div>
);

const AssignTaskModal: React.FC<{ 
    vendor: Vendor; 
    onClose: () => void; 
    onSave: (task: Partial<Task>) => void;
    properties: any[]; 
}> = ({ vendor, onClose, onSave, properties }) => {
    const [formData, setFormData] = useState<Partial<Task>>({
        title: '',
        description: '',
        priority: TaskPriority.Medium,
        property: '',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = () => {
        if (!formData.title || !formData.property) return alert("Title and Property required.");
        onSave({ ...formData, assignedTo: vendor.name, status: TaskStatus.Issued });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1600] p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Assign to {vendor.name}</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="space-y-4">
                    <input name="title" value={formData.title} onChange={handleChange} placeholder="Task Title" className="w-full p-2 border rounded" />
                    <select name="property" value={formData.property} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                        <option value="">Select Property</option>
                        {properties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-4">
                        <select name="priority" value={formData.priority} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                            {Object.values(TaskPriority).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <input name="dueDate" type="date" value={formData.dueDate} onChange={handleChange} className="w-full p-2 border rounded" />
                    </div>
                    <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Description..." rows={3} className="w-full p-2 border rounded" />
                    
                    <button onClick={handleSubmit} className="w-full py-2 bg-primary text-white font-bold rounded hover:bg-primary-dark">Assign Task</button>
                </div>
            </div>
        </div>
    );
};

const VendorProfileModal: React.FC<{ vendor: Vendor; onClose: () => void }> = ({ vendor, onClose }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1600] p-4 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-800">Vendor Profile</h3>
                <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="text-center mb-6">
                <div className="w-20 h-20 rounded-full bg-gray-200 mx-auto mb-3 flex items-center justify-center text-3xl font-bold text-gray-600">
                    {vendor.name.charAt(0)}
                </div>
                <h2 className="text-2xl font-bold text-gray-800">{vendor.name}</h2>
                <p className="text-primary font-medium">{vendor.specialty}</p>
                <div className="flex justify-center gap-1 mt-2 text-yellow-400 text-sm">
                    {'★'.repeat(Math.round(vendor.rating))}
                    <span className="text-gray-300">{'★'.repeat(5 - Math.round(vendor.rating))}</span>
                </div>
            </div>
            <div className="space-y-3">
                <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">ID</span>
                    <span className="font-mono">{vendor.id}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">Status</span>
                    <span className="text-green-600 font-bold">Active</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                    <span className="text-gray-500">Performance</span>
                    <span className="font-bold">98% On Time</span>
                </div>
            </div>
            <div className="mt-6">
                 <button onClick={onClose} className="w-full py-2 bg-gray-100 text-gray-700 font-bold rounded hover:bg-gray-200">Close</button>
            </div>
        </div>
    </div>
);

const VendorManagement: React.FC = () => {
    const { vendors, tasks, addTask, properties, addVendor, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canCreate = isSuperAdmin || checkPermission('Maintenance', 'create');
    const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
    const [action, setAction] = useState<'view' | 'assign' | null>(null);
    const [isAddVendorOpen, setIsAddVendorOpen] = useState(false);

    // Calculate stats for each vendor
    const vendorStats = useMemo(() => {
        return vendors.map(v => {
            const vendorTasks = tasks.filter(t => t.assignedTo === v.name && (t.status === 'Completed' || t.status === 'Closed'));
            const earnings = vendorTasks.reduce((sum, t) => sum + ((t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0)), 0);
            return {
                ...v,
                completedJobs: vendorTasks.length,
                totalEarnings: earnings
            };
        });
    }, [vendors, tasks]);

    const handleAssignTask = (taskData: Partial<Task>) => {
        const newTask: Task = {
            id: `TASK-${Date.now()}`,
            tenant: { name: 'Maintenance', unit: 'N/A' },
            comments: [],
            history: [{ id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: 'Task Assigned from Vendor Manager' }],
            attachments: [],
            source: 'Internal',
            costs: { labor: 0, materials: 0, travel: 0 },
            ...taskData
        } as Task;
        addTask(newTask);
        alert(`Task "${newTask.title}" assigned to ${selectedVendor?.name}`);
        setAction(null);
        setSelectedVendor(null);
    };

    const handleAddVendor = (name: string, specialty: string) => {
        if (!canCreate) return alert('You do not have permission to onboard vendors.');
        if (!name) return alert("Name required");
        addVendor({ id: `v-${Date.now()}`, name, specialty, rating: 5 });
        setIsAddVendorOpen(false);
    }

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/field-operations/maintenance'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Maintenance
            </button>
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Vendor Directory</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage external contractors, track performance and spend.</p>
                </div>
                {canCreate && <button
                    onClick={() => setIsAddVendorOpen(true)}
                    className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg shadow hover:bg-black flex items-center"
                >
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Onboard Vendor
                </button>}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {vendorStats.map(v => (
                    <VendorCard 
                        key={v.id} 
                        vendor={v} 
                        jobCount={v.completedJobs} 
                        earnings={v.totalEarnings} 
                        onView={() => { setSelectedVendor(v); setAction('view'); }}
                        onAssign={() => { setSelectedVendor(v); setAction('assign'); }}
                    />
                ))}
                
                {/* Add New Card Placeholder */}
                <button 
                    onClick={() => {
                        try {
                            window.location.hash = '#/registration/users?category=contractors';
                        } catch {
                            setIsAddVendorOpen(true);
                        }
                    }}
                    className="border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-primary hover:text-primary transition-all p-8 min-h-[300px]"
                >
                    <Icon name="plus" className="w-12 h-12 mb-4 opacity-50" />
                    <span className="font-bold">Add New Vendor</span>
                </button>
            </div>

            {vendorStats.length === 0 && (
                <div className="text-center py-12 bg-gray-50 rounded-xl">
                    <p className="text-gray-500">No vendors found. Start building your network.</p>
                </div>
            )}

            {selectedVendor && action === 'assign' && (
                <AssignTaskModal 
                    vendor={selectedVendor} 
                    onClose={() => { setSelectedVendor(null); setAction(null); }}
                    onSave={handleAssignTask}
                    properties={properties}
                />
            )}

            {selectedVendor && action === 'view' && (
                <VendorProfileModal 
                    vendor={selectedVendor} 
                    onClose={() => { setSelectedVendor(null); setAction(null); }}
                />
            )}

            {isAddVendorOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1600] p-4 backdrop-blur-sm" onClick={() => setIsAddVendorOpen(false)}>
                    <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold mb-4">Onboard Vendor</h3>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.target as HTMLFormElement);
                            handleAddVendor(formData.get('name') as string, formData.get('specialty') as string);
                        }}>
                            <input name="name" className="w-full p-2 border rounded mb-3" placeholder="Vendor Name" required/>
                            <input name="specialty" className="w-full p-2 border rounded mb-4" placeholder="Specialty (e.g. Plumbing)" required/>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setIsAddVendorOpen(false)} className="flex-1 py-2 bg-gray-100 rounded text-gray-700">Cancel</button>
                                <button type="submit" className="flex-1 py-2 bg-primary text-white rounded font-bold">Add</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VendorManagement;
