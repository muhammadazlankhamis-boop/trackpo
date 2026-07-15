// ===== TRACKPO — SUPABASE CONFIG =====
// IMPORTANT: Guna Legacy anon key (bukan publishable key)
const SUPABASE_URL = 'https://dhyddyhbpmzstbhrsgrq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoeWRkeWhicG16c3RiaHJzZ3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MDg5MDMsImV4cCI6MjA5OTQ4NDkwM30.czIG6b_zWhZlFj3MNfFVv6Yb65cL5DD_7yLmV37rFCM'; // <-- Paste legacy anon key dari Supabase

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});

// Timezone Malaysia
const TZ = 'Asia/Kuala_Lumpur';
