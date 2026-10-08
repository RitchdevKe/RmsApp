import type { TenantProfile } from '../types';
import { isOccupyingTenant } from './unitOccupancy';

const norm = (value: unknown) => String(value || '').trim().toLowerCase();

const OCCUPANCY_STATUS_RANK: Record<string, number> = {
  active: 0,
  overdue: 1,
  notice: 2,
  pendingpayment: 3,
  pending: 4,
  pendingapproval: 5,
  pendingallocation: 6,
};

function occupantDateRank(tenant: TenantProfile): number {
  const raw = tenant.activationDate || tenant.leaseStartDate || tenant.rentStartDate || tenant.onboardingDate || tenant.dateRegistered || '';
  const ts = Date.parse(String(raw));
  return Number.isFinite(ts) ? ts : Number.MAX_SAFE_INTEGER;
}

function occupantRank(tenant: TenantProfile, index: number): [number, number, number] {
  return [
    OCCUPANCY_STATUS_RANK[norm(tenant.status)] ?? 99,
    occupantDateRank(tenant),
    index,
  ];
}

function compareRank(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

function unitOccupancyKey(tenant: TenantProfile): string | null {
  if (!isOccupyingTenant(tenant)) return null;
  const property = norm(tenant.propertyId || tenant.propertyName);
  const unitId = norm(tenant.unitId);
  if (property && unitId) return `${property}::id::${unitId}`;
  const unitName = norm(tenant.unit);
  if (property && unitName) return `${property}::name::${unitName}`;
  return null;
}

function releaseDuplicateUnitAssignment<T extends TenantProfile>(tenant: T): T {
  return {
    ...tenant,
    status: 'PendingAllocation' as T['status'],
    propertyId: undefined,
    propertyName: undefined,
    unitId: undefined,
    unit: '',
    leaseStartDate: undefined,
    leaseEnd: undefined,
  };
}

function clearPrematureUnitAssignment<T extends TenantProfile>(tenant: T): T {
  const status = norm(tenant.status).replace(/[\s_-]/g, '');
  if (status !== 'pendingapproval' && status !== 'pendingallocation') return tenant;
  // Never strip a unit off a tenant that already has money posted against it —
  // a payment can only be recorded once the payment is matched to a unit.
  if ((tenant.paymentHistory || []).some(p => p?.status === 'Paid')) return tenant;
  if (!tenant.propertyId && !tenant.propertyName && !tenant.unitId && !tenant.unit) return tenant;

  return {
    ...tenant,
    propertyId: undefined,
    propertyName: undefined,
    unitId: undefined,
    unit: '',
    rentAmount: 0,
    leaseStartDate: undefined,
    leaseEnd: undefined,
  };
}

export function enforceSingleTenantPerUnit<T extends TenantProfile>(tenants: T[]): T[] {
  const sanitized = tenants.map(clearPrematureUnitAssignment);
  const winners = new Map<string, { id: string; rank: [number, number, number] }>();

  sanitized.forEach((tenant, index) => {
    const key = unitOccupancyKey(tenant);
    if (!key) return;
    const rank = occupantRank(tenant, index);
    const current = winners.get(key);
    if (!current || compareRank(rank, current.rank) < 0) {
      winners.set(key, { id: tenant.id, rank });
    }
  });

  let changed = false;
  const cleaned = sanitized.map(tenant => {
    const key = unitOccupancyKey(tenant);
    if (!key) return tenant;
    const winner = winners.get(key);
    if (!winner || winner.id === tenant.id) return tenant;
    changed = true;
    return releaseDuplicateUnitAssignment(tenant);
  });

  const sanitizedChanged = sanitized.some((tenant, index) => tenant !== tenants[index]);
  return changed || sanitizedChanged ? cleaned : tenants;
}
