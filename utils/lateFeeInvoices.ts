import type { TenantProfile, BillItem } from '../types';
import { getMonthlyRentStatus } from './rentSchedule';
import { getTenantRentStartAnchor } from './tenantPaymentCycle';
import { getCurrentMonthIso } from './timezone';

/**
 * Per-month late-fee invoices.
 *
 * Rather than a single cumulative "Late Fee" line, every month that has
 * accrued late fees gets its own bill (`LATEFEE-YYYY-MM-<tenantId>`). This
 * lets a tenant pay May's late fee independently of June's, and lets the
 * waterfall consume credit per-month in priority order.
 *
 * The underlying accrual formula in `utils/rentSchedule.ts` is unchanged:
 * we only project its per-month delta into derivable bills. How much of
 * each month's late fee the tenant has actually paid is tracked on the
 * tenant as `lateFeePaidByMonth[monthIso]`.
 */

export const LATE_FEE_BILL_PREFIX = 'LATEFEE-';

function addMonths(iso: string, n: number): string {
    const [y, m] = iso.split('-').map(Number);
    const dt = new Date(y, (m - 1) + n, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function monthDiff(from: string, to: string): number {
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    if (!fy || !fm || !ty || !tm) return 0;
    return (ty - fy) * 12 + (tm - fm);
}

export interface LateFeeMonthBreakdown {
    monthIso: string;
    accrued: number;
    paid: number;
    remaining: number;
}

/** Per-month accrued late fee, derived from the rent-schedule accrual. */
export function computeAccruedLateFeesByMonth(
    tenant: TenantProfile,
    lateFeePerDay = 100,
): Array<{ monthIso: string; amount: number }> {
    const anchor = getTenantRentStartAnchor(tenant);
    if (!anchor) return [];
    const startMonth = String(anchor).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(startMonth)) return [];
    const todayMonth = getCurrentMonthIso();
    const span = Math.max(0, monthDiff(startMonth, todayMonth));
    const waived = new Set<string>(((tenant as any).waivedLateFeeMonths as string[] | undefined) || []);
    const out: Array<{ monthIso: string; amount: number }> = [];
    let prevCum = 0;
    for (let i = 0; i <= span && i < 60; i++) {
        const monthIso = addMonths(startMonth, i);
        const status = getMonthlyRentStatus(tenant, { lateFeePerDay, asOfMonthIso: monthIso });
        const cum = Math.round(status.automatedLateFine || 0);
        const delta = Math.max(0, cum - prevCum);
        prevCum = cum;
        if (waived.has(monthIso)) continue;
        if (delta > 0) out.push({ monthIso, amount: delta });
    }
    return out;
}

export interface LateFeeBuildResult {
    bills: BillItem[];
    breakdown: LateFeeMonthBreakdown[];
}

/**
 * Build LATEFEE-* invoices for the tenant, preserving any prior Paid
 * amounts recorded in `tenant.lateFeePaidByMonth` (paid amounts NEVER
 * shrink due to subsequent accrual changes).
 */
export function buildLateFeeInvoices(tenant: TenantProfile, lateFeePerDay = 100): LateFeeBuildResult {
    const accrued = computeAccruedLateFeesByMonth(tenant, lateFeePerDay);
    const paidMap: Record<string, number> = ((tenant as any).lateFeePaidByMonth || {});
    const bills: BillItem[] = [];
    const breakdown: LateFeeMonthBreakdown[] = [];
    for (const { monthIso, amount } of accrued) {
        const paidSoFar = Math.max(0, Number(paidMap[monthIso] || 0));
        // A previously-paid month should never re-open if accrual grows
        // later (rent stays unpaid). Cap accrued at max(prior paid, current).
        const totalForMonth = Math.max(amount, paidSoFar);
        const remaining = Math.max(0, totalForMonth - paidSoFar);
        const isPaid = remaining <= 0.5 && totalForMonth > 0;
        bills.push({
            id: `${LATE_FEE_BILL_PREFIX}${monthIso}-${tenant.id}`,
            type: 'Late Fee',
            description: isPaid
                ? `Late fee — ${monthIso}`
                : paidSoFar > 0
                    ? `Late fee — ${monthIso} (partial KES ${Math.round(paidSoFar).toLocaleString()} of KES ${Math.round(totalForMonth).toLocaleString()})`
                    : `Late fee — ${monthIso}`,
            amount: isPaid ? totalForMonth : remaining,
            date: `${monthIso}-01`,
            status: isPaid ? 'Paid' : 'Pending',
        });
        breakdown.push({ monthIso, accrued: totalForMonth, paid: paidSoFar, remaining });
    }
    return { bills, breakdown };
}

export function isLateFeeInvoice(bill: { id?: string } | null | undefined): boolean {
    return !!bill && String(bill.id || '').startsWith(LATE_FEE_BILL_PREFIX);
}

/** Replace any prior LATEFEE-* bills in `existing` with `newLateFeeBills`. */
export function mergeLateFeeInvoices(existing: BillItem[] | undefined, newLateFeeBills: BillItem[]): BillItem[] {
    const kept = (existing || []).filter(b => !isLateFeeInvoice(b));
    return [...kept, ...newLateFeeBills];
}