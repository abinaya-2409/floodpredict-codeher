import express from 'express';

export const app = express();
app.use(express.json());

/**
 * Gemini is imported lazily and defensively.
 * A failure here must never take down the whole function at cold start -
 * every route degrades to a clearly-labelled SAMPLE response instead.
 */
let aiClient: any = null;
let aiLoadFailed = false;

async function getGeminiClient(): Promise<any | null> {
  if (aiLoadFailed || !process.env.GEMINI_API_KEY) return null;
  if (aiClient) return aiClient;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: { headers: { 'User-Agent': 'jalrakshak-ai' } },
    });
    return aiClient;
  } catch (err) {
    console.error('Gemini SDK failed to load:', err);
    aiLoadFailed = true;
    return null;
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    platform: 'JalRakshak AI',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

// 1. Gemini AI Hydrological Risk Analysis & Municipal Action Plan
app.post('/api/gemini/analyze-flood', async (req, res) => {
  try {
    const { city, currentRainfallMmHr, weather, highRiskZones, blockedDrains, simulationParams } = req.body;
    const ai = await getGeminiClient();

    if (!ai) {
      // Fallback intelligent response if API key is not yet set
      return res.json({
        sample: true,
        aiAvailable: false,
        analysis: `Hydrological AI Assessment for ${city || 'Urban Basin'}:\n` +
          `• Current Inflow Pressure: ${currentRainfallMmHr || 35} mm/hr exceeding local percolation limits by 240%.\n` +
          `• Critical Bottlenecks: ${blockedDrains?.length || 2} primary canal segments operating above hydraulic discharge capacity.\n` +
          `• Critical Inundation Windows: Low-elevation catchments will experience sheet flow within 45–90 minutes.\n` +
          `• Recommended Municipal Directives: Deploy high-capacity dewatering pump sets (100 HP) at low-lying culvert junctions and issue Tier-3 evacuation advisories for ground floor residents.`,
        executiveSummary: `Severe storm water buildup detected. Proactive drainage intervention required to avert 60+ cm residential inundation.`,
        keyRiskFactors: [
          'Rainfall intensity surpassing storm drain design capacity (30mm/hr standard)',
          'Tidal backflow restricting Buckingham / Mithi canal discharge',
          'Impervious surface runoff coefficient exceeding 0.85 in dense residential clusters'
        ],
        mitigationDirectives: [
          'Immediate desilting and trash-screen clearing at surplus canal outfalls',
          'Pre-positioning NDRF inflatable zodiac boats at nodal flood relief shelters',
          'Enact mandatory road diversion around flooded railway subways and underpasses'
        ]
      });
    }

    const prompt = `You are the Chief Hydrologist and Disaster Management AI Specialist for the JalRakshak Urban Flood System.
Analyze the following live meteorological and hydrological parameters for ${city}:
- Current Rainfall: ${currentRainfallMmHr} mm/hr (Total 24h Forecast: ${weather?.forecast24hMm || 280} mm)
- Doppler Radar Trend: ${weather?.dopplerRadarTrend || 'Intensifying'}
- Atmospheric Pressure: ${weather?.atmosphericPressureHpa || 996} hPa, Wind: ${weather?.windSpeedKmh || 40} km/h
- Tide / Storm Surge: ${weather?.stormSurgeTideM || 1.2} meters
- High Risk Inundation Zones: ${JSON.stringify(highRiskZones || [])}
- Blocked / Choked Drainage Channels: ${JSON.stringify(blockedDrains || [])}
- Simulation Parameters: ${JSON.stringify(simulationParams || {})}

Provide a comprehensive, authoritative, data-backed Hydrological Emergency Report formatted with:
1. Executive Hydrological Diagnosis (Why water is ponding, runoff velocity, saturation timeline)
2. Street-level Vulnerability Assessment & Lead-Time to Flash Inundation
3. Immediate Tactical Engineering Directives (Pumping bypasses, sluice gates, weir clearing)
4. Citizen Protection & Evacuation Directives (Ground floor safety, electrical isolation, vehicle relocation)
5. Multi-language Citizen Warning Broadcast in English and regional language (Tamil/Hindi).

Keep the response structured, clear, and actionable for municipal commissioners, engineers, and disaster first responders.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction: 'You are an expert computational hydrologist and urban flood disaster mitigation specialist. Produce realistic, actionable, engineering-grade assessments based on terrain, stormwater networks, and precipitation metrics.',
      }
    });

    res.json({
      sample: false,
      aiAvailable: true,
      analysis: response.text || 'Analysis completed successfully.',
    });
  } catch (error: any) {
    console.error('Gemini flood analysis error:', error);
    res.status(500).json({
      error: 'Failed to generate flood analysis',
      details: error?.message || String(error)
    });
  }
});

// 2. Gemini "What-If" Hydraulic Scenario Diagnosis
app.post('/api/gemini/what-if-diagnosis', async (req, res) => {
  try {
    const { cityName, rainfallMmHr, durationHrs, modifiedDrains, changedZoneDepths } = req.body;
    const ai = await getGeminiClient();

    if (!ai) {
      return res.json({
        sample: true,
        aiAvailable: false,
        diagnosis: `What-If Hydraulic Simulation Summary for ${cityName}:\n` +
          `Under ${rainfallMmHr} mm/hr rainfall sustained for ${durationHrs} hours, altering canal bottlenecks produces a critical non-linear surge in inundation depth.\n` +
          `• Removing chokes on primary canals reduces peak flood level by ~38cm in downstream lowlands.\n` +
          `• Retaining current debris chokes causes backwater spill into secondary residential storm networks within 35 minutes.\n` +
          `• Key recommendation: Mobile pump deployment on outfall weirs will avert emergency evacuations in adjacent wards.`,
        engineeringImpactScore: 88,
        priorityInterventions: [
          'Immediate culvert clearing at critical road crossings',
          'Activating secondary diesel booster pumps',
          'Deploying sandbag levees along canal bund low points'
        ]
      });
    }

    const prompt = `You are an urban drainage hydraulic modeler evaluating a "What-If" scenario for ${cityName}.
Scenario Parameters:
- Rainfall: ${rainfallMmHr} mm/hr for ${durationHrs} hours
- Drain / Canal Statuses (Modified or Choked): ${JSON.stringify(modifiedDrains || [])}
- Computed Zone Inundation Changes: ${JSON.stringify(changedZoneDepths || [])}

Provide a concise hydraulic diagnosis explaining:
1. Hydraulic impact: How changing these drain bottlenecks shifted the flood footprint and backwater head pressure.
2. The specific tipping point where rainfall turns from manageable runoff into severe residential street inundation.
3. 3 prioritized engineering countermeasures for municipal teams.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    res.json({
      sample: false,
      aiAvailable: true,
      diagnosis: response.text || 'What-If scenario diagnosis generated.',
    });
  } catch (error: any) {
    console.error('Gemini what-if error:', error);
    res.status(500).json({ error: 'Failed to diagnose what-if scenario', details: error?.message });
  }
});

// 3. Gemini Automated Multi-Tiered Alert Broadcaster
app.post('/api/gemini/broadcast-alert', async (req, res) => {
  try {
    const { zoneName, tier, rainfallMmHr, predictedDepthCm, language } = req.body;
    const ai = await getGeminiClient();

    if (!ai) {
      return res.json({
        sample: true,
        aiAvailable: false,
        smsEn: `[JALRAKSHAK FLOOD ${tier.toUpperCase()}] Severe rain (${rainfallMmHr}mm/hr) forecast for ${zoneName}. Est water level: ${predictedDepthCm}cm. Move vehicles to high ground & turn off main switch. Emergency: 1070 / 1913.`,
        smsLocal: `[ஜல்ரக்ஷக் வெள்ள அபாய எச்சரிக்கை - ${tier.toUpperCase()}] ${zoneName} பகுதியில் கனமழை காரணமாக ${predictedDepthCm}செ.மீ வரை நீர் தேங்க வாய்ப்பு. வாகனங்களை மேடான பகுதிக்கு மாற்றவும். அவசர உதவிக்கு: 1913.`,
        actions: ['Shift 4-wheelers to elevated parking', 'Turn off ground-level inverters', 'Move elderly to upper floors']
      });
    }

    const prompt = `Generate a targeted official Emergency Flood Alert broadcast for ${zoneName} at alert tier '${tier}'.
Details:
- Rainfall: ${rainfallMmHr} mm/hr
- Predicted Inundation Depth: ${predictedDepthCm} cm
- Target Language: ${language || 'Tamil'}

Provide:
1. Short SMS/WhatsApp Broadcast text in English (Under 160 chars, clear, urgent, with emergency numbers).
2. Short SMS/WhatsApp Broadcast text translated into accurate, natural ${language} (e.g., Tamil for Chennai, Marathi for Mumbai, Hindi for North India).
3. 3 imperative citizen action steps (e.g. vehicle movement, electrical safety, nearest shelter).`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    res.json({
      sample: false,
      aiAvailable: true,
      alertBroadcast: response.text || 'Emergency broadcast generated.',
    });
  } catch (error: any) {
    console.error('Gemini broadcast alert error:', error);
    res.status(500).json({ error: 'Failed to generate alert broadcast', details: error?.message });
  }
});

// Unknown /api route -> explicit 404 (never a silent crash)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});
