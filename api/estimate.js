import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { put } from '@vercel/blob';
import heicConvert from 'heic-convert';

// Detect HEIC by magic bytes (first bytes of file)
function isHeicBuffer(buffer) {
  // HEIC files start with ftyp box containing 'heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'
  if (buffer.length < 12) return false;
  const ftypBox = buffer.slice(4, 8).toString('ascii');
  if (ftypBox !== 'ftyp') return false;
  const brand = buffer.slice(8, 12).toString('ascii');
  return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand);
}

// Convert HEIC to JPEG using pure JavaScript decoder
async function convertHeicToJpeg(buffer) {
  try {
    console.log('Converting HEIC to JPEG...');
    const jpegBuffer = await heicConvert({
      buffer: buffer,
      format: 'JPEG',
      quality: 0.9
    });
    console.log(`HEIC converted: ${(buffer.length/1024).toFixed(0)}KB → ${(jpegBuffer.length/1024).toFixed(0)}KB`);
    return Buffer.from(jpegBuffer);
  } catch (error) {
    console.error('HEIC conversion error:', error);
    throw error;
  }
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Pricing configuration - OC Market Client Rates (2025-2026)
// These are CUSTOMER-FACING prices based on Orange County market rates.
// Timberline is priced at or slightly below comparable OC GCs to win on value.
const PRICING = {

  // ─── TUB-TO-SHOWER CONVERSION ───────────────────────────────────────────────
  // OC market range: $12k–$25k. Timberline pricing ~12% below market.
  // Scope: demo existing tub, hot mop, tile labor, tile material, new fixtures,
  // shower glass, plumbing reconnect, patch drywall, paint.
  tubToShower: {
    low:  10500,   // Basic tile, curtain rod, budget fixtures
    mid:  15000,   // Mid-range tile, frameless glass, decent fixtures
    high: 21000    // Designer tile, premium frameless glass, high-end fixtures
  },

  // ─── FULL BATHROOM REMODEL ──────────────────────────────────────────────────
  // OC market: $150–$360/sqft. Timberline ~12% below market — strong value position.
  // Scope: full gut, new tile/flooring, vanity, toilet, fixtures, shower/tub,
  // drywall, paint, electrical, plumbing.
  fullBath: {
    perSqFt: {
      low:  170,   // Standard finishes, straight-forward layout
      mid:  230,   // Mid-range tile, custom vanity, frameless glass
      high: 315    // Designer tile, premium fixtures, luxury finishes
    },
    // Minimums prevent absurdly low estimates on very small baths
    minimums: {
      low:  19000,
      mid:  26000,
      high: 36000
    }
  },

  // ─── COSMETIC REFRESH ───────────────────────────────────────────────────────
  // OC market: $8.5k–$20k. Timberline ~12% below.
  // Scope: paint, new fixtures/hardware, vanity swap, flooring (no tile demo),
  // lighting. No major demo or tile work.
  cosmetic: {
    low:  7500,   // Paint, basic fixture swap
    mid:  12000,  // New vanity, flooring, fixture upgrade
    high: 17500   // Full cosmetic: vanity, flooring, lighting, all fixtures
  },

  // ─── ADD-ONS (on top of base) ───────────────────────────────────────────────

  // Layout change / full redesign adds complexity
  condition: {
    'pull-refresh':  0,       // Standard replacement in same footprint
    'full-redesign': 5500,    // Moving walls, relocating plumbing, layout change
    'cosmetic':      0
  },

  // Flooring (only applied when NOT already a full-bath — avoids double-counting)
  flooring: {
    'tile':       42,   // $/sqft installed (porcelain/ceramic, standard OC rate)
    'vinyl':      15,   // $/sqft LVP installed
    'keep-as-is':  0,
    'other':      25
  },

  // Shower glass enclosure
  glass: {
    'frameless': 3500,   // Semi-frameless included in mid/high tub-to-shower base; this covers upgrades
    'curtain':      0
  },

  // Plumbing work beyond standard reconnect
  plumbing: {
    'keep':   0,
    'minor':  900,    // Valve replacement, minor re-route
    'major':  5500    // Full repipe, significant re-route, moving drain
  }
};

// ============================================================================
// IMAGE UPLOAD (Vercel Blob)
// ============================================================================

async function uploadImageToBlob(base64Image, filename) {
  // Check for BLOB_READ_WRITE_TOKEN first - this is the most common issue
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN not set - cannot upload images to Vercel Blob. Add this environment variable in Vercel Dashboard or create a Blob store.');
    return { url: null, error: 'BLOB_TOKEN_MISSING' };
  }
  
  try {
    // Extract the base64 data (remove data:image/jpeg;base64, prefix)
    const matches = base64Image.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      console.warn('Invalid base64 image format');
      return { url: null, error: 'INVALID_BASE64_FORMAT' };
    }
    
    const imageType = matches[1];
    const base64Data = matches[2];
    let buffer = Buffer.from(base64Data, 'base64');
    
    // Check if this is a HEIC file and convert it
    if (isHeicBuffer(buffer) || imageType === 'heic' || imageType === 'heif') {
      console.log('HEIC detected, converting to JPEG...');
      buffer = await convertHeicToJpeg(buffer);
    }
    
    // Compress image with Sharp (now always JPEG-compatible)
    const compressedBuffer = await sharp(buffer)
      .resize(1920, null, { 
        withoutEnlargement: true,
        fit: 'inside'
      })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    const originalSize = (buffer.length / 1024).toFixed(0);
    const compressedSize = (compressedBuffer.length / 1024).toFixed(0);
    console.log(`Image compressed: ${originalSize}KB → ${compressedSize}KB`);
    
    // Generate unique filename
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename || 'bathroom-photo'}.jpg`;
    
    // Upload to Vercel Blob
    const blob = await put(uniqueFilename, compressedBuffer, {
      access: 'public',
      contentType: 'image/jpeg'
    });
    
    console.log('Image uploaded to Vercel Blob:', blob.url);
    return { url: blob.url, error: null };
  } catch (error) {
    console.error('Blob upload error:', error.message || error);
    return { url: null, error: error.message || 'UPLOAD_FAILED' };
  }
}

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
    'Notes': `Source: Website estimate form`
  };
  // Note: Date Created is auto-generated by Airtable
  
  const result = await airtableRequest('Contacts', 'POST', { fields });
  return result?.id || null;
}

async function createEstimate(data, contactId, lowEstimate, highEstimate, imageAnalysis, imageUrl) {
  // Map form values to Airtable dropdown options
  const fixtureQualityMap = {
    'low': 'Basic',
    'mid': 'Mid',
    'high': 'Premium'
  };
  
  const fields = {
    'Contact': contactId ? [contactId] : [],
    'Project Type': data.projectType,
    'Fixture Quality': fixtureQualityMap[data.fixtureQuality] || data.fixtureQuality,
    'Price Low': lowEstimate,
    'Price High': highEstimate,
    'Square Footage': parseInt(data.squareFootage) || 0,
    'Analysis Notes': imageAnalysis || ''
  };
  // Note: Date Created is auto-generated by Airtable
  
  // Add photo URL if image was uploaded to Vercel Blob
  if (imageUrl) {
    fields['Photo URL'] = imageUrl;
  }
  
  const result = await airtableRequest('Estimates', 'POST', { fields });
  return result?.id || null;
}

async function createPipelineRecord(contactId) {
  const fields = {
    'Contact': contactId ? [contactId] : [],
    'Current Status': 'New Lead',
    'Internal Notes': 'Auto-created from website estimate',
    'Next Action': 'Review estimate and follow up'
  };
  // Note: Last Updated is auto-generated by Airtable
  
  const result = await airtableRequest('Pipeline', 'POST', { fields });
  return result?.id || null;
}

// ============================================================================
// EMAIL NOTIFICATION (Resend)
// ============================================================================

async function sendLeadNotification(data, lowEstimate, highEstimate, imageAnalysis, contactId) {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  
  if (!SENDGRID_API_KEY) {
    console.warn('SENDGRID_API_KEY not set - skipping email notification');
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
// CUSTOMER CONFIRMATION EMAIL
// ============================================================================

async function sendCustomerConfirmation(data, lowEstimate, highEstimate) {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  if (!SENDGRID_API_KEY || !data.email) return false;

  const firstName = data.name ? data.name.split(' ')[0] : 'there';
  const midpoint = Math.round((lowEstimate + highEstimate) / 2);

  const projectLabels = {
    'tub-to-shower': 'Tub-to-Shower Conversion',
    'full-bathroom': 'Full Bathroom Remodel',
    'cosmetic': 'Cosmetic Refresh'
  };
  const conditionLabels = {
    'pull-refresh': 'Same layout, updated finishes',
    'full-redesign': 'Layout change / full redesign',
    'cosmetic': 'Cosmetic updates only'
  };
  const flooringLabels = {
    'tile': 'Tile',
    'vinyl': 'Luxury Vinyl (LVP)',
    'keep-as-is': 'Keep existing flooring',
    'other': 'Other'
  };
  const fixtureLabels = {
    'low': 'Budget / Builder-grade',
    'mid': 'Mid-range',
    'high': 'Premium / Designer'
  };
  const plumbingLabels = {
    'keep': 'Keep existing layout',
    'minor': 'Minor adjustments',
    'major': 'Significant relocation'
  };
  const glassLabels = {
    'frameless': 'Frameless glass enclosure',
    'curtain': 'Shower curtain / rod'
  };

  const projectLabel   = projectLabels[data.projectType]   || 'Bathroom Remodel';
  const conditionLabel = conditionLabels[data.condition]   || data.condition;
  const flooringLabel  = flooringLabels[data.flooring]     || data.flooring;
  const fixtureLabel   = fixtureLabels[data.fixtureQuality] || data.fixtureQuality;
  const plumbingLabel  = plumbingLabels[data.plumbing]     || data.plumbing;
  const glassLabel     = glassLabels[data.glass]           || data.glass;

  // Equity math — use mid-range multiplier (1.38x)
  const valueAdd = Math.round(midpoint * 1.38);
  const netGain  = valueAdd - midpoint;

  const discountDeadline = new Date();
  discountDeadline.setDate(discountDeadline.getDate() + 7);
  const deadlineStr = discountDeadline.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0ede8; color: #1a1a1a; }
    .wrapper { max-width: 620px; margin: 0 auto; background: #ffffff; }

    /* Header */
    .header { background: #19412c; padding: 28px 40px; }
    .header-inner { display: flex; justify-content: space-between; align-items: center; }
    .brand { color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: -0.3px; }
    .brand span { color: #e9af3b; }
    .header-meta { color: rgba(255,255,255,0.5); font-size: 12px; text-align: right; }

    /* Hero price */
    .price-hero { background: linear-gradient(135deg, #19412c 0%, #1f5237 100%); padding: 40px; text-align: center; border-bottom: 3px solid #e9af3b; }
    .price-label { color: rgba(255,255,255,0.55); font-size: 11px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 10px; }
    .price-range { color: #ffffff; font-size: 42px; font-weight: 800; letter-spacing: -1px; line-height: 1; margin-bottom: 8px; }
    .price-sub { color: rgba(255,255,255,0.45); font-size: 13px; }
    .price-project { color: #e9af3b; font-size: 15px; font-weight: 600; margin-top: 10px; }

    /* Body */
    .body { padding: 36px 40px; }
    p { font-size: 15px; color: #444; line-height: 1.75; margin: 0 0 20px; }

    /* Scope summary */
    .scope-card { border: 1px solid #e8e8e8; border-radius: 10px; overflow: hidden; margin-bottom: 28px; }
    .scope-header { background: #f8f6f2; padding: 12px 18px; font-size: 11px; font-weight: 700; color: #19412c; text-transform: uppercase; letter-spacing: 0.1em; border-bottom: 1px solid #e8e8e8; }
    .scope-row { display: flex; justify-content: space-between; padding: 11px 18px; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
    .scope-row:last-child { border-bottom: none; }
    .scope-key { color: #888; }
    .scope-val { color: #1a1a1a; font-weight: 600; text-align: right; max-width: 60%; }

    /* Equity card */
    .equity-card { background: #19412c; border-radius: 10px; padding: 24px; margin-bottom: 28px; }
    .equity-title { color: #e9af3b; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 16px; }
    .equity-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; font-size: 14px; }
    .equity-row-label { color: rgba(255,255,255,0.65); }
    .equity-row-val { color: #ffffff; font-weight: 700; }
    .equity-divider { border: none; border-top: 1px solid rgba(255,255,255,0.12); margin: 10px 0; }
    .equity-net { display: flex; justify-content: space-between; align-items: center; padding-top: 6px; }
    .equity-net-label { color: #ffffff; font-size: 15px; font-weight: 700; }
    .equity-net-val { color: #e9af3b; font-size: 22px; font-weight: 800; }
    .equity-footnote { color: rgba(255,255,255,0.35); font-size: 11px; margin-top: 14px; line-height: 1.5; }

    /* Discount */
    .discount-box { background: #fffbf0; border: 1px solid #e9af3b; border-radius: 10px; padding: 22px 28px; margin-bottom: 28px; text-align: center; }
    .discount-amount { font-size: 28px; font-weight: 800; color: #19412c; }
    .discount-desc { font-size: 14px; color: #555; margin-top: 4px; }
    .discount-expires { font-size: 12px; color: #999; margin-top: 6px; }

    /* CTA */
    .cta-block { text-align: center; margin-bottom: 28px; }
    .cta-btn { display: inline-block; background: #19412c; color: #ffffff !important; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 700; letter-spacing: -0.2px; }
    .cta-or { font-size: 13px; color: #aaa; margin-top: 12px; }

    /* Sig */
    .sig { border-top: 1px solid #eee; padding-top: 20px; font-size: 14px; color: #555; line-height: 1.7; }
    .sig strong { color: #19412c; }

    /* Footer */
    .footer { background: #f0ede8; padding: 20px 40px; text-align: center; font-size: 11px; color: #aaa; line-height: 1.7; }
  </style>
</head>
<body>
  <div class="wrapper">

    <!-- Header -->
    <div class="header">
      <div class="header-inner">
        <img src="https://estimate.timberlinebuild.co/timberline-logo.png" alt="Timberline Build Co" style="height:48px; width:auto; filter:brightness(0) invert(1);">
        <div class="header-meta">Licensed GC · Orange County, CA<br>${dateStr}</div>
      </div>
    </div>

    <!-- Price Hero -->
    <div class="price-hero">
      <div class="price-label">Your Estimated Investment</div>
      <div class="price-range">$${lowEstimate.toLocaleString()} – $${highEstimate.toLocaleString()}</div>
      <div class="price-sub">Preliminary estimate · confirmed after free site visit</div>
      <div class="price-project">${projectLabel}</div>
    </div>

    <!-- Body -->
    <div class="body">
      <p>Hey ${firstName} — here's your complete estimate. Save this email. It has everything you need to refer back to, share with a spouse, or compare against other bids.</p>

      <!-- Scope Summary -->
      <div class="scope-card">
        <div class="scope-header">Your Project Selections</div>
        <div class="scope-row">
          <span class="scope-key">Project Type</span>
          <span class="scope-val">${projectLabel}</span>
        </div>
        <div class="scope-row">
          <span class="scope-key">Scope</span>
          <span class="scope-val">${conditionLabel}</span>
        </div>
        <div class="scope-row">
          <span class="scope-key">Approx. Size</span>
          <span class="scope-val">${data.squareFootage} sq ft</span>
        </div>
        <div class="scope-row">
          <span class="scope-key">Flooring</span>
          <span class="scope-val">${flooringLabel}</span>
        </div>
        <div class="scope-row">
          <span class="scope-key">Fixture Quality</span>
          <span class="scope-val">${fixtureLabel}</span>
        </div>
        <div class="scope-row">
          <span class="scope-key">Plumbing</span>
          <span class="scope-val">${plumbingLabel}</span>
        </div>
        <div class="scope-row">
          <span class="scope-key">Shower Enclosure</span>
          <span class="scope-val">${glassLabel}</span>
        </div>
        ${data.zip ? `<div class="scope-row"><span class="scope-key">ZIP Code</span><span class="scope-val">${data.zip}</span></div>` : ''}
      </div>

      <!-- Equity Impact -->
      <div class="equity-card">
        <div class="equity-title">📈 Your Equity Impact — OC Market</div>
        <div class="equity-row">
          <span class="equity-row-label">Your Investment</span>
          <span class="equity-row-val">~$${midpoint.toLocaleString()}</span>
        </div>
        <div class="equity-row">
          <span class="equity-row-label">Est. Home Value Increase</span>
          <span class="equity-row-val">+$${valueAdd.toLocaleString()}</span>
        </div>
        <hr class="equity-divider">
        <div class="equity-net">
          <span class="equity-net-label">Net Equity Gain</span>
          <span class="equity-net-val">+$${netGain.toLocaleString()}</span>
        </div>
        <p class="equity-footnote">Based on OC resale data. Bathroom remodels in Orange County typically return 130–145% of investment at sale. Actual returns vary by neighborhood, finishes, and market conditions.</p>
      </div>

      <!-- Discount -->
      <div class="discount-box">
        <div class="discount-amount">Save $1,500</div>
        <div class="discount-desc">Schedule your free measure &amp; site visit before ${deadlineStr}</div>
        <div class="discount-expires">No pressure — we come out, confirm the scope, and give you an exact number.</div>
      </div>

      <!-- CTA -->
      <div class="cta-block">
        <a href="tel:+19492291692" class="cta-btn">📞 Call (949) 229-1692</a>
        <div class="cta-or">Or just reply to this email — we'll get something on the calendar.</div>
      </div>

      <!-- Signature -->
      <div class="sig">
        <p>Talk soon,<br>
        <strong>Justin Sherman</strong><br>
        Timberline Build Co<br>
        (949) 229-1692 · justin@timberlinebuild.co<br>
        Licensed &amp; Insured · Orange County, CA</p>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>You're receiving this because you requested an estimate at <strong>estimate.timberlinebuild.co</strong><br>
      Timberline Build Co · Orange County, CA · Licensed &amp; Insured</p>
    </div>

  </div>
</body>
</html>`;

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: data.email, name: data.name || undefined }] }],
        from: { email: 'justin@timberlinebuild.co', name: 'Justin @ Timberline Build Co' },
        reply_to: { email: 'justin@timberlinebuild.co', name: 'Justin Sherman' },
        subject: `Your ${projectLabel} Estimate — $${lowEstimate.toLocaleString()}–$${highEstimate.toLocaleString()} · Timberline Build Co`,
        content: [{ type: 'text/html', value: html }]
      })
    });

    if (response.ok) {
      console.log('Customer confirmation email sent to:', data.email);
      return true;
    } else {
      const err = await response.text();
      console.error('Customer email error:', err);
      return false;
    }
  } catch (error) {
    console.error('Customer email failed:', error);
    return false;
  }
}

