export async function handler(event) {
  try {
    const { subject, html } = JSON.parse(event.body || '{}');
    if (!subject || !html) return { statusCode: 400, body: 'Missing fields' };

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL,
        to: process.env.THERAPIST_EMAIL,
        subject,
        html,
      }),
    });

    if (!r.ok) return { statusCode: r.status, body: await r.text() };
    return { statusCode: 200, body: JSON.stringify(await r.json()) };
  } catch (err) {
    return { statusCode: 500, body: 'Server error: ' + err.message };
  }
}
