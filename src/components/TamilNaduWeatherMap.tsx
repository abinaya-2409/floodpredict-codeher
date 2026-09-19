import React, { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Loader2, Maximize2, Minimize2, Pause, Play, Wind } from 'lucide-react';
import {
  FieldId,
  FIELDS,
  FIELD_META,
  WeatherGrid,
  computeFlood,
  fieldValues,
  latOf,
  loadWeatherGrid,
  lonOf,
  peakOf,
  sampleBilinear,
} from '../utils/weatherGrid';
import { fieldScale, legendTicks, paintField } from './weather/fieldRenderer';
import { WindParticles, frameProjection } from './weather/particles';
import { trackMapMotion } from '../utils/mapMotion';
import { availableBasemaps, basemapById, useThemeTokens } from '../theme/useThemeTokens';
import { ForecastMode, PointForecast, forecastPoint, recomputeForecast } from '../utils/pointForecast';
import { PointPredictionPanel } from './PointPredictionPanel';
import { SimulationParams } from '../types';
import { Select } from './ui/Select';

/**
 * Tamil Nadu, the way a weather map should work.
 *
 * Four fields over a fixed grid, animated across 48 hours: rain, wind and
 * temperature straight from the forecast, and a flood field this application
 * computes itself. The last one is the point. Every other weather map can
 * show where the rain falls; this runs each cell's rainfall through that
 * cell's own terrain and shows where the water ends up standing.
 *
 * Rendering is two canvases over the tiles. The scalar field is a 23x30
 * offscreen image blown up with smoothing, which is what buys a continuous
 * wash for the cost of 690 pixels. The wind is particles advected in
 * lat/lon, so they travel with the map rather than sliding across it.
 */

interface Props {
  simulationParams: SimulationParams;
  onUpdateParams: (p: SimulationParams) => void;
}

const HOUR_COUNT = 48;

/**
 * How many wind streaks this device should draw.
 *
 * The field is the most expensive thing on the page, and a phone holding
 * this during a flood has other work to do. A coarse pointer or a low core
 * count gets a thinner field, which still reads as wind.
 */
function particleBudget(): number {
  if (typeof window === 'undefined') return 600;
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  return coarse || weak ? 600 : 1600;
}

