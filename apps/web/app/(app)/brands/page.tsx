import type {
  ClientResponse,
  PlatformValue,
  SourceStatusResponse,
} from '@signal-monitoring/shared';
import type { Metadata } from 'next';
import {
  ArrowDownWideNarrow,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Gauge,
  Layers,
  MapPin,
  SearchX,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { connection } from 'next/server';
import {
  AddBrandForm,
  EditBrandAccounts,
  RemoveBrandButton,
} from '../../../components/brand-setup';
import { CampaignList, ChannelStatus, HandleText } from '../../../components/brand-parts';
import { BrandSearch } from '../../../components/brand-search';
import { ClickableCard } from '../../../components/clickable-card';
import { RunMonitoringButton } from '../../../components/run-monitoring-button';
import { ClientAvatar } from '../../../components/signal-card';
import {
  ApiErrorPanel,
  Card,
  EmptyState,
  PageHeader,
  PlatformLogo,
  cx,
} from '../../../components/ui';
import { api, attempt } from '../../../lib/api-server';
import { daysSince, formatDate } from '../../../lib/format';
import { PLATFORM_ORDER, PLATFORMS } from '../../../lib/meta';

export const metadata: Metadata = { title: 'Brands' };

const NEW_FOR_DAYS = 7;
const PAGE_SIZE = 9;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** Newest first: by when the brand was added, then by the order brands were added in. */
function newestFirst(a: ClientResponse, b: ClientResponse): number {
  const at = (c: ClientResponse) => (c.addedAt == null ? 0 : new Date(c.addedAt).getTime());
  return at(b) - at(a) || (b.addedOrder ?? 0) - (a.addedOrder ?? 0);
}

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  await connection();
  const params = await searchParams;
  const rawQuery = first(params.q)?.trim() ?? '';
  const query = rawQuery.toLowerCase();
  const requestedPage = Number.parseInt(first(params.page) ?? '1', 10);
  const [loaded, sources] = await Promise.all([
    attempt(() => api.clients()),
    attempt(() => api.sources()),
  ]);
  // Platforms with no source yet: handles are saved, not checked.
  const notConnected = new Set<PlatformValue>(
    sources.ok ? sources.data.filter((s) => s.mode === 'not_connected').map((s) => s.platform) : [],
  );
  const connected = sources.ok
    ? sources.data.filter((s) => s.mode !== 'not_connected').map((s) => s.platform)
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Brands"
        title="Who we are watching"
        description="Add a brand with its LinkedIn page and any Instagram, TikTok or YouTube accounts, check it for new posts, then draft engagement messages from the Signals page."
      />
      {sources.ok && <SourceStrip sources={sources.data} />}
      {loaded.ok ? (
        <BrandList
          all={loaded.data}
          query={query}
          rawQuery={rawQuery}
          requestedPage={Number.isFinite(requestedPage) ? requestedPage : 1}
          notConnected={notConnected}
          connected={connected}
        />
      ) : (
        <>
          <AddBrandForm connected={connected} />
          <ApiErrorPanel message={loaded.error} />
        </>
      )}
    </div>
  );
}

const MODE_STYLE: Record<
  SourceStatusResponse['mode'],
  { text: string; pill: string; dot: string }
