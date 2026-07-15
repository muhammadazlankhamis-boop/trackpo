const SUPABASE_URL = 'https://dhyddyhbpmzstbhrsgrq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoeWRkeWhicG16c3RiaHJzZ3JxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MDg5MDMsImV4cCI6MjA5OTQ4NDkwM30.czIG6b_zWhZlFj3MNfFVv6Yb65cL5DD_7yLmV37rFCM';

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
});

const sbSignup = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    storage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    }
  }
});

const TZ = 'Asia/Kuala_Lumpur';