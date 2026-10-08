/**
 * East African Time (UTC+3) greeting helper.
 * Returns "Good morning" / "Good afternoon" / "Good evening" based on
 * the current hour in Nairobi / Kampala / Dar es Salaam, regardless of
 * the user's local timezone.
 */
export function getEatGreeting(now: Date = new Date()): string {
    // EAT is fixed UTC+3 (no DST in East Africa).
    const eatHour = (now.getUTCHours() + 3) % 24;
    if (eatHour < 12) return 'Good morning';
    if (eatHour < 17) return 'Good afternoon';
    return 'Good evening';
}

/**
 * True when the current hash route belongs to one of the mobile-first
 * user app portals (tenant, landlord, agent, affiliate, investor, contractor,
 * caretaker, refer & earn, my profile).
 */
export function isUserPortalRoute(hashPath: string): boolean {
    return hashPath.startsWith('#/user-app-portal') || hashPath.startsWith('#/partial-rms/user-app-portal');
}

/**
 * Friendly breadcrumb derived from a hash path.
 * Examples:
 *   #/dashboard/overview        -> "Dashboard / Overview"
 *   #/user-app-portal/tenant-portal -> "Tenant Portal"
 *   #/tenants/active-tenants    -> "Tenants / Active Tenants"
 */
export function routeBreadcrumb(hashPath: string, lastSegmentOverride?: string): string {
    // Strip any query string before parsing — query params like ?tenantId=...
    // are not part of the human-readable breadcrumb.
    const raw = (hashPath || '#/dashboard').replace(/^#\//, '');
    const clean = raw.split('?')[0];
    if (!clean) return 'Dashboard';
    const parts = clean.split('/').filter(Boolean);
    // Drop the "user-app-portal" prefix for cleaner portal breadcrumbs.
    const start = parts[0] === 'user-app-portal' ? 1 : 0;
    const segs = parts.slice(start).map(seg =>
        seg
            .split('-')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ')
    );
    if (lastSegmentOverride && segs.length > 0) {
        // When the caller has a friendlier label for the deepest segment
        // (e.g. resolved tenant name instead of "?tenantId=..."), append it.
        segs.push(lastSegmentOverride);
    }
    return segs.join(' / ') || 'Dashboard';
}

/**
 * Parse the query-string portion of a hash route, e.g. "#/x/y?a=1&b=2" -> {a:"1", b:"2"}.
 */
export function parseHashQuery(hashPath: string): Record<string, string> {
    const raw = (hashPath || '').replace(/^#\//, '');
    const q = raw.split('?')[1];
    if (!q) return {};
    const out: Record<string, string> = {};
    for (const pair of q.split('&')) {
        const [k, v = ''] = pair.split('=');
        if (k) out[decodeURIComponent(k)] = decodeURIComponent(v);
    }
    return out;
}

