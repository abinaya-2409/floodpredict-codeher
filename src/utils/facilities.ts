/**
 * Shelter-capable facilities anywhere in India.
 *
 * The eight modelled cities ship curated relief camps. Everywhere else had
 * none, which made the shelter layer look like a Tamil Nadu feature. It is
 * not: schools, colleges, community halls and hospitals are mapped across the
 * whole country in OpenStreetMap, and those are exactly the buildings Indian
 * districts requisition as relief camps.
 *
 * This went to Overpass first, which is the natural tool for the job. It was
 * not usable in a browser: overpass.osm.ch is the one mirror that reliably
 * sends Access-Control-Allow-Origin, and it serves a Switzerland extract, so
 * it answered every Indian query with 200 and zero elements. The planet
 * mirrors (overpass-api.de, kumi.systems, private.coffee, osm.jp) were
 * variously CORS-less or simply unreachable when tested.
 *
 * Nominatim is the same OpenStreetMap data, is CORS-enabled, and is already a
 * dependency here for place search - so a bounded amenity query does the job
 * with one less service to be down.
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export type FacilityKind = 'school' | 'college' | 'community_centre' | 'hospital';

export interface Facility {
  id: string;
  name: string;
  kind: FacilityKind;
  lat: number;
  lon: number;
  /** Straight-line km from the point asked about. */
  distanceKm: number;
  /** Order-of-magnitude estimate, labelled as an estimate wherever shown. */
  estimatedCapacity: number;
}

/**
 * What a building type can plausibly hold at the Sphere standard's ~3.5 sq m
 * per person. Triage figures, not bed counts.
 */
const CAPACITY: Record<FacilityKind, number> = {
  school: 600,
  college: 1200,
  community_centre: 350,
  hospital: 200,
};

const LABEL: Record<FacilityKind, string> = {
  school: 'School',
  college: 'College',
  community_centre: 'Community hall',
  hospital: 'Hospital',
};

export const facilityLabel = (k: FacilityKind) => LABEL[k] ?? 'Facility';

/**
 * Query terms, in the order a district would actually requisition buildings.
 * Community halls first (purpose-built for assembly), hospitals last (a
 * medical resource before they are a shelter).
 */
const QUERIES: { term: string; kind: FacilityKind }[] = [
  { term: 'community centre', kind: 'community_centre' },
  { term: 'school', kind: 'school' },
  { term: 'college', kind: 'college' },
  { term: 'hospital', kind: 'hospital' },
];

function distanceKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;
  const la1 = (a[0] * Math.PI) / 180;
  const la2 = (b[0] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const cache = new Map<string, Facility[]>();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Facilities inside a bounding box, nearest to `center` first.
 *
 * Nominatim asks for at most one request per second, so the four term queries
 * are spaced rather than fired together, and the whole result is cached per
 * bounding box for the session.
 */
export async function fetchFacilities(
  bbox: [number, number, number, number],
  center: [number, number],
  limit = 24,
  signal?: AbortSignal
): Promise<Facility[]> {
  const key = bbox.map((n) => n.toFixed(3)).join(',');
  const cached = cache.get(key);
  if (cached) return cached;

  const [south, north, west, east] = bbox;
  // Nominatim's viewbox is left,top,right,bottom.
  const viewbox = `${west},${north},${east},${south}`;

  const seen = new Set<string>();
  const out: Facility[] = [];

  for (let i = 0; i < QUERIES.length; i++) {
    if (signal?.aborted) break;
    const { term, kind } = QUERIES[i];
    if (i > 0) await wait(1100);

    const params = new URLSearchParams({
      q: term,
      format: 'jsonv2',
      limit: '12',
      countrycodes: 'in',
      viewbox,
      bounded: '1',
    });

    try {
      const res = await fetch(`${ENDPOINT}?${params}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) continue;
      const raw = (await res.json()) as any[];

      for (const r of raw) {
        const lat = Number(r.lat);
        const lon = Number(r.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        // Nominatim returns the full address as display_name; the first
        // segment is the facility itself.
        const name = String(r.display_name ?? '').split(',')[0].trim();
        // A result named only "School" or "yes" carries no information a
        // resident could act on.
        if (!name || name.length < 4 || /^(yes|school|hospital|college)$/i.test(name)) continue;

        const dedupe = `${name.toLowerCase()}|${lat.toFixed(3)}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);

        out.push({
          id: String(r.place_id),
          name,
          kind,
          lat,
          lon,
          distanceKm: Number(distanceKm(center, [lat, lon]).toFixed(1)),
          estimatedCapacity: CAPACITY[kind],
        });
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      // One term failing should not lose the others.
    }
  }

  out.sort((a, b) => a.distanceKm - b.distanceKm);
  const sliced = out.slice(0, limit);
  cache.set(key, sliced);
  return sliced;
}
