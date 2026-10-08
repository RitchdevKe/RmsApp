// @ts-nocheck

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { TenantProfile, Task } from '../../types';
import { exportToCSV } from '../../utils/exportHelper';
import { computeTenantArrears } from '../../utils/tenantArrears';
import { fmtDate } from '../../utils/date';
import Icon from '../Icon';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { getCurrentMonthIso } from '../../utils/timezone';

ChartJS.register(ArcElement, Tooltip, Legend);

// --- Chart Helper ---
const Chart: React.FC<{ type: 'doughnut'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
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

// --- Reused Modals from ActiveTenants (embedded for report context) ---

const HouseStatusModal: React.FC<{ 
    tenant: TenantProfile; 
    onClose: () => void; 
    onSave: (status: string[]) => void 
}> = ({ tenant, onClose, onSave }) => {
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(tenant.houseStatus || []);

    const availableStatuses = [
        'Locked',
        'Electricity Disconnected',
        'Water Disconnected',
        'Gate Access Revoked',
        'Gas Disconnected',
        'Warning letter issued',
        'Eviction notice issued',
        'House Re-opened'
    ];

    const toggleStatus = (status: string) => {
        setSelectedStatuses(prev => 
            prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
        );
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1300] p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4 text-gray-800">Manage House Status</h2>
                <p className="text-sm text-gray-500 mb-4">Update the current condition of <strong>{tenant.unit}</strong> ({tenant.name}).</p>
                
                <div className="space-y-3 mb-6 max-h-60 overflow-y-auto">
                    {availableStatuses.map(status => (
                        <label key={status} className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                            <input 
                                type="checkbox" 
                                checked={selectedStatuses.includes(status)} 
                                onChange={() => toggleStatus(status)}
                                className="h-5 w-5 text-primary rounded border-gray-300 focus:ring-primary"
                            />
                            <span className={`ml-3 text-sm font-medium ${selectedStatuses.includes(status) ? 'text-red-600' : 'text-gray-700'}`}>
                                {status}
                            </span>
                        </label>
                    ))}
                </div>

                <div className="flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-md hover:bg-gray-200">Cancel</button>
                    <button onClick={() => onSave(selectedStatuses)} className="px-4 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark">Save Status</button>
                </div>
            </div>
        </div>
    );
};

