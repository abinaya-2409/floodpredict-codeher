/**
 * National district impact model.
 *
 * The ward model answers "how deep, on which street". This answers a
 * different question at a different scale: if a flood event originates here,
 * which of India's 641 districts are affected and in what order.
 *
 * It is a distance-decay model, not hydrology. A real answer would need
 * basin topology and river networks for the whole country, and pretending
 * otherwise would be dishonest - so the output is framed as an impact
 * footprint, and selecting a district hands off to the reconnaissance read,
 * which does use real terrain and rainfall for that one place.
 */

export interface DistrictFeatureProps {
  id: string;
  district: string;
  state: string;
}

export interface DistrictImpact {
  id: string;
  district: string;
  state: string;
  center: [number, number];
  distanceKm: number;
  /** 0-100. Zero means outside the footprint entirely. */
  score: number;
  band: 'low' | 'moderate' | 'high' | 'severe' | 'critical';
}

/** Severity presets. Radius is where the footprint falls to zero. */
export interface SeverityLevel {
  level: 1 | 2 | 3 | 4;
  label: string;
  summary: string;
  detail: string;
  /** Kilometres from the epicentre at which impact reaches zero. */
  radiusKm: number;
  /** Multiplier on the score inside that radius. */
  amplification: number;
}

export const SEVERITY_LEVELS: SeverityLevel[] = [
  {
    level: 1,
    label: 'Marginal',
    summary: 'Isolated, localised flash flooding',
    detail:
      'Short-duration surface flooding in poorly drained pockets. Rivers stay within banks.',
    radiusKm: 120,
    amplification: 0.7,
  },
  {
    level: 2,
    label: 'Slight',
    summary: 'Scattered urban and stream flooding',
    detail:
      'Urban drainage exceeded in several wards; smaller streams overtop. Roads passable between events.',
    radiusKm: 220,
    amplification: 0.9,
  },
  {
    level: 3,
    label: 'Moderate',
    summary: 'Heavy rain and riverine inundation',
    detail:
      'Numerous significant flash-flooding events impacting larger streams and rivers. Sustained road closures likely.',
    radiusKm: 340,
    amplification: 1.15,
  },
  {
    level: 4,
    label: 'High',
    summary: 'Widespread, extreme and life-threatening',
    detail:
      'Basin-scale inundation with evacuation required across multiple districts. Assume road and rail severance.',
    radiusKm: 480,
    amplification: 1.45,
  },
];

const R = 6371;

export function haversineKm(a: [number, number], b: [number, number]): number {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const la1 = (a[0] * Math.PI) / 180;
  const la2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bandFor(score: number): DistrictImpact['band'] {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'severe';
  if (score >= 40) return 'high';
  if (score >= 20) return 'moderate';
  return 'low';
}

/**
 * Centroid of a polygon ring set, by vertex average.
 *
 * Good enough for a distance ranking and far cheaper than a true area
 * centroid across 641 multipolygons - this runs on every epicentre move.
 */
export function centroidOf(geometry: {
  type: string;
  coordinates: unknown;
}): [number, number] {
  let sx = 0;
  let sy = 0;
  let n = 0;

  const walk = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      sx += c[0] as number;
      sy += c[1] as number;
      n += 1;
      return;
    }
    if (Array.isArray(c)) c.forEach(walk);
  };
  walk(geometry.coordinates);

  return n ? [sy / n, sx / n] : [0, 0];
}

/**
 * Scores every district against an epicentre.
 *
 * Decay is quadratic rather than linear: the difference between 20km and
 * 60km from an event matters far more than between 300km and 340km, and a
 * linear ramp flattens exactly the part a responder cares about.
 */
export function scoreDistricts(
  districts: { props: DistrictFeatureProps; center: [number, number] }[],
  epicentre: [number, number],
  severity: SeverityLevel
): DistrictImpact[] {
  const out: DistrictImpact[] = [];

  for (const d of districts) {
    const distanceKm = haversineKm(epicentre, d.center);
    if (distanceKm > severity.radiusKm) continue;

    const proximity = 1 - distanceKm / severity.radiusKm;
    const score = Math.round(
      Math.min(100, Math.max(0, proximity * proximity * 100 * severity.amplification))
    );
    if (score <= 0) continue;

    out.push({
      id: d.props.id,
      district: d.props.district,
      state: d.props.state,
      center: d.center,
      distanceKm: Number(distanceKm.toFixed(1)),
      score,
      band: bandFor(score),
    });
  }

  return out.sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm);
}

/** Filter thresholds offered in the UI. */
export const SCORE_FILTERS = [
  { id: 'all', label: 'All', min: 1 },
  { id: 'low', label: 'Low 20+', min: 20 },
  { id: 'mod', label: 'Mod 40+', min: 40 },
  { id: 'high', label: 'High 60+', min: 60 },
  { id: 'crit', label: 'Crit 80+', min: 80 },
] as const;
