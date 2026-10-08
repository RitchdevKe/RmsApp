import type { TenantProfile } from '../types';
import { getAdvanceAppliedToRentForMonth, getEffectiveRentForMonth, parsePaymentAmount } from './paymentReporting';
import { getProratedDepositInstallmentDueForMonth } from './proratedDepositAllocation';

/** Day of month rent is due (1–28). Default 1. */
export function getRentDueDay(tenant: Pick<TenantProfile, 'rentDueDate'>): number {
    const d = tenant.rentDueDate;
    if (d == null || !Number.isFinite(d)) return 1;
    return Math.min(28, Math.max(1, Math.round(d)));
}

/** Grace days after due day before late rent accrues. Default 4 (due 1st → fines from 5th). */
export function getRentGraceDays(tenant: Pick<TenantProfile, 'rentGraceDays'>): number {
    const g = tenant.rentGraceDays;
    if (g == null || !Number.isFinite(g)) return 4;
    // Legacy records stored `5` to mean “until the 5th midnight”. The
    // accrual formula treats grace as days AFTER the due day, so due day 1
    // + 4 grace days starts charging on the 6th. Normalize old rows here so
    // every tenant follows the same 5th-midnight rule even if migration was
    // skipped by a browser cache flag.
    if (Math.round(g) === 5) return 4;
    return Math.min(28, Math.max(0, Math.round(g)));
}

const LATE_FEE_CUTOFF_DAY = 5;

/** First calendar day after which late rent / automated fine logic may apply. Rent unpaid after the 5th midnight accrues. */
export function getLateFineStartDay(tenant: Pick<TenantProfile, 'rentDueDate' | 'rentGraceDays'>): number {
    return LATE_FEE_CUTOFF_DAY;
}

export interface MonthlyRentStatus {
    dueDay: number;
    graceDays: number;
    lateStartsOnDay: number;
    /**
     * Total days late accumulated across every unpaid month from activation
     * through today (each unpaid month contributes its days past grace).
     * Field name kept for backwards compatibility — value is cumulative.
     */
    daysLateThisMonth: number;
    /** Cumulative automated late rent accrual: daysLate × lateFeePerDay. */
    automatedLateFine: number;
}

const DEFAULT_LATE_PER_DAY = 100;

function startOfLocalDay(value: Date): Date {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
}

