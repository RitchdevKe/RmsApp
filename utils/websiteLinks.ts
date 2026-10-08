
/**
 * Central website URL utility.
 *
 * Set VITE_WEBSITE_URL in your .env to override the default:
 *   VITE_WEBSITE_URL=https://task-me.ke
 *
 * All share/referral link construction goes through here so there is
 * exactly one place to update when routes change.
 *
 * Links resolve to the app's own ReferralLanding page
 * (/#/user-app-portal/referral-landing) so they are always functional
 * regardless of whether an external website is live.
 */
const WEBSITE_BASE = (
    ((import.meta as any).env?.VITE_WEBSITE_URL as string) ?? 'https://task-me.ke'
).replace(/\/$/, '');

const LANDING = `${WEBSITE_BASE}/#/user-app-portal/referral-landing`;

const PROPERTY_ID_PATTERN = /^prop-[a-z0-9-]+$/i;

const buildHashUrl = (path: string): string => `${WEBSITE_BASE}/#${path.startsWith('/') ? path : `/${path}`}`;

const unitSlug = (unitNumber: string): string =>
    unitNumber.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

const appendQueryParam = (url: string, key: string, value?: string | null): string => {
    const trimmed = (url || '').trim().replace(/\/$/, '');
    if (!trimmed || !value) return trimmed;

    const [beforeHash, hashPart] = trimmed.split('#', 2);
    if (hashPart !== undefined) {
        const [hashPath, hashQuery = ''] = hashPart.split('?', 2);
        const params = new URLSearchParams(hashQuery);
        params.set(key, value);
        const query = params.toString();
        return `${beforeHash}#${hashPath}${query ? `?${query}` : ''}`;
    }

    const [path, queryString = ''] = trimmed.split('?', 2);
    const params = new URLSearchParams(queryString);
    params.set(key, value);
    const query = params.toString();
    return `${path}${query ? `?${query}` : ''}`;
}

const normalizeListingUrl = (url: string): string => {
    const trimmed = (url || '').trim().replace(/\/$/, '');
    if (!trimmed) return trimmed;
    if (trimmed.includes('/#/')) return trimmed;

    try {
        const parsed = new URL(trimmed);
        if (parsed.origin === WEBSITE_BASE && parsed.pathname.startsWith('/properties/')) {
            const path = parsed.pathname.replace(/^\/properties/, '/properties');
            return `${WEBSITE_BASE}/#${path}${parsed.search}`;
        }
    } catch {
        if (trimmed.startsWith('/properties/')) {
            return `${WEBSITE_BASE}/#${trimmed}`;
        }
    }

    return trimmed;
}

/**
 * Convert a property/unit name to a URL-safe slug.
 * e.g. "Baraka Heights" → "baraka-heights"
 */
export const slugify = (text: string): string =>
    (text || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const websiteLinks = {
    base: WEBSITE_BASE,

    /**
     * Generate the canonical website listing URL for a property (or a unit within it).
     * Convention: https://task-me.ke/properties/<prop-slug>[?unit=<unit-slug>]
     * This is the source-of-truth for two-way sync — both the RMS and task-me.ke
     * derive the same URL from the property name, so no manual entry is needed.
     */
    listing: (propertyName: string, unitNumber?: string | null): string => {
        const identifier = PROPERTY_ID_PATTERN.test(propertyName) ? propertyName : slugify(propertyName);
        const base = buildHashUrl(`/properties/${encodeURIComponent(identifier)}`);
        if (unitNumber) {
            return appendQueryParam(base, 'unit', unitSlug(unitNumber));
        }
        return base;
    },

    unit: (unitId: string, refCode?: string | null, propertyListingUrl?: string | null): string => {
        if (propertyListingUrl) {
            return appendQueryParam(normalizeListingUrl(propertyListingUrl), 'ref', refCode);
        }
        const params = new URLSearchParams({ type: 'unit', id: unitId });
        if (refCode) params.set('ref', refCode);
        return `${LANDING}?${params.toString()}`;
    },

    property: (propertyName: string, refCode?: string | null, unitNumber?: string | null): string =>
        appendQueryParam(websiteLinks.listing(propertyName, unitNumber), 'ref', refCode),

    invest: (refCode?: string | null): string => {
        const params = new URLSearchParams({ type: 'invest' });
        if (refCode) params.set('ref', refCode);
        return `${LANDING}?${params.toString()}`;
    },

    referral: (refCode: string): string =>
        `${LANDING}?ref=${encodeURIComponent(refCode)}`,

    landlord: (refCode?: string | null): string => {
        const params = new URLSearchParams({ type: 'landlord' });
        if (refCode) params.set('ref', refCode);
        return `${LANDING}?${params.toString()}`;
    },

    joinLandlord: (refCode?: string | null): string => {
        const params = new URLSearchParams({ type: 'landlord' });
        if (refCode) params.set('ref', refCode);
        return `${LANDING}?${params.toString()}`;
    },
};
