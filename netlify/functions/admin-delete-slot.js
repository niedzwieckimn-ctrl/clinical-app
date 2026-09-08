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
    const { slot_id } = JSON.parse(event.body || '{}');
    if (!slot_id) return json(400, { error: 'Brak slot_id.' });

    const { data: slot, error: getError } = await auth.sb
      .from('slots')
      .select('id, taken')
      .eq('id', slot_id)
      .single();
    if (getError || !slot) return json(404, { error: 'Nie znaleziono terminu.' });
    if (slot.taken) {
      return json(409, { error: 'Termin jest zajęty. Najpierw anuluj rezerwację.' });
    }

    const { error: deleteError } = await auth.sb
      .from('slots')
      .delete()
      .eq('id', slot_id)
      .eq('taken', false);
    if (deleteError) return json(500, { error: deleteError.message });
    return json(200, { ok: true });
  } catch (error) {
    return json(500, { error: String(error?.message || error) });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify(body),
  };
}
