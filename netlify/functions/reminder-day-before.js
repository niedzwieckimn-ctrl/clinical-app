import { createClient } from '@supabase/supabase-js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(204, { ok: true });

  try {
    const sb = adminClient();
    const tz = 'Europe/Warsaw';
    const now = new Date();

    const tomorrowYmd = formatYmdInTz(addDays(now, 1), tz);
    const fetchRange = getBroadFetchRangeUtc({ now });

    const { data: bookings, error } = await sb
      .from('bookings_view')
      .select('booking_no, when, service_name, client_name, client_email, address, status')
      .gte('when', fetchRange.startIso)
      .lt('when', fetchRange.endIso)
      .in('status', ['Potwierdzona', 'confirmed'])
      .order('when', { ascending: true });

    if (error) return json(500, { error: error.message, at: 'query_bookings' });

    let sent = 0;
    const failures = [];

    for (const booking of bookings || []) {
      if (formatYmdInTz(new Date(booking.when), tz) !== tomorrowYmd) continue;
      const to = String(booking.client_email || '').trim().toLowerCase();
      if (!to) continue;

      const whenStr = new Date(booking.when).toLocaleString('pl-PL', {
        timeZone: tz,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const subject = `⏰ Przypomnienie o wizycie jutro – ${booking.service_name || 'wizyta'}`;
      const html = buildReminderHtml({
        bookingNo: booking.booking_no,
        whenStr,
        serviceName: booking.service_name,
        clientName: booking.client_name,
        address: booking.address,
      });

      try {
        await sendEmail({ to, subject, html });
        sent += 1;
      } catch (e) {
        failures.push({ booking_no: booking.booking_no, error: String(e?.message || e) });
      }
    }

    return json(200, {
      ok: true,
      checked: bookings?.length || 0,
      sent,
      failures,
      tomorrowYmd,
      timeZone: tz,
    });
  } catch (e) {
    return json(500, { error: String(e?.message || e) });
  }
};

function getBroadFetchRangeUtc({ now }) {
  const start = addDays(now, -1);
  const end = addDays(now, 3);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function formatYmdInTz(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function buildReminderHtml({ bookingNo, whenStr, serviceName, clientName, address }) {
  return `
    <p>Dzień dobry! ${escapeHtml(clientName || '')},</p>
    <p>to automatyczne przypomnienie o Twojej wizycie, która odbędzie się już jutro. :)</p>
    <p>
      📅 <strong>Termin:</strong> ${escapeHtml(whenStr)}<br>
      🧘‍♀️ <strong>Usługa:</strong> ${escapeHtml(serviceName || 'wizyta')}<br>
      🧾 <strong>Numer rezerwacji:</strong> ${escapeHtml(bookingNo || '-')}<br>
      📍 <strong>Adres:</strong> ${escapeHtml(address || '-')}
    </p>
    <p>W razie potrzeby zmiany terminu skontaktuj się z nami jak najszybciej.</p>
    <p>
      📞 tel. <a href="tel:797193931">797 193 931</a><br>
      ✉️ e-mail: <a href="mailto:massages.n.spa@gmail.com">massages.n.spa@gmail.com</a>
    </p>
    <p>Do zobaczenia!<br>Zespół <strong>Massages &amp; SPA</strong></p>
  `;
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Brak SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false } });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(body),
  };
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || 'rezerwacje@yourdomain.test';
  if (!apiKey) throw new Error('Brak RESEND_API_KEY');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!res.ok) {
    const out = await res.text();
    throw new Error(`Resend error: ${out}`);
  }
}
