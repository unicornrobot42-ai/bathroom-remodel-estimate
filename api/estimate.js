import Anthropic from '@anthropic-ai/sdk';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// Pricing configuration
const PRICING = {
  // Base prices by project type and quality
  base: {
    'tub-to-shower': { low: 12000, mid: 15000, high: 18000 },
    'full-bathroom': { low: 15000, mid: 25000, high: 30000 },
    'cosmetic': { low: 4000, mid: 6000, high: 8000 }
  },
  
  // Condition adjustments
  condition: {
    'pull-refresh': 0,
    'full-redesign': 4000,
    'cosmetic': -2500
  },
  
  // Flooring cost per sq ft
  flooring: {
    'tile': 35,
    'vinyl': 12,
    'keep-as-is': 0,
    'other': 20
  },
  
  // Fixture quality additions
  fixtures: {
    'low': 0,
    'mid': 700,
    'high': 2000
  },
  
  // Glass enclosure costs
  glass: {
    'frameless': 2200,
    'curtain': 0
  },
  
  // Plumbing work costs
  plumbing: {
    'keep': 0,
    'minor': 1000,
    'major': 3500
  }
};

// Calculate base estimate from form data
function calculateBaseEstimate(data) {
  const { projectType, condition, flooring, fixtureQuality, plumbing, glass, squareFootage } = data;
  
  // Get base price for project type and quality
  const baseRange = PRICING.base[projectType] || PRICING.base['tub-to-shower'];
  let basePrice = baseRange[fixtureQuality] || baseRange.mid;
  
  // Size scaling factor
  let sizeFactor = 1;
  if (squareFootage <= 60) {
    sizeFactor = 0.9;
  } else if (squareFootage >= 150) {
    sizeFactor = 1.25;
  } else if (squareFootage >= 120) {
    sizeFactor = 1.15;
  } else if (squareFootage >= 100) {
    sizeFactor = 1.08;
  }
  
  basePrice = Math.round(basePrice * sizeFactor);
  
  // Calculate individual costs
  const conditionCost = PRICING.condition[condition] || 0;
  const flooringCost = Math.round((PRICING.flooring[flooring] || 0) * squareFootage);
  const fixtureCost = PRICING.fixtures[fixtureQuality] || 0;
  const glassCost = PRICING.glass[glass] || 0;
  const plumbingCost = PRICING.plumbing[plumbing] || 0;
  
  const breakdown = {
    basePrice: basePrice + conditionCost,
    flooring: flooringCost,
    fixtures: fixtureCost,
    glass: glassCost,
    plumbing: plumbingCost
  };
  
  const total = breakdown.basePrice + breakdown.flooring + breakdown.fixtures + breakdown.glass + breakdown.plumbing;
  
  return { total, breakdown };
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
    let { total, breakdown } = calculateBaseEstimate(data);
    
    // AI image analysis (if image provided)
    let imageAnalysis = null;
    let aiAdjustment = 0;
    
    if (data.image && process.env.ANTHROPIC_API_KEY) {
      const analysis = await analyzeImage(data.image, data);
      
      if (analysis) {
        imageAnalysis = analysis.summary;
        aiAdjustment = analysis.priceAdjustment || 0;
        
        // Apply AI price adjustment
        if (aiAdjustment !== 0) {
          const adjustmentFactor = 1 + (aiAdjustment / 100);
          total = Math.round(total * adjustmentFactor);
          breakdown.basePrice = Math.round(breakdown.basePrice * adjustmentFactor);
        }
        
        // If AI estimates different square footage, note it in the analysis
        if (analysis.sqFtDifference) {
          imageAnalysis += ` ${analysis.sqFtDifference}`;
        }
      }
    }
    
    // Calculate final range
    const lowEstimate = Math.round(total / 500) * 500;
    const highEstimate = Math.round(total * 1.2 / 500) * 500;
    
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
    
    // Return estimate
    return res.status(200).json({
      lowEstimate,
      highEstimate,
      breakdown,
      imageAnalysis,
      discountDeadline: discountDeadline.toISOString(),
      discountAmount: 1500
    });
    
  } catch (error) {
    console.error('Estimate error:', error);
    return res.status(500).json({ error: 'Failed to calculate estimate' });
  }
}
