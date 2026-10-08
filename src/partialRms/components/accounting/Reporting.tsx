
import React, { useRef, useEffect, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { sumTenantPaymentsInPeriod } from '@/utils/landlordPeriodFinancials';
import { getCurrentMonthIso } from '../../utils/timezone';

const Chart: React.FC<{ type: 'bar' | 'line'; data: any; options?: any; height?: string }> = ({ type, data, options, height = "h-80" }) => {
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

const Reporting: React.FC = () => {
    const { properties, tenants, bills, tasks } = useData();

    // Live Profitability Logic
    const propProfitability = useMemo(() => {
        const period = getCurrentMonthIso();
        return properties.map(p => {
            // Revenue: Rent from tenants in this property
            const revenue = tenants
                .filter(t => t.propertyId === p.id)
                .reduce((s, t) => s + sumTenantPaymentsInPeriod(t, period), 0);
            
            // Expenses: Bills + Tasks for this property
            const propBills = bills.filter(b => b.propertyId === p.id && b.status === 'Paid').reduce((s, b) => s + b.amount, 0);
            const propTasks = tasks.filter(t => t.property === p.name && (t.status === 'Closed' || t.status === 'Completed')).reduce((s, t) => s + ((t.costs?.labor||0) + (t.costs?.materials||0)), 0);
            
            const expense = propBills + propTasks;

            return {
                name: p.managementType === 'Partial' ? `${p.name} (Partial)` : p.name,
                revenue,
                expense,
                net: revenue - expense
            };
        }).sort((a,b) => b.revenue - a.revenue).slice(0, 8);
    }, [properties, tenants, bills, tasks]);

    const chartData = {
        labels: propProfitability.map(p => p.name.substring(0, 10) + (p.name.length > 10 ? '...' : '')),
        datasets: [
            {
                label: 'Revenue',
                data: propProfitability.map(p => p.revenue),
                backgroundColor: '#10b981',
                borderRadius: 4
            },
            {
                label: 'Expenses',
                data: propProfitability.map(p => p.expense),
                backgroundColor: '#ef4444',
                borderRadius: 4
            }
        ]
    };

    return (
        <div className="space-y-8 pb-10">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Advanced Reporting</h1>
                <p className="text-lg text-gray-500 mt-1">Custom reports and deep analytical insights.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Custom Builder Placeholder */}
                <div className="bg-gradient-to-br from-indigo-900 to-blue-800 rounded-2xl p-8 text-white lg:col-span-1 shadow-lg">
                    <Icon name="analytics" className="w-12 h-12 text-blue-300 mb-4" />
                    <h3 className="text-2xl font-bold mb-2">Custom Report Builder</h3>
                    <p className="text-indigo-200 mb-6 text-sm leading-relaxed">
                        Drag and drop metrics to create tailored financial reports for stakeholders.
                    </p>
                    <button 
                        onClick={() => window.location.hash = '#/partial-rms/reports-analytics/reports/custom-reports'}
                        className="w-full py-3 bg-white text-indigo-900 font-bold rounded-xl hover:bg-indigo-50 transition-colors"
                    >
                        Start Building
                    </button>
                </div>

                {/* Profitability Chart */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 lg:col-span-2">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Profitability by Property</h3>
                    <Chart type="bar" data={chartData} />
                </div>
            </div>

            {/* Quick Reports Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {['ROI Analysis', 'Vendor Performance', 'Vacancy Loss', 'Tax Summary'].map(report => (
                    <div key={report} className="bg-white p-6 rounded-2xl border border-gray-200 hover:border-primary hover:shadow-md cursor-pointer transition-all group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-gray-50 rounded-xl group-hover:bg-blue-50 transition-colors">
                                <Icon name="download" className="w-6 h-6 text-gray-400 group-hover:text-primary" />
                            </div>
                        </div>
                        <h4 className="font-bold text-gray-800">{report}</h4>
                        <p className="text-xs text-gray-500 mt-1">Generated daily based on live data</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Reporting;
