// assets/supabase-client.js

// Jeśli chcesz, możesz podmienić te wartości na ENV wstrzykiwane do window._env_.
const SB_URL  = window?._env_?.PUBLIC_SUPABASE_URL  || "https://eibzijpelnmvbtslquun.supabase.co";
const SB_ANON = window?._env_?.PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpYnppanBlbG5tdmJ0c2xxdXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MTE1OTcsImV4cCI6MjA3NDE4NzU5N30.Dp4u9PlhP-_pGmiNTHp5zSjrMUDfA_k2i85_71_9koo";

if (!window.supabase) {
  console.error('[supabase-client] Biblioteka Supabase nie załadowana (brakuje <script src="https://unpkg.com/@supabase/supabase-js@2">).');
}

const sb = window.supabase.createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
window.sb = sb; // <- udostępniamy dla admin.js
console.log('[supabase-client] OK');
