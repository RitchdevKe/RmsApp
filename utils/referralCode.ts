/**
 * Referral code utilities.
 *
 * Personal short code format: {3-char name prefix}{3-char base-36 ID hash}
 * Example: Joseph (id abc123) → JOS4K2  (always the same for that person)
 * Max 6 characters — easy to share verbally or via text.
 *
 * Unit-specific code format: {3-char name prefix}{unit number}{1 unique char}
 * Example: Joseph referring KIR/15 → JOSKIR/15J
 *
 * The unique character is deterministically derived from the referrer's ID so
 * that two people with the same name prefix get different discriminator chars,
 * and the same person always gets the same code for the same unit.
 */

/** Simple deterministic hash → A-Z letter. */
function hashToLetter(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) & 0x7fffffff;
    }
    return String.fromCharCode(65 + (hash % 26));
}

/**
 * Generate a short personal referral code for any user (6 chars).
 * Format: {3 uppercase name chars}{3 uppercase base-36 ID hash}
 * Examples: "Joseph Mwangi" + any-id → "JOS4K2"
 *           "Mary Wanjiku"  + any-id → "MAR7YQ"
 *
 * Deterministic — same inputs always produce the same code.
 */
export function generateUserReferralCode(name: string, id: string): string {
    const firstName = (name || '').split(' ')[0];
    const namePrefix = firstName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');

    // Hash the id into a 0–46655 number (36^3 combinations)
    let hash = 0;
    const key = (id || '').replace(/-/g, '');
    for (let i = 0; i < key.length; i++) {
        hash = (hash * 31 + key.charCodeAt(i)) & 0x7fffffff;
    }
    const suffix = (hash % 46656).toString(36).toUpperCase().padStart(3, '0');
    return `${namePrefix}${suffix}`;
}

/**
 * Generate a unit-specific referral code.
 * @param referrerName  Full name of the referrer (e.g. "Joseph Mwangi")
 * @param unitNumber    Unit tag/number (e.g. "KIR/15")
 * @param referrerId    Referrer's system ID (used for deterministic uniqueness)
 */
export function generateUnitReferralCode(
    referrerName: string,
    unitNumber: string,
    referrerId: string
): string {
    const firstName = (referrerName || '').split(' ')[0];
    const namePrefix = firstName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
    const unitTag = unitNumber.toUpperCase();
    const uniqueChar = hashToLetter(referrerId + unitNumber);
    return `${namePrefix}${unitTag}${uniqueChar}`;
}

/**
 * Extract the unit tag embedded in a unit-specific referral code.
 * Returns null if the code is too short or appears to be a legacy code.
 * Format: {3 name chars}{unit tag}{1 unique char}
 */
export function extractUnitTagFromCode(code: string): string | null {
    if (!code || code.length < 5) return null;
    const tag = code.slice(3, -1);
    return tag || null;
}

/**
 * Resolve a referral code (any format) to a referrer's system ID.
 * Tries in order:
 *   1. Exact match against a stored `referralCode` property
 *   2. Legacy UUID-prefix match (12 hex chars, existing behaviour)
 *   3. New unit-specific format: name prefix + unit tag + discriminator char
 */
export function resolveReferralCode(
    code: string,
    people: Array<{ id: string; name: string; referralCode?: string }>
): string | undefined {
    if (!code) return undefined;
    const upper = code.toUpperCase().trim();

    // 1. Exact stored referralCode match (affiliates etc.)
    const exact = people.find(p => p.referralCode?.toUpperCase() === upper);
    if (exact) return exact.id;

    // 2. Legacy UUID-prefix match
    const uuidMatch = people.find(
        p => p.id && String(p.id).replace(/-/g, '').slice(0, 12).toUpperCase() === upper
    );
    if (uuidMatch) return uuidMatch.id;

    // 3. Short personal code — exactly 6 chars: {3 name}{3 base-36 hash}
    if (upper.length === 6) {
        const namePrefix = upper.slice(0, 3);
        const suffix = upper.slice(3);
        const personalMatch = people.find(p => {
            const fn = (p.name || '').split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
            if (fn !== namePrefix) return false;
            const key = (p.id || '').replace(/-/g, '');
            let hash = 0;
            for (let i = 0; i < key.length; i++) {
                hash = (hash * 31 + key.charCodeAt(i)) & 0x7fffffff;
            }
            return (hash % 46656).toString(36).toUpperCase().padStart(3, '0') === suffix;
        });
        if (personalMatch) return personalMatch.id;
    }

    // 4. Unit-specific format — minimum 5 chars: {3 name}{>=1 unit}{1 char}
    if (upper.length >= 5) {
        const namePrefix = upper.slice(0, 3);
        const unitTag = upper.slice(3, -1);
        const uniqueChar = upper.slice(-1);
        const newMatch = people.find(p => {
            const fn = (p.name || '').split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3).padEnd(3, 'X');
            if (fn !== namePrefix) return false;
            return hashToLetter(p.id + unitTag) === uniqueChar;
        });
        if (newMatch) return newMatch.id;
    }

    return undefined;
}
