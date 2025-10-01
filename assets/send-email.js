// assets/send-email.js
async function sendEmail(subject, html) {
  if (!subject || !html) {
    throw new Error('[sendEmail] Missing subject or html');
  }

  const res = await fetch('/.netlify/functions/send-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subject, html }),
  });

  const text = await res.text();
  // pomoc w debugowaniu: pokaż status i odpowiedź
  console.log('[sendEmail] status:', res.status, 'body:', text);

  if (!res.ok) {
    throw new Error('Email HTTP ' + res.status + ' — ' + text);
  }
  try { return JSON.parse(text); } catch { return { ok: true }; }
}
window.sendEmail = sendEmail;
