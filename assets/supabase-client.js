// assets/supabase-client.js

// Jeśli chcesz, możesz podmienić te wartości na ENV wstrzykiwane do window._env_.
const SB_URL  = window?._env_?.PUBLIC_SUPABASE_URL  || "https://TWÓJ-PROJEKT.supabase.co";
const SB_ANON = window?._env_?.PUBLIC_SUPABASE_ANON_KEY || "TWÓJ_ANON_KEY";

if (!window.supabase) {
  console.error('[supabase-client] Biblioteka Supabase nie załadowana (brakuje <script src="https://unpkg.com/@supabase/supabase-js@2">).');
}

const sb = window.supabase.createClient(SB_URL, SB_ANON, { auth: { persistSession: false } });
window.sb = sb; // <- udostępniamy dla admin.js
console.log('[supabase-client] OK');
