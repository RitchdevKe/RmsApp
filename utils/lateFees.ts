const LATE_FEE_TYPES = new Set(['late rent', 'late fee', 'late payment fine']);

export function isLateFeeType(type?: string | null): boolean {
    return LATE_FEE_TYPES.has(String(type || '').trim().toLowerCase());
}
