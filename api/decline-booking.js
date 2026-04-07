// Vercel Serverless Function — ORDYX GROUP Decline Booking

const { createHmac } = require('crypto');

function verifyToken(id, token) {
  const secret = process.env.BOOKING_SECRET || 'ordyx-booking-secret-change-me';
  const expected = createHmac('sha256', secret).update(String(id)).digest('hex');
  return expected === token;
}

async function sendEmail({ to, subject, html }) {
  const from    = process.env.FROM_EMAIL || 'ORDYX GROUP <management@ordyxgroup.com>';
  const replyTo = process.env.STEFAN_EMAIL || 'management@ordyxgroup.com';

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html, reply_to: replyTo }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { id, token, name, email } = req.query;

  if (!id || !token || !verifyToken(id, token)) {
    return res.status(403).send(page('Invalid or expired link.', false));
  }
  if (!email) return res.status(400).send(page('Missing client email.', false));

  try {
    // Update Supabase → declined
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (supabaseUrl && supabaseKey && /^[0-9a-f-]{36}$/i.test(id)) {
      await fetch(`${supabaseUrl}/rest/v1/leads?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ status: 'declined' }),
      });
    }

    // Send decline email to client
    if (process.env.RESEND_API_KEY) {
      await sendEmail({
        to:      email,
        subject: 'Regarding Your Strategy Session Request — ORDYX GROUP',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Regarding Your Request — ORDYX GROUP</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#080808">
<tr><td align="center" style="padding:48px 24px 56px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">

  <!-- Wordmark -->
  <tr><td style="padding-bottom:52px">
    <span style="font-size:10px;font-weight:700;letter-spacing:.22em;color:#c9a96e;text-transform:uppercase">ORDYX GROUP</span>
  </td></tr>

  <!-- Greeting -->
  <tr><td style="padding-bottom:10px">
    <span style="font-size:14px;color:#555">Hi ${(name || '').split(' ')[0]},</span>
  </td></tr>

  <!-- Headline -->
  <tr><td style="padding-bottom:20px">
    <h1 style="margin:0;font-size:27px;font-weight:300;color:#f5f0e8;line-height:1.25;letter-spacing:-.01em">Thank you for reaching out.</h1>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding-bottom:32px">
    <div style="height:1px;background:#1a1a1a"></div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding-bottom:28px">
    <p style="margin:0;font-size:15px;color:#666;line-height:1.8">We appreciate your interest in a strategy session. Unfortunately, we are not able to accommodate your request at this time — our current engagements are at capacity and we want to ensure every session receives the full attention it deserves.</p>
  </td></tr>

  <tr><td style="padding-bottom:40px">
    <p style="margin:0;font-size:15px;color:#555;line-height:1.8">We encourage you to try again next quarter, or submit a written inquiry if your situation is time-sensitive.</p>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding-bottom:52px">
    <a href="${process.env.SITE_URL || 'https://ordyxgroup.com'}/#contact" style="display:inline-block;padding:13px 32px;background:#c9a96e;color:#080808;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;text-decoration:none">Submit a Written Inquiry</a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="border-top:1px solid #141414;padding-top:24px">
    <p style="margin:0;font-size:11px;color:#2d2d2d;line-height:1.8">ORDYX GROUP &nbsp;·&nbsp; Frankfurt<br>Stefan Maksimovic</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
      });
    }

    return res.status(200).send(page(`Decline sent. Client <strong>${email}</strong> has been notified.`, true));
  } catch (err) {
    console.error('[decline-booking] error:', err);
    return res.status(500).send(page('Something went wrong. Please try again.', false));
  }
};

function page(message, success) {
  const color = success ? '#2d6a4f' : '#9b2c2c';
  const icon  = success ? '✓' : '✕';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ORDYX · Booking</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#f0ebe0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:480px;width:100%;background:#111;border:1px solid #242424;border-radius:4px;padding:48px 40px;text-align:center}
  .icon{width:52px;height:52px;border-radius:50%;background:${color}22;border:1px solid ${color};color:${color};font-size:22px;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
  h1{font-size:22px;font-weight:600;margin-bottom:10px}
  p{font-size:14px;color:#8a8a8a;line-height:1.7}
  .logo{font-size:10px;font-weight:700;letter-spacing:.15em;color:#4a4a4a;margin-top:36px}
</style></head><body>
<div class="card">
  <div class="icon">${icon}</div>
  <h1>${success ? 'Booking Declined' : 'Action Failed'}</h1>
  <p>${message}</p>
  <div class="logo">ORDYX GROUP</div>
</div></body></html>`;
}
