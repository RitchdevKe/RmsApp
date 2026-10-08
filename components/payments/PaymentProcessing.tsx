// @ts-nocheck

import React, { useState, useMemo } from 'react';
import { useData } from '../../context/DataContext';
import { Bill, ExpenseCategory } from '../../types';
import Icon from '../Icon';

interface PayableItem extends Bill {
    selected: boolean;
}

const EditBillModal: React.FC<{ bill: Bill; onClose: () => void; onSave: (bill: Bill) => void }> = ({ bill, onClose, onSave }) => {
    const [formData, setFormData] = useState<Bill & { amount: any }>({ ...bill, amount: String(bill.amount ?? '') });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = () => {
        onSave({ ...formData, amount: parseFloat(String(formData.amount)) || 0 });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1300] p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold mb-4">Edit Bill</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Vendor</label>
                        <input name="vendor" value={formData.vendor} onChange={handleChange} className="w-full p-2 border rounded" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Category</label>
                        <select name="category" value={formData.category} onChange={handleChange} className="w-full p-2 border rounded bg-white">
                            <option value="Water">Water</option>
                            <option value="Electricity">Electricity</option>
                            <option value="Maintenance">Maintenance</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Amount</label>
                        <input type="number" name="amount" value={formData.amount} onChange={handleChange} className="w-full p-2 border rounded" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Due Date</label>
                        <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} className="w-full p-2 border rounded" />
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-primary text-white rounded font-semibold">Save Changes</button>
                </div>
            </div>
        </div>
    );
};

const PaymentProcessing: React.FC = () => {
    const { bills, updateBill } = useData();
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [editBill, setEditBill] = useState<Bill | null>(null);

    // Filter for unpaid bills only
    const payables = useMemo(() => bills.filter(b => b.status === 'Unpaid' || b.status === 'Overdue'), [bills]);

    const handleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === payables.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(payables.map(p => p.id)));
        }
    };

    const handleProcessSelected = () => {
        const selectedBills = payables.filter(p => selectedIds.has(p.id));
        if (selectedBills.length === 0) return;
        
        const total = selectedBills.reduce((s, i) => s + i.amount, 0);

        if (window.confirm(`Process ${selectedBills.length} payments totaling KES ${total.toLocaleString()}? These bills will be marked as 'Paid'.`)) {
            selectedBills.forEach(bill => {
                updateBill(bill.id, { status: 'Paid' });
            });
            setSelectedIds(new Set());
            alert("Payments processed successfully! Records moved to Outbound Payments.");
        }
    };

    const handleSaveEdit = (updatedBill: Bill) => {
        updateBill(updatedBill.id, updatedBill);
        setEditBill(null);
        alert("Bill updated.");
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Overdue': return 'bg-red-100 text-red-800';
            case 'Unpaid': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Payment Processing</h1>
                    <p className="text-lg text-gray-500 mt-1">Approve and execute outgoing payments in bulk.</p>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-gray-600">
                        Selected: {selectedIds.size} | Total: KES {payables.filter(p => selectedIds.has(p.id)).reduce((s, i) => s + i.amount, 0).toLocaleString()}
                    </span>
                    <button 
                        onClick={handleProcessSelected}
                        disabled={selectedIds.size === 0}
                        className="px-6 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                        <Icon name="check" className="w-4 h-4 mr-2" /> Process Payment
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                {payables.length > 0 ? (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-center w-10">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedIds.size === payables.length && payables.length > 0} 
                                        onChange={handleSelectAll}
                                        className="h-4 w-4 text-primary rounded"
                                    />
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {payables.map(item => (
                                <tr key={item.id} className={selectedIds.has(item.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                                    <td className="px-6 py-4 text-center">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedIds.has(item.id)} 
                                            onChange={() => handleSelect(item.id)}
                                            className="h-4 w-4 text-primary rounded"
                                        />
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{item.vendor}</td>
                                    <td className="px-6 py-4 text-gray-500">{item.category}</td>
                                    <td className="px-6 py-4 text-right font-bold text-gray-800">KES {item.amount.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-gray-500">{item.dueDate}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 text-xs rounded-full font-semibold ${getStatusColor(item.status)}`}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => setEditBill(item)}
                                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                                        >
                                            Edit
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="text-center py-12 text-gray-500">
                        <p>No pending payments found.</p>
                    </div>
                )}
            </div>

            {editBill && (
                <EditBillModal bill={editBill} onClose={() => setEditBill(null)} onSave={handleSaveEdit} />
            )}
        </div>
    );
};

export default PaymentProcessing;
