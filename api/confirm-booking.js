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
  const fromMail = process.env.STEFAN_EMAIL || 'management@ordyxgroup.com';

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
  const from    = process.env.FROM_EMAIL || 'ORDYX GROUP <management@ordyxgroup.com>';
  const replyTo = process.env.STEFAN_EMAIL || 'management@ordyxgroup.com';

  const body = { from, to, subject, html, reply_to: replyTo };
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
        html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Session Confirmed — ORDYX GROUP</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#080808">
<tr><td align="center" style="padding:0 24px 64px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <!-- Header bar -->
  <tr><td style="padding:40px 0 28px">
    <div style="font-size:26px;font-weight:700;letter-spacing:.12em;color:#ffffff;text-transform:uppercase;line-height:1">ORDYX GROUP</div>
  </td></tr>
  <!-- Gold rule -->
  <tr><td style="padding-bottom:52px">
    <div style="height:2px;background:linear-gradient(90deg,#c9a96e 0%,#a8843a 100%);width:64px"></div>
  </td></tr>

  <!-- Status tag -->
  <tr><td style="padding-bottom:12px">
    <span style="display:inline-block;font-size:9px;font-weight:700;letter-spacing:.2em;color:#5a9a70;text-transform:uppercase;border:1px solid #2a5a3a;padding:5px 12px">SESSION CONFIRMED</span>
  </td></tr>

  <!-- Headline -->
  <tr><td style="padding-bottom:16px">
    <h1 style="margin:0;font-size:32px;font-weight:300;color:#f0ebe0;line-height:1.2;letter-spacing:-.02em">Your session is scheduled.</h1>
  </td></tr>

  <!-- Intro -->
  <tr><td style="padding-bottom:48px">
    <p style="margin:0;font-size:15px;color:#aaa;line-height:1.85">We look forward to speaking with you, ${(name || '').split(' ')[0]}. A calendar invite is attached to this email.</p>
  </td></tr>

  <!-- Date block -->
  <tr><td style="padding-bottom:6px;border-top:1px solid #242424;padding-top:36px">
    <span style="font-size:9px;font-weight:700;letter-spacing:.18em;color:#666;text-transform:uppercase">Date &amp; Time</span>
  </td></tr>
  <tr><td style="padding-bottom:8px">
    <span style="font-size:26px;font-weight:500;color:#ffffff;letter-spacing:-.01em">${dateDisplay}</span>
  </td></tr>
  <tr><td style="padding-bottom:48px">
    <span style="font-size:14px;color:#c9a96e;letter-spacing:.06em;font-weight:500">${time} CET &nbsp;&nbsp;·&nbsp;&nbsp; 30 minutes</span>
  </td></tr>

  <!-- Details block -->
  <tr><td style="padding-bottom:48px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #242424">
      <tr>
        <td style="width:50%;padding:24px 32px 24px 0;vertical-align:top;border-bottom:1px solid #242424">
          <div style="font-size:9px;font-weight:700;letter-spacing:.18em;color:#666;text-transform:uppercase;margin-bottom:10px">Format</div>
          <div style="font-size:14px;color:#c8c2b8;line-height:1.7">Video call<br>Link shared 1 hr before</div>
        </td>
        <td style="width:50%;padding:24px 0 24px 32px;vertical-align:top;border-bottom:1px solid #242424;border-left:1px solid #242424">
          <div style="font-size:9px;font-weight:700;letter-spacing:.18em;color:#666;text-transform:uppercase;margin-bottom:10px">Preparation</div>
          <div style="font-size:14px;color:#c8c2b8;line-height:1.7">None required.<br>Come as you are.</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Note -->
  <tr><td style="padding-bottom:52px">
    <p style="margin:0;font-size:13px;color:#555;line-height:1.8;font-style:italic">This is not a sales call. It is a structured diagnostic session focused on what is limiting your business.</p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="border-top:1px solid #1e1e1e;padding-top:28px">
    <p style="margin:0 0 4px;font-size:11px;color:#888;line-height:1.9">Questions? Reply directly to this email.</p>
    <p style="margin:0;font-size:11px;color:#444;line-height:1.9">ORDYX GROUP &nbsp;·&nbsp; Frankfurt &nbsp;·&nbsp; Stefan Maksimovic</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
        attachments: [{
          filename:     'ordyx-session.ics',
          content:      icsBase64,
          content_type: 'text/calendar',
          disposition:  'attachment',
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
