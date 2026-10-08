
import React, { useState } from 'react';
import { useData } from '../../context/DataContext';
import { fmtDate } from '../../utils/date';
import { WithdrawalRequest } from '../../types';

const Withdrawals: React.FC = () => {
    const { withdrawals, addWithdrawal } = useData();
    const [amount, setAmount] = useState('');
    
    const handleRequestWithdrawal = (e: React.FormEvent) => {
        e.preventDefault();
        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0) {
            alert("Please enter a valid amount.");
            return;
        }
        
        const newRequest: WithdrawalRequest = {
            id: `wr-${Date.now()}`,
            investorName: 'Current User',
            amount: val,
            requestDate: fmtDate(new Date()),
            type: 'Interest',
            method: 'M-Pesa',
            status: 'Pending Approval'
        };
        
        addWithdrawal(newRequest);
        setAmount('');
        alert("Withdrawal request submitted. Processing typically takes 24-48 hours.");
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.history.back()} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Withdrawals</h1>
                <p className="text-lg text-gray-500 mt-1">Manage liquidity and access your investment returns.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Request Form */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-xl shadow-sm">
                        <h2 className="text-xl font-bold text-gray-800 mb-4">Request Withdrawal</h2>
                        <div className="bg-blue-50 p-4 rounded-lg mb-6 text-sm text-blue-800">
                            <p>Available Balance: <strong>KES 5,000</strong></p>
                            <p className="mt-1 text-xs">Funds are transferred to your registered M-Pesa or Bank account.</p>
                        </div>
                        <form onSubmit={handleRequestWithdrawal} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES)</label>
                                <input 
                                    type="number" 
                                    value={amount} 
                                    onChange={e => setAmount(e.target.value)} 
                                    className="w-full p-2 border rounded-md focus:ring-primary focus:border-primary" 
                                    placeholder="Min KES 1,000"
                                />
                            </div>
                            <button type="submit" className="w-full py-2 bg-primary text-white font-bold rounded-md hover:bg-primary-dark shadow-sm transition-colors">
                                Submit Request
                            </button>
                        </form>
                    </div>
                </div>

                {/* History Table */}
                <div className="lg:col-span-2">
                    <div className="bg-white p-6 rounded-xl shadow-sm">
                        <h2 className="text-xl font-bold text-gray-800 mb-4">Withdrawal History</h2>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">ID</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {withdrawals.map(req => (
                                        <tr key={req.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-sm text-gray-600">{req.requestDate}</td>
                                            <td className="px-4 py-3 text-sm font-bold text-gray-900">KES {req.amount.toLocaleString()}</td>
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                                    req.status === 'Paid' ? 'bg-green-100 text-green-800' : 
                                                    req.status === 'Rejected' ? 'bg-red-100 text-red-800' : 
                                                    'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                    {req.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs text-gray-400 font-mono">{req.id}</td>
                                        </tr>
                                    ))}
                                    {withdrawals.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-8 text-center text-gray-500">No withdrawal history found.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Withdrawals;
