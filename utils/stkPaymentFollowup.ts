import type { SupabaseClient } from '@supabase/supabase-js';

export type PaymentRow = {
    status?: string | null;
    checkout_request_id?: string | null;
    transaction_id?: string | null;
    result_desc?: string | null;
};

/**
 * Subscribe to realtime updates for a payment row; also poll periodically so UX
 * works if Realtime is unavailable.
 *
 * When the payment completes/fails/cancels, `onUpdate` is called with the DB row.
 * When polling exhausts `maxPolls` without a terminal status, `onUpdate` is called
 * once with `{ status: 'timed_out' }` so the UI can show a graceful timeout state.
 */
export function followStkPaymentCompletion(
    supabase: SupabaseClient,
    userId: string,
    checkoutRequestId: string,
    onUpdate: (row: PaymentRow) => void,
    options?: { pollMs?: number; maxPolls?: number },
): () => void {
    // Realtime is the primary signal; polling is only a fallback for when
    // Realtime is unavailable. Long intervals minimise Disk IO on the DB.
    const pollMs = options?.pollMs ?? 10000;
    const maxPolls = options?.maxPolls ?? 12; // ~2 minutes (12 × 10 s)

    let stopped = false;
    let pollCount = 0;
    // Track whether we've already received a terminal status so we don't double-fire.
    let settled = false;

    const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

    const settle = (row: PaymentRow) => {
        if (settled) return;
        settled = true;
        stopped = true;
        supabase.removeChannel(channel);
        onUpdate(row);
    };

    const channel = supabase
        .channel(`stk-follow-${userId}-${checkoutRequestId}-${Date.now()}`)
        .on(
            'postgres_changes',
            // Filter by checkout_request_id only — the edge function stores user_id = caller's
            // JWT ID (the admin), not the tenant's auth ID. Filtering only by the unique
            // checkout_request_id avoids the mismatch. RLS still applies at the DB level.
            { event: '*', schema: 'public', table: 'payments', filter: `checkout_request_id=eq.${checkoutRequestId}` },
            (payload: any) => {
                const row = (payload?.new ?? payload?.old) as PaymentRow | undefined;
                if (!row) return;
                if (TERMINAL.has(String(row.status ?? ''))) settle(row);
                else onUpdate(row); // pass through non-terminal updates (e.g. pending)
            },
        )
        .subscribe();

    const poll = async () => {
        if (stopped) return;
        try {
            const { data, error } = await supabase
                .from('payments')
                .select('status,checkout_request_id,transaction_id,result_desc')
                .eq('checkout_request_id', checkoutRequestId)
                .maybeSingle();
            if (!error && data) {
                const row = data as PaymentRow;
                if (TERMINAL.has(String(row.status ?? ''))) {
                    settle(row);
                    return; // stop polling
                }
                onUpdate(row);
            }
        } catch {
            /* network hiccup — continue polling */
        }

        pollCount += 1;
        if (stopped) return;

        if (pollCount >= maxPolls) {
            // Polling exhausted — emit timeout so UI can react gracefully.
            if (!settled) {
                settled = true;
                stopped = true;
                supabase.removeChannel(channel);
                onUpdate({ status: 'timed_out', checkout_request_id: checkoutRequestId });
            }
            return;
        }

        setTimeout(poll, pollMs);
    };

    setTimeout(poll, pollMs);

    return () => {
        stopped = true;
        settled = true;
        supabase.removeChannel(channel);
    };
}
