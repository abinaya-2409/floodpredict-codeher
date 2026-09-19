import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Link2, Share2, Wifi, X } from 'lucide-react';
import { LinkStatus, LocalLink } from '../services/link/LocalLink';

/**
 * Pairing two phones for a chat that needs no internet.
 *
 * The flow is three steps and cannot be fewer. WebRTC needs each peer to
 * learn the other's description before it will connect, and with no
 * signalling server the person holding the phones is the channel:
 *
 *   1. One phone starts and produces an invite code.
 *   2. The other pastes it and produces a reply code.
 *   3. The first pastes the reply. Connected.
 *
 * The codes are ~230 characters, which is far too long to read out but
 * nothing for Copy or the system share sheet - and AirDrop and Nearby Share
 * both work with no internet, which is the point. They are shown in full
 * anyway so it is obvious what is being passed around.
 *
 * Deliberately not a QR code yet. Generating one is easy enough; reading one
 * is not - iOS Safari has no BarcodeDetector, so a scanner would work on
 * Android and quietly fail on iPhone, which is the kind of half-feature this
 * app has too much of already.
 */

const STEP_LABEL: Record<string, string> = {
  idle: 'Not connected',
  'creating-invite': 'Making an invite',
  'awaiting-reply': 'Waiting for the reply code',
  joining: 'Reading the invite',
  connecting: 'Connecting',
  connected: 'Connected',
  failed: 'Could not connect',
  closed: 'Disconnected',
};

/** Copy, with the share sheet offered where it exists. */
function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked in some embedded contexts. The code is on screen.
    }
  };
  return { copied, copy };
}

