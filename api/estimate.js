import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Pricing configuration - Based on Justin's actual project budgets
const PRICING = {
  // Base cost by project type
  base: {
    'tub-to-shower': 5414,
    'full-bathroom': 8000,
    'cosmetic': 8000
  },
  
  // Tier ranges (for displaying to customer)
  // Full bathroom ranges now account for size
  ranges: {
    'tub-to-shower': { low: [8614, 9514], mid: [9514, 10614], high: [10614, 12000] },
    'full-bathroom': { 
      // Size-based ranges
      small: { low: [15000, 20000], mid: [18000, 25000], high: [22000, 32000] },   // 40-90 sqft
      standard: { low: [20000, 27000], mid: [24000, 35000], high: [30000, 45000] }, // 90-130 sqft
      large: { low: [25000, 35000], mid: [30000, 45000], high: [40000, 60000] }    // 130+ sqft
    },
    'cosmetic': { low: [4000, 6000], mid: [6000, 10000], high: [10000, 15000] }
  },
  
  condition: {
    'pull-refresh': 1000,
    'full-redesign': 3000,
    'cosmetic': -1000
  },
  
  tile: {
    'low': 700,
    'mid': 1200,
    'high': 2000
  },
  
  flooring: {
    'tile': 35,
    'vinyl': 12,
    'keep-as-is': 0,
    'other': 20
  },
  
  fixtures: {
    'low': 500,
    'mid': 1000,
    'high': 2000
  },
  
  glass: {
    'frameless': 2500,
    'curtain': 0
  },
  
  plumbing: {
    'keep': 0,
    'minor': 500,
    'major': 3500
  }
};

// ============================================================================
// AIRTABLE INTEGRATION
// ============================================================================

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appDl3z8M1ZhVzv4k';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

async function airtableRequest(table, method, data = null) {
  if (!AIRTABLE_TOKEN) {
    console.warn('AIRTABLE_TOKEN not set - skipping Airtable integration');
    return null;
  }
  
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json'
    }
  };
  
  if (data) {
    options.body = JSON.stringify(data);
  }
  
  try {
    const response = await fetch(url, options);
    const result = await response.json();
    
    if (result.error) {
      console.error(`Airtable error (${table}):`, result.error);
      return null;
    }
    
    return result;
  } catch (error) {
    console.error(`Airtable request failed (${table}):`, error);
    return null;
  }
}

async function createContact(data) {
  const fields = {
    'Name': data.name || 'Unknown',
    'Email': data.email,
    'Phone': data.phone,
    'Address': data.address || '',
    'City': data.city || '',
    'State': data.state || '',
    'ZIP': data.zip || '',
    'Date Created': new Date().toISOString(),
    'Notes': `Source: Website estimate form`
  };
  
  const result = await airtableRequest('Contacts', 'POST', { fields });
  return result?.id || null;
}

async function createEstimate(data, contactId, lowEstimate, highEstimate, imageAnalysis) {
  const fields = {
    'Contact': contactId ? [contactId] : [],
    'Project Type': data.projectType,
    'Fixture Quality': data.fixtureQuality,
    'Estimated Price Low': lowEstimate,
    'Estimated Price High': highEstimate,
    'Square Footage': parseInt(data.squareFootage) || 0,
    'Date Created': new Date().toISOString(),
    'Image Analysis Notes': imageAnalysis || ''
  };
  
  // Add photo URL if image was uploaded (we'd need to store it somewhere)
  if (data.image) {
    fields['Photo URL'] = 'Photo uploaded (stored in logs)';
  }
  
  const result = await airtableRequest('Estimates', 'POST', { fields });
  return result?.id || null;
}

async function createPipelineRecord(contactId) {
  const fields = {
    'Contact': contactId ? [contactId] : [],
    'Current Status': 'New Lead',
    'Last Updated': new Date().toISOString(),
    'Internal Notes': 'Auto-created from website estimate',
    'Next Action': 'Review estimate and follow up'
  };
  
  const result = await airtableRequest('Pipeline', 'POST', { fields });
  return result?.id || null;
}

// ============================================================================
// EMAIL NOTIFICATION (Resend)
// ============================================================================

