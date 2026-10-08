
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useData } from '../../context/DataContext';
import { TenantProfile } from '../../types';
import Icon from '../Icon';
import { supabase } from '../../utils/supabaseClient';
import { followStkPaymentCompletion } from '../../utils/stkPaymentFollowup';
import { buildStandardTenantPaymentPosting } from '../../utils/tenantPaymentPosting';
import { communicationApi } from '../../utils/communicationApi';
import { fetchAllCompletedPayments } from '../../utils/payments';
import { fmtDateYY } from '../../utils/date';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

// DB row shape from public.payments (selected columns).
interface PaymentRow {
    id: string;
    created_at: string;
    source: 'stk' | 'c2b' | 'manual';
    status: string;
    reconciliation_status: string;
    amount: number;
    transaction_id: string | null;
    checkout_request_id: string | null;
    bill_ref_number: string | null;
    msisdn: string | null;
    phone: string | null;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    matched_tenant_id: string | null;
    matched_unit_id: string | null;
    paired_payment_id: string | null;
    result_desc: string | null;
    // Injected client-side when two rows (STK + C2B) are paired so we render
    // a single Inbound row with a "STK + C2B" badge instead of duplicates.
    _pairedSources?: Array<'stk' | 'c2b' | 'manual'>;
}

type SourceFilter = 'all' | 'stk' | 'c2b' | 'manual';

const SOURCE_META: Record<PaymentRow['source'], { label: string; className: string }> = {
    stk:    { label: 'STK',    className: 'bg-green-100 text-green-700 border-green-200' },
    c2b:    { label: 'C2B',    className: 'bg-blue-100 text-blue-700 border-blue-200' },
    manual: { label: 'Manual', className: 'bg-gray-100 text-gray-700 border-gray-200' },
};

function formatKes(amount: number) {
    return `KES ${Number(amount ?? 0).toLocaleString()}`;
}

