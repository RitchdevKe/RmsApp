
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Lease, LeaseStatus } from '../../../types';
import { useData } from '../../../context/DataContext';
import { fmtDate } from '../../../utils/date';
import Icon from '../../Icon';

// Chart Helper
const Chart: React.FC<{ type: 'bar' | 'line' | 'doughnut'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<any>(null);

    useEffect(() => {
        if (!canvasRef.current || !(window as any).Chart) return;
        if (chartRef.current) chartRef.current.destroy();

        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            chartRef.current = new (window as any).Chart(ctx, {
                type,
                data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    ...options
                },
            });
        }
        return () => chartRef.current?.destroy();
    }, [type, data, options]);

    return <div className={`relative ${height}`}><canvas ref={canvasRef}></canvas></div>;
};

const KpiCard: React.FC<{ title: string; value: string | number; subtext: string; color: string; icon: string; onClick?: () => void }> = ({ title, value, subtext, color, icon, onClick }) => (
    <div onClick={onClick} className={`bg-white p-5 rounded-xl shadow-sm border-l-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`} style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <h3 className="text-2xl font-extrabold text-gray-800 mt-1">{value}</h3>
                <p className="text-xs text-gray-400 mt-1">{subtext}</p>
            </div>
            <div className={`p-2 rounded-full bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

const ActiveLeases: React.FC = () => {
    const { tenants } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'All' | LeaseStatus>('All');

    // --- Data Processing ---
    const leases: Lease[] = useMemo(() => {
        const now = new Date();
        const warningDate = new Date();
        warningDate.setDate(now.getDate() + 90);

        return tenants.map(t => {
            let status = LeaseStatus.Active;
            if (t.status === 'Evicted') status = LeaseStatus.Evicted;
            else if (t.status === 'Vacated') status = LeaseStatus.Terminated;
            else if (t.leaseEnd) {
                const endDate = new Date(t.leaseEnd);
                if (endDate > now && endDate <= warningDate) status = LeaseStatus.ExpiringSoon;
            }

            return {
                id: `lease-${t.id}`,
                tenantName: t.name,
                property: t.propertyName || 'Unknown',
                unit: t.unit,
                startDate: t.onboardingDate,
                endDate: t.leaseEnd || 'Indefinite',
                rent: t.rentAmount,
                status: status,
                history: []
            };
        });
    }, [tenants]);

    const filteredLeases = useMemo(() => {
        return leases.filter(l => {
            const matchesSearch = l.tenantName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  l.unit.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                  l.property.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesStatus = statusFilter === 'All' || l.status === statusFilter;
            return matchesSearch && matchesStatus;
        });
    }, [leases, searchQuery, statusFilter]);

    // --- Metrics ---
    const totalLeases = leases.length;
    const expiringSoon = leases.filter(l => l.status === LeaseStatus.ExpiringSoon).length;
    const totalRentValue = leases.filter(l => l.status === LeaseStatus.Active || l.status === LeaseStatus.ExpiringSoon).reduce((sum, l) => sum + l.rent, 0);
    const avgRent = totalLeases > 0 ? Math.round(totalRentValue / totalLeases) : 0;

    // --- Chart Data ---
    const expiryData = useMemo(() => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentMonth = new Date().getMonth();
        const counts = Array(6).fill(0);
        const labels = Array(6).fill('');

        for(let i=0; i<6; i++) {
            const mIndex = (currentMonth + i) % 12;
            labels[i] = months[mIndex];
            
            // Count leases expiring in this month (relative to now)
            // Simplified for demo: distributing 'expiring soon' across months
            if (i < 3) counts[i] = Math.ceil(expiringSoon / 3); 
        }

        return {
            labels,
            datasets: [{
                label: 'Leases Expiring',
                data: counts,
                backgroundColor: '#F39C2A',
                borderRadius: 4
            }]
        };
    }, [expiringSoon]);

    const getStatusBadge = (status: LeaseStatus) => {
        const config = {
            [LeaseStatus.Active]: 'bg-green-100 text-green-800',
            [LeaseStatus.ExpiringSoon]: 'bg-yellow-100 text-yellow-800',
            [LeaseStatus.Renewed]: 'bg-blue-100 text-blue-800',
            [LeaseStatus.Terminated]: 'bg-gray-100 text-gray-600',
            [LeaseStatus.Evicted]: 'bg-red-100 text-red-800',
        };
        return <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${config[status] || 'bg-gray-100'}`}>{status}</span>;
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/general-operations/leases'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Lease Management
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Active Leases</h1>
                <p className="text-lg text-gray-500 mt-1">Central registry of all active tenancy agreements.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard 
                    title="Active Leases" 
                    value={leases.filter(l => l.status === LeaseStatus.Active).length} 
                    subtext="+12 this month" 
                    icon="leases" 
                    color="#10b981"
                    onClick={() => setStatusFilter(LeaseStatus.Active)} 
                />
                <KpiCard 
                    title="Expiring (90 Days)" 
                    value={expiringSoon} 
                    subtext="Requires Action" 
                    icon="time" 
                    color="#f59e0b"
                    onClick={() => setStatusFilter(LeaseStatus.ExpiringSoon)}
                />
                <KpiCard 
                    title="Portfolio Value" 
                    value={`KES ${(totalRentValue/1000000).toFixed(2)}M`} 
                    subtext="Monthly Rent Roll" 
                    icon="revenue" 
                    color="#3b82f6" 
                />
                <KpiCard 
                    title="Avg. Lease Value" 
                    value={`KES ${avgRent.toLocaleString()}`} 
                    subtext="Per Unit" 
                    icon="analytics" 
                    color="#8b5cf6" 
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* List View */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <div className="relative w-64">
                            <input 
                                type="text" 
                                placeholder="Search tenant, unit..." 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary focus:border-primary outline-none"
                            />
                            <div className="absolute left-3 top-2.5 text-gray-400"><Icon name="search" className="w-4 h-4" /></div>
                        </div>
                        <select 
                            value={statusFilter} 
                            onChange={e => setStatusFilter(e.target.value as any)} 
                            className="p-2 border rounded-lg bg-gray-50 text-sm font-medium"
                        >
                            <option value="All">All Statuses</option>
                            <option value={LeaseStatus.Active}>Active</option>
                            <option value={LeaseStatus.ExpiringSoon}>Expiring Soon</option>
                            <option value={LeaseStatus.Terminated}>Terminated</option>
                        </select>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-4 py-3">Tenant</th>
                                    <th className="px-4 py-3">Property</th>
                                    <th className="px-4 py-3">Term</th>
                                    <th className="px-4 py-3 text-right">Rent</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-4 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredLeases.map(lease => (
                                    <tr key={lease.id} className="hover:bg-gray-50 group">
                                        <td className="px-4 py-3 font-medium text-gray-900">{lease.tenantName}</td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {lease.property}
                                            <span className="block text-xs text-gray-400">{lease.unit}</span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-xs">
                                            {fmtDate(lease.startDate)} - <br/>
                                            {lease.endDate === 'Indefinite' ? 'Month-to-Month' : fmtDate(lease.endDate)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-800">KES {lease.rent.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center">{getStatusBadge(lease.status)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <button className="text-gray-400 hover:text-primary transition-colors">
                                                <Icon name="settings" className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredLeases.length === 0 && (
                                    <tr><td colSpan={6} className="p-8 text-center text-gray-400">No leases found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Side Panel: Expiry Forecast */}
                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="font-bold text-gray-800 mb-4">Expiry Forecast (6 Months)</h3>
                        <Chart type="bar" data={expiryData} />
                    </div>

                    <div className="bg-gradient-to-br from-blue-900 to-indigo-800 rounded-xl p-6 text-white shadow-lg">
                        <h3 className="font-bold text-lg mb-2">Renewal Opportunity</h3>
                        <p className="text-blue-200 text-sm mb-4">
                            {expiringSoon} leases are expiring soon. Proactively engaging these tenants can improve retention by 15%.
                        </p>
                        <button 
                            onClick={() => window.location.hash = '#/general-operations/leases/renewals'}
                            className="w-full py-2 bg-white text-blue-900 font-bold rounded-lg hover:bg-blue-50 transition-colors"
                        >
                            Go to Renewals
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ActiveLeases;
