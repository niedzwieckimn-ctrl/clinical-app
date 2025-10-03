import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
    const { id } = JSON.parse(event.body || '{}');

    if (!id) {
      return { statusCode: 400, body: 'Missing booking id' };
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // 1. Pobierz szczegóły rezerwacji
    const { data: booking, error: getErr } = await sb
      .from('bookings_view')
      .select('*')
      .eq('booking_no', id)
      .single();

    if (getErr || !booking) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Booking not found', getErr }) };
    }

    // 2. Zaktualizuj status na confirmed
    const { error: updErr } = await sb
      .from('bookings')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('booking_no', id);

    if (updErr) {
      return { statusCode: 500, body: JSON.stringify({ error: updErr }) };
    }

    // 3. Wyślij e-mail do masażystki i klienta
    const res = await fetch(`${process.env.URL || ''}/.netlify/functions/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: [booking.client_email, 'massage.n.spa@gmail.com'], // ← tutaj możesz zmienić adres masażystki
        subject: `✅ Rezerwacja potwierdzona – ${booking.service_name}`,
        text: `Twoja rezerwacja została potwierdzona!\n\nData: ${booking.when}\nUsługa: ${booking.service_name}\n\nDziękujemy!`,
      }),
    });

    const emailOut = await res.text();

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, emailOut }),
    };
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
}
