
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useData } from '../../context/DataContext';
import { TenantProfile, Task, BillItem, FineItem, TenantRequest, RequestMessage, TaskPriority, TaskStatus, RecurringBillSettings, Notice, Message, Notification, OffboardingRecord, Bill } from '../../types';
import Icon from '../Icon';
import { supabase } from '../../utils/supabaseClient';
import { uploadToBucket } from '../../utils/supabaseStorage';

// Treat avatar as a URL when it looks like one; otherwise it's an initial/emoji.
const isAvatarUrl = (val?: string): boolean => {
    if (!val) return false;
    const s = String(val).trim();
    return /^(https?:|data:|blob:|\/)/i.test(s) || s.length > 3;
};
import { canonicalizePhone } from '../../utils/phone';
import { followStkPaymentCompletion } from '../../utils/stkPaymentFollowup';
import { getMonthlyRentStatus } from '../../utils/rentSchedule';
import { calculateProratedFirstMonthRent, computeRentPaymentCycleUpdate, getPendingTenantPaymentAllocation, getTenantProrationAnchor, getTenantRentStartAnchor } from '../../utils/tenantPaymentCycle';
import { buildStandardTenantPaymentPosting } from '../../utils/tenantPaymentPosting';
import { computeSubUnitInvoicedForMonth, computeSubUnitsInvoicedTotal } from '../../utils/subUnitInvoicing';
import { computeSubUnitStatuses } from '../../utils/multiOccupancySubStatus';
import { getMonthPrefix, isTenantRentCoveredForMonth, parsePaymentAmount, sumPaidPaymentsForMonth, getDepositOwedAtStartOfMonth, getRecognizedRentForMonth, getAdvanceAppliedToRentForMonth } from '../../utils/paymentReporting';
import { computeTenantMonthlyBalance, computeTenantTotalInvoicedForMonth, expectedThroughPriorMonth } from '../../utils/tenantBalance';
import { computeTenantCardBalance } from '../../utils/tenantCardBalance';
import { computeAdvanceAllocation, formatPaidUpToStatus } from '../../utils/advanceAllocation';
import { recomputeTenantFromPaymentHistory, recomputeMultiOccupancyGroup } from '../../utils/recomputeTenantBalances';
import { buildUnifiedMultiOccupancyPaymentHistory, computeMultiOccupancyGroupMonthlyBalance, normalizeMultiReceiptReference } from '../../utils/multiOccupancyLedger';
import { RefreshCw } from 'lucide-react';
import { computeTenantArrears, labelWithArrearsMonth } from '../../utils/tenantArrears';
import { printSection } from '../../utils/exportHelper';
import { fmtDate } from '../../utils/date';
import { isLateFeeType } from '../../utils/lateFees';
import { getProratedDepositInstallmentDueForMonth, getProratedDepositPaidBeforeMonth, getProratedDepositPaidThroughMonth, computePriorArrearsBrief } from '../../utils/proratedDepositAllocation';
import { ManageOffboardingModal } from './Offboarding';
import { safeAlert, safeConfirm } from '../../utils/dialogs';
import { getTodayIsoDate, getCurrentMonthIso } from '../../utils/timezone';

// --- STYLES ---
const styles = `
  @keyframes slideInRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  .animate-slide-in-right {
    animation: slideInRight 0.3s ease-out forwards;
  }
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .animate-fade-in {
    animation: fadeIn 0.2s ease-out forwards;
  }
  .pdf-preview {
    font-family: 'Times New Roman', serif;
    line-height: 1.6;
    color: #000;
  }
`;

const GRID_CARD_CLASSES = "relative bg-white rounded-2xl border-t-[8px] border-t-primary border-b-[4px] border-b-secondary border-x-[3px] border-x-secondary shadow-[inset_0_0_60px_-15px_rgba(162,53,74,0.15)] hover:shadow-lg transition-all duration-300 overflow-hidden cursor-pointer group p-4 flex items-center justify-between min-h-[110px]";

function isProbablyAuthUuid(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id).trim());
}

function resolveTenantPaymentUserId(t: TenantProfile | undefined): string | null {
    if (!t) return null;
    if (t.authUserId && isProbablyAuthUuid(t.authUserId)) return t.authUserId;
    if (isProbablyAuthUuid(t.id)) return t.id;
    return null;
}

function tenantFullyAllocated(t: TenantProfile): boolean {
    const hasUnit = !!t.unitId || !!String(t.unit ?? '').trim() || !!String((t as any).unitNumber ?? '').trim() || !!String((t as any).unitTag ?? '').trim();
    const hasProperty = !!t.propertyId || !!String(t.propertyName ?? '').trim();
    if (hasUnit && hasProperty) return true;
    // A payment can only ever be posted against a matched unit, so a tenant
    // carrying a Paid receipt is by definition allocated even if one of the
    // denormalised label columns (propertyName / unit) is blank in the blob.
    if (hasUnit && (t.paymentHistory || []).some(p => p?.status === 'Paid')) return true;
    return false;
}


// True when tenant has at least one Paid rent/deposit payment
function tenantHasAnyPaidPayment(t: TenantProfile): boolean {
    return (t.paymentHistory || []).some(p => p.status === 'Paid');
}

// True when the tenant's onboarding-month base rent (prorated first-month
// rent if applicable) has been fully paid across all payments in history,
// after netting off whatever cash was consumed by the deposit. This is the
// single source of truth for "eligible to be Active", so a tenant whose
// deposit alone was covered but rent is still outstanding is NOT flipped
// to Active on the match card.
function tenantOnboardingRentFullyPaid(t: TenantProfile): boolean {
    try {
        const anchor = getTenantProrationAnchor(t);
        const firstStored = Number((t as any).firstMonthRent || 0);
        const onboardingRentExpected = firstStored > 0
            ? firstStored
            : calculateProratedFirstMonthRent(Number(t.rentAmount || 0), anchor);
        if (onboardingRentExpected <= 0) return true;
        const totalPaid = (t.paymentHistory || []).reduce((s: number, p: any) => {
            if (p?.status && p.status !== 'Paid') return s;
            const num = Number(String(p?.amount || '').replace(/[^0-9.]/g, '')) || 0;
            return s + num;
        }, 0);
        const depositPaid = Number((t as any).depositPaid || 0);
        const rentPool = Math.max(0, totalPaid - depositPaid);
        return rentPool + 0.5 >= onboardingRentExpected;
    } catch {
        return false;
    }
}

// Deposit considered settled when exempt OR paid covers expected
function tenantDepositSettled(t: TenantProfile): boolean {
    if (t.depositExempt) return true;
    const expected = Number((t as any).depositExpected ?? 0);
    const paid = Number((t as any).depositPaid ?? 0);
    if (expected <= 0) return true;
    return paid + 0.5 >= expected;
}

/**
 * Activation-grade deposit check: a tenant is considered "deposit-settled
 * enough to be Active" when they have either:
 *   • depositExempt / rentExtension active, or
 *   • paid the deposit in full, or
 *   • paid at least the first prorated-deposit instalment, or
 *   • cleared their current month and carry an advance / credit balance
 *     (overpayment naturally settles the next instalment).
 */
function tenantDepositSettledForActivation(t: TenantProfile): boolean {
    if (tenantDepositSettled(t)) return true;
    if (t.rentExtension?.enabled) return true;
    if (t.proratedDeposit?.enabled) {
        const pd = t.proratedDeposit;
        if ((pd.monthsPaid || 0) >= 1) return true;
        if ((pd.amountPaidSoFar || 0) + 0.5 >= (pd.monthlyInstallment || 0)) return true;
    }
    return false;
}

/**
 * Derive the effective status for filter/grouping so cards never appear in
 * the wrong chip:
 *  - PendingApproval (self / agent / external sign-up) is preserved
 *  - Unallocated tenants → PendingAllocation (even if stored as Active)
 *  - Stored 'Pending' but allocated + deposit + rent settled → Active
 *  - Stored 'Pending' but tenant has an advance / overpayment → Active
 *  - Stored 'Pending' but allocated and still owing → PendingPayment
 *  - Otherwise the stored status
 */
function effectiveTenantStatus(t: TenantProfile): string {
    const stored = t.status || '';
    // Terminal / exited statuses always win — a vacated tenant must never be
    // re-derived as PendingAllocation just because their unit was released.
    if (stored === 'Vacated' || stored === 'Evicted' || stored === 'Blacklisted'
        || stored === 'Inactive' || stored === 'Notice' || stored === 'Overdue') return stored;
    if (stored === 'PendingApproval') return 'PendingApproval';
    if (!tenantFullyAllocated(t)) return 'PendingAllocation';
    if (stored === 'Active') return 'Active';


    if (tenantOnboardingRentFullyPaid(t) && tenantDepositSettledForActivation(t)) {
        return 'Active';
    }
    return 'PendingPayment';
}

// True when tenant has prepayment carried into a future month. Uses the
// full card balance (which includes arrears + bills + fines) so a tenant
// who still owes anything for the current month — or any prior month —
// does NOT qualify as Prepaid even if a partial payment landed.
function tenantHasAdvancePayment(t: TenantProfile): boolean {
    try {
        const monthIso = getCurrentMonthIso();
        const bal = computeTenantCardBalance(t, monthIso, { isAllocated: true });
        return bal.isCredit && bal.creditAmount > 0;
    } catch {}
    return false;
}

// True when the tenant's current-month invoice has an outstanding balance.
function tenantCurrentMonthHasDue(t: TenantProfile): boolean {
    try {
        const monthIso = getCurrentMonthIso();
        const bal = computeTenantCardBalance(t, monthIso, { isAllocated: true });
        return !bal.isCredit && bal.totalDue > 0.5;
    } catch {
        return false;
    }
}

function isInactiveApplicantTenant(t: TenantProfile): boolean {
    return (
        t.status === 'PendingApproval' ||
        t.status === 'Pending' ||
        t.status === 'PendingAllocation' ||
        t.status === 'PendingPayment'
    );
}

function getTenantOnboardingKind(t: TenantProfile): 'Existing' | 'New' {
    return t.tenantOnboardingType === 'Existing' || !!t.existingTenantSetup ? 'Existing' : 'New';
}

function isBackdatedOpeningBalancePayment(payment: any): boolean {
    return payment?.status === 'Paid' && (
        String(payment?.method || '') === 'Backdated Opening Balance'
        || String(payment?.method || '') === 'Backdated Rent Payment'
        || String(payment?.method || '') === 'Backdated Deposit Payment'
        || String(payment?.reference || '').startsWith('BACKFILL-')
        || String(payment?.reference || '').startsWith('DEPOSIT-BACKFILL-')
    );
}

function normalizeReceiptReference(reference: any): string {
    const raw = String(reference ?? '').trim();
    const unprefixed = raw.startsWith('MULTI-') ? raw.substring(6).trim() : raw;
    return unprefixed.toUpperCase();
}

function formatPaymentAmount(amount: number): string {
    return `KES ${Math.max(0, Number(amount || 0)).toLocaleString()}`;
}

function parseExplicitReceiptAmount(payment: any): number | null {
    const raw = payment?.receiptAmount ?? payment?.originalReceiptAmount ?? payment?.ledgerAmount;
    if (raw === undefined || raw === null || raw === '') return null;
    const amount = typeof raw === 'number' ? raw : parsePaymentAmount(raw);
    return amount > 0 ? amount : null;
}

function getExistingTenantBackdatedDepositPaid(t: TenantProfile, monthPrefix: string): number {
    if (getTenantOnboardingKind(t) !== 'Existing') return 0;

    const explicitDepositBackfill = (t.paymentHistory || []).reduce((sum, payment) => {
        if (payment?.status !== 'Paid') return sum;
        if (!String(payment?.reference || '').startsWith('DEPOSIT-BACKFILL-')) return sum;
        return sum + parsePaymentAmount(payment.amount);
    }, 0);
    const setupDeposit = Number(t.existingTenantSetup?.depositAlreadyPaid || 0);
    const normalPaidThisMonth = (t.paymentHistory || []).reduce((sum, payment) => {
        if (isBackdatedOpeningBalancePayment(payment) || payment.status !== 'Paid') return sum;
        if (!String(payment.date || '').startsWith(monthPrefix)) return sum;
        return sum + parsePaymentAmount(payment.amount);
    }, 0);
    const legacyDepositPaidFallback = normalPaidThisMonth > 0 ? 0 : Number(t.depositPaid || 0);

    return Math.max(explicitDepositBackfill, setupDeposit, legacyDepositPaidFallback);
}

function getDepositInvoiceGrossForMonth(t: TenantProfile, monthPrefix: string): number {
    if (t.depositExempt) return 0;

    const depositMonthsRaw = Number((t as any).depositMonths ?? 1);
    const depositMonths = Number.isFinite(depositMonthsRaw) && depositMonthsRaw > 0 ? depositMonthsRaw : 1;
    const depositPaidAmt = Number(t.depositPaid || 0);
    const depositExpectedStandard = Math.max(
        Number((t as any).depositExpected ?? 0) > 0
            ? Number((t as any).depositExpected)
            : (Number(t.rentAmount || 0) * depositMonths),
        depositPaidAmt,
    );
    const amountPaidBeforeMonth = (t.paymentHistory || [])
        .filter(p => p.status === 'Paid' && p.date && p.date < monthPrefix && !isBackdatedOpeningBalancePayment(p))
        .reduce((sum, p) => sum + parsePaymentAmount(p.amount), 0);
    const depositPaidPriorMonths = t.proratedDeposit?.enabled
        ? Math.min(t.proratedDeposit.amountPaidSoFar || 0, t.proratedDeposit.totalDepositAmount)
        : Math.min(amountPaidBeforeMonth, depositExpectedStandard);
    const depositClearedBeforeMonth = t.proratedDeposit?.enabled
        ? depositPaidPriorMonths + 0.5 >= t.proratedDeposit.totalDepositAmount
        : depositExpectedStandard > 0 && depositPaidPriorMonths + 0.5 >= depositExpectedStandard;

    if (depositClearedBeforeMonth) return 0;
    if (t.proratedDeposit?.enabled) {
        return t.proratedDeposit.amountPaidSoFar >= t.proratedDeposit.totalDepositAmount
            ? 0
            : (t.proratedDeposit.monthlyInstallment ?? 0);
    }
    return Math.max(0, depositExpectedStandard - depositPaidPriorMonths);
}

function isTenantInInitialNewTenantMonth(t: TenantProfile, monthPrefix = getMonthPrefix()): boolean {
    if (getTenantOnboardingKind(t) === 'Existing') return false;
    const anchor = getTenantRentStartAnchor(t) || t.onboardingDate || '';
    return !!anchor && String(anchor).slice(0, 7) === monthPrefix;
}

// Chip filter options. "All" shows every non-vacated/blacklisted tenant;
// the new PendingAllocation / PendingPayment chips surface tenants that
// previously only showed under the "Inactive" toggle, so a new registration
// is visible from the default Active Tenants view the moment it's saved.
const STATUS_FILTERS: Array<{ key: string; label: string }> = [
    { key: 'All', label: 'All' },
    { key: 'Active', label: 'Paid' },
    { key: 'Unpaid', label: 'Unpaid' },
    { key: 'PendingApproval', label: 'Pending Approval' },
    { key: 'PendingAllocation', label: 'Pending Allocation' },
    { key: 'PendingPayment', label: 'Pending Payment' },
    { key: 'Advance', label: 'Prepaid' },
    { key: 'Overdue', label: 'Overdue' },
    { key: 'Notice', label: 'Notice' },
    { key: 'Vacated', label: 'Vacated' },
    { key: 'Inactive', label: 'Inactive' },
    { key: 'Applications', label: 'Applications' },
];

// --- HELPER: Get Arrears Text ---
const getArrearsText = (tenant: TenantProfile) => {
    if (tenant.status !== 'Overdue') return null;

    // Check outstanding bills for Rent types
    const rentBills = tenant.outstandingBills?.filter(b => 
        (b.type === 'Rent Arrears' || b.type === 'Rent' || (b.description && b.description.toLowerCase().includes('rent'))) &&
        b.status === 'Pending'
    );

    if (rentBills && rentBills.length > 0) {
        // Extract unique months from bill dates
        const months = [...new Set(rentBills.map(b => new Date(b.date).toLocaleString('default', { month: 'long' })))];
        
        // Sort months chronologically if needed, but Set order is usually insertion order which implies chronological if bills added in order
        if (months.length > 0) {
            return `Rent Arrears (${months.join(', ')})`;
        }
    }

    return 'Rent Arrears';
};

// --- Error Boundary to protect Tenant Detail view ---
type TenantDetailErrorBoundaryProps = { tenant: TenantProfile; onBack: () => void };
type TenantDetailErrorBoundaryState = { hasError: boolean };

class TenantDetailErrorBoundary extends React.Component<TenantDetailErrorBoundaryProps, TenantDetailErrorBoundaryState> {
    declare props: TenantDetailErrorBoundaryProps;
    declare state: TenantDetailErrorBoundaryState;

    constructor(props: TenantDetailErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.warn('[ActiveTenants] TenantDetailView crashed', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="space-y-4 p-6">
                    <button onClick={this.props.onBack} className="text-sm text-primary font-bold hover:underline">
                        ← Back to List
                    </button>
                    <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
                        There was a problem loading this tenant profile. Please return to the list and try again or refresh the page.
                    </div>
                </div>
            );
        }
        return <TenantDetailView key={this.props.tenant.id} tenant={this.props.tenant} onBack={this.props.onBack} />;
    }
}

// --- Simple Initiate Modal for Active Tenants context ---
const InitiateOffboardingModal: React.FC<{ 
    tenant: TenantProfile;
    onClose: () => void;
    onStart: (noticeDate: string, moveOutDate: string) => void;
}> = ({ tenant, onClose, onStart }) => {
    const [noticeDate, setNoticeDate] = useState(getTodayIsoDate());
    const [moveOutDate, setMoveOutDate] = useState('');

    const handleSubmit = () => {
        if (!moveOutDate) return alert("Please select a move-out date.");
        onStart(noticeDate, moveOutDate);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1500] flex items-center justify-center p-4">
             <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold mb-4 text-gray-800">Offboard {tenant.name}</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Notice Date</label>
                        <input type="date" value={noticeDate} onChange={e => setNoticeDate(e.target.value)} className="w-full p-2 border rounded"/>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">Move Out Date</label>
                        <input type="date" value={moveOutDate} onChange={e => setMoveOutDate(e.target.value)} className="w-full p-2 border rounded"/>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700">Cancel</button>
                        <button onClick={handleSubmit} className="px-4 py-2 bg-red-600 text-white rounded font-bold">Start Process</button>
                    </div>
                </div>
             </div>
        </div>
    );
}

// --- Negotiated Vacating Modal ---
const NegotiatedVacatingModal: React.FC<{
    tenant: TenantProfile;
    onClose: () => void;
    onConfirm: (moveOutDate: string, reason: string) => void;
}> = ({ tenant, onClose, onConfirm }) => {
    const [moveOutDate, setMoveOutDate] = useState('');
    const [reason, setReason] = useState('');

    const handleSubmit = () => {
        if (!moveOutDate) return alert('Please select an agreed move-out date.');
        onConfirm(moveOutDate, reason);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1500] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center">
                        <Icon name="check" className="w-5 h-5 text-teal-600" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800">Negotiated Vacating</h3>
                </div>
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-sm text-teal-800">
                    <p className="font-bold mb-1">Mutual Agreement</p>
                    <p>Management and <strong>{tenant.name}</strong> have agreed to an exit without the standard 30-day notice period. The tenant will still go through the full offboarding process.</p>
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Agreed Move-Out Date</label>
                    <input
                        type="date"
                        value={moveOutDate}
                        min={getTodayIsoDate()}
                        onChange={e => setMoveOutDate(e.target.value)}
                        className="w-full p-2 border rounded-lg"
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Reason / Notes <span className="font-normal text-gray-400">(optional)</span></label>
                    <textarea
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        rows={3}
                        placeholder="e.g. Tenant relocating, mutual agreement reached on..."
                        className="w-full p-2 border rounded-lg text-sm resize-none"
                    />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded-lg text-gray-700 font-medium">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-teal-600 text-white rounded-lg font-bold hover:bg-teal-700">Confirm &amp; Begin Offboarding</button>
                </div>
            </div>
        </div>
    );
};

// --- Manual Payment Recording Modal ---
const RecordPaymentModal: React.FC<{
    tenant: TenantProfile;
    balance: number;
    onClose: () => void;
    onRecord: (amount: number, method: string, reference: string, date: string) => void;
}> = ({ tenant, balance, onClose, onRecord }) => {
    const [amount, setAmount] = useState(balance.toString());
    const [method, setMethod] = useState('Cash');
    const [reference, setReference] = useState('');
    const [date, setDate] = useState(getTodayIsoDate());

    const handleSubmit = () => {
        const val = parseFloat(amount);
        if (isNaN(val) || val <= 0) return alert("Please enter a valid amount.");
        if (!reference) return alert("Reference is required.");
        
        onRecord(val, method, reference, date);
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1450] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-800 mb-4">Record Payment</h3>
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Amount Paid (KES)</label>
                        <input 
                            type="number" 
                            value={amount} 
                            onChange={e => setAmount(e.target.value)} 
                            className="w-full p-2 border rounded font-bold text-gray-800"
                        />
                         <p className="text-[10px] text-gray-400 mt-1">Total Balance: KES {Number(balance ?? 0).toLocaleString()}</p>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Payment Method</label>
                        <select 
                            value={method} 
                            onChange={e => setMethod(e.target.value)} 
                            className="w-full p-2 border rounded bg-white"
                        >
                            <option>Cash</option>
                            <option>Bank Transfer</option>
                            <option>Cheque</option>
                            <option>M-Pesa (Manual)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Reference / Receipt No.</label>
                        <input 
                            type="text" 
                            value={reference} 
                            onChange={e => setReference(e.target.value)} 
                            className="w-full p-2 border rounded"
                            placeholder="e.g. RCPT-1002"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Date Paid</label>
                        <input 
                            type="date" 
                            value={date} 
                            onChange={e => setDate(e.target.value)} 
                            className="w-full p-2 border rounded"
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 text-gray-700 rounded text-sm font-bold">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-bold hover:bg-green-700">Record</button>
                </div>
            </div>
        </div>
    );
};


