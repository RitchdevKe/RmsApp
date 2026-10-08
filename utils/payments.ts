import { supabase } from './supabaseClient';

/**
 * Fetch completed payments. Bounded to the last N days (default 180) to
 * prevent unbounded, full-table pagination on every realtime invalidation
 * — the previous implementation refetched the entire payments history on
 * every INSERT and was the single largest contributor to Supabase Disk-IO
 * exhaustion.
 *
 * Callers that genuinely need older history can pass `sinceDays = 0` to
 * disable the window, but this should be rare.
 */
export const PAYMENTS_QUERY_KEY = 'inbound_payments';
export const DEFAULT_PAYMENT_WINDOW_DAYS = 180;

export const fetchAllCompletedPayments = async (sinceDays: number = DEFAULT_PAYMENT_WINDOW_DAYS) => {
    // Guard: react-query passes a QueryFunctionContext as the first argument
    // when this function is used directly as a `queryFn`. Without this, the
    // window silently became "unbounded" and the whole payments table was
    // paged in — the root cause of slow login and slow Payments → Inbound.
    if (typeof sinceDays !== 'number' || !Number.isFinite(sinceDays)) {
        sinceDays = DEFAULT_PAYMENT_WINDOW_DAYS;
    }
    let allData: any[] = [];
    const pageSize = 1000;
    let hasMore = true;
    let lastCreatedAt: string | null = null;
    let lastId: string | null = null;

    const sinceIso = sinceDays > 0
        ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

    while (hasMore) {
        let query = supabase
            .from('payments')
            .select('id,created_at,source,status,reconciliation_status,amount,transaction_id,checkout_request_id,bill_ref_number,msisdn,phone,first_name,middle_name,last_name,matched_tenant_id,matched_unit_id,paired_payment_id,result_desc')
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(pageSize);

        if (sinceIso) query = query.gte('created_at', sinceIso);
        if (lastCreatedAt) query = query.lt('created_at', lastCreatedAt);

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
            if (lastCreatedAt === data[0].created_at && lastId === data[0].id) {
                hasMore = false;
                break;
            }
            allData = [...allData, ...data];
            if (data.length < pageSize) {
                hasMore = false;
            } else {
                lastCreatedAt = data[data.length - 1].created_at;
                lastId = data[data.length - 1].id;
            }
        } else {
            hasMore = false;
        }
    }
    return allData;
};
