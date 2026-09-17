/**
 * Shelter-capable facilities anywhere in India, from OpenStreetMap.
 *
 * The eight modelled cities ship curated relief camps. Everywhere else had
 * none, which made the shelter layer look like a Tamil Nadu feature. It is
 * not: schools, colleges, community halls and hospitals are mapped across the
 * whole country in OSM, and those are exactly the buildings Indian districts
 * requisition as relief camps.
 *
 * Overpass is free, keyless and community-run, so this queries only on demand,
 * caps the result set, and falls back across mirrors rather than retrying one.
 */

const MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

export type FacilityKind = 'school' | 'college' | 'community_centre' | 'hospital' | 'shelter';

export interface Facility {
  id: string;
  name: string;
  kind: FacilityKind;
  lat: number;
  lon: number;
  /** Straight-line km from the point asked about. */
  distanceKm: number;
  /** Rough capacity estimate, stated as an estimate wherever shown. */
  estimatedCapacity: number;
}

/**
 * Capacity a building type can plausibly hold in an emergency, at the
 * ~3.5 sq m per person Sphere minimum. These are order-of-magnitude figures
 * for triage, not bed counts.
 */
const CAPACITY: Record<FacilityKind, number> = {
  school: 600,
  college: 1200,
  community_centre: 350,
  hospital: 200,
  shelter: 500,
};

const LABEL: Record<FacilityKind, string> = {
  school: 'School',
  college: 'College',
  community_centre: 'Community hall',
  hospital: 'Hospital',
  shelter: 'Shelter',
};

export const facilityLabel = (k: FacilityKind) => LABEL[k] ?? 'Facility';

/** Haversine distance in km. */
function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const la1 = (a[0] * Math.PI) / 180;
  const la2 = (b[0] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const cache = new Map<string, Facility[]>();

/**
 * Facilities inside a bounding box, nearest to `center` first.
 *
 * `limit` is applied server-side too, because a district-sized box in a dense
 * city can contain thousands of schools and Overpass is a shared resource.
 */
export async function fetchFacilities(
  bbox: [number, number, number, number],
  center: [number, number],
  limit = 40,
  signal?: AbortSignal
): Promise<Facility[]> {
  const key = bbox.map((n) => n.toFixed(3)).join(',');
  const cached = cache.get(key);
  if (cached) return cached;

  const [south, north, west, east] = bbox;
  const box = `${south},${west},${north},${east}`;
  const filter = '["amenity"~"^(school|college|community_centre|hospital)$"]';

  const query = `[out:json][timeout:20];
(
  node${filter}(${box});
  way${filter}(${box});
);
out center ${limit * 3};`;

  let data: { elements?: any[] } | null = null;
  let lastError: unknown = null;

  for (const mirror of MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }).toString(),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      data = await res.json();
      break;
    } catch (err) {
      lastError = err;
      if ((err as Error)?.name === 'AbortError') throw err;
      // Try the next mirror rather than hammering this one.
    }
  }

  if (!data) throw lastError ?? new Error('No Overpass mirror responded');

  const seen = new Set<string>();
  const facilities: Facility[] = [];

  for (const el of data.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    const kind = el.tags?.amenity as FacilityKind | undefined;
    if (lat == null || lon == null || !kind || !(kind in CAPACITY)) continue;

    const name = el.tags?.name?.trim();
    // Unnamed points are unusable for a public shelter list.
    if (!name) continue;

    const dedupe = `${name}|${lat.toFixed(3)}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    facilities.push({
      id: `${el.type}-${el.id}`,
      name,
      kind,
      lat,
      lon,
      distanceKm: Number(distanceKm(center, [lat, lon]).toFixed(1)),
      estimatedCapacity: CAPACITY[kind],
    });
  }

  // Hospitals last among equals: they are a medical resource first and a
  // shelter only if nothing else is near.
  const rank: Record<FacilityKind, number> = {
    shelter: 0,
    community_centre: 1,
    school: 2,
    college: 2,
    hospital: 3,
  };
  facilities.sort(
    (a, b) => a.distanceKm - b.distanceKm || rank[a.kind] - rank[b.kind]
  );

  const out = facilities.slice(0, limit);
  cache.set(key, out);
  return out;
}
