import type { TenantProfile, BillItem } from '../types';
import { getTenantRentStartAnchor } from './tenantPaymentCycle';

/**
 * Future-month advance allocation.
 *
 * Instead of surfacing overpayment as a flat "Advance from prior months"
 * credit, we walk forward from the current month and pay down each future
 * month's expected charges with the surplus pool. Fully covered months
 * become `Paid` bills; the first remainder month gets a `Pending` bill
 * tagged with `partialPaid` so the card can render "Partial payment for
 * Oct (KES 2,000)".
 *
 * The bills produced here use deterministic IDs prefixed `ADVANCE-` so a
 * subsequent re-run wipes the prior ladder and rebuilds it in place —
 * keeping the tenant blob consistent after edits/deletions.
 */

export const ADVANCE_BILL_PREFIX = 'ADVANCE-';
export const ADVANCE_MAX_MONTHS = 24;

export interface AdvanceMonthCharge {
    monthIso: string;
    monthLabel: string;
    monthShort: string;
    rent: number;
    recurring: number;
    depositInstallment: number;
    totalExpected: number;
    applied: number;
    fullyCovered: boolean;
    startingSurplus: number;
    remainingSurplus: number;
    /** How much of `applied` covered each sub-unit's expected charges. */
    perUnitApplied?: Record<string, number>;
    /** How much of `applied` covered the main tenant's rent. */
    mainRentApplied?: number;
}