async function sendLeadNotification(data, lowEstimate, highEstimate, imageAnalysis, contactId) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  
  if (!RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set - skipping email notification');
    return false;
  }
  
  const projectTypeLabels = {
    'tub-to-shower': 'Tub to Shower Conversion',
    'full-bathroom': 'Full Bathroom Remodel',
    'cosmetic': 'Cosmetic Refresh'
  };
  
  const fixtureLabels = {
    'low': 'Budget',
    'mid': 'Mid-Range',
    'high': 'Premium'
  };
  
  const airtableLink = contactId 
    ? `https://airtable.com/${AIRTABLE_BASE_ID}/tblContacts/${contactId}`
    : `https://airtable.com/${AIRTABLE_BASE_ID}`;
  
  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #2d5016 0%, #4a7c23 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border: 1px solid #e0e0e0; }
    .estimate-box { background: white; border: 2px solid #4a7c23; border-radius: 8px; padding: 15px; margin: 15px 0; text-align: center; }
    .estimate-range { font-size: 28px; font-weight: bold; color: #2d5016; }
    .detail-row { display: flex; padding: 8px 0; border-bottom: 1px solid #eee; }
    .detail-label { font-weight: 600; min-width: 120px; }
    .cta-button { display: inline-block; background: #4a7c23; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 15px; }
    .footer { text-align: center; padding: 15px; color: #666; font-size: 12px; }
    .analysis { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 10px; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">🏠 New Lead Alert</h1>
      <p style="margin: 5px 0 0 0; opacity: 0.9;">Timberline Build Co - Website Estimate</p>
    </div>
    
    <div class="content">
      <div class="estimate-box">
        <div style="font-size: 14px; color: #666; margin-bottom: 5px;">ESTIMATED RANGE</div>
        <div class="estimate-range">$${lowEstimate.toLocaleString()} - $${highEstimate.toLocaleString()}</div>
      </div>
      
      <h3 style="margin-bottom: 10px;">📋 Project Details</h3>
      
      <div class="detail-row">
        <span class="detail-label">Project Type:</span>
        <span>${projectTypeLabels[data.projectType] || data.projectType}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Fixture Quality:</span>
        <span>${fixtureLabels[data.fixtureQuality] || data.fixtureQuality}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Square Footage:</span>
        <span>${data.squareFootage} sq ft</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Photo:</span>
        <span>${data.image ? '✅ Yes' : '❌ No'}</span>
      </div>
      
      <h3 style="margin: 20px 0 10px 0;">👤 Customer Info</h3>
      
      <div class="detail-row">
        <span class="detail-label">Name:</span>
        <span>${data.name || 'Not provided'}</span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Email:</span>
        <span><a href="mailto:${data.email}">${data.email}</a></span>
      </div>
      
      <div class="detail-row">
        <span class="detail-label">Phone:</span>
        <span><a href="tel:${data.phone}">${data.phone}</a></span>
      </div>
      
      ${data.address ? `
      <div class="detail-row">
        <span class="detail-label">Address:</span>
        <span>${data.address}${data.city ? `, ${data.city}` : ''}${data.state ? `, ${data.state}` : ''} ${data.zip || ''}</span>
      </div>
      ` : ''}
      
      ${imageAnalysis ? `
      <div class="analysis">
        <strong>📸 AI Photo Analysis:</strong><br>
        ${imageAnalysis}
      </div>
      ` : ''}
      
      <div style="text-align: center; margin-top: 20px;">
        <a href="${airtableLink}" class="cta-button">View in CRM →</a>
      </div>
    </div>
    
    <div class="footer">
      <p>Auto-generated by Timberline Build Co Lead Capture System</p>
      <p>${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT</p>
    </div>
  </div>
</body>
</html>
  `;
  
  try {
    const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
    
    if (!SENDGRID_API_KEY) {
      console.warn('SENDGRID_API_KEY not configured');
      return false;
    }
    
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: 'justin@timberlinebuild.co' }]
        }],
        from: { email: 'justin@timberlinebuild.co', name: 'Timberline Build Co' },
        subject: `New Lead: ${data.name || 'Customer'} - $${lowEstimate.toLocaleString()} - $${highEstimate.toLocaleString()}`,
        content: [{
          type: 'text/html',
          value: emailHtml
        }]
      })
    });
    
    if (response.ok) {
      console.log('Lead notification sent via Sendgrid');
      return true;
    } else {
      const error = await response.text();
      console.error('Sendgrid error:', error);
      return false;
    }
  } catch (error) {
    console.error('Email send failed:', error);
    return false;
  }
}

// ============================================================================
// ESTIMATE CALCULATION
// ============================================================================

function calculateBaseEstimate(data) {
  const { projectType, condition, flooring, fixtureQuality, plumbing, glass, squareFootage } = data;
  
  let basePrice = PRICING.base[projectType] || PRICING.base['tub-to-shower'];
  
  let sizeFactor = 1;
  if (squareFootage <= 60) {
    sizeFactor = 0.95;
  } else if (squareFootage >= 150) {
    sizeFactor = 1.10;
  } else if (squareFootage >= 120) {
    sizeFactor = 1.08;
  } else if (squareFootage >= 100) {
    sizeFactor = 1.04;
  }
  
  basePrice = Math.round(basePrice * sizeFactor);
  
  const conditionCost = PRICING.condition[condition] || 0;
  const tileCost = PRICING.tile[fixtureQuality] || PRICING.tile.mid;
  const flooringCost = Math.round((PRICING.flooring[flooring] || 0) * squareFootage);
  const fixtureCost = PRICING.fixtures[fixtureQuality] || PRICING.fixtures.mid;
  const glassCost = PRICING.glass[glass] || 0;
  const plumbingCost = PRICING.plumbing[plumbing] || 0;
  
  const breakdown = {
    base: basePrice + conditionCost,
    tile: tileCost,
    flooring: flooringCost,
    fixtures: fixtureCost,
    glass: glassCost,
    plumbing: plumbingCost
  };
  
  const total = breakdown.base + breakdown.tile + breakdown.flooring + breakdown.fixtures + breakdown.glass + breakdown.plumbing;
  
  const lowEstimate = Math.round(total * 0.95);
  const highEstimate = Math.round(total * 1.15);
  
  return { lowEstimate, highEstimate, breakdown };
}

// ============================================================================
// IMAGE ANALYSIS
// ============================================================================

async function analyzeImage(imageBase64, formData) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
  
  let imageData = imageBase64;
  let mediaType = 'image/jpeg';
  
  if (imageBase64.startsWith('data:')) {
    const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      mediaType = matches[1];
      imageData = matches[2];
    }
  }
  
  if (mediaType === 'image/heic' || mediaType === 'image/heic-p') {
    try {
      const buffer = Buffer.from(imageData, 'base64');
      const converted = await sharp(buffer).jpeg().toBuffer();
      imageData = converted.toString('base64');
      mediaType = 'image/jpeg';
    } catch (error) {
      console.error('HEIC conversion error:', error);
    }
  }
  
  const prompt = `You are a bathroom remodeling expert analyzing a customer's bathroom photo for a remodel estimate.

The customer has provided the following project details:
- Project Type: ${formData.projectType}
- Scope: ${formData.condition}
- Square Footage (customer estimate): ${formData.squareFootage} sq ft
- Flooring Choice: ${formData.flooring}
- Fixture Quality: ${formData.fixtureQuality}
- Plumbing Work: ${formData.plumbing}
- Shower Enclosure: ${formData.glass}

Please analyze this bathroom photo and provide:

1. SQUARE FOOTAGE ESTIMATE: Based on visual cues (fixtures, proportions, typical dimensions), estimate the actual square footage. Compare to the customer's estimate.

2. COMPLEXITY ASSESSMENT: Rate the project complexity on a scale:
   - "straightforward" - Standard layout, no obvious complications
   - "moderate" - Some custom work needed
   - "complex" - Significant custom work, unusual layout, or challenging conditions

3. KEY OBSERVATIONS: Note relevant details like:
   - Current tile/flooring condition
   - Fixture age and condition
   - Visible plumbing concerns
   - Layout considerations
   - Any potential challenges

4. PRICE ADJUSTMENT: Suggest a percentage adjustment to the base estimate:
   - Negative (down to -10%): If the space is simpler than typical
   - Zero: If standard complexity
   - Positive (up to +15%): If more complex than typical

Respond in this exact JSON format:
{
  "estimatedSqFt": number,
  "sqFtDifference": "string describing difference from customer estimate",
  "complexity": "straightforward" | "moderate" | "complex",
  "observations": ["observation 1", "observation 2", ...],
  "priceAdjustment": number (percentage, e.g., 5 for +5%, -10 for -10%),
  "summary": "A 1-2 sentence summary for the customer about their bathroom and what we observed"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: imageData
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ]
    });
    
    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    throw new Error('Could not parse AI response');
  } catch (error) {
    console.error('Vision API error:', error);
    return null;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }
  
  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const data = req.body;
    
    // Validate required fields
    const required = ['projectType', 'condition', 'flooring', 'fixtureQuality', 'plumbing', 'glass', 'squareFootage', 'email', 'phone'];
    for (const field of required) {
      if (!data[field] && data[field] !== 0) {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }
    
    // Calculate base estimate
    let { lowEstimate, highEstimate, breakdown } = calculateBaseEstimate(data);
    
    // AI image analysis (if image provided)
    let imageAnalysis = null;
    
    if (data.image && process.env.ANTHROPIC_API_KEY) {
      const analysis = await analyzeImage(data.image, data);
      
      if (analysis) {
        imageAnalysis = analysis.summary;
        const aiAdjustment = analysis.priceAdjustment || 0;
        
        if (aiAdjustment !== 0) {
          const adjustmentFactor = 1 + (aiAdjustment / 100);
          lowEstimate = Math.round(lowEstimate * adjustmentFactor);
          highEstimate = Math.round(highEstimate * adjustmentFactor);
        }
        
        if (analysis.sqFtDifference) {
          imageAnalysis += ` ${analysis.sqFtDifference}`;
        }
      }
    }
    
    // Round to nearest $500 for cleaner presentation
    lowEstimate = Math.round(lowEstimate / 500) * 500;
    highEstimate = Math.round(highEstimate / 500) * 500;
    
    // Calculate discount deadline (7 days from now)
    const discountDeadline = new Date();
    discountDeadline.setDate(discountDeadline.getDate() + 7);
    
    // ========================================================================
    // CRM INTEGRATION - Save to Airtable + Send Email
    // ========================================================================
    
    let contactId = null;
    let estimateId = null;
    let pipelineId = null;
    let emailSent = false;
    
    // Run CRM operations in parallel (non-blocking)
    try {
      // Create contact first (needed for linking)
      contactId = await createContact(data);
      
      // Create estimate and pipeline records in parallel
      const [estResult, pipeResult] = await Promise.all([
        createEstimate(data, contactId, lowEstimate, highEstimate, imageAnalysis),
        createPipelineRecord(contactId)
      ]);
      
      estimateId = estResult;
      pipelineId = pipeResult;
      
      // Send email notification (non-blocking)
      emailSent = await sendLeadNotification(data, lowEstimate, highEstimate, imageAnalysis, contactId);
      
      console.log('CRM Integration:', {
        contactId,
        estimateId,
        pipelineId,
        emailSent,
        timestamp: new Date().toISOString()
      });
    } catch (crmError) {
      // Log CRM errors but don't fail the request
      console.error('CRM integration error:', crmError);
    }
    
    // Log lead (original logging preserved)
    console.log('New lead:', {
      name: data.name,
      email: data.email,
      phone: data.phone,
      projectType: data.projectType,
      estimate: `$${lowEstimate.toLocaleString()} - $${highEstimate.toLocaleString()}`,
      hasImage: !!data.image,
      airtableContactId: contactId,
      emailSent,
      timestamp: new Date().toISOString()
    });
    
    // Return estimate to customer
    return res.status(200).json({
      lowEstimate,
      highEstimate,
      imageAnalysis,
      discountDeadline: discountDeadline.toISOString(),
      discountAmount: 1500
    });
    
  } catch (error) {
    console.error('Estimate error:', error);
    return res.status(500).json({ error: 'Failed to calculate estimate' });
  }
}
