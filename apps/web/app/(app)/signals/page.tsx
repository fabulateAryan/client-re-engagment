import type { Metadata } from 'next';
import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { DraftPanel } from '../../../components/draft-panel';
import { SignalCard } from '../../../components/signal-card';
import { SkipButton } from '../../../components/skip-button';
import { SignalFilters } from '../../../components/signal-filters';
import {
  ApiErrorPanel,
  Card,
  EmptyState,
  PageHeader,
  RelevantOnlyNote,
  cx,
} from '../../../components/ui';
import type { ClientResponse, SignalPageResponse } from '@signal-monitoring/shared';
import { api, attempt } from '../../../lib/api-server';
import type { SignalFilters as Filters } from '../../../lib/api-server';
import { formatDateTime, plural } from '../../../lib/format';
import { isPlatform, isSignalType } from '../../../lib/meta';

export const metadata: Metadata = { title: 'Signals' };

const PAGE_SIZE = 12;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** A usable ISO time from the URL, or undefined. */
function validIso(value: string | undefined): string | undefined {
  return value !== undefined && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === undefined || v === '' ? undefined : v;
}

export default async function SignalsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const platform = first(params.platform);
  const signalType = first(params.signalType);
  const view = first(params.view) === 'skipped' ? 'skipped' : 'to_review';
  const filters: Filters = {
    clientId: first(params.clientId),
    platform: isPlatform(platform) ? platform : undefined,
    signalType: isSignalType(signalType) ? signalType : undefined,
    view,
    collectedSince: validIso(first(params.collectedSince)),
    page: Math.max(1, Number(first(params.page) ?? '1') || 1),
    pageSize: PAGE_SIZE,
  };

  // The other tab's total, for its count. Same filters, one item is enough.
  const otherView = view === 'skipped' ? 'to_review' : 'skipped';
  const loaded = await attempt(() =>
    Promise.all([
      api.signals(filters),
      api.clients(),
      api.signals({ ...filters, view: otherView, page: 1, pageSize: 1 }),
      api.signalSummary(),
    ]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Signals"
        title="Every signal, in one feed"
        description="Filter by client, platform or type to find the moments worth acting on."
      />
      {loaded.ok && (
        <RelevantOnlyNote
          minScore={loaded.data[3].minScore}
          maxAgeDays={loaded.data[3].maxAgeDays}
        />
      )}
      {loaded.ok ? (
        <SignalsView
          page={loaded.data[0]}
          clients={loaded.data[1]}
          otherTotal={loaded.data[2].total}
          filters={filters}
          params={params}
        />
      ) : (
        <ApiErrorPanel message={loaded.error} />
      )}
    </div>
  );
}

