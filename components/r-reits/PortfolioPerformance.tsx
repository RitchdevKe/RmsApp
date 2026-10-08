
import React, { useRef, useEffect, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';

const Chart: React.FC<{ type: 'line' | 'bar'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-80' }) => {
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

const PortfolioPerformance: React.FC = () => {
    const { funds, investments, rfTransactions } = useData();

    // --- Live Metrics Calculations ---
    const metrics = useMemo(() => {
        // 1. Total AUM (Sum of all funds' capital raised)
        const totalAUM = funds.reduce((sum, f) => sum + f.capitalRaised, 0);

        // 2. Total Distributed (Payouts)
        const totalPayouts = rfTransactions
            .filter(tx => tx.type === 'Interest Payout' || tx.type === 'Withdrawal')
            .reduce((sum, tx) => sum + tx.amount, 0);

        // 3. Active Investors (Unique counts from investments)
        const uniqueInvestors = new Set(investments.filter(i => i.status === 'Active').map(i => i.id)).size;

        // 4. Weighted Average Yield (Client Interest Rate weighted by Capital Raised)
        let weightedRateSum = 0;
        if (totalAUM > 0) {
            weightedRateSum = funds.reduce((sum, f) => sum + ((f.clientInterestRate || 5) * f.capitalRaised), 0);
        }
        const avgYield = totalAUM > 0 ? (weightedRateSum / totalAUM) : 0;

        return [
            { 
                title: 'Total AUM', 
                value: `KES ${(totalAUM / 1000000).toFixed(1)}M`, 
                change: 'Live', 
                changeColor: 'text-blue-600' 
            },
            { 
                title: 'Total Payouts', 
                value: `KES ${(totalPayouts / 1000).toFixed(1)}K`, 
                change: 'Distributed', 
                changeColor: 'text-green-600' 
            },
            { 
                title: 'Active Investors', 
                value: uniqueInvestors.toString(), 
                change: 'Holders', 
                changeColor: 'text-purple-600' 
            },
            { 
                title: 'Avg. Landlord Yield', 
                value: `${avgYield.toFixed(1)}%`, 
                change: 'Monthly', 
                changeColor: 'text-orange-600' 
            },
        ];
    }, [funds, rfTransactions, investments]);

    // --- Chart Data Calculations ---
    const chartData = useMemo(() => {
        // Group transactions by month
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const currentYear = new Date().getFullYear();
        
        const navData = new Array(12).fill(0);
        const revenueData = new Array(12).fill(0);

        // Populate NAV (Cumulative Investments)
        let cumulativeInvest = 0;
        // Sort transactions by date
        const sortedTx = [...rfTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        sortedTx.forEach(tx => {
            const d = new Date(tx.date);
            if (d.getFullYear() === currentYear) {
                const mIndex = d.getMonth();
                
                if (tx.type === 'Investment') {
                    cumulativeInvest += tx.amount;
                    // Update all subsequent months with new cumulative
                    for(let i=mIndex; i<12; i++) navData[i] = cumulativeInvest;
                } else if (tx.type === 'Withdrawal') {
                    cumulativeInvest -= tx.amount;
                    for(let i=mIndex; i<12; i++) navData[i] = cumulativeInvest;
                }

                if (tx.type === 'Loan Payback' || tx.type === 'Management Fee') {
                    revenueData[mIndex] += tx.amount;
                }
            }
        });

        // If no data, fill with some baseline from funds to show something
        if (cumulativeInvest === 0 && funds.length > 0) {
             const totalCapital = funds.reduce((s, f) => s + f.capitalRaised, 0);
             navData.fill(totalCapital);
        }

        return {
            labels: months,
            navDataset: navData.map(v => v / 1000000), // Convert to Millions
            revenueDataset: revenueData.map(v => v / 1000) // Convert to Thousands
        };
    }, [rfTransactions, funds]);

    const navChartConfig = {
        labels: chartData.labels,
        datasets: [
            {
                label: 'Fund NAV (KES Millions)',
                data: chartData.navDataset,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4
            }
        ]
    };

    const revenueChartConfig = {
        labels: chartData.labels,
        datasets: [
            {
                label: 'Inflow / Repayments (KES Thousands)',
                data: chartData.revenueDataset,
                backgroundColor: '#10b981',
                borderRadius: 4
            }
        ]
    };

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Portfolio Performance</h1>
                <p className="text-lg text-gray-500 mt-1">Real-time analytics of fund assets, capital flow, and project health.</p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {metrics.map((m, i) => (
                    <div key={i} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                        <p className="text-gray-500 text-sm font-medium uppercase tracking-wide">{m.title}</p>
                        <p className="text-2xl font-bold text-gray-800 mt-2">{m.value}</p>
                        <p className={`text-xs mt-1 font-semibold ${m.changeColor}`}>{m.change}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Net Asset Value (NAV) Growth</h3>
                    <Chart type="line" data={navChartConfig} />
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Repayments & Inflows</h3>
                    <Chart type="bar" data={revenueChartConfig} />
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Active Projects Breakdown</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 uppercase text-gray-500 text-xs">
                            <tr>
                                <th className="px-4 py-3">Project Name</th>
                                <th className="px-4 py-3">Landlord</th>
                                <th className="px-4 py-3 text-center">Status</th>
                                <th className="px-4 py-3 text-right">Capital Raised</th>
                                <th className="px-4 py-3 text-right">Target</th>
                                <th className="px-4 py-3 text-right">Monthly Interest</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {funds.map(fund => (
                                <tr key={fund.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">{fund.name}</td>
                                    <td className="px-4 py-3 text-gray-600">{fund.landlordName || 'Internal'}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                            fund.status === 'Active' ? 'bg-green-100 text-green-800' :
                                            fund.status === 'Fully Funded' ? 'bg-blue-100 text-blue-800' :
                                            'bg-gray-100 text-gray-600'
                                        }`}>
                                            {fund.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-gray-800">KES {fund.capitalRaised.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-gray-500">KES {fund.targetCapital.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right font-bold text-green-600">{fund.clientInterestRate || 0}%</td>
                                </tr>
                            ))}
                            {funds.length === 0 && (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-400">No active projects found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PortfolioPerformance;
