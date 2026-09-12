// Vercel Serverless Function — ORDYX GROUP / Behind the Full Room
// Hospitality Control Score assessment.
//
// Accepts the reader's 20 answers + contact details, computes the five
// dimension scores (single source of truth for both the on-screen result
// and the emailed one), and sends the result to the reader via Resend.
//
// Every dimension definition, recommendation line and the email closing
// are sourced from the book's own back matter — nothing here is invented.
// See behindtheroom_full_spec_prompt.md for the governing specification.
//
// Environment variables:
//   RESEND_API_KEY  — Resend API key (without it, scoring still works and
//                     the reader still sees their result; only the email
//                     is skipped — see §6 "best-effort" in the spec).
//   FROM_EMAIL      — verified sender, e.g. "ORDYX <hello@ordyxgroup.com>"

// ── The five dimensions (order fixed by the book) ──
const DIMENSIONS = [
  { key: 'pv', title: 'Performance Visibility' },
  { key: 'od', title: 'Owner Dependency' },
  { key: 'mo', title: 'Management Ownership' },
  { key: 'ec', title: 'Execution Consistency' },
  { key: 'ci', title: 'Connection From Information to Result' },
];
const TITLE = Object.fromEntries(DIMENSIONS.map(d => [d.key, d.title]));

// ── Starting-point recommendations — one per weakest dimension.
// Adapted verbatim from the book's 30-Day Control Reset material (spec §5). ──
const RECOMMENDATIONS = {
  pv: 'Start by choosing ONE number that matters and setting a real comparison for it — a target, a prior period, or a similar day — so a deviation is visible within a day, not a month.',
  od: 'Start by naming ONE recurring decision that currently always reaches you, and give one manager clear authority over it for the next 30 days.',
  mo: 'Start by giving ONE manager a single measurable result they own outright — with the authority to act on it without asking first — and review it in four weeks.',
  ec: 'Start by choosing ONE standard that should hold on your busiest shift, and check honestly whether it actually does — under real pressure, not just when things are calm.',
  ci: 'Start by picking ONE problem you’ve discussed more than once, naming a single owner for it, setting a deadline, and actually verifying afterwards whether the result changed.',
};

// Closing line — copied from the book's back matter (spec §7 / book page). ──
const EMAIL_CLOSING =
  'You can run the reset independently using Behind the Full Room — or, if the assessment ' +
  'reveals deeper fragmentation across several areas, request a more detailed ORDYX Diagnostic. ' +
  'That step is optional. The Score and your initial result should provide useful direction ' +
  'even if you never work with ORDYX.';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Score a single dimension: average of 4 ratings (1–5), rescaled to 0–100.
function scoreDimension(arr) {
  const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.round(((avg - 1) / 4) * 100);
}

function validAnswers(answers) {
  if (!answers || typeof answers !== 'object') return false;
  return DIMENSIONS.every(({ key }) => {
    const arr = answers[key];
    return Array.isArray(arr) && arr.length === 4 &&
      arr.every(n => Number.isFinite(n) && n >= 1 && n <= 5);
  });
}

