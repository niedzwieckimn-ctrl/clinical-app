// Netlify Function: admin-confirm.js
// Potwierdza rezerwację po booking_no, aktualizuje status i wysyła e-mail
// do KLIENTA oraz MASAŻYSTKI (ta sama treść).
// Wymagane ENV w Netlify:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - RESEND_API_KEY
// - FROM_EMAIL (np. "rezerwacje@twojadomena.pl")
// - THERAPIST_EMAIL (docelowy e-mail masażystki)

import { createClient } from '@supabase/supabase-js';

// --- pomocnicze CORS --------------------------------------------------------
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { ...CORS_HEADERS } };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  try {
    const body = parseJSON(event.body);
    const booking_no = body?.booking_no?.toString().trim();
    if (!booking_no) return json(400, { error: 'Brak booking_no w body' });

    const sb = adminClient();

    // 1) Pobierz szczegóły rezerwacji (z widoku) dla e-maila
    const { data: booking, error: getErr } = await sb
      .from('bookings_view')
      .select('booking_no, when, service_name, client_name, client_email, phone')
      .eq('booking_no', booking_no)
      .single();

    if (getErr || !booking) {
      return json(404, { error: 'Booking not found', details: getErr });
    }

    // 2) Aktualizuj status w tabeli bookings
    const { error: updErr } = await sb
      .from('bookings')
      .update({ status: 'Potwierdzona', confirmed_at: new Date().toISOString() })
      .eq('booking_no', booking_no);

    if (updErr) return json(500, { error: updErr.message });

    // 3) E-mail – ta sama treść do klienta i masażystki
    const whenStr = new Date(booking.when).toLocaleString('pl-PL', { dateStyle: 'full', timeStyle: 'short' });
    const subject = `✅ Rezerwacja potwierdzona – ${booking.service_name}`;
    const html = `
      <h2>Rezerwacja potwierdzona</h2>
      <p><b>Klient:</b> ${escapeHtml(booking.client_name || '-') }<br/>
         <b>Data:</b> ${escapeHtml(whenStr)}<br/>
         <b>Usługa:</b> ${escapeHtml(booking.service_name || '-')}</p>
      <p>Do zobaczenia!</p>
    `;

    const recipients = unique([
      booking.client_email,
      process.env.THERAPIST_EMAIL || 'niedzwiecki.mn@gmail.com'
    ].filter(Boolean));

    for (const to of recipients) {
      await sendEmail({ to, subject, html });
    }

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: String(e && e.message ? e.message : e) });
  }
};

// --- helpers ----------------------------------------------------------------
function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Brak SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { 'X-Client-Info': 'admin-confirm' } }
  });
}

function parseJSON(text) {
  try { return JSON.parse(text || '{}'); } catch { return {}; }
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body)
  };
}

async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  if (!apiKey) throw new Error('Brak RESEND_API_KEY');

  const payload = { from, to, subject, html: html || (text ? `<pre>${escapeHtml(text)}</pre>` : ''), text };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const out = await res.text();
    throw new Error(`Resend error: ${out}`);
  }
}

function unique(arr) {
  return Array.from(new Set(arr.map(x => (x||'').trim().toLowerCase())));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