export interface AdvanceAllocationResult {
    months: AdvanceMonthCharge[];
    paidUpToMonth: string | null;       // YYYY-MM of last fully-covered future month
    paidUpToLabel: string | null;       // human label e.g. "September 2026"
    partial: {
        monthIso: string;
        monthLabel: string;
        monthShort: string;
        amount: number;                 // partial amount applied
        expected: number;               // full expected for that month
    } | null;
    surplusRemaining: number;
    bills: BillItem[];                  // future-month bills with ADVANCE- ids
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

function addMonths(iso: string, n: number): string {
    const [y, m] = iso.split('-').map(Number);
    const dt = new Date(y, (m - 1) + n, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelFor(iso: string): { label: string; short: string } {
    const [y, m] = iso.split('-').map(Number);
    const short = MONTH_NAMES[m - 1];
    return { label: `${short} ${y}`, short };
}

function getProratedInstallmentRemainingMonths(t: TenantProfile, fromMonthIso: string): number {
    const pd = t.proratedDeposit;
    if (!pd?.enabled) return 0;
    if (pd.amountPaidSoFar + 0.5 >= pd.totalDepositAmount) return 0;
    const anchor = getTenantRentStartAnchor(t);
    if (!anchor) return 0;
    const anchorMonth = String(anchor).slice(0, 7);
    const [ay, am] = anchorMonth.split('-').map(Number);
    const [cy, cm] = fromMonthIso.split('-').map(Number);
    const monthsSinceAnchor = Math.max(0, (cy - ay) * 12 + (cm - am));
    const duration = Number(pd.durationMonths || 0);
    return Math.max(0, duration - monthsSinceAnchor);
}

export interface SubUnitExpectedForAdvance {
    tenantId: string;
    expected: number;
}

export function computeAdvanceAllocation(
    tenant: TenantProfile,
    surplus: number,
    currentMonthIso: string,
    subUnitsInvoicedTotal: number = 0,
    subUnitsBreakdown: SubUnitExpectedForAdvance[] = [],
): AdvanceAllocationResult {
    const empty: AdvanceAllocationResult = {
        months: [],
        paidUpToMonth: null,
        paidUpToLabel: null,
        partial: null,
        surplusRemaining: 0,
        bills: [],
    };
    let pool = Math.max(0, Math.round(Number(surplus) || 0));
    if (pool <= 0) return empty;

    const baseRent = Number(tenant.rentAmount || 0);
    const recurringMonthly = (Object.values(tenant.recurringBills || {}) as Array<number | undefined>)
        .reduce((a, b) => a + Number(b || 0), 0);
    const pd = tenant.proratedDeposit;
    const installment = pd?.enabled ? Number(pd.monthlyInstallment || 0) : 0;

    // Prefer explicit per-sub breakdown when the caller supplied it; fall back
    // to the aggregate so existing callers keep working.
    const hasSubBreakdown = Array.isArray(subUnitsBreakdown) && subUnitsBreakdown.length > 0;
    const subAggregate = hasSubBreakdown
        ? subUnitsBreakdown.reduce((s, r) => s + Math.max(0, Number(r.expected || 0)), 0)
        : Math.max(0, Number(subUnitsInvoicedTotal || 0));

    const months: AdvanceMonthCharge[] = [];
    const bills: BillItem[] = [];
    let paidUpToMonth: string | null = null;
    let partial: AdvanceAllocationResult['partial'] = null;

    for (let i = 1; i <= ADVANCE_MAX_MONTHS; i++) {
        if (pool <= 0) break;
        const monthIso = addMonths(currentMonthIso, i);
        const remainingInstMonths = getProratedInstallmentRemainingMonths(tenant, monthIso);
        const depInst = remainingInstMonths > 0 ? installment : 0;
        const totalExpected = baseRent + recurringMonthly + depInst + subAggregate;
        if (totalExpected <= 0) break;

        const { label, short } = monthLabelFor(monthIso);
        const startingSurplus = pool;
        const applied = Math.min(pool, totalExpected);
        pool -= applied;
        const fully = applied + 0.5 >= totalExpected;

        // Waterfall the per-month `applied` across sub-units first (oldest
        // arrears-first ordering handled by the caller), then main rent, then
        // recurring, then deposit installment. This lets the UI report a
        // truthful `Paid` / `Partial` / `Unpaid` badge per sub-unit for
        // future months.
        let remaining = applied;
        const perUnitApplied: Record<string, number> = {};
        if (hasSubBreakdown) {
            for (const s of subUnitsBreakdown) {
                const need = Math.max(0, Number(s.expected || 0));
                const take = Math.min(remaining, need);
                perUnitApplied[s.tenantId] = take;
                remaining -= take;
            }
        }
        const mainApplied = Math.min(remaining, baseRent);
        remaining -= mainApplied;

        months.push({
            monthIso, monthLabel: label, monthShort: short,
            rent: baseRent, recurring: recurringMonthly, depositInstallment: depInst,
            totalExpected, applied, fullyCovered: fully,
            startingSurplus, remainingSurplus: pool,
            perUnitApplied,
            mainRentApplied: mainApplied,
        });

        if (fully) {
            paidUpToMonth = monthIso;
            bills.push({
                id: `${ADVANCE_BILL_PREFIX}${monthIso}-FULL-${tenant.id}`,
                type: 'Future Rent (Prepaid)',
                description: `Prepaid for ${label}`,
                amount: totalExpected,
                date: `${monthIso}-01`,
                status: 'Paid',
            });
        } else {
            partial = { monthIso, monthLabel: label, monthShort: short, amount: applied, expected: totalExpected };
            bills.push({
                id: `${ADVANCE_BILL_PREFIX}${monthIso}-PARTIAL-${tenant.id}`,
                type: 'Future Rent (Partial Prepaid)',
                description: `Partial prepayment for ${short} — KES ${applied.toLocaleString()} of KES ${totalExpected.toLocaleString()}`,
                amount: totalExpected - applied,
                date: `${monthIso}-01`,
                status: 'Pending',
            });
            break;
        }
    }

    const paidUpToLabel = paidUpToMonth ? monthLabelFor(paidUpToMonth).label : null;

    return { months, paidUpToMonth, paidUpToLabel, partial, surplusRemaining: pool, bills };
}

/**
 * Format the "Rent paid up to …" status line shown on tenant cards.
 * Returns empty string when there's nothing to communicate.
 */
export function formatPaidUpToStatus(result: Pick<AdvanceAllocationResult, 'paidUpToLabel' | 'partial'>): string {
    const parts: string[] = [];
    if (result.paidUpToLabel) parts.push(`Rent paid up to ${result.paidUpToLabel}`);
    if (result.partial) {
        parts.push(`Partial payment for ${result.partial.monthShort} (KES ${Math.round(result.partial.amount).toLocaleString()})`);
    }
    return parts.join(' · ');
}

/** Merge new advance bills into existing outstandingBills, replacing any prior ADVANCE-* entries. */
export function mergeAdvanceBills(existing: BillItem[] | undefined, advance: BillItem[]): BillItem[] {
    const kept = (existing || []).filter(b => !String(b.id || '').startsWith(ADVANCE_BILL_PREFIX));
    return [...kept, ...advance];
}

/** True if a bill is one of the materialised future-month advance bills. */
export function isAdvanceBill(bill: Pick<BillItem, 'id'>): boolean {
    return String(bill?.id || '').startsWith(ADVANCE_BILL_PREFIX);
}

/**
 * Total credit currently sitting in the ADVANCE-* future-month ladder.
 * Used when a new bill is created (e.g. a fine or late fee accrues) so
 * existing advance can be redirected to pay the new invoice per the
 * project-wide deduction rule "previous advance payment can pay any
 * invoice".
 *
 * This sums:
 *   • `amount` of every ADVANCE-*-FULL bill (full month rent + recurring
 *     + installment that has been prepaid)
 *   • The `applied` portion encoded in any ADVANCE-*-PARTIAL bill's
 *     description ("Partial prepayment for Sep — KES 1,200 of KES 5,000")
 */
export function getAdvanceLadderCredit(tenant: TenantProfile): number {
    const bills = tenant.outstandingBills || [];
    let total = 0;
    for (const b of bills) {
        const id = String(b?.id || '');
        if (!id.startsWith(ADVANCE_BILL_PREFIX)) continue;
        if (id.includes('-FULL-')) {
            total += Math.max(0, Number(b.amount || 0));
            continue;
        }
        if (id.includes('-PARTIAL-')) {
            const m = String(b.description || '').match(/KES\s+([\d,.]+)\s+of/i);
            if (m) total += parseFloat(m[1].replace(/,/g, '')) || 0;
        }
    }
    return Math.max(0, Math.round(total));
}

/**
 * Strip every ADVANCE-* bill from `existing`. Use before rebuilding the
 * ladder after a posting / waterfall pass.
 */
export function stripAdvanceLadder(existing: BillItem[] | undefined): BillItem[] {
    return (existing || []).filter(b => !String(b.id || '').startsWith(ADVANCE_BILL_PREFIX));
}
