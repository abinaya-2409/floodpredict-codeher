import { RiskLevel } from '../types';
import { LiveRainfall, fetchElevations, fetchRainfall } from './openMeteo';

/**
 * Point-and-predict: a flood forecast for any coordinate in India.
 *
 * The eight modelled cities carry surveyed drains, ward demographics and
 * street thresholds, and nothing like that exists anywhere else. But the two
 * inputs that actually decide whether a spot floods - how much water arrives,
 * and whether the ground can shed it - are available keylessly for every
 * coordinate on earth. This builds a real forecast from those.
 *
 * The move that makes it more than a guess is sampling terrain as a *ring*
 * rather than a single point. One elevation reading tells you nothing: 4m
 * above sea level is a death sentence in a delta and unremarkable on a
 * plateau. What matters is the height of the point relative to the ground
 * immediately around it - a hollow fills, a crown drains - and that needs the
 * neighbourhood, which is what the ring gives.
 *
 * Every number here is derived, and the confidence field says how far to
 * trust it. Nothing is invented to fill a gap.
 */

/** One hour of the simulation. */
export interface DepthStep {
  /** Hours from now. */
  hour: number;
  /** Rain falling during this hour, mm. */
  rainMmHr: number;
  /** Standing water at the end of this hour, cm. */
  depthCm: number;
  band: RiskLevel;
}

export interface PointForecast {
  lat: number;
  lon: number;
  label: string;
  /** Elevation at the clicked point, metres above sea level. */
  elevationM: number;
  /** Mean of the surrounding ring. */
  neighbourhoodMeanM: number;
  /**
   * How far the point sits below its surroundings, metres.
   * Positive means a hollow that collects; negative means high ground.
   */
  sinkDepthM: number;
  /** Spread across all samples - the local terrain's vertical range. */
  reliefM: number;
  /** Fall across the sample ring, as a percentage gradient. */
  slopePercent: number;
  /** Fraction of the ring lower than the point: where the water can go. */
  drainableFraction: number;
  rainfall: LiveRainfall;
  /** The hourly run, 48 entries. */
  curve: DepthStep[];
  peakDepthCm: number;
  peakAtHour: number;
  /** Minutes until standing water first passes 15cm. Null if it never does. */
  timeToFloodMins: number | null;
  /** Hours from the peak until water falls back under 15cm. */
  drainAwayHours: number;
  band: RiskLevel;
  /** Radius of the modelled ponding footprint, metres. */
  footprintRadiusM: number;
  /**
   * Rainfall intensity at which water begins to accumulate here, mm/hr.
   *
   * The single most useful number the terrain read produces: below it the
   * ground keeps up and nothing stands, above it depth climbs. It is also
   * what makes a quiet forecast informative rather than blank - "peaks at
   * 3mm/hr against a 7mm/hr threshold" is an answer, where "0cm" is not.
   */
  drainageThresholdMmHr: number;
  /** Modelled ceiling on standing water at this point, cm. */
  storageCapacityCm: number;
  /** The terrain sampling radius used, metres. Kept so a re-run can match it. */
  radiusM: number;
  confidence: 'terrain+forecast' | 'terrain only' | 'coarse';
  /** What drove the result, in plain words, ordered by contribution. */
  drivers: { label: string; detail: string; weight: number }[];
}

export type ForecastMode = 'live' | 'scenario';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function bandForDepth(cm: number): RiskLevel {
  if (cm >= 75) return 'critical';
  if (cm >= 50) return 'severe';
  if (cm >= 30) return 'high';
  if (cm >= 15) return 'moderate';
  return 'low';
}

/** Metres per degree of latitude; longitude is scaled by cos(lat). */
const M_PER_DEG = 111320;

/**
 * Nine points: the centre, plus a ring of eight at `radiusM`.
 *
 * Open-Meteo takes them in one batched request, so the whole terrain read is
 * a single round trip however many samples are asked for.
 */
export function samplingRing(
  lat: number,
  lon: number,
  radiusM: number
): [number, number][] {
  const dLat = radiusM / M_PER_DEG;
  const dLon = radiusM / (M_PER_DEG * Math.cos((lat * Math.PI) / 180));
  const pts: [number, number][] = [[lat, lon]];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    pts.push([lat + dLat * Math.cos(a), lon + dLon * Math.sin(a)]);
  }
  return pts;
}

