import React, { useState, useMemo } from 'react';
import { fmtDate } from '../../../utils/date';
import { useData } from '../../../context/DataContext';
import Icon from '../../Icon';
import { exportToCSV } from '../../../utils/exportHelper';

const TenantsWithoutLeases: React.FC = () => {
    const { tenants, properties } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [propertyFilter, setPropertyFilter] = useState('All');

    const tenantsWithoutLease = useMemo(() => {
        // Demo logic: flag if leaseType is 'Open' or randomly for data population
        return tenants.filter((t, index) => t.leaseType === 'Open' || !t.leaseEnd).map(t => ({
            ...t,
            moveInDate: t.onboardingDate
        }));
    }, [tenants]);

    const filteredList = useMemo(() => {
        return tenantsWithoutLease.filter(t => {
            const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  t.unit.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesProperty = propertyFilter === 'All' || t.propertyName === propertyFilter;
            return matchesSearch && matchesProperty;
        });
    }, [tenantsWithoutLease, searchQuery, propertyFilter]);

    const handleGenerateLease = (tenantId: string) => {
        alert(`Redirecting to generate lease for tenant ${tenantId}...`);
        window.location.hash = '#/general-operations/leases/lease-templates';
    };

    const handleExport = () => {
        const exportData = filteredList.map(t => ({
            Tenant: t.name,
            Property: t.propertyName,
            Unit: t.unit,
            MoveInDate: t.moveInDate,
            Phone: t.phone
        }));
        exportToCSV(exportData, 'TenantsWithoutLeases');
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/general-operations/leases'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Lease Management
            </button>
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Tenants Without Leases</h1>
                    <p className="text-lg text-gray-500 mt-1">Compliance Monitor: Identify and rectify missing documentation.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleExport} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex items-center font-bold">
                        <Icon name="download" className="w-4 h-4 mr-2"/> Export List
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-red-100">
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <div className="relative flex-grow w-full md:w-auto">
                        <input 
                            type="text" 
                            placeholder="Search..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-primary focus:border-primary"
                        />
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Icon name="search" className="w-5 h-5 text-gray-400" />
                        </div>
                    </div>
                    <div className="w-full md:w-auto">
                        <select 
                            value={propertyFilter} 
                            onChange={(e) => setPropertyFilter(e.target.value)}
                            className="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 text-sm font-medium"
                        >
                            <option value="All">All Properties</option>
                            {properties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-red-50 text-red-700 uppercase text-xs font-bold">
                            <tr>
                                <th className="px-6 py-3 text-left">Tenant</th>
                                <th className="px-6 py-3 text-left">Location</th>
                                <th className="px-6 py-3 text-left">Move-In Date</th>
                                <th className="px-6 py-3 text-center">Contact</th>
                                <th className="px-6 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filteredList.map(t => (
                                <tr key={t.id} className="hover:bg-red-50/20 transition-colors">
                                    <td className="px-6 py-4 font-bold text-gray-800">
                                        {t.name}
                                        <div className="text-xs font-normal text-red-500 mt-0.5">Missing Document</div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{t.propertyName} • {t.unit}</td>
                                    <td className="px-6 py-4 text-gray-600">{fmtDate(t.moveInDate)}</td>
                                    <td className="px-6 py-4 text-center text-gray-600">{t.phone}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => handleGenerateLease(t.id)}
                                            className="text-xs font-bold bg-primary text-white px-3 py-1.5 rounded hover:bg-primary-dark transition-colors"
                                        >
                                            Create Lease
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredList.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                        <div className="flex flex-col items-center">
                                            <Icon name="check" className="w-12 h-12 text-green-500 mb-2" />
                                            <p>All tenants have valid active leases!</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default TenantsWithoutLeases;
