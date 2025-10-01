// FRONT (admin UI) — tylko anon key, read-only
const SB_URL  = window?.ENV_SUPABASE_URL     || '{{PUBLIC_SUPABASE_URL}}';
const SB_ANON = window?.ENV_SUPABASE_ANONKEY || '{{PUBLIC_SUPABASE_ANON_KEY}}';

// jeśli wstrzykujesz ENV w Netlify (inline), możesz podmienić szablon {{...}} w build-stepie.
// przy czystych statykach wpisz tu wartości ręcznie lub zrób mały skrypt, który je wstawi.

const sb = supabase.createClient(SB_URL, SB_ANON, {
  auth: { persistSession: false }
});

window.sb = sb;
