import { adminClient, response } from './_auth.js';
import { spaEmail } from './_spa-email.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (value, max) => String(value || '').trim().slice(0, max);

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method Not Allowed' });
  try {
    const body = JSON.parse(event.body || '{}');
    const input = {
      name: clean(body.name, 120), email: clean(body.email, 254).toLowerCase(),
      phone: clean(body.phone, 40), address: clean(body.address, 500), notes: clean(body.notes, 2000),
      slot_id: clean(body.slot_id, 80), service_id: clean(body.service_id, 80)
    };
    if (!input.name || !EMAIL.test(input.email) || !input.phone || !input.address || !input.slot_id || !input.service_id) {
      return response(400, { error: 'Nieprawidłowe lub niekompletne dane rezerwacji' });
    }
    const sb = adminClient();
    const { data, error } = await sb.rpc('create_public_booking', {
      p_name: input.name, p_email: input.email, p_phone: input.phone, p_address: input.address,
      p_slot_id: input.slot_id, p_service_id: input.service_id, p_notes: input.notes
    });
    if (error) {
      const unavailable = /slot_unavailable|not available|duplicate/i.test(error.message || '');
      const code = clean(error.code || 'DB', 30);
      console.error('[create-booking rpc]', { code, message: error.message, details: error.details, hint: error.hint });
      return response(unavailable ? 409 : 400, {
        error: unavailable
          ? 'Wybrany termin nie jest już dostępny.'
          : `Nie udało się utworzyć rezerwacji. Kod błędu: ${code}`
      });
    }
    const booking = Array.isArray(data) ? data[0] : data;
    try {
      const [{ data: slot }, { data: service }] = await Promise.all([
        sb.from('slots').select('when').eq('id', input.slot_id).single(),
        sb.from('services').select('name').eq('id', input.service_id).single()
      ]);
      await sendNotification({ booking, input, slot, service });
    } catch (mailError) { console.warn('[create-booking email]', mailError); }
    return response(201, { ok: true, booking });
  } catch (error) {
    console.error('[create-booking]', error);
    const missingConfig = /Brak konfiguracji Supabase/i.test(error?.message || '');
    return response(500, {
      error: missingConfig
        ? 'Brak konfiguracji Supabase w Netlify Functions. Sprawdź SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY, a następnie wykonaj nowy deploy.'
        : 'Nie udało się utworzyć rezerwacji. Kod błędu: FUNCTION'
    });
  }
};

const escapeHtml = value => String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
async function sendNotification({ booking, input, slot, service }) {
  if (!process.env.RESEND_API_KEY || !process.env.THERAPIST_EMAIL) return;
  const when = slot?.when ? new Date(slot.when).toLocaleString('pl-PL', { timeZone:'Europe/Warsaw', dateStyle:'full', timeStyle:'short' }) : '-';
  const message = spaEmail({
    heading: 'Nowa rezerwacja',
    intro: 'Pojawiła się nowa rezerwacja oczekująca na Twoje potwierdzenie.',
    rows: [
      { label: 'Termin', value: when },
      { label: 'Zabieg', value: service?.name || 'wizyta' },
      { label: 'Klient', value: input.name },
      { label: 'Adres', value: input.address },
      { label: 'Kontakt', value: `${input.phone} · ${input.email}` },
      { label: 'Numer', value: booking?.booking_no || '-' }
    ],
    note: input.notes
  });
  const sent = await fetch('https://api.resend.com/emails', { method:'POST', headers:{ Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json' }, body:JSON.stringify({ from:process.env.FROM_EMAIL,to:[process.env.THERAPIST_EMAIL],subject:`Nowa rezerwacja #${booking?.booking_no||''}`,html:message }) });
  if (!sent.ok) throw new Error(`Resend ${sent.status}`);
}
