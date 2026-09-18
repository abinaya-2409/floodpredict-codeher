/**
 * Live terrain and weather, from Open-Meteo.
 *
 * Keyless, CORS-enabled and free for non-commercial use, which is why the
 * whole "any district in India" path can exist without a bundled dataset:
 * elevation and rainfall are the two inputs the flood engine cannot guess,
 * and both are one request away for any coordinate.
 *
 * Open-Meteo's own attribution requirement is met in the map footer.
 */

const ELEVATION = 'https://api.open-meteo.com/v1/elevation';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

/** Metres above sea level for one or more points, in request order. */
export async function fetchElevations(
  points: [number, number][],
  signal?: AbortSignal
): Promise<number[]> {
  if (!points.length) return [];
  const params = new URLSearchParams({
    latitude: points.map((p) => p[0].toFixed(4)).join(','),
    longitude: points.map((p) => p[1].toFixed(4)).join(','),
  });
  const res = await fetch(`${ELEVATION}?${params}`, { signal });
  if (!res.ok) throw new Error(`Elevation lookup failed (${res.status})`);
  const data = (await res.json()) as { elevation: number[] };
  return data.elevation ?? [];
}

export interface LiveRainfall {
  /** mm in the current hour. */
  currentMmHr: number;
  /** Peak hourly intensity over the next 24h. */
  peak24hMmHr: number;
  /** Total accumulation over the next 24h. */
  total24hMm: number;
  /** Total over the next 48h. */
  total48hMm: number;
  /** Hours until the peak hour, for lead-time context. */
  hoursToPeak: number;
  /** Highest hourly probability of precipitation in the window, 0-100. */
  maxProbabilityPercent: number;
  observedAt: string;
  /**
   * The raw hourly series from now, 48 entries.
   *
   * The collapsed figures above answer "how bad"; this answers "when", which
   * is what a timeline simulation needs. Keeping it means the map can drive a
   * real forecast through the depth model hour by hour instead of holding one
   * intensity flat and calling the result a prediction.
   */
  series: { time: string; mm: number; probability: number }[];
}

/**
 * Hourly precipitation for a point, collapsed into the handful of figures the
 * simulation actually consumes.
 */
export async function fetchRainfall(
  lat: number,
  lon: number,
  signal?: AbortSignal
): Promise<LiveRainfall> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: 'precipitation,precipitation_probability',
    forecast_days: '3',
    timezone: 'Asia/Kolkata',
  });
  const res = await fetch(`${FORECAST}?${params}`, { signal });
  if (!res.ok) throw new Error(`Forecast lookup failed (${res.status})`);

  const data = (await res.json()) as {
    hourly: { time: string[]; precipitation: number[]; precipitation_probability: number[] };
  };

  const precip = data.hourly?.precipitation ?? [];
  const prob = data.hourly?.precipitation_probability ?? [];
  const times = data.hourly?.time ?? [];

  // Align "now" to the current hour rather than assuming index 0.
  const nowIso = new Date().toISOString().slice(0, 13);
  const startIdx = Math.max(0, times.findIndex((t) => t.slice(0, 13) >= nowIso));

  const next24 = precip.slice(startIdx, startIdx + 24);
  const next48 = precip.slice(startIdx, startIdx + 48);
  const peak = next24.length ? Math.max(...next24) : 0;

  return {
    currentMmHr: Number((precip[startIdx] ?? 0).toFixed(1)),
    peak24hMmHr: Number(peak.toFixed(1)),
    total24hMm: Number(next24.reduce((a, b) => a + b, 0).toFixed(1)),
    total48hMm: Number(next48.reduce((a, b) => a + b, 0).toFixed(1)),
    hoursToPeak: Math.max(0, next24.indexOf(peak)),
    maxProbabilityPercent: Math.max(0, ...prob.slice(startIdx, startIdx + 24)),
    observedAt: times[startIdx] ?? new Date().toISOString(),
    series: next48.map((mm, i) => ({
      time: times[startIdx + i] ?? '',
      mm: Number((mm ?? 0).toFixed(2)),
      probability: prob[startIdx + i] ?? 0,
    })),
  };
}