export const TamilNaduWeatherMap: React.FC<Props> = ({
  simulationParams,
  onUpdateParams,
}) => {
  const tokens = useThemeTokens();
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef(new WindParticles(particleBudget()));
  const rafRef = useRef<number | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const labelLayerRef = useRef<L.TileLayer | null>(null);

  const [grid, setGrid] = useState<WeatherGrid | null>(null);
  const [loadMsg, setLoadMsg] = useState('Loading grid…');
  const [error, setError] = useState<string | null>(null);

  const [field, setField] = useState<FieldId>('flood');
  const [hour, setHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showWind, setShowWind] = useState(false);
  /**
   * Rainfall multiplier for the flood layer.
   *
   * Tamil Nadu is dry for most of the year, so the flood field is correctly
   * empty most days - and an empty flagship layer is indistinguishable from a
   * broken one. This makes "what if this system were four times heavier" a
   * control rather than a thing you cannot ask, and the UI labels it as the
   * scenario it is.
   */
  const [stormFactor, setStormFactor] = useState(1);
  const [basemapId, setBasemapId] = useState('dark');
  const [expanded, setExpanded] = useState(false);

  const [prediction, setPrediction] = useState<PointForecast | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [simHour, setSimHour] = useState(0);
  const [simPlaying, setSimPlaying] = useState(false);
  const [forecastMode, setForecastMode] = useState<ForecastMode>('live');
  const predictAbortRef = useRef<AbortController | null>(null);

  /* ------------------------------------------------------------ data --- */

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const g = await loadWeatherGrid((done, total) => {
          if (!cancelled) setLoadMsg(`Fetching forecast – batch ${done} of ${total}`);
        }, controller.signal);
        if (cancelled) return;
        setGrid(g);
        particlesRef.current.setGrid(g);
      } catch (err) {
        if (cancelled || (err as Error).name === 'AbortError') return;
        console.warn('Weather grid failed:', err);
        setError(
          'Could not load the forecast grid. Open-Meteo may be unreachable; check the connection and reload.'
        );
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  /**
   * Re-runs the flood model when the scenario changes.
   *
   * Local and synchronous: 500 cells by 48 hours is 24,000 model steps, which
   * is a few milliseconds, so the map redraws on the same frame instead of
   * going back to the network for rainfall it already has.
   */
  useEffect(() => {
    setGrid((g) => {
      if (!g) return g;
      const flood = computeFlood(
        g.rain,
        g.cells,
        {
          elevationM: g.elevationM,
          sinkDepthM: g.sinkDepthM,
          slopePercent: g.slopePercent,
          drainableFraction: g.drainableFraction,
        },
        stormFactor
      );
      return { ...g, flood, peak: { ...g.peak, flood: peakOf(flood) } };
    });
  }, [stormFactor]);

  /* ------------------------------------------------------------- map --- */

  const drawField = useCallback(() => {
    const map = mapRef.current;
    const canvas = fieldCanvasRef.current;
    if (!map || !canvas || !grid) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas');
    const scale = fieldScale(grid, field);
    paintField(offscreenRef.current, grid, fieldValues(grid, field), hour, field, scale);

    // Half a cell of padding on every side: the offscreen image has one pixel
    // per grid point, and stretching it corner to corner would line the pixel
    // *edges* up with the points instead of the pixel centres.
    const half = grid.step / 2;
    const north = latOf(grid, grid.rows - 1) + half;
    const south = grid.south - half;
    const west = grid.west - half;
    const east = lonOf(grid, grid.cols - 1) + half;

    const nw = map.latLngToContainerPoint([north, west]);
    const se = map.latLngToContainerPoint([south, east]);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 0.82;
    ctx.drawImage(offscreenRef.current, nw.x, nw.y, se.x - nw.x, se.y - nw.y);
    ctx.globalAlpha = 1;
  }, [grid, field, hour]);

  /** Sizes both canvases to the viewport and pins them to the map origin. */
  const resetCanvases = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const size = map.getSize();
    const topLeft = map.containerPointToLayerPoint([0, 0]);

    for (const canvas of [fieldCanvasRef.current, particleCanvasRef.current]) {
      if (!canvas) continue;
      L.DomUtil.setPosition(canvas, topLeft);
      if (canvas.width !== size.x || canvas.height !== size.y) {
        canvas.width = size.x;
        canvas.height = size.y;
      }
    }

    const b = map.getBounds();
    particlesRef.current.setBounds({
      south: b.getSouth(),
      north: b.getNorth(),
      west: b.getWest(),
      east: b.getEast(),
    });

    drawField();
  }, [drawField]);

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;

    const map = L.map(hostRef.current, {
      center: [10.9, 78.3],
      zoom: 7,
      zoomControl: true,
      minZoom: 6,
      maxZoom: 14,
      zoomSnap: 0.5,
      wheelPxPerZoomLevel: 110,
      attributionControl: true,
    });
    mapRef.current = map;

    // Field under the place names, mask over everything, data over that.
    map.createPane('wxField').style.zIndex = '220';
    map.createPane('wxParticles').style.zIndex = '235';
    map.createPane('wxLabels').style.zIndex = '250';
    map.createPane('wxMask').style.zIndex = '300';
    for (const p of ['wxField', 'wxParticles', 'wxLabels', 'wxMask']) {
      map.getPane(p)!.style.pointerEvents = 'none';
    }

    fieldCanvasRef.current = L.DomUtil.create(
      'canvas',
      'leaflet-zoom-animated',
      map.getPane('wxField')
    ) as HTMLCanvasElement;
    particleCanvasRef.current = L.DomUtil.create(
      'canvas',
      'leaflet-zoom-animated',
      map.getPane('wxParticles')
    ) as HTMLCanvasElement;

    const tiles = basemapById(basemapId);
    baseLayerRef.current = L.tileLayer(tiles.url, {
      attribution: `${tiles.attribution} | Forecast &copy; <a href="https://open-meteo.com/">Open-Meteo</a>`,
      maxZoom: tiles.maxZoom,
      maxNativeZoom: tiles.maxNativeZoom,
      detectRetina: true,
      keepBuffer: 3,
    }).addTo(map);

    void applyMask(map);

    map.on('move zoom resize zoomend moveend', resetCanvases);

    // Tells the ambient background to stand down while this map is moving.
    const untrack = trackMapMotion(
      (e, h) => map.on(e as never, h),
      (e, h) => map.off(e as never, h)
    );

    map.on('click', (e: L.LeafletMouseEvent) => {
      const target = e.originalEvent?.target as HTMLElement | null;
      if (target?.closest?.('.leaflet-interactive, .leaflet-marker-icon, .leaflet-popup')) {
        return;
      }
      void predictAt(e.latlng.lat, e.latlng.lng);
    });

    resetCanvases();

    return () => {
      map.off('move zoom resize zoomend moveend', resetCanvases);
      untrack();
    };
    // Bound once; handlers read current state through refs and callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The state mask: one polygon over the region with Tamil Nadu cut out. */
  const applyMask = async (map: L.Map) => {
    try {
      const res = await fetch('/data/tamil-nadu-outline.json');
      if (!res.ok) return;
      const outline = (await res.json()) as {
        properties: { bbox: [number, number, number, number] };
        geometry: { type: string; coordinates: number[][][] | number[][][][] };
      };
      const parts =
        outline.geometry.type === 'MultiPolygon'
          ? (outline.geometry.coordinates as number[][][][])
          : [outline.geometry.coordinates as number[][][]];
      const holes = parts.map((poly) =>
        poly[0].map(([lng, lat]) => [lat, lng] as [number, number])
      );

      L.polygon(
        [
          [
            [-20, 40],
            [50, 40],
            [50, 130],
            [-20, 130],
          ],
          ...holes,
        ],
        {
          pane: 'wxMask',
          interactive: false,
          stroke: false,
          fillColor: tokens.bgDeep,
          fillOpacity: 1,
        }
      ).addTo(map);

      L.polygon(holes, {
        pane: 'wxMask',
        interactive: false,
        fill: false,
        color: tokens.accent,
        weight: 1,
        opacity: 0.4,
      }).addTo(map);

      const [s, w, n, e] = outline.properties.bbox;
      const bounds = L.latLngBounds([s, w], [n, e]);
      map.setMaxBounds(L.latLngBounds([s - 0.4, w - 0.4], [n + 0.4, e + 0.4]));
      map.fitBounds(bounds, { padding: [20, 20], animate: false });
      const fit = map.getBoundsZoom(bounds, false, L.point(20, 20));
      if (Number.isFinite(fit)) map.setMinZoom(Math.max(5, Math.floor(fit * 10) / 10));
    } catch {
      /* The map is still usable unmasked. */
    }
  };

  /* Basemap swap, with a labels overlay for imagery that ships without one. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const tiles = basemapById(basemapId);

    baseLayerRef.current?.remove();
    baseLayerRef.current = L.tileLayer(tiles.url, {
      attribution: `${tiles.attribution} | Forecast &copy; <a href="https://open-meteo.com/">Open-Meteo</a>`,
      maxZoom: tiles.maxZoom,
      maxNativeZoom: tiles.maxNativeZoom,
      detectRetina: true,
      keepBuffer: 3,
    }).addTo(map);
    baseLayerRef.current.bringToBack();

    labelLayerRef.current?.remove();
    labelLayerRef.current = null;
    if (tiles.labelOverlay) {
      labelLayerRef.current = L.tileLayer(tiles.labelOverlay, {
        maxZoom: tiles.maxZoom,
        maxNativeZoom: tiles.maxNativeZoom,
        detectRetina: true,
        pane: 'wxLabels',
      }).addTo(map);
    }
  }, [basemapId]);

  useEffect(() => {
    drawField();
  }, [drawField]);

  /* -------------------------------------------------------- particles --- */

  useEffect(() => {
    particlesRef.current.setHour(hour);
  }, [hour]);

  /**
   * Streak colour, from the theme.
   *
   * The streaks were a fixed 72% white, which reads as wind over the dark
   * basemap and as nothing at all over a light one - so in the light theme
   * the wind field was simply missing.
   */
  useEffect(() => {
    particlesRef.current.setInk(
      document.documentElement.dataset.theme === 'light'
        ? 'rgba(18, 46, 72, 0.6)'
        : 'rgba(226, 248, 255, 0.78)'
    );
  }, [tokens]);

  useEffect(() => {
    const canvas = particleCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const wanted = showWind || field === 'wind';
    if (!wanted || !grid) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const tick = () => {
      const map = mapRef.current;
      if (!map) return;

      // One Leaflet projection a frame, for the map centre, and the rest is
      // arithmetic. Anchoring on a point Leaflet has just placed keeps the
      // fast path in step with the slow one wherever the pane happens to
      // be, including mid zoom-animation, without this code knowing
      // anything about panes or pixel origins.
      const centre = map.getCenter();
      const anchor = map.latLngToContainerPoint(centre);
      const scale = map.options.crs!.scale(map.getZoom());

      particlesRef.current.draw(
        ctx,
        canvas.width,
        canvas.height,
        frameProjection(scale, centre.lat, centre.lng, anchor.x, anchor.y)
      );
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [showWind, field, grid]);

  /* --------------------------------------------------------- timeline --- */

  useEffect(() => {
    if (!playing || !grid) return;
    const id = window.setInterval(() => {
      setHour((h) => (h + 1) % HOUR_COUNT);
    }, 420);
    return () => window.clearInterval(id);
  }, [playing, grid]);

  /* ------------------------------------------------------- prediction --- */

  const predictAt = async (lat: number, lon: number) => {
    predictAbortRef.current?.abort();
    const controller = new AbortController();
    predictAbortRef.current = controller;
    setPredicting(true);
    setPredictError(null);
    setSimPlaying(false);

    try {
      const f = await forecastPoint(lat, lon, {
        label: 'Dropped pin',
        mode: forecastMode,
        scenarioMmHr: simulationParams.rainfallIntensityMmHr,
        scenarioHours: Math.max(1, Math.round(simulationParams.durationHours)),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPrediction(f);
      setSimHour(f.peakAtHour);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setPredictError('Could not read terrain or forecast for that point.');
      setPrediction(null);
    } finally {
      if (!controller.signal.aborted) setPredicting(false);
    }
  };

  useEffect(() => {
    setPrediction((p) =>
      p
        ? recomputeForecast(p, {
            mode: forecastMode,
            scenarioMmHr: simulationParams.rainfallIntensityMmHr,
            scenarioHours: Math.max(1, Math.round(simulationParams.durationHours)),
          })
        : p
    );
  }, [forecastMode, simulationParams.rainfallIntensityMmHr, simulationParams.durationHours]);

  useEffect(() => {
    if (!simPlaying || !prediction) return;
    const id = window.setInterval(() => {
      setSimHour((h) => (h >= 47 ? (setSimPlaying(false), h) : h + 1));
    }, 220);
    return () => window.clearInterval(id);
  }, [simPlaying, prediction]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = window.setTimeout(() => {
      map.invalidateSize();
      resetCanvases();
    }, 260);
    return () => window.clearTimeout(id);
  }, [expanded, resetCanvases]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  /* ------------------------------------------------------------- view --- */

  const meta = FIELD_META[field];
  const scale = grid ? fieldScale(grid, field) : { lo: 0, hi: 1 };
  const ticks = grid ? legendTicks(field, scale) : [];
  const stamp = grid?.hours[hour];
  const when = stamp
    ? new Date(stamp).toLocaleString('en-IN', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '';

  return (
    <div
      id="tn-weather-map"
      className={
        expanded
          ? 'fixed inset-0 z-[9000] flex flex-col overflow-hidden bg-bg-deep'
          : 'glass relative flex flex-col overflow-hidden rounded-panel border border-accent/25 shadow-[0_24px_50px_rgba(0,0,0,0.65)]'
      }
    >
      {/* Field switcher and chrome */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 bg-bg/70 p-3 sm:p-4">
        <div role="radiogroup" aria-label="Weather layer" className="flex flex-wrap gap-1.5">
          {FIELDS.map((f) => {
            const active = field === f;
            return (
              <button
                key={f}
                role="radio"
                aria-checked={active}
                onClick={() => setField(f)}
                title={FIELD_META[f].description}
                className={`h-8 rounded-full border px-3.5 text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-line bg-surface-2/60 text-muted hover:border-line-strong hover:text-fg'
                }`}
              >
                {FIELD_META[f].label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Scenario multiplier, only where it means anything. */}
          {field === 'flood' && (
            <Select
              label="How much rain"
              value={String(stormFactor)}
              onChange={(v) => setStormFactor(Number(v))}
              size="md"
              options={[
                { value: '1', label: 'Real forecast', hint: 'What the weather service expects' },
                { value: '2', label: 'Rain ×2', hint: 'Pretend: twice as much rain' },
                { value: '4', label: 'Rain ×4', hint: 'Pretend: four times as much rain' },
                { value: '8', label: 'Rain ×8', hint: 'Pretend: like a cyclone' },
              ]}
            />
          )}

          <button
            onClick={() => setShowWind((v) => !v)}
            aria-pressed={showWind || field === 'wind'}
            title="Animated wind streaks"
            className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors cursor-pointer ${
              showWind || field === 'wind'
                ? 'border-accent/60 bg-accent/15 text-accent'
                : 'border-line bg-surface-2/60 text-muted hover:text-fg'
            }`}
          >
            <Wind className="h-3.5 w-3.5" aria-hidden="true" />
            Wind
          </button>

          <Select
            label="Map style"
            value={basemapId}
            onChange={setBasemapId}
            size="md"
            align="right"
            options={availableBasemaps().map((b) => ({
              value: b.id,
              label: b.label,
              hint: b.description,
            }))}
          />

          <button
            onClick={() => setExpanded((v) => !v)}
            aria-pressed={expanded}
            title={expanded ? 'Exit fullscreen (Esc)' : 'Expand'}
            className="flex h-8 items-center gap-1.5 rounded-full border border-line-strong/60 bg-surface-2/60 px-3.5 text-xs font-semibold text-fg-soft transition-colors hover:text-fg cursor-pointer"
          >
            {expanded ? (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {expanded ? 'Exit' : 'Expand'}
          </button>
        </div>
      </div>

      {/* Map */}
      <div
        className={`relative w-full bg-bg-deep ${
          expanded ? 'min-h-0 flex-1' : 'h-[clamp(30rem,74vh,56rem)]'
        }`}
      >
        <div ref={hostRef} className="h-full w-full" />

        {(!grid || error) && (
          <div className="absolute inset-0 z-[600] flex items-center justify-center bg-bg-deep/75 backdrop-blur-sm">
            <div className="glass max-w-sm rounded-card border border-accent/30 px-5 py-4 text-center shadow-2xl">
              {error ? (
                <p className="text-mini leading-relaxed text-fg-soft">{error}</p>
              ) : (
                <>
                  <Loader2
                    className="mx-auto h-5 w-5 animate-spin text-accent"
                    aria-hidden="true"
                  />
                  <p className="mt-2 text-mini font-semibold text-fg">{loadMsg}</p>
                  <p className="mt-1 text-nano leading-relaxed text-subtle">
                    48 hours of forecast for every cell in the grid, then the flood model
                    run at each one.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Legend */}
        {grid && (
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] hidden sm:block">
            <div className="glass rounded-card border border-line-strong/40 px-3 py-2 shadow-xl">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="font-mono text-nano uppercase tracking-[0.14em] text-muted">
                  {meta.label}
                </span>
                <span className="font-mono text-nano text-subtle">{meta.unit}</span>
              </div>
              <div
                className="flex h-2 w-56 overflow-hidden rounded-full"
                role="img"
                aria-label={`${meta.label} scale from ${scale.lo} to ${scale.hi} ${meta.unit}`}
              >
                {ticks.map((t, i) => (
                  <span key={i} className="flex-1" style={{ background: t.color }} />
                ))}
              </div>
              <div className="mt-1 flex w-56 justify-between font-mono text-nano text-subtle">
                {ticks.map((t, i) => (
                  <span key={i}>{t.value}</span>
                ))}
              </div>
              <p className="mt-1 max-w-[14rem] text-nano leading-snug text-subtle">
                {meta.description}
              </p>
            </div>
          </div>
        )}

        {/* Point prediction */}
        {(prediction || predicting || predictError) && (
          <div className="absolute inset-x-3 bottom-24 top-[38%] z-[700] md:inset-x-auto md:right-3 md:top-3 md:bottom-24 md:w-[21rem]">
            <PointPredictionPanel
              forecast={prediction}
              loading={predicting}
              error={predictError}
              hour={simHour}
              playing={simPlaying}
              mode={forecastMode}
              scenarioMmHr={simulationParams.rainfallIntensityMmHr}
              scenarioHours={Math.max(1, Math.round(simulationParams.durationHours))}
              onScenarioChange={(mmHr, hours) =>
                onUpdateParams({
                  ...simulationParams,
                  rainfallIntensityMmHr: mmHr,
                  durationHours: hours,
                })
              }
              onHourChange={(h) => {
                setSimPlaying(false);
                setSimHour(h);
              }}
              onTogglePlay={() => setSimPlaying((v) => !v)}
              onModeChange={setForecastMode}
              onDismiss={() => {
                predictAbortRef.current?.abort();
                setPrediction(null);
                setPredicting(false);
                setPredictError(null);
              }}
            />
          </div>
        )}

        {/*
          A correctly empty flood layer looks exactly like a broken one, so
          it has to say which it is - and offer the scenario that makes it
          demonstrable.
        */}
        {grid &&
          field === 'flood' &&
          // The same threshold the renderer draws against, so the notice
          // appears exactly when the map is blank - not a hair either side.
          grid.peak.flood <= FIELD_META.flood.floor &&
          !prediction &&
          !predicting && (
          <div className="absolute inset-x-3 top-3 z-[600] mx-auto max-w-lg md:inset-x-auto md:left-1/2 md:-translate-x-1/2">
            <div className="glass rounded-card border border-risk-low/35 bg-risk-low/10 px-3.5 py-2.5 shadow-xl">
              <p className="text-mini leading-relaxed text-fg-soft">
                <span className="font-bold text-fg">
                  No standing water anywhere in Tamil Nadu in the next 48 hours.
                </span>{' '}
                The forecast peaks at{' '}
                <strong>{grid.peak.rain.toFixed(1)} mm/hr</strong>, under the drainage
                threshold of most of the state. That is the model working, not failing
                {stormFactor === 1 ? ' – try a ×2 or ×4 scenario above' : ''}.
              </p>
            </div>
            </div>
          )}

        {/* What the flood layer is currently showing. */}
        {grid && field === 'flood' && stormFactor > 1 && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-[600] -translate-x-1/2">
            <div className="rounded-full border border-risk-high/50 bg-risk-high/15 px-3 py-1 shadow-lg backdrop-blur">
              <span className="text-mini font-bold text-risk-high-ink">
                Scenario: forecast rainfall &times;{stormFactor} — not a forecast
              </span>
            </div>
          </div>
        )}

        {grid && !prediction && !predicting && (
          <div className="pointer-events-none absolute right-3 top-3 z-[600] hidden items-center gap-2 rounded-full border border-accent/30 bg-bg/80 px-3 py-1.5 shadow-lg backdrop-blur md:flex">
            <span className="text-mini font-semibold text-fg-soft">
              Click anywhere for a full point forecast
            </span>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="flex items-center gap-3 border-t border-line/80 bg-bg/70 px-3 py-2.5 sm:px-4">
        <button
          onClick={() => setPlaying((v) => !v)}
          disabled={!grid}
          aria-label={playing ? 'Pause animation' : 'Play animation'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2/70 text-fg-soft transition-colors hover:border-accent/60 hover:text-fg disabled:opacity-40 cursor-pointer"
        >
          {playing ? (
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={HOUR_COUNT - 1}
            value={hour}
            disabled={!grid}
            aria-label="Forecast hour"
            onChange={(e) => {
              setPlaying(false);
              setHour(Number(e.target.value));
            }}
            className="fluid-slider w-full"
          />
          <div className="mt-0.5 flex justify-between font-mono text-nano text-subtle">
            <span>now</span>
            <span>+12h</span>
            <span>+24h</span>
            <span>+36h</span>
            <span>+48h</span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="font-mono text-xs font-bold text-fg">{when || '—'}</div>
          <div className="font-mono text-nano text-subtle">
            +{hour}h
            {grid && (
              <>
                {' · '}
                {new Date(grid.generatedAt).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
