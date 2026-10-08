import type { TenantProfile } from '../types';
import {
    computeRentPaymentCycleUpdate,
    getPendingTenantPaymentAllocation,
    type PendingTenantPaymentAllocation,
    type RentPaymentCycleResult,
    getTenantRentStartAnchor,
    calculateProratedFirstMonthRent,
    getTenantProrationAnchor,
} from './tenantPaymentCycle';
import { getProratedDepositPaidThroughMonth } from './proratedDepositAllocation';
import { computeTenantCardBalance } from './tenantCardBalance';
import { computeAdvanceAllocation, mergeAdvanceBills, getAdvanceLadderCredit, stripAdvanceLadder } from './advanceAllocation';
import { buildLateFeeInvoices, mergeLateFeeInvoices } from './lateFeeInvoices';
import { consumeCreditAgainstBills } from './paymentWaterfall';
import { computeTenantArrears } from './tenantArrears';
import { computeTenantMonthlyBalance } from './tenantBalance';
import { getTodayIsoDate, getCurrentMonthIso } from './timezone';

export interface StandardTenantPaymentPostingResult {
    payment: {
        date: string;
        amount: string;
        status: 'Paid';
        method: string;
        reference: string;
    };
    cycle: RentPaymentCycleResult;
    allocation: PendingTenantPaymentAllocation;
    updates: Partial<TenantProfile>;
    canAutoActivate: boolean;
    autoActivationBlockedByApproval: boolean;
}

