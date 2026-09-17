import React from 'react';
import { RiskLevel } from '../../types';

/**
 * A single measurement.
 *
 * The tiles this replaces were coloured by topic rather than by value: the
 * inundation tile rendered in critical magenta whether the reading was 8cm or
 * 80cm, and the elevation tile was permanently "safe" green even though
 * elevation has no severity at all. A number that is always red teaches the
 * reader to ignore red.
 *
 * So: pass `level` only when the value genuinely carries a severity. Without
 * it the tile stays neutral and the number is simply a number.
 */

const RISK_VAR: Record<RiskLevel, string> = {
  low: 'var(--color-risk-low)',
  moderate: 'var(--color-risk-moderate)',
  high: 'var(--color-risk-high)',
  severe: 'var(--color-risk-severe)',
  critical: 'var(--color-risk-critical)',
};

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  /** Sub-line under the value: trend, context, qualifier. */
  note?: React.ReactNode;
  icon?: React.ReactNode;
  /** Only when the value itself is a severity reading. */
  level?: RiskLevel;
  className?: string;
}

export function StatTile({
  label,
  value,
  unit,
  note,
  icon,
  level,
  className = '',
}: StatTileProps) {
  const accent = level ? RISK_VAR[level] : 'var(--color-accent)';

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-card border border-line bg-surface-2/50 p-3.5 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-mini font-medium text-muted">{label}</span>
        {icon && (
          <span className="shrink-0 opacity-70" style={{ color: accent }} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-baseline gap-1">
        <span
          className="font-mono text-2xl font-bold leading-none"
          style={{ color: level ? accent : 'var(--color-fg)' }}
        >
          {value}
        </span>
        {unit && <span className="text-mini text-muted">{unit}</span>}
      </div>

      {note && <p className="mt-1.5 text-micro text-subtle">{note}</p>}

      {/* Accent rule reads as a severity only when there is one to report. */}
      <span
        className="absolute inset-x-0 bottom-0 h-0.5"
        style={{ background: accent, opacity: level ? 0.9 : 0.35 }}
        aria-hidden="true"
      />
    </div>
  );
}
