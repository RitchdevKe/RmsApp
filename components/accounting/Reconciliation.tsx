
import React, { useState } from 'react';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';

const Reconciliation: React.FC = () => {
    const { externalTransactions, updateExternalTransaction } = useData();
    
    // Split unmatched transactions into "Bank Side" and "System Side" (Simulated system side from invoices)
    const bankSide = externalTransactions.filter(t => !t.matched);
    const [selectedBankTx, setSelectedBankTx] = useState<string | null>(null);

    const handleMatch = () => {
        if (selectedBankTx) {
            updateExternalTransaction(selectedBankTx, { matched: true });
            setSelectedBankTx(null);
            alert("Transaction matched successfully!");
        }
    };

    return (
        <div className="space-y-8 pb-10">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Reconciliation</h1>
                <p className="text-lg text-gray-500 mt-1">Match bank statement lines with system records.</p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col md:flex-row h-[600px]">
                {/* Left: Bank Statement Feed */}
                <div className="md:w-1/2 border-r border-gray-200 flex flex-col">
                    <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="font-bold text-gray-700">Bank Feed / M-Pesa</h3>
                        <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded">{bankSide.length} Unmatched</span>
                    </div>
                    <div className="flex-grow overflow-y-auto">
                        {bankSide.map(tx => (
                            <div 
                                key={tx.id} 
                                onClick={() => setSelectedBankTx(tx.id)}
                                className={`p-4 border-b cursor-pointer transition-colors ${selectedBankTx === tx.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50 border-l-4 border-l-transparent'}`}
                            >
                                <div className="flex justify-between items-start">
                                    <span className="font-mono text-xs text-gray-500">{tx.date}</span>
                                    <span className="font-bold text-gray-800">KES {tx.amount.toLocaleString()}</span>
                                </div>
                                <p className="font-medium text-sm text-gray-700 mt-1">{tx.name || 'Unknown Sender'}</p>
                                <p className="text-xs text-gray-500 truncate">{tx.reference} • {tx.type}</p>
                            </div>
                        ))}
                        {bankSide.length === 0 && (
                            <div className="p-8 text-center text-gray-400">
                                <Icon name="check" className="w-12 h-12 mx-auto mb-2 text-green-300" />
                                <p>All transactions matched!</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: System Suggestions / Match Area */}
                <div className="md:w-1/2 flex flex-col bg-gray-50/50">
                    <div className="p-4 border-b border-gray-200 bg-white">
                        <h3 className="font-bold text-gray-700">System Match</h3>
                    </div>
                    
                    <div className="flex-grow flex flex-col items-center justify-center p-8">
                        {selectedBankTx ? (
                            <div className="w-full max-w-sm">
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-blue-100 mb-6 text-center">
                                    <p className="text-xs font-bold text-gray-400 uppercase mb-2">Selected Transaction</p>
                                    <p className="text-2xl font-extrabold text-gray-800">KES {bankSide.find(t => t.id === selectedBankTx)?.amount.toLocaleString()}</p>
                                    <p className="text-sm text-gray-500 mt-1">{bankSide.find(t => t.id === selectedBankTx)?.reference}</p>
                                </div>

                                <div className="space-y-3">
                                    <button onClick={handleMatch} className="w-full py-3 bg-green-600 text-white font-bold rounded-xl shadow-md hover:bg-green-700 transition-transform active:scale-95 flex items-center justify-center">
                                        <Icon name="check" className="w-5 h-5 mr-2" /> Confirm Match
                                    </button>
                                    <button className="w-full py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors">
                                        Create New Invoice
                                    </button>
                                    <button className="w-full py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors">
                                        Transfer to Suspense
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center text-gray-400">
                                <Icon name="stack" className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                <p>Select a bank transaction on the left to find matches.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Reconciliation;
