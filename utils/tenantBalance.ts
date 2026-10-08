import type { TenantProfile } from '../types';
import { calculateProratedFirstMonthRent, getTenantProrationAnchor, getTenantRentStartAnchor } from './tenantPaymentCycle';
import { parsePaymentAmount } from './paymentReporting';
import { isLateFeeType } from './lateFees';
import { getProratedDepositInstallmentDueForMonth } from './proratedDepositAllocation';
import { computeTenantArrears } from './tenantArrears';
import { getCurrentMonthIso } from './timezone';


/**
 * Shared balance computation used by both the Active Tenants card and the
 * Balance Overview detail view so the displayed Total Due / Advance is
 * always identical.
 */

function isBackdatedPaymentEntry(payment: any): boolean {
    return payment?.status === 'Paid' && (
        String(payment?.method || '') === 'Backdated Opening Balance'
        || String(payment?.method || '') === 'Backdated Rent Payment'
        || String(payment?.method || '') === 'Backdated Deposit Payment'
        || String(payment?.reference || '').startsWith('BACKFILL-')
        || String(payment?.reference || '').startsWith('DEPOSIT-BACKFILL-')
    );
}

function monthDiff(fromIso: string, toIso: string): number {
    // returns number of full months from fromIso (YYYY-MM) up to (but not including) toIso
    const [fy, fm] = fromIso.split('-').map(Number);
    const [ty, tm] = toIso.split('-').map(Number);
    if (!fy || !fm || !ty || !tm) return 0;
    return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

function getDepositExpectedStandard(tenant: TenantProfile): number {
    const months = Number((tenant as any).depositMonths ?? 1);
    const m = Number.isFinite(months) && months > 0 ? months : 1;
    return Number((tenant as any).depositExpected ?? 0) > 0
        ? Number((tenant as any).depositExpected)
        : (Number(tenant.rentAmount || 0) * m);
}

/**
 * Approximate the rent + deposit that should have been invoiced from
 * activation through the END of the month immediately BEFORE `monthIso`.
 * Used to derive any prior-month surplus (advance carry-over).
 *
 * Advance = surplus only. A payment that settled a prior-month bill,
 * fine, deposit or rent obligation is consumed first; only true overflow
 * carries forward as "Advance from prior months".
 */
export function expectedThroughPriorMonth(tenant: TenantProfile, monthIso: string): number {
    const anchor = getTenantRentStartAnchor(tenant);
    const anchorMonth = anchor ? String(anchor).slice(0, 7) : null;
    const hasPriorRentMonths = !!anchorMonth && anchorMonth < monthIso;
    const fullMonthsBefore = hasPriorRentMonths ? monthDiff(anchorMonth!, monthIso) : 0;

    // Rent invoiced in prior months (zero when rent hasn't yet started by `monthIso`).
    let rentInvoicedPrior = 0;
    let recurringInvoicedPrior = 0;
    if (hasPriorRentMonths && fullMonthsBefore > 0) {
        const firstStored = Number((tenant as any).firstMonthRent || 0);
        const firstMonthRent = firstStored > 0
            ? firstStored
            : calculateProratedFirstMonthRent(Number(tenant.rentAmount || 0), getTenantProrationAnchor(tenant));
        const baseRent = Number(tenant.rentAmount || 0);
        rentInvoicedPrior = firstMonthRent + Math.max(0, fullMonthsBefore - 1) * baseRent;

        const recurringMonthly = (Object.values(tenant.recurringBills || {}) as Array<number | undefined>)
            .reduce((a, b) => a + Number(b || 0), 0);
        recurringInvoicedPrior = recurringMonthly * fullMonthsBefore;
    }

    // Deposit is invoiced at REGISTRATION (not tied to rent months). When
    // there are NO prior rent months (i.e. activation/registration is this
    // same month), the deposit is invoiced in the CURRENT month — and the
    // current-month `totalInvoiced` already includes the unpaid remainder
    // via computeTenantTotalInvoicedForMonth. Counting it here too would
    // double-charge and inflate Total Due. Only treat the deposit as a
    // PRIOR obligation when rent actually started in a prior month.
    let depositInvoicedPrior = 0;
    if (hasPriorRentMonths && !tenant.depositExempt && !tenant.rentExtension?.enabled) {
        if (tenant.proratedDeposit?.enabled) {
            const [ay, am] = (anchorMonth || monthIso).split('-').map(Number);
            for (let i = 0; i < fullMonthsBefore; i++) {
                const dt = new Date(ay, am - 1 + i, 1);
                const mIso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
                depositInvoicedPrior += getProratedDepositInstallmentDueForMonth(tenant, mIso);
            }
        } else {
            depositInvoicedPrior = getDepositExpectedStandard(tenant);
        }
    }

    // Bills + fines dated before `monthIso` are obligations already owed.
    const billsInvoicedPrior = (tenant.outstandingBills || []).reduce((s, b) => {
        const d = String(b.date || '');
        if (!d || d.slice(0, 7) >= monthIso) return s;
        if (b.type === 'Rent Arrears' && String(b.id || '').startsWith('bill-backfill-')) return s;
        if (String(b.id || '').startsWith('ADVANCE-')) return s;
        if (String(b.id || '').startsWith('DEPOSIT-INST-')) return s;
        return s + Number(b.amount || 0);
    }, 0);
    const finesInvoicedPrior = (tenant.outstandingFines || []).reduce((s, f) => {
        const d = String(f.date || '');
        if (!d || d.slice(0, 7) >= monthIso) return s;
        return s + Number(f.amount || 0);
    }, 0);

    // Utility deposits: required at registration. Same rule as the main
    // deposit — only treat as a prior obligation when rent already started
    // in a prior month; otherwise it sits inside this month's totalInvoiced.
    const utilityDepositPrior = hasPriorRentMonths ? (['waterDeposit', 'electricityDeposit'] as const).reduce((sum, key) => {
        const d = (tenant as any)[key] as { required?: boolean; exempt?: boolean; amount?: number } | undefined;
        if (!d?.required || d?.exempt) return sum;
        return sum + Number(d.amount || 0);
    }, 0) : 0;


    return rentInvoicedPrior
        + depositInvoicedPrior
        + recurringInvoicedPrior
        + billsInvoicedPrior
        + finesInvoicedPrior
        + utilityDepositPrior;
}

export interface TenantMonthlyBalance {
    totalInvoiced: number;
    backdatedPayments: number;
    amountPaidThisMonth: number;
    advanceFromPriorMonths: number;
    balanceDue: number;        // negative => credit/advance
    isCredit: boolean;
    creditAmount: number;
}

export function getSingleAdvanceFromPriorMonths(
    tenant: TenantProfile,
    monthIso: string,
): number {
    const anchor = getTenantRentStartAnchor(tenant);
    if (!anchor) return 0;
    const startMonth = anchor.slice(0, 7);
    if (monthIso < startMonth) return 0;

    const history = tenant.paymentHistory || [];
    const backdatedPayments = history.reduce((sum, p) => {
        if (!isBackdatedPaymentEntry(p)) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);

    // Payments received BEFORE the onboarding / rent-start month are advance
    // payments: they must surface as credit in the onboarding month itself.
    const preStartPayments = history.reduce((sum, p: any) => {
        if (isBackdatedPaymentEntry(p) || p.status !== 'Paid') return sum;
        const ds = String(p.date || '').slice(0, 7);
        if (!ds || ds >= startMonth) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);

    let currentMonth = startMonth;
    let carry = backdatedPayments + preStartPayments;

    while (currentMonth < monthIso) {
        const totalInvoiced = computeTenantTotalInvoicedForMonth(tenant, currentMonth);
        const amountPaidThisMonth = history.reduce((sum, p: any) => {
            if (isBackdatedPaymentEntry(p) || p.status !== 'Paid') return sum;
            if (!String(p.date || '').startsWith(currentMonth)) return sum;
            return sum + parsePaymentAmount(p.amount);
        }, 0);

        carry = carry + amountPaidThisMonth - totalInvoiced;

        const [y, m] = currentMonth.split('-').map(Number);
        const nextDt = new Date(y, m, 1);
        currentMonth = `${nextDt.getFullYear()}-${String(nextDt.getMonth() + 1).padStart(2, '0')}`;
    }

    return Math.max(0, carry);
}


/**
 * Compute the balance figures for `tenant` for the supplied YYYY-MM month.
 * Returns the same totals shown in the Balance Overview so the Active
 * Tenants card can mirror them.
 */
export function computeTenantMonthlyBalance(
    tenant: TenantProfile,
    monthIso: string,
    overrides?: { totalInvoiced?: number },
): TenantMonthlyBalance {
    const history = tenant.paymentHistory || [];

    const backdatedPayments = history.reduce((sum, p) => {
        if (!isBackdatedPaymentEntry(p)) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);

    const amountPaidThisMonth = history.reduce((sum, p: any) => {
        if (isBackdatedPaymentEntry(p) || p.status !== 'Paid') return sum;
        if (!String(p.date || '').startsWith(monthIso)) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);

    // Compute advance carry-over using robust sequential simulation of prior months
    const advanceFromPriorMonths = getSingleAdvanceFromPriorMonths(tenant, monthIso);

    const totalInvoiced = overrides?.totalInvoiced ?? 0;

    const balanceDue = totalInvoiced - amountPaidThisMonth - advanceFromPriorMonths;
    const isCredit = balanceDue < 0;
    const creditAmount = isCredit ? Math.abs(balanceDue) : 0;

    return {
        totalInvoiced,
        backdatedPayments: 0,
        amountPaidThisMonth,
        advanceFromPriorMonths,
        balanceDue,
        isCredit,
        creditAmount,
    };
}

/**
 * Compute the "Total Invoiced" figure for the current month (rent + deposit
 * installment/full + recurring + bills + fines + late fee + utility
 * deposits). Shared by detail view and card so they always match.
 */
export function computeTenantTotalInvoicedForMonth(
    tenant: TenantProfile,
    monthIso: string,
    opts: {
        automatedLateFine?: number;
    } = {},
): number {
    const anchor = getTenantRentStartAnchor(tenant);
    const activationMonth = anchor ? String(anchor).slice(0, 7) : null;
    const isActivationMonth = activationMonth === monthIso;
    const rentStartsInFutureMonth = !!activationMonth && activationMonth > monthIso;

    const firstStored = Number((tenant as any).firstMonthRent || 0);
    const rent = rentStartsInFutureMonth
        ? 0
        : isActivationMonth
            ? (firstStored > 0
                ? firstStored
                : calculateProratedFirstMonthRent(Number(tenant.rentAmount || 0), getTenantProrationAnchor(tenant)))
            : Number(tenant.rentAmount || 0);

    let nextMonthPrepayTotal = 0;

    // Deposit is invoiced at registration regardless of when rent starts.
    // Even when rent starts in a future month, the deposit is owed now —
    // otherwise the deposit portion of the registration payment would be
    // mislabeled as advance/credit instead of settling the deposit.
    let deposit = 0;
    if (!tenant.depositExempt) {
        // Sum payments dated BEFORE this month — used to detect whether the
        // deposit was already fully settled in a prior billing month. If so,
        // it no longer belongs on this month's invoice (the deposit tracking
        // card surfaces it elsewhere). If only partly cleared, only the
        // remaining-after-prior gross is invoiced so the offsetting payment
        // recorded this month has a matching line.
        const priorPaid = (tenant.paymentHistory || [])
            .filter(p => p.status === 'Paid' && p.date && p.date < monthIso && !isBackdatedPaymentEntry(p))
            .reduce((s, p) => s + parsePaymentAmount(p.amount), 0);

        if (tenant.proratedDeposit?.enabled) {
            deposit = getProratedDepositInstallmentDueForMonth(tenant, monthIso);
        } else {
            const anchor = getTenantRentStartAnchor(tenant);
            const activationMonth = anchor ? String(anchor).slice(0, 7) : null;
            const expected = Math.max(getDepositExpectedStandard(tenant), Number((tenant as any).depositPaid || 0));

            if (activationMonth && monthIso > activationMonth) {
                // Already invoiced in activation month, handled via arrears
                deposit = 0;
            } else if (activationMonth && monthIso === activationMonth) {
                deposit = expected;
            } else {
                // Legacy / missing anchor fallback
                const depositPaidPrior = Math.min(priorPaid, expected, Number((tenant as any).depositPaid || 0));
                const cleared = expected > 0 && depositPaidPrior + 0.5 >= expected;
                deposit = cleared ? 0 : Math.max(0, expected - depositPaidPrior);
            }
        }
    }

    const todayMonthStr = getCurrentMonthIso();
    const isFutureMonth = monthIso > todayMonthStr;

    const hasPersistedCurrentLateFee = (tenant.outstandingBills || []).some(
        b => b.status === 'Pending' && b.type === 'Late Fee' && (!b.date || String((b as any).date || '').startsWith(monthIso))
    ) || (tenant.outstandingFines || []).some(
        f => isLateFeeType(f.type) && f.status === 'Pending' && (!f.date || String((f as any).date || '').startsWith(monthIso))
    );

    const recurring = (Object.values(tenant.recurringBills || {}) as Array<number | undefined>)
        .reduce((a, b) => a + Number(b || 0), 0);
    // Exclude legacy backfilled "Rent Arrears" bills — prior-month arrears
    // are computed dynamically by computeTenantArrears, so counting these
    // bills here double-charges existing tenants for the same balance.
    const pendingBills = isFutureMonth ? 0 : (tenant.outstandingBills || [])
        .filter(b => b.status === 'Pending')
        .filter(b => b.type !== 'Rent Arrears' && b.type !== 'Rent')
        // Exclude future-month advance bills — they belong to the
        // forward ladder, not to the current month's invoice.
        .filter(b => !String(b.id || '').startsWith('ADVANCE-'))
        // Exclude synthesised deposit-installment ledger bills
        .filter(b => !String(b.id || '').startsWith('DEPOSIT-INST-'))
        // Exclude LATEFEE-* invoices for the CURRENT month — current
        // month late fee is handled via the dedicated automatedLateFine prop,
        // EXCEPT when there is a persisted current late fee in which case we include it.
        .filter(b => {
            const isCurrentLateFeeBill = b.type === 'Late Fee' && (!b.date || String((b as any).date || '').startsWith(monthIso));
            if (isCurrentLateFeeBill) {
                return hasPersistedCurrentLateFee;
            }
            if (String(b.id || '').startsWith('LATEFEE-')) {
                return hasPersistedCurrentLateFee;
            }
            return true;
        })
        // Exclude any bills from future months relative to monthIso
        .filter(b => !b.date || b.date.slice(0, 7) <= monthIso)
        .reduce((s, b) => s + b.amount, 0);
    const pendingFines = isFutureMonth ? 0 : (tenant.outstandingFines || [])
        .filter(f => f.status === 'Pending')
        // Exclude current month late fee fines if we are using the automated late fine
        .filter(f => {
            if (isLateFeeType(f.type)) {
                const isCurrent = !f.date || String((f as any).date || '').startsWith(monthIso);
                if (isCurrent) {
                    return hasPersistedCurrentLateFee;
                }
                return true;
            }
            return true;
        })
        // Exclude any fines from future months relative to monthIso
        .filter(f => !f.date || f.date.slice(0, 7) <= monthIso)
        .reduce((s, f) => s + f.amount, 0);


    const waterDeposit = isFutureMonth ? 0 : (() => {
        const d = (tenant as any).waterDeposit as { required?: boolean; exempt?: boolean; amount?: number; paid?: number } | undefined;
        if (!d?.required || d?.exempt) return 0;
        return Math.max(0, (d.amount || 0) - (d.paid || 0));
    })();
    const electricityDeposit = isFutureMonth ? 0 : (() => {
        const d = (tenant as any).electricityDeposit as { required?: boolean; exempt?: boolean; amount?: number; paid?: number } | undefined;
        if (!d?.required || d?.exempt) return 0;
        return Math.max(0, (d.amount || 0) - (d.paid || 0));
    })();

    const finalLateFine = isFutureMonth ? 0 : (hasPersistedCurrentLateFee ? 0 : (opts.automatedLateFine || 0));

    return rent + nextMonthPrepayTotal + recurring + pendingBills + pendingFines + finalLateFine
        + deposit + waterDeposit + electricityDeposit;
}
