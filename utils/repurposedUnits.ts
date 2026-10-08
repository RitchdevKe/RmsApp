import type { Unit } from '@/types';

// A "repurposed" unit is one that is neither rentable-vacant nor occupied
// by a paying tenant. Per product rules, the following count as repurposed:
//   - primary status: Distressed, Unhabitable, Landlords residence, Under Maintenance
//   - additive flags: landlordResidence, caretakerAssigned, usedAsStore
export const REPURPOSED_PRIMARY_STATUSES = [
  'Distressed',
  'Unhabitable',
  'Landlords residence',
  'Under Maintenance',
] as const;

export const isRepurposedUnit = (u: Partial<Unit> | undefined | null): boolean => {
  if (!u) return false;
  if (u.status && (REPURPOSED_PRIMARY_STATUSES as readonly string[]).includes(u.status as string)) return true;
  if ((u as any).landlordResidence) return true;
  if ((u as any).caretakerAssigned) return true;
  if ((u as any).usedAsStore) return true;
  return false;
};

export const countUnitBuckets = (units: Unit[] = []) => {
  let occupied = 0;
  let vacant = 0;
  let repurposed = 0;
  for (const u of units) {
    if (isRepurposedUnit(u)) { repurposed++; continue; }
    if (u.status === 'Occupied') occupied++;
    else vacant++;
  }
  return { total: units.length, occupied, vacant, repurposed };
};
