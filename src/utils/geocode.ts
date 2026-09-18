/**
 * Place search across India, via Nominatim (OpenStreetMap).
 *
 * Free and keyless, which is why it is here: the modelled wards only cover
 * three cities, but the map itself should reach any district, town or street
 * in the country the way a general-purpose map does.
 *
 * Nominatim's usage policy asks for at most one request per second and no
 * bulk querying, so every call is debounced and the query is bounded to
 * India. Results are cached for the session to avoid repeat lookups.
 */

export interface PlaceResult {
  id: string;
  name: string;
  context: string;
  lat: number;
  lon: number;
  /** Suggested zoom, derived from how large the place is. */
  zoom: number;
  kind: string;
  /** [south, north, west, east] - used to sample terrain across the area. */
  bbox?: [number, number, number, number];
  /** True when the result is large enough to be worth a terrain read. */
  isArea: boolean;
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
/** left,top,right,bottom - Nominatim's order, not GeoJSON's. */
const TN_VIEWBOX = '75.8,13.8,80.7,7.6';

const cache = new Map<string, PlaceResult[]>();

/**
 * Nominatim's place_rank runs 0 (continent) to 30 (building). Map it onto a
 * zoom that frames the result rather than dropping the user on a rooftop.
 */
function zoomForRank(rank: number, kind: string): number {
  if (kind === 'state') return 7;
  if (rank <= 8) return 6; // state / large region
  if (rank <= 12) return 9; // district
  if (rank <= 16) return 12; // city / town
  if (rank <= 19) return 14; // suburb / ward
  if (rank <= 25) return 16; // neighbourhood / road
  return 17; // address-level
}

function tidyContext(displayName: string): string {
  // "Velachery, Chennai, Tamil Nadu, 600042, India" -> "Chennai, Tamil Nadu"
  const parts = displayName
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/^\d{6}$/.test(p) && p !== 'India');
  return parts.slice(1, 3).join(', ');
}

export async function searchPlaces(
  query: string,
  signal?: AbortSignal
): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const cached = cache.get(q.toLowerCase());
  if (cached) return cached;

  const params = new URLSearchParams({
    q,
    countrycodes: 'in',
    format: 'jsonv2',
    limit: '6',
    addressdetails: '0',
    // Scoped to Tamil Nadu. `bounded` makes the viewbox a filter rather than
    // a preference, so searching "Salem" returns the Tamil Nadu district and
    // not the one in Oregon or the several elsewhere in India.
    viewbox: TN_VIEWBOX,
    bounded: '1',
  });

  const res = await fetch(`${ENDPOINT}?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);

  const raw = (await res.json()) as any[];
  const results: PlaceResult[] = raw.map((r) => {
    const bb = (r.boundingbox ?? []).map(Number);
    const rank = Number(r.place_rank ?? 16);
    return {
      id: String(r.place_id),
      name: r.name || String(r.display_name).split(',')[0],
      context: tidyContext(r.display_name),
      lat: Number(r.lat),
      lon: Number(r.lon),
      zoom: zoomForRank(rank, r.type),
      kind: r.type || r.category || 'place',
      bbox: bb.length === 4 ? ([bb[0], bb[1], bb[2], bb[3]] as [number, number, number, number]) : undefined,
      // Districts, cities and taluks are worth a terrain read; a single
      // building or road is not.
      isArea: rank <= 18 && bb.length === 4 && Math.abs(bb[1] - bb[0]) > 0.02,
    };
  });

  cache.set(q.toLowerCase(), results);
  return results;
}

/**
 * The administrative boundary for one place, fetched only when the user asks
 * for it. A national district dataset is 4-34MB; this is ~80KB for the single
 * district in question, which is why nothing is bundled.
 */
export async function fetchBoundary(
  placeId: string,
  query: string,
  signal?: AbortSignal
): Promise<[number, number][][] | null> {
  const params = new URLSearchParams({
    q: query,
    countrycodes: 'in',
    format: 'jsonv2',
    polygon_geojson: '1',
    limit: '1',
    viewbox: TN_VIEWBOX,
    bounded: '1',
  });
  const res = await fetch(`${ENDPOINT}?${params}`, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) return null;

  const raw = (await res.json()) as any[];
  const geo = raw[0]?.geojson;
  if (!geo) return null;

  // Leaflet wants [lat, lng]; GeoJSON gives [lng, lat].
  const flip = (ring: number[][]) => ring.map(([x, y]) => [y, x] as [number, number]);

  if (geo.type === 'Polygon') return (geo.coordinates as number[][][]).map(flip);
  if (geo.type === 'MultiPolygon')
    return (geo.coordinates as number[][][][]).flatMap((poly) => poly.map(flip));
  return null;
}
