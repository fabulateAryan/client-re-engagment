'use client';

import type { DraftResponse, ThreadMessageResponse } from '@signal-monitoring/shared';
import { CircleCheck, LoaderCircle, RefreshCw, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDateTime } from '../lib/format';
import { api } from '../lib/api-client';
import { cx } from './ui';

const smallButton =
  'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400';

/** How often an open thread re-reads itself while the tab is visible (cheap, from memory). */
const POLL_MS = 10_000;

type Busy = 'refresh' | 'follow-up' | null;

/** "Jane Smith <jane@example.com>" -> "Jane Smith"; a bare address stays as it is. */
function senderName(from: string): string {
  const name = from
    .replace(/\s*<[^>]*>\s*$/, '')
    .replace(/^"|"$/g, '')
    .trim();
  return name !== '' ? name : from.replace(/[<>]/g, '').trim() || 'The contact';
}

/**
 * An outreach email sent from the app, shown as a chat: our emails on the right, their replies
 * on the left, and a composer at the bottom for a follow-up in the same email thread. Nothing
 * is sent without a click and a confirmation.
 *
 * `fill`: grow to the parent's height (the Outreach side panel) with the messages scrolling
 * inside; otherwise the messages area has a fixed maximum height.
 */
export function OutreachThread({
  signalId,
  draft,
  repliesInApp,
  onChange,
  fill = false,
}: {
  signalId: string;
  draft: DraftResponse;
  repliesInApp: boolean;
  onChange: (draft: DraftResponse) => void;
  fill?: boolean;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState('');
  const onChangeRef = useRef(onChange);
  const scrollRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Emails sent before threads existed have no thread: show the outreach email on its own.
  const thread: ThreadMessageResponse[] =
    draft.thread.length > 0
      ? draft.thread
      : [
          {
            id: 'outreach',
            direction: 'OUTBOUND',
            from: '',
            to: draft.recipient ?? '',
            subject: draft.subject,
            text: draft.text,
            at: draft.sentAt ?? draft.createdAt,
          },
        ];
  const replies = thread.filter((m) => m.direction === 'INBOUND').length;
  /** "Outreach email", "Follow-up 1", or the sender's name, one per message. */
  const labels = thread.map((message, index) => {
    if (message.direction === 'INBOUND') return senderName(message.from);
    if (index === 0) return 'Outreach email';
    const n = thread.slice(1, index + 1).filter((m) => m.direction === 'OUTBOUND').length;
    return `Follow-up ${n}`;
  });
  const canFollowUp = draft.thread.length > 0;

  // Keep the newest message in view when the thread opens or a message arrives.
  useEffect(() => {
    const el = scrollRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, [signalId, thread.length]);

  const refresh = useCallback(
    async (quiet: boolean): Promise<void> => {
      if (!quiet) {
        setBusy('refresh');
        setError(null);
      }
      try {
        // The button reads the mailbox now; quiet polls just pick up what the API already has.
        if (!quiet) await api.checkReplies();
        onChangeRef.current(await api.getDraft(signalId));
      } catch (e) {
        if (!quiet) setError(e instanceof Error ? e.message : 'Could not check for replies.');
      } finally {
        if (!quiet) setBusy(null);
      }
    },
    [signalId],
  );

  useEffect(() => {
    if (!repliesInApp) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(true);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [repliesInApp, refresh]);

  const sendFollowUp = async (): Promise<void> => {
    setConfirming(false);
    setBusy('follow-up');
    setError(null);
    try {
      onChange(await api.sendFollowUp(signalId, text));
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the follow-up.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cx('flex flex-col', fill ? 'min-h-0 flex-1' : 'mt-4')}>
      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <CircleCheck className="h-3.5 w-3.5" aria-hidden />
          Sent to {draft.recipient ?? 'the contact'}
          {replies > 0 && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800">
              {replies === 1 ? '1 reply' : `${replies} replies`}
            </span>
          )}
        </p>
        {repliesInApp && (
          <button
            type="button"
            onClick={() => void refresh(false)}
            disabled={busy !== null}
            className={cx(smallButton, 'text-slate-600 hover:bg-slate-100')}
          >
            <RefreshCw
              className={cx('h-3.5 w-3.5', busy === 'refresh' && 'animate-spin')}
              aria-hidden
            />
            {busy === 'refresh' ? 'Checking…' : 'Check for replies'}
          </button>
        )}
      </div>

      {/* Messages */}
      <ol
        ref={scrollRef}
        aria-label="Conversation"
        className={cx(
          'space-y-3 overflow-y-auto py-4 pr-1',
          fill ? 'min-h-0 flex-1' : 'max-h-[28rem]',
        )}
      >
        {thread.map((message, index) => {
          const inbound = message.direction === 'INBOUND';
          return (
            <li
              key={message.id}
              className={cx('flex flex-col', inbound ? 'items-start' : 'items-end')}
            >
              <span
                className={cx(
                  'mb-1 px-1 text-[11px] font-medium',
                  inbound ? 'text-sky-800' : 'text-slate-500',
                )}
                title={inbound ? message.from : undefined}
              >
                {labels[index]}
              </span>
              <div
                className={cx(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                  inbound
                    ? 'rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200'
                    : 'rounded-br-md bg-violet-600 text-white',
                )}
              >
                {index === 0 && (
                  <p
                    className={cx(
                      'mb-1.5 text-xs font-semibold',
                      inbound ? 'text-slate-500' : 'text-violet-100',
                    )}
                  >
                    {message.subject}
                  </p>
                )}
                <p className="break-words whitespace-pre-wrap">{message.text}</p>
              </div>
              <time dateTime={message.at} className="mt-1 px-1 text-[10px] text-slate-400">
                {formatDateTime(message.at)}
              </time>
            </li>
          );
        })}
      </ol>

      {/* Composer */}
      <div className="space-y-2 border-t border-slate-100 pt-3">
        {!canFollowUp ? (
          <p className="text-[11px] text-slate-500">
            This email was sent before threads were kept, so follow-ups can’t be added to it.
          </p>
        ) : confirming ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-900 ring-1 ring-violet-200">
            <span className="min-w-0 flex-1">
              Send this follow-up to <span className="font-semibold">{draft.recipient}</span>? It
              cannot be unsent.
            </span>
            <button
              type="button"
              onClick={() => void sendFollowUp()}
              disabled={busy !== null}
              className={cx(smallButton, 'bg-violet-600 text-white hover:bg-violet-700')}
            >
              <Send className="h-3.5 w-3.5" aria-hidden /> Yes, send now
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={cx(smallButton, 'text-slate-600 hover:bg-white')}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Follow-up to {draft.recipient}</span>
              <textarea
                id={`follow-up-${signalId}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim() !== '') {
                    e.preventDefault();
                    setConfirming(true);
                  }
                }}
                rows={2}
                maxLength={4000}
                placeholder={
                  replies > 0 ? 'Reply in this thread…' : 'Write a follow-up in this thread…'
                }
                className="block max-h-40 min-h-[2.75rem] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-800 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={text.trim() === '' || busy !== null}
              aria-label="Send follow-up"
              title="Send (Ctrl+Enter)"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white transition hover:bg-violet-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'follow-up' ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Send className="h-4 w-4" aria-hidden />
              )}
            </button>
          </div>
        )}
        <p className="text-[11px] text-slate-500">
          {repliesInApp
            ? 'Sent as a reply in the same email thread. New replies appear here automatically.'
            : 'Replies go to your team mailbox. Connect Gmail or SendGrid Inbound Parse to see them here.'}
        </p>
        {error !== null && (
          <p role="alert" className="text-xs text-rose-700">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
