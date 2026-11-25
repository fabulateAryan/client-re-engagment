'use client';

import type { DraftResponse, OutreachThreadResponse } from '@signal-monitoring/shared';
import { ChevronDown, ExternalLink, Mail, Reply, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../lib/api-client';
import { timeAgo } from '../lib/format';
import { markRepliesSeen, useSeenReplies } from '../lib/seen-replies';
import { OutreachThread } from './outreach-thread';
import { Card, EmptyState, PlatformChip, cx } from './ui';

type View = 'all' | 'needs_response' | 'awaiting';

/**
 * How often the list re-reads threads while the tab is visible. Cheap: the API answers from
 * memory; the API itself checks the mailbox every GMAIL_POLL_SECONDS.
 */
const REFRESH_MS = 5_000;
/** Width at which the conversation opens in a side panel instead of under the thread. */
const SIDE_PANEL_QUERY = '(min-width: 1024px)';

const VIEWS: { key: View; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_response', label: 'Replied' },
  { key: 'awaiting', label: 'Awaiting reply' },
];

/** Recount replies after a thread changes (a new reply or a follow-up). */
function withDraft(item: OutreachThreadResponse, draft: DraftResponse): OutreachThreadResponse {
  const last = draft.thread[draft.thread.length - 1];
  return {
    ...item,
    draft,
    replies: draft.thread.filter((m) => m.direction === 'INBOUND').length,
    needsResponse: last?.direction === 'INBOUND',
    lastActivityAt: last?.at ?? item.lastActivityAt,
  };
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = (): void => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/**
 * The outreach inbox. On wide screens: threads on the left, the open conversation as a chat on
 * the right; a thread with a new reply opens there by itself. On narrow screens a thread opens
 * under its card.
 */
export function OutreachList({
  initial,
  repliesInApp,
  initialOpen = null,
}: {
  initial: OutreachThreadResponse[];
  repliesInApp: boolean;
  /** Signal id of a thread to show open (from a link on the Overview). */
  initialOpen?: string | null;
}) {
  const [items, setItems] = useState(initial);
  const [view, setView] = useState<View>('all');
  /** The thread the person opened. Null: follow the latest reply (side panel) / none open. */
  const [picked, setPicked] = useState<string | null>(initialOpen);
  const sidePanel = useMediaQuery(SIDE_PANEL_QUERY);

  // Replies arrive in the background (the API checks the mailbox), so keep the list fresh:
  // re-fetch every 30s while the tab is visible, and straight away when the tab regains focus.
  useEffect(() => {
    if (!repliesInApp) return;
    let cancelled = false;
    const refresh = (): void => {
      if (document.visibilityState !== 'visible') return;
      api
        .outreach()
        .then((result) => {
          if (!cancelled) setItems(result.items);
        })
        .catch(() => undefined); // keep showing what we have; the next refresh retries
    };
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [repliesInApp]);

  const seen = useSeenReplies();
  const pickedExists = picked !== null && items.some((i) => i.signalId === picked);
  // Nothing opens by itself: a conversation shows only after a brand is clicked.
  const openId = pickedExists ? picked : null;
  const openItem = items.find((i) => i.signalId === openId) ?? null;
  const openReplies = openItem?.replies ?? 0;

  // Opening a thread marks its replies as read.
  useEffect(() => {
    if (openId !== null && openReplies > 0) markRepliesSeen(openId, openReplies);
  }, [openId, openReplies]);

  useEffect(() => {
    if (openId === null) return;
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLElement && e.target.closest('textarea, input');
      if (e.key === 'Escape' && !typing) setPicked(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId]);

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Mail}
          title="No outreach emails yet"
          description="Draft a message on a signal and press Send outreach. The thread and any replies will show up here."
          action={
            <Link
              href="/signals"
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
            >
              Go to signals
            </Link>
          }
        />
      </Card>
    );
  }

  const counts: Record<View, number> = {
    all: items.length,
    needs_response: items.filter((i) => i.needsResponse).length,
    awaiting: items.filter((i) => i.replies === 0).length,
  };
  const shown = items.filter((i) =>
    view === 'all' ? true : view === 'needs_response' ? i.needsResponse : i.replies === 0,
  );

  const update = (signalId: string, draft: DraftResponse): void => {
    setItems((current) =>
      current.map((item) => (item.signalId === signalId ? withDraft(item, draft) : item)),
    );
  };

  /** Clicking the open thread again closes it. */
  const select = (signalId: string): void => {
    setPicked(picked === signalId ? null : signalId);
  };
  const close = (): void => setPicked(null);

  const conversation = (item: OutreachThreadResponse, fill: boolean) => (
    // Keyed so switching threads starts with a fresh composer.
    <OutreachThread
      key={item.signalId}
      signalId={item.signalId}
      draft={item.draft}
      repliesInApp={repliesInApp}
      onChange={(draft) => update(item.signalId, draft)}
      fill={fill}
    />
  );

  return (
    <div
      className={cx(
        'grid gap-4 lg:items-start',
        // Two columns only while a conversation is open; otherwise the list uses the full width.
        sidePanel && openItem !== null && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]',
      )}
    >
      {/* Thread list */}
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter threads">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={view === v.key}
              onClick={() => setView(v.key)}
              className={cx(
                'rounded-full px-3 py-1 text-xs font-medium ring-1 transition',
                view === v.key
                  ? 'bg-violet-600 text-white ring-violet-600'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {v.label} <span className="opacity-75">{counts[v.key]}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-500">No threads in this view.</Card>
        ) : (
          <ul className="space-y-2">
            {shown.map((item) => {
              const active = openId === item.signalId;
              const last = item.draft.thread[item.draft.thread.length - 1];
              const unread = active ? 0 : Math.max(0, item.replies - (seen[item.signalId] ?? 0));
              return (
                <li key={item.signalId}>
                  <Card
                    className={cx(
                      'p-0 transition',
                      active ? 'ring-2 ring-violet-400' : unread > 0 && 'ring-1 ring-sky-300',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => select(item.signalId)}
                      aria-expanded={sidePanel ? undefined : active}
                      aria-current={sidePanel && active ? 'true' : undefined}
                      className={cx(
                        'flex w-full items-start gap-3 rounded-2xl p-4 text-left',
                        active ? 'bg-violet-50/60' : 'hover:bg-slate-50',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {item.clientName ?? 'Unknown brand'}
                          </span>
                          {item.platform !== null && (
                            <PlatformChip platform={item.platform} compact />
                          )}
                          {/* Badge only for unread replies; a read thread shows none. */}
                          {unread > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-2 py-0.5 text-[11px] font-semibold text-white">
                              <Reply className="h-3 w-3" aria-hidden />
                              {unread === 1 ? '1 new reply' : `${unread} new replies`}
                            </span>
                          ) : item.replies === 0 ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              Awaiting reply
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-600">{item.draft.subject}</p>
                        {last !== undefined && (
                          <p
                            className={cx(
                              'mt-1 line-clamp-1 text-xs',
                              unread > 0 && last.direction === 'INBOUND'
                                ? 'font-medium text-slate-800'
                                : 'text-slate-500',
                            )}
                          >
                            {last.direction === 'INBOUND' ? 'They wrote: ' : 'You wrote: '}
                            {last.text}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[11px] text-slate-500">
                          {timeAgo(item.lastActivityAt)}
                        </span>
                        {!sidePanel && (
                          <ChevronDown
                            className={cx(
                              'h-4 w-4 text-slate-400 transition',
                              active && 'rotate-180',
                            )}
                            aria-hidden
                          />
                        )}
                      </div>
                    </button>

                    {!sidePanel && active && (
                      <div className="px-4 pb-4">
                        {item.signalUrl !== null && (
                          <a
                            href={item.signalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-violet-700 hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" aria-hidden /> View the post this was
                            about
                          </a>
                        )}
                        {conversation(item, false)}
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Conversation panel (wide screens) */}
      {sidePanel && openItem !== null && (
        <Card className="animate-rise sticky top-6 flex h-[calc(100vh-8rem)] min-h-[28rem] flex-col p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  {openItem.clientName ?? 'Unknown brand'}
                </h2>
                {openItem.platform !== null && (
                  <PlatformChip platform={openItem.platform} compact />
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-slate-500">{openItem.draft.subject}</p>
            </div>
            {openItem.signalUrl !== null && (
              <a
                href={openItem.signalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-xs text-violet-700 hover:underline"
              >
                <ExternalLink className="h-3 w-3" aria-hidden /> View post
              </a>
            )}
            <button
              type="button"
              onClick={close}
              aria-label="Close conversation"
              title="Close (Esc)"
              className="-mt-1 -mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {conversation(openItem, true)}
        </Card>
      )}
    </div>
  );
}
