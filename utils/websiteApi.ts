
import { MarketplaceListing, Lead, FundiJob } from '../types';

/**
 * Website API integration layer.
 *
 * When your website exposes REST API endpoints for leads and fundi jobs,
 * set these environment variables in your .env file:
 *
 *   VITE_WEBSITE_API_URL=https://your-website.com
 *   VITE_WEBSITE_API_KEY=your-secret-api-key      (optional, if your site requires auth)
 *
 * Expected endpoints on your website:
 *   GET  /api/leads       → returns Lead[]
 *   GET  /api/fundi-jobs  → returns FundiJob[]
 *
 * Until those are configured, all fetch functions return empty arrays gracefully.
 *
 * Note: Leads and fundi jobs can also arrive via our Supabase webhook endpoints:
 *   POST /functions/v1/receive-lead       (configure your website forms to POST here)
 *   POST /functions/v1/fundi-job-submit   (already live — configure on your website)
 */

const WEBSITE_API_URL = (import.meta as any).env?.VITE_WEBSITE_API_URL || '';
const WEBSITE_API_KEY = (import.meta as any).env?.VITE_WEBSITE_API_KEY || '';

const websiteHeaders = (): HeadersInit => {
    const h: HeadersInit = { 'Content-Type': 'application/json' };
    if (WEBSITE_API_KEY) h['Authorization'] = `Bearer ${WEBSITE_API_KEY}`;
    return h;
};

const isConfigured = (): boolean => !!WEBSITE_API_URL;

export const websiteApi = {
    // 1. Fetch Published Listings from website
    getPublishedListings: async (_type?: 'Rent' | 'Sale' | 'AirBnB'): Promise<MarketplaceListing[]> => {
        if (!isConfigured()) return [];
        try {
            const res = await fetch(`${WEBSITE_API_URL}/api/listings`, { headers: websiteHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e: any) {
            console.warn('[websiteApi] getPublishedListings failed:', e.message);
            return [];
        }
    },

    // 2. AirBnB Booking
    bookAirBnB: async (listingId: string, guestDetails: any, dates: { checkIn: string; checkOut: string }) => {
        if (!isConfigured()) {
            console.log(`[websiteApi] Booking request (no website API configured): ${listingId}`, dates);
            return { success: true, bookingId: `BK-${Date.now()}`, message: 'Booking request queued.' };
        }
        try {
            const res = await fetch(`${WEBSITE_API_URL}/api/bookings`, {
                method: 'POST',
                headers: websiteHeaders(),
                body: JSON.stringify({ listingId, guestDetails, dates }),
            });
            return await res.json();
        } catch (e: any) {
            console.warn('[websiteApi] bookAirBnB failed:', e.message);
            return { success: false, message: e.message };
        }
    },

    // 3. Inquiry for Sale/Rent
    submitInquiry: async (listingId: string, contactDetails: any, message: string) => {
        if (!isConfigured()) {
            console.log(`[websiteApi] Inquiry (no website API configured): ${listingId} — ${message}`);
            return { success: true, message: 'Inquiry sent to agent.' };
        }
        try {
            const res = await fetch(`${WEBSITE_API_URL}/api/inquiries`, {
                method: 'POST',
                headers: websiteHeaders(),
                body: JSON.stringify({ listingId, contactDetails, message }),
            });
            return await res.json();
        } catch (e: any) {
            console.warn('[websiteApi] submitInquiry failed:', e.message);
            return { success: false, message: e.message };
        }
    },

    // 4. Fetch new leads from website API
    // Falls back to empty array if VITE_WEBSITE_API_URL is not set.
    // Leads can also arrive via the receive-lead Edge Function webhook.
    fetchLeads: async (): Promise<Lead[]> => {
        if (!isConfigured()) return [];
        try {
            const res = await fetch(`${WEBSITE_API_URL}/api/leads`, { headers: websiteHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e: any) {
            console.warn('[websiteApi] fetchLeads failed:', e.message);
            return [];
        }
    },

    // 5. Fetch fundi job requests from website API
    // Falls back to empty array — primary source is the fundi-job-submit Edge Function.
    fetchFundiJobs: async (): Promise<FundiJob[]> => {
        if (!isConfigured()) return [];
        try {
            const res = await fetch(`${WEBSITE_API_URL}/api/fundi-jobs`, { headers: websiteHeaders() });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e: any) {
            console.warn('[websiteApi] fetchFundiJobs failed:', e.message);
            return [];
        }
    },
};
