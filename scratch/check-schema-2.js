import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function check() {
  const { data, error } = await supabase.rpc('inspect_schema'); // Likely won't work, but let's try raw query if possible
  
  // Try raw sql via a known trick if rpc is not there
  // Actually, let's just try to insert one object with ALL columns I think exist and see the error.
  
  const tables = ['products', 'customers', 'orders', 'expenses'];
  for (const t of tables) {
    const { error } = await supabase.from(t).insert({}).select();
    console.log(`${t} error: ${error?.message}`);
  }
}

check();
