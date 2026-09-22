import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, FileText, Loader2, Send, ShieldCheck, Sparkles, User } from 'lucide-react';
import { CityData, SimulationParams, ZoneData, ZoneRiskAssessment } from '../types';
import {
  buildChatContext,
  chatContextToText,
  localReport,
  localSummary,
} from '../utils/chatContext';
import { Button } from './ui/Button';

/**
 * The assistant's conversation.
 *
 * Chrome-free on purpose: this is the part that talks, and it is rendered
 * inside whatever frame is wanted - currently the dock in the corner of every
 * screen. Keeping it separate is what stops a second copy of this logic
 * appearing the first time someone wants the assistant somewhere else.
 *
 * Two of the three things it does need no model at all. Report and Summarise
 * are composed here, from the same numbers the dashboard is drawing, so they
 * answer instantly, offline, with no key, and cannot state a figure the app
 * did not compute. Those are the two an officer presses during an actual
 * event, and an event is exactly when the network is worst.
 *
 * Open conversation is the part that needs a model, and it is the part where
 * being wrong is cheapest - a general question about monsoons has no
 * operational consequence. Every answer that does touch this city's figures
 * is checked against the snapshot before it is shown; see api/_verifyAnswer.
 */

interface Props {
  city: CityData;
  zones: ZoneData[];
  assessments: ZoneRiskAssessment[];
  simulationParams: SimulationParams;
  /**
   * The dock is a fixed-height floating card, so its log fills the space it
   * is given. A panel in the page flow sizes to its content instead.
   */
  variant?: 'panel' | 'dock';
}

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** Who wrote it: the app's own composer, or the model that answered. */
  source?: string;
  /**
   * Whether the answer was checked against the snapshot, and whether it took
   * a correction to pass. Worth showing: an officer deciding how much to
   * trust a sentence should be able to see that its figures were verified.
   */
  checked?: 'verified' | 'corrected';
}

/**
 * Openers that show the split.
 *
 * The first is answerable only from the snapshot, the second only from
 * general knowledge. Someone who presses both understands the assistant.
 */
const OPENERS = [
  'Which ward should I move on first, and why?',
  'Why does Tamil Nadu flood in the north-east monsoon?',
  'What does a high coping deficit actually mean?',
];

let seq = 0;
const nextId = () => `m${++seq}`;

/**
 * Markdown the model was asked not to write.
 *
 * The prompt says plain text, and mostly it obliges. When it does not, the
 * answer is rendered as written, so "**Kolathur & Perambur**" arrives on
 * screen with the asterisks still on it - which in an operational readout
 * reads as something broken rather than as emphasis. Cheaper to strip the
 * markers here than to render markdown for the one case that needs it.
 */
function plainText(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/^#{1,6}\s+/gm, '');
}