/** What the storage model needs to know about the ground. */
export interface TerrainInput {
  sinkDepthM: number;
  slopePercent: number;
  drainableFraction: number;
  elevationM: number;
}

/**
 * Runs water through the terrain hour by hour.
 *
 * A storage model, not a peak-flow formula. Each hour some rain arrives, some
 * of it runs off or soaks away, and the remainder joins what is already
 * standing - which is why the curve keeps climbing through a long moderate
 * event and why it takes hours to fall once the rain stops. A rational-formula
 * peak reports the same depth for a twenty-minute cloudburst and a two-day
 * monsoon, and those are not the same emergency.
 */
export function runStorageModel(
  hourly: number[],
  terrain: TerrainInput
): { steps: DepthStep[]; thresholdMmHr: number; capacityCm: number } {
  const { sinkDepthM, slopePercent, drainableFraction, elevationM } = terrain;

  // Flat ground cannot move water sideways, so more of what falls stays put.
  const flatness = clamp(1 - slopePercent / 5, 0, 1);
  const runoffCoeff = clamp(0.5 + 0.35 * flatness, 0.5, 0.85);

  // Outflow, mm/hr. Gravity drainage scales with gradient and with how much
  // of the surrounding ground is downhill; a hollow with nowhere lower has
  // almost none, which is exactly why hollows flood.
  const gravityOut = 5.5 * Math.min(slopePercent, 6) * (0.35 + drainableFraction);
  // Infiltration and built drainage. Low coastal ground loses it to
  // backwater: the outfall is underwater, so the drain stops being a drain.
  const tidalPenalty = elevationM < 6 ? clamp(1 - (6 - elevationM) / 8, 0.35, 1) : 1;
  const baseOut = 4.0 * tidalPenalty;
  const outflowMmHr = Math.max(1.2, gravityOut + baseOut);

  // Ceiling on standing water.
  //
  // A hollow holds to its rim and then spills, so its depth is the rim
  // height. But ground that is *not* in a hollow still ponds, and tying the
  // ceiling to the hollow alone pinned every such point to the floor value -
  // T. Nagar came out at 25cm in a 540mm storm purely because it sits a
  // metre above its ring mean. Flat ground ponds because the water has far
  // to travel before it leaves, not because it is trapped, so flatness earns
  // storage in its own right.
  const hollowCm = Math.max(0, sinkDepthM) * 100;
  const sheetCm = 20 + 55 * flatness;
  const capacityCm = clamp(sheetCm + hollowCm, 20, 300);

  const steps: DepthStep[] = [];
  let storedCm = 0;

  for (let h = 0; h < hourly.length; h++) {
    const rain = Math.max(0, hourly[h] ?? 0);
    const netMm = rain * runoffCoeff - outflowMmHr;
    storedCm = clamp(storedCm + netMm / 10, 0, capacityCm);
    steps.push({
      hour: h,
      rainMmHr: Number(rain.toFixed(1)),
      depthCm: Math.round(storedCm),
      band: bandForDepth(storedCm),
    });
  }

  return {
    steps,
    // Inflow equals outflow at this intensity, so it is the point where
    // standing water starts.
    thresholdMmHr: Number((outflowMmHr / runoffCoeff).toFixed(1)),
    capacityCm: Math.round(capacityCm),
  };
}

/** Scenario knobs. Held apart so the map can re-run without re-fetching. */
export interface ScenarioOptions {
  mode: ForecastMode;
  scenarioMmHr: number;
  scenarioHours: number;
}

/** Terrain, plus the two figures kept only for display. */
type TerrainRead = TerrainInput & { neighbourhoodMeanM: number; reliefM: number };

/**
 * Everything derived from terrain and rainfall, with no network involved.
 *
 * Split out so that moving the rainfall slider, or switching between live and
 * what-if, recomputes instantly from what has already been read. Terrain does
 * not change between slider positions and neither does the forecast, so
 * re-fetching both to answer "what if it rained harder" would add a second of
 * latency to a question already fully answered by data in hand.
 */
