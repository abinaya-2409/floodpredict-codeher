import { useMemo } from 'react';
import { RiskLevel } from '../types';

/**
 * The bridge between CSS tokens and the libraries that cannot read them.
 *
 * Leaflet paints polygons through JS options and Recharts takes colours as
 * props, so neither sees a stylesheet. This hook reads the resolved custom
 * properties once so the map and the charts stay in step with the palette
 * defined in index.css.
 */
export interface ThemeTokens {
  bg: string;
  bgDeep: string;
  surface: string;
  surface2: string;
  line: string;
  lineStrong: string;
  fg: string;
  fgSoft: string;
  muted: string;
  subtle: string;
  accent: string;
  accentSoft: string;
  accentDeep: string;
  accent2: string;
  risk: Record<RiskLevel, string>;
  positive: string;
  warning: string;
  danger: string;
}

const FALLBACK: ThemeTokens = {
  bg: '#070d17',
  bgDeep: '#04080f',
  surface: '#0d1524',
  surface2: '#131e30',
  line: '#1e2c42',
  lineStrong: '#2b3d58',
  fg: '#eef4fb',
  fgSoft: '#c3d2e4',
  muted: '#8aa0bb',
  subtle: '#5d738f',
  accent: '#38bdf8',
  accentSoft: '#7dd3fc',
  accentDeep: '#0284c7',
  accent2: '#a78bfa',
  risk: {
    low: '#2dd4bf',
    moderate: '#60a5fa',
    high: '#fbbf24',
    severe: '#fb7185',
    critical: '#e879f9',
  },
  positive: '#34d399',
  warning: '#fbbf24',
  danger: '#fb7185',
};

function read(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = styles.getPropertyValue(name).trim();
  return v || fallback;
}

export function readThemeTokens(): ThemeTokens {
  if (typeof window === 'undefined') return FALLBACK;
  const s = getComputedStyle(document.documentElement);
  return {
    bg: read(s, '--color-bg', FALLBACK.bg),
    bgDeep: read(s, '--color-bg-deep', FALLBACK.bgDeep),
    surface: read(s, '--color-surface', FALLBACK.surface),
    surface2: read(s, '--color-surface-2', FALLBACK.surface2),
    line: read(s, '--color-line', FALLBACK.line),
    lineStrong: read(s, '--color-line-strong', FALLBACK.lineStrong),
    fg: read(s, '--color-fg', FALLBACK.fg),
    fgSoft: read(s, '--color-fg-soft', FALLBACK.fgSoft),
    muted: read(s, '--color-muted', FALLBACK.muted),
    subtle: read(s, '--color-subtle', FALLBACK.subtle),
    accent: read(s, '--color-accent', FALLBACK.accent),
    accentSoft: read(s, '--color-accent-soft', FALLBACK.accentSoft),
    accentDeep: read(s, '--color-accent-deep', FALLBACK.accentDeep),
    accent2: read(s, '--color-accent-2', FALLBACK.accent2),
    risk: {
      low: read(s, '--color-risk-low', FALLBACK.risk.low),
      moderate: read(s, '--color-risk-moderate', FALLBACK.risk.moderate),
      high: read(s, '--color-risk-high', FALLBACK.risk.high),
      severe: read(s, '--color-risk-severe', FALLBACK.risk.severe),
      critical: read(s, '--color-risk-critical', FALLBACK.risk.critical),
    },
    positive: read(s, '--color-positive', FALLBACK.positive),
    warning: read(s, '--color-warning', FALLBACK.warning),
    danger: read(s, '--color-danger', FALLBACK.danger),
  };
}

export function useThemeTokens(): ThemeTokens {
  // The palette is fixed, so this resolves once per mount.
  return useMemo(() => readThemeTokens(), []);
}

/**
 * Basemaps.
 *
 * All Esri ArcGIS Online services: genuinely keyless, served from a CDN, and
 * clean. CARTO was the obvious choice until it started stamping
 * "API KEY REQUIRED" across every unauthenticated tile - an HTTP 200 that is
 * not a usable tile. OpenTopoMap is keyless and unwatermarked but measured
 * ~1080ms per tile against Esri's ~300ms, which is too slow to pan through.
 *
 * A MapTiler key, when present, appends a fifth option. Nothing requires it.
 */
export interface Basemap {
  id: string;
  label: string;
  description: string;
  url: string;
  attribution: string;
  /** Deepest zoom the UI offers. Leaflet upscales past maxNativeZoom. */
  maxZoom: number;
  /** Deepest zoom this provider actually serves tiles for. */
  maxNativeZoom: number;
  /** Place names as a separate layer, for bases that ship without them. */
  labelOverlay?: string;
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_ATTR =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const BASEMAPS: Basemap[] = [
  {
    id: 'dark',
    label: 'Command',
    description: 'Muted dark canvas - keeps risk colours dominant',
    url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
    labelOverlay: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_ATTR,
    maxZoom: 20,
    maxNativeZoom: 16,
  },
  {
    id: 'satellite',
    label: 'Satellite',
    description: 'Real imagery - shows what is actually built on the floodplain',
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    labelOverlay: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
    attribution:
      'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
    maxZoom: 20,
    maxNativeZoom: 19,
  },
  {
    id: 'terrain',
    label: 'Elevation',
    description: 'Contours and shaded relief - shows where water collects',
    url: `${ESRI}/World_Topo_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_ATTR + ', USGS, NOAA',
    maxZoom: 20,
    maxNativeZoom: 19,
  },
  {
    id: 'streets',
    label: 'Streets',
    description: 'Legible street names for ground coordination',
    url: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_ATTR,
    maxZoom: 20,
    maxNativeZoom: 19,
  },
];

/** MapTiler terrain is appended only when a key is configured. */
export function availableBasemaps(): Basemap[] {
  const key = (import.meta as { env?: Record<string, string> }).env?.VITE_MAPTILER_KEY;
  if (!key) return BASEMAPS;
  return [
    ...BASEMAPS,
    {
      id: 'maptiler-topo',
      label: 'Terrain HD',
      description: 'MapTiler topographic relief',
      url: `https://api.maptiler.com/maps/topo-v2/{z}/{x}/{y}.png?key=${key}`,
      attribution:
        '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' +
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 20,
      maxNativeZoom: 20,
    },
  ];
}

export function basemapById(id: string): Basemap {
  return availableBasemaps().find((b) => b.id === id) ?? BASEMAPS[0];
}

/**
 * India's bounding box, generously padded.
 *
 * Constrains panning so the viewport never drifts into empty ocean, while
 * leaving every district - Kashmir to Kanyakumari, Kutch to the Northeast -
 * freely reachable.
 */
export const INDIA_BOUNDS: [[number, number], [number, number]] = [
  [5.5, 66.0],
  [37.5, 98.5],
];

/**
 * Tamil Nadu, padded.
 *
 * The application is scoped to the one state its disaster record covers, so
 * the map is bounded to it: panning cannot wander to Delhi and leave every
 * historical overlay, ward model and relief-camp lookup behind. The padding
 * keeps Kanniyakumari and the Nilgiris comfortably reachable rather than
 * pinned against the edge.
 */
export const TAMIL_NADU_BOUNDS: [[number, number], [number, number]] = [
  [7.6, 75.8],
  [13.8, 80.7],
];

/** Roughly the geographic centre of the state. */
export const TAMIL_NADU_CENTRE: [number, number] = [10.9, 78.3];
