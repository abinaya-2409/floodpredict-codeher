import React from 'react';

/**
 * FloodyPredict mark: a staff gauge.
 *
 * The staff gauge is the oldest instrument in flood measurement - the
 * graduated post set into a river bank or bridge pier, read by eye, still
 * standing at gauging stations across India. It is the literal object this
 * software replaces.
 *
 * It was chosen over the shield it replaces because a shield says "security
 * product" and could belong to any of a thousand apps; a graduated post with
 * a waterline against it says one thing only. Three elements, no gradients,
 * no enclosure - the things that make a mark read as drawn rather than
 * generated.
 *
 * The waterline crosses below the midpoint: a gauge reading near the top is
 * the emergency, not the resting state.
 */
export function LogoMark({
  className = '',
  title = 'FloodyPredict',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      {/* The post. */}
      <path d="M9 2.5v19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />

      {/* Graduations: long, short, long, short - how a gauge is numbered. */}
      <path
        d="M9 6h6M9 9.5h3.5M9 13h6M9 16.5h3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* The waterline, reading against the post. */}
      <path
        d="M2 18.2c1.85 0 1.85-1.5 3.7-1.5s1.85 1.5 3.7 1.5 1.85-1.5 3.7-1.5 1.85 1.5 3.7 1.5 1.85-1.5 3.7-1.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className="h-7 w-7 shrink-0 text-accent" />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-sm font-extrabold tracking-tight text-fg">
            FloodyPredict
          </span>
          <span className="mt-0.5 text-micro font-medium uppercase tracking-[0.16em] text-subtle">
            Flood Intelligence
          </span>
        </span>
      )}
    </span>
  );
}
