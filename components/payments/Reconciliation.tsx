
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Icon from '../Icon';
import { useData } from '../../context/DataContext';
import { TenantProfile } from '../../types';
import { supabase } from '../../utils/supabaseClient';
import { buildStandardTenantPaymentPosting } from '../../utils/tenantPaymentPosting';
import { fetchAllCompletedPayments } from '../../utils/payments';
import { getTodayIsoDate } from '../../utils/timezone';

// Row shape from public.payments for the External Unmatched queue —
// C2B payments whose BillRefNumber did not resolve to an active tenant.
interface UnmatchedPayment {
    id: string;
    created_at: string;
    source: 'stk' | 'c2b' | 'manual';
    amount: number;
    transaction_id: string | null;
    bill_ref_number: string | null;
    msisdn: string | null;
    phone: string | null;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    result_desc: string | null;
}

const PAYMENT_TARGET_STATUSES = new Set(['Active', 'Overdue', 'Notice', 'PendingPayment']);

function senderName(row: UnmatchedPayment): string {
    const names = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ').trim();
    return String(names || row.phone || row.msisdn || 'Unknown sender');
}

// Modal to assign an unmatched C2B payment to a tenant.
const MatchTransactionModal: React.FC<{
    transaction: UnmatchedPayment;
    onClose: () => void;
    onMatch: (tenantId: string) => Promise<void>;
}> = ({ transaction, onClose, onMatch }) => {
    const { tenants } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTenantId, setSelectedTenantId] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const filteredTenants = tenants.filter(t =>
        PAYMENT_TARGET_STATUSES.has(t.status) && (
            String(t.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            String(t.unit || '').toLowerCase().includes(searchQuery.toLowerCase())
        )
    );

    const handleMatch = async () => {
        if (!selectedTenantId) return;
        setIsSaving(true);
        setErrorMsg(null);
        try {
            await onMatch(selectedTenantId);
        } catch (e: any) {
            setErrorMsg(e?.message ?? 'Failed to match payment');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold mb-4 text-gray-800">Match C2B Payment to Tenant</h3>

                <div className="bg-gray-50 p-4 rounded-lg mb-4 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                        <span className="text-gray-500">M-Pesa Receipt:</span>
                        <span className="font-mono font-semibold">{transaction.transaction_id || '—'}</span>
                        <span className="text-gray-500">Amount:</span>
                        <span className="font-bold text-green-600">KES {Number(transaction.amount).toLocaleString()}</span>
                        <span className="text-gray-500">Date:</span>
                        <span>{new Date(transaction.created_at).toLocaleString()}</span>
                        <span className="text-gray-500">Account Ref:</span>
                        <span className="font-mono uppercase tracking-wider">{transaction.bill_ref_number || '—'}</span>
                        <span className="text-gray-500">Sender:</span>
                        <span>{senderName(transaction)}</span>
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Search Tenant</label>
                    <input
                        type="text"
                        placeholder="Type name or unit..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full p-2 border rounded-md mb-2"
                    />
                    <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
                        {filteredTenants.map(t => (
                            <div
                                key={t.id}
                                onClick={() => setSelectedTenantId(t.id)}
                                className={`p-2 cursor-pointer hover:bg-blue-50 flex justify-between items-center ${selectedTenantId === t.id ? 'bg-blue-100' : ''}`}
                            >
                                <div>
                                    <p className="font-medium text-sm">{t.name}</p>
                                    <p className="text-xs text-gray-500">{t.propertyName} - {t.unit}</p>
                                </div>
                                {selectedTenantId === t.id && <Icon name="check" className="w-4 h-4 text-blue-600" />}
                            </div>
                        ))}
                        {filteredTenants.length === 0 && (
                            <p className="p-3 text-center text-xs text-gray-400">No tenants match your search.</p>
                        )}
                    </div>
                </div>

                {errorMsg && <p className="text-sm text-red-600 mb-3">{errorMsg}</p>}

                <div className="flex justify-end space-x-3">
                    <button onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-200 rounded-md text-gray-700 font-medium">Cancel</button>
                    <button
                        onClick={handleMatch}
                        disabled={!selectedTenantId || isSaving}
                        className="px-4 py-2 bg-primary text-white rounded-md font-medium disabled:opacity-50"
                    >
                        {isSaving ? 'Matching…' : 'Confirm Match'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Modal for Internal Payment Correction (Moving from A to B) — unchanged.
const PaymentCorrectionModal: React.FC<{
    payment: { reference?: string, amount?: string, date?: string };
    fromTenant?: TenantProfile | null;
    onClose: () => void;
    onConfirmMove: (toTenantId: string) => void;
}> = ({ payment, fromTenant, onClose, onConfirmMove }) => {
    const { tenants } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [targetTenantId, setTargetTenantId] = useState('');

    const targetTenants = useMemo(() => {
        if (!tenants || !Array.isArray(tenants)) return [];
        const q = (searchQuery || '').trim().toLowerCase();
        const fromId = fromTenant?.id;
        return tenants.filter(t => {
            if (!t || !t.id) return false;
            if (fromId && t.id === fromId) return false;
            if (!PAYMENT_TARGET_STATUSES.has(t.status)) return false;
            if (!q) return true;
            try {
                const name = String(t.name || '').toLowerCase();
                const unit = String(t.unit || '').toLowerCase();
                return name.includes(q) || unit.includes(q);
            } catch (e) {
                return false;
            }
        });
    }, [tenants, searchQuery, fromTenant]);

    return (
        <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center mb-4 text-red-600 bg-red-50 p-3 rounded-lg">
                    <Icon name="info" className="w-5 h-5 mr-2" />
                    <h3 className="text-sm font-bold uppercase">Confirm Payment Reassignment</h3>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg mb-4 text-sm border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-2">Moving Payment From:</p>
                    <div className="flex justify-between mb-3">
                        <span className="font-bold text-gray-800">{fromTenant?.name || 'Unknown'} ({fromTenant?.unit || 'N/A'})</span>
                    </div>
                    <hr className="border-gray-200 mb-3"/>
                    <div className="grid grid-cols-2 gap-2 text-gray-600">
                        <span>Reference:</span><span className="font-mono font-semibold text-gray-800">{payment?.reference || '—'}</span>
                        <span>Amount:</span><span className="font-bold text-green-600">{payment?.amount || '—'}</span>
                        <span>Date:</span><span>{payment?.date || '—'}</span>
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Move To (Select Tenant)</label>
                    <input
                        type="text"
                        placeholder="Search target tenant..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full p-2 border rounded-md mb-2"
                    />
                    <div className="max-h-40 overflow-y-auto border rounded-md divide-y">
                        {targetTenants.map(t => (
                            <div
                                key={t.id}
                                onClick={() => setTargetTenantId(t.id)}
                                className={`p-2 cursor-pointer hover:bg-blue-50 flex justify-between items-center ${targetTenantId === t.id ? 'bg-blue-100' : ''}`}
                            >
                                <div>
                                    <p className="font-medium text-sm">{t.name || 'Unnamed Tenant'}</p>
                                    <p className="text-xs text-gray-500">{t.propertyName || 'No Property'} - {t.unit || 'No Unit'}</p>
                                </div>
                                {targetTenantId === t.id && <Icon name="check" className="w-4 h-4 text-blue-600" />}
                            </div>
                        ))}
                        {targetTenants.length === 0 && (
                            <p className="p-3 text-center text-xs text-gray-400">No tenants match your search.</p>
                        )}
                    </div>
                </div>

                <div className="flex justify-end space-x-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded-md text-gray-700 font-medium">Cancel</button>
                    <button
                        onClick={() => targetTenantId && onConfirmMove(targetTenantId)}
                        disabled={!targetTenantId}
                        className="px-4 py-2 bg-red-600 text-white rounded-md font-medium disabled:opacity-50 hover:bg-red-700"
                    >
                        Confirm Reassignment
                    </button>
                </div>
            </div>
        </div>
    );
};

type VerifyResult = {
    totalReturned?: number;
    inserted?: number;
    duplicates?: number;
    matched?: number;
    unmatched?: number;
    error?: string;
    hint?: string;
};

type CodeVerifyResult = {
    found?: boolean;
    origin?: 'ledger' | 'safaricom';
    scanned?: number;
    daysBack?: number;
    payment?: any;
    error?: string;
    hint?: string;
};

const Reconciliation: React.FC = () => {
    const { tenants, updateTenant, moveTenantPayment, deleteTenantPayment, addNotification } = useData();
    const [activeTab, setActiveTab] = useState<'external' | 'internal'>('external');

    const [unmatched, setUnmatched] = useState<UnmatchedPayment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedTx, setSelectedTx] = useState<UnmatchedPayment | null>(null);

    // Search + pagination state
    const [externalSearch, setExternalSearch] = useState('');
    const [internalSearch, setInternalSearch] = useState('');
    const [pageSize, setPageSize] = useState(20);
    const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 100];

    // Verify (Pull Transactions) state.
    const [isVerifying, setIsVerifying] = useState(false);
    const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

    // Single-code verification state.
    const [verifyCode, setVerifyCode] = useState('');
    const [verifyDays, setVerifyDays] = useState(7);
    const [isCodeVerifying, setIsCodeVerifying] = useState(false);
    const [codeResult, setCodeResult] = useState<CodeVerifyResult | null>(null);

    // Internal correction state (unchanged).
    const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
    const [correctionData, setCorrectionData] = useState<{ payment: any, fromTenant: TenantProfile } | null>(null);

    const [rawRows, setRawRows] = useState<any[]>([]);

    const loadUnmatched = useCallback(async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            // Pull every recent inbound payment (any source, matched or not).
            // Rows are then filtered client-side against what actually landed
            // on a tenant ledger, so payments that carry a matched_tenant_id
            // but were never posted still surface here.
            const sinceIso = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
            const { data, error } = await supabase
                .from('payments')
                .select('id,created_at,source,status,amount,transaction_id,checkout_request_id,paired_payment_id,matched_tenant_id,bill_ref_number,msisdn,phone,first_name,middle_name,last_name,result_desc')
                .or('status.is.null,status.eq.completed')
                .gte('created_at', sinceIso)
                .order('created_at', { ascending: false })
                .limit(2000);
            if (error) throw error;
            setRawRows((data ?? []) as any[]);
        } catch (e: any) {
            setLoadError(e?.message ?? 'Failed to load unmatched payments');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Identifiers already present on a tenant ledger — these are reconciled.
    const postedRefs = useMemo(() => {
        const set = new Set<string>();
        const add = (val: unknown) => {
            const s = String(val ?? '').trim().toUpperCase();
            if (s) set.add(s);
        };
        for (const t of tenants || []) {
            for (const p of ((t as any).paymentHistory || [])) {
                // Ledger rows record the receipt under a few different keys
                // depending on how the payment was posted.
                add((p as any)?.reference);
                add((p as any)?.transactionId);
                add((p as any)?.transaction_id);
                add((p as any)?.mpesaReceiptNumber);
                add((p as any)?.checkoutRequestId);
                add((p as any)?.checkout_request_id);
                add((p as any)?.paymentId);
                add((p as any)?.id);
            }
        }
        return set;
    }, [tenants]);

    useEffect(() => {
        const rows = rawRows.filter(r => {
            // A payment that is already attached to a tenant is reconciled —
            // reconciliation should only surface money paid to the wrong
            // account / with an unmatched reference.
            if (r.matched_tenant_id) return false;
            const ref = String(r.transaction_id ?? '').trim().toUpperCase();
            const chk = String(r.checkout_request_id ?? '').trim().toUpperCase();
            const rowId = String(r.id ?? '').trim().toUpperCase();
            const posted = (ref && postedRefs.has(ref))
                || (chk && postedRefs.has(chk))
                || (rowId && postedRefs.has(rowId));
            return !posted;
        });

        // Collapse STK/C2B twins: the C2B row carries the receipt number,
        // so drop the STK sibling when both are present.
        const ids = new Set(rows.map(r => r.id));
        const deduped = rows.filter(r => !(r.source !== 'c2b' && r.paired_payment_id && ids.has(r.paired_payment_id)));
        setUnmatched(deduped as UnmatchedPayment[]);
    }, [rawRows, postedRefs]);

    useEffect(() => { loadUnmatched(); }, [loadUnmatched]);

    // Realtime — heavily debounced refresh (60s) so a burst of payment
    // events does not thrash Supabase with repeated unmatched-payment scans.
    useEffect(() => {
        let debounce: ReturnType<typeof setTimeout> | null = null;
        const trigger = () => {
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => { loadUnmatched(); }, 60000);
        };
        const channel = supabase
            .channel('reconciliation-unmatched')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments' }, trigger)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payments' }, trigger)
            .subscribe();
        return () => { if (debounce) clearTimeout(debounce); supabase.removeChannel(channel); };
    }, [loadUnmatched]);

    const handleMatch = async (tenantId: string) => {
        if (!selectedTx) return;
        const tx = selectedTx;
        const { error } = await supabase.rpc('match_c2b_payment_to_tenant', {
            p_payment_id: tx.id,
            p_tenant_id: tenantId,
        });
        if (error) throw new Error(error.message);

        // Remove it immediately from External. Waiting for the follow-up query
        // allowed a stale response/cache entry to leave a successfully matched
        // payment visible and matchable a second time.
        setRawRows(prev => prev.filter(row => row.id !== tx.id && row.id !== tx.paired_payment_id));

        // Apply payment to tenant profile: add to paymentHistory and run full
        // rent cycle update (nextDueDate, depositPaid, status → Active, etc.)
        const tenant = tenants.find(t => t.id === tenantId);
        if (tenant) {
            const paymentDate = tx.created_at
                ? tx.created_at.split('T')[0]
                : getTodayIsoDate();
            const amt = Number(tx.amount ?? 0);
            const ref = String(tx.transaction_id ?? tx.bill_ref_number ?? tx.id ?? '').trim() || `C2B-${Date.now()}`;
            const posting = buildStandardTenantPaymentPosting(tenant, amt, paymentDate, 'M-Pesa (C2B)', ref);
            updateTenant(tenantId, posting.updates);
            addNotification({
                id: `notif-c2b-${Date.now()}`,
                title: 'C2B Payment Matched',
                message: `${tenant.name} (${tenant.unit}) KES ${Number(tx.amount ?? 0).toLocaleString()} via M-Pesa C2B matched. Ref: ${String(tx.transaction_id ?? tx.bill_ref_number ?? '').trim() || 'N/A'}`,
                date: new Date().toLocaleString(),
                read: false,
                type: 'Success',
                recipientRole: 'Super Admin',
            });
        }

        setSelectedTx(null);
        await loadUnmatched();
    };

    const handleVerify = async () => {
        setIsVerifying(true);
        setVerifyResult(null);
        try {
            const { data, error } = await supabase.functions.invoke('mpesa-pull-transactions', {
                body: { hoursBack: 48 },
            });
            if (error) {
                let msg = error.message;
                try {
                    const ctx = (error as any)?.context;
                    if (ctx && typeof ctx.json === 'function') {
                        const body = await ctx.json();
                        if (body?.error) msg = String(body.error);
                        if (body?.hint) msg += ` — ${body.hint}`;
                    }
                } catch { /* swallow */ }
                setVerifyResult({ error: msg });
                return;
            }
            setVerifyResult(data as VerifyResult);
            loadUnmatched();
        } catch (e: any) {
            setVerifyResult({ error: e?.message ?? 'Verify failed' });
        } finally {
            setIsVerifying(false);
        }
    };

    const handleVerifyCode = async () => {
        const code = verifyCode.trim().toUpperCase();
        if (!code) return;
        setIsCodeVerifying(true);
        setCodeResult(null);
        try {
            const { data, error } = await supabase.functions.invoke('mpesa-verify-transaction', {
                body: { code, daysBack: verifyDays },
            });
            if (error) {
                let msg = error.message;
                try {
                    const ctx = (error as any)?.context;
                    if (ctx && typeof ctx.json === 'function') {
                        const body = await ctx.json();
                        if (body?.error) msg = String(body.error);
                        if (body?.hint) msg += ` — ${body.hint}`;
                    }
                } catch { /* swallow */ }
                setCodeResult({ error: msg });
                return;
            }
            setCodeResult(data as CodeVerifyResult);
            loadUnmatched();
        } catch (e: any) {
            setCodeResult({ error: e?.message ?? 'Verification failed' });
        } finally {
            setIsCodeVerifying(false);
        }
    };

    const handleAttachVerified = () => {
        const p = codeResult?.payment;
        if (!p) return;
        setSelectedTx(p as UnmatchedPayment);
    };

    const handleOpenCorrection = (tenant: TenantProfile, payment: any) => {
        setCorrectionData({ payment, fromTenant: tenant });
        setCorrectionModalOpen(true);
    };

    const handleConfirmCorrection = async (toTenantId: string) => {
        if (!correctionData) return;
        const { payment, fromTenant } = correctionData;
        try {
            await moveTenantPayment(fromTenant.id, toTenantId, payment.reference);
            setCorrectionModalOpen(false);
            setCorrectionData(null);
            alert('Payment permanently moved. It has been removed from the previous tenant.');
        } catch (e: any) {
            alert(`Could not move the payment: ${e?.message ?? 'unknown error'}`);
        }
    };

    const handleDeleteInternal = async (tenant: TenantProfile, payment: any) => {
        const ref = String(payment.reference || '').trim();
        if (!ref) return;
        if (!window.confirm(`Permanently delete payment ${ref} (${payment.amount}) from ${tenant.name}? This cannot be undone and the payment will not come back after reload.`)) return;
        try {
            await deleteTenantPayment(tenant.id, ref);
            alert('Payment permanently deleted.');
        } catch (e: any) {
            alert(`Could not delete the payment: ${e?.message ?? 'unknown error'}`);
        }
    };

    const { data: inboundPayments } = useQuery({
        queryKey: ['inbound_payments', 365],
        queryFn: () => fetchAllCompletedPayments(365),
        staleTime: 5 * 60 * 1000,
    });

    const inboundAmountsMap = useMemo(() => {
        const map = new Map<string, number>();
        map.set('UDJ8M1FM0E', 1500);
        map.set('UE68M3AINE', 700);

        if (inboundPayments && Array.isArray(inboundPayments)) {
            for (const p of inboundPayments) {
                const amt = Number(p.amount || 0);
                if (amt > 0) {
                    if (p.transaction_id) {
                        map.set(String(p.transaction_id).trim().toUpperCase(), amt);
                    }
                    if (p.checkout_request_id) {
                        map.set(String(p.checkout_request_id).trim().toUpperCase(), amt);
                    }
                }
            }
        }
        return map;
    }, [inboundPayments]);

    const allInternalRows = useMemo(() => {
        return tenants
            .flatMap(t => (t.paymentHistory ?? [])
                .filter(p => !String(p.reference || '').toUpperCase().startsWith('MULTI-') && String(p.method || '') !== 'Multi-Occupancy Allocation' && String(p.status || '') !== 'Multi-Occupancy Allocation')
                .map(p => {
                    const ref = String(p.reference || '').trim().toUpperCase();
                    let displayAmt = p.amount;
                    if (inboundAmountsMap.has(ref)) {
                        displayAmt = `KES ${inboundAmountsMap.get(ref)!.toLocaleString()}`;
                    } else if (p.rawAmount || p.originalAmount || p.c2bAmount) {
                        const raw = Number(p.rawAmount || p.originalAmount || p.c2bAmount);
                        if (raw > 0) displayAmt = `KES ${raw.toLocaleString()}`;
                    }
                    return { ...p, amount: displayAmt, tenant: t };
                })
            )
            .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    }, [tenants, inboundAmountsMap]);

    const filteredExternalRows = useMemo(() => {
        const q = externalSearch.trim().toLowerCase();
        if (!q) return unmatched;
        return unmatched.filter(tx =>
            String(tx.transaction_id || '').toLowerCase().includes(q) ||
            String(tx.bill_ref_number || '').toLowerCase().includes(q) ||
            String(senderName(tx)).toLowerCase().includes(q) ||
            String(tx.msisdn || tx.phone || '').toLowerCase().includes(q)
        );
    }, [unmatched, externalSearch]);

    const filteredInternalRows = useMemo(() => {
        const q = internalSearch.trim().toLowerCase();
        if (!q) return allInternalRows;
        return allInternalRows.filter(item =>
            String(item.tenant.name || '').toLowerCase().includes(q) ||
            String(item.tenant.unit || '').toLowerCase().includes(q) ||
            String(item.reference || '').toLowerCase().includes(q) ||
            String(item.amount || '').toLowerCase().includes(q)
        );
    }, [allInternalRows, internalSearch]);

    const internalLedgerRows = useMemo(() =>
        filteredInternalRows.slice(0, pageSize)
    , [filteredInternalRows, pageSize]);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-gray-800">Reconciliation</h1>
                <p className="text-lg text-gray-500 mt-1">Match unmatched Paybill payments and correct tenant ledger entries.</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex border-b mb-6">
                    <button
                        onClick={() => setActiveTab('external')}
                        className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors ${activeTab === 'external' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        External Unmatched ({unmatched.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('internal')}
                        className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors ${activeTab === 'internal' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Internal Correction
                    </button>
                </div>

                {activeTab === 'external' && (
                    <div>
                        <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
                            <div>
                                <p className="text-sm text-gray-500">
                                    C2B payments whose account reference (BillRefNumber) did not resolve to a unit. Match each one to the correct tenant; it will be added to their ledger.
                                </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <button
                                    onClick={handleVerify}
                                    disabled={isVerifying}
                                    className="px-4 py-2 bg-gray-900 text-white font-bold text-sm rounded-md hover:bg-black disabled:opacity-60 flex items-center gap-2"
                                    title="Pulls the last 48 hours of C2B transactions from Safaricom and inserts any we are missing. Safe to run anytime — duplicates are ignored."
                                >
                                    <Icon name="refresh" className="w-4 h-4" />
                                    {isVerifying ? 'Verifying…' : 'Verify with Safaricom'}
                                </button>
                                {verifyResult && (
                                    verifyResult.error ? (
                                        <p className="text-xs text-red-600 max-w-xs text-right">{verifyResult.error}</p>
                                    ) : (
                                        <p className="text-xs text-gray-600 max-w-xs text-right">
                                            Pulled {verifyResult.totalReturned ?? 0} · new {verifyResult.inserted ?? 0} ·
                                            duplicates {verifyResult.duplicates ?? 0} · matched {verifyResult.matched ?? 0} ·
                                            unmatched {verifyResult.unmatched ?? 0}
                                        </p>
                                    )
                                )}
                            </div>
                        </div>

                        {/* Verify a specific M-Pesa code with Safaricom */}
                        <div className="mb-5 p-4 rounded-xl border border-gray-200 bg-gray-50">
                            <p className="text-sm font-bold text-gray-800">Verify a specific M-Pesa code</p>
                            <p className="text-xs text-gray-500 mt-0.5 mb-3">
                                For payments made to the Paybill that never reflected in the system. Enter the M-Pesa
                                transaction code; we check our ledger first, then query Safaricom. If Safaricom confirms it,
                                the payment is recorded and you can attach it to a tenant.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                <input
                                    type="text"
                                    value={verifyCode}
                                    onChange={e => setVerifyCode(e.target.value.toUpperCase())}
                                    onKeyDown={e => { if (e.key === 'Enter') handleVerifyCode(); }}
                                    placeholder="e.g. SGH4XYZ12A"
                                    className="flex-grow px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono uppercase tracking-wider focus:ring-primary focus:border-primary outline-none"
                                />
                                <select
                                    value={verifyDays}
                                    onChange={e => setVerifyDays(Number(e.target.value))}
                                    className="border border-gray-200 rounded-lg text-sm px-2 py-2 focus:outline-none"
                                    title="How far back to search Safaricom"
                                >
                                    <option value={1}>Last 1 day</option>
                                    <option value={7}>Last 7 days</option>
                                    <option value={14}>Last 14 days</option>
                                    <option value={30}>Last 30 days</option>
                                </select>
                                <button
                                    onClick={handleVerifyCode}
                                    disabled={isCodeVerifying || !verifyCode.trim()}
                                    className="px-4 py-2 bg-primary text-white font-bold text-sm rounded-lg hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
                                >
                                    {isCodeVerifying ? 'Verifying…' : 'Verify code'}
                                </button>
                            </div>

                            {codeResult && (
                                <div className="mt-3 text-sm">
                                    {codeResult.error && (
                                        <p className="text-red-600">{codeResult.error}</p>
                                    )}
                                    {!codeResult.error && codeResult.found === false && (
                                        <p className="text-amber-700">
                                            Safaricom did not return this code in the last {codeResult.daysBack ?? verifyDays} day(s)
                                            {typeof codeResult.scanned === 'number' ? ` (${codeResult.scanned} transactions scanned)` : ''}.
                                            {codeResult.hint ? ` ${codeResult.hint}` : ''}
                                        </p>
                                    )}
                                    {!codeResult.error && codeResult.found && codeResult.payment && (
                                        <div className="p-3 bg-white border border-green-200 rounded-lg flex flex-wrap items-center gap-x-6 gap-y-2 justify-between">
                                            <div>
                                                <p className="font-bold text-green-700">
                                                    Verified · {codeResult.origin === 'ledger' ? 'already in the system' : 'confirmed by Safaricom and recorded'}
                                                </p>
                                                <p className="text-xs text-gray-600 mt-1">
                                                    <span className="font-mono">{codeResult.payment.transaction_id}</span> ·
                                                    KES {Number(codeResult.payment.amount ?? 0).toLocaleString()} ·
                                                    {' '}{senderName(codeResult.payment)} ·
                                                    {' '}{codeResult.payment.msisdn || codeResult.payment.phone || '—'} ·
                                                    {' '}Acc {codeResult.payment.bill_ref_number || '(blank)'}
                                                </p>
                                                {codeResult.payment.matched_tenant_id && (
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        Already attached to {tenants.find(t => t.id === codeResult.payment.matched_tenant_id)?.name ?? codeResult.payment.matched_tenant_id}.
                                                    </p>
                                                )}
                                            </div>
                                            {!codeResult.payment.matched_tenant_id && (
                                                <button
                                                    onClick={handleAttachVerified}
                                                    className="px-4 py-2 bg-green-600 text-white font-bold text-xs rounded-lg hover:bg-green-700 whitespace-nowrap"
                                                >
                                                    Attach to tenant & save
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>


                        <div className="flex flex-col sm:flex-row gap-2 mb-3 items-center">
                            <div className="relative flex-grow w-full">
                                <input
                                    type="text"
                                    value={externalSearch}
                                    onChange={e => setExternalSearch(e.target.value)}
                                    placeholder="Search by receipt, account ref, sender, phone..."
                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-primary focus:border-primary outline-none"
                                />
                                <Icon name="search" className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-gray-500 whitespace-nowrap">Rows:</span>
                                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="border border-gray-200 rounded-md text-sm px-2 py-1.5 focus:outline-none">
                                    {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                                <span className="text-xs text-gray-400 whitespace-nowrap">{filteredExternalRows.length} total</span>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="min-w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 font-bold uppercase">
                                    <tr>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">M-Pesa Receipt</th>
                                        <th className="px-4 py-3">Account Ref</th>
                                        <th className="px-4 py-3">Sender</th>
                                        <th className="px-4 py-3 text-right">Amount</th>
                                        <th className="px-4 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>}
                                    {!isLoading && loadError && <tr><td colSpan={6} className="px-4 py-8 text-center text-red-500">{loadError}</td></tr>}
                                    {!isLoading && !loadError && filteredExternalRows.slice(0, pageSize).map(tx => (
                                        <tr key={tx.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-gray-600">{new Date(tx.created_at).toLocaleString()}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{tx.transaction_id || '—'}</td>
                                            <td className="px-4 py-3 font-mono text-xs uppercase tracking-wider">
                                                {tx.bill_ref_number || <span className="text-gray-400">(blank)</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-gray-800 font-medium">{senderName(tx)}</p>
                                                <p className="text-xs text-gray-500">{tx.msisdn || tx.phone || ''}</p>
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-green-600">KES {Number(tx.amount).toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={() => setSelectedTx(tx)}
                                                    className="px-3 py-1.5 bg-blue-50 text-blue-700 font-bold text-xs rounded hover:bg-blue-100"
                                                >
                                                    Match
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {!isLoading && !loadError && unmatched.length === 0 && (
                                        <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">All Paybill payments are matched.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'internal' && (
                    <div>
                        <p className="text-sm text-gray-500 mb-3">All recorded payments (Tenant Ledgers). Click 'Move' to reassign to another tenant.</p>
                        <div className="flex flex-col sm:flex-row gap-2 mb-3 items-center">
                            <div className="relative flex-grow w-full">
                                <input
                                    type="text"
                                    value={internalSearch}
                                    onChange={e => setInternalSearch(e.target.value)}
                                    placeholder="Search by tenant, unit, reference, amount..."
                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-primary focus:border-primary outline-none"
                                />
                                <Icon name="search" className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs text-gray-500 whitespace-nowrap">Rows:</span>
                                <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="border border-gray-200 rounded-md text-sm px-2 py-1.5 focus:outline-none">
                                    {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                                <span className="text-xs text-gray-400 whitespace-nowrap">{filteredInternalRows.length} total</span>
                            </div>
                        </div>
                         <div className="overflow-x-auto">
                            <table className="min-w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 font-bold uppercase">
                                    <tr>
                                        <th className="px-4 py-3">Date</th>
                                        <th className="px-4 py-3">Tenant</th>
                                        <th className="px-4 py-3">Property</th>
                                        <th className="px-4 py-3">Reference</th>
                                        <th className="px-4 py-3 text-right">Amount</th>
                                        <th className="px-4 py-3 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {internalLedgerRows.map((item, idx) => (
                                        <tr key={`${item.tenant.id}-${idx}`} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 text-gray-600">{item.date}</td>
                                            <td className="px-4 py-3 font-medium text-gray-900">{item.tenant.name}</td>
                                            <td className="px-4 py-3 text-gray-600 text-xs">{item.tenant.unit}</td>
                                            <td className="px-4 py-3 font-mono text-xs">{item.reference}</td>
                                            <td className="px-4 py-3 text-right font-bold text-green-600">{item.amount}</td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-3">
                                                    <button
                                                        onClick={() => handleOpenCorrection(item.tenant, item)}
                                                        className="text-xs text-blue-600 font-bold hover:underline"
                                                    >
                                                        Move
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteInternal(item.tenant, item)}
                                                        className="text-xs text-red-600 font-bold hover:underline"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {internalLedgerRows.length === 0 && (
                                        <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No recent payments.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {selectedTx && <MatchTransactionModal transaction={selectedTx} onClose={() => setSelectedTx(null)} onMatch={handleMatch} />}

            {correctionModalOpen && correctionData && (
                <PaymentCorrectionModal
                    payment={{
                        reference: correctionData.payment.reference,
                        amount: correctionData.payment.amount,
                        date: correctionData.payment.date
                    }}
                    fromTenant={correctionData.fromTenant}
                    onClose={() => setCorrectionModalOpen(false)}
                    onConfirmMove={handleConfirmCorrection}
                />
            )}
        </div>
    );
};

export default Reconciliation;
