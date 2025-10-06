// netlify/functions/admin-confirm.js
import { createClient } from '@supabase/supabase-js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  try {
    const { booking_no } = JSON.parse(event.body || '{}');
    if (!booking_no) return json(400, { error: 'Brak booking_no w body' });

    const sb = adminClient();

    // Pobierz booking z widoku (ma address, client_email itd.)
    const { data: booking, error: getErr } = await sb
      .from('bookings_view')
      .select('booking_no, when, service_name, client_name, client_email, phone, address')
      .eq('booking_no', booking_no)
      .single();
    if (getErr || !booking) return json(404, { error: 'Booking not found', details: getErr });

    // Update statusu w tabeli
    const { error: updErr } = await sb
      .from('bookings')
      .update({ status: 'Potwierdzona', confirmed_at: new Date().toISOString() })
      .eq('booking_no', booking_no);
    if (updErr) return json(500, { error: updErr.message });

    // Email – ta sama treść do klienta i masażystki
    const whenStr = new Date(booking.when).toLocaleString('pl-PL', { dateStyle: 'full', timeStyle: 'short' });
    const subject = `✅ Rezerwacja potwierdzona – ${booking.service_name || 'wizyta'}`;
    const html = `
      <h2>Rezerwacja potwierdzona</h2>
      <p><b>Klient:</b> ${escapeHtml(booking.client_name || '-') }<br/>
         <b>Data:</b> ${escapeHtml(whenStr)}<br/>
         <b>Usługa:</b> ${escapeHtml(booking.service_name || '-')}<br/>
         <b>Adres:</b> ${escapeHtml(booking.address || '-')}</p>
      <p>Do zobaczenia!</p>
    `;

    const recipients = Array.from(new Set([
      (booking.client_email || '').trim().toLowerCase(),
      (process.env.THERAPIST_EMAIL || '').trim().toLowerCase(),
    ].filter(Boolean)));

    for (const to of recipients) {
      await sendEmail({ to, subject, html });
    }

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
};

// helpers
function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Brak SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}
function json(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', ...CORS }, body: JSON.stringify(body) };
}
function escapeHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || 'rezerwacje@yourdomain.test';
  if (!apiKey) throw new Error('Brak RESEND_API_KEY');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, text })
  });
  if (!res.ok) {
    const out = await res.text();
    throw new Error(`Resend error: ${out}`);
  }
}
