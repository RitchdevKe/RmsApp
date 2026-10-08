
import React, { useRef, useEffect, useMemo } from 'react';
import Icon from '../Icon';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useData } from '../../context/DataContext';
import { getCurrentMonthIso } from '../../utils/timezone';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const KpiCard: React.FC<{ title: string; value: string; subtext?: string; icon: string; color: string }> = ({ title, value, subtext, icon, color }) => (
    <div className={`bg-white p-5 rounded-xl shadow-sm border-l-4`} style={{ borderLeftColor: color }}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <p className="text-2xl font-extrabold text-gray-800 mt-1">{value}</p>
                {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
            </div>
            <div className={`p-2 rounded-full bg-opacity-10`} style={{ backgroundColor: `${color}20` }}>
                <Icon name={icon} className="w-6 h-6" style={{ color: color }} />
            </div>
        </div>
    </div>
);

// --- Chart Helper ---
const Chart: React.FC<{ type: 'line'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
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

const ReitReports: React.FC = () => {
    const { funds, investments, rfTransactions } = useData();

    // Live Metrics Calculation
    const metrics = useMemo(() => {
        const totalAUM = funds.reduce((sum, f) => sum + f.capitalRaised, 0);
        // Active investors = unique count of investors with active status
        const activeInvestorCount = new Set(investments.filter(i => i.status === 'Active').map(i => i.id)).size;
        
        // Payouts This Month
        const currentMonth = getCurrentMonthIso();
        const payouts = rfTransactions
            .filter(t => (t.type === 'Interest Payout' || t.type === 'Withdrawal') && t.date.startsWith(currentMonth))
            .reduce((sum, t) => sum + t.amount, 0);

        // Weighted Average Return (Approximation)
        // Weighted by capital raised per fund
        let weightedReturn = 0;
        if (totalAUM > 0) {
            weightedReturn = funds.reduce((sum, f) => {
                // Parse APY from string e.g., "14-16%" or "30%"
                const apyStr = f.targetApy.match(/(\d+(\.\d+)?)/);
                const apy = apyStr ? parseFloat(apyStr[0]) : 0;
                return sum + (f.capitalRaised * apy);
            }, 0) / totalAUM;
        }

        return [
            { title: 'Total Fund Value', value: `KES ${(totalAUM/1000000).toFixed(1)}M`, subtext: 'Net Asset Value', icon: 'revenue', color: '#10b981' },
            { title: 'Active Investors', value: activeInvestorCount.toString(), subtext: 'Total unique holders', icon: 'hr', color: '#3b82f6' },
            { title: 'Average Return (YTD)', value: `${weightedReturn.toFixed(1)}%`, subtext: 'Annualized', icon: 'analytics', color: '#f59e0b' },
            { title: 'Payouts This Month', value: `KES ${(payouts/1000).toFixed(1)}K`, subtext: 'Distributed', icon: 'payments', color: '#8b5cf6' },
        ];
    }, [funds, investments, rfTransactions]);

    const balanceGrowthData = useMemo(() => {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentYear = new Date().getFullYear();
        const navData = new Array(12).fill(0);
        let cumulative = 0;
        const sorted = [...rfTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        sorted.forEach((tx) => {
            const d = new Date(tx.date);
            if (d.getFullYear() !== currentYear) return;
            const mIdx = d.getMonth();
            if (tx.type === 'Investment' && tx.status === 'Completed') {
                cumulative += tx.amount;
                for (let i = mIdx; i < 12; i++) navData[i] = cumulative;
            }
            if (tx.type === 'Withdrawal' && tx.status === 'Completed') {
                cumulative -= tx.amount;
                for (let i = mIdx; i < 12; i++) navData[i] = cumulative;
            }
        });
        if (cumulative === 0 && funds.length > 0) {
            const total = funds.reduce((s, f) => s + f.capitalRaised, 0);
            navData.fill(total);
        }
        const end = new Date().getMonth();
        const start = Math.max(0, end - 5);
        return {
            labels: months.slice(start, end + 1),
            datasets: [
                {
                    label: 'Fund Value (KES)',
                    data: navData.slice(start, end + 1),
                    borderColor: '#8b5cf6',
                    tension: 0.3,
                },
            ],
        };
    }, [rfTransactions, funds]);

    return (
        <div className="space-y-8 pb-10">
            <button onClick={() => window.location.hash = '#/reports-analytics/reports'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors mb-4">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Reports Center
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">R-reits Fund Reports</h1>
                    <p className="text-lg text-gray-500 mt-1">Performance and growth metrics for TaskMe Renovation Funds.</p>
                </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {metrics.map(kpi => <KpiCard key={kpi.title} {...kpi} />)}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                 <h2 className="text-xl font-bold text-gray-800 mb-6">Investor Capital Growth Trend</h2>
                 <div className="h-80">
                    <Chart type="line" data={balanceGrowthData} options={{ responsive: true, maintainAspectRatio: false }} />
                 </div>
                 <p className="text-center text-gray-400 text-xs mt-4">
                    Tracks the cumulative growth of investor capital over the last 6 months.
                 </p>
            </div>
        </div>
    );
};

export default ReitReports;
