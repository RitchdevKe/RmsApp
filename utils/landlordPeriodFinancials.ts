import { Bill, CommissionRule, DeductionRule, Property, Task, TenantProfile } from '../types';
import { getRevenueSplitBuckets, isAgencyRevenueStream } from './revenueSplit';

/** Paid tenant receipts in a calendar month (YYYY-MM). */
export function sumTenantPaymentsInPeriod(tenant: TenantProfile, period: string): number {
    return tenant.paymentHistory
        .filter(p => p.date.startsWith(period) && p.status === 'Paid')
        .reduce((s, p) => s + (parseFloat(String(p.amount).replace(/[^0-9.]/g, '')) || 0), 0);
}

/** Management commission and MRI should not apply to rent that was taken as placement fee (agency revenue). */
export function isAgencyFeeOnRentRule(ruleName: string): boolean {
    const n = ruleName.toLowerCase();
    return (
        n.includes('management') ||
        n.includes('mri') ||
        n.includes('rental income tax') ||
        n.includes('monthly rental income')
    );
}

/**
 * Resolve the agency commission rate for a property.
 * Priority: property.agencyCommissionPercent → global 'Rent Collection' CommissionRule → 10% default.
 * Returns `{ rate, fixed }` where `fixed` is non-null when the global rule is a flat KES amount
 * AND the property has not overridden it.
 */
export function getPropertyAgencyCommission(
    property: Property | undefined,
    commissionRules: CommissionRule[]
): { rate: number; fixed: number | null } {
    if (property) {
        if (property.agencyCommissionType === 'flat' && typeof property.agencyCommissionFlat === 'number') {
            return { rate: 0, fixed: property.agencyCommissionFlat };
        }
        if (typeof property.agencyCommissionPercent === 'number') {
            return { rate: property.agencyCommissionPercent / 100, fixed: null };
        }
    }
    const rule = commissionRules.find(r => r.trigger === 'Rent Collection');
    if (!rule) return { rate: 0.10, fixed: null };
    if (rule.rateType === '%') return { rate: rule.rateValue / 100, fixed: null };
    return { rate: 0, fixed: rule.rateValue };
}

export function computePlacementFeeDeduction(
    myTenants: TenantProfile[],
    properties: Property[],
    period: string
): { placementFeeDeduction: number; placementLines: Array<{ description: string; amount: number }> } {
    const newTenants = myTenants.filter(t => {
        const startDate = t.rentStartDate;
        const isStartDateInPeriod = startDate && startDate.startsWith(period);
        const isNewTenant = t.tenantOnboardingType !== 'Existing' && !t.existingTenantSetup;
        const hasPaid = sumTenantPaymentsInPeriod(t, period) > 0;
        return isStartDateInPeriod && isNewTenant && hasPaid;
    });
    let placementFeeDeduction = 0;
    const placementLines: Array<{ description: string; amount: number }> = [];
    newTenants.forEach(t => {
        const prop = properties.find(p => p.id === t.propertyId);
        const isPlacementFeeActive = prop?.placementFee !== false;
        if (isPlacementFeeActive) {
            const amount = t.firstMonthRent || t.rentAmount || 0;
            placementFeeDeduction += amount;
            placementLines.push({ description: `Placement Fee: ${t.name}`, amount });
        }
    });
    return { placementFeeDeduction, placementLines };
}

export function filterActiveRulesForLandlord(
    deductionRules: DeductionRule[],
    landlordId: string,
    myProperties: Property[]
): DeductionRule[] {
    return deductionRules.filter(
        r =>
            r.status === 'Active' &&
            (r.applicability === 'Global' ||
                (r.applicability === 'Specific Landlord' && r.targetId === landlordId) ||
                (r.applicability === 'Specific Property' && myProperties.some(p => p.id === r.targetId)))
    );
}

/**
 * Payout-period view: percentages apply to **collected** rent for Collection-Based
 * properties, and to **expected occupied** rent for Occupancy-Based properties.
 * Agency-style rules exclude rent booked as placement fee.
 */
