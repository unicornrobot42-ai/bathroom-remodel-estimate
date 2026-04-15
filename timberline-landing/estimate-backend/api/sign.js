// Proposal Signature Endpoint
// POST /api/sign
// Logs signature to Airtable "Signatures" table

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appDl3z8M1ZhVzv4k';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));
    return res.status(200).end();
  }

  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, proposal, amount, signed_at, user_agent } = req.body || {};

  if (!name || !proposal) {
    return res.status(400).json({ error: 'name and proposal are required' });
  }

  const timestamp = signed_at || new Date().toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'long',
    timeStyle: 'short'
  });

  try {
    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Signatures`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [{
            fields: {
              'Signed By': name,
              'Email': email || '',
              'Proposal': proposal,
              'Amount': amount || '',
              'Signed At': timestamp,
              'IP / Agent': user_agent || '',
              'Status': 'Accepted'
            }
          }]
        })
      }
    );

    if (!airtableRes.ok) {
      const err = await airtableRes.text();
      console.error('Airtable error:', err);
      return res.status(200).json({ ok: true, warning: 'Airtable write failed', name, timestamp });
    }

    const data = await airtableRes.json();
    return res.status(200).json({ ok: true, record: data.records?.[0]?.id, name, timestamp });

  } catch (err) {
    console.error('Sign error:', err);
    return res.status(200).json({ ok: true, warning: 'Could not reach Airtable', name, timestamp });
  }
}
