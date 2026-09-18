import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * The one dropdown in the application.
 *
 * It exists because the map tab was showing 54 controls at once, most of them
 * rows of pills where only one could be chosen at a time: four basemaps, four
 * scenario multipliers, four field layers, ten tabs. A row of pills is a fine
 * control for two or three choices that a user compares at a glance. Past
 * that it is a menu that has been unrolled across the screen, and it costs
 * horizontal space that the map needs more.
 *
 * Deliberately not a native <select>: the options carry icons, secondary
 * lines and disabled states that a native option cannot render, and the
 * trigger has to sit inside a dense toolbar without inheriting the platform
 * chrome. That means the keyboard and focus behaviour a native select gives
 * for free has to be built, which is what most of this file is.
 */

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Second line in the menu; never shown on the trigger. */
  hint?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface Props<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Screen-reader name, and the tooltip on the trigger. */
  label: string;
  /** Shown before the value on the trigger, for toolbars with no room for a <label>. */
  prefix?: string;
  /**
   * What the trigger reads when `value` matches no option.
   *
   * Without this the trigger fell back to the first option and presented it
   * as chosen - a menu grouping four sections showed "Street Risk" while the
   * user was on a different tab entirely.
   */
  placeholder?: string;
  size?: 'sm' | 'md';
  /** Right-aligns the menu, for triggers near the right edge. */
  align?: 'left' | 'right';
  className?: string;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  prefix,
  placeholder,
  size = 'md',
  align = 'left',
  className = '',
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();

  const selected = options.find((o) => o.value === value) ?? null;

  // Close on any click that lands outside, including on another trigger.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Opening with the keyboard should land on the current value, not the top.
  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const t = window.setTimeout(() => listRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, options, value]);

  const step = (from: number, dir: 1 | -1) => {
    // Skip disabled entries rather than letting the cursor stall on them.
    for (let i = 1; i <= options.length; i++) {
      const next = (from + dir * i + options.length * i) % options.length;
      if (!options[next]?.disabled) return next;
    }
    return from;
  };

  const commit = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => step(i, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => step(i, -1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(step(-1, 1));
        break;
      case 'End':
        e.preventDefault();
        setActive(step(options.length, -1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(active);
        break;
    }
  };

  const trigger =
    size === 'sm' ? 'h-7 px-2.5 text-mini gap-1.5' : 'h-8 px-3 text-xs gap-2';

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex items-center rounded-full border font-semibold transition-colors cursor-pointer ${trigger} ${
          open
            ? 'border-accent/60 bg-surface-3 text-fg'
            : 'border-line bg-surface-2/70 text-fg-soft hover:border-line-strong hover:text-fg'
        }`}
      >
        {selected?.icon}
        {prefix && selected && <span className="text-muted">{prefix}</span>}
        <span className={`truncate ${selected ? '' : 'text-muted'}`}>
          {selected ? selected.label : (placeholder ?? prefix ?? label)}
        </span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={id}
          role="listbox"
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={`absolute top-[calc(100%+0.35rem)] z-[1300] max-h-72 min-w-full overflow-y-auto rounded-card border border-line-strong bg-surface p-1 shadow-2xl outline-none backdrop-blur ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {options.map((option, i) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value} id={`${id}-${i}`} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  disabled={option.disabled}
                  onClick={() => commit(i)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-start gap-2 rounded-card px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    i === active ? 'bg-surface-3' : ''
                  }`}
                >
                  {option.icon && <span className="mt-0.5 shrink-0">{option.icon}</span>}
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-xs font-semibold ${
                        isSelected ? 'text-accent' : 'text-fg'
                      }`}
                    >
                      {option.label}
                    </span>
                    {option.hint && (
                      <span className="block text-nano leading-snug text-subtle">
                        {option.hint}
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
