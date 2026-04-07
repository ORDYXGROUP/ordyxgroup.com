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
          html: `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#f0ebe0;margin:0;padding:0}
  .w{max-width:600px;margin:0 auto;padding:40px 24px}
  .label{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#c9a96e;margin-bottom:6px}
  h1{font-size:26px;font-weight:600;margin:0 0 6px}
  .sub{color:#8a8a8a;font-size:14px;margin-bottom:28px}
  .slot{background:#111;border:1px solid #c9a96e;border-radius:4px;padding:18px 22px;margin-bottom:24px}
  .slot-date{font-size:20px;font-weight:600}
  .slot-time{color:#c9a96e;font-size:14px;margin-top:4px}
  .card{background:#161616;border:1px solid #242424;border-radius:4px;padding:22px;margin-bottom:24px}
  .fl{margin-bottom:14px}
  .fl-label{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#4a4a4a;margin-bottom:3px}
  .fl-val{font-size:14px;color:#f0ebe0}
  .desc{font-size:13px;color:#8a8a8a;line-height:1.65;white-space:pre-wrap}
  .btns{display:flex;gap:12px;margin-top:4px}
  .btn{display:inline-block;padding:14px 28px;border-radius:4px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;text-align:center}
  .btn-ok{background:#c9a96e;color:#0a0a0a}
  .btn-no{background:transparent;color:#8a8a8a;border:1px solid #333}
  .foot{font-size:12px;color:#4a4a4a;margin-top:36px;padding-top:18px;border-top:1px solid #1c1c1c}
</style></head><body>
<div class="w">
  <div class="label">Strategy Session — New Request</div>
  <h1>New Booking Request</h1>
  <p class="sub">Review below and confirm or decline.</p>
  <div class="slot">
    <div class="slot-date">${dateDisplay}</div>
    <div class="slot-time">${time} CET &nbsp;·&nbsp; 30 minutes</div>
  </div>
  <div class="card">
    <div class="fl"><div class="fl-label">Name</div><div class="fl-val">${name}</div></div>
    <div class="fl"><div class="fl-label">Company</div><div class="fl-val">${company}</div></div>
    <div class="fl"><div class="fl-label">Email</div><div class="fl-val">${email}</div></div>
    ${phone ? `<div class="fl"><div class="fl-label">Phone</div><div class="fl-val">${phone}</div></div>` : ''}
    ${desc  ? `<div class="fl"><div class="fl-label">Challenge / Context</div><div class="desc">${desc}</div></div>` : ''}
  </div>
  <div class="btns">
    <a href="${confirmUrl}" class="btn btn-ok">✓ &nbsp; Confirm Session</a>
    <a href="${declineUrl}" class="btn btn-no">✕ &nbsp; Decline</a>
  </div>
  <div class="foot">ORDYX GROUP · Internal Notification<br>Clicking Confirm sends the client a calendar invite automatically.</div>
</div></body></html>`,
        });
      } catch (e) {
        console.error('[book] Stefan email error:', e.message);
      }

      // ── 4. Holding email → Client ──
      try {
        await sendEmail({
          to:      email,
          subject: 'Your Strategy Session Request — ORDYX GROUP',
          html: `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,sans-serif;background:#0a0a0a;color:#f0ebe0;margin:0;padding:0}
  .w{max-width:540px;margin:0 auto;padding:48px 24px}
  .logo{font-size:11px;font-weight:700;letter-spacing:.15em;color:#c9a96e;margin-bottom:40px}
  h1{font-size:26px;font-weight:600;margin:0 0 14px;line-height:1.3}
  p{font-size:15px;color:#8a8a8a;line-height:1.7;margin:0 0 16px}
  .slot{background:#161616;border-left:3px solid #c9a96e;padding:18px 22px;margin:24px 0;border-radius:2px}
  .slot-date{font-size:18px;font-weight:600;color:#f0ebe0}
  .slot-time{font-size:14px;color:#c9a96e;margin-top:5px}
  .foot{font-size:12px;color:#4a4a4a;margin-top:36px;padding-top:18px;border-top:1px solid #1c1c1c}
</style></head><body>
<div class="w">
  <div class="logo">ORDYX GROUP</div>
  <h1>We received your session request.</h1>
  <p>Thank you, ${name.split(' ')[0]}. We review every request personally and will confirm your slot within 24 hours.</p>
  <div class="slot">
    <div class="slot-date">${dateDisplay}</div>
    <div class="slot-time">${time} CET &nbsp;·&nbsp; 30-minute working session</div>
  </div>
  <p>Once confirmed, you will receive a calendar invite and further details by email.</p>
  <p style="font-style:italic;color:#6a6a6a">This is not a sales call. It's a structured working session.</p>
  <div class="foot">Questions? Reply directly to this email.<br>ORDYX GROUP · Frankfurt</div>
</div></body></html>`,
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
