# Timberline Estimate API

AI-powered bathroom remodel estimate API for Timberline Build Co. Uses Claude Vision to analyze bathroom photos and provide accurate estimates.

## Features

- **Form-based pricing calculation** - Calculates estimates based on project type, scope, flooring, fixtures, plumbing, and glass options
- **AI image analysis** - Uses Claude Vision to analyze bathroom photos for more accurate estimates
- **Dynamic pricing** - Adjusts estimates based on square footage and complexity
- **Lead capture** - Logs lead information (integrate with CRM as needed)

## Deployment to Vercel

### Quick Deploy

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Navigate to the backend directory**:
   ```bash
   cd estimate-backend
   ```

3. **Deploy**:
   ```bash
   vercel --prod
   ```

4. **Set environment variable**:
   ```bash
   vercel env add ANTHROPIC_API_KEY production
   ```
   Enter your Anthropic API key when prompted.

5. **Redeploy** to apply the environment variable:
   ```bash
   vercel --prod
   ```

### Manual Setup

1. Go to [vercel.com](https://vercel.com) and create a new project
2. Import this directory (estimate-backend)
3. In Project Settings > Environment Variables, add:
   - `ANTHROPIC_API_KEY` = Your Anthropic API key
4. Deploy

## API Endpoint

### POST /api/estimate

Calculate a bathroom remodel estimate.

**Request Body:**
```json
{
  "projectType": "tub-to-shower" | "full-bathroom" | "cosmetic",
  "condition": "pull-refresh" | "full-redesign" | "cosmetic",
  "flooring": "tile" | "vinyl" | "keep-as-is" | "other",
  "fixtureQuality": "low" | "mid" | "high",
  "plumbing": "keep" | "minor" | "major",
  "glass": "frameless" | "curtain",
  "squareFootage": 40-200,
  "image": "base64 encoded image (optional)",
  "email": "customer@email.com",
  "phone": "(949) 555-1234",
  "name": "Customer Name (optional)"
}
```

**Response:**
```json
{
  "lowEstimate": 18500,
  "highEstimate": 26000,
  "breakdown": {
    "basePrice": 15000,
    "flooring": 2800,
    "fixtures": 700,
    "glass": 2200,
    "plumbing": 0
  },
  "imageAnalysis": "This appears to be a ~85 sq ft bathroom with standard fixtures...",
  "discountDeadline": "2026-03-19T00:00:00.000Z",
  "discountAmount": 1500
}
```

## Pricing Logic

### Base Prices (by project type + quality level)

| Project Type | Low | Mid | High |
|-------------|-----|-----|------|
| Tub-to-Shower | $12,000 | $15,000 | $18,000 |
| Full Bathroom | $15,000 | $25,000 | $30,000 |
| Cosmetic | $4,000 | $6,000 | $8,000 |

### Adjustments

- **Size scaling**: 40-60 sq ft = -10%, 100+ sq ft = +8%, 120+ sq ft = +15%, 150+ sq ft = +25%
- **Condition**: Full redesign = +$4,000, Cosmetic = -$2,500
- **Flooring**: Tile = $35/sq ft, Vinyl = $12/sq ft
- **Fixtures**: Mid = +$700, High = +$2,000
- **Glass**: Frameless = +$2,200
- **Plumbing**: Minor = +$1,000, Major = +$3,500

### AI Image Analysis Adjustments

When a photo is uploaded, Claude Vision analyzes:
- Actual square footage (compared to customer estimate)
- Project complexity
- Condition of existing fixtures
- Potential challenges

AI can adjust the base estimate by -10% to +15% based on what it observes.

## Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Run locally
npm run dev
```

## Update Frontend

After deployment, update the `API_URL` in the landing page:

```javascript
// In index-production.html
var API_URL = 'https://YOUR-VERCEL-URL.vercel.app/api/estimate';
```

## Security Notes

- The API accepts requests from any origin (CORS *). For production, consider restricting to your domain.
- Lead data is logged to console. Integrate with a CRM (HubSpot, Salesforce, etc.) for production use.
- Consider adding rate limiting for production use.

## License

Proprietary - Timberline Build Co