const MpesaStkModal: React.FC<{ onClose: () => void; amount: number; tenantName: string; tenantId: string }> = ({ onClose, amount, tenantName, tenantId }) => {
    const { updateTenant, tenants, addNotification, addMessage, addOverpayment, properties, landlords } = useData();
    const [step, setStep] = useState<'input' | 'processing' | 'success' | 'timed_out'>('input');
    const [phone, setPhone] = useState('');
    const [txCode, setTxCode] = useState('');
    const [editableAmount, setEditableAmount] = useState(amount);
    const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const tenant = tenants.find(t => t.id === tenantId);
    const paymentUserId = resolveTenantPaymentUserId(tenant);
    const tenantsRef = useRef(tenants);
    const amountRef = useRef(editableAmount);
    useEffect(() => {
        tenantsRef.current = tenants;
    }, [tenants]);
    useEffect(() => {
        amountRef.current = editableAmount;
    }, [editableAmount]);

    // Pre-fill phone from tenant if available
    useEffect(() => {
        const t = tenants.find(te => te.id === tenantId);
        if (t?.phone) setPhone(t.phone);
    }, [tenantId, tenants]);

    useEffect(() => {
        if (!paymentUserId || !checkoutRequestId) return;

        const applyRow = (row: { status?: string | null; transaction_id?: string | null; result_desc?: string | null }) => {
            if (String(row.status ?? '') === 'completed') {
                const ref = String(row.transaction_id ?? '').trim() || checkoutRequestId;
                setTxCode(ref);
                const t = tenantsRef.current.find(te => te.id === tenantId);
                const amt = Number(amountRef.current ?? 0);
                if (t) {
                    const posting = buildStandardTenantPaymentPosting(t, amt, getTodayIsoDate(), 'M-Pesa', ref);
                    const newPayment = posting.payment;
                    const cycle = posting.cycle;
                    updateTenant(tenantId, posting.updates);

                    // Mark payment as reconciled in the payments ledger
                    supabase.from('payments')
                        .update({ reconciliation_status: 'reconciled' })
                        .eq('checkout_request_id', checkoutRequestId)
                        .then(() => {});

                    // Detect overpayment: amount exceeds expected rent (+ prorated installment if applicable)
                    const depositSettled = Number(t.depositPaid || 0) > 0 || t.depositExempt || t.rentExtension?.enabled;
                    if (depositSettled && !t.rentExtension?.enabled) {
                        const expectedRent = Number(t.rentAmount || 0);
                        const expectedInstallment = t.proratedDeposit?.enabled && !cycle.proratedUpdate?.fullyPaid
                            ? (t.proratedDeposit.monthlyInstallment || 0)
                            : 0;
                        const overpayAmt = amt - (expectedRent + expectedInstallment);
                        if (overpayAmt > 0) {
                            // Auto-apply: forward credit to next month and log as 'Applied'
                            // so the Overpayments ledger keeps an audit trail without
                            // requiring manual reconciliation.
                            const nextMonth = (() => {
                                const d = new Date(newPayment.date);
                                d.setMonth(d.getMonth() + 1);
                                return d.toISOString().slice(0, 7);
                            })();
                            addOverpayment({
                                id: `ovp-${Date.now()}`,
                                tenantName: t.name,
                                unit: t.unit,
                                amount: overpayAmt,
                                reference: ref,
                                dateReceived: newPayment.date,
                                appliedMonth: nextMonth,
                                status: 'Applied',
                            });
                        }
                    }

                    const msg = `Tenant ${t.name} paid KES ${amt.toLocaleString()} via M-Pesa.`;
                    addNotification({
                        id: `notif-${Date.now()}`,
                        title: 'Payment Received',
                        message: msg,
                        date: new Date().toLocaleString(),
                        read: false,
                        type: 'Success',
                        recipientRole: 'All',
                    });
                    // Notify the landlord separately
                    addNotification({
                        id: `notif-landlord-${Date.now()}`,
                        title: 'Rent Payment Received',
                        message: `${t.name} (${t.unit}) paid KES ${amt.toLocaleString()} via M-Pesa. Ref: ${ref}`,
                        date: new Date().toLocaleString(),
                        read: false,
                        type: 'Success',
                        recipientRole: 'Landlord',
                    });
                    addMessage({
                        id: `msg-${Date.now()}`,
                        recipient: { name: t.name, contact: t.phone },
                        content: `Payment of KES ${amt.toLocaleString()} received. Ref: ${ref}. Thank you!`,
                        channel: 'SMS',
                        status: 'Sent',
                        timestamp: new Date().toLocaleString(),
                        priority: 'Normal',
                    });
                }
                setStep('success');
                setIsSubmitting(false);
            }
            if (String(row.status ?? '') === 'failed' || String(row.status ?? '') === 'cancelled') {
                setErrorMsg(String(row.result_desc ?? 'Payment did not complete.'));
                setStep('input');
                setIsSubmitting(false);
                setCheckoutRequestId(null);
            }
            if (String(row.status ?? '') === 'timed_out') {
                setStep('timed_out');
                setIsSubmitting(false);
            }
        };

        return followStkPaymentCompletion(supabase, paymentUserId, checkoutRequestId, applyRow);
    }, [paymentUserId, checkoutRequestId, tenantId, updateTenant, addNotification, addMessage]);

    // Resolve the tenant's unit tag so it can be sent as AccountReference —
    // this makes the subsequent C2B confirmation (which carries the same tag
    // as BillRefNumber) reconcile back to this tenant automatically.
    // Falls back to tenant.unit (e.g. "KRG11") when no explicit unitTag field
    // is set on the unit record — the unit number IS the paybill account.
    const unitTag = (() => {
        if (!tenant?.unitId) return null;
        const prop = properties.find(p => p.id === tenant.propertyId);
        const u = prop?.units?.find(x => x.id === tenant.unitId);
        const explicit = String((u as any)?.unitTag ?? '').trim();
        const fallback = String(tenant?.unit ?? '').trim();
        return explicit || fallback || null;
    })();

    const handlePay = async () => {
        setErrorMsg(null);

        if (!paymentUserId) {
            setErrorMsg(
                'This tenant is not linked to a Supabase login (auth user). STK cannot be recorded in the payments ledger. Use Record Payment for offline settlement, or onboard the tenant via Registration → Users so their ID matches their login.',
            );
            return;
        }

        if (!unitTag) {
            setErrorMsg(
                'This tenant has no unit assigned. Allocate a unit in Tenants → Applications before initiating STK push.',
            );
            return;
        }

        if (!/^(2547|07)\d{8}$/.test(phone.replace(/\s/g, ''))) {
            alert('Please enter a valid Kenyan mobile number');
            return;
        }

        const amt = Math.round(Number(editableAmount) || 0);
        if (amt < 1) { setErrorMsg('Amount must be at least KES 1.'); return; }
        if (amt > 150_000) { setErrorMsg('Amount exceeds the M-Pesa per-transaction limit of KES 150,000.'); return; }

        setIsSubmitting(true);
        setStep('processing');

        try {
            // Full RMS: ALL STK payments route to the Agency paybill (the platform
            // MPESA_SHORTCODE). Revenue splitting between landlord and agency is
            // reconciled downstream via payouts — the tenant is only prompted once.
            const { data, error } = await supabase.functions.invoke('mpesa-stk-push', {
                body: {
                    phone,
                    amount: Math.round(Number(editableAmount) || 0),
                    leaseId: tenantId,
                    userId: paymentUserId,
                    unitTag,
                },
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
            setStep('input');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900/60 z-[1400] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <style>{`
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                @keyframes bounce { 0%, 80%, 100% { transform: scale(0); opacity: 0.5; } 40% { transform: scale(1); opacity: 1; } }
                
                .mpesa-card {
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 8px 25px rgba(31, 159, 33, 0.15);
                    padding: 30px;
                    border: 1px solid #e0f0e0;
                    width: 100%;
                    max-width: 450px;
                    position: relative;
                }
                
                .mpesa-header {
                    display: flex;
                    align-items: center;
                    margin-bottom: 25px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #e8f5e9;
                }
                
                .mpesa-icon-box {
                    width: 50px;
                    height: 50px;
                    background: #1F9F21;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-right: 15px;
                    box-shadow: 0 4px 10px rgba(31, 159, 33, 0.3);
                }
                
                .mpesa-title {
                    font-size: 22px;
                    font-weight: 700;
                    color: #1a365d;
                }
                
                .mpesa-input-group {
                    margin-bottom: 25px;
                }
                
                .mpesa-label {
                    display: block;
                    margin-bottom: 8px;
                    font-weight: 600;
                    color: #2d3748;
                    font-size: 15px;
                }
                
                .mpesa-input {
                    width: 100%;
                    padding: 14px;
                    border: 2px solid #c8e6c9;
                    border-radius: 12px;
                    font-size: 16px;
                    transition: all 0.3s;
                }
                
                .mpesa-input:focus {
                    outline: none;
                    border-color: #1F9F21;
                    box-shadow: 0 0 0 3px rgba(31, 159, 33, 0.2);
                }
                
                .mpesa-btn {
                    background: linear-gradient(to right, #1F9F21, #177D1A);
                    color: white;
                    border: none;
                    padding: 14px 20px;
                    width: 100%;
                    border-radius: 12px;
                    font-size: 17px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(31, 159, 33, 0.4);
                    position: relative;
                    overflow: hidden;
                }
                
                .mpesa-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(31, 159, 33, 0.6);
                }
                
                .mpesa-spinner {
                    width: 60px;
                    height: 60px;
                    border: 5px solid rgba(31, 159, 33, 0.2);
                    border-top: 5px solid #1F9F21;
                    border-radius: 50%;
                    margin: 0 auto 25px;
                    animation: spin 1s linear infinite;
                }
                
                .mpesa-success-msg {
                    background: #e8f5e9;
                    border-left: 4px solid #1F9F21;
                    padding: 20px;
                    border-radius: 0 12px 12px 0;
                    margin: 25px 0;
                    font-size: 18px;
                    color: #1b5e20;
                    font-weight: 600;
                    border: 1px solid #c8e6c9;
                }
                
                .mpesa-tx-code {
                    background: #f1fdf1;
                    padding: 15px;
                    border-radius: 10px;
                    font-family: monospace;
                    font-size: 18px;
                    letter-spacing: 1px;
                    margin-top: 20px;
                    color: #177D1A;
                    font-weight: 700;
                    border: 1px dashed #1F9F21;
                    text-align: center;
                }
                
                .mpesa-logo {
                    position: absolute;
                    top: 20px;
                    right: 20px;
                    font-weight: 800;
                    font-size: 24px;
                    color: #1F9F21;
                    text-shadow: 0 2px 4px rgba(31, 159, 33, 0.2);
                }
                
                .mpesa-logo span {
                    color: #177D1A;
                }
                
                .loading-dots span {
                    display: inline-block;
                    width: 8px;
                    height: 8px;
                    background-color: #1F9F21;
                    border-radius: 50%;
                    animation: bounce 1.4s ease-in-out infinite both;
                }
                
                .loading-dots span:nth-child(1) { animation-delay: 0s; }
                .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
                .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
            `}</style>
            
            <div className="mpesa-card" onClick={e => e.stopPropagation()}>
                <div className="mpesa-logo">M<span>p</span>esa</div>

                {step === 'input' && (
                    <>
                        <div className="mpesa-header">
                            <div className="mpesa-icon-box">
                                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M21 16V8C20.9998 6.89543 20.5611 5.8362 19.7804 5.05508C18.9997 4.27396 17.9408 3.83526 16.836 3.835H7.164C6.05925 3.83526 4.99999 4.27396 4.21922 5.05508C3.43845 5.8362 2.99975 6.89543 3 8V16C3.00026 17.1046 3.439 18.1641 4.22005 18.9453C5.00111 19.7266 6.06048 20.1654 7.165 20.166H16.836C17.9405 20.1654 19.0002 19.7266 19.7813 18.9453C20.5623 18.1641 21.001 17.1046 21 16Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M7.5 12H16.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M7.5 15H12" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                            <h2 className="mpesa-title">Initiate STK Push</h2>
                        </div>
                        
                        <p className="text-sm text-gray-500 mb-6 -mt-4">Paying for {tenantName}</p>

                        {errorMsg && (
                            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg p-3 mb-4">{errorMsg}</p>
                        )}

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
                            <label className="mpesa-label">Amount (KES)</label>
                            <input 
                                type="number" 
                                value={editableAmount} 
                                onChange={e => setEditableAmount(parseFloat(e.target.value) || 0)} 
                                className="mpesa-input" 
                                placeholder="Enter amount"
                            />
                        </div>
                        
                        <div className="flex gap-3">
                            <button onClick={onClose} className="flex-1 py-3.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
                            <button type="button" disabled={isSubmitting} onClick={handlePay} className="flex-[2] mpesa-btn disabled:opacity-50">
                                {isSubmitting ? 'Sending...' : 'Send STK Push'}
                            </button>
                        </div>
                    </>
                )}

                {(step === 'processing' || step === 'success' || step === 'timed_out') && (
                    <div className="text-center pt-4">
                         <div className="mpesa-header" style={{ justifyContent: 'center', borderBottom: 'none' }}>
                            <div className="mpesa-icon-box" style={step === 'timed_out' ? { background: '#e65c00' } : {}}>
                                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M8 12L10.5 14.5L16 9" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                            <h2 className="mpesa-title">Payment Confirmation</h2>
                        </div>

                        {step === 'processing' && (
                            <div className="py-6">
                                <div className="mpesa-spinner"></div>
                                <p className="text-xl font-semibold text-[#1a365d] mb-2">Waiting for confirmation...</p>
                                <p className="text-[#4a904a] font-medium">Please enter your M-Pesa PIN on your device</p>
                                <div className="loading-dots flex justify-center gap-1.5 mt-6">
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        )}

                        {step === 'timed_out' && (
                            <div className="py-6 animate-fade-in">
                                <div className="text-5xl mb-4">⏱</div>
                                <p className="text-lg font-semibold text-gray-700 mb-2">Taking longer than expected</p>
                                <p className="text-sm text-gray-500 mb-1">No confirmation was received within 2 minutes.</p>
                                <p className="text-sm text-gray-500 mb-6">
                                    Check your M-Pesa messages — if the payment went through, use <strong>Record Payment</strong> to log it manually with the M-Pesa transaction code.
                                </p>
                                <div className="flex gap-3 justify-center">
                                    <button
                                        onClick={() => { setStep('input'); setCheckoutRequestId(null); setErrorMsg(null); }}
                                        className="px-5 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                                    >
                                        Try Again
                                    </button>
                                    <button onClick={onClose} className="px-5 py-2.5 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-900 transition-colors">
                                        Close
                                    </button>
                                </div>
                            </div>
                        )}

                        {step === 'success' && (
                            <div className="animate-fade-in">
                                <div className="mpesa-success-msg">
                                    Payment of <span className="text-[#1F9F21] font-bold ml-1">KES {Number(editableAmount ?? 0).toLocaleString()}</span> confirmed successfully!
                                </div>
                                <div className="text-left">
                                    <p className="text-[#4caf50] font-medium mb-1">Time:</p>
                                    <p className="text-[#2d3748] font-medium mb-4">{new Date().toLocaleString()}</p>
                                    <div className="mpesa-tx-code">
                                        {txCode}
                                    </div>
                                </div>
                                <button onClick={onClose} className="mpesa-btn mt-8">Done</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const FinesManagementModal: React.FC<{ tenant: TenantProfile; onClose: () => void }> = ({ tenant, onClose }) => {
    const { updateTenant, fines: fineRules, addMessage, addNotification } = useData();
    const [selectedFineId, setSelectedFineId] = useState('');
    const [amount, setAmount] = useState<string>('');
    const [comment, setComment] = useState('');

    const handleSelectFine = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const ruleId = e.target.value;
        setSelectedFineId(ruleId);
        const rule = fineRules.find(f => f.id === ruleId);
        if (rule) {
            setAmount(rule.basis === 'Fixed Fee' ? String(rule.value) : '');
        } else {
            setAmount('');
        }
    };

    const handleSave = () => {
        const rule = fineRules.find(f => f.id === selectedFineId);
        if (!rule) return;

        const newFine: FineItem = {
            id: `fine-${Date.now()}`,
            type: rule.type,
            amount: parseFloat(amount) || 0,
            date: getTodayIsoDate(),
            status: 'Pending'
        };
       
        const currentFines = tenant.outstandingFines || [];
        const updatedFines = [...currentFines, newFine];
        updateTenant(tenant.id, { outstandingFines: updatedFines });
        
        // --- NOTIFICATION & SMS ---
        const msgText = `You have been fined KES ${Number(parseFloat(amount) || 0).toLocaleString()} for ${rule.type}, kindly pay to avoid further penalties.`;
        
        // 1. SMS
        const sms: Message = {
            id: `msg-${Date.now()}`,
            recipient: { name: tenant.name, contact: tenant.phone },
            content: msgText,
            channel: 'SMS',
            status: 'Sent',
            timestamp: new Date().toLocaleString(),
            priority: 'High'
        };
        addMessage(sms);

        // 2. Notification (To Tenant if portal exists, but primarily logging here)
        addNotification({
            id: `notif-${Date.now()}`,
            title: 'Fine Applied',
            message: `Fine of KES ${Number(amount ?? 0).toLocaleString()} applied to ${tenant.name} for ${rule.type}`,
            date: new Date().toLocaleString(),
            read: false,
            type: 'Warning',
            recipientRole: 'Tenant'
        });

        alert(`Fine applied. SMS notification sent to ${tenant.name}.`);
        onClose();
    };

    const availableFines = fineRules.filter(f => !isLateFeeType(f.type));

    return (
        <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Issue Fine / Penalty</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
               
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Violation Type</label>
                        <select value={selectedFineId} onChange={handleSelectFine} className="w-full p-2 border rounded bg-white">
                            <option value="">Select violation...</option>
                            {availableFines.map(f => <option key={f.id} value={f.id}>{f.type}</option>)}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Late rent fines are calculated automatically.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES)</label>
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full p-2 border rounded" placeholder="0" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
                        <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3} className="w-full p-2 border rounded" placeholder="Details of violation..."></textarea>
                    </div>
                    <button onClick={handleSave} className="w-full bg-red-600 text-white py-2 rounded font-bold hover:bg-red-700">Apply Fine</button>
                </div>
            </div>
        </div>
    );
};

const NoticeTemplateModal: React.FC<{ 
    type: 'Warning' | 'Vacation' | 'Force' | 'Review Client Notice';
    tenant: TenantProfile;
    clientNotice?: Notice;
    onClose: () => void; 
    onAction: (data: any) => void 
}> = ({ type, tenant, clientNotice, onClose, onAction }) => {
    const [step, setStep] = useState<'edit' | 'preview'>('edit');
    const [subject, setSubject] = useState('');
    const [content, setContent] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');

    useEffect(() => {
        if (type === 'Warning') {
            setSubject('Formal Warning: Lease Violation');
            setContent(`Dear ${tenant.name},\n\nThis letter serves as a formal warning regarding a violation of your lease agreement for ${tenant.unit}. specifically:\n\n[Enter Details of Violation]\n\nPlease rectify this immediately to avoid further action.`);
        } else if (type === 'Vacation') {
            setSubject('Acknowledgement of Vacate Notice');
            setContent(`Dear ${tenant.name},\n\nWe acknowledge receipt of your notice to vacate ${tenant.unit}. Your move-out date is set for [Enter Date].\n\nPlease ensure the unit is cleaned and keys are returned by the move-out date for deposit processing.`);
        } else if (type === 'Force') {
            setSubject('Notice of Eviction');
            setContent(`Dear ${tenant.name},\n\nDue to repeated violations/non-payment, your lease for ${tenant.unit} is hereby terminated effective immediately.\n\nYou are required to vacate the premises by [Enter Date]. Failure to comply will result in legal action.`);
        } else if (type === 'Review Client Notice') {
            setSubject('Re: Your Vacate Notice');
            setContent(`Dear ${tenant.name},\n\nWe have received your request to vacate. \n\n[If Accepted]: We accept your notice. Move out date: ${clientNotice?.effectiveDate}.\n[If Rejected]: We cannot accept your notice at this time due to...`);
        }
    }, [type, tenant, clientNotice]);

    const handleSend = (channels: string[]) => {
        alert(`Document Sent via: ${channels.join(', ')}`);
        onAction({ subject, content, channels });
        onClose();
    };

    const handleSave = () => {
        alert('Template Saved.');
        onAction({ subject, content, channels: [] });
        onClose();
    };

    const handleAcceptClientNotice = () => {
        alert('Client Notice Accepted. Notification sent.');
        onAction({ action: 'Accepted', subject, content });
        onClose();
    };

    const handleRejectClientNotice = () => {
        if(!rejectionReason) return alert("Please provide a rejection reason.");
        alert('Client Notice Rejected. Tenant notified.');
        onAction({ action: 'Rejected', reason: rejectionReason });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[1400] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="text-lg font-bold text-gray-800">
                        {type === 'Review Client Notice' ? 'Review Tenant Notice' : `Generate ${type} Notice`}
                    </h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>

                <div className="flex-grow overflow-y-auto p-6">
                    {type === 'Review Client Notice' && step === 'edit' ? (
                        <div className="space-y-4">
                            <div className="bg-blue-50 p-4 rounded border border-blue-100 mb-4">
                                <h4 className="font-bold text-blue-800 text-sm">Client Request</h4>
                                <p className="text-sm text-blue-700 mt-1"><strong>Reason:</strong> {clientNotice?.reason}</p>
                                <p className="text-sm text-blue-700"><strong>Effective Date:</strong> {clientNotice?.effectiveDate}</p>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => setStep('preview')} className="p-4 border-2 border-green-100 bg-green-50 rounded-lg hover:border-green-300 text-left">
                                    <h5 className="font-bold text-green-800">Accept Notice</h5>
                                    <p className="text-xs text-green-700">Proceed to generate acceptance letter.</p>
                                </button>
                                <div className="p-4 border-2 border-red-100 bg-red-50 rounded-lg">
                                    <h5 className="font-bold text-red-800">Reject Notice</h5>
                                    <textarea 
                                        placeholder="Reason for rejection (e.g. Lease term not met, arrears)..." 
                                        className="w-full mt-2 p-2 text-sm border rounded"
                                        value={rejectionReason}
                                        onChange={e => setRejectionReason(e.target.value)}
                                    />
                                    <button onClick={handleRejectClientNotice} className="mt-2 w-full py-1 bg-red-600 text-white text-xs font-bold rounded">Send Rejection</button>
                                </div>
                            </div>
                        </div>
                    ) : step === 'edit' ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Subject</label>
                                <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full p-2 border rounded" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Content (Edit Template)</label>
                                <textarea value={content} onChange={e => setContent(e.target.value)} className="w-full p-2 border rounded h-64 font-mono text-sm" />
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gray-100 p-8 rounded-lg overflow-y-auto h-full border border-gray-300 shadow-inner">
                             <div className="bg-white p-8 shadow-lg max-w-lg mx-auto min-h-[400px] pdf-preview relative">
                                <div className="flex justify-between items-center border-b-2 border-gray-800 pb-4 mb-6">
                                    <div>
                                        <h1 className="text-2xl font-bold text-primary">TaskMe Realty</h1>
                                        <p className="text-xs text-gray-500">Property Management</p>
                                    </div>
                                    <div className="text-right text-xs text-gray-500">
                                        <p>{fmtDate(new Date())}</p>
                                    </div>
                                </div>
                                <h2 className="text-lg font-bold text-center mb-6 uppercase underline">{subject}</h2>
                                <div className="text-sm whitespace-pre-wrap text-justify">
                                    {content}
                                </div>
                                <div className="absolute bottom-8 left-8 right-8 border-t pt-4 text-center text-[10px] text-gray-400">
                                    <p>This is a system generated document.</p>
                                    <p>TaskMe Realty • Nairobi, Kenya • info@taskme.re</p>
                                </div>
                             </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-between items-center rounded-b-xl">
                    {step === 'preview' && (
                        <button onClick={() => setStep('edit')} className="text-gray-600 hover:underline text-sm">Back to Edit</button>
                    )}
                    {step === 'edit' && type !== 'Review Client Notice' && (
                        <button onClick={() => setStep('preview')} className="ml-auto px-4 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700">Preview PDF</button>
                    )}
                    {step === 'preview' && (
                         <div className="flex gap-2 ml-auto">
                            <button onClick={handleSave} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded hover:bg-gray-100">Save Only</button>
                            <button onClick={() => safeAlert("Downloaded!")} className="px-4 py-2 bg-gray-200 text-gray-800 font-bold rounded hover:bg-gray-300 flex items-center"><Icon name="download" className="w-4 h-4 mr-1"/> Download</button>
                            <div className="relative group">
                                <button className="px-4 py-2 bg-primary text-white font-bold rounded hover:bg-primary-dark flex items-center">Send To Client <Icon name="chevron-down" className="w-3 h-3 ml-2" /></button>
                                <div className="absolute bottom-full right-0 mb-2 w-40 bg-white shadow-xl rounded-lg overflow-hidden hidden group-hover:block border">
                                    <button onClick={() => handleSend(['SMS'])} className="block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">SMS Link</button>
                                    <button onClick={() => handleSend(['Email'])} className="block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">Email PDF</button>
                                    <button onClick={() => handleSend(['WhatsApp'])} className="block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">WhatsApp</button>
                                    <button onClick={() => handleSend(['App'])} className="block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm">In-App</button>
                                    <button onClick={() => handleSend(['All'])} className="block w-full text-left px-4 py-2 hover:bg-gray-50 text-sm font-bold text-primary">Send All</button>
                                </div>
                            </div>
                             {type === 'Review Client Notice' && (
                                <button onClick={handleAcceptClientNotice} className="px-4 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700 ml-2">Finalize Acceptance</button>
                            )}
                         </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const BillManagementModal: React.FC<{ tenant: TenantProfile; onClose: () => void }> = ({ tenant, onClose }) => {
    const { updateTenant, currentUser, checkPermission } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canEdit = isSuperAdmin || checkPermission?.('Tenants', 'edit');
    const handleDeleteBillHistory = async (billId: string, label: string) => {
        if (!canEdit) return;
        if (!await safeConfirm(`Permanently delete bill "${label}"? This cannot be undone.`)) return;
        updateTenant(tenant.id, { outstandingBills: (tenant.outstandingBills || []).filter(b => b.id !== billId) });
    };
    const [activeTab, setActiveTab] = useState<'Recurring' | 'Metered' | 'History'>('Recurring');
   
    const [recurring, setRecurring] = useState<RecurringBillSettings>(tenant.recurringBills || {
        serviceCharge: 0, garbage: 0, security: 0, waterFixed: 0, other: 0
    });

    const [meterType, setMeterType] = useState('Water');
    const [prevRead, setPrevRead] = useState<string>('');
    const [currRead, setCurrRead] = useState<string>('');
    const [rate, setRate] = useState<string>('');
    const [calculatedAmount, setCalculatedAmount] = useState(0);

    // --- Prorated billing state (Water only) ---
    type BillingMode = 'flat' | 'prorated';
    interface ProratedTier { from: number; to: number | null; rate: number; }
    const [billingMode, setBillingMode] = useState<BillingMode>('flat');
    const [tiers, setTiers] = useState<ProratedTier[]>([
        { from: 1, to: 6, rate: 50 },
        { from: 7, to: 50, rate: 88 },
        { from: 51, to: null, rate: 100 },
    ]);

    const calcProrated = (units: number, tierList: ProratedTier[]): number => {
        const sorted = [...tierList].sort((a, b) => a.from - b.from);
        let total = 0;
        let remaining = units;
        for (const tier of sorted) {
            if (remaining <= 0) break;
            const tierSize = tier.to === null ? remaining : (tier.to - tier.from + 1);
            const apply = Math.min(tierSize, remaining);
            total += apply * tier.rate;
            remaining -= apply;
        }
        return Math.round(total * 100) / 100;
    };

    useEffect(() => {
        const p = parseFloat(prevRead) || 0;
        const c = parseFloat(currRead) || 0;
        const units = c > p ? c - p : 0;
        if (units <= 0) { setCalculatedAmount(0); return; }

        if (meterType === 'Water' && billingMode === 'prorated') {
            setCalculatedAmount(calcProrated(units, tiers));
        } else {
            const r = parseFloat(rate) || 0;
            setCalculatedAmount(units * r);
        }
    }, [prevRead, currRead, rate, billingMode, tiers, meterType]);

    const handleSaveRecurring = async () => {
        updateTenant(tenant.id, { recurringBills: recurring });
        await safeAlert("Recurring bills updated. These will be added to monthly rent.");
    };

    const handleSaveMetered = async () => {
        if (calculatedAmount <= 0) {
            await safeAlert("Invalid amount. Check readings.");
            return;
        }
        const units = (parseFloat(currRead) || 0) - (parseFloat(prevRead) || 0);
        const isProratedWater = meterType === 'Water' && billingMode === 'prorated';
        const tierDesc = isProratedWater
            ? tiers.map(t => `${t.from}-${t.to ?? '∞'}u@${t.rate}`).join(', ')
            : '';
        const newBill: BillItem = {
            id: `bill-${Date.now()}`,
            type: meterType,
            amount: calculatedAmount,
            date: getTodayIsoDate(),
            status: 'Pending',
            description: isProratedWater
                ? `Prorated Water (${units} units): ${tierDesc}`
                : `Metered ${meterType}: ${prevRead} → ${currRead}`,
            meterReadings: {
                previous: parseFloat(prevRead),
                current: parseFloat(currRead),
                units,
                rate: isProratedWater ? 0 : parseFloat(rate),
                period: new Date().toLocaleDateString('default', { month: 'short' })
            }
        };
        updateTenant(tenant.id, { outstandingBills: [...(tenant.outstandingBills || []), newBill] });
        await safeAlert(`${meterType} bill of KES ${calculatedAmount.toLocaleString()} saved.`);
        setPrevRead(''); setCurrRead(''); setRate('');
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b flex justify-between items-center">
                    <h3 className="text-xl font-bold text-gray-800">Bill Management</h3>
                    <button onClick={onClose}><Icon name="close" className="w-5 h-5 text-gray-500" /></button>
                </div>
               
                <div className="flex border-b bg-gray-50">
                    {['Recurring', 'Metered', 'History'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`flex-1 py-3 text-sm font-bold ${activeTab === tab ? 'bg-white border-t-2 border-primary text-primary' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="p-6 overflow-y-auto">
                    {activeTab === 'Recurring' && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-500 mb-4">Set fixed monthly charges added to rent.</p>
                            <div className="grid grid-cols-2 gap-4">
                                {Object.keys(recurring).map(key => (
                                    <div key={key}>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1">{key.replace(/([A-Z])/g, ' $1')}</label>
                                        <div className="relative">
                                            <span className="absolute left-2 top-2 text-xs text-gray-400">KES</span>
                                            <input
                                                type="number"
                                                value={(recurring as any)[key]}
                                                onChange={e => setRecurring({...recurring, [key]: parseFloat(e.target.value) || 0})}
                                                className="w-full p-2 pl-8 border rounded"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 pt-4 border-t flex justify-end">
                                <button onClick={handleSaveRecurring} className="bg-primary text-white px-4 py-2 rounded font-bold hover:bg-primary-dark">Update Recurring</button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'Metered' && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-500">Calculate usage-based bills from meter readings.</p>

                            {/* Utility type */}
                            <div>
                                <label className="block text-xs font-bold text-gray-600 uppercase mb-1">Utility Type</label>
                                <select
                                    value={meterType}
                                    onChange={e => { setMeterType(e.target.value); if (e.target.value !== 'Water') setBillingMode('flat'); }}
                                    className="w-full p-2 border rounded bg-white"
                                >
                                    <option>Water</option>
                                    <option>Electricity</option>
                                </select>
                            </div>

                            {/* Billing mode toggle — Water only */}
                            {meterType === 'Water' && (
                                <div className="flex bg-gray-100 p-1 rounded-lg w-full">
                                    {(['flat', 'prorated'] as BillingMode[]).map(m => (
                                        <button
                                            key={m}
                                            onClick={() => setBillingMode(m)}
                                            className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-all ${billingMode === m ? 'bg-white text-primary shadow' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            {m === 'flat' ? 'Flat Rate' : 'Prorated (Tiered)'}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Meter readings (always shown) */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Prev. Reading (units)</label>
                                    <input type="number" value={prevRead} onChange={e => setPrevRead(e.target.value)} className="w-full p-2 border rounded" placeholder="0"/>
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Curr. Reading (units)</label>
                                    <input type="number" value={currRead} onChange={e => setCurrRead(e.target.value)} className="w-full p-2 border rounded" placeholder="0"/>
                                </div>
                            </div>

                            {/* Flat rate input */}
                            {(meterType !== 'Water' || billingMode === 'flat') && (
                                <div>
                                    <label className="block text-xs text-gray-500 mb-1">Price / Unit (KES)</label>
                                    <input type="number" value={rate} onChange={e => setRate(e.target.value)} className="w-full p-2 border rounded" placeholder="e.g. 88"/>
                                </div>
                            )}

                            {/* Prorated tier configuration */}
                            {meterType === 'Water' && billingMode === 'prorated' && (
                                <div className="border rounded-lg overflow-hidden">
                                    <div className="bg-gray-50 px-3 py-2 flex justify-between items-center border-b">
                                        <p className="text-xs font-bold text-gray-600 uppercase">Tiered Rate Configuration</p>
                                        <button
                                            onClick={() => setTiers(prev => [...prev, { from: (prev[prev.length - 1]?.to ?? 0) + 1, to: null, rate: 0 }])}
                                            className="text-xs text-primary font-bold hover:underline"
                                        >
                                            + Add Tier
                                        </button>
                                    </div>
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                                            <tr>
                                                <th className="px-3 py-2 text-left">From (unit)</th>
                                                <th className="px-3 py-2 text-left">To (unit)</th>
                                                <th className="px-3 py-2 text-left">KES / unit</th>
                                                <th className="px-3 py-2"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {tiers.map((tier, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-2 py-1.5">
                                                        <input
                                                            type="number" value={tier.from} min={0}
                                                            onChange={e => setTiers(prev => prev.map((t, i) => i === idx ? { ...t, from: parseInt(e.target.value) || 0 } : t))}
                                                            className="w-full p-1.5 border rounded text-sm"
                                                        />
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        <input
                                                            type="number"
                                                            value={tier.to ?? ''}
                                                            placeholder="∞"
                                                            min={0}
                                                            onChange={e => setTiers(prev => prev.map((t, i) => i === idx ? { ...t, to: e.target.value === '' ? null : parseInt(e.target.value) } : t))}
                                                            className="w-full p-1.5 border rounded text-sm"
                                                        />
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        <input
                                                            type="number" value={tier.rate} min={0}
                                                            onChange={e => setTiers(prev => prev.map((t, i) => i === idx ? { ...t, rate: parseFloat(e.target.value) || 0 } : t))}
                                                            className="w-full p-1.5 border rounded text-sm"
                                                        />
                                                    </td>
                                                    <td className="px-2 py-1.5 text-center">
                                                        {tiers.length > 1 && (
                                                            <button onClick={() => setTiers(prev => prev.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600">
                                                                <Icon name="close" className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    <div className="px-3 py-2 bg-gray-50 border-t text-xs text-gray-500">
                                        Units consumed: <strong>{Math.max(0, (parseFloat(currRead)||0) - (parseFloat(prevRead)||0))}</strong>
                                    </div>
                                </div>
                            )}

                            {/* Total */}
                            <div className="bg-blue-50 p-4 rounded-lg text-center">
                                <p className="text-xs text-blue-600 uppercase font-bold">Calculated Total</p>
                                <p className="text-2xl font-bold text-blue-900 mt-1">KES {Number(calculatedAmount).toLocaleString()}</p>
                                <p className="text-xs text-blue-500 mt-1">
                                    {Math.max(0, (parseFloat(currRead)||0) - (parseFloat(prevRead)||0))} units
                                    {meterType === 'Water' && billingMode === 'prorated' ? ' · Tiered rate' : ''}
                                </p>
                            </div>

                            <button onClick={handleSaveMetered} className="w-full bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-primary-dark transition-colors">
                                Save Bill
                            </button>
                        </div>
                    )}

                    {activeTab === 'History' && (
                        <div className="space-y-2">
                            {(!tenant.outstandingBills || tenant.outstandingBills.length === 0) && <p className="text-center text-gray-400 py-4">No bill history.</p>}
                            {tenant.outstandingBills?.slice().reverse().map(bill => (
                                <div key={bill.id} className="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
                                    <div>
                                        <p className="font-bold text-sm">{bill.type}</p>
                                        <p className="text-xs text-gray-500">{bill.date} {bill.description ? `• ${bill.description}` : ''}</p>
                                    </div>
                                    <div className="text-right flex items-center gap-2">
                                        <div>
                                            <p className="font-bold text-gray-800">KES {Number(bill.amount ?? 0).toLocaleString()}</p>
                                            <span className={`text-[10px] px-2 py-0.5 rounded ${bill.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                {bill.status}
                                            </span>
                                        </div>
                                        {canEdit && (
                                            <button
                                                type="button"
                                                title="Delete bill permanently"
                                                onClick={() => handleDeleteBillHistory(bill.id, `${bill.type}${bill.description ? ' — ' + bill.description : ''}`)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-2 py-1 text-sm font-bold border border-red-200"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const StatusManagementModal: React.FC<{ tenant: TenantProfile; onClose: () => void }> = ({ tenant, onClose }) => {
    const { updateTenant } = useData();
    const [selectedStatuses, setSelectedStatuses] = useState<string[]>(tenant.houseStatus || []);

    const availableStatuses = [
        'Locked', 'Electricity Disconnected', 'Water Disconnected',
        'Gate Access Revoked', 'Gas Disconnected', 'Eviction notice issued',
        'Under Maintenance', 'Distressed'
    ];

    const toggleStatus = (status: string) => {
        const newStatuses = selectedStatuses.includes(status)
            ? selectedStatuses.filter(s => s !== status)
            : [...selectedStatuses, status];
        setSelectedStatuses(newStatuses);
    };

    const handleSave = () => {
        updateTenant(tenant.id, { houseStatus: selectedStatuses });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-xl font-bold text-gray-800 mb-4">House Status</h3>
                <div className="space-y-3 mb-6">
                    {availableStatuses.map(status => (
                        <label key={status} className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded">
                            <input
                                type="checkbox"
                                checked={selectedStatuses.includes(status)}
                                onChange={() => toggleStatus(status)}
                                className="h-5 w-5 text-primary rounded focus:ring-primary"
                            />
                            <span className={`text-sm ${selectedStatuses.includes(status) ? 'text-red-600 font-bold' : 'text-gray-700'}`}>{status}</span>
                        </label>
                    ))}
                </div>
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-gray-700">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-primary text-white rounded font-bold">Save Status</button>
                </div>
            </div>
        </div>
    );
};

const NewRequestModal: React.FC<{ tenant: TenantProfile; onClose: () => void; onSave: (data: Partial<TenantRequest>, extra?: { priority: TaskPriority, assignTo: string, images: string[] }) => void }> = ({ tenant, onClose, onSave }) => {
    const { vendors, staff } = useData();
    const [requestType, setRequestType] = useState<'General' | 'Maintenance'>('General');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<TaskPriority>(TaskPriority.Medium);
    const [assignTo, setAssignTo] = useState('');
    const [images, setImages] = useState<string[]>([]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files) as File[];
            files.forEach(file => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setImages(prev => [...prev, reader.result as string]);
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            type: requestType,
            title,
            description,
            images
        }, requestType === 'Maintenance' ? { priority, assignTo, images } : undefined);
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[1300] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-gray-800 mb-4">New Request / Ticket</h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Request Type</label>
                        <select
                            value={requestType}
                            onChange={e => setRequestType(e.target.value as any)}
                            className="w-full p-2 border rounded bg-white"
                        >
                            <option value="General">General Inquiry</option>
                            <option value="Maintenance">Maintenance</option>
                        </select>
                    </div>
                   
                    <input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="Subject"
                        className="w-full p-2 border rounded"
                        autoFocus
                        required
                    />
                   
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Details..."
                        rows={3}
                        className="w-full p-2 border rounded"
                        required
                    ></textarea>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Upload Images</label>
                        <input 
                            type="file" 
                            multiple 
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                        />
                        {images.length > 0 && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                                {images.map((img, idx) => (
                                    <img key={idx} src={img} alt="upload" className="w-10 h-10 object-cover rounded border" />
                                ))}
                            </div>
                        )}
                    </div>

                    {requestType === 'Maintenance' && (
                        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded border">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Priority</label>
                                <select
                                    value={priority}
                                    onChange={e => setPriority(e.target.value as TaskPriority)}
                                    className="w-full p-2 border rounded bg-white text-sm"
                                >
                                    <option value="Low">Low</option>
                                    <option value="Medium">Medium</option>
                                    <option value="High">High</option>
                                    <option value="Very High">Very High</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Assign To</label>
                                <select
                                    value={assignTo}
                                    onChange={e => setAssignTo(e.target.value)}
                                    className="w-full p-2 border rounded bg-white text-sm"
                                >
                                    <option value="">Unassigned</option>
                                    <optgroup label="Staff">
                                        {staff.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                    </optgroup>
                                    <optgroup label="Vendors">
                                        {vendors.map(v => <option key={v.id} value={v.name}>{v.name} ({v.specialty})</option>)}
                                    </optgroup>
                                </select>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-100 rounded">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-primary text-white rounded font-bold">Submit</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const StatementView: React.FC<{ tenant: TenantProfile; onClose: () => void }> = ({ tenant, onClose }) => {
    const history = [
        ...(tenant.paymentHistory || [])
          .filter(p => !String(p.reference || '').toUpperCase().startsWith('MULTI-') && String(p.method || '') !== 'Multi-Occupancy Allocation' && String(p.status || '') !== 'Multi-Occupancy Allocation')
          .map(p => ({
            date: p.date, desc: `Payment (${p.method}) - ${p.reference}`, amount: parseFloat(p.amount.replace(/[^0-9.]/g, '')), type: 'Credit'
        })),
        ...(tenant.outstandingBills || []).map(b => ({
            date: b.date, desc: `Bill: ${b.type}`, amount: b.amount, type: 'Debit'
        })),
        ...(tenant.outstandingFines || []).map(f => ({
            date: f.date, desc: `Fine: ${f.type}`, amount: f.amount, type: 'Debit'
        }))
    ].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <div className="hidden">
            <div id="printable-statement" className="p-8 bg-white max-w-3xl mx-auto text-gray-800 font-sans">
                <div className="flex justify-between items-start border-b-2 border-primary pb-4 mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-primary">TaskMe Realty</h1>
                        <p className="text-sm">P.O. Box 1234, Nairobi</p>
                        <p className="text-sm">info@taskme.re | +254 700 000 000</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-2xl font-bold uppercase text-gray-400">Statement</h2>
                        <p className="font-bold">{tenant.name}</p>
                        <p className="text-sm">{tenant.unit} - {tenant.propertyName}</p>
                        <p className="text-sm">Date: {fmtDate(new Date())}</p>
                    </div>
                </div>
               
                <table className="w-full text-sm mb-6">
                    <thead className="bg-gray-100 uppercase text-xs font-bold">
                        <tr>
                            <th className="py-2 px-2 text-left">Date</th>
                            <th className="py-2 px-2 text-left">Description</th>
                            <th className="py-2 px-2 text-right">Debit (Inv)</th>
                            <th className="py-2 px-2 text-right">Credit (Pay)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {history.map((item, idx) => (
                            <tr key={idx}>
                                <td className="py-2 px-2">{item.date}</td>
                                <td className="py-2 px-2">{item.desc}</td>
                                <td className="py-2 px-2 text-right">{item.type === 'Debit' ? Number(item.amount ?? 0).toLocaleString() : '-'}</td>
                                <td className="py-2 px-2 text-right">{item.type === 'Credit' ? Number(item.amount ?? 0).toLocaleString() : '-'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="border-t pt-4 text-center text-xs text-gray-500">
                    End of Statement. Thank you for your business.
                </div>
            </div>
        </div>
    );
};

// --- DETAIL VIEW ---

const TenantDetailView: React.FC<{ tenant: TenantProfile; onBack: () => void }> = ({ tenant: propTenant, onBack }) => {
    const { updateTenant, addTask, offboardingRecords, addOffboardingRecord, updateOffboardingRecord, addBill, properties, updateProperty, currentUser, checkPermission, tenants, addNotification } = useData();
    const isSuperAdmin = (currentUser as any)?.role === 'Super Admin';
    const canEdit       = isSuperAdmin || checkPermission('Tenants', 'edit');
    const canPay        = isSuperAdmin || checkPermission('Tenants', 'pay');
    const canDeactivate = isSuperAdmin || checkPermission('Tenants', 'deactivate');

    const [dbPayments, setDbPayments] = useState<any[]>([]);
    useEffect(() => {
        let cancelled = false;
        const tenantIds = [propTenant.id, ...tenants.filter(t => t.mainTenantId === propTenant.id && t.status !== 'Vacated').map(t => t.id)];
        if (tenantIds.length === 0) return;
        
        supabase
            .from('payments')
            .select('amount, created_at, source, transaction_id, checkout_request_id, matched_tenant_id')
            .eq('status', 'completed')
            .in('matched_tenant_id', tenantIds)
            .then(({ data, error }) => {
                if (!cancelled && data) {
                    setDbPayments(data);
                }
            });
            
        return () => { cancelled = true; };
    }, [propTenant.id, tenants]);

    const tenant = useMemo(() => {
        if (!dbPayments.length) return propTenant;
        const history = [...(propTenant.paymentHistory || [])];
        const existingRefs = new Set(history.map(p => normalizeMultiReceiptReference(p.reference)).filter(Boolean));
        
        const myDbPayments = dbPayments.filter(p => p.matched_tenant_id === propTenant.id);
        let added = false;
        for (const p of myDbPayments) {
            const ref = normalizeMultiReceiptReference(p.transaction_id || p.checkout_request_id);
            if (ref && !existingRefs.has(ref)) {
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
            return { ...propTenant, paymentHistory: history };
        }
        return propTenant;
    }, [propTenant, dbPayments]);

    // Helper: persist a tenant deletion to the backend, surfacing errors loudly
    // instead of swallowing them silently (which makes delete buttons appear "dead").
    const persistTenantDeletion = async (nextTenant: TenantProfile, action: string) => {
        try {
            const { error } = await supabase.schema('app').rpc('upsert_tenants_bulk', { p_tenants: [nextTenant] });
            if (error) {
                console.error(`[${action}] upsert_tenants_bulk failed`, error);
                await safeAlert(`${action} failed: ${error.message}\n\nThe change was applied locally but did not save to the server. It will revert on refresh.`);
                return false;
            }
            return true;
        } catch (e: any) {
            console.error(`[${action}] threw`, e);
            await safeAlert(`${action} failed: ${e?.message || 'Network error'}.\n\nThe change was applied locally but did not save to the server.`);
            return false;
        }
    };

    // Super Admin: permanently remove a bill (e.g. water/electricity added in error).
    const handleDeleteBill = async (billId: string, label: string, targetTenantId: string = tenant.id) => {
        if (!canEdit) return;
        if (!await safeConfirm(`Permanently delete bill "${label}"? This cannot be undone.`)) return;
        const targetTenant = [tenant, ...subTenants].find(t => t.id === targetTenantId) || tenant;
        const next = (targetTenant.outstandingBills || []).filter(b => b.id !== billId);
        const nextTenant = { ...targetTenant, outstandingBills: next };
        updateTenant(targetTenantId, nextTenant);
        await persistTenantDeletion(nextTenant, 'Delete bill');
    };

    // Super Admin: permanently remove a fine (incl. late fees stored as fines).
    const handleDeleteFine = async (fineId: string, label: string, targetTenantId: string = tenant.id) => {
        if (!canEdit) return;
        if (!await safeConfirm(`Permanently delete fine "${label}"? This cannot be undone.`)) return;
        const targetTenant = [tenant, ...subTenants].find(t => t.id === targetTenantId) || tenant;
        const next = (targetTenant.outstandingFines || []).filter(f => f.id !== fineId);
        const nextTenant = { ...targetTenant, outstandingFines: next };
        updateTenant(targetTenantId, nextTenant);
        await persistTenantDeletion(nextTenant, 'Delete fine');
    };

    // Super Admin: waive the auto-calculated late fee for the current month.
    const handleWaiveAutomatedLateFee = async (monthIso: string) => {
        if (!canEdit) return;
        if (!await safeConfirm('Permanently waive the automated late fee for this month?')) return;
        const existing = tenant.waivedLateFeeMonths || [];
        if (existing.includes(monthIso)) return;
        const nextTenant = { ...tenant, waivedLateFeeMonths: [...existing, monthIso] };
        updateTenant(tenant.id, nextTenant);
        await persistTenantDeletion(nextTenant, 'Waive late fee');
    };

    // Super Admin: permanently delete a specific late fee (bill-based or fine-based).
    const handleDeleteLateFeeItem = async (targetTenantId: string, itemId: string, isFine: boolean, label: string) => {
        if (!canEdit) return;
        if (!await safeConfirm(`Permanently delete late fee "${label}"? This cannot be undone.`)) return;

        const targetTenant = tenants.find(t => t.id === targetTenantId) || (targetTenantId === tenant.id ? tenant : null);
        if (!targetTenant) return;

        const currentWaived = targetTenant.waivedLateFeeMonths || [];
        const nextWaived = currentWaived.includes(currentMonthIso) ? currentWaived : [...currentWaived, currentMonthIso];

        let nextTenant: TenantProfile;
        if (isFine) {
            const next = (targetTenant.outstandingFines || []).filter(f => f.id !== itemId);
            nextTenant = { ...targetTenant, outstandingFines: next, waivedLateFeeMonths: nextWaived };
            updateTenant(targetTenantId, { outstandingFines: next, waivedLateFeeMonths: nextWaived });
        } else {
            const next = (targetTenant.outstandingBills || []).filter(b => b.id !== itemId);
            nextTenant = { ...targetTenant, outstandingBills: next, waivedLateFeeMonths: nextWaived };
            updateTenant(targetTenantId, { outstandingBills: next, waivedLateFeeMonths: nextWaived });
        }
        await persistTenantDeletion(nextTenant, 'Delete late fee');
    };

    const handleRecalculateLateFee = async () => {
        if (!canEdit) return;
        if (!await safeConfirm('Recalculate automated late fee for this month? This will bring back any waived or deleted late fee.')) return;
        const existing = tenant.waivedLateFeeMonths || [];
        const nextWaived = existing.filter(m => m !== currentMonthIso);
        const nextTenant = { ...tenant, waivedLateFeeMonths: nextWaived };
        updateTenant(tenant.id, { waivedLateFeeMonths: nextWaived });
        await persistTenantDeletion(nextTenant, 'Recalculate late fee');
    };

    const [chatInput, setChatInput] = useState('');
    const [activeModal, setActiveModal] = useState<'bills' | 'fines' | 'status' | 'request' | 'pay' | 'notice' | 'manageOffboarding' | 'initiateOffboarding' | 'negotiatedVacating' | 'recordPayment' | null>(null);
    const [activeFollowUpId, setActiveFollowUpId] = useState<string | null>(null);
    const [selectedPaymentKeys, setSelectedPaymentKeys] = useState<Set<string>>(new Set());
    useEffect(() => { setSelectedPaymentKeys(new Set()); }, [tenant.id]);
    
    // For notices
    const [noticeModalType, setNoticeModalType] = useState<'Warning' | 'Vacation' | 'Force' | 'Review Client Notice'>('Warning');
    const [reviewNotice, setReviewNotice] = useState<Notice | undefined>(undefined);

    // Lease Upload State (Mock)
    const leaseInputRef = useRef<HTMLInputElement>(null);

    // Local state to handle race condition of context update
    const [createdRecord, setCreatedRecord] = useState<OffboardingRecord | null>(null);

    const activeOffboardingRecord = useMemo(() => 
        offboardingRecords.find(r => r.tenantId === tenant.id && r.status !== 'Completed' && r.status !== 'Cancelled')
    , [offboardingRecords, tenant.id]);

    const effectiveRecord = createdRecord || activeOffboardingRecord;

    const handleOpenOffboarding = () => {
        if (effectiveRecord) {
            setActiveModal('manageOffboarding');
        } else {
            setActiveModal('initiateOffboarding');
        }
    };

    const handleStartOffboarding = (noticeDate: string, moveOutDate: string) => {
        const start = new Date(noticeDate);
        const end = new Date(moveOutDate);
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));

        if (diffDays < 30) {
            alert(`Notice Rejected: The notice period is only ${diffDays} days. A minimum of 30 days is required.`);
            return;
        }

        let warning = "";
        if (end.getDate() > 5) {
            warning = "\n\nWARNING: Vacation date is after the 5th. Full month rent is now due. Deposit may be forfeited or deducted if rent remains unpaid.";
        }

        const newRecord: OffboardingRecord = {
            id: `off-${Date.now()}`,
            tenantId: tenant.id,
            tenantName: tenant.name,
            unit: tenant.unit,
            noticeDate,
            moveOutDate,
            status: 'Notice Given',
            inspectionStatus: 'Pending',
            utilityClearance: false,
            depositRefunded: false,
            keysReturned: false
        };

        addOffboardingRecord(newRecord);
        updateTenant(tenant.id, { status: 'Notice', leaseEnd: moveOutDate });
        
        setCreatedRecord(newRecord); // Set local immediately
        setActiveModal('manageOffboarding');
        
        alert(`Offboarding initiated for ${tenant.name}. Status set to 'Notice'.${warning}`);
    };

    const handleRevokeNotice = (recordId: string, tenantId: string) => {
        if (window.confirm("Are you sure you want to revoke the notice? The tenant will remain Active and the offboarding process will be cancelled.")) {
            updateOffboardingRecord(recordId, { status: 'Cancelled' } as any);
            updateTenant(tenantId, { status: 'Active', leaseEnd: undefined });
            // Restore linked sub-tenants + re-occupy unit
            const anchor = tenants.find(t => t.id === tenantId);
            if (anchor) {
                const subs = tenants.filter(t => t.mainTenantId === tenantId && (t.status === 'Notice' || t.status === 'Evicted'));
                subs.forEach(s => updateTenant(s.id, { status: 'Active', leaseEnd: undefined }));
                const prop = properties.find(p => p.id === anchor.propertyId);
                if (prop && anchor.unitId) {
                    const updatedUnits = prop.units.map(u => u.id === anchor.unitId ? { ...u, status: 'Occupied' as const, tenantId: anchor.id } : u);
                    updateProperty(prop.id, { units: updatedUnits as any });
                }
            }
            setCreatedRecord(null);
            setActiveModal(null);
            alert("Notice revoked. Tenant status restored to Active.");
        }
    };

    /**
     * Reverse an offboarding (Notice) or eviction (Evicted) directly from the tenant profile.
     * Restores tenant + any sub-tenants to Active, re-occupies the unit, and marks any open
     * vacation/eviction notice or offboarding record as Cancelled/Resolved.
     */
    const handleReverseFromProfile = () => {
        const kind = tenant.status === 'Evicted' ? 'eviction' : 'offboarding';
        if (!window.confirm(`Reverse ${kind} for ${tenant.name}? They will be restored to Active and the unit re-occupied.`)) return;

        // 1. Resolve open notices of type Vacation/Eviction
        const nextNotices = (tenant.notices || []).map(n =>
            (n.type === 'Vacation' || n.type === 'Eviction') && n.status === 'Active'
                ? { ...n, status: 'Resolved' as const }
                : n
        );

        // 2. Cancel any open offboarding record
        const rec = offboardingRecords.find(r => r.tenantId === tenant.id && r.status !== 'Completed' && r.status !== 'Cancelled');
        if (rec) updateOffboardingRecord(rec.id, { status: 'Cancelled' } as any);

        // 3. Restore anchor tenant
        updateTenant(tenant.id, { status: 'Active', leaseEnd: undefined, notices: nextNotices });

        // 4. Restore sub-tenants
        const subs = tenants.filter(t => t.mainTenantId === tenant.id && (t.status === 'Notice' || t.status === 'Evicted'));
        subs.forEach(s => updateTenant(s.id, { status: 'Active', leaseEnd: undefined }));

        // 5. Re-occupy unit(s)
        const prop = properties.find(p => p.id === tenant.propertyId);
        if (prop && tenant.unitId) {
            const anchorSubUnitIds = new Set<string>(subs.map(s => s.unitId).filter(Boolean) as string[]);
            const updatedUnits = prop.units.map(u => {
                if (u.id === tenant.unitId) return { ...u, status: 'Occupied' as const, tenantId: tenant.id };
                if (anchorSubUnitIds.has(u.id)) return { ...u, status: 'Occupied' as const, tenantId: u.tenantId ?? undefined };
                return u;
            });
            updateProperty(prop.id, { units: updatedUnits as any });
        }

        alert(`${kind === 'eviction' ? 'Eviction' : 'Offboarding'} reversed. ${tenant.name} is now Active.`);
    };


    const handleStartNegotiatedVacating = (moveOutDate: string, reason: string) => {
        const today = getTodayIsoDate();
        const newRecord: OffboardingRecord = {
            id: `off-neg-${Date.now()}`,
            tenantId: tenant.id,
            tenantName: tenant.name,
            unit: tenant.unit,
            noticeDate: today,
            moveOutDate,
            status: 'Notice Given',
            inspectionStatus: 'Pending',
            utilityClearance: false,
            depositRefunded: false,
            keysReturned: false,
            propertyId: tenant.propertyId,
            negotiated: true,
            ...(reason ? { securityDepositForfeited: false } : {}),
        };
        addOffboardingRecord(newRecord);
        updateTenant(tenant.id, { status: 'Notice', leaseEnd: moveOutDate });
        setCreatedRecord(newRecord);
        setActiveModal('manageOffboarding');
        alert(`Negotiated vacating confirmed for ${tenant.name}. Move-out: ${moveOutDate}.${reason ? '\nReason: ' + reason : ''}`);
    };

    const handleFinalizeOffboarding = (record: OffboardingRecord) => {
        if (record.finalBillAmount !== undefined) {
            if (record.finalBillAmount > 0) {
                const refundBill: Bill = {
                    id: `bill-ref-${Date.now()}`,
                    vendor: record.tenantName,
                    category: 'Deposit Refund',
                    amount: record.finalBillAmount,
                    invoiceDate: getTodayIsoDate(),
                    dueDate: getTodayIsoDate(),
                    status: 'Unpaid',
                    description: `Deposit Refund for ${record.unit}`,
                    propertyId: 'Agency', 
                    metadata: { grossAmount: 0, deductions: 0 }
                };
                addBill(refundBill);
            } else if (record.finalBillAmount < 0) {
                console.log("Tenant owes balance", Math.abs(record.finalBillAmount));
            }
        }

        const prop = properties.find(p => p.id === tenant.propertyId);
        if (prop && tenant.unitId) {
            // Free up the Unit — only when no active sub-tenants remain on it
            const remainingSubs = tenants.filter(t =>
                t.id !== record.tenantId
                && t.unitId === tenant.unitId
                && t.mainTenantId !== record.tenantId
                && t.status !== 'Vacated'
                && t.status !== 'Evicted'
            );
            if (remainingSubs.length === 0) {
                const updatedUnits = prop.units.map(u => u.id === tenant.unitId ? { ...u, status: 'Vacant' as const, tenantId: null as any } : u);
                updateProperty(prop.id, { units: updatedUnits as any });
            }
        }
        
        updateTenant(record.tenantId, { 
            status: 'Vacated', 
            role: 'Affiliate',
            unitId: null as any, 
            unit: '' as any,
            referralCode: tenant?.referralCode || `AFF-${record.tenantId.substring(0, 6).toUpperCase()}`
        });

        // Archive sub-tenants
        const subTenants = tenants.filter(t => t.mainTenantId === record.tenantId);
        subTenants.forEach(s => {
            updateTenant(s.id, {
                status: 'Vacated',
                unitId: null as any,
                unit: '' as any,
            } as any);
        });

        // Sync Affiliate role to Auth so they login directly to Affiliate Portal
        const targetUserId = tenant?.authUserId || tenant?.id;
        if (targetUserId) {
            (async () => {
                try {
                    const { data: roleData } = await supabase.schema('app').from('roles').select('id').eq('name', 'Affiliate').maybeSingle();
                    if (roleData?.id) {
                        await supabase.schema('app').from('user_roles').update({ role_id: roleData.id }).eq('user_id', targetUserId);
                    }
                } catch (e) {
                    console.error("Failed to update role in DB:", e);
                }
            })();
        }

        updateOffboardingRecord(record.id, { status: 'Completed' });
        setCreatedRecord(null);
        setActiveModal(null);
        alert(`Offboarding finalized. ${subTenants.length ? `Main + ${subTenants.length} sub-tenant(s) archived.` : 'Tenant archived.'} ${record.finalBillAmount && record.finalBillAmount > 0 ? 'Deposit refund bill created in Payments.' : ''}`);
    };


    const handleLeaseUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            alert(`Uploaded: ${file.name}`);
        }
    };
    
    const handleLeaseDownload = () => {
        alert("Downloading Lease Document...");
    };

    // Placement fee: first month rent goes to agency as placement fee
    const tenantProperty = properties.find(p => p.id === tenant.propertyId);
    const onboardingMonth = getTenantRentStartAnchor(tenant)?.slice(0, 7) ?? null;
    const currentMonthIsoNow = getCurrentMonthIso();
    const isPlacementFeeMonth = !!(tenantProperty?.placementFee) && onboardingMonth === currentMonthIsoNow;

    // Days in Arrears & Automated Fine Logic
    // Requirement:
    // - Last due date drives the cycle.
    // - Next due date is the 1st of the next month.
    // - Late fees only accrue after (next due date + grace period) *and* only if next period rent isn't paid.
    // `viewMonthIso` lets the Balance Overview look back at any prior month
    // from activation through today. When it equals today's month, all
    // time-based logic behaves exactly as before. For prior months, we
    // anchor "now" to the last day of that month so date-derived figures
    // (days in arrears, late fees, recurring-paid flag) reflect that
    // historical snapshot instead of today.
    const todayMonthIso = getMonthPrefix(new Date());
    const [viewMonthIso, setViewMonthIso] = useState<string>(todayMonthIso);
    const [showRecomputeConfirm, setShowRecomputeConfirm] = useState(false);
    const isViewingPastMonth = viewMonthIso < todayMonthIso;
    const isViewingPrepaidMonth = viewMonthIso > todayMonthIso;
    const currentDate = useMemo(() => {
        if (isViewingPastMonth || isViewingPrepaidMonth) {
            const [y, m] = viewMonthIso.split('-').map(Number);
            return new Date(y, m, 0, 23, 59, 59); // last day of selected month
        }
        return new Date();
    }, [viewMonthIso, isViewingPastMonth, isViewingPrepaidMonth]);
    const currentMonthName = currentDate.toLocaleString('default', { month: 'long' });
    const currentMonthIso = getMonthPrefix(currentDate);
    const activeSubTenantsRaw = useMemo(() => tenants.filter(t => t.mainTenantId === tenant.id && t.status !== 'Vacated'), [tenants, tenant.id]);

    const activeSubTenants = useMemo(() => {
        if (!dbPayments.length) return activeSubTenantsRaw;
        return activeSubTenantsRaw.map(sub => {
            const history = [...(sub.paymentHistory || [])];
            const existingRefs = new Set(history.map(p => normalizeMultiReceiptReference(p.reference)).filter(Boolean));
            let added = false;
            for (const p of dbPayments.filter(dbP => dbP.matched_tenant_id === sub.id)) {
                const ref = normalizeMultiReceiptReference(p.transaction_id || p.checkout_request_id);
                if (ref && !existingRefs.has(ref)) {
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
                return { ...sub, paymentHistory: history };
            }
            return sub;
        });
    }, [activeSubTenantsRaw, dbPayments]);

    const receiptRefsForLedger = useMemo(() => {
        const refs = new Set<string>();
        const collect = (history: any[] | undefined) => {
            for (const payment of history || []) {
                const ref = normalizeMultiReceiptReference(payment?.reference);
                if (ref) refs.add(ref);
            }
        };
        collect(tenant.paymentHistory as any[]);
        if (tenant.occupancyType === 'Main') {
            activeSubTenants.forEach(sub => collect(sub.paymentHistory as any[]));
        }
        return Array.from(refs).sort();
    }, [tenant.paymentHistory, tenant.occupancyType, activeSubTenants]);

    const receiptRefsLedgerKey = receiptRefsForLedger.join('|');
    const [ledgerReceiptAmounts, setLedgerReceiptAmounts] = useState<Record<string, number>>({});
    const [isLedgerReceiptAmountsLoading, setIsLedgerReceiptAmountsLoading] = useState(false);
    const [loadedLedgerReceiptKey, setLoadedLedgerReceiptKey] = useState('');
    // Render the profile immediately; the receipt-amount lookup refines the
    // ledger in place. A stale ledger is far better than a stuck spinner.
    const isMultiLedgerReady = true;
    const isMultiLedgerReconciling = tenant.occupancyType === 'Main'
        && receiptRefsForLedger.length > 0
        && loadedLedgerReceiptKey !== receiptRefsLedgerKey
        && isLedgerReceiptAmountsLoading;

    useEffect(() => {
        let cancelled = false;
        if (receiptRefsForLedger.length === 0) {
            setLedgerReceiptAmounts({});
            setIsLedgerReceiptAmountsLoading(false);
            setLoadedLedgerReceiptKey('');
            return () => { cancelled = true; };
        }

        if (loadedLedgerReceiptKey === receiptRefsLedgerKey) {
            return;
        }

        const loadLedgerAmounts = async () => {
            setIsLedgerReceiptAmountsLoading(true);

            const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
                Promise.race([
                    p,
                    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('ledger receipt lookup timeout')), ms)),
                ]);

            try {
                const next: Record<string, number> = {};
                const chunkSize = 80;
                for (let i = 0; i < receiptRefsForLedger.length; i += chunkSize) {
                    const chunk = receiptRefsForLedger.slice(i, i + chunkSize);
                    const refSet = new Set(chunk);
                    const [txResult, checkoutResult] = await withTimeout(Promise.all([
                        supabase
                            .from('payments')
                            .select('transaction_id,checkout_request_id,amount')
                            .eq('status', 'completed')
                            .in('transaction_id', chunk),
                        supabase
                            .from('payments')
                            .select('transaction_id,checkout_request_id,amount')
                            .eq('status', 'completed')
                            .in('checkout_request_id', chunk),
                    ]), 4000);
                    if (txResult.error) throw txResult.error;
                    if (checkoutResult.error) throw checkoutResult.error;
                    for (const row of [...(txResult.data || []), ...(checkoutResult.data || [])] as any[]) {
                        const amount = Number(row?.amount || 0);
                        if (!Number.isFinite(amount) || amount <= 0) continue;
                        for (const candidate of [row.transaction_id, row.checkout_request_id]) {
                            const ref = normalizeMultiReceiptReference(candidate);
                            if (ref && refSet.has(ref)) next[ref] = amount;
                        }
                    }
                }
                if (!cancelled) setLedgerReceiptAmounts(next);
            } catch {
                if (!cancelled) setLedgerReceiptAmounts({});
            } finally {
                if (!cancelled) {
                    setLoadedLedgerReceiptKey(receiptRefsLedgerKey);
                    setIsLedgerReceiptAmountsLoading(false);
                }
            }
        };

        loadLedgerAmounts();
        return () => { cancelled = true; };
    }, [receiptRefsForLedger, receiptRefsLedgerKey]);

    const unifiedPaymentHistory = useMemo(() => {
        const history = (tenant.paymentHistory || []).filter(p => !String(p.reference || '').toUpperCase().startsWith('MULTI-') && String(p.method || '') !== 'Multi-Occupancy Allocation' && String(p.status || '') !== 'Multi-Occupancy Allocation');
        if (tenant.occupancyType !== 'Main') return history;
        return buildUnifiedMultiOccupancyPaymentHistory({...tenant, paymentHistory: history}, activeSubTenants, ledgerReceiptAmounts);
    }, [tenant.paymentHistory, activeSubTenants, tenant.occupancyType, tenant.id, ledgerReceiptAmounts]);

    // Forward advance ladder (computed against today's surplus) — drives
    // the list of future "Prepayment" months and the per-month applied
    // amount when viewing a future month.
    const prepaidLadder = useMemo(() => {
        try {
            const tMonth = todayMonthIso;
            const groupBalance = computeMultiOccupancyGroupMonthlyBalance(tenant, activeSubTenants, tMonth, { 
                allTenants: tenants,
                unifiedPaymentHistory,
            });
            const surplus = groupBalance.isCredit ? groupBalance.creditAmount : 0;

            const subBreakdown = activeSubTenants.map(s => ({
                tenantId: s.id,
                expected: computeSubUnitInvoicedForMonth(s, tMonth),
            }));
            const subAggregate = subBreakdown.reduce((s, r) => s + r.expected, 0);
            return computeAdvanceAllocation(tenant, surplus, tMonth, subAggregate, subBreakdown);
        } catch {
            return { months: [], paidUpToMonth: null, paidUpToLabel: null, partial: null, surplusRemaining: 0, bills: [] };
        }
    }, [tenant, activeSubTenants, tenants, todayMonthIso, unifiedPaymentHistory]);

    // Build the list of selectable months from tenant activation → today →
    // any prepaid future months from the ladder.
    const monthOptions = useMemo(() => {
        const anchor = getTenantProrationAnchor(tenant) || tenant.onboardingDate || tenant.onboarding_date;
        const startIso = anchor ? String(anchor).slice(0, 7) : todayMonthIso;
        
        let targetEndIso = todayMonthIso;
        if (startIso > todayMonthIso) {
            // Include starting month if it is in the future
            targetEndIso = startIso;
        }
        
        const [sy, sm] = startIso.split('-').map(Number);
        const [ty, tm] = targetEndIso.split('-').map(Number);
        const out: { iso: string; label: string; kind: 'past' | 'current' | 'prepaid' | 'partial' | 'next_month' }[] = [];
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
        // Append future prepaid months from the ladder.
        for (const fm of prepaidLadder.months) {
            if (out.some(o => o.iso === fm.monthIso)) continue;
            const [fy, fmn] = fm.monthIso.split('-').map(Number);
            const dt = new Date(fy, fmn - 1, 1);
            out.push({
                iso: fm.monthIso,
                label: dt.toLocaleString('default', { month: 'long', year: 'numeric' }),
                kind: fm.fullyCovered ? 'prepaid' : 'partial',
            });
        }
        return out.reverse(); // newest first
    }, [tenant, todayMonthIso, prepaidLadder]);

    // Snapshot of ladder data for the currently-viewed month (only set when
    // the view is a future prepaid month).
    const prepaidViewMonth = useMemo(() => {
        if (!isViewingPrepaidMonth) return null;
        return prepaidLadder.months.find(m => m.monthIso === viewMonthIso) || null;
    }, [isViewingPrepaidMonth, prepaidLadder, viewMonthIso]);


    const amountPaidBeforeThisMonth = (tenant.paymentHistory || [])
        .filter(p => p.status === "Paid" && p.date && p.date < currentMonthIso && !isBackdatedOpeningBalancePayment(p))
        .reduce((sum, p) => sum + parsePaymentAmount(p.amount), 0);

    const paidDates = (tenant.paymentHistory || [])
        .filter(p => p.status === 'Paid' && !!p.date)
        .map(p => String(p.date));

    const latestPaidDateStr = paidDates.length > 0
        ? paidDates.reduce((max, d) => (d > max ? d : max), paidDates[0])
        : getTenantRentStartAnchor(tenant);

    const rentStartAnchorForDue = getTenantRentStartAnchor(tenant);
    const isFirstMonthForDue = rentStartAnchorForDue && currentMonthIso === rentStartAnchorForDue.slice(0, 7);
    
    // User requirement: "Last due date for the first month should always be the rent start date date."
    const lastDueDate = isFirstMonthForDue && rentStartAnchorForDue
        ? new Date(rentStartAnchorForDue)
        : new Date(currentDate.getFullYear(), currentDate.getMonth(), Number(tenant.rentDueDate || 1));
    lastDueDate.setHours(0, 0, 0, 0);

    // Next due date is the 1st of the next month
    const nextDueDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    nextDueDate.setHours(0, 0, 0, 0);

    const isBackdatedPaymentEntry = isBackdatedOpeningBalancePayment;
    const amountPaidThisMonth = (tenant.paymentHistory || []).reduce((sum, payment: any) => {
        if (isBackdatedPaymentEntry(payment) || payment.status !== 'Paid') return sum;
        if (!String(payment.date || '').startsWith(currentMonthIso)) return sum;
        const ref = String(payment.reference || '').toUpperCase();
        if (ref.startsWith('MULTI-') || payment.method === 'Multi-Occupancy Allocation' || payment.status === 'Multi-Occupancy Allocation') return sum;
        return sum + parsePaymentAmount(payment.amount);
    }, 0);


    // Use prorated first-month rent when the tenant joined this month
    // and firstMonthRent was stored at approval (join day 10 or later).
    // When rentStartDate is in a FUTURE month, no rent is owed in the current month.
    const rentStartAnchor = getTenantProrationAnchor(tenant);
    const activationMonthIso = rentStartAnchor ? String(rentStartAnchor).slice(0, 7) : null;
    const isActivationMonth = activationMonthIso === currentMonthIso;
    const rentStartsInFutureMonth = !!activationMonthIso && activationMonthIso > currentMonthIso;
    const firstMonthRentStored = Number((tenant as any).firstMonthRent || 0);
    const effectiveRent = rentStartsInFutureMonth
        ? 0
        : isActivationMonth
            ? (firstMonthRentStored > 0
                ? firstMonthRentStored
                : calculateProratedFirstMonthRent(Number(tenant.rentAmount || 0), rentStartAnchor))
            : Number(tenant.rentAmount || 0);

    const isFullyPaid = isTenantRentCoveredForMonth(tenant, currentMonthIso);

    const rentStat = getMonthlyRentStatus(tenant, { isRentPaidThisMonth: isFullyPaid, asOfMonthIso: currentMonthIso });
    
    const [cYear, cMonth] = currentMonthIso.split('-').map(Number);
    const prevMonthDate = new Date(cYear, cMonth - 2, 1);
    const prevMonthIso = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const prevRentStat = getMonthlyRentStatus(tenant, { asOfMonthIso: prevMonthIso });
    
    const daysLateDelta = Math.max(0, rentStat.daysLateThisMonth - prevRentStat.daysLateThisMonth);
    const automatedLateFineDelta = Math.max(0, rentStat.automatedLateFine - prevRentStat.automatedLateFine);

    const daysLate = daysLateDelta;
    const lateFeeWaivedThisMonth = (tenant.waivedLateFeeMonths || []).includes(currentMonthIso);
    
    // Evaluate if a 'Late Fee' bill/fine for this exact month has already been persisted
    const hasPersistedCurrentLateFee = (tenant.outstandingBills || []).some(b => b.type === 'Late Fee' && (!b.date || String((b as any).date || '').startsWith(currentMonthIso))) || 
       (tenant.outstandingFines || []).some(f => ['Late Fee', 'Rent Arrears Fine', 'Defaulter Fine'].includes(f.type || '') && (!f.date || String((f as any).date || '').startsWith(currentMonthIso)));

    const automatedLateFine = lateFeeWaivedThisMonth || hasPersistedCurrentLateFee ? 0 : automatedLateFineDelta;

    // Derived Financials — use prorated rent in activation month.
    // rentDue always reflects the original amount invoiced; balance = invoiced − paid handles zeroing.
    const rentDue = effectiveRent;

    // Expected full deposit for a standard (non-prorated, non-extension) tenant.
    // Prefer depositExpected (set at registration and not mutated by payments)
    // and fall back to rentAmount × depositMonths for legacy rows. As a final
    // safety net, never let Expected be less than what's already been Paid —
    // some legacy rows have depositExpected = 0 and rentAmount = 0 at the
    // moment of registration, which used to render "Expected: 0 / Paid: 30,000".
    const depositMonthsRaw = Number((tenant as any).depositMonths ?? 1);
    const depositMonths = Number.isFinite(depositMonthsRaw) && depositMonthsRaw > 0 ? depositMonthsRaw : 1;
    const depositPaidAmt = Number(tenant.depositPaid || 0);
    const depositExpectedStandard = Math.max(
        Number((tenant as any).depositExpected ?? 0) > 0
            ? Number((tenant as any).depositExpected)
            : (Number(tenant.rentAmount || 0) * depositMonths),
        depositPaidAmt,
    );

    // Approximation: payments dated BEFORE this month consume the deposit
    // first. Used to detect whether the deposit was fully settled in a prior
    // month — in which case it no longer surfaces on Balance Overview or in
    // this month's Total Invoiced (the deposit tracking card up top covers it).
    // When the deposit was previously waived and later restored, only
    // payments made on/after the restore date are eligible to cover it —
    // the freshly-restored deposit is a priority deduction from that month
    // forward.
    const depositRestoredAtIso = String((tenant as any).depositRestoredAt || '');
    const depositPaymentsBeforeThisMonth = depositRestoredAtIso
        ? (tenant.paymentHistory || [])
            .filter(p => p.status === 'Paid' && p.date && p.date < currentMonthIso && p.date >= depositRestoredAtIso && !isBackdatedOpeningBalancePayment(p))
            .reduce((sum, p) => sum + parsePaymentAmount(p.amount), 0)
        : amountPaidBeforeThisMonth;
    const depositPaidPriorMonths = tenant.depositExempt
        ? 0
        : tenant.proratedDeposit?.enabled
            ? Math.min(getProratedDepositPaidBeforeMonth(tenant, currentMonthIso), tenant.proratedDeposit.totalDepositAmount)
            : Math.min(depositPaymentsBeforeThisMonth, depositExpectedStandard, Number(tenant.depositPaid || 0));

    const depositClearedBeforeThisMonth = !tenant.depositExempt && (
        tenant.proratedDeposit?.enabled
            ? getProratedDepositInstallmentDueForMonth(tenant, currentMonthIso) <= 0.5
            : (isActivationMonth
                ? false
                : depositExpectedStandard > 0 && depositPaidPriorMonths + 0.5 >= depositExpectedStandard)
    );

    // depositDue = total remaining balance (drives the Expected/Paid/Balance card).
    const depositDue = tenant.depositExempt
        ? 0
        : tenant.proratedDeposit?.enabled
            ? Math.max(0, tenant.proratedDeposit.totalDepositAmount - tenant.proratedDeposit.amountPaidSoFar)
            : Math.max(0, depositExpectedStandard - depositPaidAmt);

    // depositDueForInvoice — installment owed this period (used by checkbox totals).
    const depositDueForInvoice = tenant.depositExempt || depositClearedBeforeThisMonth
        ? 0
        : tenant.proratedDeposit?.enabled
            ? getProratedDepositInstallmentDueForMonth(tenant, currentMonthIso)
            : Math.max(0, depositExpectedStandard - depositPaidAmt);

    // depositDueForInvoiceGross — what to add to Total Invoiced this month.
    // Excluded ONLY when the deposit was already fully cleared in a prior
    // month. When (fully or partly) paid this month, the remaining-after-
    // prior gross is invoiced so the offsetting payment has a matching line.
    const isInitialNewTenantMonth = isTenantInInitialNewTenantMonth(tenant, currentMonthIso);
    
    let depositDueForInvoiceGross = 0;
    if (!tenant.depositExempt) {
        if (tenant.proratedDeposit?.enabled) {
            depositDueForInvoiceGross = getProratedDepositInstallmentDueForMonth(tenant, currentMonthIso);
        } else {
            const anchor = getTenantRentStartAnchor(tenant);
            const activationMonth = anchor ? String(anchor).slice(0, 7) : null;
            if (activationMonth && currentMonthIso > activationMonth) {
                depositDueForInvoiceGross = 0; // Already invoiced in activation month, handled via arrears
            } else if (activationMonth && currentMonthIso === activationMonth) {
                depositDueForInvoiceGross = depositExpectedStandard;
            } else {
                depositDueForInvoiceGross = depositClearedBeforeThisMonth ? 0 : Math.max(0, depositExpectedStandard - depositPaidPriorMonths);
            }
        }
    }


    // ── Deposit-first allocation (display layer) ─────────────────────────────
    // Business rule: every payment a tenant makes is applied to the
    // outstanding security deposit FIRST, before rent / late fee / bills.
    // The DB-side `record_manual_payment` and the C2B/STK paths already
    // do this on write. For tenants whose `depositPaid` lags behind
    // (legacy data, existing-tenant deposit backfills recorded with a
    // generic Cash reference, or selection-based manual payments that
    // didn't tick the deposit box) we recompute the *effective* deposit
    // paid through this month by allocating the current month's real
    // payments + carried-forward advance against any remaining deposit
    // balance. This keeps the Security Deposit card and the Balance
    // Overview deposit row reconciled with what the tenant has actually
    // paid in.
    const depositOwedBeforeThisMonth = tenant.depositExempt
        ? 0
        : tenant.proratedDeposit?.enabled
            ? Math.max(0, (tenant.proratedDeposit.totalDepositAmount || 0) - (tenant.proratedDeposit.amountPaidSoFar || 0))
            : Math.max(0, depositExpectedStandard - depositPaidPriorMonths);
    const depositCoveredByCurrentMonthPayments = Math.min(
        depositOwedBeforeThisMonth,
        Math.max(0, amountPaidThisMonth),
    );
    // Use the backend source of truth for current/future months to prevent double-counting
    // current month payments. Only recompute logically when viewing historical snapshots.
    const effectiveDepositPaid = tenant.proratedDeposit?.enabled
        ? getProratedDepositPaidThroughMonth(tenant, currentMonthIso)
        : Math.min(
            depositExpectedStandard, 
            isViewingPastMonth 
                ? depositPaidPriorMonths + depositCoveredByCurrentMonthPayments 
                : depositPaidAmt
          );
    const effectiveDepositTotal = tenant.proratedDeposit?.enabled
        ? (tenant.proratedDeposit.totalDepositAmount || 0)
        : depositExpectedStandard;
    const effectiveDepositBalance = Math.max(0, effectiveDepositTotal - effectiveDepositPaid);
    const effectiveDepositMonthsPaid = tenant.proratedDeposit?.enabled
        ? (Number(tenant.proratedDeposit.monthlyInstallment || 0) > 0
            ? Math.min(Number(tenant.proratedDeposit.durationMonths || 0), Math.floor((effectiveDepositPaid + 0.5) / Number(tenant.proratedDeposit.monthlyInstallment || 0)))
            : Number(tenant.proratedDeposit.monthsPaid || 0))
        : 0;

    // Used by checkbox totals. The "Fully Paid" UI label was removed — we now
    // only show "Paid" / "Partial" / "Unpaid" badges.
    const isDepositFullyPaid = !tenant.depositExempt && (
        tenant.proratedDeposit?.enabled
            ? effectiveDepositPaid + 0.5 >= (tenant.proratedDeposit.totalDepositAmount || 0)
            : depositExpectedStandard > 0 && effectiveDepositPaid + 0.5 >= depositExpectedStandard
    );
    const recurrentBills = (Object.values(tenant.recurringBills || {}) as Array<number | undefined>).reduce((a, b) => a + Number(b || 0), 0);
    // Exclude legacy backfilled "Rent Arrears" bills — those are already
    // counted via computeTenantArrears below (would otherwise double-count).
    const pendingBills = (tenant.outstandingBills || [])
        .filter(b => b.status === 'Pending')
        .filter(b => !(b.type === 'Rent Arrears' && String(b.id || '').startsWith('bill-backfill-')) && b.type !== 'Rent')
        .filter(b => !String(b.id || '').startsWith('ADVANCE-'))
        .filter(b => !String(b.id || '').startsWith('DEPOSIT-INST-'))
        .filter(b => b.type !== 'Late Fee')
        .filter(b => !b.date || b.date.slice(0, 7) <= currentMonthIso)
        .reduce((sum, b) => sum + b.amount, 0);

    const fines = (tenant.outstandingFines || [])
        .filter(f => !isLateFeeType(f.type) && f.status === 'Pending')
        .filter(f => !f.date || f.date.slice(0, 7) <= currentMonthIso)
        .reduce((sum, f) => sum + f.amount, 0);
    
    const rawArrearsBills = (tenant.outstandingBills || []).filter(b => {
        const isPrior = String((b as any).date || '') < currentMonthIso;
        if (!isPrior) return false;
        if ((b.type === 'Rent Arrears' && String(b.id || '').startsWith('bill-backfill-')) || b.type === 'Rent' || b.type === 'Late Fee' || String(b.id || '').startsWith('ADVANCE-') || String(b.id || '').startsWith('DEPOSIT-INST-')) return false;

        const isPending = b.status === 'Pending';
        const isPaidThisMonth = b.status === 'Paid' && String((b as any).datePaid || '').startsWith(currentMonthIso);
        return isPending || isPaidThisMonth;
    });
    const arrearsBills = isViewingPrepaidMonth ? [] : rawArrearsBills;

    const rawArrearsFines = (tenant.outstandingFines || []).filter(f => {
        const isPrior = String((f as any).date || '') < currentMonthIso;
        if (!isPrior) return false;
        if (isLateFeeType(f.type)) return false;

        const isPending = f.status === 'Pending';
        const isPaidThisMonth = f.status === 'Paid' && String((f as any).datePaid || '').startsWith(currentMonthIso);
        return isPending || isPaidThisMonth;
    });
    const arrearsFines = isViewingPrepaidMonth ? [] : rawArrearsFines;

    const getBillPaymentStatus = (b: any): 'Paid' | 'Partial' | 'Unpaid' => {
        if (b.status === 'Paid') return 'Paid';
        if (String(b.lastPaymentDate || '').startsWith(currentMonthIso)) return 'Partial';
        return 'Unpaid';
    };

    const getFinePaymentStatus = (f: any): 'Paid' | 'Partial' | 'Unpaid' => {
        if (f.status === 'Paid') return 'Paid';
        if (String(f.lastPaymentDate || '').startsWith(currentMonthIso)) return 'Partial';
        return 'Unpaid';
    };

    const currentBillsList = isViewingPrepaidMonth ? [] : (tenant.outstandingBills || []).filter(b => b.status === 'Pending' && !(b.type === 'Rent Arrears' && String(b.id || '').startsWith('bill-backfill-')) && b.type !== 'Rent' && !String(b.id || '').startsWith('ADVANCE-') && !String(b.id || '').startsWith('DEPOSIT-INST-') && b.type !== 'Late Fee' && (!b.date || String((b as any).date || '').startsWith(currentMonthIso)));
    const currentFinesList = isViewingPrepaidMonth ? [] : (tenant.outstandingFines || []).filter(f => !isLateFeeType(f.type) && f.status === 'Pending' && (!f.date || String((f as any).date || '').startsWith(currentMonthIso)));

    const currentLateFeeBills = (tenant.outstandingBills || [])
        .filter(b => b.status === 'Pending' && b.type === 'Late Fee' && (!b.date || String((b as any).date || '').startsWith(currentMonthIso)));
    const currentLateFeeFines = (tenant.outstandingFines || [])
        .filter(f => f.status === 'Pending' && isLateFeeType(f.type) && (!f.date || String((f as any).date || '').startsWith(currentMonthIso)));
    const currentLateFeesList = isViewingPrepaidMonth ? [] : [...currentLateFeeBills, ...currentLateFeeFines];

    const priorLateFeeBills = (tenant.outstandingBills || [])
        .filter(b => {
            const isPrior = String((b as any).date || '') < currentMonthIso;
            if (!isPrior) return false;
            if (b.type !== 'Late Fee') return false;
            const isPending = b.status === 'Pending';
            const isPaidThisMonth = b.status === 'Paid' && String((b as any).datePaid || '').startsWith(currentMonthIso);
            return isPending || isPaidThisMonth;
        });
    const priorLateFeeFines = (tenant.outstandingFines || [])
        .filter(f => {
            const isPrior = String((f as any).date || '') < currentMonthIso;
            if (!isPrior) return false;
            if (!isLateFeeType(f.type)) return false;
            const isPending = f.status === 'Pending';
            const isPaidThisMonth = f.status === 'Paid' && String((f as any).datePaid || '').startsWith(currentMonthIso);
            return isPending || isPaidThisMonth;
        });
    const priorLateFeesList = isViewingPrepaidMonth ? [] : [...priorLateFeeBills, ...priorLateFeeFines];
    
    // Total Expected = Rent + Recurrent + Bills + Fines + Automated Fine + Late Fees (Current & Prior) + Utility Deposits
    // Note: If rent is partially paid, we show total expected and subtract paid in UI
    const waterDepositOwed = (() => {
        const d = (tenant as any).waterDeposit as { required?: boolean; exempt?: boolean; amount?: number; paid?: number } | undefined;
        if (!d?.required || d?.exempt) return 0;
        return Math.max(0, (d.amount || 0) - (d.paid || 0));
    })();
    const electricityDepositOwed = (() => {
        const d = (tenant as any).electricityDeposit as { required?: boolean; exempt?: boolean; amount?: number; paid?: number } | undefined;
        if (!d?.required || d?.exempt) return 0;
        return Math.max(0, (d.amount || 0) - (d.paid || 0));
    })();
    // Carry-over arrears from prior months (rent + deposit installments).
    // Bills/fines from prior months are already retained via outstandingBills/Fines.
    const arrearsTargetIso = isViewingPrepaidMonth ? todayMonthIso : currentMonthIso;
    const arrearsBreakdown = computeTenantArrears(tenant, arrearsTargetIso, { subs: activeSubTenants, allTenants: tenants });
    const priorArrearsTotal = arrearsBreakdown.totalArrears;

    const currentLateFeesSum = currentLateFeesList.reduce((sum, b) => sum + Number(b.amount || 0), 0);
    const priorLateFeesSum = priorLateFeesList.reduce((sum, b) => sum + Number(b.amount || 0), 0);

    const effectivePendingBills = isViewingPrepaidMonth ? 0 : pendingBills;
    const effectiveFines = isViewingPrepaidMonth ? 0 : fines;
    const effectiveAutomatedLateFine = isViewingPrepaidMonth ? 0 : automatedLateFine;
    const effectiveWaterDepositOwed = isViewingPrepaidMonth ? 0 : waterDepositOwed;
    const effectiveElectricityDepositOwed = isViewingPrepaidMonth ? 0 : electricityDepositOwed;

    const totalExpected = rentDue + recurrentBills + effectivePendingBills + effectiveFines + effectiveAutomatedLateFine + currentLateFeesSum + priorLateFeesSum + depositDueForInvoiceGross + effectiveWaterDepositOwed + effectiveElectricityDepositOwed + priorArrearsTotal;
    const subUnitsInvoicedTotal = computeSubUnitsInvoicedTotal(tenants, tenant.id, currentMonthIso);
    const totalInvoicedWithSubs = totalExpected + subUnitsInvoicedTotal;
    
    // Total Paid is amountPaidThisMonth (assuming bills are paid separately or included in general pot for this visual)
    // For simplicity in this view, we just show Balance = Expected - Paid
    
    // If tenant is overdue from previous months, that should be in outstandingBills as 'Rent Arrears'
    // So 'rentDue' here is strictly current month rent.
    
    // Use the shared balance engine here as well. It consumes pre-rent-start
    // payments against registration-time deposit obligations before treating
    // any remaining amount as advance, preventing the same payment from being
    // counted twice for new tenants.
    const unifiedAmountPaidThisMonth = unifiedPaymentHistory.reduce((sum, p: any) => {
        if (isBackdatedPaymentEntry(p) || p.status !== 'Paid') return sum;
        if (!String(p.date || '').startsWith(currentMonthIso)) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);

    const monthlyBalance = tenant.occupancyType === 'Main'
        ? computeMultiOccupancyGroupMonthlyBalance(tenant, activeSubTenants, currentMonthIso, {
            mainTotalInvoiced: totalExpected,
            subTotalInvoiced: subUnitsInvoicedTotal,
            unifiedPaymentHistory,
        })
        : computeTenantMonthlyBalance(tenant, currentMonthIso, { totalInvoiced: totalExpected });
    const unifiedAdvanceFromPriorMonths = monthlyBalance.advanceFromPriorMonths;
    const unifiedBalanceDue = monthlyBalance.balanceDue;
    const unifiedIsCredit = monthlyBalance.isCredit;
    const unifiedCreditAmount = monthlyBalance.creditAmount;
    const advanceFromPriorMonths = monthlyBalance.advanceFromPriorMonths;

    // Allow negative balance so any overpayment shows as a credit / advance.
    // Arrears breakdown returns the GROSS prior-month invoice amounts plus
    // the portion of prior/backdated payments allocated against rent vs
    // deposit slots. We surface those as their own deduction lines so the
    // Balance Overview reads like a true ledger: full charges above the
    // line, offsetting payments below it.
    // Arrears items are already NET (unpaid remainder only). Payments
    // consumed by prior-month obligations stay in last month's record —
    // they do not reappear as current-month deductions. Only surplus
    // payments carry forward as `advanceFromPriorMonths`.
    const rentBackdatedApplied = 0;
    const depositBackdatedApplied = 0;
    const balanceDue = monthlyBalance.balanceDue;
    const isCreditBalance = balanceDue < 0;
    const creditAmount = isCreditBalance ? Math.abs(balanceDue) : 0;
    // When viewing a prepaid future month, ignore current-month payment
    // history and instead reflect the per-month applied amount from the
    // forward advance ladder. This lets tenants see how their prepayment
    // was distributed across coming months.
    const displayedAmountPaid = prepaidViewMonth ? 0 : unifiedAmountPaidThisMonth;
    const displayedAdvanceFromPrior = prepaidViewMonth ? prepaidViewMonth.startingSurplus : unifiedAdvanceFromPriorMonths;
    const displayedBalanceDue = prepaidViewMonth
        ? Math.max(0, prepaidViewMonth.totalExpected - prepaidViewMonth.applied)
        : unifiedBalanceDue;
    const displayedIsCreditBalance = prepaidViewMonth ? prepaidViewMonth.remainingSurplus > 0 : unifiedIsCredit;
    const displayedCreditAmount = prepaidViewMonth ? prepaidViewMonth.remainingSurplus : unifiedCreditAmount;

    const arrearsWithStatus = useMemo(() => {
        return arrearsBreakdown.items.map(it => {
            const owed = it.amount;
            const applied = it.paidInCurrentMonth || 0;

            let status: 'Paid' | 'Partial' | 'Unpaid' = 'Unpaid';
            if (applied >= owed) status = 'Paid';
            else if (applied > 0) status = 'Partial';

            return {
                ...it,
                paymentStatus: status,
                currentRemaining: owed - applied
            };
        });
    }, [arrearsBreakdown.items]);

    // ── Priority allocation for per-row status badges ─────────────────────────
    const RECURRING_BILL_LABELS: Record<keyof RecurringBillSettings, string> = {
        serviceCharge: 'Service Charge',
        garbage: 'Garbage Fee',
        security: 'Security Fee',
        waterFixed: 'Water (Fixed)',
        other: 'Other Charges',
    };
    const recurringPaidThisMonth = tenant.recurringBillsPaidThisMonth?.period === currentMonthIso
        ? (tenant.recurringBillsPaidThisMonth.amounts || {})
        : {};
    const lateFeePaidThisMonth = Number((tenant as any).lateFeePaidByMonth?.[currentMonthIso] || 0);
    const invoiceGrossAmount = (item: any) => Math.max(0, Number(item?.originalAmount ?? item?.amount ?? 0));
    const itemStatus = (key: string, owed: number): 'Paid' | 'Partial' | 'Unpaid' => {
        if (owed <= 0) return 'Paid';
        if (key === 'rent') {
            // Strict waterfall: current rent can only be paid by the pool
            // left AFTER deposit and every visible prior-period arrears row.
            // Use the same rows rendered in the Arrears section as the source
            // of truth, including rows already paid by this month's receipt.
            const visiblePriorArrearsTotal =
                arrearsWithStatus.reduce((s, it) => s + Number(it.amount || 0), 0)
                + arrearsBills.reduce((s, b) => s + invoiceGrossAmount(b), 0)
                + arrearsFines.reduce((s, f) => s + invoiceGrossAmount(f), 0)
                + priorLateFeesList.reduce((s, item) => s + invoiceGrossAmount(item), 0);
            const legacyPriorArrearsTotal = arrearsBreakdown.totalArrears
                + arrearsBills.reduce((s, b) => s + invoiceGrossAmount(b), 0)
                + arrearsFines.reduce((s, f) => s + invoiceGrossAmount(f), 0)
                + priorLateFeesList.reduce((s, item) => s + invoiceGrossAmount(item), 0);
            const depositOwedAtStart = prepaidViewMonth ? (prepaidViewMonth.depositInstallment || 0) : getDepositOwedAtStartOfMonth(tenant, currentMonthIso);
            const totalPriorArrears = prepaidViewMonth ? 0 : Math.max(visiblePriorArrearsTotal, legacyPriorArrearsTotal);
            const pool = prepaidViewMonth ? prepaidViewMonth.startingSurplus : (unifiedAmountPaidThisMonth + unifiedAdvanceFromPriorMonths);

            const subUnitsTotalForMonth = prepaidViewMonth
                ? activeSubTenants.reduce((sum, s) => sum + computeTenantTotalInvoicedForMonth(s, prepaidViewMonth.monthIso), 0)
                : subUnitsInvoicedTotal;

            // The current-month invoice may re-list the full deposit gross
            // (activation month) even when it was funded historically. The
            // pool includes that historical advance, so we must charge the
            // greater of (owed-at-start) vs (gross deposit on this invoice
            // less what was already paid toward it this month) to avoid
            // double-counting the same cash as covering both deposit and rent.
            const depositDemandOnPool = prepaidViewMonth
                ? depositOwedAtStart
                : Math.max(
                    depositOwedAtStart,
                    Math.max(0, depositDueForInvoiceGross - Math.max(0, unifiedAmountPaidThisMonth)),
                );

            const availableForRent = Math.max(
                0,
                pool - depositDemandOnPool - totalPriorArrears - subUnitsTotalForMonth,
            );
            if (availableForRent + 0.5 >= owed) return 'Paid';
            return availableForRent > 0.5 ? 'Partial' : 'Unpaid';
        }
        if (key === 'deposit') {
            if (tenant.depositExempt) return 'Paid';
            const owedToCheck = tenant.proratedDeposit?.enabled ? (Number(tenant.proratedDeposit.monthlyInstallment) || 0) : getDepositOwedAtStartOfMonth(tenant, currentMonthIso);
            if (owedToCheck <= 0) return 'Paid';

            if (prepaidViewMonth) {
                const pool = prepaidViewMonth.startingSurplus;
                if (pool + 0.5 >= owedToCheck) return 'Paid';
                if (pool > 0) return 'Partial';
                return 'Unpaid';
            }

            const visiblePriorArrearsTotal =
                arrearsWithStatus.reduce((s, it) => s + Number(it.amount || 0), 0)
                + arrearsBills.reduce((s, b) => s + invoiceGrossAmount(b), 0)
                + arrearsFines.reduce((s, f) => s + invoiceGrossAmount(f), 0)
                + priorLateFeesList.reduce((s, item) => s + invoiceGrossAmount(item), 0);
            const legacyPriorArrearsTotal = arrearsBreakdown.totalArrears
                + arrearsBills.reduce((s, b) => s + invoiceGrossAmount(b), 0)
                + arrearsFines.reduce((s, f) => s + invoiceGrossAmount(f), 0)
                + priorLateFeesList.reduce((s, item) => s + invoiceGrossAmount(item), 0);
            const totalPriorArrears = Math.max(visiblePriorArrearsTotal, legacyPriorArrearsTotal);
            
            const pool = (unifiedAmountPaidThisMonth + unifiedAdvanceFromPriorMonths);
            const availableForDeposit = Math.max(0, pool - arrearsBreakdown.totalArrears);

            if (availableForDeposit + 0.5 >= owedToCheck) return 'Paid';
            if (availableForDeposit > 0) return 'Partial';
            return 'Unpaid';
        }

        if (key.startsWith('recurring:')) {
            const recurringKey = key.slice(10) as keyof RecurringBillSettings;
            if (prepaidViewMonth) {
                // Determine if recurring was covered by surplus
                const depositOwedAtStart = prepaidViewMonth.depositInstallment || 0;
                const pool = prepaidViewMonth.startingSurplus;
                const rentOwed = Number(tenant.rentAmount || 0);
                const subUnitsTotalForMonth = activeSubTenants.reduce((sum, s) => sum + computeTenantTotalInvoicedForMonth(s, prepaidViewMonth.monthIso), 0);
                const recurringPool = Math.max(0, pool - depositOwedAtStart - subUnitsTotalForMonth - rentOwed);
                // We don't have a specific order for recurring in advance Allocation, we just know if the pool covers it all.
                // A simplistic check: if recurringPool covers the full recurring monthly total, it's paid.
                const totalRecurring = (Object.values(tenant.recurringBills || {}) as Array<number | undefined>)
                    .reduce((a, b) => a + Number(b || 0), 0);
                if (recurringPool + 0.5 >= totalRecurring) return 'Paid';
                if (recurringPool > 0) return 'Partial';
                return 'Unpaid';
            }
            const paid = Number(recurringPaidThisMonth[recurringKey] || 0);
            if (paid + 0.5 >= owed) return 'Paid';
            if (paid > 0) return 'Partial';
            return 'Unpaid';
        }
        if (key === 'lateFee') {
            if (lateFeePaidThisMonth + 0.5 >= owed) return 'Paid';
            if (lateFeePaidThisMonth > 0) return 'Partial';
            return 'Unpaid';
        }
        if (key === 'waterDeposit') {
            const paid = Number(tenant.waterDeposit?.paid || 0);
            const total = Number(tenant.waterDeposit?.amount || 0);
            if (paid + 0.5 >= total) return 'Paid';
            if (paid > 0) return 'Partial';
            return 'Unpaid';
        }
        if (key === 'electricityDeposit') {
            const paid = Number(tenant.electricityDeposit?.paid || 0);
            const total = Number(tenant.electricityDeposit?.amount || 0);
            if (paid + 0.5 >= total) return 'Paid';
            if (paid > 0) return 'Partial';
            return 'Unpaid';
        }
        return 'Unpaid';
    };
    const payStatusBadge = (s: 'Paid' | 'Partial' | 'Unpaid') => {
        if (s === 'Paid') return <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold shrink-0">Paid</span>;
        if (s === 'Partial') return <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold shrink-0">Partial</span>;
        return <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-bold shrink-0">Unpaid</span>;
    };
    const toggleKey = (key: string) => setSelectedPaymentKeys(prev => {
        const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s;
    });
    const selectedTotal = useMemo(() => {
        if (selectedPaymentKeys.size === 0) return Math.max(0, displayedBalanceDue);
        let t = 0;
        if (selectedPaymentKeys.has('deposit') && !tenant.depositExempt && !isDepositFullyPaid) t += depositDueForInvoice;
        if (selectedPaymentKeys.has('rent')) t += rentDue;
        if (selectedPaymentKeys.has('lateFee')) t += automatedLateFine;
        for (const key of (['serviceCharge', 'garbage', 'security', 'waterFixed', 'other'] as (keyof RecurringBillSettings)[])) {
            if (selectedPaymentKeys.has(`recurring:${key}`)) t += Number(tenant.recurringBills?.[key] ?? 0);
        }
        for (const b of (tenant.outstandingBills || [])) {
            if (selectedPaymentKeys.has(`bill:${b.id}`)) t += b.amount;
        }
        for (const f of (tenant.outstandingFines || [])) {
            if (selectedPaymentKeys.has(`fine:${f.id}`)) t += f.amount;
        }
        if (selectedPaymentKeys.has('waterDeposit')) t += waterDepositOwed;
        if (selectedPaymentKeys.has('electricityDeposit')) t += electricityDepositOwed;
        return t;
    }, [selectedPaymentKeys, tenant, isDepositFullyPaid, depositDueForInvoice, rentDue, automatedLateFine, waterDepositOwed, electricityDepositOwed, displayedBalanceDue]);

    // Display "Last Due Date" uses lastDueDate derived above.
    const firstDueDate = lastDueDate;

    // nextDueDate & lastDueDate are now derived above to match the automated late fine rule.

    // Check for client-initiated vacate notices
    useEffect(() => {
        const clientVacationNotice = tenant.notices?.find(n => n.origin === 'Client' && n.status === 'Active');
        if (clientVacationNotice) {
            setReviewNotice(clientVacationNotice);
        } else {
            setReviewNotice(undefined);
        }
    }, [tenant]);

    // Auto-sync stored status to 'Active' when tenant has paid onboarding month rent in full and deposit is settled
    useEffect(() => {
        if (
            tenant.id &&
            tenant.status !== 'Active' &&
            tenant.status !== 'Vacated' &&
            tenant.status !== 'Evicted' &&
            tenant.status !== 'Blacklisted' &&
            tenant.status !== 'Notice' &&
            effectiveTenantStatus(tenant) === 'Active'
        ) {
            updateTenant(tenant.id, {
                status: 'Active',
                activationDate: (tenant as any).activationDate || getTodayIsoDate()
            });
        }
    }, [tenant.id, tenant.status, tenant.paymentHistory, updateTenant]);

    // --- Actions Handlers ---

    const openNoticeModal = (type: 'Warning' | 'Vacation' | 'Force' | 'Review Client Notice') => {
        setNoticeModalType(type);
        setActiveModal('notice');
    };

    const handleNoticeAction = (data: any) => {
        let newNotices: Notice[] = [...(tenant.notices || [])];
        let newStatus = tenant.status;

        const today = getTodayIsoDate();

        if (data.action === 'Accepted') {
            // Update the client notice status
            newNotices = newNotices.map(n => n.id === reviewNotice?.id ? { ...n, status: 'Resolved' } : n);
            // Add an official system notice confirming vacation
            newNotices.push({
                id: `ntc-sys-${Date.now()}`,
                origin: 'System',
                type: 'Vacation',
                dateIssued: today,
                effectiveDate: reviewNotice?.effectiveDate || today,
                reason: 'Client request accepted',
                status: 'Active'
            });
            newStatus = 'Notice';
        } else if (data.action === 'Rejected') {
            // Update client notice status
            newNotices = newNotices.map(n => n.id === reviewNotice?.id ? { ...n, status: 'Resolved' } : n);
        } else {
             const newNotice: Notice = {
                id: `notice-${Date.now()}`,
                origin: 'System',
                dateIssued: today,
                effectiveDate: today,
                reason: data.subject,
                status: 'Active',
                type: noticeModalType === 'Force' ? 'Eviction' : noticeModalType === 'Warning' ? 'Warning' : 'Vacation'
            };
            newNotices.push(newNotice);

            if (noticeModalType === 'Vacation') newStatus = 'Notice';
            if (noticeModalType === 'Force') newStatus = 'Evicted';
        }

        updateTenant(tenant.id, { 
            status: newStatus, 
            notices: newNotices,
            ...(newStatus === 'Evicted' ? { unitId: null as any, unit: '' as any } : {})
        });

        // On forced eviction: immediately vacate the unit(s) and cascade to sub-tenants
        if (newStatus === 'Evicted') {
            const prop = properties.find(p => p.id === tenant.propertyId);
            const subs = tenants.filter(t => t.mainTenantId === tenant.id && t.status !== 'Vacated' && t.status !== 'Evicted');
            const subUnitIds = new Set<string>(subs.map(s => s.unitId).filter(Boolean) as string[]);
            if (prop) {
                const updatedUnits = prop.units.map(u => {
                    if (u.id === tenant.unitId) return { ...u, status: 'Vacant' as const, tenantId: null as any };
                    if (subUnitIds.has(u.id)) return { ...u, status: 'Vacant' as const, tenantId: null as any };
                    return u;
                });
                updateProperty(prop.id, { units: updatedUnits as any });
            }
            subs.forEach(s => updateTenant(s.id, { status: 'Evicted', unitId: null as any, unit: '' as any }));
        }
    };


    const handleNewRequest = (data: Partial<TenantRequest>, extra?: { priority: TaskPriority, assignTo: string, images: string[] }) => {
        const newReq: TenantRequest = {
            id: `req-${Date.now()}`,
            type: data.type || 'General',
            title: data.title || 'Request',
            description: data.description || '',
            date: getTodayIsoDate(),
            status: 'Pending',
            priority: 'Medium',
            messages: [],
            images: extra?.images || []
        };

        if (data.type === 'Maintenance') {
            const newTask: Task = {
                id: `TASK-${Date.now()}`,
                title: data.title || 'Maintenance',
                description: data.description || '',
                status: TaskStatus.Issued,
                priority: extra?.priority || TaskPriority.Medium,
                dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
                sla: 48,
                assignedTo: extra?.assignTo || 'Unassigned',
                tenant: { name: tenant.name, unit: tenant.unit },
                property: tenant.propertyName || 'Unknown',
                comments: [],
                history: [{ id: `h-${Date.now()}`, timestamp: new Date().toLocaleString(), event: 'Task Created via Hub' }],
                attachments: extra?.images || [],
                source: 'Internal',
                costs: { labor: 0, materials: 0, travel: 0 }
            };
            addTask(newTask);
            newReq.taskId = newTask.id;
            newReq.status = 'Converted to Task';
        }

        const updatedRequests = [...(tenant.requests || []), newReq];
        updateTenant(tenant.id, { requests: updatedRequests });
        setActiveModal(null);
        alert('Request added successfully.');
    };

    const handleSendMessage = () => {
        if (!chatInput.trim()) return;
        const newMessage: RequestMessage = {
            id: `msg-${Date.now()}`,
            sender: 'Admin',
            text: chatInput,
            date: new Date().toLocaleString()
        };
        
        let updatedRequests = [...(tenant.requests || [])];
        if (updatedRequests.length === 0) {
             updatedRequests.push({
                id: `gen-chat-${tenant.id}`,
                type: 'General',
                title: 'Direct Messages',
                description: 'Chat history',
                date: getTodayIsoDate(),
                status: 'Approved',
                priority: 'Medium',
                messages: []
            });
        }
        
        if (activeFollowUpId) {
            updatedRequests = updatedRequests.map(req => req.id === activeFollowUpId ? { ...req, messages: [...(req.messages || []), newMessage] } : req);
        } else {
            updatedRequests[0].messages = [...(updatedRequests[0].messages || []), newMessage];
        }

        updateTenant(tenant.id, { requests: updatedRequests });
        setChatInput('');
        setActiveFollowUpId(null);
    };

    const handleFollowUp = (reqId: string) => {
        handleSendMessage();
    };

    const handleDownloadStatement = () => {
        printSection('printable-statement', `Statement_${tenant.name}`);
    };

    const handleRecordPayment = async (amount: number, method: string, reference: string, date: string) => {
        const normalizedRef = String(reference || '').trim() || `MAN-${Date.now()}`;
        const hasSelection = selectedPaymentKeys.size > 0;
        const rpcMethod = method === 'Cash' ? 'Cash' : 'Bank';
        const newPayment = {
            date: date,
            amount: formatPaymentAmount(Number(amount ?? 0)),
            receiptAmount: formatPaymentAmount(Number(amount ?? 0)),
            status: 'Paid' as const,
            method: method,
            reference: normalizedRef
        };
        const updates: Partial<TenantProfile> = {
            paymentHistory: [newPayment, ...tenant.paymentHistory],
        };

        // ── Multi-occupancy: single source of invoicing ────────────────────
        // The MAIN unit is the only place invoicing and payments live. We do
        // NOT create separate payment entries on sub-units any more — their
        // rent is part of the main invoice and their status is derived from
        // the group ledger. The full receipt therefore stays on the Main.
        const amountForMain = Number(amount || 0);


        if (!hasSelection) {
            const posting = buildStandardTenantPaymentPosting(tenant, amountForMain, date, method, normalizedRef);
            Object.assign(updates, posting.updates);



        } else {
            let remainingTargetedAmount = Math.max(0, amountForMain);
            let targetedRentCredit = 0;
            let targetedStandardDepositCredit = 0;
            let targetedProratedDepositCredit = 0;

            // ── Deposit-first override ─────────────────────────────────────────
            // Business rule: every payment a tenant makes is applied to the
            // outstanding security deposit BEFORE rent / late fee / bills,
            // regardless of which items the admin ticked. This keeps the
            // selection-based manual-pay path consistent with the no-selection
            // waterfall and with `record_manual_payment` on the database.
            if (!tenant.depositExempt && !tenant.rentExtension?.enabled) {
                if (tenant.proratedDeposit?.enabled) {
                    const pd = tenant.proratedDeposit;
                    const installment = pd.monthlyInstallment || 0;
                    const remainingDepositBalance = Math.max(0, (pd.totalDepositAmount || 0) - (pd.amountPaidSoFar || 0));
                    const depositFirstCredit = Math.min(remainingTargetedAmount, Math.min(installment || remainingDepositBalance, remainingDepositBalance));
                    if (depositFirstCredit > 0 && !selectedPaymentKeys.has('deposit')) {
                        const nextAmt  = Math.min(pd.totalDepositAmount, (pd.amountPaidSoFar || 0) + depositFirstCredit);
                        const nextMonthsPaid = (pd.monthsPaid || 0) + (depositFirstCredit + 0.5 >= installment ? 1 : 0);
                        updates.proratedDeposit = { ...pd, monthsPaid: nextMonthsPaid, amountPaidSoFar: nextAmt };
                        updates.depositPaid = nextAmt;
                        targetedProratedDepositCredit = depositFirstCredit;
                        remainingTargetedAmount = Math.max(0, remainingTargetedAmount - depositFirstCredit);
                    }
                } else {
                    const remainingDepositBalance = Math.max(0, depositExpectedStandard - Number(tenant.depositPaid || 0));
                    const depositFirstCredit = Math.min(remainingTargetedAmount, remainingDepositBalance);
                    if (depositFirstCredit > 0 && !selectedPaymentKeys.has('deposit')) {
                        updates.depositPaid = Math.min(depositExpectedStandard, Number(tenant.depositPaid || 0) + depositFirstCredit);
                        targetedStandardDepositCredit = depositFirstCredit;
                        remainingTargetedAmount = Math.max(0, remainingTargetedAmount - depositFirstCredit);
                    }
                }
            }

            // ── Targeted allocation: apply payment only to the selected items ──────


            // 1. Rent — advance rent cycle
            if (selectedPaymentKeys.has('rent')) {
                targetedRentCredit = Math.min(remainingTargetedAmount, Math.max(0, rentDue));
                if (targetedRentCredit > 0) {
                    const cycle = computeRentPaymentCycleUpdate(tenant, targetedRentCredit, date);
                    updates.nextDueDate = cycle.nextDueDateIso;
                    if (cycle.clearRentExtension && tenant.rentExtension) {
                        updates.rentGraceDays = tenant.rentExtension.originalGraceDays ?? 4;
                        updates.rentExtension = { ...tenant.rentExtension, enabled: false };
                    }
                    if (cycle.proratedUpdate && tenant.proratedDeposit) {
                        updates.proratedDeposit = { ...tenant.proratedDeposit, ...cycle.proratedUpdate };
                        updates.depositPaid = cycle.proratedUpdate.amountPaidSoFar;
                    }
                    remainingTargetedAmount = Math.max(0, remainingTargetedAmount - targetedRentCredit);
                }
            }

            // 2. Standard (lump-sum) security deposit
            if (selectedPaymentKeys.has('deposit') && !tenant.depositExempt
                && !tenant.proratedDeposit?.enabled && !tenant.rentExtension?.enabled
                && Number(tenant.depositPaid || 0) < depositExpectedStandard) {
                targetedStandardDepositCredit = Math.min(remainingTargetedAmount, Math.max(0, depositExpectedStandard - Number(tenant.depositPaid || 0)));
                if (targetedStandardDepositCredit > 0) {
                    updates.depositPaid = Math.min(depositExpectedStandard, Number(tenant.depositPaid || 0) + targetedStandardDepositCredit);
                    remainingTargetedAmount = Math.max(0, remainingTargetedAmount - targetedStandardDepositCredit);
                }
            }

            // 3. Prorated deposit installment (only if cycle didn't already handle it)
            if (selectedPaymentKeys.has('deposit') && tenant.proratedDeposit?.enabled && !updates.proratedDeposit) {
                const installment = tenant.proratedDeposit.monthlyInstallment || 0;
                targetedProratedDepositCredit = Math.min(remainingTargetedAmount, installment);
                if (targetedProratedDepositCredit > 0) {
                    const nextAmt  = Math.min(tenant.proratedDeposit.totalDepositAmount, (tenant.proratedDeposit.amountPaidSoFar || 0) + targetedProratedDepositCredit);
                    const nextPaid = (tenant.proratedDeposit.monthsPaid || 0) + (targetedProratedDepositCredit + 0.5 >= installment ? 1 : 0);
                    updates.proratedDeposit = { ...tenant.proratedDeposit, monthsPaid: nextPaid, amountPaidSoFar: nextAmt };
                    updates.depositPaid = nextAmt;
                    remainingTargetedAmount = Math.max(0, remainingTargetedAmount - targetedProratedDepositCredit);
                }
            }

            // 4. Water utility deposit
            if (selectedPaymentKeys.has('waterDeposit') && tenant.waterDeposit) {
                const waterCredit = Math.min(remainingTargetedAmount, Math.max(0, tenant.waterDeposit.amount - Number(tenant.waterDeposit.paid || 0)));
                if (waterCredit > 0) {
                    updates.waterDeposit = { ...tenant.waterDeposit, paid: Math.min(tenant.waterDeposit.amount, Number(tenant.waterDeposit.paid || 0) + waterCredit) };
                    remainingTargetedAmount = Math.max(0, remainingTargetedAmount - waterCredit);
                }
            }

            // 5. Electricity utility deposit
            if (selectedPaymentKeys.has('electricityDeposit') && tenant.electricityDeposit) {
                const electricityCredit = Math.min(remainingTargetedAmount, Math.max(0, tenant.electricityDeposit.amount - Number(tenant.electricityDeposit.paid || 0)));
                if (electricityCredit > 0) {
                    updates.electricityDeposit = { ...tenant.electricityDeposit, paid: Math.min(tenant.electricityDeposit.amount, Number(tenant.electricityDeposit.paid || 0) + electricityCredit) };
                    remainingTargetedAmount = Math.max(0, remainingTargetedAmount - electricityCredit);
                }
            }

            // 6. Outstanding bills — mark selected ones Paid
            const billIds = [...selectedPaymentKeys].filter(k => k.startsWith('bill:')).map(k => k.slice(5));
            if (billIds.length > 0) {
                updates.outstandingBills = (tenant.outstandingBills || []).map(b => {
                    if (!billIds.includes(b.id)) return b;
                    if (remainingTargetedAmount + 0.5 < Number(b.amount || 0)) {
                        remainingTargetedAmount = 0;
                        return b;
                    }
                    remainingTargetedAmount = Math.max(0, remainingTargetedAmount - Number(b.amount || 0));
                    return { ...b, status: 'Paid' as const, datePaid: date };
                });
            }

            // 7. Outstanding fines — mark selected ones Paid
            const fineIds = [...selectedPaymentKeys].filter(k => k.startsWith('fine:')).map(k => k.slice(5));
            let updatedFines: FineItem[] = [...(tenant.outstandingFines || [])];
            if (fineIds.length > 0) {
                updatedFines = updatedFines.map(f => {
                    if (!fineIds.includes(f.id)) return f;
                    if (remainingTargetedAmount + 0.5 < Number(f.amount || 0)) {
                        remainingTargetedAmount = 0;
                        return f;
                    }
                    remainingTargetedAmount = Math.max(0, remainingTargetedAmount - Number(f.amount || 0));
                    return { ...f, status: 'Paid' as const, datePaid: date };
                });
            }

            // 8. Late fee — record a Paid fine entry
            if (selectedPaymentKeys.has('lateFee') && automatedLateFine > 0 && remainingTargetedAmount + 0.5 >= automatedLateFine) {
                updatedFines = [
                    ...updatedFines,
                    { id: `lf-${Date.now()}`, type: 'Late Rent', amount: automatedLateFine, date, status: 'Paid' as const, datePaid: date },
                ];
                remainingTargetedAmount = Math.max(0, remainingTargetedAmount - automatedLateFine);
            } else if (selectedPaymentKeys.has('lateFee') && automatedLateFine > 0) {
                remainingTargetedAmount = 0;
            }
            if (fineIds.length > 0 || selectedPaymentKeys.has('lateFee')) {
                updates.outstandingFines = updatedFines;
            }

            // 9. Recurring bills — track paid amounts per bill for this period
            const recurKeys = [...selectedPaymentKeys]
                .filter(k => k.startsWith('recurring:'))
                .map(k => k.slice(10) as keyof RecurringBillSettings);
            if (recurKeys.length > 0) {
                const period = date.slice(0, 7);
                const existingAmounts: Partial<Record<keyof RecurringBillSettings, number>> =
                    tenant.recurringBillsPaidThisMonth?.period === period
                        ? { ...tenant.recurringBillsPaidThisMonth.amounts }
                        : {};
                for (const key of recurKeys) {
                    const recurringCharge = Number(tenant.recurringBills?.[key] ?? 0);
                    const recurringCredit = Math.min(remainingTargetedAmount, Math.max(0, recurringCharge));
                    if (recurringCredit <= 0) continue;
                    existingAmounts[key] = Math.min(recurringCharge, Number(existingAmounts[key] || 0) + recurringCredit);
                    remainingTargetedAmount = Math.max(0, remainingTargetedAmount - recurringCredit);
                }
                updates.recurringBillsPaidThisMonth = { period, amounts: existingAmounts };
            }

            // 10. Activate pending tenant if both rent and deposit are now covered.
            // Checkbox selection alone is not enough — validate the payment amount too.
            if (tenant.status === 'PendingApproval' || tenant.status === 'Pending' || tenant.status === 'PendingAllocation' || tenant.status === 'PendingPayment') {
                const depositPaidAfterSelection = selectedPaymentKeys.has('deposit') && !tenant.depositExempt && !tenant.proratedDeposit?.enabled && !tenant.rentExtension?.enabled
                    ? Number(updates.depositPaid ?? tenant.depositPaid ?? 0)
                    : Number(tenant.depositPaid || 0);
                const depositCovered = tenant.depositExempt || !!tenant.rentExtension?.enabled || tenant.proratedDeposit?.enabled
                    ? (tenant.depositExempt
                        || !!tenant.rentExtension?.enabled
                        || Number((updates.proratedDeposit?.amountPaidSoFar ?? tenant.proratedDeposit?.amountPaidSoFar) || 0) + 0.5 >= Number(tenant.proratedDeposit?.totalDepositAmount || 0))
                    : depositPaidAfterSelection + 0.5 >= depositExpectedStandard;
                // Rent is "covered" either when the selected rent portion is
                // fully funded, or when nothing is invoiced for the current
                // month yet (tenant onboarded with a future rent start date
                // and has already settled their deposit / paid in advance).
                const rentCovered = rentDue <= 0.5
                    ? true
                    : (selectedPaymentKeys.has('rent') && (targetedRentCredit + 0.5 >= rentDue));
                const canAutoActivate = tenant.status === 'Pending' || tenant.status === 'PendingAllocation' || tenant.status === 'PendingPayment';
                if (canAutoActivate && depositCovered && rentCovered) {
                    updates.status = 'Active';
                    (updates as any).activationDate = date;
                }
            }
        }

        const { error } = await supabase.rpc('record_manual_payment', {
            p_tenant_id: tenant.id,
            // Multi-occupancy payments are already split above and posted to
            // each Sub tenant. Persist only the net amount left for the Main;
            // otherwise the database records the full receipt on the Main too,
            // creating false advance and leaving Sub invoices stale after reload.
            p_amount: Number(amountForMain ?? 0),
            p_reference: normalizedRef,
            p_method: rpcMethod,
            p_date: date,
        });
        if (error) {
            alert(`Payment was not saved: ${error.message}`);
            return;
        }

        updateTenant(tenant.id, updates);
        setSelectedPaymentKeys(new Set());
        setActiveModal(null);
        alert("Payment recorded successfully.");
    };

    const handleDeletePayment = async (unifiedPay: any) => {
        if (!unifiedPay) return;
        const baseRef = String(unifiedPay.reference ?? '').trim();
        if (!baseRef) {
            await safeAlert('This payment has no reference code and cannot be safely deleted from the ledger. Please contact support.');
            return;
        }

        // Two-step confirmation — this is destructive and irreversible.
        if (!(await safeConfirm(
            `⚠️ PERMANENTLY DELETE this payment?\n\n` +
            `Date: ${unifiedPay.date}\n` +
            `Amount: ${unifiedPay.amount}\n` +
            `Method: ${unifiedPay.method}\n` +
            `Ref: ${baseRef}\n\n` +
            `This will remove the payment from the tenant's history AND from the payments ledger. ` +
            `All associated multi-occupancy allocations on sub-units will also be deleted permanently.\n\n` +
            `This action cannot be undone.`
        ))) return;
        if (!(await safeConfirm(`Final confirmation: permanently delete payment ${baseRef}?`))) return;

        // Find all matching targets to delete from DB
        const targets: { tenantId: string; reference: string; isSub: boolean; paymentObj: any }[] = [];

        // Check Main tenant's history
        for (const p of (tenant.paymentHistory || [])) {
            const r = String(p.reference || '').trim();
            if (r === baseRef || r === `MULTI-${baseRef}`) {
                targets.push({ tenantId: tenant.id, reference: r, isSub: false, paymentObj: p });
            }
        }

        // Check sub-tenants' history
        for (const sub of activeSubTenants) {
            for (const p of (sub.paymentHistory || [])) {
                const r = String(p.reference || '').trim();
                if (r === baseRef || r === `MULTI-${baseRef}`) {
                    targets.push({ tenantId: sub.id, reference: r, isSub: true, paymentObj: p });
                }
            }
        }

        if (targets.length === 0) {
            await safeAlert('Could not locate any matching payments in records.');
            return;
        }

        // Call RPC for each target to delete from database
        for (const target of targets) {
            const { error: rpcErr } = await supabase.rpc('delete_tenant_payment', {
                p_tenant_id: target.tenantId,
                p_reference: target.reference,
            });
            if (rpcErr) {
                console.error('[handleDeletePayment] RPC failed for', target, rpcErr);
                await safeAlert(`Failed to delete payment for tenant ${target.tenantId}: ${rpcErr.message}`);
                return;
            }
        }

        // 1. Process Main Tenant updates
        const mainRemaining = (tenant.paymentHistory || []).filter(p => {
            const r = String(p.reference || '').trim();
            return r !== baseRef && r !== `MULTI-${baseRef}`;
        });
        const mainUpdates: Partial<TenantProfile> = { paymentHistory: mainRemaining };

        // ── nextDueDate: recompute from latest remaining Paid entry ────────────
        const paidRemaining = mainRemaining.filter(p => p.status === 'Paid' && !!p.date);
        if (paidRemaining.length > 0) {
            const latest = paidRemaining.reduce((m, p) => (p.date > m.date ? p : m), paidRemaining[0]);
            const nd = new Date(latest.date);
            nd.setMonth(nd.getMonth() + 1);
            nd.setDate(Math.min(28, Math.max(1, Number(tenant.rentDueDate ?? 1))));
            nd.setHours(0, 0, 0, 0);
            mainUpdates.nextDueDate = nd.toISOString().split('T')[0];
        } else {
            mainUpdates.nextDueDate = undefined;
        }

        // ── Deposit reversal ───────────────────────────────────────────────────
        const depExpected = Number((tenant as any).depositExpected ?? 0) > 0
            ? Number((tenant as any).depositExpected)
            : Number(tenant.rentAmount || 0) * Math.max(1, Number((tenant as any).depositMonths ?? 1));

        const mainPaymentDeletedObj = targets.find(t => !t.isSub)?.paymentObj;
        if (mainPaymentDeletedObj && !tenant.depositExempt && !tenant.rentExtension?.enabled && mainPaymentDeletedObj.status === 'Paid') {
            if (tenant.proratedDeposit?.enabled) {
                const pd = tenant.proratedDeposit;
                const newAmountPaid = Math.max(0, pd.amountPaidSoFar - (pd.monthlyInstallment || 0));
                const newMonthsPaid = Math.max(0, pd.monthsPaid - 1);
                mainUpdates.proratedDeposit = { ...pd, monthsPaid: newMonthsPaid, amountPaidSoFar: newAmountPaid };
                mainUpdates.depositPaid = newAmountPaid;
            } else {
                // Standard deposit: check if any remaining payment still covers rent + full deposit
                const baseRent = Number(tenant.rentAmount || 0);
                const anyStillCoversDeposit = mainRemaining.some(
                    p => p.status === 'Paid' &&
                         (parseFloat(p.amount.replace(/[^0-9.]/g, '')) || 0) >= baseRent + depExpected
                );
                if (!anyStillCoversDeposit) {
                    mainUpdates.depositPaid = 0;
                }
            }
        }

        // ── Status reversal ────────────────────────────────────────────────────
        const hasPaidRemaining = paidRemaining.length > 0;
        const currentDepositPaid = (mainUpdates.depositPaid !== undefined)
            ? mainUpdates.depositPaid
            : Number(tenant.depositPaid || 0);
        const depositNowUnpaid = !tenant.depositExempt && !tenant.rentExtension?.enabled &&
            (tenant.proratedDeposit?.enabled
                ? (mainUpdates.proratedDeposit?.amountPaidSoFar ?? 0) < tenant.proratedDeposit.totalDepositAmount
                : currentDepositPaid < depExpected - 0.5);

        if (tenant.status === 'Active' && !hasPaidRemaining) {
            mainUpdates.status = tenantFullyAllocated(tenant) ? 'PendingPayment' : 'PendingAllocation';
            (mainUpdates as any).activationDate = undefined;
        } else if (tenant.status === 'Active' && depositNowUnpaid && mainUpdates.depositPaid === 0) {
            mainUpdates.status = 'PendingPayment';
            (mainUpdates as any).activationDate = undefined;
        }

        updateTenant(tenant.id, mainUpdates);

        // 2. Process activeSubTenants updates
        for (const sub of activeSubTenants) {
            const subRemaining = (sub.paymentHistory || []).filter(p => {
                const r = String(p.reference || '').trim();
                return r !== baseRef && r !== `MULTI-${baseRef}`;
            });
            const subUpdates: Partial<TenantProfile> = { paymentHistory: subRemaining };

            const subPaidRemaining = subRemaining.filter(p => p.status === 'Paid' && !!p.date);
            if (subPaidRemaining.length > 0) {
                const latest = subPaidRemaining.reduce((m, p) => (p.date > m.date ? p : m), subPaidRemaining[0]);
                const nd = new Date(latest.date);
                nd.setMonth(nd.getMonth() + 1);
                nd.setDate(Math.min(28, Math.max(1, Number(sub.rentDueDate ?? 1))));
                nd.setHours(0, 0, 0, 0);
                subUpdates.nextDueDate = nd.toISOString().split('T')[0];
            } else {
                subUpdates.nextDueDate = undefined;
            }

            const subDepExpected = Number((sub as any).depositExpected ?? 0) > 0
                ? Number((sub as any).depositExpected)
                : Number(sub.rentAmount || 0) * Math.max(1, Number((sub as any).depositMonths ?? 1));

            const subPaymentDeletedObj = targets.find(t => t.isSub && t.tenantId === sub.id)?.paymentObj;
            if (subPaymentDeletedObj && !sub.depositExempt && !sub.rentExtension?.enabled && subPaymentDeletedObj.status === 'Paid') {
                if (sub.proratedDeposit?.enabled) {
                    const pd = sub.proratedDeposit;
                    const newAmountPaid = Math.max(0, pd.amountPaidSoFar - (pd.monthlyInstallment || 0));
                    const newMonthsPaid = Math.max(0, pd.monthsPaid - 1);
                    subUpdates.proratedDeposit = { ...pd, monthsPaid: newMonthsPaid, amountPaidSoFar: newAmountPaid };
                    subUpdates.depositPaid = newAmountPaid;
                } else {
                    const baseRent = Number(sub.rentAmount || 0);
                    const anyStillCoversDeposit = subRemaining.some(
                        p => p.status === 'Paid' &&
                             (parseFloat(p.amount.replace(/[^0-9.]/g, '')) || 0) >= baseRent + subDepExpected
                    );
                    if (!anyStillCoversDeposit) {
                        subUpdates.depositPaid = 0;
                    }
                }
            }

            const subHasPaidRemaining = subPaidRemaining.length > 0;
            const subCurrentDepositPaid = (subUpdates.depositPaid !== undefined)
                ? subUpdates.depositPaid
                : Number(sub.depositPaid || 0);
            const subDepositNowUnpaid = !sub.depositExempt && !sub.rentExtension?.enabled &&
                (sub.proratedDeposit?.enabled
                    ? (subUpdates.proratedDeposit?.amountPaidSoFar ?? 0) < sub.proratedDeposit.totalDepositAmount
                    : subCurrentDepositPaid < subDepExpected - 0.5);

            if (sub.status === 'Active' && !subHasPaidRemaining) {
                subUpdates.status = tenantFullyAllocated(sub) ? 'PendingPayment' : 'PendingAllocation';
                (subUpdates as any).activationDate = undefined;
            } else if (sub.status === 'Active' && subDepositNowUnpaid && subUpdates.depositPaid === 0) {
                subUpdates.status = 'PendingPayment';
                (subUpdates as any).activationDate = undefined;
            }

            updateTenant(sub.id, subUpdates);
        }

        setSelectedPaymentKeys(new Set());
        setActiveModal(null);
        await safeAlert("Payment deleted successfully.");
    };

    const sortedRequests = [...(tenant.requests || [])].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // isMultiLedgerReady is now always true — the profile renders immediately
    // and the inline "Reconciling receipts…" pill below indicates any pending
    // background refresh instead of blocking the whole screen.


    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Statement Component (Hidden) */}
            <StatementView tenant={tenant} onClose={() => {}} />

            {/* Back Button */}
            <button onClick={onBack} className="group flex items-center text-sm font-semibold text-gray-500 hover:text-primary transition-colors w-fit">
                <span className="transform transition-transform group-hover:-translate-x-1 mr-2">←</span> Back to List
            </button>

            {/* Header Profile Card */}
            <div className="bg-white rounded-xl shadow-md overflow-hidden border-r-4 border-b-4 border-secondary">
                <div className="bg-primary p-6 text-white relative">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center relative z-10">
                        <div className="flex items-center gap-4">
                            <label className="relative w-16 h-16 rounded-full bg-white text-primary flex items-center justify-center text-2xl font-bold uppercase border-2 border-white/50 shadow-md overflow-hidden cursor-pointer group" title="Click to change profile picture">
                                {isAvatarUrl(tenant.avatar) ? (
                                    <img src={tenant.avatar} alt={tenant.name} className="w-full h-full object-cover" />
                                ) : (
                                    <span>{tenant.avatar || tenant.name.charAt(0)}</span>
                                )}
                                <span className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-semibold transition-opacity">Change</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        try {
                                            const ext = file.name.split('.').pop() || 'jpg';
                                            const path = `${tenant.id}/avatar-${Date.now()}.${ext}`;
                                            const url = await uploadToBucket('profile-pictures', path, file);
                                            updateTenant(tenant.id, { avatar: url } as any);
                                        } catch (err) {
                                            console.error('Avatar upload failed', err);
                                            alert('Failed to upload profile picture. Please try again.');
                                        } finally {
                                            e.target.value = '';
                                        }
                                    }}
                                />
                            </label>
                            <div>
                                <h1 className="text-2xl font-bold">{tenant.name}</h1>
                                <p className="text-white/80">{tenant.unit}, {tenant.propertyName}</p>
                                {(() => {
                                    const explicit = tenantProperty?.units?.find(u => u.id === tenant.unitId)?.unitTag;
                                    const tag = String(explicit ?? tenant.unit ?? '').trim();
                                    return tag ? (
                                        <p className="text-xs text-white/90 mt-1">
                                            Payment Account: <span className="font-mono font-bold bg-white/20 px-2 py-0.5 rounded uppercase tracking-wider">{tag}</span>
                                        </p>
                                    ) : (
                                        <p className="text-xs text-amber-200 mt-1">No unit assigned — allocate a unit to enable payments</p>
                                    );
                                })()}
                                <p className="text-xs text-white/60 mt-1">Onboarded: {fmtDate(tenant.onboardingDate)}</p>
                            </div>
                        </div>
                        <div className="mt-4 md:mt-0 text-right flex flex-col items-end gap-2">
                            {(() => {
                                const effHeader = effectiveTenantStatus(tenant);
                                return (
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${effHeader === 'Active' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                        {effHeader === 'Active' ? '● Active' : '● ' + effHeader}
                                    </span>
                                );
                            })()}
                            {(tenant.status === 'Notice' || tenant.status === 'Evicted') && canEdit && (
                                <button
                                    type="button"
                                    onClick={handleReverseFromProfile}
                                    className="text-xs px-3 py-1.5 rounded font-bold shadow-sm border bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50 flex items-center gap-1"
                                    title={`Reverse ${tenant.status === 'Evicted' ? 'eviction' : 'offboarding'} and restore tenant to Active`}
                                >
                                    <Icon name="check" className="w-3 h-3" />
                                    Reverse {tenant.status === 'Evicted' ? 'Eviction' : 'Offboarding'}
                                </button>
                            )}
                            <button
                                type="button"
                                className={`text-xs px-2 py-1 rounded font-bold shadow-sm border ${
                                    tenant.leaseSigned
                                        ? 'bg-green-100 text-green-800 border-green-200'
                                        : 'bg-amber-100 text-amber-800 border-amber-200'
                                }`}
                                title="Lease status from Applications documents flow"
                            >
                                {tenant.leaseSigned ? 'Lease Signed' : 'Lease Not Signed'}
                            </button>
                            
                            {/* Updated Status Sticker Logic */}
                            {isFullyPaid ? (
                                <span className="text-xs bg-green-600 text-white px-2 py-1 rounded font-bold shadow-sm flex items-center animate-pulse">
                                    <Icon name="check" className="w-3 h-3 mr-1" /> Paid for {currentMonthName}
                                </span>
                            ) : tenant.status === 'Overdue' ? (
                                <span className="text-xs bg-red-800 text-white px-2 py-1 rounded font-bold animate-pulse shadow-sm">
                                    OVERDUE ({daysLate} Days Late)
                                </span>
                            ) : (
                                <span className="text-xs bg-yellow-600 text-white px-2 py-1 rounded font-bold shadow-sm">
                                    Rent Due
                                </span>
                            )}

                             {tenant.houseStatus && tenant.houseStatus.length > 0 && (
                                <div className="flex flex-wrap gap-1 justify-end">
                                    {tenant.houseStatus.map(status => (
                                        <span key={status} className="text-[10px] bg-white text-red-600 px-2 py-0.5 rounded font-bold uppercase border border-red-200 shadow-sm">
                                            {status}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div>
                            <p className="text-xs text-gray-400 font-bold uppercase">Phone</p>
                            <p className="text-sm font-semibold text-gray-700">{tenant.phone}</p>
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 font-bold uppercase">Email</p>
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-700">{tenant.email}</p>
                                {canDeactivate && (
                                <button 
                                    onClick={handleOpenOffboarding} 
                                    className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-200 hover:bg-red-100 font-bold transition-colors shadow-sm"
                                    title="Initiate or Manage Offboarding"
                                >
                                    Offboard Tenant
                                </button>
                                )}
                            </div>
                        </div>
                        {(() => {
                            // Rent Start Date is the source of truth for the tenancy.
                            // Legacy records may carry a stale lease start captured
                            // before the rent start was edited — realign for display
                            // (keeping the original lease term length).
                            const rentStart = String((tenant as any).rentStartDate || '').trim();
                            let leaseStart = String((tenant as any).leaseStartDate || '').trim();
                            let leaseEnd = String(tenant.leaseEnd || '').trim();
                            if (rentStart && leaseStart && leaseStart !== rentStart) {
                                const ls = new Date(leaseStart);
                                const rs = new Date(rentStart);
                                if (!Number.isNaN(ls.getTime()) && !Number.isNaN(rs.getTime())) {
                                    const delta = rs.getTime() - ls.getTime();
                                    if (leaseEnd) {
                                        const le = new Date(leaseEnd);
                                        if (!Number.isNaN(le.getTime())) {
                                            leaseEnd = new Date(le.getTime() + delta).toISOString().split('T')[0];
                                        }
                                    }
                                    leaseStart = rentStart;
                                }
                            } else if (rentStart && !leaseStart) {
                                leaseStart = rentStart;
                            }
                            return (
                                <div>
                                    <p className="text-xs text-gray-400 font-bold uppercase">Lease Type</p>
                                    <p className="text-sm font-semibold text-gray-700">{tenant.leaseType || 'Fixed'}</p>
                                    <p className="text-[11px] text-gray-500 mt-1">
                                        Start: {leaseStart ? fmtDate(leaseStart) : 'Not set'}
                                    </p>
                                    <p className="text-[11px] text-gray-500">
                                        Expiry: {leaseEnd ? fmtDate(leaseEnd) : 'Not set'}
                                    </p>
                                </div>
                            );
                        })()}

                        <div className="flex flex-col items-start">
                            <p className="text-xs text-gray-400 font-bold uppercase">Lease Doc</p>
                            <div className="flex gap-2 mt-1">
                                <button onClick={handleLeaseDownload} className="text-xs text-primary font-bold hover:underline flex items-center bg-blue-50 px-2 py-1 rounded border border-blue-100">
                                    <Icon name="download" className="w-3 h-3 mr-1" /> Download
                                </button>
                                <button onClick={() => leaseInputRef.current?.click()} className="text-xs text-gray-600 font-bold hover:underline flex items-center bg-gray-100 px-2 py-1 rounded border border-gray-200">
                                    <Icon name="plus" className="w-3 h-3 mr-1" /> Upload
                                </button>
                                <input type="file" ref={leaseInputRef} className="hidden" onChange={handleLeaseUpload} />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-6 border-t pt-4">
                        <div className="bg-gray-50 p-3 rounded-lg text-center border border-gray-100">
                            <p className="text-xs text-gray-400 font-bold uppercase">Rent start date</p>
                            <p className="font-bold text-gray-700">
                                {fmtDate(getTenantRentStartAnchor(tenant) || tenant.onboardingDate || (tenant as any).onboarding_date)}
                            </p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg text-center border border-gray-100">
                            <p className="text-xs text-gray-400 font-bold uppercase">Next Due Date</p>
                            <p className="font-bold text-gray-700">
                                {fmtDate(nextDueDate)}
                            </p>
                        </div>
                    </div>

                    {/* Deposit Tracking Card */}
                    {!tenant.depositExempt && (
                        <div className="mt-4 border-t pt-4">
                            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                                <p className="text-xs text-gray-400 font-bold uppercase">Security Deposit</p>
                                {tenant.depositRestoredAt && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                        Restored {fmtDate(tenant.depositRestoredAt)}
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-gray-50 p-3 rounded-lg text-center border border-gray-100">
                                    <p className="text-xs text-gray-400 font-bold uppercase">Expected</p>
                                    <p className="font-bold text-gray-700 text-sm">
                                        KES {(tenant.proratedDeposit?.enabled
                                            ? tenant.proratedDeposit.totalDepositAmount
                                            : depositExpectedStandard).toLocaleString()}
                                    </p>
                                    {tenant.proratedDeposit?.enabled && (
                                        <p className="text-[10px] text-indigo-600 mt-0.5">
                                            {effectiveDepositMonthsPaid}/{tenant.proratedDeposit.durationMonths} installments
                                        </p>
                                    )}
                                </div>
                                <div className="bg-gray-50 p-3 rounded-lg text-center border border-gray-100">
                                    <p className="text-xs text-gray-400 font-bold uppercase">Paid</p>
                                    <p className="font-bold text-green-700 text-sm">
                                        KES {effectiveDepositPaid.toLocaleString()}
                                    </p>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-lg text-center border border-gray-100">
                                    <p className="text-xs text-gray-400 font-bold uppercase">Balance</p>
                                    <p className={`font-bold text-sm ${effectiveDepositBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        {effectiveDepositBalance > 0 ? `KES ${effectiveDepositBalance.toLocaleString()}` : 'Cleared'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-3 gap-4">
                {canEdit ? (
                <button onClick={() => setActiveModal('bills')} className="bg-white p-4 rounded-xl shadow-sm flex flex-col items-center justify-center border border-gray-100 h-32 cursor-pointer hover:shadow-md transition-all group hover:border-blue-300">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-2 group-hover:scale-110 transition-transform">
                        <Icon name="payments" className="w-5 h-5" />
                    </div>
                    <p className="font-bold text-gray-700 text-sm">Bills</p>
                </button>
                ) : (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 h-32 flex flex-col items-center justify-center opacity-40 cursor-not-allowed" title="No permission">
                    <Icon name="payments" className="w-5 h-5 text-gray-400 mb-2" /><p className="font-bold text-gray-400 text-sm">Bills</p>
                </div>
                )}
                {canEdit ? (
                <button onClick={() => setActiveModal('fines')} className="bg-white p-4 rounded-xl shadow-sm flex flex-col items-center justify-center border border-gray-100 h-32 cursor-pointer hover:shadow-md transition-all group hover:border-red-300">
                    <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-2 group-hover:scale-110 transition-transform">
                        <Icon name="arrears" className="w-5 h-5" />
                    </div>
                    <p className="font-bold text-gray-700 text-sm">Fines</p>
                </button>
                ) : (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 h-32 flex flex-col items-center justify-center opacity-40 cursor-not-allowed" title="No permission">
                    <Icon name="arrears" className="w-5 h-5 text-gray-400 mb-2" /><p className="font-bold text-gray-400 text-sm">Fines</p>
                </div>
                )}
                {canEdit ? (
                <button onClick={() => setActiveModal('status')} className="bg-white p-4 rounded-xl shadow-sm flex flex-col items-center justify-center border border-gray-100 h-32 cursor-pointer hover:shadow-md transition-all group hover:border-green-300">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 mb-2 group-hover:scale-110 transition-transform">
                        <Icon name="check" className="w-5 h-5" />
                    </div>
                    <p className="font-bold text-gray-700 text-sm">House Status</p>
                </button>
                ) : (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 h-32 flex flex-col items-center justify-center opacity-40 cursor-not-allowed" title="No permission">
                    <Icon name="check" className="w-5 h-5 text-gray-400 mb-2" /><p className="font-bold text-gray-400 text-sm">House Status</p>
                </div>
                )}
            </div>

            {/* Notices & Actions */}
            <div className="bg-white p-6 rounded-xl shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-4">Notices & Actions</h3>
                
                {/* Client Review Notification Area */}
                {reviewNotice && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center animate-pulse">
                        <div>
                            <p className="text-blue-800 font-bold text-sm">Client Submitted Vacate Notice</p>
                            <p className="text-xs text-blue-600">Requested Move Out: {reviewNotice.effectiveDate}</p>
                        </div>
                        <button onClick={() => openNoticeModal('Review Client Notice')} className="px-4 py-2 bg-blue-600 text-white rounded-md text-xs font-bold shadow-sm hover:bg-blue-700">
                            Review Notice
                        </button>
                    </div>
                )}

                {canEdit && (
                <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-4">
                        <button onClick={() => openNoticeModal('Warning')} className="bg-white p-4 rounded-xl shadow-sm flex flex-col items-center justify-center border border-gray-100 h-32 cursor-pointer hover:shadow-md transition-all group hover:border-yellow-300">
                             <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center text-yellow-600 mb-2 group-hover:scale-110 transition-transform">
                                <Icon name="bell" className="w-5 h-5" />
                            </div>
                            <p className="font-bold text-gray-700 text-sm text-center">Issue Warning</p>
                        </button>
                        <button onClick={() => openNoticeModal('Vacation')} className="bg-white p-4 rounded-xl shadow-sm flex flex-col items-center justify-center border border-gray-100 h-32 cursor-pointer hover:shadow-md transition-all group hover:border-blue-300">
                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mb-2 group-hover:scale-110 transition-transform">
                                <Icon name="offboarding" className="w-5 h-5" />
                            </div>
                            <p className="font-bold text-gray-700 text-sm text-center">Record Vacation</p>
                        </button>
                        <button onClick={() => openNoticeModal('Force')} className="bg-white p-4 rounded-xl shadow-sm flex flex-col items-center justify-center border border-gray-100 h-32 cursor-pointer hover:shadow-md transition-all group hover:border-red-300">
                            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-2 group-hover:scale-110 transition-transform">
                                <Icon name="close" className="w-5 h-5" />
                            </div>
                            <p className="font-bold text-gray-700 text-sm text-center">Force Vacation</p>
                        </button>
                    </div>
                    <button
                        onClick={() => setActiveModal('negotiatedVacating')}
                        className="w-full flex items-center justify-center gap-3 p-4 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 transition-colors group"
                    >
                        <div className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Icon name="check" className="w-5 h-5 text-teal-600" />
                        </div>
                        <div className="text-left">
                            <p className="font-bold text-teal-800 text-sm">Negotiated Vacating</p>
                            <p className="text-xs text-teal-600">Mutually agreed exit — waives the 30-day notice period</p>
                        </div>
                    </button>
                </div>
                )}
            </div>

            {/* Multi-Occupancy Sub-Units Summary — status only.
                Sub-units have ZERO calculations of their own: all invoicing
                and payments happen on this Main unit. Each sub-unit simply
                reports its rent amount and a derived payment status. */}
            {(() => {
                const subTenants = tenants.filter(t => t.mainTenantId === tenant.id && t.status !== 'Vacated');
                if (subTenants.length === 0) return null;

                const statuses = computeSubUnitStatuses(tenant, subTenants, currentMonthIso);
                const fmt = (n: number) => `KES ${Number(n || 0).toLocaleString()}`;
                const subRentSum = subTenants.reduce((s, t) => s + Number(t.rentAmount || 0), 0);

                return (
                    <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl mb-4">
                        <div className="mb-3">
                            <h3 className="text-base font-bold text-indigo-900">Multi-Occupancy Summary</h3>
                            <p className="text-[11px] text-indigo-700">
                                {subTenants.length} sub-unit{subTenants.length === 1 ? '' : 's'} — all invoicing and payments are handled here on the main unit. Sub-units only report rent and status.
                            </p>
                        </div>
                        <div className="space-y-2">
                            {subTenants.map(s => {
                                const row = statuses[s.id];
                                const status = row?.status || 'Unpaid';
                                const badge = status === 'Paid'
                                    ? 'bg-green-100 text-green-700'
                                    : status === 'Partial'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-red-100 text-red-700';
                                return (
                                    <div key={s.id} className="bg-white rounded-lg px-3 py-2.5 border border-indigo-100 flex items-center justify-between">
                                        <span className="font-medium text-gray-800 text-sm">
                                            {`Sub — ${s.propertyName || ''} ${s.unit || ''}`.trim()}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${badge}`}>{status}</span>
                                            <span className="text-xs font-semibold text-indigo-900">{fmt(Number(s.rentAmount || 0))}</span>
                                        </div>
                                    </div>
                                );
                            })}
                            <div className="flex items-center justify-between pt-2 mt-2 border-t border-indigo-200 font-bold text-indigo-900">
                                <span>Total Sub-Unit Rent</span>
                                <span>{fmt(subRentSum)}</span>
                            </div>
                        </div>
                    </div>
                );
            })()}


            {/* Balance Overview */}
            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-gray-800">Balance Overview</h3>
                    <button
                        type="button"
                        onClick={() => setShowRecomputeConfirm(true)}
                        title="Recompute balances from payment history"
                        aria-label="Recompute balances"
                        className="p-1 rounded-full text-gray-400 hover:text-primary hover:bg-gray-100 transition"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    {showRecomputeConfirm && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
                            <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                                <h4 className="text-lg font-bold text-gray-900 mb-2">Recompute Tenant Balances</h4>
                                <p className="text-sm text-gray-600 mb-6 leading-relaxed text-left font-normal normal-case">
                                    Recompute balances by replaying this tenant's payment history through the current allocation rules?
                                    This will reset derived balances and process payments month-by-month from the 1st month.
                                </p>
                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowRecomputeConfirm(false)}
                                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowRecomputeConfirm(false);
                                            try {
                                                if (tenant.occupancyType === 'Main') {
                                                    const subs = tenants.filter(t => t.mainTenantId === tenant.id && t.status !== 'Vacated');
                                                    const updatedGroup = recomputeMultiOccupancyGroup(tenant, subs);
                                                    updatedGroup.forEach(updated => {
                                                        updateTenant(updated.id, updated);
                                                    });
                                                    addNotification?.({ type: 'success', message: `Balances recomputed for ${tenant.name} and ${subs.length} sub-units.` } as any);
                                                } else {
                                                    const updates = recomputeTenantFromPaymentHistory(tenant);
                                                    updateTenant(tenant.id, updates);
                                                    addNotification?.({ type: 'success', message: `Balances recomputed for ${tenant.name}.` } as any);
                                                }
                                            } catch (e) {
                                                addNotification?.({ type: 'error', message: `Recompute failed: ${(e as Error)?.message || 'unknown error'}` } as any);
                                            }
                                        }}

                                        className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-opacity-90 rounded-lg transition shadow-sm"
                                    >
                                        Yes, Recompute
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    <select
                        value={viewMonthIso}
                        onChange={(e) => setViewMonthIso(e.target.value)}
                        className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                        title="View balance for any month — past, current, or prepaid future months"
                    >
                        {monthOptions.map(opt => {
                            const suffix = opt.kind === 'current' ? ' (current)'
                                : opt.kind === 'prepaid' ? ' (Prepaid)'
                                : opt.kind === 'partial' ? ' (Partial Prepayment)'
                                : opt.kind === 'next_month' ? ' (Next Month)'
                                : '';
                            return (
                                <option key={opt.iso} value={opt.iso}>
                                    {opt.label}{suffix}
                                </option>
                            );
                        })}
                    </select>
                    {isViewingPastMonth && (
                        <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">Historical view</span>
                    )}
                    {isViewingPrepaidMonth && (
                        <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                            {prepaidViewMonth?.fullyCovered ? 'Prepaid view' : 'Partial prepayment view'}
                        </span>
                    )}
                </div>

                {/* Unit filter — Main view shows main; switching navigates to sub */}
                {(() => {
                    const subs = tenants.filter(t => t.mainTenantId === tenant.id && t.status !== 'Vacated');
                    if (subs.length === 0 && tenant.occupancyType !== 'Sub') return null;
                    const mainTenant = tenant.occupancyType === 'Sub'
                        ? tenants.find(t => t.id === tenant.mainTenantId)
                        : tenant;
                    if (!mainTenant) return null;
                    const all = [mainTenant, ...tenants.filter(t => t.mainTenantId === mainTenant.id && t.status !== 'Vacated')];
                    return (
                        <select
                            value={tenant.id}
                            onChange={e => {
                                const targetId = e.target.value;
                                if (targetId === tenant.id) return;
                                // navigate via hash route used by ActiveTenants list
                                window.location.hash = `#/tenants/active?tenantId=${targetId}`;
                                setTimeout(() => window.location.reload(), 10);
                            }}
                            className="text-xs border rounded px-2 py-1 bg-white"
                            title="View balance per unit"
                        >
                            {all.map(t => (
                                <option key={t.id} value={t.id}>
                                    {t.id === mainTenant.id ? 'Main' : 'Sub'} — {t.propertyName} {t.unit}
                                </option>
                            ))}
                        </select>
                    );
                })()}
                </div>

                <div className="space-y-3 text-sm">
                    {/* Detailed Breakdown */}
                    <div className="p-3 bg-gray-50 rounded-lg space-y-2 border border-gray-100">
                        {/* Carry-over arrears from prior months (rent, deposit installments, bills, late fees, fines) */}
                        {(arrearsWithStatus.length > 0 || arrearsBills.length > 0 || arrearsFines.length > 0) && (
                            <div className="-mx-1 mb-1 px-2 py-2 rounded-md bg-red-50 border border-red-100 space-y-1.5">
                                <div className="text-[11px] uppercase tracking-wider font-bold text-red-700">
                                    Arrears
                                </div>
                                {arrearsWithStatus.map((it, idx) => (
                                    <div key={`arr-${idx}`} className="flex items-center justify-between gap-2 text-red-700">
                                        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                                            {payStatusBadge(it.paymentStatus)}
                                            <span className="truncate" title={`${it.monthLabel}`}>
                                                {it.label}
                                            </span>
                                        </div>
                                        <span className="font-bold shrink-0">KES {Number(it.amount).toLocaleString()}</span>
                                    </div>
                                ))}
                                {arrearsBills.map(b => {
                                    const bKey = `bill:${b.id}`;
                                    const status = getBillPaymentStatus(b);
                                    return (
                                        <div key={bKey} className="flex items-center justify-between gap-2 text-red-700">
                                            <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                                                {payStatusBadge(status)}
                                                <span className="truncate">{labelWithArrearsMonth(`${b.type}${b.description && !b.description.includes(b.type) ? ` — ${b.description}` : ''}`, (b as any).date, currentMonthIso)}</span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="font-bold">KES {Number(b.amount).toLocaleString()}</span>
                                                {canEdit && (
                                                    <button
                                                        type="button"
                                                        title="Delete arrears bill"
                                                        onClick={() => handleDeleteBill(b.id, `${b.type}${b.description ? ' — ' + b.description : ''}`)}
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1.5 py-0.5 text-xs font-bold font-mono"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {arrearsFines.map(f => {
                                    const fKey = `fine:${f.id}`;
                                    const status = getFinePaymentStatus(f);
                                    return (
                                        <div key={fKey} className="flex items-center justify-between gap-2 text-red-700">
                                            <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                                                {payStatusBadge(status)}
                                                <span className="truncate">{labelWithArrearsMonth(f.type, (f as any).date, currentMonthIso)}</span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="font-bold">KES {Number(f.amount).toLocaleString()}</span>
                                                {canEdit && (
                                                    <button
                                                        type="button"
                                                        title="Delete arrears fine"
                                                        onClick={() => handleDeleteFine(f.id, f.type)}
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1.5 py-0.5 text-xs font-bold font-mono"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {priorLateFeesList.map(item => {
                                    const isFine = !('description' in item) && !String(item.id || '').startsWith('LATEFEE-');
                                    const key = isFine ? `fine:${item.id}` : `bill:${item.id}`;
                                    const label = item.type === 'Late Fee' ? `Late Fee Arrears (${item.description || item.date || 'Prior Month'})` : item.type;
                                    const status = isFine ? getFinePaymentStatus(item) : getBillPaymentStatus(item);
                                    return (
                                        <div key={key} className="flex items-center justify-between gap-2 text-red-700">
                                            <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                                                {payStatusBadge(status)}
                                                <span className="truncate">{labelWithArrearsMonth(label, (item as any).date, currentMonthIso)}</span>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="font-bold">KES {Number(item.amount).toLocaleString()}</span>
                                                {canEdit && (
                                                    <button
                                                        type="button"
                                                        title="Delete late fee arrears"
                                                        onClick={() => handleDeleteLateFeeItem(tenant.id, item.id, isFine, label)}
                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1.5 py-0.5 text-xs font-bold font-mono"
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {/* Deposit status badges */}
                        {tenant.depositExempt && (
                            <div className="flex justify-between text-gray-500 text-xs">
                                <span className="flex items-center gap-1">
                                    Security Deposit
                                    <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-bold">Exempt</span>
                                </span>
                                <span>—</span>
                            </div>
                        )}
                        {/* Deposit row.
                            - "Fully Paid" badge was removed — we only show Paid / Partial / Unpaid.
                            - When the deposit was already fully cleared in a PRIOR month, the row
                              is hidden entirely (the Expected/Paid/Balance card up top covers it).
                            - When the deposit was paid (fully or partly) this month, the row stays
                              visible AND its gross is added to Total Invoiced so the matching
                              payment has something to offset. */}
                        {!tenant.depositExempt && !depositClearedBeforeThisMonth && tenant.proratedDeposit?.enabled && (
                            <div className="flex items-center justify-between gap-2 text-indigo-700 font-medium">
                                <label className="flex items-center gap-2 cursor-pointer flex-1 flex-wrap min-w-0">
                                    <input type="checkbox" className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer shrink-0" checked={selectedPaymentKeys.has('deposit')} onChange={() => toggleKey('deposit')} />
                                    <span className="flex items-center gap-1 flex-wrap">
                                        Deposit Installment
                                        <span className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-bold">
                                            {effectiveDepositMonthsPaid}/{tenant.proratedDeposit.durationMonths} paid
                                        </span>
                                    </span>
                                </label>
                                <div className="flex items-center gap-2 shrink-0">
                                    {payStatusBadge(itemStatus('deposit', tenant.proratedDeposit.monthlyInstallment))}
                                    <span>KES {tenant.proratedDeposit.monthlyInstallment.toLocaleString()}</span>
                                </div>
                            </div>
                        )}
                        {!tenant.depositExempt && !depositClearedBeforeThisMonth && !tenant.proratedDeposit?.enabled && depositDueForInvoiceGross > 0 && (
                            <div className="flex items-center justify-between gap-2 text-blue-700 font-medium">
                                <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                                    <input type="checkbox" className="w-3.5 h-3.5 accent-blue-600 cursor-pointer shrink-0" checked={selectedPaymentKeys.has('deposit')} onChange={() => toggleKey('deposit')} />
                                    <span className="flex items-center gap-1">
                                        Security Deposit
                                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                                            {isInitialNewTenantMonth ? 'New Tenant' : getTenantOnboardingKind(tenant) === 'Existing' ? 'Existing Tenant' : 'Deposit Balance'}
                                        </span>
                                    </span>
                                </label>
                                <div className="flex items-center gap-2 shrink-0">
                                    {payStatusBadge(itemStatus('deposit', depositDueForInvoiceGross))}
                                    <span>KES {Number(depositDueForInvoiceGross).toLocaleString()}</span>
                                </div>
                            </div>
                        )}
                        {/* Deposit-exempt admin control:
                            - Any admin can waive the deposit while it's still unpaid.
                            - Only Super Admin can un-exempt, or waive a deposit
                              that has already been (partially/fully) collected. */}
                        {(() => {
                            const depositAlreadyCollected = depositPaidAmt > 0
                                || (tenant.proratedDeposit?.amountPaidSoFar ?? 0) > 0;
                            const canWaive = !tenant.depositExempt && (!depositAlreadyCollected || isSuperAdmin);
                            const canRestore = !!tenant.depositExempt && isSuperAdmin;
                            if (!canWaive && !canRestore) return null;
                            return (
                                <div className="pt-2 border-t border-dashed border-gray-200 flex items-center justify-between gap-2">
                                    <span className="text-[11px] text-gray-500">
                                        {tenant.depositExempt ? 'Deposit is currently waived.' : 'Waive security deposit for this tenant.'}
                                        {depositAlreadyCollected && !tenant.depositExempt && (
                                            <span className="block text-amber-700 font-medium">Deposit already collected — super-admin only.</span>
                                        )}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            let nextTenant = { ...tenant };
                                            if (tenant.depositExempt) {
                                                if (!window.confirm('Restore security deposit requirement for this tenant? It will become a priority deduction from the next payment.')) return;
                                                const todayIso = getTodayIsoDate();
                                                nextTenant = { ...tenant, depositExempt: false, depositRestoredAt: todayIso } as any;
                                                updateTenant(tenant.id, nextTenant);
                                            } else {
                                                const msg = depositAlreadyCollected
                                                    ? 'This tenant has already paid part or all of their deposit. Waiving it now will mark them exempt but will NOT refund anything. Continue?'
                                                    : 'Waive security deposit for this tenant?';
                                                if (!window.confirm(msg)) return;
                                                nextTenant = { ...tenant, depositExempt: true } as any;
                                                updateTenant(tenant.id, nextTenant);
                                            }
                                            try {
                                                await supabase.schema('app').rpc('upsert_tenants_bulk', { p_tenants: [nextTenant] });
                                            } catch (e) {
                                                console.error('Failed to sync deposit exemption', e);
                                            }
                                        }}
                                        className={`text-[11px] font-bold px-2 py-1 rounded border ${tenant.depositExempt ? 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50' : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'}`}
                                    >
                                        {tenant.depositExempt ? 'Restore deposit' : 'Waive deposit'}
                                    </button>
                                </div>
                            );
                        })()}
                        {/* Rent extension notice */}
                        {tenant.rentExtension?.enabled && (
                            <div className="text-xs text-orange-700 bg-orange-50 border border-orange-100 rounded p-2 mt-1">
                                Rent deferred until <strong>{tenant.rentExtension.rentDeferredUntil}</strong> — no grace period after that date.
                            </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                                <input type="checkbox" className="w-3.5 h-3.5 accent-primary cursor-pointer shrink-0" checked={selectedPaymentKeys.has('rent')} onChange={() => toggleKey('rent')} />
                                <span className="text-gray-600 truncate">
                                    {isActivationMonth && effectiveRent > 0 && effectiveRent !== Number(tenant.rentAmount || 0)
                                        ? (() => {
                                            const joinDateStr = rentStartAnchor;
                                            const joinDate = joinDateStr ? new Date(joinDateStr) : null;
                                            const jDay = joinDate ? joinDate.getDate() : null;
                                            const lastDay = joinDate
                                                ? new Date(joinDate.getFullYear(), joinDate.getMonth() + 1, 0).getDate()
                                                : 30;
                                            const daysLeft = jDay != null ? Math.max(0, lastDay - jDay) : null;
                                            return `Prorated Rent${daysLeft != null ? ` — ${daysLeft} days` : ''} (joined ${currentMonthName} ${jDay ?? ''})`;
                                        })()
                                        : `Base Rent (${currentMonthName})`}
                                </span>
                            </label>
                            <div className="flex items-center gap-2 shrink-0">
                                {payStatusBadge(itemStatus('rent', rentDue))}
                                <span className="font-medium">KES {Number(rentDue ?? 0).toLocaleString()}</span>
                            </div>
                        </div>
                        {(Object.keys(RECURRING_BILL_LABELS) as (keyof RecurringBillSettings)[]).map(key => {
                            const amt = Number(tenant.recurringBills?.[key] ?? 0);
                            if (amt <= 0) return null;
                            const rKey = `recurring:${key}`;
                            return (
                                <div key={rKey} className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                                        <input type="checkbox" className="w-3.5 h-3.5 accent-primary cursor-pointer shrink-0" checked={selectedPaymentKeys.has(rKey)} onChange={() => toggleKey(rKey)} />
                                        <span className="text-gray-600">{RECURRING_BILL_LABELS[key]}</span>
                                    </label>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {payStatusBadge(itemStatus(rKey, amt))}
                                        <span className="font-medium">KES {amt.toLocaleString()}</span>
                                    </div>
                                </div>
                            );
                        })}
                        {currentBillsList.map(b => {
                            const bKey = `bill:${b.id}`;
                            return (
                                <div key={bKey} className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                                        <input type="checkbox" className="w-3.5 h-3.5 accent-primary cursor-pointer shrink-0" checked={selectedPaymentKeys.has(bKey)} onChange={() => toggleKey(bKey)} />
                                        <span className="text-gray-600 truncate">{b.type}{b.description && !b.description.includes(b.type) ? ` — ${b.description}` : ''}</span>
                                    </label>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {payStatusBadge(itemStatus(bKey, b.amount))}
                                        <span className="font-medium">KES {Number(b.amount).toLocaleString()}</span>
                                        {canEdit && (
                                            <button
                                                type="button"
                                                title="Delete bill"
                                                onClick={() => handleDeleteBill(b.id, `${b.type}${b.description ? ' — ' + b.description : ''}`)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1 text-xs font-bold"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {currentFinesList.map(f => {
                            const fKey = `fine:${f.id}`;
                            return (
                                <div key={fKey} className="flex items-center justify-between gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                                        <input type="checkbox" className="w-3.5 h-3.5 accent-primary cursor-pointer shrink-0" checked={selectedPaymentKeys.has(fKey)} onChange={() => toggleKey(fKey)} />
                                        <span className="text-gray-600">{f.type}</span>
                                    </label>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {payStatusBadge(itemStatus(fKey, f.amount))}
                                        <span className="font-medium">KES {Number(f.amount).toLocaleString()}</span>
                                        {canEdit && (
                                            <button
                                                type="button"
                                                title="Delete fine"
                                                onClick={() => handleDeleteFine(f.id, f.type)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1 text-xs font-bold"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {automatedLateFine > 0 && (
                            <div className="flex items-center justify-between gap-2 text-red-600">
                                <label className="flex items-center gap-2 cursor-pointer flex-1">
                                    <input type="checkbox" className="w-3.5 h-3.5 accent-red-600 cursor-pointer shrink-0" checked={selectedPaymentKeys.has('lateFee')} onChange={() => toggleKey('lateFee')} />
                                    <span>Late Fee</span>
                                </label>
                                <div className="flex items-center gap-2 shrink-0">
                                    {payStatusBadge(itemStatus('lateFee', automatedLateFine))}
                                    <span>KES {Number(automatedLateFine ?? 0).toLocaleString()}</span>
                                    {canEdit && (
                                        <button
                                            type="button"
                                            title="Waive automated late fee this month"
                                            onClick={() => handleWaiveAutomatedLateFee(currentMonthIso)}
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1 text-xs font-bold"
                                        >
                                            ×
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                        {lateFeeWaivedThisMonth && (
                            <div className="flex items-center justify-between gap-2 text-gray-500 bg-gray-50 p-2 rounded-lg border border-dashed border-gray-200">
                                <span className="text-xs italic">Late Fee Waived/Deleted</span>
                                {canEdit && (
                                    <button
                                        type="button"
                                        onClick={handleRecalculateLateFee}
                                        className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-2 py-1 rounded font-semibold transition-colors flex items-center gap-1 border border-red-200"
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                        Recalculate
                                    </button>
                                )}
                            </div>
                        )}
                        {currentLateFeesList.map(item => {
                            const isFine = !('description' in item) && !String(item.id || '').startsWith('LATEFEE-');
                            const key = isFine ? `fine:${item.id}` : `bill:${item.id}`;
                            const label = item.type === 'Late Fee' ? `Late Fee (${item.description || 'Current Month'})` : item.type;
                            return (
                                <div key={key} className="flex items-center justify-between gap-2 text-red-600">
                                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                                        <input type="checkbox" className="w-3.5 h-3.5 accent-red-600 cursor-pointer shrink-0" checked={selectedPaymentKeys.has(key)} onChange={() => toggleKey(key)} />
                                        <span className="truncate">{label}</span>
                                    </label>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {payStatusBadge(itemStatus(key, item.amount))}
                                        <span className="font-medium">KES {Number(item.amount).toLocaleString()}</span>
                                        {canEdit && (
                                            <button
                                                type="button"
                                                title="Delete late fee"
                                                onClick={() => handleDeleteLateFeeItem(tenant.id, item.id, isFine, label)}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1 text-xs font-bold font-mono"
                                            >
                                                ×
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {waterDepositOwed > 0 && (
                            <div className="flex items-center justify-between gap-2 text-teal-700">
                                <label className="flex items-center gap-2 cursor-pointer flex-1">
                                    <input type="checkbox" className="w-3.5 h-3.5 accent-teal-600 cursor-pointer shrink-0" checked={selectedPaymentKeys.has('waterDeposit')} onChange={() => toggleKey('waterDeposit')} />
                                    <span>Water Deposit</span>
                                </label>
                                <div className="flex items-center gap-2 shrink-0">
                                    {payStatusBadge(itemStatus('waterDeposit', waterDepositOwed))}
                                    <span>KES {Number(waterDepositOwed).toLocaleString()}</span>
                                </div>
                            </div>
                        )}
                        {electricityDepositOwed > 0 && (
                            <div className="flex items-center justify-between gap-2 text-teal-700">
                                <label className="flex items-center gap-2 cursor-pointer flex-1">
                                    <input type="checkbox" className="w-3.5 h-3.5 accent-teal-600 cursor-pointer shrink-0" checked={selectedPaymentKeys.has('electricityDeposit')} onChange={() => toggleKey('electricityDeposit')} />
                                    <span>Electricity Deposit</span>
                                </label>
                                <div className="flex items-center gap-2 shrink-0">
                                    {payStatusBadge(itemStatus('electricityDeposit', electricityDepositOwed))}
                                    <span>KES {Number(electricityDepositOwed).toLocaleString()}</span>
                                </div>
                            </div>
                        )}
                        {subUnitsInvoicedTotal > 0 && (
                            <div className="flex justify-between text-sm text-gray-700">
                                <span>Total Invoiced (Sub-units)</span>
                                <span>KES {Number(subUnitsInvoicedTotal).toLocaleString()}</span>
                            </div>
                        )}
                        <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-800">
                            <span>Total Invoiced</span>
                            <span>KES {Number(totalInvoicedWithSubs ?? 0).toLocaleString()}</span>
                        </div>
                    </div>

                    {isPlacementFeeMonth && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                            <span className="font-bold mt-0.5">⚠</span>
                            <div>
                                <p className="font-bold">Placement Fee Month</p>
                                <p>This tenant's first month rent (KES {Number(effectiveRent ?? 0).toLocaleString()}) is directed to the agency as a placement fee. Management commission and MRI tax do not apply this month.</p>
                            </div>
                        </div>
                    )}

                    {/* Surplus payments roll forward as real bills for
                        upcoming months. Show "Rent paid up to …" instead
                        of a flat advance number. */}
                    {displayedAdvanceFromPrior > 0 && (() => {
                        // Only surface the "Rent paid up to …" / "Partial payment for <next month>"
                        // subtitle when surplus actually rolls past the current month.
                        // If the advance is being consumed by the current month's bill
                        // (i.e. there's still a Total Due), it's a partial payment for
                        // THIS month, not for a future month — show the plain label.
                        const surplusForward = displayedIsCreditBalance ? displayedCreditAmount : 0;
                        const advance = computeAdvanceAllocation(tenant, surplusForward, prepaidViewMonth ? prepaidViewMonth.monthIso : currentMonthIso, subUnitsInvoicedTotal);
                        const status = surplusForward > 0 ? formatPaidUpToStatus(advance) : '';
                        return (
                            <div className="flex justify-between items-start text-emerald-700 gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium">Advance Payment</p>
                                    {status && !/partial payment for/i.test(status) && (
                                        <p className="text-[11px] text-emerald-600 mt-0.5 leading-snug">{status}</p>
                                    )}
                                </div>
                                <span className="font-bold whitespace-nowrap">- KES {Number(displayedAdvanceFromPrior).toLocaleString()}</span>
                            </div>
                        );
                    })()}
                    <div className="flex justify-between items-center text-green-600">
                        <span className="font-medium">
                            Amount Paid (This Month)
                        </span>
                        <span className="font-bold">- KES {Number(displayedAmountPaid ?? 0).toLocaleString()}</span>
                    </div>



                    <div className="border-t pt-3 mt-2 flex justify-between items-center">
                        <span className="font-bold text-gray-800 text-base">
                            {displayedIsCreditBalance ? 'Advance Payment' : 'Total Due'}
                        </span>
                        <span className={`text-xl font-extrabold ${displayedIsCreditBalance ? 'text-emerald-600' : displayedBalanceDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {displayedIsCreditBalance ? '- ' : ''}KES {Number(displayedIsCreditBalance ? displayedCreditAmount : displayedBalanceDue).toLocaleString()}
                        </span>
                    </div>
                </div>
                
                {canPay && (
                <div className="mt-6">
                    {selectedPaymentKeys.size > 0 && (
                        <p className="text-xs text-center text-primary font-bold mb-3">
                            {selectedPaymentKeys.size} item{selectedPaymentKeys.size > 1 ? 's' : ''} selected — KES {selectedTotal.toLocaleString()}
                        </p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setActiveModal('recordPayment')}
                            className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-bold hover:bg-gray-50 transition-colors shadow-sm"
                        >
                            {selectedPaymentKeys.size > 0 ? 'Record Selected' : 'Record Manual Pay'}
                        </button>
                        <button
                            onClick={() => setActiveModal('pay')}
                            className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 shadow-md transition-colors"
                        >
                            M-Pesa Push
                        </button>
                    </div>
                </div>
                )}
            </div>

            {/* Payment History */}
            <div className="bg-white p-6 rounded-xl shadow-sm">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-800">Payment History</h3>
                    <button
                        onClick={handleDownloadStatement}
                        className="text-primary text-xs font-bold hover:underline flex items-center"
                    >
                        <Icon name="download" className="w-3 h-3 mr-1" /> View Statement
                    </button>
                </div>
                <div className="max-h-60 overflow-y-auto border rounded-lg">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-2">Date</th>
                                <th className="px-4 py-2">Type</th>
                                <th className="px-4 py-2">Txn Code</th>
                                <th className="px-4 py-2 text-right">Amount</th>
                                {canEdit && <th className="px-4 py-2 text-center">Action</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {isMultiLedgerReconciling && (
                                <tr>
                                    <td colSpan={canEdit ? 5 : 4} className="px-4 py-2 text-center text-xs text-gray-400 italic">Reconciling receipt amounts…</td>
                                </tr>
                            )}
                            {unifiedPaymentHistory.map((pay, idx) => {
                                const ref = String((pay as any).reference ?? '').trim();
                                return (
                                    <tr key={idx} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 text-gray-600">{fmtDate(pay.date)}</td>
                                        <td className="px-4 py-3 text-gray-600">{pay.method}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-gray-700">
                                            {ref || <span className="text-gray-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-gray-800">{pay.amount}</td>
                                        {canEdit && (
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => handleDeletePayment(pay)}
                                                    className="text-red-400 hover:text-red-600 transition-colors"
                                                    title="Delete payment"
                                                >
                                                    <Icon name="trash" className="w-4 h-4" />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                            {!isMultiLedgerReconciling && unifiedPaymentHistory.length === 0 && (
                                <tr>
                                    <td colSpan={canEdit ? 5 : 4} className="px-4 py-6 text-center text-gray-400">No payment history found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Communication Hub */}
            <div className="bg-white p-6 rounded-xl shadow-sm flex flex-col h-[600px]">
                <div className="flex justify-between items-center mb-4 border-b pb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary/10 rounded-full"><Icon name="communication" className="w-5 h-5 text-primary" /></div>
                        <h3 className="text-lg font-bold text-gray-800">Communication Hub</h3>
                    </div>
                    <button
                        onClick={() => setActiveModal('request')}
                        className="bg-gray-100 text-gray-700 text-xs font-bold px-3 py-1.5 rounded hover:bg-gray-200 flex items-center"
                    >
                        <Icon name="plus" className="w-3 h-3 mr-1"/> Create Ticket
                    </button>
                </div>

                <div className="flex-grow overflow-y-auto space-y-4 pr-2 mb-4">
                    <div className="text-center text-xs text-gray-400 my-2">- Notifications -</div>
                    
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 flex items-center gap-3">
                        <div className="bg-blue-100 p-1.5 rounded text-blue-600"><Icon name="mail" className="w-4 h-4"/></div>
                        <div className="flex-grow">
                            <p className="font-bold">System Notification</p>
                            <p>Invoice #INV-001 sent via Email</p>
                        </div>
                        <span className="text-[10px]">{fmtDate(tenant.onboardingDate)}</span>
                    </div>

                    {sortedRequests.map(req => (
                        <div key={req.id} className="border border-gray-200 rounded-lg p-3 bg-white hover:shadow-sm transition-shadow">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${req.type === 'Maintenance' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-700'}`}>{req.type}</span>
                                    <h4 className="font-bold text-sm text-gray-800">{req.title}</h4>
                                </div>
                                <span className="text-[10px] text-gray-400">{req.date}</span>
                            </div>
                            
                            <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded mb-2 border border-gray-100">{req.description}</p>

                            {req.images && req.images.length > 0 && (
                                <div className="flex gap-2 mb-2">
                                    {req.images.map((img, i) => (
                                        <img key={i} src={img} alt="request-attachment" className="w-8 h-8 rounded object-cover border" />
                                    ))}
                                </div>
                            )}
                           
                            {req.messages && req.messages.length > 0 && (
                                <div className="space-y-2 pl-2 border-l-2 border-gray-100 my-2">
                                    {req.messages.map(msg => (
                                        <div key={msg.id} className="text-xs">
                                            <span className={`font-bold ${msg.sender === 'Admin' ? 'text-primary' : 'text-gray-600'}`}>{msg.sender}:</span> {msg.text}
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            <div className="mt-2 flex justify-end">
                                <button 
                                    onClick={() => setActiveFollowUpId(activeFollowUpId === req.id ? null : req.id)} 
                                    className={`text-xs font-bold px-3 py-1.5 rounded flex items-center transition-colors ${activeFollowUpId === req.id ? 'bg-gray-200 text-gray-700' : 'bg-primary text-white hover:bg-primary-dark'}`}
                                >
                                    <Icon name="communication" className="w-3 h-3 mr-1" />
                                    {activeFollowUpId === req.id ? 'Cancel Follow Up' : 'Follow Up'}
                                </button>
                            </div>

                            {activeFollowUpId === req.id && (
                                <div className="mt-2">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={chatInput}
                                            onChange={e => setChatInput(e.target.value)}
                                            placeholder="Type message..."
                                            className="flex-grow p-2 border rounded text-xs focus:ring-1 focus:ring-primary outline-none"
                                            autoFocus
                                        />
                                        <button onClick={() => handleFollowUp(req.id)} className="px-3 py-1 bg-primary text-white rounded text-xs font-bold">Send</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="border-t pt-3">
                     <div className="flex gap-2">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            placeholder="Send general In-App message to Tenant..."
                            className="flex-grow p-2 border rounded text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                        />
                        <button onClick={handleSendMessage} className="px-4 py-2 bg-primary text-white rounded font-bold hover:bg-primary-dark transition-colors">
                            <Icon name="communication" className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {activeModal === 'bills' && <BillManagementModal tenant={tenant} onClose={() => setActiveModal(null)} />}
            {activeModal === 'fines' && <FinesManagementModal tenant={tenant} onClose={() => setActiveModal(null)} />}
            {activeModal === 'status' && <StatusManagementModal tenant={tenant} onClose={() => setActiveModal(null)} />}
            {activeModal === 'request' && <NewRequestModal tenant={tenant} onClose={() => setActiveModal(null)} onSave={handleNewRequest} />}
            {activeModal === 'pay' && <MpesaStkModal onClose={() => setActiveModal(null)} amount={Math.max(0, displayedBalanceDue)} tenantName={tenant.name} tenantId={tenant.id} />}
            {activeModal === 'recordPayment' && (
                <RecordPaymentModal
                    tenant={tenant}
                    balance={selectedTotal}
                    onClose={() => setActiveModal(null)} 
                    onRecord={handleRecordPayment} 
                />
            )}
            {activeModal === 'notice' && (
                <NoticeTemplateModal 
                    type={noticeModalType} 
                    tenant={tenant} 
                    clientNotice={reviewNotice}
                    onClose={() => setActiveModal(null)} 
                    onAction={handleNoticeAction} 
                />
            )}
            
            {activeModal === 'negotiatedVacating' && (
                <NegotiatedVacatingModal
                    tenant={tenant}
                    onClose={() => setActiveModal(null)}
                    onConfirm={handleStartNegotiatedVacating}
                />
            )}

            {activeModal === 'initiateOffboarding' && (
                <InitiateOffboardingModal 
                    tenant={tenant}
                    onClose={() => setActiveModal(null)}
                    onStart={handleStartOffboarding}
                />
            )}

            {activeModal === 'manageOffboarding' && effectiveRecord && (
                <ManageOffboardingModal
                    record={effectiveRecord}
                    onClose={() => { setActiveModal(null); setCreatedRecord(null); }}
                    onUpdate={updateOffboardingRecord}
                    onRevoke={handleRevokeNotice}
                    onFinalize={handleFinalizeOffboarding}
                />
            )}
        </div>
    );
};

// --- LIST VIEW ---

const ActiveTenants: React.FC = () => {
    const { tenants, applications, isDataLoading } = useData();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState('Active');
    const [listMode, setListMode] = useState<'active' | 'inactive'>('active');
   
    // Check URL for specific tenant view on load or change
    const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash;
            if (hash.includes('tenantId=')) {
                const id = hash.split('tenantId=')[1].split('&')[0];
                setSelectedTenantId(id);
            } else {
                setSelectedTenantId(null);
            }
        };
        handleHashChange(); // Initial check
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    const [globalDbPayments, setGlobalDbPayments] = useState<any[]>([]);
    useEffect(() => {
        let cancelled = false;
        supabase
            .from('payments')
            .select('amount, created_at, source, transaction_id, checkout_request_id, matched_tenant_id')
            .eq('status', 'completed')
            .then(({ data, error }) => {
                if (!cancelled && data) {
                    setGlobalDbPayments(data);
                }
            });
        return () => { cancelled = true; };
    }, []);

    const tenantsWithPayments = useMemo(() => {
        if (!globalDbPayments.length) return tenants;
        return tenants.map(t => {
            const history = [...(t.paymentHistory || [])];
            const existingRefs = new Set(history.map(p => normalizeMultiReceiptReference(p.reference)).filter(Boolean));
            const myDbPayments = globalDbPayments.filter(p => p.matched_tenant_id === t.id);
            let added = false;
            for (const p of myDbPayments) {
                const ref = normalizeMultiReceiptReference(p.transaction_id || p.checkout_request_id);
                if (ref && !existingRefs.has(ref)) {
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
                return { ...t, paymentHistory: history };
            }
            return t;
        });
    }, [tenants, globalDbPayments]);

    const approvedPendingApps = useMemo(() => {
        return applications.filter(a => a.status === 'Approved');
    }, [applications]);

    const inactivePool = useMemo(() => tenantsWithPayments.filter(isInactiveApplicantTenant), [tenantsWithPayments]);

    // Helper to compute a tenant's exact profile total due (equivalent to Balance Overview calculation)
    const computeTenantProfileTotalDue = useCallback((
        tenant: TenantProfile,
        currentMonthIso: string,
        tenants: TenantProfile[],
        activeSubTenants: TenantProfile[],
        ledgerReceiptAmounts: Record<string, number>
    ): number => {
        const rentStartAnchor = getTenantRentStartAnchor(tenant);
        const activationMonthIso = rentStartAnchor ? String(rentStartAnchor).slice(0, 7) : null;
        const isActivationMonth = activationMonthIso === currentMonthIso;
        const rentStartsInFutureMonth = !!activationMonthIso && activationMonthIso > currentMonthIso;
        const firstMonthRentStored = Number((tenant as any).firstMonthRent || 0);
        const effectiveRent = rentStartsInFutureMonth
            ? 0
            : isActivationMonth
                ? (firstMonthRentStored > 0
                    ? firstMonthRentStored
                    : calculateProratedFirstMonthRent(Number(tenant.rentAmount || 0), rentStartAnchor))
                : Number(tenant.rentAmount || 0);
        const rentDue = effectiveRent;

        const recurrentBills = (Object.values(tenant.recurringBills || {}) as Array<number | undefined>).reduce((a, b) => a + Number(b || 0), 0);

        const pendingBills = (tenant.outstandingBills || [])
            .filter(b => b.status === 'Pending')
            .filter(b => !(b.type === 'Rent Arrears' && String(b.id || '').startsWith('bill-backfill-')) && b.type !== 'Rent')
            .filter(b => !String(b.id || '').startsWith('ADVANCE-'))
            .filter(b => !String(b.id || '').startsWith('DEPOSIT-INST-'))
            .filter(b => b.type !== 'Late Fee')
            .filter(b => !b.date || b.date.slice(0, 7) <= currentMonthIso)
            .reduce((sum, b) => sum + b.amount, 0);

        const fines = (tenant.outstandingFines || [])
            .filter(f => !isLateFeeType(f.type) && f.status === 'Pending')
            .filter(f => !f.date || f.date.slice(0, 7) <= currentMonthIso)
            .reduce((sum, f) => sum + f.amount, 0);

        const isFullyPaid = isTenantRentCoveredForMonth(tenant, currentMonthIso);
        const rentStat = getMonthlyRentStatus(tenant, { isRentPaidThisMonth: isFullyPaid, asOfMonthIso: currentMonthIso });
        
        const [cYear, cMonth] = currentMonthIso.split('-').map(Number);
        const prevMonthDate = new Date(cYear, cMonth - 2, 1);
        const prevMonthIso = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
        const prevRentStat = getMonthlyRentStatus(tenant, { asOfMonthIso: prevMonthIso });
        
        const automatedLateFineDelta = Math.max(0, rentStat.automatedLateFine - prevRentStat.automatedLateFine);
        const lateFeeWaivedThisMonth = (tenant.waivedLateFeeMonths || []).includes(currentMonthIso);
        
        const hasPersistedCurrentLateFee = (tenant.outstandingBills || []).some(b => b.type === 'Late Fee' && (!b.date || String((b as any).date || '').startsWith(currentMonthIso))) || 
           (tenant.outstandingFines || []).some(f => ['Late Fee', 'Rent Arrears Fine', 'Defaulter Fine'].includes(f.type || '') && (!f.date || String((f as any).date || '').startsWith(currentMonthIso)));

        const automatedLateFine = lateFeeWaivedThisMonth || hasPersistedCurrentLateFee ? 0 : automatedLateFineDelta;

        const currentLateFeeBills = (tenant.outstandingBills || [])
            .filter(b => b.status === 'Pending' && b.type === 'Late Fee' && (!b.date || String((b as any).date || '').startsWith(currentMonthIso)));
        const currentLateFeeFines = (tenant.outstandingFines || [])
            .filter(f => f.status === 'Pending' && isLateFeeType(f.type) && (!f.date || String((f as any).date || '').startsWith(currentMonthIso)));
        const currentLateFeesList = [...currentLateFeeBills, ...currentLateFeeFines];
        const currentLateFeesSum = currentLateFeesList.reduce((sum, b) => sum + Number(b.amount || 0), 0);

        const priorLateFeeBills = (tenant.outstandingBills || [])
            .filter(b => {
                const isPrior = String((b as any).date || '') < currentMonthIso;
                if (!isPrior) return false;
                if (b.type !== 'Late Fee') return false;
                const isPending = b.status === 'Pending';
                const isPaidThisMonth = b.status === 'Paid' && String((b as any).datePaid || '').startsWith(currentMonthIso);
                return isPending || isPaidThisMonth;
            });
        const priorLateFeeFines = (tenant.outstandingFines || [])
            .filter(f => {
                const isPrior = String((f as any).date || '') < currentMonthIso;
                if (!isPrior) return false;
                if (!isLateFeeType(f.type)) return false;
                const isPending = f.status === 'Pending';
                const isPaidThisMonth = f.status === 'Paid' && String((f as any).datePaid || '').startsWith(currentMonthIso);
                return isPending || isPaidThisMonth;
            });
        const priorLateFeesList = [...priorLateFeeBills, ...priorLateFeeFines];
        const priorLateFeesSum = priorLateFeesList.reduce((sum, b) => sum + Number(b.amount || 0), 0);

        const depositMonthsRaw = Number((tenant as any).depositMonths ?? 1);
        const depositMonths = Number.isFinite(depositMonthsRaw) && depositMonthsRaw > 0 ? depositMonthsRaw : 1;
        const depositPaidAmt = Number(tenant.depositPaid || 0);
        const depositExpectedStandard = Math.max(
            Number((tenant as any).depositExpected ?? 0) > 0
                ? Number((tenant as any).depositExpected)
                : (Number(tenant.rentAmount || 0) * depositMonths),
            depositPaidAmt,
        );

        const amountPaidBeforeThisMonth = (tenant.paymentHistory || [])
            .filter(p => p.status === "Paid" && p.date && p.date < currentMonthIso && !isBackdatedOpeningBalancePayment(p))
            .reduce((sum, p) => sum + parsePaymentAmount(p.amount), 0);

        const depositRestoredAtIso = String((tenant as any).depositRestoredAt || '');
        const depositPaymentsBeforeThisMonth = depositRestoredAtIso
            ? (tenant.paymentHistory || [])
                .filter(p => p.status === 'Paid' && p.date && p.date < currentMonthIso && p.date >= depositRestoredAtIso && !isBackdatedOpeningBalancePayment(p))
                .reduce((sum, p) => sum + parsePaymentAmount(p.amount), 0)
            : amountPaidBeforeThisMonth;

        const depositPaidPriorMonths = tenant.depositExempt
            ? 0
            : tenant.proratedDeposit?.enabled
                ? Math.min(getProratedDepositPaidBeforeMonth(tenant, currentMonthIso), tenant.proratedDeposit.totalDepositAmount)
                : Math.min(depositPaymentsBeforeThisMonth, depositExpectedStandard, Number(tenant.depositPaid || 0));

        const depositClearedBeforeThisMonth = !tenant.depositExempt && (
            tenant.proratedDeposit?.enabled
                ? getProratedDepositInstallmentDueForMonth(tenant, currentMonthIso) <= 0.5
                : (isActivationMonth
                    ? false
                    : depositExpectedStandard > 0 && depositPaidPriorMonths + 0.5 >= depositExpectedStandard)
        );

        let depositDueForInvoiceGross = 0;
        if (!tenant.depositExempt) {
            if (tenant.proratedDeposit?.enabled) {
                depositDueForInvoiceGross = getProratedDepositInstallmentDueForMonth(tenant, currentMonthIso);
            } else {
                const anchor = getTenantRentStartAnchor(tenant);
                const activationMonth = anchor ? String(anchor).slice(0, 7) : null;
                if (activationMonth && currentMonthIso > activationMonth) {
                    depositDueForInvoiceGross = 0;
                } else if (activationMonth && currentMonthIso === activationMonth) {
                    depositDueForInvoiceGross = depositExpectedStandard;
                } else {
                    depositDueForInvoiceGross = depositClearedBeforeThisMonth ? 0 : Math.max(0, depositExpectedStandard - depositPaidPriorMonths);
                }
            }
        }

        const waterDepositOwed = (() => {
            const d = (tenant as any).waterDeposit as { required?: boolean; exempt?: boolean; amount?: number; paid?: number } | undefined;
            if (!d?.required || d?.exempt) return 0;
            return Math.max(0, (d.amount || 0) - (d.paid || 0));
        })();

        const electricityDepositOwed = (() => {
            const d = (tenant as any).electricityDeposit as { required?: boolean; exempt?: boolean; amount?: number; paid?: number } | undefined;
            if (!d?.required || d?.exempt) return 0;
            return Math.max(0, (d.amount || 0) - (d.paid || 0));
        })();

        const arrearsBreakdown = computeTenantArrears(tenant, currentMonthIso, { subs: activeSubTenants, allTenants: tenants });
        const priorArrearsTotal = arrearsBreakdown.totalArrears;

        const totalExpected = rentDue + recurrentBills + pendingBills + fines + automatedLateFine + currentLateFeesSum + priorLateFeesSum + depositDueForInvoiceGross + waterDepositOwed + electricityDepositOwed + priorArrearsTotal;

        const subUnitsInvoicedTotal = computeSubUnitsInvoicedTotal(tenants, tenant.id, currentMonthIso);

        const unifiedPaymentHistory = tenant.occupancyType === 'Main'
            ? buildUnifiedMultiOccupancyPaymentHistory(tenant, activeSubTenants, ledgerReceiptAmounts)
            : (tenant.paymentHistory || []);

        const monthlyBalance = tenant.occupancyType === 'Main'
            ? computeMultiOccupancyGroupMonthlyBalance(tenant, activeSubTenants, currentMonthIso, {
                mainTotalInvoiced: totalExpected,
                subTotalInvoiced: subUnitsInvoicedTotal,
                unifiedPaymentHistory,
            })
            : computeTenantMonthlyBalance(tenant, currentMonthIso, { totalInvoiced: totalExpected });

        return monthlyBalance.balanceDue;
    }, [tenants]);

    const tenantMetrics = useMemo(() => {
        const currentMonthIso = getMonthPrefix();
        const map = new Map<string, {
            effectiveStatus: string;
            hasAdvancePayment: boolean;
            currentMonthHasDue: boolean;
            balance: any;
            totalDue: number;
        }>();

        // Optimize: Group sub-tenants by mainTenantId once to avoid O(N^2) loops inside computeSubUnitsInvoicedTotal
        const subTenantsByMainId = new Map<string, TenantProfile[]>();
        tenantsWithPayments.forEach(t => {
            if (t.mainTenantId && t.status !== 'Vacated') {
                const list = subTenantsByMainId.get(t.mainTenantId) || [];
                list.push(t);
                subTenantsByMainId.set(t.mainTenantId, list);
            }
        });

        // Build ledgerReceiptAmounts from globalDbPayments once to avoid re-building it inside the loop
        const ledgerReceiptAmounts: Record<string, number> = {};
        globalDbPayments.forEach(row => {
            const amount = Number(row?.amount || 0);
            if (!Number.isFinite(amount) || amount <= 0) return;
            for (const candidate of [row.transaction_id, row.checkout_request_id]) {
                const ref = normalizeMultiReceiptReference(candidate);
                if (ref) ledgerReceiptAmounts[ref] = amount;
            }
        });

        tenantsWithPayments.forEach(t => {
            const eff = effectiveTenantStatus(t);
            const isAllocated = tenantFullyAllocated(t);

            const activeSubs = subTenantsByMainId.get(t.id) || [];
            const totalDue = computeTenantProfileTotalDue(
                t,
                currentMonthIso,
                tenantsWithPayments,
                activeSubs,
                ledgerReceiptAmounts
            );

            const hasAdvancePayment = isAllocated && eff !== 'Vacated' && eff !== 'Blacklisted' && (totalDue < -0.5);
            const currentMonthHasDue = eff === 'Active' && totalDue > 0.5;

            map.set(t.id, {
                effectiveStatus: eff,
                hasAdvancePayment,
                currentMonthHasDue,
                balance: { totalDue, totalInvoiced: 0 },
                totalDue,
            });
        });

        return map;
    }, [tenantsWithPayments, globalDbPayments, computeTenantProfileTotalDue]);

    const filteredTenants = useMemo(() => {
        const pool = listMode === 'inactive' ? inactivePool : tenantsWithPayments;
        const q = searchQuery.trim().toLowerCase();
        const qCanonical = canonicalizePhone(searchQuery);

        return pool.filter(t => {
            // Hide Sub tenants from the main list view — they are accessed via the Main tenant's dropdown
            if (t.occupancyType === 'Sub') return false;

            const activeSubs = tenantsWithPayments.filter(s => s.mainTenantId === t.id && s.status !== 'Vacated');
            const subMatch = !q ? false : activeSubs.some(s => (
                (s.name || '').toLowerCase().includes(q) ||
                (s.unit || '').toLowerCase().includes(q) ||
                (s.unitNumber || '').toLowerCase().includes(q) ||
                (s.unitName || '').toLowerCase().includes(q) ||
                ((s as any).unitTag || '').toLowerCase().includes(q) ||
                (s.idNumber || '').toLowerCase().includes(q) ||
                (s.phone || '').includes(searchQuery) ||
                (!!qCanonical && canonicalizePhone(s.phone) === qCanonical) ||
                (!!qCanonical && canonicalizePhone((s as any).alternativePhone) === qCanonical)
            ));

            const matchesSearch = !q ? true : (
                (t.name || '').toLowerCase().includes(q) ||
                (t.unit || '').toLowerCase().includes(q) ||
                (t.unitNumber || '').toLowerCase().includes(q) ||
                (t.unitName || '').toLowerCase().includes(q) ||
                ((t as any).unitTag || '').toLowerCase().includes(q) ||
                ((t as any).paymentAccount || '').toLowerCase().includes(q) ||
                (t.propertyName || '').toLowerCase().includes(q) ||
                (t.idNumber || '').toLowerCase().includes(q) ||
                (t.phone || '').includes(searchQuery) ||
                (!!qCanonical && canonicalizePhone(t.phone) === qCanonical) ||
                (!!qCanonical && canonicalizePhone((t as any).alternativePhone) === qCanonical) ||
                subMatch
            );
            if (listMode === 'inactive') return matchesSearch;
            
            const metrics = tenantMetrics.get(t.id);
            const eff = metrics ? metrics.effectiveStatus : effectiveTenantStatus(t);

            // The chip a tenant lands in must always agree with the badge on
            // their card, which is driven purely by the effective status.
            const PENDING_EFFECTIVE = eff === 'PendingApproval' || eff === 'PendingAllocation' || eff === 'PendingPayment';

            let matchesFilter = false;
            if (activeFilter === 'All') {
                matchesFilter = t.status !== 'Vacated' && t.status !== 'Blacklisted' && eff !== 'Vacated' && eff !== 'Blacklisted';
            } else if (activeFilter === 'Active') {
                matchesFilter = eff === 'Active' && !(metrics?.currentMonthHasDue);
            } else if (activeFilter === 'Unpaid') {
                matchesFilter = eff === 'Active' && (metrics?.currentMonthHasDue ?? false);
            } else if (activeFilter === 'Advance') {
                matchesFilter = !PENDING_EFFECTIVE && (metrics?.hasAdvancePayment ?? tenantHasAdvancePayment(t));
            } else {
                matchesFilter = eff === activeFilter || (!PENDING_EFFECTIVE && t.status === activeFilter);
            }

            return matchesSearch && matchesFilter;
        });
    }, [tenantsWithPayments, inactivePool, listMode, searchQuery, activeFilter, tenantMetrics]);

    const [currentPage, setCurrentPage] = useState(1);
    const PAGE_SIZE = 50;
    useEffect(() => {
        setCurrentPage(1);
    }, [activeFilter, searchQuery, listMode]);

    const paginatedTenants = useMemo(() => {
        return filteredTenants.slice(0, currentPage * PAGE_SIZE);
    }, [filteredTenants, currentPage]);
    // Defer the grid so search/filter typing and initial paint stay responsive
    // while the heavy per-tenant metric computation catches up in the background.
    const deferredPaginatedTenants = React.useDeferredValue(paginatedTenants);

    const handleTenantClick = (id: string) => {
        window.location.hash = `#/tenants/active-tenants?tenantId=${id}`;
    };

    const handleBackToList = () => {
        // Clear the query param to return to the list view of this component
        window.location.hash = '#/tenants/active-tenants';
    };

    if (isDataLoading) {
        return <div className="text-center py-8">Loading data...</div>;
    }

    if (!isDataLoading && tenantsWithPayments.length === 0 && applications.length === 0) {
        return <div className="text-center py-8 text-gray-500">No tenants yet. Add your first one.</div>;
    }

    // If a tenant is selected via URL, show detailed view
    const specificTenant = tenantsWithPayments.find(t => t.id === selectedTenantId);
    if (specificTenant) {
        return <TenantDetailErrorBoundary tenant={specificTenant} onBack={handleBackToList} />;
    }

    // Otherwise, show list view
    return (
        <div className="space-y-8 pb-10">
            <style>{styles}</style>
           
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">
                        {listMode === 'inactive' ? 'Inactive / Pending applicants' : 'Active Tenants'}
                    </h1>
                    <p className="text-lg text-gray-500 mt-1">
                        {listMode === 'inactive'
                            ? 'Tenants not yet active or missing allocation. Open a card to record payment or STK — successful M-Pesa confirms a Pending tenant as Active.'
                            : 'Manage tenant profiles, bills, and house status.'}
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="flex rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                        <button
                            type="button"
                            onClick={() => setListMode('active')}
                            className={`px-4 py-2 text-sm font-bold ${listMode === 'active' ? 'bg-primary text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                            Active tenants
                        </button>
                        <button
                            type="button"
                            onClick={() => setListMode('inactive')}
                            className={`px-4 py-2 text-sm font-bold border-l border-gray-200 ${listMode === 'inactive' ? 'bg-amber-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                        >
                            Inactive / Pending ({inactivePool.length})
                        </button>
                    </div>
                    <div className="flex items-center gap-3 bg-white p-2 rounded-lg border shadow-sm">
                        <Icon name="search" className="w-5 h-5 text-gray-400 ml-2" />
                        <input
                            className="outline-none text-sm w-56"
                            placeholder="Search name, unit, ID, phone..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {approvedPendingApps.length > 0 && listMode === 'inactive' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-amber-900">
                        <strong>{approvedPendingApps.length}</strong> approved application(s) may still need a tenant record or allocation. Review them in Applications.
                    </p>
                    <button
                        type="button"
                        onClick={() => { window.location.hash = '#/tenants/applications'; }}
                        className="px-4 py-2 bg-amber-700 text-white text-sm font-bold rounded-lg hover:bg-amber-800"
                    >
                        Open Applications
                    </button>
                </div>
            )}

            {/* Filters */}
            {listMode === 'active' && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {STATUS_FILTERS.map(({ key, label }) => {
                        const count = key === 'All'
                            ? tenantsWithPayments.filter(t => {
                                if (t.occupancyType === 'Sub') return false;
                                const m = tenantMetrics.get(t.id);
                                const eff = m?.effectiveStatus || effectiveTenantStatus(t);
                                return t.status !== 'Vacated' && t.status !== 'Blacklisted' && eff !== 'Vacated' && eff !== 'Blacklisted';
                            }).length
                            : key === 'Applications'
                            ? applications.length
                            : key === 'Advance'
                            ? tenantsWithPayments.filter(t => {
                                if (t.occupancyType === 'Sub') return false;
                                const m = tenantMetrics.get(t.id);
                                return m ? m.hasAdvancePayment : tenantHasAdvancePayment(t);
                            }).length
                            : key === 'Active'
                            ? tenantsWithPayments.filter(t => {
                                if (t.occupancyType === 'Sub') return false;
                                const m = tenantMetrics.get(t.id);
                                return m ? (m.effectiveStatus === 'Active' && !m.currentMonthHasDue) : (t.status === 'Active' && !tenantCurrentMonthHasDue(t));
                            }).length
                            : key === 'Unpaid'
                            ? tenantsWithPayments.filter(t => {
                                if (t.occupancyType === 'Sub') return false;
                                const m = tenantMetrics.get(t.id);
                                return m ? (m.effectiveStatus === 'Active' && m.currentMonthHasDue) : (t.status === 'Active' && tenantCurrentMonthHasDue(t));
                            }).length
                            : tenantsWithPayments.filter(t => {
                                if (t.occupancyType === 'Sub') return false;
                                const m = tenantMetrics.get(t.id);
                                const eff = m?.effectiveStatus || effectiveTenantStatus(t);
                                return eff === key || t.status === key;
                            }).length;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setActiveFilter(key)}
                                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${activeFilter === key ? 'bg-primary text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50 border'}`}
                            >
                                {label}{count > 0 ? ` (${count})` : ''}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Applications Grid — shown when Applications chip is active */}
            {listMode === 'active' && activeFilter === 'Applications' && (() => {
                const q = searchQuery.trim().toLowerCase();
                const filteredApps = applications.filter(a =>
                    !q ||
                    a.name.toLowerCase().includes(q) ||
                    (a.phone || '').toLowerCase().includes(q) ||
                    (a.email || '').toLowerCase().includes(q) ||
                    (a.propertyName || '').toLowerCase().includes(q)
                );
                const statusColor = (s: string) => {
                    if (s === 'Approved') return 'bg-green-100 text-green-800';
                    if (s === 'Under Review') return 'bg-blue-100 text-blue-800';
                    if (s === 'Rejected') return 'bg-red-100 text-red-800';
                    return 'bg-gray-100 text-gray-700';
                };
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredApps.map(app => (
                            <div key={app.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-lg">
                                            {app.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">{app.name}</p>
                                            <p className="text-xs text-gray-500">{app.phone}</p>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusColor(app.status)}`}>{app.status}</span>
                                </div>
                                <div className="text-xs text-gray-500 space-y-1">
                                    {app.email && <p><span className="font-semibold text-gray-600">Email:</span> {app.email}</p>}
                                    {app.propertyName && <p><span className="font-semibold text-gray-600">Property:</span> {app.propertyName}{app.unit ? ` · ${app.unit}` : ''}</p>}
                                    {app.rentAmount && <p><span className="font-semibold text-gray-600">Rent:</span> KES {Number(app.rentAmount).toLocaleString()}/mo</p>}
                                    <p><span className="font-semibold text-gray-600">Submitted:</span> {app.submittedDate}</p>
                                    {app.source && <p><span className="font-semibold text-gray-600">Source:</span> {app.source}</p>}
                                </div>
                                <button
                                    onClick={() => { window.location.hash = '#/tenants/applications'; }}
                                    className="mt-auto w-full py-2 bg-primary/10 text-primary text-xs font-bold rounded-lg hover:bg-primary/20 transition-colors"
                                >
                                    Review in Applications
                                </button>
                            </div>
                        ))}
                        {filteredApps.length === 0 && (
                            <div className="col-span-full text-center py-10 text-gray-500">
                                {q ? 'No applications match your search.' : 'No applications yet.'}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Tenant Grid — hidden when Applications chip is active */}
            {activeFilter !== 'Applications' && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {deferredPaginatedTenants.map(tenant => {
                    const currentMonthIso = getMonthPrefix();
                    const isAllocated = tenantFullyAllocated(tenant);

                    const metrics = tenantMetrics.get(tenant.id);
                    const cardBalance = metrics ? metrics.balance : computeTenantCardBalance(tenant, currentMonthIso, { isAllocated });
                    const totalDue = metrics ? metrics.totalDue : cardBalance.totalDue;
                    const cardIsCredit = totalDue < 0;
                    const cardCreditAmount = cardIsCredit ? Math.abs(totalDue) : 0;
                    const totalDueLabel = cardIsCredit ? 'Advance Payment' : 'Total Due';


                    // Arrears Month Indicator
                    const arrearsText = getArrearsText(tenant);

                    // Partial-paid tag: tenant has sent some money but the
                    // first rent + deposit hasn't fully cleared, so they
                    // remain in PendingPayment / Pending instead of Active.
                    const hasAnyPaid = (tenant.paymentHistory || []).some(p => p.status === 'Paid');
                    const depositMonthsForCard = Number(tenant.depositMonths ?? 1);
                    const expectedDepositForCard = Number((tenant as any).depositExpected ?? 0) > 0
                        ? Number((tenant as any).depositExpected)
                        : (Number(tenant.rentAmount || 0) * depositMonthsForCard);
                    const depositCovered = tenant.depositExempt
                        || tenant.rentExtension?.enabled
                        || (tenant.proratedDeposit?.enabled
                            // For prorated deposits, the first instalment is
                            // sufficient to clear "Partial Paid" once the
                            // tenant is Active (rest is amortised monthly).
                            ? (tenant.proratedDeposit.monthsPaid || 0) >= 1
                                || tenant.proratedDeposit.amountPaidSoFar >= tenant.proratedDeposit.totalDepositAmount
                            : Number(tenant.depositPaid || 0) + 0.5 >= expectedDepositForCard);
                    const showPartialPaid = isAllocated
                        && hasAnyPaid
                        && !depositCovered
                        && !tenantHasAdvancePayment(tenant)
                        && effectiveTenantStatus(tenant) === 'PendingPayment';

                    return (
                        <div
                            key={tenant.id}
                            className={GRID_CARD_CLASSES}
                            onClick={() => handleTenantClick(tenant.id)}
                        >
                            <div className="flex flex-col h-full w-full">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-bold border border-gray-200 uppercase overflow-hidden">
                                            {isAvatarUrl(tenant.avatar) ? (
                                                <img src={tenant.avatar} alt={tenant.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <span>{tenant.avatar || tenant.name.charAt(0)}</span>
                                            )}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-800">{tenant.name}</h3>
                                            <p className="text-xs text-gray-500">{tenant.unit} • {tenant.propertyName}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        {(() => {
                                            const eff = effectiveTenantStatus(tenant);
                                            const labelMap: Record<string, string> = {
                                                PendingApproval: 'Pending Approval',
                                                PendingAllocation: 'Pending Allocation',
                                                PendingPayment: 'Pending Payment',
                                                Unpaid: 'Unpaid',
                                            };
                                            const label = labelMap[eff] || eff || tenant.status;
                                            const cls =
                                                eff === 'Active' ? 'bg-green-100 text-green-700' :
                                                eff === 'Unpaid' ? 'bg-rose-100 text-rose-700' :
                                                eff === 'Overdue' ? 'bg-red-100 text-red-700' :
                                                eff === 'PendingApproval' ? 'bg-purple-100 text-purple-800' :
                                                eff === 'PendingAllocation' ? 'bg-yellow-100 text-yellow-800' :
                                                eff === 'PendingPayment' ? 'bg-amber-100 text-amber-800' :
                                                eff === 'Notice' ? 'bg-blue-100 text-blue-700' :
                                                'bg-gray-100 text-gray-700';
                                            return (
                                                <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${cls}`}>{label}</span>
                                            );
                                        })()}
                                        {showPartialPaid && (
                                            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                                                Partial Paid
                                            </span>
                                        )}
                                        {tenant.houseStatus && tenant.houseStatus.length > 0 && (
                                            <div className="flex flex-wrap gap-1 justify-end">
                                                {tenant.houseStatus.slice(0, 2).map(status => (
                                                    <span key={status} className="text-[9px] bg-red-50 text-red-600 px-1 rounded border border-red-100">
                                                        {status}
                                                    </span>
                                                ))}
                                                {tenant.houseStatus.length > 2 && <span className="text-[9px] text-gray-400">+{tenant.houseStatus.length - 2}</span>}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-sm mt-auto border-t pt-3 mb-3">
                                    <div>
                                        <p className="text-xs text-gray-400 uppercase font-bold">Rent</p>
                                        <p className="font-semibold">KES {Number(isAllocated ? (tenant.rentAmount ?? 0) : 0).toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className={`text-xs uppercase font-bold ${cardIsCredit ? 'text-emerald-600' : 'text-gray-400'}`}>
                                            {totalDueLabel}
                                        </p>
                                        <p className={`font-semibold ${cardIsCredit ? 'text-emerald-600' : totalDue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            KES {Number(cardIsCredit ? cardCreditAmount : totalDue).toLocaleString()}
                                        </p>
                                    </div>
                                </div>

                                {(() => {
                                    const subs = tenantsWithPayments.filter(t => t.mainTenantId === tenant.id && t.status !== 'Vacated');
                                    if (subs.length === 0) return null;
                                    return (
                                        <div className="mb-3 bg-indigo-50/50 border border-indigo-100 rounded-lg p-2">
                                            <p className="text-[10px] font-bold text-indigo-800 uppercase mb-1.5">{subs.length} Sub-unit{subs.length === 1 ? '' : 's'}</p>
                                            <div className="space-y-1.5">
                                                {subs.map(sub => (
                                                    <div key={sub.id} className="flex items-center justify-between text-xs">
                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                            <div className="w-1 h-1 rounded-full bg-indigo-400 shrink-0"></div>
                                                            <span className="text-indigo-900 font-medium truncate">{sub.name}</span>
                                                        </div>
                                                        <span className="text-indigo-700 shrink-0 text-[10px] font-bold bg-white px-1.5 py-0.5 rounded shadow-sm border border-indigo-50">
                                                            {sub.unit}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {arrearsText && (
                                    <div className="mb-2 text-xs text-red-600 font-bold bg-red-50 p-1 rounded text-center border border-red-100">
                                        {arrearsText}
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <button className="flex-1 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 text-xs font-bold rounded border border-gray-200 transition-colors">
                                        View Profile
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {filteredTenants.length === 0 && (
                    <div className="col-span-full text-center py-10 text-gray-500">
                        No tenants found matching criteria.
                    </div>
                )}
                {paginatedTenants.length < filteredTenants.length && (
                    <div className="col-span-full flex justify-center py-6">
                        <button
                            onClick={() => setCurrentPage(p => p + 1)}
                            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition shadow"
                        >
                            Load More
                        </button>
                    </div>
                )}
            </div>}
        </div>
    );
};

export default ActiveTenants;