async function sendResultEmail({ to, name, scores, strongest, weakest, recommendation }) {
  const from = process.env.FROM_EMAIL || 'ORDYX <hello@ordyxgroup.com>';
  const firstName = (name || '').trim().split(/\s+/)[0] || 'there';

  const scoreRows = DIMENSIONS.map(d => `
      <tr>
        <td style="padding:11px 0;border-top:1px solid #242424;font-size:14px;color:#c8c2b8;">${d.title}</td>
        <td style="padding:11px 0;border-top:1px solid #242424;font-size:14px;color:#C9B037;font-weight:700;text-align:right;white-space:nowrap;">${scores[d.key]}%</td>
      </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your Hospitality Control Score — ORDYX GROUP</title></head>
<body style="margin:0;padding:0;background:#080808;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#080808">
<tr><td align="center" style="padding:0 24px 64px">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <tr><td style="padding:40px 0 28px">
    <div style="font-size:26px;font-weight:700;letter-spacing:.12em;color:#ffffff;text-transform:uppercase;line-height:1">ORDYX GROUP</div>
  </td></tr>
  <tr><td style="padding-bottom:44px">
    <div style="height:2px;background:linear-gradient(90deg,#c9a96e 0%,#a8843a 100%);width:64px"></div>
  </td></tr>

  <tr><td style="padding-bottom:10px">
    <span style="font-size:9px;font-weight:700;letter-spacing:.2em;color:#666;text-transform:uppercase">The Hospitality Control Score</span>
  </td></tr>
  <tr><td style="padding-bottom:8px">
    <h1 style="margin:0;font-size:30px;font-weight:300;color:#f0ebe0;line-height:1.2;letter-spacing:-.02em">Your Hospitality Control Score</h1>
  </td></tr>
  <tr><td style="padding-bottom:36px">
    <p style="margin:0;font-size:14px;color:#888;line-height:1.7">Thank you, ${firstName}. Here is your result — a diagnostic starting point, not a public rating or a judgment on the quality of your business.</p>
  </td></tr>

  <!-- Scores -->
  <tr><td style="padding-bottom:8px">
    <div style="font-size:9px;font-weight:700;letter-spacing:.18em;color:#666;text-transform:uppercase;margin-bottom:6px">Your five areas</div>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">${scoreRows}</table>
  </td></tr>

  <!-- Strongest -->
  <tr><td style="padding:36px 0 0">
    <div style="font-size:9px;font-weight:700;letter-spacing:.18em;color:#C9B037;text-transform:uppercase;margin-bottom:8px">Strongest area of control</div>
    <div style="font-size:18px;color:#f0ebe0;font-weight:600">${TITLE[strongest]}</div>
  </td></tr>
  <!-- Weakest -->
  <tr><td style="padding:28px 0 0">
    <div style="font-size:9px;font-weight:700;letter-spacing:.18em;color:#C9B037;text-transform:uppercase;margin-bottom:8px">Greatest current exposure</div>
    <div style="font-size:18px;color:#f0ebe0;font-weight:600">${TITLE[weakest]}</div>
  </td></tr>
  <!-- Where to start -->
  <tr><td style="padding:28px 0 40px">
    <div style="font-size:9px;font-weight:700;letter-spacing:.18em;color:#C9B037;text-transform:uppercase;margin-bottom:8px">Where to start</div>
    <div style="font-size:15px;color:#c8c2b8;line-height:1.75">${recommendation}</div>
  </td></tr>

  <!-- Closing -->
  <tr><td style="border-top:1px solid #242424;padding-top:28px;padding-bottom:52px">
    <p style="margin:0;font-size:13px;color:#888;line-height:1.8;font-style:italic">${EMAIL_CLOSING}</p>
  </td></tr>

  <tr><td style="border-top:1px solid #1e1e1e;padding-top:28px">
    <p style="margin:0;font-size:11px;color:#444;line-height:1.9">ORDYX GROUP &nbsp;·&nbsp; Frankfurt am Main &nbsp;·&nbsp; ordyxgroup.com</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject: 'Your Hospitality Control Score', html }),
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
    const { name, email, business, role, answers } = body || {};

    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required.' });
    if (!email || !EMAIL_RE.test(String(email).trim())) return res.status(400).json({ error: 'A valid email is required.' });
    if (!validAnswers(answers)) return res.status(400).json({ error: 'Please answer every statement before submitting.' });

    // ── Scoring (spec §5) ──
    const scores = {};
    DIMENSIONS.forEach(({ key }) => { scores[key] = scoreDimension(answers[key]); });

    // Strongest = highest score, weakest = lowest. On a tie, book order wins
    // (first dimension listed). No composite grade is ever computed.
    let strongest = DIMENSIONS[0].key, weakest = DIMENSIONS[0].key;
    DIMENSIONS.forEach(({ key }) => {
      if (scores[key] > scores[strongest]) strongest = key;
      if (scores[key] < scores[weakest]) weakest = key;
    });
    const recommendation = RECOMMENDATIONS[weakest];

    // ── Result email — best-effort: a failure here must never blank the
    // reader's on-screen result (spec §6). ──
    let emailSent = false;
    const to = String(email).trim();
    if (process.env.RESEND_API_KEY) {
      try {
        await sendResultEmail({ to, name, scores, strongest, weakest, recommendation });
        emailSent = true;
      } catch (e) {
        console.error('[behindtheroom] email send failed:', e.message);
      }
    } else {
      console.warn('[behindtheroom] RESEND_API_KEY not set — skipping result email.');
    }

    // ── Optional lead capture, mirroring contact.js (only if configured) ──
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (supabaseUrl && supabaseKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/leads`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            name: String(name).trim(),
            company_name: (business && String(business).trim()) || null,
            email: to,
            notes: `Hospitality Control Score — role: ${role || '—'} · scores ${DIMENSIONS.map(d => `${d.key}:${scores[d.key]}`).join(' ')} · strongest ${strongest} · exposure ${weakest}`,
            source: 'behindtheroom',
            status: 'new',
            company_id: process.env.ORDYX_COMPANY_ID || null,
          }),
        }).then(r => { if (!r.ok) return r.text().then(t => console.error('[behindtheroom] Supabase error:', t)); });
      } catch (e) {
        console.error('[behindtheroom] Supabase send failed:', e.message);
      }
    }

    return res.status(200).json({ scores, strongest, weakest, recommendation, email: to, emailSent });
  } catch (err) {
    console.error('[behindtheroom] Handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
