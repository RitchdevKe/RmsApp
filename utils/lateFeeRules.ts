import type { FineRule, TenantProfile } from '../types';

/**
 * Late-fee rule resolver.
 *
 * Callers pass the full list of fines (from useData().fines) plus the tenant.
 * We pick the most specific active rule that applies:
 *   1) rule.type is "Late Fee" / "Late Rent" / "Late Payment Fine"
 *   2) propertyId matches the tenant's property (specific > 'ALL')
 *   3) active !== false
 *
 * If no rule matches, callers should fall back to their legacy behavior
 * (typically the systemSettings.lateFeePerDay flat value).
 */

const LATE_TYPES = new Set(['late fee', 'late rent', 'late payment fine', 'late payment']);

function isLateFeeRule(rule: FineRule): boolean {
    return LATE_TYPES.has(String(rule.type || '').trim().toLowerCase());
}

export function resolveLateFeeRule(fines: FineRule[] | undefined, tenant: Pick<TenantProfile, 'propertyId'>): FineRule | null {
    const rules = (fines || []).filter(f => isLateFeeRule(f) && f.active !== false);
    if (rules.length === 0) return null;
    const specific = rules.find(r => r.propertyId && r.propertyId !== 'ALL' && r.propertyId === tenant.propertyId);
    if (specific) return specific;
    const all = rules.find(r => !r.propertyId || r.propertyId === 'ALL');
    return all || rules[0];
}

/**
 * Compute the late-fee accrual for a single month given a resolved rule.
 * If no rule is provided the legacy per-day flat calculation is used.
 */
export function computeLateFeeForMonth(opts: {
    rule?: FineRule | null;
    daysLate: number;
    monthlyRent: number;
    outstandingArrears: number;
    lateFeePerDayFallback?: number;
}): number {
    const daysLate = Math.max(0, Number(opts.daysLate || 0));
    if (daysLate <= 0) return 0;
    const rule = opts.rule || null;
    if (!rule) {
        const perDay = Number(opts.lateFeePerDayFallback || 0);
        return Math.round(daysLate * perDay);
    }
    const value = Number(rule.value || 0);
    let base = 0;
    switch (rule.basis) {
        case 'Fixed Daily':
            base = daysLate * value;
            break;
        case 'Percentage of Rent':
            base = (Number(opts.monthlyRent || 0) * value) / 100;
            break;
        case 'Percentage of Arrears':
            base = (Number(opts.outstandingArrears || 0) * value) / 100;
            break;
        case 'Fixed Fee':
            base = value;
            break;
        case 'Percentage':
            base = (Number(opts.monthlyRent || 0) * value) / 100;
            break;
        default:
            base = daysLate * Number(opts.lateFeePerDayFallback || 0);
    }
    // Apply optional cap
    if (rule.capType === 'fixed' && rule.capValue) {
        base = Math.min(base, Number(rule.capValue));
    } else if (rule.capType === 'percent_rent' && rule.capValue) {
        base = Math.min(base, (Number(opts.monthlyRent || 0) * Number(rule.capValue)) / 100);
    }
    return Math.max(0, Math.round(base));
}
