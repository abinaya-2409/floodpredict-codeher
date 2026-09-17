import React from 'react';
import { ListOrdered, ArrowRight, Accessibility, Timer } from 'lucide-react';
import { ZoneRiskAssessment } from '../types';

const RISK_VAR: Record<string, string> = {
  low: 'var(--color-risk-low)',
  moderate: 'var(--color-risk-moderate)',
  high: 'var(--color-risk-high)',
  severe: 'var(--color-risk-severe)',
  critical: 'var(--color-risk-critical)',
};

/**
 * Auto-ranked evacuation order.
 *
 * Nothing in this list is hand-authored: the order falls out of the composite
 * index weighted by how soon each zone crosses its critical level.
 */
export function EvacuationPriorityQueue({
  queue,
  selectedZoneId,
  onSelectZone,
}: {
  queue: ZoneRiskAssessment[];
  selectedZoneId: string;
  onSelectZone: (zoneId: string) => void;
}) {
  return (
    <section className="glass rounded-2xl p-5" aria-labelledby="evac-queue-heading">
      <header className="mb-4">
        <h3
          id="evac-queue-heading"
          className="flex items-center gap-2 font-display text-sm font-bold text-fg"
        >
          <ListOrdered className="h-4 w-4 text-accent" aria-hidden="true" />
          Evacuation Priority Queue
        </h3>
        <p className="mt-1 text-[11px] text-subtle">
          Ranked by vulnerability index weighted by time to critical level - recomputed
          live from the current scenario.
        </p>
      </header>

      <ol className="space-y-2">
        {queue.map((a, i) => {
          const color = RISK_VAR[a.band];
          const isSelected = a.zoneId === selectedZoneId;
          return (
            <li key={a.zoneId}>
              <button
                onClick={() => onSelectZone(a.zoneId)}
                aria-current={isSelected ? 'true' : undefined}
                className={[
                  'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  isSelected
                    ? 'border-accent bg-accent/10'
                    : 'border-line bg-surface-2/50 hover:border-line-strong hover:bg-surface-3/60',
                ].join(' ')}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold"
                  style={{
                    color,
                    backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
                  }}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-fg">
                    {a.zoneName}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-subtle">
                    <span className="inline-flex items-center gap-1">
                      <Accessibility className="h-2.5 w-2.5" aria-hidden="true" />
                      {a.assistedEvacuationNeeded.toLocaleString('en-IN')} need assistance
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Timer className="h-2.5 w-2.5" aria-hidden="true" />
                      {a.leadTimeToFloodMins >= 60
                        ? `${(a.leadTimeToFloodMins / 60).toFixed(1)}h`
                        : `${a.leadTimeToFloodMins}m`}{' '}
                      lead
                    </span>
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-bold" style={{ color }}>
                    {a.vri}
                  </span>
                  <span className="block text-[9px] uppercase tracking-wider text-subtle">
                    VRI
                  </span>
                </span>

                <ArrowRight
                  className="h-3.5 w-3.5 shrink-0 text-subtle"
                  aria-hidden="true"
                />
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
