import type { TenantProfile } from '../types';
import { getTodayIsoDate } from './timezone';

function clampDueDay(day: number | undefined): number {
    const d = Number(day ?? 1);
    if (!Number.isFinite(d)) return 1;
    return Math.min(28, Math.max(1, Math.round(d)));
}

export function getTenantRentStartAnchor(tenant: Partial<TenantProfile>): string | null {
    const anchor = (tenant.rentStartDate || (tenant as any).activationDate || tenant.onboardingDate || '').trim();
    return anchor || null;
}

export function getTenantProrationAnchor(tenant: Partial<TenantProfile>): string | null {
    const anchor = (tenant.rentStartDate || '').trim();
    return anchor || null;
}

export function calculateProratedFirstMonthRent(baseRent: number, anchorDateStr?: string | null): number {
    const rent = Math.max(0, Number(baseRent || 0));
    if (!anchorDateStr || rent <= 0) return rent;

    const joinDate = new Date(anchorDateStr);
    if (Number.isNaN(joinDate.getTime())) return rent;

    const joinDay = joinDate.getDate();
    if (joinDay <= 10) return rent;

    const lastDayOfMonth = new Date(joinDate.getFullYear(), joinDate.getMonth() + 1, 0).getDate();
    const daysLeft = Math.max(0, lastDayOfMonth - joinDay);
    const prorated = Math.round((rent / 30) * daysLeft);
    return prorated;
}

function toIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

function addMonthsKeepingDay(base: Date, months: number, dueDay: number): Date {
    const out = new Date(base);
    out.setMonth(out.getMonth() + months);
    out.setDate(dueDay);
    out.setHours(0, 0, 0, 0);
    return out;
}

function getEffectiveRentForDate(tenant: TenantProfile, paymentDateIso: string): number {
    const rentStartAnchor = getTenantProrationAnchor(tenant);
    const anchorMonthIso = rentStartAnchor ? String(rentStartAnchor).slice(0, 7) : null;
    const paymentMonthIso = String(paymentDateIso || '').slice(0, 7);
    const firstMonthRent = Number((tenant as any).firstMonthRent || 0);
    if (anchorMonthIso === paymentMonthIso) {
        if (firstMonthRent > 0) return Math.max(0, firstMonthRent);
        return calculateProratedFirstMonthRent(Number(tenant.rentAmount || 0), rentStartAnchor);
    }
    return Math.max(0, Number(tenant.rentAmount || 0));
}

function getDepositExpected(tenant: TenantProfile): number {
    const depMonths = Number.isFinite(Number((tenant as any).depositMonths)) && Number((tenant as any).depositMonths) > 0
        ? Number((tenant as any).depositMonths)
        : 1;
    return Number((tenant as any).depositExpected ?? 0) > 0
        ? Number((tenant as any).depositExpected)
        : Math.max(0, Number(tenant.rentAmount || 0) * depMonths);
}

function parsePaidAmount(raw: string | number | null | undefined): number {
    if (raw == null) return 0;
    if (typeof raw === 'number') return raw;
    return parseFloat(String(raw).replace(/[^0-9.]/g, '')) || 0;
}

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
    const [fy, fm] = fromIso.split('-').map(Number);
    const [ty, tm] = toIso.split('-').map(Number);
    if (!fy || !fm || !ty || !tm) return 0;
    return (ty - fy) * 12 + (tm - fm);
}

function getProratedInstallmentDueAtPayment(tenant: TenantProfile, monthIso: string): number {
    const pd = tenant.proratedDeposit;
    if (!pd?.enabled || tenant.depositExempt) return 0;
    const installment = Number(pd.monthlyInstallment || 0);
    const total = Number(pd.totalDepositAmount || 0);
    if (installment <= 0 || total <= 0) return 0;
    const anchor = getTenantRentStartAnchor(tenant) || tenant.onboardingDate || '';
    const anchorMonth = String(anchor).slice(0, 7);
    if (!anchorMonth || anchorMonth > monthIso) return 0;
    const monthsThrough = Math.max(0, monthDiff(anchorMonth, monthIso)) + 1;
    const scheduledThrough = Math.min(total, Math.min(Number(pd.durationMonths || 0), monthsThrough) * installment);
    const historicalPaid = (tenant.paymentHistory || [])
        .filter(p => p?.status === 'Paid' && String(p.date || '').slice(0, 7) <= monthIso && !isBackdatedPaymentEntry(p))
        .reduce((sum, p) => sum + parsePaidAmount(p.amount), 0);
    const scheduledAlreadyCovered = Math.min(scheduledThrough, historicalPaid);
    return Math.min(installment, Math.max(0, total - scheduledAlreadyCovered), Math.max(0, scheduledThrough - scheduledAlreadyCovered));
}

