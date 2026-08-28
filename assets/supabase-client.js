// assets/supabase-client.js
// WYMAGANE: w index.html wcześniej <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

(function () {
  const URL  = 'https://eibzijpelnmvbtslquun.supabase.co';     // <- wklej Project URL z Supabase
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpYnppanBlbG5tdmJ0c2xxdXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg2MTE1OTcsImV4cCI6MjA3NDE4NzU5N30.Dp4u9PlhP-_pGmiNTHp5zSjrMUDfA_k2i85_71_9koo';              // <- wklej anon public key

  if (!window.supabase) {
    console.error('[supabase-client] Brak SDK (@supabase/supabase-js@2).');
    return;
  }
  if (!URL || !ANON) {
    console.error('[supabase-client] Brak SUPABASE URL/ANON.');
    return;
  }

  try {
    window.sb = supabase.createClient(URL, ANON);
    console.log('[supabase-client] OK');
  } catch (e) {
    console.error('[supabase-client] init error:', e);
  }
})();
