import type { TenantProfile } from '../types';
import { computeTenantArrears } from './tenantArrears';
import {
    computeTenantMonthlyBalance,
    computeTenantTotalInvoicedForMonth,
} from './tenantBalance';
import {
    calculateProratedFirstMonthRent,
    getTenantProrationAnchor,
    getTenantRentStartAnchor,
} from './tenantPaymentCycle';
import { parsePaymentAmount } from './paymentReporting';
import {
    computeAdvanceAllocation,
    formatPaidUpToStatus,
    type AdvanceAllocationResult,
} from './advanceAllocation';
import { isLateFeeType } from './lateFees';
import { getProratedDepositInstallmentDueForMonth } from './proratedDepositAllocation';
import { getCurrentMonthIso } from './timezone';

/**
 * Single source of truth for the "Total Due" figure displayed on every
 * tenant-facing card (Active Tenants card, Applications card, User App
 * Portal > Tenant Portal > Rent Balance).
 *
 * The formula here mirrors the Active Tenants > Balance Overview > Total
 * Due exactly, so cards across the app stay reconciled.
 */

export interface TenantCardLineItem {
    key: string;
    label: string;
    amount: number;
    category: 'rent' | 'arrears' | 'bill' | 'fine' | 'deposit' | 'late' | 'payment' | 'recurring';
}

export interface TenantCardBalance {
    totalDue: number;
    isCredit: boolean;
    creditAmount: number;
    lineItems: TenantCardLineItem[];
    totalInvoiced: number;
    paymentsApplied: number;
    /** Split-out payment breakdown mirroring Active Tenants > Balance Overview. */
    amountPaidThisMonth: number;
    rentBackdatedApplied: number;
    depositBackdatedApplied: number;
    advanceFromPriorMonths: number;
    /** "Rent paid up to …" status surfaced when surplus rolls forward. */
    paidUpToMonth: string | null;
    paidUpToLabel: string | null;
    partialNextMonth: AdvanceAllocationResult['partial'];
    paidUpToStatus: string;
}

function isBackdatedPaymentEntry(p: any): boolean {
    return p?.status === 'Paid' && (
        String(p?.method || '') === 'Backdated Opening Balance'
        || String(p?.method || '') === 'Backdated Rent Payment'
        || String(p?.method || '') === 'Backdated Deposit Payment'
        || String(p?.reference || '').startsWith('BACKFILL-')
        || String(p?.reference || '').startsWith('DEPOSIT-BACKFILL-')
    );
}

