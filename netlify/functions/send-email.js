// netlify/functions/send-email.js
export const handler = async (event) => {
  try {
    const { subject, html, to } = JSON.parse(event.body || '{}');
    if (!subject || !html) {
      return new Response('[sendEmail] Missing subject or html', { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.FROM_EMAIL;
    const therapist = process.env.THERAPIST_EMAIL;
    const rcpt = (to && String(to).trim()) || therapist;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [rcpt],
        subject: String(subject),
        html: String(html)
      })
    });

    const text = await res.text();
    if (!res.ok) return new Response(text, { status: res.status });

    return new Response(text, { status: 200 });
  } catch (e) {
    return new Response(`[sendEmail] ${e.message || e}`, { status: 500 });
  }
};
