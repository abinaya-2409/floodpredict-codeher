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
 * All of these are keyless: no signup, no card, no quota dashboard. For a
 * flood application the choice is not cosmetic - satellite shows what is
 * actually built on the floodplain, and the topographic layer shows the
 * contours that decide where water collects.
 *
 * A MapTiler key, when present, adds a terrain option on top of these.
 */
export interface Basemap {
  id: string;
  label: string;
  description: string;
  url: string;
  attribution: string;
  maxZoom: number;
  /** Satellite imagery carries no place names; overlay them separately. */
  labelOverlay?: string;
}

const OSM_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const CARTO_LABELS =
  'https://{s}.basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png';

export const BASEMAPS: Basemap[] = [
  {
    id: 'dark',
    label: 'Command',
    description: 'Muted dark basemap - keeps risk colours dominant',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
    attribution: `${OSM_ATTR} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
    maxZoom: 19,
  },
  {
    id: 'satellite',
    label: 'Satellite',
    description: 'Real imagery - shows what is actually built on the floodplain',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
    maxZoom: 18,
    labelOverlay: CARTO_LABELS,
  },
  {
    id: 'terrain',
    label: 'Elevation',
    description: 'Contour lines and hillshading - where water collects',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: `${OSM_ATTR}, <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)`,
    maxZoom: 17,
  },
  {
    id: 'streets',
    label: 'Streets',
    description: 'Legible street names for ground coordination',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: `${OSM_ATTR} &copy; <a href="https://carto.com/attributions">CARTO</a>`,
    maxZoom: 19,
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
        '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> ' + OSM_ATTR,
      maxZoom: 20,
    },
  ];
}

export function basemapById(id: string): Basemap {
  return availableBasemaps().find((b) => b.id === id) ?? BASEMAPS[0];
}