function getExistingTenantBackdatedDepositPaid(t: TenantProfile, monthPrefix: string): number {
    const explicitDepositBackfill = (t.paymentHistory || []).reduce((sum, p) => {
        if (p?.status !== 'Paid') return sum;
        if (!String(p?.reference || '').startsWith('DEPOSIT-BACKFILL-')) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);
    const setupDeposit = Number((t as any).existingTenantSetup?.depositAlreadyPaid || 0);
    const normalPaidThisMonth = (t.paymentHistory || []).reduce((sum, p) => {
        if (isBackdatedPaymentEntry(p) || p.status !== 'Paid') return sum;
        if (!String(p.date || '').startsWith(monthPrefix)) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);
    const legacyFallback = normalPaidThisMonth > 0 ? 0 : Number(t.depositPaid || 0);
    return Math.max(explicitDepositBackfill, setupDeposit, legacyFallback);
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
        .filter(p => p.status === 'Paid' && p.date && p.date < monthPrefix && !isBackdatedPaymentEntry(p))
        .reduce((sum, p) => sum + parsePaymentAmount(p.amount), 0);
    const depositPaidPriorMonths = t.proratedDeposit?.enabled
        ? Math.min(t.proratedDeposit.amountPaidSoFar || 0, t.proratedDeposit.totalDepositAmount)
        : Math.min(amountPaidBeforeMonth, depositExpectedStandard, Number(t.depositPaid || 0));
    const depositClearedBeforeMonth = t.proratedDeposit?.enabled
        ? (t.proratedDeposit.amountPaidSoFar + 0.5 >= t.proratedDeposit.totalDepositAmount)
        : (depositExpectedStandard > 0 && depositPaidPriorMonths + 0.5 >= depositExpectedStandard);
    if (depositClearedBeforeMonth) return 0;
    if (t.proratedDeposit?.enabled) {
        return getProratedDepositInstallmentDueForMonth(t, monthPrefix);
    }
    return Math.max(0, depositExpectedStandard - depositPaidPriorMonths);
}

export function computeTenantCardBalance(
    tenant: TenantProfile,
    monthIso: string,
    opts: { automatedLateFine?: number; isAllocated?: boolean } = {},
): TenantCardBalance {
    const isAllocated = opts.isAllocated ?? true;
    if (!isAllocated) {
        return { totalDue: 0, isCredit: false, creditAmount: 0, lineItems: [], totalInvoiced: 0, paymentsApplied: 0, amountPaidThisMonth: 0, rentBackdatedApplied: 0, depositBackdatedApplied: 0, advanceFromPriorMonths: 0, paidUpToMonth: null, paidUpToLabel: null, partialNextMonth: null, paidUpToStatus: '' };
    }

    const todayMonthStr = getCurrentMonthIso();
    const isFutureMonth = monthIso > todayMonthStr;

    const hasPersistedCurrentLateFee = (tenant.outstandingBills || []).some(
        b => b.status === 'Pending' && b.type === 'Late Fee' && (!b.date || String((b as any).date || '').startsWith(monthIso))
    ) || (tenant.outstandingFines || []).some(
        f => isLateFeeType(f.type) && f.status === 'Pending' && (!f.date || String((f as any).date || '').startsWith(monthIso))
    );

    const automatedLateFine = isFutureMonth ? 0 : (hasPersistedCurrentLateFee ? 0 : (opts.automatedLateFine || 0));

    const arrears = isFutureMonth
        ? { items: [], totalArrears: 0, paymentsConsumedByPrior: 0, paymentsAppliedToRent: 0, paymentsAppliedToDeposit: 0, surplus: 0, totalPriorExpected: 0, totalPriorPaidPool: 0 }
        : computeTenantArrears(tenant, monthIso);

    const convoInvoicedBase = computeTenantTotalInvoicedForMonth(tenant, monthIso, { automatedLateFine });
    const depositBackdatedApplied = 0;
    const totalInvoiced = convoInvoicedBase + arrears.totalArrears;
    const bal = computeTenantMonthlyBalance(tenant, monthIso, { totalInvoiced });
    const totalDue = bal.balanceDue;
    const isCredit = totalDue < 0;
    const creditAmount = isCredit ? Math.abs(totalDue) : 0;

    const items: TenantCardLineItem[] = [];

    if (!isFutureMonth) {
        for (const a of arrears.items) {
            items.push({ key: `arr:${a.monthIso}:${a.kind}`, label: a.label, amount: a.amount, category: 'arrears' });
        }
    }

    const anchor = getTenantRentStartAnchor(tenant);
    const activationMonth = anchor ? String(anchor).slice(0, 7) : null;
    const isActivationMonth = activationMonth === monthIso;
    const rentStartsFuture = !!activationMonth && activationMonth > monthIso;
    let rentAmt = 0;
    if (!rentStartsFuture) {
        const firstStored = Number((tenant as any).firstMonthRent || 0);
        rentAmt = isActivationMonth
            ? (firstStored > 0
                ? firstStored
                : calculateProratedFirstMonthRent(Number(tenant.rentAmount || 0), getTenantProrationAnchor(tenant)))
            : Number(tenant.rentAmount || 0);
        if (rentAmt > 0) {
            items.push({
                key: 'rent',
                label: isActivationMonth ? 'Prorated Rent (this month)' : 'Monthly Rent',
                amount: rentAmt,
                category: 'rent',
            });
        }
    }

    let nextMonthPrepayTotal = 0;
    if (isActivationMonth) {
        const anchorStr = getTenantProrationAnchor(tenant);
        if (anchorStr) {
            const jd = new Date(anchorStr);
            if (!Number.isNaN(jd.getTime()) && jd.getDate() >= 26) {
                // Tenant joined >= 26th. The next month's rent + deposit installment is due NOW to activate.
                const nextMonthDt = new Date(jd.getFullYear(), jd.getMonth() + 1, 1);
                const nextMonthPrefix = `${nextMonthDt.getFullYear()}-${String(nextMonthDt.getMonth() + 1).padStart(2, '0')}`;
                const nextRent = Number(tenant.rentAmount || 0);
                if (nextRent > 0) {
                    items.push({
                         key: 'nextMonthRent',
                         label: `Next Month Rent (${nextMonthDt.toLocaleString('default', { month: 'short' })})`,
                         amount: nextRent,
                         category: 'rent',
                    });
                    nextMonthPrepayTotal += nextRent;
                }
                
                if (tenant.proratedDeposit?.enabled) {
                     const nextDeposit = getProratedDepositInstallmentDueForMonth(tenant, nextMonthPrefix);
                     if (nextDeposit > 0) {
                         items.push({
                             key: 'nextMonthDepositInst',
                             label: `Next Month Deposit Installment (${nextMonthDt.toLocaleString('default', { month: 'short' })})`,
                             amount: nextDeposit,
                             category: 'deposit',
                         });
                         nextMonthPrepayTotal += nextDeposit;
                     }
                }
            }
        }
    }

    const depositGross = getDepositInvoiceGrossForMonth(tenant, monthIso);
    if (depositGross > 0) {
        items.push({
            key: 'deposit',
            label: tenant.proratedDeposit?.enabled ? 'Deposit Installment' : 'Security Deposit',
            amount: depositGross,
            category: 'deposit',
        });
    }

    const recurring = (tenant.recurringBills || {}) as Record<string, number | undefined>;
    for (const [k, v] of Object.entries(recurring)) {
        const amt = Number(v || 0);
        if (amt > 0) {
            const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
            items.push({ key: `rec:${k}`, label: `${label} (Recurring)`, amount: amt, category: 'recurring' });
        }
    }

    for (const b of (tenant.outstandingBills || [])) {
        if (isFutureMonth) continue;
        if (b.status !== 'Pending') continue;
        if ((b.type === 'Rent Arrears' || b.type === 'Rent') && String(b.id || '').startsWith('bill-backfill-')) continue;
        if (b.type === 'Rent Arrears' || b.type === 'Rent') continue;
        // Future-month advance bills are rendered via the paidUpTo
        // status line, not as current-month invoice rows.
        if (String(b.id || '').startsWith('ADVANCE-')) continue;
        if (String(b.id || '').startsWith('DEPOSIT-INST-')) continue;
        
        // Exclude current month late fee bills if we are using the automated late fine
        const isCurrentLateFeeBill = b.type === 'Late Fee' && (!b.date || String((b as any).date || '').startsWith(monthIso));
        if (isCurrentLateFeeBill && !hasPersistedCurrentLateFee) continue;
        if (String(b.id || '').startsWith('LATEFEE-') && !hasPersistedCurrentLateFee) continue;

        // Exclude any bills from future months relative to monthIso
        if (b.date && b.date.slice(0, 7) > monthIso) continue;
        items.push({
            key: `bill:${b.id}`,
            label: b.type + (b.description ? ` — ${b.description}` : ''),
            amount: Number(b.amount || 0),
            category: 'bill',
        });
    }

    for (const f of (tenant.outstandingFines || [])) {
        if (isFutureMonth) continue;
        if (f.status !== 'Pending') continue;
        
        // Exclude late fee fines if we are using the automated late fine
        if (isLateFeeType(f.type)) {
            const isCurrent = !f.date || String((f as any).date || '').startsWith(monthIso);
            if (isCurrent && !hasPersistedCurrentLateFee) continue;
        }

        // Exclude any fines from future months relative to monthIso
        if (f.date && f.date.slice(0, 7) > monthIso) continue;
        items.push({ 
            key: `fine:${f.id}`, 
            label: f.type + (f.description ? ` (${f.description})` : ''), 
            amount: Number(f.amount || 0), 
            category: 'fine' 
        });
    }

    if (automatedLateFine > 0) {
        items.push({ key: 'lateFee', label: 'Late Fee', amount: automatedLateFine, category: 'late' });
    }

    for (const key of ['water', 'electricity'] as const) {
        if (isFutureMonth) continue;
        const d = (tenant as any)[`${key}Deposit`] as { required?: boolean; exempt?: boolean; amount?: number; paid?: number } | undefined;
        if (!d?.required || d?.exempt) continue;
        const owed = Math.max(0, (d.amount || 0) - (d.paid || 0));
        if (owed > 0) {
            items.push({
                key: `${key}Deposit`,
                label: `${key.charAt(0).toUpperCase()}${key.slice(1)} Deposit`,
                amount: owed,
                category: 'deposit',
            });
        }
    }

    const paymentsApplied = (bal.amountPaidThisMonth || 0)
        + (bal.backdatedPayments || 0)
        + (bal.advanceFromPriorMonths || 0);
    if (paymentsApplied > 0) {
        items.push({ key: 'payments', label: 'Payments Applied', amount: -paymentsApplied, category: 'payment' });
    }

    // Compute forward-month allocation from the surplus credit so the
    // card can show "Rent paid up to September 2026 · Partial payment
    // for Oct (KES 2,000)" instead of a flat advance number.
    const surplusForward = isCredit ? creditAmount : 0;
    const advance = computeAdvanceAllocation(tenant, surplusForward, monthIso);
    const paidUpToStatus = formatPaidUpToStatus(advance);

    return {
        totalDue,
        isCredit,
        creditAmount,
        lineItems: items,
        totalInvoiced,
        paymentsApplied,
        amountPaidThisMonth: bal.amountPaidThisMonth || 0,
        // Mirror Active Tenants > Balance Overview which hides separate
        // backdated lines — backdated payments are folded into the
        // "Advance from prior months" surplus and never shown as their
        // own deduction rows.
        rentBackdatedApplied: 0,
        depositBackdatedApplied: 0,
        advanceFromPriorMonths: bal.advanceFromPriorMonths || 0,
        paidUpToMonth: advance.paidUpToMonth,
        paidUpToLabel: advance.paidUpToLabel,
        partialNextMonth: advance.partial,
        paidUpToStatus,
    };
}
