import { createClient } from '@supabase/supabase-js';

const THERAPIST_EMAIL = process.env.THERAPIST_EMAIL || 'niedzwiecki.mn@gmail.com';

async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';
  const payload = { from, to, subject, html: html || `<pre>${text||''}</pre>`, text };

  const res = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers: { 'Authorization':`Bearer ${apiKey}`, 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Email send failed: ' + (await res.text()));
}

export async function handler(event) {
  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
    const { id } = JSON.parse(event.body || '{}'); // booking_no
    if (!id) return { statusCode: 400, body: 'Missing booking id' };

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // pobierz dane z widoku
    const { data: booking, error: getErr } = await sb
      .from('bookings_view')
      .select('booking_no, when, service_name, client_name, client_email, phone')
      .eq('booking_no', id)
      .single();

    if (getErr || !booking) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Booking not found', details: getErr }) };
    }

    // update status
    const { error: updErr } = await sb
      .from('bookings')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('booking_no', id);

    if (updErr) return { statusCode: 500, body: JSON.stringify({ error: updErr }) };

    // e-mail
    const whenStr = new Date(booking.when).toLocaleString('pl-PL', { dateStyle:'full', timeStyle:'short' });
    const subject = `✅ Potwierdzenie rezerwacji – ${booking.service_name}`;
    const html = `
      <h2>Rezerwacja potwierdzona</h2>
      <p><b>Klient:</b> ${booking.client_name || '-'}<br/>
         <b>Data:</b> ${whenStr}<br/>
         <b>Usługa:</b> ${booking.service_name}</p>
      <p>Telefon: ${booking.phone || '-'} • E-mail: ${booking.client_email || '-'}</p>
      <p>Do zobaczenia! 🙂</p>
    `;

    await sendEmail({
      to: [booking.client_email, THERAPIST_EMAIL],
      subject,
      html
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: String(e) }) };
  }
}
