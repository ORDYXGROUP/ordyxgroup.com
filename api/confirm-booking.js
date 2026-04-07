// Vercel Serverless Function — ORDYX GROUP Confirm Booking
// Stefan clicks "Confirm Session" → validates token → sends client ICS invite

const { createHmac } = require('crypto');

function verifyToken(id, token) {
  const secret = process.env.BOOKING_SECRET || 'ordyx-booking-secret-change-me';
  const expected = createHmac('sha256', secret).update(String(id)).digest('hex');
  return expected === token;
}

function formatDateDisplay(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function buildICS({ name, email, date, time }) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute]     = time.split(':').map(Number);

  // CET/CEST offset
  const d     = new Date(year, month - 1, day);
  const march = new Date(year, 2, 31);
  while (march.getDay() !== 0) march.setDate(march.getDate() - 1);
  const oct   = new Date(year, 9, 31);
  while (oct.getDay() !== 0) oct.setDate(oct.getDate() - 1);
  const offsetH  = (d >= march && d < oct) ? 2 : 1;

  const startUtc = new Date(Date.UTC(year, month - 1, day, hour - offsetH, minute));
  const endUtc   = new Date(startUtc.getTime() + 30 * 60 * 1000);

  function fmt(dt) { return dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'; }

  const uid      = `booking-${date}-${time.replace(':', '')}-${email.split('@')[0]}@ordyxgroup.com`;
  const fromMail = process.env.STEFAN_EMAIL || 'stefan@ordyxgroup.com';

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ORDYX GROUP//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(startUtc)}`,
    `DTEND:${fmt(endUtc)}`,
    'SUMMARY:Strategy Session – ORDYX GROUP',
    `DESCRIPTION:30-minute working session.\\nThis is not a sales call — it is a structured diagnostic session.`,
    `ORGANIZER;CN=Stefan Maksimovic · ORDYX GROUP:mailto:${fromMail}`,
    `ATTENDEE;CN=${name};RSVP=TRUE;PARTSTAT=ACCEPTED:mailto:${email}`,
    'LOCATION:Video Call (link will be shared)',
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Strategy Session with ORDYX GROUP in 30 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

async function sendEmail({ to, subject, html, attachments }) {
  const from = process.env.FROM_EMAIL || 'ORDYX GROUP <onboarding@resend.dev>';
  const body = { from, to, subject, html };
  if (attachments) body.attachments = attachments;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { id, token, date, time, name, company, email } = req.query;

  if (!id || !token || !verifyToken(id, token)) {
    return res.status(403).send(page('Invalid or expired link.', false));
  }
  if (!date || !time || !email) {
    return res.status(400).send(page('Missing booking details.', false));
  }

  const dateDisplay = formatDateDisplay(date);

  try {
    // Update Supabase → confirmed
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (supabaseUrl && supabaseKey && /^[0-9a-f-]{36}$/i.test(id)) {
      await fetch(`${supabaseUrl}/rest/v1/leads?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json', 'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ status: 'confirmed' }),
      });
    }

    // Send confirmation + ICS to client
    if (process.env.RESEND_API_KEY) {
      const icsContent = buildICS({ name, email, company, date, time });
      const icsBase64  = Buffer.from(icsContent).toString('base64');

      await sendEmail({
        to:      email,
        subject: `Session Confirmed — ${dateDisplay} at ${time} CET`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#f0ebe0;margin:0;padding:0}
  .w{max-width:540px;margin:0 auto;padding:48px 24px}
  .logo{font-size:11px;font-weight:700;letter-spacing:.15em;color:#c9a96e;margin-bottom:40px}
  .badge{display:inline-block;background:rgba(45,106,79,0.15);border:1px solid #2d6a4f;color:#6fcf97;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:5px 12px;border-radius:2px;margin-bottom:22px}
  h1{font-size:26px;font-weight:600;margin:0 0 14px;line-height:1.3}
  p{font-size:15px;color:#8a8a8a;line-height:1.7;margin:0 0 16px}
  .slot{background:#161616;border-left:3px solid #c9a96e;padding:20px 24px;margin:24px 0;border-radius:2px}
  .slot-date{font-size:19px;font-weight:600;color:#f0ebe0}
  .slot-time{font-size:14px;color:#c9a96e;margin-top:5px}
  .info{background:#111;border:1px solid #242424;border-radius:4px;padding:20px 24px;margin:24px 0}
  .info-row{font-size:13px;color:#8a8a8a;line-height:1.9}
  .info-row strong{color:#f0ebe0;font-weight:600}
  .foot{font-size:12px;color:#4a4a4a;margin-top:36px;padding-top:18px;border-top:1px solid #1c1c1c;line-height:1.7}
</style></head><body>
<div class="w">
  <div class="logo">ORDYX GROUP</div>
  <div class="badge">✓ Confirmed</div>
  <h1>Your session is confirmed.</h1>
  <p>We look forward to speaking with you, ${(name || '').split(' ')[0]}. A calendar invite is attached — add it with one click.</p>
  <div class="slot">
    <div class="slot-date">${dateDisplay}</div>
    <div class="slot-time">${time} CET &nbsp;·&nbsp; 30 minutes</div>
  </div>
  <div class="info">
    <div class="info-row"><strong>Format</strong> &nbsp;— Video call (link shared 1 hour before)</div>
    <div class="info-row"><strong>Duration</strong> &nbsp;— 30 minutes</div>
    <div class="info-row"><strong>Preparation</strong> &nbsp;— No preparation required. Come as you are.</div>
  </div>
  <p style="font-style:italic;color:#6a6a6a">This is not a sales call. It's a structured working session focused on diagnosing what's limiting your business.</p>
  <div class="foot">Questions? Simply reply to this email.<br>ORDYX GROUP &nbsp;·&nbsp; Frankfurt<br>Stefan Maksimovic</div>
</div></body></html>`,
        attachments: [{
          filename:    'ordyx-session.ics',
          content:     icsBase64,
          type:        'text/calendar',
          disposition: 'attachment',
        }],
      });
    }

    return res.status(200).send(page(
      `Session confirmed. Calendar invite sent to <strong>${email}</strong>.`,
      true,
      `${dateDisplay} · ${time} CET`
    ));
  } catch (err) {
    console.error('[confirm-booking] error:', err);
    return res.status(500).send(page('Something went wrong. Please try again.', false));
  }
};

function page(message, success, detail = '') {
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
  .detail{font-size:13px;color:#c9a96e;margin-top:12px}
  .logo{font-size:10px;font-weight:700;letter-spacing:.15em;color:#4a4a4a;margin-top:36px}
</style></head><body>
<div class="card">
  <div class="icon">${icon}</div>
  <h1>${success ? 'Session Confirmed' : 'Action Failed'}</h1>
  <p>${message}</p>
  ${detail ? `<div class="detail">${detail}</div>` : ''}
  <div class="logo">ORDYX GROUP</div>
</div></body></html>`;
}
