
import React, { useState, useMemo } from 'react';
import { useData } from '../../../context/DataContext';
import { TaskStatus } from '../../../types';
import Icon from '../../Icon';

const KpiCard: React.FC<{ title: string; value: string; icon: string; color: string; trend?: string }> = ({ title, value, icon, color, trend }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border-l-4" style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <h3 className="text-2xl font-extrabold text-gray-800 mt-2">{value}</h3>
                {trend && <p className="text-xs text-green-600 mt-1 font-bold">{trend}</p>}
            </div>
            <div className={`p-3 rounded-full bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

const Reporting: React.FC = () => {
    const { tasks } = useData();
    const [dateRange, setDateRange] = useState('Last 30 Days');

    const metrics = useMemo(() => {
        const total = tasks.length;
        const closed = tasks.filter(t => t.status === TaskStatus.Closed).length;
        const completed = tasks.filter(t => t.status === TaskStatus.Completed).length;
        
        // Mock Cost Calculation
        const totalCost = tasks.reduce((sum, t) => sum + ((t.costs?.labor || 0) + (t.costs?.materials || 0)), 0);
        
        const complianceRate = 92; // Mock
        const avgTime = 2.4; // Mock

        return {
            total,
            resolutionRate: total > 0 ? Math.round(((closed + completed) / total) * 100) : 0,
            totalCost,
            complianceRate,
            avgTime
        };
    }, [tasks]);

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/field-operations/maintenance'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Maintenance
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Maintenance Intelligence</h1>
                    <p className="text-lg text-gray-500 mt-1">Operational insights and performance metrics.</p>
                </div>
                <select value={dateRange} onChange={e => setDateRange(e.target.value)} className="p-2 border rounded-lg bg-white font-bold text-sm shadow-sm">
                    <option>Last 30 Days</option>
                    <option>This Quarter</option>
                    <option>This Year</option>
                </select>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard title="Resolution Rate" value={`${metrics.resolutionRate}%`} icon="check" color="#10b981" trend="+2% vs last month" />
                <KpiCard title="Avg Resolution Time" value={`${metrics.avgTime} Days`} icon="time" color="#3b82f6" trend="-0.5 days (Faster)" />
                <KpiCard title="Total Spend" value={`KES ${(metrics.totalCost/1000).toFixed(1)}k`} icon="revenue" color="#ef4444" />
                <KpiCard title="Vendor Compliance" value={`${metrics.complianceRate}%`} icon="shield" color="#8b5cf6" trend="High Standard" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Cost Distribution by Category</h3>
                    <div className="space-y-4">
                        {/* Mock Distribution Bars */}
                        <div>
                            <div className="flex justify-between text-sm mb-1"><span>Plumbing</span><span className="font-bold">40%</span></div>
                            <div className="w-full bg-gray-100 rounded-full h-2"><div className="bg-blue-500 h-2 rounded-full" style={{ width: '40%' }}></div></div>
                        </div>
                        <div>
                            <div className="flex justify-between text-sm mb-1"><span>Electrical</span><span className="font-bold">25%</span></div>
                            <div className="w-full bg-gray-100 rounded-full h-2"><div className="bg-yellow-500 h-2 rounded-full" style={{ width: '25%' }}></div></div>
                        </div>
                        <div>
                            <div className="flex justify-between text-sm mb-1"><span>General Repairs</span><span className="font-bold">20%</span></div>
                            <div className="w-full bg-gray-100 rounded-full h-2"><div className="bg-gray-500 h-2 rounded-full" style={{ width: '20%' }}></div></div>
                        </div>
                         <div>
                            <div className="flex justify-between text-sm mb-1"><span>Painting</span><span className="font-bold">15%</span></div>
                            <div className="w-full bg-gray-100 rounded-full h-2"><div className="bg-purple-500 h-2 rounded-full" style={{ width: '15%' }}></div></div>
                        </div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Top Performing Vendors</h3>
                    <ul className="space-y-3">
                         <li className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <span className="font-bold text-gray-700">FixIt All Ltd</span>
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-bold">4.8 ★</span>
                        </li>
                        <li className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <span className="font-bold text-gray-700">Sparky Electricians</span>
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-bold">4.7 ★</span>
                        </li>
                        <li className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <span className="font-bold text-gray-700">Flow Plumbers</span>
                            <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-bold">4.5 ★</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default Reporting;
