
import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { Role, RolePermissions } from '../../types';
import Icon from '../Icon';

// --- Role Edit Modal (Action Permissions) ---
const RoleEditModal: React.FC<{ role: Role | null; onClose: () => void; onSave: (r: Role) => void }> = ({ role, onClose, onSave }) => {
    // Default structure matching types.ts RolePermissions
    const getDefaultPerms = (): RolePermissions => {
        const modules = ['Properties', 'Tenants', 'Landlords', 'Financials', 'Maintenance', 'Reports', 'Settings', 'Users', 'R-Reits'];
        const p: RolePermissions = {};
        modules.forEach(m => {
             p[m] = {
                 create: false, edit: false, delete: false, view: false, 
                 approve: false, import: false, activate: false, deactivate: false, 
                 publish: false, pay: false, resolve: false, cancel: false
             };
        });
        return p;
    };

    const [formData, setFormData] = useState<Role>(role ? { ...role } : {
        id: `role-${Date.now()}`,
        name: '',
        description: '',
        isSystem: false,
        permissions: getDefaultPerms(),
        accessibleSubmodules: []
    });

    // We only edit the Matrix here (Actions), not accessibleSubmodules (that is in Permissions module)
    const [activeModule, setActiveModule] = useState<string>(Object.keys(formData.permissions)[0] || 'Properties');

    const handlePermissionChange = (module: string, action: keyof RolePermissions[string]) => {
        setFormData(prev => ({
            ...prev,
            permissions: {
                ...prev.permissions,
                [module]: {
                    ...prev.permissions[module],
                    [action]: !prev.permissions[module][action]
                }
            }
        }));
    };

    const handleSelectAll = (module: string, select: boolean) => {
         setFormData(prev => {
            const newPerms = { ...prev.permissions };
            const modulePerms = newPerms[module];
            Object.keys(modulePerms).forEach(key => {
                (modulePerms as any)[key] = select;
            });
            return { ...prev, permissions: newPerms };
         });
    };

    const handleSubmit = () => {
        if (!formData.name) return alert("Role Name is required");
        onSave(formData);
    };

    const modules = Object.keys(formData.permissions);
    const actions = ['create', 'edit', 'delete', 'view', 'approve', 'import', 'activate', 'deactivate', 'publish', 'pay', 'resolve', 'cancel'];

    return (
        <div className="fixed inset-0 bg-black/60 z-[1600] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="text-xl font-bold text-gray-800">{role ? 'Edit Role Actions' : 'Add New Role'}</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                
                <div className="p-6 border-b bg-white space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Role Name</label>
                            <input 
                                value={formData.name} 
                                onChange={e => setFormData({...formData, name: e.target.value})} 
                                className="w-full p-2 border rounded font-bold text-gray-800 focus:ring-2 focus:ring-primary/20 outline-none" 
                                placeholder="e.g. Sales Manager"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Is System Role</label>
                            <select 
                                value={formData.isSystem ? 'Yes' : 'No'} 
                                onChange={e => setFormData({...formData, isSystem: e.target.value === 'Yes'})}
                                className="w-full p-2 border rounded bg-white text-gray-800 focus:ring-2 focus:ring-primary/20 outline-none"
                            >
                                <option value="No">No</option>
                                <option value="Yes">Yes</option>
                            </select>
                            <p className="text-[10px] text-gray-400 mt-1">
                                System roles often correspond to internal staff (e.g. Admin, Accountant).
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex-grow flex overflow-hidden">
                    {/* Sidebar for Modules */}
                    <div className="w-48 bg-gray-50 border-r overflow-y-auto">
                        {modules.map(mod => (
                            <button
                                key={mod}
                                onClick={() => setActiveModule(mod)}
                                className={`w-full text-left px-4 py-3 text-sm font-medium border-l-4 transition-colors ${activeModule === mod ? 'bg-white border-primary text-primary' : 'border-transparent text-gray-600 hover:bg-white'}`}
                            >
                                {mod}
                            </button>
                        ))}
                    </div>

                    {/* Permissions Grid */}
                    <div className="flex-grow p-6 overflow-y-auto bg-white">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-lg font-bold text-gray-800">{activeModule} Operations</h4>
                            <div className="space-x-2">
                                <button onClick={() => handleSelectAll(activeModule, true)} className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded hover:bg-blue-100 font-bold">Select All</button>
                                <button onClick={() => handleSelectAll(activeModule, false)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded hover:bg-gray-200 font-bold">Clear All</button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {actions.map(action => (
                                <label key={action} className="flex items-center space-x-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                                    <input 
                                        type="checkbox"
                                        checked={(formData.permissions[activeModule] as any)[action]}
                                        onChange={() => handlePermissionChange(activeModule, action as any)}
                                        className="h-5 w-5 text-primary rounded border-gray-300 focus:ring-primary"
                                    />
                                    <span className="text-sm font-medium capitalize text-gray-700">{action}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-end gap-2 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded hover:bg-gray-100">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2 bg-primary text-white font-bold rounded hover:bg-primary-dark">Save Role</button>
                </div>
            </div>
        </div>
    );
};

const RolesAndPermissions: React.FC = () => {
    const { roles, addRole, updateRole, deleteRole } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [editRole, setEditRole] = useState<Role | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const filteredRoles = useMemo(() => 
        roles.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    , [roles, searchQuery]);

    const handleSaveRole = (role: Role) => {
        if (editRole) {
            updateRole(role.id, role);
        } else {
            addRole(role);
        }
        setIsModalOpen(false);
        setEditRole(null);
    };

    const handleDelete = (id: string, isSystem: boolean) => {
        if (isSystem) return alert("Cannot delete system roles.");
        if (confirm("Are you sure you want to delete this role? Users assigned to this role may lose access.")) {
            deleteRole(id);
        }
    };

    // Columns to display in main table
    const displayActionLabels = ['Add', 'Edit', 'Del', 'Approve', 'Import', 'Activate', 'Deactivate', 'Publish', 'Pay', 'Resolve', 'View', 'Cancel'];
    const actionKeys = ['create', 'edit', 'delete', 'approve', 'import', 'activate', 'deactivate', 'publish', 'pay', 'resolve', 'view', 'cancel'];

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Roles</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage system access levels and operational permissions matrix.</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                     <h3 className="font-bold text-gray-700">Role List</h3>
                     <div className="flex gap-4">
                         <div className="relative">
                            <input 
                                type="text" 
                                placeholder="Search..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="pl-8 pr-4 py-1.5 border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                            />
                            <Icon name="search" className="w-4 h-4 text-gray-400 absolute left-2.5 top-2" />
                         </div>
                         <button 
                            onClick={() => { setEditRole(null); setIsModalOpen(true); }}
                            className="bg-green-600 text-white px-4 py-1.5 rounded text-sm font-bold hover:bg-green-700 flex items-center"
                         >
                             <Icon name="plus" className="w-4 h-4 mr-2" /> New Role
                         </button>
                     </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-white">
                            <tr>
                                <th className="px-4 py-3 text-left font-bold text-gray-700 bg-gray-50 sticky left-0 z-10 border-r min-w-[150px]">Role</th>
                                {displayActionLabels.map(label => (
                                    <th key={label} className="px-2 py-3 text-center font-bold text-gray-700 min-w-[80px]">{label}</th>
                                ))}
                                <th className="px-4 py-3 text-right font-bold text-gray-700 sticky right-0 z-10 bg-gray-50 border-l">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredRoles.map(role => {
                                // For matrix display, we check if ANY module has this permission enabled.
                                const hasPerm = (action: string) => Object.values(role.permissions).some((modPerms: any) => modPerms[action]);
                                
                                return (
                                    <tr key={role.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-900 bg-white sticky left-0 border-r">{role.name}</td>
                                        {actionKeys.map(action => (
                                            <td key={action} className="px-2 py-3 text-center">
                                                {hasPerm(action) ? (
                                                    <Icon name="check" className="w-4 h-4 text-blue-600 mx-auto" />
                                                ) : (
                                                    <Icon name="close" className="w-3 h-3 text-red-300 mx-auto opacity-50" />
                                                )}
                                            </td>
                                        ))}
                                        <td className="px-4 py-3 text-right sticky right-0 bg-white border-l">
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={() => { setEditRole(role); setIsModalOpen(true); }}
                                                    className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-bold hover:bg-blue-100 flex items-center border border-blue-200"
                                                >
                                                    <Icon name="settings" className="w-3 h-3 mr-1" /> Edit
                                                </button>
                                                {!role.isSystem && (
                                                    <button 
                                                        onClick={() => handleDelete(role.id, role.isSystem)}
                                                        className="px-2 py-1 bg-red-50 text-red-600 rounded text-xs font-bold hover:bg-red-100 flex items-center border border-red-200"
                                                    >
                                                        <Icon name="close" className="w-3 h-3 mr-1" /> Del
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <RoleEditModal 
                    role={editRole} 
                    onClose={() => setIsModalOpen(false)} 
                    onSave={handleSaveRole} 
                />
            )}
        </div>
    );
};

export default RolesAndPermissions;
