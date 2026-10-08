import type { MarketplaceListing } from '../types';

/**
 * Third-party listing placement helpers.
 *
 * For listings the agency markets but does NOT manage:
 *  - Tenant pays (rent + deposit) to the agency.
 *  - Agency retains a placement fee (default: first month rent).
 *  - Remainder is owed to the property owner and disbursed later.
 *
 * These helpers compute the split and return patched `placement` blocks.
 * They never mutate input objects.
 */

export interface PlacementBreakdown {
  rent: number;
  deposit: number;
  expectedTotal: number;
  placementFee: number;
  ownerPayable: number;
  shortfall: number; // > 0 means the tenant under-paid
}

export function computePlacement(
  listing: MarketplaceListing,
  paidAmount: number,
): PlacementBreakdown {
  const rent = Number(listing.price || 0);
  const deposit = Number(listing.rentConfig?.depositAmount || 0);
  const expectedTotal = rent + deposit;
  const paid = Math.max(0, Number(paidAmount || 0));

  const model = listing.rentConfig?.placementFeeModel || 'FirstMonthRent';
  let placementFee = 0;
  if (model === 'FirstMonthRent') placementFee = rent;
  else if (model === 'PercentOfRent')
    placementFee = Math.round(((listing.rentConfig?.placementFeePercent || 0) / 100) * rent);
  else if (model === 'FlatFee') placementFee = Math.round(listing.rentConfig?.placementFeeFlat || 0);

  // Cap fee at what we actually received.
  placementFee = Math.min(placementFee, paid);
  const ownerPayable = Math.max(0, paid - placementFee);
  const shortfall = Math.max(0, expectedTotal - paid);

  return { rent, deposit, expectedTotal, placementFee, ownerPayable, shortfall };
}

export function markCollected(
  listing: MarketplaceListing,
  amountCollected: number,
  leadId?: string,
): MarketplaceListing['placement'] {
  const b = computePlacement(listing, amountCollected);
  return {
    status: 'Collected',
    leadId,
    collectedOn: new Date().toISOString(),
    amountCollected,
    placementFee: b.placementFee,
    ownerPayable: b.ownerPayable,
  };
}

export function markDisbursed(
  listing: MarketplaceListing,
  reference: string,
): MarketplaceListing['placement'] {
  return {
    ...(listing.placement || { status: 'Collected' }),
    status: 'Disbursed',
    disbursedOn: new Date().toISOString(),
    disbursementRef: reference,
  };
}