const OCCUPYING_STATUSES = ['active', 'pending', 'pendingallocation', 'pendingpayment', 'pendingapproval', 'overdue', 'notice'];
const normalizeUnitVal = (v: any) => String(v || '').trim().toLowerCase();
function expectedOccupiedRentForProp(prop: Property, myTenants: TenantProfile[]): number {
    const propTenants = myTenants.filter(t => t.propertyId === prop.id);
    const unitBased = (prop.units || []).reduce((sum: number, unit: any) => {
        const unitRent = propTenants
            .filter(t =>
                OCCUPYING_STATUSES.includes(String(t.status || '').toLowerCase()) &&
                (
                    (t.unitId && t.unitId === unit.id) ||
                    (normalizeUnitVal(t.unit) && [unit.unitNumber, unit.unitTag, (unit as any).name]
                        .some((c: any) => normalizeUnitVal(c) === normalizeUnitVal(t.unit)))
                )
            )
            .reduce((max: number, t) => Math.max(max, Number(t.rentAmount) || 0), 0);
        return sum + unitRent;
    }, 0);
    if (unitBased > 0) return unitBased;
    // Fallback: sum rentAmount of all occupying tenants when unit mapping is missing.
    return propTenants
        .filter(t => OCCUPYING_STATUSES.includes(String(t.status || '').toLowerCase()))
        .reduce((s, t) => s + (Number(t.rentAmount) || 0), 0);
}

export function computeCollectedRuleDeductions(
    rules: DeductionRule[],
    myProperties: Property[],
    myTenants: TenantProfile[],
    period: string,
    collectedGross: number,
    placementFeeDeduction: number
): { total: number; lines: Array<{ description: string; amount: number }> } {
    const baseForAgency =
        placementFeeDeduction > 0 ? Math.max(0, collectedGross - placementFeeDeduction) : collectedGross;

    let total = 0;
    const lines: Array<{ description: string; amount: number }> = [];

    const propBaseForAgency = (prop: Property): number => {
        const propTenants = myTenants.filter(t => t.propertyId === prop.id);
        if (prop.remittanceType === 'Occupancy Based') {
            return expectedOccupiedRentForProp(prop, myTenants);
        }
        const propCollected = propTenants.reduce(
            (s, t) => s + sumTenantPaymentsInPeriod(t, period),
            0
        );
        if (placementFeeDeduction > 0) {
            const placementOnProp = propTenants
                .filter(t => {
                    const startDate = t.rentStartDate;
                    const isStartDateInPeriod = startDate && startDate.startsWith(period);
                    const isNewTenant = t.tenantOnboardingType !== 'Existing' && !t.existingTenantSetup;
                    const hasPaid = sumTenantPaymentsInPeriod(t, period) > 0;
                    return isStartDateInPeriod && isNewTenant && hasPaid;
                })
                .reduce((s, t) => s + (t.firstMonthRent || t.rentAmount || 0), 0);
            return Math.max(0, propCollected - placementOnProp);
        }
        return propCollected;
    };

    rules.forEach(r => {
        let amount = 0;
        if (r.type === 'Fixed') {
            amount = r.value;
        } else {
            if (r.applicability === 'Specific Property') {
                const prop = myProperties.find(p => p.id === r.targetId);
                if (prop) {
                    const base = isAgencyFeeOnRentRule(r.name)
                        ? propBaseForAgency(prop)
                        : (prop.remittanceType === 'Occupancy Based'
                            ? expectedOccupiedRentForProp(prop, myTenants)
                            : myTenants.filter(t => t.propertyId === prop.id).reduce((s, t) => s + sumTenantPaymentsInPeriod(t, period), 0));
                    if (isAgencyFeeOnRentRule(r.name) && prop.agencyCommissionType === 'flat' && typeof prop.agencyCommissionFlat === 'number') {
                        amount = prop.agencyCommissionFlat;
                    } else {
                        const rate = isAgencyFeeOnRentRule(r.name) && typeof prop.agencyCommissionPercent === 'number'
                            ? prop.agencyCommissionPercent / 100
                            : r.value / 100;
                        amount = base * rate;
                    }
                }
            } else if (isAgencyFeeOnRentRule(r.name)) {
                let totalPropAgencyDeduction = 0;
                myProperties.forEach(prop => {
                    const base = propBaseForAgency(prop);
                    if (prop.agencyCommissionType === 'flat' && typeof prop.agencyCommissionFlat === 'number') {
                        totalPropAgencyDeduction += prop.agencyCommissionFlat;
                    } else {
                        const rate = (typeof prop.agencyCommissionPercent === 'number')
                            ? prop.agencyCommissionPercent / 100
                            : r.value / 100;
                        totalPropAgencyDeduction += base * rate;
                    }
                });
                amount = totalPropAgencyDeduction;
            } else {
                // Non-agency rules keyed off collected gross (portfolio-wide)
                amount = collectedGross * (r.value / 100);
            }
        }
        total += amount;
        lines.push({ description: r.name, amount });
    });

    return { total, lines };
}