// ============================================================================
// SENDGRID CONTACT LIST ENROLLMENT (for drip campaign)
// ============================================================================

async function enrollInSendGridDrip(data, lowEstimate, highEstimate) {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const SENDGRID_LIST_ID = process.env.SENDGRID_DRIP_LIST_ID; // Set this in Vercel env vars
  if (!SENDGRID_API_KEY || !data.email) return false;

  const projectLabels = {
    'tub-to-shower': 'Tub-to-Shower Conversion',
    'full-bathroom': 'Full Bathroom Remodel',
    'cosmetic': 'Cosmetic Refresh'
  };

  try {
    const contactPayload = {
      contacts: [{
        email: data.email,
        first_name: data.name ? data.name.split(' ')[0] : '',
        last_name: data.name ? data.name.split(' ').slice(1).join(' ') : '',
        phone_number: data.phone || '',
        postal_code: data.zip || '',
        custom_fields: {
          // These map to custom fields you create in SendGrid
          // Create them at: Marketing → Contacts → Custom Fields
          e1_T: projectLabels[data.projectType] || data.projectType,  // project_type (text)
          e2_N: Math.round((lowEstimate + highEstimate) / 2),          // estimate_midpoint (number)
        }
      }],
      ...(SENDGRID_LIST_ID ? { list_ids: [SENDGRID_LIST_ID] } : {})
    };

    const response = await fetch('https://api.sendgrid.com/v3/marketing/contacts', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(contactPayload)
    });

    if (response.ok) {
      console.log('Contact enrolled in SendGrid drip list:', data.email);
      return true;
    } else {
      const err = await response.text();
      console.error('SendGrid contact enrollment error:', err);
      return false;
    }
  } catch (error) {
    console.error('SendGrid enrollment failed:', error);
    return false;
  }
}

