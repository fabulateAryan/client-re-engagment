'use client';

import type { DraftResponse, ThreadMessageResponse } from '@signal-monitoring/shared';
import {
  CircleCheck,
  CornerDownRight,
  LoaderCircle,
  Reply,
  RefreshCw,
  Send,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDateTime } from '../lib/format';
import { api } from '../lib/api-client';
import { cx } from './ui';

const smallButton =
  'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400';
const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 focus:outline-none';

/** How often an open thread checks for new replies while the tab is visible. */
const POLL_MS = 60_000;

type Busy = 'refresh' | 'follow-up' | null;

/**
 * An outreach email sent from the app, as a conversation: the outreach email, follow-ups and
 * replies (when SendGrid Inbound Parse is set up). The rep can send a follow-up in the same
 * thread; nothing is sent without a click and a confirmation.
 */
export function OutreachThread({
  signalId,
  draft,
  repliesInApp,
  onChange,
}: {
  signalId: string;
  draft: DraftResponse;
  repliesInApp: boolean;
  onChange: (draft: DraftResponse) => void;
}) {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState('');
  const onChangeRef = useRef(onChange);
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
  /** "Outreach email", "Follow-up 1", "Reply from ...", one per message. */
  const labels = thread.map((message, index) => {
    if (message.direction === 'INBOUND') return `Reply from ${message.from || 'the contact'}`;
    if (index === 0) return 'Outreach email';
    const n = thread.slice(1, index + 1).filter((m) => m.direction === 'OUTBOUND').length;
    return `Follow-up ${n}`;
  });
  const canFollowUp = draft.thread.length > 0;

  const refresh = useCallback(
    async (quiet: boolean): Promise<void> => {
      if (!quiet) {
        setBusy('refresh');
        setError(null);
      }
      try {
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
      setComposing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the follow-up.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
          <CircleCheck className="h-4 w-4" aria-hidden />
          Outreach sent to {draft.recipient ?? 'the contact'}
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

      <ol className="space-y-2">
        {thread.map((message, index) => {
          const inbound = message.direction === 'INBOUND';
          const label = labels[index];
          return (
            <li
              key={message.id}
              className={cx(
                'rounded-xl px-3 py-2 text-xs ring-1',
                inbound
                  ? 'ml-4 bg-sky-50 text-sky-950 ring-sky-200'
                  : 'mr-4 bg-slate-50 text-slate-800 ring-slate-200',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-2">
                <span className="flex items-center gap-1 font-semibold">
                  {inbound ? (
                    <Reply className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Send className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {label}
                </span>
                <time dateTime={message.at} className="text-[11px] text-slate-500">
                  {formatDateTime(message.at)}
                </time>
              </div>
              {index === 0 && <p className="mt-1 text-slate-500">Subject: {message.subject}</p>}
              <p className="mt-1 max-h-48 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                {message.text}
              </p>
            </li>
          );
        })}
      </ol>

      {!canFollowUp ? (
        <p className="text-[11px] text-slate-500">
          This email was sent before threads were kept, so follow-ups can’t be added to it.
        </p>
      ) : composing ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600">
            Follow-up to {draft.recipient}
            <textarea
              id={`follow-up-${signalId}`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={4000}
              placeholder="Write your follow-up. It is sent as a reply in the same email thread."
              className={cx(fieldClass, 'mt-1 resize-y leading-relaxed')}
            />
          </label>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-900 ring-1 ring-violet-200">
              <span>
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
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={text.trim() === '' || busy !== null}
                className={cx(smallButton, 'bg-violet-600 text-white hover:bg-violet-700')}
              >
                {busy === 'follow-up' ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-3.5 w-3.5" aria-hidden />
                )}
                {busy === 'follow-up' ? 'Sending…' : 'Send follow-up'}
              </button>
              <button
                type="button"
                onClick={() => setComposing(false)}
                disabled={busy !== null}
                className={cx(smallButton, 'text-slate-600 hover:bg-slate-100')}
              >
                <X className="h-3.5 w-3.5" aria-hidden /> Cancel
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className={cx(smallButton, 'bg-violet-50 text-violet-700 hover:bg-violet-100')}
        >
          <CornerDownRight className="h-3.5 w-3.5" aria-hidden /> Write a follow-up
        </button>
      )}

      <p className="text-[11px] text-slate-500">
        {repliesInApp
          ? 'Replies to this thread appear here automatically.'
          : 'Replies go to your team mailbox. Set up SendGrid Inbound Parse to see them here.'}
      </p>
      {error !== null && (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
