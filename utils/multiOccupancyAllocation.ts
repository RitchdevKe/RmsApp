import type { TenantProfile } from '../types';
import { computeTenantTotalInvoicedForMonth } from './tenantBalance';
import { computeTenantMonthlyBalance } from './tenantBalance';
import { computeTenantArrears } from './tenantArrears';
import { getTodayIsoDate } from './timezone';

/**
 * Multi-occupancy payment allocation.
 *
 * Given a Main tenant + the list of all currently-Active Sub tenants tied
 * to it, distribute a cash payment in this order:
 *   1. Oldest outstanding month first (across Subs AND Main).
 *   2. Within the same month, Subs are paid before the Main.
 *
 * Returns a Map of { tenantId → amount } describing the share of the
 * payment that should be posted against each tenant. The Main always
 * appears even when its share is zero so the cash event has somewhere
 * to live.
 */
export interface MultiAllocationLine {
    tenantId: string;
    monthIso: string;
    isMain: boolean;
    amount: number; // amount allocated to this charge
    kind?: 'rent' | 'deposit';
}

export interface MultiOccupancyAllocationResult {
    perTenant: Record<string, number>;
    lines: MultiAllocationLine[];
    unallocated: number; // surplus left over after every charge is settled
}

/** Range of YYYY-MM months from earliest activation to current month inclusive. */
function buildMonthRange(allTenants: TenantProfile[], currentMonth: string): string[] {
    const months = new Set<string>([currentMonth]);
    for (const t of allTenants) {
        const anchor = String(t.rentStartDate || t.onboardingDate || '').slice(0, 7);
        if (!anchor) continue;
        let cur = anchor;
        while (cur && cur <= currentMonth) {
            months.add(cur);
            const [y, m] = cur.split('-').map(Number);
            const next = new Date(y, m, 1);
            cur = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
        }
    }
    return Array.from(months).sort();
}