export function computeBillDeductionsForPeriod(
    bills: Bill[],
    myProperties: Property[],
    period: string
): { total: number; lines: Array<{ description: string; amount: number }> } {
    const periodBills = bills.filter(
        b => myProperties.some(p => p.id === b.propertyId) && b.invoiceDate.startsWith(period)
    );
    let total = 0;
    const lines: Array<{ description: string; amount: number }> = [];
    periodBills.forEach(b => {
        const amt = Number(b.amount) || 0;
        total += amt;
        lines.push({ description: `${b.category} - ${b.vendor}`, amount: amt });
    });
    return { total, lines };
}

export function computeMaintenanceFromTasksForPeriod(
    tasks: Task[],
    myProperties: Property[],
    period: string
): { total: number; lines: Array<{ description: string; amount: number }> } {
    const myTasks = tasks.filter(t => myProperties.some(p => p.name === t.property));
    const periodTasks = myTasks.filter(
        t => (t.status === 'Completed' || t.status === 'Closed') && t.dueDate.startsWith(period)
    );
    let total = 0;
    const lines: Array<{ description: string; amount: number }> = [];
    periodTasks.forEach(t => {
        const cost =
            (t.costs?.labor || 0) + (t.costs?.materials || 0) + (t.costs?.travel || 0);
        if (cost > 0) {
            total += cost;
            lines.push({ description: `Maint: ${t.title} (${t.property})`, amount: cost });
        }
    });
    return { total, lines };
}

// ── Partial Management ────────────────────────────────────────────────────────

/**
 * Generates the end-of-month invoice the agency sends to a Partial Management landlord.
 *
 * Financial flow for Partial Management:
 *   - Tenants pay rent directly to the landlord's own M-Pesa paybill.
 *   - The agency does NOT collect rent and therefore has nothing to remit.
 *   - Instead, at end of month the agency invoices the landlord for:
 *       1. Placement fee  — one month's rent for each new tenant placed in the period.
 *       2. Management fee — a percentage of the gross (expected) rent for the period,
 *                          derived from commissionRules (same rules as Full Management)
 *                          or defaulting to 10 % if no matching rule is configured.
 *       3. Bills          — any vendor/utility bills raised against the property.
 *       4. Maintenance    — cost of completed maintenance tasks in the period.
 *
 * Tenant payment history is still tracked per-tenant so arrears, overdue status,
 * and collection logs continue to work as normal.
 *
 * @param myTenants       All active tenants for this landlord's properties.
 * @param myProperties    All properties (Partial Management) belonging to this landlord.
 * @param bills           Global bills list (filtered internally to myProperties).
 * @param tasks           Global tasks list (filtered internally to myProperties).
 * @param commissionRules Agency commission rules (used to derive management fee %).
 * @param period          Calendar month in YYYY-MM format.
 */
