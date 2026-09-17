import React from 'react';
import { Sun, Moon, Activity } from 'lucide-react';
import { THEMES, ThemeName, useTheme } from '../theme/ThemeProvider';

const ICONS: Record<ThemeName, React.ComponentType<{ className?: string }>> = {
  light: Sun,
  oled: Moon,
  dynamic: Activity,
};

/**
 * Three-way theme control.
 *
 * Rendered as a radiogroup rather than a cycling button so the current choice
 * is announced and any theme is reachable in one action from the keyboard.
 */
export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-full border border-line bg-surface-2/70 p-0.5 backdrop-blur"
    >
      {THEMES.map(({ id, label, hint }) => {
        const Icon = ICONS[id];
        const active = theme === id;
        return (
          <button
            key={id}
            role="radio"
            aria-checked={active}
            aria-label={`${label} theme. ${hint}`}
            title={`${label} - ${hint}`}
            onClick={() => setTheme(id)}
            className={[
              'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold transition-colors',
              active
                ? 'bg-accent text-on-accent shadow-sm'
                : 'text-muted hover:bg-surface-3 hover:text-fg',
            ].join(' ')}
          >
            <Icon className="h-3.5 w-3.5" />
            {!compact && <span className="hidden sm:inline">{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
