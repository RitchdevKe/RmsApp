// @ts-nocheck

import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as LucideIcons from 'lucide-react';
import Icon from '../Icon';

import { useData } from '../../context/DataContext';
import { isUnitSafelyVacant } from '../../utils/unitOccupancy';
import { TenantRequest, RequestMessage, TaskPriority, TaskStatus, Task, TenantProfile, Message, OffboardingRecord } from '../../types';
import { printSection } from '../../utils/exportHelper';
import AdBanners from './AdBanners';
import ReferralFliers from './ReferralFliers';
import ReferralCalculator from './ReferralCalculator';
import { useProfileFirstName } from '../../hooks/useProfileFirstName';
import { supabase } from '../../utils/supabaseClient';
import { followStkPaymentCompletion } from '../../utils/stkPaymentFollowup';
import { buildStandardTenantPaymentPosting } from '../../utils/tenantPaymentPosting';
import { fmtDate } from '../../utils/date';
import { computeTenantCardBalance } from '../../utils/tenantCardBalance';
import { computeTenantMonthlyBalance, computeTenantTotalInvoicedForMonth } from '../../utils/tenantBalance';
import { computeAdvanceAllocation } from '../../utils/advanceAllocation';
import { determinePayee, PAYEE_AGENCY, PAYEE_LANDLORD } from '../../utils/paymentRouting';
import { getTenantRentStartAnchor } from '../../utils/tenantPaymentCycle';
import { getMonthlyRentStatus } from '../../utils/rentSchedule';
import ReferTenantModal from './ReferTenantModal';
import ReferAnyoneModal, { type ReferKind } from './ReferAnyoneModal';
import { generateUserReferralCode } from '../../utils/referralCode';
import PortalShell from './PortalShell';
import { usePortalGrowthActions } from './PortalGrowthModals';
import { useStandardWalletCards } from './walletCards';
import { normalizeMultiReceiptReference } from '../../utils/multiOccupancyLedger';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