export interface PendingTenantPaymentAllocation {
    effectiveRent: number;
    depositExpected: number;
    depositOutstanding: number;
    depositCreditApplied: number;
    depositPaidAfterPayment: number;
    rentAmountAvailable: number;
    depositAlreadySettled: boolean;
    depositSettledAfterPayment: boolean;
    rentCoveredByPayment: boolean;
}

export function getPendingTenantPaymentAllocation(
    tenant: TenantProfile,
    amountPaid: number,
    paymentDateIso: string,
): PendingTenantPaymentAllocation {
    const paid = Math.max(0, Number(amountPaid || 0));
    let effectiveRent = getEffectiveRentForDate(tenant, paymentDateIso);
    let proratedInstallmentDue = tenant.proratedDeposit?.enabled
        ? getProratedInstallmentDueAtPayment(tenant, String(paymentDateIso || '').slice(0, 7))
        : 0;

    const anchorStr = getTenantProrationAnchor(tenant);

    const depositExpected = getDepositExpected(tenant);
    const currentDepositPaid = Math.max(0, Number(tenant.depositPaid || 0));
    const isStandardDepositRequired = !tenant.depositExempt && !tenant.proratedDeposit?.enabled && !tenant.rentExtension?.enabled && depositExpected > 0;
    const depositOutstanding = isStandardDepositRequired
        ? Math.max(0, depositExpected - currentDepositPaid)
        : 0;
    const depositCreditApplied = Math.min(paid, depositOutstanding);
    const depositPaidAfterPayment = isStandardDepositRequired
        ? Math.min(depositExpected, currentDepositPaid + depositCreditApplied)
        : currentDepositPaid;
    const depositAlreadySettled = tenant.depositExempt
        || !!tenant.rentExtension?.enabled
        || (tenant.proratedDeposit?.enabled
            ? tenant.proratedDeposit.amountPaidSoFar + 0.5 >= tenant.proratedDeposit.totalDepositAmount
            : depositExpected > 0 && currentDepositPaid + 0.5 >= depositExpected);

    const depositSettledAfterPayment = depositAlreadySettled || (tenant.proratedDeposit?.enabled
        ? paid >= effectiveRent + proratedInstallmentDue
        : (tenant.depositExempt || depositExpected <= 0 || depositPaidAfterPayment + 0.5 >= depositExpected));
    const rentAmountAvailable = tenant.proratedDeposit?.enabled
        ? Math.max(0, paid - proratedInstallmentDue)
        : Math.max(0, paid - depositCreditApplied);
    const rentCoveredByPayment = rentAmountAvailable + 0.5 >= effectiveRent;
    return {
        effectiveRent,
        depositExpected,
        depositOutstanding,
        depositCreditApplied,
        depositPaidAfterPayment,
        rentAmountAvailable,
        depositAlreadySettled,
        depositSettledAfterPayment,
        rentCoveredByPayment,
    };
}

export interface RentPaymentCycleResult {
    nextDueDateIso: string;
    monthsCovered: number;
    /**
     * When true the rent extension period has ended (tenant paid their first
     * deferred rent). Callers should restore originalGraceDays and clear the
     * rentExtension object on the TenantProfile.
     */
    clearRentExtension?: boolean;
    /**
     * Present when the tenant has a proratedDeposit and made a payment that
     * advances the installment counter. Callers should merge these values into
     * the tenant's proratedDeposit object and update depositPaid accordingly.
     */
    proratedUpdate?: {
        monthsPaid: number;
        amountPaidSoFar: number;
        /** True once amountPaidSoFar >= totalDepositAmount. */
        fullyPaid: boolean;
    };
}

