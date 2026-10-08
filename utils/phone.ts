// utils/phone.ts
//
// Client-side phone normalization. Mirrors app.canonicalize_phone() in
// migration 0029 so client-side dup-checks and server-side constraints see
// the same canonical form. Inputs like "0712 345 678", "+254712345678",
// "712345678", and "254712345678" all normalize to "254712345678".

export function canonicalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10 && digits.startsWith('0')) return '254' + digits.slice(1);
  if (digits.length === 9 && (digits.startsWith('7') || digits.startsWith('1'))) return '254' + digits;
  if (digits.length === 12 && digits.startsWith('254')) return digits;
  return digits;
}

// Shows a phone number without the leading 254 country code for display.
// "254712345678" → "0712345678". Non-canonical inputs are returned as-is.
export function displayPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const canonical = canonicalizePhone(raw);
  if (!canonical) return raw;
  if (canonical.startsWith('254') && canonical.length === 12) {
    return '0' + canonical.slice(3);
  }
  return raw;
}

// Strips all non-digit characters — use as an input onChange filter so the
// user can only type digits into phone/ID fields.
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}
