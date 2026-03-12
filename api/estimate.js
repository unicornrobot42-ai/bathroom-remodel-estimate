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
    'tub-to-shower': 5414,           // Labor + demo + plumbing + hot mop + finish
    'full-bathroom': 8000,           // Labor + demo + materials (MID tier baseline)
    'cosmetic': 8000                 // Minor demo + paint + vanity refresh (MID tier baseline)
  },
  
  // Tier ranges (for displaying to customer)
  ranges: {
    'tub-to-shower': { low: [8614, 9514], mid: [9514, 10614], high: [10614, 12000] },
    'full-bathroom': { low: [15000, 20000], mid: [20000, 30000], high: [30000, 50000] },
    'cosmetic': { low: [4000, 6000], mid: [6000, 10000], high: [10000, 15000] }
  },
  
  // Condition adjustments (for full-bathroom/cosmetic)
  condition: {
    'pull-refresh': 1000,
    'full-redesign': 3000,
    'cosmetic': -1000
  },
  
  // Tile cost per job - by fixture quality tier
  tile: {
    'low': 700,
    'mid': 1200,
    'high': 2000
  },
  
  // Flooring cost per sq ft (bathroom flooring beyond shower area)
  flooring: {
    'tile': 35,
    'vinyl': 12,
    'keep-as-is': 0,
    'other': 20
  },
  
  // Fixture quality additions
  fixtures: {
    'low': 500,
    'mid': 1000,
    'high': 2000
  },
  
  // Glass enclosure costs (frameless only, or $0 for curtain)
  glass: {
    'frameless': 2500,
    'curtain': 0
  },
  
  // Plumbing work costs
  plumbing: {
    'keep': 0,
    'minor': 500,
    'major': 3500
  }
};

// Calculate base estimate from form data
function calculateBaseEstimate(data) {
  const { projectType, condition, flooring, fixtureQuality, plumbing, glass, squareFootage } = data;
  
  // Start with base labor cost for project type
  let basePrice = PRICING.base[projectType] || PRICING.base['tub-to-shower'];
  
  // Size scaling factor (for base labor)
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
  
  // Calculate individual costs (additive)
  const conditionCost = PRICING.condition[condition] || 0;
  
  // Tile cost (by fixture quality tier, not per-sqft)
  const tileCost = PRICING.tile[fixtureQuality] || PRICING.tile.mid;
  
  // Flooring cost (bathroom flooring beyond shower area, per sqft)
  const flooringCost = Math.round((PRICING.flooring[flooring] || 0) * squareFootage);
  
  // Fixture cost (for this fixture quality tier)
  const fixtureCost = PRICING.fixtures[fixtureQuality] || PRICING.fixtures.mid;
  
  // Glass cost (frameless or curtain)
  const glassCost = PRICING.glass[glass] || 0;
  
  // Plumbing cost
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
  
  // Return with range: -5% for low, +15% for high
  const lowEstimate = Math.round(total * 0.95);
  const highEstimate = Math.round(total * 1.15);
  
  return { lowEstimate, highEstimate, breakdown };
}

// Analyze bathroom image with Claude Vision
async function analyzeImage(imageBase64, formData) {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });
  
  // Extract base64 data (remove data URL prefix if present)
  let imageData = imageBase64;
  let mediaType = 'image/jpeg';
  
  if (imageBase64.startsWith('data:')) {
    const matches = imageBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      mediaType = matches[1];
      imageData = matches[2];
    }
  }
  
  // Convert HEIC to JPEG if needed (Claude Vision prefers JPG/PNG)
  if (mediaType === 'image/heic' || mediaType === 'image/heic-p') {
    try {
      const buffer = Buffer.from(imageData, 'base64');
      const converted = await sharp(buffer).jpeg().toBuffer();
      imageData = converted.toString('base64');
      mediaType = 'image/jpeg';
    } catch (error) {
      console.error('HEIC conversion error:', error);
      // Continue with original image if conversion fails
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
    
    // Parse the response
    const text = response.content[0].text;
    
    // Extract JSON from response
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

// Main handler
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
        
        // Apply AI price adjustment to both estimates
        if (aiAdjustment !== 0) {
          const adjustmentFactor = 1 + (aiAdjustment / 100);
          lowEstimate = Math.round(lowEstimate * adjustmentFactor);
          highEstimate = Math.round(highEstimate * adjustmentFactor);
        }
        
        // If AI estimates different square footage, note it in the analysis
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
    
    // Log lead (in production, you'd send this to a CRM)
    console.log('New lead:', {
      name: data.name,
      email: data.email,
      phone: data.phone,
      projectType: data.projectType,
      estimate: `$${lowEstimate.toLocaleString()} - $${highEstimate.toLocaleString()}`,
      hasImage: !!data.image,
      timestamp: new Date().toISOString()
    });
    
    // Return estimate (breakdown NOT sent to customer, only internal logging)
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
