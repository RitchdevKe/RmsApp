import type { TenantProfile } from '../types';
import { calculateProratedFirstMonthRent, getTenantProrationAnchor } from './tenantPaymentCycle';
import { getProratedDepositInstallmentDueForMonth, computePriorArrearsBrief } from './proratedDepositAllocation';
import { getCurrentMonthIso } from './timezone';

type PaymentLike = {
    date?: string;
    status?: string;
    amount?: string | number | null;
    allocationLines?: Array<{ monthIso?: string; amount?: number; kind?: string }>;
};

function resolvePayments(source: PaymentLike[] | Pick<TenantProfile, 'paymentHistory'>): PaymentLike[] {
    return Array.isArray(source) ? source : (source.paymentHistory || []);
}

export function parsePaymentAmount(raw: string | number | null | undefined): number {
    if (raw == null) return 0;
    if (typeof raw === 'number') return raw;
    return parseFloat(String(raw).replace(/[^0-9.]/g, '')) || 0;
}

export function getMonthPrefix(value: string | Date = new Date()): string {
    if (value instanceof Date) return value.toISOString().slice(0, 7);
    const normalized = String(value || '').trim();
    if (!normalized) return getCurrentMonthIso();
    return normalized.length >= 7 ? normalized.slice(0, 7) : new Date(normalized).toISOString().slice(0, 7);
}

export function isPaidPaymentInMonth(payment: PaymentLike | null | undefined, monthPrefix: string): boolean {
    if (!payment) return false;
    return payment.status === 'Paid' && String(payment.date || '').startsWith(monthPrefix);
}

function resolveDatePaid(item: { status?: string, datePaid?: string }, history?: any[]): string | undefined {
    if (item.status !== 'Paid') return undefined;
    if (item.datePaid) return String(item.datePaid);
    // If datePaid is missing, use the most recent Paid payment date from history as a best effort
    const paidPayments = (history || [])
        .filter(p => p.status === 'Paid' && p.date)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (paidPayments.length > 0) return String(paidPayments[0].date);
    return undefined;
}

export function getPaidPaymentsForMonth<T extends PaymentLike>(payments: T[] | undefined, monthPrefix: string): T[] {
    return (payments || []).filter(payment => isPaidPaymentInMonth(payment, monthPrefix));
}

export function sumPaidPaymentsForMonth(source: PaymentLike[] | Pick<TenantProfile, 'paymentHistory'>, monthPrefix: string): number {
    return resolvePayments(source).reduce((sum, payment: any) => {
        if (payment.status !== 'Paid') return sum;
        if (!isPaidPaymentInMonth(payment, monthPrefix)) return sum;
        return sum + parsePaymentAmount(payment.amount);
    }, 0);
}

export function sumPaidPaymentsForCurrentMonth(source: PaymentLike[] | Pick<TenantProfile, 'paymentHistory'>): number {
    return sumPaidPaymentsForMonth(source, getMonthPrefix());
}

export function hasAnyPaidPaymentForMonth(source: PaymentLike[] | Pick<TenantProfile, 'paymentHistory'>, monthPrefix: string): boolean {
    return resolvePayments(source).some(payment => isPaidPaymentInMonth(payment, monthPrefix));
}

export function getEffectiveRentForMonth(tenant: TenantProfile, monthPrefix: string): number {
    const rentStartAnchor = getTenantProrationAnchor(tenant);
    const activationMonthIso = rentStartAnchor ? String(rentStartAnchor).slice(0, 7) : null;
    const firstMonthRentStored = Number((tenant as any).firstMonthRent || 0);
    if (activationMonthIso === monthPrefix) {
        return firstMonthRentStored > 0
            ? firstMonthRentStored
            : calculateProratedFirstMonthRent(Number(tenant.rentAmount || 0), rentStartAnchor);
    }
    return Number(tenant.rentAmount || 0);
}

/**
 * Outstanding gross deposit owed at the start of `monthPrefix`. The deduction
 * order on payments is deposit-first, so this amount is absorbed by any
 * payments made this month before they can be applied to rent.
 */
