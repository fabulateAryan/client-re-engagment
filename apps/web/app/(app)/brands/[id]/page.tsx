import type {
  ClientResponse,
  MonitoringCheckResponse,
  MonitoringRunResponse,
  PlatformValue,
  SignalResponse,
  SourceStatusResponse,
} from '@signal-monitoring/shared';
import type { Metadata } from 'next';
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Clock,
  Inbox,
  Radio,
  Timer,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { BrandLiveProgress } from '../../../../components/brand-live-progress';
import { CampaignList, ChannelStatus, HandleText } from '../../../../components/brand-parts';
import { EditBrandAccounts, RemoveBrandButton } from '../../../../components/brand-setup';
import { RunMonitoringButton } from '../../../../components/run-monitoring-button';
import { CheckLine, CheckOutcome } from '../../../../components/run-progress-panel';
import { ClientAvatar, SignalRow } from '../../../../components/signal-card';
import {
  ApiErrorPanel,
  Card,
  CardHeader,
  EmptyState,
  PlatformLogo,
  StatCard,
  cx,
} from '../../../../components/ui';
import { api, attempt } from '../../../../lib/api-server';
import {
  formatDate,
  formatDateTime,
  formatDuration,
  plural,
  timeAgo,
} from '../../../../lib/format';
import { PLATFORM_ORDER, PLATFORMS } from '../../../../lib/meta';

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const clients = await attempt(() => api.clients());
  const client = clients.ok ? clients.data.find((c) => c.id === id) : undefined;
  return { title: client?.name ?? 'Brand' };
}

export default async function BrandPage({ params }: { params: Params }) {
  await connection();
  const { id } = await params;
  const loaded = await attempt(() =>
    Promise.all([
      api.clients(),
      api.sources(),
      api.runs(100),
      api.signals({ clientId: id, pageSize: 5 }),
      api.signals({ clientId: id, view: 'skipped', pageSize: 1 }),
    ]),
  );

  if (!loaded.ok) {
    return (
      <div className="space-y-6">
        <BackLink />
        <ApiErrorPanel message={loaded.error} />
      </div>
    );
  }
  const [clients, sources, runs, signals, skipped] = loaded.data;
  const client = clients.find((c) => c.id === id);
  if (client === undefined) notFound();

  return (
    <BrandView
      client={client}
      sources={sources}
      runs={runs.items}
      topSignals={signals.items}
      signalTotal={signals.total}
      skippedTotal={skipped.total}
    />
  );
}

function BackLink() {
  return (
    <Link
      href="/brands"
      className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-violet-700"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden /> All brands
    </Link>
  );
}

/** This brand's part of one run. */
interface BrandRun {
  run: MonitoringRunResponse;
  checks: MonitoringCheckResponse[];
  /** From this brand's first check starting to its last one finishing. */
  durationMs: number;
}

function brandRunsOf(clientId: string, runs: MonitoringRunResponse[]): BrandRun[] {
  return runs
    .map((run) => ({ run, checks: run.checks.filter((c) => c.clientId === clientId) }))
    .filter((entry) => entry.checks.length > 0)
    .map(({ run, checks }) => {
      const start = Math.min(...checks.map((c) => new Date(c.startedAt).getTime()));
      const end = Math.max(...checks.map((c) => new Date(c.finishedAt).getTime()));
      return { run, checks, durationMs: Math.max(0, end - start) };
    });
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
}

