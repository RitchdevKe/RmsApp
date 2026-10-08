import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY! || process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
    const { data: tenants, error } = await supabase
        .from('tenants')
        .select('id, name, unit, payment_history')
        .ilike('name', '%BERNARD%');

    if (error) console.error(error);
    
    if (tenants) {
        for (const t of tenants) {
            console.log(t.name, t.unit);
            const hist = t.payment_history || [];
            console.log("History length:", hist.length);
            for (const p of hist) {
                console.log(p.reference, p.amount, p.status, p.method);
            }
        }
    }
}
run();
