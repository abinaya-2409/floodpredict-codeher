import express from 'express';

export const app = express();
app.use(express.json());

/* ---------------------------------------------------------------------------
 * Gemini client
 * ------------------------------------------------------------------------ */

/**
 * Reads the Gemini key defensively.
 *
 * Pasting a key into a dashboard is the step that goes wrong most often, so
 * surrounding quotes and stray whitespace are stripped here rather than sent
 * to Google as part of the key.
 */
function readApiKey(): string {
  const raw = process.env.GEMINI_API_KEY ?? '';
  return raw.trim().replace(/^["']|["']$/g, '');
}

/** A Gemini key is "AIza" followed by 35 URL-safe characters. */
function keyLooksValid(key: string): boolean {
  return /^AIza[0-9A-Za-z_-]{35}$/.test(key);
}

/**
 * Imported lazily and defensively: a failure here must never take down the
 * whole function at cold start.
 */
let aiClient: any = null;
let aiLoadFailed = false;

async function getGeminiClient(): Promise<any | null> {
  const apiKey = readApiKey();
  if (aiLoadFailed || !apiKey) return null;
  if (aiClient) return aiClient;
  try {
    const { GoogleGenAI } = await import('@google/genai');
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'User-Agent': 'jalrakshak-ai' } },
    });
    return aiClient;
  } catch (err) {
    console.error('Gemini SDK failed to load:', err);
    aiLoadFailed = true;
    return null;
  }
}

/**
 * Turns a Gemini failure into something a human can act on.
 *
 * The raw SDK error is a nested JSON blob; putting it in an HTTP 500 tells the
 * operator nothing and leaves the user with a broken panel. Each known failure
 * maps to a short reason instead, and the caller falls back to sample output.
 */
function describeAiFailure(error: any): { reason: string; detail: string } {
  const text = String(error?.message ?? error ?? '');

  if (/API_KEY_INVALID|API key not valid/i.test(text)) {
    return {
      reason: 'invalid_api_key',
      detail:
        'GEMINI_API_KEY was rejected by Google. Check it is a complete key from aistudio.google.com/apikey with no quotes or whitespace, and that it carries no HTTP-referrer restriction - those block server-side calls.',
    };
  }
  if (/PERMISSION_DENIED|SERVICE_DISABLED|has not been used/i.test(text)) {
    return {
      reason: 'permission_denied',
      detail: 'The key exists but the Generative Language API is not enabled for its project.',
    };
  }
  if (/RESOURCE_EXHAUSTED|429|quota/i.test(text)) {
    return {
      reason: 'rate_limited',
      detail: 'Free-tier rate limit reached. It resets automatically - retry shortly.',
    };
  }
  if (/DEADLINE_EXCEEDED|ETIMEDOUT|timeout|aborted/i.test(text)) {
    return { reason: 'timeout', detail: 'Gemini did not respond in time.' };
  }
  return { reason: 'upstream_error', detail: text.slice(0, 300) };
}

/* ---------------------------------------------------------------------------
 * Sample payloads
 *
 * Built as standalone functions so both the "no key configured" path and the
 * "call failed" path can return them. Previously only the first could, so a
 * rejected key produced an HTTP 500 and a dead panel.
 *
 * Every one of these is flagged sample:true. The figures are illustrative and
 * must never be presentable as real analysis.
 * ------------------------------------------------------------------------ */

function buildAnalyzeSample(body: any = {}) {
  const { city, currentRainfallMmHr, blockedDrains } = body;
  return {
    sample: true,
    aiAvailable: false,
    reason: 'no_api_key',
    analysis:
      `Hydrological AI Assessment for ${city || 'Urban Basin'}:\n` +
      `• Current Inflow Pressure: ${currentRainfallMmHr || 35} mm/hr exceeding local percolation limits by 240%.\n` +
      `• Critical Bottlenecks: ${blockedDrains?.length || 2} primary canal segments operating above hydraulic discharge capacity.\n` +
      `• Critical Inundation Windows: Low-elevation catchments will experience sheet flow within 45-90 minutes.\n` +
      `• Recommended Municipal Directives: Deploy high-capacity dewatering pump sets (100 HP) at low-lying culvert junctions and issue Tier-3 evacuation advisories for ground floor residents.`,
    executiveSummary:
      'Severe storm water buildup detected. Proactive drainage intervention required to avert 60+ cm residential inundation.',
    keyRiskFactors: [
      'Rainfall intensity surpassing storm drain design capacity (30mm/hr standard)',
      'Tidal backflow restricting Buckingham / Mithi canal discharge',
      'Impervious surface runoff coefficient exceeding 0.85 in dense residential clusters',
    ],
    mitigationDirectives: [
      'Immediate desilting and trash-screen clearing at surplus canal outfalls',
      'Pre-positioning NDRF inflatable zodiac boats at nodal flood relief shelters',
      'Enact mandatory road diversion around flooded railway subways and underpasses',
    ],
  };
}

