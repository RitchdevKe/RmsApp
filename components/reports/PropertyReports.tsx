
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// --- Chart Helper ---
const Chart: React.FC<{ type: 'bar'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
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

const PropertyReports: React.FC = () => {
    const { properties, landlords, staff, marketplaceListings } = useData();
    const [activeTab, setActiveTab] = useState<'landlords' | 'branches' | 'vacancies' | 'forSale'>('landlords');
    const [searchQuery, setSearchQuery] = useState('');

    // --- Metrics ---
    const totalProperties = properties.length;
    const totalUnits = properties.reduce((acc, p) => acc + p.units.length, 0);
    const totalVacant = properties.reduce((acc, p) => acc + p.units.filter(u => u.status === 'Vacant').length, 0);
    const occupancyRate = totalUnits > 0 ? Math.round(((totalUnits - totalVacant) / totalUnits) * 100) : 0;

    // --- Chart Data ---
    const occupancyByBranch = useMemo(() => {
        const branches: Record<string, { total: number, occupied: number }> = {};
        properties.forEach(p => {
            if (!branches[p.branch]) branches[p.branch] = { total: 0, occupied: 0 };
            branches[p.branch].total += p.units.length;
            branches[p.branch].occupied += p.units.filter(u => u.status === 'Occupied').length;
        });
        
        return {
            labels: Object.keys(branches),
            datasets: [{
                label: 'Occupancy Rate (%)',
                data: Object.values(branches).map(b => b.total > 0 ? Math.round((b.occupied / b.total) * 100) : 0),
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        };
    }, [properties]);

    // Derive detailed lists
    const landlordReportData = useMemo(() => {
        return landlords.map(l => {
            const props = properties.filter(p => p.landlordId === l.id);
            const units = props.reduce((acc, p) => acc + p.units.length, 0);
            const landlordTenants = props.flatMap(p => (p.units || [])).length;
            const overdueTenants = 0;
            const collectionRateNum = landlordTenants > 0 ? Math.round(((landlordTenants - overdueTenants) / landlordTenants) * 100) : 0;
            return {
                id: l.id, name: l.name, properties: props.map(p => p.name), units, collectionRate: `${collectionRateNum}%`, phone: l.phone
            };
        }).filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [landlords, properties, searchQuery]);
    
    const vacantUnits = useMemo(() => {
        return properties.flatMap(prop => 
            prop.units.filter(unit => unit.status === 'Vacant').map(unit => ({ ...unit, propertyName: prop.name, propertyBranch: prop.branch }))
        ).filter(u => u.propertyName.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [properties, searchQuery]);

    const forSaleListings = useMemo(() => {
        return marketplaceListings
            .filter(l => l.type === 'Sale' && l.status === 'Published')
            .map(l => ({
                id: l.id,
                title: l.title,
                location: l.location,
                price: typeof l.price === 'number' ? `KES ${Number(l.price ?? 0).toLocaleString()}` : l.price,
                agent: { name: '—' }
            }))
            .filter(l => l.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [marketplaceListings, searchQuery]);
    
    const branches = useMemo(() => {
        const branchData: Record<string, { properties: number, units: number, manager: string }> = {};
        const managers = staff.filter(u => u.role === 'Branch Manager');
        properties.forEach(prop => {
            if (!branchData[prop.branch]) {
                const manager = managers.find(m => m.branch === prop.branch);
                branchData[prop.branch] = { properties: 0, units: 0, manager: manager ? manager.name : 'Unassigned' };
            }
            branchData[prop.branch].properties++;
            branchData[prop.branch].units += prop.units.length;
        });
        return Object.entries(branchData).map(([name, data]) => ({ name, ...data })).filter(b => b.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [properties, searchQuery, staff]);

    return (
        <div className="space-y-8 pb-10">
            <button onClick={() => window.location.hash = '#/reports-analytics/reports'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-4">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Reports Center
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Property & Asset Reports</h1>
                    <p className="text-lg text-gray-500 mt-1">Analyze portfolio health, occupancy, and landlord performance.</p>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard title="Total Properties" value={totalProperties} subtext="Under Management" color="#3b82f6" icon="branch" />
                <KpiCard title="Total Units" value={totalUnits} subtext="Across All Branches" color="#8b5cf6" icon="marketplace" />
                <KpiCard title="Overall Occupancy" value={`${occupancyRate}%`} subtext={`${totalVacant} Vacant Units`} color="#10b981" icon="vacant-house" />
                <KpiCard title="Active Landlords" value={landlords.length} subtext="Partner Network" color="#f59e0b" icon="landlords" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Chart */}
                <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-4">Occupancy by Branch</h3>
                    <Chart type="bar" data={occupancyByBranch} options={{ indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
                </div>

                {/* Table Section */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="border-b border-gray-200 mb-4">
                        <nav className="-mb-px flex space-x-6 overflow-x-auto">
                            <button onClick={() => setActiveTab('landlords')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm transition-colors ${activeTab === 'landlords' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Landlords</button>
                            <button onClick={() => setActiveTab('branches')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm transition-colors ${activeTab === 'branches' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Branches</button>
                            <button onClick={() => setActiveTab('vacancies')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm transition-colors ${activeTab === 'vacancies' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Vacancies</button>
                            <button onClick={() => setActiveTab('forSale')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-bold text-sm transition-colors ${activeTab === 'forSale' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>For Sale</button>
                        </nav>
                    </div>

                    <input type="text" placeholder={`Search...`} onChange={e => setSearchQuery(e.target.value)} value={searchQuery} className="w-full p-2 border border-gray-200 rounded-lg mb-4 bg-gray-50 focus:bg-white transition-colors focus:ring-1 focus:ring-primary outline-none"/>
                    
                    <div className="overflow-x-auto h-[350px]">
                        <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    {activeTab === 'landlords' && <><th className="px-4 py-2 text-left text-gray-500 uppercase">Name</th><th className="px-4 py-2 text-left text-gray-500 uppercase">Contact</th><th className="px-4 py-2 text-right text-gray-500 uppercase">Units</th><th className="px-4 py-2 text-right text-gray-500 uppercase">Collection</th></>}
                                    {activeTab === 'branches' && <><th className="px-4 py-2 text-left text-gray-500 uppercase">Branch</th><th className="px-4 py-2 text-left text-gray-500 uppercase">Manager</th><th className="px-4 py-2 text-right text-gray-500 uppercase">Props</th><th className="px-4 py-2 text-right text-gray-500 uppercase">Units</th></>}
                                    {activeTab === 'vacancies' && <><th className="px-4 py-2 text-left text-gray-500 uppercase">Property</th><th className="px-4 py-2 text-left text-gray-500 uppercase">Unit</th><th className="px-4 py-2 text-left text-gray-500 uppercase">Type</th><th className="px-4 py-2 text-left text-gray-500 uppercase">Branch</th></>}
                                    {activeTab === 'forSale' && <><th className="px-4 py-2 text-left text-gray-500 uppercase">Property</th><th className="px-4 py-2 text-left text-gray-500 uppercase">Location</th><th className="px-4 py-2 text-right text-gray-500 uppercase">Price</th><th className="px-4 py-2 text-left text-gray-500 uppercase">Agent</th></>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {activeTab === 'landlords' && landlordReportData.map(l => <tr key={l.id} className="hover:bg-gray-50"><td className="px-4 py-3 font-medium">{l.name}</td><td className="px-4 py-3 text-gray-600">{l.phone}</td><td className="px-4 py-3 text-right">{l.units}</td><td className="px-4 py-3 text-right font-bold text-green-600">{l.collectionRate}</td></tr>)}
                                {activeTab === 'branches' && branches.map(b => <tr key={b.name} className="hover:bg-gray-50"><td className="px-4 py-3 font-medium">{b.name}</td><td className="px-4 py-3 text-gray-600">{b.manager}</td><td className="px-4 py-3 text-right">{b.properties}</td><td className="px-4 py-3 text-right">{b.units}</td></tr>)}
                                {activeTab === 'vacancies' && vacantUnits.map(u => <tr key={u.id} className="hover:bg-gray-50"><td className="px-4 py-3">{u.propertyName}</td><td className="px-4 py-3 font-bold">{u.unitNumber}</td><td className="px-4 py-3">{u.unitType || (u.bedrooms > 0 ? `${u.bedrooms} Bedroom` : 'Studio')}</td><td className="px-4 py-3 text-gray-500">{u.propertyBranch}</td></tr>)}
                                {activeTab === 'forSale' && forSaleListings.map(l => <tr key={l.id} className="hover:bg-gray-50"><td className="px-4 py-3 font-medium">{l.title}</td><td className="px-4 py-3 text-gray-600">{l.location}</td><td className="px-4 py-3 text-right font-bold text-primary">{l.price}</td><td className="px-4 py-3">{l.agent.name}</td></tr>)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PropertyReports;