export function buildStandardTenantPaymentPosting(
    tenant: TenantProfile,
    amountPaid: number,
    paymentDateIso: string,
    method: string,
    reference: string,
): StandardTenantPaymentPostingResult {
    const paid = Math.max(0, Number(amountPaid || 0));
    const payDate = String(paymentDateIso || getTodayIsoDate()).trim() || getTodayIsoDate();
    const payment = {
        date: payDate,
        amount: `KES ${paid.toLocaleString()}`,
        status: 'Paid' as const,
        method,
        reference,
    };
    const normalizedReference = reference.trim().toUpperCase();
    const priorHistory = (tenant.paymentHistory || []).filter(existing =>
        String(existing.reference || '').trim().toUpperCase() !== normalizedReference
    );
    const updates: Partial<TenantProfile> = {
        paymentHistory: [payment, ...priorHistory],
    };
    const monthIso = payDate.slice(0, 7);

    // Regenerate per-month LATEFEE-* invoices first so the waterfall has targets.
    try {
        const lateFeeBuild = buildLateFeeInvoices({ ...tenant, ...updates } as TenantProfile);
        updates.outstandingBills = mergeLateFeeInvoices(tenant.outstandingBills || [], lateFeeBuild.bills);
    } catch {
        updates.outstandingBills = tenant.outstandingBills || [];
    }

    let remaining = paid;
    let rentAndDepositPool = 0;

    // 1: Deposit arrears or deposit instalment arrears
    // 2: Rent arrears
    // 3: Current month deposit
    const arr = computeTenantArrears(tenant, monthIso);
    const rentArrearsOwed = arr.items.filter(i => i.kind === 'rent').reduce((s,i) => s + i.amount, 0);
    const depInstallmentArrearsOwed = arr.items.filter(i => i.kind === 'depositInstallment').reduce((s,i) => s + i.amount, 0);
    const allocationAll = getPendingTenantPaymentAllocation(tenant, paid, payDate);
    const standardDepositOwed = allocationAll.depositOutstanding || 0;
    const proratedCurrentOwed = tenant.proratedDeposit?.enabled ? Number(tenant.proratedDeposit.monthlyInstallment || 0) : 0;
    
    const needed123 = depInstallmentArrearsOwed + standardDepositOwed + proratedCurrentOwed + rentArrearsOwed;
    const take123 = Math.min(remaining, needed123);
    rentAndDepositPool += take123;
    remaining -= take123;

    // 4, 5, 6: Bills, Late Fee, Fines Arrears
    try {
        const projectedArrears: TenantProfile = {
            ...tenant,
            ...updates,
            outstandingBills: updates.outstandingBills,
            paymentHistory: updates.paymentHistory || tenant.paymentHistory,
        } as TenantProfile;
        const waterfallArrears = consumeCreditAgainstBills(projectedArrears, remaining, monthIso, 'arrears', payDate);
        updates.outstandingBills = waterfallArrears.outstandingBills;
        (updates as any).outstandingFines = waterfallArrears.outstandingFines;
        (updates as any).lateFeePaidByMonth = waterfallArrears.lateFeePaidByMonth;
        remaining = waterfallArrears.creditRemaining;

        // Refresh LATEFEE-* partially paid state
        const refreshedArr = buildLateFeeInvoices({
            ...projectedArrears,
            outstandingBills: updates.outstandingBills,
            lateFeePaidByMonth: waterfallArrears.lateFeePaidByMonth,
        } as TenantProfile);
        updates.outstandingBills = mergeLateFeeInvoices(updates.outstandingBills, refreshedArr.bills);
    } catch {}

    // 7: Current Rent
    const monthlyBal = computeTenantMonthlyBalance(tenant, monthIso);
    
    // Calculate current month's rent invoiced
    const rentStartsAnchor = getTenantRentStartAnchor(tenant);
    const rentStartsMonthIso = rentStartsAnchor ? String(rentStartsAnchor).slice(0, 7) : null;
    const isActMonth = rentStartsMonthIso === monthIso;
    const rentStartsFuture = !!rentStartsMonthIso && rentStartsMonthIso > monthIso;
    
    const firstMonthStored = Number((tenant as any).firstMonthRent || 0);
    const rentInvoiced = rentStartsFuture
        ? 0
        : isActMonth
            ? (firstMonthStored > 0
                ? firstMonthStored
                : calculateProratedFirstMonthRent(Number(tenant.rentAmount || 0), getTenantProrationAnchor(tenant)))
            : Number(tenant.rentAmount || 0);

    // Calculate how much has already been paid towards rent so far
    const depMonths = Number.isFinite(Number((tenant as any).depositMonths)) && Number((tenant as any).depositMonths) > 0
        ? Number((tenant as any).depositMonths)
        : 1;
    const depositExpectedStandard = Number((tenant as any).depositExpected ?? 0) > 0
        ? Number((tenant as any).depositExpected)
        : Math.max(0, Number(tenant.rentAmount || 0) * depMonths);

    const depositOwedAtStart = tenant.depositExempt
        ? 0
        : (tenant.proratedDeposit?.enabled
            ? ((tenant.proratedDeposit.amountPaidSoFar || 0) + 0.5 >= (tenant.proratedDeposit.totalDepositAmount || 0)
                ? 0
                : (tenant.proratedDeposit.monthlyInstallment || 0))
            : Math.max(0, depositExpectedStandard - Math.max(0, Number(tenant.depositPaid || 0))));

    const availableForRentSoFar = Math.max(
        0,
        monthlyBal.amountPaidThisMonth + monthlyBal.advanceFromPriorMonths - depositOwedAtStart
    );

    const currentRentUnpaid = Math.max(0, rentInvoiced - availableForRentSoFar);
    const take7 = Math.min(currentRentUnpaid, remaining);
    rentAndDepositPool += take7;
    remaining -= take7;

    // 8, 9, 10: Current Bills, Late Fee, Fines
    try {
        const projectedCurrent: TenantProfile = {
            ...tenant,
            ...updates,
            outstandingBills: updates.outstandingBills,
            paymentHistory: updates.paymentHistory || tenant.paymentHistory,
        } as TenantProfile;
        const waterfallCurrent = consumeCreditAgainstBills(projectedCurrent, remaining, monthIso, 'current', payDate);
        updates.outstandingBills = waterfallCurrent.outstandingBills;
        (updates as any).outstandingFines = waterfallCurrent.outstandingFines;
        (updates as any).lateFeePaidByMonth = waterfallCurrent.lateFeePaidByMonth;
        remaining = waterfallCurrent.creditRemaining;
        
        const refreshedCur = buildLateFeeInvoices({
            ...projectedCurrent,
            outstandingBills: updates.outstandingBills,
            lateFeePaidByMonth: waterfallCurrent.lateFeePaidByMonth,
        } as TenantProfile);
        updates.outstandingBills = mergeLateFeeInvoices(updates.outstandingBills, refreshedCur.bills);
    } catch {}

    // Prepaid advance (remainder) goes to the generic Rent+Deposit pool
    rentAndDepositPool += remaining;

    // Form final math allocation for renting logic
    const totalToRentAndDeposit = rentAndDepositPool;
    const cycle = computeRentPaymentCycleUpdate(tenant, totalToRentAndDeposit, payDate);
    const allocation = getPendingTenantPaymentAllocation(tenant, totalToRentAndDeposit, payDate);
    
    updates.nextDueDate = cycle.nextDueDateIso;

    const isPendingLifecycleStatus = tenant.status === 'PendingApproval' || tenant.status === 'Pending' || tenant.status === 'PendingAllocation' || tenant.status === 'PendingPayment';
    const canAutoActivate = tenant.status === 'Pending' || tenant.status === 'PendingAllocation' || tenant.status === 'PendingPayment';

    if (!tenant.depositExempt && !tenant.proratedDeposit?.enabled && !tenant.rentExtension?.enabled && allocation.depositCreditApplied > 0) {
        updates.depositPaid = allocation.depositPaidAfterPayment;
    }
    if (isPendingLifecycleStatus && canAutoActivate) {
        // Standard cycle-based activation
        const cycleActivate = allocation.depositSettledAfterPayment && allocation.rentCoveredByPayment;

        // Onboarding-rent activation: activate as soon as the tenant's onboarding
        // month base rent (prorated first-month rent if applicable) is fully paid,
        // regardless of whether follow-up months have been paid or whether the
        // payment arrived in a later month. Deposit must also be settled (or
        // exempt / rent-extension).
        let onboardingActivate = false;
        try {
            const anchor = getTenantProrationAnchor(tenant);
            const firstStored = Number((tenant as any).firstMonthRent || 0);
            const onboardingRentExpected = firstStored > 0
                ? firstStored
                : calculateProratedFirstMonthRent(Number(tenant.rentAmount || 0), anchor);

            const historyForCalc = updates.paymentHistory || tenant.paymentHistory || [];
            const totalPaidHistory = historyForCalc.reduce((s: number, p: any) => {
                const num = Number(String(p?.amount || '').replace(/[^0-9.]/g, '')) || 0;
                return s + num;
            }, 0);
            const depositPaidAfter = Number(
                (allocation as any).depositPaidAfterPayment ?? tenant.depositPaid ?? 0
            );
            const rentPoolAfter = Math.max(0, totalPaidHistory - depositPaidAfter);
            const onboardingRentFullyPaid = onboardingRentExpected > 0
                && rentPoolAfter + 0.5 >= onboardingRentExpected;

            const depositSettled = allocation.depositSettledAfterPayment
                || !!tenant.depositExempt
                || !!tenant.rentExtension?.enabled;

            onboardingActivate = onboardingRentFullyPaid && depositSettled;
        } catch { /* fall through */ }

        if (cycleActivate || onboardingActivate) {
            updates.status = 'Active';
            (updates as any).activationDate = payDate;
        }
    }

    if (cycle.clearRentExtension && tenant.rentExtension) {
        updates.rentGraceDays = tenant.rentExtension.originalGraceDays ?? 4;
        updates.rentExtension = { ...tenant.rentExtension, enabled: false };
    }

    if (tenant.proratedDeposit?.enabled) {
        const tempTenant = {
            ...tenant,
            ...updates,
            paymentHistory: updates.paymentHistory || tenant.paymentHistory,
        } as TenantProfile;
        const amountPaidSoFar = getProratedDepositPaidThroughMonth(tempTenant, payDate.slice(0, 7));
        const installment = Number(tempTenant.proratedDeposit.monthlyInstallment || 0);
        const duration = Number(tempTenant.proratedDeposit.durationMonths || 0);
        updates.proratedDeposit = {
            ...tempTenant.proratedDeposit,
            amountPaidSoFar,
            monthsPaid: installment > 0
                ? Math.min(duration, Math.floor((amountPaidSoFar + 0.5) / installment))
                : Math.min(duration, tempTenant.proratedDeposit.monthsPaid),
        };
        updates.depositPaid = amountPaidSoFar;
    }

    // ── Advance → future-month bill ladder ────────────────────────────
    try {
        const projected: TenantProfile = {
            ...tenant,
            ...updates,
            paymentHistory: updates.paymentHistory || tenant.paymentHistory,
        } as TenantProfile;
        const projectedMonthIso = payDate.slice(0, 7);
        const card = computeTenantCardBalance(projected, projectedMonthIso, { isAllocated: true });
        const surplus = card.isCredit ? card.creditAmount : 0;
        const advance = computeAdvanceAllocation(projected, surplus, projectedMonthIso);
        const baseBills = updates.outstandingBills || tenant.outstandingBills || [];
        const merged = mergeAdvanceBills(baseBills, advance.bills);
        const beforeIds = (tenant.outstandingBills || []).filter(b => String(b.id || '').startsWith('ADVANCE-')).map(b => b.id).sort().join('|');
        const afterIds = advance.bills.map(b => b.id).sort().join('|');
        if (beforeIds !== afterIds || advance.bills.length > 0) {
            updates.outstandingBills = merged;
        }
    } catch {}

    return {
        payment,
        cycle,
        allocation,
        updates,
        canAutoActivate,
        autoActivationBlockedByApproval: isPendingLifecycleStatus && !canAutoActivate,
    };
}

