
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { Fund, Investment, WithdrawalRequest, RFTransaction } from '../../types';
import Icon from '../Icon';
import { ProjectDetailModal } from './InvestmentPlans'; 
import { getTodayIsoDate } from '../../utils/timezone';

// --- Reusable Components ---

const OtpModal: React.FC<{ onClose: () => void; onSuccess: () => void; action: string }> = ({ onClose, onSuccess, action }) => {
    const [otp, setOtp] = useState('');
    
    const handleVerify = () => {
        if (otp === '1234') { // Mock OTP
            onSuccess();
        } else {
            alert('Invalid OTP. Try 1234.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1500] backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
                <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <Icon name="communication" className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Verify Identity</h3>
                <p className="text-sm text-gray-500 mb-6">To {action}, please enter the code sent to your phone.</p>
                <input 
                    className="w-full p-3 text-center text-2xl font-bold tracking-widest border rounded-lg mb-6 focus:ring-2 focus:ring-primary outline-none" 
                    placeholder="0 0 0 0"
                    maxLength={4}
                    value={otp}
                    onChange={e => setOtp(e.target.value)}
                    autoFocus
                />
                <button onClick={handleVerify} className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary-dark transition-colors">Verify Code</button>
            </div>
        </div>
    );
};

const WithdrawModal: React.FC<{ 
    balance: number; 
    onClose: () => void; 
    onSubmit: (req: WithdrawalRequest) => void 
}> = ({ balance, onClose, onSubmit }) => {
    const [step, setStep] = useState<'type' | 'details' | 'verify'>('type');
    const [amount, setAmount] = useState('');
    const [type, setType] = useState<'Interest' | 'Capital' | 'Partial Capital'>('Interest');
    const [method, setMethod] = useState<'M-Pesa' | 'Bank'>('M-Pesa');
    const [account, setAccount] = useState('Default (07XX...)');

    // Logic
    const today = new Date();
    const canWithdrawInterest = today.getDate() >= 5; 
    const isCapitalWithdrawal = type === 'Capital' || type === 'Partial Capital';
    const fee = isCapitalWithdrawal ? parseFloat(amount || '0') * 0.10 : 0;
    
    const handleNext = () => {
        if (!amount) return alert('Enter amount');
        const val = parseFloat(amount);
        if (val > balance) return alert('Insufficient funds');
        
        if (type === 'Interest' && !canWithdrawInterest) {
            alert("Interest withdrawals are only available from the 5th of the month.");
            return;
        }
        setStep('details');
    };

    const handleConfirm = () => {
        if (account === 'Change Account') {
            setStep('verify');
        } else {
            submit();
        }
    };

    const submit = () => {
        onSubmit({
            id: `wr-${Date.now()}`,
            investorName: 'Current User',
            amount: parseFloat(amount),
            requestDate: getTodayIsoDate(),
            type,
            method,
            destinationAccount: account === 'Change Account' ? 'New Verified Account' : account,
            status: 'Pending Approval',
            notes: isCapitalWithdrawal ? '10% Fee Applied. 90 Day Wait.' : ''
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1400] p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-800">Withdraw Funds</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                
                <div className="p-6">
                    {step === 'type' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <button 
                                    onClick={() => setType('Interest')}
                                    className={`p-4 border rounded-lg text-left hover:bg-gray-50 transition-all ${type === 'Interest' ? 'border-primary ring-1 ring-primary' : ''}`}
                                >
                                    <p className="font-bold text-gray-800">Interest Only</p>
                                    <p className="text-xs text-gray-500 mt-1">Available from 5th. Instant.</p>
                                </button>
                                <button 
                                    onClick={() => setType('Capital')}
                                    className={`p-4 border rounded-lg text-left hover:bg-gray-50 transition-all ${type !== 'Interest' ? 'border-primary ring-1 ring-primary' : ''}`}
                                >
                                    <p className="font-bold text-gray-800">Capital</p>
                                    <p className="text-xs text-gray-500 mt-1">10% Fee. 90 Days wait.</p>
                                </button>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES)</label>
                                <input 
                                    type="number" 
                                    value={amount} 
                                    onChange={e => setAmount(e.target.value)} 
                                    className="w-full p-3 border rounded-lg text-lg font-bold" 
                                    placeholder="0.00"
                                />
                                <p className="text-xs text-gray-500 mt-1">Available: KES {balance.toLocaleString()}</p>
                            </div>

                            {type !== 'Interest' && (
                                <div className="bg-red-50 p-3 rounded text-xs text-red-800 border border-red-100">
                                    <strong>Warning:</strong> Capital withdrawals incur a 10% early exit fee and take up to 90 days to process.
                                    <br/>Fee: KES {fee.toLocaleString()}
                                </div>
                            )}
                            
                            <button onClick={handleNext} className="w-full bg-primary text-white py-3 rounded-lg font-bold mt-4">Next</button>
                        </div>
                    )}

                    {step === 'details' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Select Account</label>
                                <select 
                                    value={account} 
                                    onChange={e => setAccount(e.target.value)} 
                                    className="w-full p-3 border rounded-lg bg-white"
                                >
                                    <option>Default (07XX...)</option>
                                    <option>Default Bank (KCB...)</option>
                                    <option>Change Account</option>
                                </select>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg text-sm space-y-2">
                                <div className="flex justify-between"><span>Withdrawal:</span> <span>KES {parseFloat(amount).toLocaleString()}</span></div>
                                <div className="flex justify-between text-red-600"><span>Less Fees:</span> <span>- KES {fee.toLocaleString()}</span></div>
                                <div className="flex justify-between font-bold border-t pt-2"><span>Net Payout:</span> <span>KES {(parseFloat(amount) - fee).toLocaleString()}</span></div>
                            </div>
                            <button onClick={handleConfirm} className="w-full bg-green-600 text-white py-3 rounded-lg font-bold mt-4 hover:bg-green-700">Confirm Withdrawal</button>
                        </div>
                    )}

                    {step === 'verify' && (
                        <OtpModal onClose={() => setStep('details')} onSuccess={submit} action="change payment details" />
                    )}
                </div>
            </div>
        </div>
    );
};

