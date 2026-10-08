import type { MarketplaceListing, Property } from '../types';

/**
 * Generate a unique payment-account tag (e.g. "TP-001") for a third-party
 * Marketplace listing. The tag is used as the M-Pesa / STK push account
 * number, so it must be unique across managed unit tags AND other
 * marketplace listings.
 */
export function generateThirdPartyPaymentTag(
  properties: Property[],
  listings: MarketplaceListing[],
): string {
  const used = new Set<string>();
  properties.forEach(p =>
    (p.units || []).forEach(u => { if (u.unitTag) used.add(u.unitTag.toUpperCase()); }),
  );
  listings.forEach(l => { if (l.paymentTag) used.add(l.paymentTag.toUpperCase()); });

  for (let i = 1; i < 10000; i++) {
    const candidate = `TP-${String(i).padStart(3, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
  // Fallback — extremely unlikely.
  return `TP-${Date.now().toString().slice(-6)}`;
}

export function isPaymentTagUnique(
  tag: string,
  properties: Property[],
  listings: MarketplaceListing[],
  ignoreListingId?: string,
): boolean {
  const t = (tag || '').trim().toUpperCase();
  if (!t) return false;
  for (const p of properties) {
    for (const u of p.units || []) {
      if ((u.unitTag || '').toUpperCase() === t) return false;
    }
  }
  for (const l of listings) {
    if (l.id === ignoreListingId) continue;
    if ((l.paymentTag || '').toUpperCase() === t) return false;
  }
  return true;
}