/**
 * Apply unconsumed ADVANCE-* ladder credit to any currently-open
 * non-rent invoice (bills, late fees, fines) per the project-wide
 * deduction rule "previous advance payment can pay any invoice".
 *
 * Call this whenever a new invoice is created on a tenant (a fine, a
 * recurring bill, etc.) so existing prepayment is redirected to cover
 * it before being shown as "future rent prepaid".
 */
export function applyAdvanceCreditToOpenBills(tenant: TenantProfile): Partial<TenantProfile> {
    const monthIso = getCurrentMonthIso();
    const ladderCredit = getAdvanceLadderCredit(tenant);
    if (ladderCredit <= 0) return {};

    // Strip the ladder so the credit pool becomes "free" to spend.
    const billsWithoutLadder = stripAdvanceLadder(tenant.outstandingBills);
    const lateFeeBuild = buildLateFeeInvoices({
        ...tenant,
        outstandingBills: billsWithoutLadder,
    } as TenantProfile);
    const billsWithLateFees = mergeLateFeeInvoices(billsWithoutLadder, lateFeeBuild.bills);

    const projected: TenantProfile = {
        ...tenant,
        outstandingBills: billsWithLateFees,
    } as TenantProfile;
    const waterfall = consumeCreditAgainstBills(projected, ladderCredit, monthIso, 'all', `${monthIso}-01`);

    // Rebuild the advance ladder with whatever credit remains.
    const updatesProjection: TenantProfile = {
        ...projected,
        outstandingBills: waterfall.outstandingBills,
        outstandingFines: waterfall.outstandingFines,
        lateFeePaidByMonth: waterfall.lateFeePaidByMonth,
    } as TenantProfile;
    const card = computeTenantCardBalance(updatesProjection, monthIso, { isAllocated: true });
    const surplus = card.isCredit ? card.creditAmount : waterfall.creditRemaining;
    const newLadder = computeAdvanceAllocation(updatesProjection, surplus, monthIso);
    const finalBills = mergeAdvanceBills(waterfall.outstandingBills, newLadder.bills);

    return {
        outstandingBills: finalBills,
        outstandingFines: waterfall.outstandingFines,
        ...(Object.keys(waterfall.lateFeePaidByMonth).length
            ? { lateFeePaidByMonth: waterfall.lateFeePaidByMonth } as any
            : {}),
    };
}

