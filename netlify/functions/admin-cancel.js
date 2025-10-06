// netlify/functions/admin-cancel.js
import { createClient } from '@supabase/supabase-js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { booking_no } = JSON.parse(event.body || '{}');
    if (!booking_no) return json(400, { error: 'Brak booking_no' });

    const sb = adminClient();

    // 1) Pobierz dane rezerwacji (z widoku z address, itp.)
    const { data: booking, error: getErr } = await sb
      .from('bookings_view')
      .select('booking_no, when, service_name, client_name, client_email, phone, address')
      .eq('booking_no', booking_no)
      .single();
    if (getErr || !booking) return json(404, { error: 'Booking not found', details: getErr });

    // 2) Zmień status + znacznik czasu
    const { error: updErr } = await sb
      .from('bookings')
      .update({ status: 'Anulowana', canceled_at: new Date().toISOString() })
      .eq('booking_no', booking_no);
    if (updErr) return json(500, { error: updErr.message });
	// 2a) ZWOLNIJ SLOT (taken=false)
try {
  // jeśli masz slot_id w bookings – użyj go (lepsze dopasowanie)
  if (booking.slot_id) {
    await sb.from('slots').update({ taken: false }).eq('id', booking.slot_id);
  } else {
    // w przeciwnym razie po dacie
    const { error: freeErr } = await sb
      .from('slots')
      .update({ taken: false })
      .eq('when', booking.when);
    if (freeErr) {
      // jeśli nie ma rekordu slota (np. został uprzątnięty) – odtwórz go jako wolny, ale tylko jeśli to przyszłość
      if (new Date(booking.when) > new Date()) {
        await sb.from('slots').insert({ when: booking.when, taken: false });
      }
    }
  }
} catch (e) {
  // nie blokuj anulowania przy błędzie zwalniania slota – tylko zaloguj
  console.log('[admin-cancel] free slot warning:', e?.message || e);
}


    // 3) E-mail — ta sama treść do klienta i masażystki
    const whenStr = new Date(booking.when).toLocaleString('pl-PL', { dateStyle: 'full', timeStyle: 'short' });
    const subject = `❌ Rezerwacja anulowana – ${booking.service_name || 'wizyta'}`;
    const html = `
      <h2>Rezerwacja anulowana</h2>
      <p><b>Nr:</b> ${escapeHtml(booking.booking_no || '')}</p>
      <p><b>Klient:</b> ${escapeHtml(booking.client_name || '-')}</p>
      <p><b>Data:</b> ${escapeHtml(whenStr)}</p>
      <p><b>Usługa:</b> ${escapeHtml(booking.service_name || '-')}</p>
      <p><b>Adres:</b> ${escapeHtml(booking.address || '-')}</p>
      <p>W razie pytań prosimy o kontakt z recepcją.</p>
    `;

    let recipients = Array.from(new Set([
      (booking.client_email || '').trim().toLowerCase(),
      (process.env.THERAPIST_EMAIL || '').trim().toLowerCase(),
    ].filter(Boolean)));

    // Tryb DEV (opcjonalnie)
    if (process.env.EMAIL_DEV_ONLY === '1') {
      recipients = [
        (process.env.DEV_EMAIL || process.env.THERAPIST_EMAIL || '').trim().toLowerCase()
      ].filter(Boolean);
    }

    for (const to of recipients) {
      await sendEmail({ to, subject, html });
    }

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
};

// --- helpers ---
function adminClient() {
  const url = process.env.SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !key) throw new Error('Brak SUPABASE_URL lub SUPABASE_SERVICE_ROLE(_KEY)');
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
  // Użyj zweryfikowanego nadawcy w Twojej domenie:
  const from = process.env.FROM_EMAIL || 'rezerwacje@massagesandspa.pl';
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