function assemble(
  base: {
    lat: number;
    lon: number;
    label: string;
    radiusM: number;
    confidence: PointForecast['confidence'];
  },
  terrain: TerrainRead,
  rainfall: LiveRainfall,
  scenario: ScenarioOptions
): PointForecast {
  const { mode, scenarioMmHr, scenarioHours } = scenario;
  const { elevationM, sinkDepthM, slopePercent, drainableFraction } = terrain;

  const hourly =
    mode === 'scenario'
      ? Array.from({ length: 48 }, (_, h) => (h < scenarioHours ? scenarioMmHr : 0))
      : rainfall.series.map((s) => s.mm);

  const run = runStorageModel(hourly.length ? hourly : new Array(48).fill(0), terrain);
  const curve = run.steps;

  let peakDepthCm = 0;
  let peakAtHour = 0;
  curve.forEach((s) => {
    if (s.depthCm > peakDepthCm) {
      peakDepthCm = s.depthCm;
      peakAtHour = s.hour;
    }
  });

  const firstFlood = curve.find((s) => s.depthCm >= 15);
  const timeToFloodMins = firstFlood ? firstFlood.hour * 60 : null;
  const recede = curve.findIndex((s) => s.hour > peakAtHour && s.depthCm < 15);
  const drainAwayHours = recede === -1 ? 48 - peakAtHour : recede - peakAtHour;

  // The footprint grows with depth but is bounded by the sampled
  // neighbourhood - claiming a kilometre of inundation from a 900m read would
  // be extrapolating past the evidence.
  const footprintRadiusM = Math.round(
    clamp(base.radiusM * (0.3 + (peakDepthCm / 100) * 0.8), 150, base.radiusM * 1.15)
  );

  const drivers = [
    {
      label: sinkDepthM > 0.5 ? 'Local depression' : 'Local elevation',
      detail:
        sinkDepthM > 0.5
          ? `Sits ${sinkDepthM.toFixed(1)}m below the surrounding ground, so water collects here.`
          : `Stands ${Math.abs(sinkDepthM).toFixed(1)}m relative to its surroundings.`,
      weight: clamp(Math.abs(sinkDepthM) / 4, 0, 1),
    },
    {
      label: slopePercent < 1 ? 'Near-flat gradient' : 'Gradient',
      detail: `${slopePercent.toFixed(1)}% fall across ${((base.radiusM * 2) / 1000).toFixed(
        1
      )}km. ${
        slopePercent < 1 ? 'Too flat to shed water sideways.' : 'Provides some gravity drainage.'
      }`,
      weight: clamp(1 - slopePercent / 5, 0, 1),
    },
    {
      label: mode === 'scenario' ? 'Scenario rainfall' : 'Forecast rainfall',
      detail:
        mode === 'scenario'
          ? `${scenarioMmHr}mm/hr held for ${scenarioHours}h.`
          : `Peak ${rainfall.peak24hMmHr}mm/hr, ${rainfall.total24hMm}mm over 24h.`,
      weight: clamp((mode === 'scenario' ? scenarioMmHr : rainfall.peak24hMmHr) / 60, 0, 1),
    },
    {
      label: 'Sea-level backwater',
      detail:
        elevationM < 6
          ? `${elevationM.toFixed(0)}m above sea level - outfalls submerge and drains stop draining.`
          : `${elevationM.toFixed(0)}m above sea level - outfalls stay clear.`,
      weight: elevationM < 6 ? clamp((6 - elevationM) / 6, 0, 1) : 0,
    },
  ]
    .filter((d) => d.weight > 0.05)
    .sort((a, b) => b.weight - a.weight);

  return {
    lat: base.lat,
    lon: base.lon,
    label: base.label,
    elevationM: Number(elevationM.toFixed(1)),
    neighbourhoodMeanM: Number(terrain.neighbourhoodMeanM.toFixed(1)),
    sinkDepthM: Number(sinkDepthM.toFixed(2)),
    reliefM: Number(terrain.reliefM.toFixed(1)),
    slopePercent: Number(slopePercent.toFixed(2)),
    drainableFraction: Number(drainableFraction.toFixed(2)),
    rainfall,
    curve,
    peakDepthCm,
    peakAtHour,
    timeToFloodMins,
    drainAwayHours,
    band: bandForDepth(peakDepthCm),
    footprintRadiusM,
    drainageThresholdMmHr: run.thresholdMmHr,
    storageCapacityCm: run.capacityCm,
    radiusM: base.radiusM,
    confidence: base.confidence,
    drivers,
  };
}

