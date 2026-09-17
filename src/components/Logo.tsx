import React from 'react';

/**
 * JalRakshak mark.
 *
 * Same drawing language as the Meridian logo: one 32-unit viewBox, uniform
 * 2.4 strokes in currentColor, and a single filled accent node. Here the
 * circle is the catchment, the two arcs are the rising waterline, and the
 * node is the ward being watched.
 */
export function LogoMark({
  className = '',
  title = 'JalRakshak',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      {/* Catchment boundary */}
      <circle cx="16" cy="16" r="12.5" stroke="currentColor" strokeWidth="2.4" />
      {/* Waterline at rest */}
      <path
        d="M4.2 18.4c2.6 0 2.6-2.2 5.2-2.2s2.6 2.2 5.2 2.2 2.6-2.2 5.2-2.2 2.6 2.2 5.2 2.2"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* Waterline rising */}
      <path
        d="M6.4 23.2c2.2 0 2.2-1.9 4.4-1.9s2.2 1.9 4.4 1.9 2.2-1.9 4.4-1.9 2.2 1.9 4.4 1.9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* The ward under watch */}
      <circle cx="16" cy="9.8" r="2.6" fill="currentColor" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark className="h-7 w-7 shrink-0 text-accent" />
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-[15px] font-extrabold tracking-tight text-fg">
            JalRakshak
          </span>
          <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-subtle">
            Flood Intelligence
          </span>
        </span>
      )}
    </span>
  );
}