export function getDepositOwedAtStartOfMonth(tenant: TenantProfile, monthPrefix: string): number {
    if ((tenant as any).depositExempt) return 0;
    const depositMonthsRaw = Number((tenant as any).depositMonths ?? 1);
    const depositMonths = Number.isFinite(depositMonthsRaw) && depositMonthsRaw > 0 ? depositMonthsRaw : 1;
    const depositPaidAmt = Number((tenant as any).depositPaid || 0);
    const depositExpected = Math.max(
        Number((tenant as any).depositExpected ?? 0) > 0
            ? Number((tenant as any).depositExpected)
            : (Number(tenant.rentAmount || 0) * depositMonths),
        depositPaidAmt,
    );
    const isBackdated = (p: any) => p?.status === 'Paid' && (
        String(p?.method || '') === 'Backdated Opening Balance'
        || String(p?.method || '') === 'Backdated Rent Payment'
        || String(p?.method || '') === 'Backdated Deposit Payment'
        || String(p?.reference || '').startsWith('BACKFILL-')
        || String(p?.reference || '').startsWith('DEPOSIT-BACKFILL-')
    );
    const paidBefore = (tenant.paymentHistory || [])
        .filter(p => p.status === 'Paid' && p.date && p.date < monthPrefix && !isBackdated(p))
        .reduce((s, p) => s + parsePaymentAmount(p.amount), 0);
    const pd = (tenant as any).proratedDeposit;
    if (pd?.enabled) {
        const cleared = (pd.amountPaidSoFar || 0) + 0.5 >= pd.totalDepositAmount;
        return cleared ? 0 : getProratedDepositInstallmentDueForMonth(tenant, monthPrefix);
    }
    const cleared = depositExpected > 0 && paidBefore + 0.5 >= depositExpected;
    return cleared ? 0 : Math.max(0, depositExpected - paidBefore);
}

export function isTenantRentCoveredForMonth(tenant: TenantProfile, monthPrefix: string): boolean {
    const prior = computePriorArrearsBrief(tenant, monthPrefix);
    
    const priorBills = (tenant.outstandingBills || []).reduce((sum, b) => {
        const isPrior = String((b as any).date || '') < monthPrefix;
        if (!isPrior) return sum;
        if (b.type === 'Rent Arrears' && String(b.id || '').startsWith('bill-backfill-')) return sum;
        if (String(b.id || '').startsWith('ADVANCE-')) return sum;
        if (String(b.id || '').startsWith('DEPOSIT-INST-')) return sum;
        const isPending = b.status === 'Pending';
        const dPaid = resolveDatePaid(b as any, tenant.paymentHistory);
        const isPaidThisMonth = b.status === 'Paid' && String(dPaid || '').startsWith(monthPrefix);
        if (!isPending && !isPaidThisMonth) return sum;
        return sum + Number(b.amount || 0);
    }, 0);

    const priorFines = (tenant.outstandingFines || []).reduce((sum, f) => {
        const isPrior = String((f as any).date || '') < monthPrefix;
        if (!isPrior) return sum;
        if (String(f.type || '').includes('Late Fee')) return sum;
        const isPending = f.status === 'Pending';
        const dPaid = resolveDatePaid(f as any, tenant.paymentHistory);
        const isPaidThisMonth = f.status === 'Paid' && String(dPaid || '').startsWith(monthPrefix);
        if (!isPending && !isPaidThisMonth) return sum;
        return sum + Number(f.amount || 0);
    }, 0);

    const priorArrears = prior.deposit + prior.rent + priorBills + priorFines;

    const paidThisMonth = sumPaidPaymentsForMonth(tenant, monthPrefix);
    const advanceApplied = getAdvanceAppliedToRentForMonth(tenant, monthPrefix);
    const depositOwed = getDepositOwedAtStartOfMonth(tenant, monthPrefix);

    const pool = paidThisMonth + advanceApplied;
    // Deposit and prior arrears are deducted first, so only the remainder can cover rent.
    const availableForRent = Math.max(0, pool - priorArrears - depositOwed);
    return availableForRent + 0.5 >= getEffectiveRentForMonth(tenant, monthPrefix);
}

