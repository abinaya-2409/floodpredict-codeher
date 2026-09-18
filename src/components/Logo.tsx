import React from 'react';

/** A compact monsoon mark: rain moving into a measured waterline. */
export function LogoMark({ className = '', title = 'FloodyPredict' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={title} className={className}>
      <path d="M9 7.5 6.7 11M16 5.5l-2.3 3.5M23 7.5 20.7 11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M5 18.2c2.4-2.5 5.1-2.5 7.5 0 2.4 2.5 5.1 2.5 7.5 0 2.4-2.5 5.1-2.5 7.5 0" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M5 24c2.4-2.5 5.1-2.5 7.5 0 2.4 2.5 5.1 2.5 7.5 0 2.4-2.5 5.1-2.5 7.5 0" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" opacity=".62" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return <span className="flex items-center gap-2.5"><span className="brand-mark"><LogoMark className="h-6 w-6" /></span>{!compact && <span className="flex flex-col leading-none"><span className="font-display text-sm font-bold text-fg">FloodyPredict</span><span className="mt-1 text-micro font-medium text-subtle">Flood intelligence</span></span>}</span>;
}
