import React, { useEffect, useRef, useState } from 'react';
import { Bot, X } from 'lucide-react';
import { CityData, SimulationParams, ZoneData, ZoneRiskAssessment } from '../types';
import { AssistantConversation } from './AssistantConversation';

/**
 * The assistant, in the corner of every screen.
 *
 * It began as an eleventh tab, which meant the one thing you would want while
 * looking at a map, a street list or a dispatch queue was the one thing you
 * had to leave them to reach. A question about a ward arrives while you are
 * looking at that ward. So it now sits over the page and opens in place, and
 * the tab is gone rather than duplicated.
 *
 * Stacking, which took two attempts to get right. The panel must sit above
 * the sticky header - at z-40 the header drew straight over the top of the
 * open panel and took the Report row with it - so it is z-50, the same as the
 * header and the modals. The modals are rendered after this in App, so at
 * equal z-index they still win, which is the order that matters: the
 * assistant must never cover an evacuation dialog.
 */

interface Props {
  city: CityData;
  zones: ZoneData[];
  assessments: ZoneRiskAssessment[];
  simulationParams: SimulationParams;
  /** The translated word for "Assistant", so the label follows the language. */
  label: string;
}

export function AssistantDock({ city, zones, assessments, simulationParams, label }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Escape closes it, which is what every other overlay in the app does and
  // what anyone who has used a chat widget will try first.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Move focus into the panel when it opens, so a keyboard user is not left
  // behind on the button with the panel open in front of them.
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('textarea')?.focus();
  }, [open]);

  return (
    <>
      {/*
        On a phone the panel covers most of the screen, so the page behind it
        is dimmed rather than left competing for attention - and tapping the
        dimmed part closes it, which is what a sheet is expected to do. Above
        that width the panel is a card in the corner and the page stays live.
      */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-[45] bg-black/50 sm:hidden"
        />
      )}

      {/*
        Hidden rather than unmounted, so closing the dock does not throw the
        conversation away. Unmounting it took the messages with it, which
        meant shutting the panel to look at the map behind it - the whole
        reason it is a dock and not a tab - lost everything asked so far.
      */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label={label}
        aria-hidden={!open}
        data-testid="assistant-panel"
        data-open={open ? '1' : '0'}
        className={[
          // glass-solid, not glass: this floats over the page, and at the
          // translucent alpha the tab strip read through the conversation.
          'glass-solid fixed z-50 flex-col rounded-panel border border-line-strong/60 shadow-2xl',
          // Phone: a sheet across the bottom, because a 360px screen has no
          // corner to spare. Larger: a card that leaves the page visible.
          'inset-x-3 bottom-[5.5rem] max-h-[min(30rem,62vh)]',
          'sm:inset-x-auto sm:right-5 sm:bottom-24 sm:w-[26rem] sm:max-h-[32rem]',
          'p-4 pad-safe-bottom',
          open ? 'flex' : 'hidden',
        ].join(' ')}
      >
          <header className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-micro uppercase tracking-[0.16em] text-subtle">
                {city.name} · {zones.length} wards
              </p>
              <h2 className="flex items-center gap-2 font-display text-sm font-bold text-fg">
                <Bot className="h-4 w-4 text-accent" aria-hidden="true" />
                {label}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
              }}
              aria-label="Close the assistant"
              className="-mr-1 -mt-1 rounded-control p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <AssistantConversation
            city={city}
            zones={zones}
            assessments={assessments}
            simulationParams={simulationParams}
            variant="dock"
          />
      </div>

      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        data-testid="assistant-fab"
        className={[
          'fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full',
          'border border-accent/40 bg-accent px-4 py-3 text-on-accent shadow-2xl',
          'transition-transform hover:scale-105 active:scale-95',
          'pad-safe-bottom',
        ].join(' ')}
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Bot className="h-5 w-5" aria-hidden="true" />
        )}
        <span className="hidden text-xs font-semibold sm:inline">{label}</span>
      </button>
    </>
  );
}
