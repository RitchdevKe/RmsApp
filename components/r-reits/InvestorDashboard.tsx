// @ts-nocheck

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { Fund, Investment, WithdrawalRequest, RFTransaction } from '../../types';
import Icon from '../Icon';
import { ProjectDetailModal } from './InvestmentPlans'; 
import { getTodayIsoDate } from '../../utils/timezone';

// ... [Keep other imports and component definitions] ...

// Since I cannot output "partial file" easily with the provided format without potentially breaking context if not careful,
// I will output the FULL content of InvestorDashboard.tsx with the single line change applied.
// The specific change is in the JSX of InvestorDashboard component:
// <button onClick={() => window.location.hash = '#/r-reits/referrals'} ...

// ... [Previous code for OtpModal, WithdrawModal, AddCapitalModal, KpiCard, Chart, KpiDetailModal] ...

// --- Reusable Components ---

const OtpModal: React.FC<{ onClose: () => void; onSuccess: () => void; action: string }> = ({ onClose, onSuccess, action }) => {
    const [otp, setOtp] = useState('');
    const [error, setError] = useState('');
    
    const handleVerify = () => {
        setError('');
        if (otp === '1234') { // Mock OTP
            onSuccess();
        } else {
            setError('Invalid OTP code. Please use default code: 1234.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1500] backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
                <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <Icon name="communication" className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Verify Identity</h3>
                <p className="text-sm text-gray-500 mb-4">To {action}, please enter the code sent to your phone.</p>
                
                {error && (
                    <div className="text-red-600 bg-red-50 text-xs p-2.5 rounded-lg border border-red-100 mb-4 font-medium">
                        {error}
                    </div>
                )}

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
    const [error, setError] = useState('');

    // Logic
    const today = new Date();
    const canWithdrawInterest = today.getDate() >= 5; 
    const isCapitalWithdrawal = type === 'Capital' || type === 'Partial Capital';
    const fee = isCapitalWithdrawal ? parseFloat(amount || '0') * 0.10 : 0;
    
    const handleNext = () => {
        setError('');
        if (!amount) {
            setError('Please enter an amount.');
            return;
        }
        const val = parseFloat(amount);
        if (val > balance) {
            setError('Insufficient funds. Your wallet balance is ' + balance.toLocaleString() + ' KES.');
            return;
        }
        
        if (type === 'Interest' && !canWithdrawInterest) {
            setError("Interest withdrawals are only available from the 5th of the month.");
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
                    {error && (
                        <div className="text-red-600 bg-red-50 text-sm p-3 rounded-lg border border-red-100 mb-4 font-medium flex items-center gap-2">
                            <span className="font-bold">⚠️</span> {error}
                        </div>
                    )}

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
    initialFundId?: string;
    onClose: () => void;
    onSubmit: (inv: Partial<Investment>) => void;
}> = ({ funds, investments, initialFundId, onClose, onSubmit }) => {
    const [step, setStep] = useState<'details' | 'payment'>('details');
    const [tab, setTab] = useState<'New' | 'Refinance'>('New');
    const [selectedFundId, setSelectedFundId] = useState(initialFundId || '');
    const [amount, setAmount] = useState('');
    const [strategy, setStrategy] = useState<'Monthly Payout' | 'Compound'>('Monthly Payout');
    const [duration, setDuration] = useState(24);
    const [error, setError] = useState('');
    
    // Payment State
    const [paymentMethod, setPaymentMethod] = useState<'Mpesa' | 'Bank' | 'Sacco'>('Mpesa');
    const [phone, setPhone] = useState('');
    const [processing, setProcessing] = useState(false);

    // M-Pesa specific state
    const [mpesaStep, setMpesaStep] = useState<'input' | 'processing' | 'success'>('input');
    const [txCode, setTxCode] = useState('');

    // Logic to filter funds
    const investedFundIds = new Set(investments.map(i => i.fundId));
    
    const newOpportunities = funds.filter(f => !investedFundIds.has(f.id) && f.status !== 'Project Completed' && f.status !== 'Fully Funded');
    const existingOpportunities = funds.filter(f => investedFundIds.has(f.id) && f.status !== 'Project Completed');

    useEffect(() => {
        // If initialFundId is provided, set the correct tab
        if (initialFundId) {
            if (investedFundIds.has(initialFundId)) {
                setTab('Refinance');
            } else {
                setTab('New');
            }
            setSelectedFundId(initialFundId);
        }
    }, [initialFundId]);

    const getRatePreview = () => {
        if (duration >= 24) return '30% APY (2.5% Monthly)';
        if (duration >= 18) return '26.4% APY (2.2% Monthly)';
        if (duration >= 12) return '24% APY (2.0% Monthly)';
        return '18% APY (1.5% Monthly)';
    };

    const handleDetailsSubmit = () => {
        setError('');
        if (!selectedFundId || !amount) {
            setError("Please fill out all fields. Select a project and input an amount.");
            return;
        }
        setStep('payment');
        setPhone('0712345678'); // A valid default Kenyan mobile number
    };

    const handleMpesaPay = () => {
        setError('');
        if (!/^(2547|07|2541|01)\d{8}$/.test(phone.replace(/\s/g, ''))) {
            setError('Please enter a valid Kenyan mobile number (e.g., 0712345678 or 0112345678).');
            return;
        }
        setMpesaStep('processing');
        setTimeout(() => {
            setTxCode(`LGR${Date.now().toString().slice(-10)}QT`);
            setMpesaStep('success');
        }, 3000);
    };

    const handleFinalSubmit = () => {
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

    const handleOtherPayment = () => {
        setProcessing(true);
        setTimeout(() => {
            setProcessing(false);
            handleFinalSubmit();
        }, 2000);
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1400] p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                <style>{`
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    @keyframes bounce { 0%, 80%, 100% { transform: scale(0); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
                    
                    .mpesa-header { display: flex; align-items: center; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 2px solid #e8f5e9; }
                    .mpesa-icon-box { width: 50px; height: 50px; background: #1F9F21; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-right: 15px; box-shadow: 0 4px 10px rgba(31, 159, 33, 0.3); }
                    .mpesa-title { font-size: 22px; font-weight: 700; color: #1a365d; }
                    .mpesa-input-group { margin-bottom: 25px; }
                    .mpesa-label { display: block; margin-bottom: 8px; font-weight: 600; color: #2d3748; font-size: 15px; }
                    .mpesa-input { width: 100%; padding: 14px; border: 2px solid #c8e6c9; border-radius: 12px; font-size: 16px; transition: all 0.3s; }
                    .mpesa-input:focus { outline: none; border-color: #1F9F21; box-shadow: 0 0 0 3px rgba(31, 159, 33, 0.2); }
                    .mpesa-btn { background: linear-gradient(to right, #1F9F21, #177D1A); color: white; border: none; padding: 14px 20px; width: 100%; border-radius: 12px; font-size: 17px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(31, 159, 33, 0.4); position: relative; overflow: hidden; }
                    .mpesa-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(31, 159, 33, 0.6); }
                    .mpesa-spinner { width: 60px; height: 60px; border: 5px solid rgba(31, 159, 33, 0.2); border-top: 5px solid #1F9F21; border-radius: 50%; margin: 0 auto 25px; animation: spin 1s linear infinite; }
                    .mpesa-success-msg { background: #e8f5e9; border-left: 4px solid #1F9F21; padding: 20px; border-radius: 0 12px 12px 0; margin: 25px 0; font-size: 18px; color: #1b5e20; font-weight: 600; border: 1px solid #c8e6c9; }
                    .mpesa-tx-code { background: #f1fdf1; padding: 15px; border-radius: 10px; font-family: monospace; font-size: 18px; letter-spacing: 1px; margin-top: 20px; color: #177D1A; font-weight: 700; border: 1px dashed #1F9F21; text-align: center; }
                    .mpesa-logo { position: absolute; top: 20px; right: 20px; font-weight: 800; font-size: 24px; color: #1F9F21; text-shadow: 0 2px 4px rgba(31, 159, 33, 0.2); }
                    .mpesa-logo span { color: #177D1A; }
                    .loading-dots span { display: inline-block; width: 8px; height: 8px; background-color: #1F9F21; border-radius: 50%; animation: bounce 1.4s ease-in-out infinite both; }
                    .loading-dots span:nth-child(1) { animation-delay: 0s; }
                    .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
                    .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
                `}</style>
                
                {step !== 'payment' || paymentMethod !== 'Mpesa' ? (
                    <div className="p-6 bg-gray-50 border-b flex justify-between items-center">
                        <h3 className="text-xl font-bold text-gray-800">Add Capital</h3>
                        <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                    </div>
                ) : null}
                
                <div className="p-6">
                    {error && (
                        <div className="text-red-600 bg-red-50 text-sm p-3 rounded-lg border border-red-100 mb-4 font-medium flex items-center gap-2">
                            <span className="font-bold">⚠️</span> {error}
                        </div>
                    )}
                    {step === 'details' && (
                        <div className="space-y-5">
                            <div className="flex border-b mb-4">
                                <button 
                                    onClick={() => { setTab('New'); setSelectedFundId(''); }} 
                                    className={`flex-1 pb-3 border-b-2 font-bold transition-colors ${tab === 'New' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                >
                                    New Project
                                </button>
                                <button 
                                    onClick={() => { setTab('Refinance'); setSelectedFundId(''); }} 
                                    className={`flex-1 pb-3 border-b-2 font-bold transition-colors ${tab === 'Refinance' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                                >
                                    Top Up Existing
                                </button>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Select Project</label>
                                <select value={selectedFundId} onChange={e => setSelectedFundId(e.target.value)} className="w-full p-3 border rounded-lg bg-white">
                                    <option value="">-- Select --</option>
                                    {(tab === 'New' ? newOpportunities : existingOpportunities).map((item: any) => (
                                        <option key={item.id} value={tab === 'New' ? item.id : item.fundId}>
                                            {tab === 'New' ? item.name : `${item.fundName} (Current: ${item.amount})`}
                                        </option>
                                    ))}
                                </select>
                                {tab === 'New' && newOpportunities.length === 0 && <p className="text-xs text-red-500 mt-1">No new active projects available.</p>}
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES)</label>
                                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-3 border rounded-lg font-bold" placeholder="50,000"/>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                                    <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full p-3 border rounded-lg bg-white">
                                        <option value={6}>6 Months</option>
                                        <option value={12}>12 Months</option>
                                        <option value={18}>18 Months</option>
                                        <option value={24}>24 Months+</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Payout</label>
                                    <select value={strategy} onChange={e => setStrategy(e.target.value as any)} className="w-full p-3 border rounded-lg bg-white">
                                        <option value="Monthly Payout">Monthly</option>
                                        <option value="Compound">Compound</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div className="bg-green-50 p-3 rounded-lg border border-green-100 text-center">
                                <span className="text-xs text-green-600 font-bold uppercase tracking-wide">Projected Return</span>
                                <p className="text-lg font-bold text-green-800">{getRatePreview()}</p>
                            </div>

                            <button onClick={handleDetailsSubmit} className="w-full bg-primary text-white py-3 rounded-lg font-bold shadow-md hover:bg-primary-dark">
                                Proceed to Payment
                            </button>
                        </div>
                    )}

                    {step === 'payment' && (
                        <div className="space-y-6">
                            <div className="flex gap-2 justify-center mb-6">
                                <button 
                                    onClick={() => setPaymentMethod('Mpesa')} 
                                    className={`px-4 py-2 rounded-lg border font-semibold text-sm transition-all ${paymentMethod === 'Mpesa' ? 'bg-green-50 border-green-500 text-green-700 shadow-sm' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    M-Pesa
                                </button>
                                <button 
                                    onClick={() => setPaymentMethod('Bank')} 
                                    className={`px-4 py-2 rounded-lg border font-semibold text-sm transition-all ${paymentMethod === 'Bank' ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Bank Transfer
                                </button>
                                <button 
                                    onClick={() => setPaymentMethod('Sacco')} 
                                    className={`px-4 py-2 rounded-lg border font-semibold text-sm transition-all ${paymentMethod === 'Sacco' ? 'bg-purple-50 border-purple-500 text-purple-700 shadow-sm' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    Sacco
                                </button>
                            </div>

                            {paymentMethod === 'Mpesa' && (
                                <div className="relative">
                                    <div className="mpesa-logo">M<span>p</span>esa</div>

                                    {mpesaStep === 'input' && (
                                        <>
                                            <div className="mpesa-header">
                                                <div className="mpesa-icon-box">
                                                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 16V8C20.9998 6.89543 20.5611 5.8362 19.7804 5.05508C18.9997 4.27396 17.9408 3.83526 16.836 3.835H7.164C6.05925 3.83526 4.99999 4.27396 4.21922 5.05508C3.43845 5.8362 2.99975 6.89543 3 8V16C3.00026 17.1046 3.439 18.1641 4.22005 18.9453C5.00111 19.7266 6.06048 20.1654 7.165 20.166H16.836C17.9405 20.1654 19.0002 19.7266 19.7813 18.9453C20.5623 18.1641 21.001 17.1046 21 16Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M7.5 12H16.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M7.5 15H12" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                </div>
                                                <h2 className="mpesa-title">Initiate STK Push</h2>
                                            </div>
                                            <p className="text-sm text-gray-500 mb-6 -mt-4">Invest KES {Number(amount).toLocaleString()}</p>

                                            <div className="mpesa-input-group">
                                                <label className="mpesa-label">Mobile Number</label>
                                                <input 
                                                    type="tel" 
                                                    value={phone} 
                                                    onChange={e => setPhone(e.target.value)} 
                                                    className="mpesa-input"
                                                    placeholder="2547XXXXXXXX"
                                                />
                                            </div>
                                            <div className="mpesa-input-group">
                                                <label className="mpesa-label">Amount (Fixed)</label>
                                                <input 
                                                    type="text" 
                                                    value={`KES ${Number(amount).toLocaleString()}`} 
                                                    disabled
                                                    className="mpesa-input bg-gray-50 text-gray-500"
                                                />
                                            </div>
                                            <button onClick={handleMpesaPay} className="mpesa-btn">Send STK Push</button>
                                        </>
                                    )}

                                    {(mpesaStep === 'processing' || mpesaStep === 'success') && (
                                        <div className="text-center pt-4">
                                            <div className="mpesa-header" style={{ justifyContent: 'center', borderBottom: 'none' }}>
                                                <div className="mpesa-icon-box">
                                                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M8 12L10.5 14.5L16 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                                </div>
                                                <h2 className="mpesa-title">Payment Confirmation</h2>
                                            </div>

                                            {mpesaStep === 'processing' && (
                                                <div className="py-6">
                                                    <div className="mpesa-spinner"></div>
                                                    <p className="text-xl font-semibold text-[#1a365d] mb-2">Sending Request...</p>
                                                    <p className="text-[#4a904a] font-medium">Please check your phone</p>
                                                    <div className="loading-dots flex justify-center gap-1.5 mt-6">
                                                        <span></span><span></span><span></span>
                                                    </div>
                                                </div>
                                            )}

                                            {mpesaStep === 'success' && (
                                                <div>
                                                    <div className="mpesa-success-msg">
                                                        Investment Confirmed!
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-[#4caf50] font-medium mb-1">Time:</p>
                                                        <p className="text-[#2d3748] font-medium mb-4">{new Date().toLocaleString()}</p>
                                                        <div className="mpesa-tx-code">
                                                            {txCode}
                                                        </div>
                                                    </div>
                                                    <button onClick={handleFinalSubmit} className="mpesa-btn mt-8">Finish</button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {(paymentMethod === 'Bank' || paymentMethod === 'Sacco') && (
                                <div className="space-y-4">
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm space-y-2">
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Bank Name</span>
                                            <span className="font-bold text-gray-800">{paymentMethod === 'Bank' ? 'KCB Bank' : 'TaskMe Sacco'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Account Name</span>
                                            <span className="font-bold text-gray-800">TaskMe Trust Account</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">Account No</span>
                                            <span className="font-bold text-gray-800 font-mono">1234 5678 9000</span>
                                        </div>
                                        {paymentMethod === 'Sacco' && (
                                             <div className="flex justify-between">
                                                <span className="text-gray-500">Paybill</span>
                                                <span className="font-bold text-gray-800 font-mono">123456</span>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Upload Payment Slip</label>
                                        <input type="file" className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
                                    </div>
                                    <button 
                                        onClick={handleOtherPayment}
                                        disabled={processing}
                                        className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary-dark flex items-center justify-center"
                                    >
                                        {processing ? 'Verifying...' : 'Confirm Payment'}
                                    </button>
                                </div>
                            )}
                            
                            {paymentMethod !== 'Mpesa' && (
                                <button onClick={() => setStep('details')} className="text-sm text-gray-400 hover:underline w-full text-center mt-4">Back to Details</button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const KpiCard: React.FC<{ title: string; value: string | number; subtext?: string; icon: string; color: string; onClick?: () => void }> = ({ title, value, subtext, icon, color, onClick }) => (
    <div 
        onClick={onClick}
        className={`bg-white p-5 rounded-xl shadow-sm border-l-4 flex justify-between items-start transition-all duration-300 ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-1' : ''}`} 
        style={{ borderColor: color }}
    >
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

const Chart: React.FC<{ type: 'line' | 'bar' | 'doughnut'; data: any; options?: any; height?: string }> = ({ type, data, options, height = 'h-64' }) => {
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

// --- Detail Modal for KPIs ---
type KpiType = 'portfolio' | 'earnings' | 'payout' | 'referral';

const KpiDetailModal: React.FC<{ 
    type: KpiType; 
    data: any; 
    onClose: () => void 
}> = ({ type, data, onClose }) => {
    const { investments, rfTransactions, funds, referralNetworkRows = [] } = data;

    const earningsByMonth = useMemo(() => {
        const now = new Date();
        const labels: string[] = [];
        const amounts: number[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(d.toLocaleString('default', { month: 'short' }));
            const y = d.getFullYear();
            const m = d.getMonth();
            const sum = (rfTransactions || [])
                .filter((t: RFTransaction) => {
                    if (t.type !== 'Interest Payout' && t.type !== 'Referral Commission') return false;
                    const td = new Date(t.date);
                    return !isNaN(td.getTime()) && td.getFullYear() === y && td.getMonth() === m;
                })
                .reduce((s: number, t: RFTransaction) => s + (t.amount || 0), 0);
            amounts.push(sum);
        }
        return { labels, amounts };
    }, [rfTransactions]);

    const getTitle = () => {
        switch(type) {
            case 'portfolio': return 'Portfolio Breakdown';
            case 'earnings': return 'Earnings History';
            case 'payout': return 'Pending Payout Schedule';
            case 'referral': return 'Referral Network';
            default: return 'Details';
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[1500] p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-gray-800">{getTitle()}</h2>
                    <button onClick={onClose} className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-100"><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
                
                <div className="flex-grow overflow-y-auto p-8 bg-gray-50/30">
                    
                    {type === 'portfolio' && (
                        <div className="space-y-8">
                             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-4">Asset Allocation</h3>
                                <div className="h-64">
                                    <Chart 
                                        type="doughnut" 
                                        data={{
                                            labels: investments.map((i: any) => i.fundName),
                                            datasets: [{
                                                data: investments.map((i: any) => i.amount),
                                                backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']
                                            }]
                                        }} 
                                        height="h-64"
                                        options={{ maintainAspectRatio: false, cutout: '60%' }}
                                    />
                                </div>
                             </div>

                             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-4">Active Investments</h3>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                                            <tr>
                                                <th className="px-4 py-3">Fund Name</th>
                                                <th className="px-4 py-3">Date Invested</th>
                                                <th className="px-4 py-3 text-right">Amount</th>
                                                <th className="px-4 py-3 text-right">Strategy</th>
                                                <th className="px-4 py-3 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {investments.map((inv: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 font-medium text-gray-900">{inv.fundName}</td>
                                                    <td className="px-4 py-3 text-gray-500">{inv.date}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-gray-800">KES {inv.amount.toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-right text-gray-600">{inv.strategy}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className="px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-bold">{inv.status}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                             </div>
                        </div>
                    )}

                    {type === 'earnings' && (
                        <div className="space-y-8">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-4">Monthly Earnings Trend</h3>
                                <div className="h-64">
                                     <Chart 
                                        type="bar" 
                                        data={{
                                            labels: earningsByMonth.labels,
                                            datasets: [{
                                                label: 'Earnings (KES)',
                                                data: earningsByMonth.amounts,
                                                backgroundColor: '#3b82f6',
                                                borderRadius: 4
                                            }]
                                        }} 
                                        height="h-64"
                                    />
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-4">Payout History</h3>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                                            <tr>
                                                <th className="px-4 py-3">Date</th>
                                                <th className="px-4 py-3">Type</th>
                                                <th className="px-4 py-3">Description</th>
                                                <th className="px-4 py-3 text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {rfTransactions.filter((t: any) => t.type === 'Interest Payout' || t.type === 'Referral Commission').map((tx: any, idx: number) => (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 text-gray-600">{tx.date}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold ${tx.type === 'Interest Payout' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                                                            {tx.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-800">{tx.description || tx.partyName}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-green-600">+ KES {tx.amount.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                            {rfTransactions.filter((t: any) => t.type === 'Interest Payout' || t.type === 'Referral Commission').length === 0 && (
                                                <tr><td colSpan={4} className="p-4 text-center text-gray-400">No earnings recorded yet.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {type === 'payout' && (
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                             <h3 className="text-lg font-bold text-gray-800 mb-4">Projected Payouts (This Month)</h3>
                             <div className="space-y-4">
                                {investments.filter((i: any) => i.status === 'Active').map((inv: any, idx: number) => {
                                    const fund = (funds || []).find((f: Fund) => f.id === inv.fundId);
                                    const m = parseMonthlyRateFromFund(fund);
                                    const monthlyReturn = inv.amount * m;
                                    return (
                                        <div key={idx} className="flex justify-between items-center p-4 border rounded-lg hover:shadow-sm transition-shadow">
                                            <div>
                                                <p className="font-bold text-gray-800">{inv.fundName}</p>
                                                <p className="text-xs text-gray-500">Capital: KES {inv.amount.toLocaleString()} • Rate: {(m * 100).toFixed(2)}% / mo (from fund target)</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-extrabold text-lg text-green-600">KES {monthlyReturn.toLocaleString()}</p>
                                                <p className="text-xs text-gray-400">Due: 15th</p>
                                            </div>
                                        </div>
                                    );
                                })}
                                {investments.length === 0 && <p className="text-center text-gray-400 py-4">No active investments to generate payouts.</p>}
                             </div>
                             
                             <div className="mt-8 p-4 bg-yellow-50 rounded-lg border border-yellow-100 text-sm text-yellow-800">
                                 <strong>Note:</strong> Payouts are processed on the 15th of every month. Ensure your M-Pesa or Bank details are up to date in Settings.
                             </div>
                        </div>
                    )}

                    {type === 'referral' && (
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800">Referral Program</h3>
                                    <p className="text-sm text-gray-500">Earn 2.5% commission on every investment made by your referrals.</p>
                                </div>
                                <button onClick={() => {
                                    const isPartial = window.location.hash.includes('/partial-rms') || window.location.pathname.includes('/partial-rms');
                                    window.location.hash = isPartial ? '#/partial-rms/user-app-portal/refer-earn' : '#/user-app-portal/refer-earn';
                                }} className="px-4 py-2 bg-primary text-white font-bold rounded-lg shadow hover:bg-primary-dark">
                                    Go to Referral Center
                                </button>
                            </div>

                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-4">Your Network</h3>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm text-left">
                                        <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold">
                                            <tr>
                                                <th className="px-4 py-3">Name</th>
                                                <th className="px-4 py-3 text-right">Active Balance</th>
                                                <th className="px-4 py-3 text-right">Commission (MTD)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {referralNetworkRows.map((ref: { name: string; activeBalance: number; monthlyCommission: number }, idx: number) => (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 font-medium text-gray-900">{ref.name}</td>
                                                    <td className="px-4 py-3 text-right text-gray-600">KES {ref.activeBalance.toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-green-600">KES {ref.monthlyCommission.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                            {referralNetworkRows.length === 0 && (
                                                <tr><td colSpan={3} className="p-4 text-center text-gray-400">No referred investors in network yet.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

function parseMonthlyRateFromFund(fund: Fund | undefined): number {
    if (!fund?.targetApy) return 0.025;
    const match = fund.targetApy.match(/(\d+(\.\d+)?)/);
    if (!match) return 0.025;
    const apy = parseFloat(match[0]) / 100;
    return apy / 12;
}

const InvestorDashboard: React.FC = () => {
    const { funds, investments, addInvestment, withdrawals, addWithdrawal, rfTransactions, updateFund, renovationInvestors } = useData();
    const [selectedProject, setSelectedProject] = useState<Fund | null>(null);
    const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
    const [isInvestOpen, setIsInvestOpen] = useState(false);
    const [successNotification, setSuccessNotification] = useState<string | null>(null);
    
    // Auto clear notifications
    useEffect(() => {
        if (successNotification) {
            const timer = setTimeout(() => setSuccessNotification(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [successNotification]);
    
    // Modal State
    const [activeKpiModal, setActiveKpiModal] = useState<KpiType | null>(null);
    
    // Add Capital Modal Pre-selection
    const [addCapitalFundId, setAddCapitalFundId] = useState<string | undefined>(undefined);

    // --- Tier Rate Calculation Helper ---
    const getTierRates = (months: number) => {
        if (months >= 24) return { apy: '30%', monthly: '2.5%' };
        if (months >= 18) return { apy: '26.4%', monthly: '2.2%' };
        if (months >= 12) return { apy: '24%', monthly: '2.0%' };
        return { apy: '18%', monthly: '1.5%' }; // Default for 6 months
    };

    // --- Calculated Metrics ---
    const totalInvestment = investments.reduce((sum, i) => sum + i.amount, 0);
    const activeCapital = investments.filter(i => i.status === 'Active').reduce((sum, i) => sum + i.amount, 0);

    // Restrict R-Reits transactions to investor activity only. Tenant referral
    // commissions are paid through the same RF ledger but belong to the
    // tenants module, not R-Reits, so we exclude any Referral Commission
    // whose payee isn't a renovation-fund investor.
    const investorNames = useMemo(
        () => new Set((renovationInvestors || []).map(i => String(i.name || '').trim().toLowerCase())),
        [renovationInvestors]
    );
    const investorRfTransactions = useMemo(() => rfTransactions.filter(t => {
        if (t.type !== 'Referral Commission') return true;
        const name = String(t.partyName || '').trim().toLowerCase();
        return name && investorNames.has(name);
    }), [rfTransactions, investorNames]);

    // Mock accumulated withdrawals for the "Statement" view
    const interestWithdrawals = withdrawals.filter(w => w.type === 'Interest' && w.status === 'Paid').reduce((s, w) => s + w.amount, 0);
    const partialWithdrawals = withdrawals.filter(w => w.type !== 'Interest' && w.status === 'Paid').reduce((s, w) => s + w.amount, 0);

    const totalEarnings = interestWithdrawals + investorRfTransactions.filter(t => t.type === 'Interest Payout' || t.type === 'Referral Commission').reduce((s, t) => s + t.amount, 0);

    // Pending Payout Estimation
    const pendingPayout = investments.filter(i => i.status === 'Active').reduce((sum, i) => {
        const fund = funds.find(f => f.id === i.fundId);
        const m = parseMonthlyRateFromFund(fund);
        return sum + i.amount * m;
    }, 0);

    const referralEarnings = investorRfTransactions
        .filter(t => t.type === 'Referral Commission' && t.status === 'Completed')
        .reduce((s, t) => s + (t.amount || 0), 0);

    const walletBalance = investments.reduce((s, i) => s + (i.accruedInterest || 0), 0);

    const holdings = useMemo(() => {
        return investments
            .filter(i => i.status === 'Active')
            .map(inv => {
                const fund = funds.find(f => f.id === inv.fundId);
                const monthly = parseMonthlyRateFromFund(fund);
                const invested = inv.amount;
                const currentVal = invested + (inv.accruedInterest || 0) + invested * monthly;
                const monthsHeld = (() => {
                    const d = new Date(inv.date);
                    if (isNaN(d.getTime())) return 12;
                    const diff = (Date.now() - d.getTime()) / (86400000 * 30);
                    return Math.max(6, Math.min(24, Math.round(diff) || 12));
                })();
                return { name: inv.fundName, invested, currentVal, duration: monthsHeld };
            });
    }, [investments, funds]);

    const portfolioReturnPct = useMemo(() => {
        const cost = holdings.reduce((s, h) => s + h.invested, 0);
        const val = holdings.reduce((s, h) => s + h.currentVal, 0);
        if (cost <= 0) return 0;
        return ((val - cost) / cost) * 100;
    }, [holdings]);

    const referralNetworkRows = useMemo(() => {
        return (renovationInvestors || [])
            .filter(i => !!i.referrerId)
            .map(referee => {
                const activeBalance = investments
                    .filter(inv => inv.investorId === referee.id && inv.status === 'Active')
                    .reduce((s, inv) => s + inv.amount, 0);
                const now = new Date();
                const monthlyCommission = rfTransactions
                    .filter(t => {
                        if (t.type !== 'Referral Commission' || t.status !== 'Completed') return false;
                        const d = new Date(t.date);
                        if (isNaN(d.getTime()) || d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
                        const blob = `${t.description || ''} ${t.partyName || ''}`.toLowerCase();
                        const token = String(referee.name || '').toLowerCase().split(/\s+/)[0];
                        return token ? blob.includes(token) : false;
                    })
                    .reduce((s, t) => s + (t.amount || 0), 0);
                return { name: referee.name, activeBalance, monthlyCommission };
            });
    }, [renovationInvestors, investments, rfTransactions]);

    const performanceData = useMemo(() => {
        const now = new Date();
        const labels: string[] = [];
        const data: number[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(d.toLocaleString('default', { month: 'short' }));
            const cutoffEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
            let invTotal = 0;
            let accrued = 0;
            investments.forEach(inv => {
                const id = new Date(inv.date);
                if (!isNaN(id.getTime()) && id <= cutoffEnd) {
                    invTotal += inv.amount;
                    accrued += inv.accruedInterest || 0;
                }
            });
            data.push(invTotal + accrued);
        }
        if (data.every(v => v === 0) && totalInvestment > 0) {
            data[data.length - 1] = totalInvestment + walletBalance;
        }
        return {
            labels,
            datasets: [{
                label: 'Portfolio Value (KES)',
                data,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4
            }]
        };
    }, [investments, totalInvestment, walletBalance]);

    const allocationData = useMemo(() => ({
        labels: ['Active Capital', 'Accrued / Wallet'],
        datasets: [{
            data: [activeCapital, Math.max(0, walletBalance)],
            backgroundColor: ['#3b82f6', '#e5e7eb'],
            borderWidth: 0
        }]
    }), [activeCapital, walletBalance]);

    const handleNewInvestment = (invData: Partial<Investment>) => {
        const newInv: Investment = {
            ...invData,
            id: `inv-${Date.now()}`,
        } as Investment;
        
        // 1. Add to Investor Portfolio
        addInvestment(newInv);

        // 2. Update Project Capital & Investors (Smart Sync)
        if (newInv.fundId && newInv.amount) {
            const targetFund = funds.find(f => f.id === newInv.fundId);
            if (targetFund) {
                const newCapital = targetFund.capitalRaised + newInv.amount;
                // Simple logic: increment investor count. In real app, check if user already invested.
                const newInvestors = targetFund.investors + 1; 
                const newStatus = newCapital >= targetFund.targetCapital ? 'Fully Funded' : targetFund.status;

                updateFund(targetFund.id, {
                    capitalRaised: newCapital,
                    investors: newInvestors,
                    status: newStatus
                });
            }
        }

        setIsInvestOpen(false);
        setAddCapitalFundId(undefined);
        setSuccessNotification("Investment successfully added! Your portfolio and the project's funding progress have been updated.");
    };
    
    const handleInvestNowClick = (fund: Fund) => {
        setAddCapitalFundId(fund.id);
        setIsInvestOpen(true);
    };

    const handleNewWithdrawal = (req: WithdrawalRequest) => {
        addWithdrawal(req);
        setIsWithdrawOpen(false);
        setSuccessNotification("Withdrawal request submitted for approval.");
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

    return (
        <div className="space-y-8 pb-12">
            {/* Header & Actions */}
            <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Investor Dashboard</h1>
                    <p className="text-lg text-gray-500 mt-1">Manage your renovation fund portfolio.</p>
                </div>
                <div className="flex gap-3">
                    <button onClick={() => {
                        const isPartial = window.location.hash.includes('/partial-rms') || window.location.pathname.includes('/partial-rms');
                        window.location.hash = isPartial ? '#/partial-rms/user-app-portal/refer-earn' : '#/user-app-portal/refer-earn';
                    }} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 shadow-sm transition-colors flex items-center">
                        <Icon name="communication" className="w-4 h-4 mr-2"/> Refer & Earn
                    </button>
                    <button onClick={() => setIsWithdrawOpen(true)} className="bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-lg font-bold hover:bg-gray-50 shadow-sm">
                        Withdraw
                    </button>
                    <button onClick={() => { setAddCapitalFundId(undefined); setIsInvestOpen(true); }} className="bg-gray-900 text-white px-6 py-2 rounded-lg font-bold shadow-lg hover:bg-black transition-transform active:scale-95">
                        + Add Capital
                    </button>
                </div>
            </div>

            {/* KPI Grid (Interactive) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard 
                    title="Total Portfolio Value" 
                    value={totalInvestment + walletBalance} 
                    subtext={`${portfolioReturnPct >= 0 ? '+' : ''}${portfolioReturnPct.toFixed(1)}% modelled return on holdings`} 
                    icon="reits" 
                    color="#10b981"
                    onClick={() => setActiveKpiModal('portfolio')}
                />
                <KpiCard 
                    title="Total Earnings" 
                    value={totalEarnings} 
                    subtext="Interest & Dividends Paid" 
                    icon="revenue" 
                    color="#3b82f6"
                    onClick={() => setActiveKpiModal('earnings')}
                />
                <KpiCard 
                    title="Pending Payout" 
                    value={pendingPayout} 
                    subtext={`Expected on 15th`} 
                    icon="payments" 
                    color="#f59e0b"
                    onClick={() => setActiveKpiModal('payout')}
                />
                <KpiCard 
                    title="Referral Earnings" 
                    value={referralEarnings} 
                    subtext="Commissions Earned" 
                    icon="hr" 
                    color="#8b5cf6"
                    onClick={() => setActiveKpiModal('referral')}
                />
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
                            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Accrued on book</p>
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
                            className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md cursor-pointer transition-all group flex flex-col h-full"
                            onClick={() => setSelectedProject(fund)}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded uppercase">{fund.status}</span>
                                <span className="text-xs text-gray-500 font-medium">{fund.riskProfile} Risk</span>
                            </div>
                            <h4 className="font-bold text-lg text-gray-900 group-hover:text-primary transition-colors">{fund.name}</h4>
                            <p className="text-sm text-gray-500 mb-4 line-clamp-2 flex-grow">{fund.description}</p>
                            
                            <div className="space-y-2 mb-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Target APY</span>
                                    <span className="font-bold text-primary">Up to 30%</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">Monthly Return</span>
                                    <span className="font-bold text-gray-800">Up to 2.5%</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                                    <div className="bg-green-500 h-full rounded-full" style={{ width: `${Math.min(100, (fund.capitalRaised/fund.targetCapital)*100)}%` }}></div>
                                </div>
                                <div className="flex justify-between text-xs text-gray-400 mt-1">
                                    <span>Raised: KES {(fund.capitalRaised/1000000).toFixed(1)}M</span>
                                    <span>Goal: KES {(fund.targetCapital/1000000).toFixed(1)}M</span>
                                </div>
                            </div>
                            
                            {fund.status !== 'Project Completed' && fund.status !== 'Fully Funded' && (
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleInvestNowClick(fund); }}
                                    className="w-full py-2 bg-gray-900 text-white font-bold rounded-lg shadow hover:bg-black transition-colors mt-auto"
                                >
                                    Invest Now
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Current Holdings with Tier Rates */}
            <div className="bg-white p-6 rounded-xl shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Current Holdings</h3>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fund Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Invested Capital</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Current Value</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">APY</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monthly Return</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {holdings.length === 0 && (
                                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No active holdings yet.</td></tr>
                            )}
                            {holdings.map((h, i) => {
                                const rates = getTierRates(h.duration);
                                return (
                                    <tr key={i} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">{h.name}</td>
                                        <td className="px-6 py-4 text-gray-600">{h.duration} Months</td>
                                        <td className="px-6 py-4 text-right text-gray-600">KES {h.invested.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-right font-bold text-gray-900">KES {h.currentVal.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-right text-blue-600 font-bold">{rates.apy}%</td>
                                        <td className="px-6 py-4 text-right text-green-600 font-bold">{rates.monthly}%</td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="text-primary hover:underline font-medium">Details</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
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

            {activeKpiModal && (
                <KpiDetailModal 
                    type={activeKpiModal} 
                    data={{ investments, rfTransactions: investorRfTransactions, funds, referralNetworkRows }} 
                    onClose={() => setActiveKpiModal(null)} 
                />
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
                    initialFundId={addCapitalFundId}
                    onClose={() => setIsInvestOpen(false)}
                    onSubmit={handleNewInvestment}
                />
            )}

            {/* Success Toast Notifications inline */}
            {successNotification && (
                <div className="fixed bottom-5 right-5 z-[2500] bg-emerald-600 text-white px-5 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in max-w-sm border border-emerald-500">
                    <span className="text-xl">✅</span>
                    <div className="flex-1 text-sm font-semibold">{successNotification}</div>
                    <button onClick={() => setSuccessNotification(null)} className="hover:text-emerald-100 font-bold ml-2">✖</button>
                </div>
            )}
        </div>
    );
};

export default InvestorDashboard;
