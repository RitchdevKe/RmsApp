
import React, { useMemo } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { getCurrentMonthIso } from '../../utils/timezone';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const AcquisitionInsights: React.FC = () => {
    const { leads } = useData();

    const funnelCounts = useMemo(() => {
        const total = leads.length;
        const siteVisits = leads.filter(l => l.status !== 'New').length;
        const inquiries = leads.filter(l => ['Contacted', 'Viewing', 'Negotiation', 'Closed'].includes(l.status)).length;
        const tours = leads.filter(l => ['Viewing', 'Negotiation', 'Closed'].includes(l.status)).length;
        const applications = leads.filter(l => ['Negotiation', 'Closed'].includes(l.status)).length;
        const signed = leads.filter(l => l.status === 'Closed').length;
        return { total, siteVisits, inquiries, tours, applications, signed };
    }, [leads]);

    const funnelData = {
        labels: ['Impressions', 'Site Visits', 'Inquiries', 'Tours', 'Applications', 'Leases Signed'],
        datasets: [{
            label: 'Conversion Count',
            data: [
                funnelCounts.total,
                funnelCounts.siteVisits,
                funnelCounts.inquiries,
                funnelCounts.tours,
                funnelCounts.applications,
                funnelCounts.signed
            ],
            backgroundColor: '#3b82f6',
            borderRadius: 4
        }]
    };

    const sourceBreakdown = useMemo(() => {
        const map: Record<string, number> = {};
        leads.forEach(l => {
            const s = l.source || 'Direct';
            map[s] = (map[s] || 0) + 1;
        });
        return map;
    }, [leads]);

    const sourceData = {
        labels: Object.keys(sourceBreakdown).length ? Object.keys(sourceBreakdown) : ['No sources yet'],
        datasets: [{
            data: Object.values(sourceBreakdown).length ? Object.values(sourceBreakdown) : [1],
            backgroundColor: ['#1877F2', '#DB4437', '#10b981', '#f59e0b', '#6b7280'],
            borderWidth: 0
        }]
    };

    const leadsMtd = useMemo(() => {
        const ym = getCurrentMonthIso();
        return leads.filter(l => (l.date || '').startsWith(ym)).length;
    }, [leads]);
    const conversionRate = funnelCounts.total > 0 ? (funnelCounts.signed / funnelCounts.total) * 100 : 0;

    return (
        <div className="space-y-8 pb-10">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Acquisition Insights</h1>
                <p className="text-lg text-gray-500 mt-1">Analyze lead generation, conversion funnels, and marketing ROI.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Leads (MTD)</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{leadsMtd}</p>
                    <p className="text-xs text-gray-600 mt-1 font-bold">Live this month</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-purple-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Cost Per Lead</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">KES —</p>
                    <p className="text-xs text-gray-600 mt-1 font-bold">Connect spend feed to compute CPL</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Conv. Rate</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">{conversionRate.toFixed(1)}%</p>
                    <p className="text-xs text-gray-600 mt-1 font-bold">Lead to lease</p>
                </div>
                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-orange-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Avg. Time to Lease</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">—</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Leasing Funnel</h3>
                    <div className="h-72">
                        <Bar 
                            data={funnelData} 
                            options={{ 
                                indexAxis: 'y', 
                                responsive: true, 
                                maintainAspectRatio: false,
                                plugins: { legend: { display: false } } 
                            }} 
                        />
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Lead Sources</h3>
                    <div className="h-64 flex justify-center">
                        <Doughnut 
                            data={sourceData} 
                            options={{ 
                                cutout: '60%', 
                                plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } 
                            }} 
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Channel Performance Matrix</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3">Channel</th>
                                <th className="px-4 py-3 text-right">Spend</th>
                                <th className="px-4 py-3 text-right">Leads</th>
                                <th className="px-4 py-3 text-right">Leases</th>
                                <th className="px-4 py-3 text-right">CPA (Cost per Acq)</th>
                                <th className="px-4 py-3 text-right">ROI</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {Object.entries(sourceBreakdown).map(([channel, count]) => (
                                <tr key={channel} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-800">{channel}</td>
                                    <td className="px-4 py-3 text-right text-gray-400">—</td>
                                    <td className="px-4 py-3 text-right">{count}</td>
                                    <td className="px-4 py-3 text-right">{leads.filter(l => (l.source || 'Direct') === channel && l.status === 'Closed').length}</td>
                                    <td className="px-4 py-3 text-right font-bold text-gray-400">—</td>
                                    <td className="px-4 py-3 text-right text-gray-400">—</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AcquisitionInsights;
