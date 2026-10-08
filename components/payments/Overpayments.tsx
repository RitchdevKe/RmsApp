
import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { Overpayment } from '../../types';
import Icon from '../Icon';
import { getTodayIsoDate } from '../../utils/timezone';

// --- Modal Component ---
const ApplyOverpaymentModal: React.FC<{ 
    payment: Overpayment; 
    onClose: () => void; 
    onConfirm: () => void; 
}> = ({ payment, onClose, onConfirm }) => {
    return (
        <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                <div className="text-center mb-6">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
                        <Icon name="check" className="h-6 w-6 text-green-600" />
                    </div>
                    <h3 className="text-lg leading-6 font-medium text-gray-900">Confirm Application</h3>
                    <p className="text-sm text-gray-500 mt-2">
                        Are you sure you want to apply this overpayment as revenue?
                    </p>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6 text-sm">
                    <div className="grid grid-cols-2 gap-3">
                        <span className="text-gray-600">Tenant:</span>
                        <span className="font-bold text-gray-900 text-right">{payment.tenantName}</span>
                        
                        <span className="text-gray-600">Unit:</span>
                        <span className="font-bold text-gray-900 text-right">{payment.unit}</span>
                        
                        <span className="text-gray-600">Amount:</span>
                        <span className="font-bold text-green-600 text-right">KES {Number(payment.amount ?? 0).toLocaleString()}</span>
                        
                        <span className="text-gray-600">Apply For:</span>
                        <span className="font-bold text-gray-900 text-right">{payment.appliedMonth}</span>
                    </div>
                </div>

                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-bold shadow-sm transition-colors"
                    >
                        Confirm & Apply
                    </button>
                </div>
            </div>
        </div>
    );
};

const Overpayments: React.FC = () => {
    const { overpayments, updateOverpayment, updateTenant, tenants } = useData();
    const [selectedPayment, setSelectedPayment] = useState<Overpayment | null>(null);

    const handleConfirmApply = () => {
        if (!selectedPayment) return;

        // 1. Update Overpayment Status
        updateOverpayment(selectedPayment.id, { status: 'Applied' });

        // 2. Find Tenant and Add "Paid" entry to Payment History (Revenue Recognition)
        // We attempt to find a tenant matching name/unit
        const tenant = tenants.find(t => 
            t.name === selectedPayment.tenantName && t.unit === selectedPayment.unit
        );

        if (tenant) {
            const newPayment = {
                date: getTodayIsoDate(),
                amount: `KES ${Number(selectedPayment.amount ?? 0).toLocaleString()}`,
                status: 'Paid' as const,
                method: 'Overpayment Applied',
                reference: `APP-${selectedPayment.reference}`
            };
            updateTenant(tenant.id, { paymentHistory: [newPayment, ...tenant.paymentHistory] });
        }

        // 3. Close & Alert
        setSelectedPayment(null);
        // Small delay to allow UI update before alert, or use a toast in a real app
        setTimeout(() => alert("Overpayment applied successfully! Revenue recognized in tenant ledger."), 100);
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Overpayments (Advance Rent)</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage bulk payments and future rent allocation.</p>
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tenant</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Unit</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Applied Month</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {overpayments.map(op => (
                                <tr key={op.id} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 font-medium text-gray-900">{op.tenantName}</td>
                                    <td className="px-4 py-3 text-gray-500">{op.unit}</td>
                                    <td className="px-4 py-3 text-right font-bold text-green-600">KES {Number(op.amount ?? 0).toLocaleString()}</td>
                                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{op.reference}</td>
                                    <td className="px-4 py-3 text-sm text-gray-600">{op.appliedMonth}</td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${op.status === 'Applied' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {op.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {op.status === 'Held' ? (
                                            <button 
                                                onClick={() => setSelectedPayment(op)} 
                                                className="text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded text-xs font-bold transition-colors"
                                            >
                                                Apply Now
                                            </button>
                                        ) : (
                                            <span className="text-gray-400 text-xs italic">Completed</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {overpayments.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">No overpayments found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedPayment && (
                <ApplyOverpaymentModal 
                    payment={selectedPayment} 
                    onClose={() => setSelectedPayment(null)} 
                    onConfirm={handleConfirmApply} 
                />
            )}
        </div>
    );
};

export default Overpayments;