const AddCapitalModal: React.FC<{ 
    funds: Fund[]; 
    investments: Investment[];
    onClose: () => void;
    onSubmit: (inv: Partial<Investment>) => void;
}> = ({ funds, investments, onClose, onSubmit }) => {
    const [tab, setTab] = useState<'New' | 'Refinance'>('New');
    const [selectedFundId, setSelectedFundId] = useState('');
    const [amount, setAmount] = useState('');
    const [strategy, setStrategy] = useState<'Monthly Payout' | 'Compound'>('Monthly Payout');

    const handleSubmit = () => {
        if (!selectedFundId || !amount) return alert("Complete all fields");
        const fundName = funds.find(f => f.id === selectedFundId)?.name || 'Unknown Fund';
        
        onSubmit({
            fundId: selectedFundId,
            fundName,
            amount: parseFloat(amount),
            strategy,
            date: getTodayIsoDate(),
            status: 'Active',
            accruedInterest: 0
        });
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1400] p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-gray-800 mb-4">Add Capital</h3>
                
                <div className="flex border-b mb-4">
                    <button onClick={() => setTab('New')} className={`flex-1 pb-2 border-b-2 font-bold ${tab === 'New' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>New Investment</button>
                    <button onClick={() => setTab('Refinance')} className={`flex-1 pb-2 border-b-2 font-bold ${tab === 'Refinance' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}>Refinance</button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Project</label>
                        <select value={selectedFundId} onChange={e => setSelectedFundId(e.target.value)} className="w-full p-2 border rounded bg-white">
                            <option value="">Select...</option>
                            {(tab === 'New' ? funds : investments).map((item: any) => (
                                <option key={item.id} value={tab === 'New' ? item.id : item.fundId}>
                                    {tab === 'New' ? item.name : `${item.fundName} (Current: ${item.amount})`}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Amount to Add (KES)</label>
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded" placeholder="50,000"/>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Interest Strategy</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                onClick={() => setStrategy('Monthly Payout')}
                                className={`p-2 border rounded text-sm ${strategy === 'Monthly Payout' ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold' : 'text-gray-600'}`}
                            >
                                Monthly Payout
                            </button>
                            <button 
                                onClick={() => setStrategy('Compound')}
                                className={`p-2 border rounded text-sm ${strategy === 'Compound' ? 'bg-blue-50 border-blue-500 text-blue-700 font-bold' : 'text-gray-600'}`}
                            >
                                Compound (Reinvest)
                            </button>
                        </div>
                    </div>

                    <button onClick={handleSubmit} className="w-full bg-green-600 text-white py-3 rounded-lg font-bold mt-4 shadow-md hover:bg-green-700">
                        Confirm Investment
                    </button>
                </div>
            </div>
        </div>
    );
};

const KpiCard: React.FC<{ title: string; value: string | number; subtext?: string; icon: string; color: string }> = ({ title, value, subtext, icon, color }) => (
    <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 flex justify-between items-start transition-transform hover:-translate-y-1" style={{ borderColor: color }}>
        <div>
            <p className="text-gray-500 text-sm font-medium">{title}</p>
            <p className="text-3xl font-bold text-gray-800 my-1">{typeof value === 'number' ? `KES ${value.toLocaleString()}` : value}</p>
            {subtext && <p className="text-xs text-gray-400">{subtext}</p>}
        </div>
        <div className="p-2 rounded-full bg-gray-50">
            <Icon name={icon} className="w-6 h-6 text-gray-400" />
        </div>
    </div>
);

const Chart: React.FC<{ type: 'line' | 'doughnut'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<any>(null);

    useEffect(() => {
        if (!canvasRef.current || !(window as any).Chart) return;
        if (chartRef.current) chartRef.current.destroy();

        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
            chartRef.current = new (window as any).Chart(ctx, {
                type,
                data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } },
                    ...options
                },
            });
        }
        return () => chartRef.current?.destroy();
    }, [type, data, options]);

    return <div className={`relative ${height}`}><canvas ref={canvasRef}></canvas></div>;
};

