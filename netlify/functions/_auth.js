import { createClient } from '@supabase/supabase-js';

export function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Brak konfiguracji Supabase po stronie serwera');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireAdmin(event) {
  const token = String(event.headers?.authorization || event.headers?.Authorization || '')
    .replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: response(401, { error: 'Brak sesji administratora' }) };

  const sb = adminClient();
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return { error: response(401, { error: 'Nieprawidłowa lub wygasła sesja' }) };
  const { data: admin, error: adminError } = await sb
    .from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle();
  if (adminError || !admin) return { error: response(403, { error: 'Brak uprawnień administratora' }) };
  return { sb, user };
}

export function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}
