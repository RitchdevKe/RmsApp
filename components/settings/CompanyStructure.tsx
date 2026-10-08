
import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { Role, RolePermissions, WidgetConfig } from '../../types';
import { NAVIGATION_ITEMS, WIDGET_REGISTRY } from '../../constants';
import Icon from '../Icon';

// --- Role Edit Modal (Action Permissions & Widgets) ---
const RoleEditModal: React.FC<{ role: Role | null; onClose: () => void; onSave: (r: Role) => void }> = ({ role, onClose, onSave }) => {
    // Default structure matching types.ts RolePermissions
    const getDefaultPerms = (): RolePermissions => {
        const modules = [
            'Registration', 'Properties', 'Tenants', 'Landlords',
            'Operations', 'Maintenance', 'Leases', 'Communication',
            'Payments', 'Financials', 'HR', 'Accounting',
            'Analytics', 'Reports', 'Marketplace', 'R-Reits',
            'Settings', 'Users', 'Dashboard'
        ];
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
        isSystem: true,
        permissions: getDefaultPerms(),
        accessibleSubmodules: [],
        widgetAccess: []
    });

    const [activeTab, setActiveTab] = useState<'General' | 'Permissions' | 'Access' | 'Widgets'>('General');
    const [activeModule, setActiveModule] = useState<string>(Object.keys(formData.permissions)[0] || 'Properties');

    // -- Permission Handlers --
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

    const handleSelectAllPerms = (module: string, select: boolean) => {
         setFormData(prev => {
            const newPerms = { ...prev.permissions };
            const modulePerms = newPerms[module];
            Object.keys(modulePerms).forEach(key => {
                (modulePerms as any)[key] = select;
            });
            return { ...prev, permissions: newPerms };
         });
    };

    // -- Submodule Access Handlers --
    const handleSubmoduleToggle = (path: string) => {
        let newAccessList = [...(formData.accessibleSubmodules || [])];
        if (newAccessList.includes(path)) {
            newAccessList = newAccessList.filter(p => p !== path);
        } else {
            newAccessList.push(path);
        }
        setFormData(prev => ({ ...prev, accessibleSubmodules: newAccessList }));
    };

    // -- Widget Access Handlers --
    const handleWidgetToggle = (widgetId: string) => {
        let newWidgets = [...(formData.widgetAccess || [])];
        if (newWidgets.includes(widgetId)) {
            newWidgets = newWidgets.filter(w => w !== widgetId);
        } else {
            newWidgets.push(widgetId);
        }
        setFormData(prev => ({ ...prev, widgetAccess: newWidgets }));
    };

    const handleSubmit = () => {
        if (!formData.name) return alert("Role Name is required");
        onSave(formData);
    };

    const modules = Object.keys(formData.permissions);
    const actions = ['create', 'edit', 'delete', 'view', 'approve', 'import', 'activate', 'deactivate', 'publish', 'pay', 'resolve', 'cancel'];

    return (
        <div className="fixed inset-0 bg-black/60 z-[1600] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="text-xl font-bold text-gray-800">{role ? 'Edit System Role' : 'Add New System Role'}</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>

                <div className="flex bg-white border-b px-6">
                    {['General', 'Permissions', 'Access', 'Widgets'].map(tab => (
                         <button 
                            key={tab} 
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-6 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                         >
                             {tab}
                         </button>
                    ))}
                </div>
                
                <div className="flex-grow overflow-y-auto p-6 bg-gray-50/30">
                    {activeTab === 'General' && (
                        <div className="space-y-6 max-w-lg mx-auto mt-6">
                             <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Role Name</label>
                                <input 
                                    value={formData.name} 
                                    onChange={e => setFormData({...formData, name: e.target.value})} 
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none font-bold text-gray-800" 
                                    placeholder="e.g. Office Admin"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Description</label>
                                <textarea 
                                    value={formData.description} 
                                    onChange={e => setFormData({...formData, description: e.target.value})} 
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none h-32" 
                                    placeholder="Describe the responsibilities..."
                                />
                            </div>
                            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 flex gap-3 items-start">
                                <Icon name="info" className="w-5 h-5 text-blue-600 mt-0.5" />
                                <p className="text-sm text-blue-800">
                                    <strong>System Role:</strong> This role is intended for internal staff and will appear in the System Users registration dropdown.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Permissions' && (
                         <div className="flex h-full border rounded-xl bg-white overflow-hidden shadow-sm">
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
                            <div className="flex-grow p-6 overflow-y-auto">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="text-lg font-bold text-gray-800">{activeModule} Actions</h4>
                                    <div className="space-x-2">
                                        <button onClick={() => handleSelectAllPerms(activeModule, true)} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded hover:bg-blue-100 font-bold border border-blue-200">Select All</button>
                                        <button onClick={() => handleSelectAllPerms(activeModule, false)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded hover:bg-gray-200 font-bold border border-gray-200">Clear All</button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                    )}

                    {activeTab === 'Access' && (
                        <div className="space-y-6">
                             <div className="p-4 bg-gray-100 rounded-lg text-sm text-gray-600 mb-4">
                                Select which pages and sub-pages this role can view in the navigation sidebar.
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {NAVIGATION_ITEMS.map(nav => (
                                    <div key={nav.name} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                                        <div className="bg-gray-50 px-4 py-3 border-b font-bold text-gray-700 flex items-center">
                                            <Icon name={nav.icon} className="w-4 h-4 mr-2 text-gray-500" />
                                            {nav.name}
                                        </div>
                                        <div className="p-2">
                                            {nav.subModules.map(sub => {
                                                const path = `${nav.name}/${sub}`;
                                                const isAllowed = formData.accessibleSubmodules.includes(path);
                                                return (
                                                    <label key={path} className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer rounded">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isAllowed}
                                                            onChange={() => handleSubmoduleToggle(path)}
                                                            className="h-4 w-4 text-primary rounded border-gray-300"
                                                        />
                                                        <span className={`ml-3 text-sm ${isAllowed ? 'text-primary font-bold' : 'text-gray-600'}`}>{sub}</span>
                                                    </label>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'Widgets' && (
                        <div className="space-y-6">
                             <div className="p-4 bg-gray-100 rounded-lg text-sm text-gray-600 mb-4">
                                Control visibility of dashboard widgets.
                            </div>
                            {Object.entries(WIDGET_REGISTRY).map(([moduleName, widgets]) => (
                                <div key={moduleName} className="mb-6">
                                    <h4 className="text-md font-bold text-gray-800 mb-3 border-b pb-2">{moduleName} Widgets</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {widgets.map(w => {
                                            const isAllowed = (formData.widgetAccess || []).includes(w.id);
                                            return (
                                                <label key={w.id} className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${isAllowed ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:border-blue-200'}`}>
                                                     <input 
                                                        type="checkbox" 
                                                        checked={isAllowed}
                                                        onChange={() => handleWidgetToggle(w.id)}
                                                        className="h-5 w-5 text-primary rounded border-gray-300"
                                                    />
                                                    <span className={`ml-3 font-medium text-sm ${isAllowed ? 'text-blue-800' : 'text-gray-600'}`}>{w.name}</span>
                                                </label>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-6 border-t bg-white flex justify-end gap-3 rounded-b-xl">
                    <button onClick={onClose} className="px-6 py-2.5 bg-gray-100 border border-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-200">Cancel</button>
                    <button onClick={handleSubmit} className="px-8 py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-md">Save Role</button>
                </div>
            </div>
        </div>
    );
};

const CompanyStructure: React.FC = () => {
    const { roles, addRole, updateRole, deleteRole, currentUser } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [editRole, setEditRole] = useState<Role | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const filteredRoles = useMemo(() => 
        roles.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
    , [roles, searchQuery]);

    const isSuperAdmin = currentUser?.role === 'Super Admin';

    const handleSaveRole = (role: Role) => {
        // Enforce isSystem for this view as it's meant for System Roles
        role.isSystem = true; 
        
        if (editRole) {
            updateRole(role.id, role);
        } else {
            addRole(role);
        }
        setIsModalOpen(false);
        setEditRole(null);
    };

    const handleDelete = (id: string) => {
        // Prevent deleting core system roles if needed, or just warn heavily
        if (id === 'role1') return alert("Cannot delete Super Admin role.");
        
        if (confirm("Are you sure you want to delete this role? Users assigned to this role may lose access.")) {
            deleteRole(id);
        }
    };

    // Columns to display in main table
    const actionKeys = ['create', 'edit', 'delete', 'approve', 'view'];

    return (
        <div className="space-y-6">
            <button onClick={() => window.location.hash = '#/settings/profile'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Settings
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">System Roles</h1>
                    <p className="text-lg text-gray-500 mt-1">Define roles, permissions, and dashboard access for system users.</p>
                </div>
                {isSuperAdmin && (
                    <button 
                        onClick={() => { setEditRole(null); setIsModalOpen(true); }}
                        className="bg-primary text-white px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-primary-dark flex items-center shadow-md transition-transform active:scale-95"
                    >
                        <Icon name="plus" className="w-5 h-5 mr-2" /> Add System Role
                    </button>
                )}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                     <h3 className="font-bold text-gray-700">Role Definitions</h3>
                     <div className="relative w-64">
                        <input 
                            type="text" 
                            placeholder="Search roles..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-1 focus:ring-primary outline-none"
                        />
                        <Icon name="search" className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                     </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-white">
                            <tr>
                                <th className="px-6 py-4 text-left font-bold text-gray-700">Role Name</th>
                                <th className="px-6 py-4 text-left font-bold text-gray-700">Description</th>
                                <th className="px-6 py-4 text-center font-bold text-gray-700">Access Scope</th>
                                <th className="px-6 py-4 text-right font-bold text-gray-700">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredRoles.map(role => {
                                // Calculate summary stats
                                const totalModules = role.accessibleSubmodules.length;
                                const totalWidgets = role.widgetAccess?.length || 0;
                                
                                return (
                                    <tr key={role.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-900 text-base">{role.name}</div>
                                            {role.isSystem && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold uppercase">System</span>}
                                        </td>
                                        <td className="px-6 py-4 text-gray-600 max-w-md truncate">
                                            {role.description || 'No description provided.'}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="inline-flex gap-2">
                                                <span className="bg-gray-100 px-3 py-1 rounded text-xs font-bold text-gray-600 border border-gray-200">{totalModules} Modules</span>
                                                <span className="bg-gray-100 px-3 py-1 rounded text-xs font-bold text-gray-600 border border-gray-200">{totalWidgets} Widgets</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-3">
                                                <button 
                                                    onClick={() => { setEditRole(role); setIsModalOpen(true); }}
                                                    className="text-blue-600 hover:text-blue-800 font-bold text-xs flex items-center bg-blue-50 px-3 py-1.5 rounded hover:bg-blue-100 transition-colors"
                                                >
                                                    <Icon name="settings" className="w-3 h-3 mr-1" /> Manage
                                                </button>
                                                {isSuperAdmin && role.id !== 'role1' && (
                                                    <button 
                                                        onClick={() => handleDelete(role.id)}
                                                        className="text-red-600 hover:text-red-800 font-bold text-xs flex items-center bg-red-50 px-3 py-1.5 rounded hover:bg-red-100 transition-colors"
                                                    >
                                                        <Icon name="close" className="w-3 h-3 mr-1" /> Delete
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredRoles.length === 0 && (
                                <tr><td colSpan={4} className="p-8 text-center text-gray-400">No roles found.</td></tr>
                            )}
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

export default CompanyStructure;
