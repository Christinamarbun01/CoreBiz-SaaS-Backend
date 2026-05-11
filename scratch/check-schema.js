import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
  const tables = ['products', 'customers', 'orders', 'expenses', 'tenant_users'];
  for (const t of tables) {
    try {
        const { data, error } = await supabase.from(t).select('*').limit(1);
        if (error) {
          console.log(`${t}: ERROR ${error.message}`);
        } else {
          console.log(`${t}: ${data.length > 0 ? Object.keys(data[0]).join(', ') : 'EMPTY'}`);
        }
    } catch (e) {
        console.log(`${t}: FAILED ${e.message}`);
    }
  }
}

check();
