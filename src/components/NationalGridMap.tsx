import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MapLibreMap, GeoJSONSource } from 'maplibre-gl';
import { Crosshair, Layers, Box, Loader2, Search, MapPin, AlertTriangle } from 'lucide-react';
import {
  DistrictFeatureProps,
  DistrictImpact,
  SCORE_FILTERS,
  SEVERITY_LEVELS,
  SeverityLevel,
  centroidOf,
  scoreDistricts,
} from '../utils/nationalModel';
import { useThemeTokens } from '../theme/useThemeTokens';
import { trackMapMotion } from '../utils/mapMotion';

/**
 * Tamil Nadu district view.
 *
 * Draws Tamil Nadu's 32 districts from a state-only extract. It used to pull
 * the full 641-district national file and filter in the browser, which meant
 * downloading 1.2MB and parsing every district from Kashmir to the Andamans
 * to draw 32 of them - and on a slow machine the map sat on "Loading" for the
 * best part of a minute. The extract is 64KB.
 *
 * MapLibre rather than Leaflet, because district polygons repainted on
 * every epicentre move is a GPU job: Leaflet would put every SVG path in the
 * DOM and restyle them one at a time. Here the geometry is uploaded once and
 * only a per-feature score changes, which is what makes dragging the
 * epicentre feel immediate.
 *
 * Both the library and the boundary data load only when this tab is opened -
 * roughly 230KB of MapLibre and 405KB of districts, which has no business
 * sitting on the critical path of the ward map.
 */

