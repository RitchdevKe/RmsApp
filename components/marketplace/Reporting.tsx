
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement, Filler } from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { exportToCSV } from '../../utils/exportHelper';
import { fmtDate } from '../../utils/date';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement, Filler);

// --- Helper Chart Component ---
const ChartContainer: React.FC<{ type: 'bar' | 'line' | 'doughnut'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-72' }) => {
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
                    plugins: { legend: { position: 'bottom' } },
                    ...options
                },
            });
        }
        return () => chartRef.current?.destroy();
    }, [type, data, options]);

    return <div className={`relative ${height} w-full`}><canvas ref={canvasRef}></canvas></div>;
};

// --- KPI Card ---
const KpiCard: React.FC<{ title: string; value: string; subtext: string; color: string; icon: string; trend?: 'up' | 'down' | 'neutral' }> = ({ title, value, subtext, color, icon, trend }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4`} style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <p className="text-2xl font-extrabold text-gray-800 mt-1">{value}</p>
                <div className="flex items-center mt-1">
                    {trend && (
                        <span className={`text-[10px] font-bold mr-1 ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-400'}`}>
                            {trend === 'up' ? '▲' : trend === 'down' ? '▼' : '—'}
                        </span>
                    )}
                    <p className="text-xs text-gray-400">{subtext}</p>
                </div>
            </div>
            <div className={`p-2 rounded-full bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

const MarketplaceReporting: React.FC = () => {
    const { leads, marketplaceListings } = useData();
    const [timeRange, setTimeRange] = useState('All Time');
    const [listingTypeFilter, setListingTypeFilter] = useState<'All' | 'Rent' | 'Sale' | 'AirBnB'>('All');
    const [listingSearch, setListingSearch] = useState('');

    // Active listings from real Supabase-backed state
    const activeListings = useMemo(() => {
        return marketplaceListings
            .filter(l => l.status === 'Published')
            .filter(l => listingTypeFilter === 'All' || l.type === listingTypeFilter)
            .filter(l => {
                if (!listingSearch.trim()) return true;
                const q = listingSearch.toLowerCase();
                return (
                    l.title?.toLowerCase().includes(q) ||
                    l.propertyName?.toLowerCase().includes(q) ||
                    l.location?.toLowerCase().includes(q) ||
                    l.unitNumber?.toLowerCase().includes(q)
                );
            });
    }, [marketplaceListings, listingTypeFilter, listingSearch]);

    // --- ANALYTICS CALCULATIONS ---

    const filteredLeads = useMemo(() => {
        const now = new Date();
        const startAll = new Date(2000, 0, 1);
        let start = startAll;
        if (timeRange === 'Last 30 Days') {
            start = new Date(now);
            start.setDate(start.getDate() - 30);
        } else if (timeRange === 'This Quarter') {
            const q = Math.floor(now.getMonth() / 3);
            start = new Date(now.getFullYear(), q * 3, 1);
        }
        return (leads || []).filter(l => {
            if (!l.date) return timeRange === 'All Time';
            const d = new Date(l.date);
            return !isNaN(d.getTime()) && d >= start;
        });
    }, [leads, timeRange]);

    const stats = useMemo(() => {
        const totalLeads = filteredLeads.length;
        const contacted = filteredLeads.filter(l => l.status !== 'New').length;
        const viewings = filteredLeads.filter(l => ['Viewing', 'Negotiation', 'Closed'].includes(l.status)).length;
        const negotiations = filteredLeads.filter(l => ['Negotiation', 'Closed'].includes(l.status)).length;
        const closed = filteredLeads.filter(l => l.status === 'Closed').length;

        const leadToViewRate = totalLeads > 0 ? Math.round((viewings / totalLeads) * 100) : 0;
        const viewToCloseRate = viewings > 0 ? Math.round((closed / viewings) * 100) : 0;
        const globalConversion = totalLeads > 0 ? Math.round((closed / totalLeads) * 100) : 0;

        const revenue = filteredLeads.filter(l => l.status === 'Closed').reduce((sum, lead) => {
            const listing = marketplaceListings.find(l => l.title === lead.listingTitle)
                || marketplaceListings.find(l => lead.listingTitle?.includes(l.propertyName));
            const val = listing ? listing.price : 0;
            return sum + val;
        }, 0);

        const sources: Record<string, number> = {};
        filteredLeads.forEach(l => {
            const src = l.source || 'Direct';
            sources[src] = (sources[src] || 0) + 1;
        });

        const listingStats: Record<string, { leads: number; closed: number; title: string }> = {};
        filteredLeads.forEach(l => {
            const title = l.listingTitle || 'General Inquiry';
            if (!listingStats[title]) listingStats[title] = { leads: 0, closed: 0, title };
            listingStats[title].leads++;
            if (l.status === 'Closed') listingStats[title].closed++;
        });
        const topListings = Object.values(listingStats).sort((a, b) => b.leads - a.leads).slice(0, 5);

        return {
            totalLeads, contacted, viewings, negotiations, closed,
            leadToViewRate, viewToCloseRate, globalConversion,
            revenue, sources, topListings
        };
    }, [filteredLeads, marketplaceListings]);

    // --- CHART DATA ---

    const funnelChartData = {
        labels: ['All Leads', 'Contacted+', 'Viewing+', 'Negotiation', 'Closed'],
        datasets: [{
            label: 'Volume',
            data: [stats.totalLeads, stats.contacted, stats.viewings, stats.negotiations, stats.closed],
            backgroundColor: [
                '#818cf8',
                '#a5b4fc',
                '#6366f1',
                '#4f46e5',
                '#10b981'
            ],
            borderRadius: 4,
            barPercentage: 0.6,
        }]
    };

    const sourceChartData = {
        labels: Object.keys(stats.sources),
        datasets: [{
            data: Object.values(stats.sources),
            backgroundColor: ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'],
            borderWidth: 0
        }]
    };

    const trendChartData = useMemo(() => {
        const now = new Date();
        const labels: string[] = [];
        const leadSeries: number[] = [];
        const closedSeries: number[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(d.toLocaleString('default', { month: 'short' }));
            const y = d.getFullYear();
            const m = d.getMonth();
            leadSeries.push((leads || []).filter(l => {
                if (!l.date) return false;
                const ld = new Date(l.date);
                return !isNaN(ld.getTime()) && ld.getFullYear() === y && ld.getMonth() === m;
            }).length);
            closedSeries.push((leads || []).filter(l => {
                if (l.status !== 'Closed' || !l.date) return false;
                const ld = new Date(l.date);
                return !isNaN(ld.getTime()) && ld.getFullYear() === y && ld.getMonth() === m;
            }).length);
        }
        return {
            labels,
            datasets: [
                {
                    label: 'Leads Generated',
                    data: leadSeries,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Deals Closed',
                    data: closedSeries,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        };
    }, [leads]);

    const handleExport = () => {
        const data = leads.map(l => ({
            Name: l.tenantName,
            Status: l.status,
            Source: l.source,
            Interest: l.interest,
            Date: l.date
        }));
        exportToCSV(data, 'Marketplace_Report');
    };

    return (
        <div className="space-y-8 pb-10">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Growth Intelligence</h1>
                    <p className="text-lg text-gray-500 mt-1">Analyze marketing performance, conversion funnels, and revenue attribution.</p>
                </div>
                <div className="flex gap-2">
                    <select value={timeRange} onChange={e => setTimeRange(e.target.value)} className="bg-white border border-gray-300 text-gray-700 font-bold py-2 px-4 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                        <option>Last 30 Days</option>
                        <option>This Quarter</option>
                        <option>All Time</option>
                    </select>
                    <button onClick={handleExport} className="bg-primary text-white px-4 py-2 rounded-lg font-bold shadow-md hover:bg-primary-dark flex items-center">
                        <Icon name="download" className="w-4 h-4 mr-2" /> Export Data
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard 
                    title="Total Leads" 
                    value={stats.totalLeads.toString()} 
                    subtext="Potential Tenants" 
                    color="#3b82f6" 
                    icon="tenants" 
                    trend="up"
                />
                <KpiCard 
                    title="Conversion Rate" 
                    value={`${stats.globalConversion}%`} 
                    subtext="Lead to Lease" 
                    color="#10b981" 
                    icon="analytics" 
                    trend="neutral"
                />
                <KpiCard 
                    title="Est. Revenue Generated" 
                    value={stats.revenue > 0 ? `KES ${(stats.revenue/1000).toFixed(1)}k` : 'KES 0'} 
                    subtext="Closed leads × listing price" 
                    color="#8b5cf6" 
                    icon="revenue" 
                    trend="up"
                />
                <KpiCard 
                    title="Active Listings" 
                    value={marketplaceListings.filter(l => l.status === 'Published').length.toString()} 
                    subtext="Market Exposure" 
                    color="#f59e0b" 
                    icon="marketplace" 
                />
            </div>

            {/* Active Listings Breakdown */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">Active Listings</h3>
                        <p className="text-sm text-gray-400 mt-0.5">Live published listings from Supabase — {activeListings.length} of {marketplaceListings.filter(l => l.status === 'Published').length} shown</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {(['All', 'Rent', 'Sale', 'AirBnB'] as const).map(t => (
                            <button
                                key={t}
                                onClick={() => setListingTypeFilter(t)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${listingTypeFilter === t ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                {t}
                            </button>
                        ))}
                        <input
                            type="text"
                            placeholder="Search listings..."
                            value={listingSearch}
                            onChange={e => setListingSearch(e.target.value)}
                            className="pl-3 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20 w-44"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3">Property / Unit</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">Location</th>
                                <th className="px-4 py-3 text-right">Price (KES)</th>
                                <th className="px-4 py-3 text-center">Leads</th>
                                <th className="px-4 py-3">Date Listed</th>
                                <th className="px-4 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {activeListings.map(listing => {
                                const listingLeads = leads.filter(l =>
                                    l.listingTitle === listing.title ||
                                    l.listingTitle?.includes(listing.propertyName)
                                ).length;
                                const typeColors: Record<string, string> = {
                                    Rent: 'bg-blue-100 text-blue-700',
                                    Sale: 'bg-green-100 text-green-700',
                                    AirBnB: 'bg-orange-100 text-orange-700',
                                };
                                return (
                                    <tr key={listing.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <p className="font-semibold text-gray-800 truncate max-w-[180px]">{listing.title || listing.propertyName}</p>
                                            <p className="text-xs text-gray-400">Unit {listing.unitNumber}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${typeColors[listing.type] || 'bg-gray-100 text-gray-600'}`}>
                                                {listing.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 text-xs truncate max-w-[140px]">{listing.location || '—'}</td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-800">
                                            {listing.price ? listing.price.toLocaleString() : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`font-bold ${listingLeads > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                {listingLeads}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 text-xs">
                                            {fmtDate(listing.dateCreated)}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700">
                                                Published
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {activeListings.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                                        {marketplaceListings.filter(l => l.status === 'Published').length === 0
                                            ? 'No published listings yet. Add properties with vacant units or publish listings from the Listings module.'
                                            : 'No listings match the current filter.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Summary footer */}
                {activeListings.length > 0 && (
                    <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex gap-6 text-xs text-gray-500">
                        <span>Rent: <strong className="text-gray-700">{activeListings.filter(l => l.type === 'Rent').length}</strong></span>
                        <span>Sale: <strong className="text-gray-700">{activeListings.filter(l => l.type === 'Sale').length}</strong></span>
                        <span>AirBnB: <strong className="text-gray-700">{activeListings.filter(l => l.type === 'AirBnB').length}</strong></span>
                        <span className="ml-auto">
                            Avg Price: <strong className="text-gray-700">
                                KES {activeListings.length > 0 ? Math.round(activeListings.reduce((s, l) => s + (l.price || 0), 0) / activeListings.length).toLocaleString() : '0'}
                            </strong>
                        </span>
                    </div>
                )}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Funnel Chart */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">Acquisition Funnel</h3>
                    <div className="h-72">
                        <ChartContainer 
                            type="bar" 
                            data={funnelChartData} 
                            options={{ 
                                indexAxis: 'y', 
                                scales: { x: { grid: { display: false } } },
                                plugins: { legend: { display: false } }
                            }} 
                        />
                    </div>
                </div>

                {/* Source Chart */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">Lead Sources</h3>
                    <div className="h-64 flex justify-center">
                        <ChartContainer 
                            type="doughnut" 
                            data={sourceChartData} 
                            options={{ cutout: '65%' }}
                        />
                    </div>
                    <div className="mt-4 text-center">
                        <p className="text-sm text-gray-500">Top Channel: <strong>{Object.keys(stats.sources).length
                            ? Object.keys(stats.sources).reduce((a, b) => stats.sources[a] > stats.sources[b] ? a : b)
                            : '—'}</strong></p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 {/* Trend Analysis */}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">Growth Trend</h3>
                    <div className="h-72">
                         <ChartContainer type="line" data={trendChartData} />
                    </div>
                 </div>

                 {/* Top Listings Table */}
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <h3 className="text-lg font-bold text-gray-800 mb-6">Top Performing Assets</h3>
                    <div className="flex-grow overflow-auto">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                                <tr>
                                    <th className="px-4 py-3">Listing / Interest</th>
                                    <th className="px-4 py-3 text-right">Leads</th>
                                    <th className="px-4 py-3 text-right">Closed</th>
                                    <th className="px-4 py-3 text-right">Conv. %</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {stats.topListings.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-gray-800 truncate max-w-xs">{item.title}</td>
                                        <td className="px-4 py-3 text-right font-bold text-blue-600">{item.leads}</td>
                                        <td className="px-4 py-3 text-right font-bold text-green-600">{item.closed}</td>
                                        <td className="px-4 py-3 text-right text-gray-500">{Math.round((item.closed / item.leads) * 100)}%</td>
                                    </tr>
                                ))}
                                {stats.topListings.length === 0 && (
                                    <tr><td colSpan={4} className="p-8 text-center text-gray-400">No listing data available.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                 </div>
            </div>
        </div>
    );
};

export default MarketplaceReporting;
