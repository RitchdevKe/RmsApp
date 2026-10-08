
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { StaffProfile, UserRole } from '../../types';
import { exportToCSV } from '../../utils/exportHelper';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

// --- Chart Helper ---
const Chart: React.FC<{ type: 'pie'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
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

const KpiCard: React.FC<{ title: string; value: string | number; subtext: string; icon: string; color: string }> = ({ title, value, subtext, icon, color }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4`} style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
                <p className="text-xs text-gray-400 mt-1">{subtext}</p>
            </div>
            <div className={`p-2 rounded-full bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

const StaffReports: React.FC = () => {
    const { staff } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<UserRole | 'All'>('All');

    // Deep Linking for Role Filter
    useEffect(() => {
        const hash = window.location.hash;
        if (hash.includes('?')) {
            const params = new URLSearchParams(hash.split('?')[1]);
            const role = params.get('role');
            if (role) {
                // Decode in case of spaces like 'Field Agent'
                const decodedRole = decodeURIComponent(role) as UserRole;
                setRoleFilter(decodedRole);
            }
        }
    }, []);

    const filteredStaff = useMemo(() => {
        return staff.filter(member => {
            const roleMatch = roleFilter === 'All' || member.role === roleFilter;
            const searchMatch = searchQuery === '' || 
                                member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                member.branch.toLowerCase().includes(searchQuery.toLowerCase());
            return roleMatch && searchMatch;
        });
    }, [staff, searchQuery, roleFilter]);

    const allRoles: UserRole[] = useMemo(() => [...new Set(staff.map(s => s.role))], [staff]);
    
    // Stats
    const totalPayroll = staff.reduce((acc, s) => acc + (s.payrollInfo?.baseSalary || 0), 0);
    const activeStaff = staff.filter(s => s.status === 'Active').length;
    const leaveCount = staff.filter(s => s.status === 'On Leave').length;
    
    // Chart Data
    const roleDistribution = useMemo(() => {
        const counts: Record<string, number> = {};
        staff.forEach(s => counts[s.role] = (counts[s.role] || 0) + 1);
        return {
            labels: Object.keys(counts),
            datasets: [{
                data: Object.values(counts),
                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#6366f1'],
                borderWidth: 0
            }]
        };
    }, [staff]);

    const handleExport = () => {
        const exportData = filteredStaff.map(s => ({
            Name: s.name,
            Role: s.role,
            Email: s.email,
            Phone: s.phone,
            Branch: s.branch,
            Status: s.status,
            Base_Salary: s.payrollInfo?.baseSalary || 0,
            Leave_Balance: s.leaveBalance?.annual || 0
        }));
        exportToCSV(exportData, 'StaffReport');
    };

    return (
        <div className="space-y-8 pb-10">
            <button onClick={() => window.location.hash = '#/reports-analytics/reports'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-4">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Reports Center
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Staff Reports</h1>
                <p className="text-lg text-gray-500 mt-1">Detailed breakdown of personnel, payroll, and roles.</p>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <KpiCard title="Total Staff" value={staff.length} subtext={`${activeStaff} Active`} color="#3b82f6" icon="hr" />
                <KpiCard title="Monthly Payroll" value={`KES ${(totalPayroll/1000).toFixed(1)}k`} subtext="Base Salaries" color="#10b981" icon="payments" />
                <KpiCard title="On Leave" value={leaveCount} subtext="Currently Absent" color="#f59e0b" icon="time" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Chart */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4">Staff Distribution by Role</h3>
                    <div className="flex justify-center h-64">
                         <Chart type="pie" data={roleDistribution} options={{ plugins: { legend: { position: 'bottom' } } }} />
                    </div>
                </div>

                {/* Table */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                        <div className="flex gap-2 w-full sm:w-auto">
                            <input 
                                type="text"
                                placeholder="Search by name or branch..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full sm:w-48 p-2 border border-gray-200 rounded-md focus:ring-primary focus:border-primary outline-none"
                            />
                             <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as any)} className="p-2 border border-gray-200 rounded-md bg-white text-sm">
                                <option value="All">All Roles</option>
                                {allRoles.map(role => <option key={role} value={role}>{role}</option>)}
                            </select>
                        </div>
                        <button onClick={handleExport} className="px-4 py-2 bg-gray-100 text-gray-700 font-semibold rounded-md hover:bg-gray-200 w-full sm:w-auto flex items-center justify-center">
                            <Icon name="download" className="w-4 h-4 mr-2" /> Export
                        </button>
                    </div>
                    <div className="overflow-x-auto h-[300px]">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Branch</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assignment</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredStaff.map(member => (
                                    <tr key={member.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{member.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">{member.phone}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">{member.role}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">{member.branch}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-gray-500">{member.businessUnitAssignment || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${member.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{member.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StaffReports;
