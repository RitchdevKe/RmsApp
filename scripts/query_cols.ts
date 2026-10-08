import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY! || process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
    const { data: tenants, error } = await supabase.from('tenants').select('*').limit(1);
    console.log(Object.keys(tenants?.[0] || {}));
}
run();
