
import React, { useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';

const PropertyInsights: React.FC = () => {
    const { properties, tenants, bills } = useData();
    const [sortField, setSortField] = useState('revenue');

    const matrixData = useMemo(() => {
        return properties.map(p => {
            const occupied = p.units.filter(u => u.status === 'Occupied').length;
            const occupancy = p.units.length > 0 ? Math.round((occupied / p.units.length) * 100) : 0;
            const revenue = tenants
                .filter(t => t.propertyId === p.id && t.status !== 'Overdue')
                .reduce((s, t) => s + t.rentAmount, 0);
            
            const expense = bills
                .filter(b => b.propertyId === p.id && b.status === 'Paid')
                .reduce((sum, b) => sum + (b.amount || 0), 0);
            const net = revenue - expense;

            return {
                id: p.id,
                name: p.name,
                units: p.units.length,
                occupancy,
                revenue,
                expense,
                net
            };
        }).sort((a,b) => (b as any)[sortField] - (a as any)[sortField]);
    }, [properties, tenants, bills, sortField]);

    return (
        <div className="space-y-8 pb-10">
             <div>
                <h1 className="text-3xl font-bold text-gray-800">Property Insights</h1>
                <p className="text-lg text-gray-500 mt-1">Asset-level performance comparison matrix.</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-end mb-4 gap-2">
                    <span className="text-sm font-bold text-gray-500 flex items-center mr-2">Sort By:</span>
                    {['revenue', 'occupancy', 'net'].map(field => (
                        <button 
                            key={field} 
                            onClick={() => setSortField(field)} 
                            className={`px-3 py-1 text-xs font-bold rounded uppercase ${sortField === field ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}
                        >
                            {field}
                        </button>
                    ))}
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                            <tr>
                                <th className="px-4 py-3">Property</th>
                                <th className="px-4 py-3 text-center">Units</th>
                                <th className="px-4 py-3 text-center">Occupancy</th>
                                <th className="px-4 py-3 text-right">Revenue</th>
                                <th className="px-4 py-3 text-right">Expenses</th>
                                <th className="px-4 py-3 text-right">Net Income</th>
                                <th className="px-4 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {matrixData.map(row => (
                                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 font-bold text-gray-800">{row.name}</td>
                                    <td className="px-4 py-3 text-center text-gray-600">{row.units}</td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center">
                                            <span className={`text-xs font-bold mr-2 ${row.occupancy < 80 ? 'text-red-500' : 'text-green-600'}`}>{row.occupancy}%</span>
                                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                <div className={`h-full ${row.occupancy < 80 ? 'bg-red-500' : 'bg-green-500'}`} style={{width: `${row.occupancy}%`}}></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium text-gray-800">KES {(row.revenue/1000).toFixed(1)}k</td>
                                    <td className="px-4 py-3 text-right text-red-500">KES {(row.expense/1000).toFixed(1)}k</td>
                                    <td className="px-4 py-3 text-right font-extrabold text-primary">KES {(row.net/1000).toFixed(1)}k</td>
                                    <td className="px-4 py-3 text-center">
                                        {row.net > 0 ? <span className="bg-green-100 text-green-800 text-[10px] px-2 py-1 rounded font-bold">PROFITABLE</span> : <span className="bg-red-100 text-red-800 text-[10px] px-2 py-1 rounded font-bold">LOSS</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PropertyInsights;
