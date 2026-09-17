import React from 'react';

/**
 * The container every block of the interface sits in.
 *
 * One card style, one padding rhythm, one header shape - which is what makes
 * a dense operational screen feel designed rather than assembled.
 */

export interface PanelProps {
  title?: React.ReactNode;
  /** Small label above the title, e.g. "Selected catchment". */
  eyebrow?: string;
  icon?: React.ReactNode;
  /** Right-aligned content in the header: a status pill, a control. */
  action?: React.ReactNode;
  /** Sub-panels nested inside another Panel drop the glass treatment. */
  flat?: boolean;
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Panel({
  title,
  eyebrow,
  icon,
  action,
  flat = false,
  padded = true,
  className = '',
  children,
}: PanelProps) {
  const labelId = React.useId();

  return (
    <section
      aria-labelledby={title ? labelId : undefined}
      className={[
        flat
          ? 'bg-surface-2/50 border border-line rounded-card'
          : 'glass rounded-panel',
        padded ? 'p-4 sm:p-5' : '',
        className,
      ].join(' ')}
    >
      {(title || action) && (
        <header
          className={[
            'flex items-start justify-between gap-4',
            padded ? 'mb-4' : 'p-4 pb-3',
          ].join(' ')}
        >
          <div className="min-w-0">
            {eyebrow && (
              <p className="mb-1 font-mono text-micro uppercase tracking-[0.16em] text-subtle">
                {eyebrow}
              </p>
            )}
            {title && (
              <h3
                id={labelId}
                className="flex items-center gap-2 font-display text-sm font-bold text-fg"
              >
                {icon}
                <span className="truncate">{title}</span>
              </h3>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
