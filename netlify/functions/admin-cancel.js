import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
    const { booking_id } = JSON.parse(event.body || '{}');

    if (!booking_id) return { statusCode: 400, body: 'Missing booking_id' };

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // status = canceled, zwolnij slot
    const { data: b, error: e1 } = await sb.from('bookings').select('slot_id').eq('id', booking_id).single();
    if (e1) return { statusCode: 500, body: e1.message };

    const { error: e2 } = await sb.from('bookings').update({ status: 'canceled', canceled_at: new Date().toISOString() }).eq('id', booking_id);
    if (e2) return { statusCode: 500, body: e2.message };

    const { error: e3 } = await sb.from('slots').update({ taken: false }).eq('id', b.slot_id);
    if (e3) return { statusCode: 500, body: e3.message };

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
}