/**
 * Amount of rent for `monthPrefix` that was covered by a prior-month
 * advance/prepayment ladder (ADVANCE-* bills materialised on the tenant).
 * Returns the rent-equivalent value, capped at the effective rent for the
 * month, so it can be added to cash paid this month to produce a single
 * "recognized rent payment" figure.
 */
export function getAdvanceAppliedToRentForMonth(tenant: TenantProfile, monthPrefix: string): number {
    const bills: any[] = (tenant as any).outstandingBills || [];
    if (!Array.isArray(bills) || bills.length === 0) return 0;
    const rent = getEffectiveRentForMonth(tenant, monthPrefix);
    if (rent <= 0) return 0;
    for (const b of bills) {
        const id = String(b?.id || '');
        if (!id.startsWith(`ADVANCE-${monthPrefix}-`)) continue;
        if (id.includes('-FULL-')) return rent;
        if (id.includes('-PARTIAL-')) {
            const m = String(b?.description || '').match(/KES\s+([\d,.]+)\s+of/i);
            const applied = m ? parseFloat(m[1].replace(/,/g, '')) || 0 : 0;
            return Math.min(rent, applied);
        }
    }
    return 0;
}

/**
 * Recognized rent revenue for `monthPrefix`:
 *   min(effectiveRent, cashPaidThisMonth + advanceAppliedFromPriorMonths)
 * Surplus cash above rent is excluded (it becomes next-month advance).
 */
export function getRecognizedRentForMonth(tenant: TenantProfile, monthPrefix: string): {
    rent: number;
    cashPaid: number;
    advanceApplied: number;
    recognized: number;
    status: 'Paid' | 'Partial' | 'Unpaid';
} {
    const rent = getEffectiveRentForMonth(tenant, monthPrefix);
    const prior = computePriorArrearsBrief(tenant, monthPrefix);
    
    const priorBills = (tenant.outstandingBills || []).reduce((sum, b) => {
        const isPrior = String((b as any).date || '') < monthPrefix;
        if (!isPrior) return sum;
        if (b.type === 'Rent Arrears' && String(b.id || '').startsWith('bill-backfill-')) return sum;
        if (String(b.id || '').startsWith('ADVANCE-')) return sum;
        if (String(b.id || '').startsWith('DEPOSIT-INST-')) return sum;
        const isPending = b.status === 'Pending';
        const dPaid = resolveDatePaid(b as any, tenant.paymentHistory);
        const isPaidThisMonth = b.status === 'Paid' && String(dPaid || '').startsWith(monthPrefix);
        if (!isPending && !isPaidThisMonth) return sum;
        return sum + Number(b.amount || 0);
    }, 0);

    const priorFines = (tenant.outstandingFines || []).reduce((sum, f) => {
        const isPrior = String((f as any).date || '') < monthPrefix;
        if (!isPrior) return sum;
        if (String(f.type || '').includes('Late Fee')) return sum;
        const isPending = f.status === 'Pending';
        const dPaid = resolveDatePaid(f as any, tenant.paymentHistory);
        const isPaidThisMonth = f.status === 'Paid' && String(dPaid || '').startsWith(monthPrefix);
        if (!isPending && !isPaidThisMonth) return sum;
        return sum + Number(f.amount || 0);
    }, 0);

    const priorArrears = prior.deposit + prior.rent + priorBills + priorFines;

    const cashPaid = sumPaidPaymentsForMonth(tenant, monthPrefix);
    const advanceApplied = getAdvanceAppliedToRentForMonth(tenant, monthPrefix);
    const depositOwed = getDepositOwedAtStartOfMonth(tenant, monthPrefix);

    const pool = cashPaid + advanceApplied;
    const availableForRent = Math.max(0, pool - priorArrears - depositOwed);

    const recognized = Math.min(rent, availableForRent);
    let status: 'Paid' | 'Partial' | 'Unpaid' = 'Unpaid';
    if (recognized + 0.5 >= rent && rent > 0) status = 'Paid';
    else if (recognized > 0.5) status = 'Partial';
    return { rent, cashPaid, advanceApplied, recognized, status };
}
