import React from 'react';
import { Compass, CloudRain, Mountain, Timer, Info, X } from 'lucide-react';
import { DistrictReconnaissance } from '../utils/districtModel';
import { RiskBadge } from './ui/Badge';

const RISK_VAR: Record<string, string> = {
  low: 'var(--color-risk-low)',
  moderate: 'var(--color-risk-moderate)',
  high: 'var(--color-risk-high)',
  severe: 'var(--color-risk-severe)',
  critical: 'var(--color-risk-critical)',
};

/**
 * The read for a district outside the eight modelled cities.
 *
 * Presented deliberately differently from the VRI panel - different heading,
 * an explicit "reconnaissance" label and the caveat in view rather than in a
 * tooltip - because it is a weaker claim built from two inputs, not twelve.
 */
export function DistrictReconPanel({
  recon,
  loading,
  onDismiss,
}: {
  recon: DistrictReconnaissance | null;
  loading: boolean;
  onDismiss: () => void;
}) {
  if (!recon && !loading) return null;
  const color = recon ? RISK_VAR[recon.band] : 'var(--color-accent)';

  return (
    <section
      className="glass rounded-panel p-4"
      aria-labelledby="recon-heading"
      aria-busy={loading}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-micro uppercase tracking-[0.16em] text-subtle">
            Reconnaissance read
          </p>
          <h3
            id="recon-heading"
            className="mt-1 flex items-center gap-2 font-display text-sm font-bold text-fg"
          >
            <Compass className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span className="truncate">{loading ? 'Reading terrain...' : recon!.name}</span>
          </h3>
          {recon && <p className="mt-0.5 truncate text-mini text-subtle">{recon.context}</p>}
        </div>

        <button
          onClick={onDismiss}
          aria-label="Dismiss reconnaissance read"
          className="shrink-0 rounded-control p-1 text-subtle transition-colors hover:bg-surface-2 hover:text-fg cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {loading || !recon ? (
        <div className="space-y-2" aria-hidden="true">
          <div className="h-8 w-24 animate-pulse rounded-control bg-surface-2" />
          <div className="h-3 w-full animate-pulse rounded-control bg-surface-2" />
          <div className="h-3 w-2/3 animate-pulse rounded-control bg-surface-2" />
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div className="flex items-baseline gap-1">
              <span
                className="font-mono text-4xl font-extrabold leading-none"
                style={{ color }}
              >
                {recon.hazardScore}
              </span>
              <span className="text-mini font-semibold text-subtle">/100 hazard</span>
            </div>
            <RiskBadge level={recon.band} />
          </div>

          <dl className="grid grid-cols-3 gap-2 border-t border-line pt-3">
            <div>
              <dt className="flex items-center gap-1 text-micro uppercase tracking-wider text-subtle">
                <CloudRain className="h-3 w-3" aria-hidden="true" /> Peak rain
              </dt>
              <dd className="mt-0.5 font-mono text-sm font-bold text-fg">
                {recon.rainfall.peak24hMmHr}
                <span className="ml-0.5 text-micro font-normal text-muted">mm/h</span>
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-micro uppercase tracking-wider text-subtle">
                <Mountain className="h-3 w-3" aria-hidden="true" /> Low point
              </dt>
              <dd className="mt-0.5 font-mono text-sm font-bold text-fg">
                {recon.minElevationM}
                <span className="ml-0.5 text-micro font-normal text-muted">m</span>
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-micro uppercase tracking-wider text-subtle">
                <Timer className="h-3 w-3" aria-hidden="true" /> Peak in
              </dt>
              <dd className="mt-0.5 font-mono text-sm font-bold text-fg">
                {recon.hoursToPeak}
                <span className="ml-0.5 text-micro font-normal text-muted">h</span>
              </dd>
            </div>
          </dl>

          <p className="mt-2 font-mono text-micro text-subtle">
            {recon.rainfall.total24hMm}mm forecast over 24h &middot; relief {recon.reliefM}m across{' '}
            {recon.elevations.length} terrain samples
          </p>

          <p className="mt-3 flex items-start gap-1.5 rounded-control border border-warning/30 bg-warning/10 p-2 text-micro leading-relaxed text-fg-soft">
            <Info className="mt-px h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
            <span>{recon.caveat}</span>
          </p>

          <p className="mt-2 text-micro text-subtle">
            Terrain and rainfall:{' '}
            <a
              href="https://open-meteo.com/"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              Open-Meteo
            </a>
            . Boundary:{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              OpenStreetMap
            </a>
            .
          </p>
        </>
      )}
    </section>
  );
}
