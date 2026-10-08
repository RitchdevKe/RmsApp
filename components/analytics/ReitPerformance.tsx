
import React, { useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';
import Icon from '../Icon';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const ReitPerformance: React.FC = () => {
    const { funds } = useData();

    const totalAUM = funds.reduce((sum, f) => sum + f.capitalRaised, 0);
    const activeFunds = funds.filter(f => f.status === 'Active').length;

    const growthData = useMemo(() => {
        const values = funds
            .map(f => ({ when: new Date(f.renovationStartDate || f.projectedCompletion || '1970-01-01'), value: (f.capitalRaised || 0) / 1_000_000 }))
            .filter(v => !isNaN(v.when.getTime()))
            .sort((a, b) => a.when.getTime() - b.when.getTime());
        const labels = values.length ? values.map(v => v.when.toLocaleString('default', { month: 'short' })) : ['Now'];
        const points = values.length
            ? values.map((v, i) => values.slice(0, i + 1).reduce((s, x) => s + x.value, 0))
            : [totalAUM / 1_000_000];
        return {
            labels,
            datasets: [{
                label: 'Assets Under Management (Millions)',
                data: points,
                borderColor: '#8b5cf6',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                fill: true,
                tension: 0.4
            }]
        };
    }, [funds, totalAUM]);

    const avgInvestorReturn = useMemo(() => {
        const rates = funds.map(f => {
            const m = (f.targetApy || '').match(/(\d+(\.\d+)?)/);
            return m ? parseFloat(m[0]) : 0;
        }).filter(v => v > 0);
        if (!rates.length) return 0;
        return rates.reduce((s, r) => s + r, 0) / rates.length;
    }, [funds]);

    return (
        <div className="space-y-8 pb-10">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Renovation Fund Analytics</h1>
                <p className="text-lg text-gray-500 mt-1">Investor-grade metrics and fund performance.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-purple-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Total AUM</p>
                    <p className="text-3xl font-extrabold text-gray-800 mt-1">KES {(totalAUM/1000000).toFixed(1)}M</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-blue-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Active Funds</p>
                    <p className="text-3xl font-extrabold text-gray-800 mt-1">{activeFunds}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-green-500">
                    <p className="text-xs font-bold text-gray-400 uppercase">Avg. Investor Return</p>
                    <p className="text-3xl font-extrabold text-gray-800 mt-1">{avgInvestorReturn.toFixed(1)}%</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Capital Growth Trajectory</h3>
                <div className="h-72">
                    <Line data={growthData} options={{ responsive: true, maintainAspectRatio: false }} />
                </div>
            </div>
        </div>
    );
};

export default ReitPerformance;
