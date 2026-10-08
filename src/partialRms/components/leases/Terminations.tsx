import React from 'react';
import { fmtDate } from '@/utils/date';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';

const Terminations: React.FC = () => {
    const { offboardingRecords } = useData();

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/partial-rms/general-operations/leases'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Lease Management
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Terminations & Exits</h1>
                <p className="text-lg text-gray-500 mt-1">Manage notice periods, move-out inspections, and deposit returns.</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <h3 className="font-bold text-gray-800 mb-4">Active Move-Outs</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                            <tr>
                                <th className="px-6 py-3">Tenant</th>
                                <th className="px-6 py-3">Unit</th>
                                <th className="px-6 py-3">Move Out Date</th>
                                <th className="px-6 py-3 text-center">Inspection</th>
                                <th className="px-6 py-3 text-center">Keys Returned</th>
                                <th className="px-6 py-3 text-center">Status</th>
                                <th className="px-6 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {offboardingRecords.map(rec => (
                                <tr key={rec.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{rec.tenantName}</td>
                                    <td className="px-6 py-4 text-gray-600">{rec.unit}</td>
                                    <td className="px-6 py-4 text-red-600 font-bold">{fmtDate(rec.moveOutDate)}</td>
                                    <td className="px-6 py-4 text-center">
                                        {rec.inspectionStatus === 'Passed' ? <span className="text-green-600 font-bold">Passed</span> : <span className="text-yellow-600">Pending</span>}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {rec.keysReturned ? <Icon name="check" className="w-4 h-4 mx-auto text-green-600" /> : <span className="text-gray-300">-</span>}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${rec.status === 'Completed' ? 'bg-gray-200 text-gray-600' : 'bg-orange-100 text-orange-800'}`}>
                                            {rec.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => window.location.hash = '#/partial-rms/tenants/offboarding'} className="text-blue-600 hover:underline font-bold text-xs">Manage</button>
                                    </td>
                                </tr>
                            ))}
                            {offboardingRecords.length === 0 && (
                                <tr><td colSpan={7} className="p-8 text-center text-gray-400">No active termination processes.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Terminations;
