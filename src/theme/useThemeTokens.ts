import { useEffect, useState } from 'react';
import { RiskLevel } from '../types';
import { useTheme } from './ThemeProvider';

/**
 * The bridge between CSS tokens and the libraries that cannot read them.
 *
 * Leaflet paints polygons through JS options and Recharts takes colours as
 * props, so neither sees a stylesheet. Without this hook the map and the
 * charts keep their dark palette in light mode - the usual way a theme
 * migration half-fails.
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
  const { theme, riskLevel } = useTheme();
  const [tokens, setTokens] = useState<ThemeTokens>(() => readThemeTokens());

  useEffect(() => {
    // One frame after the attribute flips, the cascade has settled.
    const id = requestAnimationFrame(() => setTokens(readThemeTokens()));
    return () => cancelAnimationFrame(id);
  }, [theme, riskLevel]);

  return tokens;
}

/**
 * Basemap tiles per theme.
 *
 * CARTO's basemaps are free and keyless, and ship matched light and dark
 * variants - which is exactly what a themed map needs. A MapTiler key, when
 * present, upgrades the Situational theme to full terrain relief.
 */
export function basemapFor(theme: string): { url: string; attribution: string } {
  const maptilerKey = (import.meta as { env?: Record<string, string> }).env?.VITE_MAPTILER_KEY;
  const cartoAttr =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

  if (theme === 'light') {
    return {
      url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      attribution: cartoAttr,
    };
  }

  if (theme === 'dynamic' && maptilerKey) {
    return {
      url: `https://api.maptiler.com/maps/topo-v2/{z}/{x}/{y}.png?key=${maptilerKey}`,
      attribution:
        '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    };
  }

  return {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
    attribution: cartoAttr,
  };
}
