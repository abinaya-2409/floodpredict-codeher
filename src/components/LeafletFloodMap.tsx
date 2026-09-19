import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { CityData, ZoneData, SimulationParams, ReliefShelter, ResourcePrepositioning } from '../types';
import { CHENNAI_HISTORICAL_OVERLAYS } from '../data/mockData';
import { Sliders, Layers, Search, MapPin, AlertTriangle, ShieldCheck, Navigation, Eye, EyeOff, RotateCcw, Loader2, Maximize2, Minimize2, Crosshair } from 'lucide-react';
import { PlaceResult, fetchBoundary, searchPlaces } from '../utils/geocode';
import { fetchElevations, fetchRainfall } from '../utils/openMeteo';
import { DistrictReconnaissance, assessDistrict, sampleGrid } from '../utils/districtModel';
import { Facility, fetchFacilities } from '../utils/facilities';
import { DistrictReconPanel } from './DistrictReconPanel';
import { Select } from './ui/Select';
import { PointPredictionPanel } from './PointPredictionPanel';
import { trackMapMotion } from '../utils/mapMotion';
import {
  ForecastMode,
  PointForecast,
  bandForDepth,
  forecastPoint,
  recomputeForecast,
} from '../utils/pointForecast';
import {
  availableBasemaps,
  basemapById,
  TAMIL_NADU_BOUNDS,
  useThemeTokens,
} from '../theme/useThemeTokens';

interface Props {
  city: CityData;
  zones: ZoneData[];
  selectedZone: ZoneData | null;
  onSelectZone: (zone: ZoneData) => void;
  simulationParams: SimulationParams;
  onUpdateParams: (newParams: SimulationParams) => void;
  resources: ResourcePrepositioning[];
  onToggleDrainBlockage: (drainId: string) => void;
  onTogglePumpingStation: (drainId: string) => void;
}