function SignalsView({
  page,
  clients,
  otherTotal,
  filters,
  params,
}: {
  page: SignalPageResponse;
  clients: ClientResponse[];
  otherTotal: number;
  filters: Filters;
  params: Record<string, string | string[] | undefined>;
}) {
  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const filtered =
    filters.clientId !== undefined ||
    filters.platform !== undefined ||
    filters.signalType !== undefined;

  const skippedView = filters.view === 'skipped';
  const counts = skippedView
    ? { to_review: otherTotal, skipped: page.total }
    : { to_review: page.total, skipped: otherTotal };

  return (
    <>
      {filters.collectedSince !== undefined && (
        <NewSinceBanner since={filters.collectedSince} total={page.total} params={params} />
      )}
      <ViewTabs params={params} current={skippedView ? 'skipped' : 'to_review'} counts={counts} />
      <Suspense>
        <SignalFilters
          clients={clients}
          clientId={filters.clientId}
          platform={filters.platform}
          signalType={filters.signalType}
        />
      </Suspense>

      <p className="text-xs text-slate-500">
        {plural(page.total, skippedView ? 'skipped signal' : 'signal')}
        {skippedView ? '' : ' to review'}
        {filtered ? ' match these filters' : ''}, most relevant first (score out of 100, then
        newest)
      </p>

      {page.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title={
              filtered
                ? 'No signals match these filters'
                : skippedView
                  ? 'Nothing skipped'
                  : 'No signals to review'
            }
            description={
              filtered
                ? 'Try a different client, platform or type.'
                : skippedView
                  ? 'Cards you skip appear here, and you can undo a skip at any time.'
                  : 'Run monitoring from the Overview page to collect the latest activity from every client.'
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {page.items.map((signal, index) => (
            <li
              key={signal.id}
              className="animate-rise"
              style={{ animationDelay: `${index * 30}ms` }}
            >
              <SignalCard
                signal={signal}
                action={<SkipButton signalId={signal.id} skipped={signal.skippedAt !== null} />}
                footer={<DraftPanel signalId={signal.id} initial={signal.draft} />}
              />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && <Pagination params={params} page={page.page} totalPages={totalPages} />}
    </>
  );
}

/** Story 8b: switch between cards still to review and cards a rep skipped. */
function ViewTabs({
  params,
  current,
  counts,
}: {
  params: Record<string, string | string[] | undefined>;
  current: 'to_review' | 'skipped';
  counts: { to_review: number; skipped: number };
}) {
  const hrefFor = (view: 'to_review' | 'skipped'): string => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const v = first(value);
      if (v !== undefined && key !== 'page' && key !== 'view') query.set(key, v);
    }
    if (view === 'skipped') query.set('view', 'skipped');
    const qs = query.toString();
    return qs === '' ? '/signals' : `/signals?${qs}`;
  };
  const tabs = [
    { view: 'to_review' as const, label: 'To review' },
    { view: 'skipped' as const, label: 'Skipped' },
  ];
  return (
    <nav aria-label="Signal lists" className="flex gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const active = tab.view === current;
        return (
          <Link
            key={tab.view}
            href={hrefFor(tab.view)}
            aria-current={active ? 'page' : undefined}
            className={cx(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition',
              active
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-slate-500 hover:text-slate-900',
            )}
          >
            {tab.label}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 tabular-nums">
              {counts[tab.view]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function Pagination({
  params,
  page,
  totalPages,
}: {
  params: Record<string, string | string[] | undefined>;
  page: number;
  totalPages: number;
}) {
  const hrefFor = (target: number): string => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const v = first(value);
      if (v !== undefined && key !== 'page') query.set(key, v);
    }
    if (target > 1) query.set('page', String(target));
    const qs = query.toString();
    return qs === '' ? '/signals' : `/signals?${qs}`;
  };

  return (
    <nav className="flex items-center justify-between" aria-label="Pagination">
      <PageLink href={hrefFor(page - 1)} disabled={page <= 1}>
        <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
      </PageLink>
      <p className="text-xs text-slate-500 tabular-nums">
        Page {page} of {totalPages}
      </p>
      <PageLink href={hrefFor(page + 1)} disabled={page >= totalPages}>
        Next <ChevronRight className="h-4 w-4" aria-hidden />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const classes = cx(
    'inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium',
    disabled ? 'pointer-events-none text-slate-300' : 'text-slate-700 hover:bg-slate-100',
  );
  return disabled ? (
    <span className={classes} aria-disabled>
      {children}
    </span>
  ) : (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

/** Shown when the list is limited to what one run found ("View new signals"). */
function NewSinceBanner({
  since,
  total,
  params,
}: {
  since: string;
  total: number;
  params: Record<string, string | string[] | undefined>;
}) {
  const all = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = first(value);
    if (v !== undefined && key !== 'collectedSince' && key !== 'page') all.set(key, v);
  }
  const query = all.toString();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-cyan-50 px-4 py-3 text-sm text-cyan-900 ring-1 ring-cyan-200">
      <span>
        Showing only the <strong>{plural(total, 'new signal')}</strong> found by the run at{' '}
        {formatDateTime(since)}.
      </span>
      <Link
        href={`/signals${query === '' ? '' : `?${query}`}`}
        className="text-xs font-medium text-cyan-800 underline-offset-2 hover:underline"
      >
        Show all signals
      </Link>
    </div>
  );
}
