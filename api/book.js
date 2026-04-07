// Vercel Serverless Function — ORDYX GROUP Strategy Session Booking
// Flow:
//   1. Saves to Supabase (status: 'pending')
//   2. Sends Stefan approval email with Confirm / Decline magic links (Resend)
//   3. Sends client a holding email — "We'll confirm within 24h" (Resend)

const { createHmac } = require('crypto');

function makeToken(id) {
  const secret = process.env.BOOKING_SECRET || 'ordyx-booking-secret-change-me';
  return createHmac('sha256', secret).update(String(id)).digest('hex');
}

function formatDateDisplay(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

async function sendEmail({ to, subject, html, attachments }) {
  const from    = process.env.FROM_EMAIL || 'ORDYX GROUP <management@ordyxgroup.com>';
  const replyTo = process.env.STEFAN_EMAIL || 'management@ordyxgroup.com';

  const body = { from, to, subject, html, reply_to: replyTo };
  if (attachments) body.attachments = attachments;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body   = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { first, last, company, email, phone, website, desc, date, time } = body || {};

    if (!first || !company || !email || !date || !time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const name        = `${first} ${last || ''}`.trim();
    const dateDisplay = formatDateDisplay(date);
    const siteUrl     = process.env.SITE_URL || 'https://ordyxgroup.com';
    const stefanEmail = process.env.STEFAN_EMAIL || 'management@ordyxgroup.com';

    const noteText = [
      desc    ? `Challenge: ${desc}`  : '',
      website ? `Website: ${website}` : '',
      `Requested slot: ${date} at ${time} (CET)`,
    ].filter(Boolean).join('\n');

    // ── 1. Save to Supabase ──
    let leadId = null;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (supabaseUrl && supabaseKey) {
      const leadRes = await fetch(`${supabaseUrl}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'apikey':        supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=representation',
        },
        body: JSON.stringify({
          name,
          company_name: company,
          email,
          phone:      phone || null,
          notes:      noteText,
          source:     'website_booking',
          status:     'pending',
          company_id: process.env.ORDYX_COMPANY_ID || null,
        }),
      });

      if (leadRes.ok) {
        const data = await leadRes.json();
        leadId = data[0]?.id || null;
      } else {
        console.error('Supabase error:', await leadRes.text());
      }
    }

    // ── 2. Build magic links ──
    const tokenId = leadId || email;
    const token   = makeToken(tokenId);
    const qs      = new URLSearchParams({ id: tokenId, token, date, time, name, company, email }).toString();
    const confirmUrl = `${siteUrl}/api/confirm-booking?${qs}`;
    const declineUrl = `${siteUrl}/api/decline-booking?${new URLSearchParams({ id: tokenId, token, name, email }).toString()}`;

    if (process.env.RESEND_API_KEY) {
      // ── 3. Approval email → Stefan ──
      try {
        await sendEmail({
          to:      stefanEmail,
          subject: `[New Booking] ${name} · ${company} · ${dateDisplay} ${time}`,
          html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>New Session Request — ORDYX GROUP</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#080808">
<tr><td align="center" style="padding:48px 24px 56px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <!-- Wordmark -->
  <tr><td style="padding-bottom:48px">
    <span style="font-size:10px;font-weight:700;letter-spacing:.22em;color:#c9a96e;text-transform:uppercase">ORDYX GROUP</span>
  </td></tr>

  <!-- Label -->
  <tr><td style="padding-bottom:10px">
    <span style="font-size:10px;font-weight:600;letter-spacing:.18em;color:#4a4a4a;text-transform:uppercase">Strategy Session &nbsp;·&nbsp; New Request</span>
  </td></tr>

  <!-- Headline -->
  <tr><td style="padding-bottom:8px">
    <h1 style="margin:0;font-size:28px;font-weight:300;color:#f5f0e8;line-height:1.25;letter-spacing:-.01em">New booking request.</h1>
  </td></tr>

  <tr><td style="padding-bottom:40px">
    <p style="margin:0;font-size:14px;color:#444;line-height:1.6">Review the request below and confirm or decline.</p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding-bottom:36px">
    <div style="height:1px;background:#1a1a1a"></div>
  </td></tr>

  <!-- Date -->
  <tr><td style="padding-bottom:6px">
    <span style="font-size:10px;font-weight:600;letter-spacing:.14em;color:#3a3a3a;text-transform:uppercase">Requested Slot</span>
  </td></tr>
  <tr><td style="padding-bottom:6px">
    <span style="font-size:21px;font-weight:400;color:#f5f0e8;letter-spacing:-.01em">${dateDisplay}</span>
  </td></tr>
  <tr><td style="padding-bottom:40px">
    <span style="font-size:13px;color:#c9a96e;letter-spacing:.04em">${time} CET &nbsp;&nbsp;·&nbsp;&nbsp; 30 minutes</span>
  </td></tr>

  <!-- Client details -->
  <tr><td style="padding-bottom:28px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding:20px 0 0;border-top:1px solid #161616">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="width:50%;padding:0 20px 20px 0;vertical-align:top">
              <div style="font-size:9px;font-weight:600;letter-spacing:.15em;color:#333;text-transform:uppercase;margin-bottom:7px">Name</div>
              <div style="font-size:14px;color:#d4cfc6;font-weight:400">${name}</div>
            </td>
            <td style="width:50%;padding:0 0 20px 20px;vertical-align:top;border-left:1px solid #161616">
              <div style="font-size:9px;font-weight:600;letter-spacing:.15em;color:#333;text-transform:uppercase;margin-bottom:7px">Company</div>
              <div style="font-size:14px;color:#d4cfc6;font-weight:400">${company}</div>
            </td>
          </tr>
          <tr>
            <td style="width:50%;padding:16px 20px 0 0;vertical-align:top;border-top:1px solid #161616">
              <div style="font-size:9px;font-weight:600;letter-spacing:.15em;color:#333;text-transform:uppercase;margin-bottom:7px">Email</div>
              <div style="font-size:13px;color:#888;font-weight:400">${email}</div>
            </td>
            ${phone ? `<td style="width:50%;padding:16px 0 0 20px;vertical-align:top;border-top:1px solid #161616;border-left:1px solid #161616">
              <div style="font-size:9px;font-weight:600;letter-spacing:.15em;color:#333;text-transform:uppercase;margin-bottom:7px">Phone</div>
              <div style="font-size:13px;color:#888;font-weight:400">${phone}</div>
            </td>` : '<td style="border-top:1px solid #161616"></td>'}
          </tr>
          ${desc ? `<tr>
            <td colspan="2" style="padding:20px 0 0;border-top:1px solid #161616">
              <div style="font-size:9px;font-weight:600;letter-spacing:.15em;color:#333;text-transform:uppercase;margin-bottom:9px">Challenge / Context</div>
              <div style="font-size:13px;color:#666;line-height:1.75;white-space:pre-wrap">${desc}</div>
            </td>
          </tr>` : ''}
        </table>
      </td></tr>
    </table>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding-bottom:36px">
    <div style="height:1px;background:#1a1a1a"></div>
  </td></tr>

  <!-- Action buttons -->
  <tr><td style="padding-bottom:16px">
    <table cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding-right:12px">
          <a href="${confirmUrl}" style="display:inline-block;padding:13px 32px;background:#c9a96e;color:#080808;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;text-decoration:none">Confirm Session</a>
        </td>
        <td>
          <a href="${declineUrl}" style="display:inline-block;padding:12px 28px;background:transparent;color:#4a4a4a;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;border:1px solid #2a2a2a">Decline</a>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="padding-bottom:48px">
    <p style="margin:0;font-size:11px;color:#2d2d2d;line-height:1.6">Confirming will automatically send the client a calendar invite.</p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="border-top:1px solid #141414;padding-top:24px">
    <p style="margin:0;font-size:11px;color:#2a2a2a;line-height:1.8">ORDYX GROUP &nbsp;·&nbsp; Internal Notification</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
        });
      } catch (e) {
        console.error('[book] Stefan email error:', e.message);
      }

      // ── 4. Holding email → Client ──
      try {
        await sendEmail({
          to:      email,
          subject: 'Your Strategy Session Request — ORDYX GROUP',
          html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Session Request Received — ORDYX GROUP</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#080808">
<tr><td align="center" style="padding:48px 24px 56px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">

  <!-- Wordmark -->
  <tr><td style="padding-bottom:52px">
    <span style="font-size:10px;font-weight:700;letter-spacing:.22em;color:#c9a96e;text-transform:uppercase">ORDYX GROUP</span>
  </td></tr>

  <!-- Label -->
  <tr><td style="padding-bottom:10px">
    <span style="font-size:10px;font-weight:600;letter-spacing:.18em;color:#4a4a4a;text-transform:uppercase">Request Received</span>
  </td></tr>

  <!-- Headline -->
  <tr><td style="padding-bottom:20px">
    <h1 style="margin:0;font-size:27px;font-weight:300;color:#f5f0e8;line-height:1.25;letter-spacing:-.01em">We have your request.</h1>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding-bottom:36px">
    <p style="margin:0;font-size:15px;color:#666;line-height:1.75">Thank you, ${name.split(' ')[0]}. We review every request personally and will confirm your slot within 24 hours.</p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding-bottom:36px">
    <div style="height:1px;background:#1a1a1a"></div>
  </td></tr>

  <!-- Date block -->
  <tr><td style="padding-bottom:8px">
    <span style="font-size:10px;font-weight:600;letter-spacing:.14em;color:#3a3a3a;text-transform:uppercase">Requested Slot</span>
  </td></tr>
  <tr><td style="padding-bottom:6px">
    <span style="font-size:21px;font-weight:400;color:#f5f0e8;letter-spacing:-.01em">${dateDisplay}</span>
  </td></tr>
  <tr><td style="padding-bottom:40px">
    <span style="font-size:13px;color:#c9a96e;letter-spacing:.04em">${time} CET &nbsp;&nbsp;·&nbsp;&nbsp; 30-minute working session</span>
  </td></tr>

  <!-- Next steps -->
  <tr><td style="padding-bottom:48px">
    <p style="margin:0;font-size:14px;color:#555;line-height:1.75">Once confirmed, you will receive a calendar invite and further details by email.</p>
    <p style="margin:16px 0 0;font-size:13px;color:#333;line-height:1.7;font-style:italic">This is not a sales call. It is a structured working session.</p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="border-top:1px solid #141414;padding-top:24px">
    <p style="margin:0;font-size:11px;color:#2d2d2d;line-height:1.8">Questions? Reply directly to this email.<br>ORDYX GROUP &nbsp;·&nbsp; Frankfurt</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
        });
      } catch (e) {
        console.error('[book] Client email error:', e.message);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[book] Handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
