
import React, { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const StackingPlan: React.FC<{ property: any }> = ({ property }) => {
    // Group units by floor (assuming standard unit naming or floor field)
    const floors: Record<number, any[]> = {};
    const maxFloor = property.floors || 1;
    
    // Sort units into floors
    property.units.forEach((u: any) => {
        const floor = u.floor !== undefined ? u.floor : 0;
        if (!floors[floor]) floors[floor] = [];
        floors[floor].push(u);
    });

    return (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50">
            <h4 className="font-bold text-sm text-gray-700 mb-3 text-center">{property.name} Stacking Plan</h4>
            <div className="space-y-1">
                {Object.keys(floors).sort((a,b) => Number(b) - Number(a)).map(floorNum => (
                    <div key={floorNum} className="flex gap-1 justify-center">
                        <div className="w-6 text-[10px] text-gray-400 flex items-center justify-center">{floorNum}F</div>
                        {floors[Number(floorNum)].map((u: any) => (
                            <div 
                                key={u.id} 
                                className={`w-8 h-8 rounded-sm flex items-center justify-center text-[9px] font-bold text-white shadow-sm cursor-help ${
                                    u.status === 'Occupied' ? 'bg-green-500' : 
                                    u.status === 'Vacant' ? 'bg-red-500' : 
                                    'bg-yellow-500'
                                }`}
                                title={`Unit ${u.unitNumber}: ${u.status}`}
                            >
                                {u.unitNumber.replace(/[^0-9]/g,'')}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            <div className="flex justify-center gap-4 mt-4 text-[10px] text-gray-500">
                <span className="flex items-center"><span className="w-2 h-2 bg-green-500 rounded mr-1"></span> Occ</span>
                <span className="flex items-center"><span className="w-2 h-2 bg-red-500 rounded mr-1"></span> Vac</span>
                <span className="flex items-center"><span className="w-2 h-2 bg-yellow-500 rounded mr-1"></span> Maint</span>
            </div>
        </div>
    );
};

const OccupancyTenancy: React.FC = () => {
    const { properties, tenants } = useData();

    // --- Metrics ---
    const totalUnits = properties.reduce((acc, p) => acc + p.units.length, 0);
    const occupiedUnits = properties.reduce((acc, p) => acc + p.units.filter(u => u.status === 'Occupied').length, 0);
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
    
    // Lease Expiry Analysis
    const expiryCounts = useMemo(() => {
        const counts = Array(6).fill(0);
        const now = new Date();
        tenants.forEach(t => {
            if (t.leaseEnd) {
                const date = new Date(t.leaseEnd);
                const diff = (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth());
                if (diff >= 0 && diff < 6) counts[diff]++;
            }
        });
        return counts;
    }, [tenants]);

    const expiryChartData = {
        labels: ['Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5', 'Month 6'],
        datasets: [{
            label: 'Leases Expiring',
            data: expiryCounts,
            backgroundColor: '#f59e0b',
            borderRadius: 4
        }]
    };

    const { churnMoveOuts, churnMoveIns, netAbsorption } = useMemo(() => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const moveOuts = tenants.filter(t => {
            if (t.status !== 'Vacated' && t.status !== 'Evicted') return false;
            if (!t.leaseEnd) return false;
            const d = new Date(t.leaseEnd);
            return d.getFullYear() === y && d.getMonth() === m;
        }).length;
        const moveIns = tenants.filter(t => {
            const d = new Date(t.onboardingDate);
            return d.getFullYear() === y && d.getMonth() === m;
        }).length;
        return { churnMoveOuts: moveOuts, churnMoveIns: moveIns, netAbsorption: moveIns - moveOuts };
    }, [tenants]);

    return (
        <div className="space-y-8 pb-10">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Occupancy & Tenancy</h1>
                <p className="text-lg text-gray-500 mt-1">Visualize portfolio density, lease cycles, and unit status.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Physical Occupancy</p>
                    <p className="text-3xl font-extrabold text-gray-800 mt-1">{occupancyRate}%</p>
                    <p className="text-xs text-green-600 mt-1">{occupiedUnits} / {totalUnits} Units</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-orange-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Leases Expiring (6 Mo)</p>
                    <p className="text-3xl font-extrabold text-gray-800 mt-1">{expiryCounts.reduce((a,b)=>a+b,0)}</p>
                    <p className="text-xs text-orange-600 mt-1">Retention risk</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Avg. Lease Term</p>
                    <p className="text-3xl font-extrabold text-gray-800 mt-1">1.4 Yrs</p>
                    <p className="text-xs text-blue-600 mt-1">Portfolio Average</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Lease Expiry Forecast</h3>
                    <div className="h-64">
                        <Bar data={expiryChartData} options={{ responsive: true, maintainAspectRatio: false }} />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Churn Analysis</h3>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                            <span className="text-sm font-medium text-red-800">Move-Outs (MTD)</span>
                            <span className="font-bold text-red-900">{churnMoveOuts}</span>
                        </div>
                        <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                            <span className="text-sm font-medium text-green-800">Move-Ins (MTD)</span>
                            <span className="font-bold text-green-900">{churnMoveIns}</span>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-lg text-center">
                            <p className="text-xs text-blue-600 uppercase font-bold">Net Absorption</p>
                            <p className="text-2xl font-bold text-blue-900">{netAbsorption >= 0 ? '+' : ''}{netAbsorption} Units</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-6">Visual Stacking Plans</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-x-auto">
                    {properties.slice(0, 3).map(p => (
                        <StackingPlan key={p.id} property={p} />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default OccupancyTenancy;