function parseAmount(amount: any): number {
    if (amount === null || amount === undefined) return 0;
    if (typeof amount === 'number') {
        return isNaN(amount) ? 0 : amount;
    }
    const cleaned = String(amount).replace(/[^0-9.]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

function senderName(row: PaymentRow): string {
    const names = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ').trim();
    return names || row.phone || row.msisdn || '—';
}

const PAYMENT_TARGET_STATUSES = new Set(['Active', 'Overdue', 'Notice', 'PendingPayment']);

// --- MODALS (Payment Flow) ---

const PaymentMethodModal: React.FC<{
    onClose: () => void;
    onSelectMethod: (method: 'M-Pesa' | 'Bank' | 'Cash', tenant: TenantProfile) => void;
    tenants: TenantProfile[];
}> = ({ onClose, onSelectMethod, tenants }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTenant, setSelectedTenant] = useState<TenantProfile | null>(null);

    const filteredTenants = tenants.filter(t =>
        PAYMENT_TARGET_STATUSES.has(t.status) && (
            t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.unit.toLowerCase().includes(searchQuery.toLowerCase())
        )
    ).slice(0, 5);

    return (
        <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Record New Payment</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>

                {!selectedTenant ? (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600">First, select the tenant paying.</p>
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search Tenant Name or Unit..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full p-3 border rounded-lg focus:ring-primary focus:border-primary"
                        />
                        <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                            {filteredTenants.map(t => (
                                <div
                                    key={t.id}
                                    onClick={() => setSelectedTenant(t)}
                                    className="p-3 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                                >
                                    <div>
                                        <p className="font-bold text-sm text-gray-800">{t.name}</p>
                                        <p className="text-xs text-gray-500">{t.propertyName} - {t.unit}</p>
                                    </div>
                                    <Icon name="chevron-down" className="w-4 h-4 -rotate-90 text-gray-400" />
                                </div>
                            ))}
                            {filteredTenants.length === 0 && <p className="p-4 text-center text-gray-400 text-sm">No tenants found.</p>}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-blue-50 p-3 rounded-lg flex justify-between items-center mb-4">
                            <div>
                                <p className="text-xs text-blue-600 font-bold uppercase">Paying For</p>
                                <p className="font-bold text-blue-900">{selectedTenant.name}</p>
                                <p className="text-xs text-blue-700">{selectedTenant.unit}</p>
                            </div>
                            <button onClick={() => setSelectedTenant(null)} className="text-xs text-blue-600 hover:underline">Change</button>
                        </div>

                        <p className="text-sm font-bold text-gray-700 mb-2">Select Payment Method</p>
                        <div className="grid grid-cols-1 gap-3">
                            <button onClick={() => onSelectMethod('M-Pesa', selectedTenant)} className="flex items-center p-4 border rounded-lg hover:bg-green-50 hover:border-green-300 transition-all group">
                                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 mr-4 group-hover:bg-green-600 group-hover:text-white transition-colors">
                                    <Icon name="communication" className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-gray-800">M-Pesa STK Push</p>
                                    <p className="text-xs text-gray-500">Trigger payment to tenant's phone</p>
                                </div>
                            </button>
                            <button onClick={() => onSelectMethod('Bank', selectedTenant)} className="flex items-center p-4 border rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all group">
                                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                    <Icon name="stack" className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-gray-800">Bank Transfer</p>
                                    <p className="text-xs text-gray-500">Record EFT/RTGS or Cheque</p>
                                </div>
                            </button>
                            <button onClick={() => onSelectMethod('Cash', selectedTenant)} className="flex items-center p-4 border rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all group">
                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 mr-4 group-hover:bg-gray-600 group-hover:text-white transition-colors">
                                    <Icon name="wallet" className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-gray-800">Cash</p>
                                    <p className="text-xs text-gray-500">Record cash receipt</p>
                                </div>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Real STK push modal: invokes the mpesa-stk-push edge function and polls
// the payments row for completion. Replaces the previous mocked setTimeout flow.
const MpesaStkModal: React.FC<{
    onClose: () => void;
    tenant: TenantProfile;
    onComplete: () => void;
}> = ({ onClose, tenant, onComplete }) => {
    const { properties, updateTenant, addNotification, addMessage, systemSettings } = useData();
    const [step, setStep] = useState<'input' | 'processing' | 'success' | 'failed'>('input');
    const [phone, setPhone] = useState(tenant.phone || '');
    const [amount, setAmount] = useState(String(tenant.rentAmount || 0));
    const [txCode, setTxCode] = useState('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);

    const unitTag = (() => {
        if (!tenant?.propertyId || !tenant?.unitId) return null;
        const prop = properties.find(p => p.id === tenant.propertyId);
        const u = prop?.units?.find(x => x.id === tenant.unitId);
        const tag = String((u as any)?.unitTag ?? '').trim();
        return tag || null;
    })();

    useEffect(() => {
        if (!checkoutRequestId) return;
        return followStkPaymentCompletion(supabase, tenant.id, checkoutRequestId, (row) => {
            const s = String(row.status ?? '');
            if (s === 'completed') {
                setTxCode(String(row.transaction_id ?? checkoutRequestId));
                setStep('success');
            } else if (s === 'failed' || s === 'cancelled' || s === 'timed_out') {
                setErrorMsg(String(row.result_desc ?? 'Payment did not complete.'));
                setStep('failed');
            }
        });
    }, [checkoutRequestId, tenant.id]);

    const handlePay = async () => {
        if (!/^(?:\+?254|0)7\d{8}$/.test(phone.replace(/\s/g, ''))) {
            setErrorMsg('Please enter a valid Kenyan mobile number');
            return;
        }
        const amt = Math.round(Number(amount) || 0);
        if (amt <= 0) {
            setErrorMsg('Amount must be greater than zero');
            return;
        }
        if (!unitTag) {
            setErrorMsg(`This unit has no account tag. Add one under Registration → Properties → ${tenant.propertyName ?? 'this property'} → ${tenant.unit ?? 'unit'} before initiating STK.`);
            return;
        }
        setErrorMsg(null);
        setStep('processing');
        try {
            const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
                body: { phone, amount: amt, leaseId: tenant.id, unitTag },
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
            } catch { /* swallow */ }
            setErrorMsg(msg);
            setStep('failed');
        }
    };

    const handleFinish = async () => {
        const amt = Math.round(Number(amount) || 0);
        const payDate = getTodayIsoDate();
        const ref = txCode || `STK-${Date.now()}`;
        const posting = buildStandardTenantPaymentPosting(tenant, amt, payDate, 'M-Pesa STK', ref);
        updateTenant(tenant.id, posting.updates);
        addNotification({
            id: `notif-stk-${Date.now()}`,
            title: 'M-Pesa Payment Received',
            message: `${tenant.name} (${tenant.unit}) paid KES ${amt.toLocaleString()} via M-Pesa STK. Ref: ${ref}`,
            date: new Date().toLocaleString(),
            read: false,
            type: 'Success',
            recipientRole: 'Super Admin',
        });
        if (tenant.phone) {
            const pendingFines = (tenant.outstandingFines || []).filter((f: any) => f.status === 'Pending').reduce((s: number, f: any) => s + Number(f.amount ?? 0), 0);
            const balanceText = pendingFines > 0 ? ` Outstanding fines: KES ${pendingFines.toLocaleString()}.` : ' Your account is up to date.';
            const smsContent = `Dear ${tenant.name}, we have received your M-Pesa payment of KES ${amt.toLocaleString()} for ${tenant.unit}. Ref: ${ref}.${balanceText} Thank you. - TaskMe Realty`;
            const smsResult = await communicationApi.sendSMS(tenant.phone, smsContent, 'TASK-ME', systemSettings?.bulkSmsEnabled);
            addMessage({ id: `msg-stk-${Date.now()}`, recipient: { name: tenant.name, contact: tenant.phone }, content: smsContent, channel: 'SMS', status: smsResult.success ? 'Sent' : 'Failed', timestamp: new Date().toLocaleString(), priority: 'Normal', isIncoming: false });
        }
        onComplete();
    };

    return (
        <div className="fixed inset-0 bg-gray-900/60 z-[1400] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-[#e0f0e0]" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b-2 border-[#e8f5e9] flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#1F9F21] rounded-xl flex items-center justify-center shadow-lg shadow-[#1F9F21]/30">
                        <Icon name="wallet" className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-[#1a365d]">M-Pesa STK Push</h2>
                        <p className="text-sm text-gray-500">Requesting payment from {tenant.name}</p>
                    </div>
                </div>

                <div className="p-6">
                    {step === 'input' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone Number</label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={e => setPhone(e.target.value)}
                                    className="w-full p-3 border-2 border-[#c8e6c9] rounded-xl text-base focus:outline-none focus:border-[#1F9F21]"
                                    placeholder="07XXXXXXXX"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Amount (KES)</label>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    className="w-full p-3 border-2 border-[#c8e6c9] rounded-xl text-base focus:outline-none focus:border-[#1F9F21] font-bold"
                                />
                            </div>
                            {errorMsg && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">{errorMsg}</div>}
                            <div className="flex gap-3 pt-2">
                                <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Cancel</button>
                                <button onClick={handlePay} className="flex-[2] py-3 bg-gradient-to-r from-[#1F9F21] to-[#177D1A] text-white font-bold rounded-xl shadow-lg hover:shadow-xl">Send Request</button>
                            </div>
                        </div>
                    )}

                    {step === 'processing' && (
                        <div className="text-center py-6">
                            <div className="w-16 h-16 border-4 border-[#1F9F21]/20 border-t-[#1F9F21] rounded-full animate-spin mx-auto mb-6"></div>
                            <p className="text-xl font-semibold text-[#1a365d] mb-2">Sending Request…</p>
                            <p className="text-[#4a904a] font-medium">Ask the tenant to check their phone for the STK prompt.</p>
                        </div>
                    )}

                    {step === 'success' && (
                        <div>
                            <div className="bg-[#e8f5e9] border-l-4 border-[#1F9F21] p-4 rounded-r-xl mb-4">
                                <p className="text-[#1b5e20] font-semibold">Payment received!</p>
                            </div>
                            <div className="bg-[#f1fdf1] p-3 rounded-lg border border-dashed border-[#1F9F21] text-center font-mono font-bold text-[#177D1A] mb-4">
                                {txCode}
                            </div>
                            <button onClick={handleFinish} className="w-full py-3 bg-[#1F9F21] text-white font-bold rounded-xl shadow-lg">Done</button>
                        </div>
                    )}

                    {step === 'failed' && (
                        <div>
                            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl mb-4">
                                <p className="text-red-800 font-semibold">Payment did not complete.</p>
                                {errorMsg && <p className="text-sm text-red-700 mt-1">{errorMsg}</p>}
                            </div>
                            <div className="flex gap-3">
                                <button onClick={onClose} className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200">Close</button>
                                <button onClick={() => { setStep('input'); setCheckoutRequestId(null); setErrorMsg(null); }} className="flex-1 py-3 bg-[#1F9F21] text-white font-bold rounded-xl">Try Again</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ManualPaymentModal: React.FC<{
    onClose: () => void;
    tenant: TenantProfile;
    method: 'Bank' | 'Cash';
    onComplete: () => void;
}> = ({ onClose, tenant, method, onComplete }) => {
    const { updateTenant, addNotification, addMessage, systemSettings } = useData();
    const [amount, setAmount] = useState(String(tenant.rentAmount || 0));
    const [reference, setReference] = useState('');
    const [date, setDate] = useState(getTodayIsoDate());
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async () => {
        const amt = Number(amount);
        if (!amount || !Number.isFinite(amt) || amt <= 0) { setErrorMsg('Amount is required'); return; }
        if (!reference.trim()) { setErrorMsg('Reference is required'); return; }

        setIsSaving(true);
        setErrorMsg(null);
        try {
            const { error } = await supabase.rpc('record_manual_payment', {
                p_tenant_id: tenant.id,
                p_amount: amt,
                p_reference: reference.trim(),
                p_method: method,
                p_date: date,
            });
            if (error) throw error;

            // Update tenant profile in app state: paymentHistory, nextDueDate, depositPaid, status, etc.
            const normalizedRef = reference.trim() || `MAN-${Date.now()}`;
            const posting = buildStandardTenantPaymentPosting(tenant, amt, date, method, normalizedRef);
            updateTenant(tenant.id, posting.updates);
            addNotification({
                id: `notif-manual-${Date.now()}`,
                title: 'Payment Recorded',
                message: `${tenant.name} (${tenant.unit}) paid KES ${amt.toLocaleString()} via ${method}. Ref: ${normalizedRef}`,
                date: new Date().toLocaleString(),
                read: false,
                type: 'Success',
                recipientRole: 'Super Admin',
            });
            if (tenant.phone) {
                const pendingFines = (tenant.outstandingFines || []).filter((f: any) => f.status === 'Pending').reduce((s: number, f: any) => s + Number(f.amount ?? 0), 0);
                const balanceText = pendingFines > 0 ? ` Outstanding fines: KES ${pendingFines.toLocaleString()}.` : ' Your account is up to date.';
                const smsContent = `Dear ${tenant.name}, payment of KES ${amt.toLocaleString()} via ${method} for ${tenant.unit} has been recorded. Ref: ${normalizedRef}.${balanceText} Thank you. - TaskMe Realty`;
                const smsResult = await communicationApi.sendSMS(tenant.phone, smsContent, 'TASK-ME', systemSettings?.bulkSmsEnabled);
                addMessage({ id: `msg-manual-${Date.now()}`, recipient: { name: tenant.name, contact: tenant.phone }, content: smsContent, channel: 'SMS', status: smsResult.success ? 'Sent' : 'Failed', timestamp: new Date().toLocaleString(), priority: 'Normal', isIncoming: false });
            }
            onComplete();
        } catch (e: any) {
            setErrorMsg(e?.message ?? 'Failed to record payment');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1400] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-800 mb-4">Record {method} Payment</h3>
                <p className="text-xs text-gray-500 mb-4">For Tenant: <strong>{tenant.name}</strong> ({tenant.unit})</p>

                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Date Paid</label>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded"/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Amount (KES)</label>
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded font-bold"/>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Transaction Ref / Receipt No</label>
                        <input type="text" value={reference} onChange={e => setReference(e.target.value)} className="w-full p-2 border rounded" placeholder={method === 'Bank' ? 'e.g. FT2309...' : 'e.g. RCPT-001'}/>
                    </div>
                    {errorMsg && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-2">{errorMsg}</div>}
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-100 text-gray-700 rounded text-sm font-bold">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded text-sm font-bold hover:bg-primary-dark disabled:opacity-60">
                        {isSaving ? 'Saving…' : 'Record'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---

const Inbound: React.FC = () => {
    const { tenants, checkPermission, currentUser } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canPay = isSuperAdmin || checkPermission('Financials', 'pay');
    const [searchQuery, setSearchQuery] = useState('');
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
    const [pageSize, setPageSize] = useState(20);
    const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100];

    // Payment Modal State
    const [isPayModalOpen, setIsPayModalOpen] = useState(false);
    const [payStep, setPayStep] = useState<'method' | 'mpesa' | 'manual' | null>(null);
    const [selectedPayTenant, setSelectedPayTenant] = useState<TenantProfile | null>(null);
    const [selectedPayMethod, setSelectedPayMethod] = useState<'M-Pesa' | 'Bank' | 'Cash' | null>(null);

    const queryClient = useQueryClient();
    const { data: queryPayments, isLoading: queryIsLoading, error: queryError } = useQuery({
        queryKey: ['inbound_payments', 180],
        queryFn: () => fetchAllCompletedPayments(180),
        placeholderData: (prev: any) => prev,
        staleTime: 5 * 60 * 1000,
    });

    const payments = (queryPayments as PaymentRow[]) || [];
    const isLoading = queryIsLoading;
    const loadError = queryError ? (queryError as any).message : null;

    // Realtime subscription — inject directly into React Query cache instead of DB polling.
    useEffect(() => {
        const handlePayload = (payload: any) => {
            if (!payload.new || !payload.new.id) return;
            // Optimistically update the cache without hitting the database
            queryClient.setQueriesData({ queryKey: ['inbound_payments'] }, (oldData: any) => {
                if (!Array.isArray(oldData)) return oldData;
                const existingIdx = oldData.findIndex((p: any) => p.id === payload.new.id);
                if (existingIdx >= 0) {
                    const newData = [...oldData];
                    newData[existingIdx] = { ...oldData[existingIdx], ...payload.new };
                    return newData;
                }
                return [payload.new, ...oldData];
            });
        };

        const channel = supabase
            .channel('inbound-payments')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' }, handlePayload)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payments' }, handlePayload)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [queryClient]);

    const tenantsById = useMemo(() => {
        const m = new Map<string, TenantProfile>();
        for (const t of tenants) m.set(t.id, t);
        return m;
    }, [tenants]);

    // Collapse STK ↔ C2B pairs into a single row. The back-end pairing
    // (record_c2b_payment) points paired_payment_id at the sibling row, so we
    // pick one canonical row per pair (preferring C2B since it always carries
    // the MpesaReceiptNumber) and mark it with _pairedSources for the badge.
    const collapsedPayments = useMemo<PaymentRow[]>(() => {
        const byId = new Map<string, PaymentRow>(payments.map(p => [p.id, p]));
        const consumed = new Set<string>();
        const out: PaymentRow[] = [];
        for (const p of payments) {
            if (consumed.has(p.id)) continue;
            const twin = p.paired_payment_id ? byId.get(p.paired_payment_id) : undefined;
            if (twin && !consumed.has(twin.id)) {
                // Keep the C2B row (authoritative receipt#); fall back to STK.
                const canonical = p.source === 'c2b' ? p : (twin.source === 'c2b' ? twin : p);
                const other = canonical.id === p.id ? twin : p;
                consumed.add(p.id);
                consumed.add(twin.id);
                out.push({
                    ...canonical,
                    _pairedSources: [canonical.source, other.source],
                });
            } else {
                out.push(p);
                consumed.add(p.id);
            }
        }
        return out;
    }, [payments]);

    const filteredPayments = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        return collapsedPayments.filter(p => {
            if (sourceFilter !== 'all') {
                const sources = p._pairedSources ?? [p.source];
                if (!sources.includes(sourceFilter as any)) return false;
            }
            if (!q) return true;
            const matchedTenant = p.matched_tenant_id ? tenantsById.get(p.matched_tenant_id) : null;
            const hay = [
                matchedTenant?.name,
                matchedTenant?.unit,
                (matchedTenant as any)?.idNumber,
                p.transaction_id,
                p.checkout_request_id,
                p.bill_ref_number,
                p.msisdn,
                p.phone,
                senderName(p),
            ].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [collapsedPayments, searchQuery, sourceFilter, tenantsById]);

    const totalCollected = useMemo(() => {
        // "All time" = sum of all historical tenant payments PLUS unmatched all completed payments from database
        let historicalSum = 0;
        if (Array.isArray(tenants)) {
            tenants.forEach(t => {
                if (t && Array.isArray(t.paymentHistory)) {
                    t.paymentHistory.forEach(ph => {
                        if (ph) {
                            historicalSum += parseAmount(ph.amount);
                        }
                    });
                }
            });
        }
        const unmatchedPayments = payments.filter(p => !p.matched_tenant_id);
        const unmatchedSum = unmatchedPayments.reduce((sum, p) => sum + parseAmount(p.amount), 0);
        return historicalSum + unmatchedSum;
    }, [tenants, payments]);
    const unmatchedC2B = useMemo(() => payments.filter(p => p.source === 'c2b' && !p.matched_tenant_id).length, [payments]);

    const todaysInflow = useMemo(() => {
        if (!Array.isArray(payments)) return 0;
        const todayIso = getTodayIsoDate();
        return payments
            .filter(p => p.created_at?.slice(0, 10) === todayIso)
            .reduce((s, p) => s + parseAmount(p.amount), 0);
    }, [payments]);

    const mtdCollections = useMemo(() => {
        if (!Array.isArray(payments)) return 0;
        const currentMonthPrefix = getCurrentMonthIso();
        return payments
            .filter(p => p.created_at?.slice(0, 7) === currentMonthPrefix)
            .reduce((s, p) => s + parseAmount(p.amount), 0);
    }, [payments]);

    const handleOpenPaymentModal = () => {
        if (!canPay) return alert('You do not have permission to record payments.');
        setPayStep('method');
        setSelectedPayTenant(null);
        setIsPayModalOpen(true);
    };

    const handleMethodSelect = (method: 'M-Pesa' | 'Bank' | 'Cash', tenant: TenantProfile) => {
        setSelectedPayMethod(method);
        setSelectedPayTenant(tenant);
        if (method === 'M-Pesa') setPayStep('mpesa');
        else setPayStep('manual');
    };

    const handlePaymentComplete = () => {
        setIsPayModalOpen(false);
        setPayStep(null);
        setSelectedPayTenant(null);
        setSelectedPayMethod(null);
        loadPayments();
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Inbound Payments</h1>
                    <p className="text-lg text-gray-500 mt-1">Every rent collection — STK, Paybill (C2B), and manual — in one ledger.</p>
                </div>
                <div className="flex items-center gap-2">
                    {unmatchedC2B > 0 && (
                        <a
                            href="#/payments/reconciliation"
                            className="px-4 py-2 bg-amber-50 border-2 border-amber-300 text-amber-800 font-bold rounded-md hover:bg-amber-100 text-sm flex items-center"
                        >
                            <Icon name="info" className="w-4 h-4 mr-2" />
                            {unmatchedC2B} unmatched C2B — reconcile
                        </a>
                    )}
                    <button
                        onClick={handleOpenPaymentModal}
                        className="px-6 py-2 bg-primary text-white font-bold rounded-md hover:bg-primary-dark shadow-sm flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!canPay}
                    >
                        <Icon name="plus" className="w-5 h-5 mr-2" /> Record Payment
                    </button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-green-500">
                    <p className="text-gray-500 text-sm font-bold uppercase">Total Collected (View)</p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">{formatKes(totalCollected)}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-teal-500">
                    <p className="text-gray-500 text-sm font-bold uppercase">MTD Collections</p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">{formatKes(mtdCollections)}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-purple-500">
                     <p className="text-gray-500 text-sm font-bold uppercase">Today's Inflow</p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">{formatKes(todaysInflow)}</p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border-t-4 border-blue-500">
                     <p className="text-gray-500 text-sm font-bold uppercase">Transactions</p>
                    <p className="text-3xl font-bold text-gray-800 mt-2">{filteredPayments.length}</p>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
                    <div className="relative w-full max-w-md">
                        <input
                            type="text"
                            placeholder="Search by tenant, reference, phone, account…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-primary focus:border-primary"
                        />
                        <div className="absolute left-3 top-2.5 text-gray-400"><Icon name="search" className="w-5 h-5" /></div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <select
                            value={sourceFilter}
                            onChange={e => setSourceFilter(e.target.value as SourceFilter)}
                            className="border border-gray-200 rounded-lg bg-gray-50 px-3 py-2 text-sm font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                        >
                            <option value="all">All Methods</option>
                            <option value="stk">STK</option>
                            <option value="c2b">C2B</option>
                            <option value="manual">Manual</option>
                        </select>
                        <span className="text-xs text-gray-500 whitespace-nowrap">Rows:</span>
                        <select
                            value={pageSize}
                            onChange={e => setPageSize(Number(e.target.value))}
                            className="border border-gray-200 rounded-md text-sm px-2 py-1.5 focus:outline-none"
                        >
                            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{filteredPayments.length} total</span>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 uppercase font-bold text-xs">
                            <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Source</th>
                                <th className="px-4 py-3">Tenant / Sender</th>
                                <th className="px-4 py-3">Account Ref</th>
                                <th className="px-4 py-3">Reference</th>
                                <th className="px-4 py-3 text-right">Amount</th>
                                <th className="px-4 py-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isLoading && (
                                <tr><td colSpan={7} className="p-8 text-center text-gray-400">Loading payments…</td></tr>
                            )}
                            {!isLoading && loadError && (
                                <tr><td colSpan={7} className="p-8 text-center text-red-500">{loadError}</td></tr>
                            )}
                            {!isLoading && !loadError && filteredPayments.slice(0, pageSize).map((p) => {
                                const meta = SOURCE_META[p.source];
                                const matched = p.matched_tenant_id ? tenantsById.get(p.matched_tenant_id) : null;
                                const isUnmatched = p.source === 'c2b' && !p.matched_tenant_id;
                                const isPaired = Array.isArray(p._pairedSources) && p._pairedSources.length > 1;
                                return (
                                    <tr key={p.id} className={`hover:bg-gray-50 ${isUnmatched ? 'bg-amber-50/40' : ''}`}>
                                        <td className="px-4 py-3 text-gray-600">{fmtDateYY(p.created_at)}</td>
                                        <td className="px-4 py-3">
                                            {isPaired ? (
                                                <span
                                                    className="inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 border-emerald-200"
                                                    title="STK push + C2B confirmation merged into one payment"
                                                >
                                                    STK + C2B
                                                </span>
                                            ) : (
                                                <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${meta.className}`}>
                                                    {meta.label}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            {matched ? (
                                                <>
                                                    <p className="font-medium text-gray-900">{matched.name}</p>
                                                    <p className="text-xs text-gray-500">{matched.propertyName} &bull; {matched.unit}</p>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="font-medium text-gray-800">{senderName(p)}</p>
                                                    {isUnmatched && <p className="text-xs text-amber-700">Needs matching</p>}
                                                </>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs uppercase tracking-wider text-gray-600">{p.bill_ref_number || '—'}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.transaction_id || p.checkout_request_id || '—'}</td>
                                        <td className="px-4 py-3 text-right font-bold text-green-600">{formatKes(Number(p.amount))}</td>
                                        <td className="px-4 py-3 text-center">
                                            {isUnmatched ? (
                                                <span className="px-2 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">Unmatched</span>
                                            ) : (
                                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold">Paid</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {!isLoading && !loadError && filteredPayments.length === 0 && (
                                <tr><td colSpan={7} className="p-8 text-center text-gray-400">No payments found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Payment Modal Logic */}
            {isPayModalOpen && (
                <>
                    {payStep === 'method' && (
                        <PaymentMethodModal
                            tenants={tenants}
                            onClose={() => setIsPayModalOpen(false)}
                            onSelectMethod={handleMethodSelect}
                        />
                    )}
                    {payStep === 'mpesa' && selectedPayTenant && (
                        <MpesaStkModal
                            tenant={selectedPayTenant}
                            onClose={() => setIsPayModalOpen(false)}
                            onComplete={handlePaymentComplete}
                        />
                    )}
                    {payStep === 'manual' && selectedPayTenant && selectedPayMethod && selectedPayMethod !== 'M-Pesa' && (
                        <ManualPaymentModal
                            tenant={selectedPayTenant}
                            method={selectedPayMethod}
                            onClose={() => setIsPayModalOpen(false)}
                            onComplete={handlePaymentComplete}
                        />
                    )}
                </>
            )}
        </div>
    );
};

export default Inbound;
