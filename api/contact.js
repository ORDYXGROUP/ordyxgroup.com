// Vercel Serverless Function — ORDYX GROUP Contact Form
// Saves to Supabase AND forwards to JotForm server-side.
// JotForm sends Stefan a notification email — client receives NOTHING from JotForm.

const BLOCKED = ['gmail','yahoo','hotmail','outlook','icloud','aol','live','me',
                 'googlemail','protonmail','gmx','web','yandex','mail','inbox'];

function isPersonalEmail(email) {
  const dom = (email.split('@')[1] || '').toLowerCase();
  return BLOCKED.some(b => dom === b+'.com' || dom === b+'.de' || dom.startsWith(b+'.'));
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

    // ── 1. Forward to JotForm server-side ──
    try {
      const jfForm = new URLSearchParams();
      jfForm.append('formID', '260893671355062');
      jfForm.append('q2_q2_fullname0[first]', first);
      jfForm.append('q2_q2_fullname0[last]',  last);
      jfForm.append('q3_q3_textbox1',         company);
      jfForm.append('q4_q4_email2',           email);
      jfForm.append('q5_q5_phone3[full]',     phone || '');
      jfForm.append('q6_q6_textarea4',        message);
      jfForm.append('simple_spc',             '260893671355062-260893671355062');
      jfForm.append('submitSource',           'api');

      await fetch('https://submit.jotform.com/submit/260893671355062/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: jfForm.toString(),
      });
    } catch (jfErr) {
      console.error('JotForm forward error (non-fatal):', jfErr);
    }

    // ── 2. Save to Supabase ──
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (supabaseUrl && supabaseKey) {
      const r = await fetch(`${supabaseUrl}/rest/v1/leads`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          name:         `${first} ${last}`.trim(),
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
    console.error('Contact handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
