
import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import Icon from '../Icon';
import { RFTransaction, Investment } from '../../types';
import { exportToCSV } from '../../utils/exportHelper';
import { getTodayIsoDate } from '../../utils/timezone';

interface SideEffects {
    linkedBillId?: string;
    newInvestment?: Investment;
}

const TransactionModal: React.FC<{ 
    transaction?: RFTransaction | null;
    onClose: () => void; 
    onSave: (tx: RFTransaction, effects?: SideEffects) => void;
    // Data for smart linking
    investors: any[];
    landlords: any[];
    funds: any[];
    pendingBills: any[];
}> = ({ transaction, onClose, onSave, investors, landlords, funds, pendingBills }) => {
    const [formData, setFormData] = useState<Partial<RFTransaction>>(transaction || {
        date: getTodayIsoDate(),
        type: 'Investment',
        category: 'Inbound',
        amount: 0,
        partyName: '',
        reference: '',
        description: '',
        status: 'Completed'
    });

    // Smart Context State
    const [selectedFundId, setSelectedFundId] = useState('');
    const [selectedInvestorId, setSelectedInvestorId] = useState('');
    const [selectedLandlordId, setSelectedLandlordId] = useState('');
    const [linkPendingBill, setLinkPendingBill] = useState(false);
    const [selectedBillId, setSelectedBillId] = useState('');

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const type = e.target.value as any;
        let category: 'Inbound' | 'Outbound' = 'Inbound';
        if (['Withdrawal', 'Expense', 'Invoice', 'Interest Payout'].includes(type)) {
            category = 'Outbound';
        }
        setFormData(prev => ({ ...prev, type, category, partyName: '', amount: 0, reference: '', description: '' }));
        
        // Reset smart fields
        setSelectedFundId('');
        setSelectedInvestorId('');
        setSelectedLandlordId('');
        setLinkPendingBill(false);
        setSelectedBillId('');
    };

    // Smart Fill Handlers
    const handleInvestorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const invId = e.target.value;
        setSelectedInvestorId(invId);
        const inv = investors.find(i => i.id === invId);
        if (inv) {
            setFormData(prev => ({ ...prev, partyName: inv.name }));
        }
    };

    const handleLandlordChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const lId = e.target.value;
        setSelectedLandlordId(lId);
        const l = landlords.find(user => user.id === lId);
        if (l) {
            setFormData(prev => ({ ...prev, partyName: l.name }));
        }
    };

    const handleBillChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const bId = e.target.value;
        setSelectedBillId(bId);
        const bill = pendingBills.find(b => b.id === bId);
        if (bill) {
            setFormData(prev => ({
                ...prev,
                amount: bill.amount,
                partyName: bill.vendor,
                reference: bill.invoiceNumber || `BILL-${bill.id.slice(-4)}`,
                description: bill.description || `Payment for ${bill.category}`
            }));
        }
    };

    const handleSubmit = () => {
        if (!formData.amount || !formData.partyName) return alert("Party Name and Amount are required.");
        
        const txId = transaction?.id || `tx-${Date.now()}`;
        const finalTx = { ...formData, id: txId } as RFTransaction;
        
        const effects: SideEffects = {};

        // 1. Investment Side Effect
        if (formData.type === 'Investment' && selectedFundId && selectedInvestorId) {
            const fund = funds.find(f => f.id === selectedFundId);
            if (fund) {
                effects.newInvestment = {
                    id: `inv-${Date.now()}`,
                    fundId: fund.id,
                    fundName: fund.name,
                    amount: formData.amount || 0,
                    date: formData.date || new Date().toISOString(),
                    strategy: 'Monthly Payout', // Default
                    status: 'Active',
                    accruedInterest: 0
                };
            }
        }

        // 2. Bill Payment Side Effect
        if (linkPendingBill && selectedBillId) {
            effects.linkedBillId = selectedBillId;
        }

        onSave(finalTx, effects);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1300] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-gray-800">{transaction ? 'Edit Transaction' : 'Record Payment'}</h3>
                        <p className="text-sm text-gray-500">Smart entry for Fund operations.</p>
                    </div>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
                </div>

                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                    {/* Type Selection */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Transaction Type</label>
                        <select value={formData.type} onChange={handleTypeChange} className="w-full p-2.5 border rounded-lg bg-gray-50 focus:bg-white transition-colors">
                            <option value="Investment">Investment (Inbound)</option>
                            <option value="Loan Payback">Landlord Loan Payback (Inbound)</option>
                            <option value="Management Fee">Management Fee (Inbound)</option>
                            <option value="Withdrawal">Withdrawal (Outbound)</option>
                            <option value="Interest Payout">Interest Payout (Outbound)</option>
                            <option value="Expense">Expense (Outbound)</option>
                            <option value="Invoice">Invoice Payment (Outbound)</option>
                        </select>
                    </div>

                    {/* Smart Context Fields */}
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-3">
                        
                        {/* INVESTOR SELECTION */}
                        {(formData.type === 'Investment' || formData.type === 'Withdrawal' || formData.type === 'Interest Payout') && (
                            <div>
                                <label className="block text-xs font-bold text-blue-700 uppercase mb-1">Select Investor</label>
                                <select value={selectedInvestorId} onChange={handleInvestorChange} className="w-full p-2 border border-blue-200 rounded bg-white text-sm">
                                    <option value="">-- Choose Investor --</option>
                                    {investors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                </select>
                            </div>
                        )}

                        {/* FUND SELECTION (Investment Only) */}
                        {formData.type === 'Investment' && (
                            <div>
                                <label className="block text-xs font-bold text-blue-700 uppercase mb-1">Allocate to Fund</label>
                                <select value={selectedFundId} onChange={e => setSelectedFundId(e.target.value)} className="w-full p-2 border border-blue-200 rounded bg-white text-sm">
                                    <option value="">-- Choose Project --</option>
                                    {funds.filter(f => f.status !== 'Fully Funded').map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                </select>
                                {selectedFundId && <p className="text-xs text-green-600 mt-1 flex items-center"><Icon name="check" className="w-3 h-3 mr-1"/> Will create investment record</p>}
                            </div>
                        )}

                        {/* LANDLORD SELECTION */}
                        {formData.type === 'Loan Payback' && (
                            <div>
                                <label className="block text-xs font-bold text-blue-700 uppercase mb-1">Select Landlord</label>
                                <select value={selectedLandlordId} onChange={handleLandlordChange} className="w-full p-2 border border-blue-200 rounded bg-white text-sm">
                                    <option value="">-- Choose Landlord --</option>
                                    {landlords.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                            </div>
                        )}

                        {/* BILL PAYMENT LINKING */}
                        {(formData.type === 'Expense' || formData.type === 'Invoice') && (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-bold text-blue-700 uppercase">Link to Pending Bill?</label>
                                    <input type="checkbox" checked={linkPendingBill} onChange={e => setLinkPendingBill(e.target.checked)} className="h-4 w-4 text-blue-600 rounded" />
                                </div>
                                {linkPendingBill && (
                                    <select value={selectedBillId} onChange={handleBillChange} className="w-full p-2 border border-blue-200 rounded bg-white text-sm">
                                        <option value="">-- Select Pending Bill --</option>
                                        {pendingBills.map(b => (
                                            <option key={b.id} value={b.id}>
                                                {b.vendor} - {b.category} (KES {b.amount.toLocaleString()})
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {selectedBillId && <p className="text-xs text-green-600 mt-1 flex items-center"><Icon name="check" className="w-3 h-3 mr-1"/> Will mark bill as Paid</p>}
                            </div>
                        )}
                    </div>

                    {/* General Fields */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Party Name</label>
                        <input 
                            value={formData.partyName} 
                            onChange={e => setFormData({...formData, partyName: e.target.value})} 
                            placeholder="Investor / Vendor / Landlord Name" 
                            className="w-full p-2 border rounded-lg" 
                            readOnly={!!selectedInvestorId || !!selectedLandlordId || !!selectedBillId}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES)</label>
                            <input 
                                type="number" 
                                value={formData.amount || ''} 
                                onChange={e => setFormData({...formData, amount: parseFloat(e.target.value)})} 
                                placeholder="0.00" 
                                className="w-full p-2 border rounded-lg font-bold"
                                readOnly={!!selectedBillId} 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full p-2 border rounded-lg" />
                        </div>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                        <input value={formData.reference} onChange={e => setFormData({...formData, reference: e.target.value})} placeholder="Tx Ref / Invoice #" className="w-full p-2 border rounded-lg" />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                        <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Notes..." className="w-full p-2 border rounded-lg" rows={2} />
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t mt-2">
                    <button onClick={onClose} className="px-6 py-2.5 bg-gray-100 rounded-lg text-gray-700 font-medium hover:bg-gray-200 transition-colors">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2.5 bg-primary text-white rounded-lg font-bold hover:bg-primary-dark shadow-lg transition-colors">
                        {transaction ? 'Update' : 'Record Payment'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const RFPayments: React.FC = () => {
    const { 
        rfTransactions, addRFTransaction, updateRFTransaction, 
        investments, addInvestment, 
        renovationInvestors, landlords, funds, 
        renovationProjectBills, updateRenovationProjectBill 
    } = useData();

    const [activeTab, setActiveTab] = useState<'All' | 'Inbound' | 'Outbound'>('All');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTx, setEditingTx] = useState<RFTransaction | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Tenant referral commissions are recorded in the same RF ledger but
    // belong to the tenants module — keep them out of R-Reits views.
    const investorNames = useMemo(
        () => new Set((renovationInvestors || []).map(i => String(i.name || '').trim().toLowerCase())),
        [renovationInvestors]
    );
    const investorRfTransactions = useMemo(() => rfTransactions.filter(tx => {
        if (tx.type !== 'Referral Commission') return true;
        const name = String(tx.partyName || '').trim().toLowerCase();
        return name && investorNames.has(name);
    }), [rfTransactions, investorNames]);

    const filteredTransactions = useMemo(() => {
        return investorRfTransactions.filter(tx => {
            const matchesTab = activeTab === 'All' || tx.category === activeTab;
            const matchesSearch = tx.partyName.toLowerCase().includes(searchQuery.toLowerCase()) || tx.type.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesTab && matchesSearch;
        });
    }, [investorRfTransactions, activeTab, searchQuery]);

    const pendingBills = useMemo(() => renovationProjectBills.filter(b => b.status === 'Pending'), [renovationProjectBills]);

    // Summary Calcs
    const summary = useMemo(() => {
        const investorsPortfolio = investments.filter(i => i.status === 'Active').reduce((sum, i) => sum + i.amount, 0);
        const totalExpenses = investorRfTransactions.filter(t => (t.type === 'Expense' || t.type === 'Invoice') && t.category === 'Outbound').reduce((s, t) => s + t.amount, 0);
        const interestPaid = investorRfTransactions.filter(t => (t.type === 'Interest Payout' || (t.type === 'Withdrawal' && t.description?.toLowerCase().includes('interest')))).reduce((s, t) => s + t.amount, 0);
        return { investorsPortfolio, totalExpenses, interestPaid };
    }, [investorRfTransactions, investments]);

    const handleSaveTransaction = (tx: RFTransaction, effects?: SideEffects) => {
        // 1. Save the Transaction Record
        if (editingTx) {
            updateRFTransaction(tx.id, tx);
        } else {
            addRFTransaction(tx);
        }

        // 2. Handle Smart Side Effects
        if (effects?.linkedBillId) {
            updateRenovationProjectBill(effects.linkedBillId, { status: 'Paid' });
            // Ideally also link the TX ID to the bill, but for now just status
        }

        if (effects?.newInvestment) {
            addInvestment(effects.newInvestment);
        }

        setIsModalOpen(false);
        setEditingTx(null);
    };

    const handleEdit = (tx: RFTransaction) => {
        setEditingTx(tx);
        setIsModalOpen(true);
    };

    const handleExport = () => {
        exportToCSV(filteredTransactions.map(t => ({
            Date: t.date, Type: t.type, Category: t.category, Party: t.partyName, Amount: t.amount, Ref: t.reference, Status: t.status
        })), 'RF_Payments');
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">RF Payments</h1>
                    <p className="text-lg text-gray-500 mt-1">Unified ledger for Renovation Fund inflows and outflows.</p>
                </div>
                <button onClick={() => { setEditingTx(null); setIsModalOpen(true); }} className="bg-primary text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-primary-dark flex items-center">
                    <Icon name="plus" className="w-5 h-5 mr-2" /> Record Payment
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-blue-500">
                    <p className="text-gray-500 text-xs font-bold uppercase">Investors Portfolio</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">KES {summary.investorsPortfolio.toLocaleString()}</p>
                    <p className="text-xs text-blue-600 mt-1">Active Capital</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-red-500">
                    <p className="text-gray-500 text-xs font-bold uppercase">Total Expenses</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">KES {summary.totalExpenses.toLocaleString()}</p>
                    <p className="text-xs text-red-600 mt-1">Operational Costs</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-green-500">
                    <p className="text-gray-500 text-xs font-bold uppercase">Interest on Funding</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">KES {summary.interestPaid.toLocaleString()}</p>
                    <p className="text-xs text-green-600 mt-1">Returns Paid Out</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                    <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
                        {['All', 'Inbound', 'Outbound'].map(tab => (
                            <button 
                                key={tab} 
                                onClick={() => setActiveTab(tab as any)}
                                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-colors ${activeTab === tab ? 'bg-white shadow text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2 w-full md:w-auto">
                        <div className="relative flex-grow md:flex-grow-0">
                            <input 
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search transactions..."
                                className="pl-9 pr-4 py-2 border rounded-lg w-full md:w-64 focus:ring-primary focus:border-primary"
                            />
                            <div className="absolute left-3 top-2.5 text-gray-400"><Icon name="search" className="w-4 h-4" /></div>
                        </div>
                        <button onClick={handleExport} className="px-4 py-2 bg-gray-100 rounded-lg text-gray-700 font-bold hover:bg-gray-200">Export</button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Type</th>
                                <th className="px-6 py-3">Party / Description</th>
                                <th className="px-6 py-3">Ref</th>
                                <th className="px-6 py-3 text-right">Amount</th>
                                <th className="px-6 py-3 text-center">Status</th>
                                <th className="px-6 py-3 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredTransactions.map(tx => (
                                <tr key={tx.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 text-gray-600">{tx.date}</td>
                                    <td className="px-6 py-4 font-medium text-gray-800">{tx.type}</td>
                                    <td className="px-6 py-4 text-gray-600">
                                        <span className="font-medium text-gray-900">{tx.partyName}</span>
                                        {tx.description && <span className="text-xs block text-gray-400">{tx.description}</span>}
                                    </td>
                                    <td className="px-6 py-4 font-mono text-xs text-gray-500">{tx.reference}</td>
                                    <td className={`px-6 py-4 text-right font-bold ${tx.category === 'Inbound' ? 'text-green-600' : 'text-red-600'}`}>
                                        {tx.category === 'Inbound' ? '+' : '-'} KES {tx.amount.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${tx.status === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {tx.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => handleEdit(tx)} className="text-blue-600 hover:underline text-xs font-bold">Edit</button>
                                    </td>
                                </tr>
                            ))}
                            {filteredTransactions.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-gray-400">No transactions found.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <TransactionModal 
                    transaction={editingTx} 
                    onClose={() => setIsModalOpen(false)} 
                    onSave={handleSaveTransaction}
                    investors={renovationInvestors}
                    landlords={landlords}
                    funds={funds}
                    pendingBills={pendingBills}
                />
            )}
        </div>
    );
};

export default RFPayments;