export function computePartialManagementInvoice(
    myTenants: TenantProfile[],
    myProperties: Property[],
    bills: Bill[],
    tasks: Task[],
    commissionRules: CommissionRule[],
    period: string
): {
    invoiceLines: Array<{ description: string; amount: number; category: string }>;
    totalAmount: number;
    breakdown: {
        placementFee: number;
        managementFee: number;
        bills: number;
        maintenance: number;
    };
} {
    const invoiceLines: Array<{ description: string; amount: number; category: string }> = [];

    // ── 1. Placement Fee ────────────────────────────────────────────────────
    // For each new tenant onboarded in this period, charge the landlord one
    // month's rent as placement fee (same condition as Full Management, but
    // here it becomes a charge TO the landlord rather than a deduction from remittance).
    let placementTotal = 0;
    myTenants
        .filter(t => {
            const startDate = t.rentStartDate;
            const isStartDateInPeriod = startDate && startDate.startsWith(period);
            const isNewTenant = t.tenantOnboardingType !== 'Existing' && !t.existingTenantSetup;
            const hasPaid = sumTenantPaymentsInPeriod(t, period) > 0;
            return isStartDateInPeriod && isNewTenant && hasPaid;
        })
        .forEach(t => {
            const prop = myProperties.find(p => p.id === t.propertyId);
            if (prop?.placementFee !== false && !isAgencyRevenueStream(prop, 'placementFee')) {
                const amt = t.firstMonthRent || t.rentAmount || 0;
                placementTotal += amt;
                invoiceLines.push({
                    description: `Placement Fee – ${t.name} (${prop?.name ?? ''})`,
                    amount: amt,
                    category: 'Placement Fee',
                });
            }
        });

    // ── 2. Management Fee (per-property rate) ───────────────────────────────
    // For each property, base = expected gross rent for Occupancy Based, or collected gross rent in this period for other types.
    // Plus any collected late fees / fines (including arrears) in this period.
    // Rate = property.agencyCommissionPercent → global 'Rent Collection' rule → 10%.
    let managementFeeAmount = 0;
    myProperties.forEach(prop => {
        const propTenants = myTenants.filter(t => t.propertyId === prop.id);
        
        // Rent collected for this property in current period (includes rent arrears)
        const propCollectedRent = propTenants.reduce((s, t) => s + sumTenantPaymentsInPeriod(t, period), 0);

        // Fines / late fees collected for this property in current period (includes late fee/fine arrears)
        let propCollectedFines = 0;
        propTenants.forEach(t => {
            (t.outstandingFines || []).forEach(f => {
                if (f.status === 'Paid' && f.date.startsWith(period)) {
                    propCollectedFines += Number(f.amount) || 0;
                }
            });
            (t.existingTenantSetup?.fineLedger || (t as any).fineLedger || []).forEach(f => {
                if (f.status === 'Paid' && f.date.startsWith(period)) {
                    propCollectedFines += Number(f.amount) || 0;
                }
            });
        });

        // Base rent is expected rent for Occupancy Based, and actual collected rent for non-occupancy based
        const propRentBase = (prop.remittanceType === 'Occupancy Based')
            ? propTenants.reduce((s, t) => s + (t.rentAmount || 0), 0)
            : propCollectedRent;

        const propTotalBase = propRentBase + propCollectedFines;
        if (propTotalBase <= 0) return;

        const { rate, fixed } = getPropertyAgencyCommission(prop, commissionRules);
        const propFee = fixed !== null ? fixed : propTotalBase * rate;
        if (propFee <= 0) return;

        managementFeeAmount += propFee;
        const label = fixed !== null
            ? `KES ${fixed.toLocaleString()}`
            : `${(rate * 100).toFixed(1)}% of KES ${propTotalBase.toLocaleString()}`;
        invoiceLines.push({
            description: `Management Fee – ${prop.name} (${label})`,
            amount: propFee,
            category: 'Management Fee',
        });
    });

    // ── 3. Bills ────────────────────────────────────────────────────────────
    const invoiceableProps = myProperties.filter(p => getRevenueSplitBuckets(p.collectionSplit?.type).agencyInvoices);
    const { total: billsTotal, lines: billLines } = computeBillDeductionsForPeriod(bills, invoiceableProps, period);
    billLines.forEach(l => invoiceLines.push({ ...l, category: 'Bill' }));

    // ── 4. Maintenance ──────────────────────────────────────────────────────
    const { total: maintTotal, lines: maintLines } = computeMaintenanceFromTasksForPeriod(tasks, invoiceableProps, period);
    maintLines.forEach(l => invoiceLines.push({ ...l, category: 'Maintenance' }));

    const totalAmount = placementTotal + managementFeeAmount + billsTotal + maintTotal;

    return {
        invoiceLines,
        totalAmount,
        breakdown: {
            placementFee: placementTotal,
            managementFee: managementFeeAmount,
            bills: billsTotal,
            maintenance: maintTotal,
        },
    };
}