const STYLES = [
  { id: 'dark', label: 'Dark', url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json' },
  { id: 'detailed', label: 'Detailed', url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json' },
  { id: 'light', label: 'Light', url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json' },
] as const;

/**
 * The basemap the view opens on.
 *
 * It was always Dark Matter, which under the light theme put a black map in
 * the middle of a white page - the single most jarring thing in the light
 * build. Read once at mount; switching afterwards is the user's to do.
 */
function defaultStyleId(): (typeof STYLES)[number]['id'] {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/** Lon, lat - MapLibre's order. */
const TN_CENTRE: [number, number] = [78.3, 10.9];
/** [west, south, east, north], padded. */
const TN_MAX_BOUNDS: [number, number, number, number] = [75.3, 7.2, 81.2, 14.2];

interface LoadedDistrict {
  props: DistrictFeatureProps;
  center: [number, number];
}

export function NationalGridMap({
  onInspectDistrict,
}: {
  /** Hands a district to the reconnaissance read, which uses real data. */
  onInspectDistrict?: (d: DistrictImpact) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const geojsonRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const maskRef = useRef<GeoJSON.Feature | null>(null);
  const tokens = useThemeTokens();

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [districts, setDistricts] = useState<LoadedDistrict[]>([]);
  /**
   * Opens on the Coromandel coast near Mahabalipuram.
   *
   * The previous default sat in the Bihar plains, which scored zero districts
   * the moment the grid was filtered to Tamil Nadu - the map loaded with an
   * empty impact list and nothing to say. This is where cyclones in this
   * record actually make landfall.
   */
  const [epicentre, setEpicentre] = useState<[number, number]>([12.6, 80.19]);
  const [severity, setSeverity] = useState<SeverityLevel>(SEVERITY_LEVELS[2]);
  const [styleId, setStyleId] = useState<(typeof STYLES)[number]['id']>(defaultStyleId);
  const [placing, setPlacing] = useState(false);
  const [three, setThree] = useState(false);
  const [filter, setFilter] = useState<(typeof SCORE_FILTERS)[number]['id']>('all');
  const [query, setQuery] = useState('');

  const impacts = useMemo(
    () => scoreDistricts(districts, epicentre, severity),
    [districts, epicentre, severity]
  );

  const visible = useMemo(() => {
    const min = SCORE_FILTERS.find((f) => f.id === filter)?.min ?? 1;
    const q = query.trim().toLowerCase();
    return impacts.filter(
      (i) =>
        i.score >= min &&
        (!q || i.district.toLowerCase().includes(q) || i.state.toLowerCase().includes(q))
    );
  }, [impacts, filter, query]);

  /* ---------------------------------------------------------------- setup */

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let untrack: (() => void) | null = null;

    (async () => {
      try {
        const [{ default: maplibregl }, res] = await Promise.all([
          import('maplibre-gl'),
          fetch('/data/tn-districts.json'),
        ]);
        if (!res.ok) throw new Error(`District boundaries unavailable (${res.status})`);
        const geo = (await res.json()) as GeoJSON.FeatureCollection;
        if (cancelled || !hostRef.current) return;

        geojsonRef.current = geo;

        // One polygon covering the region with the state punched out of it.
        try {
          const oRes = await fetch('/data/tamil-nadu-outline.json');
          if (oRes.ok) {
            const outline = (await oRes.json()) as {
              geometry: { type: string; coordinates: number[][][] | number[][][][] };
            };
            const parts =
              outline.geometry.type === 'MultiPolygon'
                ? (outline.geometry.coordinates as number[][][][])
                : [outline.geometry.coordinates as number[][][]];
            maskRef.current = {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [40, -20],
                    [130, -20],
                    [130, 50],
                    [40, 50],
                    [40, -20],
                  ],
                  ...parts.map((poly) => poly[0]),
                ],
              },
            } as GeoJSON.Feature;
          }
        } catch {
          // The grid is still usable unmasked; it just shows its neighbours.
        }
        setDistricts(
          geo.features.map((f) => ({
            props: f.properties as unknown as DistrictFeatureProps,
            center: centroidOf(f.geometry as never),
          }))
        );

        map = new maplibregl.Map({
          container: hostRef.current,
          style: STYLES.find((s) => s.id === styleId)!.url,
          center: TN_CENTRE,
          zoom: 5.9,
          maxZoom: 12,
          minZoom: 5.2,
          maxBounds: TN_MAX_BOUNDS,
          attributionControl: { compact: true },
        });
        // Top-right: the severity panel owns the top-left corner.
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
        mapRef.current = map;

        // Tells the ambient background to stand down while this map is
        // moving. MapLibre names these events the same as Leaflet does.
        untrack = trackMapMotion(
          (e, h) => map!.on(e as never, h),
          (e, h) => map!.off(e as never, h)
        );

        const activate = () => {
          if (cancelled || !map) return;
          try {
            addLayers(map, geo);
            setReady(true);
          } catch (err) {
            setLoadError((err as Error)?.message ?? 'Could not draw district layers');
          }
        };

        // 'load' is the happy path, but it only fires after the first render,
        // which software WebGL can make very late. 'styledata' is enough to
        // add sources against, so whichever arrives first wins.
        if (map.isStyleLoaded()) activate();
        else {
          map.once('load', activate);
          map.once('styledata', activate);
        }
      } catch (err) {
        if (!cancelled) setLoadError((err as Error)?.message ?? 'Could not load the national grid');
      }
    })();

    return () => {
      cancelled = true;
      untrack?.();
      map?.remove();
      mapRef.current = null;
    };
    // Style changes are handled separately; re-creating the map would refetch
    // 405KB of boundaries for a cosmetic change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLayers = (map: MapLibreMap, geo: GeoJSON.FeatureCollection) => {
    // setStyle discards layers but this can also be reached on a re-render,
    // and adding an existing source throws.
    if (map.getSource('districts')) return;

    /**
     * Mask everything outside the state, below the district layers.
     *
     * The basemap is a world style, so without this the grid sits in the
     * middle of Kerala, Andhra Pradesh and Sri Lanka - which the app holds no
     * data for and cannot say anything about. Same outline file as the
     * inundation map, so the two views agree on where Tamil Nadu ends.
     */
    if (maskRef.current) {
      map.addSource('tn-mask', { type: 'geojson', data: maskRef.current });
      map.addLayer({
        id: 'tn-mask-fill',
        type: 'fill',
        source: 'tn-mask',
        // Not the page colour: the surround is a map surface, and reading
        // it as the interface's own background made the state look like a
        // hole cut in the panel rather than a coastline.
        paint: { 'fill-color': tokens.mapSurround, 'fill-opacity': 1 },
      });
    }

    map.addSource('districts', { type: 'geojson', data: geo, generateId: true });

    // Fill colour is driven by a feature-state score, so re-scoring never
    // touches the geometry the GPU already holds.
    map.addLayer({
      id: 'district-fill',
      type: 'fill',
      source: 'districts',
      paint: {
        'fill-color': [
          'interpolate',
          ['linear'],
          ['coalesce', ['feature-state', 'score'], 0],
          0, 'rgba(0,0,0,0)',
          20, tokens.risk.low,
          40, tokens.risk.moderate,
          60, tokens.risk.high,
          80, tokens.risk.severe,
          100, tokens.risk.critical,
        ],
        'fill-opacity': [
          'case',
          ['>', ['coalesce', ['feature-state', 'score'], 0], 0],
          0.72,
          0.04,
        ],
      },
    });

    map.addLayer({
      id: 'district-line',
      type: 'line',
      source: 'districts',
      paint: {
        'line-color': tokens.line,
        'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 1.6, 0.35],
        'line-opacity': 0.8,
      },
    });

    map.addLayer({
      id: 'district-extrude',
      type: 'fill-extrusion',
      source: 'districts',
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          ['coalesce', ['feature-state', 'score'], 0],
          0, 'rgba(0,0,0,0)',
          40, tokens.risk.moderate,
          70, tokens.risk.severe,
          100, tokens.risk.critical,
        ],
        // Height reads as severity, so the worst districts stand up.
        'fill-extrusion-height': [
          '*',
          ['coalesce', ['feature-state', 'score'], 0],
          900,
        ],
        'fill-extrusion-opacity': 0.85,
      },
    });
  };

  /* ------------------------------------------------- score -> feature state */

  useEffect(() => {
    const map = mapRef.current;
    const geo = geojsonRef.current;
    if (!map || !ready || !geo) return;

    const byId = new Map(impacts.map((i) => [i.id, i.score]));
    geo.features.forEach((f, idx) => {
      const id = (f.properties as unknown as DistrictFeatureProps).id;
      map.setFeatureState(
        { source: 'districts', id: idx },
        { score: byId.get(id) ?? 0 }
      );
    });
  }, [impacts, ready]);

  /* ----------------------------------------------------- epicentre marker */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const data: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [epicentre[1], epicentre[0]] },
        },
      ],
    };

    const src = map.getSource('epicentre') as GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
      return;
    }

    map.addSource('epicentre', { type: 'geojson', data });
    map.addLayer({
      id: 'epicentre-halo',
      type: 'circle',
      source: 'epicentre',
      paint: {
        'circle-radius': 18,
        'circle-color': tokens.risk.critical,
        'circle-opacity': 0.18,
        'circle-stroke-width': 1,
        'circle-stroke-color': tokens.risk.critical,
      },
    });
    map.addLayer({
      id: 'epicentre-dot',
      type: 'circle',
      source: 'epicentre',
      paint: {
        'circle-radius': 5,
        'circle-color': tokens.risk.critical,
        'circle-stroke-width': 2,
        'circle-stroke-color': tokens.mapCanvas,
      },
    });
  }, [epicentre, ready, tokens]);

  /* ------------------------------------------------------------ click-to-place */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (!placing) return;
      setEpicentre([e.lngLat.lat, e.lngLat.lng]);
      setPlacing(false);
    };
    map.on('click', onClick);
    map.getCanvas().style.cursor = placing ? 'crosshair' : '';
    return () => {
      map.off('click', onClick);
    };
  }, [placing, ready]);

  /* ---------------------------------------------------- repaint on theme */

  /**
   * MapLibre paint properties are values, not references: the ramp handed to
   * `addLayers` is the one the GPU keeps. Without this a theme switch left
   * the district grid painted in the other theme's colours - which on the
   * OLED side meant near-black districts on a near-black map.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const ramp = (stops: [number, string][]) => [
      'interpolate',
      ['linear'],
      ['coalesce', ['feature-state', 'score'], 0],
      0, 'rgba(0,0,0,0)',
      ...stops.flat(),
    ];

    try {
      if (map.getLayer('tn-mask-fill')) {
        map.setPaintProperty('tn-mask-fill', 'fill-color', tokens.mapSurround);
      }
      if (map.getLayer('district-fill')) {
        map.setPaintProperty('district-fill', 'fill-color', ramp([
          [20, tokens.risk.low], [40, tokens.risk.moderate], [60, tokens.risk.high],
          [80, tokens.risk.severe], [100, tokens.risk.critical],
        ]) as never);
      }
      if (map.getLayer('district-line')) {
        map.setPaintProperty('district-line', 'line-color', tokens.line);
      }
      if (map.getLayer('district-extrude')) {
        map.setPaintProperty('district-extrude', 'fill-extrusion-color', ramp([
          [40, tokens.risk.moderate], [70, tokens.risk.severe], [100, tokens.risk.critical],
        ]) as never);
      }
    } catch {
      // A style swap can land between the guard and the set; the next render
      // repaints anyway.
    }
  }, [tokens, ready]);

  /* ------------------------------------------------------------- 3D toggle */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty('district-extrude', 'visibility', three ? 'visible' : 'none');
    map.setLayoutProperty('district-fill', 'visibility', three ? 'none' : 'visible');
    map.easeTo({ pitch: three ? 50 : 0, bearing: three ? -18 : 0, duration: 700 });
  }, [three, ready]);

  /* -------------------------------------------------------- style switching */

  const changeStyle = useCallback(
    (id: (typeof STYLES)[number]['id']) => {
      const map = mapRef.current;
      const geo = geojsonRef.current;
      if (!map || !geo) return;
      setStyleId(id);
      setReady(false);
      map.setStyle(STYLES.find((s) => s.id === id)!.url);
      // setStyle discards custom sources and layers, so they are re-added
      // once the new style has settled.
      map.once('styledata', () => {
        if (!map.getSource('districts')) addLayers(map, geo);
        setReady(true);
      });
    },
    [] // addLayers closes over tokens, which are stable for the session
  );

  const flyToDistrict = (d: DistrictImpact) => {
    mapRef.current?.flyTo({ center: [d.center[1], d.center[0]], zoom: 7.5, duration: 900 });
    onInspectDistrict?.(d);
  };

  /* ------------------------------------------------------------------ view */

  if (loadError) {
    return (
      <div className="glass rounded-panel p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-warning" aria-hidden="true" />
        <p className="text-xs text-fg-soft">{loadError}</p>
        <p className="mt-1 text-micro text-subtle">
          The ward-level map on the other tabs is unaffected.
        </p>
      </div>
    );
  }

  return (
    <div className="glass overflow-hidden rounded-panel" id="national-grid-map">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-bg/70 p-3">
        <button
          onClick={() => setPlacing((v) => !v)}
          aria-pressed={placing}
          className={`inline-flex h-8 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-colors cursor-pointer ${
            placing
              ? 'border-risk-critical bg-risk-critical/20 text-risk-critical-ink'
              : 'border-line bg-surface-2 text-fg-soft hover:bg-surface-3 hover:text-fg'
          }`}
        >
          <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
          {placing ? 'Click the map to place' : 'Move flood origin'}
        </button>

        <div
          role="radiogroup"
          aria-label="Base map style"
          className="flex items-center gap-0.5 rounded-full border border-line bg-surface-2/70 p-0.5"
        >
          {STYLES.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={styleId === s.id}
              onClick={() => changeStyle(s.id)}
              className={`h-7 rounded-full px-2.5 text-mini font-semibold transition-colors cursor-pointer ${
                styleId === s.id
                  ? 'bg-accent text-on-accent'
                  : 'text-muted hover:bg-surface-3 hover:text-fg'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setThree((v) => !v)}
          aria-pressed={three}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors cursor-pointer ${
            three
              ? 'border-accent bg-accent/18 text-accent'
              : 'border-line bg-surface-2 text-muted hover:text-fg'
          }`}
        >
          <Box className="h-3.5 w-3.5" aria-hidden="true" />
          3D
        </button>

        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-micro text-subtle">
          <Layers className="h-3 w-3" aria-hidden="true" />
          {districts.length} districts
        </span>
      </div>

      <div className="grid lg:grid-cols-[1fr_20rem]">
        {/* Map */}
        <div className="relative h-[clamp(26rem,62vh,44rem)] bg-bg-deep">
          <div ref={hostRef} className="h-full w-full" />

          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg-deep/80">
              <span className="inline-flex items-center gap-2 text-xs text-muted">
                <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
                Loading Tamil Nadu district boundaries...
              </span>
            </div>
          )}

          {/* Severity picker */}
          <div className="absolute left-3 top-3 z-10 w-60 max-w-[calc(100%-1.5rem)]">
            <div className="rounded-card border border-line-strong/50 bg-surface/95 p-3 shadow-xl backdrop-blur-md">
              <p className="mb-2 font-mono text-micro uppercase tracking-[0.14em] text-subtle">
                Event severity
              </p>
              <div className="space-y-1">
                {SEVERITY_LEVELS.map((s) => {
                  const active = severity.level === s.level;
                  return (
                    <button
                      key={s.level}
                      onClick={() => setSeverity(s)}
                      aria-pressed={active}
                      className={`w-full rounded-control border px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-accent/50 bg-accent/12'
                          : 'border-transparent hover:bg-surface-2'
                      }`}
                    >
                      <span
                        className={`block text-mini font-bold ${active ? 'text-accent' : 'text-fg-soft'}`}
                      >
                        Level {s.level} &middot; {s.label}
                      </span>
                      <span className="block text-micro leading-snug text-subtle">
                        {s.summary}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 border-t border-line pt-2 text-micro leading-snug text-subtle">
                {severity.detail}
              </p>
            </div>
          </div>
        </div>

        {/* Impact list */}
        <aside className="flex max-h-[clamp(26rem,62vh,44rem)] flex-col border-t border-line lg:border-l lg:border-t-0">
          <div className="border-b border-line p-3">
            <h3 className="flex items-center gap-2 font-display text-sm font-bold text-fg">
              <AlertTriangle className="h-4 w-4 text-accent" aria-hidden="true" />
              Impact zones ({impacts.length})
            </h3>

            <div className="relative mt-2">
              <Search
                className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-subtle"
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search affected district or state"
                placeholder="Search district or state..."
                className="h-8 w-full rounded-full border border-line bg-surface-2 pl-8 pr-3 text-mini text-fg placeholder:text-subtle focus:border-accent/60 focus:outline-none"
              />
            </div>

            <div
              role="radiogroup"
              aria-label="Minimum impact score"
              className="mt-2 flex flex-wrap gap-1"
            >
              {SCORE_FILTERS.map((f) => (
                <button
                  key={f.id}
                  role="radio"
                  aria-checked={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`rounded-full border px-2 py-0.5 text-micro font-semibold transition-colors cursor-pointer ${
                    filter === f.id
                      ? 'border-accent/50 bg-accent/15 text-accent'
                      : 'border-line text-muted hover:text-fg'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <ol className="min-h-0 flex-1 overflow-y-auto p-2">
            {visible.length === 0 && (
              <li className="px-2 py-4 text-center text-micro text-subtle">
                No districts match. Move the flood origin or lower the filter.
              </li>
            )}
            {visible.slice(0, 120).map((d, i) => (
              <li key={d.id}>
                <button
                  onClick={() => flyToDistrict(d)}
                  className="flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-surface-2 cursor-pointer"
                >
                  <span className="w-5 shrink-0 text-right font-mono text-micro text-subtle">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-mini font-semibold text-fg">
                      {d.district}
                    </span>
                    <span className="block truncate text-micro text-subtle">
                      {d.state} &middot; {d.distanceKm} km away
                    </span>
                  </span>
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-micro font-bold"
                    style={{
                      color: `var(--color-risk-${d.band})`,
                      backgroundColor: `color-mix(in oklab, var(--color-risk-${d.band}) 16%, transparent)`,
                    }}
                  >
                    {d.score}
                  </span>
                  <MapPin className="h-3 w-3 shrink-0 text-subtle" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>

          <p className="border-t border-line p-2.5 text-micro leading-snug text-subtle">
            Distance-decay impact footprint, not a hydrological forecast. Select a district
            for a terrain and rainfall read of that place. Boundaries: Census 2011 via
            datameet (MIT).
          </p>
        </aside>
      </div>
    </div>
  );
}