export const LeafletFloodMap: React.FC<Props> = ({
  city,
  zones,
  selectedZone,
  onSelectZone,
  simulationParams,
  resources,
  onUpdateParams,
  onToggleDrainBlockage,
  onTogglePumpingStation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const tokens = useThemeTokens();

  // Overlay state toggles
  const [show2015Historical, setShow2015Historical] = useState(false);
  const [show2023Historical, setShow2023Historical] = useState(false);
  const [showShelters, setShowShelters] = useState(true);
  const [showDrains, setShowDrains] = useState(true);
  const [showResources, setShowResources] = useState(true);
  const [showEvacRoutes, setShowEvacRoutes] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  // Opens on the basemap that suits the theme. It was always the dark
  // Command canvas, which put a black rectangle in the middle of the light
  // build; switching afterwards is the user's to do.
  const [basemapId, setBasemapId] = useState(() =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light'
      ? 'streets'
      : 'dark'
  );
  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchMarkerRef = useRef<L.Marker | null>(null);
  const boundaryRef = useRef<L.Polygon | null>(null);
  const [recon, setRecon] = useState<DistrictReconnaissance | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facilitiesLoading, setFacilitiesLoading] = useState(false);
  const facilityLayerRef = useRef<L.LayerGroup | null>(null);
  /**
   * Marker labels are only legible once there is room for them. Below this
   * zoom every marker collapses to a dot, which is what stops shelters and
   * resource units piling into an unreadable stack when zoomed out.
   */
  const [zoomLevel, setZoomLevel] = useState(12);

  /**
   * Point prediction: the map's own forecast for wherever the user clicked.
   *
   * The modelled wards cover eight cities. Everywhere else - which is to say
   * almost all of India - had nothing to click on, so the map was a viewer
   * rather than an instrument. This makes any coordinate answerable.
   */
  const [prediction, setPrediction] = useState<PointForecast | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [predictError, setPredictError] = useState<string | null>(null);
  const [simHour, setSimHour] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [forecastMode, setForecastMode] = useState<ForecastMode>('scenario');
  const [expanded, setExpanded] = useState(false);
  const floodLayerRef = useRef<L.LayerGroup | null>(null);
  const maskRef = useRef<L.Polygon | null>(null);
  const stateBoundsRef = useRef<L.LatLngBounds | null>(null);
  const predictAbortRef = useRef<AbortController | null>(null);

  /** Mirrors the thresholds in calculateZoneHydrology. */
  const DEPTH_BANDS = [
    { key: 'low', label: 'Passable', color: tokens.risk.low },
    { key: 'moderate', label: '15-30', color: tokens.risk.moderate },
    { key: 'high', label: '30-50', color: tokens.risk.high },
    { key: 'severe', label: '50-75', color: tokens.risk.severe },
    { key: 'critical', label: '75+', color: tokens.risk.critical },
  ];
  const LABEL_ZOOM = 12;
  /** Resource pills are secondary to ward labels, so they hold back further. */
  const RESOURCE_LABEL_ZOOM = 13.5;
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const labelLayerRef = useRef<L.TileLayer | null>(null);
  const basemaps = availableBasemaps();

  /**
   * The 2015 deluge and Cyclone Michaung extents are surveyed Chennai
   * polygons. Offering them elsewhere drew a Chennai outline over another
   * city's map, so the controls only appear where the data applies.
   */
  const hasHistoricalExtents = city.id === 'chennai';

  /**
   * Tile options tuned for perceived latency.
   *
   * keepBuffer preloads a ring of off-screen tiles so panning reveals cached
   * imagery instead of grey gaps. updateWhenZooming stops Leaflet firing a
   * request storm mid-pinch. maxNativeZoom lets the map keep zooming past the
   * provider's deepest tile by upscaling, so zoom never dead-ends on blank.
   *
   * detectRetina fetches one zoom level deeper on high-density displays and
   * draws it at half size. On the laptop screens this is actually used on it
   * is the difference between satellite imagery that reads as terrain and
   * imagery that reads as green smear, because the browser is otherwise
   * upscaling a 256px tile across 512 physical pixels.
   */
  const tileOptions = (maxZoom: number, maxNativeZoom: number) => ({
    maxZoom,
    maxNativeZoom,
    detectRetina: true,
    keepBuffer: 4,
    updateWhenZooming: false,
    updateWhenIdle: false,
    crossOrigin: true as const,
  });

  /**
   * Stops the map zooming out past the state.
   *
   * Recomputed whenever the container resizes, because the zoom at which
   * Tamil Nadu fits depends on how tall the map is - the inline map and the
   * fullscreen one do not agree.
   */
  const clampMinZoom = (map: L.Map) => {
    const bounds = stateBoundsRef.current;
    if (!bounds) return;
    const fit = map.getBoundsZoom(bounds, false, L.point(16, 16));
    if (!Number.isFinite(fit)) return;
    map.setMinZoom(Math.max(5, Math.floor(fit * 10) / 10));
    if (map.getZoom() < fit) map.setZoom(fit);
  };

  /**
   * Hides everything outside Tamil Nadu.
   *
   * Bounding the pan is not enough on its own: a viewport is a rectangle and
   * a state is not, so Kerala, Andhra Pradesh and Sri Lanka still filled the
   * corners of every view. This draws one polygon covering the region with
   * the state punched out of it as holes, so only Tamil Nadu shows through.
   *
   * The outer ring is a generous box rather than the whole world: a polygon
   * spanning 360 degrees of longitude has to be special-cased for the
   * antimeridian, and nothing here can pan far enough to need it. Leaflet
   * renders paths with fill-rule evenodd, so the holes do not need a
   * particular winding order.
   */
  const applyStateMask = async (map: L.Map) => {
    try {
      const res = await fetch('/data/tamil-nadu-outline.json');
      if (!res.ok) throw new Error(`outline ${res.status}`);
      const outline = (await res.json()) as {
        properties: { bbox: [number, number, number, number] };
        geometry: { type: string; coordinates: number[][][] | number[][][][] };
      };

      const parts =
        outline.geometry.type === 'MultiPolygon'
          ? (outline.geometry.coordinates as number[][][][])
          : [outline.geometry.coordinates as number[][][]];

      // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
      const holes = parts.map((poly) =>
        poly[0].map(([lng, lat]) => [lat, lng] as [number, number])
      );

      const surround: [number, number][] = [
        [-20, 40],
        [50, 40],
        [50, 130],
        [-20, 130],
      ];

      maskRef.current?.remove();
      maskRef.current = L.polygon([surround, ...holes], {
        pane: 'tnMask',
        interactive: false,
        stroke: false,
        fillColor: tokens.bgDeep,
        fillOpacity: 1,
      }).addTo(map);

      // A thin edge so the coastline and border read as deliberate.
      L.polygon(holes, {
        pane: 'tnMask',
        interactive: false,
        fill: false,
        color: tokens.accent,
        weight: 1,
        opacity: 0.35,
      }).addTo(map);

      // Clamp panning to the real outline rather than the padded guess in
      // the theme. Deliberately no fitBounds here: the mask already makes
      // the state the only thing visible at any zoom, and framing the whole
      // of Tamil Nadu on load would shrink the Chennai wards - the actual
      // subject of this tab - to a few pixels.
      const [s, w, n, e] = outline.properties.bbox;
      stateBoundsRef.current = L.latLngBounds([s, w], [n, e]);
      map.setMaxBounds(
        L.latLngBounds([s - 0.35, w - 0.35], [n + 0.35, e + 0.35])
      );
      // maxBounds constrains panning but not zoom, so without this the map
      // still zooms out to a Tamil Nadu adrift in an empty ocean.
      clampMinZoom(map);
    } catch (err) {
      // Without the mask the map still works; it just shows its neighbours.
      console.warn('State mask unavailable:', err);
    }
  };

  // Risk colours are read from the active theme so the map never falls out of
  // step with the rest of the interface.
  const getRiskColor = (risk: string) =>
    tokens.risk[risk as keyof typeof tokens.risk] ?? tokens.risk.low;

  /**
   * Zone geometry now travels with the zone.
   *
   * It used to live here as a hardcoded table keyed by zone id, which meant
   * adding a city to the data did not add it to the map: adyar, kolathur and
   * hindmata had no entry, so three wards silently never rendered, and a
   * stale "vyasarpadi" key pointed at a zone that no longer existed.
   */
  const geometryFor = (zone: ZoneData) =>
    zone.geoCenter && zone.geoPolygon
      ? { center: zone.geoCenter, polygon: zone.geoPolygon }
      : null;



  // Safe evacuation routes & submerged corridors
  const EVACUATION_ROUTES = [
    {
      name: 'Vijaya Nagar Flyover Elevated Dry Route',
      zoneId: 'velachery',
      type: 'safe',
      path: [
        [12.9780, 80.2180],
        [12.9830, 80.2210],
        [12.9910, 80.2250],
        [12.9960, 80.2280]
      ],
      desc: 'Elevated roadway (+6m MSL). Clear of water.'
    },
    {
      name: '100ft Bypass Road Submerged Siphon (HAZARD)',
      zoneId: 'velachery',
      type: 'hazard',
      path: [
        [12.9720, 80.2190],
        [12.9770, 80.2210],
        [12.9810, 80.2230]
      ],
      desc: 'Submerged under 55cm. Road impassable.'
    },
    {
      name: 'Mudichur High Bund Bypass to Tambaram Sanatorium',
      zoneId: 'mudichur',
      type: 'safe',
      path: [
        [12.9210, 80.0780],
        [12.9300, 80.0880],
        [12.9410, 80.1120]
      ],
      desc: 'High ridge road leading to Tambaram elevated bridge.'
    }
  ];

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [city.lat, city.lng],
        zoom: 12,
        zoomControl: true,
        // Scoped to Tamil Nadu: every district in the state stays reachable
        // and the viewport cannot drift out of the area the data covers.
        maxBounds: TAMIL_NADU_BOUNDS,
        maxBoundsViscosity: 0.6,
        minZoom: 6,
        maxZoom: 20,
        // Smoother wheel zoom than Leaflet's stepped default.
        zoomSnap: 0.5,
        wheelPxPerZoomLevel: 110,
      });

      const tiles = basemapById(basemapId);
      baseLayerRef.current = L.tileLayer(tiles.url, {
        attribution: tiles.attribution,
        ...tileOptions(tiles.maxZoom, tiles.maxNativeZoom),
      }).addTo(map);

      /**
       * Panes, so the state mask lands between the tiles and the data.
       *
       * Leaflet's own order puts the label overlay in shadowPane (500),
       * above overlayPane (400) where the ward polygons live. A mask high
       * enough to cover the labels would therefore also cover the data, and
       * one low enough to sit under the data would leave the place names of
       * three neighbouring states painted across it. Giving the labels and
       * the mask their own panes below overlayPane fixes both at once.
       */
      map.createPane('tnLabels').style.zIndex = '250';
      map.createPane('tnMask').style.zIndex = '300';
      map.getPane('tnMask')!.style.pointerEvents = 'none';
      map.getPane('tnLabels')!.style.pointerEvents = 'none';

      void applyStateMask(map);

      map.on('zoomend', () => setZoomLevel(map.getZoom()));

      // Tells the ambient background to stand down while this map is moving.
      trackMapMotion(
        (e, h) => map.on(e as never, h),
        (e, h) => map.off(e as never, h)
      );

      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;
      mapInstanceRef.current = map;
    } else {
      mapInstanceRef.current.setView([city.lat, city.lng], 12);
    }

    // Frame the modelled catchments rather than the city centroid - otherwise
    // the zones this app exists to show sit off-screen on first paint.
    const map = mapInstanceRef.current;
    const zonePoints = zones
      .map((z) => geometryFor(z)?.polygon)
      .filter(Boolean)
      .flat() as [number, number][];
    if (map && zonePoints.length > 0) {
      map.fitBounds(L.latLngBounds(zonePoints), { padding: [48, 48], animate: false });
    }

    return () => {
      // Keep map instance alive across re-renders
    };
  }, [city.id]);

  // Swap the basemap on selection. Satellite imagery has no place names, so a
  // labels-only overlay rides on top of it; every other basemap already
  // carries its own labels.
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const tiles = basemapById(basemapId);

    baseLayerRef.current?.remove();
    baseLayerRef.current = L.tileLayer(tiles.url, {
      attribution: tiles.attribution,
      ...tileOptions(tiles.maxZoom, tiles.maxNativeZoom),
    }).addTo(map);
    baseLayerRef.current.bringToBack();
    map.setMaxZoom(tiles.maxZoom);

    labelLayerRef.current?.remove();
    labelLayerRef.current = null;
    if (tiles.labelOverlay) {
      labelLayerRef.current = L.tileLayer(tiles.labelOverlay, {
        ...tileOptions(tiles.maxZoom, tiles.maxNativeZoom),
        pane: 'tnLabels',
      }).addTo(map);
    }
  }, [basemapId]);

  /**
   * Click anywhere to predict there.
   *
   * Bound once and reading the handler through a ref, because rebinding on
   * every render of a component this size means adding and removing a
   * listener dozens of times a second while the slider moves.
   */
  const predictRef = useRef<(lat: number, lon: number, label?: string) => void>(() => {});
  // Assigned in an effect, not during render: predictAt is declared further
  // down the body, so reading it here would hit the temporal dead zone.
  useEffect(() => {
    predictRef.current = predictAt;
  });

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const onClick = (e: L.LeafletMouseEvent) => {
      // Leaflet propagates a layer click up to the map, so selecting a ward
      // would fire a point prediction underneath it too. Leaflet marks every
      // interactive layer in the DOM, so asking what was actually clicked
      // covers wards, shelters, drains and anything added later - which a
      // per-layer guard would not.
      const target = e.originalEvent?.target as HTMLElement | null;
      if (target?.closest?.('.leaflet-interactive, .leaflet-marker-icon, .leaflet-popup')) {
        return;
      }
      void predictRef.current(e.latlng.lat, e.latlng.lng);
    };

    map.on('click', onClick);
    return () => {
      map.off('click', onClick);
    };
  }, []);

  /**
   * Re-runs the model when the source or the storm changes.
   *
   * Local and synchronous. The terrain sample and the hourly forecast are
   * already on the prediction, and neither depends on where the rainfall
   * slider sits, so there is nothing to fetch - dragging the slider moves the
   * water on the same frame instead of a second later.
   */
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
  }, [
    forecastMode,
    simulationParams.rainfallIntensityMmHr,
    simulationParams.durationHours,
  ]);

  /** Playback. One hour every 220ms is fast enough to read as motion. */
  useEffect(() => {
    if (!playing || !prediction) return;
    const id = window.setInterval(() => {
      setSimHour((h) => {
        if (h >= 47) {
          setPlaying(false);
          return h;
        }
        return h + 1;
      });
    }, 220);
    return () => window.clearInterval(id);
  }, [playing, prediction]);

  /**
   * Draws the predicted water.
   *
   * Concentric rings rather than one disc: the deepest water sits at the
   * point and shallows towards the edge, which is how a hollow actually
   * fills. A single flat polygon in one colour claims uniform depth across
   * the whole footprint, which is both wrong and the reason the old overlay
   * looked like a sticker rather than water.
   */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!floodLayerRef.current) {
      floodLayerRef.current = L.layerGroup().addTo(map);
    }
    const group = floodLayerRef.current;
    group.clearLayers();
    if (!prediction) return;

    const step = prediction.curve[Math.min(simHour, prediction.curve.length - 1)];
    const centre: [number, number] = [prediction.lat, prediction.lon];

    // Shallow water spreads little; deep water spreads to the full footprint.
    const spread = Math.min(1, step.depthCm / Math.max(1, prediction.peakDepthCm));
    const outerM = Math.max(120, prediction.footprintRadiusM * (0.35 + 0.65 * spread));

    if (step.depthCm > 0) {
      // Outside in, so the deepest ring is drawn last and sits on top.
      [1, 0.74, 0.5, 0.28].forEach((frac, i) => {
        // Depth at this ring: the rim is shallow, the centre is the full read.
        const ringDepth = step.depthCm * (0.3 + 0.7 * (1 - frac));
        const colour = tokens.risk[bandForDepth(ringDepth)];
        L.circle(centre, {
          radius: outerM * frac,
          // Every ring carries a waterline, not just the outer one. Over
          // satellite imagery a fill alone has nothing to read against.
          color: colour,
          weight: i === 0 ? 2 : 1,
          opacity: i === 0 ? 0.9 : 0.55,
          fillColor: colour,
          fillOpacity: 0.26 + i * 0.09,
          interactive: false,
          className: `flood-water flood-water-${i}`,
        }).addTo(group);
      });
    }

    // The pin stays put whether or not there is water, so the point the user
    // asked about never disappears from under them.
    const colour = tokens.risk[step.band];
    L.marker(centre, {
      interactive: false,
      icon: L.divIcon({
        className: '',
        html:
          `<div class="predict-pin" style="--pin:${colour}">` +
          `<span class="predict-pin-dot"></span>` +
          `<span class="predict-pin-label">${step.depthCm}cm</span>` +
          `</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      }),
    }).addTo(group);
  }, [prediction, simHour, tokens]);

  /** Leaflet needs telling when its container changes size. */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const id = window.setTimeout(() => {
      map.invalidateSize();
      clampMinZoom(map);
    }, 260);
    return () => window.clearTimeout(id);
  }, [expanded]);

  /** Escape leaves fullscreen, which is what every fullscreen does. */
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);


  // Update Layers on Map whenever simulation or toggles change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // 1. Render Zone Polygons
    zones.forEach((zone) => {
      const coords = geometryFor(zone);
      const riskColor = getRiskColor(zone.currentRisk);

      if (coords) {
        const isSelected = selectedZone?.id === zone.id;
        const baseStyle: L.PathOptions = {
          color: riskColor,
          weight: isSelected ? 3 : 1.75,
          fillColor: riskColor,
          // Depth drives opacity, so deeper water simply looks heavier.
          // Capped well below opaque. At extreme rainfall every ward
          // saturates to the critical colour, and at 0.62 they rendered as
          // flat magenta blocks that hid the city underneath them.
          fillOpacity: Math.min(0.42, 0.2 + (zone.predictedInundationDepthCm / 100) * 0.22),
          opacity: isSelected ? 1 : 0.85,
          dashArray: isSelected ? undefined : '5, 5',
          className: zone.currentRisk === 'critical' ? 'zone-critical' : undefined,
        };
        const polygon = L.polygon(coords.polygon, baseStyle);

        polygon.on('click', () => onSelectZone(zone));
        polygon.on('mouseover', () => {
          polygon.setStyle({ weight: 3.5, fillOpacity: Math.min(0.75, (baseStyle.fillOpacity ?? 0.4) + 0.14) });
          polygon.bringToFront();
        });
        polygon.on('mouseout', () => polygon.setStyle(baseStyle));

        // Popup
        polygon.bindPopup(`
          <div style="font-family: inherit; font-size: 12px; color: ${tokens.fg};">
            <div style="font-weight: bold; font-size: 14px; color: ${tokens.accent}; margin-bottom: 4px;">${zone.name}</div>
            <div style="color: ${tokens.muted}; margin-bottom: 6px;">Ward Numbers: ${zone.wardNumbers.join(', ')}</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px; background: ${tokens.bgDeep}; padding: 6px; border-radius: 6px;">
              <div><strong>Water Depth:</strong> <span style="color: ${tokens.risk.severe}; font-weight: bold;">${zone.predictedInundationDepthCm} cm</span></div>
              <div><strong>Elevation:</strong> ${zone.averageElevationM} m MSL</div>
              <div><strong>Alert Tier:</strong> <span style="text-transform: uppercase; color: ${tokens.risk.high}; font-weight: bold;">${zone.alertTier}</span></div>
              <div><strong>Population:</strong> ${zone.population.toLocaleString()}</div>
            </div>
            <div style="font-size: 11px; color: ${tokens.fgSoft};">Click zone to inspect street-level tipping points.</div>
          </div>
        `);

        layerGroup.addLayer(polygon);

        /**
         * Centre marker with its inundation badge.
         *
         * Shelters and resource units already collapsed to dots when zoomed
         * out; ward labels never did, which did not matter while the map
         * opened on one city. Now that it can frame the whole state, seven
         * Chennai wards land within a few pixels of each other and stack into
         * an unreadable pile, so they get the same treatment.
         */
        const showZoneLabel = zoomLevel >= LABEL_ZOOM;
        const customIcon = L.divIcon({
          className: 'custom-zone-label',
          html: showZoneLabel
            ? `
            <div style="
              background: ${tokens.surface};
              border: 1px solid ${riskColor};
              color: white;
              padding: 2px 6px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: bold;
              white-space: nowrap;
              box-shadow: 0 4px 10px rgba(0,0,0,0.5);
              transform: translate(-50%, -50%);
              display: flex;
              align-items: center;
              gap: 4px;
            ">
              <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${riskColor};"></span>
              <span>${zone.name.split(' ')[0]}</span>
              <span style="color: ${riskColor}; font-family: monospace;">${zone.predictedInundationDepthCm}cm</span>
            </div>
          `
            : `
            <div title="${zone.name}" style="
              width: 10px;
              height: 10px;
              border-radius: 50%;
              background: ${riskColor};
              border: 1.5px solid ${tokens.bgDeep};
              box-shadow: 0 0 6px ${riskColor};
              transform: translate(-50%, -50%);
            "></div>
          `,
          iconSize: showZoneLabel ? [80, 20] : [10, 10],
        });

        const labelMarker = L.marker(coords.center, { icon: customIcon });
        labelMarker.on('click', () => onSelectZone(zone));
        layerGroup.addLayer(labelMarker);
      }
    });

    // 2. Render Historical Overlays if enabled
    if (show2015Historical && hasHistoricalExtents) {
      // 2015 Deluge Boundary
      const hist2015 = L.polygon([
        [13.0020, 80.1980],
        [13.0000, 80.2450],
        [12.9550, 80.2480],
        [12.9450, 80.2050],
        [12.9050, 80.0550],
        [12.9450, 80.0500],
      ], {
        color: tokens.risk.severe,
        weight: 2,
        dashArray: '8, 8',
        fillColor: tokens.risk.severe,
        fillOpacity: 0.25,
      });
      hist2015.bindTooltip('2015 Deluge (494mm Peak Flooding Zone)', { sticky: true });
      layerGroup.addLayer(hist2015);
    }

    if (show2023Historical && hasHistoricalExtents) {
      // 2023 Cyclone Michaung Boundary
      const hist2023 = L.polygon([
        [12.9900, 80.2050],
        [12.9850, 80.2400],
        [12.9500, 80.2350],
        [12.9400, 80.2000],
      ], {
        color: tokens.risk.high,
        weight: 2,
        dashArray: '6, 6',
        fillColor: tokens.risk.high,
        fillOpacity: 0.2,
      });
      hist2023.bindTooltip('2023 Cyclone Michaung (390mm Inundation Zone)', { sticky: true });
      layerGroup.addLayer(hist2023);
    }

    // 3. Render Evacuation Routes
    if (showEvacRoutes) {
      EVACUATION_ROUTES.forEach((route) => {
        const isSafe = route.type === 'safe';
        const polyline = L.polyline(route.path as [number, number][], {
          color: isSafe ? tokens.risk.low : tokens.risk.severe,
          weight: isSafe ? 4 : 3,
          dashArray: isSafe ? '6, 8' : '3, 6',
          opacity: 0.9,
        });

        polyline.bindPopup(`
          <div style="font-size: 11px; color: white;">
            <strong style="color: ${isSafe ? tokens.positive : tokens.danger}">${route.name}</strong>
            <div style="margin-top: 4px; color: ${tokens.fgSoft};">${route.desc}</div>
          </div>
        `);

        layerGroup.addLayer(polyline);
      });
    }

    // 4. Render Drainage Channels and Bottlenecks
    if (showDrains) {
      city.drainageChannels.forEach((drain, index) => {
        const isBlocked = simulationParams.blockedDrainIds.includes(drain.id);
        const drainCoords: [number, number] = [
          city.lat - 0.02 + index * 0.015,
          city.lng - 0.03 + index * 0.02,
        ];

        const drainIcon = L.divIcon({
          className: 'custom-drain-icon',
          html: `
            <div style="
              background: ${isBlocked ? tokens.risk.critical : tokens.accentDeep};
              border: 2px solid white;
              color: white;
              width: 22px;
              height: 22px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 10px;
              font-weight: bold;
              box-shadow: 0 0 12px ${isBlocked ? tokens.risk.severe : tokens.accent};
              cursor: pointer;
            ">
              ${isBlocked ? '✕' : '⚡'}
            </div>
          `,
          iconSize: [22, 22],
        });

        const drainMarker = L.marker(drainCoords, { icon: drainIcon });
        drainMarker.bindPopup(`
          <div style="font-size: 12px; color: white;">
            <div style="font-weight: bold; color: ${tokens.accent};">${drain.name}</div>
            <div style="font-size: 11px; color: ${tokens.muted};">Type: ${drain.type.replace('_', ' ')}</div>
            <div style="margin: 6px 0; font-size: 11px;">
              <div>Flow: <strong>${drain.currentFlowCusecs}</strong> / ${drain.maxCapacityCusecs} cusecs</div>
              <div>Status: <span style="color: ${isBlocked ? tokens.risk.severe : tokens.positive}; font-weight: bold;">${isBlocked ? 'CHOKED (Click to Unclog)' : 'OPERATIONAL'}</span></div>
            </div>
          </div>
        `);

        drainMarker.on('click', () => {
          onToggleDrainBlockage(drain.id);
        });

        layerGroup.addLayer(drainMarker);
      });
    }

    // 5. Render Relief Shelters
    if (showShelters) {
      city.reliefShelters.forEach((shelter) => {
        const shelterCoords: [number, number] = [
          city.lat + (shelter.id === 'sh-1' ? -0.015 : shelter.id === 'sh-2' ? 0.02 : -0.04),
          city.lng + (shelter.id === 'sh-1' ? 0.01 : shelter.id === 'sh-2' ? -0.01 : -0.05),
        ];

        const showLabel = zoomLevel >= LABEL_ZOOM;
        const shelterIcon = L.divIcon({
          className: 'custom-shelter-icon',
          html: showLabel
            ? `<div style="
                background: ${tokens.positive}; border: 2px solid ${tokens.bgDeep};
                color: ${tokens.bgDeep}; padding: 2px 7px; border-radius: 9999px;
                font-size: 10px; font-weight: 700; white-space: nowrap;
                box-shadow: 0 4px 10px rgba(0,0,0,0.45);
                display: flex; align-items: center; gap: 3px;
              "><span>&#127968;</span><span>${shelter.name.split(' ')[0]}</span></div>`
            : `<div style="
                width: 10px; height: 10px; border-radius: 9999px;
                background: ${tokens.positive}; border: 2px solid ${tokens.bgDeep};
                box-shadow: 0 2px 6px rgba(0,0,0,0.5);
              "></div>`,
          iconSize: showLabel ? [70, 20] : [10, 10],
          iconAnchor: showLabel ? [35, 10] : [5, 5],
        });

        const shelterMarker = L.marker(shelterCoords, { icon: shelterIcon, zIndexOffset: 200 });
        shelterMarker.bindPopup(`
          <div style="font-size: 12px; color: white;">
            <div style="font-weight: bold; color: ${tokens.positive}; font-size: 13px;">${shelter.name}</div>
            <div style="font-size: 11px; color: ${tokens.muted};">${shelter.address}</div>
            <div style="margin: 6px 0; background: ${tokens.bgDeep}; padding: 6px; border-radius: 6px; font-size: 11px;">
              <div>Capacity: <strong>${shelter.currentOccupancyPersons} / ${shelter.capacityPersons}</strong> persons</div>
              <div>Ground Elevation: <strong>${shelter.elevationM}m MSL (Safe Dry Ground)</strong></div>
              <div>Power Backup: <strong>${shelter.hasPowerBackup ? 'Yes (Diesel Gen)' : 'No'}</strong></div>
              <div>Medical Post: <strong>${shelter.hasMedicalPost ? 'Active Doctors On-Site' : 'Basic Aid'}</strong></div>
            </div>
            <div style="color: ${tokens.accent}; font-size: 11px;">Helpline: ${shelter.contactNumber}</div>
          </div>
        `);
        layerGroup.addLayer(shelterMarker);
      });
    }

    // 6. Render Resource Pre-positioning points
    if (showResources) {
      resources.forEach((res) => {
        const showLabel = zoomLevel >= RESOURCE_LABEL_ZOOM;
        const resColor = res.priority === 'CRITICAL' ? tokens.accent2 : tokens.accent;
        const resLabel =
          res.type === 'dewatering_pump'
            ? 'Pump'
            : res.type === 'ndrf_boat_unit'
              ? 'NDRF Boat'
              : 'SDRF Squad';
        const resIcon = L.divIcon({
          className: 'custom-resource-icon',
          html: showLabel
            ? `<div style="
                background: ${resColor}; border: 1px solid ${tokens.bgDeep};
                color: ${tokens.bgDeep}; padding: 2px 6px; border-radius: 5px;
                font-size: 9px; font-weight: 700; white-space: nowrap;
                box-shadow: 0 2px 8px rgba(0,0,0,0.6);
              ">${resLabel} (${res.recommendedUnits})</div>`
            : `<div style="
                width: 8px; height: 8px; border-radius: 2px;
                background: ${resColor}; border: 1px solid ${tokens.bgDeep};
                box-shadow: 0 2px 6px rgba(0,0,0,0.6);
              "></div>`,
          iconSize: showLabel ? [74, 16] : [8, 8],
          iconAnchor: showLabel ? [37, 8] : [4, 4],
        });

        const resMarker = L.marker(res.coordinates, { icon: resIcon, zIndexOffset: 0 });
        resMarker.bindPopup(`
          <div style="font-size: 11px; color: white;">
            <div style="font-weight: bold; color: #c084fc;">${res.name}</div>
            <div style="margin-top: 4px; color: ${tokens.fgSoft};">Target: <strong>${res.targetStreet}</strong></div>
            <div style="color: ${tokens.muted};">${res.reason}</div>
            <div style="margin-top: 4px; font-weight: bold; color: ${tokens.positive};">Status: ${res.status.toUpperCase()}</div>
          </div>
        `);
        layerGroup.addLayer(resMarker);
      });
    }

  }, [
    city,
    zones,
    selectedZone,
    simulationParams,
    show2015Historical,
    show2023Historical,
    showShelters,
    showDrains,
    showResources,
    showEvacRoutes,
    // Marker icons collapse to dots below LABEL_ZOOM, and that decision is
    // made inside this effect - without zoomLevel here it was made once and
    // never revisited, so zooming out left every ward and shelter label at
    // full size, piled on top of each other over Chennai.
    zoomLevel,
    tokens,
  ]);

  // Handle Search Input & Pan Map
  /**
   * Debounced place lookup.
   *
   * Modelled wards match instantly and rank first; anything else in India
   * comes from Nominatim, so the map behaves like a general-purpose map
   * rather than being limited to the three cities we model.
   */
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 3) {
      setPlaceResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);

    // Nominatim asks for at most one request per second; this stays well under.
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchPlaces(q, controller.signal);
        setPlaceResults(results);
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          console.warn('Place search unavailable:', err);
          setPlaceResults([]);
        }
      } finally {
        setIsSearching(false);
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [searchQuery]);

  const flyToPlace = (place: PlaceResult) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.flyTo([place.lat, place.lon], place.zoom, { duration: 1.1 });

    searchMarkerRef.current?.remove();
    searchMarkerRef.current = L.marker([place.lat, place.lon], {
      title: place.name,
    })
      .addTo(map)
      .bindPopup(
        `<strong style="color:${tokens.accent}">${place.name}</strong><br/>` +
          `<span style="color:${tokens.muted}">${place.context}</span>`
      )
      .openPopup();

    setSearchOpen(false);
    setSearchQuery(place.name);

    // Anything district-sized gets a real terrain and rainfall read. Nothing
    // is bundled: the boundary and the weather are fetched for this one place.
    if (place.isArea && place.bbox) void runReconnaissance(place, map);
  };

  /**
   * Builds a first-pass read for a district outside the modelled cities, from
   * its OSM boundary, a 3x3 terrain sample and the live rainfall forecast.
   */
  const runReconnaissance = async (place: PlaceResult, map: L.Map) => {
    setReconLoading(true);
    setRecon(null);
    try {
      const grid = sampleGrid(place.bbox!, 3);
      // Terrain and rainfall answer in well under a second; Overpass is a
      // shared community service and can take twenty. Waiting on all three
      // together meant the panel sat on "Reading terrain..." long after the
      // terrain had arrived, so the slow one runs on its own track.
      const [elevations, rainfall] = await Promise.all([
        fetchElevations(grid),
        fetchRainfall(place.lat, place.lon),
      ]);

      setRecon(
        assessDistrict({
          name: place.name,
          context: place.context,
          center: [place.lat, place.lon],
          elevations,
          rainfall,
        })
      );
      setReconLoading(false);

      // Boundary: cosmetic, so failure is silent.
      void fetchBoundary(place.id, `${place.name}, ${place.context}`)
        .then((boundary) => {
          if (!boundary?.length) return;
          boundaryRef.current?.remove();
          boundaryRef.current = L.polygon(boundary, {
            color: tokens.accent,
            weight: 2,
            fill: false,
            dashArray: '6, 6',
            interactive: false,
          }).addTo(map);
        })
        .catch(() => undefined);

      // Relief camps: slower, and the panel renders a spinner for them alone.
      setFacilitiesLoading(true);
      void fetchFacilities(place.bbox!, [place.lat, place.lon], 40)
        .then((camps) => {
          setFacilities(camps);
          facilityLayerRef.current?.remove();
          facilityLayerRef.current = L.layerGroup(
            camps.slice(0, 25).map((f) =>
              L.circleMarker([f.lat, f.lon], {
                radius: 5,
                color: tokens.positive,
                weight: 2,
                fillColor: tokens.positive,
                fillOpacity: 0.45,
              }).bindPopup(
                `<strong style="color:${tokens.fg}">${f.name}</strong><br/>` +
                  `<span style="color:${tokens.muted}">Relief camp candidate &middot; ${f.distanceKm}km</span>`
              )
            )
          ).addTo(map);
        })
        .catch(() => setFacilities([]))
        .finally(() => setFacilitiesLoading(false));
    } catch (err) {
      console.warn('Reconnaissance read unavailable:', err);
      setRecon(null);
      setReconLoading(false);
    }
  };

  const dismissRecon = () => {
    setRecon(null);
    setReconLoading(false);
    boundaryRef.current?.remove();
    boundaryRef.current = null;
    searchMarkerRef.current?.remove();
    searchMarkerRef.current = null;
    facilityLayerRef.current?.remove();
    facilityLayerRef.current = null;
    setFacilities([]);
  };

  /**
   * Runs a forecast for one coordinate and draws it.
   *
   * Aborts any in-flight request first: clicking around the map quickly used
   * to leave several reads racing, and the slowest to return won regardless
   * of which point the user actually meant.
   */
  const predictAt = async (lat: number, lon: number, label?: string) => {
    predictAbortRef.current?.abort();
    const controller = new AbortController();
    predictAbortRef.current = controller;

    setPredicting(true);
    setPredictError(null);
    setPlaying(false);
    setSimHour(0);

    try {
      const f = await forecastPoint(lat, lon, {
        label: label ?? 'Dropped pin',
        mode: forecastMode,
        scenarioMmHr: simulationParams.rainfallIntensityMmHr,
        scenarioHours: Math.max(1, Math.round(simulationParams.durationHours)),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setPrediction(f);

      // A footprint is a few hundred metres across. Viewed at the zoom that
      // frames a whole city it is a handful of pixels, so the prediction
      // renders as an invisible dot next to its own label. Close in far
      // enough for the water to be legible - but only when already zoomed
      // out, so someone comparing two nearby points is not yanked around.
      const map = mapInstanceRef.current;
      if (map && map.getZoom() < 13) {
        map.flyTo([lat, lon], 13, { duration: 0.9 });
      }
      // Open on the peak rather than on hour zero: the useful frame is the
      // worst one, and starting at "0cm, no rain yet" reads as a failure.
      setSimHour(f.peakAtHour);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      console.warn('Point prediction failed:', err);
      setPredictError(
        'Could not read terrain or forecast for that point. Check the connection and try again.'
      );
      setPrediction(null);
    } finally {
      if (!controller.signal.aborted) setPredicting(false);
    }
  };

  const clearPrediction = () => {
    predictAbortRef.current?.abort();
    setPrediction(null);
    setPredicting(false);
    setPredictError(null);
    setPlaying(false);
    setSimHour(0);
    floodLayerRef.current?.clearLayers();
  };

  const focusFacility = (f: Facility) => {
    mapInstanceRef.current?.flyTo([f.lat, f.lon], 16, { duration: 0.9 });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !mapInstanceRef.current) return;

    const matchedZone = zones.find(z =>
      z.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      z.keyStreets.some(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (matchedZone) {
      onSelectZone(matchedZone);
      const coords = geometryFor(matchedZone);
      if (coords) {
        mapInstanceRef.current.flyTo(coords.center, 14, { duration: 1.0 });
      }
      setSearchOpen(false);
      return;
    }

    if (placeResults.length > 0) flyToPlace(placeResults[0]);
  };

  return (
    <div
      id="leaflet-flood-map-wrapper"
      className={
        expanded
          ? 'fixed inset-0 z-[9000] flex flex-col overflow-hidden bg-bg-deep'
          : 'glass rounded-panel overflow-hidden relative shadow-[0_24px_50px_rgba(0,0,0,0.65)] border border-accent/25 flex flex-col'
      }
    >
      {/* Top Map Control Bar */}
      <div className="p-3 sm:p-4 bg-bg/70 border-b border-line/80 flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        {/* Search Input */}
        <form onSubmit={handleSearch} className="relative w-full lg:w-72 lg:shrink-0" role="search">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-accent/80" aria-hidden="true" />
          <input
            type="text"
            aria-label="Search any district, town or street in Tamil Nadu"
            placeholder="Search anywhere in Tamil Nadu..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 160)}
            className="w-full h-9 bg-surface/80 text-fg pl-10 pr-9 rounded-full text-xs placeholder:text-subtle border border-line-strong/60 focus:outline-none focus:border-accent/70 focus:ring-1 focus:ring-accent/40 transition-colors"
          />
          {isSearching && (
            <Loader2
              className="w-3.5 h-3.5 absolute right-3.5 top-1/2 -translate-y-1/2 text-accent animate-spin"
              aria-hidden="true"
            />
          )}

          {searchOpen && searchQuery.trim().length >= 3 && (
            <ul
              role="listbox"
              aria-label="Search results"
              className="absolute left-0 right-0 top-11 z-[1200] max-h-72 overflow-y-auto rounded-card border border-line bg-surface/95 p-1 shadow-2xl backdrop-blur"
            >
              {placeResults.length === 0 && !isSearching && (
                <li className="px-3 py-2.5 text-mini text-subtle">
                  No place found in Tamil Nadu for that search.
                </li>
              )}
              {placeResults.map((place) => (
                <li key={place.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => flyToPlace(place)}
                    className="flex w-full items-start gap-2.5 rounded-card px-2.5 py-2 text-left transition-colors hover:bg-surface-3"
                  >
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-fg">
                        {place.name}
                      </span>
                      {place.context && (
                        <span className="block truncate text-micro text-subtle">
                          {place.context}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-0.5 text-nano font-medium uppercase tracking-wide text-muted">
                      {place.kind}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>

        {/* Layer Filter Toggles */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {hasHistoricalExtents && (
          <>
          <button
            onClick={() => setShow2015Historical(!show2015Historical)}
            className={`h-8 px-3.5 rounded-full border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer shadow-sm ${
              show2015Historical
                ? 'bg-risk-high/25 border-risk-high text-risk-high-ink font-bold'
                : 'bg-surface-2/60 hover:bg-surface-3/80 text-risk-high-ink/80 border-risk-high/40 hover:text-fg'
            }`}
          >
            <svg className="w-3.5 h-3.5 text-risk-high-ink" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 5a5 5 0 1 1-5 5 5 5 0 0 1 5-5z" />
              <circle cx="12" cy="12" fill="currentColor" r="2" />
            </svg>
            <span>2015 Deluge Overlay</span>
          </button>

          <button
            onClick={() => setShow2023Historical(!show2023Historical)}
            className={`h-8 px-3.5 rounded-full border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer shadow-sm ${
              show2023Historical
                ? 'bg-risk-critical/25 border-risk-critical text-risk-critical-ink font-bold'
                : 'bg-surface-2/60 hover:bg-surface-3/80 text-risk-critical-ink/80 border-risk-critical/40 hover:text-fg'
            }`}
          >
            <svg className="w-3.5 h-3.5 text-risk-critical-ink" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 2a10 10 0 0 1 9.9 8.6c.1.7-.4 1.4-1.1 1.4h-3.8a5 5 0 0 0-5-5V3.2c0-.7-.7-1.2-1.4-1.1A10 10 0 0 1 12 2z" />
              <path d="M12 22a10 10 0 0 1-9.9-8.6c-.1-.7.4-1.4 1.1-1.4h3.8a5 5 0 0 0 5 5v3.8c0 .7.7 1.2 1.4 1.1A10 10 0 0 1 12 22z" />
              <circle cx="12" cy="12" fill="currentColor" r="2.5" />
            </svg>
            <span>2023 Michaung</span>
          </button>
          </>
          )}

          <button
            onClick={() => setShowEvacRoutes(!showEvacRoutes)}
            className={`h-8 px-3.5 rounded-full border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer shadow-sm ${
              showEvacRoutes
                ? 'bg-risk-low/25 border-risk-low text-risk-low-ink font-bold'
                : 'bg-surface-2/60 hover:bg-surface-3/80 text-risk-low-ink/80 border-risk-low/40 hover:text-fg'
            }`}
          >
            <svg className="w-3.5 h-3.5 text-risk-low-ink" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="18 15 22 15 22 11" />
              <path d="M14 9l8 6" />
              <path d="M4 19h4l4-8V4" />
              <polyline points="10 4 12 2 14 4" />
            </svg>
            <span>Evacuation Routes</span>
          </button>

          {/* Basemap. Every option is keyless - no signup, no quota. Satellite
              and elevation are not decoration: one shows what is built on the
              floodplain, the other shows where water collects. Collapsed to a
              menu because only one can be active and the row cost four slots
              in a bar that had nine. */}
          <Select
            label="Map style"
            value={basemapId}
            onChange={setBasemapId}
            size="md"
            options={basemaps.map((b) => ({
              value: b.id,
              label: b.label,
              hint: b.description,
            }))}
          />

          <button
            onClick={() => setShowShelters(!showShelters)}
            className={`h-8 px-3.5 rounded-full border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer shadow-sm ${
              showShelters
                ? 'bg-accent/25 border-accent text-accent-soft font-bold'
                : 'bg-surface-2/60 hover:bg-surface-3/80 text-accent-soft/80 border-accent/40 hover:text-fg'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-accent" />
            <span>Relief Camps</span>
          </button>

          <button
            onClick={() => setExpanded((v) => !v)}
            aria-pressed={expanded}
            title={expanded ? 'Exit fullscreen (Esc)' : 'Expand map to fullscreen'}
            className="h-8 px-3.5 rounded-full border border-line-strong/60 bg-surface-2/60 text-xs font-semibold text-fg-soft flex items-center gap-2 transition-colors hover:bg-surface-3/80 hover:text-fg whitespace-nowrap cursor-pointer shadow-sm"
          >
            {expanded ? (
              <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            <span>{expanded ? 'Exit' : 'Expand'}</span>
          </button>
        </div>
      </div>

      {/* Map Container */}
      <div
        className={`relative w-full bg-bg-deep ${
          expanded ? 'flex-1 min-h-0' : 'h-[clamp(30rem,72vh,54rem)]'
        }`}
      >
        {/*
          The element Leaflet owns must keep a constant className.
          Leaflet writes its own classes (leaflet-container, leaflet-touch,
          the zoom-animation classes) straight onto this node, and React
          rewrites className wholesale whenever the interpolated value
          changes - which silently deleted them the moment the basemap was
          switched, taking .leaflet-container's positioning with it. The
          tiles stayed in the DOM, orphaned and unpositioned, so the map went
          black while every network request still succeeded.

          Anything conditional therefore lives on the wrapper, never here.
        */}
        <div className={`w-full h-full ${basemapId === 'dark' ? 'map-dim' : ''}`}>
          <div ref={mapContainerRef} className="w-full h-full z-10" />
        </div>

        {/*
          The floating rainfall slider that used to sit here has moved up to
          the map tab's header, where every mode can reach it. Two controls
          for one number, one of them only visible on one of four maps, was
          the reason the schematic could not be driven at all.
        */}

        {/* Depth legend.
            Thresholds are the ones calculateZoneHydrology actually uses - the
            previous legend claimed "Critical >60cm" and omitted Severe
            entirely, so it disagreed with the model it was labelling. */}
        <div
          className={`absolute bottom-8 right-3 z-[500] ${
            prediction || predicting || predictError ? 'hidden' : 'hidden lg:block'
          }`}
        >
          <div className="glass rounded-card px-3 py-2.5 shadow-xl border border-line-strong/40">
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="font-mono text-nano uppercase tracking-[0.14em] text-muted">
                Predicted depth
              </span>
              <span className="font-mono text-nano text-subtle">cm</span>
            </div>

            {/* Continuous ramp, read left to right like any map legend. */}
            <div
              className="flex h-2 w-56 overflow-hidden rounded-full"
              role="img"
              aria-label="Depth scale from low under 15 centimetres to critical above 75 centimetres"
            >
              {DEPTH_BANDS.map((b) => (
                <span key={b.key} className="flex-1" style={{ background: b.color }} />
              ))}
            </div>

            <div className="mt-1 flex w-56 justify-between font-mono text-nano text-subtle">
              <span>0</span>
              <span>15</span>
              <span>30</span>
              <span>50</span>
              <span>75+</span>
            </div>

            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
              {DEPTH_BANDS.map((b) => (
                <li key={b.key} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: b.color }}
                    aria-hidden="true"
                  />
                  <span className="text-micro font-medium text-fg-soft">{b.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Reconnaissance read for a searched district, when one is active. */}
        {(recon || reconLoading) && (
          <div className="absolute left-3 top-3 z-[600] w-[19rem] max-w-[calc(100%-1.5rem)]">
            <DistrictReconPanel
              recon={recon}
              loading={reconLoading}
              facilities={facilities}
              facilitiesLoading={facilitiesLoading}
              onFocusFacility={focusFacility}
              onDismiss={dismissRecon}
            />
          </div>
        )}

        {/* Point prediction, docked right. */}
        {(prediction || predicting || predictError) && (
          <div className="absolute inset-x-3 bottom-3 top-[42%] z-[700] md:inset-x-auto md:right-3 md:top-3 md:w-[21rem]">
            <PointPredictionPanel
              forecast={prediction}
              loading={predicting}
              error={predictError}
              hour={simHour}
              playing={playing}
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
                setPlaying(false);
                setSimHour(h);
              }}
              onTogglePlay={() => setPlaying((v) => !v)}
              onModeChange={setForecastMode}
              onDismiss={clearPrediction}
            />
          </div>
        )}

        {/* The invitation. Without it the map looks like every other map, and
            nothing suggests that clicking it does anything. */}
        {!prediction && !predicting && !predictError && (
          <div className="pointer-events-none absolute right-3 top-3 z-[600] hidden items-center gap-2 rounded-full border border-accent/30 bg-bg/80 px-3 py-1.5 shadow-lg backdrop-blur md:flex">
            <Crosshair className="h-3.5 w-3.5 animate-pulse text-accent" aria-hidden="true" />
            <span className="text-mini font-semibold text-fg-soft">
              Click anywhere to predict flooding there
            </span>
          </div>
        )}

        {/* Model provenance. Kept bottom-left so it never sits under
            Leaflet's own attribution control in the bottom-right. */}
        <div className="absolute bottom-1.5 left-3 z-[400] text-micro text-subtle font-mono pointer-events-none">
          GIS Hydro Model v4.2 &bull; SRTM 30m DEM
        </div>
      </div>
    </div>
  );
};
