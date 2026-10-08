
import React, { useState } from 'react';
import { useData } from '../../../context/DataContext';
import { fmtDate } from '../../../utils/date';
import Icon from '../../Icon';

const Amendments: React.FC = () => {
    const { tenants, updateTenant } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTenantId, setSelectedTenantId] = useState('');
    const [amendmentType, setAmendmentType] = useState('Rent Adjustment');
    const [newValue, setNewValue] = useState('');

    const filteredTenants = tenants.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));

    const handleApply = () => {
        if (!selectedTenantId || !newValue) return alert("Select tenant and enter value.");
        
        // Mock update
        const tenant = tenants.find(t => t.id === selectedTenantId);
        if(tenant) {
            if (amendmentType === 'Rent Adjustment') {
                updateTenant(selectedTenantId, { rentAmount: parseFloat(newValue) });
            }
            // Add note to tenant record
            const note = `Lease Amendment: ${amendmentType} to ${newValue} on ${fmtDate(new Date())}`;
            updateTenant(selectedTenantId, { notes: [...(tenant.notes || []), note] });
            
            alert("Amendment applied and recorded.");
            setNewValue('');
            setSelectedTenantId('');
        }
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/general-operations/leases'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Lease Management
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Lease Amendments</h1>
                <p className="text-lg text-gray-500 mt-1">Modify active lease terms with full audit tracking.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Form */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6">Create Amendment</h3>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Search Tenant</label>
                            <div className="relative">
                                <input 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Type to search..."
                                    className="w-full pl-9 pr-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                                />
                                <div className="absolute left-3 top-2.5 text-gray-400"><Icon name="search" className="w-4 h-4" /></div>
                            </div>
                            {searchQuery && (
                                <div className="border rounded mt-1 max-h-40 overflow-y-auto bg-white">
                                    {filteredTenants.map(t => (
                                        <div 
                                            key={t.id} 
                                            onClick={() => { setSelectedTenantId(t.id); setSearchQuery(t.name); }}
                                            className="p-2 hover:bg-blue-50 cursor-pointer text-sm"
                                        >
                                            {t.name} - {t.unit}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Amendment Type</label>
                            <select value={amendmentType} onChange={e => setAmendmentType(e.target.value)} className="w-full p-2 border rounded-lg bg-white">
                                <option>Rent Adjustment</option>
                                <option>Add Occupant</option>
                                <option>Change Payment Due Date</option>
                                <option>Extend Term</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">New Value / Details</label>
                            <input 
                                value={newValue}
                                onChange={e => setNewValue(e.target.value)}
                                placeholder={amendmentType === 'Rent Adjustment' ? 'New Rent Amount' : 'Details...'}
                                className="w-full p-2 border rounded-lg"
                            />
                        </div>

                        <button onClick={handleApply} className="w-full py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-md mt-4">
                            Apply Amendment
                        </button>
                    </div>
                </div>

                {/* Recent History */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4">Recent Amendments</h3>
                    <div className="space-y-4">
                        {/* Mock History */}
                        <div className="p-3 bg-gray-50 rounded border border-gray-100">
                            <div className="flex justify-between mb-1">
                                <span className="font-bold text-sm">Rent Increase</span>
                                <span className="text-xs text-gray-400">2 days ago</span>
                            </div>
                            <p className="text-sm text-gray-600">Applied to <strong>John Doe</strong>. New Rent: KES 25,000</p>
                        </div>
                        <div className="p-3 bg-gray-50 rounded border border-gray-100">
                            <div className="flex justify-between mb-1">
                                <span className="font-bold text-sm">Lease Extension</span>
                                <span className="text-xs text-gray-400">1 week ago</span>
                            </div>
                            <p className="text-sm text-gray-600">Applied to <strong>Alice Smith</strong>. Extended to Dec 2026.</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Amendments;