export function AssistantConversation({
  city,
  zones,
  assessments,
  simulationParams,
  variant = 'panel',
}: Props) {
  const context = useMemo(
    () => buildChatContext(city, zones, assessments, simulationParams),
    [city, zones, assessments, simulationParams]
  );

  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const logRef = useRef<HTMLDivElement>(null);

  // Follow the conversation down. Only the log scrolls, so this cannot yank
  // the page while someone is reading the dashboard behind it.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const append = (role: Msg['role'], text: string, source?: string, checked?: Msg['checked']) =>
    setMessages((prev) => [...prev, { id: nextId(), role, text, source, checked }]);

  /** Report and Summarise: composed here, never sent anywhere. */
  const composeLocally = (kind: 'report' | 'summary') => {
    setNote(null);
    append('user', kind === 'report' ? 'Give me the report.' : 'Summarise this.');
    append('assistant', kind === 'report' ? localReport(context) : localSummary(context), 'the app');
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;

    setDraft('');
    setNote(null);
    append('user', question);
    setBusy(true);

    // The history the model sees, including the turn just added.
    const history = [
      ...messages.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user' as const, content: question },
    ];

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, context: chatContextToText(context) }),
      });
      const data = await res.json();
      if (data.reply) {
        append(
          'assistant',
          data.reply,
          data.model ?? 'a language model',
          data.corrected ? 'corrected' : data.verified ? 'verified' : undefined
        );
      } else {
        // 429 included: the model runs on one key shared by everyone using
        // the site, so being turned away is ordinary traffic rather than a
        // fault, and the message already says which of the two it is.
        setNote(data.message ?? 'No answer came back.');
      }
    } catch {
      // Offline is expected in the field, not an error worth a red banner.
      setNote(
        'No network, so I cannot answer open questions. Report and Summarise ' +
          'still work - the app writes those itself.'
      );
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter is a newline, as in every other chat box.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(draft);
    }
  };

  const dock = variant === 'dock';

  return (
    <div className={dock ? 'flex min-h-0 flex-1 flex-col' : ''}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          pill
          icon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
          onClick={() => composeLocally('report')}
          data-testid="assistant-report"
        >
          Report
        </Button>
        <Button
          size="sm"
          pill
          icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
          onClick={() => composeLocally('summary')}
        >
          Summarise
        </Button>
        <span className="font-mono text-micro text-subtle">no key needed</span>
      </div>

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        data-testid="assistant-log"
        className={[
          'mt-3 space-y-3 overflow-y-auto rounded-card border border-line bg-surface-2/40 p-3',
          dock ? 'min-h-0 flex-1' : 'max-h-[26rem] min-h-[14rem]',
        ].join(' ')}
      >
        {messages.length === 0 && (
          <div className="px-1 py-5 text-center">
            <p className="text-xs text-muted">
              Ask about this scenario, or about how floods work in general.
            </p>
            <div className="mt-3 flex flex-col items-center gap-1.5">
              {OPENERS.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => void send(o)}
                  className="rounded-full border border-line px-3 py-1 text-left text-mini text-fg-soft transition-colors hover:border-line-strong hover:bg-surface-3 hover:text-fg"
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            data-testid="assistant-msg"
            data-role={m.role}
            data-checked={m.checked ?? ''}
            className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={[
                'max-w-[88%] rounded-card border px-3 py-2',
                m.role === 'user'
                  ? 'border-accent/35 bg-accent/12 text-fg'
                  : 'border-line bg-surface-2 text-fg-soft',
              ].join(' ')}
            >
              <div className="mb-1 flex flex-wrap items-center gap-1.5 font-mono text-micro uppercase tracking-[0.14em] text-subtle">
                {m.role === 'user' ? (
                  <User className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Bot className="h-3 w-3" aria-hidden="true" />
                )}
                {m.role === 'user' ? 'You' : (m.source ?? 'Assistant')}
                {m.checked && (
                  <span
                    className="inline-flex items-center gap-1 text-risk-low"
                    title={
                      m.checked === 'corrected'
                        ? 'A figure did not match the data, so the answer was sent back and corrected before you saw it.'
                        : 'Every figure in this answer was checked against the app’s own numbers.'
                    }
                  >
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    {m.checked === 'corrected' ? 'corrected' : 'checked'}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-xs leading-relaxed">{plainText(m.text)}</p>
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 px-1 text-mini text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Thinking...
          </div>
        )}
      </div>

      {note && (
        <p className="mt-2 rounded-card border border-line bg-surface-2/60 px-3 py-2 text-mini text-muted">
          {note}
        </p>
      )}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          aria-label="Ask the assistant"
          data-testid="assistant-input"
          // Short enough to sit on one or two lines in the dock. The longer
          // version wrapped past the box and was cut off mid-word.
          placeholder={dock ? 'Ask about a ward, or about floods...' : 'Ask about this scenario, or about floods generally...'}
          className="min-h-[2.75rem] flex-1 resize-none rounded-control border border-line bg-surface-2 px-3 py-2 text-xs text-fg placeholder:text-subtle focus:border-accent/50 focus:outline-none"
        />
        <Button
          variant="primary"
          onClick={() => void send(draft)}
          disabled={busy || !draft.trim()}
          icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}
          data-testid="assistant-send"
        >
          Send
        </Button>
      </div>

      <p className="mt-2 font-mono text-micro text-subtle">
        Figures about {city.name} come from the app&apos;s own model and are checked
        before you see them. General answers are the model&apos;s own.
      </p>
    </div>
  );
}
