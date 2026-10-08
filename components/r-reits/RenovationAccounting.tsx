
import React, { useState, useMemo, useEffect } from 'react';
import Icon from '../Icon';
import { RenovationProjectBill, Fund, Investment, RFTransaction } from '../../types';
import { useData } from '../../context/DataContext';
import { getTodayIsoDate } from '../../utils/timezone';

type LedgerRow = { id: string; date: string; account: string; description: string; debit: number; credit: number };

function fundMatchesTx(fund: Fund, tx: RFTransaction): boolean {
    const blob = `${tx.description || ''} ${tx.reference || ''} ${tx.partyName || ''}`.toLowerCase();
    const name = (fund.name || '').toLowerCase();
    return blob.includes(fund.id.toLowerCase()) || (!!name && blob.includes(name));
}

function rfToDoubleEntry(tx: RFTransaction): LedgerRow[] {
    const cashIn = 'Cash (Bank)';
    const cashOut = 'Cash (M-Pesa)';
    if (tx.category === 'Inbound') {
        const creditAcct = tx.type === 'Investment' ? 'Investor Capital' : 'Revenue';
        return [
            { id: `${tx.id}-dr`, date: tx.date, account: cashIn, description: `${tx.type} — ${tx.partyName}`, debit: tx.amount, credit: 0 },
            { id: `${tx.id}-cr`, date: tx.date, account: creditAcct, description: tx.description || tx.type, debit: 0, credit: tx.amount },
        ];
    }
    const debitAcct =
        tx.type === 'Expense' || tx.type === 'Invoice'
            ? 'Project Expense'
            : tx.type === 'Interest Payout'
                ? 'Interest Expense'
                : tx.type === 'Referral Commission'
                    ? 'Referral Expense'
                    : 'Investor Capital';
    return [
        { id: `${tx.id}-dr`, date: tx.date, account: debitAcct, description: `${tx.type} — ${tx.description || tx.partyName}`, debit: tx.amount, credit: 0 },
        { id: `${tx.id}-cr`, date: tx.date, account: cashOut, description: `Payment — ${tx.partyName}`, debit: 0, credit: tx.amount },
    ];
}

function investmentsToLedger(inv: Investment[]): LedgerRow[] {
    const rows: LedgerRow[] = [];
    inv.forEach(i => {
        rows.push({ id: `inv-${i.id}-d`, date: i.date, account: 'Cash (Bank)', description: `Capital contribution — ${i.fundName}`, debit: i.amount, credit: 0 });
        rows.push({ id: `inv-${i.id}-c`, date: i.date, account: 'Investor Capital', description: `Investor capital — ${i.fundName}`, debit: 0, credit: i.amount });
    });
    return rows;
}

function billsToLedger(bills: RenovationProjectBill[]): LedgerRow[] {
    const rows: LedgerRow[] = [];
    bills.forEach(b => {
        rows.push({
            id: `bill-${b.id}-d`,
            date: b.date,
            account: 'Project Expense',
            description: b.description || `${b.category} — ${b.vendor}`,
            debit: b.amount,
            credit: 0,
        });
        rows.push({ id: `bill-${b.id}-c`, date: b.date, account: 'Cash (M-Pesa)', description: `Payment — ${b.vendor}`, debit: 0, credit: b.amount });
    });
    return rows;
}