> = {
  live: {
    text: 'Live',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  demo: { text: 'Demo', pill: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-400' },
  not_connected: {
    text: 'Off',
    pill: 'bg-slate-50 text-slate-500 ring-slate-200',
    dot: 'bg-slate-300',
  },
};

/** One tile per platform: which ones are watched for real, on demo data, or off. */
function SourceStrip({ sources }: { sources: SourceStatusResponse[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Sources">
      {sources.map((s) => {
        const meta = PLATFORMS[s.platform];
        const style = MODE_STYLE[s.mode];
        const off = s.mode === 'not_connected';
        return (
          <li
            key={s.platform}
            className={cx(
              'group flex items-center gap-3 rounded-2xl border bg-white/90 p-3 shadow-sm shadow-slate-200/50 transition hover:-translate-y-0.5 hover:shadow-md',
              off ? 'border-dashed border-slate-200' : 'border-slate-200/80',
            )}
          >
            <PlatformLogo platform={s.platform} size="lg" muted={off} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">
                {meta.label}
              </span>
              <span
                className={cx(
                  'mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
                  style.pill,
                )}
              >
                <span className="relative flex h-1.5 w-1.5">
                  {s.mode === 'live' && (
                    <span
                      className={cx(
                        'animate-ping-soft absolute inline-flex h-full w-full rounded-full',
                        style.dot,
                      )}
                    />
                  )}
                  <span className={cx('relative h-1.5 w-1.5 rounded-full', style.dot)} />
                </span>
                {s.mode === 'live' ? `Live · ${s.label}` : style.text}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function BrandList({
  all,
  query,
  rawQuery,
  requestedPage,
  notConnected,
  connected,
}: {
  all: ClientResponse[];
  query: string;
  rawQuery: string;
  requestedPage: number;
  notConnected: ReadonlySet<PlatformValue>;
  connected: PlatformValue[];
}) {
  const sorted = [...all].sort(newestFirst);
  const matches =
    query === '' ? sorted : sorted.filter((c) => c.name.toLowerCase().includes(query));
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pages);
  const from = (page - 1) * PAGE_SIZE;
  const shown = matches.slice(from, from + PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/*
        Toolbar: Add brand and the list title on the left; search, then the count, on the right.
        The open Add brand form takes its own full-width line.
      */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm shadow-slate-200/60 backdrop-blur sm:p-3.5">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-violet-500 via-indigo-400 to-cyan-400"
        />
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <AddBrandForm startOpen={all.length === 0} connected={connected} />
          {all.length > 0 && (
            <div className="hidden items-center gap-3 md:flex">
              <span aria-hidden className="h-8 w-px bg-slate-200" />
              <div className="leading-tight">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  Your brands
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 tabular-nums">
                    {all.length}
                  </span>
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                  <ArrowDownWideNarrow className="h-3 w-3" aria-hidden /> Newest first
                </p>
              </div>
            </div>
          )}
          {all.length > 0 && <BrandSearch className="sm:ml-auto sm:w-80 lg:w-96" />}
          {all.length > 0 && (
            <p
              className="hidden max-w-64 items-center gap-1.5 truncate rounded-full bg-violet-50 px-3 py-1.5 text-xs whitespace-nowrap text-violet-700 ring-1 ring-violet-200 ring-inset sm:inline-flex"
              aria-live="polite"
              title={query !== '' ? `Matching "${rawQuery}"` : undefined}
            >
              <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {matches.length === 0 ? (
                'No matches'
              ) : (
                <span className="truncate">
                  <span className="font-semibold tabular-nums">
                    {from + 1} to {from + shown.length}
                  </span>{' '}
                  of {matches.length}
                  {query !== '' && ` matching "${rawQuery}"`}
                </span>
              )}
            </p>
          )}
        </div>
      </div>
      {all.length > 0 && matches.length === 0 ? (
        <Card>
          <EmptyState
            icon={SearchX}
            title="No brand matches that name"
            description="Check the spelling, or clear the search to see every brand."
          />
        </Card>
      ) : (
        <>
          <ClientGrid clients={shown} notConnected={notConnected} />
          <Pagination page={page} pages={pages} rawQuery={rawQuery} />
        </>
      )}
    </div>
  );
}

/** Page numbers to show: the first, the last, and the current one with its neighbours. */
function pageItems(page: number, pages: number): (number | 'gap')[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1]);
  const items: (number | 'gap')[] = [];
  for (let n = 1; n <= pages; n += 1) {
    if (!wanted.has(n)) continue;
    const last = items[items.length - 1];
    if (typeof last === 'number' && n - last > 1) items.push('gap');
    items.push(n);
  }
  return items;
}

function Pagination({ page, pages, rawQuery }: { page: number; pages: number; rawQuery: string }) {
  if (pages <= 1) return null;
  const href = (n: number) => {
    const params = new URLSearchParams();
    if (rawQuery !== '') params.set('q', rawQuery);
    if (n > 1) params.set('page', String(n));
    const query = params.toString();
    return query === '' ? '/brands' : `/brands?${query}`;
  };
  const step =
    'inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800';
  const disabled =
    'inline-flex h-9 items-center gap-1 rounded-xl border border-slate-100 bg-slate-50 px-3 text-sm font-medium text-slate-300';
  return (
    <nav
      aria-label="Brand pages"
      className="flex flex-wrap items-center justify-between gap-3 pt-2"
    >
      <p className="text-xs text-slate-500">
        Page {page} of {pages}
      </p>
      <div className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link href={href(page - 1)} className={step} scroll={false}>
            <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
          </Link>
        ) : (
          <span className={disabled} aria-disabled>
            <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
          </span>
        )}
        <span className="hidden items-center gap-1 sm:flex">
          {pageItems(page, pages).map((item, i) =>
            item === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 text-sm text-slate-400">
                …
              </span>
            ) : (
              <Link
                key={item}
                href={href(item)}
                scroll={false}
                aria-current={item === page ? 'page' : undefined}
                className={cx(
                  'grid h-9 min-w-9 place-items-center rounded-xl px-2 text-sm font-semibold transition',
                  item === page
                    ? 'bg-linear-to-r from-violet-600 to-indigo-500 text-white shadow-md shadow-violet-500/25'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800',
                )}
              >
                {item}
              </Link>
            ),
          )}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={step} scroll={false}>
            Next <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <span className={disabled} aria-disabled>
            Next <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
    </nav>
  );
}

function ClientGrid({
  clients,
  notConnected,
}: {
  clients: ClientResponse[];
  notConnected: ReadonlySet<PlatformValue>;
}) {
  if (clients.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Users}
          title="No brands yet"
          description="Add a brand with its LinkedIn company page to start watching it."
        />
      </Card>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {clients.map((client) => (
        <li key={client.id}>
          <ClientCard client={client} notConnected={notConnected} />
        </li>
      ))}
    </ul>
  );
}

function ClientCard({
  client,
  notConnected,
}: {
  client: ClientResponse;
  notConnected: ReadonlySet<PlatformValue>;
}) {
  const platforms = PLATFORM_ORDER.filter((p) => (client.handles[p] ?? '').trim() !== '');
  const href = `/brands/${encodeURIComponent(client.id)}`;
  const addedDays = client.addedAt == null ? null : daysSince(client.addedAt);
  return (
    <ClickableCard href={href} className="group/card h-full">
      <Card className="relative flex h-full flex-col overflow-hidden p-5 transition group-hover/card:-translate-y-0.5 group-hover/card:border-violet-200 group-hover/card:shadow-lg group-hover/card:shadow-violet-100/70">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-20 bg-linear-to-br from-violet-50 via-white to-cyan-50"
        />
        <div className="relative flex items-start gap-3">
          <ClientAvatar name={client.name} size="lg" />
          <div className="min-w-0 flex-1">
            <Link
              href={href}
              className="flex items-center gap-1 truncate text-base font-semibold text-slate-900 hover:text-violet-700"
            >
              <span className="truncate">{client.name}</span>
              {addedDays !== null && addedDays < NEW_FOR_DAYS && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
                  <Sparkles className="h-2.5 w-2.5" aria-hidden /> New
                </span>
              )}
              <ArrowRight
                className="h-4 w-4 shrink-0 -translate-x-1 opacity-0 transition group-hover/card:translate-x-0 group-hover/card:opacity-100"
                aria-hidden
              />
            </Link>
            <p className="text-xs text-slate-500">
              {client.addedAt != null && `Added ${formatDate(client.addedAt)} · `}
              {client.lastActiveDate === null
                ? 'Last activity with us not recorded'
                : `Last active with us ${formatDate(client.lastActiveDate)}`}
            </p>
            <div className="mt-2 flex items-center gap-1" aria-label="Channels">
              {PLATFORM_ORDER.map((p) => (
                <PlatformLogo
                  key={p}
                  platform={p}
                  size="xs"
                  muted={!platforms.includes(p)}
                  className={platforms.includes(p) ? undefined : 'opacity-60'}
                />
              ))}
            </div>
          </div>
        </div>

        {client.publicProfile !== null && <PublicProfileRow profile={client.publicProfile} />}

        <div className="relative mt-5 flex-1">
          {platforms.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
              No official brand social accounts connected. News and website monitoring can still
              continue.
            </p>
          ) : (
            <ul className="space-y-2">
              {platforms.map((platform) => (
                <li
                  key={platform}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-2.5 py-2 transition hover:border-slate-200 hover:bg-white"
                >
                  <PlatformLogo platform={platform} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                      {PLATFORMS[platform].label}
                    </span>
                    <HandleText value={client.handles[platform] ?? ''} />
                  </span>
                  <ChannelStatus
                    off={notConnected.has(platform)}
                    checked={client.lastCheckedAt[platform]}
                  />
                </li>
              ))}
            </ul>
          )}
          <EditBrandAccounts clientId={client.id} name={client.name} handles={client.handles} />
        </div>

        <CampaignList campaigns={client.campaigns} />

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-4">
          {platforms.length > 0 && (
            <>
              <RunMonitoringButton size="sm" clientId={client.id} />
              <Link
                href={`/signals?clientId=${encodeURIComponent(client.id)}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-800"
              >
                View signals <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </>
          )}
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-violet-700"
          >
            <Gauge className="h-3.5 w-3.5" aria-hidden /> Details
          </Link>
          <span className="ml-auto">
            <RemoveBrandButton clientId={client.id} name={client.name} />
          </span>
        </div>
      </Card>
    </ClickableCard>
  );
}

function PublicProfileRow({ profile }: { profile: NonNullable<ClientResponse['publicProfile']> }) {
  return (
    <a
      href={profile.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative mt-4 flex items-start gap-3 rounded-xl border border-linkedin/20 bg-linkedin/5 p-3 transition hover:border-linkedin/40 hover:bg-linkedin/10"
    >
      <PlatformLogo platform="LINKEDIN" size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-xs font-semibold text-linkedin">
          LinkedIn profile
          <ExternalLink className="h-3 w-3 opacity-60 group-hover:opacity-100" aria-hidden />
        </span>
        {profile.headline !== null && (
          <span className="mt-0.5 block text-sm leading-snug text-slate-700">
            {profile.headline}
          </span>
        )}
        {profile.location !== null && (
          <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3 w-3" aria-hidden /> {profile.location}
          </span>
        )}
      </span>
    </a>
  );
}