function buildWhatIfSample(body: any = {}) {
  const { cityName, rainfallMmHr, durationHrs } = body;
  return {
    sample: true,
    aiAvailable: false,
    reason: 'no_api_key',
    diagnosis:
      `What-If Hydraulic Simulation Summary for ${cityName || 'Urban Basin'}:\n` +
      `Under ${rainfallMmHr || 45} mm/hr rainfall sustained for ${durationHrs || 3} hours, altering canal bottlenecks produces a critical non-linear surge in inundation depth.\n` +
      `• Removing chokes on primary canals reduces peak flood level by ~38cm in downstream lowlands.\n` +
      `• Retaining current debris chokes causes backwater spill into secondary residential storm networks within 35 minutes.\n` +
      `• Key recommendation: Mobile pump deployment on outfall weirs will avert emergency evacuations in adjacent wards.`,
    engineeringImpactScore: 88,
    priorityInterventions: [
      'Immediate culvert clearing at critical road crossings',
      'Activating secondary diesel booster pumps',
      'Deploying sandbag levees along canal bund low points',
    ],
  };
}

function buildBroadcastSample(body: any = {}) {
  const { zoneName, tier, rainfallMmHr, predictedDepthCm } = body;
  const tierLabel = String(tier || 'warning').toUpperCase();
  return {
    sample: true,
    aiAvailable: false,
    reason: 'no_api_key',
    smsEn: `[JALRAKSHAK FLOOD ${tierLabel}] Severe rain (${rainfallMmHr || 45}mm/hr) forecast for ${zoneName || 'your ward'}. Est water level: ${predictedDepthCm || 45}cm. Move vehicles to high ground & turn off main switch. Emergency: 1070 / 1913.`,
    smsLocal: `[ஜல்ரக்ஷக் வெள்ள அபாய எச்சரிக்கை - ${tierLabel}] ${zoneName || 'உங்கள் பகுதி'} பகுதியில் கனமழை காரணமாக ${predictedDepthCm || 45}செ.மீ வரை நீர் தேங்க வாய்ப்பு. வாகனங்களை மேடான பகுதிக்கு மாற்றவும். அவசர உதவிக்கு: 1913.`,
    actions: [
      'Shift 4-wheelers to elevated parking',
      'Turn off ground-level inverters',
      'Move elderly to upper floors',
    ],
  };
}

/* ---------------------------------------------------------------------------
 * Routes
 * ------------------------------------------------------------------------ */

app.get('/api/health', (_req, res) => {
  const key = readApiKey();
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    platform: 'JalRakshak AI',
    aiConfigured: Boolean(key),
    // Shape check only - it never proves Google will accept the key, but it
    // catches the common paste errors without spending a request.
    aiKeyFormat: !key ? 'missing' : keyLooksValid(key) ? 'ok' : 'malformed',
  });
});

// 1. Hydrological risk analysis & municipal action plan
app.post('/api/gemini/analyze-flood', async (req, res) => {
  try {
    const { city, currentRainfallMmHr, weather, highRiskZones, blockedDrains, simulationParams } =
      req.body ?? {};
    const ai = await getGeminiClient();
    if (!ai) return res.json(buildAnalyzeSample(req.body));

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
        systemInstruction:
          'You are an expert computational hydrologist and urban flood disaster mitigation specialist. Produce realistic, actionable, engineering-grade assessments based on terrain, stormwater networks, and precipitation metrics.',
      },
    });

    res.json({
      sample: false,
      aiAvailable: true,
      analysis: response.text || 'Analysis completed successfully.',
    });
  } catch (error: any) {
    const { reason, detail } = describeAiFailure(error);
    console.error(`Gemini flood analysis failed (${reason}): ${detail}`);
    res.json({ ...buildAnalyzeSample(req.body), reason, reasonDetail: detail });
  }
});

// 2. "What-If" hydraulic scenario diagnosis
app.post('/api/gemini/what-if-diagnosis', async (req, res) => {
  try {
    const { cityName, rainfallMmHr, durationHrs, modifiedDrains, changedZoneDepths } =
      req.body ?? {};
    const ai = await getGeminiClient();
    if (!ai) return res.json(buildWhatIfSample(req.body));

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
    const { reason, detail } = describeAiFailure(error);
    console.error(`Gemini what-if failed (${reason}): ${detail}`);
    res.json({ ...buildWhatIfSample(req.body), reason, reasonDetail: detail });
  }
});

// 3. Automated multi-tiered alert broadcaster
app.post('/api/gemini/broadcast-alert', async (req, res) => {
  try {
    const { zoneName, tier, rainfallMmHr, predictedDepthCm, language } = req.body ?? {};
    const ai = await getGeminiClient();
    if (!ai) return res.json(buildBroadcastSample(req.body));

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
    const { reason, detail } = describeAiFailure(error);
    console.error(`Gemini broadcast failed (${reason}): ${detail}`);
    res.json({ ...buildBroadcastSample(req.body), reason, reasonDetail: detail });
  }
});

/**
 * Unknown /api route -> explicit 404, never a silent crash.
 *
 * Mounted by the caller rather than at import time: in local dev the same
 * Express app also carries Vite's middleware, and Express matches in
 * registration order, so a catch-all registered here would swallow every
 * page request before Vite ever saw it.
 */
export function mountNotFound() {
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.originalUrl });
  });
}