const FundProfitabilityModal: React.FC<{ project: Fund; onClose: () => void }> = ({ project, onClose }) => {
    
    // --- Financial Modeling ---
    const durationMonths = 12; // Assuming 1 year term for projection
    // Use capital raised as the base. If 0, use target capital to show potential (scenario analysis)
    const activeCapital = project.capitalRaised > 0 ? project.capitalRaised : project.targetCapital;
    const isProjection = project.capitalRaised === 0;

    // 1. Inflow (Landlord Interest)
    // Default to 5% if not set
    const monthlyInflowRate = (project.clientInterestRate || 5.0) / 100;
    const monthlyInflow = activeCapital * monthlyInflowRate;
    const totalInflow = monthlyInflow * durationMonths;

    // 2. Outflow (Investor Return)
    // Parse APY string "30%" -> 0.30
    let annualInvestorRate = 0.30; // Default
    if (project.targetApy) {
        // Extract first number found in string (handles "30%", "Up to 30%", "14-16%")
        const match = project.targetApy.match(/(\d+(\.\d+)?)/);
        if (match) {
            annualInvestorRate = parseFloat(match[0]) / 100;
        }
    }

    const monthlyInvestorRate = annualInvestorRate / 12;
    const monthlyOutflow = activeCapital * monthlyInvestorRate;
    const totalOutflow = monthlyOutflow * durationMonths;

    // 3. Gross Spread
    const monthlyGross = monthlyInflow - monthlyOutflow;
    const totalGross = totalInflow - totalOutflow;

    // 4. Expenses
    // Referral Commission (2.5% of Capital Raised, One-off)
    const referralCommission = activeCapital * 0.025;
    
    // Mgmt/Admin Fee (Mock: 1% of Capital / yr)
    const adminFee = activeCapital * 0.01;
    
    const totalExpenses = referralCommission + adminFee;

    // 5. Net Profit
    const netProfit = totalGross - totalExpenses;
    const margin = totalInflow > 0 ? (netProfit / totalInflow) * 100 : 0;

    return (
        <div className="fixed inset-0 bg-black/60 z-[1400] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-6 bg-gradient-to-r from-indigo-900 to-blue-900 text-white flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold">Fund Revenue Model</h2>
                        <p className="text-indigo-200 text-sm mt-1">{project.name}</p>
                        {isProjection && (
                            <span className="inline-block mt-2 px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-200 text-[10px] font-bold uppercase border border-yellow-500/30">
                                Projection (Based on Budget)
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="bg-white/10 p-2 rounded-full hover:bg-white/20 transition-colors">
                        <Icon name="close" className="w-5 h-5 text-white" />
                    </button>
                </div>

                <div className="p-8 overflow-y-auto">
                    <div className="flex justify-between items-center mb-8 bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <div className="text-center">
                            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">{isProjection ? 'Target Capital' : 'Active Capital'}</p>
                            <p className="text-xl font-bold text-indigo-900">KES {(activeCapital/1000000).toFixed(1)}M</p>
                        </div>
                        <div className="h-8 w-px bg-indigo-200"></div>
                        <div className="text-center">
                            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Landlord Rate</p>
                            <p className="text-xl font-bold text-indigo-900">{(project.clientInterestRate || 5).toFixed(1)}% <span className="text-xs font-normal text-indigo-600">/mo</span></p>
                        </div>
                        <div className="h-8 w-px bg-indigo-200"></div>
                        <div className="text-center">
                            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Investor Rate</p>
                            <p className="text-xl font-bold text-indigo-900">{(monthlyInvestorRate*100).toFixed(1)}% <span className="text-xs font-normal text-indigo-600">/mo</span></p>
                        </div>
                    </div>

                    <h3 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Profit & Loss (Projected 12 Months)</h3>
                    
                    <div className="space-y-3 text-sm">
                        {/* Revenue Section */}
                        <div className="flex justify-between items-center py-2">
                            <div>
                                <p className="font-bold text-gray-700">Interest Income (From Landlord)</p>
                                <p className="text-xs text-gray-500">Gross collections at {((project.clientInterestRate || 5)*12).toFixed(0)}% APR</p>
                            </div>
                            <p className="font-bold text-green-600 text-base">+ KES {totalInflow.toLocaleString()}</p>
                        </div>

                        {/* COGS Section */}
                        <div className="flex justify-between items-center py-2 border-t border-dashed">
                            <div>
                                <p className="font-bold text-gray-700">Investor Payouts (Cost of Capital)</p>
                                <p className="text-xs text-gray-500">Returns distributed at approx. {(annualInvestorRate*100).toFixed(1)}% APY</p>
                            </div>
                            <p className="font-bold text-red-500 text-base">- KES {totalOutflow.toLocaleString()}</p>
                        </div>

                        {/* Gross Profit */}
                        <div className="flex justify-between items-center py-3 bg-gray-50 rounded px-3 border border-gray-200">
                            <p className="font-extrabold text-gray-800">Gross Fund Revenue (Spread)</p>
                            <p className="font-extrabold text-gray-800 text-lg">KES {totalGross.toLocaleString()}</p>
                        </div>

                        {/* Expenses Section */}
                        <div className="py-2 space-y-2">
                            <div className="flex justify-between items-center text-gray-600">
                                <span>Referral Commissions (2.5%)</span>
                                <span className="text-red-500">- KES {referralCommission.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between items-center text-gray-600">
                                <span>Operational & Admin Costs</span>
                                <span className="text-red-500">- KES {adminFee.toLocaleString()}</span>
                            </div>
                        </div>

                        {/* Net Profit */}
                        <div className="flex justify-between items-center pt-4 border-t-2 border-gray-800 mt-2">
                            <div>
                                <p className="text-xl font-extrabold text-gray-900">Net Fund Revenue</p>
                                <p className="text-xs text-green-600 font-bold mt-1">Net Margin: {margin.toFixed(1)}%</p>
                            </div>
                            <p className="text-2xl font-extrabold text-indigo-700">KES {netProfit.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
                
                <div className="p-4 bg-gray-50 border-t text-center">
                    <p className="text-xs text-gray-400">
                        Figures are projected based on full capital utilization over 12 months. Actuals may vary based on repayment schedules.
                    </p>
                </div>
            </div>
        </div>
    );
};

const RenovationAccounting: React.FC = () => {
    const { funds, renovationProjectBills, addRenovationProjectBill, updateRenovationProjectBill, rfTransactions, investments } = useData();
    
    // Use projects from context funds
    const projects = funds;
    
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isProfitModalOpen, setIsProfitModalOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<RenovationProjectBill | null>(null);
    
    // Form State
    const [newBill, setNewBill] = useState<Partial<RenovationProjectBill>>({
        vendor: '', description: '', amount: 0, date: getTodayIsoDate(), status: 'Pending', category: 'Material', invoiceNumber: '', attachmentUrl: ''
    });

    const [filterAccount, setFilterAccount] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');

    const accounts = ['All', 'Cash (M-Pesa)', 'Cash (Bank)', 'Investor Capital', 'Project Expense', 'Revenue', 'Interest Expense', 'Referral Expense'];

    // Ensure we have a selected project, default to first if available
    useEffect(() => {
        if (!selectedProjectId && projects.length > 0) {
            setSelectedProjectId(projects[0].id);
        }
    }, [projects, selectedProjectId]);

    // --- General ledger: RF activity matched to fund + paid project bills; fallback to investments + bills ---
    const fundLedgerEntries = useMemo(() => {
        const fund = projects.find(p => p.id === selectedProjectId);
        if (!fund) return [] as LedgerRow[];
        const matchedRf = (rfTransactions || []).filter(tx => tx.status === 'Completed' && fundMatchesTx(fund, tx));
        const paidBills = renovationProjectBills.filter(b => b.projectId === selectedProjectId && b.status === 'Paid');
        let rows: LedgerRow[] = [];
        matchedRf.forEach(tx => {
            rows.push(...rfToDoubleEntry(tx));
        });
        rows.push(...billsToLedger(paidBills));
        if (rows.length === 0) {
            const invs = (investments || []).filter(i => i.fundId === selectedProjectId);
            rows = [...investmentsToLedger(invs), ...billsToLedger(paidBills)];
        }
        return rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [selectedProjectId, projects, rfTransactions, renovationProjectBills, investments]);

    const filteredEntries = useMemo(() => {
        return fundLedgerEntries.filter(e => {
            const matchesAccount = filterAccount === 'All' || e.account === filterAccount;
            const matchesSearch = e.description.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesAccount && matchesSearch;
        });
    }, [fundLedgerEntries, filterAccount, searchQuery]);

    const totals = useMemo(() => {
        return filteredEntries.reduce((acc, curr) => ({
            debit: acc.debit + curr.debit,
            credit: acc.credit + curr.credit
        }), { debit: 0, credit: 0 });
    }, [filteredEntries]);

    // --- Project Expenses Logic ---
    const selectedProject = projects.find(p => p.id === selectedProjectId);
    const projectExpenses = renovationProjectBills.filter(e => e.projectId === selectedProjectId);
    const totalSpent = projectExpenses.reduce((sum, e) => sum + e.amount, 0);
    const remainingBudget = (selectedProject?.targetCapital || 0) - totalSpent;

    // --- Profitability Metrics for selected project ---
    const activeCapital = (selectedProject?.capitalRaised || 0) > 0 ? selectedProject!.capitalRaised : (selectedProject?.targetCapital || 0);
    const monthlySpreadRevenue = activeCapital * 0.025; 
    const projectedAnnualRevenue = monthlySpreadRevenue * 12;

    const handleAddBill = () => {
        if(!newBill.vendor || !newBill.amount) return alert("Fields required");
        
        if (editingExpense) {
             updateRenovationProjectBill(editingExpense.id, newBill);
             setEditingExpense(null);
        } else {
             const bill: RenovationProjectBill = {
                ...newBill,
                id: `bill-${Date.now()}`,
                projectId: selectedProjectId,
            } as RenovationProjectBill;
            addRenovationProjectBill(bill);
        }

        setIsModalOpen(false);
        setNewBill({ vendor: '', description: '', amount: 0, date: getTodayIsoDate(), status: 'Pending', category: 'Material', invoiceNumber: '', attachmentUrl: '' });
    };

    const handleEditExpense = (exp: RenovationProjectBill) => {
        setEditingExpense(exp);
        setNewBill(exp);
        setIsModalOpen(true);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                 setNewBill(prev => ({ ...prev, attachmentUrl: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Project Accounting</h1>
                    <p className="text-gray-500 mt-1">Track renovation costs, budget, and fund profitability.</p>
                </div>
                <div className="flex gap-4">
                     <select 
                        value={selectedProjectId} 
                        onChange={e => setSelectedProjectId(e.target.value)} 
                        className="p-2 border rounded-lg bg-white shadow-sm font-medium max-w-xs"
                    >
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button onClick={() => { setEditingExpense(null); setNewBill({ vendor: '', description: '', amount: 0, date: getTodayIsoDate(), status: 'Pending', category: 'Material', invoiceNumber: '', attachmentUrl: '' }); setIsModalOpen(true); }} className="px-4 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-sm flex items-center">
                        <Icon name="plus" className="w-4 h-4 mr-2"/> Add Expense
                    </button>
                </div>
            </div>

            {/* Financial Overview Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Fund Profitability Card */}
                <div 
                    onClick={() => setIsProfitModalOpen(true)}
                    className="relative p-6 rounded-xl shadow-md cursor-pointer overflow-hidden group hover:shadow-lg transition-all duration-300"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #312e81 100%)' }}
                >
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                         <Icon name="revenue" className="w-16 h-16 text-white" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider flex items-center">
                            Fund Revenue (Spread) <Icon name="info" className="w-3 h-3 ml-1" />
                        </p>
                        <h3 className="text-2xl font-extrabold text-white mt-2">
                            KES {(projectedAnnualRevenue/1000000).toFixed(1)}M
                        </h3>
                        <p className="text-indigo-200 text-xs mt-1">Projected Annual Net Spread</p>
                        <div className="mt-4 pt-3 border-t border-indigo-500/30 flex justify-between items-center">
                            <span className="text-[10px] font-bold bg-white/20 px-2 py-1 rounded text-white">Gross Margin ~30%</span>
                            <span className="text-xs font-bold text-white flex items-center group-hover:translate-x-1 transition-transform">
                                View P&L <Icon name="chevron-down" className="w-3 h-3 ml-1 -rotate-90" />
                            </span>
                        </div>
                    </div>
                </div>

                {/* Construction Budget Cards */}
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <p className="text-gray-500 text-sm font-bold uppercase">Construction Budget</p>
                    <h3 className="text-2xl font-extrabold text-gray-800 mt-2">KES {(selectedProject?.targetCapital || 0).toLocaleString()}</h3>
                    <p className="text-xs text-gray-400 mt-1">Target Capital</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-red-500">
                    <p className="text-gray-500 text-sm font-bold uppercase">Total Spent</p>
                    <h3 className="text-2xl font-extrabold text-gray-800 mt-2">KES {totalSpent.toLocaleString()}</h3>
                    <p className="text-xs text-red-400 mt-1">Materials & Labor</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-green-500">
                    <p className="text-gray-500 text-sm font-bold uppercase">Budget Remaining</p>
                    <h3 className="text-2xl font-extrabold text-green-600 mt-2">KES {remainingBudget.toLocaleString()}</h3>
                    <p className="text-xs text-green-600 mt-1">Available for use</p>
                </div>
            </div>

            {/* Ledger */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-6 border-b">
                    <h3 className="text-lg font-bold text-gray-800">Construction Expense Ledger - {selectedProject?.name}</h3>
                </div>
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 uppercase">
                        <tr>
                            <th className="px-6 py-3">Date</th>
                            <th className="px-6 py-3">Invoice #</th>
                            <th className="px-6 py-3">Vendor</th>
                            <th className="px-6 py-3">Description</th>
                            <th className="px-6 py-3">Category</th>
                            <th className="px-6 py-3 text-right">Amount</th>
                            <th className="px-6 py-3 text-center">Status</th>
                            <th className="px-6 py-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {projectExpenses.map(exp => (
                            <tr key={exp.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4">{exp.date}</td>
                                <td className="px-6 py-4 font-mono text-xs">{exp.invoiceNumber || '-'}</td>
                                <td className="px-6 py-4 font-bold">{exp.vendor}</td>
                                <td className="px-6 py-4 text-gray-600">{exp.description}</td>
                                <td className="px-6 py-4"><span className="bg-gray-100 px-2 py-1 rounded text-xs">{exp.category}</span></td>
                                <td className="px-6 py-4 text-right font-mono font-bold">KES {exp.amount.toLocaleString()}</td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${exp.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                        {exp.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => handleEditExpense(exp)} className="text-blue-600 hover:text-blue-800 text-xs font-bold">Edit</button>
                                </td>
                            </tr>
                        ))}
                         {projectExpenses.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-gray-500">No expenses recorded yet for {selectedProject?.name}.</td></tr>}
                    </tbody>
                </table>
            </div>

            {/* General Ledger Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-8">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-gray-800">General Ledger (Fund Level)</h3>
                </div>
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="relative flex-grow">
                        <input 
                            type="text" 
                            placeholder="Search description..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                        />
                        <div className="absolute left-3 top-2.5 text-gray-400"><Icon name="search" className="w-5 h-5" /></div>
                    </div>
                    <select 
                        value={filterAccount} 
                        onChange={e => setFilterAccount(e.target.value)} 
                        className="p-2 border rounded-lg bg-gray-50 font-medium w-full md:w-64"
                    >
                        {accounts.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                    </select>
                </div>

                <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 uppercase text-xs font-bold text-gray-500">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Account</th>
                                <th className="px-6 py-3">Description</th>
                                <th className="px-6 py-3 text-right">Debit (Dr)</th>
                                <th className="px-6 py-3 text-right">Credit (Cr)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredEntries.map(entry => (
                                <tr key={entry.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-3 text-gray-600 font-mono">{entry.date}</td>
                                    <td className="px-6 py-3 font-bold text-gray-800">{entry.account}</td>
                                    <td className="px-6 py-3 text-gray-600">{entry.description}</td>
                                    <td className="px-6 py-3 text-right font-mono">{entry.debit > 0 ? entry.debit.toLocaleString() : '-'}</td>
                                    <td className="px-6 py-3 text-right font-mono">{entry.credit > 0 ? entry.credit.toLocaleString() : '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-100 font-bold text-gray-800">
                            <tr>
                                <td colSpan={3} className="px-6 py-3 text-right uppercase text-xs">Totals</td>
                                <td className="px-6 py-3 text-right font-mono">{totals.debit.toLocaleString()}</td>
                                <td className="px-6 py-3 text-right font-mono">{totals.credit.toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1300]" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-white p-6 rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <h2 className="text-xl font-bold mb-4">{editingExpense ? 'Edit Expense' : 'Add Project Expense'}</h2>
                        <div className="space-y-3">
                            <input 
                                className="w-full p-2 border rounded" 
                                placeholder="Vendor Name" 
                                value={newBill.vendor} 
                                onChange={e => setNewBill({...newBill, vendor: e.target.value})}
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <input 
                                    className="w-full p-2 border rounded" 
                                    placeholder="Invoice Number" 
                                    value={newBill.invoiceNumber} 
                                    onChange={e => setNewBill({...newBill, invoiceNumber: e.target.value})}
                                />
                                <select 
                                    className="w-full p-2 border rounded bg-white"
                                    value={newBill.category}
                                    onChange={e => setNewBill({...newBill, category: e.target.value as any})}
                                >
                                    <option>Material</option>
                                    <option>Labor</option>
                                    <option>Permits</option>
                                    <option>Other</option>
                                </select>
                            </div>
                            <input 
                                className="w-full p-2 border rounded" 
                                placeholder="Description" 
                                value={newBill.description} 
                                onChange={e => setNewBill({...newBill, description: e.target.value})}
                            />
                            <div className="grid grid-cols-2 gap-3">
                                <input 
                                    type="number" 
                                    className="w-full p-2 border rounded" 
                                    placeholder="Amount" 
                                    value={newBill.amount || ''} 
                                    onChange={e => setNewBill({...newBill, amount: parseFloat(e.target.value)})}
                                />
                                 <input 
                                    type="date" 
                                    className="w-full p-2 border rounded" 
                                    value={newBill.date} 
                                    onChange={e => setNewBill({...newBill, date: e.target.value})}
                                />
                            </div>
                            
                            <div className="border-t pt-2">
                                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Receipt / Invoice Attachment</label>
                                {newBill.attachmentUrl ? (
                                    <div className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                                        <span className="text-sm text-gray-600 truncate w-3/4">Attached Image</span>
                                        <button onClick={() => setNewBill(prev => ({...prev, attachmentUrl: ''}))} className="text-red-500 text-xs font-bold">Remove</button>
                                    </div>
                                ) : (
                                    <input type="file" accept="image/*,application/pdf" onChange={handleFileUpload} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"/>
                                )}
                            </div>

                            <select 
                                className="w-full p-2 border rounded bg-white"
                                value={newBill.status}
                                onChange={e => setNewBill({...newBill, status: e.target.value as any})}
                            >
                                <option>Pending</option>
                                <option>Paid</option>
                            </select>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-100 rounded">Cancel</button>
                            <button onClick={handleAddBill} className="px-4 py-2 bg-primary text-white rounded hover:bg-primary-dark">Save</button>
                        </div>
                    </div>
                </div>
            )}

            {isProfitModalOpen && selectedProject && (
                <FundProfitabilityModal 
                    project={selectedProject} 
                    onClose={() => setIsProfitModalOpen(false)} 
                />
            )}
        </div>
    );
};

export default RenovationAccounting;
