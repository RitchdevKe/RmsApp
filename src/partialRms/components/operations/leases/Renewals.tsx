
import React, { useState, useMemo } from 'react';
import { useData } from '../../../context/DataContext';
import { fmtDate } from '@/utils/date';
import Icon from '../../Icon';

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
    const { tenants, updateTenant, addInvoice, properties = [], landlords = [] } = useData();
    const [selectedItem, setSelectedItem] = useState<RenewalItem | null>(null);
    const [statusOverrides, setStatusOverrides] = useState<Record<string, 'Pending' | 'Offer Sent' | 'Negotiating' | 'Renewed' | 'Vacating'>>({});
    const [draftRent, setDraftRent] = useState<number>(0);

    const selectItemForProcess = (item: RenewalItem) => {
        setSelectedItem(item);
        setDraftRent(item.offerAmount || Math.round(item.currentRent * 1.05));
    };

    // --- Renewal Registry derived from Tenants ---
    const renewalList: RenewalItem[] = useMemo(() => {
        const now = new Date();
        const future = new Date();
        future.setDate(now.getDate() + 180);

        return tenants.filter(t => (t.leaseEnd && new Date(t.leaseEnd) <= future) || t.status === 'Notice').map(t => ({
            id: t.id,
            tenant: t.name,
            unit: `${t.propertyName || 'Property'} - Unit ${t.unit}`,
            currentRent: t.rentAmount,
            expiryDate: t.leaseEnd || '',
            status: statusOverrides[t.id] || (t.status === 'Notice' ? 'Vacating' : 'Pending'),
            offerAmount: Math.round(t.rentAmount * 1.05) // Suggest 5% increase
        }));
    }, [tenants, statusOverrides]);

    const handleSendOffer = () => {
        if (!selectedItem) return;
        setStatusOverrides(prev => ({ ...prev, [selectedItem.id]: 'Offer Sent' }));
        alert(`📨 [Partial RMS Renewal Offer] Offer of KES ${draftRent.toLocaleString()} sent to ${selectedItem.tenant}.`);
        setSelectedItem(null);
    };

    const handleFinalizeRenewal = () => {
        if (!selectedItem) return;
        
        // Find property and landlord to invoice renewal fee
        const tenantProfile = tenants.find(t => t.id === selectedItem.id);
        const prop = tenantProfile ? properties.find(p => p.id === tenantProfile.propertyId) : null;
        const landlord = prop ? landlords.find(l => l.id === prop.landlordId) : null;

        // Create new lease dates (extend by 1 year)
        const currentExp = tenantProfile?.leaseEnd ? new Date(tenantProfile.leaseEnd) : new Date();
        currentExp.setFullYear(currentExp.getFullYear() + 1);
        const newLeaseEnd = currentExp.toISOString().split('T')[0];

        // 1. Update tenant profile to active and set new lease end + rent
        updateTenant(selectedItem.id, {
            leaseEnd: newLeaseEnd,
            rentAmount: draftRent,
            status: 'Active'
        });

        // 2. Auto-trigger Outbound Invoice to Landlord for Renewal Service Placement Fee
        const renewalFee = 5000; // Standard agency Flat Renewal Fee under Partial RMS
        const invoiceId = `inv-out-${Date.now()}`;
        const invNo = `REN-${selectedItem.id.slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

        const landlordInvoice = {
            id: invoiceId,
            invoiceNumber: invNo,
            category: 'Outbound' as const,
            tenantName: landlord ? landlord.name : (prop ? `Landlord of ${prop.name}` : 'Property Landlord'),
            email: landlord?.email || '',
            phone: landlord?.phone || '',
            billingAddress: prop ? `${prop.name} - Renewal Billing` : 'Renewal Service Billing',
            amount: renewalFee,
            dueDate: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split('T')[0], // 14 days terms
            status: 'Due' as const,
            items: [
                {
                    description: `Agency Lease Renewal Placement Fee: ${selectedItem.tenant} (Unit ${tenantProfile?.unit || 'N/A'})`,
                    amount: renewalFee,
                    quantity: 1,
                    unitPrice: renewalFee
                }
            ]
        };

        if (addInvoice) {
            addInvoice(landlordInvoice);
        }

        setStatusOverrides(prev => ({ ...prev, [selectedItem.id]: 'Renewed' }));
        alert(`🎉 Renewal successfully finalized!\n• Tenant lease extended to ${newLeaseEnd}\n• Rent updated to KES ${draftRent.toLocaleString()}\n• Flat Renewal Fee Invoice ${invNo} of KES ${renewalFee.toLocaleString()} dispatched to Landlord!`);
        setSelectedItem(null);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Renewed': return 'bg-emerald-100 text-emerald-805 font-bold border border-emerald-200';
            case 'Vacating': return 'bg-rose-100 text-rose-800 font-bold border border-rose-200';
            case 'Offer Sent': return 'bg-indigo-100 text-indigo-805 font-bold border border-indigo-200';
            case 'Negotiating': return 'bg-amber-100 text-amber-800 font-bold border border-amber-200';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/partial-rms/general-operations/leases'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Lease Management
            </button>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Lease Renewals</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage upcoming expirations and automatically trigger agency service invoices.</p>
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
                                    <td className="px-6 py-4 text-red-600 font-medium">{item.expiryDate ? fmtDate(item.expiryDate) : 'Indefinite'}</td>
                                    <td className="px-6 py-4 text-right text-gray-600 font-mono">KES {item.currentRent.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-right font-bold text-emerald-600 font-mono">KES {item.offerAmount?.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2 py-1 rounded text-xs uppercase font-medium ${getStatusColor(item.status)}`}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {item.status !== 'Renewed' ? (
                                            <button 
                                                onClick={() => selectItemForProcess(item)}
                                                className="px-3 py-1 bg-primary text-white hover:bg-primary-dark font-bold text-xs rounded transition-colors"
                                            >
                                                Process
                                            </button>
                                        ) : (
                                            <span className="text-xs text-green-600 font-bold">Renewal Dispatched✓</span>
                                        )}
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
                <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedItem(null)}>
                    <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-800 mb-2">Process Renewal: {selectedItem.tenant}</h3>
                        <p className="text-xs text-gray-400 mb-4 uppercase tracking-wider">Partial Management Billing workflow</p>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 text-gray-600">Proposed New Rent</label>
                                <input 
                                    type="number" 
                                    value={draftRent} 
                                    onChange={e => setDraftRent(parseFloat(e.target.value) || 0)}
                                    className="w-full p-2 border rounded font-mono font-bold text-gray-800 text-lg"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 text-gray-600">Incentive (Optional)</label>
                                <input 
                                    placeholder="e.g. Free repainting or Wi-Fi coupon" 
                                    className="w-full p-2 border rounded text-xs"
                                />
                            </div>
                            
                            <div className="bg-indigo-50 border border-indigo-150 p-2.5 rounded text-xs text-indigo-805 leading-relaxed">
                                <span className="font-bold block mb-0.5">ℹ️ Partial RMS Billing</span>
                                Finalizing this renewal automatically dispatches a flat <strong>KES 5,000 Rent Renewal Fee</strong> outbound invoice to the property landlord.
                            </div>

                            <div className="flex flex-col gap-2 pt-2">
                                <button 
                                    onClick={handleSendOffer} 
                                    className="w-full bg-indigo-600 text-white py-2 rounded font-bold hover:bg-indigo-700 text-sm shadow"
                                >
                                    Send Renewal Offer
                                </button>
                                <button 
                                    onClick={handleFinalizeRenewal} 
                                    className="w-full bg-emerald-600 text-white py-2 rounded font-bold hover:bg-emerald-700 text-sm shadow flex items-center justify-center gap-1.5"
                                >
                                    Finalize & Invoice Landlord
                                </button>
                                <button 
                                    onClick={() => setSelectedItem(null)} 
                                    className="w-full py-2 bg-gray-50 text-gray-500 hover:bg-gray-100 rounded font-semibold text-sm transition-colors border"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Renewals;
