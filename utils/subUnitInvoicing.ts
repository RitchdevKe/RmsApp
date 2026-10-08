import type { TenantProfile } from '../types';

/**
 * Sub-unit "Total Invoiced" for the given month.
 *
 * SINGLE SOURCE OF INVOICING: all invoicing and payments for a
 * multi-occupancy group happen on the MAIN unit. A sub-unit therefore
 * contributes exactly its rent to the group invoice — it has no arrears,
 * bills, fines or late fees of its own (those would be duplicate,
 * parallel calculations).
 */
export function computeSubUnitInvoicedForMonth(
    tenant: TenantProfile,
    _currentMonthIso?: string,
): number {
    return Math.max(0, Number(tenant.rentAmount || 0));
}

export function computeSubUnitsInvoicedTotal(
    allTenants: TenantProfile[],
    mainTenantId: string,
    currentMonthIso: string,
): number {
    const mainTenant = allTenants.find(t => t.id === mainTenantId);
    if (!mainTenant || mainTenant.occupancyType !== 'Main') {
        return 0;
    }
    return allTenants
        .filter(t => t.mainTenantId === mainTenantId && t.status !== 'Vacated')
        .reduce((s, t) => s + computeSubUnitInvoicedForMonth(t, currentMonthIso), 0);
}
