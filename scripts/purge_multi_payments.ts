import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://xdaznrwcitsuwlvwxojp.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_3vRQKAboZYnKWHR6uH6iyg_YQ2JWc4A';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function purgeMultiPayments() {
    console.log("Starting purge of synthetic MULTI-* payments...");

    // 1. Delete rows in payments where transaction_id starts with MULTI- or status/checkout_request_id/phone matches synthetic
    const { error: err1 } = await supabase
        .from('payments')
        .delete()
        .or('transaction_id.ilike.MULTI-%,status.eq.Multi-Occupancy Allocation,checkout_request_id.eq.Multi-occupancy sub allocation,phone.eq.Multi-Occupancy');
    
    if (err1) {
        console.error("Error deleting from payments:", err1);
    } else {
        console.log("Deleted synthetic payments from payments table");
    }

    // 2. Fetch all tenants and clean payment_history JSON array
    const { data: tenants, error: err2 } = await supabase
        .from('tenants')
        .select('id, payment_history');

    if (err2) {
        console.error("Error fetching tenants:", err2);
    } else if (tenants) {
        let updatedCount = 0;
        for (const t of tenants) {
            const history = Array.isArray(t.payment_history) ? t.payment_history : [];
            const isSynthetic = (p: any) =>
                String(p?.reference || '').trim().toUpperCase().startsWith('MULTI-') ||
                String(p?.method || '').trim() === 'Multi-Occupancy Allocation' ||
                String(p?.status || '').trim() === 'Multi-Occupancy Allocation';

            if (history.some(isSynthetic)) {
                const cleanedHistory = history.filter((p: any) => !isSynthetic(p));
                const { error: updateErr } = await supabase
                    .from('tenants')
                    .update({ payment_history: cleanedHistory })
                    .eq('id', t.id);

                if (updateErr) {
                    console.error(`Failed to update tenant ${t.id}:`, updateErr);
                } else {
                    updatedCount++;
                }
            }
        }
        console.log(`Cleaned payment history for ${updatedCount} tenant(s)`);
    }

    // 3. Repeat for partial_tenants if table exists
    const { data: partialTenants, error: err3 } = await supabase
        .from('partial_tenants')
        .select('id, payment_history');

    if (!err3 && partialTenants) {
        let updatedPartialCount = 0;
        for (const t of partialTenants) {
            const history = Array.isArray(t.payment_history) ? t.payment_history : [];
            const isSynthetic = (p: any) =>
                String(p?.reference || '').trim().toUpperCase().startsWith('MULTI-') ||
                String(p?.method || '').trim() === 'Multi-Occupancy Allocation' ||
                String(p?.status || '').trim() === 'Multi-Occupancy Allocation';

            if (history.some(isSynthetic)) {
                const cleanedHistory = history.filter((p: any) => !isSynthetic(p));
                await supabase
                    .from('partial_tenants')
                    .update({ payment_history: cleanedHistory })
                    .eq('id', t.id);
                updatedPartialCount++;
            }
        }
        console.log(`Cleaned payment history for ${updatedPartialCount} partial tenant(s)`);
    }

    console.log("Purge completed successfully.");
}

purgeMultiPayments().catch(console.error);
