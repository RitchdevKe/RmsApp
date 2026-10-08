import type { Property, TenantProfile, Unit } from '../types';
import { isRepurposedUnit } from './repurposedUnits';

export const OCCUPYING_TENANT_STATUSES = new Set([
  'active',
  'overdue',
  'notice',
  'pending',
  'pendingpayment',
]);

const norm = (value: unknown) => String(value || '').trim().toLowerCase();

export const isOccupyingTenant = (tenant: TenantProfile): boolean =>
  OCCUPYING_TENANT_STATUSES.has(norm(tenant.status));

/** Direct tenant → unit match (unitId OR display unit string). */
const tenantMatchesUnitDirectly = (
  tenant: TenantProfile,
  unit: Unit,
  unitNames: string[],
  property?: Pick<Property, 'id'>,
): boolean => {
  if (property?.id && tenant.propertyId && tenant.propertyId !== property.id) return false;
  if (tenant.unitId && tenant.unitId === unit.id) return true;
  const tenantUnit = norm((tenant as any).unit);
  return !!tenantUnit && unitNames.includes(tenantUnit);
};

export const isUnitOccupiedByTenant = (
  unit: Unit,
  tenants: TenantProfile[],
  property?: Pick<Property, 'id'>,
): boolean => {
  const unitNames = [unit.unitNumber, (unit as any).unitTag, (unit as any).name]
    .map(norm)
    .filter(Boolean);
  const list = tenants || [];

  // Precompute the set of Main tenants that occupy this physical unit
  // (regardless of their own status — we treat the unit as occupied so long
  // as ANY active sub-tenant is tied to that Main).
  const mainIdsForUnit = new Set<string>();
  for (const t of list) {
    if (tenantMatchesUnitDirectly(t, unit, unitNames, property)) {
      mainIdsForUnit.add(t.id);
    }
  }

  return list.some(tenant => {
    if (!isOccupyingTenant(tenant)) return false;
    // Direct match (main tenant OR single-occupancy tenant)
    if (tenantMatchesUnitDirectly(tenant, unit, unitNames, property)) return true;
    // Sub-tenant match: the sub-tenant is linked to a Main who occupies this unit
    const mainId = (tenant as any).mainTenantId as string | undefined;
    if (mainId && mainIdsForUnit.has(mainId)) return true;
    return false;
  });
};



/**
 * A unit is "vacating soon" when its currently-linked tenant has issued notice
 * (status = 'Notice Given' / 'notice') OR has a `noticeDate` / `vacateDate` set.
 * Such units should be surfaced to affiliates/agents/tenants so they can be
 * pre-booked from the vacate date.
 */
export const getUnitVacatingInfo = (
  unit: Unit,
  tenants: TenantProfile[],
  property?: Pick<Property, 'id'>,
): { vacatingSoon: boolean; vacateDate?: string; tenantName?: string } => {
  if (unit.status !== 'Vacant' && !isUnitOccupiedByTenant(unit, tenants, property)) {
    return { vacatingSoon: false };
  }
  const linked = getLinkedTenantForUnit(unit, tenants, property);
  if (!linked) return { vacatingSoon: false };
  const status = norm(linked.status);
  const noticeDate = (linked as any).noticeDate || (linked as any).vacateDate;
  if (status === 'notice' || status === 'notice given' || !!noticeDate) {
    return { vacatingSoon: true, vacateDate: noticeDate, tenantName: linked.name };
  }
  return { vacatingSoon: false };
};

export const isUnitVacatingSoon = (
  unit: Unit,
  tenants: TenantProfile[],
  property?: Pick<Property, 'id'>,
): boolean => getUnitVacatingInfo(unit, tenants, property).vacatingSoon;

export const isUnitSafelyVacant = (
  unit: Unit,
  tenants: TenantProfile[],
  property?: Pick<Property, 'id'>,
): boolean =>
  unit.status === 'Vacant'
  && !unit.isLocked
  && !isRepurposedUnit(unit)
  && !isUnitOccupiedByTenant(unit, tenants, property);

export const getLinkedTenantForUnit = (
  unit: Unit,
  tenants: TenantProfile[],
  property?: Pick<Property, 'id'>,
): TenantProfile | undefined => {
  const unitNames = [unit.unitNumber, (unit as any).unitTag, (unit as any).name]
    .map(norm)
    .filter(Boolean);
  const list = tenants || [];

  // Prefer a direct match (the Main / single tenant of this unit).
  const direct = list.find(tenant =>
    isOccupyingTenant(tenant) && tenantMatchesUnitDirectly(tenant, unit, unitNames, property)
  );
  if (direct) return direct;

  // Fallback: return any active sub-tenant whose Main is on this unit.
  const mainIdsForUnit = new Set<string>();
  for (const t of list) {
    if (tenantMatchesUnitDirectly(t, unit, unitNames, property)) mainIdsForUnit.add(t.id);
  }
  return list.find(tenant => {
    if (!isOccupyingTenant(tenant)) return false;
    const mainId = (tenant as any).mainTenantId as string | undefined;
    return !!mainId && mainIdsForUnit.has(mainId);
  });
};
