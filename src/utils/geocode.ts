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
}

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
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
  });

  const res = await fetch(`${ENDPOINT}?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);

  const raw = (await res.json()) as any[];
  const results: PlaceResult[] = raw.map((r) => ({
    id: String(r.place_id),
    name: r.name || String(r.display_name).split(',')[0],
    context: tidyContext(r.display_name),
    lat: Number(r.lat),
    lon: Number(r.lon),
    zoom: zoomForRank(Number(r.place_rank ?? 16), r.type),
    kind: r.type || r.category || 'place',
  }));

  cache.set(q.toLowerCase(), results);
  return results;
}
