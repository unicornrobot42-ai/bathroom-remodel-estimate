// Signature capture endpoint - uses Airtable
// POST: record a signature
// GET: list all signatures

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appDl3z8M1ZhVzv4k';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE_NAME = 'Signatures';

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check for Airtable token
  if (!AIRTABLE_TOKEN) {
    return res.status(500).json({ 
      ok: false, 
      error: 'AIRTABLE_TOKEN not configured' 
    });
  }

  // GET - list signatures
  if (req.method === 'GET') {
    try {
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}?sort%5B0%5D%5Bfield%5D=Signed%20At&sort%5B0%5D%5Bdirection%5D=desc`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`
        }
      });
      
      if (!response.ok) {
        const error = await response.text();
        return res.status(500).json({ ok: false, error: `Airtable error: ${error}` });
      }
      
      const data = await response.json();
      const signatures = (data.records || []).map(r => ({
        id: r.id,
        name: r.fields['Name'] || '',
        email: r.fields['Email'] || '',
        proposal: r.fields['Proposal'] || '',
        amount: r.fields['Amount'] || '',
        signedAt: r.fields['Signed At'] || '',
        userAgent: r.fields['User Agent'] || ''
      }));
      
      return res.status(200).json({ ok: true, signatures });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  // POST - record signature
  if (req.method === 'POST') {
    try {
      const { name, email, proposal, amount } = req.body || {};
      
      if (!name || !email || !proposal) {
        return res.status(400).json({ 
          ok: false, 
          error: 'Missing required fields: name, email, proposal' 
        });
      }

      const signedAt = new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        dateStyle: 'long',
        timeStyle: 'short'
      });
      
      const userAgent = req.headers['user-agent'] || 'unknown';

      const record = {
        fields: {
          'Name': name,
          'Email': email,
          'Proposal': proposal,
          'Amount': amount || '',
          'Signed At': signedAt,
          'User Agent': userAgent
        }
      };

      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(record)
      });

      if (!response.ok) {
        const error = await response.text();
        return res.status(500).json({ 
          ok: false, 
          error: `Airtable error: ${error}`,
          record: { name, email, proposal, amount, signed_at: signedAt }
        });
      }

      const result = await response.json();
      
      return res.status(200).json({ 
        ok: true, 
        record: {
          id: result.id,
          name,
          email,
          proposal,
          amount,
          signed_at: signedAt
        }
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
};