/**
 * Re-runs an existing forecast against different scenario settings.
 *
 * Pure and synchronous: the terrain read and the rainfall forecast are both
 * already on the forecast it is handed, so dragging the rainfall slider
 * redraws the map on the same frame instead of waiting on two API calls.
 */
export function recomputeForecast(
  f: PointForecast,
  scenario: ScenarioOptions
): PointForecast {
  return assemble(
    { lat: f.lat, lon: f.lon, label: f.label, radiusM: f.radiusM, confidence: f.confidence },
    {
      elevationM: f.elevationM,
      sinkDepthM: f.sinkDepthM,
      slopePercent: f.slopePercent,
      drainableFraction: f.drainableFraction,
      neighbourhoodMeanM: f.neighbourhoodMeanM,
      reliefM: f.reliefM,
    },
    f.rainfall,
    scenario
  );
}

/**
 * Builds a forecast for one coordinate, reading terrain and weather once.
 *
 * In `live` mode the hourly series comes straight from Open-Meteo, so the
 * curve is a real forecast. In `scenario` mode the slider intensity is held
 * for `scenarioHours` and then stops, which is what makes the slider a
 * what-if rather than decoration.
 */
export async function forecastPoint(
  lat: number,
  lon: number,
  opts: {
    label?: string;
    mode?: ForecastMode;
    scenarioMmHr?: number;
    scenarioHours?: number;
    radiusM?: number;
    signal?: AbortSignal;
  } = {}
): Promise<PointForecast> {
  const {
    label = `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
    mode = 'live',
    scenarioMmHr = 60,
    scenarioHours = 6,
    radiusM = 900,
    signal,
  } = opts;

  const ring = samplingRing(lat, lon, radiusM);

  // Terrain and weather are independent, and a slow forecast must not hold
  // the terrain read hostage - allSettled so a failure degrades rather than
  // discarding the half that worked.
  const [elevRes, rainRes] = await Promise.allSettled([
    fetchElevations(ring, signal),
    fetchRainfall(lat, lon, signal),
  ]);

  const elevations =
    elevRes.status === 'fulfilled' ? elevRes.value.filter((e) => Number.isFinite(e)) : [];
  if (!elevations.length) throw new Error('No elevation data for that point.');

  const elevationM = elevations[0];
  const ringVals = elevations.slice(1);
  const neighbourhoodMeanM = ringVals.length
    ? ringVals.reduce((a, b) => a + b, 0) / ringVals.length
    : elevationM;
  const reliefM = Math.max(...elevations) - Math.min(...elevations);
  const sinkDepthM = neighbourhoodMeanM - elevationM;
  // Gradient across the ring, expressed as a percentage.
  const slopePercent = clamp((reliefM / (radiusM * 2)) * 100, 0, 25);
  const drainableFraction = ringVals.length
    ? ringVals.filter((e) => e < elevationM).length / ringVals.length
    : 0.5;

  const rainfall: LiveRainfall =
    rainRes.status === 'fulfilled'
      ? rainRes.value
      : {
          currentMmHr: 0,
          peak24hMmHr: 0,
          total24hMm: 0,
          total48hMm: 0,
          hoursToPeak: 0,
          maxProbabilityPercent: 0,
          observedAt: new Date().toISOString(),
          series: [],
        };

  return assemble(
    {
      lat,
      lon,
      label,
      radiusM,
      confidence:
        rainRes.status === 'fulfilled' && rainfall.series.length
          ? 'terrain+forecast'
          : elevations.length > 5
            ? 'terrain only'
            : 'coarse',
    },
    { elevationM, sinkDepthM, slopePercent, drainableFraction, neighbourhoodMeanM, reliefM },
    rainfall,
    { mode, scenarioMmHr, scenarioHours }
  );
}
