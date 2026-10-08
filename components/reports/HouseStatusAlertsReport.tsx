// @ts-nocheck

import React, { useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { TenantProfile } from '../../types';
import { exportToCSV } from '../../utils/exportHelper';
import { fmtDate } from '../../utils/date';
import Icon from '../Icon';

const HouseStatusAlertsReport: React.FC = () => {
    const { tenants: rawTenants, updateTenant } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    
    const navigate = (url: string) => {
        window.location.hash = url;
    };

    // Filter for tenants who have at least one house status or are pending approval
    const alerts = useMemo(() => {
        const filtered = [];
        rawTenants.forEach(t => {
            const hasHouseStatus = t.houseStatus && t.houseStatus.length > 0;
            const isPendingApproval = t.status === 'PendingApproval';
            
            if (hasHouseStatus || isPendingApproval) {
                const effectiveStatuses = [...(t.houseStatus || [])];
                if (isPendingApproval) effectiveStatuses.push('Pending Approval');
                
                filtered.push({
                    ...t,
                    effectiveStatuses
                });
            }
        });
        return filtered;
    }, [rawTenants]);

    const filteredAlerts = useMemo(() => {
        if (!searchQuery) return alerts;
        const lowerQuery = searchQuery.toLowerCase();
        return alerts.filter(t => 
            t.name.toLowerCase().includes(lowerQuery) ||
            t.unit?.toLowerCase().includes(lowerQuery) ||
            t.propertyName?.toLowerCase().includes(lowerQuery)
        );
    }, [alerts, searchQuery]);

    const handleExport = () => {
        const exportData = filteredAlerts.map(t => ({
            Unit: t.unit,
            Tenant: t.name,
            Property: t.propertyName,
            Statuses: t.effectiveStatuses.join(', '),
            Status: t.status,
            Rent: t.rentAmount
        }));
        exportToCSV(exportData, 'HouseStatusAlertsReport');
    };

    return (
        <div className="space-y-8 pb-10">
            <button onClick={() => window.location.hash = '#/reports-analytics/reports'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-4">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Reports Center
            </button>
            
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">House Status Alerts Report</h1>
                    <p className="text-lg text-gray-500 mt-1">Detailed list of all units with status alerts or pending approvals.</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={handleExport} className="px-4 py-2 bg-white text-gray-700 font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center shadow-sm">
                        <Icon name="download" className="w-4 h-4 mr-2" /> Export CSV
                    </button>
                    <button onClick={() => navigate('#/dashboard')} className="px-4 py-2 bg-gray-900 text-white font-semibold rounded-lg hover:bg-black flex items-center shadow-sm">
                        Dashboard
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-red-50 p-6 rounded-xl border border-red-100">
                    <p className="text-xs font-bold text-red-600 uppercase tracking-wider">Total Alerts</p>
                    <p className="text-3xl font-extrabold text-red-800 mt-1">{alerts.length}</p>
                </div>
                <div className="bg-amber-50 p-6 rounded-xl border border-amber-100">
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Pending Approvals</p>
                    <p className="text-3xl font-extrabold text-amber-800 mt-1">{alerts.filter(a => a.status === 'PendingApproval').length}</p>
                </div>
                <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Filtered Results</p>
                    <p className="text-3xl font-extrabold text-blue-800 mt-1">{filteredAlerts.length}</p>
                </div>
            </div>

            {/* List */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50/50">
                    <div className="relative w-full max-w-md">
                        <input 
                            type="text"
                            placeholder="Filter by unit, tenant, or property..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-primary focus:border-primary outline-none"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        <Icon name="search" className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-6">
                    {filteredAlerts.length > 0 ? filteredAlerts.map(tenant => (
                        <div 
                            key={tenant.id} 
                            onClick={() => {
                                const isPending = tenant.status === 'PendingApproval';
                                navigate(isPending ? `#/tenants/applications?tenantId=${tenant.id}` : `#/tenants/active-tenants?tenantId=${tenant.id}`);
                            }}
                            className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-primary/20 transition-all cursor-pointer group"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className="p-2 bg-red-50 rounded-lg group-hover:bg-red-100 transition-colors">
                                    <Icon name="home" className="w-5 h-5 text-red-600" />
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter ${tenant.status === 'PendingApproval' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                                    {tenant.status}
                                </span>
                            </div>
                            
                            <h3 className="font-bold text-gray-900 group-hover:text-primary transition-colors">{tenant.unit}</h3>
                            <p className="text-sm text-gray-500 mb-4">{tenant.name}</p>
                            
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-gray-400 uppercase">Current Alerts</p>
                                <div className="flex flex-wrap gap-1">
                                    {tenant.effectiveStatuses.map(s => (
                                        <span key={s} className="bg-red-50 text-red-700 text-[10px] px-2 py-0.5 rounded border border-red-100">
                                            {s}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between text-xs">
                                <span className="text-gray-400">{tenant.propertyName}</span>
                                <span className="font-semibold text-gray-700">View Profile &rarr;</span>
                            </div>
                        </div>
                    )) : (
                        <div className="col-span-full py-20 text-center">
                            <div className="mx-auto w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-300">
                                <Icon name="search" className="w-8 h-8" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-800">No alerts found</h3>
                            <p className="text-gray-500">No tenants currently meet the house status alert criteria.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HouseStatusAlertsReport;
