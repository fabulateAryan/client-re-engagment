'use client';

import type { DraftResponse, SignalPriorityValue } from '@signal-monitoring/shared';
import {
  ArrowRight,
  ChevronDown,
  CircleCheck,
  Lightbulb,
  LoaderCircle,
  MailPlus,
  PenLine,
  Send,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import { plural } from '../lib/format';
import { cx } from './ui';

/** One brand in "Contact today": its strongest signal and that signal's draft, if any. */
export interface ContactTodayItem {
  clientId: string;
  clientName: string;
  signalId: string;
  score: number;
  priority: SignalPriorityValue;
  reason: string;
  signalTypeLabel: string;
  waitingTooLong: boolean;
  otherSignals: number;
  draft: DraftResponse | null;
}

type RowState =
  | { kind: 'no_draft' }
  | { kind: 'no_email'; draft: DraftResponse }
  | { kind: 'ready'; draft: DraftResponse }
  | { kind: 'sent'; draft: DraftResponse };

function rowState(draft: DraftResponse | null): RowState {
  if (draft === null) return { kind: 'no_draft' };
  if (draft.sentAt !== null) return { kind: 'sent', draft };
  if (draft.recipient === null) return { kind: 'no_email', draft };
  return { kind: 'ready', draft };
}

const PRIORITY_DOT: Record<SignalPriorityValue, string> = {
  HIGH: 'bg-rose-500',
  MEDIUM: 'bg-amber-400',
  LOW: 'bg-slate-300',
};

const smallButton =
  'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400';

/** Asked once per page: the From address when the app can send email, else null. */
let fromRequest: Promise<string | null> | null = null;
function loadFrom(): Promise<string | null> {
  fromRequest ??= api
    .emailStatus()
    .then((s) => (s.enabled ? (s.from ?? 'the app') : null))
    .catch(() => {
      fromRequest = null;
      return null;
    });
  return fromRequest;
}

/**
 * "Contact today" with a fast path: drafts that already have a contact email can be ticked
 * and sent together after one confirmation. Every email is still approved by a person.
 */
export function ContactToday({ items: initial }: { items: ContactTodayItem[] }) {
  const [drafts, setDrafts] = useState<Record<string, DraftResponse | null>>(() =>
    Object.fromEntries(initial.map((i) => [i.signalId, i.draft])),
  );
  const ready = initial.filter((i) => rowState(drafts[i.signalId] ?? null).kind === 'ready');
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(ready.map((i) => i.signalId)),
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadFrom().then((f) => {
      if (live) setFrom(f);
    });
    return () => {
      live = false;
    };
  }, []);

  const chosen = ready.filter((i) => selected.has(i.signalId));

  const toggle = (signalId: string): void =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(signalId)) next.delete(signalId);
      else next.add(signalId);
      return next;
    });

  const draftOne = async (signalId: string): Promise<void> => {
    setDrafting(signalId);
    setError(null);
    try {
      const draft = await api.draftMessage(signalId);
      setDrafts((d) => ({ ...d, [signalId]: draft }));
      if (draft.recipient !== null) setSelected((s) => new Set(s).add(signalId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draft the message.');
    } finally {
      setDrafting(null);
    }
  };

  /** One after another, so a refusal stops the batch and nothing is sent twice. */
  const sendSelected = async (): Promise<void> => {
    setConfirming(false);
    setError(null);
    const batch = chosen;
    setSending({ done: 0, total: batch.length });
    for (const [index, item] of batch.entries()) {
      try {
        const draft = await api.sendDraft(item.signalId);
        setDrafts((d) => ({ ...d, [item.signalId]: draft }));
        setSending({ done: index + 1, total: batch.length });
      } catch (e) {
        setError(
          `${item.clientName}: ${e instanceof Error ? e.message : 'not sent'}. The rest were not sent.`,
        );
        break;
      }
    }
    setSending(null);
    setSelected(new Set());
  };

  if (initial.length === 0) {
    return (
      <p className="px-5 pt-3 pb-5 text-sm text-slate-500">
        Nothing to send right now. Every brand is done, contacted recently, or has only weak
        signals.
      </p>
    );
  }

  return (
    <div>
      {from !== null && ready.length > 0 && (
        <div className="mx-5 mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-linear-to-r from-violet-600 to-fuchsia-600 px-3 py-2 text-xs text-white shadow-sm">
          {confirming ? (
            <>
              <span className="flex-1">
                Send {plural(chosen.length, 'email')} from {from}? They cannot be unsent.
              </span>
              <button
                type="button"
                onClick={() => void sendSelected()}
                className={cx(smallButton, 'bg-white text-violet-700 hover:bg-violet-50')}
              >
                <Send className="h-3.5 w-3.5" aria-hidden /> Yes, send
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={cx(smallButton, 'text-white/90 hover:bg-white/10')}
              >
                Cancel
              </button>
            </>
          ) : sending !== null ? (
            <span className="flex flex-1 items-center gap-2">
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Sending {sending.done + 1} of {sending.total}…
            </span>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              <span className="flex-1">
                {plural(ready.length, 'draft')} ready. Tick the ones to send and approve them
                together.
              </span>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={chosen.length === 0}
                className={cx(smallButton, 'bg-white text-violet-700 hover:bg-violet-50')}
              >
                <Send className="h-3.5 w-3.5" aria-hidden /> Send selected ({chosen.length})
              </button>
            </>
          )}
        </div>
      )}

      <ul className="mt-2 divide-y divide-slate-100">
        {initial.map((item) => {
          const state = rowState(drafts[item.signalId] ?? null);
          const open = preview === item.signalId && 'draft' in state;
          return (
            <li key={item.clientId} className="px-5 py-3.5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center">
                  {state.kind === 'ready' && from !== null ? (
                    <input
                      type="checkbox"
                      checked={selected.has(item.signalId)}
                      onChange={() => toggle(item.signalId)}
                      disabled={sending !== null}
                      aria-label={`Select ${item.clientName}`}
                      className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                    />
                  ) : state.kind === 'sent' ? (
                    <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden />
                  ) : (
                    <span className={cx('h-2 w-2 rounded-full', PRIORITY_DOT[item.priority])} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link
                      href={`/brands/${encodeURIComponent(item.clientId)}`}
                      className="text-sm font-semibold text-slate-900 hover:text-violet-700"
                    >
                      {item.clientName}
                    </Link>
                    <span className="text-xs text-slate-500">{item.signalTypeLabel}</span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 tabular-nums">
                      {item.score}/100
                    </span>
                    {item.waitingTooLong && (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">
                        Waiting too long
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 flex items-start gap-1.5 text-xs text-slate-600">
                    <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden />
                    <span className="line-clamp-1">{item.reason}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {state.kind === 'no_draft' && (
                    <button
                      type="button"
                      onClick={() => void draftOne(item.signalId)}
                      disabled={drafting !== null}
                      className={cx(
                        smallButton,
                        'bg-violet-50 text-violet-700 hover:bg-violet-100',
                      )}
                    >
                      {drafting === item.signalId ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <PenLine className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Draft it
                    </button>
                  )}
                  {state.kind === 'no_email' && (
                    <Link
                      href={`/signals?clientId=${encodeURIComponent(item.clientId)}`}
                      className={cx(smallButton, 'bg-amber-50 text-amber-800 hover:bg-amber-100')}
                    >
                      <MailPlus className="h-3.5 w-3.5" aria-hidden /> Add contact email
                    </Link>
                  )}
                  {state.kind === 'ready' && (
                    <span className="hidden rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700 sm:inline">
                      Ready to send
                    </span>
                  )}
                  {state.kind === 'sent' && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Sent
                    </span>
                  )}
                  {'draft' in state && (
                    <button
                      type="button"
                      onClick={() => setPreview(open ? null : item.signalId)}
                      aria-expanded={open}
                      aria-label={`Preview the email to ${item.clientName}`}
                      className={cx(smallButton, 'text-slate-500 hover:bg-slate-100')}
                    >
                      Preview
                      <ChevronDown
                        className={cx('h-3.5 w-3.5 transition', open && 'rotate-180')}
                        aria-hidden
                      />
                    </button>
                  )}
                </div>
              </div>
              {open && 'draft' in state && (
                <div className="mt-2 ml-8 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-200">
                  <p className="text-slate-500">
                    To {state.draft.recipient ?? 'no contact email yet'} · {state.draft.subject}
                  </p>
                  <p className="mt-1 max-h-40 overflow-y-auto leading-relaxed whitespace-pre-wrap">
                    {state.draft.text}
                  </p>
                  <Link
                    href={`/signals?clientId=${encodeURIComponent(item.clientId)}`}
                    className="mt-2 inline-flex items-center gap-1 font-medium text-violet-700 hover:underline"
                  >
                    Edit on the Signals page <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {from === null && (
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Sending from the app is not set up, so emails are sent from the Signals page.
        </p>
      )}
      {error !== null && (
        <p role="alert" className="border-t border-slate-100 px-5 py-3 text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
