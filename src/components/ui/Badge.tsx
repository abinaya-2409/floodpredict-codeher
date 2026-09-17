import React from 'react';
import { RiskLevel } from '../../types';

/**
 * Status and severity pills.
 *
 * 32 hand-rolled pill variants existed before this, several using severity
 * colours for things that were not severity. RiskBadge is the only component
 * allowed to paint with the severity ramp; Badge covers everything else.
 */

const RISK_VAR: Record<RiskLevel, string> = {
  low: 'var(--color-risk-low)',
  moderate: 'var(--color-risk-moderate)',
  high: 'var(--color-risk-high)',
  severe: 'var(--color-risk-severe)',
  critical: 'var(--color-risk-critical)',
};

const RISK_LABEL: Record<RiskLevel, string> = {
  low: 'Low',
  moderate: 'Watch',
  high: 'Elevated',
  severe: 'Severe',
  critical: 'Critical',
};

const BASE =
  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-semibold whitespace-nowrap';

/** Severity pill. Carries a dot as well as colour, so it survives greyscale. */
export function RiskBadge({
  level,
  label,
  className = '',
}: {
  level: RiskLevel;
  label?: string;
  className?: string;
}) {
  const c = RISK_VAR[level];
  return (
    <span
      className={`${BASE} text-micro uppercase tracking-wider ${className}`}
      style={{
        color: c,
        backgroundColor: `color-mix(in oklab, ${c} 14%, transparent)`,
        borderColor: `color-mix(in oklab, ${c} 40%, transparent)`,
      }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: c }}
        aria-hidden="true"
      />
      {label ?? RISK_LABEL[level]}
    </span>
  );
}

type Tone = 'neutral' | 'accent' | 'positive' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'text-muted bg-surface-2 border-line',
  accent: 'text-accent bg-accent/12 border-accent/35',
  positive: 'text-positive bg-positive/12 border-positive/35',
  warning: 'text-warning bg-warning/12 border-warning/35',
  danger: 'text-danger bg-danger/12 border-danger/35',
};

/** Non-severity pill: system state, counts, categories. */
export function Badge({
  tone = 'neutral',
  dot = false,
  pulse = false,
  className = '',
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`${BASE} text-mini ${TONES[tone]} ${className}`}>
      {dot && (
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${pulse ? 'animate-pulse' : ''}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
