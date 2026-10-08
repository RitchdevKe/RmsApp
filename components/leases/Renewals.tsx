
import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { fmtDate } from '../../utils/date';
import Icon from '../Icon';

interface RenewalItem {
    id: string;
    tenant: string;
    unit: string;
    currentRent: number;
    expiryDate: string;
    status: 'Pending' | 'Offer Sent' | 'Negotiating' | 'Renewed' | 'Vacating';
    offerAmount?: number;
}

const Renewals: React.FC = () => {
    const { tenants, updateTenant } = useData();
    const [selectedItem, setSelectedItem] = useState<RenewalItem | null>(null);

    // --- Mock Renewal Workflow Data derived from Tenants ---
    const renewalList: RenewalItem[] = useMemo(() => {
        const now = new Date();
        const future = new Date();
        future.setDate(now.getDate() + 90);

        return tenants.filter(t => t.leaseEnd && new Date(t.leaseEnd) <= future).map(t => ({
            id: t.id,
            tenant: t.name,
            unit: `${t.propertyName} - ${t.unit}`,
            currentRent: t.rentAmount,
            expiryDate: t.leaseEnd || '',
            status: t.status === 'Notice' ? 'Vacating' : 'Pending',
            offerAmount: Math.round(t.rentAmount * 1.05) // Suggest 5% increase
        }));
    }, [tenants]);

    const handleSendOffer = () => {
        if (!selectedItem) return;
        alert(`Renewal offer of KES ${selectedItem.offerAmount?.toLocaleString()} sent to ${selectedItem.tenant}.`);
        // In a real app, update state/backend
        setSelectedItem(null);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Renewed': return 'bg-green-100 text-green-800';
            case 'Vacating': return 'bg-red-100 text-red-800';
            case 'Offer Sent': return 'bg-blue-100 text-blue-800';
            case 'Negotiating': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/general-operations/leases'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Lease Management
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Lease Renewals</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage upcoming expirations and retain good tenants.</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                            <tr>
                                <th className="px-6 py-4">Tenant</th>
                                <th className="px-6 py-4">Unit</th>
                                <th className="px-6 py-4">Expiry Date</th>
                                <th className="px-6 py-4 text-right">Current Rent</th>
                                <th className="px-6 py-4 text-right">Suggested Offer (+5%)</th>
                                <th className="px-6 py-4 text-center">Status</th>
                                <th className="px-6 py-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {renewalList.map(item => (
                                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 font-bold text-gray-800">{item.tenant}</td>
                                    <td className="px-6 py-4 text-gray-600">{item.unit}</td>
                                    <td className="px-6 py-4 text-red-600 font-medium">{fmtDate(item.expiryDate)}</td>
                                    <td className="px-6 py-4 text-right text-gray-600">KES {item.currentRent.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right font-bold text-green-600">KES {item.offerAmount?.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${getStatusColor(item.status)}`}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => setSelectedItem(item)}
                                            className="text-primary hover:underline font-bold text-xs"
                                        >
                                            Process
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {renewalList.length === 0 && (
                                <tr><td colSpan={7} className="p-8 text-center text-gray-400">No leases expiring in the next 90 days.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedItem && (
                <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4" onClick={() => setSelectedItem(null)}>
                    <div className="bg-white rounded-xl shadow-lg p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
                        <h3 className="text-xl font-bold text-gray-800 mb-4">Process Renewal: {selectedItem.tenant}</h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Proposed New Rent</label>
                                <input 
                                    type="number" 
                                    defaultValue={selectedItem.offerAmount} 
                                    className="w-full p-2 border rounded font-bold"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Incentive (Optional)</label>
                                <input 
                                    placeholder="e.g. Free WiFi upgrade" 
                                    className="w-full p-2 border rounded"
                                />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={handleSendOffer} className="flex-1 bg-primary text-white py-2 rounded font-bold hover:bg-primary-dark">Send Offer</button>
                                <button onClick={() => setSelectedItem(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded font-bold">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Renewals;
