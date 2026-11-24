'use client';

import type { DraftResponse, OutreachThreadResponse } from '@signal-monitoring/shared';
import { ChevronDown, ExternalLink, Mail, Reply } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { timeAgo } from '../lib/format';
import { OutreachThread } from './outreach-thread';
import { Card, EmptyState, PlatformChip, cx } from './ui';

type View = 'all' | 'needs_response' | 'awaiting';

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

/** The outreach overview: one card per thread, opening into the full conversation. */
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
  const [open, setOpen] = useState<string | null>(initialOpen);

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

  const update = (signalId: string, draft: DraftResponse): void =>
    setItems((current) =>
      current.map((item) => (item.signalId === signalId ? withDraft(item, draft) : item)),
    );

  return (
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
        <ul className="space-y-3">
          {shown.map((item) => {
            const expanded = open === item.signalId;
            const last = item.draft.thread[item.draft.thread.length - 1];
            return (
              <li key={item.signalId}>
                <Card className={cx('p-4', item.needsResponse && 'ring-1 ring-sky-300')}>
                  <button
                    type="button"
                    onClick={() => setOpen(expanded ? null : item.signalId)}
                    aria-expanded={expanded}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {item.clientName ?? 'Unknown brand'}
                        </span>
                        {item.platform !== null && (
                          <PlatformChip platform={item.platform} compact />
                        )}
                        {item.replies > 0 ? (
                          <span
                            className={cx(
                              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                              item.needsResponse
                                ? 'bg-sky-600 text-white'
                                : 'bg-sky-100 text-sky-800',
                            )}
                          >
                            <Reply className="h-3 w-3" aria-hidden />
                            {item.replies === 1 ? '1 reply' : `${item.replies} replies`}
                            {item.needsResponse && ' · new'}
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            Awaiting reply
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-600">
                        To {item.draft.recipient ?? 'unknown'} · {item.draft.subject}
                      </p>
                      {last !== undefined && (
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                          {last.direction === 'INBOUND' ? 'They wrote: ' : 'You wrote: '}
                          {last.text}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] text-slate-500">
                        {timeAgo(item.lastActivityAt)}
                      </span>
                      <ChevronDown
                        className={cx(
                          'h-4 w-4 text-slate-400 transition',
                          expanded && 'rotate-180',
                        )}
                        aria-hidden
                      />
                    </div>
                  </button>

                  {expanded && (
                    <>
                      {item.signalUrl !== null && (
                        <a
                          href={item.signalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-violet-700 hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" aria-hidden /> View the post this was
                          about
                        </a>
                      )}
                      <OutreachThread
                        signalId={item.signalId}
                        draft={item.draft}
                        repliesInApp={repliesInApp}
                        onChange={(draft) => update(item.signalId, draft)}
                      />
                    </>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
