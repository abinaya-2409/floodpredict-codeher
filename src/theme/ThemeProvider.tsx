import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ThemeName = 'light' | 'oled' | 'dynamic';

export const THEMES: { id: ThemeName; label: string; hint: string }[] = [
  {
    id: 'light',
    label: 'Daylight',
    hint: 'High-contrast control room. Best for projectors and daylight.',
  },
  {
    id: 'oled',
    label: 'Blackout',
    hint: 'True black. Unlit pixels on OLED phones - saves battery in the field.',
  },
  {
    id: 'dynamic',
    label: 'Situational',
    hint: 'The interface shifts colour and tempo with live flood severity.',
  },
];

const STORAGE_KEY = 'jalrakshak.theme';

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  /** 0-1 normalised live risk. Only the Situational theme reacts to it. */
  riskLevel: number;
  setRiskLevel: (v: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemeName {
  if (typeof window === 'undefined') return 'oled';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'oled' || stored === 'dynamic') return stored;
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    return prefersLight ? 'light' : 'oled';
  } catch {
    // Private browsing, blocked storage - fall back rather than crash.
    return 'oled';
  }
}

/**
 * Maps a 0-100 VRI onto the Situational theme's hue and intensity.
 *
 * 196 is a calm cyan; 318 is an alarm magenta. Interpolating hue rather than
 * swapping palettes means the shift reads as the situation changing, not as
 * the app changing skin.
 */
function riskToHue(risk01: number): number {
  const CALM_HUE = 196;
  const ALARM_HUE = 318;
  return Math.round(CALM_HUE + (ALARM_HUE - CALM_HUE) * risk01);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(readStoredTheme);
  const [riskLevel, setRiskLevel] = useState(0);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage is a convenience here; the theme still applies for this session.
    }
  }, []);

  // Apply the theme to the document root.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Feed live risk into the Situational theme only.
  useEffect(() => {
    const root = document.documentElement;
    if (theme !== 'dynamic') {
      root.style.removeProperty('--live-risk');
      root.style.removeProperty('--live-hue');
      return;
    }
    const clamped = Math.max(0, Math.min(1, riskLevel));
    root.style.setProperty('--live-risk', clamped.toFixed(3));
    root.style.setProperty('--live-hue', String(riskToHue(clamped)));
  }, [theme, riskLevel]);

  const value = useMemo(
    () => ({ theme, setTheme, riskLevel, setRiskLevel }),
    [theme, setTheme, riskLevel]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
