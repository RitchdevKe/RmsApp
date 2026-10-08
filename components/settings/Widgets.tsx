
import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { NAVIGATION_ITEMS, WIDGET_REGISTRY } from '../../constants';
import Icon from '../Icon';

// Fallback for modules without specific widgets defined
const DEFAULT_WIDGETS = [
    { id: 'default_header', name: 'Page Header' },
    { id: 'default_stats', name: 'Summary Statistics' },
    { id: 'default_table', name: 'Main Data Table' }
];

const Widgets: React.FC = () => {
    const { roles, updateRole } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id || '');
    const [selectedModuleName, setSelectedModule] = useState<string>('Dashboard');

    const selectedRole = useMemo(() => roles.find(r => r.id === selectedRoleId), [roles, selectedRoleId]);

    useEffect(() => {
        if (!selectedRoleId && roles.length > 0) {
            setSelectedRoleId(roles[0].id);
        }
    }, [roles, selectedRoleId]);
    
    const availableWidgets = useMemo(() => {
        const key = Object.keys(WIDGET_REGISTRY).find(k => selectedModuleName.startsWith(k));
        return key ? WIDGET_REGISTRY[key] : DEFAULT_WIDGETS;
    }, [selectedModuleName]);

    const filteredWidgets = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return availableWidgets;
        return availableWidgets.filter(w => w.name.toLowerCase().includes(q));
    }, [availableWidgets, searchQuery]);

    const toggleWidgetAccess = (widgetId: string) => {
        if (!selectedRole) return;
        
        const currentAccess = selectedRole.widgetAccess || [];
        let newAccess: string[];

        if (currentAccess.includes(widgetId)) {
            newAccess = currentAccess.filter(id => id !== widgetId);
        } else {
            newAccess = [...currentAccess, widgetId];
        }

        updateRole(selectedRole.id, { widgetAccess: newAccess });
    };

    const handleSelectAll = (select: boolean) => {
        if (!selectedRole) return;
        
        const widgetIds = availableWidgets.map(w => w.id);
        const currentAccess = selectedRole.widgetAccess || [];
        let newAccess: string[];

        if (select) {
            const missing = widgetIds.filter(id => !currentAccess.includes(id));
            newAccess = [...currentAccess, ...missing];
        } else {
            newAccess = currentAccess.filter(id => !widgetIds.includes(id));
        }
        
        updateRole(selectedRole.id, { widgetAccess: newAccess });
    };

    if (!selectedRole) return <div className="p-8">No roles available.</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Widgets Permissions</h1>
                    <p className="text-lg text-gray-500 mt-1">Configure visibility of dashboard components per user role.</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                     <h3 className="font-bold text-gray-700">Widgets</h3>
                     <div className="flex gap-4 items-center">
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

                        <select 
                            value={selectedRoleId} 
                            onChange={e => setSelectedRoleId(e.target.value)} 
                            className="px-3 py-1.5 border rounded-lg bg-white focus:ring-1 focus:ring-primary outline-none text-sm font-bold text-gray-700"
                        >
                            {roles.map(r => (
                                <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                        </select>

                        <select 
                            value={selectedModuleName} 
                            onChange={e => setSelectedModule(e.target.value)} 
                            className="px-3 py-1.5 border rounded-lg bg-white focus:ring-1 focus:ring-primary outline-none text-sm font-bold text-gray-700"
                        >
                            {NAVIGATION_ITEMS.map(item => (
                                <React.Fragment key={item.name}>
                                    <option value={item.name}>{item.name}</option>
                                    {item.subModules.map(sub => (
                                        <option key={`${item.name}/${sub}`} value={`${item.name}/${sub}`}>&nbsp;&nbsp;&nbsp;{sub}</option>
                                    ))}
                                </React.Fragment>
                            ))}
                        </select>

                         <button 
                            onClick={() => handleSelectAll(true)}
                            className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-bold hover:bg-blue-100 flex items-center border border-blue-200"
                         >
                             Allow All
                         </button>
                         <button 
                            onClick={() => handleSelectAll(false)}
                            className="px-2 py-1 bg-red-50 text-red-600 rounded text-xs font-bold hover:bg-red-100 flex items-center border border-red-200"
                         >
                             Disallow All
                         </button>
                     </div>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-white">
                            <tr>
                                <th className="px-4 py-3 text-left font-bold text-gray-700 bg-gray-50 sticky left-0 z-10 border-r min-w-[240px]">Widget</th>
                                <th className="px-2 py-3 text-center font-bold text-gray-700 min-w-[110px]">Status</th>
                                <th className="px-4 py-3 text-right font-bold text-gray-700 sticky right-0 z-10 bg-gray-50 border-l min-w-[160px]">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredWidgets.map(widget => {
                                const isAllowed = (selectedRole.widgetAccess || []).includes(widget.id);
                                return (
                                    <tr key={widget.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-900 bg-white sticky left-0 border-r">{widget.name}</td>
                                        <td className="px-2 py-3 text-center">
                                            {isAllowed ? (
                                                <Icon name="check" className="w-4 h-4 text-blue-600 mx-auto" />
                                            ) : (
                                                <Icon name="close" className="w-3 h-3 text-red-300 mx-auto opacity-50" />
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right sticky right-0 bg-white border-l">
                                            <div className="flex justify-end">
                                                <label className="relative inline-flex items-center cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        className="sr-only peer" 
                                                        checked={isAllowed} 
                                                        onChange={() => toggleWidgetAccess(widget.id)} 
                                                    />
                                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                                    <span className="ml-3 text-sm font-bold text-gray-700 w-16 text-right">{isAllowed ? 'Allow' : 'Deny'}</span>
                                                </label>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredWidgets.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="p-8 text-center text-gray-500">No configurable widgets for this module.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Widgets;
