


import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { LedgerEntry, RevenueStreamCategory, TaskStatus } from '@/types';
import { getPropertyAgencyCommission } from '@/utils/landlordPeriodFinancials';
import Icon from '../Icon';
import { isAgencyRevenueStream } from '@/utils/revenueSplit';

// --- Chart Helper ---
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement } from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement);

type TimeFilter = 'Week' | 'Month' | 'Quarter' | 'Year';

const Income: React.FC = () => {
    const { tenants, tasks, properties, commissionRules } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('Month');
    const [categoryFilter, setCategoryFilter] = useState<RevenueStreamCategory | 'All'>('All');

    // --- Resolve commission rates from Settings > Rates & Rules ---
    // Per-property `agencyCommissionPercent` (set on the Property registration form)
    // takes precedence over the global 'Rent Collection' rule. Falls back to 10% if neither is set.
    const maintenanceMarkupRate = useMemo(() => {
        const rule = commissionRules.find(r => r.trigger === 'Property Management Referral');
        if (!rule) return 0.15;
        return rule.rateType === '%' ? rule.rateValue / 100 : 0.15;
    }, [commissionRules]);

    // --- CORE LOGIC: Generate Ledger from Live Data ---
    const ledger = useMemo(() => {
        const entries: LedgerEntry[] = [];

        // 1. Rent, Fines & Placement Fees
        tenants.forEach(t => {
            const prop = properties.find(p => p.id === t.propertyId);
            const { rate: rentCommissionRate, fixed: rentCommissionFixed } = getPropertyAgencyCommission(prop, commissionRules);
            const ratePct = (rentCommissionRate * 100).toFixed(1);
            
            // Rent Payments
            t.paymentHistory.forEach((p, index) => {
                if (p.status === 'Paid') {
                    const amount = parseFloat(p.amount.replace(/[^0-9.]/g, '')) || 0;
                    const agency = rentCommissionFixed !== null
                        ? rentCommissionFixed
                        : amount * rentCommissionRate;
                    entries.push({
                        id: `rent-${t.id}-${index}`,
                        date: p.date,
                        property: `${t.propertyName} - ${t.unit}`,
                        description: `Rent Collection: ${t.name} (${rentCommissionFixed !== null ? `KES ${rentCommissionFixed}` : `${ratePct}%`})`,
                        totalAmount: amount,
                        agencyAmount: agency,
                        landlordAmount: amount - agency,
                        category: 'Agency Management Commission',
                        type: 'Income'
                    });
                }
            });

            // Fines / Late Fees (Always 100% Agency)
            const processFine = (f: any, idx: number, prefix: string) => {
                if (f.status === 'Paid') {
                    const amt = Number(f.amount) || 0;
                    entries.push({
                        id: `fine-${prefix}-${t.id}-${idx}`,
                        date: f.date,
                        property: `${t.propertyName} - ${t.unit}`,
                        description: `Late Fee/Fine: ${t.name}`,
                        totalAmount: amt,
                        agencyAmount: amt,
                        landlordAmount: 0,
                        category: 'Late Payment Fine',
                        type: 'Income'
                    });
                }
            };
            (t.existingTenantSetup?.fineLedger || (t as any).fineLedger || []).forEach((f: any, idx: number) => processFine(f, idx, 'ex'));
            (t.outstandingFines || []).forEach((f: any, idx: number) => processFine(f, idx, 'out'));

            // Tenancy Placement Fee
            const isPlacementFeeActive = prop?.placementFee !== false; 
            const isAgencyPlacement = isAgencyRevenueStream(prop, 'placementFee');
            
            if (isPlacementFeeActive && isAgencyPlacement && t.rentAmount) {
                entries.push({
                    id: `placement-${t.id}`,
                    date: t.onboardingDate,
                    property: `${t.propertyName} - ${t.unit}`,
                    description: `Placement Fee: ${t.name}`,
                    totalAmount: t.rentAmount,
                    agencyAmount: t.rentAmount,
                    landlordAmount: 0,
                    category: 'Tenancy Placement Fee',
                    type: 'Income'
                });
            }
        });

        // 2. Maintenance Markup
        tasks.forEach(task => {
            if ((task.status === TaskStatus.Completed || task.status === TaskStatus.Closed) && task.costs) {
                const totalCost = (task.costs.labor || 0) + (task.costs.materials || 0) + (task.costs.travel || 0);
                const markup = totalCost * maintenanceMarkupRate;
                const markupPct = Math.round(maintenanceMarkupRate * 100);
                entries.push({
                    id: `maint-markup-${task.id}`,
                    date: new Date(task.dueDate).toISOString().split('T')[0],
                    property: task.property,
                    description: `Markup: ${task.title}`,
                    totalAmount: markup + totalCost,
                    agencyAmount: markup,
                    landlordAmount: 0,
                    category: `Maintenance Interest (${markupPct}%)` as RevenueStreamCategory,
                    type: 'Income'
                });
            }
        });

        return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [tenants, tasks, properties, commissionRules, maintenanceMarkupRate]);

    // --- FILTERING ---
    const filteredLedger = useMemo(() => {
        const now = new Date();
        return ledger.filter(entry => {
            const entryDate = new Date(entry.date);
            const searchMatch = !searchQuery || entry.description.toLowerCase().includes(searchQuery.toLowerCase());
            const catMatch = categoryFilter === 'All' || entry.category === categoryFilter;

            let timeMatch = true;
            if (timeFilter === 'Week') {
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(now.getDate() - 7);
                timeMatch = entryDate >= oneWeekAgo;
            } else if (timeFilter === 'Month') {
                const oneMonthAgo = new Date();
                oneMonthAgo.setDate(now.getDate() - 30);
                timeMatch = entryDate >= oneMonthAgo;
            } else if (timeFilter === 'Quarter') {
                const threeMonthsAgo = new Date();
                threeMonthsAgo.setMonth(now.getMonth() - 3);
                timeMatch = entryDate >= threeMonthsAgo;
            } else if (timeFilter === 'Year') {
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(now.getFullYear() - 1);
                timeMatch = entryDate >= oneYearAgo;
            }

            return searchMatch && catMatch && timeMatch;
        });
    }, [ledger, searchQuery, categoryFilter, timeFilter]);

    // --- STATS & CHART DATA ---
    const totals = useMemo(() => {
        return filteredLedger.reduce((acc, curr) => ({
            gross: acc.gross + curr.totalAmount,
            agency: acc.agency + curr.agencyAmount
        }), { gross: 0, agency: 0 });
    }, [filteredLedger]);

    const categoryBreakdown = useMemo(() => {
        const counts: Record<string, number> = {};
        filteredLedger.forEach(l => {
            counts[l.category] = (counts[l.category] || 0) + l.agencyAmount;
        });
        return counts;
    }, [filteredLedger]);

    const donutData = {
        labels: Object.keys(categoryBreakdown),
        datasets: [{
            data: Object.values(categoryBreakdown),
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899'],
            borderWidth: 0,
        }]
    };

    // --- REAL TREND DATA grouped by selected time period ---
    const trendData = useMemo(() => {
        const now = new Date();
        const buckets: Record<string, number> = {};

        if (timeFilter === 'Week') {
            // Group by day of week (Mon–Sun)
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            days.forEach(d => (buckets[d] = 0));
            filteredLedger.forEach(e => {
                const d = new Date(e.date);
                const dayIdx = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
                buckets[days[dayIdx]] += e.agencyAmount;
            });
        } else if (timeFilter === 'Month') {
            // Group by week number within the month (W1–W5)
            for (let w = 1; w <= 5; w++) buckets[`W${w}`] = 0;
            filteredLedger.forEach(e => {
                const day = new Date(e.date).getDate();
                const week = `W${Math.ceil(day / 7)}`;
                if (buckets[week] !== undefined) buckets[week] += e.agencyAmount;
            });
        } else if (timeFilter === 'Quarter') {
            // Group by month name (last 3 months)
            const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            for (let i = 2; i >= 0; i--) {
                const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
                buckets[monthNames[m.getMonth()]] = 0;
            }
            filteredLedger.forEach(e => {
                const label = monthNames[new Date(e.date).getMonth()];
                if (buckets[label] !== undefined) buckets[label] += e.agencyAmount;
            });
        } else {
            // Year: group by month
            const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            monthNames.forEach(m => (buckets[m] = 0));
            filteredLedger.forEach(e => {
                const label = monthNames[new Date(e.date).getMonth()];
                buckets[label] += e.agencyAmount;
            });
        }

        return {
            labels: Object.keys(buckets),
            datasets: [{
                label: 'Agency Revenue (KES)',
                data: Object.values(buckets),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16,185,129,0.1)',
                tension: 0.4,
                fill: true,
            }]
        };
    }, [filteredLedger, timeFilter]);

    const REVENUE_CATEGORIES: RevenueStreamCategory[] = [
        'Agency Management Commission', 'Fines & Penalties', 'Late Payment Fine', 'Bills', 
        'Maintenance Interest (15%)', 'Tenancy Placement Fee'
    ];

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Income & Revenue</h1>
                    <p className="text-lg text-gray-500 mt-1">Detailed breakdown of all revenue streams.</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto">
                    {(['Week', 'Month', 'Quarter', 'Year'] as TimeFilter[]).map(f => (
                        <button
                            key={f}
                            onClick={() => setTimeFilter(f)}
                            className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${timeFilter === f ? 'bg-white text-primary shadow' : 'text-gray-500 hover:text-gray-800'}`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Gross Revenue</p>
                            <h3 className="text-3xl font-extrabold text-gray-800 mt-2">KES {Number(totals.gross ?? 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-3 bg-green-50 text-green-600 rounded-xl"><Icon name="revenue" className="w-6 h-6" /></div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Net Agency Income</p>
                            <h3 className="text-3xl font-extrabold text-blue-600 mt-2">KES {Number(totals.agency ?? 0).toLocaleString()}</h3>
                        </div>
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-xl"><Icon name="wallet" className="w-6 h-6" /></div>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Transactions</p>
                            <h3 className="text-3xl font-extrabold text-gray-800 mt-2">{filteredLedger.length}</h3>
                        </div>
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-xl"><Icon name="stack" className="w-6 h-6" /></div>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-1">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Revenue Sources</h3>
                    <div className="h-64 flex items-center justify-center">
                        <Doughnut data={donutData} options={{ plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } } }} />
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-2">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Revenue Trend</h3>
                    <div className="h-64">
                        <Line data={trendData} options={{ maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }} />
                    </div>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <div className="relative w-full md:max-w-md">
                        <input 
                            type="text" 
                            placeholder="Search transaction..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                        <div className="absolute left-3 top-3 text-gray-400"><Icon name="search" className="w-5 h-5" /></div>
                    </div>
                    <select 
                        value={categoryFilter} 
                        onChange={(e) => setCategoryFilter(e.target.value as any)}
                        className="w-full md:w-auto p-2.5 border border-gray-200 rounded-xl bg-gray-50 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                    >
                        <option value="All">All Categories</option>
                        {REVENUE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                </div>

                <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left font-bold text-gray-500 uppercase text-xs">Date</th>
                                <th className="px-6 py-4 text-left font-bold text-gray-500 uppercase text-xs">Description</th>
                                <th className="px-6 py-4 text-left font-bold text-gray-500 uppercase text-xs">Category</th>
                                <th className="px-6 py-4 text-right font-bold text-gray-500 uppercase text-xs">Gross</th>
                                <th className="px-6 py-4 text-right font-bold text-gray-500 uppercase text-xs">Agency Rev</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {filteredLedger.map(entry => (
                                <tr key={entry.id} className="hover:bg-gray-50/80 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-gray-600">{entry.date}</td>
                                    <td className="px-6 py-4 font-medium text-gray-800">
                                        {entry.description}
                                        <div className="text-xs text-gray-400 mt-0.5">{entry.property}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600 font-medium">
                                            {entry.category}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-medium text-gray-600">KES {entry.totalAmount.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right font-bold text-primary">KES {entry.agencyAmount.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Income;