// --- STK PUSH UI ---
const MpesaStkModal: React.FC<{ onClose: () => void; amount: number; tenant: TenantProfile; userId: string; leaseId?: string | null; allowEdit?: boolean; paybill?: string; accountRef?: string }> = ({ onClose, amount, tenant, userId, leaseId = null, allowEdit = true, paybill, accountRef }) => {
    const { updateTenant } = useData();
    const [step, setStep] = useState<'input' | 'processing' | 'success'>('input');
    const [phone, setPhone] = useState(tenant.phone);
    const [payAmount, setPayAmount] = useState<number>(Math.max(0, Number(amount) || 0));
    const [txCode, setTxCode] = useState('');
    const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!userId || !checkoutRequestId) return;

        return followStkPaymentCompletion(supabase, userId, checkoutRequestId, (row) => {
            if (String(row.status ?? '') === 'completed') {
                const ref = String(row.transaction_id ?? '');
                setTxCode(ref);
                setStep('success');
                setIsSubmitting(false);
                const payDate = getTodayIsoDate();
                const posting = buildStandardTenantPaymentPosting(tenant, payAmount, payDate, 'M-Pesa STK', ref);
                updateTenant(tenant.id, posting.updates);
            }
            if (String(row.status ?? '') === 'failed' || String(row.status ?? '') === 'cancelled') {
                setErrorMsg(String(row.result_desc ?? 'Payment did not complete.'));
                setStep('input');
                setIsSubmitting(false);
            }
        });
    }, [userId, checkoutRequestId]);  // eslint-disable-line react-hooks/exhaustive-deps

    const handlePay = async () => {
        setErrorMsg(null);
        if (!payAmount || payAmount < 1) {
            setErrorMsg('Enter an amount greater than 0.');
            return;
        }
        setIsSubmitting(true);
        setStep('processing');
        try {
            const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
                body: { phone, amount: payAmount, leaseId, userId },
            });
            if (error) throw error;
            const id = String((data as any)?.checkoutRequestId ?? '').trim();
            if (!id) throw new Error('CheckoutRequestID missing from STK response');
            setCheckoutRequestId(id);
            // stay on processing: user should complete prompt, callback flips to success
        } catch (e: any) {
            let msg = e?.message ?? 'Failed to initiate STK push.';
            // When edge functions return a JSON { error }, Supabase wraps it in an error object.
            // Best-effort parse so we can show the exact configured message.
            try {
                const ctx = e?.context;
                if (ctx && typeof ctx.json === 'function') {
                    const body = await ctx.json();
                    if (body?.error) msg = String(body.error);
                } else if (ctx && typeof ctx.text === 'function') {
                    const txt = await ctx.text();
                    if (txt) {
                        const parsed = JSON.parse(txt);
                        if (parsed?.error) msg = String(parsed.error);
                    }
                }
            } catch {
                // ignore parse issues
            }
            setErrorMsg(msg);
            setStep('input');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900/60 z-[1100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[450px] overflow-hidden relative border border-[#e0f0e0]" onClick={e => e.stopPropagation()}>
                <div className="absolute top-5 right-5 font-extrabold text-2xl text-[#1F9F21] select-none">M<span className="text-[#177D1A]">p</span>esa</div>

                {step === 'input' && (
                    <div className="p-8">
                        <div className="flex items-center mb-6 pb-4 border-b-2 border-[#e8f5e9]">
                            <div className="w-[50px] h-[50px] bg-[#1F9F21] rounded-xl flex items-center justify-center mr-4 shadow-lg shadow-[#1F9F21]/30">
                                <Icon name="wallet" className="w-6 h-6 text-white" />
                            </div>
                            <h2 className="text-[22px] font-bold text-[#1a365d]">Pay Rent</h2>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className="block mb-2 font-semibold text-[#2d3748] text-[15px]">Mobile Number</label>
                                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-3.5 border-2 border-[#c8e6c9] rounded-xl text-base focus:outline-none focus:border-[#1F9F21] focus:ring-4 focus:ring-[#1F9F21]/20 transition-all"/>
                            </div>
                            <div>
                                <label className="block mb-2 font-semibold text-[#2d3748] text-[15px]">
                                    Amount (KES)
                                    {allowEdit && <span className="ml-2 text-xs font-normal text-gray-500">Edit for partial payment</span>}
                                </label>
                                {allowEdit ? (
                                    <input
                                        type="number"
                                        min={1}
                                        value={payAmount || ''}
                                        onChange={e => setPayAmount(Math.max(0, Number(e.target.value) || 0))}
                                        className="w-full p-3.5 border-2 border-[#c8e6c9] rounded-xl text-base font-bold text-[#1a365d] focus:outline-none focus:border-[#1F9F21] focus:ring-4 focus:ring-[#1F9F21]/20 transition-all"
                                    />
                                ) : (
                                    <div className="w-full p-3.5 border-2 border-[#c8e6c9] bg-gray-50 rounded-xl text-base font-bold text-[#1a365d]">{payAmount.toLocaleString()}</div>
                                )}
                                <p className="text-xs text-gray-500 mt-1">Total due: KES {Number(amount).toLocaleString()}</p>
                            </div>
                            {errorMsg && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">
                                    {errorMsg}
                                </div>
                            )}
                            <div className="flex gap-3 pt-2">
                                <button onClick={onClose} className="flex-1 py-3.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                                <button onClick={handlePay} disabled={isSubmitting} className="flex-[2] bg-gradient-to-r from-[#1F9F21] to-[#177D1A] text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed">Pay Now</button>
                            </div>
                        </div>
                        {(paybill || accountRef) && (
                            <div className="mt-6 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 p-5 rounded-xl">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[#1F9F21] font-extrabold text-base">M<span className="text-[#177D1A]">p</span>esa</span>
                                    <span className="text-[11px] font-bold text-gray-500 uppercase">Pay via Paybill</span>
                                </div>
                                <p className="text-xs text-gray-600 mb-3">Prefer the M-Pesa menu? Use the details below.</p>
                                <ol className="text-[13px] text-gray-800 space-y-1.5">
                                    <li>1. M-PESA › Lipa na M-PESA › Pay Bill</li>
                                    <li className="flex items-center gap-2 flex-wrap">2. Business No: <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-green-300 text-green-700 tracking-wider">{paybill || '— not set —'}</span></li>
                                    <li className="flex items-center gap-2 flex-wrap">3. Account No: <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-green-300 text-green-700 tracking-wider uppercase">{accountRef || '— not set —'}</span></li>
                                    <li>4. Amount: <span className="font-bold">KES {Number(payAmount || amount).toLocaleString()}</span></li>
                                    <li>5. Enter M-PESA PIN and confirm.</li>
                                </ol>
                            </div>
                        )}
                    </div>
                )}

                {(step === 'processing' || step === 'success') && (
                    <div className="p-8 text-center">
                        {step === 'processing' && (
                            <div className="py-8">
                                <div className="w-16 h-16 border-4 border-[#1F9F21]/20 border-t-[#1F9F21] rounded-full animate-spin mx-auto mb-6"></div>
                                <p className="text-xl font-semibold text-[#1a365d] mb-2">Processing...</p>
                                <p className="text-[#4a904a] font-medium text-base">Check your phone for STK prompt</p>
                            </div>
                        )}
                        {step === 'success' && (
                            <div>
                                <div className="bg-[#e8f5e9] border-l-4 border-[#1F9F21] p-5 rounded-r-xl mb-6 text-left border border-[#c8e6c9]">
                                    <p className="text-lg text-[#1b5e20] font-semibold">Payment of <span className="text-[#1F9F21] font-bold text-2xl ml-1">KES {payAmount.toLocaleString()}</span> confirmed!</p>
                                </div>
                                <div className="text-left mb-6">
                                    <p className="text-[#4caf50] font-medium mb-1">Time: {new Date().toLocaleTimeString()}</p>
                                    <div className="bg-[#f1fdf1] p-3 rounded-lg border border-dashed border-[#1F9F21] text-center font-mono font-bold text-[#177D1A]">
                                        {txCode || checkoutRequestId || '—'}
                                    </div>
                                </div>
                                <button onClick={onClose} className="w-full py-3.5 bg-[#1F9F21] text-white font-bold rounded-xl shadow-lg">Done</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- INLINE PAY NOW PANEL (collapsible, attached to Rent Balance card) ---
const InlinePayPanel: React.FC<{
    amount: number;
    tenant: TenantProfile;
    userId: string;
    paybill?: string;
    accountRef?: string;
}> = ({ amount, tenant, userId, paybill, accountRef }) => {
    const { updateTenant } = useData();
    const [phone, setPhone] = useState(tenant.phone || '');
    const [payAmount, setPayAmount] = useState<number>(Math.max(0, Number(amount) || 0));
    const [step, setStep] = useState<'input' | 'processing' | 'success'>('input');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
    const [txCode, setTxCode] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!userId || !checkoutRequestId) return;
        return followStkPaymentCompletion(supabase, userId, checkoutRequestId, (row) => {
            if (String(row.status ?? '') === 'completed') {
                const ref = String(row.transaction_id ?? '');
                setTxCode(ref);
                setStep('success');
                setIsSubmitting(false);
                const payDate = getTodayIsoDate();
                const posting = buildStandardTenantPaymentPosting(tenant, payAmount, payDate, 'M-Pesa STK', ref);
                updateTenant(tenant.id, posting.updates);
            }
            if (String(row.status ?? '') === 'failed' || String(row.status ?? '') === 'cancelled') {
                setErrorMsg(String(row.result_desc ?? 'Payment did not complete.'));
                setStep('input');
                setIsSubmitting(false);
            }
        });
    }, [userId, checkoutRequestId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handlePay = async () => {
        setErrorMsg(null);
        if (!payAmount || payAmount < 1) { setErrorMsg('Enter an amount greater than 0.'); return; }
        setIsSubmitting(true);
        setStep('processing');
        try {
            const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
                body: { phone, amount: payAmount, leaseId: null, userId },
            });
            if (error) throw error;
            const id = String((data as any)?.checkoutRequestId ?? '').trim();
            if (!id) throw new Error('CheckoutRequestID missing from STK response');
            setCheckoutRequestId(id);
        } catch (e: any) {
            let msg = e?.message ?? 'Failed to initiate STK push.';
            try {
                const ctx = e?.context;
                if (ctx?.json) { const b = await ctx.json(); if (b?.error) msg = String(b.error); }
            } catch {}
            setErrorMsg(msg);
            setStep('input');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="rounded-2xl bg-white ring-1 ring-gray-200 shadow-sm p-4 animate-fade-in">
            {step === 'input' && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-[#e8f5e9]">
                        <span className="text-[#1F9F21] font-extrabold text-lg">M<span className="text-[#177D1A]">p</span>esa</span>
                        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Pay via M-Pesa</span>
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Mobile Number</label>
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                            className="w-full p-2.5 border-2 border-[#c8e6c9] rounded-lg text-sm focus:outline-none focus:border-[#1F9F21]" />
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-1">Amount (KES)</label>
                        <input type="number" min={1} value={payAmount || ''}
                            onChange={e => setPayAmount(Math.max(0, Number(e.target.value) || 0))}
                            className="w-full p-2.5 border-2 border-[#c8e6c9] rounded-lg text-sm font-bold text-[#1a365d] focus:outline-none focus:border-[#1F9F21]" />
                    </div>
                    {errorMsg && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg p-2">{errorMsg}</div>
                    )}
                    <button onClick={handlePay} disabled={isSubmitting}
                        className="w-full py-3 bg-gradient-to-r from-[#1F9F21] to-[#177D1A] text-white font-bold text-sm rounded-lg shadow-md disabled:opacity-70">
                        Pay via M-Pesa STK
                    </button>
                    {(paybill || accountRef) && (
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3 mt-1">
                            <p className="text-[11px] font-bold text-gray-600 uppercase mb-1.5">Or Pay via Paybill</p>
                            <ol className="text-[12px] text-gray-800 space-y-1">
                                <li>1. M-PESA › Lipa na M-PESA › Pay Bill</li>
                                <li className="flex items-center gap-1.5 flex-wrap">2. Business No: <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-green-300 text-green-700">{paybill || '—'}</span></li>
                                <li className="flex items-center gap-1.5 flex-wrap">3. Account No: <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-green-300 text-green-700 uppercase">{accountRef || '—'}</span></li>
                                <li>4. Amount: <span className="font-bold">KES {Number(payAmount || amount).toLocaleString()}</span></li>
                                <li>5. Enter M-PESA PIN and confirm.</li>
                            </ol>
                        </div>
                    )}
                </div>
            )}
            {step === 'processing' && (
                <div className="py-6 text-center">
                    <div className="w-12 h-12 border-4 border-[#1F9F21]/20 border-t-[#1F9F21] rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-base font-semibold text-[#1a365d]">Processing...</p>
                    <p className="text-xs text-[#4a904a] mt-1">Check your phone for the STK prompt</p>
                </div>
            )}
            {step === 'success' && (
                <div className="py-2">
                    <div className="bg-[#e8f5e9] border-l-4 border-[#1F9F21] p-3 rounded-r-lg mb-3">
                        <p className="text-sm text-[#1b5e20] font-semibold">Payment of <span className="text-[#1F9F21] font-bold ml-1">KES {payAmount.toLocaleString()}</span> confirmed!</p>
                    </div>
                    <div className="bg-[#f1fdf1] p-2.5 rounded-lg border border-dashed border-[#1F9F21] text-center font-mono font-bold text-[#177D1A] text-sm">
                        {txCode || checkoutRequestId || '—'}
                    </div>
                </div>
            )}
        </div>
    );
};

// --- VACATE NOTICE MODAL ---
const VacationNoticeModal: React.FC<{ tenant: TenantProfile; onClose: () => void }> = ({ tenant, onClose }) => {
    const { addOffboardingRecord, updateTenant } = useData();
    const [moveOutDate, setMoveOutDate] = useState('');
    const [acceptForfeiture, setAcceptForfeiture] = useState(false);
    const [done, setDone] = useState(false);

    const todayMs = new Date(new Date().toDateString()).getTime();
    const daysNotice = moveOutDate ? Math.round((new Date(moveOutDate).getTime() - todayMs) / 86400000) : null;
    const isShortNotice = daysNotice !== null && daysNotice < 30;

    // Check whether the current month's rent has been paid.
    const currentMonthRentPaid = (() => {
        if (tenant.status !== 'Overdue') return true; // not flagged overdue = current
        const now = new Date();
        const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        return (tenant.paymentHistory || []).some(p => p.date?.startsWith(thisMonth) && p.status === 'Paid');
    })();

    const canSubmit = daysNotice !== null && daysNotice > 0 && currentMonthRentPaid && (!isShortNotice || acceptForfeiture);

    const handleSubmit = () => {
        if (!canSubmit || !moveOutDate) return;
        const noticeDate = getTodayIsoDate();
        const record: OffboardingRecord = {
            id: `ob-${Date.now()}`,
            tenantId: tenant.id,
            tenantName: tenant.name,
            unit: tenant.unit,
            propertyId: tenant.propertyId,
            noticeDate,
            moveOutDate,
            status: 'Notice Given',
            inspectionStatus: 'Pending',
            utilityClearance: false,
            depositRefunded: false,
            keysReturned: false,
            securityDepositForfeited: isShortNotice && acceptForfeiture,
        };
        addOffboardingRecord(record);
        updateTenant(tenant.id, { status: 'Notice', leaseEnd: moveOutDate });
        setDone(true);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                            <Icon name="offboarding" className="w-5 h-5 text-orange-600" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800">Vacate Notice</h3>
                    </div>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-400" /></button>
                </div>

                {done ? (
                    <div className="text-center py-6 space-y-4">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <Icon name="check" className="w-8 h-8 text-green-600" />
                        </div>
                        <p className="text-lg font-bold text-gray-800">Notice Submitted</p>
                        <p className="text-sm text-gray-500">Your vacate notice has been recorded. The property team will be in touch to guide you through the exit process.</p>
                        <button onClick={onClose} className="w-full py-3 bg-primary text-white font-bold rounded-xl mt-2">Done</button>
                    </div>
                ) : (
                    <div className="space-y-5">
                        <div className="bg-gray-50 p-3 rounded-lg border text-sm">
                            <p className="font-bold text-gray-800">{tenant.name}</p>
                            <p className="text-gray-500">{tenant.unit} · {tenant.propertyName}</p>
                            {Number(tenant.depositPaid ?? 0) > 0 && (
                                <p className="text-xs mt-1 text-gray-500">Security Deposit Held: <span className="font-bold">KES {Number(tenant.depositPaid).toLocaleString()}</span></p>
                            )}
                        </div>
                        {!currentMonthRentPaid && (
                            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
                                <p className="text-sm font-bold text-red-800">⛔ Outstanding Rent</p>
                                <p className="text-sm text-red-700 mt-1">Your current month's rent is unpaid. Please clear your outstanding balance before submitting a vacate notice.</p>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Intended Move-Out Date</label>
                            <input
                                type="date"
                                value={moveOutDate}
                                min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                                onChange={e => { setMoveOutDate(e.target.value); setAcceptForfeiture(false); }}
                                className="w-full p-3 border-2 rounded-xl focus:outline-none focus:border-primary"
                            />
                            {daysNotice !== null && daysNotice > 0 && (
                                <p className="text-xs text-gray-500 mt-1">{daysNotice} day{daysNotice !== 1 ? 's' : ''} from today.</p>
                            )}
                        </div>
                        {isShortNotice && (
                            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 space-y-3">
                                <p className="text-sm font-bold text-amber-800">⚠ Notice Period Warning</p>
                                <ul className="text-sm text-amber-700 space-y-1.5 list-disc list-inside">
                                    <li>Vacate notice requires a minimum of <strong>30 days</strong>.</li>
                                    <li>Current month's rent must be fully paid before vacating.</li>
                                    <li>Vacating in less than 30 days means you <strong>forfeit your security deposit</strong>{Number(tenant.depositPaid ?? 0) > 0 ? ` of KES ${Number(tenant.depositPaid).toLocaleString()}` : ''}.</li>
                                </ul>
                                <label className="flex items-start gap-3 mt-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={acceptForfeiture}
                                        onChange={e => setAcceptForfeiture(e.target.checked)}
                                        className="w-4 h-4 mt-0.5 accent-amber-600 shrink-0"
                                    />
                                    <span className="text-sm text-amber-800 font-medium">I understand and agree to forfeit my security deposit to proceed with this move-out date.</span>
                                </label>
                            </div>
                        )}
                        <div className="flex gap-3 pt-2">
                            <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Cancel</button>
                            <button
                                onClick={handleSubmit}
                                disabled={!canSubmit}
                                className="flex-[2] py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Submit Notice
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const TenantPortal: React.FC = () => {
    const { tenants, updateTenant, tasks, addTask, messages, addMessage, currentUser, isDataLoading, systemSettings, properties, staff } = useData();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [generalTitle, setGeneralTitle] = useState('');
    const [generalDescription, setGeneralDescription] = useState('');
    const [messagesSubTab, setMessagesSubTab] = useState<'admin' | 'general'>('admin');
    const [isPayRentModalOpen, setIsPayRentModalOpen] = useState(false);
    const [isVacationModalOpen, setIsVacationModalOpen] = useState(false);
    const [isReferModalOpen, setIsReferModalOpen] = useState(false);
    const [serviceReferKind, setServiceReferKind] = useState<ReferKind | null>(null);
    useEffect(() => {
        const handler = (e: any) => {
            const k = (e?.detail?.kind || 'security') as ReferKind;
            setServiceReferKind(k);
        };
        window.addEventListener('taskme:open-refer-modal', handler as any);
        return () => window.removeEventListener('taskme:open-refer-modal', handler as any);
    }, []);
    const [selectedPortalKeys, setSelectedPortalKeys] = useState<Set<string>>(new Set());
    const [isBalanceBreakdownOpen, setIsBalanceBreakdownOpen] = useState(false);
    const [isPayNowOpen, setIsPayNowOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'payments' | 'maintenance' | 'messages' | 'browse' | null>(null);
    const [browseSearch, setBrowseSearch] = useState('');
    const [newMessageContent, setNewMessageContent] = useState('');
    // Helper to identify synthetic auto-generated multi-occupancy payments
    const isSyntheticMultiPayment = (p: any) => {
        if (!p) return false;
        const ref = String(p.reference || p.transaction_id || p.checkout_request_id || '').trim().toUpperCase();
        const method = String(p.method || '').trim();
        const status = String(p.status || '').trim();
        return ref.startsWith('MULTI-') || method === 'Multi-Occupancy Allocation' || status === 'Multi-Occupancy Allocation';
    };

    // Resolve the real TenantProfile (has paymentHistory, propertyId, unitId, etc.).
    // Match by id, email, or phone so a logged-in tenant sees their own data.
    const rawActiveUser = currentUser?.role === 'Tenant'
        ? tenants.find(t =>
            t.id === currentUser.id
            || (!!(currentUser as any).authUserId && t.authUserId === (currentUser as any).authUserId)
            || (!!currentUser.email && !!t.email && t.email.toLowerCase() === currentUser.email.toLowerCase())
            || (!!(currentUser as any).phone && !!t.phone && t.phone === (currentUser as any).phone)
        )
        : undefined;

    // Sanitize rawActiveUser payment history immediately on render frame
    const cleanActiveUser = useMemo(() => {
        if (!rawActiveUser) return rawActiveUser;
        const normalizedStatus = String(rawActiveUser.status || '').replace(/[\s_-]/g, '').toLowerCase();
        const isAwaitingAllocation = normalizedStatus === 'pendingapproval' || normalizedStatus === 'pendingallocation';
        let baseTenant = isAwaitingAllocation
            ? {
                ...rawActiveUser,
                propertyId: undefined,
                propertyName: undefined,
                unitId: undefined,
                unit: '',
                rentAmount: 0,
            }
            : rawActiveUser;
        if (rawActiveUser.occupancyType === 'Sub' && (rawActiveUser as any).mainTenantId) {
            const main = tenants.find(t => t.id === (rawActiveUser as any).mainTenantId);
            if (main) baseTenant = main;
        }
        const cleanHistory = (baseTenant.paymentHistory || []).filter(p => !isSyntheticMultiPayment(p));
        return { ...rawActiveUser, paymentHistory: cleanHistory };
    }, [rawActiveUser, tenants]);

    const [dbPayments, setDbPayments] = useState<any[]>([]);
    useEffect(() => {
        let cancelled = false;
        if (!cleanActiveUser) return;
        
        const targetTenantId = (cleanActiveUser as any).mainTenantId || cleanActiveUser.id;

        supabase
            .from('payments')
            .select('amount, created_at, source, transaction_id, checkout_request_id, matched_tenant_id')
            .eq('status', 'completed')
            .eq('matched_tenant_id', targetTenantId)
            .then(({ data, error }) => {
                if (!cancelled && data) {
                    const cleanData = data.filter(p => !isSyntheticMultiPayment(p));
                    setDbPayments(cleanData);
                }
            });
            
        return () => { cancelled = true; };
    }, [cleanActiveUser?.id, (cleanActiveUser as any)?.mainTenantId]);

    const activeUser = useMemo(() => {
        if (!cleanActiveUser) return cleanActiveUser;
        const history = (cleanActiveUser.paymentHistory || []).filter(p => !isSyntheticMultiPayment(p));
        
        const existingRefs = new Set(history.map(p => normalizeMultiReceiptReference(p.reference)).filter(Boolean));
        let added = false;
        for (const p of dbPayments) {
            const ref = normalizeMultiReceiptReference(p.transaction_id || p.checkout_request_id);
            if (ref && !existingRefs.has(ref) && !ref.startsWith('MULTI-')) {
                history.push({
                    date: String(p.created_at || '').split('T')[0],
                    amount: `KES ${Number(p.amount).toLocaleString()}`,
                    status: 'Paid',
                    method: p.source === 'c2b' ? 'M-Pesa (C2B)' : p.source === 'stk' ? 'M-Pesa (STK)' : 'M-Pesa',
                    reference: ref
                });
                existingRefs.add(ref);
                added = true;
            }
        }
        if (added) {
            history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        }
        return { ...cleanActiveUser, paymentHistory: history };
    }, [cleanActiveUser, dbPayments]);

    const { firstName, loading: profileLoading } = useProfileFirstName({ nameFallback: activeUser?.name });

    const myTasks = useMemo(() => {
        if (!activeUser) return [];
        return tasks.filter(t => t.tenant.name === activeUser.name && t.tenant.unit === activeUser.unit);
    }, [tasks, activeUser]);

    const myMessages = useMemo(() => {
        if (!activeUser) return [];
        return messages.filter(m => {
            const isDirect = m.recipient.name === activeUser.name || m.recipient.contact === activeUser.phone;
            const isGroup = m.recipient.name === 'Group: All Tenants' || 
                           (activeUser.propertyName && m.recipient.name.includes(activeUser.propertyName));
            const isSentByMe = m.recipient.name === 'Property Management' && m.isIncoming; 
            return isDirect || isGroup;
        }).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }, [messages, activeUser]);

    // Month selector: lets tenant scroll past months (since activation) and
    // any prepaid future months — mirroring Active Tenants > Balance
    // Overview. Defaults to the current month.
    const todayMonthIso = getCurrentMonthIso();
    const [viewMonthIso, setViewMonthIso] = useState<string>(todayMonthIso);
    const isViewingPastMonth = viewMonthIso < todayMonthIso;
    const isViewingPrepaidMonth = viewMonthIso > todayMonthIso;

    // Forward advance ladder for activeUser — drives prepaid future months.
    const prepaidLadder = useMemo(() => {
        if (!activeUser) return { months: [], paidUpToMonth: null, paidUpToLabel: null, partial: null, surplusRemaining: 0, bills: [] };
        try {
            const invoiced = computeTenantTotalInvoicedForMonth(activeUser as any, todayMonthIso);
            const bal = computeTenantMonthlyBalance(activeUser as any, todayMonthIso, { totalInvoiced: invoiced });
            const surplus = bal.isCredit ? bal.creditAmount : 0;
            return computeAdvanceAllocation(activeUser as any, surplus, todayMonthIso);
        } catch {
            return { months: [], paidUpToMonth: null, paidUpToLabel: null, partial: null, surplusRemaining: 0, bills: [] };
        }
    }, [activeUser, todayMonthIso]);

    const monthOptions = useMemo(() => {
        if (!activeUser) return [];
        const anchor = getTenantRentStartAnchor(activeUser as any);
        const startIso = anchor ? String(anchor).slice(0, 7) : todayMonthIso;
        const [sy, sm] = startIso.split('-').map(Number);
        const [ty, tm] = todayMonthIso.split('-').map(Number);
        const out: { iso: string; label: string; kind: 'past' | 'current' | 'prepaid' | 'partial' }[] = [];
        let y = sy, m = sm;
        while (y < ty || (y === ty && m <= tm)) {
            const iso = `${y}-${String(m).padStart(2, '0')}`;
            const dt = new Date(y, m - 1, 1);
            out.push({
                iso,
                label: dt.toLocaleString('default', { month: 'long', year: 'numeric' }),
                kind: iso === todayMonthIso ? 'current' : 'past',
            });
            m += 1;
            if (m > 12) { m = 1; y += 1; }
        }
        for (const fm of prepaidLadder.months) {
            const [fy, fmn] = fm.monthIso.split('-').map(Number);
            const dt = new Date(fy, fmn - 1, 1);
            out.push({
                iso: fm.monthIso,
                label: dt.toLocaleString('default', { month: 'long', year: 'numeric' }),
                kind: fm.fullyCovered ? 'prepaid' : 'partial',
            });
        }
        return out.reverse(); // newest first
    }, [activeUser, todayMonthIso, prepaidLadder]);

    const prepaidViewMonth = useMemo(() => {
        if (!isViewingPrepaidMonth) return null;
        return prepaidLadder.months.find(m => m.monthIso === viewMonthIso) || null;
    }, [isViewingPrepaidMonth, prepaidLadder, viewMonthIso]);

    // Total Due / breakdown for the selected month — mirrors Active Tenants
    // > Balance Overview exactly.
    const cardBalance = useMemo(() => {
        if (!activeUser) return null;
        const isCurrent = viewMonthIso === todayMonthIso;
        const lateInfoDelta = (() => {
            if (!isCurrent) return 0;
            try {
                const isPaidThisMonth = (activeUser.paymentHistory || [])
                    .some(p => p.status === 'Paid' && String(p.date || '').startsWith(viewMonthIso));
                const rentStat = getMonthlyRentStatus(activeUser as any, { isRentPaidThisMonth: isPaidThisMonth, asOfMonthIso: viewMonthIso });
                const [cCY, cCM] = viewMonthIso.split('-').map(Number);
                const cPrevDate = new Date(cCY, cCM - 2, 1);
                const cPrevIso = `${cPrevDate.getFullYear()}-${String(cPrevDate.getMonth() + 1).padStart(2, '0')}`;
                const prevRentStat = getMonthlyRentStatus(activeUser as any, { asOfMonthIso: cPrevIso });
                return Math.max(0, rentStat.automatedLateFine - prevRentStat.automatedLateFine);
            } catch {
                return 0;
            }
        })();
        return computeTenantCardBalance(activeUser as any, viewMonthIso, {
            automatedLateFine: lateInfoDelta,
            isAllocated: !!activeUser.propertyId || !!activeUser.unit,
        });
    }, [activeUser, viewMonthIso, todayMonthIso]);

    const balance = cardBalance ? Math.max(0, cardBalance.totalDue) : 0;
    
    // Payment Routing Engine Context
    const activeProperty = useMemo(() => {
        if (!activeUser?.propertyId) return null;
        return properties.find(p => p.id === activeUser.propertyId) || null;
    }, [activeUser, properties]);
    
    const activeLandlord = useMemo(() => {
        if (!activeProperty?.landlordId) return null;
        return staff.find(s => s.id === activeProperty.landlordId) || null;
    }, [activeProperty, staff]);

    const activeLandlordPaybill = activeLandlord?.mpesaConfig?.paybill || activeProperty?.landlordPaybill;

    const portalLineItems = useMemo(() => {
        const items = cardBalance?.lineItems || [];
        // Determine first month rent
        const onboardIso = activeUser?.onboardedAt ? new Date(activeUser.onboardedAt).toISOString().slice(0, 7) : null;
        const isFirstMonth = onboardIso === viewMonthIso;
        
        return items
            .filter(i => i.amount > 0)
            .map(i => {
                const categoryRaw = i.category || 'Rent';
                const payee = determinePayee(categoryRaw, activeProperty, isFirstMonth && categoryRaw === 'Rent');
                return { key: i.key, label: i.label, amount: i.amount, category: i.category, payee };
            });
    }, [cardBalance, activeProperty, activeUser, viewMonthIso]);

    const portalSelectedTotal = useMemo(() => {
        if (selectedPortalKeys.size === 0) return balance;
        return portalLineItems.filter(i => selectedPortalKeys.has(i.key)).reduce((s, i) => s + i.amount, 0);
    }, [selectedPortalKeys, portalLineItems, balance]);

    const itemsToPay = useMemo(() => {
        const items = selectedPortalKeys.size === 0 ? portalLineItems : portalLineItems.filter(i => selectedPortalKeys.has(i.key));
        const landlordTotal = items.filter(i => i.payee === PAYEE_LANDLORD).reduce((s, i) => s + i.amount, 0);
        const agencyTotal = items.filter(i => i.payee === PAYEE_AGENCY).reduce((s, i) => s + i.amount, 0);
        return { landlordTotal, agencyTotal };
    }, [selectedPortalKeys, portalLineItems]);

    const togglePortalKey = (key: string) => setSelectedPortalKeys(prev => {
        const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s;
    });

    const handleSubmitMaintenanceRequest = () => {
        if (!title.trim() || !description.trim()) return alert('Please enter title and description.');
        const newReq: TenantRequest = {
            id: `req-${Date.now()}`,
            type: 'Maintenance',
            title,
            description,
            date: getTodayIsoDate(),
            status: 'Pending',
            priority: 'Medium',
            messages: []
        };
        const newTask: Task = {
            id: `TASK-${Date.now()}`,
            title,
            description,
            status: TaskStatus.Issued,
            priority: TaskPriority.Medium,
            dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
            sla: 48,
            assignedTo: 'Unassigned',
            tenant: { name: activeUser.name, unit: activeUser.unit },
            property: activeUser.propertyName || 'Unknown',
            comments: [],
            history: [{ id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: 'Reported by Tenant' }],
            attachments: [],
            source: 'Internal',
            costs: { labor: 0, materials: 0, travel: 0 }
        };
        addTask(newTask);
        newReq.status = 'Converted to Task';
        newReq.taskId = newTask.id;
        updateTenant(activeUser.id, { requests: [...(activeUser.requests || []), newReq] });
        alert('Maintenance request submitted!');
        setTitle('');
        setDescription('');
    };

    const handleSubmitGeneralRequest = () => {
        if (!generalTitle.trim() || !generalDescription.trim()) return alert('Please enter a subject and details.');
        const newReq: TenantRequest = {
            id: `req-${Date.now()}`,
            type: 'General',
            title: generalTitle,
            description: generalDescription,
            date: getTodayIsoDate(),
            status: 'Pending',
            priority: 'Medium',
            messages: []
        };
        updateTenant(activeUser.id, { requests: [...(activeUser.requests || []), newReq] });
        alert('General request submitted!');
        setGeneralTitle('');
        setGeneralDescription('');
    };

    const handleSendMessage = () => {
        if (!newMessageContent.trim()) return;
        const msg: Message = {
            id: `msg-${Date.now()}`,
            recipient: { name: 'Property Management', contact: 'Admin' }, // Sending to Admin
            content: `From ${activeUser.name} (${activeUser.unit}): ${newMessageContent}`,
            channel: 'App',
            status: 'Sent',
            timestamp: new Date().toLocaleString(),
            priority: 'Normal',
            isIncoming: true // Marked as incoming for the admin dashboard
        };
        addMessage(msg);
        setNewMessageContent('');
        alert('Message sent to Property Management.');
    };

    const handleDownloadStatement = () => {
        printSection('payment-history-table', `Statement_${activeUser.name}`);
    };

    // Resolve this tenant's Paybill account reference (unit tag). Tenants read
    // this off their dashboard and type it at the M-Pesa Paybill account prompt
    // when paying manually (C2B). The confirmation callback matches it back.
    // Fallback: if propertyId/unitId are not set, match by unit number string.
    // NOTE: must stay above the early return to obey React's Rules of Hooks.
    const allVacantUnits = useMemo(() =>
        (properties || []).flatMap(p =>
            p.units
                .filter(u => isUnitSafelyVacant(u, tenants, p))
                .map(u => {
                    const rent = u.rent || p.defaultMonthlyRent || 0;
                    const depReq = (p as any).deposit?.required !== false;
                    const depMonths = Number((p as any).deposit?.months || 1);
                    const deposit = depReq && rent > 0 ? rent * depMonths : 0;
                    return {
                        id: u.id,
                        unitNumber: u.unitNumber,
                        propertyName: p.name,
                        location: p.subLocation && p.zone ? `${p.subLocation} (${p.zone})` : (p.subLocation || p.zone || p.location || p.branch || ''),
                        type: (u as any).unitType || p.type || '',
                        rent,
                        deposit,
                        image: p.profilePictureUrl || '',
                        pinLocationUrl: p.pinLocationUrl || '',
                        phone: p.contactPhone || '',
                    };
                })
        )
    , [properties, tenants]);


    const filteredBrowseUnits = useMemo(() => {
        const q = browseSearch.trim().toLowerCase();
        if (!q) return allVacantUnits;
        return allVacantUnits.filter(u =>
            (u.location || '').toLowerCase().includes(q) ||
            (u.type || '').toLowerCase().includes(q) ||
            u.propertyName.toLowerCase().includes(q) ||
            u.unitNumber.toLowerCase().includes(q)
        );
    }, [allVacantUnits, browseSearch]);

    const myUnit = useMemo(() => {
        if (!activeUser) return undefined;
        if (activeUser.propertyId && activeUser.unitId) {
            const p = (properties || []).find(pr => pr.id === activeUser.propertyId);
            const u = p?.units?.find(u => u.id === activeUser.unitId);
            if (u) return u;
        }
        const unitStr = (activeUser.unit || '').trim().toLowerCase();
        if (!unitStr) return undefined;
        for (const p of (properties || [])) {
            const u = p.units?.find(u => (u.unitNumber || '').trim().toLowerCase() === unitStr);
            if (u) return u;
        }
        return undefined;
    }, [activeUser, properties]);

    // Resolve the field agent assigned to this tenant's property — used in the
    // Contact Info panel in place of the previous Caretaker line.
    // NOTE: must stay above the early return to obey React's Rules of Hooks.
    const myProperty = useMemo(
        () => (properties || []).find(p => p.id === activeUser?.propertyId)
            || (properties || []).find(p => p.name === activeUser?.propertyName),
        [properties, activeUser?.propertyId, activeUser?.propertyName],
    );
    const fieldAgent = useMemo(
        () => (staff || []).find(s => s.id === (myProperty as any)?.assignedAgentId && s.role === 'Field Agent')
            || (staff || []).find(s => s.id === (myProperty as any)?.assignedAgentId),
        [staff, myProperty],
    );
    const growth = usePortalGrowthActions();
    const walletTrio = useStandardWalletCards(growth);

    if (!activeUser) {
        if (!isDataLoading && currentUser?.role === 'Tenant') {
            return (
                <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                    <h2 className="text-lg font-semibold text-amber-900">Profile pending</h2>
                    <p className="mt-2 text-sm text-amber-800">Your tenant profile is awaiting review. No property or unit has been allocated yet.</p>
                </div>
            );
        }
        return <div className="p-8 text-center">Loading Tenant Profile...</div>;
    }

    const normalizedTenantStatus = String(activeUser.status || '').replace(/[\s_-]/g, '').toLowerCase();
    const isPendingApproval = normalizedTenantStatus === 'pendingapproval';
    const isPendingAllocation = normalizedTenantStatus === 'pendingallocation';
    if (isPendingApproval || isPendingAllocation) {
        return (
            <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
                <h2 className="text-lg font-semibold text-amber-900">
                    {isPendingApproval ? 'Pending approval' : 'Pending allocation'}
                </h2>
                <p className="mt-2 text-sm text-amber-800">
                    {isPendingApproval
                        ? 'Your application is awaiting approval. A property and unit will only appear after approval and allocation by the management team.'
                        : 'Your application is approved and awaiting unit allocation. No property or unit is currently assigned to you.'}
                </p>
            </div>
        );
    }

    const displayName = profileLoading
        ? 'Loading...'
        : ((firstName ?? '').trim() ? (firstName as string).trim() : activeUser.name);

    const hasLease = !!activeUser.propertyName && Number(activeUser.rentAmount ?? 0) > 0;
    const tenantReferralCode = (activeUser as any).referralCode || generateUserReferralCode(activeUser.name || '', activeUser.id);

    const myUnitTag = myUnit?.unitTag || activeUser?.unit || '';
    const agencyPaybill = systemSettings?.agencyPaybill || '';
    const canPayNow = Number(balance ?? 0) > 0;

    const officeLine = (systemSettings?.phone || '').trim() || '0736 712 300';

    // Mirror the Active Tenants > Balance Overview structure exactly so the
    // tenant sees the same Total Invoiced / payment breakdown / Total Due
    // numbers an admin sees on the back office.
    const advanceFromPriorMonths = Number(cardBalance?.advanceFromPriorMonths ?? 0);

    // When viewing a prepaid future month, override the per-month figures
    // with the ladder snapshot so the breakdown shows what was billed for
    // that month and how the prepayment was applied.
    const displayedAmountPaid = prepaidViewMonth ? prepaidViewMonth.applied : Number(cardBalance?.amountPaidThisMonth ?? 0);
    const displayedAdvanceFromPrior = prepaidViewMonth ? 0 : advanceFromPriorMonths;
    const displayedTotalInvoiced = prepaidViewMonth ? prepaidViewMonth.totalExpected : Number(cardBalance?.totalInvoiced ?? 0);
    const displayedBalanceDue = prepaidViewMonth
        ? prepaidViewMonth.totalExpected - prepaidViewMonth.applied
        : (cardBalance?.totalDue ?? 0);
    const displayedIsCredit = prepaidViewMonth ? false : !!cardBalance?.isCredit;
    const displayedCreditAmount = prepaidViewMonth ? 0 : Number(cardBalance?.creditAmount ?? 0);
    const prepaidChargeItems = prepaidViewMonth
        ? [{ key: `prepaid:${prepaidViewMonth.monthIso}`, label: `Billed for ${prepaidViewMonth.monthLabel}`, amount: prepaidViewMonth.totalExpected, category: 'rent' as const }]
        : null;
    const displayedChargeItems = prepaidChargeItems ?? portalLineItems;
    const hasAnyPayment = displayedAmountPaid + displayedAdvanceFromPrior > 0;
    const chargeItems = displayedChargeItems; // positive charges only (already filtered)

    return (
        <div className="space-y-3 pb-16 -mt-4 md:mt-0">
            {/* Rent Balance card — sized to match the wallet cards row below.
                Collapsed: compact single-column card with pay icon top-right.
                Expanded: a breakdown panel slides out below mirroring Active
                Tenants > Balance Overview. */}
            <div className="md:grid md:grid-cols-4 md:gap-3 -mx-4 px-2 md:mx-0 md:px-0">
                <div className="relative overflow-hidden rounded-2xl p-4 pt-5 text-white shadow-[0_16px_32px_-12px_rgba(0,0,0,0.3)] bg-gradient-to-br from-rose-600 via-rose-700 to-red-800 ring-1 ring-white/10 animate-fade-in">
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/20 opacity-60 pointer-events-none" />
                    <div aria-hidden className="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
                        <LucideIcons.CreditCard className="w-44 h-44" strokeWidth={1.6} />
                    </div>
                    <div aria-hidden className="absolute right-3 top-3 opacity-30 pointer-events-none">
                        <div className="grid grid-cols-4 gap-1">
                            {Array.from({ length: 12 }).map((_, k) => (
                                <div key={k} className="w-1 h-1 rounded-full bg-white/60" />
                            ))}
                        </div>
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/25 shadow-inner">
                                    <LucideIcons.CreditCard className="w-4 h-4" strokeWidth={1.8} />
                                </div>
                                <p className="text-sm font-semibold opacity-95 truncate">Rent Balance</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${canPayNow ? 'bg-rose-500/25 text-rose-50 ring-rose-200/40' : 'bg-emerald-500/25 text-emerald-50 ring-emerald-200/40'}`}>
                                    {canPayNow ? 'Due' : 'Cleared'}
                                </span>
                                {canPayNow && (
                                    <button
                                        type="button"
                                        onClick={() => setIsPayRentModalOpen(true)}
                                        title="Pay now"
                                        aria-label="Pay now"
                                        className="w-9 h-9 rounded-xl bg-white text-rose-700 ring-1 ring-white/40 hover:bg-rose-50 active:scale-95 transition flex items-center justify-center shadow-sm"
                                    >
                                        <LucideIcons.Wallet className="w-4 h-4" strokeWidth={2} />
                                    </button>
                                )}
                            </div>
                        </div>

                        <p className="text-[26px] leading-tight font-extrabold tracking-tight break-words drop-shadow-sm">
                            KES {Number(balance ?? 0).toLocaleString()}
                        </p>
                        <div className="mt-2">
                            <p className="text-[11px] opacity-85 flex items-center gap-1 min-w-0 truncate">
                                <span className="inline-block w-1 h-1 rounded-full bg-white/70 shrink-0" />
                                {activeUser.nextDueDate ? `Due ${fmtDate(activeUser.nextDueDate)}` : (canPayNow ? 'Payment due' : 'All settled')}
                            </p>
                            {cardBalance?.paidUpToStatus && (
                                <p className="text-[11px] mt-1 font-semibold text-emerald-100 bg-emerald-700/30 ring-1 ring-emerald-300/30 rounded-full px-2 py-0.5 inline-block max-w-full truncate">
                                    {cardBalance.paidUpToStatus}
                                </p>
                            )}
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                                {canPayNow && (
                                    <button
                                        type="button"
                                        onClick={() => setIsPayNowOpen(o => !o)}
                                        aria-expanded={isPayNowOpen}
                                        className="text-[11px] font-bold px-3 py-1 rounded-full bg-white text-rose-700 hover:bg-rose-50 ring-1 ring-white/40 flex items-center gap-1 shadow-sm active:scale-95 transition"
                                    >
                                        <LucideIcons.Wallet className="w-3 h-3" strokeWidth={2.2} />
                                        {isPayNowOpen ? 'Hide Pay' : 'Pay Now'}
                                        <LucideIcons.ChevronDown className={`w-3 h-3 transition-transform ${isPayNowOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                )}
                                {(chargeItems.length > 0 || hasAnyPayment) && (
                                    <button
                                        type="button"
                                        onClick={() => setIsBalanceBreakdownOpen(o => !o)}
                                        aria-expanded={isBalanceBreakdownOpen}
                                        className="text-[11px] font-bold px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 ring-1 ring-white/25 flex items-center gap-1"
                                    >
                                        {isBalanceBreakdownOpen ? 'Hide' : 'Rent Breakdown'}
                                        <LucideIcons.ChevronDown className={`w-3 h-3 transition-transform ${isBalanceBreakdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Expanded breakdown panel — mirrors Active Tenants > Balance Overview. */}
            {isBalanceBreakdownOpen && (
                <div className="rounded-2xl bg-white ring-1 ring-gray-200 shadow-sm p-4 animate-fade-in -mx-4 md:mx-0">
                    <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                        <h3 className="text-sm font-bold text-gray-800">Balance Overview</h3>
                        <div className="flex items-center gap-2 flex-wrap">
                            <select
                                value={viewMonthIso}
                                onChange={(e) => setViewMonthIso(e.target.value)}
                                className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                                title="View any past, current, or prepaid future month"
                            >
                                {monthOptions.map(opt => {
                                    const suffix = opt.kind === 'current' ? ' (current)'
                                        : opt.kind === 'prepaid' ? ' (Prepaid)'
                                        : opt.kind === 'partial' ? ' (Partial Prepayment)'
                                        : '';
                                    return (
                                        <option key={opt.iso} value={opt.iso}>
                                            {opt.label}{suffix}
                                        </option>
                                    );
                                })}
                            </select>
                            {isViewingPastMonth && (
                                <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Historical</span>
                            )}
                            {isViewingPrepaidMonth && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                    {prepaidViewMonth?.fullyCovered ? 'Prepaid' : 'Partial prepayment'}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="space-y-1.5 text-[13px] text-gray-700">
                        {chargeItems.map(item => (
                            <div key={item.key} className="flex justify-between gap-2">
                                <span className="truncate pr-2">{item.label}</span>
                                <span className="font-semibold tabular-nums">KES {Number(item.amount).toLocaleString()}</span>
                            </div>
                        ))}
                        <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-800">
                            <span>Total Invoiced</span>
                            <span className="tabular-nums">KES {Number(displayedTotalInvoiced).toLocaleString()}</span>
                        </div>
                        {displayedAdvanceFromPrior > 0 && (
                            <div className="flex justify-between items-start text-emerald-700 gap-3">
                                <div className="flex-1 min-w-0">
                                    <span className="font-medium">Advance Payment</span>
                                    {cardBalance?.paidUpToStatus && (
                                        <p className="text-[10px] text-emerald-600 mt-0.5 leading-snug">{cardBalance.paidUpToStatus}</p>
                                    )}
                                </div>
                                <span className="font-bold tabular-nums whitespace-nowrap">- KES {Number(displayedAdvanceFromPrior).toLocaleString()}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-center text-green-600">
                            <span className="font-medium">
                                {prepaidViewMonth ? 'Prepayment Applied' : 'Amount Paid (This Month)'}
                            </span>
                            <span className="font-bold tabular-nums">- KES {Number(displayedAmountPaid).toLocaleString()}</span>
                        </div>
                        <div className="border-t pt-3 mt-2 flex justify-between items-center">
                            <span className="font-bold text-gray-800 text-base">
                                {displayedIsCredit ? 'Advance Payment' : 'Total Due'}
                            </span>
                            <span className={`text-xl font-extrabold ${displayedIsCredit ? 'text-emerald-600' : displayedBalanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {displayedIsCredit ? '- ' : ''}KES {Number(displayedIsCredit ? displayedCreditAmount : Math.max(0, displayedBalanceDue)).toLocaleString()}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Inline Pay Now panel — collapsible, attached to Rent Balance card. */}
            {isPayNowOpen && canPayNow && (
                <div className="-mx-4 px-2 md:mx-0 md:px-0 space-y-4">
                    {itemsToPay.landlordTotal > 0 && (
                        <div>
                            <div className="bg-emerald-50 px-3 py-2 border-b border-emerald-100 flex items-center justify-between rounded-t-xl mt-4">
                                <span className="font-bold text-emerald-800 text-sm">Pay Landlord</span>
                                <span className="font-extrabold text-emerald-700 text-sm">KES {itemsToPay.landlordTotal.toLocaleString()}</span>
                            </div>
                            <InlinePayPanel
                                amount={itemsToPay.landlordTotal}
                                tenant={activeUser}
                                userId={String(currentUser?.id ?? activeUser.id)}
                                paybill={activeLandlordPaybill || agencyPaybill}
                                accountRef={myUnitTag}
                            />
                        </div>
                    )}
                    {/* Agency fee card removed — all tenant payments are routed
                        to a single paybill (landlord on Partial RMS, agency on
                        Full RMS). Agency fees are swept via B2B, not billed
                        separately to the tenant. */}
                    {itemsToPay.landlordTotal === 0 && itemsToPay.agencyTotal === 0 && (
                        <div className="bg-gray-50 text-gray-500 text-center py-4 rounded-xl text-sm font-medium border border-gray-200">
                            Please select an item to pay.
                        </div>
                    )}
                </div>
            )}




            {/* Mobile-first hero: contextual wallet cards + quick actions */}
            <PortalShell
                cards={[
                    {
                        label: 'Deposit Held',
                        value: `KES ${Number(activeUser.depositPaid ?? 0).toLocaleString()}`,
                        sublabel: `of ${Number(activeUser.depositExpected ?? 0).toLocaleString()} expected`,
                        iconNode: <LucideIcons.PiggyBank className="w-full h-full" strokeWidth={1.6} />,
                        gradient: 'from-slate-900 via-slate-800 to-slate-700',
                    },
                    ...walletTrio,
                ]}
                actions={[
                    { label: 'Pay Rent',     iconNode: <LucideIcons.CreditCard className="w-full h-full" strokeWidth={1.8} />, onClick: () => setIsPayRentModalOpen(true) },
                    { label: 'Maintenance',  iconNode: <LucideIcons.Wrench className="w-full h-full" strokeWidth={1.8} />,     onClick: () => setActiveTab('maintenance') },
                    { label: 'Messages',     iconNode: <LucideIcons.MessageCircle className="w-full h-full" strokeWidth={1.8} />, onClick: () => setActiveTab('messages'), badge: myMessages.filter(m => !(m as any).read).length || undefined },
                    { label: 'Browse Units', iconNode: <LucideIcons.Building2 className="w-full h-full" strokeWidth={1.8} />,   onClick: () => setActiveTab('browse') },
                    { label: 'Statement',    iconNode: <LucideIcons.Receipt className="w-full h-full" strokeWidth={1.8} />,    onClick: () => setActiveTab('payments') },
                    { label: 'Refer & Earn', iconNode: <LucideIcons.Gift className="w-full h-full" strokeWidth={1.8} />,       onClick: () => setIsReferModalOpen(true) },
                    { label: 'Move Out',     iconNode: <LucideIcons.LogOut className="w-full h-full" strokeWidth={1.8} />,     onClick: () => setIsVacationModalOpen(true) },
                    { label: 'My Profile',   iconNode: <LucideIcons.UserCircle className="w-full h-full" strokeWidth={1.8} />, onClick: () => { window.location.hash = '#/user-app-portal/my-profile'; } },
                    ...growth.actions,
                ]}
                metrics={[
                    { label: 'Unit',     value: myUnitTag || activeUser.unit || '—' },
                    { label: 'Property', value: activeUser.propertyName || '—' },
                    { label: 'Status',   value: activeUser.status || '—', tone: 'text-emerald-600' },
                    { label: 'Referral', value: tenantReferralCode, tone: 'text-primary' },
                ]}
            />
            {growth.modals}



            {/* Navigation Tabs */}
            <div className="flex bg-white rounded-2xl shadow-sm p-1 overflow-x-auto border border-gray-100">
                {(['dashboard', 'payments', 'maintenance', 'messages', 'browse'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(prev => prev === tab ? null : (tab as any))}
                        className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-sm capitalize transition-colors whitespace-nowrap ${
                            activeTab === tab ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                    >
                        {tab === 'browse' ? 'Available Units' : tab}
                    </button>
                ))}
            </div>

            {/* DASHBOARD TAB */}
            {activeTab === 'dashboard' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {isDataLoading ? (
                            <>
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
                                    <div className="h-3 w-28 bg-gray-200 rounded mb-3"></div>
                                    <div className="h-7 w-36 bg-gray-200 rounded mb-2"></div>
                                    <div className="h-3 w-24 bg-gray-200 rounded"></div>
                                    <div className="h-9 w-full bg-gray-200 rounded mt-6"></div>
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
                                    <div className="h-3 w-28 bg-gray-200 rounded mb-4"></div>
                                    <div className="space-y-3">
                                        <div className="h-4 w-full bg-gray-200 rounded"></div>
                                        <div className="h-4 w-full bg-gray-200 rounded"></div>
                                        <div className="h-4 w-full bg-gray-200 rounded"></div>
                                    </div>
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-pulse">
                                    <div className="h-3 w-28 bg-gray-200 rounded mb-4"></div>
                                    <div className="space-y-3">
                                        <div className="h-9 w-full bg-gray-200 rounded"></div>
                                        <div className="h-9 w-full bg-gray-200 rounded"></div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between">
                            <div>
                                <p className="text-xs font-bold text-gray-500 uppercase">Current Balance</p>
                                <p className={`text-3xl font-extrabold mt-1 ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    KES {Number(balance ?? 0).toLocaleString()}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                    {hasLease
                                        ? `Rent due: ${activeUser.rentDueDate ?? 5}${[11,12,13].includes(activeUser.rentDueDate ?? 5) ? 'th' : [1,21,31].includes(activeUser.rentDueDate ?? 5) ? 'st' : [2,22].includes(activeUser.rentDueDate ?? 5) ? 'nd' : [3,23].includes(activeUser.rentDueDate ?? 5) ? 'rd' : 'th'} of each month`
                                        : 'No active lease found'}
                                </p>
                                {portalLineItems.length > 0 && (
                                    <div className="mt-4 space-y-2 border-t pt-3">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Select items to pay</p>
                                        {portalLineItems.map(item => (
                                            <label key={item.key} className="flex items-center justify-between gap-2 cursor-pointer group">
                                                <span className="flex items-center gap-2 flex-1 min-w-0">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 accent-primary cursor-pointer shrink-0"
                                                        checked={selectedPortalKeys.has(item.key)}
                                                        onChange={() => togglePortalKey(item.key)}
                                                    />
                                                    <span className="text-sm text-gray-700 truncate group-hover:text-primary transition-colors">{item.label}</span>
                                                </span>
                                                <span className="text-sm font-bold text-gray-800 shrink-0">KES {Number(item.amount).toLocaleString()}</span>
                                            </label>
                                        ))}
                                        {selectedPortalKeys.size > 0 && (
                                            <p className="text-xs font-bold text-primary pt-2 border-t">
                                                Paying: KES {portalSelectedTotal.toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={() => setIsPayRentModalOpen(true)}
                                disabled={!canPayNow}
                                className={`w-full mt-4 py-2 font-bold rounded-lg shadow-md transition-colors ${canPayNow ? 'bg-primary text-white hover:bg-primary-dark' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
                            >
                                {selectedPortalKeys.size > 0 ? `Pay KES ${portalSelectedTotal.toLocaleString()}` : 'Pay Now'}
                            </button>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-3">Lease Details</p>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Status</span>
                                    {hasLease ? (
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold">{activeUser.status}</span>
                                    ) : (
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-bold">No active lease</span>
                                    )}
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Lease Ends</span>
                                    <span className="font-medium">
                                        {hasLease ? (activeUser.leaseEnd ? fmtDate(activeUser.leaseEnd) : 'Month-to-Month') : '—'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Rent</span>
                                    <span className="font-medium">
                                        KES {Number(activeUser.rentAmount ?? 0).toLocaleString()}{hasLease ? '' : ' (no lease)'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-3">Quick Actions</p>
                            <div className="space-y-2">
                                <button onClick={() => setActiveTab('maintenance')} className="w-full text-left p-2 rounded hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center">
                                    <Icon name="tools" className="w-4 h-4 mr-2 text-orange-500"/> Report Issue
                                </button>
                                <button onClick={() => setActiveTab('messages')} className="w-full text-left p-2 rounded hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center">
                                    <Icon name="mail" className="w-4 h-4 mr-2 text-blue-500"/> Contact Admin
                                </button>
                                <button
                                    onClick={() => setIsReferModalOpen(true)}
                                    className="w-full text-left p-2 rounded hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center"
                                >
                                    <Icon name="user-plus" className="w-4 h-4 mr-2 text-green-600"/> Refer a Tenant
                                </button>
                                <button
                                    onClick={() => setIsVacationModalOpen(true)}
                                    className="w-full mt-1 py-2.5 px-3 bg-orange-50 border-2 border-orange-300 text-orange-700 font-bold rounded-lg hover:bg-orange-100 transition-colors text-sm flex items-center justify-center gap-2"
                                >
                                    <Icon name="offboarding" className="w-4 h-4"/> Issue Vacate Notice
                                </button>
                            </div>
                        </div>
                            </>
                        )}
                    </div>

                    {/* Pay by M-Pesa Paybill — manual C2B route.
                        The Business No + Account No below are what the tenant types at the
                        Lipa na M-Pesa Pay Bill prompt. The C2B confirmation webhook uses
                        the account (unit tag) to match payment → unit → tenant. */}
                    {(agencyPaybill || myUnitTag) && (
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 p-6 rounded-xl shadow-sm">
                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div className="flex-1 min-w-[220px]">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-[#1F9F21] font-extrabold text-lg">M<span className="text-[#177D1A]">p</span>esa</span>
                                        <span className="text-xs font-bold text-gray-500 uppercase">Pay via Paybill</span>
                                    </div>
                                    <p className="text-sm text-gray-600 mb-4">
                                        Prefer to pay from the M-Pesa menu instead? Use the details below. The STK push above is faster, but both work.
                                    </p>
                                    <ol className="text-sm text-gray-800 space-y-2">
                                        <li>1. M-PESA &rsaquo; Lipa na M-PESA &rsaquo; Pay Bill</li>
                                        <li className="flex items-center gap-2 flex-wrap">
                                            2. Business Number:
                                            <span className="font-mono font-bold bg-white px-3 py-1 rounded border border-green-300 text-green-700 tracking-wider">
                                                {agencyPaybill || '— not set —'}
                                            </span>
                                        </li>
                                        <li className="flex items-center gap-2 flex-wrap">
                                            3. Account Number:
                                            <span className="font-mono font-bold bg-white px-3 py-1 rounded border border-green-300 text-green-700 tracking-wider uppercase">
                                                {myUnitTag || '— not set —'}
                                            </span>
                                        </li>
                                        <li>4. Amount: <span className="font-bold">KES {Number(portalSelectedTotal > 0 ? portalSelectedTotal : balance).toLocaleString()}</span></li>
                                        <li>5. Enter M-PESA PIN and confirm.</li>
                                    </ol>
                                </div>
                                <div className="bg-white rounded-lg border border-green-200 p-4 min-w-[180px]">
                                    <p className="text-[11px] font-bold text-gray-500 uppercase mb-1">Your Account</p>
                                    <p className="font-mono text-xl font-extrabold text-green-700 tracking-wider uppercase mb-1">{myUnitTag || '—'}</p>
                                    <p className="text-xs text-gray-500">{activeUser.unit} &bull; {activeUser.propertyName}</p>
                                </div>
                            </div>
                            {!myUnitTag && (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-4">
                                    Your unit has no Paybill account reference set yet. Contact your property manager — using the wrong account will delay reconciliation.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* PAYMENTS TAB */}
            {activeTab === 'payments' && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 animate-fade-in">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-gray-800">Payment History & Statements</h3>
                        <button onClick={handleDownloadStatement} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-bold flex items-center transition-colors">
                            <Icon name="download" className="w-4 h-4 mr-2" /> Download Statement
                        </button>
                    </div>
                    <div className="overflow-x-auto" id="payment-history-table">
                        <table className="min-w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                                <tr>
                                    <th className="px-3 py-3">Date</th>
                                    <th className="px-3 py-3">Ref</th>
                                    <th className="px-3 py-3">Method</th>
                                    <th className="px-3 py-3 text-right">Amount</th>
                                    <th className="px-3 py-3 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {(activeUser.paymentHistory || []).length > 0
                                    ? (activeUser.paymentHistory || []).map((pay, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="px-3 py-3 text-gray-600">{pay.date}</td>
                                            <td className="px-3 py-3 text-xs font-mono text-gray-500">{pay.reference}</td>
                                            <td className="px-3 py-3 text-gray-600">{pay.method}</td>
                                            <td className="px-3 py-3 text-right font-bold text-gray-800">KES {(parseFloat(String(pay.amount ?? '0').replace(/[^0-9.\-]/g, '')) || 0).toLocaleString()}</td>
                                            <td className="px-3 py-3 text-center"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pay.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{(pay.status || 'Paid').toUpperCase()}</span></td>
                                        </tr>
                                    ))
                                    : (
                                        <tr>
                                            <td colSpan={5} className="px-3 py-12 text-center text-gray-400 text-sm">No payment records found.</td>
                                        </tr>
                                    )
                                }
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* MAINTENANCE TAB */}
            {activeTab === 'maintenance' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-800 mb-1">Report Maintenance Issue</h3>
                        <p className="text-xs text-gray-500 mb-4">For general inquiries, use the <button onClick={() => setActiveTab('messages')} className="text-primary underline font-medium">Messages</button> tab.</p>
                        <div className="space-y-4">
                            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Subject (e.g. Leaking tap, broken lock)" className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" />
                            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the issue in detail..." rows={3} className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none" />
                            <button onClick={handleSubmitMaintenanceRequest} className="px-6 py-2 bg-gray-900 text-white font-bold rounded-lg hover:bg-black transition-colors w-full">
                                Submit Maintenance Ticket
                            </button>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <h3 className="text-lg font-bold text-gray-800 mb-4">Active Tasks</h3>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                            {myTasks.length > 0 ? myTasks.map(task => (
                                <div key={task.id} className="p-4 border rounded-lg hover:shadow-sm transition-shadow">
                                    <div className="flex justify-between items-start mb-1">
                                        <h4 className="font-bold text-gray-800 text-sm">{task.title}</h4>
                                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                            task.status === 'Completed' ? 'bg-green-100 text-green-800' :
                                            task.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                            'bg-yellow-100 text-yellow-800'
                                        }`}>{task.status}</span>
                                    </div>
                                    <p className="text-xs text-gray-600 mb-2 line-clamp-2">{task.description}</p>
                                    <p className="text-[10px] text-gray-400">Created: {task.history[0]?.timestamp}</p>
                                </div>
                            )) : (
                                <p className="text-gray-400 text-center py-8 text-sm">No active tasks.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MESSAGES TAB */}
            {activeTab === 'messages' && (
                <div className="space-y-4 animate-fade-in">
                    {/* Sub-tabs */}
                    <div className="flex bg-white rounded-xl shadow-sm p-1 border border-gray-100 w-fit">
                        <button
                            onClick={() => setMessagesSubTab('admin')}
                            className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
                                messagesSubTab === 'admin' ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            Messages
                        </button>
                        <button
                            onClick={() => setMessagesSubTab('general')}
                            className={`px-5 py-2 rounded-lg text-sm font-bold transition-colors ${
                                messagesSubTab === 'general' ? 'bg-primary/10 text-primary' : 'text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            General Requests
                            {(activeUser.requests || []).filter(r => r.type === 'General').length > 0 && (
                                <span className="ml-2 bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                                    {(activeUser.requests || []).filter(r => r.type === 'General').length}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Admin Messages */}
                    {messagesSubTab === 'admin' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[560px]">
                            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col">
                                <div className="p-4 border-b flex justify-between items-center">
                                    <h3 className="font-bold text-gray-800">Message Center</h3>
                                    <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">Property Management</span>
                                </div>
                                <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-gray-50/50">
                                    {myMessages.length > 0 ? myMessages.map(msg => (
                                        <div key={msg.id} className={`flex flex-col ${msg.recipient.name === 'Property Management' ? 'items-end' : 'items-start'}`}>
                                            <div className={`max-w-[80%] p-3 rounded-xl text-sm ${msg.recipient.name === 'Property Management' ? 'bg-primary text-white rounded-tr-none' : 'bg-white border border-gray-200 rounded-tl-none'}`}>
                                                <p>{msg.content}</p>
                                            </div>
                                            <span className="text-[10px] text-gray-400 mt-1 px-1">
                                                {msg.recipient.name.startsWith('Group') ? <span className="font-bold text-blue-500 mr-1">BROADCAST</span> : ''}
                                                {msg.timestamp}
                                            </span>
                                        </div>
                                    )) : (
                                        <p className="text-center text-gray-400 py-10">No messages yet.</p>
                                    )}
                                </div>
                                <div className="p-4 bg-white border-t">
                                    <div className="flex gap-2">
                                        <input
                                            value={newMessageContent}
                                            onChange={e => setNewMessageContent(e.target.value)}
                                            placeholder="Type a message to admin..."
                                            className="flex-grow p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                                            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                                        />
                                        <button onClick={handleSendMessage} className="px-4 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors">
                                            <Icon name="communication" className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit">
                                <h4 className="font-bold text-gray-700 mb-4 text-sm uppercase">Contact Info</h4>
                                <div className="space-y-4 text-sm">
                                    <div>
                                        <p className="text-gray-500 text-xs">Office Line</p>
                                        <p className="font-medium text-gray-800">{systemSettings?.companyName || 'TaskMe Office'}</p>
                                        <a href={`tel:${officeLine.replace(/\s/g,'')}`} className="text-blue-600 hover:underline">{officeLine}</a>
                                    </div>
                                    <div>
                                        <p className="text-gray-500 text-xs">Field Agent {myProperty?.name ? `· ${myProperty.name}` : ''}</p>
                                        {fieldAgent ? (
                                            <>
                                                <p className="font-medium text-gray-800">{fieldAgent.name}</p>
                                                <a href={`tel:${(fieldAgent.phone || '').replace(/\s/g,'')}`} className="text-blue-600 hover:underline">{fieldAgent.phone || '—'}</a>
                                            </>
                                        ) : (
                                            <p className="text-gray-400 italic text-xs">Not assigned yet — call the office line.</p>
                                        )}
                                    </div>
                                    <div className="pt-4 border-t">
                                        <p className="text-xs font-bold text-gray-500 uppercase mb-2">Emergency</p>
                                        <button className="w-full py-2 bg-red-50 text-red-600 font-bold rounded hover:bg-red-100 text-xs">
                                            Report Emergency
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* General Requests */}
                    {messagesSubTab === 'general' && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-1">Submit General Request</h3>
                                <p className="text-xs text-gray-500 mb-4">Inquiries, complaints, lease questions, or any non-maintenance matter.</p>
                                <div className="space-y-4">
                                    <input
                                        value={generalTitle}
                                        onChange={e => setGeneralTitle(e.target.value)}
                                        placeholder="Subject"
                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                    <textarea
                                        value={generalDescription}
                                        onChange={e => setGeneralDescription(e.target.value)}
                                        placeholder="Describe your request..."
                                        rows={4}
                                        className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                    <button onClick={handleSubmitGeneralRequest} className="w-full py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-colors">
                                        Submit Request
                                    </button>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="text-lg font-bold text-gray-800 mb-4">My General Requests</h3>
                                <div className="space-y-3 max-h-[420px] overflow-y-auto">
                                    {(activeUser.requests || []).filter(r => r.type === 'General').length > 0
                                        ? (activeUser.requests || []).filter(r => r.type === 'General').sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(req => (
                                            <div key={req.id} className="p-4 border rounded-lg hover:shadow-sm transition-shadow">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="font-bold text-gray-800 text-sm">{req.title}</h4>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                                                        req.status === 'Approved' ? 'bg-green-100 text-green-800' :
                                                        req.status === 'Under Review' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-yellow-100 text-yellow-800'
                                                    }`}>{req.status}</span>
                                                </div>
                                                <p className="text-xs text-gray-600 mb-1 line-clamp-2">{req.description}</p>
                                                <p className="text-[10px] text-gray-400">{req.date}</p>
                                            </div>
                                        ))
                                        : <p className="text-gray-400 text-center py-8 text-sm">No general requests yet.</p>
                                    }
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {isVacationModalOpen && (
                <VacationNoticeModal
                    tenant={activeUser}
                    onClose={() => setIsVacationModalOpen(false)}
                />
            )}

            {isReferModalOpen && (
                <ReferTenantModal
                    referrerId={activeUser.id}
                    referralCode={tenantReferralCode}
                    onClose={() => setIsReferModalOpen(false)}
                />
            )}
            {serviceReferKind && (
                <ReferAnyoneModal
                    referrerId={activeUser.id}
                    referralCode={tenantReferralCode}
                    initialKind={serviceReferKind}
                    onClose={() => setServiceReferKind(null)}
                />
            )}
            {isPayRentModalOpen && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center">
                    <MpesaStkModal
                        onClose={() => setIsPayRentModalOpen(false)}
                        amount={(itemsToPay.landlordTotal + itemsToPay.agencyTotal) > 0
                            ? (itemsToPay.landlordTotal + itemsToPay.agencyTotal)
                            : (balance > 0 ? balance : activeUser.rentAmount)}
                        tenant={activeUser}
                        userId={String(currentUser?.id ?? activeUser.id)}
                        leaseId={null}
                        paybill={activeLandlordPaybill || agencyPaybill}
                        accountRef={myUnitTag}
                    />
                </div>
            )}
            
            {/* BROWSE TAB */}
            {activeTab === 'browse' && (
                <div className="space-y-5 animate-fade-in">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <Icon name="vacant-house" className="w-5 h-5 text-primary" />
                                    Available Units
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">{allVacantUnits.length} unit{allVacantUnits.length !== 1 ? 's' : ''} currently available</p>
                            </div>
                            <div className="relative w-full sm:w-72">
                                <Icon name="search" className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={browseSearch}
                                    onChange={e => setBrowseSearch(e.target.value)}
                                    placeholder="Search by location or house type..."
                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-primary focus:border-primary outline-none"
                                />
                            </div>
                        </div>

                        {filteredBrowseUnits.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredBrowseUnits.map(unit => (
                                    <div key={unit.id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                                        <div className="h-36 bg-gray-100 relative">
                                            {unit.image
                                                ? <img src={unit.image} alt={unit.propertyName} className="w-full h-full object-cover" />
                                                : <div className="w-full h-full flex items-center justify-center"><Icon name="branch" className="w-12 h-12 text-gray-300" /></div>
                                            }
                                            <span className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">Available</span>
                                        </div>
                                        <div className="p-4">
                                            <p className="font-bold text-gray-800 text-sm truncate">{unit.unitNumber} — {unit.propertyName}</p>
                                            {unit.type && <p className="text-xs text-primary font-semibold mt-0.5">{unit.type}</p>}
                                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                <Icon name="map-pin" className="w-3 h-3" /> {unit.location || 'Location not set'}
                                            </p>
                                            <p className="text-sm font-extrabold text-gray-800 mt-2">KES {Number(unit.rent).toLocaleString()} <span className="font-normal text-gray-400 text-xs">/ mo</span></p>
                                            {unit.deposit > 0 && (
                                                <p className="text-[11px] text-gray-500 mt-0.5">Deposit: <span className="font-semibold text-gray-700">KES {Number(unit.deposit).toLocaleString()}</span></p>
                                            )}
                                            <div className="flex gap-2 mt-3">
                                                {unit.phone ? (
                                                    <a
                                                        href={`https://wa.me/${unit.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi, I'm interested in ${unit.unitNumber} at ${unit.propertyName} (${unit.location}).`)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex-1 text-center py-2 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors"
                                                    >
                                                        Enquire
                                                    </a>
                                                ) : (
                                                    <button
                                                        onClick={() => setActiveTab('messages')}
                                                        className="flex-1 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-dark transition-colors"
                                                    >
                                                        Enquire
                                                    </button>
                                                )}
                                                {unit.pinLocationUrl && (
                                                    <a
                                                        href={unit.pinLocationUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-3 py-2 border border-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors"
                                                    >
                                                        Map
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-16 text-center">
                                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Icon name="check" className="w-8 h-8 text-green-500" />
                                </div>
                                <p className="font-bold text-gray-700">
                                    {browseSearch ? 'No units match your search' : 'No units available right now'}
                                </p>
                                <p className="text-sm text-gray-400 mt-1">
                                    {browseSearch ? 'Try a different location or house type' : 'Check back soon!'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Earn-with-referrals fliers */}
            <ReferralFliers />
            <ReferralCalculator />

            {/* Advertising Banners */}
            <AdBanners section="listings" />
        </div>
    );
};

export default TenantPortal;
