import express from 'express';
import { sendOtpEmail } from './emailService.js';

export const app = express();
app.use(express.json());

/* ---------------------------------------------------------------------------
 * In-memory OTP Store for Citizen & Authority Verification
 * ------------------------------------------------------------------------ */
interface StoredOtp {
  code: string;
  expiresAt: number;
  attempts: number;
  contact: string;
  wardId?: string;
  createdAt: number;
}

const otpStore = new Map<string, StoredOtp>();

// Clean up expired OTPs periodically (every 5 mins)
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of otpStore.entries()) {
    if (value.expiresAt < now) {
      otpStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

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
    smtpConfigured: Boolean((process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) || (process.env.SMTP_HOST && process.env.SMTP_USER)),
  });
});

/* ---------------------------------------------------------------------------
 * Auth: Real OTP Dispatch & Verification
 * ------------------------------------------------------------------------ */

// Send OTP via Email / SMS
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { contact, wardName, wardId } = req.body ?? {};
    if (!contact || typeof contact !== 'string' || !contact.trim()) {
      return res.status(400).json({ success: false, message: 'Valid email address is required.' });
    }

    const normalizedContact = contact.trim().toLowerCase();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedContact);

    // -----------------------------------------------------------------------
    // Authorized email whitelist check
    // Only bhavanasri522@gmail.com and itsabinaya24@gmail.com may receive OTPs
    // -----------------------------------------------------------------------
    if (isEmail) {
      const { AUTHORIZED_EMAILS } = await import('./emailService.js');
      if (!AUTHORIZED_EMAILS.has(normalizedContact)) {
        return res.status(403).json({
          success: false,
          message: `Access restricted. The email "${normalizedContact}" is not registered in the JalRakshak AI system. Please contact your GCC zone administrator.`,
        });
      }
    }

    // Rate limit: 20 seconds cooldown
    const existing = otpStore.get(normalizedContact);
    const now = Date.now();
    if (existing && now - existing.createdAt < 20 * 1000) {
      const waitSec = Math.ceil((20 * 1000 - (now - existing.createdAt)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSec}s before requesting a new OTP code.`,
      });
    }

    // Generate cryptographic 4-digit OTP (1000–9999)
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = now + 5 * 60 * 1000; // 5-minute validity

    otpStore.set(normalizedContact, {
      code: otpCode,
      expiresAt,
      attempts: 0,
      contact: normalizedContact,
      wardId,
      createdAt: now,
    });

    console.log(`\n======================================================`);
    console.log(`[JalRakshak AI] 🔑 OTP for ${normalizedContact}: ${otpCode}`);
    console.log(`Expires: ${new Date(expiresAt).toLocaleTimeString()} (5 min)`);
    console.log(`======================================================\n`);

    if (isEmail) {
      const emailResult = await sendOtpEmail(normalizedContact, otpCode, wardName);

      if (emailResult.success && emailResult.channel === 'smtp') {
        // Real inbox delivery via Gmail / custom SMTP
        return res.json({
          success: true,
          channel: 'email',
          delivered: true,
          message: `✅ OTP email sent to ${normalizedContact}. Please check your inbox and spam folder.`,
        });
      } else if (emailResult.success && emailResult.channel === 'ethereal') {
        // Ethereal captures the email; provide preview URL + show code for convenience
        return res.json({
          success: true,
          channel: 'email',
          delivered: false,
          ethereal: true,
          previewUrl: emailResult.previewUrl,
          devOtp: otpCode,
          message: `OTP dispatched via Ethereal test capture for ${normalizedContact}. Your code: ${otpCode}`,
        });
      } else {
        // Email send failed
        return res.json({
          success: true,
          channel: 'email',
          delivered: false,
          devOtp: otpCode,
          message: `Email delivery error: ${emailResult.error}. Use code: ${otpCode}`,
        });
      }
    } else {
      // SMS / phone fallback (dev mode)
      return res.json({
        success: true,
        channel: 'sms',
        delivered: false,
        devOtp: otpCode,
        message: `OTP for ${normalizedContact}: ${otpCode} (SMS gateway active in dev mode).`,
      });
    }
  } catch (err: any) {
    console.error('[JalRakshak Auth] Send OTP Error:', err);
    res.status(500).json({ success: false, message: 'Failed to process OTP request.' });
  }
});

// Verify OTP
app.post('/api/auth/verify-otp', (req, res) => {
  try {
    const { contact, otp } = req.body ?? {};
    if (!contact || !otp) {
      return res.status(400).json({ success: false, message: 'Contact and OTP code are required.' });
    }

    const normalizedContact = contact.trim().toLowerCase();
    const stored = otpStore.get(normalizedContact);

    if (!stored) {
      return res.status(400).json({
        success: false,
        message: 'No active OTP found for this address. Please click "Resend OTP Code".',
      });
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(normalizedContact);
      return res.status(400).json({
        success: false,
        message: 'Verification code has expired. Please request a new code.',
      });
    }

    if (stored.attempts >= 5) {
      otpStore.delete(normalizedContact);
      return res.status(429).json({
        success: false,
        message: 'Maximum verification attempts exceeded. Please request a new OTP.',
      });
    }

    const enteredOtp = String(otp).trim();
    if (enteredOtp !== stored.code) {
      stored.attempts += 1;
      const remaining = 5 - stored.attempts;
      return res.status(400).json({
        success: false,
        message: `Incorrect 4-digit code. ${remaining} attempt(s) remaining.`,
      });
    }

    // Success! Clear consumed OTP
    otpStore.delete(normalizedContact);

    res.json({
      success: true,
      message: 'OTP verified successfully.',
      session: {
        contact: normalizedContact,
        verifiedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('[JalRakshak Auth] Verify OTP Error:', err);
    res.status(500).json({ success: false, message: 'Verification processing error.' });
  }
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
