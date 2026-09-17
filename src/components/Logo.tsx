import React from 'react';

/**
 * JalRakshak mark.
 *
 * A shield whose lower half is held by water, crossed by a level line.
 * Three ideas in one silhouette: protection (rakshak), water (jal), and a
 * measured level - which is precisely what the application does.
 *
 * The previous mark was a circle with two wave lines: readable, but generic
 * enough to belong to any water utility, and the lower wave collapsed into
 * mush below about 20px. A shield holds its silhouette at favicon size and
 * says "protection" before any detail resolves.
 *
 * Drawn on a 32-unit grid in currentColor, so it inherits its colour from
 * whatever it sits in.
 */
export function LogoMark({
  className = '',
  title = 'JalRakshak',
}: {
  className?: string;
  title?: string;
}) {
  // Two instances on one page must not share a clip path id.
  const clipId = React.useId();
  const shield = 'M16 2.6 27 6.4v8.2c0 7.1-6.3 12.3-11 14.8-4.7-2.5-11-7.7-11-14.8V6.4z';

  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={shield} />
        </clipPath>
      </defs>

      {/* Water, clipped to the shield and held at its midpoint. */}
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M1 18.6c2.7 0 2.7-2.2 5.4-2.2s2.7 2.2 5.4 2.2 2.7-2.2 5.4-2.2 2.7 2.2 5.4 2.2 2.7-2.2 5.4-2.2V32H1z"
          fill="currentColor"
          fillOpacity="0.26"
        />
        <path
          d="M1 18.6c2.7 0 2.7-2.2 5.4-2.2s2.7 2.2 5.4 2.2 2.7-2.2 5.4-2.2 2.7 2.2 5.4 2.2 2.7-2.2 5.4-2.2"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
        />
      </g>

      {/* Shield outline, drawn last so the water never crosses it. */}
      <path d={shield} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />

      {/* The ward under watch. */}
      <circle cx="16" cy="11.2" r="2.3" fill="currentColor" />
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
            JalRakshak
          </span>
          <span className="mt-0.5 text-micro font-medium uppercase tracking-[0.16em] text-subtle">
            Flood Intelligence
          </span>
        </span>
      )}
    </span>
  );
}
