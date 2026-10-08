import type { TenantProfile } from '../types';
import { getTenantRentStartAnchor, calculateProratedFirstMonthRent, getTenantProrationAnchor } from './tenantPaymentCycle';

function parseAmount(raw: string | number | null | undefined): number {
    if (raw == null) return 0;
    if (typeof raw === 'number') {
        return isNaN(raw) ? 0 : raw;
    }
    const cleaned = String(raw).replace(/[^0-9.]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
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

function scheduledInstallmentsBeforeMonth(tenant: TenantProfile, monthIso: string): number {
    const pd = tenant.proratedDeposit;
    if (!pd?.enabled) return 0;
    const anchor = getTenantRentStartAnchor(tenant) || tenant.onboardingDate || '';
    const anchorMonth = String(anchor).slice(0, 7);
    if (!anchorMonth || anchorMonth > monthIso) return 0;
    const monthsBefore = Math.max(0, monthDiff(anchorMonth, monthIso));
    return Math.min(Number(pd.durationMonths || 0), monthsBefore);
}

function scheduledInstallmentsThroughMonth(tenant: TenantProfile, monthIso: string): number {
    const pd = tenant.proratedDeposit;
    if (!pd?.enabled) return 0;
    const anchor = getTenantRentStartAnchor(tenant) || tenant.onboardingDate || '';
    const anchorMonth = String(anchor).slice(0, 7);
    if (!anchorMonth || anchorMonth > monthIso) return 0;
    const monthsThrough = Math.max(0, monthDiff(anchorMonth, monthIso)) + 1;
    return Math.min(Number(pd.durationMonths || 0), monthsThrough);
}

export function getProratedDepositPaidBeforeMonth(tenant: TenantProfile, monthIso: string): number {
    const pd = tenant.proratedDeposit;
    if (!pd?.enabled || tenant.depositExempt) return 0;
    const installment = Number(pd.monthlyInstallment || 0);
    const total = Number(pd.totalDepositAmount || 0);
    if (installment <= 0 || total <= 0) return 0;

    const scheduledBefore = Math.min(total, scheduledInstallmentsBeforeMonth(tenant, monthIso) * installment);
    if (scheduledBefore <= 0) return 0;

    const paidBefore = (tenant.paymentHistory || [])
        .filter(p => p?.status === 'Paid' && String(p.date || '').slice(0, 7) < monthIso && !isBackdatedPaymentEntry(p))
        .reduce((sum, p) => sum + parseAmount(p.amount), 0);

    const explicitDepositBackfill = (tenant.paymentHistory || [])
        .filter(p => p?.status === 'Paid' && String(p.reference || '').startsWith('DEPOSIT-BACKFILL-') && String(p.date || '').slice(0, 7) < monthIso)
        .reduce((sum, p) => sum + parseAmount(p.amount), 0);

    return Math.min(total, scheduledBefore, paidBefore + explicitDepositBackfill);
}

export function getProratedDepositInstallmentDueForMonth(tenant: TenantProfile, monthIso: string): number {
    const pd = tenant.proratedDeposit;
    if (!pd?.enabled || tenant.depositExempt) return 0;
    const installment = Number(pd.monthlyInstallment || 0);
    const total = Number(pd.totalDepositAmount || 0);
    if (installment <= 0 || total <= 0) return 0;

    const paidBefore = getProratedDepositPaidBeforeMonth(tenant, monthIso);
    const scheduledThrough = Math.min(total, scheduledInstallmentsThroughMonth(tenant, monthIso) * installment);
    return Math.min(installment, Math.max(0, total - paidBefore), Math.max(0, scheduledThrough - paidBefore));
}

export function computePriorArrearsBrief(tenant: TenantProfile, monthIso: string): { deposit: number; rent: number; surplus: number } {
    const anchor = getTenantRentStartAnchor(tenant);
    if (!anchor) return { deposit: 0, rent: 0, surplus: 0 };
    const anchorMonth = String(anchor).slice(0, 7);
    if (anchorMonth >= monthIso) return { deposit: 0, rent: 0, surplus: 0 };

    const baseRent = Number(tenant.rentAmount || 0);
    const firstStored = Number((tenant as any).firstMonthRent || 0);
    const firstMonthRent = firstStored > 0
        ? firstStored
        : calculateProratedFirstMonthRent(baseRent, getTenantProrationAnchor(tenant));

    const isProrated = !!tenant.proratedDeposit?.enabled;
    const depositExempt = !!tenant.depositExempt;
    const rentExtensionActive = !!tenant.rentExtension?.enabled;

    const [ay, am] = anchorMonth.split('-').map(Number);
    const [cy, cm] = monthIso.split('-').map(Number);
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
            }
        }
        slots.push({ monthIso: mIso, rent: rentVal, depositInstallment: depInst });
    }

    const history = tenant.paymentHistory || [];
    const paidPriorMonthsTotal = history.reduce((sum, p: any) => {
        if (p?.status !== 'Paid' || isBackdatedPaymentEntry(p)) return sum;
        const ds = String(p.date || '');
        if (!ds || ds.slice(0, 7) >= monthIso) return sum;
        return sum + parseAmount(p.amount);
    }, 0);

    const depositBackdatedPool = history.reduce((sum, p) => {
        if (!isBackdatedPaymentEntry(p)) return sum;
        if (!String(p?.reference || '').startsWith('DEPOSIT-BACKFILL-')) return sum;
        return sum + parseAmount(p.amount);
    }, 0);
    const rentBackdatedPool = history.reduce((sum, p) => {
        if (!isBackdatedPaymentEntry(p)) return sum;
        if (String(p?.reference || '').startsWith('DEPOSIT-BACKFILL-')) return sum;
        return sum + parseAmount(p.amount);
    }, 0);

    let genericPool = paidPriorMonthsTotal + rentBackdatedPool;
    let depositPool = depositBackdatedPool;

    let appliedToRent = 0;
    let appliedToDeposit = 0;

    for (const slot of slots) {
        if (slot.depositInstallment > 0) {
            const fromDeposit = Math.min(depositPool, slot.depositInstallment);
            depositPool -= fromDeposit;
            const remaining = slot.depositInstallment - fromDeposit;
            const fromGeneric = Math.min(genericPool, remaining);
            genericPool -= fromGeneric;
            appliedToDeposit += fromDeposit + fromGeneric;
        }
        if (slot.rent > 0) {
            const applied = Math.min(genericPool, slot.rent);
            genericPool -= applied;
            appliedToRent += applied;
        }
    }

    const expectedDeposit = slots.reduce((s, x) => s + x.depositInstallment, 0);
    const expectedRent = slots.reduce((s, x) => s + x.rent, 0);

    const unpaidDeposit = Math.max(0, expectedDeposit - appliedToDeposit);
    const unpaidRent = Math.max(0, expectedRent - appliedToRent);

    return { deposit: unpaidDeposit, rent: unpaidRent, surplus: genericPool + depositPool };
}

export function getProratedDepositPaidThroughMonth(tenant: TenantProfile, monthIso: string): number {
    const pd = tenant.proratedDeposit;
    if (!pd?.enabled || tenant.depositExempt) return 0;
    const total = Number(pd.totalDepositAmount || 0);
    if (total <= 0) return 0;
    const paidThisMonth = (tenant.paymentHistory || [])
        .filter(p => p?.status === 'Paid' && String(p.date || '').slice(0, 7) === monthIso && !isBackdatedPaymentEntry(p))
        .reduce((sum, p) => sum + parseAmount(p.amount), 0);

    const prior = computePriorArrearsBrief(tenant, monthIso);
    const totalPriorArrears = prior.deposit + prior.rent;
    const surplusFromPrior = prior.surplus || 0;
    const availableForCurrentDeposit = Math.max(0, paidThisMonth + surplusFromPrior - totalPriorArrears);

    return Math.min(total, getProratedDepositPaidBeforeMonth(tenant, monthIso) + Math.min(availableForCurrentDeposit, getProratedDepositInstallmentDueForMonth(tenant, monthIso)));
}
