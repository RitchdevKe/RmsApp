// @ts-nocheck

import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '../../context/DataContext';
import { isUnitSafelyVacant } from '../../utils/unitOccupancy';
import { useRegistration } from '../../hooks/useRegistration';
import Icon from '../Icon';
import { INITIAL_FUNDS } from '../../constants';
import { supabase } from '../../utils/supabaseClient';
import { followStkPaymentCompletion } from '../../utils/stkPaymentFollowup';
import { websiteLinks } from '../../utils/websiteLinks';
import { resolveReferralCode, extractUnitTagFromCode } from '../../utils/referralCode';
import type { Property } from '../../types';

import RegistrationModal from './RegistrationModal';
import { getTodayIsoDate } from '../../utils/timezone';

type UserPersona = 'Tenant' | 'Landlord' | 'Investor' | 'Partner';
type PageType = 'Home' | 'Properties' | 'Funds' | 'About';

// --- HELPER: Investment Rates Logic ---
const getTierRates = (months: number) => {
    if (months >= 24) return { apy: 30, monthly: 2.5 };
    if (months >= 18) return { apy: 26.4, monthly: 2.2 };
    if (months >= 12) return { apy: 24, monthly: 2.0 };
    return { apy: 18, monthly: 1.5 };
};

// --- MODAL: REQUEST CALL BACK (For Landlords/General) ---
const CallbackModal: React.FC<{ onClose: () => void; type?: string; referrerId?: string }> = ({ onClose, type = 'General', referrerId }) => {
    const { registerLandlord } = useRegistration();
    const { addLead } = useData();
    const [formData, setFormData] = useState({ name: '', phone: '', topic: type === 'Landlord' ? 'Property Management' : 'General Inquiry' });
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.phone) return alert("Name and Phone are required.");
        
        if (type === 'Landlord') {
            registerLandlord({
                name: formData.name,
                phone: formData.phone,
                notes: `Topic: ${formData.topic}`
            });
        }
        addLead({
            id: `lead-${Date.now()}`,
            tenantName: formData.name,
            contact: formData.phone,
            interest: formData.topic || type,
            status: 'New',
            source: 'Referral',
            referrerId: referrerId,
            date: getTodayIsoDate(),
            notes: `Submitted via referral landing. Topic: ${formData.topic}. Type: ${type}.`,
        });
        setSubmitted(true);
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6" onClick={e => e.stopPropagation()}>
                {!submitted ? (
                    <>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-gray-800">
                                {type === 'Landlord' ? 'List Your Property' : 'Request Call Back'}
                            </h3>
                            <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <p className="text-sm text-gray-600 mb-6">
                            {type === 'Landlord' 
                                ? "Interested in our management services? Leave your details and our acquisition team will contact you within 24 hours." 
                                : "Leave your details and our team will contact you shortly."}
                        </p>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Name</label>
                                <input 
                                    value={formData.name} 
                                    onChange={e => setFormData({...formData, name: e.target.value})} 
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                                    placeholder="Your Name"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number</label>
                                <input 
                                    value={formData.phone} 
                                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                                    placeholder="07..."
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Topic</label>
                                <select 
                                    value={formData.topic} 
                                    onChange={e => setFormData({...formData, topic: e.target.value})}
                                    className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none bg-white"
                                >
                                    <option>General Inquiry</option>
                                    <option>Renovation Funds</option>
                                    <option>Property Management</option>
                                </select>
                            </div>
                            <button type="submit" className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark transition-transform active:scale-95">
                                Request Call
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="text-center py-8">
                        <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Icon name="check" className="w-8 h-8" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">Request Received!</h3>
                        <p className="text-gray-600">We will be in touch shortly.</p>
                        <button onClick={onClose} className="mt-6 text-primary font-bold hover:underline">Close</button>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- MODALS: INVESTMENT & BOOKING ---
const InvestmentModal: React.FC<{ 
    fund: any; 
    onClose: () => void;
    referrerId?: string;
}> = ({ fund, onClose, referrerId }) => {
    const { registerInvestor } = useRegistration();
    const { addLead, staff, landlords, tenants, renovationInvestors, vendors } = useData();
    const [step, setStep] = useState<'auth' | 'config' | 'payment' | 'processing' | 'success'>('auth');
    const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
    const [userForm, setUserForm] = useState({ name: '', email: '', phone: '', password: '' });
    const [amount, setAmount] = useState<string>('');
    const [duration, setDuration] = useState<number>(12);
    const [mpesaPhone, setMpesaPhone] = useState('');
    const [txCode, setTxCode] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const rates = useMemo(() => getTierRates(duration), [duration]);
    const estMonthlyReturn = amount ? (parseFloat(amount) * rates.monthly / 100) : 0;
    const estTotalReturn = amount ? (parseFloat(amount) * (rates.apy / 100) * (duration / 12)) : 0;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data } = await supabase.auth.getSession();
            const uid = data.session?.user?.id ?? null;
            if (!cancelled && uid) {
                setUserId(uid);
                setStep('config');
                const meta = data.session?.user?.user_metadata as any;
                if (meta?.phone) setMpesaPhone(String(meta.phone));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (step === 'payment' && userForm.phone && authMode === 'register') {
            setMpesaPhone(userForm.phone);
        }
    }, [step, userForm.phone, authMode]);

    useEffect(() => {
        if (!userId || !checkoutRequestId) return;
        return followStkPaymentCompletion(supabase, userId, checkoutRequestId, (row) => {
            if (String(row.status ?? '') === 'completed') {
                setTxCode(String(row.transaction_id ?? checkoutRequestId));
                addLead({
                    id: `lead-${Date.now()}`,
                    tenantName: userForm.name || 'Investor',
                    contact: userForm.phone || mpesaPhone,
                    email: userForm.email,
                    interest: `Invest in ${fund.name}`,
                    status: 'Closed',
                    source: 'Referral',
                    referrerId: referrerId,
                    date: getTodayIsoDate(),
                    notes: `Invested KES ${amount} in ${fund.name} for ${duration} months.`,
                });
                setStep('success');
                setBusy(false);
            }
            if (String(row.status ?? '') === 'failed' || String(row.status ?? '') === 'cancelled') {
                setErrorMsg(String(row.result_desc ?? 'Payment did not complete.'));
                setStep('payment');
                setBusy(false);
                setCheckoutRequestId(null);
            }
        });
    }, [userId, checkoutRequestId]);

    const resolveLoginEmail = (identifier: string) => {
        let loginEmail = identifier.trim();
        if (!loginEmail.includes('@')) {
            const byPhone =
                staff.find(s => s.phone === loginEmail) ||
                landlords.find(l => l.phone === loginEmail) ||
                tenants.find(t => t.phone === loginEmail) ||
                renovationInvestors.find(i => i.phone === loginEmail) ||
                vendors.find(v => v.phone === loginEmail);
            if (!byPhone?.email) return null;
            loginEmail = byPhone.email;
        }
        return loginEmail;
    };

    const handleAuthSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        if (!userForm.email || !userForm.password) {
            setErrorMsg('Please fill email and password.');
            return;
        }
        if (userForm.password.length < 6) {
            setErrorMsg('Password must be at least 6 characters.');
            return;
        }
        if (authMode === 'register') {
            if (!userForm.name || !userForm.phone) {
                setErrorMsg('Please fill name and phone.');
                return;
            }
        }
        setBusy(true);
        try {
            if (authMode === 'register') {
                const parts = userForm.name.trim().split(/\s+/).filter(Boolean);
                const emailTrim = userForm.email.trim();
                const { data, error } = await supabase.auth.signUp({
                    email: emailTrim,
                    password: userForm.password,
                    options: {
                        data: {
                            role: 'Investor',
                            full_name: userForm.name,
                            first_name: parts[0] ?? userForm.name,
                            last_name: parts.length > 1 ? parts.slice(1).join(' ') : '',
                            phone: userForm.phone,
                        },
                    },
                });
                if (error) throw error;
                registerInvestor({
                    name: userForm.name,
                    email: emailTrim,
                    phone: userForm.phone,
                });
                const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
                    email: emailTrim,
                    password: userForm.password,
                });
                const uid = !signInErr && signInData?.user?.id ? signInData.user.id : data.user?.id ?? null;
                if (!uid) throw signInErr ?? new Error('Could not establish session after sign-up.');
                setUserId(uid);
                setMpesaPhone(userForm.phone);
                setStep('config');
            } else {
                const loginEmail = resolveLoginEmail(userForm.email);
                if (!loginEmail) {
                    setErrorMsg('No account found for this email or phone.');
                    return;
                }
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: loginEmail,
                    password: userForm.password,
                });
                if (error || !data.user) throw error ?? new Error('Login failed');
                setUserId(data.user.id);
                const metaPhone = (data.user.user_metadata as any)?.phone;
                if (metaPhone) setMpesaPhone(String(metaPhone));
                setStep('config');
            }
        } catch (err: any) {
            setErrorMsg(err?.message ?? String(err));
        } finally {
            setBusy(false);
        }
    };

    const handleConfigSubmit = () => {
        setErrorMsg(null);
        const amt = parseFloat(amount);
        if (!amount || !Number.isFinite(amt) || amt < 5000) {
            setErrorMsg('Minimum investment is KES 5,000.');
            return;
        }
        setStep('payment');
    };

    const handleProcessPayment = async () => {
        if (!userId) {
            setErrorMsg('You must be signed in.');
            return;
        }
        if (!/^(2547|07)\d{8}$/.test(mpesaPhone.replace(/\s/g, ''))) {
            setErrorMsg('Please enter a valid Kenyan mobile number.');
            return;
        }
        const amt = Math.round(parseFloat(amount));
        if (!Number.isFinite(amt) || amt < 5000) {
            setErrorMsg('Minimum investment is KES 5,000.');
            return;
        }
        setErrorMsg(null);
        setBusy(true);
        setStep('processing');
        try {
            const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
                body: { phone: mpesaPhone, amount: amt, leaseId: null, userId },
            });
            if (error) throw error;
            const id = String((data as any)?.checkoutRequestId ?? '').trim();
            if (!id) throw new Error('CheckoutRequestID missing from STK response');
            setCheckoutRequestId(id);
        } catch (e: any) {
            let msg = e?.message ?? 'Failed to initiate STK push.';
            try {
                const ctx = e?.context;
                if (ctx && typeof ctx.json === 'function') {
                    const body = await ctx.json();
                    if (body?.error) msg = String(body.error);
                }
            } catch {
                /* ignore */
            }
            setErrorMsg(msg);
            setStep('payment');
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-gray-800">{step === 'success' ? 'Investment Confirmed' : `Invest: ${fund.name}`}</h3>
                        {step !== 'success' && <p className="text-xs text-gray-500">Step {step === 'auth' ? '1' : step === 'config' ? '2' : '3'} of 3</p>}
                    </div>
                    <button type="button" onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="p-6 overflow-y-auto">
                    {errorMsg && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3 mb-4">{errorMsg}</p>
                    )}
                    {step === 'auth' && (
                        <div className="space-y-6">
                            <div className="flex p-1 bg-gray-100 rounded-lg">
                                <button type="button" onClick={() => setAuthMode('register')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${authMode === 'register' ? 'bg-white shadow text-primary' : 'text-gray-500'}`}>New Investor</button>
                                <button type="button" onClick={() => setAuthMode('login')} className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${authMode === 'login' ? 'bg-white shadow text-primary' : 'text-gray-500'}`}>Log In</button>
                            </div>
                            <form onSubmit={handleAuthSubmit} className="space-y-4">
                                {authMode === 'register' && <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name</label><input required value={userForm.name} onChange={e => setUserForm({...userForm, name: e.target.value})} className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-primary/20" placeholder="e.g. John Doe" /></div>}
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">{authMode === 'login' ? 'Email or phone' : 'Email address'}</label>
                                    <input type={authMode === 'register' ? 'email' : 'text'} required value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-primary/20" placeholder={authMode === 'login' ? 'john@example.com or 07...' : 'john@example.com'} />
                                </div>
                                {authMode === 'register' && <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number</label><input type="tel" required value={userForm.phone} onChange={e => setUserForm({...userForm, phone: e.target.value})} className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-primary/20" placeholder="07..." /></div>}
                                <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label><input type="password" required value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} className="w-full p-3 border rounded-lg outline-none focus:ring-2 focus:ring-primary/20" placeholder="••••••••" /></div>
                                <button type="submit" disabled={busy} className="w-full py-3 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-primary-dark transition-transform active:scale-95 disabled:opacity-60">{busy ? 'Please wait…' : 'Continue'}</button>
                            </form>
                        </div>
                    )}
                    {step === 'config' && (
                        <div className="space-y-5">
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Investment Amount (KES)</label><input type="number" autoFocus value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-3 border rounded-lg text-lg font-bold outline-none focus:border-primary" placeholder="Min 5,000"/></div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Duration</label>
                                <div className="grid grid-cols-2 gap-2">{[6, 12, 18, 24].map(d => (<button key={d} onClick={() => setDuration(d)} className={`p-3 rounded-lg border text-sm font-bold transition-all ${duration === d ? 'bg-blue-50 border-blue-500 text-blue-700' : 'hover:bg-gray-50 text-gray-600'}`}>{d} Months</button>))}</div>
                            </div>
                            <div className="bg-gradient-to-br from-gray-50 to-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                                <div className="flex justify-between items-center"><span className="text-sm text-gray-600">Target APY</span><span className="font-bold text-blue-700 text-lg">{rates.apy}%</span></div>
                                <div className="flex justify-between items-center"><span className="text-sm text-gray-600">Monthly Return</span><span className="font-bold text-green-600 text-lg">{rates.monthly}%</span></div>
                                <div className="border-t border-blue-200 pt-2 mt-2"><div className="flex justify-between items-center"><span className="text-sm font-bold text-gray-700">Est. Monthly Payout</span><span className="font-bold text-gray-800">KES {estMonthlyReturn.toLocaleString()}</span></div><p className="text-xs text-gray-500 mt-1 text-right">Total Profit: KES {estTotalReturn.toLocaleString()}</p></div>
                            </div>
                            <div className="flex gap-3"><button type="button" onClick={() => setStep('auth')} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200">Back</button><button type="button" onClick={handleConfigSubmit} className="flex-[2] py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark shadow-md">Next: Payment</button></div>
                        </div>
                    )}
                    {(step === 'payment' || step === 'processing' || step === 'success') && (
                        <div className="relative">
                            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } .mpesa-spinner { width: 60px; height: 60px; border: 5px solid rgba(31, 159, 33, 0.2); border-top: 5px solid #1F9F21; border-radius: 50%; margin: 0 auto 25px; animation: spin 1s linear infinite; } .loading-dots span { display: inline-block; width: 8px; height: 8px; background-color: #1F9F21; border-radius: 50%; animation: bounce 1.4s ease-in-out infinite both; } .loading-dots span:nth-child(1) { animation-delay: 0s; } .loading-dots span:nth-child(2) { animation-delay: 0.2s; } .loading-dots span:nth-child(3) { animation-delay: 0.4s; }`}</style>
                            {step === 'payment' && (
                                <div className="space-y-4">
                                    <div className="bg-green-50 p-4 rounded-xl border border-green-100 mb-6 text-center"><p className="text-xs text-green-700 font-bold uppercase mb-1">Amount to Pay</p><p className="text-2xl font-extrabold text-green-800">KES {parseFloat(amount).toLocaleString()}</p></div>
                                    <div><label className="block mb-1 font-semibold text-gray-700 text-xs uppercase">M-Pesa Number</label><input type="tel" value={mpesaPhone} onChange={e => setMpesaPhone(e.target.value)} className="w-full p-3 border-2 border-[#c8e6c9] rounded-xl text-base focus:outline-none focus:border-[#1F9F21] transition-colors" placeholder="07..."/></div>
                                    <div className="flex gap-3 pt-2"><button type="button" onClick={() => setStep('config')} className="flex-1 py-3.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200">Back</button><button type="button" disabled={busy} onClick={handleProcessPayment} className="flex-[2] py-3.5 bg-gradient-to-r from-[#1F9F21] to-[#177D1A] text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all transform active:scale-95 disabled:opacity-60">{busy ? 'Sending…' : 'Pay & Invest'}</button></div>
                                </div>
                            )}
                            {step === 'processing' && <div className="py-10 text-center"><div className="mpesa-spinner"></div><p className="text-xl font-semibold text-[#1a365d] mb-2">Processing Investment...</p><p className="text-[#4a904a] font-medium">Check your phone for the M-Pesa prompt.</p><div className="loading-dots flex justify-center gap-1.5 mt-6"><span></span><span></span><span></span></div></div>}
                            {step === 'success' && <div className="text-center py-6"><div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600"><Icon name="check" className="w-8 h-8" /></div><h3 className="text-2xl font-bold text-gray-800 mb-2">Welcome Aboard!</h3><p className="text-gray-600 text-sm mb-2">Your investment of <strong>KES {parseFloat(amount).toLocaleString()}</strong> in {fund.name} is recorded.</p>{txCode ? <p className="text-xs text-gray-500 mb-6">M-Pesa ref: <span className="font-mono">{txCode}</span></p> : <p className="text-xs text-gray-500 mb-6">Payment completed.</p>}<button type="button" onClick={onClose} className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-colors">Close</button></div>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export type BookableVacancy = {
    id: string;
    propertyId: string;
    unitId: string;
    unitNumber: string;
    title: string;
    rent: number;
    location: string;
    image: string;
    type: string;
    bedrooms: number;
    property: Property;
};

const UnitBookingModal: React.FC<{ unit: BookableVacancy; onClose: () => void; referrerId?: string }> = ({ unit, onClose, referrerId }) => {
    const { addApplication, addLead, staff, landlords, tenants, renovationInvestors, vendors } = useData();
    const [step, setStep] = useState<'auth' | 'payment' | 'processing' | 'success'>('auth');
    const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [mpesaPhone, setMpesaPhone] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
    const [txRef, setTxRef] = useState('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data } = await supabase.auth.getSession();
            const uid = data.session?.user?.id ?? null;
            if (!cancelled && uid) {
                setUserId(uid);
                setStep('payment');
                const meta = data.session?.user?.user_metadata as any;
                if (meta?.phone) setMpesaPhone(String(meta.phone));
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!userId || !checkoutRequestId) return;
        return followStkPaymentCompletion(supabase, userId, checkoutRequestId, (row) => {
            if (String(row.status ?? '') === 'completed') {
                setTxRef(String(row.transaction_id ?? checkoutRequestId));
                setStep('success');
                setBusy(false);
            }
            if (String(row.status ?? '') === 'failed' || String(row.status ?? '') === 'cancelled') {
                setErrorMsg(String(row.result_desc ?? 'Payment did not complete.'));
                setStep('payment');
                setBusy(false);
                setCheckoutRequestId(null);
            }
        });
    }, [userId, checkoutRequestId]);

    const resolveLoginEmail = (identifier: string) => {
        let loginEmail = identifier.trim();
        if (!loginEmail.includes('@')) {
            const byPhone =
                staff.find(s => s.phone === loginEmail) ||
                landlords.find(l => l.phone === loginEmail) ||
                tenants.find(t => t.phone === loginEmail) ||
                renovationInvestors.find(i => i.phone === loginEmail) ||
                vendors.find(v => v.phone === loginEmail);
            if (!byPhone?.email) return null;
            loginEmail = byPhone.email;
        }
        return loginEmail;
    };

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        setBusy(true);
        try {
            if (authMode === 'login') {
                const loginEmail = resolveLoginEmail(email);
                if (!loginEmail) {
                    setErrorMsg('No account found for this email or phone.');
                    setBusy(false);
                    return;
                }
                const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
                if (error || !data.user) throw error ?? new Error('Login failed');
                setUserId(data.user.id);
                const metaPhone = (data.user.user_metadata as any)?.phone;
                if (metaPhone) setMpesaPhone(String(metaPhone));
                else if (phone) setMpesaPhone(phone);
                setStep('payment');
            } else {
                if (!email || !password || !name || !phone) {
                    setErrorMsg('Please complete all fields.');
                    setBusy(false);
                    return;
                }
                if (password.length < 6) {
                    setErrorMsg('Password must be at least 6 characters.');
                    setBusy(false);
                    return;
                }
                const parts = name.trim().split(/\s+/).filter(Boolean);
                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            role: 'Tenant',
                            full_name: name,
                            first_name: parts[0] ?? name,
                            last_name: parts.length > 1 ? parts.slice(1).join(' ') : '',
                            phone,
                        },
                    },
                });
                if (error) throw error;
                if (!data.user) throw new Error('Sign up did not return a user.');
                const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
                const uid = !signInErr && signInData?.user?.id ? signInData.user.id : data.user.id;
                setUserId(uid);
                setMpesaPhone(phone);
                setStep('payment');
            }
        } catch (err: any) {
            setErrorMsg(err?.message ?? String(err));
        } finally {
            setBusy(false);
        }
    };

    const handlePay = async () => {
        if (!userId) {
            setErrorMsg('You must be signed in.');
            return;
        }
        if (!/^(2547|07)\d{8}$/.test(mpesaPhone.replace(/\s/g, ''))) {
            setErrorMsg('Enter a valid Kenyan mobile number.');
            return;
        }
        const amount = Math.round(Number(unit.rent) || 0);
        if (amount <= 0) {
            setErrorMsg('Invalid rent amount for this listing.');
            return;
        }
        setErrorMsg(null);
        setBusy(true);
        setStep('processing');
        try {
            const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
                body: { phone: mpesaPhone, amount, leaseId: null, userId },
            });
            if (error) throw error;
            const id = String((data as any)?.checkoutRequestId ?? '').trim();
            if (!id) throw new Error('CheckoutRequestID missing from STK response');
            setCheckoutRequestId(id);
        } catch (e: any) {
            let msg = e?.message ?? 'Failed to initiate STK push.';
            try {
                const ctx = e?.context;
                if (ctx && typeof ctx.json === 'function') {
                    const body = await ctx.json();
                    if (body?.error) msg = String(body.error);
                }
            } catch {
                /* ignore */
            }
            setErrorMsg(msg);
            setStep('payment');
            setBusy(false);
        }
    };

    const handleSuccessDone = () => {
        const displayName = name.trim() || email.split('@')[0] || 'Applicant';
        addLead({
            id: `lead-${Date.now()}`,
            tenantName: displayName,
            contact: mpesaPhone || phone,
            email,
            interest: unit.title,
            status: 'Closed',
            source: 'Referral',
            referrerId: referrerId,
            date: getTodayIsoDate(),
            notes: `Booked ${unit.title} via referral landing. M-Pesa ref: ${txRef}.`,
        });
        addApplication({
            id: `app-${Date.now()}`,
            name: displayName,
            phone: mpesaPhone || phone,
            email,
            status: 'Under Review',
            submittedDate: getTodayIsoDate(),
            propertyId: unit.propertyId,
            unitId: unit.unitId,
            propertyName: unit.property.name,
            unit: unit.unitNumber,
            rentAmount: unit.rent,
            authUserId: userId || undefined,
            source: 'Referral landing — Book Now',
            referrerId: referrerId,
        });
        window.location.hash = '#/user-app-portal/tenant-portal';
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/70 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-gray-800">Book {unit.title}</h3>
                        <p className="text-xs text-gray-500">KES {unit.rent.toLocaleString()} / month</p>
                    </div>
                    <button type="button" onClick={onClose}>
                        <Icon name="close" className="w-5 h-5 text-gray-400" />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto space-y-4">
                    {errorMsg && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{errorMsg}</p>}

                    {step === 'auth' && (
                        <>
                            <div className="flex p-1 bg-gray-100 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => setAuthMode('login')}
                                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${authMode === 'login' ? 'bg-white shadow text-primary' : 'text-gray-500'}`}
                                >
                                    Sign in
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAuthMode('register')}
                                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${authMode === 'register' ? 'bg-white shadow text-primary' : 'text-gray-500'}`}
                                >
                                    Register
                                </button>
                            </div>
                            <form onSubmit={handleAuth} className="space-y-3">
                                {authMode === 'register' && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full name</label>
                                            <input value={name} onChange={e => setName(e.target.value)} className="w-full p-3 border rounded-lg" required={authMode === 'register'} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone</label>
                                            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-3 border rounded-lg" required={authMode === 'register'} placeholder="07..." />
                                        </div>
                                    </>
                                )}
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3 border rounded-lg" required />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
                                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border rounded-lg" required />
                                </div>
                                <button type="submit" disabled={busy} className="w-full py-3 bg-primary text-white font-bold rounded-xl disabled:opacity-50">
                                    {busy ? 'Please wait...' : authMode === 'login' ? 'Continue to payment' : 'Create account & continue'}
                                </button>
                            </form>
                        </>
                    )}

                    {step === 'payment' && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600">Pay your first month&apos;s rent via M-Pesa STK. Requires Daraja credentials on the project.</p>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">M-Pesa number</label>
                                <input type="tel" value={mpesaPhone} onChange={e => setMpesaPhone(e.target.value)} className="w-full p-3 border rounded-lg" placeholder="07..." />
                            </div>
                            <button type="button" disabled={busy} onClick={handlePay} className="w-full py-3 bg-gray-900 text-white font-bold rounded-xl disabled:opacity-50">
                                Pay KES {unit.rent.toLocaleString()}
                            </button>
                        </div>
                    )}

                    {step === 'processing' && (
                        <div className="text-center py-8">
                            <p className="text-lg font-semibold text-gray-800 mb-2">Check your phone</p>
                            <p className="text-gray-600 text-sm">Complete the M-Pesa prompt to confirm payment.</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center space-y-4 py-4">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                                <Icon name="check" className="w-8 h-8" />
                            </div>
                            <h4 className="font-bold text-xl text-gray-800">Payment received</h4>
                            {txRef && <p className="text-xs text-gray-500 font-mono">Ref: {txRef}</p>}
                            <button type="button" onClick={handleSuccessDone} className="w-full py-3 bg-primary text-white font-bold rounded-xl">
                                Go to tenant portal
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
// --- FULL PAGES ---

const AboutUsPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
    return (
        <div className="min-h-screen bg-white animate-fade-in flex flex-col">
             {/* Sticky Header for Page */}
             <div className="bg-white border-b sticky top-0 z-50 px-6 py-4 flex justify-between items-center shadow-sm">
                 <button onClick={onBack} className="flex items-center text-gray-600 hover:text-primary font-bold transition-colors">
                    <Icon name="chevron-down" className="w-5 h-5 mr-2 rotate-90" />
                    Back to Home
                </button>
                <div className="text-xl font-bold text-gray-800">About Us</div>
             </div>

            <div className="overflow-y-auto flex-grow">
                {/* Hero Section */}
                <div className="relative h-[500px] flex items-center justify-center bg-gray-900 text-white text-center px-6 overflow-hidden">
                    <div className="absolute inset-0 opacity-40">
                         <img src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80" className="w-full h-full object-cover" alt="Nairobi Skyline" />
                    </div>
                    <div className="relative z-10 max-w-4xl mx-auto">
                        <h1 className="text-5xl md:text-7xl font-extrabold mb-6 tracking-tight">Building the Future of <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">African Real Estate</span></h1>
                        <p className="text-xl md:text-2xl text-gray-200 font-light">We bridge the gap between technology, capital, and community.</p>
                    </div>
                </div>

                {/* Mission & Vision */}
                <div className="py-20 px-6 max-w-6xl mx-auto">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                         <div>
                             <h4 className="text-primary font-bold uppercase tracking-wider text-sm mb-2">Our Mission</h4>
                             <h2 className="text-4xl font-extrabold text-gray-900 mb-6">Simplifying Property for Everyone</h2>
                             <p className="text-gray-600 text-lg leading-relaxed mb-6">
                                 TaskMe Realty was born from a simple idea: Real estate should be transparent, accessible, and efficient. 
                                 Whether you are renting your first home, managing a portfolio, or looking to invest, we provide the digital infrastructure to make it seamless.
                             </p>
                             <div className="flex gap-4">
                                 <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex-1">
                                     <h3 className="font-bold text-gray-800 text-2xl">100%</h3>
                                     <p className="text-sm text-gray-500">Digital Workflow</p>
                                 </div>
                                 <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex-1">
                                     <h3 className="font-bold text-gray-800 text-2xl">30%</h3>
                                     <p className="text-sm text-gray-500">Avg. Investment APY</p>
                                 </div>
                             </div>
                         </div>
                         <div className="relative h-[400px] bg-gray-200 rounded-3xl overflow-hidden shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-500">
                             <img src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80" className="w-full h-full object-cover" alt="Modern Architecture" />
                         </div>
                     </div>
                </div>

                {/* Team / Values */}
                <div className="bg-gray-50 py-20 px-6">
                    <div className="max-w-6xl mx-auto text-center">
                        <h2 className="text-3xl font-bold text-gray-900 mb-12">Driven by Innovation</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                             <div className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                                 <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-600">
                                     <Icon name="check" className="w-8 h-8" />
                                 </div>
                                 <h3 className="text-xl font-bold text-gray-800 mb-3">Transparency</h3>
                                 <p className="text-gray-600">No hidden fees. No paperwork chaos. Just clear, real-time data for landlords, tenants, and investors.</p>
                             </div>
                             <div className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                                 <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600">
                                     <Icon name="revenue" className="w-8 h-8" />
                                 </div>
                                 <h3 className="text-xl font-bold text-gray-800 mb-3">Community Wealth</h3>
                                 <p className="text-gray-600">We believe in shared prosperity. Our R-REITs model allows anyone to participate in real estate growth.</p>
                             </div>
                             <div className="bg-white p-8 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                                 <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6 text-purple-600">
                                     <Icon name="analytics" className="w-8 h-8" />
                                 </div>
                                 <h3 className="text-xl font-bold text-gray-800 mb-3">Technology First</h3>
                                 <p className="text-gray-600">From automated payments to AI-driven insights, we use tech to solve traditional property headaches.</p>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Footer CTA */}
                <div className="bg-primary py-16 px-6 text-center text-white">
                    <h2 className="text-3xl font-bold mb-4">Ready to Join the Revolution?</h2>
                    <p className="text-white/80 mb-8 max-w-2xl mx-auto">Start your journey today. Find a home, list a property, or grow your capital.</p>
                    <button onClick={onBack} className="px-8 py-3 bg-white text-primary font-bold rounded-full hover:bg-gray-100 transition-colors shadow-lg">
                        Get Started
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Self-Registration Modal ---
const SelfRegistrationModal: React.FC<{ onClose: () => void; referrerId?: string; referralCodeRaw?: string }> = ({ onClose, referrerId, referralCodeRaw }) => {
    const { addApplication, tenants, staff, landlords, renovationInvestors, properties } = useData();
    const [step, setStep] = useState<'form' | 'success'>('form');
    const [busy, setBusy] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', location: '', referralCode: referralCodeRaw || '' });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg('');
        if (!form.name || !form.phone || !form.email || !form.password) {
            return setErrorMsg('Please fill in all required fields.');
        }
        setBusy(true);
        try {
            let userId: string | undefined;
            const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
                email: form.email,
                password: form.password,
                options: { data: { name: form.name, phone: form.phone } },
            });
            if (signUpErr && !signUpErr.message.toLowerCase().includes('already registered')) {
                throw new Error(signUpErr.message);
            }
            userId = signUpData?.user?.id;

            // Resolve referral code: manual input takes precedence over URL-embedded ID
            let resolvedId = referrerId;
            let resolvedUnitId: string | undefined;
            const rawCode = form.referralCode.trim();
            if (rawCode) {
                const people = [
                    ...(tenants || []), ...(staff || []),
                    ...(landlords || []), ...(renovationInvestors || []),
                ].map((u: any) => ({ id: u.id, name: u.name || '', referralCode: u.referralCode }));
                const found = resolveReferralCode(rawCode, people);
                if (found) resolvedId = found;
                const unitTag = extractUnitTagFromCode(rawCode);
                if (unitTag) {
                    const tag = unitTag.toUpperCase();
                    for (const prop of (properties || [])) {
                        const unit = prop.units?.find(u => u.unitNumber.toUpperCase() === tag);
                        if (unit) { resolvedUnitId = unit.id; break; }
                    }
                }
            }

            addApplication({
                id: `app-self-${Date.now()}`,
                name: form.name,
                phone: form.phone,
                email: form.email,
                status: 'New',
                submittedDate: getTodayIsoDate(),
                source: 'Self-Registration',
                propertyName: form.location || undefined,
                referrerId: resolvedId,
                referredUnitId: resolvedUnitId,
                authUserId: userId,
            });
            setStep('success');
        } catch (err: any) {
            setErrorMsg(err.message || 'Something went wrong. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-gray-800 text-lg">Register as a Tenant</h3>
                        <p className="text-xs text-gray-500">Submit your details — our team will be in touch.</p>
                    </div>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>

                {step === 'success' ? (
                    <div className="p-8 text-center space-y-4">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <Icon name="check" className="w-8 h-8 text-green-600" />
                        </div>
                        <p className="text-xl font-bold text-gray-800">Application Submitted!</p>
                        <p className="text-sm text-gray-500">Your details have been recorded. A member of our team will verify your application and contact you shortly to guide you through allocation and onboarding.</p>
                        <button onClick={onClose} className="w-full py-3 bg-primary text-white font-bold rounded-xl mt-2">Done</button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        {errorMsg && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3">{errorMsg}</p>}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Full Name <span className="text-red-500">*</span></label>
                                <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20" placeholder="John Doe" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone <span className="text-red-500">*</span></label>
                                <input required type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20" placeholder="07..." />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email Address <span className="text-red-500">*</span></label>
                            <input required type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20" placeholder="john@example.com" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Create Password <span className="text-red-500">*</span></label>
                            <input required type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20" placeholder="Min. 6 characters" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Preferred Location / Property <span className="text-gray-400 font-normal">(optional)</span></label>
                            <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20" placeholder="e.g. Westlands, Kilimani..." />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Referral Code <span className="text-gray-400 font-normal">(optional)</span></label>
                            <input
                                value={form.referralCode}
                                onChange={e => setForm({...form, referralCode: e.target.value.toUpperCase()})}
                                className="w-full p-3 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 font-mono tracking-wider"
                                placeholder="e.g. JOSKIR/15J"
                            />
                            {form.referralCode && (
                                <p className="text-xs text-teal-600 mt-1">Code applied — you will be linked to this referrer and their suggested unit during approval.</p>
                            )}
                        </div>
                        <p className="text-xs text-gray-400">Your application will be reviewed and verified by our team before you are assigned a unit.</p>
                        <button type="submit" disabled={busy} className="w-full py-3 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-primary-dark transition-all disabled:opacity-60">
                            {busy ? 'Submitting...' : 'Submit Application'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

const ReferralLanding: React.FC = () => {
    const { properties, funds, tenants, staff, landlords, renovationInvestors } = useData();
    const [viewMode, setViewMode] = useState<UserPersona>('Tenant'); // Default view
    const [searchTerm, setSearchQuery] = useState('');
    const [selectedFund, setSelectedFund] = useState<any>(null);
    const [selectedUnit, setSelectedUnit] = useState<BookableVacancy | null>(null);
    const [isCallbackOpen, setIsCallbackOpen] = useState(false);
    const [callbackType, setCallbackType] = useState('General');
    const [currentPage, setCurrentPage] = useState<PageType>('Home'); // Home acts as the main landing, Properties/Funds act as filtered views if needed, About is separate.
    const [referrerCode, setReferrerCode] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [autoOpenParams, setAutoOpenParams] = useState<{ type: string; id?: string } | null>(null);

    const resolvedReferrerId = useMemo(() => {
        if (!referrerCode) return undefined;
        const allPeople = [...(tenants || []), ...(staff || []), ...(landlords || []), ...(renovationInvestors || [])]
            .map((u: any) => ({ id: u.id, name: u.name || '', referralCode: u.referralCode }));
        return resolveReferralCode(referrerCode, allPeople);
    }, [referrerCode, tenants, staff, landlords, renovationInvestors]);

    const buildShareLink = (type: 'unit' | 'fund', id: string) => {
        if (type === 'unit') {
            const prop = properties.find(p => p.units?.some((u: any) => u.id === id));
            const unit = prop?.units.find((u: any) => u.id === id);
            if (prop && unit) return websiteLinks.property(prop.id, referrerCode, unit.unitNumber);
            return websiteLinks.unit(id, referrerCode, prop?.websiteListingUrl);
        } else {
            return websiteLinks.invest(referrerCode);
        }
    };

    const handleCopyLink = (type: 'unit' | 'fund', id: string) => {
        navigator.clipboard.writeText(buildShareLink(type, id));
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Registration Modal State
    const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
    const [isSelfRegOpen, setIsSelfRegOpen] = useState(false);
    const [registrationType, setRegistrationType] = useState<'Landlord' | 'Investor' | 'Affiliate' | 'Contractor'>('Landlord');

    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        let ref = searchParams.get('ref');
        let type = searchParams.get('type');
        let id = searchParams.get('id');

        if (!ref || !type) {
            const hashParts = window.location.hash.split('?');
            if (hashParts.length > 1) {
                const hashParams = new URLSearchParams(hashParts[1]);
                if (!ref) ref = hashParams.get('ref');
                if (!type) type = hashParams.get('type');
                if (!id) id = hashParams.get('id');
            }
        }

        if (ref) setReferrerCode(ref);
        if (type) setAutoOpenParams({ type, id: id ?? undefined });
    }, []);

    // --- DERIVED DATA ---
    const vacantUnits = useMemo(() => {
        return properties.flatMap(p => p.units
            .filter(u => isUnitSafelyVacant(u, tenants, p))
            .map(u => ({
                id: u.id,
                propertyId: p.id,
                unitId: u.id,
                unitNumber: u.unitNumber,
                title: `${u.unitNumber} at ${p.name}`,
                rent: u.rent || p.defaultMonthlyRent || 0,
                location: p.subLocation && p.zone ? `${p.subLocation} (${p.zone})` : (p.subLocation || p.zone || p.location || p.branch || 'Location not set'),
                pinLocationUrl: p.pinLocationUrl || '',
                image: p.profilePictureUrl || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
                type: u.unitType || p.type,
                bedrooms: u.bedrooms,
                property: p,
            }))
        ).filter(u => {
            const q = searchTerm.toLowerCase();
            return !q ||
                u.title.toLowerCase().includes(q) ||
                (u.location || '').toLowerCase().includes(q) ||
                (u.type || '').toLowerCase().includes(q);
        });
    }, [properties, tenants, searchTerm]);

    const activeFunds = useMemo(() => funds.filter(f => f.status === 'Active' || f.status === 'Closing Soon'), [funds]);

    const handleOpenCallback = (type: string) => {
        setCallbackType(type);
        setIsCallbackOpen(true);
    };

    useEffect(() => {
        if (!autoOpenParams) return;
        if (autoOpenParams.type === 'landlord') {
            setAutoOpenParams(null);
            handleOpenCallback('Landlord');
        } else if (autoOpenParams.type === 'invest' && activeFunds.length > 0) {
            setAutoOpenParams(null);
            setSelectedFund(activeFunds[0]);
        } else if (autoOpenParams.type === 'unit' && autoOpenParams.id) {
            const unit = vacantUnits.find(u => u.id === autoOpenParams.id);
            if (unit) {
                setAutoOpenParams(null);
                setSelectedUnit(unit);
            }
        }
    }, [autoOpenParams, activeFunds, vacantUnits]);

    if (currentPage === 'About') {
        return <AboutUsPage onBack={() => setCurrentPage('Home')} />;
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans text-gray-900 flex flex-col relative overflow-hidden">
            
            {/* Navigation Bar */}
            <nav className="bg-white/90 backdrop-blur-md sticky top-0 z-50 border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-20 items-center">
                        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentPage('Home')}>
                            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white shadow-lg">
                                <Icon name="branch" className="w-6 h-6" />
                            </div>
                            <span className="text-2xl font-extrabold tracking-tight text-gray-900">TaskMe<span className="text-primary">.</span></span>
                        </div>
                        
                        <div className="hidden md:flex space-x-8">
                            <button onClick={() => setViewMode('Tenant')} className={`text-sm font-bold transition-colors ${viewMode === 'Tenant' ? 'text-primary' : 'text-gray-500 hover:text-gray-900'}`}>Rent</button>
                            <button onClick={() => setViewMode('Investor')} className={`text-sm font-bold transition-colors ${viewMode === 'Investor' ? 'text-primary' : 'text-gray-500 hover:text-gray-900'}`}>Invest</button>
                            <button onClick={() => setViewMode('Landlord')} className={`text-sm font-bold transition-colors ${viewMode === 'Landlord' ? 'text-primary' : 'text-gray-500 hover:text-gray-900'}`}>List Property</button>
                            <button onClick={() => setViewMode('Partner')} className={`text-sm font-bold transition-colors ${viewMode === 'Partner' ? 'text-primary' : 'text-gray-500 hover:text-gray-900'}`}>Partner</button>
                            <button onClick={() => setCurrentPage('About')} className="text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors">About</button>
                        </div>

                        <div className="flex items-center gap-3">
                            <button onClick={() => window.location.hash = '#/auth'} className="hidden sm:block text-sm font-bold text-gray-600 hover:text-primary">Login</button>
                            <button onClick={() => window.location.hash = '#/auth'} className="px-5 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-full hover:bg-black transition-all shadow-md transform hover:-translate-y-0.5">
                                Sign Up
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Content Switcher */}
            <main className="flex-grow">
                {viewMode === 'Tenant' && (
                    <div className="animate-fade-in">
                        {/* Tenant Hero */}
                        <div className="relative bg-gray-900 text-white overflow-hidden h-[500px] flex items-center">
                            <div className="absolute inset-0">
                                <img src="https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1600&q=80" className="w-full h-full object-cover opacity-40" alt="Apartment" />
                                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent to-transparent"></div>
                            </div>
                            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full text-center sm:text-left">
                                <span className="inline-block py-1 px-3 rounded-full bg-blue-600/30 border border-blue-500/50 text-blue-200 text-xs font-bold mb-4 uppercase tracking-wider backdrop-blur-sm">
                                    Trusted by 1,200+ Tenants
                                </span>
                                <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight">
                                    Find Your Perfect <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-400">Sanctuary.</span>
                                </h1>
                                <p className="text-lg md:text-xl text-gray-300 mb-8 max-w-2xl">
                                    Browse verified listings, book viewings instantly, and pay rent securely with M-Pesa. No agents, no hassle.
                                </p>
                                
                                {/* Search Bar */}
                                <div className="max-w-2xl bg-white p-2 rounded-2xl shadow-2xl flex flex-col sm:flex-row gap-2">
                                    <div className="flex-grow relative">
                                        <Icon name="search" className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                                        <input 
                                            type="text" 
                                            placeholder="Search by location, price, or type..." 
                                            className="w-full pl-12 pr-4 py-3 rounded-xl text-gray-800 placeholder-gray-500 outline-none focus:ring-2 focus:ring-primary/20 h-full"
                                            value={searchTerm}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                    </div>
                                    <button className="px-8 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary-dark transition-colors shadow-lg">
                                        Search
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Listings Grid */}
                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                                <h2 className="text-3xl font-bold text-gray-800">Featured Vacancies</h2>
                                <button
                                    onClick={() => setIsSelfRegOpen(true)}
                                    className="px-5 py-2.5 bg-primary text-white text-sm font-bold rounded-full hover:bg-primary-dark transition-all shadow-md flex items-center gap-2"
                                >
                                    <Icon name="add" className="w-4 h-4" /> Register as Tenant
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {vacantUnits.length > 0 ? vacantUnits.map(unit => (
                                    <div key={unit.id} className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 overflow-hidden group flex flex-col">
                                        <div className="relative h-64 overflow-hidden">
                                            <img src={unit.image} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={unit.title} />
                                            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur text-gray-800 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">
                                                {unit.type}
                                            </div>
                                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pt-12">
                                                <p className="text-white font-bold text-xl">KES {unit.rent.toLocaleString()}</p>
                                            </div>
                                        </div>
                                        <div className="p-6 flex-grow flex flex-col">
                                            <div className="flex justify-between items-start mb-2">
                                                <h3 className="font-bold text-lg text-gray-900 group-hover:text-primary transition-colors">{unit.title}</h3>
                                            </div>
                                            <p className="text-gray-500 text-sm mb-4 flex items-center">
                                                <Icon name="branch" className="w-4 h-4 mr-1 text-gray-400" /> {unit.location}
                                            </p>
                                            <div className="flex gap-3 text-xs text-gray-600 mb-6">
                                                <span className="bg-gray-100 px-2 py-1 rounded flex items-center"><Icon name="check" className="w-3 h-3 mr-1"/> Verified</span>
                                                <span className="bg-gray-100 px-2 py-1 rounded">{unit.bedrooms} Beds</span>
                                                <span className="bg-gray-100 px-2 py-1 rounded">WiFi Ready</span>
                                            </div>
                                            {unit.pinLocationUrl && (
                                                <a
                                                    href={unit.pinLocationUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex mb-4 items-center text-xs font-bold text-blue-700 hover:text-blue-800"
                                                >
                                                    <Icon name="map-pin" className="w-3 h-3 mr-1" /> Open map pin
                                                </a>
                                            )}
                                            <div className="mt-auto flex gap-2">
                                                <button
                                                    onClick={() => setSelectedUnit(unit)}
                                                    className="flex-1 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black transition-all shadow-md flex justify-center items-center group-hover:bg-primary"
                                                >
                                                    Book Now
                                                </button>
                                                <button
                                                    onClick={() => handleCopyLink('unit', unit.id)}
                                                    title="Copy shareable link"
                                                    className="px-3 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-all shadow-sm flex items-center justify-center"
                                                >
                                                    {copiedId === unit.id
                                                        ? <Icon name="check" className="w-4 h-4 text-green-600" />
                                                        : <Icon name="copy" className="w-4 h-4" />
                                                    }
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-gray-200">
                                        <Icon name="vacant-house" className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                                        <h3 className="text-xl font-bold text-gray-500">No vacancies found</h3>
                                        <p className="text-gray-400 mt-2">Try adjusting your search terms.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'Investor' && (
                    <div className="animate-fade-in">
                        <div className="relative bg-gradient-to-br from-indigo-900 to-purple-900 text-white overflow-hidden h-[500px] flex items-center">
                             <div className="absolute inset-0">
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                                <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
                                <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
                            </div>
                            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full text-center">
                                <span className="inline-block py-1 px-3 rounded-full bg-purple-500/30 border border-purple-400/50 text-purple-200 text-xs font-bold mb-4 uppercase tracking-wider backdrop-blur-sm">
                                    High Yield Real Estate
                                </span>
                                <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight mb-6">
                                    Invest in <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-400">Concrete Growth.</span>
                                </h1>
                                <p className="text-xl text-indigo-100 mb-10 max-w-3xl mx-auto">
                                    Join Kenya's fastest growing Renovation REITs. Earn up to 30% APY backed by tangible property assets.
                                </p>
                                <button onClick={() => document.getElementById('funds-grid')?.scrollIntoView({behavior: 'smooth'})} className="px-10 py-4 bg-white text-indigo-900 font-bold rounded-full hover:bg-gray-100 transition-all shadow-xl text-lg transform hover:-translate-y-1">
                                    Explore Opportunities
                                </button>
                            </div>
                        </div>

                        <div id="funds-grid" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                            <div className="text-center mb-16">
                                <h2 className="text-3xl font-bold text-gray-900">Active Investment Funds</h2>
                                <p className="text-gray-500 mt-2">Curated high-potential renovation projects open for funding.</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {activeFunds.map(fund => (
                                    <div key={fund.id} className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-2xl transition-all duration-300 flex flex-col group h-full">
                                        <div className="h-56 bg-gray-200 relative">
                                            {fund.projectPic ? (
                                                <img src={fund.projectPic} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt={fund.name} />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-gray-400 bg-gray-100">
                                                    <Icon name="revenue" className="w-12 h-12 opacity-30" />
                                                </div>
                                            )}
                                            <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-indigo-900 shadow-sm">
                                                {fund.riskProfile} Risk
                                            </div>
                                            <div className="absolute bottom-4 right-4 bg-green-500 text-white px-3 py-1 rounded-lg text-sm font-bold shadow-lg">
                                                {fund.targetApy} APY
                                            </div>
                                        </div>

                                        <div className="p-8 flex-grow flex flex-col">
                                            <h3 className="text-2xl font-bold text-gray-900 mb-2">{fund.name}</h3>
                                            <p className="text-gray-600 text-sm mb-6 line-clamp-3">{fund.description}</p>
                                            
                                            <div className="space-y-4 mb-8">
                                                <div>
                                                    <div className="flex justify-between text-sm mb-2 font-medium text-gray-700">
                                                        <span>Progress</span>
                                                        <span>{Math.round((fund.capitalRaised/fund.targetCapital)*100)}%</span>
                                                    </div>
                                                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                                                        <div className="bg-gradient-to-r from-blue-500 to-purple-600 h-2.5 rounded-full" style={{ width: `${(fund.capitalRaised/fund.targetCapital)*100}%` }}></div>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between text-sm text-gray-500">
                                                    <span>Raised: <span className="text-gray-900 font-bold">KES {(fund.capitalRaised/1000000).toFixed(1)}M</span></span>
                                                    <span>Goal: <span className="text-gray-900 font-bold">KES {(fund.targetCapital/1000000).toFixed(1)}M</span></span>
                                                </div>
                                            </div>

                                            <div className="mt-auto flex gap-2">
                                                <button
                                                    onClick={() => setSelectedFund(fund)}
                                                    className="flex-1 py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-black transition-colors shadow-md flex justify-center items-center gap-2 group-hover:bg-primary"
                                                >
                                                    Start Investing <Icon name="chevron-down" className="w-4 h-4 -rotate-90" />
                                                </button>
                                                <button
                                                    onClick={() => handleCopyLink('fund', fund.id)}
                                                    title="Copy shareable link"
                                                    className="px-4 py-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl transition-all shadow-sm flex items-center justify-center"
                                                >
                                                    {copiedId === fund.id
                                                        ? <Icon name="check" className="w-4 h-4 text-green-600" />
                                                        : <Icon name="copy" className="w-4 h-4" />
                                                    }
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'Landlord' && (
                    <div className="animate-fade-in">
                         <div className="relative bg-white overflow-hidden">
                            <div className="max-w-7xl mx-auto">
                                <div className="relative z-10 pb-8 bg-white sm:pb-16 md:pb-20 lg:max-w-2xl lg:w-full lg:pb-28 xl:pb-32">
                                    <main className="mt-10 mx-auto max-w-7xl px-4 sm:mt-12 sm:px-6 md:mt-16 lg:mt-20 lg:px-8 xl:mt-28">
                                        <div className="sm:text-center lg:text-left">
                                            <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl md:text-6xl">
                                                <span className="block xl:inline">Modern Property</span>{' '}
                                                <span className="block text-primary">Management Simplified.</span>
                                            </h1>
                                            <p className="mt-3 text-base text-gray-500 sm:mt-5 sm:text-lg sm:max-w-xl sm:mx-auto md:mt-5 md:text-xl lg:mx-0">
                                                TaskMe Realty handles tenant screening, rent collection, maintenance, and compliance so you can enjoy passive income without the headache.
                                            </p>
                                            <div className="mt-5 sm:mt-8 sm:flex sm:justify-center lg:justify-start">
                                                <div className="rounded-md shadow">
                                                    <button onClick={() => handleOpenCallback('Landlord')} className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-bold rounded-md text-white bg-primary hover:bg-primary-dark md:py-4 md:text-lg md:px-10">
                                                        List Your Property
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </main>
                                </div>
                            </div>
                            <div className="lg:absolute lg:inset-y-0 lg:right-0 lg:w-1/2">
                                <img
                                    className="h-56 w-full object-cover sm:h-72 md:h-96 lg:w-full lg:h-full"
                                    src="https://images.unsplash.com/photo-1560518883-ce09059eeffa?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1050&q=80"
                                    alt="Modern building"
                                />
                            </div>
                        </div>
                        
                        <div className="bg-gray-50 py-20">
                             <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                                <div className="text-center mb-12">
                                    <h2 className="text-base text-primary font-semibold tracking-wide uppercase">Why Choose Us</h2>
                                    <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                                        Data-Driven Management
                                    </p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                     <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center hover:shadow-lg transition-shadow">
                                        <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
                                            <Icon name="tenants" className="w-8 h-8" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-800 mb-2">98% Occupancy</h3>
                                        <p className="text-gray-600">Our marketing reach and agent network ensures your units stay filled.</p>
                                     </div>
                                     <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center hover:shadow-lg transition-shadow">
                                        <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-green-600">
                                            <Icon name="payments" className="w-8 h-8" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-800 mb-2">Guaranteed Rent</h3>
                                        <p className="text-gray-600">Consistent monthly payouts on the 5th, backed by our financial reserves.</p>
                                     </div>
                                     <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center hover:shadow-lg transition-shadow">
                                        <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4 text-purple-600">
                                            <Icon name="analytics" className="w-8 h-8" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-800 mb-2">Real-Time Portal</h3>
                                        <p className="text-gray-600">Track collections, repairs, and financial reports from your phone 24/7.</p>
                                     </div>
                                </div>
                             </div>
                        </div>
                    </div>
                )}
                {viewMode === 'Partner' && (
                    <div className="animate-fade-in">
                        <div className="relative bg-gray-900 text-white overflow-hidden h-[400px] flex items-center">
                             <div className="absolute inset-0">
                                <img src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=80" className="w-full h-full object-cover opacity-30" alt="Handshake" />
                                <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/80 to-transparent"></div>
                            </div>
                            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
                                <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
                                    Grow With Us.
                                </h1>
                                <p className="text-xl text-gray-300 mb-8 max-w-2xl">
                                    Join our network of affiliates and service providers. Earn commissions and access a steady stream of jobs.
                                </p>
                            </div>
                        </div>

                        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                                {/* Affiliate Card */}
                                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-2xl transition-all">
                                    <div className="h-48 bg-purple-600 relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-br from-purple-600 to-indigo-700"></div>
                                        <div className="absolute bottom-0 right-0 p-6 opacity-20">
                                            <Icon name="branch" className="w-32 h-32 text-white" />
                                        </div>
                                        <div className="relative z-10 p-8 h-full flex flex-col justify-center">
                                            <h3 className="text-3xl font-bold text-white">Affiliate Partner</h3>
                                            <p className="text-purple-100">Earn for every referral.</p>
                                        </div>
                                    </div>
                                    <div className="p-8 flex-grow">
                                        <ul className="space-y-4 mb-8 text-gray-600">
                                            <li className="flex items-start"><Icon name="check" className="w-5 h-5 text-green-500 mr-2 mt-0.5"/> Earn up to KES 5,000 per tenant referral</li>
                                            <li className="flex items-start"><Icon name="check" className="w-5 h-5 text-green-500 mr-2 mt-0.5"/> Recurring commissions for property management</li>
                                            <li className="flex items-start"><Icon name="check" className="w-5 h-5 text-green-500 mr-2 mt-0.5"/> Access to marketing materials & dashboard</li>
                                        </ul>
                                        <button 
                                            onClick={() => { setRegistrationType('Affiliate'); setIsRegistrationOpen(true); }}
                                            className="w-full py-4 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 transition-colors shadow-lg"
                                        >
                                            Join as Affiliate
                                        </button>
                                    </div>
                                </div>

                                {/* Contractor Card */}
                                <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-2xl transition-all">
                                    <div className="h-48 bg-orange-600 relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-red-600"></div>
                                        <div className="absolute bottom-0 right-0 p-6 opacity-20">
                                            <Icon name="maintenance" className="w-32 h-32 text-white" />
                                        </div>
                                        <div className="relative z-10 p-8 h-full flex flex-col justify-center">
                                            <h3 className="text-3xl font-bold text-white">Service Provider</h3>
                                            <p className="text-orange-100">Get verified jobs instantly.</p>
                                        </div>
                                    </div>
                                    <div className="p-8 flex-grow">
                                        <ul className="space-y-4 mb-8 text-gray-600">
                                            <li className="flex items-start"><Icon name="check" className="w-5 h-5 text-green-500 mr-2 mt-0.5"/> Access to 1000+ managed units</li>
                                            <li className="flex items-start"><Icon name="check" className="w-5 h-5 text-green-500 mr-2 mt-0.5"/> Guaranteed payment upon job completion</li>
                                            <li className="flex items-start"><Icon name="check" className="w-5 h-5 text-green-500 mr-2 mt-0.5"/> Build your reputation with verified ratings</li>
                                        </ul>
                                        <button 
                                            onClick={() => { setRegistrationType('Contractor'); setIsRegistrationOpen(true); }}
                                            className="w-full py-4 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 transition-colors shadow-lg"
                                        >
                                            Join as Pro
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="bg-white border-t border-gray-200 mt-auto">
                <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center">
                    <p className="text-gray-400 text-sm">&copy; 2025 TaskMe Realty. All rights reserved.</p>
                    <div className="flex space-x-6 mt-4 md:mt-0">
                         <button className="text-gray-400 hover:text-gray-600 text-sm">Privacy</button>
                         <button className="text-gray-400 hover:text-gray-600 text-sm">Terms</button>
                         <button className="text-gray-400 hover:text-gray-600 text-sm">Contact</button>
                    </div>
                </div>
            </footer>

            {/* Modals */}
            {selectedFund && (
                <InvestmentModal 
                    fund={selectedFund} 
                    onClose={() => setSelectedFund(null)} 
                    referrerId={resolvedReferrerId}
                />
            )}
            
            {selectedUnit && (
                <UnitBookingModal unit={selectedUnit} onClose={() => setSelectedUnit(null)} referrerId={resolvedReferrerId} />
            )}

            {isCallbackOpen && (
                <CallbackModal 
                    type={callbackType} 
                    onClose={() => setIsCallbackOpen(false)} 
                    referrerId={resolvedReferrerId}
                />
            )}

            {isRegistrationOpen && (
                <RegistrationModal 
                    type={registrationType} 
                    onClose={() => setIsRegistrationOpen(false)} 
                />
            )}

            {isSelfRegOpen && (
                <SelfRegistrationModal
                    onClose={() => setIsSelfRegOpen(false)}
                    referrerId={resolvedReferrerId}
                    referralCodeRaw={referrerCode ?? undefined}
                />
            )}
        </div>
    );
};

export default ReferralLanding;