export const NearbyLinkPanel: React.FC = () => {
  const [status, setStatus] = useState<LinkStatus>(() => LocalLink.getStatus());
  const [replyInput, setReplyInput] = useState('');
  const [inviteInput, setInviteInput] = useState('');
  const [busy, setBusy] = useState(false);
  /** How many phones this one is linked to right now. */
  const [peerCount, setPeerCount] = useState(0);
  /**
   * Whether the pairing steps are showing while already connected.
   *
   * They used to be hidden the moment one phone connected, which quietly
   * capped the whole thing at two phones: a device in the middle could
   * never add a second link, so it could never relay, so a mesh could not
   * form however well the protocol underneath handled one.
   */
  const [addingAnother, setAddingAnother] = useState(false);

  useEffect(
    () =>
      LocalLink.onPeer(({ type }) => {
        setPeerCount(LocalLink.peerCount);
        // A link that has just opened is the answer to "connect another
        // phone", so the pairing steps step back out of the way rather than
        // leaving the person looking at a form they have finished with.
        if (type === 'join') setAddingAnother(false);
      }),
    []
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const { copied, copy } = useCopy();

  useEffect(() => LocalLink.addStatusListener(setStatus), []);

  const supported = LocalLink.isSupported();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setLocalError(null);
    try {
      await fn();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const share = async (text: string) => {
    try {
      await navigator.share({ title: 'Floodylink connection code', text });
    } catch {
      // Cancelling the share sheet is normal and not worth reporting.
    }
  };

  if (!supported) {
    return (
      <div className="glass rounded-panel border border-line-strong/60 p-4">
        <p className="text-xs text-fg-soft">
          This browser cannot open a direct connection to another phone.
        </p>
      </div>
    );
  }

  const error = localError ?? status.error;

  return (
    <div
      data-testid="nearby-link"
      className="glass rounded-panel border border-line-strong/60 p-4 sm:p-5 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card border border-accent/35 bg-accent/12 text-accent">
            <Wifi className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-fg">Chat with a phone next to you</h2>
            <p className="mt-0.5 text-mini leading-relaxed text-muted">
              Straight from one phone to the other over Wi-Fi. No internet, no mobile signal
              and no server &mdash; the same Wi-Fi or one phone&apos;s hotspot is enough.
            </p>
          </div>
        </div>
        <span
          data-testid="link-state"
          className={`shrink-0 rounded-full border px-2.5 py-1 text-nano font-bold uppercase tracking-wide ${
            status.state === 'connected'
              ? 'border-positive/45 bg-positive/12 text-positive'
              : status.state === 'failed'
              ? 'border-risk-high/40 bg-risk-high/10 text-risk-high-ink'
              : 'border-line bg-surface-2/70 text-muted'
          }`}
        >
          {STEP_LABEL[status.state] ?? status.state}
        </span>
      </div>

      {error && (
        <p className="rounded-card border border-risk-high/30 bg-risk-high/10 px-3 py-2 text-mini leading-relaxed text-fg-soft">
          {error}
        </p>
      )}

      {status.state === 'connected' && !addingAnother ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 rounded-card border border-positive/35 bg-positive/10 px-3 py-2.5">
            <p className="text-mini leading-relaxed text-positive" data-testid="peer-count">
              {peerCount <= 1
                ? 'Connected to 1 phone.'
                : `Connected to ${peerCount} phones.`}{' '}
              Messages go directly between you, with no network in between.
            </p>
            <button
              onClick={() => LocalLink.close()}
              className="shrink-0 rounded-full border border-line px-2.5 py-1 text-nano font-semibold text-fg-soft hover:text-fg cursor-pointer"
            >
              Disconnect
            </button>
          </div>

          {/* The mesh. A phone linked to two others carries messages between
              people who never paired with each other and may be nowhere near
              each other - which in a flood is the difference between a
              message arriving and not. */}
          <button
            onClick={() => setAddingAnother(true)}
            data-testid="add-another"
            className="w-full rounded-card border border-accent/35 bg-accent/10 px-3 py-2 text-mini font-semibold text-accent hover:bg-accent/20 cursor-pointer"
          >
            Connect another phone
          </button>
          <p className="text-nano leading-relaxed text-muted">
            Each phone you add can pass messages on to the ones it is connected to,
            so someone out of your range can still be reached through a phone in
            between.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {status.state === 'connected' && (
            <button
              onClick={() => setAddingAnother(false)}
              className="text-nano font-semibold text-accent hover:underline cursor-pointer"
            >
              &larr; Back to the chat
            </button>
          )}
        <div className="grid gap-3 sm:grid-cols-2">
          {/* ---------------------------------------------- start a chat -- */}
          <section className="rounded-card border border-line/70 bg-surface/50 p-3 space-y-2">
            <h3 className="flex items-center gap-1.5 text-mini font-bold text-fg">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/20 text-nano text-accent">
                1
              </span>
              Start a chat
            </h3>

            {!status.code || !status.isHost ? (
              <>
                <p className="text-nano leading-relaxed text-muted">
                  Makes an invite code to give to the other phone.
                </p>
                <button
                  onClick={() => run(() => LocalLink.createInvite())}
                  disabled={busy}
                  data-testid="create-invite"
                  className="h-8 w-full rounded-full bg-accent px-3 text-mini font-bold text-on-accent disabled:opacity-50 cursor-pointer"
                >
                  {busy ? 'Working...' : 'Create invite code'}
                </button>
              </>
            ) : (
              <>
                <p className="text-nano leading-relaxed text-muted">
                  Send this to the other phone, then paste their reply below.
                </p>
                <textarea
                  readOnly
                  data-testid="invite-code"
                  value={status.code}
                  rows={3}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full resize-none rounded-card border border-line bg-bg/70 p-2 font-mono text-nano leading-tight text-fg-soft"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => copy(status.code!)}
                    className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-surface-2/70 text-mini font-semibold text-fg-soft hover:text-fg cursor-pointer"
                  >
                    {copied ? <Check className="h-3 w-3 text-risk-low-ink" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  {canShare && (
                    <button
                      onClick={() => share(status.code!)}
                      title="AirDrop or Nearby Share both work with no internet"
                      className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-surface-2/70 text-mini font-semibold text-fg-soft hover:text-fg cursor-pointer"
                    >
                      <Share2 className="h-3 w-3" />
                      Share
                    </button>
                  )}
                </div>

                <label className="block pt-1 text-nano font-semibold text-fg-soft">
                  Their reply code
                  <textarea
                    value={replyInput}
                    onChange={(e) => setReplyInput(e.target.value)}
                    rows={2}
                    data-testid="reply-input"
                    placeholder="Paste the reply from the other phone"
                    className="mt-1 w-full resize-none rounded-card border border-line bg-bg/70 p-2 font-mono text-nano text-fg"
                  />
                </label>
                <button
                  onClick={() => run(() => LocalLink.completeInvite(replyInput))}
                  disabled={busy || !replyInput.trim()}
                  data-testid="complete-invite"
                  className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-accent px-3 text-mini font-bold text-on-accent disabled:opacity-50 cursor-pointer"
                >
                  Connect <ArrowRight className="h-3 w-3" />
                </button>
              </>
            )}
          </section>

          {/* ------------------------------------------------ join a chat -- */}
          <section className="rounded-card border border-line/70 bg-surface/50 p-3 space-y-2">
            <h3 className="flex items-center gap-1.5 text-mini font-bold text-fg">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent/20 text-nano text-accent">
                2
              </span>
              Join a chat
            </h3>
            <p className="text-nano leading-relaxed text-muted">
              Paste the invite code you were given.
            </p>
            <textarea
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              rows={3}
              data-testid="invite-input"
              placeholder="Paste their invite code"
              className="w-full resize-none rounded-card border border-line bg-bg/70 p-2 font-mono text-nano text-fg"
            />
            <button
              onClick={() => run(() => LocalLink.acceptInvite(inviteInput))}
              disabled={busy || !inviteInput.trim()}
              data-testid="accept-invite"
              className="h-8 w-full rounded-full border border-accent/40 bg-accent/10 px-3 text-mini font-bold text-accent disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Working...' : 'Make a reply code'}
            </button>

            {status.code && !status.isHost && (
              <>
                <p className="pt-1 text-nano leading-relaxed text-muted">
                  Send this back to the phone that invited you.
                </p>
                <textarea
                  readOnly
                  data-testid="reply-code"
                  value={status.code}
                  rows={3}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full resize-none rounded-card border border-line bg-bg/70 p-2 font-mono text-nano leading-tight text-fg-soft"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => copy(status.code!)}
                    className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-surface-2/70 text-mini font-semibold text-fg-soft hover:text-fg cursor-pointer"
                  >
                    {copied ? <Check className="h-3 w-3 text-risk-low-ink" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  {canShare && (
                    <button
                      onClick={() => share(status.code!)}
                      className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full border border-line bg-surface-2/70 text-mini font-semibold text-fg-soft hover:text-fg cursor-pointer"
                    >
                      <Share2 className="h-3 w-3" />
                      Share
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
        </div>
      )}

      <p className="flex items-start gap-1.5 border-t border-line/60 pt-2 text-nano leading-relaxed text-subtle">
        <Link2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        <span>
          Both phones must be on the same Wi-Fi, or one sharing a hotspot. With no Wi-Fi at
          all this cannot work &mdash; and on iPhone the hotspot needs a mobile plan, so with
          two iPhones and no network, use an Android hotspot if there is one.
        </span>
      </p>
    </div>
  );
};