function daysBetween(start: Date, end: Date): number {
    return Math.max(0, Math.floor((startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime()) / 86400000));
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

function isDepositBackfill(payment: any): boolean {
    return String(payment?.reference || '').startsWith('DEPOSIT-BACKFILL-')
        || String(payment?.method || '') === 'Backdated Deposit Payment';
}

function getDepositExpectedStandard(tenant: TenantProfile): number {
    const depositMonthsRaw = Number((tenant as any).depositMonths ?? 1);
    const depositMonths = Number.isFinite(depositMonthsRaw) && depositMonthsRaw > 0
        ? depositMonthsRaw
        : 1;
    return Number((tenant as any).depositExpected ?? 0) > 0
        ? Number((tenant as any).depositExpected)
        : Number(tenant.rentAmount || 0) * depositMonths;
}

function getDepositDueForSlot(tenant: TenantProfile, monthIso: string, slotIndex: number): number {
    if ((tenant as any).depositExempt || (tenant as any).rentExtension?.enabled) return 0;
    if ((tenant as any).proratedDeposit?.enabled) return getProratedDepositInstallmentDueForMonth(tenant, monthIso);
    return slotIndex === 0 ? getDepositExpectedStandard(tenant) : 0;
}

/**
 * Cumulative late-fee accrual.
 *
 * Walks every billable month from rent start through the current
 * month. For each month where rent was NOT fully covered, accrues
 * `lateFeePerDay` for every day past `lateStartsOnDay` (day after grace).
 * Past unpaid months contribute the full tail of their month; the current
 * month contributes days up to today.
 *
 * Example: rent unpaid May, June, and July (today=July 15, grace ends 5th):
 *   May:  31 - 5 = 26 days × 100 = 2,600
 *   June: 30 - 5 = 25 days × 100 = 2,500
 *   July: 15 - 5 = 10 days × 100 = 1,000
 *   Total: 6,100
 *
 * Applies to occupying tenants once rent has started.
 */
export function getMonthlyRentStatus(
    tenant: TenantProfile,
    opts?: { lateFeePerDay?: number; isRentPaidThisMonth?: boolean; asOfMonthIso?: string },
): MonthlyRentStatus {
    const lateFeePerDay = opts?.lateFeePerDay ?? DEFAULT_LATE_PER_DAY;
    const today = new Date();
    const todayPrefix = today.toISOString().slice(0, 7);

    // When a historical month is being viewed, cap accrual at the END of that
    // month so the late fee shown reflects what had accumulated by that
    // month — not the all-time running total through today.
    const asOf = opts?.asOfMonthIso && /^\d{4}-\d{2}$/.test(opts.asOfMonthIso)
        ? opts.asOfMonthIso
        : todayPrefix;
    const isViewingPast = asOf < todayPrefix;
    const [asOfY, asOfM] = asOf.split('-').map(Number);
    const asOfLastDay = new Date(asOfY, asOfM, 0).getDate();
    const horizonY = isViewingPast ? asOfY : today.getFullYear();
    const horizonM = isViewingPast ? asOfM - 1 : today.getMonth(); // 0-based
    const horizonDate = startOfLocalDay(isViewingPast
        ? new Date(asOfY, asOfM - 1, asOfLastDay)
        : today);

    const grace = getRentGraceDays(tenant);
    const dueDay = getRentDueDay(tenant);
    const lateStartsOnDay = LATE_FEE_CUTOFF_DAY;

    const allocated =
        !!tenant.propertyId &&
        !!tenant.unitId &&
        !!String(tenant.unit ?? '').trim() &&
        !!String(tenant.propertyName ?? '').trim();

    // Late fee applies to any tenant whose rent has started and who is
    // still occupying the unit. We intentionally do NOT gate on a narrow
    // `status === Active` whitelist — many activated tenants carry a
    // stored status like 'Unpaid'/'Pending' even though their rent has
    // started, and they would otherwise escape late fees entirely.
    const excludedStatuses = new Set([
        'Vacated', 'Evicted', 'Blacklisted', 'Inactive',
        'PendingApproval', 'PendingAllocation', 'PendingPayment',
    ]);
    const isInLateFeeWindow = !excludedStatuses.has(String(tenant.status || ''));

    // Prefer rentStartDate (the actual rent-billing anchor) over
    // onboardingDate so tenants whose rent was backdated still accrue
    // late fees for the months they actually owe rent.
    const rentStartStr = (tenant as any).rentStartDate
        ? String((tenant as any).rentStartDate)
        : null;
    const activationStr = rentStartStr
        ?? ((tenant as any).activationDate ? String((tenant as any).activationDate) : null)
        ?? (tenant.onboardingDate ? String(tenant.onboardingDate) : null);
    const activationMonthPrefix = activationStr ? activationStr.slice(0, 7) : null;

    if (!allocated || !isInLateFeeWindow || !activationMonthPrefix) {
        return { dueDay, graceDays: grace, lateStartsOnDay, daysLateThisMonth: 0, automatedLateFine: 0 };
    }

    // Start from the rent-start month. Tenants must be charged once they
    // pass the 5th midnight in ANY unpaid/partial month, including their
    // first billable month. Skipping the activation month is what made some
    // tenants never show late fees.
    const startY = parseInt(activationMonthPrefix.slice(0, 4), 10);
    const startM = parseInt(activationMonthPrefix.slice(5, 7), 10) - 1; // 0-based
    if (!Number.isFinite(startY) || !Number.isFinite(startM)) {
        return { dueDay, graceDays: grace, lateStartsOnDay, daysLateThisMonth: 0, automatedLateFine: 0 };
    }

    type RentSlot = {
        monthIso: string;
        rentRemaining: number;
        depositRemaining: number;
        billsRemaining: number;
        finesRemaining: number;
        lateFeesRemaining: number;
        cutoffDate: Date;
        rentPaidDate: Date | null;
    };

    function getOriginalAmt(item: { amount: any, status?: string, description?: string }): number {
        const amt = parsePaymentAmount(item.amount);
        if (item.status === 'Paid') return amt;
        const match = String(item.description || '').match(/of KES\s+([\d,.]+)\)$/i);
        if (match) {
            const full = parseFloat(match[1].replace(/,/g, ''));
            if (Number.isFinite(full) && full > 0) return full;
        }
        return Math.max(0, amt);
    }
    const isLateFeeInv = (b: any) => !!b && String(b.id || '').startsWith('LATEFEE-');
    const isAdvInv = (b: any) => !!b && String(b.id || '').startsWith('ADVANCE-');
    const isRentOrDepInv = (b: any) => {
        const t = String(b?.type || '');
        if (t === 'Rent' || t === 'Rent Arrears' || t === 'Deposit' || t === 'Deposit Installment') return true;
        if (String(b?.id || '').startsWith('DEPOSIT-INST-')) return true;
        return false;
    };

    const billItems = (tenant.outstandingBills || []).filter(b => !isAdvInv(b) && !isRentOrDepInv(b) && !isLateFeeInv(b));
    const lateFeeItems = (tenant.outstandingBills || []).filter(b => isLateFeeInv(b));
    const fineItems = (tenant.outstandingFines || []).filter(f => !isLateFeeInv(f));
    const recurringBase = Object.values(tenant.recurringBills || {}).reduce((s, v) => s + Number(v || 0), 0);

    const slots: RentSlot[] = [];
    let curY = startY;
    let curM = startM;
    let iter = 0;
    while ((curY < horizonY || (curY === horizonY && curM <= horizonM)) && iter < 120) {
        iter++;
        const monthIso = `${curY}-${String(curM + 1).padStart(2, '0')}`;
        const rent = getEffectiveRentForMonth(tenant, monthIso);
        const advanceApplied = getAdvanceAppliedToRentForMonth(tenant, monthIso);
        const rentRemaining = Math.max(0, rent - advanceApplied);
        
        const bItems = billItems.filter(b => String(b.date || '').startsWith(monthIso));
        const lItems = lateFeeItems.filter(b => String(b.date || '').startsWith(monthIso));
        const fItems = fineItems.filter(f => String(f.date || '').startsWith(monthIso));
        
        const billsRemaining = recurringBase + bItems.reduce((s, b) => s + getOriginalAmt(b), 0);
        const lateFeesRemaining = lItems.reduce((s, b) => s + getOriginalAmt(b), 0);
        const finesRemaining = fItems.reduce((s, f) => s + getOriginalAmt(f), 0);

        // For backwards compatibility in `slots` structure
        slots.push({
            monthIso,
            rentRemaining,
            depositRemaining: Math.max(0, getDepositDueForSlot(tenant, monthIso, slots.length)),
            billsRemaining,
            finesRemaining,
            lateFeesRemaining,
            cutoffDate: startOfLocalDay(new Date(curY, curM, LATE_FEE_CUTOFF_DAY)),
            rentPaidDate: rentRemaining <= 0 ? startOfLocalDay(new Date(curY, curM, 1)) : null,
        });

        curM++;
        if (curM > 11) { curM = 0; curY++; }
    }

    let genericBackdatedPool = 0;
    let depositBackdatedPool = 0;
    const datedPayments = (tenant.paymentHistory || [])
        .filter(p => p?.status === 'Paid')
        .reduce<Array<{ amount: number; date: Date }>>((acc, p) => {
            const amount = parsePaymentAmount(p.amount);
            if (amount <= 0) return acc;
            if (isBackdatedPaymentEntry(p)) {
                if (isDepositBackfill(p)) depositBackdatedPool += amount;
                else genericBackdatedPool += amount;
                return acc;
            }
            const parsed = startOfLocalDay(new Date(String(p.date || '')));
            if (Number.isNaN(parsed.getTime())) return acc;
            acc.push({ amount, date: parsed });
            return acc;
        }, [])
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    const applyPayment = (amount: number, paymentDate: Date) => {
        let remaining = Math.max(0, amount);
        for (const slot of slots) {
            if (remaining <= 0) break;
            if (slot.depositRemaining > 0) {
                const used = Math.min(slot.depositRemaining, remaining);
                slot.depositRemaining -= used;
                remaining -= used;
            }
            if (remaining <= 0) break;
            if (slot.rentRemaining > 0) {
                const used = Math.min(slot.rentRemaining, remaining);
                slot.rentRemaining -= used;
                remaining -= used;
                if (slot.rentRemaining <= 0.5) {
                    slot.rentRemaining = 0;
                    slot.rentPaidDate = paymentDate;
                }
            }
        }
    };

    const backfillDate = activationStr ? startOfLocalDay(new Date(activationStr)) : startOfLocalDay(new Date(startY, startM, 1));
    if (depositBackdatedPool > 0) {
        let remaining = depositBackdatedPool;
        for (const slot of slots) {
            if (remaining <= 0) break;
            const used = Math.min(slot.depositRemaining, remaining);
            slot.depositRemaining -= used;
            remaining -= used;
        }
        genericBackdatedPool += remaining;
    }
    if (genericBackdatedPool > 0) applyPayment(genericBackdatedPool, backfillDate);
    datedPayments.forEach(payment => applyPayment(payment.amount, payment.date));

    // Force current month rent as paid if flag is explicitly true
    if (opts?.isRentPaidThisMonth === true && !isViewingPast) {
        const currentSlot = slots.find(slot => slot.monthIso === todayPrefix);
        if (currentSlot) {
            currentSlot.rentRemaining = 0;
            currentSlot.rentPaidDate = today <= currentSlot.cutoffDate ? startOfLocalDay(today) : currentSlot.rentPaidDate ?? startOfLocalDay(today);
        }
    }

    const waivedLateFeeMonths = new Set(((tenant as any).waivedLateFeeMonths as string[] | undefined) || []);

    let totalDaysLate = 0;

    // We do NOT charge late fees for the very first billable month (onboarding month).
    // Accrual starts from the second month at the earliest.
    const startLateFeesM = startM + 1 > 11 ? 0 : startM + 1;
    const startLateFeesY = startM + 1 > 11 ? startY + 1 : startY;
    const startCalculationDate = startOfLocalDay(new Date(startLateFeesY, startLateFeesM, 1));

    if (slots.length > 1 && horizonDate >= startCalculationDate) {
        let currentDate = new Date(startCalculationDate);
        while (currentDate <= horizonDate) {
            const curMonthIso = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            if (!waivedLateFeeMonths.has(curMonthIso)) {
                let hasUnpaidRent = false;
                let hasArrearsFromPriorMonths = false;

                // Check all slots up to this current date
                for (let i = 0; i < slots.length; i++) {
                    const slot = slots[i];
                    const slotDate = new Date(parseInt(slot.monthIso.slice(0,4)), parseInt(slot.monthIso.slice(5,7)) - 1, 1);
                    if (slotDate <= currentDate) {
                        const isPaidOnThisDate = slot.rentPaidDate && startOfLocalDay(slot.rentPaidDate) <= currentDate;
                        const rentUnpaid = !isPaidOnThisDate && slot.rentRemaining > 0 || (slot.rentPaidDate && startOfLocalDay(slot.rentPaidDate) > currentDate);
                        const depositUnpaid = slot.depositRemaining > 0;

                        if (rentUnpaid) {
                            hasUnpaidRent = true;
                        }

                        if ((rentUnpaid || depositUnpaid) && slot.monthIso < curMonthIso) {
                            hasArrearsFromPriorMonths = true;
                        }
                    }
                }

                if (hasUnpaidRent) {
                    // During the grace period (1st to 5th), late fees only accrue if there are prior arrears.
                    const isWithinGracePeriod = currentDate.getDate() <= getLateFineStartDay(tenant);
                    if (!isWithinGracePeriod || hasArrearsFromPriorMonths) {
                        totalDaysLate++;
                    }
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }

    return {
        dueDay,
        graceDays: grace,
        lateStartsOnDay,
        daysLateThisMonth: totalDaysLate,
        automatedLateFine: totalDaysLate * lateFeePerDay,
    };
}
