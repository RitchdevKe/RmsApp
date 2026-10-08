
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { exportToCSV } from '../../utils/exportHelper';
import { isRepurposedUnit } from '../../utils/repurposedUnits';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const ChartContainer: React.FC<{ type: 'bar' | 'doughnut'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-72' }) => {
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

    return <div className={`relative ${height} w-full`}><canvas ref={canvasRef}></canvas></div>;
};

const MetricCard: React.FC<{ title: string; value: string | number; subtext: string; color: string; icon: string }> = ({ title, value, subtext, color, icon }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4`} style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <p className="text-2xl font-extrabold text-gray-800 mt-1">{value}</p>
                <p className="text-xs text-gray-400 mt-1">{subtext}</p>
            </div>
            <div className={`p-2 rounded-full bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

interface VacancyData {
    unitId: string;
    unitNumber: string;
    propertyName: string;
    propertyLocation: string;
    propertyBranch: string;
    agentName: string;
    rent: number;
    daysVacant: number; // Mocked or calculated
    unitType: string;
}

const VacancyReports: React.FC = () => {
    const { properties, staff, marketplaceListings, offboardingRecords } = useData() as any;
    const [filter, setFilter] = useState<'All' | 'High Value' | 'Long Term'>('All');
    const [searchQuery, setSearchQuery] = useState('');

    // --- AGGREGATE VACANCY DATA ---
    const vacancyList: VacancyData[] = useMemo(() => {
        const list: VacancyData[] = [];
        
        properties.forEach(p => {
            const agent = staff.find(s => s.id === p.assignedAgentId);
            
            p.units.forEach(u => {
                if (u.status === 'Vacant' && !isRepurposedUnit(u)) {
                    const listing = marketplaceListings.find(l => l.unitId === u.id);
                    // Best available vacancy anchor date, in order of preference:
                    // 1. Latest offboarding record with a move-out date for this unit
                    //    (any status — presence of moveOutDate is what matters).
                    // 2. Explicit vacantSince on the unit.
                    // 3. Marketplace listing creation date.
                    // 4. Unit's own createdAt/updatedAt.
                    // 5. Property createdAt fallback.
                    const unitOffboard = (offboardingRecords || [])
                        .filter((o: any) => (
                            (o.unitId && o.unitId === u.id) ||
                            (o.unit && String(o.unit).toLowerCase() === String(u.unitNumber || (u as any).name || '').toLowerCase() && (!o.propertyId || o.propertyId === p.id))
                        ))
                        .map((o: any) => o.moveOutDate || o.actualMoveOutDate || o.dateRequested || o.createdAt)
                        .filter(Boolean)
                        .sort()
                        .pop();
                    const anchorIso =
                        unitOffboard
                        || (u as any).vacantSince
                        || listing?.dateCreated
                        || (u as any).createdAt
                        || (u as any).updatedAt
                        || (p as any).createdAt
                        || (p as any).dateCreated;
                    const anchor = anchorIso ? new Date(anchorIso) : null;
                    const diffMs = anchor && !isNaN(anchor.getTime()) ? (Date.now() - anchor.getTime()) : 0;
                    const daysVacant = anchor && !isNaN(anchor.getTime())
                        ? Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
                        : 0;

                    list.push({
                        unitId: u.id,
                        unitNumber: u.unitNumber,
                        propertyName: p.name,
                        propertyLocation: p.subLocation && p.zone ? `${p.subLocation} (${p.zone})` : (p.subLocation || p.zone || p.location || p.branch || ''),
                        propertyBranch: p.branch,
                        agentName: agent ? agent.name : 'Unassigned',
                        rent: u.rent || p.defaultMonthlyRent || 0,
                        daysVacant: daysVacant,
                        unitType: (u as any).unitType || p.type || ''
                    });
                }
            });
        });

        return list;
    }, [properties, staff, marketplaceListings, offboardingRecords]);

    // --- FILTERING ---
    const filteredList = useMemo(() => {
        return vacancyList.filter(item => {
            const q = searchQuery.toLowerCase();
            const matchesSearch = !q ||
                item.propertyName.toLowerCase().includes(q) ||
                item.agentName.toLowerCase().includes(q) ||
                item.unitNumber.toLowerCase().includes(q) ||
                (item.propertyLocation || '').toLowerCase().includes(q) ||
                (item.unitType || '').toLowerCase().includes(q);
            
            let matchesFilter = true;
            if (filter === 'High Value') matchesFilter = item.rent > 30000;
            if (filter === 'Long Term') matchesFilter = item.daysVacant > 30;

            return matchesSearch && matchesFilter;
        });
    }, [vacancyList, searchQuery, filter]);

    // --- METRICS ---
    const stats = useMemo(() => {
        const total = vacancyList.length;
        const totalPotentialRevenue = vacancyList.reduce((acc, curr) => acc + curr.rent, 0);
        const avgDays = total > 0 ? Math.round(vacancyList.reduce((acc, curr) => acc + curr.daysVacant, 0) / total) : 0;
        
        // Grouping for Charts
        const byAgent: Record<string, number> = {};
        const byProp: Record<string, number> = {};
        const byLoc: Record<string, number> = {};

        vacancyList.forEach(v => {
            byAgent[v.agentName] = (byAgent[v.agentName] || 0) + 1;
            byProp[v.propertyName] = (byProp[v.propertyName] || 0) + 1;
            byLoc[v.propertyBranch] = (byLoc[v.propertyBranch] || 0) + 1; // Or Location
        });

        return { total, totalPotentialRevenue, avgDays, byAgent, byProp, byLoc };
    }, [vacancyList]);

    // --- CHART DATA ---
    const agentChartData = {
        labels: Object.keys(stats.byAgent),
        datasets: [{
            label: 'Vacant Units',
            data: Object.values(stats.byAgent),
            backgroundColor: '#3b82f6',
            borderRadius: 4
        }]
    };

    const locationChartData = {
        labels: Object.keys(stats.byLoc),
        datasets: [{
            data: Object.values(stats.byLoc),
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
            borderWidth: 0
        }]
    };

    const handleExport = () => {
        const data = filteredList.map(v => ({
            Property: v.propertyName,
            Unit: v.unitNumber,
            Location: v.propertyLocation,
            Agent: v.agentName,
            Rent: v.rent,
            Days_Vacant: v.daysVacant
        }));
        exportToCSV(data, 'Vacancy_Report');
    };

    return (
        <div className="space-y-8 pb-10">
            <button onClick={() => window.location.hash = '#/reports-analytics/reports'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-4">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Reports Center
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Vacancy Analytics</h1>
                    <p className="text-lg text-gray-500 mt-1">Comprehensive breakdown of unoccupied units and potential revenue loss.</p>
                </div>
                <button onClick={handleExport} className="bg-primary text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-primary-dark flex items-center">
                    <Icon name="download" className="w-4 h-4 mr-2" /> Export Report
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <MetricCard 
                    title="Total Vacant Units" 
                    value={stats.total} 
                    subtext="Across Portfolio" 
                    color="#ef4444" 
                    icon="vacant-house" 
                />
                <MetricCard 
                    title="Potential Revenue Loss" 
                    value={`KES ${(stats.totalPotentialRevenue/1000).toFixed(1)}k`} 
                    subtext="Monthly Rent Value" 
                    color="#f59e0b" 
                    icon="revenue" 
                />
                <MetricCard 
                    title="Avg. Days Vacant" 
                    value={`${stats.avgDays} Days`} 
                    subtext="Turnaround Time" 
                    color="#3b82f6" 
                    icon="time" 
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4">Vacancies by Agent</h3>
                    <ChartContainer type="bar" data={agentChartData} height="h-64" />
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4">Vacancies by Branch/Location</h3>
                    <div className="flex justify-center">
                        <div className="w-64">
                            <ChartContainer type="doughnut" data={locationChartData} height="h-64" options={{ cutout: '65%', plugins: { legend: { position: 'right' } } }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Detailed Table */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                    <h3 className="text-xl font-bold text-gray-800">Detailed Vacancy List</h3>
                    <div className="flex gap-4 w-full sm:w-auto">
                        <select 
                            value={filter} 
                            onChange={(e) => setFilter(e.target.value as any)} 
                            className="p-2 border rounded-lg bg-gray-50 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                        >
                            <option>All</option>
                            <option>High Value</option>
                            <option>Long Term</option>
                        </select>
                        <input 
                            type="text" 
                            placeholder="Search by property, location, house type or agent..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="p-2 border rounded-lg w-full sm:w-64 focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                            <tr>
                                <th className="px-6 py-3">Property / Unit</th>
                                <th className="px-6 py-3">Location</th>
                                <th className="px-6 py-3">Assigned Agent</th>
                                <th className="px-6 py-3 text-right">Potential Rent</th>
                                <th className="px-6 py-3 text-center">Days Vacant</th>
                                <th className="px-6 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredList.map((row, idx) => (
                                <tr key={`${row.unitId}-${idx}`} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-800">{row.propertyName}</div>
                                        <div className="text-xs text-gray-500">{row.unitNumber}</div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-600">{row.propertyLocation}</td>
                                    <td className="px-6 py-4">
                                        <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold border border-blue-100">
                                            {row.agentName}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-gray-800">KES {row.rent.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`font-bold ${row.daysVacant > 30 ? 'text-red-500' : 'text-orange-500'}`}>
                                            {row.daysVacant} Days
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold uppercase">Vacant</span>
                                    </td>
                                </tr>
                            ))}
                            {filteredList.length === 0 && (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">No vacant units found matching criteria.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default VacancyReports;