export function allocateMultiOccupancyPayment(
    main: TenantProfile,
    subs: TenantProfile[],
    amountPaid: number,
    payDateIso: string,
    opts: { bypassDepositPriority?: boolean } = {}
): MultiOccupancyAllocationResult {
    const result: MultiOccupancyAllocationResult = {
        perTenant: {},
        lines: [],
        unallocated: 0,
    };
    let remaining = Math.max(0, Number(amountPaid || 0));
    if (remaining <= 0) {
        result.unallocated = 0;
        return result;
    }

    const currentMonth = String(payDateIso || getTodayIsoDate()).slice(0, 7);

    // 1. Prioritize security deposits first across all units
    // "security deposit is paid before anything else including before arrears or sub units"
    if (!opts.bypassDepositPriority) {
        const allUnits = [...subs, main];
        const depositCharges: Array<{ t: TenantProfile; owed: number }> = [];
        for (const t of allUnits) {
            if (t.depositExempt) continue;
            const expected = Number((t as any).depositExpected ?? 0);
            const paid = Number((t as any).depositPaid ?? 0);
            const owed = Math.max(0, expected - paid);
            if (owed > 0) {
                depositCharges.push({ t, owed });
            }
        }

        // Sort sub-units first, then main unit
        depositCharges.sort((a, b) => {
            const aIsMain = a.t.id === main.id;
            const bIsMain = b.t.id === main.id;
            if (aIsMain !== bIsMain) {
                return aIsMain ? 1 : -1;
            }
            return a.t.id.localeCompare(b.t.id);
        });

        for (const d of depositCharges) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, d.owed);
            remaining -= take;
            result.perTenant[d.t.id] = (result.perTenant[d.t.id] || 0) + take;
            result.lines.push({
                tenantId: d.t.id,
                monthIso: currentMonth,
                isMain: d.t.id === main.id,
                amount: take,
                kind: 'deposit'
            });
            // Update the depositPaid reference in memory so subsequent rent-arrears calculations in this run
            // see that this deposit is paid.
            (d.t as any).depositPaid = Number((d.t as any).depositPaid || 0) + take;
        }
    }

    const months = buildMonthRange([main, ...subs], currentMonth);

    // Build a chronological list of outstanding charges for all months <= currentMonth
    interface TenantCharge {
        t: TenantProfile;
        isMain: boolean;
        monthIso: string;
        due: number;
    }
    const charges: TenantCharge[] = [];

    // 1. Collect all charges for all units across all months
    const allTenants = [...subs, main];
    for (const t of allTenants) {
        const isMain = t.id === main.id;
        
        // Use true arrears logic for all prior months to ensure payments
        // made late (in subsequent months) are correctly recognized as paying
        // off the older balances, preventing double-charging.
        const arrears = computeTenantArrears(t, currentMonth);
        for (const item of arrears.items) {
            const owed = Math.max(0, item.amount - (item.paidInCurrentMonth || 0));
            if (owed > 0) {
                charges.push({ t, isMain, monthIso: item.monthIso, due: owed });
            }
        }

        // Add only the current month's explicitly invoiced balance
        const invoiced = computeTenantTotalInvoicedForMonth(t, currentMonth);
        const bal = computeTenantMonthlyBalance(t, currentMonth, { totalInvoiced: invoiced });
        const currentDue = Math.max(0, bal.balanceDue);
        if (currentDue > 0) {
            charges.push({ t, isMain, monthIso: currentMonth, due: currentDue });
        }
    }

    // 2. Sort charges chronologically, sub-units before main unit within the same month
    charges.sort((a, b) => {
        // Oldest month first
        if (a.monthIso !== b.monthIso) {
            return a.monthIso.localeCompare(b.monthIso);
        }
        // Sub-units (isMain=false) before Main unit (isMain=true)
        if (a.isMain !== b.isMain) {
            return a.isMain ? 1 : -1;
        }
        // Deterministic tie-breaker for multiple sub-units
        return a.t.id.localeCompare(b.t.id);
    });

    // Allocate payment to the chronological, sub-first list of charges
    for (const charge of charges) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, charge.due);
        remaining -= take;
        result.perTenant[charge.t.id] = (result.perTenant[charge.t.id] || 0) + take;
        result.lines.push({
            tenantId: charge.t.id,
            monthIso: charge.monthIso,
            isMain: charge.isMain,
            amount: take
        });
    }

    // Distribute any surplus into future months (Advance).
    // Following the same rule: clear future months chronological month-by-month, sub-units first.
    if (remaining > 0) {
        let futureMonth = currentMonth;
        let iterations = 0;
        let consecutiveEmptyMonths = 0;
        while (remaining > 0 && iterations < 60 && consecutiveEmptyMonths < 12) {
            const [y, m] = futureMonth.split('-').map(Number);
            const nextDt = new Date(y, m, 1);
            futureMonth = `${nextDt.getFullYear()}-${String(nextDt.getMonth() + 1).padStart(2, '0')}`;
            iterations++;

            let allocatedInThisMonth = false;
            
            // Subs first
            for (const s of subs) {
                if (remaining <= 0) break;
                const invoiced = computeTenantTotalInvoicedForMonth(s, futureMonth);
                if (invoiced > 0) {
                    const take = Math.min(remaining, invoiced);
                    if (take > 0) {
                        remaining -= take;
                        result.perTenant[s.id] = (result.perTenant[s.id] || 0) + take;
                        result.lines.push({ tenantId: s.id, monthIso: futureMonth, isMain: false, amount: take });
                        allocatedInThisMonth = true;
                    }
                }
            }
            
            // Main second
            if (remaining > 0) {
                const invoicedMain = computeTenantTotalInvoicedForMonth(main, futureMonth);
                if (invoicedMain > 0) {
                    const take = Math.min(remaining, invoicedMain);
                    if (take > 0) {
                        remaining -= take;
                        result.perTenant[main.id] = (result.perTenant[main.id] || 0) + take;
                        result.lines.push({ tenantId: main.id, monthIso: futureMonth, isMain: true, amount: take });
                        allocatedInThisMonth = true;
                    }
                }
            }
            
            if (allocatedInThisMonth) {
                consecutiveEmptyMonths = 0;
            } else {
                consecutiveEmptyMonths++;
            }
        }
    }

    // Any extreme surplus stays on the Main as unallocated advance.
    if (remaining > 0) {
        result.perTenant[main.id] = (result.perTenant[main.id] || 0) + remaining;
        result.unallocated = remaining;
        remaining = 0;
    }
    if (!(main.id in result.perTenant)) result.perTenant[main.id] = 0;
    return result;
}
