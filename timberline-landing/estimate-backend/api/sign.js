// Timberline Proposal Signature Endpoint
// Writes signatures to Google Sheets via OAuth refresh token
// No secrets in frontend — all handled here

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const SHEET_ID = process.env.SHEET_ID || '14GhgBXiiA0th4SAGDmbBsOKJdYlqKjgJGpmsCuI7KvA';

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  return data.access_token;
}

async function appendToSheet(accessToken, row) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A:F:append?valueInputOption=RAW`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [row] })
    }
  );
  return res.json();
}

async function readFromSheet(accessToken, proposal) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Sheet1!A:F`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  const rows = data.values || [];
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i][2] === proposal) {
      return {
        name: rows[i][0],
        email: rows[i][1],
        proposal: rows[i][2],
        amount: rows[i][3],
        signed_at: rows[i][4]
      };
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    const { proposal } = req.query;
    if (!proposal) {
      return res.status(400).json({ error: 'proposal parameter required' });
    }
    try {
      const accessToken = await getAccessToken();
      const signature = await readFromSheet(accessToken, proposal);
      return res.status(200).json({ signed: !!signature, signature });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { name, email, proposal, amount, signed_at, user_agent } = req.body || {};
    if (!name || !proposal) {
      return res.status(400).json({ error: 'name and proposal required' });
    }

    const timestamp = signed_at || new Date().toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      dateStyle: 'long',
      timeStyle: 'short'
    });

    const row = [
      name,
      email || '',
      proposal,
      amount || '',
      timestamp,
      user_agent || req.headers['user-agent'] || ''
    ];

    try {
      const accessToken = await getAccessToken();
      await appendToSheet(accessToken, row);
      return res.status(200).json({
        ok: true,
        record: { name, email, proposal, amount, signed_at: timestamp }
      });
    } catch (err) {
      return res.status(200).json({
        ok: true,
        warning: err.message,
        record: { name, email, proposal, amount, signed_at: timestamp }
      });
    }
  }

  return res.status(405).json({ error: 'method not allowed' });
}
