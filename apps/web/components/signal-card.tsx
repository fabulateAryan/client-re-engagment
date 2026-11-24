import type {
  EngagementResponse,
  SignalPriorityValue,
  SignalResponse,
} from '@signal-monitoring/shared';
import { ChevronDown, ExternalLink, Lightbulb, Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  compactNumber,
  formatDate,
  formatDateTime,
  initials,
  postAge,
  timeAgo,
} from '../lib/format';
import type { PostAgeTone } from '../lib/format';
import { ENGAGEMENT_METRICS, PLATFORMS } from '../lib/meta';
import { Card, PlatformChip, SignalTypeBadge, cx } from './ui';

/**
 * Public counts captured when the post was collected. Hidden when the source gives none
 * (news articles, demo data), so nothing is invented.
 */
export function EngagementStats({
  engagement,
  className,
}: {
  engagement: EngagementResponse | null;
  className?: string;
}) {
  if (engagement === null) return null;
  const shown = ENGAGEMENT_METRICS.filter((m) => engagement[m.key] !== undefined);
  if (shown.length === 0) return null;
  return (
    <ul
      className={cx(
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500',
        className,
      )}
      aria-label="Engagement when collected"
    >
      {shown.map(({ key, label, icon: Icon }) => {
        const value = engagement[key] ?? 0;
        return (
          <li
            key={key}
            className="inline-flex items-center gap-1"
            title={`${value.toLocaleString('en-AU')} ${label}`}
          >
            <Icon className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            <span className="font-medium text-slate-700 tabular-nums">{compactNumber(value)}</span>
            <span className="sr-only">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ClientAvatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims =
    size === 'lg'
      ? 'h-12 w-12 text-base'
      : size === 'sm'
        ? 'h-8 w-8 text-[11px]'
        : 'h-10 w-10 text-xs';
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-xl bg-linear-to-br from-indigo-100 to-fuchsia-100 font-semibold text-slate-900 ring-1 ring-slate-200 ${dims}`}
    >
      {initials(name)}
    </span>
  );
}

const PRIORITY_STYLE: Record<
  SignalPriorityValue,
  { label: string; badge: string; ring: string; reason: string; rank: string }
> = {
  // Traffic-light colours: High green (act now), Medium orange, Low red.
  HIGH: {
    label: 'High',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    ring: '#10b981',
    reason: 'border-emerald-100 bg-emerald-50/70 text-emerald-900',
    rank: 'bg-linear-to-br from-emerald-500 to-teal-400 text-white shadow-emerald-500/30',
  },
  MEDIUM: {
    label: 'Medium',
    badge: 'bg-orange-50 text-orange-700 ring-orange-200',
    ring: '#f97316',
    reason: 'border-orange-100 bg-orange-50/70 text-orange-900',
    rank: 'bg-linear-to-br from-orange-500 to-amber-400 text-white shadow-orange-500/30',
  },
  LOW: {
    label: 'Low',
    badge: 'bg-rose-50 text-rose-700 ring-rose-200',
    ring: '#e11d48',
    reason: 'border-rose-100 bg-rose-50/70 text-rose-900',
    rank: 'bg-linear-to-br from-rose-500 to-red-400 text-white shadow-rose-500/30',
  },
};

/** "#1": the card's place in the list, coloured by priority. */
export function RankBadge({ rank, priority }: { rank: number; priority: SignalPriorityValue }) {
  return (
    <span
      className={cx(
        'grid h-10 min-w-10 shrink-0 place-items-center rounded-xl px-2 text-sm font-bold tabular-nums shadow-md',
        PRIORITY_STYLE[priority].rank,
      )}
      aria-label={`Rank ${rank}`}
    >
      #{rank}
    </span>
  );
}

/** Score out of 100 as a small ring, with the High / Medium / Low label beside it. */
export function ScoreMeter({ score, priority }: { score: number; priority: SignalPriorityValue }) {
  const style = PRIORITY_STYLE[priority];
  return (
    <span className="inline-flex items-center gap-2" title={`Score ${score} out of 100`}>
      <span
        className="grid h-10 w-10 place-items-center rounded-full"
        style={{
          background: `conic-gradient(${style.ring} ${score * 3.6}deg, #e2e8f0 0deg)`,
        }}
        aria-hidden
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-xs font-bold text-slate-900 tabular-nums">
          {score}
        </span>
      </span>
      <span
        className={cx(
          'rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset',
          style.badge,
        )}
      >
        {style.label}
        <span className="sr-only">, score {score} out of 100</span>
      </span>
    </span>
  );
}

/** Story 9b: why the card scored what it did, with the points behind it. */
function ScoreReason({ signal }: { signal: SignalResponse }) {
  const style = PRIORITY_STYLE[signal.priority];
  return (
    <div className={cx('mt-4 rounded-xl border px-3 py-2.5 text-xs', style.reason)}>
      <p className="flex items-start gap-2 leading-relaxed">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{signal.reason}</span>
      </p>
      {signal.scoreFactors.length > 0 && (
        <details className="group/why mt-1.5 pl-5.5">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium opacity-70 hover:opacity-100">
            How it was scored
            <ChevronDown className="h-3 w-3 transition group-open/why:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-1.5 space-y-1">
            {signal.scoreFactors.map((f) => (
              <li key={f.label} className="flex items-center justify-between gap-3">
                <span>{f.label}</span>
                <span
                  className={cx(
                    'font-semibold tabular-nums',
                    f.points < 0 ? 'text-rose-700' : 'text-emerald-700',
                  )}
                >
                  {f.points > 0 ? '+' : ''}
                  {f.points}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 border-t border-current/10 pt-1 font-semibold">
              <span>Score (0 to 100)</span>
              <span className="tabular-nums">{signal.score}</span>
            </li>
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * One signal, as a card. Used in the feed and on the Signals page.
 * `action` is an optional control shown beside the source link (e.g. Skip).
 * `footer` is shown under the card body (e.g. the engagement message).
 */
export function SignalCard({
  signal,
  action,
  footer,
}: {
  signal: SignalResponse;
  action?: ReactNode;
  footer?: ReactNode;
}) {
  const clientName = signal.clientName ?? 'Unknown client';
  return (
    <Card className="group relative flex h-full flex-col overflow-hidden p-5 transition hover:border-violet-200 hover:shadow-md hover:shadow-violet-100/60">
      <span
        aria-hidden
        className={cx('absolute inset-x-0 top-0 h-1 opacity-70', PLATFORMS[signal.platform].bar)}
      />
      <div className="flex items-center justify-between gap-3">
        <RankBadge rank={signal.rank} priority={signal.priority} />
        <ScoreMeter score={signal.score} priority={signal.priority} />
      </div>

      <div className="mt-4 flex items-start gap-3">
        <ClientAvatar name={clientName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{clientName}</p>
          <PostAge publishedAt={signal.publishedAt} />
        </div>
        <PlatformChip platform={signal.platform} compact />
      </div>

      <ScoreReason signal={signal} />

      <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-700">
        {signal.content}
      </p>

      <EngagementStats engagement={signal.engagement} className="mt-3" />

      {signal.skippedAt !== null && (
        <p className="mt-3 text-xs text-slate-500">Skipped on {formatDate(signal.skippedAt)}</p>
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <SignalTypeBadge type={signal.signalType} />
        <span className="flex items-start gap-1">
          {action}
          <a
            href={signal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
          >
            Open
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">original post for {clientName}</span>
          </a>
        </span>
      </div>
      {footer}
    </Card>
  );
}

/** Compact row for the overview feed. */
export function SignalRow({ signal }: { signal: SignalResponse }) {
  const clientName = signal.clientName ?? 'Unknown client';
  return (
    <li className="flex items-start gap-3 px-5 py-4">
      <RankBadge rank={signal.rank} priority={signal.priority} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-sm font-medium text-slate-900">{clientName}</p>
          <span className="text-xs text-slate-500" title={formatDateTime(signal.publishedAt)}>
            Posted {timeAgo(signal.publishedAt)} · {formatDate(signal.publishedAt)}
          </span>
          <span className="text-xs font-semibold text-slate-700 tabular-nums">
            · {signal.score}/100 {PRIORITY_STYLE[signal.priority].label}
          </span>
        </div>
        <p className="mt-1 flex items-start gap-1.5 text-xs text-slate-600">
          <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden />
          {signal.reason}
        </p>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500">{signal.content}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PlatformChip platform={signal.platform} />
          <SignalTypeBadge type={signal.signalType} />
          <EngagementStats engagement={signal.engagement} />
        </div>
      </div>
      <a
        href={signal.url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <ExternalLink className="h-4 w-4" aria-hidden />
        <span className="sr-only">Open original post for {clientName}</span>
      </a>
    </li>
  );
}

const AGE_STYLE: Record<PostAgeTone, string> = {
  fresh: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  recent: 'bg-teal-50 text-teal-700 ring-teal-200',
  month: 'bg-sky-50 text-sky-700 ring-sky-200',
  older: 'bg-amber-50 text-amber-700 ring-amber-200',
  old: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/**
 * When the post went up, so its age is obvious at a glance: a colour-coded band
 * ("This week", "1 to 3 months old") plus the relative time and the date.
 */
export function PostAge({ publishedAt }: { publishedAt: string }) {
  const age = postAge(publishedAt);
  return (
    <p
      className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500"
      title={`Posted ${formatDateTime(publishedAt)}`}
    >
      <span
        className={cx(
          'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
          AGE_STYLE[age.tone],
        )}
      >
        <Clock className="h-2.5 w-2.5" aria-hidden />
        {age.label}
      </span>
      <span>
        Posted {timeAgo(publishedAt)} · {formatDate(publishedAt)}
      </span>
    </p>
  );
}