const TenantTasksModal: React.FC<{
    tenant: TenantProfile;
    tasks: Task[];
    onClose: () => void;
}> = ({ tenant, tasks, onClose }) => {
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

    const tenantTasks = useMemo(() => 
        tasks.filter(t => t.tenant.name === tenant.name && t.tenant.unit === tenant.unit),
    [tasks, tenant]);

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'Completed': return 'bg-green-100 text-green-800';
            case 'Pending': return 'bg-yellow-100 text-yellow-800';
            case 'In Progress': return 'bg-blue-100 text-blue-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedTaskId(prev => prev === id ? null : id);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1300] p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full p-6 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">Task History</h2>
                        <p className="text-sm text-gray-500">All tasks associated with {tenant.name} ({tenant.unit})</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>

                <div className="overflow-y-auto flex-grow border rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium text-gray-500">Task</th>
                                <th className="px-4 py-3 text-left font-medium text-gray-500">Assigned To</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-500">Priority</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-500">Status</th>
                                <th className="px-4 py-3 text-right font-medium text-gray-500">Due Date</th>
                                <th className="px-4 py-3 text-center font-medium text-gray-500"></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {tenantTasks.map(task => (
                                <React.Fragment key={task.id}>
                                    <tr 
                                        onClick={() => toggleExpand(task.id)}
                                        className={`hover:bg-gray-50 cursor-pointer transition-colors ${expandedTaskId === task.id ? 'bg-gray-50' : ''}`}
                                    >
                                        <td className="px-4 py-3 font-medium text-gray-800">{task.title}</td>
                                        <td className="px-4 py-3 text-gray-600">{task.assignedTo}</td>
                                        <td className="px-4 py-3 text-center text-xs">
                                            <span className={`px-2 py-1 rounded border ${task.priority === 'High' || task.priority === 'Very High' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                                                {task.priority}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(task.status)}`}>
                                                {task.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right text-gray-500">{fmtDate(task.dueDate)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <Icon name={expandedTaskId === task.id ? 'chevron-up' : 'chevron-down'} className="w-4 h-4 text-gray-400" />
                                        </td>
                                    </tr>
                                    {expandedTaskId === task.id && (
                                        <tr className="bg-gray-50">
                                            <td colSpan={6} className="px-6 py-4 border-b">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div>
                                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Description</h4>
                                                        <p className="text-sm text-gray-700">{task.description}</p>
                                                        
                                                        <div className="mt-4">
                                                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Source</h4>
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white border border-gray-200 text-gray-800">
                                                                {task.source || 'Internal'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="space-y-4">
                                                        {task.costs && (
                                                            <div>
                                                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Cost Breakdown</h4>
                                                                <div className="bg-white p-2 rounded border border-gray-200 text-sm">
                                                                    <div className="flex justify-between"><span>Labor:</span> <span>KES {Number(task.costs?.labor ?? 0).toLocaleString()}</span></div>
                                                                    <div className="flex justify-between"><span>Materials:</span> <span>KES {Number(task.costs?.materials ?? 0).toLocaleString()}</span></div>
                                                                    <div className="flex justify-between"><span>Travel:</span> <span>KES {Number(task.costs?.travel ?? 0).toLocaleString()}</span></div>
                                                                    <div className="border-t mt-1 pt-1 flex justify-between font-bold"><span>Total:</span> <span>KES {(Number(task.costs?.labor ?? 0) + Number(task.costs?.materials ?? 0) + Number(task.costs?.travel ?? 0)).toLocaleString()}</span></div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        
                                                        {task.history && task.history.length > 0 && (
                                                            <div>
                                                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">Latest Update</h4>
                                                                <p className="text-xs text-gray-600 italic">
                                                                    {task.history[task.history.length - 1].timestamp}: {task.history[task.history.length - 1].event}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                            {tenantTasks.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No tasks found for this tenant.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// --- Main Component ---

type TenantReportData = TenantProfile & {
    taskCount: number;
    fines: number;
    arrears: number;
};

const TenancyReports: React.FC = () => {
    const { tenants: rawTenants, tasks, updateTenant } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    
    // Modal states
    const [statusModalTenant, setStatusModalTenant] = useState<TenantProfile | null>(null);
    const [tasksModalTenant, setTasksModalTenant] = useState<TenantProfile | null>(null);

    const currentMonthIso = useMemo(() => getCurrentMonthIso(), []);

    // Memoize to avoid re-filtering on every render
    const tenants: TenantReportData[] = useMemo(() =>
        rawTenants.map((t, i) => {
            let arrearsTotal = 0;
            try {
                if (!['Vacated', 'Evicted', 'Blacklisted', 'Inactive', 'PendingApproval', 'PendingAllocation', 'PendingPayment'].includes(String(t.status)) && Number(t.rentAmount ?? 0) > 0) {
                    const accrued = computeTenantArrears(t, currentMonthIso, { allTenants: rawTenants }).totalArrears || 0;
                    const adminArrears = Math.max(0, Number((t as any).arrears ?? 0));
                    arrearsTotal = Math.max(accrued, adminArrears);
                }
            } catch { /* fall back to zero */ }
            return {
                ...t,
                taskCount: tasks.filter(task => task.tenant.name === t.name && task.tenant.unit === t.unit && task.status !== 'Closed' && task.status !== 'Completed').length,
                fines: t.outstandingFines.reduce((sum, f) => sum + f.amount, 0),
                arrears: arrearsTotal,
            };
        })
    , [rawTenants, tasks, currentMonthIso]);

    const filteredTenants = useMemo(() => {
        if (!searchQuery) return tenants;
        const lowerQuery = searchQuery.toLowerCase();
        return tenants.filter(t => 
            t.name.toLowerCase().includes(lowerQuery) ||
            t.phone.includes(lowerQuery) ||
            t.idNumber.includes(lowerQuery) ||
            t.unit.toLowerCase().includes(lowerQuery)
        );
    }, [tenants, searchQuery]);

    // --- Stats ---
    const stats = useMemo(() => ({
        total: tenants.length,
        active: tenants.filter(t => t.status === 'Active').length,
        overdue: tenants.filter(t => t.arrears > 0).length,
        notice: tenants.filter(t => t.status === 'Notice').length,
        arrearsTotal: tenants.reduce((s, t) => s + t.arrears, 0)
    }), [tenants]);

    // Chart Data
    const statusChartData = {
        labels: ['Active', 'Overdue', 'Notice', 'Vacated'],
        datasets: [{
            data: [
                stats.active,
                stats.overdue,
                stats.notice,
                tenants.filter(t => t.status === 'Vacated').length
            ],
            backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#6b7280'],
            borderWidth: 0
        }]
    };

    const getStatusColor = (status: TenantProfile['status']) => {
        const colors: Record<TenantProfile['status'], string> = {
            Active: 'bg-green-100 text-green-800',
            Overdue: 'bg-red-100 text-red-800',
            Notice: 'bg-yellow-100 text-yellow-800',
            Evicted: 'bg-red-200 text-red-900 font-bold',
            Blacklisted: 'bg-gray-800 text-white',
            Vacated: 'bg-gray-200 text-gray-800',
            Pending: 'bg-blue-100 text-blue-800',
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    }

    const handleUpdateHouseStatus = (newStatus: string[]) => {
        if (statusModalTenant) {
            updateTenant(statusModalTenant.id, { houseStatus: newStatus });
            setStatusModalTenant(null);
        }
    };

    const handleExport = () => {
        const exportData = filteredTenants.map(t => ({
            Name: t.name,
            ID_Number: t.idNumber,
            Phone: t.phone,
            Unit: t.unit,
            Property: t.propertyName,
            Rent: t.rentAmount,
            Status: t.status,
            Arrears: t.arrears,
            Fines: t.fines,
            House_Status: t.houseStatus?.join(', ') || 'Normal',
            Pending_Tasks: t.taskCount
        }));
        exportToCSV(exportData, 'TenancyReport');
    };

    return (
        <div className="space-y-8 pb-10">
            <button onClick={() => window.location.hash = '#/reports-analytics/reports'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-4">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Reports Center
            </button>
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Tenancy Reports</h1>
                    <p className="text-lg text-gray-500 mt-1">Detailed analysis of tenant population, status, and compliance.</p>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Active Tenants</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{stats.active}</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-red-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">In Arrears</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{stats.overdue}</p>
                    <p className="text-xs text-red-600 mt-1">KES {stats.arrearsTotal.toLocaleString()}</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-yellow-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">On Notice</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{stats.notice}</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Total Profiles</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{stats.total}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                 {/* Chart */}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4">Status Distribution</h3>
                    <div className="h-64 flex justify-center">
                         <Chart type="doughnut" data={statusChartData} options={{ cutout: '70%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } }} />
                    </div>
                 </div>

                {/* Table */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                        <input 
                            type="text"
                            placeholder="Search by name, phone, ID, unit..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full max-w-sm p-2 border border-gray-200 rounded-lg focus:ring-primary focus:border-primary outline-none"
                        />
                        <button onClick={handleExport} className="px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 flex items-center">
                            <Icon name="download" className="w-4 h-4 mr-2" /> Export CSV
                        </button>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-gray-100 h-[400px]">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">House</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Arrears</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tasks</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {filteredTenants.map(tenant => (
                                    <tr key={tenant.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-gray-900">
                                            {tenant.name}
                                            <div className="text-xs text-gray-500">{tenant.phone}</div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {tenant.propertyName}
                                            <div className="text-xs font-bold">{tenant.unit}</div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(tenant.status)}`}>
                                                {tenant.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            {tenant.houseStatus && tenant.houseStatus.length > 0 ? (
                                                <button 
                                                    onClick={() => setStatusModalTenant(tenant)}
                                                    className="text-left hover:opacity-80"
                                                >
                                                    {tenant.houseStatus.slice(0, 1).map(s => (
                                                        <span key={s} className="inline-block bg-red-100 text-red-800 text-[10px] px-2 py-0.5 rounded border border-red-200">
                                                            {s}
                                                        </span>
                                                    ))}
                                                    {tenant.houseStatus.length > 1 && <span className="text-[9px] ml-1 text-gray-400">+{tenant.houseStatus.length-1}</span>}
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={() => setStatusModalTenant(tenant)}
                                                    className="text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 px-2 py-1 rounded hover:bg-gray-50"
                                                >
                                                    Set
                                                </button>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-semibold text-red-600">{tenant.arrears > 0 ? `KES ${tenant.arrears.toLocaleString()}` : '-'}</td>
                                        <td className="px-4 py-3 text-center">
                                            <button 
                                                onClick={() => setTasksModalTenant(tenant)}
                                                className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                                                    tenant.taskCount > 0 
                                                    ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' 
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                }`}
                                            >
                                                {tenant.taskCount}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modals */}
            {statusModalTenant && (
                <HouseStatusModal 
                    tenant={statusModalTenant} 
                    onClose={() => setStatusModalTenant(null)} 
                    onSave={handleUpdateHouseStatus} 
                />
            )}
            
            {tasksModalTenant && (
                <TenantTasksModal 
                    tenant={tasksModalTenant}
                    tasks={tasks}
                    onClose={() => setTasksModalTenant(null)}
                />
            )}
        </div>
    );
};

export default TenancyReports;
