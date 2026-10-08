import type { TenantProfile } from '../types';
import { parsePaymentAmount } from './paymentReporting';
import { computeTenantTotalInvoicedForMonth } from './tenantBalance';
import { getTenantRentStartAnchor } from './tenantPaymentCycle';
import { buildUnifiedMultiOccupancyPaymentHistory } from './multiOccupancyLedger';

/**
 * SINGLE SOURCE OF TRUTH for multi-occupancy sub-units.
 *
 * Sub-units do NOT hold their own invoices or payments. Every shilling is
 * invoiced and received on the MAIN unit. A sub-unit only reports:
 *   - its rent amount, and
 *   - a payment status (Unpaid / Partial / Paid) derived from the group
 *     ledger.
 *
 * Derivation: replay the group's cash chronologically over the group's
 * charges (sub-units first, then the main, oldest month first). Whatever
 * lands on a sub-unit for the requested month determines its status.
 */

export type SubUnitPaymentStatus = 'Paid' | 'Partial' | 'Unpaid';

export interface SubUnitStatusRow {
    tenantId: string;
    rent: number;
    allocated: number;
    status: SubUnitPaymentStatus;
}

function nextMonth(monthIso: string): string {
    const [y, m] = monthIso.split('-').map(Number);
    const dt = new Date(y, m, 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function groupStartMonth(main: TenantProfile, subs: TenantProfile[]): string | null {
    const anchors = [main, ...subs]
        .map(t => getTenantRentStartAnchor(t))
        .filter(Boolean)
        .map(a => String(a).slice(0, 7))
        .sort();
    return anchors[0] || null;
}

/**
 * Total cash received by the group on or before the END of `monthIso`.
 * Payments dated before the group's start month are included, so they show
 * up as advance credit in the onboarding month.
 */
function groupCashThroughMonth(unifiedPaymentHistory: any[], monthIso: string): number {
    return unifiedPaymentHistory.reduce((sum, p: any) => {
        if (p?.status !== 'Paid') return sum;
        const ds = String(p.date || '').slice(0, 7);
        if (!ds || ds > monthIso) return sum;
        return sum + parsePaymentAmount(p.amount);
    }, 0);
}

export function computeSubUnitStatuses(
    main: TenantProfile,
    subs: TenantProfile[],
    monthIso: string,
    opts: { unifiedPaymentHistory?: any[] } = {},
): Record<string, SubUnitStatusRow> {
    const activeSubs = subs.filter(s => s.status !== 'Vacated');
    const rows: Record<string, SubUnitStatusRow> = {};
    for (const s of activeSubs) {
        rows[s.id] = {
            tenantId: s.id,
            rent: Number(s.rentAmount || 0),
            allocated: 0,
            status: Number(s.rentAmount || 0) > 0 ? 'Unpaid' : 'Paid',
        };
    }
    if (activeSubs.length === 0) return rows;

    const history = opts.unifiedPaymentHistory
        ?? buildUnifiedMultiOccupancyPaymentHistory(main, activeSubs, {});

    let remaining = groupCashThroughMonth(history, monthIso);

    const start = groupStartMonth(main, activeSubs);
    if (!start) return rows;

    const ordered = [...activeSubs].sort((a, b) => a.id.localeCompare(b.id));

    let cursor = start;
    let guard = 0;
    while (cursor <= monthIso && guard < 600) {
        guard++;
        // Sub-units are settled before the main unit within the same month.
        for (const s of ordered) {
            const rent = Number(s.rentAmount || 0);
            if (rent <= 0) continue;
            const take = Math.max(0, Math.min(remaining, rent));
            remaining -= take;
            if (cursor === monthIso) rows[s.id].allocated = take;
        }
        // Then the main unit's own invoice for that month.
        const mainDue = Math.max(0, computeTenantTotalInvoicedForMonth(main, cursor));
        remaining = Math.max(0, remaining - Math.min(remaining, mainDue));

        if (cursor === monthIso) break;
        cursor = nextMonth(cursor);
    }

    for (const s of ordered) {
        const row = rows[s.id];
        if (row.rent <= 0) { row.status = 'Paid'; continue; }
        if (row.allocated + 0.5 >= row.rent) row.status = 'Paid';
        else if (row.allocated > 0.5) row.status = 'Partial';
        else row.status = 'Unpaid';
    }

    return rows;
}
