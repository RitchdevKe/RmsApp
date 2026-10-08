
import React, { useState, useMemo } from 'react';
import Icon from '../Icon';
import { Distribution } from '../../types';
import { printSection } from '../../utils/exportHelper';
import { useData } from '../../context/DataContext';
import { interestPayoutsAsDistributions } from '../../utils/rfDistributions';

const Distributions: React.FC = () => {
    const y = new Date().getFullYear();
    const [yearFilter, setYearFilter] = useState(String(y));
    const [selectedReceipt, setSelectedReceipt] = useState<Distribution | null>(null);
    const { rfTransactions } = useData();

    const allDist = useMemo(() => interestPayoutsAsDistributions(rfTransactions), [rfTransactions]);
    const rows = useMemo(
        () => allDist.filter((d) => String(d.date).startsWith(yearFilter)),
        [allDist, yearFilter]
    );

    const totalDistributed = useMemo(() => rows.reduce((sum, d) => sum + d.amount, 0), [rows]);
    const lastPayout = rows[0];

    const handlePrintReceipt = (dist: Distribution) => {
        setSelectedReceipt(dist);
        setTimeout(() => {
            printSection('receipt-modal-content', `Receipt - ${dist.id}`);
        }, 100);
    };

    return (
        <div className="space-y-8">
            <button onClick={() => window.location.hash = '#/reits/investment-plans'} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to Funds
            </button>
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Payouts & Distributions</h1>
                <p className="text-lg text-gray-500 mt-1">Track monthly interest and dividend income from Renovation Funds.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-green-500">
                    <p className="text-gray-500 font-medium text-sm uppercase">Total Earned</p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">KES {Number(totalDistributed ?? 0).toLocaleString()}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-blue-500">
                    <p className="text-gray-500 font-medium text-sm uppercase">Last Payout</p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">KES {Number(lastPayout?.amount ?? 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-400 mt-1">{lastPayout?.date || '—'}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-yellow-500">
                    <p className="text-gray-500 font-medium text-sm uppercase">Next Payout Est.</p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">—</p>
                    <p className="text-xs text-gray-400 mt-1">—</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold text-gray-800">Distribution History</h2>
                    <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="p-2 border rounded-md bg-gray-50">
                        <option value={String(y)}>{y}</option>
                        <option value={String(y - 1)}>{y - 1}</option>
                        <option value={String(y - 2)}>{y - 2}</option>
                    </select>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Method</th>
                                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Receipt</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {rows.map((dist, idx) => (
                                <tr key={`${dist.id}-${idx}`} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{dist.date}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{dist.investorName}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-green-600">KES {Number(dist.amount ?? 0).toLocaleString()}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500">{dist.method}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${dist.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {dist.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                        <button 
                                            onClick={() => handlePrintReceipt(dist)}
                                            className="text-primary hover:text-primary-dark flex items-center justify-end ml-auto"
                                        >
                                            <Icon name="download" className="w-4 h-4 mr-1" /> PDF
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No distributions for this year.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedReceipt && (
                <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4" onClick={() => setSelectedReceipt(null)}>
                    <div 
                        id="receipt-modal-content" 
                        className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full text-center border border-gray-200" 
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="border-b pb-4 mb-4">
                            <h2 className="text-2xl font-bold text-primary">PAYMENT RECEIPT</h2>
                            <p className="text-gray-500 text-sm mt-1">TaskMe Renovation Fund</p>
                        </div>
                        <div className="space-y-3 text-left">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Transaction ID:</span>
                                <span className="font-mono font-bold">{selectedReceipt.id}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Date:</span>
                                <span>{selectedReceipt.date}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Beneficiary:</span>
                                <span>{selectedReceipt.investorName}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Method:</span>
                                <span>{selectedReceipt.method}</span>
                            </div>
                            <div className="border-t border-dashed pt-3 mt-3 flex justify-between items-center">
                                <span className="text-gray-800 font-bold">Amount Paid:</span>
                                <span className="text-xl font-bold text-green-600">KES {Number(selectedReceipt.amount ?? 0).toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="mt-8 pt-4 border-t text-xs text-gray-400">
                            <p>This is an electronically generated receipt.</p>
                            <p>{new Date().toLocaleString()}</p>
                        </div>
                        <button onClick={() => setSelectedReceipt(null)} className="mt-4 text-sm text-gray-500 hover:underline no-print">Close</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Distributions;
