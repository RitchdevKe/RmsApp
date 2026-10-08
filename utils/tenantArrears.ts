import type { TenantProfile } from '../types';
import {
    calculateProratedFirstMonthRent,
    getTenantProrationAnchor,
    getTenantRentStartAnchor,
} from './tenantPaymentCycle';
import { parsePaymentAmount } from './paymentReporting';
import { getProratedDepositInstallmentDueForMonth } from './proratedDepositAllocation';
import { buildUnifiedMultiOccupancyPaymentHistory } from './multiOccupancyLedger';
import { computeSubUnitInvoicedForMonth } from './subUnitInvoicing';
import { computeTenantTotalInvoicedForMonth } from './tenantBalance';

/**
 * Carry-over arrears breakdown.
 *
 * Walks every month from activation through the month BEFORE
 * `currentMonthIso`, building a per-month expected slot for rent and
 * deposit (standard or prorated installment). Allocates the pool of
 * prior-month payments + backdated payments oldest-first, deposit before
 * rent within each month, and returns the unpaid remainder as
 * labelled arrears line-items (e.g. "April Rent Arrears").
 */

export type ArrearsKind =
    | 'rent'
    | 'depositInstallment'
    | 'depositFull';

export interface ArrearsItem {
    monthIso: string;       // e.g. "2026-04"
    monthLabel: string;     // e.g. "April 2026"
    monthShort: string;     // e.g. "April"
    kind: ArrearsKind;
    label: string;          // human label e.g. "April Rent Arrears"
    amount: number;         // unpaid balance for this slot (BEFORE current month payments)
    expected: number;       // originally billed for this slot
    paidInCurrentMonth: number; // how much of this slot was paid in currentMonthIso
}

