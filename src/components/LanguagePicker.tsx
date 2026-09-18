import React, { useEffect, useRef, useState } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import { LANGUAGES, Language } from '../utils/translations';

/**
 * Language chooser.
 *
 * Replaces a two-way English/Tamil toggle, which could not express nine
 * languages and gave no way to tell which one you were about to get. Each
 * option is written in its own script, because that is how a speaker
 * recognises their language in a list - not by its English name.
 */
export function LanguagePicker({
  language,
  onChange,
}: {
  language: Language;
  onChange: (l: Language) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.id === language) ?? LANGUAGES[0];

  // Close on outside click and on Escape, as any menu should.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${current.english}. Change language`}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 text-xs font-semibold text-fg-soft transition-colors hover:border-line-strong hover:bg-surface-3 hover:text-fg cursor-pointer"
      >
        <Globe className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
        <span>{current.endonym}</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Choose language"
          className="absolute right-0 top-11 z-[1200] w-52 overflow-hidden rounded-card border border-line bg-surface shadow-2xl"
        >
          {LANGUAGES.map((l) => {
            const selected = l.id === language;
            return (
              <li key={l.id} role="option" aria-selected={selected}>
                <button
                  onClick={() => {
                    onChange(l.id);
                    setOpen(false);
                  }}
                  lang={l.id}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors cursor-pointer ${
                    selected ? 'bg-accent/12 text-accent' : 'text-fg-soft hover:bg-surface-2'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold">{l.endonym}</span>
                    <span className="block text-micro text-subtle">{l.english}</span>
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
