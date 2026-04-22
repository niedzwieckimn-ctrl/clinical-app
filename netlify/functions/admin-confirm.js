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
   const whenStr = new Date(booking.when).toLocaleString('pl-PL', {
  timeZone: 'Europe/Warsaw',
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});


    const subject = `✅ Rezerwacja potwierdzona! – ${booking.service_name || 'wizyta'}`;
    const html = `
  <p>Dziękujemy za dokonanie rezerwacji w <strong>Massages &amp; SPA</strong>.</p>

  <p>
  📅 <strong>Termin:</strong> ${whenStr}<br>
  🧘‍♀️ <strong>Usługa:</strong> ${booking.service_name}<br>
  📍 <strong>Adres:</strong> ${booking.address}
  </p>

  <p>Aby masaż przebiegł komfortowo i sprawnie, prosimy o przygotowanie się według poniższych wskazówek:</p>

  <ul>
    <li>🛋 <strong>Przygotuj przestrzeń</strong> — najlepiej ok. 2 × 3 m wolnego miejsca, aby można było ustawić stół i swobodnie się poruszać.</li>
    <li>🪄 <strong>Zadbaj o ciepło</strong> — pomieszczenie powinno być przyjemnie nagrzane (ok. 23–25 °C), aby ciało nie marzło podczas masażu.</li>
    <li>🌿 <strong>Zapewnij dostęp do gniazdka</strong> — jeśli używamy podgrzewacza lub lampy, przyda się prąd w pobliżu miejsca masażu.</li>
    <li>🧼 <strong>Prysznic przed masażem</strong> — najlepiej ok. 1–2 godziny wcześniej.</li>
    <li>🥗 <strong>Nie jedz ciężkich posiłków</strong> tuż przed zabiegiem (odczekaj 1,5–2 godziny).</li>
    <li>💧 <strong>Wypij szklankę wody</strong> przed wizytą — wspiera to proces regeneracji organizmu.</li>
    <li>🐾 <strong>Zwierzęta domowe</strong> — jeśli to możliwe, zadbaj, aby podczas masażu nie wchodziły do pokoju.</li>
  </ul>

  <p>
  📞 W razie zmian lub pytań prosimy o kontakt:<br>
  tel. <a href="tel:797193931">797 193 931</a><br>
  e-mail: <a href="mailto:massages.n.spa@gmail.com">massages.n.spa@gmail.com</a>
  </p>

  <p>Do zobaczenia w Twoim domu!<br>
  Zespół <strong>Massages &amp; SPA</strong></p>

    `;

         const recipients = Array.from(new Set([
      (booking.client_email || '').trim().toLowerCase(),
      (process.env.THERAPIST_EMAIL || '').trim().toLowerCase(),
    ].filter(Boolean)));

    for (const to of recipients) {
      await sendEmail({ to, subject, html });
    }

    // Zaplanuj przypomnienie 24h przed wizytą (klient + therapist)
    let reminder = { scheduled: false };
    const reminderRecipients = Array.from(new Set([
      (booking.client_email || '').trim().toLowerCase(),
      (process.env.THERAPIST_EMAIL || '').trim().toLowerCase(),
    ].filter(Boolean)));

    const whenMs = new Date(booking.when).getTime();
    const testDelayMinutes = parsePositiveInt(process.env.REMINDER_TEST_DELAY_MINUTES);
    const reminderAt = Number.isFinite(testDelayMinutes)
      ? new Date(Date.now() + (testDelayMinutes * 60 * 1000))
      : new Date(whenMs - (24 * 60 * 60 * 1000));
    const nowPlus5m = Date.now() + (5 * 60 * 1000);

    if (reminderRecipients.length === 0) {
      reminder = { scheduled: false, reason: 'missing_recipients' };
    } else if (!Number.isFinite(reminderAt.getTime()) || reminderAt.getTime() <= nowPlus5m) {
      reminder = { scheduled: false, reason: 'too_late_or_invalid_time' };
    } else {
      const reminderSubject = `⏰ Przypomnienie o wizycie jutro – ${booking.service_name || 'wizyta'}`;
      const reminderHtml = `
        <p>Cześć ${escapeHtml(booking.client_name || '')},</p>
        <p>to automatyczne przypomnienie o jutrzejszej wizycie.</p>
        <p>
          📅 <strong>Termin:</strong> ${escapeHtml(whenStr)}<br>
          🧘‍♀️ <strong>Usługa:</strong> ${escapeHtml(booking.service_name || 'wizyta')}<br>
          📍 <strong>Adres:</strong> ${escapeHtml(booking.address || '-')}
        </p>
        <p>
          📞 Kontakt: <a href="tel:797193931">797 193 931</a> /
          <a href="mailto:massages.n.spa@gmail.com">massages.n.spa@gmail.com</a>
        </p>
      `;

      for (const to of reminderRecipients) {
        await sendEmail({
          to,
          subject: reminderSubject,
          html: reminderHtml,
          scheduledAt: reminderAt.toISOString(),
          idempotencyKey: `reminder:${booking.booking_no}:${to}:${reminderAt.toISOString().slice(0, 16)}`,
        });
      }
      reminder = {
        scheduled: true,
        scheduled_at: reminderAt.toISOString(),
        recipients: reminderRecipients,
        mode: Number.isFinite(testDelayMinutes) ? 'test_delay' : 'appointment_minus_24h',
      };
    }

    return json(200, { ok: true, reminder });
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
function parsePositiveInt(v) {
  const n = Number.parseInt(String(v || '').trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
async function sendEmail({ to, subject, html, text, scheduledAt, idempotencyKey }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || 'rezerwacje@yourdomain.test';
  if (!apiKey) throw new Error('Brak RESEND_API_KEY');

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const payload = { from, to, subject, html, text };
  if (scheduledAt) payload.scheduled_at = scheduledAt;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const out = await res.text();
    throw new Error(`Resend error: ${out}`);
  }
}
