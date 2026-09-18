import {
  TN_DISASTERS,
  TN_DISTRICT_CENTROIDS,
  TN_DISTRICT_FLOOD_COUNTS,
  TN_MAX_FLOOD_COUNT,
  TnDisasterEvent,
} from '../data/tnDisasterHistory';

/**
 * What the Tamil Nadu disaster record can say about a coordinate.
 *
 * The record is 27 events over ten years. That is a great deal of context and
 * almost no statistics, so the line this module holds is strict: it reports
 * what happened and how often, and it never feeds a number into the depth
 * model. The physics answers "how deep"; this answers "has this place been
 * hit before, and what did it cost when it was".
 *
 * The temptation is to weight the forecast by how often a district floods.
 * Eleven flood and cyclone events cannot calibrate a coefficient, and a
 * district's count is driven as much by how many events were *recorded* as by
 * how exposed it is - Chennai is the most reported place in Tamil Nadu for
 * reasons that include it being Chennai. So exposure is shown beside the
 * prediction, never multiplied into it.
 */

export interface DistrictHistory {
  /** Nearest district by centroid, not a point-in-polygon result. */
  district: string;
  distanceKm: number;
  /** Recorded flood and cyclone events naming this district. */
  floodEvents: TnDisasterEvent[];
  /** Every recorded event, including non-hydro incidents. */
  allEvents: TnDisasterEvent[];
  floodCount: number;
  /** 0-1, this district's flood count against the worst in the state. */
  exposureRatio: number;
  /** Deaths summed across the flood and cyclone events, where recorded. */
  floodDeaths: number;
  /** Most recent flood or cyclone event, if any. */
  latest: TnDisasterEvent | null;
}

const R = 6371;

function haversineKm(a: [number, number], b: [number, number]): number {
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const la1 = (a[0] * Math.PI) / 180;
  const la2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nearest Tamil Nadu district centre to a coordinate. */
export function nearestDistrict(
  lat: number,
  lon: number
): { district: string; distanceKm: number } | null {
  let best: { district: string; distanceKm: number } | null = null;
  for (const [district, center] of Object.entries(TN_DISTRICT_CENTROIDS)) {
    const distanceKm = haversineKm([lat, lon], center);
    if (!best || distanceKm < best.distanceKm) {
      best = { district, distanceKm: Number(distanceKm.toFixed(1)) };
    }
  }
  return best;
}

/**
 * The recorded history for whichever district a coordinate falls nearest to.
 *
 * Returns null well outside Tamil Nadu rather than attaching Kanniyakumari's
 * record to a point in Kerala: a centroid is always *some* nearest district,
 * so without a cutoff this would answer confidently for the whole subcontinent.
 */
export function historyForPoint(
  lat: number,
  lon: number,
  maxDistanceKm = 120
): DistrictHistory | null {
  const near = nearestDistrict(lat, lon);
  if (!near || near.distanceKm > maxDistanceKm) return null;

  const allEvents = TN_DISASTERS.filter((e) => e.districts.includes(near.district));
  const floodEvents = allEvents.filter(
    (e) => e.hazard === 'flood' || e.hazard === 'cyclone'
  );

  return {
    district: near.district,
    distanceKm: near.distanceKm,
    floodEvents,
    allEvents,
    floodCount: TN_DISTRICT_FLOOD_COUNTS[near.district] ?? 0,
    exposureRatio: Math.min(
      1,
      (TN_DISTRICT_FLOOD_COUNTS[near.district] ?? 0) / Math.max(1, TN_MAX_FLOOD_COUNT)
    ),
    floodDeaths: floodEvents.reduce((sum, e) => sum + (e.deaths ?? 0), 0),
    latest:
      [...floodEvents].sort((a, b) => b.year - a.year)[0] ?? null,
  };
}

/**
 * Named events to anchor the rainfall scale.
 *
 * Only one event in the record carries a published rainfall figure, so this
 * deliberately returns very little. A scale marked with events whose rainfall
 * was never measured would be inventing the very number it claims to anchor.
 */
export const RAINFALL_ANCHORS = TN_DISASTERS.filter(
  (e) => e.rainfallMm !== null && e.isHydro
).map((e) => ({ name: e.name, year: e.year, mm: e.rainfallMm as number }));

/** Every recorded event, newest first, for a state-level history view. */
export function allEventsNewestFirst(): TnDisasterEvent[] {
  return [...TN_DISASTERS].sort((a, b) => b.year - a.year || (a.date < b.date ? 1 : -1));
}