// ============================================================================
// ESTIMATE CALCULATION
// ============================================================================

function calculateBaseEstimate(data) {
  const { projectType, condition, flooring, fixtureQuality, plumbing, glass, squareFootage } = data;
  const sqft = parseInt(squareFootage) || 80;
  const tier = fixtureQuality || 'mid'; // 'low' | 'mid' | 'high'

  let basePrice = 0;
  const breakdown = { base: 0, flooring: 0, glass: 0, plumbing: 0, conditionUpgrade: 0 };

  // ── Base price by project type ──────────────────────────────────────────────
  if (projectType === 'tub-to-shower') {
    // Flat rate by quality tier; size has minimal impact on this scope
    basePrice = PRICING.tubToShower[tier] || PRICING.tubToShower.mid;

    // Small sqft bump for larger conversion footprints (>= 50 sqft)
    if (sqft >= 50) basePrice = Math.round(basePrice * 1.05);

    breakdown.base = basePrice;

    // Full bath already includes flooring; tub-to-shower adds it separately
    const flooringCost = Math.round((PRICING.flooring[flooring] || 0) * sqft);
    breakdown.flooring = flooringCost;

  } else if (projectType === 'full-bathroom') {
    // Per-sqft pricing — most accurate for full gut/remodel
    const rate = PRICING.fullBath.perSqFt[tier] || PRICING.fullBath.perSqFt.mid;
    const minimum = PRICING.fullBath.minimums[tier] || PRICING.fullBath.minimums.mid;
    basePrice = Math.max(Math.round(rate * sqft), minimum);
    breakdown.base = basePrice;
    // Flooring is included in per-sqft rate for full bath — no double-count

  } else if (projectType === 'cosmetic') {
    basePrice = PRICING.cosmetic[tier] || PRICING.cosmetic.mid;
    breakdown.base = basePrice;

    // Cosmetic jobs: flooring is additive (they may want new LVP but no tile)
    const flooringCost = Math.round((PRICING.flooring[flooring] || 0) * sqft);
    breakdown.flooring = flooringCost;

  } else {
    // Fallback
    basePrice = PRICING.cosmetic.mid;
    breakdown.base = basePrice;
  }

  // ── Add-ons ─────────────────────────────────────────────────────────────────

  // Layout / full redesign upcharge
  const conditionCost = PRICING.condition[condition] || 0;
  breakdown.conditionUpgrade = conditionCost;

  // Shower glass — only meaningful if NOT already in tub-to-shower mid/high base
  // For tub-to-shower, frameless glass is already in mid/high pricing; only add for 'low' tier
  let glassCost = 0;
  if (projectType === 'tub-to-shower' && tier === 'low') {
    glassCost = PRICING.glass[glass] || 0;
  } else if (projectType !== 'tub-to-shower') {
    glassCost = PRICING.glass[glass] || 0;
  }
  breakdown.glass = glassCost;

  // Plumbing work
  const plumbingCost = PRICING.plumbing[plumbing] || 0;
  breakdown.plumbing = plumbingCost;

  // ── Total & range ────────────────────────────────────────────────────────────
  const total = breakdown.base + breakdown.flooring + breakdown.conditionUpgrade + breakdown.glass + breakdown.plumbing;

  // OC market range: +/- 10% captures normal scope variation
  const lowEstimate  = Math.round(total * 0.90);
  const highEstimate = Math.round(total * 1.10);

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
  
  // Convert HEIC to JPEG for Claude Vision
  if (mediaType === 'image/heic' || mediaType === 'image/heif' || mediaType === 'image/heic-p') {
    try {
      console.log('Converting HEIC for Vision analysis...');
      const buffer = Buffer.from(imageData, 'base64');
      const jpegBuffer = await convertHeicToJpeg(buffer);
      imageData = jpegBuffer.toString('base64');
      mediaType = 'image/jpeg';
    } catch (error) {
      console.error('HEIC conversion for Vision failed:', error);
      // Return null to skip Vision analysis but continue with estimate
      return null;
    }
  }
  
  // Also check by magic bytes in case mime type is wrong
  try {
    const testBuffer = Buffer.from(imageData, 'base64');
    if (isHeicBuffer(testBuffer)) {
      console.log('HEIC detected by magic bytes, converting...');
      const jpegBuffer = await convertHeicToJpeg(testBuffer);
      imageData = jpegBuffer.toString('base64');
      mediaType = 'image/jpeg';
    }
  } catch (error) {
    console.warn('HEIC magic byte check failed:', error.message);
  }
  
  const prompt = `You are an expert bathroom remodeling estimator for a licensed General Contractor in Orange County, California (2025–2026 market).

OC MARKET CONTEXT — use these as your reference benchmarks:
- Tub-to-shower conversion: OC market $12k–$25k. Timberline prices ~12% below market.
- Full bathroom remodel: OC market $25k–$60k ($150–$360/sqft). Timberline ~12% below.
- Cosmetic refresh: OC market $8.5k–$20k. Timberline ~12% below.
Timberline Build Co is intentionally priced below the OC market average to be the attractive value choice. Do NOT anchor to national averages (they run 30–40% lower than OC and would make Timberline look expensive).

The customer has provided the following project details:
- Project Type: ${formData.projectType}
- Scope: ${formData.condition}
- Square Footage (customer estimate): ${formData.squareFootage} sq ft
- Flooring Choice: ${formData.flooring}
- Fixture Quality: ${formData.fixtureQuality}
- Plumbing Work: ${formData.plumbing}
- Shower Enclosure: ${formData.glass}

Please analyze this bathroom photo and provide:

1. SQUARE FOOTAGE ESTIMATE: Based on visual cues (fixtures, proportions, standard fixture sizes), estimate the actual square footage. OC master baths average 80–120 sqft; standard baths 45–70 sqft. Note if the customer's estimate seems off.

2. COMPLEXITY ASSESSMENT:
   - "straightforward" — standard layout, no obvious hidden surprises
   - "moderate" — unusual tile pattern, niche work, second-floor plumbing stack, older home quirks
   - "complex" — layout change needed, significant plumbing relocation, water damage visible, very small or awkward space requiring custom work

3. KEY OBSERVATIONS relevant to the estimate:
   - Tile condition and coverage area
   - Fixture age (newer = easier; 1980s–90s = more surprises)
   - Visible plumbing concerns (supply lines, drain location)
   - Shower pan / hot mop needs
   - Anything that would push cost up OR down from the baseline

4. PRICE ADJUSTMENT: Suggest a percentage adjustment to the calculated base estimate.
   - Range: -10% to +20%
   - Only go negative if the space is clearly simpler than a typical OC bathroom
   - Go positive if complexity, size discrepancy, or visible conditions warrant it
   - A 0% adjustment means the photo confirms the form inputs are accurate

Respond in this exact JSON format:
{
  "estimatedSqFt": number,
  "sqFtDifference": "string describing difference from customer estimate, e.g. 'Your bathroom looks closer to 65 sqft than the 50 sqft you entered — we adjusted the estimate accordingly.'",
  "complexity": "straightforward" | "moderate" | "complex",
  "observations": ["observation 1", "observation 2", ...],
  "priceAdjustment": number (percentage, e.g., 5 for +5%, -10 for -10%),
  "summary": "A 1–2 sentence summary for the customer: what you see, what that means for the project. Be direct and professional — no fluff."
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
      // Upload image to Vercel Blob first (if provided)
      let imageUrl = null;
      let imageUploadError = null;
      if (data.image) {
        const uploadResult = await uploadImageToBlob(data.image, `bathroom-${Date.now()}`);
        imageUrl = uploadResult.url;
        imageUploadError = uploadResult.error;
        
        if (imageUploadError) {
          console.warn(`Image upload failed: ${imageUploadError}. Continuing without photo URL.`);
        }
      }
      
      // Create contact first (needed for linking)
      contactId = await createContact(data);
      
      // Create estimate and pipeline records in parallel
      const [estResult, pipeResult] = await Promise.all([
        createEstimate(data, contactId, lowEstimate, highEstimate, imageAnalysis, imageUrl),
        createPipelineRecord(contactId)
      ]);
      
      estimateId = estResult;
      pipelineId = pipeResult;
      
      // Send all emails + enroll in drip in parallel
      const [justinEmail, customerEmail, dripEnrolled] = await Promise.all([
        sendLeadNotification(data, lowEstimate, highEstimate, imageAnalysis, contactId),
        sendCustomerConfirmation(data, lowEstimate, highEstimate),
        enrollInSendGridDrip(data, lowEstimate, highEstimate)
      ]);
      emailSent = justinEmail;

      console.log('CRM Integration:', {
        contactId,
        estimateId,
        pipelineId,
        justinEmailSent: justinEmail,
        customerEmailSent: customerEmail,
        dripEnrolled,
        imageUrl: imageUrl || 'NOT_UPLOADED',
        imageUploadError: imageUploadError || null,
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
      discountAmount: 1500,
      breakdown: {
        basePrice: breakdown.base || 0,
        flooring: breakdown.flooring || 0,
        fixtures: breakdown.fixtures || 0,
        glass: breakdown.glass || 0,
        plumbing: breakdown.plumbing || 0
      }
    });
    
  } catch (error) {
    console.error('Estimate error:', error);
    return res.status(500).json({ error: 'Failed to calculate estimate' });
  }
}
