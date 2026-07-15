// ===== TRACKPO — SUPABASE CONFIG =====
const SUPABASE_URL = 'https://dhyddyhbpmzstbhrsgrq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_krPrYN9no79aBlSbKiXsmw_3VuyxrN';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});

// Timezone Malaysia
const TZ = 'Asia/Kuala_Lumpur';
