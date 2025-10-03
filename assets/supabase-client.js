// === UZUPEŁNIJ TE DANE (z Supabase → Settings → API) ===
const SB_URL  = 'https://eibzjpelnmvbtslquun.supabase.co';
const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpYnppanBlbG5tdmJ0c2xxdXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MTE1OTcsImV4cCI6MjA3NDE4NzU5N30.Dp4u9PlhP-_pGmiNTHp5zSjrMUDfA_k2i85_71_9koo';
// ========================================================

if (!window.supabase) {
  console.error('[supabase-client] Brak biblioteki @supabase/supabase-js (CDN).');
}

const sb = window.supabase.createClient(SB_URL, SB_ANON, {
  auth: { persistSession: false }
});

window.sb = sb;
console.log('[supabase-client] OK');
// assets/supabase-client.js
