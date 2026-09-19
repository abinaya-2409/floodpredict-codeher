import React, { useMemo, useState } from 'react';
import { Check, Copy, FileText, RefreshCw, Sparkles } from 'lucide-react';
import { CityData, SimulationParams, ZoneData, ZoneRiskAssessment } from '../types';
import {
  IncidentBriefing,
  briefingToProse,
  briefingToText,
  buildIncidentBriefing,
} from '../utils/briefing';

/**
 * The incident briefing.
 *
 * This used to be a button that called Gemini and, when the key was rejected
 * - which it has been in production for weeks - showed invented prose in its
 * place. The briefing is now composed from the application's own model, so it
 * appears instantly, needs no key, and every figure in it is traceable to a
 * number the app computed.
 *
 * A language model is still offered, but only to rewrite these same facts
 * into flowing prose, and only when a key is configured. The facts never come
 * from the model, so the worst a missing or broken key can do is leave you
 * with the structured version - which is the one an officer would rather have
 * anyway.
 */

interface Props {
  city: CityData;
  zones: ZoneData[];
  assessments: ZoneRiskAssessment[];
  simulationParams: SimulationParams;
}

const SEVERITY: Record<
  IncidentBriefing['severity'],
  { label: string; className: string }
> = {
  routine: { label: 'Routine', className: 'border-risk-low/40 bg-risk-low/10 text-risk-low-ink' },
  watch: { label: 'Watch', className: 'border-risk-moderate/40 bg-risk-moderate/10 text-risk-moderate-ink' },
  warning: { label: 'Warning', className: 'border-risk-high/40 bg-risk-high/10 text-risk-high-ink' },
  emergency: {
    label: 'Emergency',
    className: 'border-risk-critical/45 bg-risk-critical/12 text-risk-critical-ink',
  },
};

export const IncidentBriefingPanel: React.FC<Props> = ({
  city,
  zones,
  assessments,
  simulationParams,
}) => {
  // Recomputed from state, so it is never stale against the map beside it.
  const briefing = useMemo(
    () => buildIncidentBriefing(city, zones, assessments, simulationParams),
    [city, zones, assessments, simulationParams]
  );

  const [prose, setProse] = useState<string | null>(null);
  /** Who wrote the prose on screen, so the panel can say so. */
  const [proseSource, setProseSource] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [writeNote, setWriteNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const severity = SEVERITY[briefing.severity];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prose ?? briefingToText(briefing));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is blocked in some embedded contexts; the text is on screen.
    }
  };

  /**
   * Turns the briefing into prose.
   *
   * The app composes it first, from the same computed facts, so the button
   * always does something - including with no network, which is the state
   * this application exists for. A language model, when one is configured,
   * then replaces that with a better-written version of the same facts.
   *
   * Previously this asked the server first and showed a configuration
   * notice when no key was set, so on every deployment without a key the
   * button was decoration.
   */
  const rewrite = async () => {
    const local = briefingToProse(briefing);
    setProse(local);
    setProseSource('the app');
    setWriteNote(null);
    setWriting(true);

    try {
      const res = await fetch('/api/briefing/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ briefing }),
      });
      const data = await res.json();
      if (data.prose) {
        setProse(data.prose);
        setProseSource(data.model ?? 'a language model');
      } else if (data.message) {
        setWriteNote(data.message);
      }
    } catch {
      // Offline is the expected case here, not a failure worth shouting
      // about: the prose is already on screen.
      setWriteNote('No network, so this was written by the app itself.');
    } finally {
      setWriting(false);
    }
  };

  return (
    <div
      id="incident-briefing"
      className="glass rounded-panel border border-line-strong/60 p-5 shadow-2xl"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-accent/30 bg-accent/12 text-accent">
            <FileText className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <p className="font-mono text-nano uppercase tracking-[0.16em] text-muted">
              Incident briefing
            </p>
            <h2 className="text-lg font-bold tracking-tight text-fg">{city.name}</h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-nano font-bold uppercase tracking-wide ${severity.className}`}
          >
            {severity.label}
          </span>
          <button
            onClick={copy}
            className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface-2/70 px-3 text-mini font-semibold text-fg-soft transition-colors hover:text-fg cursor-pointer"
          >
            {copied ? (
              <Check className="h-3 w-3 text-risk-low-ink" aria-hidden="true" />
            ) : (
              <Copy className="h-3 w-3" aria-hidden="true" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={rewrite}
            disabled={writing}
            title="Rewrite these same facts as flowing prose"
            className="flex h-8 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 text-mini font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-50 cursor-pointer"
          >
            {writing ? (
              <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3 w-3" aria-hidden="true" />
            )}
            {writing ? 'Writing' : 'Read as prose'}
          </button>
        </div>
      </div>

      <p className="mt-3 rounded-card border border-line/70 bg-surface/60 px-3.5 py-2.5 text-sm font-semibold leading-relaxed text-fg">
        {briefing.headline}
      </p>

      {writeNote && (
        <p className="mt-2 rounded-card border border-line/70 bg-surface-2/60 px-3 py-2 text-nano leading-relaxed text-muted">
          {writeNote}
        </p>
      )}

      {prose ? (
        <div className="mt-3 space-y-2">
          <p className="font-mono text-nano uppercase tracking-[0.14em] text-muted">
            As prose &middot; written by {proseSource ?? 'the app'}
          </p>
          <p className="whitespace-pre-wrap rounded-card border border-line/70 bg-bg/60 p-3.5 text-mini leading-relaxed text-fg-soft">
            {prose}
          </p>
          <button
            onClick={() => setProse(null)}
            className="text-nano font-semibold text-accent hover:underline cursor-pointer"
          >
            Show the computed briefing instead
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {briefing.sections.map((section) => (
            <section key={section.heading}>
              <h3 className="mb-1 font-mono text-nano uppercase tracking-[0.14em] text-muted">
                {section.heading}
              </h3>
              <ul className="space-y-1">
                {section.lines.map((line, i) => (
                  <li
                    key={i}
                    className="flex gap-2 rounded-card bg-surface-2/40 px-2.5 py-1.5 text-mini leading-relaxed text-fg-soft"
                  >
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-3 border-t border-line/60 pt-2 text-nano leading-relaxed text-subtle">
        {briefing.basis}
      </p>
    </div>
  );
};
