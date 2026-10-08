/**
 * Kenya (Africa/Nairobi, UTC+3, no DST) time helpers.
 *
 * The app is operated from Kenya, so "today" must always be the Nairobi day,
 * not the browser/server UTC or US local day. Using `new Date().toISOString()`
 * rolls the date over at 00:00 UTC (03:00 Nairobi) and shows "yesterday" for
 * the first three hours of every Kenyan day.
 */

export const APP_TIME_ZONE = 'Africa/Nairobi';
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3, no daylight saving

/** A Date shifted so its UTC fields represent Nairobi wall-clock time. */
export function nairobiShiftedDate(value?: string | number | Date): Date {
    const base = value === undefined || value === null ? new Date() : new Date(value as any);
    if (Number.isNaN(base.getTime())) return new Date(NaN);
    return new Date(base.getTime() + NAIROBI_OFFSET_MS);
}

/** Today's date in Nairobi as YYYY-MM-DD. */
export function getTodayIsoDate(value?: string | number | Date): string {
    const shifted = nairobiShiftedDate(value);
    if (Number.isNaN(shifted.getTime())) return '';
    return shifted.toISOString().split('T')[0];
}

/** Current Nairobi month as YYYY-MM. */
export function getCurrentMonthIso(value?: string | number | Date): string {
    return getTodayIsoDate(value).slice(0, 7);
}

/** Nairobi day-of-month / month / year of a given instant (defaults to now). */
export function nairobiParts(value?: string | number | Date) {
    const s = nairobiShiftedDate(value);
    return { year: s.getUTCFullYear(), month: s.getUTCMonth() + 1, day: s.getUTCDate() };
}

/** Start of today (Nairobi) as a Date instant. */
export function startOfTodayNairobi(): Date {
    return new Date(`${getTodayIsoDate()}T00:00:00+03:00`);
}
