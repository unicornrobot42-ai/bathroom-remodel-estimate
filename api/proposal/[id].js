// Dynamic Proposal Generator
// URL: /api/proposal/[id] where id = Airtable record ID or Estimate ID

const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appDl3z8M1ZhVzv4k';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function airtableRequest(table, recordId = null) {
  const url = recordId 
    ? `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}/${recordId}`
    : `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Airtable error: ${response.status} - ${error}`);
  }
  
  return response.json();
}

async function getEstimateWithContact(estimateId) {
  // Fetch estimate record
  const estimate = await airtableRequest('Estimates', estimateId);
  
  // Get contact ID from linked field
  const contactIds = estimate.fields['Contact'];
  let contact = null;
  
  if (contactIds && contactIds.length > 0) {
    contact = await airtableRequest('Contacts', contactIds[0]);
  }
  
  return { estimate, contact };
}

function generateProposalHTML(estimate, contact) {
  const fields = estimate.fields;
  const contactFields = contact?.fields || {};
  
  // Extract data with defaults
  const clientName = contactFields['Name'] || 'Valued Client';
  const clientEmail = contactFields['Email'] || '';
  const clientPhone = contactFields['Phone'] || '';
  const projectType = fields['Project Type'] || 'Bathroom Remodel';
  const priceLow = fields['Price Low'] || 0;
  const priceHigh = fields['Price High'] || 0;
  const squareFootage = fields['Square Footage'] || 0;
  const fixtureQuality = fields['Fixture Quality'] || 'Mid';
  const photoUrl = fields['Photo URL'] || '';
  const analysisNotes = fields['Analysis Notes'] || '';
  const dateCreated = fields['Date Created'] ? new Date(fields['Date Created']).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  
  // Format price range
  const priceRange = `$${priceLow.toLocaleString()} - $${priceHigh.toLocaleString()}`;
  const avgPrice = Math.round((priceLow + priceHigh) / 2);
  
  // Estimate timeline based on project type
  const timeline = projectType === 'full-bathroom' ? '3-4 Weeks' : 
                   projectType === 'tub-to-shower' ? '1-2 Weeks' : '1 Week';
  
  // Format project type for display
  const projectTypeDisplay = projectType === 'full-bathroom' ? 'Full Bathroom Remodel' :
                             projectType === 'tub-to-shower' ? 'Tub-to-Shower Conversion' :
                             projectType === 'cosmetic' ? 'Cosmetic Refresh' : 'Bathroom Remodel';
  
  // Generate scope based on project type and quality
  const scopeItems = generateScopeItems(projectType, fixtureQuality);
  const materials = generateMaterials(projectType, fixtureQuality);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${clientName} | ${projectTypeDisplay} Proposal | Timberline Build Co.</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --green: #19412c;
            --brown: #614432;
            --dark-brown: #312509;
            --navy: #213245;
            --gold: #e9af3b;
            --light-gold: #fdf5e0;
            --off-white: #f9f9f9;
            --text: #2a2a2a;
            --text-light: #666;
            --border: #e8e8e8;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        html {
            scroll-behavior: smooth;
        }

        body {
            font-family: 'Montserrat', sans-serif;
            color: var(--text);
            background: #fff;
            line-height: 1.7;
            overflow-x: hidden;
        }

        h1, h2, h3, h4, h5, h6 {
            font-weight: 700;
            line-height: 1.2;
            letter-spacing: -0.5px;
        }

        h2 { font-size: 2.2rem; }
        h3 { font-size: 1.3rem; }

        p { margin-bottom: 1rem; }

        @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(25px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideInLeft {
            from { opacity: 0; transform: translateX(-25px); }
            to { opacity: 1; transform: translateX(0); }
        }

        @keyframes slideInRight {
            from { opacity: 0; transform: translateX(25px); }
            to { opacity: 1; transform: translateX(0); }
        }

        .animate-fade { animation: fadeInUp 0.7s ease-out both; }
        .animate-left { animation: slideInLeft 0.7s ease-out both; }
        .animate-right { animation: slideInRight 0.7s ease-out both; }
        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.2s; }
        .delay-3 { animation-delay: 0.3s; }
        .delay-4 { animation-delay: 0.4s; }

        .container {
            max-width: 1100px;
            margin: 0 auto;
            padding: 0 2.5rem;
        }

        section {
            padding: 6rem 0;
        }

        section:nth-child(even) {
            background: #fafafa;
        }

        header {
            background: linear-gradient(135deg, var(--green) 0%, #0f2817 100%);
            color: #fff;
            padding: 7rem 0 5rem;
            position: relative;
            overflow: hidden;
        }

        header::before {
            content: '';
            position: absolute;
            top: -50%;
            right: -10%;
            width: 600px;
            height: 600px;
            background: rgba(233, 175, 59, 0.05);
            border-radius: 50%;
            pointer-events: none;
        }

        header::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 6px;
            background: linear-gradient(90deg, var(--gold), var(--brown));
        }

        .header-content {
            position: relative;
            z-index: 2;
        }

        .logo-section {
            margin-bottom: 2.5rem;
        }

        .logo-img {
            height: 70px;
            margin-bottom: 1rem;
            object-fit: contain;
        }

        .project-title {
            font-size: 3.2rem;
            margin-bottom: 0.8rem;
            font-weight: 800;
            letter-spacing: -1px;
        }

        .project-address {
            font-size: 1.15rem;
            font-weight: 400;
            opacity: 0.92;
            margin-bottom: 3rem;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 2rem;
        }

        .stat-card {
            background: rgba(255,255,255,0.08);
            padding: 1.8rem;
            border-radius: 12px;
            border-left: 4px solid var(--gold);
            backdrop-filter: blur(10px);
            transition: all 0.3s ease-out;
        }

        .stat-card:hover {
            background: rgba(255,255,255,0.12);
            transform: translateY(-4px);
        }

        .stat-val {
            font-size: 1.8rem;
            font-weight: 800;
            display: block;
            margin-bottom: 0.4rem;
        }

        .stat-label {
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 1.2px;
            opacity: 0.85;
            font-weight: 600;
        }

        .zone-header {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-bottom: 3rem;
            flex-wrap: wrap;
            gap: 1.5rem;
        }

        .zone-title {
            font-size: 2.8rem;
            color: var(--green);
        }

        .zone-cost {
            font-size: 1.6rem;
            font-weight: 800;
            color: var(--green);
            background: var(--light-gold);
            padding: 0.7rem 1.4rem;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(233, 175, 59, 0.2);
        }

        .zone-grid {
            display: grid;
            grid-template-columns: 3fr 2fr;
            gap: 4rem;
            align-items: start;
        }

        @media(max-width: 768px) {
            .zone-grid { grid-template-columns: 1fr; gap: 2.5rem; }
            .project-title { font-size: 2.2rem; }
            .zone-title { font-size: 2rem; }
            .stats-grid { grid-template-columns: repeat(2, 1fr); }
        }

        .scope-list {
            list-style: none;
        }

        .scope-list li {
            margin-bottom: 1.2rem;
            padding-left: 2rem;
            position: relative;
            font-size: 0.95rem;
            line-height: 1.8;
        }

        .scope-list li::before {
            content: '→';
            color: var(--gold);
            font-weight: 800;
            position: absolute;
            left: 0;
            font-size: 1.2rem;
        }

        .materials-card {
            background: #fff;
            padding: 2.2rem;
            border-radius: 12px;
            border-top: 5px solid var(--navy);
            box-shadow: 0 6px 20px rgba(0,0,0,0.06);
        }

        .materials-title {
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 1.3px;
            color: var(--navy);
            margin-bottom: 1.8rem;
            font-weight: 800;
        }

        .material-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 1rem;
            border-bottom: 1px solid #f0f0f0;
            padding-bottom: 1rem;
            font-size: 0.9rem;
        }
        
        .material-item:last-child { 
            border: none;
            margin-bottom: 0;
            padding-bottom: 0;
        }
        
        .mat-name { 
            font-weight: 700; 
            color: var(--green);
        }
        
        .mat-detail { 
            color: var(--text-light); 
            text-align: right;
            font-weight: 500;
        }

        .hero-image {
            width: 100%;
            height: 400px;
            border-radius: 12px;
            object-fit: cover;
            margin-bottom: 2.5rem;
            box-shadow: 0 12px 30px rgba(0,0,0,0.1);
        }

        .values-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 2rem;
            margin-top: 2.5rem;
        }

        .value-card {
            background: #fff;
            padding: 2.2rem;
            border-radius: 12px;
            border-left: 5px solid var(--gold);
            box-shadow: 0 6px 20px rgba(0,0,0,0.06);
            transition: all 0.3s ease-out;
        }

        .value-card:hover {
            transform: translateY(-8px);
            box-shadow: 0 12px 30px rgba(0,0,0,0.12);
        }

        .value-icon {
            font-size: 2.5rem;
            margin-bottom: 1rem;
        }

        .value-card h3 {
            margin-bottom: 0.8rem;
            color: var(--green);
        }

        .value-card p {
            font-size: 0.9rem;
            line-height: 1.7;
            color: var(--text-light);
        }

        .cta-section {
            background: linear-gradient(135deg, var(--green) 0%, var(--navy) 100%);
            color: #fff;
            padding: 4rem;
            border-radius: 12px;
            text-align: center;
            margin-top: 3rem;
        }

        .cta-section h3 {
            color: #fff;
            margin-bottom: 1rem;
            font-size: 1.8rem;
        }

        .cta-section p {
            font-size: 1.05rem;
            opacity: 0.95;
            margin-bottom: 2rem;
        }

        .cta-btn {
            display: inline-block;
            background: var(--gold);
            color: var(--green);
            font-weight: 700;
            padding: 1rem 2.5rem;
            border-radius: 8px;
            text-decoration: none;
            font-size: 1.1rem;
            transition: all 0.3s ease;
        }

        .cta-btn:hover {
            background: #f5c04a;
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(233, 175, 59, 0.4);
        }

        footer {
            background: var(--dark-brown);
            color: #fff;
            text-align: center;
            padding: 4rem 0;
            font-size: 0.9rem;
        }

        footer .logo-section {
            margin-bottom: 1.5rem;
        }

        footer .logo-img {
            height: 80px;
        }

        footer p {
            margin-bottom: 0.6rem;
            opacity: 0.9;
        }

        .analysis-notes {
            background: var(--light-gold);
            padding: 2rem;
            border-radius: 12px;
            margin-top: 2rem;
            border-left: 5px solid var(--gold);
        }

        .analysis-notes h4 {
            color: var(--green);
            margin-bottom: 1rem;
            font-size: 1rem;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .analysis-notes p {
            font-size: 0.95rem;
            color: var(--text);
            margin-bottom: 0;
            white-space: pre-line;
        }

        .proposal-date {
            font-size: 0.85rem;
            opacity: 0.7;
            margin-top: 0.5rem;
        }
    </style>
</head>
<body>

    <header>
        <div class="container header-content">
            <div class="logo-section animate-fade">
                <img src="/timberline-logo.png" alt="Timberline Build Co." class="logo-img">
            </div>
            
            <div class="animate-fade delay-1">
                <h1 class="project-title">${clientName}</h1>
                <p class="project-address">${projectTypeDisplay}</p>
                <p class="proposal-date">Proposal prepared on ${dateCreated}</p>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card animate-fade delay-2">
                    <span class="stat-val">${priceRange}</span>
                    <span class="stat-label">Investment Range</span>
                </div>
                <div class="stat-card animate-fade delay-2">
                    <span class="stat-val">${timeline}</span>
                    <span class="stat-label">Est. Timeline</span>
                </div>
                <div class="stat-card animate-fade delay-2">
                    <span class="stat-val">${squareFootage}</span>
                    <span class="stat-label">Square Feet</span>
                </div>
                <div class="stat-card animate-fade delay-2">
                    <span class="stat-val">${fixtureQuality}</span>
                    <span class="stat-label">Finish Level</span>
                </div>
            </div>
        </div>
    </header>

    <section>
        <div class="container">
            <div class="zone-header animate-fade">
                <h2 class="zone-title">${projectTypeDisplay}</h2>
                <div class="zone-cost">${priceRange}</div>
            </div>

            ${photoUrl ? `<img src="${photoUrl}" alt="Project Photo" class="hero-image animate-fade delay-1">` : `<img src="https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80" alt="Bathroom remodel" class="hero-image animate-fade delay-1">`}

            <div class="zone-grid">
                <div class="scope animate-left delay-2">
                    <h3>Scope of Work</h3>
                    <p style="margin-bottom: 1.8rem; color: #666; font-size: 1rem; line-height: 1.8;">
                        A complete transformation of your bathroom space with attention to quality, functionality, and design.
                    </p>
                    <ul class="scope-list">
                        ${scopeItems.map(item => `<li>${item}</li>`).join('\n                        ')}
                    </ul>
                </div>

                <div class="materials animate-right delay-2">
                    <div class="materials-card">
                        <div class="materials-title">Key Selections</div>
                        ${materials.map(m => `
                        <div class="material-item">
                            <span class="mat-name">${m.name}</span>
                            <span class="mat-detail">${m.detail}</span>
                        </div>`).join('')}
                    </div>
                </div>
            </div>

            ${analysisNotes ? `
            <div class="analysis-notes animate-fade delay-3">
                <h4>📋 Project Assessment</h4>
                <p>${analysisNotes}</p>
            </div>
            ` : ''}
        </div>
    </section>

    <section>
        <div class="container">
            <h2 class="animate-fade" style="text-align: center; margin-bottom: 2rem;">Why Timberline Build Co.</h2>
            
            <p class="about-intro animate-fade delay-1" style="font-size: 1.1rem; color: var(--text-light); margin-bottom: 2.5rem; line-height: 1.8; text-align: center; max-width: 800px; margin-left: auto; margin-right: auto;">
                We're not just contractors—we're your <strong>build and design partners</strong>. We believe the best renovations start with meticulous planning, clear communication, and a commitment to craftsmanship.
            </p>

            <div class="values-grid">
                <div class="value-card animate-fade delay-1">
                    <div class="value-icon">📋</div>
                    <h3>Prep Work First</h3>
                    <p>We invest significant time in planning. Detailed drawings, material selections, and timeline coordination mean your project runs smoothly without surprises.</p>
                </div>

                <div class="value-card animate-fade delay-2">
                    <div class="value-icon">💬</div>
                    <h3>Clear Communication</h3>
                    <p>No mysteries. No radio silence. We keep you informed every step of the way with regular updates and honest conversations.</p>
                </div>

                <div class="value-card animate-fade delay-3">
                    <div class="value-icon">🧹</div>
                    <h3>Clean Every Day</h3>
                    <p>Your home is your sanctuary. We clean up at the end of every single day—no debris piles, no mess lingering.</p>
                </div>

                <div class="value-card animate-fade delay-4">
                    <div class="value-icon">✅</div>
                    <h3>We Finish What We Start</h3>
                    <p>We commit to your timeline and see every job through to completion—walk-through, punch list, and all.</p>
                </div>
            </div>

            <div class="cta-section animate-fade delay-4">
                <h3>Ready to Get Started?</h3>
                <p>Let's discuss your project and finalize the details.</p>
                <a href="tel:+19495551234" class="cta-btn">Call to Schedule</a>
            </div>
        </div>
    </section>

    <footer>
        <div class="container">
            <div class="logo-section">
                <img src="/timberline-logo.png" alt="Timberline Build Co." class="logo-img">
            </div>
            <p style="font-weight: 700; font-size: 0.95rem;">Timberline Build Co.</p>
            <p>Orange County General Contracting</p>
            <p style="margin-top: 1.5rem; font-size: 0.8rem; opacity: 0.7;">© 2026 Timberline Build Co. All Rights Reserved.</p>
        </div>
    </footer>

</body>
</html>`;
}

function generateScopeItems(projectType, quality) {
  const baseItems = {
    'tub-to-shower': [
      'Complete removal of existing tub and surround',
      'New shower pan installation with proper waterproofing',
      'Wall tile installation to ceiling height',
      'New shower valve and fixtures',
      'Glass enclosure installation',
      'New drain assembly',
      'Paint touch-up and trim work',
      'Full cleanup and debris removal'
    ],
    'full-bathroom': [
      'Complete demo of existing bathroom',
      'New layout planning and execution',
      'Full waterproofing system installation',
      'New vanity and countertop',
      'Shower/tub installation with tile surround',
      'New toilet installation',
      'Flooring installation',
      'New lighting and electrical',
      'Paint and trim work',
      'Full cleanup and debris removal'
    ],
    'cosmetic': [
      'Fixture replacement (faucets, showerhead)',
      'New vanity hardware',
      'Fresh paint throughout',
      'New mirror and accessories',
      'Caulk and grout refresh',
      'Light fixture update',
      'Full cleanup'
    ]
  };
  
  // Add quality-specific items
  const qualityExtras = {
    'Premium': ['Heated floor system', 'Custom cabinetry options', 'Designer fixture package'],
    'Mid': ['Quality mid-range fixtures', 'Standard tile package'],
    'Basic': ['Builder-grade fixtures', 'Standard finishes']
  };
  
  const items = baseItems[projectType] || baseItems['full-bathroom'];
  return items;
}

function generateMaterials(projectType, quality) {
  const materials = {
    'Premium': [
      { name: 'Tile', detail: 'Designer Selection' },
      { name: 'Fixtures', detail: 'Premium Brand' },
      { name: 'Glass', detail: 'Frameless 3/8"' },
      { name: 'Vanity', detail: 'Custom/Semi-Custom' },
      { name: 'Hardware', detail: 'Brushed Gold/Nickel' }
    ],
    'Mid': [
      { name: 'Tile', detail: 'Quality Porcelain' },
      { name: 'Fixtures', detail: 'Moen/Delta' },
      { name: 'Glass', detail: 'Semi-Frameless' },
      { name: 'Vanity', detail: 'Pre-Built Quality' },
      { name: 'Hardware', detail: 'Chrome/Brushed Nickel' }
    ],
    'Basic': [
      { name: 'Tile', detail: 'Standard Ceramic' },
      { name: 'Fixtures', detail: 'Builder Grade' },
      { name: 'Glass', detail: 'Framed/Curtain' },
      { name: 'Vanity', detail: 'Stock Cabinet' },
      { name: 'Hardware', detail: 'Chrome' }
    ]
  };
  
  return materials[quality] || materials['Mid'];
}

export default async function handler(req, res) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }
  
  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  
  try {
    // Get estimate ID from URL
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Estimate ID required' });
    }
    
    // Check if Airtable is configured
    if (!AIRTABLE_TOKEN) {
      return res.status(500).json({ error: 'Airtable not configured' });
    }
    
    // Fetch estimate and contact data
    const { estimate, contact } = await getEstimateWithContact(id);
    
    // Generate HTML
    const html = generateProposalHTML(estimate, contact);
    
    // Return HTML
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(html);
    
  } catch (error) {
    console.error('Proposal generation error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate proposal',
      details: error.message 
    });
  }
}
