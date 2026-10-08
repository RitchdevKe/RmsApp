
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, BarElement } from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

// Import Sub-modules
import FinancialPerformance from './FinancialPerformance';
import OccupancyTenancy from './OccupancyTenancy';
import AcquisitionInsights from './AcquisitionInsights';
import StaffPerformance from './StaffPerformance';
import PropertyInsights from './PropertyInsights';
import ReitPerformance from './ReitPerformance';
import CustomExplorer from './CustomExplorer';
import ScheduledReports from './ScheduledReports';
import { getCurrentMonthIso } from '../../utils/timezone';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, BarElement);

const DashboardView: React.FC = () => {
    const { tenants, properties, tasks, bills } = useData();

    // --- Live Metrics ---
    const metrics = useMemo(() => {
        // 1. Occupancy
        const totalUnits = properties.reduce((acc, p) => acc + p.units.length, 0);
        const occupiedUnits = properties.reduce((acc, p) => acc + p.units.filter(u => u.status === 'Occupied').length, 0);
        const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

        // 2. Revenue Collection (Current Month)
        const currentMonth = getCurrentMonthIso();
        const totalRentDue = tenants.reduce((acc, t) => acc + (t.status === 'Active' || t.status === 'Overdue' ? t.rentAmount : 0), 0);
        const collectedRent = tenants.reduce((acc, t) => {
            const paid = t.paymentHistory
                .filter(p => p.date.startsWith(currentMonth))
                .reduce((sum, p) => sum + (parseFloat(p.amount.replace(/[^0-9.]/g, '')) || 0), 0);
            return acc + paid;
        }, 0);
        const collectionRate = totalRentDue > 0 ? Math.round((collectedRent / totalRentDue) * 100) : 0;

        // 3. Operational Efficiency
        const totalTasks = tasks.length;
        const completedTasks = tasks.filter(t => t.status === 'Completed' || t.status === 'Closed').length;
        const taskResolutionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

        // 4. Overall Health Score (Weighted Average)
        const healthScore = Math.round((occupancyRate * 0.4) + (collectionRate * 0.4) + (taskResolutionRate * 0.2));

        return { occupancyRate, collectionRate, taskResolutionRate, healthScore, totalRentDue, collectedRent };
    }, [tenants, properties, tasks]);

    // --- Charts Data ---
    const revenueTrendData = useMemo(() => {
        const now = new Date();
        const labels: string[] = [];
        const data: number[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(d.toLocaleString('default', { month: 'short' }));
            const y = d.getFullYear();
            const m = d.getMonth();
            const paid = tenants.reduce((acc, t) => {
                const monthSum = t.paymentHistory.reduce((sum, p) => {
                    if (p.status !== 'Paid') return sum;
                    const pd = new Date(p.date);
                    if (isNaN(pd.getTime()) || pd.getFullYear() !== y || pd.getMonth() !== m) return sum;
                    return sum + (parseFloat(String(p.amount).replace(/[^0-9.]/g, '')) || 0);
                }, 0);
                return acc + monthSum;
            }, 0);
            data.push(paid / 1_000_000);
        }
        return {
            labels,
            datasets: [{
                label: 'Revenue (M KES)',
                data,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4
            }]
        };
    }, [tenants]);

    const expenseBreakdownData = useMemo(() => {
        const catMap: Record<string, number> = {};
        bills.forEach(b => {
            if (b.status !== 'Paid') return;
            const c = (b.category || 'Other').trim() || 'Other';
            catMap[c] = (catMap[c] || 0) + (b.amount || 0);
        });
        const labels = Object.keys(catMap);
        const vals = Object.values(catMap);
        if (labels.length === 0) {
            return {
                labels: ['No paid bills'],
                datasets: [{ data: [1], backgroundColor: ['#e5e7eb'], borderWidth: 0 }]
            };
        }
        const palette = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#64748b', '#10b981', '#14b8a6', '#f97316'];
        return {
            labels,
            datasets: [{
                data: vals,
                backgroundColor: labels.map((_, i) => palette[i % palette.length]),
                borderWidth: 0
            }]
        };
    }, [bills]);

    const alerts = useMemo(() => {
        const rows: { id: string; type: 'critical' | 'warning' | 'success'; text: string }[] = [];
        if (metrics.occupancyRate > 0 && metrics.occupancyRate < 85) {
            rows.push({ id: 'occ', type: 'critical', text: `Occupancy is ${metrics.occupancyRate}% (below 85%).` });
        }
        const hotTasks = tasks.filter(t =>
            (t.priority === 'High' || t.priority === 'Very High') &&
            t.status !== 'Completed' && t.status !== 'Closed'
        ).length;
        if (hotTasks > 0) {
            rows.push({ id: 'tasks', type: 'warning', text: `${hotTasks} high-priority tasks are still open.` });
        }
        if (metrics.collectionRate >= 90) {
            rows.push({ id: 'col', type: 'success', text: `Rent collection is ${metrics.collectionRate}% MTD.` });
        }
        if (rows.length === 0) {
            rows.push({ id: 'ok', type: 'success', text: 'No critical flags from current portfolio metrics.' });
        }
        return rows;
    }, [metrics, tasks]);

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Header / Health Score */}
            <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-5">
                    <Icon name="analytics" className="w-64 h-64 text-white" />
                </div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Portfolio Intelligence</h1>
                        <p className="text-gray-400 max-w-lg">Real-time holistic view of your property business performance.</p>
                        
                        <div className="flex gap-4 mt-6">
                            <div className="bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm">
                                <p className="text-xs text-gray-400 uppercase font-bold">Occupancy</p>
                                <p className={`text-xl font-bold ${metrics.occupancyRate >= 90 ? 'text-green-400' : 'text-yellow-400'}`}>{metrics.occupancyRate}%</p>
                            </div>
                            <div className="bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm">
                                <p className="text-xs text-gray-400 uppercase font-bold">Collection</p>
                                <p className={`text-xl font-bold ${metrics.collectionRate >= 90 ? 'text-green-400' : 'text-yellow-400'}`}>{metrics.collectionRate}%</p>
                            </div>
                            <div className="bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm">
                                <p className="text-xs text-gray-400 uppercase font-bold">Resolution</p>
                                <p className="text-xl font-bold text-blue-400">{metrics.taskResolutionRate}%</p>
                            </div>
                        </div>
                    </div>

                    {/* Health Score Gauge */}
                    <div className="relative w-40 h-40 flex-shrink-0">
                        <svg className="w-full h-full" viewBox="0 0 36 36">
                            <path
                                className="text-gray-700"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                            />
                            <path
                                className={`${metrics.healthScore > 80 ? 'text-green-500' : metrics.healthScore > 50 ? 'text-yellow-500' : 'text-red-500'}`}
                                strokeDasharray={`${metrics.healthScore}, 100`}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-4xl font-bold">{metrics.healthScore}</span>
                            <span className="text-[10px] uppercase tracking-wider text-gray-400">Health Score</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Revenue Trend */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Revenue Trend (6 Months)</h3>
                    <div className="h-64">
                        <Line 
                            data={revenueTrendData} 
                            options={{ 
                                responsive: true, 
                                maintainAspectRatio: false,
                                scales: { y: { beginAtZero: true, grid: { display: true, color: '#f3f4f6' } }, x: { grid: { display: false } } },
                                plugins: { legend: { display: false } }
                            }} 
                        />
                    </div>
                </div>

                {/* Intelligent Alerts */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                        <Icon name="bell" className="w-5 h-5 mr-2 text-primary" />
                        Live Pulse
                    </h3>
                    <div className="space-y-3 flex-grow">
                        {alerts.map(alert => (
                            <div key={alert.id} className={`p-3 rounded-lg border-l-4 text-sm ${
                                alert.type === 'critical' ? 'bg-red-50 border-red-500 text-red-800' :
                                alert.type === 'warning' ? 'bg-yellow-50 border-yellow-500 text-yellow-800' :
                                'bg-green-50 border-green-500 text-green-800'
                            }`}>
                                {alert.text}
                            </div>
                        ))}
                    </div>
                    <button className="w-full mt-4 py-2 text-xs font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 rounded transition-colors uppercase tracking-wide">
                        View All Notifications
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {/* Expense Breakdown */}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Expense Distribution</h3>
                    <div className="h-48 flex justify-center">
                        <Doughnut data={expenseBreakdownData} options={{ cutout: '70%', plugins: { legend: { position: 'right', labels: { boxWidth: 10, usePointStyle: true } } } }} />
                    </div>
                 </div>

                 {/* Top Performers (Mini) */}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Top Performing Assets</h3>
                    <ul className="space-y-3">
                        {properties.slice(0, 3).map((p, i) => (
                            <li key={p.id} className="flex justify-between items-center p-2 hover:bg-gray-50 rounded">
                                <div className="flex items-center gap-3">
                                    <span className="text-gray-400 font-bold text-sm">0{i+1}</span>
                                    <div>
                                        <p className="text-sm font-bold text-gray-800">{p.name}</p>
                                        <p className="text-xs text-gray-500">{p.subLocation && p.zone ? `${p.subLocation} (${p.zone})` : (p.subLocation || p.zone || p.location || p.branch || '')}</p>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">98% Occ.</span>
                            </li>
                        ))}
                    </ul>
                 </div>
            </div>
        </div>
    );
};

