import React, { useState } from 'react';
import { ExternalLink, AlertTriangle } from 'lucide-react';
import { TN_DISASTERS, TN_DISTRICT_FLOOD_COUNTS } from '../data/tnDisasterHistory';

/**
 * The Tamil Nadu disaster record, as it actually is.
 *
 * This replaced a panel headed "Machine Learning Ground-Truth Training" that
 * claimed the model was calibrated and validated against past inundation
 * data. It was not, and the three events beneath that claim carried invented
 * inundation areas and affected-population figures. Nothing here is invented:
 * every row is a sourced event, most carry a link to the government record,
 * and the fields the sources never published are shown as missing rather than
 * filled in.
 *
 * The most important thing on this screen is the note at the top. Eleven
 * flood and cyclone events cannot calibrate a hydrological model, and only
 * one of them has a published rainfall figure at all - so this is context for
 * a human reading a forecast, not training data.
 */

type Filter = 'flood' | 'all';

const HAZARD_LABEL: Record<string, string> = {
  cyclone: 'Cyclone',
  flood: 'Flood',
  drought: 'Drought',
  fireworks: 'Fireworks',
  industrial: 'Industrial',
  transport: 'Transport',
  structural: 'Structural',
  other: 'Other',
};

const HAZARD_TONE: Record<string, string> = {
  cyclone: 'text-risk-critical-ink border-risk-critical/40 bg-risk-critical/10',
  flood: 'text-risk-severe-ink border-risk-severe/40 bg-risk-severe/10',
  drought: 'text-risk-high-ink border-risk-high/40 bg-risk-high/10',
};

export const TnDisasterRecord: React.FC = () => {
  const [filter, setFilter] = useState<Filter>('flood');

  const events = TN_DISASTERS.filter((e) =>
    filter === 'flood' ? e.hazard === 'flood' || e.hazard === 'cyclone' : true
  ).sort((a, b) => b.year - a.year || (a.date < b.date ? 1 : -1));

  const withRainfall = TN_DISASTERS.filter((e) => e.isHydro && e.rainfallMm !== null).length;
  const floodCount = TN_DISASTERS.filter(
    (e) => e.hazard === 'flood' || e.hazard === 'cyclone'
  ).length;
  const topDistricts = Object.entries(TN_DISTRICT_FLOOD_COUNTS).slice(0, 6);

  return (
    <div className="space-y-4">
      {/* The honest framing, first and unmissable. */}
      <div className="flex gap-2.5 rounded-card border border-risk-high/35 bg-risk-high/10 p-3.5">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-risk-high-ink"
          aria-hidden="true"
        />
        <p className="text-xs leading-relaxed text-fg-soft">
          <span className="font-bold text-fg">This is a record, not a training set.</span>{' '}
          {floodCount} flood and cyclone events over ten years cannot calibrate a
          hydrological model, and only {withRainfall} of them carries a published rainfall
          figure. None records an observed water depth. It is used here for historical
          precedent and to sanity-check the model&rsquo;s ranking of districts &mdash; it is
          never fed into a prediction.
        </p>
      </div>

      {/* Which districts keep appearing. */}
      <div className="rounded-card border border-line bg-bg p-3.5">
        <p className="mb-2 font-mono text-nano uppercase tracking-[0.14em] text-muted">
          Districts by recorded flood and cyclone events
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {topDistricts.map(([district, count]) => (
            <li
              key={district}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2/70 px-2.5 py-1"
            >
              <span className="text-mini font-semibold text-fg-soft">{district}</span>
              <span className="font-mono text-nano font-bold text-accent">{count}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-nano leading-relaxed text-subtle">
          A count of how often a district was <em>named in a record</em>, which is not the
          same as how often it flooded. Chennai is the most reported place in the state for
          reasons that include it being Chennai.
        </p>
      </div>

      <div role="radiogroup" aria-label="Event filter" className="flex gap-1.5">
        {(
          [
            ['flood', `Flood and cyclone (${floodCount})`],
            ['all', `All recorded events (${TN_DISASTERS.length})`],
          ] as [Filter, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            role="radio"
            aria-checked={filter === id}
            onClick={() => setFilter(id)}
            className={`rounded-full border px-3 py-1 text-mini font-semibold transition-colors cursor-pointer ${
              filter === id
                ? 'border-accent bg-accent text-on-accent'
                : 'border-line text-muted hover:border-line-strong hover:text-fg'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="space-y-2.5">
        {events.map((e) => (
          <li key={e.id} className="rounded-card border border-line bg-bg p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-nano font-bold text-accent">
                  {e.year}
                </span>
                <span className="truncate text-sm font-bold text-fg">{e.name}</span>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-nano font-bold uppercase tracking-wide ${
                  HAZARD_TONE[e.hazard] ?? 'border-line text-muted'
                }`}
              >
                {HAZARD_LABEL[e.hazard] ?? e.hazard}
              </span>
            </div>

            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-mini">
              {e.deaths !== null && (
                <div>
                  <dt className="inline text-subtle">Deaths </dt>
                  <dd className="inline font-bold text-risk-severe-ink">{e.deaths}</dd>
                </div>
              )}
              {e.evacuated !== null && (
                <div>
                  <dt className="inline text-subtle">Evacuated </dt>
                  <dd className="inline font-bold text-fg-soft">
                    {e.evacuated.toLocaleString('en-IN')}
                  </dd>
                </div>
              )}
              {e.damageCrore !== null && (
                <div>
                  <dt className="inline text-subtle">Assessed </dt>
                  <dd className="inline font-bold text-fg-soft">
                    &#8377;{e.damageCrore.toLocaleString('en-IN')} cr
                  </dd>
                </div>
              )}
              {e.rainfallMm !== null && (
                <div>
                  <dt className="inline text-subtle">Rainfall </dt>
                  <dd className="inline font-bold text-accent">{e.rainfallMm} mm</dd>
                </div>
              )}
              {e.windKmh !== null && (
                <div>
                  <dt className="inline text-subtle">Wind </dt>
                  <dd className="inline font-bold text-fg-soft">{e.windKmh} km/h</dd>
                </div>
              )}
            </dl>

            {e.districts.length > 0 && (
              <p className="mt-1.5 text-nano leading-relaxed text-muted">
                <span className="text-subtle">Districts: </span>
                {e.districts.join(', ')}
                {e.substitutedDistricts.length > 0 && (
                  <span className="text-subtle">
                    {' '}
                    (post-2011 districts shown under their parent)
                  </span>
                )}
              </p>
            )}

            {e.infrastructure && (
              <p className="mt-1 text-nano leading-relaxed text-subtle">{e.infrastructure}</p>
            )}

            {/* Where the sources disagree, say so rather than picking one. */}
            {(e.variants.length > 0 || e.deathsRaw) && (
              <p className="mt-1.5 rounded border border-risk-high/30 bg-risk-high/10 px-2 py-1 text-nano leading-relaxed text-fg-soft">
                <span className="font-bold">Sources differ: </span>
                {e.deathsRaw ?? e.variants.join('; ')}
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/70 pt-1.5 text-nano text-subtle">
              <span>{e.sourceType}</span>
              {e.sourceUrl && (
                <a
                  href={e.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent transition-colors hover:text-accent-soft"
                >
                  Source
                  <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                </a>
              )}
              {e.damageBasis && <span className="basis-full">{e.damageBasis}</span>}
              {e.limitations && (
                <span className="basis-full italic">{e.limitations}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
