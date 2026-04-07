// Vercel Serverless Function — ORDYX GROUP Decline Booking
// Stefan clicks "Decline" in his approval email → this runs.
// 1. Validates HMAC token
// 2. Updates Supabase lead status → 'declined'
// 3. Sends client a polite decline email
// 4. Returns a branded confirmation page to Stefan

import { createHmac } from 'crypto';

export const config = { runtime: 'nodejs20.x' };

function verifyToken(id, token) {
  const secret = process.env.BOOKING_SECRET || 'ordyx-booking-secret-change-me';
  const expected = createHmac('sha256', secret).update(String(id)).digest('hex');
  return expected === token;
}

async function sendEmail({ to, subject, html }) {
  const from = process.env.FROM_EMAIL || 'ORDYX GROUP <onboarding@resend.dev>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { id, token, name, email } = req.query;

  if (!id || !token || !verifyToken(id, token)) {
    return res.status(403).send(page('Invalid or expired link.', false));
  }
  if (!email) {
    return res.status(400).send(page('Missing client email.', false));
  }

  try {
    // 1. Update Supabase → declined
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (supabaseUrl && supabaseKey) {
      const isUuid = /^[0-9a-f-]{36}$/i.test(id);
      if (isUuid) {
        await fetch(`${supabaseUrl}/rest/v1/leads?id=eq.${id}`, {
          method: 'PATCH',
          headers: {
            'apikey':        supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
          },
          body: JSON.stringify({ status: 'declined' }),
        });
      }
    }

    // 2. Send decline email to client
    if (process.env.RESEND_API_KEY) {
      await sendEmail({
        to:      email,
        subject: 'Regarding Your Strategy Session Request — ORDYX GROUP',
        html: `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#f0ebe0;margin:0;padding:0}
  .w{max-width:540px;margin:0 auto;padding:48px 24px}
  .logo{font-size:11px;font-weight:700;letter-spacing:.15em;color:#c9a96e;margin-bottom:40px}
  h1{font-size:24px;font-weight:600;margin:0 0 14px;line-height:1.3}
  p{font-size:15px;color:#8a8a8a;line-height:1.7;margin:0 0 16px}
  .cta{display:inline-block;margin-top:8px;padding:13px 28px;background:#c9a96e;color:#0a0a0a;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;border-radius:2px}
  .foot{font-size:12px;color:#4a4a4a;margin-top:36px;padding-top:18px;border-top:1px solid #1c1c1c;line-height:1.7}
</style></head><body>
<div class="w">
  <div class="logo">ORDYX GROUP</div>
  <h1>Thank you for reaching out.</h1>
  <p>Hi ${(name || '').split(' ')[0]},</p>
  <p>We appreciate your interest in a strategy session. Unfortunately, we are not able to accommodate your request at this time — our current engagements are at capacity and we want to ensure every session receives the attention it deserves.</p>
  <p>We encourage you to try again next quarter, or submit a written inquiry if your situation is time-sensitive.</p>
  <a href="${process.env.SITE_URL || 'https://ordyxgroup.com'}/#contact" class="cta">Submit a Written Inquiry</a>
  <div class="foot">
    ORDYX GROUP &nbsp;·&nbsp; Frankfurt<br>
    Stefan Maksimovic
  </div>
</div>
</body></html>`,
      });
    }

    return res.status(200).send(page(
      `Decline sent. Client <strong>${email}</strong> has been notified.`,
      true
    ));

  } catch (err) {
    console.error('[decline-booking] error:', err);
    return res.status(500).send(page('Something went wrong. Please try again.', false));
  }
}

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
</div>
</body></html>`;
}
