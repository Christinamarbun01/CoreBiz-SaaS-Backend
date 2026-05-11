import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
  const dummyUuid = '00000000-0000-0000-0000-000000000000';
  const tables = ['products', 'customers', 'orders', 'expenses'];
  for (const t of tables) {
    const { error } = await supabase.from(t).insert({ tenant_id: dummyUuid }).select();
    console.log(`${t} error: ${error?.message}`);
  }
}

check();
