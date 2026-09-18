import React from 'react';
import { Loader2, Pause, Play, X } from 'lucide-react';
import { ForecastMode, PointForecast } from '../utils/pointForecast';
import { historyForPoint } from '../utils/tnHistory';
import { useThemeTokens } from '../theme/useThemeTokens';

/**
 * The readout for a clicked point.
 *
 * Built around the timeline rather than a single number, because the question
 * a responder actually asks is "when", not "how deep" - a peak of 40cm in
 * nine hours and a peak of 40cm in forty minutes call for different orders.
 * Scrubbing the bar chart drives the water on the map, so the chart and the
 * map are two views of one simulation instead of two separate widgets.
 */

interface Props {
  forecast: PointForecast | null;
  loading: boolean;
  error: string | null;
  hour: number;
  playing: boolean;
  mode: ForecastMode;
  /** The what-if storm, mirrored from the map's rainfall scenario. */
  scenarioMmHr: number;
  scenarioHours: number;
  onScenarioChange: (mmHr: number, hours: number) => void;
  onHourChange: (h: number) => void;
  onTogglePlay: () => void;
  onModeChange: (m: ForecastMode) => void;
  onDismiss: () => void;
}

const HOURS_SHOWN = 48;

function formatLead(mins: number | null): string {
  if (mins === null) return 'Not in 48h';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const PointPredictionPanel: React.FC<Props> = ({
  forecast,
  loading,
  error,
  hour,
  playing,
  mode,
  scenarioMmHr,
  scenarioHours,
  onScenarioChange,
  onHourChange,
  onTogglePlay,
  onModeChange,
  onDismiss,
}) => {
  const tokens = useThemeTokens();

  // Only take the whole panel on the first read. Switching source or point
  // with a result already on screen used to blank everything and bring it
  // back a second later, which reads as a crash rather than as a refresh.
  if (loading && !forecast) {
    return (
      <div className="glass rounded-card border border-accent/30 p-4 shadow-2xl">
        <div className="flex items-center gap-2.5 text-mini text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden="true" />
          <span>Sampling terrain and forecast for that point&hellip;</span>
        </div>
      </div>
    );
  }

  if (error && !forecast) {
    return (
      <div className="glass rounded-card border border-risk-severe/40 p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <p className="text-mini text-fg-soft">{error}</p>
          <button
            onClick={onDismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-surface-3 hover:text-fg cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (!forecast) return null;

  const steps = forecast.curve.slice(0, HOURS_SHOWN);
  const now = steps[Math.min(hour, steps.length - 1)];
  const maxDepth = Math.max(10, ...steps.map((s) => s.depthCm));
  const maxRain = Math.max(1, ...steps.map((s) => s.rainMmHr));
  const bandColor = tokens.risk[now.band];
  const quiet = forecast.peakDepthCm === 0;

  return (
    <div className="glass flex max-h-full flex-col overflow-hidden rounded-card border border-accent/30 shadow-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-line/70 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-nano uppercase tracking-[0.16em] text-muted">
            Point prediction
          </p>
          <h3 className="truncate text-xs font-bold text-fg">{forecast.label}</h3>
          <p className="font-mono text-nano text-subtle">
            {forecast.lat.toFixed(4)}, {forecast.lon.toFixed(4)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {loading && (
            <Loader2
              className="h-3.5 w-3.5 animate-spin text-accent"
              aria-label="Recalculating"
            />
          )}
          <button
            onClick={onDismiss}
            aria-label="Clear prediction"
            className="rounded-full p-1 text-muted transition-colors hover:bg-surface-3 hover:text-fg cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        className={`min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3 transition-opacity ${
          loading ? 'pointer-events-none opacity-50' : ''
        }`}
        aria-busy={loading}
      >
        {/* Forecast vs what-if. The distinction matters enough to be a
            control rather than a footnote: one is a claim about the world,
            the other is a question about it. */}
        <div
          role="radiogroup"
          aria-label="Prediction source"
          className="flex rounded-full border border-line bg-surface-2/70 p-0.5"
        >
          {(
            [
              ['live', 'Live forecast'],
              ['scenario', 'What-if storm'],
            ] as [ForecastMode, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              role="radio"
              aria-checked={mode === id}
              onClick={() => onModeChange(id)}
              className={`flex-1 rounded-full px-2 py-1 text-nano font-semibold transition-colors cursor-pointer ${
                mode === id ? 'bg-accent text-on-accent' : 'text-muted hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/*
          The storm being asked about, next to the answer.
          Recomputing is local and synchronous, so this redraws the map as the
          thumb moves - which is the whole reason it is worth having here
          rather than only on the floating control behind the panel.
        */}
        {mode === 'scenario' && (
          <div className="rounded-card border border-line/70 bg-surface/50 px-3 py-2">
            <div className="flex items-baseline justify-between">
              <label
                htmlFor="whatif-intensity"
                className="font-mono text-nano uppercase tracking-[0.14em] text-muted"
              >
                Storm intensity
              </label>
              <span className="font-mono text-mini font-bold text-accent">
                {scenarioMmHr} mm/hr
              </span>
            </div>
            <input
              id="whatif-intensity"
              type="range"
              min={10}
              max={200}
              step={5}
              value={scenarioMmHr}
              onChange={(e) => onScenarioChange(Number(e.target.value), scenarioHours)}
              className="fluid-slider mt-1.5 w-full"
            />
            <div className="mt-1 flex items-baseline justify-between">
              <label
                htmlFor="whatif-duration"
                className="font-mono text-nano uppercase tracking-[0.14em] text-muted"
              >
                Held for
              </label>
              <span className="font-mono text-mini font-bold text-accent">{scenarioHours}h</span>
            </div>
            <input
              id="whatif-duration"
              type="range"
              min={1}
              max={24}
              step={1}
              value={scenarioHours}
              onChange={(e) => onScenarioChange(scenarioMmHr, Number(e.target.value))}
              className="fluid-slider mt-1.5 w-full"
            />
          </div>
        )}

        {/* Headline depth at the scrubbed hour. */}
        <div className="rounded-card border border-line/70 bg-surface/60 px-3 py-2.5">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-nano uppercase tracking-[0.14em] text-muted">
              Standing water at +{hour}h
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-nano font-bold uppercase tracking-wide"
              style={{ background: `${bandColor}22`, color: bandColor }}
            >
              {now.band}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-bold" style={{ color: bandColor }}>
              {now.depthCm}
            </span>
            <span className="text-mini text-muted">cm</span>
            <span className="ml-auto font-mono text-nano text-subtle">
              {now.rainMmHr} mm/hr falling
            </span>
          </div>
        </div>

        {/*
          The timeline. Rain is drawn behind the water so cause sits behind
          effect: the depth line lags the bars it comes from, which is the
          whole point of a storage model and is invisible in a single figure.
        */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-nano uppercase tracking-[0.14em] text-muted">
              48-hour run
            </span>
            <button
              onClick={onTogglePlay}
              aria-label={playing ? 'Pause simulation' : 'Play simulation'}
              className="flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-nano font-semibold text-fg-soft transition-colors hover:border-accent/60 hover:text-fg cursor-pointer"
            >
              {playing ? (
                <Pause className="h-2.5 w-2.5" aria-hidden="true" />
              ) : (
                <Play className="h-2.5 w-2.5" aria-hidden="true" />
              )}
              {playing ? 'Pause' : 'Play'}
            </button>
          </div>

          <svg
            viewBox={`0 0 ${HOURS_SHOWN * 4} 56`}
            preserveAspectRatio="none"
            className="h-16 w-full cursor-pointer"
            role="img"
            aria-label={`Predicted depth over 48 hours, peaking at ${forecast.peakDepthCm} centimetres after ${forecast.peakAtHour} hours`}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const frac = (e.clientX - r.left) / r.width;
              onHourChange(Math.max(0, Math.min(HOURS_SHOWN - 1, Math.round(frac * HOURS_SHOWN))));
            }}
          >
            {/* Rainfall, behind. */}
            {steps.map((s, i) => (
              <rect
                key={`r${i}`}
                x={i * 4 + 0.6}
                y={56 - (s.rainMmHr / maxRain) * 22}
                width={2.8}
                height={(s.rainMmHr / maxRain) * 22}
                fill={tokens.accent}
                opacity={0.22}
              />
            ))}
            {/* Water depth, in front, coloured by its own band. */}
            {steps.map((s, i) => (
              <rect
                key={`d${i}`}
                x={i * 4 + 0.6}
                y={52 - (s.depthCm / maxDepth) * 44}
                width={2.8}
                height={Math.max(0.6, (s.depthCm / maxDepth) * 44)}
                fill={tokens.risk[s.band]}
                opacity={i === hour ? 1 : 0.72}
              />
            ))}
            {/* Scrub position. */}
            <rect x={hour * 4} y={0} width={4} height={56} fill={tokens.fg} opacity={0.18} />
          </svg>

          <input
            type="range"
            min={0}
            max={HOURS_SHOWN - 1}
            value={hour}
            aria-label="Hour of the simulation"
            onChange={(e) => onHourChange(Number(e.target.value))}
            className="fluid-slider mt-1 w-full"
          />
          <div className="flex justify-between font-mono text-nano text-subtle">
            <span>now</span>
            <span>+24h</span>
            <span>+48h</span>
          </div>
        </div>

        {/* Derived figures. */}
        <dl className="grid grid-cols-2 gap-1.5">
          {[
            ['Peak depth', `${forecast.peakDepthCm} cm`, `at +${forecast.peakAtHour}h`],
            ['Time to flood', formatLead(forecast.timeToFloodMins), 'to reach 15cm'],
            [
              'Drains away',
              quiet ? '—' : `${forecast.drainAwayHours}h`,
              'after the peak',
            ],
            [
              'Floods above',
              `${forecast.drainageThresholdMmHr} mm/hr`,
              'local drainage limit',
            ],
          ].map(([k, v, note]) => (
            <div key={k} className="rounded-card border border-line/60 bg-surface/50 px-2.5 py-1.5">
              <dt className="font-mono text-nano uppercase tracking-wide text-muted">{k}</dt>
              <dd className="font-mono text-sm font-bold text-fg">{v}</dd>
              <dd className="text-nano text-subtle">{note}</dd>
            </div>
          ))}
        </dl>

        {/* A quiet forecast is a result, not an absence of one. */}
        {quiet && mode === 'live' && (
          <p className="rounded-card border border-risk-low/30 bg-risk-low/10 px-2.5 py-2 text-nano leading-relaxed text-fg-soft">
            No standing water expected here in 48 hours. The forecast peaks at{' '}
            <strong>{forecast.rainfall.peak24hMmHr} mm/hr</strong>, under this ground&rsquo;s{' '}
            <strong>{forecast.drainageThresholdMmHr} mm/hr</strong> drainage limit. Switch to
            What-if to push it past that.
          </p>
        )}

        {/* Terrain read. */}
        <div className="grid grid-cols-3 gap-1.5 font-mono text-nano">
          {[
            ['Elevation', `${forecast.elevationM}m`],
            [
              forecast.sinkDepthM > 0 ? 'In hollow' : 'Above area',
              `${Math.abs(forecast.sinkDepthM).toFixed(1)}m`,
            ],
            ['Gradient', `${forecast.slopePercent}%`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-card bg-surface-2/60 px-2 py-1">
              <span className="block text-subtle">{k}</span>
              <span className="block font-bold text-fg-soft">{v}</span>
            </div>
          ))}
        </div>

        {/*
          What has actually happened here.

          Deliberately below the forecast and visually separated from it: this
          is a record of past events, and none of it is an input to the number
          above. Eleven flood and cyclone events in ten years is context for a
          person, not a coefficient.
        */}
        {(() => {
          const history = historyForPoint(forecast.lat, forecast.lon);
          if (!history || !history.floodEvents.length) return null;
          const recent = [...history.floodEvents]
            .sort((a, b) => b.year - a.year)
            .slice(0, 4);

          return (
            <div className="rounded-card border border-line/70 bg-surface/50 px-2.5 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-mono text-nano uppercase tracking-[0.14em] text-muted">
                  Recorded here before
                </p>
                <span className="font-mono text-nano text-subtle">
                  nearest: {history.district}
                </span>
              </div>

              <p className="mt-1 text-nano leading-relaxed text-fg-soft">
                <strong className="text-fg">{history.floodCount}</strong> flood or cyclone
                {history.floodCount === 1 ? ' event' : ' events'} on record since 2016
                {history.floodDeaths > 0 && (
                  <>
                    , with <strong className="text-risk-severe">{history.floodDeaths}</strong>{' '}
                    recorded deaths across them
                  </>
                )}
                .
              </p>

              <ul className="mt-1.5 space-y-0.5">
                {recent.map((e) => (
                  <li key={e.id} className="flex items-baseline gap-1.5 text-nano">
                    <span className="font-mono font-bold text-accent">{e.year}</span>
                    <span className="min-w-0 flex-1 truncate text-fg-soft">{e.name}</span>
                    {e.deaths !== null && (
                      <span className="shrink-0 font-mono text-subtle">{e.deaths} dead</span>
                    )}
                  </li>
                ))}
              </ul>

              <p className="mt-1.5 text-nano leading-relaxed text-subtle">
                Past events, not a model input. The forecast above is unchanged by them.
              </p>
            </div>
          );
        })()}

        {/* Why. Ordered by how much each term moved the result. */}
        <div>
          <p className="mb-1 font-mono text-nano uppercase tracking-[0.14em] text-muted">
            What drives this
          </p>
          <ul className="space-y-1">
            {forecast.drivers.map((d) => (
              <li key={d.label} className="rounded-card bg-surface-2/50 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-nano font-bold text-fg-soft">{d.label}</span>
                  <span
                    className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-surface-3"
                    role="meter"
                    aria-valuenow={Math.round(d.weight * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${d.label} contribution`}
                  >
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${d.weight * 100}%` }}
                    />
                  </span>
                </div>
                <p className="mt-0.5 text-nano leading-snug text-subtle">{d.detail}</p>
              </li>
            ))}
          </ul>
        </div>

        <p className="border-t border-line/60 pt-2 text-nano leading-relaxed text-subtle">
          Built from a 9-point Copernicus DEM sample and the Open-Meteo hourly forecast for
          this coordinate ({forecast.confidence}). It carries no surveyed drain network, so
          treat it as a terrain-and-rainfall read, not a substitute for the modelled wards.
        </p>
      </div>
    </div>
  );
};