export interface ArrearsBreakdown {
    items: ArrearsItem[];
    totalArrears: number;
    paymentsConsumedByPrior: number;
    /** Portion of paymentsConsumedByPrior that was applied to rent slots. */
    paymentsAppliedToRent: number;
    /** Portion of paymentsConsumedByPrior that was applied to deposit slots
     *  (standard full deposit + prorated installment slots). */
    paymentsAppliedToDeposit: number;
    surplus: number;
    totalPriorExpected: number;
    totalPriorPaidPool: number;
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const arrearsCache = new WeakMap<TenantProfile, Record<string, ArrearsBreakdown>>();

function isBackdatedPaymentEntry(p: any): boolean {
    return p?.status === 'Paid' && (
        String(p?.method || '') === 'Backdated Opening Balance'
        || String(p?.method || '') === 'Backdated Rent Payment'
        || String(p?.method || '') === 'Backdated Deposit Payment'
        || String(p?.reference || '').startsWith('BACKFILL-')
        || String(p?.reference || '').startsWith('DEPOSIT-BACKFILL-')
    );
}

export interface ComputeArrearsOptions {
    subs?: TenantProfile[];
    allTenants?: TenantProfile[];
    main?: TenantProfile;
}

export function computeTenantArrears(
    tenant: TenantProfile,
    currentMonthIso: string,
    opts: ComputeArrearsOptions = {},
): ArrearsBreakdown {
    const empty: ArrearsBreakdown = {
        items: [],
        totalArrears: 0,
        paymentsConsumedByPrior: 0,
        paymentsAppliedToRent: 0,
        paymentsAppliedToDeposit: 0,
        surplus: 0,
        totalPriorExpected: 0,
        totalPriorPaidPool: 0,
    };

    // Multi-occupancy check
    let mainTenant = tenant;
    let subTenants: TenantProfile[] = [];

    if (tenant.occupancyType === 'Sub') {
        if (opts.main) {
            mainTenant = opts.main;
        } else if (opts.allTenants && tenant.mainTenantId) {
            mainTenant = opts.allTenants.find(t => t.id === tenant.mainTenantId) || tenant;
        }
    }

    if (mainTenant.occupancyType === 'Main') {
        if (opts.subs && opts.subs.length > 0) {
            subTenants = opts.subs.filter(s => s.status !== 'Vacated');
        } else if (opts.allTenants) {
            subTenants = opts.allTenants.filter(t => t.mainTenantId === mainTenant.id && t.status !== 'Vacated');
        }
    }

    if (subTenants.length > 0) {
        const unifiedHistory = buildUnifiedMultiOccupancyPaymentHistory(mainTenant, subTenants, {});

        const groupAnchors = [mainTenant, ...subTenants]
            .map(t => getTenantRentStartAnchor(t))
            .filter(Boolean)
            .map(a => String(a).slice(0, 7))
            .sort();
        if (groupAnchors.length === 0) return empty;
        const anchorMonth = groupAnchors[0];
        if (anchorMonth >= currentMonthIso) return empty;

        const [ay, am] = anchorMonth.split('-').map(Number);
        const [cy, cm] = currentMonthIso.split('-').map(Number);
        const totalPriorMonths = Math.max(0, (cy - ay) * 12 + (cm - am));

        interface MultiSlot {
            monthIso: string;
            rent: number;
            label: string;
            subId?: string;
            mainId?: string;
        }

        const slots: MultiSlot[] = [];
        const orderedSubs = [...subTenants].sort((a, b) => {
            const nameA = a.unit || a.propertyName || a.id;
            const nameB = b.unit || b.propertyName || b.id;
            return nameA.localeCompare(nameB);
        });

        for (let i = 0; i < totalPriorMonths; i++) {
            const dt = new Date(ay, am - 1 + i, 1);
            const mIso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
            const monthShort = MONTH_NAMES[dt.getMonth()];

            // Sub-units rent slots for mIso
            for (const s of orderedSubs) {
                const sRent = computeSubUnitInvoicedForMonth(s, mIso);
                if (sRent > 0) {
                    const unitLabel = s.unit || s.propertyName || 'Sub-Unit';
                    slots.push({
                        monthIso: mIso,
                        rent: sRent,
                        label: `${monthShort} Sub-Unit Rent Arrears (${unitLabel})`,
                        subId: s.id,
                    });
                }
            }

            // Main unit rent slot for mIso
            const mRent = computeTenantTotalInvoicedForMonth(mainTenant, mIso);
            if (mRent > 0) {
                slots.push({
                    monthIso: mIso,
                    rent: mRent,
                    label: `${monthShort} Base Rent Arrears`,
                    mainId: mainTenant.id,
                });
            }
        }

        const paidPriorMonthsTotal = unifiedHistory.reduce((sum, p: any) => {
            if (isBackdatedPaymentEntry(p) || p.status !== 'Paid') return sum;
            const ds = String(p.date || '').slice(0, 7);
            if (!ds || ds >= currentMonthIso) return sum;
            return sum + parsePaymentAmount(p.amount);
        }, 0);

        const backdatedTotal = unifiedHistory.reduce((sum, p) => {
            if (!isBackdatedPaymentEntry(p)) return sum;
            return sum + parsePaymentAmount(p.amount);
        }, 0);

        let genericPool = paidPriorMonthsTotal + backdatedTotal;
        let currentMonthGenericPool = unifiedHistory.reduce((sum, p: any) => {
            if (isBackdatedPaymentEntry(p) || p.status !== 'Paid') return sum;
            const ds = String(p.date || '').slice(0, 7);
            if (ds === currentMonthIso) return sum + parsePaymentAmount(p.amount);
            return sum;
        }, 0);

        const totalPriorExpected = slots.reduce((s, x) => s + x.rent, 0);
        const items: ArrearsItem[] = [];
        let appliedToRent = 0;

        for (const slot of slots) {
            const monthDate = new Date(`${slot.monthIso}-15T00:00:00`);
            const monthShort = MONTH_NAMES[monthDate.getMonth()];
            const monthLabel = `${monthShort} ${monthDate.getFullYear()}`;

            if (slot.rent > 0) {
                const applied = Math.min(genericPool, slot.rent);
                genericPool -= applied;
                appliedToRent += applied;

                const remainder = Math.max(0, Math.round(slot.rent - applied));
                if (remainder > 0) {
                    let paidThisMonth = 0;
                    if (paidThisMonth < remainder && currentMonthGenericPool > 0) {
                        const fromGen = Math.min(remainder - paidThisMonth, currentMonthGenericPool);
                        paidThisMonth += fromGen;
                        currentMonthGenericPool -= fromGen;
                    }

                    // If calling on a specific sub-tenant, include relevant sub-tenant items
                    if (tenant.occupancyType === 'Sub' && slot.subId && slot.subId !== tenant.id) {
                        continue;
                    }

                    items.push({
                        monthIso: slot.monthIso,
                        monthLabel,
                        monthShort,
                        kind: 'rent',
                        label: slot.label,
                        amount: remainder,
                        expected: slot.rent,
                        paidInCurrentMonth: paidThisMonth,
                    });
                }
            }
        }

        const totalArrears = items.reduce((s, x) => s + x.amount, 0);
        const surplus = Math.max(0, paidPriorMonthsTotal + backdatedTotal - totalPriorExpected);

        return {
            items,
            totalArrears,
            paymentsConsumedByPrior: appliedToRent,
            paymentsAppliedToRent: appliedToRent,
            paymentsAppliedToDeposit: 0,
            surplus,
            totalPriorExpected,
            totalPriorPaidPool: paidPriorMonthsTotal + backdatedTotal,
        };
    }

    // Single Tenant Flow
    let tenantCache = arrearsCache.get(tenant);
    if (tenantCache && tenantCache[currentMonthIso] && !opts.subs && !opts.allTenants) {
        return tenantCache[currentMonthIso];
    }

    const anchor = getTenantRentStartAnchor(tenant);
    if (!anchor) return empty;
    const anchorMonth = String(anchor).slice(0, 7);
    if (anchorMonth >= currentMonthIso) return empty;

    const baseRent = Number(tenant.rentAmount || 0);
    const firstStored = Number((tenant as any).firstMonthRent || 0);
    const firstMonthRent = firstStored > 0
        ? firstStored
        : calculateProratedFirstMonthRent(baseRent, getTenantProrationAnchor(tenant));

    const depositMonthsRaw = Number((tenant as any).depositMonths ?? 1);
    const depositMonths = Number.isFinite(depositMonthsRaw) && depositMonthsRaw > 0
        ? depositMonthsRaw
        : 1;
    const depositExpectedStandard = Number((tenant as any).depositExpected ?? 0) > 0
        ? Number((tenant as any).depositExpected)
        : (baseRent * depositMonths);

    const isProrated = !!tenant.proratedDeposit?.enabled;
    const depositExempt = !!tenant.depositExempt;
    const rentExtensionActive = !!tenant.rentExtension?.enabled;

    const [ay, am] = anchorMonth.split('-').map(Number);
    const [cy, cm] = currentMonthIso.split('-').map(Number);
    const totalPriorMonths = Math.max(0, (cy - ay) * 12 + (cm - am));

    interface Slot {
        monthIso: string;
        rent: number;
        depositInstallment: number;
    }
    const slots: Slot[] = [];
    for (let i = 0; i < totalPriorMonths; i++) {
        const dt = new Date(ay, am - 1 + i, 1);
        const mIso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        const rentVal = i === 0 ? firstMonthRent : baseRent;
        let depInst = 0;
        if (!depositExempt && !rentExtensionActive) {
            if (isProrated) {
                depInst = getProratedDepositInstallmentDueForMonth(tenant, mIso);
            } else if (i === 0) {
                depInst = depositExpectedStandard;
            }
        }
        slots.push({ monthIso: mIso, rent: rentVal, depositInstallment: depInst });
    }

    const history = tenant.paymentHistory || [];
    const paidPriorMonthsTotal = history.reduce((sum, p: any) => {
        if (isBackdatedPaymentEntry(p) || p.status !== 'Paid') return sum;
        const ds = String(p.date || '').slice(0, 7);
        if (!ds || ds >= currentMonthIso) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);
    // Separate backdated pools so deposit-specific backfills don't get
    // consumed by rent arrears (and vice versa). Generic "Backdated Opening
    // Balance" entries without a typed reference fall back to the rent pool.
    const depositBackdatedPool = history.reduce((sum, p) => {
        if (!isBackdatedPaymentEntry(p)) return sum;
        if (!String(p?.reference || '').startsWith('DEPOSIT-BACKFILL-')) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);
    const rentBackdatedPool = history.reduce((sum, p) => {
        if (!isBackdatedPaymentEntry(p)) return sum;
        if (String(p?.reference || '').startsWith('DEPOSIT-BACKFILL-')) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);
    const backdatedTotal = depositBackdatedPool + rentBackdatedPool;

    let genericPool = paidPriorMonthsTotal + rentBackdatedPool;
    let depositPool = depositBackdatedPool;
    const totalPriorExpected = slots.reduce((s, x) => s + x.rent + x.depositInstallment, 0);
    const items: ArrearsItem[] = [];

    // Calculate current month payments to see if they pay off any of these arrears
    let currentMonthGenericPool = 0;
    for (const p of history) {
        if (isBackdatedPaymentEntry(p) || p.status !== 'Paid') continue;
        const ds = String(p.date || '').slice(0, 7);
        if (ds === currentMonthIso) {
            currentMonthGenericPool += parsePaymentAmount(p.amount);
        }
    }

    let appliedToRent = 0;
    let appliedToDeposit = 0;

    for (const slot of slots) {
        const monthDate = new Date(`${slot.monthIso}-15T00:00:00`);
        const monthShort = MONTH_NAMES[monthDate.getMonth()];
        const monthLabel = `${monthShort} ${monthDate.getFullYear()}`;

        if (slot.depositInstallment > 0) {
            const fromDeposit = Math.min(depositPool, slot.depositInstallment);
            depositPool -= fromDeposit;
            const remaining = slot.depositInstallment - fromDeposit;
            const fromGeneric = Math.min(genericPool, remaining);
            genericPool -= fromGeneric;
            const totalApplied = fromDeposit + fromGeneric;
            appliedToDeposit += totalApplied;
            
            if (isProrated) {
                const remainder = Math.max(0, Math.round(slot.depositInstallment - totalApplied));
                if (remainder > 0) {
                    let paidThisMonth = 0;
                    if (paidThisMonth < remainder && currentMonthGenericPool > 0) {
                        const fromGen = Math.min(remainder - paidThisMonth, currentMonthGenericPool);
                        paidThisMonth += fromGen;
                        currentMonthGenericPool -= fromGen;
                    }

                    items.push({
                        monthIso: slot.monthIso,
                        monthLabel,
                        monthShort,
                        kind: 'depositInstallment',
                        label: `${monthShort} Deposit Installment Arrears`,
                        amount: remainder,
                        expected: slot.depositInstallment,
                        paidInCurrentMonth: paidThisMonth,
                    });
                }
            }
        }
        if (slot.rent > 0) {
            const applied = Math.min(genericPool, slot.rent);
            genericPool -= applied;
            appliedToRent += applied;
            
            const remainder = Math.max(0, Math.round(slot.rent - applied));
            if (remainder > 0) {
                let paidThisMonth = 0;
                if (paidThisMonth < remainder && currentMonthGenericPool > 0) {
                    const fromGen = Math.min(remainder - paidThisMonth, currentMonthGenericPool);
                    paidThisMonth += fromGen;
                    currentMonthGenericPool -= fromGen;
                }

                items.push({
                    monthIso: slot.monthIso,
                    monthLabel,
                    monthShort,
                    kind: 'rent',
                    label: `${monthShort} Rent Arrears`,
                    amount: remainder,
                    expected: slot.rent,
                    paidInCurrentMonth: paidThisMonth,
                });
            }
        }
    }
    genericPool += depositPool;
    depositPool = 0;

    const totalArrears = items.reduce((s, x) => s + x.amount, 0);
    const surplus = Math.max(0, paidPriorMonthsTotal + backdatedTotal - totalPriorExpected);

    const result = {
        items,
        totalArrears,
        paymentsConsumedByPrior: appliedToRent + appliedToDeposit,
        paymentsAppliedToRent: appliedToRent,
        paymentsAppliedToDeposit: appliedToDeposit,
        surplus,
        totalPriorExpected,
        totalPriorPaidPool: paidPriorMonthsTotal + backdatedTotal,
    };

    if (!tenantCache) {
        tenantCache = {};
        arrearsCache.set(tenant, tenantCache);
    }
    tenantCache[currentMonthIso] = result;

    return result;
}

/**
 * Convenience helper: return a human label for an outstanding bill/fine
 * whose date is from a prior month, so it renders as e.g.
 * "April Water Bill Arrears" instead of just "Water Bill".
 */
export function labelWithArrearsMonth(
    baseLabel: string,
    entryDateIso: string | undefined,
    currentMonthIso: string,
): string {
    if (!entryDateIso) return baseLabel;
    const month = String(entryDateIso).slice(0, 7);
    if (!month || month >= currentMonthIso) return baseLabel;
    const dt = new Date(`${month}-15T00:00:00`);
    if (Number.isNaN(dt.getTime())) return baseLabel;
    const m = MONTH_NAMES[dt.getMonth()];
    // Avoid double "(Backdated) (Backdated)" or trailing "Arrears"
    const cleaned = baseLabel.replace(/\s*\(Backdated\)\s*$/i, '').replace(/\s*Arrears\s*$/i, '').trim();
    return `${m} ${cleaned} (Backdated)`;
}
