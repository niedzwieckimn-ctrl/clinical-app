import { requireAdmin } from './_auth.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const auth = await requireAdmin(event);
    if (auth.error) return auth.error;
    const { booking_no } = JSON.parse(event.body || '{}');
    if (!booking_no) return json(400, { error: 'Brak booking_no' });

    const { data: booking, error: getError } = await auth.sb
      .from('bookings')
      .select('booking_no, status, slot_id, reminder_email_ids')
      .eq('booking_no', booking_no)
      .single();
    if (getError || !booking) return json(404, { error: 'Nie znaleziono rezerwacji.' });

    const status = String(booking.status || '').trim().toLowerCase();
    if (!['anulowana', 'cancelled', 'canceled'].includes(status)) {
      return json(409, { error: 'Najpierw anuluj rezerwację. Usunąć można tylko anulowany termin.' });
    }

    const reminderIds = Array.isArray(booking.reminder_email_ids)
      ? booking.reminder_email_ids.filter(Boolean)
      : [];
    const reminderCancellation = await cancelScheduledEmails(reminderIds);
    if (reminderCancellation.failures.length) {
      return json(502, {
        error: 'Nie udało się wycofać wszystkich przypomnień. Rezerwacja nie została usunięta; sprawdź Resend i spróbuj ponownie.',
        reminder_cancellation: reminderCancellation,
      });
    }

    const { error: deleteError } = await auth.sb
      .from('bookings')
      .delete()
      .eq('booking_no', booking_no);
    if (deleteError) return json(500, { error: deleteError.message });

    if (booking.slot_id) {
      await auth.sb.from('slots').update({ taken: false }).eq('id', booking.slot_id);
    }
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: String(error?.message || error) });
  }
};

async function cancelScheduledEmails(ids) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!ids.length) return { requested: 0, canceled: 0, failures: [] };
  if (!apiKey) return { requested: ids.length, canceled: 0, failures: ids.map((id) => ({ id, error: 'Brak RESEND_API_KEY' })) };
  const results = await Promise.all(ids.map(async (id) => {
    const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return { id, error: await res.text() };
    return { id };
  }));
  const failures = results.filter((result) => result.error);
  return { requested: ids.length, canceled: results.length - failures.length, failures };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(body),
  };
}
