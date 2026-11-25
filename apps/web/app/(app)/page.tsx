import type {
  MonitoringRunListResponse,
  MonitoringRunResponse,
  OutreachThreadResponse,
  SignalPageResponse,
  SignalSummaryResponse,
} from '@signal-monitoring/shared';
import {
  Activity,
  ArrowRight,
  CircleAlert,
  CircleCheck,
  Clock,
  Flame,
  Hand,
  Inbox,
  MailCheck,
  MessageCircleReply,
  Reply,
  Send,
  Sparkles,
  Target,
  Timer,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { connection } from 'next/server';
import { ContactToday } from '../../components/overview-contact-today';
import type { ContactTodayItem } from '../../components/overview-contact-today';
import { RunMonitoringButton } from '../../components/run-monitoring-button';
import { ClientAvatar } from '../../components/signal-card';
import {
  ApiErrorPanel,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  RelevantOnlyNote,
  StatCard,
  cx,
} from '../../components/ui';
import { api } from '../../lib/api-server';
import { formatDate, plural, timeAgo } from '../../lib/format';
import {
  ACTIVITY_WINDOW_DAYS,
  WAITING_TOO_LONG_HOURS,
  buildManagerView,
} from '../../lib/manager-view';
import type { ManagerView } from '../../lib/manager-view';
import { SIGNAL_TYPES } from '../../lib/meta';

/** The API's largest page; the plan is worked out from this many top-ranked signals. */
const SIGNAL_SAMPLE = 100;
/** Brands shown in "Contact today". */
const CONTACT_LIMIT = 5;
/** A run older than this is flagged as stale. */
const STALE_RUN_DAYS = 2;
/** A thread with no reply this long after the last email is due a follow-up. */
const FOLLOW_UP_AFTER_DAYS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

interface OverviewData {
  summary: SignalSummaryResponse;
  review: SignalPageResponse;
  view: ManagerView;
  runs: MonitoringRunListResponse;
  /** Null when the outreach list could not be loaded; the rest of the page still works. */
  threads: OutreachThreadResponse[] | null;
  repliesInApp: boolean;
  now: number;
}

async function load(): Promise<OverviewData | { error: string }> {
  try {
    const [summary, review, skipped, runs, outreach, status] = await Promise.all([
      api.signalSummary(),
      api.signals({ view: 'to_review', pageSize: SIGNAL_SAMPLE }),
      api.signals({ view: 'skipped', pageSize: SIGNAL_SAMPLE }),
      api.runs(1),
      api.outreach().catch(() => null),
      api.emailStatus().catch(() => null),
    ]);
    const now = Date.now();
    return {
      summary,
      review,
      view: buildManagerView(review.items, skipped.items, now),
      runs,
      threads: outreach?.items ?? null,
      repliesInApp: status?.enabled === true && status.repliesInApp === true,
      now,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export default async function OverviewPage() {
  await connection();
  const data = await load();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Today's re-engagement plan"
        description="Replies first, then the best brand to contact, then follow-ups. Everything a salesperson needs in one place."
        actions={<RunMonitoringButton />}
      />
      {'error' in data ? <ApiErrorPanel message={data.error} /> : <Overview {...data} />}
    </div>
  );
}

function Overview({ summary, review, view, runs, threads, repliesInApp, now }: OverviewData) {
  const health = runHealth(runs.items[0], now);
  const { contactToday, holdOff, activity } = view;
  const allThreads = threads ?? [];
  const replies = allThreads.filter((t) => t.needsResponse);
  const followUps = allThreads.filter(
    (t) =>
      t.replies === 0 &&
      now - new Date(t.lastActivityAt).getTime() >= FOLLOW_UP_AFTER_DAYS * DAY_MS,
  );
  const draftReady = contactToday.filter((b) => b.status === 'draft_ready').length;
  const contactItems: ContactTodayItem[] = contactToday.slice(0, CONTACT_LIMIT).map((plan) => ({
    clientId: plan.clientId,
    clientName: plan.clientName,
    signalId: plan.best.id,
    score: plan.best.score,
    priority: plan.best.priority,
    reason: plan.best.reason,
    signalTypeLabel: SIGNAL_TYPES[plan.best.signalType].label,
    waitingTooLong: plan.waitingTooLong,
    otherSignals: plan.otherSignals,
    draft: plan.best.draft,
  }));

  return (
    <>
      {health.tone !== 'ok' && <HealthLine {...health} />}
      <RelevantOnlyNote minScore={summary.minScore} maxAgeDays={summary.maxAgeDays} />

      <FocusBanner
        replies={replies.length}
        toContact={contactToday.length}
        followUps={followUps.length}
        now={now}
      />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="Key figures">
        <StatCard
          label="Brands to contact"
          value={contactToday.length}
          hint={
            draftReady > 0
              ? `${plural(draftReady, 'draft')} ready to send`
              : 'One message per brand'
          }
          icon={Target}
          accent="bg-violet-500"
        />
        <StatCard
          label="High priority, not started"
          value={view.highWaiting}
          hint={
            view.highWaitingTooLong > 0 ? (
              <span className="font-medium text-rose-700">
                {view.highWaitingTooLong} waiting over {WAITING_TOO_LONG_HOURS / 24} days
              </span>
            ) : (
              'None waiting too long'
            )
          }
          icon={Flame}
          accent="bg-emerald-400"
        />
        <StatCard
          label={`Team activity, last ${ACTIVITY_WINDOW_DAYS} days`}
          value={activity.sent + activity.skipped}
          hint={`${activity.sent} sent · ${activity.skipped} skipped`}
          icon={Users}
          accent="bg-cyan-400"
        />
        <StatCard
          label="Holding off"
          value={holdOff.length}
          hint="Contacted recently or weak signal"
          icon={Hand}
          accent="bg-amber-400"
        />
      </section>

      {summary.total === 0 && allThreads.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="No signals yet"
            description="Run monitoring to check every brand's social channels and collect their latest activity."
            action={<RunMonitoringButton size="lg" />}
          />
        </Card>
      ) : (
        <>
          <NeedsYouNow threads={replies} repliesInApp={repliesInApp} now={now} />

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader
                title="Contact today"
                subtitle="The strongest signal for each brand, one email per brand."
                action={<ViewAll href="/signals" />}
              />
              <ContactToday items={contactItems} />
              {(contactToday.length > CONTACT_LIMIT || review.total > review.items.length) && (
                <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                  {contactToday.length > CONTACT_LIMIT &&
                    `${plural(contactToday.length - CONTACT_LIMIT, 'more brand')} on the Signals page. `}
                  {review.total > review.items.length &&
                    `Worked out from the top ${review.items.length} of ${review.total} signals by score.`}
                </p>
              )}
            </Card>

            <div className="space-y-4 lg:col-span-2">
              <FollowUpsDue threads={followUps} />
              <Pipeline signals={summary.total} threads={allThreads} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <BrandStatus view={view} threads={allThreads} />
            <MonitoringCard health={health} run={runs.items[0]} />
          </div>
        </>
      )}
    </>
  );
}

/* ---------- Today's focus ---------- */

function greeting(now: number): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-AU', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Australia/Sydney',
    }).format(new Date(now)),
  );
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function FocusBanner({
  replies,
  toContact,
  followUps,
  now,
}: {
  replies: number;
  toContact: number;
  followUps: number;
  now: number;
}) {
  const steps: { icon: LucideIcon; value: number; label: string; href: string }[] = [
    { icon: MessageCircleReply, value: replies, label: 'replies to answer', href: '/outreach' },
    { icon: Send, value: toContact, label: 'brands to contact', href: '/signals' },
    { icon: Timer, value: followUps, label: 'follow-ups due', href: '/outreach' },
  ];
  const clear = replies + toContact + followUps === 0;
  return (
    <section
      aria-label="Today's focus"
      className="relative overflow-hidden rounded-2xl bg-linear-to-br from-violet-700 via-violet-600 to-fuchsia-600 p-5 text-white shadow-lg shadow-violet-200 sm:p-6"
    >
      <div className="pointer-events-none absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-cyan-300/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-violet-100 uppercase">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Today&apos;s focus
          </p>
          <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
            {greeting(now)}. {clear ? 'You are all caught up.' : 'Here is what needs you today.'}
          </h2>
          <p className="mt-1 text-sm text-violet-100">
            Work top to bottom: answer replies, approve ready emails, then follow up.
          </p>
        </div>
        <ol className="grid grid-cols-3 gap-2 sm:gap-3">
          {steps.map(({ icon: Icon, value, label, href }, index) => (
            <li key={label}>
              <Link
                href={href}
                className="flex h-full flex-col rounded-xl bg-white/10 px-3 py-2.5 ring-1 ring-white/20 backdrop-blur transition hover:bg-white/20"
              >
                <span className="flex items-center gap-1.5 text-[11px] text-violet-100">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-white/20 text-[10px] font-semibold">
                    {index + 1}
                  </span>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="mt-1 text-2xl font-semibold tabular-nums">{value}</span>
                <span className="text-[11px] leading-tight text-violet-100">{label}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------- Needs you now ---------- */

function NeedsYouNow({
  threads,
  repliesInApp,
  now,
}: {
  threads: OutreachThreadResponse[];
  repliesInApp: boolean;
  now: number;
}) {
  return (
    <Card className="overflow-hidden border-sky-200/80">
      <div className="flex items-start justify-between gap-4 bg-linear-to-r from-sky-50 to-white px-5 pt-5 pb-3">
        <div className="flex items-center gap-3">
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-sky-600 text-white shadow-sm">
            <MessageCircleReply className="h-4 w-4" aria-hidden />
            {threads.length > 0 && (
              <span className="absolute -top-1 -right-1 h-3 w-3 animate-pulse rounded-full bg-rose-500 ring-2 ring-white" />
            )}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Needs you now</h2>
            <p className="text-xs text-slate-500">
              Brands that replied and are waiting to hear back. The warmest leads you have.
            </p>
          </div>
        </div>
        <ViewAll href="/outreach" />
      </div>
      {threads.length === 0 ? (
        <div className="flex items-center gap-3 px-5 pt-2 pb-5 text-sm text-slate-500">
          <MailCheck className="h-4 w-4 text-emerald-600" aria-hidden />
          {repliesInApp
            ? 'No replies waiting. New replies show up here as soon as they arrive.'
            : 'No replies yet. Replies appear here once Gmail or SendGrid Inbound Parse is connected.'}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {threads.slice(0, 5).map((t) => {
            const last = t.draft.thread[t.draft.thread.length - 1];
            return (
              <li key={t.signalId} className="flex items-center gap-3 px-5 py-3">
                <ClientAvatar name={t.clientName ?? '?'} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-semibold text-slate-900">
                      {t.clientName ?? 'Unknown brand'}
                    </span>
                    <span className="text-xs text-slate-500">
                      {last?.from ?? t.draft.recipient}
                    </span>
                  </p>
                  <p className="line-clamp-1 text-sm text-slate-600">“{last?.text ?? ''}”</p>
                </div>
                <span className="hidden shrink-0 text-xs text-slate-500 sm:inline">
                  {timeAgo(t.lastActivityAt, now)}
                </span>
                <Link
                  href={`/outreach?open=${encodeURIComponent(t.signalId)}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-700"
                >
                  <Reply className="h-3.5 w-3.5" aria-hidden /> Reply
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Follow-ups due ---------- */

function FollowUpsDue({ threads }: { threads: OutreachThreadResponse[] }) {
  return (
    <Card>
      <CardHeader
        title="Follow-ups due"
        subtitle={`No reply ${FOLLOW_UP_AFTER_DAYS}+ days after the last email`}
        action={<ViewAll href="/outreach" />}
      />
      {threads.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pt-3 pb-5 text-sm text-slate-500">
          <CircleCheck className="h-4 w-4 text-emerald-600" aria-hidden /> Nothing due. Threads
          appear here when they go quiet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 px-5 pt-2 pb-3">
          {threads.slice(0, 5).map((t) => (
            <li key={t.signalId} className="flex items-center gap-3 py-2.5">
              <ClientAvatar name={t.clientName ?? '?'} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {t.clientName ?? 'Unknown brand'}
                </p>
                <p className="text-xs text-slate-500">
                  Last email {formatDate(t.lastActivityAt)} · no reply
                </p>
              </div>
              <Link
                href={`/outreach?open=${encodeURIComponent(t.signalId)}`}
                className="shrink-0 rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
              >
                Follow up
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- Pipeline ---------- */

function Pipeline({ signals, threads }: { signals: number; threads: OutreachThreadResponse[] }) {
  const emailed = threads.length;
  const replied = threads.filter((t) => t.replies > 0).length;
  const rate = emailed === 0 ? null : Math.round((replied / emailed) * 100);
  const steps = [
    { label: 'Signals found', value: signals, bar: 'bg-violet-500' },
    { label: 'Brands emailed', value: emailed, bar: 'bg-fuchsia-500' },
    { label: 'Replied', value: replied, bar: 'bg-sky-500' },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <Card>
      <CardHeader
        title="Pipeline"
        subtitle="From signal to conversation, emails sent from the app"
      />
      <ul className="space-y-3 px-5 pt-4">
        {steps.map((s) => (
          <li key={s.label}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600">{s.label}</span>
              <span className="font-semibold text-slate-900 tabular-nums">{s.value}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cx('h-full rounded-full', s.bar)}
                style={{ width: `${Math.max(s.value > 0 ? 4 : 0, (s.value / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 px-5 py-3">
        <span className="text-xs text-slate-500">Reply rate</span>
        <span className="text-lg font-semibold text-slate-900 tabular-nums">
          {rate === null ? '–' : `${rate}%`}
        </span>
      </div>
      <p className="px-5 pb-4 text-[11px] text-slate-500">Meetings booked are not tracked yet.</p>
    </Card>
  );
}

/* ---------- Brand status ---------- */

type BrandStatusKind = 'replied' | 'draft_ready' | 'not_started' | 'awaiting' | 'holding';

const BRAND_STATUS: Record<BrandStatusKind, { label: string; className: string; order: number }> = {
  replied: { label: 'Replied', className: 'bg-sky-100 text-sky-800', order: 0 },
  draft_ready: { label: 'Draft ready', className: 'bg-violet-100 text-violet-800', order: 1 },
  not_started: { label: 'To contact', className: 'bg-slate-100 text-slate-700', order: 2 },
  awaiting: { label: 'Awaiting reply', className: 'bg-amber-100 text-amber-800', order: 3 },
  holding: { label: 'Holding off', className: 'bg-slate-100 text-slate-500', order: 4 },
};

interface BrandRow {
  key: string;
  name: string;
  href: string | null;
  status: BrandStatusKind;
  lastContact: string | null;
}

function BrandStatus({ view, threads }: { view: ManagerView; threads: OutreachThreadResponse[] }) {
  const rows = new Map<string, BrandRow>();
  // Email threads know the brand only by name, so rows are matched by name.
  for (const t of threads) {
    const name = t.clientName ?? 'Unknown brand';
    if (rows.has(name)) continue;
    rows.set(name, {
      key: t.signalId,
      name,
      href: null,
      status: t.replies > 0 ? 'replied' : 'awaiting',
      lastContact: t.lastActivityAt,
    });
  }
  for (const plan of view.contactToday) {
    const existing = rows.get(plan.clientName);
    const href = `/brands/${encodeURIComponent(plan.clientId)}`;
    if (existing !== undefined) {
      rows.set(plan.clientName, { ...existing, href });
      continue;
    }
    rows.set(plan.clientName, {
      key: plan.clientId,
      name: plan.clientName,
      href,
      status: plan.status === 'draft_ready' ? 'draft_ready' : 'not_started',
      lastContact: null,
    });
  }
  for (const held of view.holdOff) {
    const existing = rows.get(held.clientName);
    const href = `/brands/${encodeURIComponent(held.clientId)}`;
    if (existing !== undefined) {
      rows.set(held.clientName, { ...existing, href });
      continue;
    }
    rows.set(held.clientName, {
      key: held.clientId,
      name: held.clientName,
      href,
      status: 'holding',
      lastContact: held.lastContactedAt,
    });
  }
  const sorted = [...rows.values()].sort(
    (a, b) => BRAND_STATUS[a.status].order - BRAND_STATUS[b.status].order,
  );

  return (
    <Card className="lg:col-span-3">
      <CardHeader
        title="Brand status"
        subtitle="Where every brand stands, replies first"
        action={<ViewAll href="/brands" />}
      />
      {sorted.length === 0 ? (
        <p className="px-5 pt-3 pb-5 text-sm text-slate-500">No brands yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/60 text-[11px] tracking-wide text-slate-500 uppercase">
                <th className="px-5 py-2 font-medium">Brand</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-5 py-2 text-right font-medium">Last contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.slice(0, 5).map((row) => {
                const status = BRAND_STATUS[row.status];
                return (
                  <tr key={row.key}>
                    <td className="px-5 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <ClientAvatar name={row.name} size="sm" />
                        {row.href === null ? (
                          <span className="font-medium text-slate-900">{row.name}</span>
                        ) : (
                          <Link
                            href={row.href}
                            className="font-medium text-slate-900 hover:text-violet-700"
                          >
                            {row.name}
                          </Link>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cx(
                          'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          status.className,
                        )}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-right text-xs text-slate-500">
                      {row.lastContact === null ? 'Not yet' : formatDate(row.lastContact)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sorted.length > 10 && (
            <p className="px-5 py-3 text-xs text-slate-500">
              +{plural(sorted.length - 10, 'more brand')}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/* ---------- Monitoring health ---------- */

interface Health {
  tone: 'ok' | 'warn' | 'bad';
  icon: LucideIcon;
  message: ReactNode;
}

function runHealth(run: MonitoringRunResponse | undefined, now: number): Health {
  if (run === undefined) {
    return {
      tone: 'warn',
      icon: CircleAlert,
      message: "Monitoring has never run. Run it to collect your brands' latest activity.",
    };
  }
  if (run.status === 'RUNNING') {
    return {
      tone: 'ok',
      icon: Clock,
      message: `A monitoring run is going now (started ${timeAgo(run.startedAt)}).`,
    };
  }
  const when = run.finishedAt ?? run.startedAt;
  const runLink = (
    <Link href="/runs" className="font-medium underline underline-offset-2">
      See runs
    </Link>
  );
  if (run.status === 'INTERRUPTED') {
    return {
      tone: 'bad',
      icon: CircleAlert,
      message: (
        <>
          The last run stopped before it finished ({timeAgo(when)}). Some brands were not checked.{' '}
          {runLink}
        </>
      ),
    };
  }
  if (run.errors.length > 0) {
    return {
      tone: 'warn',
      icon: CircleAlert,
      message: (
        <>
          The last run ({timeAgo(when)}) had {plural(run.errors.length, 'error')}, so some brands
          may be missing new posts. {runLink}
        </>
      ),
    };
  }
  if (now - new Date(when).getTime() > STALE_RUN_DAYS * DAY_MS) {
    return {
      tone: 'warn',
      icon: Clock,
      message: `Monitoring last ran ${timeAgo(when)} (${formatDate(when)}). Run it again for fresh signals.`,
    };
  }
  return {
    tone: 'ok',
    icon: CircleCheck,
    message: `Healthy. Last run ${timeAgo(when)}, ${plural(run.clientsChecked, 'brand')} checked, no errors.`,
  };
}

const HEALTH_TONE = {
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  bad: 'bg-rose-50 text-rose-800 ring-rose-200',
} as const;

function HealthLine({ tone, icon: Icon, message }: Health) {
  return (
    <p
      role={tone === 'ok' ? undefined : 'alert'}
      className={cx(
        'flex items-start gap-2 rounded-xl px-3 py-2 text-xs ring-1',
        HEALTH_TONE[tone],
      )}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

function MonitoringCard({
  health,
  run,
}: {
  health: Health;
  run: MonitoringRunResponse | undefined;
}) {
  const Icon = health.icon;
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        title="Monitoring health"
        subtitle="Brand channels checked for new activity"
        action={<ViewAll href="/runs" />}
      />
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-start gap-3">
          <span
            className={cx(
              'grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1',
              HEALTH_TONE[health.tone],
            )}
          >
            {health.tone === 'ok' ? (
              <Activity className="h-4 w-4" aria-hidden />
            ) : (
              <Icon className="h-4 w-4" aria-hidden />
            )}
          </span>
          <p className="text-sm text-slate-600">{health.message}</p>
        </div>
        {run !== undefined && (
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Brands checked', value: run.clientsChecked },
              { label: 'Signals found', value: run.signalsFound },
              { label: 'Errors', value: run.errors.length },
            ].map((f) => (
              <div key={f.label} className="rounded-xl bg-slate-50 py-2">
                <dt className="text-[10px] text-slate-500">{f.label}</dt>
                <dd
                  className={cx(
                    'text-base font-semibold tabular-nums',
                    f.label === 'Errors' && f.value > 0 ? 'text-rose-700' : 'text-slate-900',
                  )}
                >
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Card>
  );
}

function ViewAll({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-violet-700 hover:text-violet-800"
    >
      View all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}
