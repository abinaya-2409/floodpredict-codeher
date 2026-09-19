import React, { useEffect, useState } from 'react';
import { Check, Download, Share, SquarePlus, X, WifiOff } from 'lucide-react';

/**
 * "Install this app" for phones.
 *
 * The two platforms do not work the same way and cannot be made to:
 *
 *   Android / Chrome / Edge fire `beforeinstallprompt`, which can be saved
 *   and replayed from a button. That gives a real one-tap install.
 *
 *   iOS Safari has no such event and no API to trigger installation. The
 *   only route is Share -> Add to Home Screen, done by hand. So iOS gets
 *   instructions with the actual icons from the actual menu, rather than a
 *   button that would do nothing. A dead button is worse than a sentence.
 *
 * Installing matters here beyond the convenience: an installed app keeps its
 * service worker and cache, so it opens during a flood with no network. The
 * copy says that, because "install our app" on its own is a thing people
 * reasonably decline.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'floody.install.dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS predates display-mode and uses a non-standard flag instead.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS reports itself as a Mac; the touch points give it away.
    (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document)
  );
}

export const InstallAppPrompt: React.FC = () => {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // Chrome shows its own mini-infobar unless this is prevented, and that
      // bar cannot be styled or placed where it is actually relevant.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Private browsing; it will simply ask again next time.
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'dismissed') dismiss();
  };

  if (installed || dismissed) return null;

  const ios = isIos();
  // Nothing to offer: not iOS, and Chrome has not said the app is installable
  // (already installed, not eligible, or a browser with no install support).
  if (!ios && !deferred) return null;

  return (
    <div
      data-testid="install-prompt"
      className="glass rounded-panel border border-accent/30 bg-accent/5 p-4 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-accent/30 bg-accent/12 text-accent">
          <Download className="h-4 w-4" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-fg">Install Floodylink on this phone</h2>
          <p className="mt-1 flex items-start gap-1.5 text-mini leading-relaxed text-fg-soft">
            <WifiOff className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
            <span>
              Once installed it opens without a network, so the map, your ward&apos;s risk and
              the offline chat still work when the towers are down.
            </span>
          </p>

          {!ios && (
            <button
              onClick={install}
              className="mt-3 flex h-9 items-center gap-2 rounded-full bg-accent px-4 text-xs font-bold text-on-accent transition-opacity hover:opacity-90 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Install app
            </button>
          )}

          {ios && !showIosSteps && (
            <button
              onClick={() => setShowIosSteps(true)}
              className="mt-3 flex h-9 items-center gap-2 rounded-full bg-accent px-4 text-xs font-bold text-on-accent transition-opacity hover:opacity-90 cursor-pointer"
            >
              <Share className="h-3.5 w-3.5" aria-hidden="true" />
              How to install on iPhone
            </button>
          )}

          {ios && showIosSteps && (
            <ol className="mt-3 space-y-2 text-mini leading-relaxed text-fg-soft">
              {/*
                Spelled out because iPhone cannot be prompted: Safari exposes
                no install API, so this is genuinely the only way in.
              */}
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-nano font-bold text-fg">
                  1
                </span>
                <span className="flex items-center gap-1.5">
                  Tap <Share className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <strong className="text-fg">Share</strong> at the bottom of Safari
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-nano font-bold text-fg">
                  2
                </span>
                <span className="flex items-center gap-1.5">
                  Scroll down and tap
                  <SquarePlus className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <strong className="text-fg">Add to Home Screen</strong>
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-nano font-bold text-fg">
                  3
                </span>
                <span className="flex items-center gap-1.5">
                  Tap <strong className="text-fg">Add</strong>
                  <Check className="h-3.5 w-3.5 text-risk-low-ink" aria-hidden="true" />
                </span>
              </li>
              <li className="pt-1 text-nano text-subtle">
                It must be Safari &mdash; Chrome on iPhone cannot add to the home screen.
              </li>
            </ol>
          )}
        </div>

        <button
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="shrink-0 rounded-full p-1 text-muted transition-colors hover:text-fg cursor-pointer"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};
