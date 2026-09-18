import React, { useEffect, useState } from 'react';
import { LogoMark } from './Logo';

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onDone(); return; }
    const beginExit = window.setTimeout(() => setLeaving(true), 620);
    const finish = window.setTimeout(onDone, 900);
    return () => { window.clearTimeout(beginExit); window.clearTimeout(finish); };
  }, [onDone]);
  return <div role="status" aria-live="polite" aria-label="Loading FloodyPredict" className="splash-screen" style={{ opacity: leaving ? 0 : 1, pointerEvents: leaving ? 'none' : 'auto' }}>
    <div className="splash-content"><span className="splash-logo"><LogoMark className="h-9 w-9" /></span><div><h1>FloodyPredict</h1><p>Flood intelligence for Tamil Nadu</p></div><span className="splash-loader" aria-hidden="true"><i /></span></div>
  </div>;
}
