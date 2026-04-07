// Vercel Serverless Function — ORDYX GROUP Contact Form
// Saves to Supabase + sends Resend emails to Stefan and client.

const BLOCKED = ['gmail','yahoo','hotmail','outlook','icloud','aol','live','me',
                 'googlemail','protonmail','gmx','web','yandex','mail','inbox'];

function isPersonalEmail(email) {
  const dom = (email.split('@')[1] || '').toLowerCase();
  return BLOCKED.some(b => dom === b+'.com' || dom === b+'.de' || dom.startsWith(b+'.'));
}

async function sendEmail({ to, subject, html }) {
  const from    = process.env.FROM_EMAIL    || 'ORDYX GROUP <management@ordyxgroup.com>';
  const replyTo = process.env.STEFAN_EMAIL  || 'management@ordyxgroup.com';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, reply_to: replyTo }),
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
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { first, last, company, email, phone, message } = body || {};

    if (!first || !last || !company || !email || !message) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (isPersonalEmail(email)) {
      return res.status(422).json({ error: 'Personal email not accepted' });
    }

    const name        = `${first} ${last}`.trim();
    const firstName   = first.trim();
    const stefanEmail = process.env.STEFAN_EMAIL || 'management@ordyxgroup.com';

    // ── 1. Notification email → Stefan ──
    if (process.env.RESEND_API_KEY) {
      try {
        await sendEmail({
          to:      stefanEmail,
          subject: `[New Inquiry] ${name} · ${company}`,
          html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>New Inquiry — ORDYX GROUP</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#080808">
<tr><td align="center" style="padding:0 24px 64px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <!-- Header -->
  <tr><td style="padding:40px 0 28px">
    <div style="font-size:26px;font-weight:700;letter-spacing:.12em;color:#ffffff;text-transform:uppercase;line-height:1">ORDYX GROUP</div>
  </td></tr>
  <!-- Gold rule -->
  <tr><td style="padding-bottom:48px">
    <div style="height:2px;background:linear-gradient(90deg,#c9a96e 0%,#a8843a 100%);width:64px"></div>
  </td></tr>

  <!-- Label -->
  <tr><td style="padding-bottom:10px">
    <span style="font-size:9px;font-weight:700;letter-spacing:.2em;color:#666;text-transform:uppercase">Contact Inquiry &nbsp;·&nbsp; New Message</span>
  </td></tr>

  <!-- Headline -->
  <tr><td style="padding-bottom:8px">
    <h1 style="margin:0;font-size:32px;font-weight:300;color:#f0ebe0;line-height:1.2;letter-spacing:-.02em">New inquiry received.</h1>
  </td></tr>

  <tr><td style="padding-bottom:40px">
    <p style="margin:0;font-size:14px;color:#888;line-height:1.6">Reply directly to this email to respond to ${firstName}.</p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding-bottom:32px">
    <div style="height:1px;background:#242424"></div>
  </td></tr>

  <!-- Client fields -->
  <tr><td style="padding-bottom:32px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="width:50%;padding:0 24px 20px 0;vertical-align:top">
          <div style="font-size:9px;font-weight:700;letter-spacing:.18em;color:#666;text-transform:uppercase;margin-bottom:8px">Name</div>
          <div style="font-size:14px;color:#f0ebe0">${name}</div>
        </td>
        <td style="width:50%;padding:0 0 20px 24px;vertical-align:top;border-left:1px solid #242424">
          <div style="font-size:9px;font-weight:700;letter-spacing:.18em;color:#666;text-transform:uppercase;margin-bottom:8px">Company</div>
          <div style="font-size:14px;color:#f0ebe0">${company}</div>
        </td>
      </tr>
      <tr>
        <td style="width:50%;padding:20px 24px 0 0;vertical-align:top;border-top:1px solid #242424">
          <div style="font-size:9px;font-weight:700;letter-spacing:.18em;color:#666;text-transform:uppercase;margin-bottom:8px">Email</div>
          <div style="font-size:13px;color:#aaa">${email}</div>
        </td>
        <td style="width:50%;padding:20px 0 0 24px;vertical-align:top;border-top:1px solid #242424;border-left:1px solid #242424">
          <div style="font-size:9px;font-weight:700;letter-spacing:.18em;color:#666;text-transform:uppercase;margin-bottom:8px">Phone</div>
          <div style="font-size:13px;color:#aaa">${phone || '—'}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Message -->
  <tr><td style="padding-bottom:52px">
    <div style="border-top:1px solid #242424;padding-top:24px">
      <div style="font-size:9px;font-weight:700;letter-spacing:.18em;color:#666;text-transform:uppercase;margin-bottom:12px">Message</div>
      <div style="font-size:14px;color:#c8c2b8;line-height:1.8;white-space:pre-wrap">${message}</div>
    </div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="border-top:1px solid #1e1e1e;padding-top:28px">
    <p style="margin:0;font-size:11px;color:#444;line-height:1.9">ORDYX GROUP &nbsp;·&nbsp; Internal Notification</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
        });
      } catch (e) {
        console.error('[contact] Stefan email error:', e.message);
      }

      // ── 2. Auto-reply → Client ──
      try {
        await sendEmail({
          to:      email,
          subject: 'Your Inquiry — ORDYX GROUP',
          html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Message Received — ORDYX GROUP</title>
</head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#080808">
<tr><td align="center" style="padding:0 24px 64px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <!-- Header -->
  <tr><td style="padding:40px 0 28px">
    <div style="font-size:26px;font-weight:700;letter-spacing:.12em;color:#ffffff;text-transform:uppercase;line-height:1">ORDYX GROUP</div>
  </td></tr>
  <!-- Gold rule -->
  <tr><td style="padding-bottom:52px">
    <div style="height:2px;background:linear-gradient(90deg,#c9a96e 0%,#a8843a 100%);width:64px"></div>
  </td></tr>

  <!-- Label -->
  <tr><td style="padding-bottom:12px">
    <span style="font-size:9px;font-weight:700;letter-spacing:.2em;color:#666;text-transform:uppercase">Message Received</span>
  </td></tr>

  <!-- Headline -->
  <tr><td style="padding-bottom:16px">
    <h1 style="margin:0;font-size:32px;font-weight:300;color:#f0ebe0;line-height:1.2;letter-spacing:-.02em">We have your message.</h1>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding-bottom:36px">
    <div style="height:1px;background:#242424"></div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding-bottom:20px">
    <p style="margin:0;font-size:15px;color:#aaa;line-height:1.85">Thank you, ${firstName}. We review every inquiry personally and will respond within 24–48 hours.</p>
  </td></tr>

  <tr><td style="padding-bottom:52px">
    <p style="margin:0;font-size:13px;color:#555;line-height:1.8;font-style:italic">We look forward to understanding your situation.</p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="border-top:1px solid #1e1e1e;padding-top:28px">
    <p style="margin:0 0 4px;font-size:11px;color:#888;line-height:1.9">Questions? Reply directly to this email.</p>
    <p style="margin:0;font-size:11px;color:#444;line-height:1.9">ORDYX GROUP &nbsp;·&nbsp; Frankfurt</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`,
        });
      } catch (e) {
        console.error('[contact] Client email error:', e.message);
      }
    }

    // ── 3. Save to Supabase ──
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (supabaseUrl && supabaseKey) {
      const r = await fetch(`${supabaseUrl}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'apikey':        supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({
          name:         name,
          company_name: company,
          email,
          phone:        phone || null,
          notes:        message,
          source:       'website_inquiry',
          status:       'new',
          company_id:   process.env.ORDYX_COMPANY_ID || null,
        }),
      });
      if (!r.ok) console.error('Supabase error:', await r.text());
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[contact] Handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