function calculateMonthsCovered(amountForRent: number, firstEffectiveRent: number, baseRent: number): number {
    if (amountForRent < firstEffectiveRent - 0.5) return 0;
    let remaining = amountForRent - firstEffectiveRent;
    let covered = 1; // Covered the first effective month
    const br = Math.max(0, baseRent);
    if (br > 0 && remaining >= br - 0.5) {
        covered += Math.floor(remaining / br);
    }
    return covered;
}

export function computeRentPaymentCycleUpdate(
    tenant: TenantProfile,
    amountPaid: number,
    paymentDateIso: string,
): RentPaymentCycleResult {
    const dueDay = clampDueDay(tenant.rentDueDate);
    const firstEffectiveRent = getEffectiveRentForDate(tenant, paymentDateIso);
    const baseRent = Number(tenant.rentAmount || 0);
    const paid = Math.max(0, Number(amountPaid || 0));

    const paymentDate = new Date(paymentDateIso || getTodayIsoDate());
    paymentDate.setHours(0, 0, 0, 0);

    const currentDueDateStr = tenant.nextDueDate || (tenant as any).activationDate || tenant.onboardingDate || paymentDateIso;
    const baseDateForAddition = new Date(currentDueDateStr);
    if (Number.isNaN(baseDateForAddition.getTime())) {
        baseDateForAddition.setTime(paymentDate.getTime());
    }
    baseDateForAddition.setHours(0, 0, 0, 0);

    // ── Rent Extension: first deferred rent ───────────────────────────────────
    if (tenant.rentExtension?.enabled) {
        if (paid >= firstEffectiveRent) {
            const monthsCovered = calculateMonthsCovered(paid, firstEffectiveRent, baseRent);
            const nextDue = addMonthsKeepingDay(baseDateForAddition, monthsCovered, dueDay);
            return {
                nextDueDateIso: toIsoDate(nextDue),
                monthsCovered,
                clearRentExtension: true,
            };
        }
        return {
            nextDueDateIso: tenant.nextDueDate ?? paymentDateIso,
            monthsCovered: 0,
        };
    }

    // ── Prorated Deposit: installment alongside rent ───────────────────────────
    if (tenant.proratedDeposit?.enabled) {
        const pd = tenant.proratedDeposit;
        
        const anchorStr = getTenantProrationAnchor(tenant);
        
        let expectedInstallmentTotal = pd.monthlyInstallment || 0;

        const installmentToApply = Math.min(expectedInstallmentTotal, paid);
        const amountForRent = Math.max(0, paid - installmentToApply);
        
        const monthsCovered = calculateMonthsCovered(amountForRent, firstEffectiveRent, baseRent);
        const nextDue = monthsCovered > 0 ? addMonthsKeepingDay(baseDateForAddition, monthsCovered, dueDay) : null;

        const newAmountPaid = Math.min(pd.totalDepositAmount, pd.amountPaidSoFar + installmentToApply);
        const newMonthsPaid = pd.monthsPaid + (installmentToApply > 0 ? 1 : 0);
        const fullyPaid = newAmountPaid >= pd.totalDepositAmount;

        return {
            nextDueDateIso: nextDue ? toIsoDate(nextDue) : (tenant.nextDueDate ?? paymentDateIso),
            monthsCovered,
            proratedUpdate: {
                monthsPaid: newMonthsPaid,
                amountPaidSoFar: newAmountPaid,
                fullyPaid,
            },
        };
    }

    // ── Standard / Multi-month deposit / Deposit Exempt ───────────────────────
    const depositOutstanding = tenant.depositExempt ? 0 : Math.max(0, getDepositExpected(tenant) - Math.max(0, Number(tenant.depositPaid || 0)));
    const amountForRent = Math.max(0, paid - depositOutstanding);
    const monthsCovered = calculateMonthsCovered(amountForRent, firstEffectiveRent, baseRent);
    const nextDue = monthsCovered > 0 ? addMonthsKeepingDay(baseDateForAddition, monthsCovered, dueDay) : null;

    return {
        nextDueDateIso: nextDue ? toIsoDate(nextDue) : (tenant.nextDueDate ?? paymentDateIso),
        monthsCovered,
    };
}