function BrandView({
  client,
  sources,
  runs,
  topSignals,
  signalTotal,
  skippedTotal,
}: {
  client: ClientResponse;
  sources: SourceStatusResponse[];
  runs: MonitoringRunResponse[];
  topSignals: SignalResponse[];
  signalTotal: number;
  skippedTotal: number;
}) {
  const platforms = PLATFORM_ORDER.filter((p) => (client.handles[p] ?? '').trim() !== '');
  const notConnected = new Set(
    sources.filter((s) => s.mode === 'not_connected').map((s) => s.platform),
  );
  const livePlatforms = platforms.filter((p) => !notConnected.has(p));
  const brandRuns = brandRunsOf(client.id, runs);
  const latest = brandRuns[0];
  const avgJob = average(brandRuns.map((r) => r.durationMs));
  const lastCheckedTimes = Object.values(client.lastCheckedAt).filter(
    (v): v is string => v !== undefined,
  );
  const lastChecked =
    latest?.run.finishedAt ??
    (lastCheckedTimes.length === 0 ? null : lastCheckedTimes.sort().reverse()[0]);
  const lastErrors = latest?.checks.filter((c) => c.error !== null).length ?? 0;

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-28 bg-linear-to-br from-violet-100/70 via-white to-cyan-100/70"
        />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
          <ClientAvatar name={client.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium tracking-[0.18em] text-violet-700 uppercase">Brand</p>
            <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              {client.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {client.lastActiveDate === null
                ? 'Last activity with us not recorded'
                : `Last active with us ${formatDate(client.lastActiveDate)}`}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Channels">
              {PLATFORM_ORDER.map((p) => (
                <PlatformLogo
                  key={p}
                  platform={p}
                  size="sm"
                  muted={!platforms.includes(p)}
                  className={platforms.includes(p) ? undefined : 'opacity-50'}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {platforms.length > 0 && <RunMonitoringButton clientId={client.id} />}
            <Link
              href={`/signals?clientId=${encodeURIComponent(client.id)}`}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:border-violet-200 hover:text-violet-700"
            >
              View signals <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <BrandLiveProgress clientId={client.id} platforms={platforms} />

      {/* Key figures */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Key figures">
        <StatCard
          label="Accounts watched"
          value={`${livePlatforms.length}/${platforms.length}`}
          hint={
            platforms.length === livePlatforms.length
              ? 'Every account has a live source'
              : `${plural(platforms.length - livePlatforms.length, 'source')} off`
          }
          icon={Users}
          accent="bg-violet-500"
        />
        <StatCard
          label="Signals collected"
          value={signalTotal.toLocaleString('en-AU')}
          hint={skippedTotal > 0 ? `${skippedTotal} skipped` : 'To review'}
          icon={Radio}
          accent="bg-cyan-400"
        />
        <StatCard
          label="Last checked"
          value={lastChecked == null ? 'Never' : timeAgo(lastChecked)}
          hint={
            latest === undefined
              ? 'Press Check now to start'
              : `Took ${formatDuration(latest.durationMs)} · ${plural(latest.checks.length, 'account')}${lastErrors > 0 ? ` · ${plural(lastErrors, 'error')}` : ''}`
          }
          icon={Clock}
          accent="bg-emerald-400"
        />
        <StatCard
          label="Average check time"
          value={avgJob === null ? '–' : formatDuration(avgJob)}
          hint={
            brandRuns.length === 0
              ? 'No checks recorded yet'
              : `Across ${plural(brandRuns.length, 'check')}`
          }
          icon={Timer}
          accent="bg-amber-400"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <AccountsCard
            client={client}
            platforms={platforms}
            notConnected={notConnected}
            brandRuns={brandRuns}
          />
          {latest !== undefined && <Timeline latest={latest} />}
        </div>
        <div className="space-y-4 lg:col-span-2">
          <TopSignals clientId={client.id} signals={topSignals} />
          <History brandRuns={brandRuns} />
        </div>
      </div>

      {client.campaigns.length > 0 && (
        <Card className="p-5">
          <CampaignList campaigns={client.campaigns} />
        </Card>
      )}

      <div className="flex justify-end">
        <RemoveBrandButton clientId={client.id} name={client.name} redirectTo="/brands" />
      </div>
    </div>
  );
}

/** Every account: where it is, whether its source is on, and how its checks have gone. */
function AccountsCard({
  client,
  platforms,
  notConnected,
  brandRuns,
}: {
  client: ClientResponse;
  platforms: PlatformValue[];
  notConnected: ReadonlySet<PlatformValue>;
  brandRuns: BrandRun[];
}) {
  return (
    <Card>
      <CardHeader
        title="Accounts"
        subtitle="Each account is checked on every run. Times are from the checks recorded since the API started."
      />
      {platforms.length === 0 ? (
        <p className="mx-5 mt-4 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-500">
          No accounts yet. Add one below.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {platforms.map((platform) => {
            const history = brandRuns.flatMap((r) =>
              r.checks.filter((c) => c.platform === platform),
            );
            const last = history[0];
            const avg = average(history.filter((c) => c.sourceConnected).map((c) => c.durationMs));
            const totalNew = history.reduce((sum, c) => sum + c.newSignalsSaved, 0);
            return (
              <li
                key={platform}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <PlatformLogo platform={platform} size="md" />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                      {PLATFORMS[platform].label}
                    </p>
                    <HandleText value={client.handles[platform] ?? ''} />
                  </div>
                </div>
                <dl className="grid grid-cols-4 gap-3 text-xs sm:w-[22rem]">
                  <div>
                    <dt className="text-slate-400">Status</dt>
                    <dd className="mt-0.5">
                      <ChannelStatus
                        off={notConnected.has(platform)}
                        checked={client.lastCheckedAt[platform]}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Last result</dt>
                    <dd className="mt-0.5">
                      {last === undefined ? '–' : <CheckOutcome check={last} />}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Last took</dt>
                    <dd className="mt-0.5 font-medium text-slate-800 tabular-nums">
                      {last === undefined ? '–' : formatDuration(last.durationMs)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">New total</dt>
                    <dd className="mt-0.5 font-medium text-slate-800 tabular-nums">
                      {totalNew}
                      {avg !== null && (
                        <span className="block font-normal text-slate-400">
                          avg {formatDuration(avg)}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
                {last?.error != null && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 ring-1 ring-amber-200 sm:hidden">
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {last.error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="px-5 pb-5">
        <EditBrandAccounts clientId={client.id} name={client.name} handles={client.handles} />
      </div>
    </Card>
  );
}

/** The last check as a waterfall: when each account started and how long it took. */
function Timeline({ latest }: { latest: BrandRun }) {
  const start = Math.min(...latest.checks.map((c) => new Date(c.startedAt).getTime()));
  const total = Math.max(latest.durationMs, 1);
  const slowest = latest.checks.reduce((a, b) => (b.durationMs > a.durationMs ? b : a));
  return (
    <Card>
      <CardHeader
        title="Last check, step by step"
        subtitle={`${formatDateTime(latest.run.startedAt)} · ${formatDuration(latest.durationMs)} for ${plural(latest.checks.length, 'account')}`}
      />
      <ul className="space-y-3 px-5 pt-4 pb-5">
        {latest.checks.map((check) => {
          const offset = ((new Date(check.startedAt).getTime() - start) / total) * 100;
          const width = Math.max((check.durationMs / total) * 100, 1.5);
          return (
            <li
              key={check.platform}
              className="grid grid-cols-[6.5rem_1fr_4rem] items-center gap-3 text-xs"
            >
              <span className="flex items-center gap-2 font-medium text-slate-700">
                <PlatformLogo platform={check.platform} size="xs" muted={!check.sourceConnected} />
                {PLATFORMS[check.platform].label}
              </span>
              <span className="relative h-3 rounded-full bg-slate-100">
                <span
                  className={cx(
                    'absolute inset-y-0 rounded-full',
                    check.error !== null
                      ? 'bg-amber-400'
                      : !check.sourceConnected
                        ? 'bg-slate-300'
                        : 'bg-linear-to-r from-violet-500 to-cyan-400',
                  )}
                  style={{
                    left: `${Math.min(offset, 98.5)}%`,
                    width: `${Math.min(width, 100 - offset)}%`,
                  }}
                  title={check.error ?? undefined}
                />
              </span>
              <span className="text-right text-slate-500 tabular-nums">
                {formatDuration(check.durationMs)}
              </span>
            </li>
          );
        })}
      </ul>
      {latest.checks.length > 1 && (
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Slowest: {PLATFORMS[slowest.platform].label} at {formatDuration(slowest.durationMs)} (
          {Math.round((slowest.durationMs / total) * 100)}% of the check).
        </p>
      )}
    </Card>
  );
}

function TopSignals({ clientId, signals }: { clientId: string; signals: SignalResponse[] }) {
  return (
    <Card>
      <CardHeader
        title="Top signals"
        subtitle="This brand's most relevant activity"
        action={
          <Link
            href={`/signals?clientId=${encodeURIComponent(clientId)}`}
            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-800"
          >
            View all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        }
      />
      {signals.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No signals yet"
          description="Press Check now to look for this brand's latest posts."
        />
      ) : (
        <ul className="mt-2 divide-y divide-slate-100">
          {signals.map((signal) => (
            <SignalRow key={signal.id} signal={signal} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function History({ brandRuns }: { brandRuns: BrandRun[] }) {
  return (
    <Card>
      <CardHeader
        title="Check history"
        subtitle="Every run that included this brand, newest first"
      />
      {brandRuns.length === 0 ? (
        <p className="px-5 pt-3 pb-5 text-xs text-slate-500">
          No checks recorded yet. History restarts when the API restarts.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {brandRuns.slice(0, 15).map(({ run, checks, durationMs }) => {
            const found = checks.reduce((s, c) => s + c.signalsFound, 0);
            const fresh = checks.reduce((s, c) => s + c.newSignalsSaved, 0);
            const errors = checks.filter((c) => c.error !== null).length;
            return (
              <li key={run.id}>
                <details className="group px-5 py-3">
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <span
                      className={cx(
                        'h-2 w-2 shrink-0 rounded-full',
                        errors > 0 ? 'bg-amber-400' : 'bg-emerald-400',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800">
                        {formatDateTime(run.startedAt)}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {run.clientIds === null ? 'All brands' : 'Check now'} · took{' '}
                        {formatDuration(durationMs)}
                      </span>
                    </span>
                    <span className="text-right text-xs text-slate-500">
                      <span className="font-semibold text-cyan-700 tabular-nums">{fresh}</span> new
                      <span className="block">
                        {found} found{errors > 0 && ` · ${errors} failed`}
                      </span>
                    </span>
                  </summary>
                  <ul className="mt-3 space-y-1.5 rounded-xl bg-slate-50 p-3">
                    {checks.map((check) => (
                      <CheckLine key={check.platform} check={check} />
                    ))}
                  </ul>
                  {checks
                    .filter((c) => c.error !== null)
                    .map((c) => (
                      <p key={c.platform} className="mt-2 text-xs text-amber-800">
                        {PLATFORMS[c.platform].label}: {c.error}
                      </p>
                    ))}
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
