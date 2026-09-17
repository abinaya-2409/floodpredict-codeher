import { RiskLevel } from '../types';
import { LiveRainfall } from './openMeteo';

/**
 * Reconnaissance assessment for any Indian district.
 *
 * The eight modelled cities carry surveyed drainage networks, ward
 * demographics and per-street thresholds. Nothing like that exists for the
 * other ~780 districts, and inventing it would be worse than useless.
 *
 * What *is* available for any coordinate, keylessly, is real terrain
 * (Open-Meteo elevation, sampled across the district) and a real rainfall
 * forecast. Those two support a genuine but coarse first-pass read: how much
 * water is coming, and how well the land sheds it.
 *
 * The output is deliberately typed apart from ZoneRiskAssessment so it can
 * never be mistaken for the modelled product, and it reports its own limits.
 */

export interface DistrictReconnaissance {
  name: string;
  context: string;
  center: [number, number];
  /** Sampled elevations across the district, metres. */
  elevations: number[];
  minElevationM: number;
  meanElevationM: number;
  /** Spread between the lowest and mean sample: flat basins pond, slopes drain. */
  reliefM: number;
  rainfall: LiveRainfall;
  /** 0-100, hazard only. Not a VRI - there is no demographic input. */
  hazardScore: number;
  band: RiskLevel;
  /** Estimated hours until the peak hourly intensity arrives. */
  hoursToPeak: number;
  /** Plain-language statement of what this number does and does not include. */
  caveat: string;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

function bandFor(score: number): RiskLevel {
  if (score >= 80) return 'critical';
  if (score >= 65) return 'severe';
  if (score >= 45) return 'high';
  if (score >= 25) return 'moderate';
  return 'low';
}

/**
 * Samples a bounding box on a grid, so elevation reflects the district rather
 * than one point. Nine points is enough to separate a flat delta from a
 * hill-ringed basin without hammering the API.
 */
export function sampleGrid(
  bbox: [number, number, number, number],
  steps = 3
): [number, number][] {
  const [south, north, west, east] = bbox;
  const pts: [number, number][] = [];
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      pts.push([
        south + ((north - south) * (i + 0.5)) / steps,
        west + ((east - west) * (j + 0.5)) / steps,
      ]);
    }
  }
  return pts;
}

export function assessDistrict(input: {
  name: string;
  context: string;
  center: [number, number];
  elevations: number[];
  rainfall: LiveRainfall;
}): DistrictReconnaissance {
  const { elevations, rainfall } = input;
  const valid = elevations.filter((e) => Number.isFinite(e));
  const minElevationM = valid.length ? Math.min(...valid) : 0;
  const meanElevationM = valid.length
    ? valid.reduce((a, b) => a + b, 0) / valid.length
    : 0;
  const reliefM = Math.max(0, meanElevationM - minElevationM);

  // Rainfall load: peak hourly intensity matters more than the total, because
  // urban drainage is designed against an intensity, not a volume.
  const intensityScore = clamp((rainfall.peak24hMmHr / 60) * 100);
  const volumeScore = clamp((rainfall.total24hMm / 200) * 100);

  // Terrain: low ground floods, and flat low ground floods longest. Coastal
  // and deltaic districts sit near zero, so this term dominates there.
  const lowlandScore = clamp(100 - (minElevationM / 120) * 100);
  // Almost no relief means water has nowhere to run off to.
  const flatnessScore = clamp(100 - (reliefM / 60) * 100);

  const hazardScore = Math.round(
    clamp(
      intensityScore * 0.38 +
        volumeScore * 0.22 +
        lowlandScore * 0.25 +
        flatnessScore * 0.15
    )
  );

  return {
    name: input.name,
    context: input.context,
    center: input.center,
    elevations: valid,
    minElevationM: Math.round(minElevationM),
    meanElevationM: Math.round(meanElevationM),
    reliefM: Math.round(reliefM),
    rainfall,
    hazardScore,
    band: bandFor(hazardScore),
    hoursToPeak: rainfall.hoursToPeak,
    caveat:
      'Reconnaissance estimate from live rainfall and sampled terrain only. ' +
      'It carries no drainage network, ward demographics or street thresholds, ' +
      'so it is not comparable to the modelled cities and must not be used for ' +
      'dispatch decisions.',
  };
}
