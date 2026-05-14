import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

async function run() {
  const { data, error } = await supabase.from('tenants').select('id, name').limit(2);
  if (error) {
    console.error('Error fetching tenants:', error);
  } else {
    console.log('EXISTING_TENANTS:', JSON.stringify(data, null, 2));
  }
}

run();
