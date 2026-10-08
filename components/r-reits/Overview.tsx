
import React, { useMemo, useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, BarElement, Filler } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, BarElement, Filler);

// --- Chart Helper ---
const ChartContainer: React.FC<{ type: 'line' | 'bar' | 'doughnut'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
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

const MetricCard: React.FC<{ title: string; value: string; subtext?: string; icon: string; color: string; trend?: string }> = ({ title, value, subtext, icon, color, trend }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all group relative overflow-hidden">
        <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity`}>
            <Icon name={icon} className="w-16 h-16" style={{ color }} />
        </div>
        <div className="relative z-10">
            <div className="flex justify-between items-start mb-2">
                <div className={`p-2 rounded-lg bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                    <Icon name={icon} className="w-6 h-6" style={{ color }} />
                </div>
                {trend && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${trend.includes('+') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {trend}
                    </span>
                )}
            </div>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
            <h3 className="text-2xl font-extrabold text-gray-800 mt-1">{value}</h3>
            {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
        </div>
    </div>
);

const RReitsOverview: React.FC = () => {
    const { funds, renovationInvestors, investments, rfTransactions } = useData();

    // --- Metrics Calculation ---
    const metrics = useMemo(() => {
        const totalInvestors = renovationInvestors.length;
        const totalProjects = funds.length;
        const activeProjects = funds.filter(f => f.status === 'Active' || f.status === 'Fully Funded').length;
        
        // Assets Under Management (Total Capital Raised)
        const totalAUM = funds.reduce((sum, f) => sum + f.capitalRaised, 0);
        const targetAUM = funds.reduce((sum, f) => sum + f.targetCapital, 0);
        
        // Funding Progress
        const fundingProgress = targetAUM > 0 ? Math.round((totalAUM / targetAUM) * 100) : 0;

        // Projected Annual Revenue (Spread)
        // Assumption: Client pays 'clientInterestRate' (e.g. 5% mo), Investor gets approx 'targetApy'/12 (e.g. 2.5% mo)
        // Gross Spread = (Client Rate - Investor Rate) * Capital
        // For simplicity in this overview, we calculate Total Gross Interest Revenue from Landlords
        const monthlyRevenue = funds.reduce((sum, f) => {
            const activeCap = f.capitalRaised;
            const rate = f.clientInterestRate || 5; // Default 5% monthly
            return sum + (activeCap * (rate / 100));
        }, 0);
        const annualRevenue = monthlyRevenue * 12;

        // Total Distributed
        const totalDistributed = rfTransactions
            .filter(t => t.type === 'Interest Payout' || t.type === 'Withdrawal')
            .reduce((s, t) => s + t.amount, 0);

        return {
            totalInvestors,
            totalProjects,
            activeProjects,
            totalAUM,
            targetAUM,
            fundingProgress,
            annualRevenue,
            monthlyRevenue,
            totalDistributed
        };
    }, [funds, renovationInvestors, rfTransactions]);

    // --- Chart Data ---

    // 1. Capital Growth Chart (Mocked history based on current AUM for demo)
    const growthData = {
        labels: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
        datasets: [{
            label: 'AUM Growth',
            data: [
                metrics.totalAUM * 0.6,
                metrics.totalAUM * 0.7,
                metrics.totalAUM * 0.75,
                metrics.totalAUM * 0.85,
                metrics.totalAUM * 0.92,
                metrics.totalAUM
            ],
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4
        }]
    };

    // 2. Fund Allocation (Property Type)
    const typeDistribution = useMemo(() => {
        const dist: Record<string, number> = {};
        funds.forEach(f => {
            const type = f.propertyType || 'Residential';
            dist[type] = (dist[type] || 0) + f.capitalRaised;
        });
        return dist;
    }, [funds]);

    const allocationData = {
        labels: Object.keys(typeDistribution),
        datasets: [{
            data: Object.values(typeDistribution),
            backgroundColor: ['#10b981', '#f59e0b', '#8b5cf6', '#ef4444'],
            borderWidth: 0
        }]
    };

    // 3. Top Funds (Bar)
    const topFunds = funds.sort((a, b) => b.capitalRaised - a.capitalRaised).slice(0, 5);
    const fundPerformanceData = {
        labels: topFunds.map(f => f.name.length > 15 ? f.name.substring(0, 15) + '...' : f.name),
        datasets: [
            {
                label: 'Raised',
                data: topFunds.map(f => f.capitalRaised),
                backgroundColor: '#3b82f6',
                borderRadius: 4
            },
            {
                label: 'Target',
                data: topFunds.map(f => f.targetCapital),
                backgroundColor: '#e5e7eb',
                borderRadius: 4
            }
        ]
    };

    // Recent Activity
    const recentActivity = useMemo(() => {
        return rfTransactions
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
    }, [rfTransactions]);

    return (
        <div className="space-y-8 pb-10 animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-gray-800">R-Reits Overview</h1>
                <p className="text-lg text-gray-500 mt-1">Capital management, fund performance, and investor relations summary.</p>
            </div>

            {/* Hero AUM Card */}
            <div className="bg-gradient-to-r from-indigo-900 via-blue-900 to-indigo-900 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-10">
                    <Icon name="reits" className="w-64 h-64 text-white" />
                </div>
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-end gap-6">
                    <div>
                        <p className="text-blue-200 font-bold uppercase tracking-widest text-sm mb-2">Total Assets Under Management</p>
                        <h2 className="text-5xl font-extrabold mb-4">KES {(metrics.totalAUM / 1000000).toFixed(2)}M</h2>
                        <div className="flex gap-4 text-sm">
                            <span className="bg-white/10 px-3 py-1 rounded-full border border-white/20">
                                Target: KES {(metrics.targetAUM / 1000000).toFixed(1)}M
                            </span>
                            <span className="text-green-400 font-bold flex items-center">
                                <Icon name="revenue" className="w-4 h-4 mr-1" /> {metrics.fundingProgress}% Funded
                            </span>
                        </div>
                    </div>
                    <div className="w-full md:w-1/3">
                        <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-blue-100 text-xs font-bold uppercase">Proj. Annual Revenue</span>
                                <Icon name="analytics" className="w-4 h-4 text-blue-300" />
                            </div>
                            <p className="text-2xl font-bold">KES {(metrics.annualRevenue / 1000000).toFixed(1)}M</p>
                            <p className="text-xs text-blue-300 mt-1">Based on current lending rates</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard 
                    title="Active Investors" 
                    value={metrics.totalInvestors.toString()} 
                    subtext="Across all funds" 
                    icon="hr" 
                    color="blue" 
                    trend="+12%"
                />
                <MetricCard 
                    title="Active Projects" 
                    value={metrics.activeProjects.toString()} 
                    subtext={`Out of ${metrics.totalProjects} total`} 
                    icon="branch" 
                    color="indigo" 
                />
                <MetricCard 
                    title="Total Distributed" 
                    value={`KES ${(metrics.totalDistributed / 1000).toFixed(1)}K`} 
                    subtext="Interest & Withdrawals" 
                    icon="wallet" 
                    color="green" 
                />
                <MetricCard 
                    title="Average Yield" 
                    value="18.5%" 
                    subtext="Investor APY (W. Avg)" 
                    icon="revenue" 
                    color="orange" 
                    trend="+0.5%"
                />
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Growth Chart */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6">Capital Growth Trend</h3>
                    <ChartContainer type="line" data={growthData} options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { y: { beginAtZero: true } },
                        plugins: { legend: { display: false } }
                    }} height="h-72" />
                </div>

                {/* Allocation Chart */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6">Portfolio Allocation</h3>
                    <div className="flex justify-center h-64">
                         <ChartContainer 
                            type="doughnut" 
                            data={allocationData} 
                            options={{ cutout: '70%', plugins: { legend: { position: 'bottom' } } }} 
                        />
                    </div>
                </div>
            </div>

            {/* Bottom Row: Top Funds & Recent Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Fund Performance */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6">Top Fund Performance</h3>
                    <ChartContainer type="bar" data={fundPerformanceData} options={{
                        indexAxis: 'y',
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { x: { grid: { display: false } } }
                    }} height="h-64" />
                </div>

                {/* Activity Feed */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-gray-800">Recent Transactions</h3>
                        <button onClick={() => window.location.hash = '#/r-reits/rf-payments'} className="text-xs font-bold text-primary hover:underline">View All</button>
                    </div>
                    <div className="flex-grow overflow-y-auto space-y-4">
                        {recentActivity.map(tx => (
                            <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-full ${
                                        tx.type === 'Investment' ? 'bg-green-100 text-green-600' : 
                                        tx.type === 'Withdrawal' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                                    }`}>
                                        <Icon name={tx.type === 'Investment' ? 'revenue' : 'wallet'} className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-800">{tx.type}</p>
                                        <p className="text-xs text-gray-500">{tx.partyName}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`text-sm font-bold ${tx.category === 'Inbound' ? 'text-green-600' : 'text-red-600'}`}>
                                        {tx.category === 'Inbound' ? '+' : '-'} KES {Number(tx.amount ?? 0).toLocaleString()}
                                    </p>
                                    <p className="text-[10px] text-gray-400">{tx.date}</p>
                                </div>
                            </div>
                        ))}
                        {recentActivity.length === 0 && <p className="text-center text-gray-400 text-sm">No recent activity.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RReitsOverview;