/**
 * Passive onboarding-activation check.
 *
 * A tenant whose onboarding (first) month rent and deposit are already
 * fully funded should read as Active — even when the rent start date is in
 * a future month, in which case nothing is invoiced for the current month
 * and the "rent covered" test at payment time never fires.
 *
 * Returns true only for tenants sitting in an auto-activatable pending
 * state (PendingApproval is intentionally excluded — that needs a human).
 */
export function shouldAutoActivateOnboardedTenant(tenant: TenantProfile): boolean {
    const status = String(tenant.status || '');
    if (status !== 'Pending' && status !== 'PendingAllocation' && status !== 'PendingPayment') return false;
    if ((tenant as any).occupancyType === 'Sub') return false;

    try {
        const today = getTodayIsoDate();
        const allocation = getPendingTenantPaymentAllocation(tenant, 0, today);

        const depositSettled = allocation.depositSettledAfterPayment
            || !!tenant.depositExempt
            || !!tenant.rentExtension?.enabled;
        if (!depositSettled) return false;

        const anchor = getTenantProrationAnchor(tenant);
        const firstStored = Number((tenant as any).firstMonthRent || 0);
        const onboardingRentExpected = firstStored > 0
            ? firstStored
            : calculateProratedFirstMonthRent(Number(tenant.rentAmount || 0), anchor);
        if (onboardingRentExpected <= 0) return false;

        const history = tenant.paymentHistory || [];
        if (history.length === 0) return false;
        const totalPaid = history.reduce((s: number, p: any) => {
            return s + (Number(String(p?.amount ?? '').replace(/[^0-9.]/g, '')) || 0);
        }, 0);
        const depositPaid = Number((allocation as any).depositPaidAfterPayment ?? tenant.depositPaid ?? 0);
        const rentPool = Math.max(0, totalPaid - depositPaid);

        return rentPool + 0.5 >= onboardingRentExpected;
    } catch {
        return false;
    }
}
