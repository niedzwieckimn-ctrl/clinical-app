import { requireAdmin, response } from './_auth.js';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method Not Allowed' });
  const auth = await requireAdmin(event);
  if (auth.error) return auth.error;
  try {
    const { subject, html, to } = JSON.parse(event.body || '{}');
    const recipient = String(to || '').trim().toLowerCase();
    const allowed = new Set(String(process.env.ALLOWED_EMAIL_RECIPIENTS || process.env.THERAPIST_EMAIL || '')
      .split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
    if (!subject || !html || !recipient || !allowed.has(recipient)) return response(400, { error: 'Niedozwolony odbiorca lub treść' });
    if (String(subject).length > 200 || String(html).length > 50000) return response(413, { error: 'Wiadomość jest zbyt duża' });
    const resend = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.FROM_EMAIL, to: [recipient], subject: String(subject), html: String(html) })
    });
    if (!resend.ok) throw new Error('Błąd dostawcy poczty');
    return response(200, { ok: true });
  } catch (error) {
    console.error('[send-email]', error); return response(500, { error: 'Nie udało się wysłać wiadomości' });
  }
};
