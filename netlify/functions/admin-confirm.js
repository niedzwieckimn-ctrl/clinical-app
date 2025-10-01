import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  try {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE } = process.env;
    const { booking_id } = JSON.parse(event.body || '{}');

    if (!booking_id) return { statusCode: 400, body: 'Missing booking_id' };

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    // set status = confirmed + timestamp
    const { error } = await sb
      .from('bookings')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', booking_id);

    if (error) return { statusCode: 500, body: error.message };

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
}
