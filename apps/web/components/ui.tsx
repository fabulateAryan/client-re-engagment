import type { PlatformValue, SignalTypeValue } from '@signal-monitoring/shared';
import type { LucideIcon } from 'lucide-react';
import { Filter, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { PLATFORMS, SIGNAL_TYPES } from '../lib/meta';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {subtitle !== undefined && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow !== undefined && (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-700">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {description !== undefined && (
          <p className="mt-2 max-w-2xl text-sm text-slate-500">{description}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  accent: string;
}) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div
        className={cx(
          'absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-25 blur-2xl',
          accent,
        )}
      />
      <div className="relative flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-800">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <p className="relative mt-3 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {value}
      </p>
      {hint !== undefined && <p className="relative mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

const LOGO_SIZE = {
  xs: { box: 'h-5 w-5 rounded-md', icon: 'h-3 w-3' },
  sm: { box: 'h-7 w-7 rounded-lg', icon: 'h-3.5 w-3.5' },
  md: { box: 'h-9 w-9 rounded-xl', icon: 'h-4.5 w-4.5' },
  lg: { box: 'h-11 w-11 rounded-2xl', icon: 'h-5.5 w-5.5' },
} as const;

/** The platform's real logo on its brand-coloured tile. `muted` greys it out. */
export function PlatformLogo({
  platform,
  size = 'md',
  muted = false,
  className,
}: {
  platform: PlatformValue;
  size?: keyof typeof LOGO_SIZE;
  muted?: boolean;
  className?: string;
}) {
  const meta = PLATFORMS[platform];
  const Icon = meta.icon;
  const dims = LOGO_SIZE[size];
  return (
    <span
      title={meta.label}
      className={cx(
        'grid shrink-0 place-items-center text-white',
        dims.box,
        muted
          ? 'bg-slate-200 text-slate-400'
          : cx(meta.tile, size !== 'xs' && 'shadow-md', size !== 'xs' && meta.glow),
        className,
      )}
    >
      <Icon className={cx(dims.icon, !muted && meta.iconClass)} aria-hidden />
    </span>
  );
}

export function PlatformChip({
  platform,
  compact,
}: {
  platform: PlatformValue;
  compact?: boolean;
}) {
  const meta = PLATFORMS[platform];
  const Icon = meta.icon;
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        meta.chip,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {compact === true ? <span className="sr-only">{meta.label}</span> : meta.label}
    </span>
  );
}

export function SignalTypeBadge({ type }: { type: SignalTypeValue }) {
  const meta = SIGNAL_TYPES[type];
  const Icon = meta.icon;
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
        meta.chip,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {meta.label}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-linear-to-br from-violet-100 to-cyan-100 text-violet-700 ring-1 ring-slate-200">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      {action !== undefined && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ApiErrorPanel({ message }: { message: string }) {
  return (
    <Card className="border-rose-200 bg-rose-50 p-6">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden />
        <div>
          <h2 className="text-sm font-semibold text-rose-700">The API is not responding</h2>
          <p className="mt-1 text-sm text-rose-700">{message}</p>
          <p className="mt-3 text-xs text-rose-700">
            Start it with <code className="rounded bg-rose-100 px-1.5 py-0.5">pnpm dev:api</code>{' '}
            and refresh this page.
          </p>
        </div>
      </div>
    </Card>
  );
}

/**
 * Says which posts the list covers: only the last `maxAgeDays` days, and (testing setting
 * SIGNALS_MIN_SCORE) only relevant ones.
 */
export function RelevantOnlyNote({
  minScore,
  maxAgeDays,
}: {
  minScore: number;
  maxAgeDays: number;
}) {
  if (minScore <= 0 && maxAgeDays <= 0) return null;
  const window = maxAgeDays > 0 ? `posts from the last ${maxAgeDays} days` : 'posts of any age';
  return (
    <p className="flex items-start gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-800 ring-1 ring-violet-200">
      <Filter className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        Showing {window}
        {minScore > 0
          ? `, and only relevant ones (score ${minScore} or more). Testing mode: lower-scoring posts are still stored; remove SIGNALS_MIN_SCORE from .env.local to see them.`
          : '. Each post shows how old it is.'}
      </span>
    </p>
  );
}