const InvestorDashboard: React.FC = () => {
    const { funds, investments, addInvestment, withdrawals, addWithdrawal } = useData();
    const [selectedProject, setSelectedProject] = useState<Fund | null>(null);
    const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
    const [isInvestOpen, setIsInvestOpen] = useState(false);

    // --- Calculated Metrics ---
    const totalInvestment = investments.reduce((sum, i) => sum + i.amount, 0);
    const activeCapital = investments.filter(i => i.status === 'Active').reduce((sum, i) => sum + i.amount, 0);
    
    // Mock accumulated withdrawals for the "Statement" view
    const interestWithdrawals = withdrawals.filter(w => w.type === 'Interest' && w.status === 'Paid').reduce((s, w) => s + w.amount, 0);
    const partialWithdrawals = withdrawals.filter(w => w.type !== 'Interest' && w.status === 'Paid').reduce((s, w) => s + w.amount, 0);
    
    // Mock Wallet Balance (Simulated)
    const walletBalance = 5000; 

    const handleNewInvestment = (invData: Partial<Investment>) => {
        const newInv: Investment = {
            ...invData,
            id: `inv-${Date.now()}`,
        } as Investment;
        addInvestment(newInv);
        setIsInvestOpen(false);
        alert("Investment successfully added!");
    };

    const handleNewWithdrawal = (req: WithdrawalRequest) => {
        addWithdrawal(req);
        setIsWithdrawOpen(false);
        alert("Withdrawal request submitted for approval.");
    };

    // Combined History
    const history = useMemo(() => {
        const invs = investments.map(i => ({ 
            id: i.id, 
            date: i.date, 
            desc: `Invested in ${i.fundName}`, 
            amount: i.amount, 
            type: 'Investment', 
            status: 'Completed' 
        }));
        const wds = withdrawals.map(w => ({ 
            id: w.id, 
            date: w.requestDate, 
            desc: `Withdrawal (${w.type})`, 
            amount: w.amount, 
            type: 'Withdrawal', 
            status: w.status 
        }));
        return [...invs, ...wds].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [investments, withdrawals]);

    const performanceData = {
        labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
        datasets: [{
            label: 'Portfolio Value (KES)',
            data: [100000, 102000, 155000, 158000, 210000, totalInvestment + walletBalance],
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.4
        }]
    };

    const allocationData = {
        labels: ['Active Capital', 'Cash Balance'],
        datasets: [{
            data: [activeCapital, walletBalance],
            backgroundColor: ['#3b82f6', '#e5e7eb'],
            borderWidth: 0
        }]
    };

    return (
        <div className="space-y-8 pb-12">
            {/* Header & Actions */}
            <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Investor Dashboard</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage your renovation fund portfolio.</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => window.location.hash = '#/renovation-fund/referrals'} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 shadow-sm transition-colors flex items-center">
                        <Icon name="communication" className="w-4 h-4 mr-2"/> Refer & Earn
                    </button>
                    <button onClick={() => setIsWithdrawOpen(true)} className="bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-lg font-bold hover:bg-gray-50 shadow-sm">
                        Withdraw
                    </button>
                    <button onClick={() => setIsInvestOpen(true)} className="bg-gray-900 text-white px-6 py-2 rounded-lg font-bold shadow-lg hover:bg-black transition-transform active:scale-95">
                        + Add Capital
                    </button>
                </div>
            </div>

            {/* Portfolio Statement / Balance Overview */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-gray-800 to-gray-900 p-6 text-white">
                    <h2 className="text-lg font-bold mb-4 opacity-90">Portfolio Statement</h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                        <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Investment</p>
                            <p className="text-2xl font-bold">KES {totalInvestment.toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Active Capital</p>
                            <p className="text-2xl font-bold text-blue-400">KES {activeCapital.toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Interest Paid</p>
                            <p className="text-2xl font-bold text-green-400">KES {interestWithdrawals.toLocaleString()}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Wallet Balance</p>
                            <p className="text-2xl font-bold">KES {walletBalance.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
                <div className="p-4 bg-gray-50 flex justify-between text-sm text-gray-600 border-t border-gray-200">
                    <span>Partial Withdrawals: <strong>KES {partialWithdrawals.toLocaleString()}</strong></span>
                    <span>Management Fees: <strong>KES 0</strong></span>
                    <span>Early Exit Penalties: <strong>KES 0</strong></span>
                </div>
            </div>
            
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Portfolio Growth</h3>
                    <Chart type="line" data={performanceData} />
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Asset Allocation</h3>
                    <div className="flex items-center justify-center">
                        <div className="w-full max-w-xs">
                            <Chart type="doughnut" data={allocationData} height="h-56" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Active Opportunities Grid */}
            <div>
                <h3 className="text-xl font-bold text-gray-800 mb-4">Active Opportunities</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {funds.filter(f => f.status === 'Active' || f.status === 'Closing Soon').map(fund => (
                        <div 
                            key={fund.id} 
                            className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md cursor-pointer transition-all group"
                            onClick={() => setSelectedProject(fund)}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded uppercase">{fund.status}</span>
                                <span className="text-xs text-gray-500 font-medium">{fund.riskProfile} Risk</span>
                            </div>
                            <h4 className="font-bold text-lg text-gray-900 group-hover:text-primary transition-colors">{fund.name}</h4>
                            <p className="text-sm text-gray-500 mb-4 line-clamp-2">{fund.description}</p>
                            
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Target APY</span>
                                    <span className="font-bold text-primary">{fund.targetApy}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Monthly Return</span>
                                    <span className="font-bold text-gray-800">{fund.clientInterestRate}%</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                                    <div className="bg-green-500 h-full rounded-full" style={{ width: `${Math.min(100, (fund.capitalRaised/fund.targetCapital)*100)}%` }}></div>
                                </div>
                                <div className="flex justify-between text-xs text-gray-400 mt-1">
                                    <span>Raised: KES {(fund.capitalRaised/1000000).toFixed(1)}M</span>
                                    <span>Goal: KES {(fund.targetCapital/1000000).toFixed(1)}M</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Transaction History */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Transaction History</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold">
                            <tr>
                                <th className="px-4 py-3 text-left">Date</th>
                                <th className="px-4 py-3 text-left">Transaction Code</th>
                                <th className="px-4 py-3 text-left">Description</th>
                                <th className="px-4 py-3 text-left">Type</th>
                                <th className="px-4 py-3 text-right">Amount</th>
                                <th className="px-4 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {history.map((tx, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-gray-600">{tx.date}</td>
                                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{tx.id}</td>
                                    <td className="px-4 py-3 font-medium text-gray-800">{tx.desc}</td>
                                    <td className="px-4 py-3 text-gray-500">{tx.type}</td>
                                    <td className={`px-4 py-3 text-right font-bold ${tx.type === 'Investment' ? 'text-blue-600' : 'text-gray-800'}`}>
                                        KES {tx.amount.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase ${
                                            tx.status === 'Completed' || tx.status === 'Active' || tx.status === 'Paid' 
                                            ? 'bg-green-100 text-green-800' 
                                            : 'bg-yellow-100 text-yellow-800'
                                        }`}>
                                            {tx.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {history.length === 0 && (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No transactions recorded.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            {selectedProject && (
                <ProjectDetailModal project={selectedProject} onClose={() => setSelectedProject(null)} />
            )}

            {isWithdrawOpen && (
                <WithdrawModal 
                    balance={walletBalance} // Mock wallet balance available for withdrawal
                    onClose={() => setIsWithdrawOpen(false)}
                    onSubmit={handleNewWithdrawal}
                />
            )}

            {isInvestOpen && (
                <AddCapitalModal 
                    funds={funds}
                    investments={investments}
                    onClose={() => setIsInvestOpen(false)}
                    onSubmit={handleNewInvestment}
                />
            )}
        </div>
    );
};

export default InvestorDashboard;