const Overview: React.FC = () => {
    const [activeTab, setActiveTab] = useState('Overview');

    const tabs = [
        'Overview', 
        'Financial Performance', 
        'Occupancy & Tenancy', 
        'Acquisition Insights', 
        'Staff Performance', 
        'Property Insights', 
        'R-reits Fund', 
        'Custom Explorer', 
        'Scheduled Reports'
    ];

    const renderContent = () => {
        switch(activeTab) {
            case 'Financial Performance': return <FinancialPerformance />;
            case 'Occupancy & Tenancy': return <OccupancyTenancy />;
            case 'Acquisition Insights': return <AcquisitionInsights />;
            case 'Staff Performance': return <StaffPerformance />;
            case 'Property Insights': return <PropertyInsights />;
            case 'R-reits Fund': return <ReitPerformance />;
            case 'Custom Explorer': return <CustomExplorer />;
            case 'Scheduled Reports': return <ScheduledReports />;
            default: return <DashboardView />;
        }
    };

    return (
        <div className="space-y-8 pb-10">
            {/* Top Navigation Bar */}
            <div className="flex flex-wrap gap-2 pb-4 border-b border-gray-200 overflow-x-auto">
                {tabs.map(tab => (
                    <button 
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors whitespace-nowrap ${
                            activeTab === tab 
                            ? 'bg-primary text-white shadow-md' 
                            : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="min-h-[500px]">
                {renderContent()}
            </div>
        </div>
    );
};

export default Overview;
