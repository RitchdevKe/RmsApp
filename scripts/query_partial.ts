import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY! || process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
    const { data: tenants, error } = await supabase
        .from('partial_tenants')
        .select('id, name, unit, payment_history')
        .not('payment_history', 'is', null);

    if (error) console.error(error);
    
    if (tenants) {
        console.log(`Found ${tenants.length} partial tenants with history.`);
        let found = 0;
        for (const t of tenants) {
            const hist = t.payment_history || [];
            for (const p of hist) {
                if (String(p.method).includes('Multi') || String(p.status).includes('Multi') || String(p.reference).includes('MULTI')) {
                    console.log('Match found:', t.unit, t.name, p);
                    found++;
                }
            }
        }
        console.log(`Found ${found} matches.`);
    }
}
run();
