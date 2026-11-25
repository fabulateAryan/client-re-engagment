'use client';

import type {
  ActiveCheckResponse,
  MonitoringCheckResponse,
  MonitoringRunResponse,
} from '@signal-monitoring/shared';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  LoaderCircle,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { durationBetween, formatDuration, plural } from '../lib/format';
import { PLATFORMS } from '../lib/meta';
import { runProgress, useRunState } from '../lib/run-progress';
import type { RunState } from '../lib/run-progress';
import { PlatformLogo, cx } from './ui';

/** Shortest gap between page reloads while a run is still saving new signals. */
const LIVE_REFRESH_MS = 5_000;

/** Floating panel, on every page, that follows the monitoring run from start to finish. */
export function RunProgressPanel() {
  const state = useRunState();
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    void runProgress.resume();
  }, []);

  // When a run ends, reload the page data so new signals and check times appear.
  useEffect(() => {
    if (state.phase === 'done') startTransition(() => router.refresh());
  }, [state.phase, router]);

  // During a run, show new signals as soon as a check saves some, instead of only at the end.
  // At most one reload every few seconds, however many checks finish in between.
  const savedSoFar =
    state.phase === 'running'
      ? (state.progress?.completed ?? []).reduce((sum, c) => sum + c.newSignalsSaved, 0)
      : 0;
  const lastRefresh = useRef({ saved: 0, at: 0 });
  useEffect(() => {
    if (savedSoFar === 0) {
      lastRefresh.current = { saved: 0, at: 0 };
      return;
    }
    if (savedSoFar <= lastRefresh.current.saved) return;
    const wait = Math.max(0, lastRefresh.current.at + LIVE_REFRESH_MS - Date.now());
    const timer = setTimeout(() => {
      lastRefresh.current = { saved: savedSoFar, at: Date.now() };
      startTransition(() => router.refresh());
    }, wait);
    return () => clearTimeout(timer);
  }, [savedSoFar, router]);

  // Results stay up for a while, then tidy themselves away.
  useEffect(() => {
    if (state.phase !== 'done' && state.phase !== 'error') return;
    const timer = setTimeout(() => runProgress.dismiss(), 15000);
    return () => clearTimeout(timer);
  }, [state]);

  if (state.phase === 'idle') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-rise fixed right-4 bottom-24 left-4 z-50 sm:left-auto sm:w-[26rem] lg:bottom-6"
    >
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 ring-1 ring-slate-900/5">
        {state.phase === 'running' && <Running key={state.shownAt} state={state} />}
        {state.phase === 'done' && <Done run={state.run} />}
        {state.phase === 'error' && <Failed message={state.message} />}
      </div>
    </div>
  );
}

/** Seconds since `since`, updated every second. */
function useElapsed(since: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, now - since);
}

function Running({ state }: { state: Extract<RunState, { phase: 'running' }> }) {
  const [minimised, setMinimised] = useState(false);
  const onToggle = (): void => setMinimised((m) => !m);
  const { progress } = state;
  const startedAt = progress === null ? state.shownAt : new Date(progress.startedAt).getTime();
  const elapsed = useElapsed(Math.min(startedAt, state.shownAt));
  const percent = progress?.percent ?? 0;
  const done = progress?.doneChecks ?? 0;
  const total = progress?.totalChecks ?? 0;
  const brandName =
    state.clientId === null
      ? null
      : (progress?.current?.clientName ?? progress?.completed[0]?.clientName ?? 'this brand');
  const title = brandName === null ? 'Monitoring all brands' : `Checking ${brandName}`;

  return (
    <div>
      <div className="flex items-center gap-3 px-4 pt-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-linear-to-br from-violet-500 to-cyan-400 text-white shadow-md shadow-violet-500/30">
          <LoaderCircle className="h-4.5 w-4.5 animate-spin" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">
            {formatDuration(elapsed)} elapsed
            {progress?.estimatedRemainingMs != null &&
              done < total &&
              ` · about ${formatDuration(progress.estimatedRemainingMs)} left`}
          </p>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
          {percent}
          <span className="text-sm text-slate-400">%</span>
        </p>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label={minimised ? 'Show details' : 'Hide details'}
        >
          {minimised ? (
            <ChevronUp className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden />
          )}
        </button>
      </div>

      <div className="px-4 pt-3 pb-4">
        <div
          className="h-2.5 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Run progress"
        >
          <div
            className="progress-stripes h-full rounded-full bg-linear-to-r from-violet-600 via-indigo-500 to-cyan-400 transition-[width] duration-700 ease-out"
            style={{ width: `${Math.max(percent, progress === null ? 4 : 2)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          <span>
            <span className="font-semibold text-slate-800 tabular-nums">{done}</span> of{' '}
            {progress === null ? '…' : plural(total, 'account')} checked
          </span>
          <span>
            <span className="font-semibold text-slate-800 tabular-nums">
              {progress === null ? '…' : total - done}
            </span>{' '}
            remaining
          </span>
        </div>

        {!minimised && progress !== null && (
          <>
            {progress.active.length > 0 && <NowChecking active={progress.active} />}
            {progress.completed.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {[...progress.completed]
                  .reverse()
                  .slice(0, 4)
                  .map((check) => (
                    <CheckLine
                      key={`${check.clientId}-${check.platform}-${check.startedAt}`}
                      check={check}
                    />
                  ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Every account the workers are on right now (several run at once). */
function NowChecking({ active }: { active: ActiveCheckResponse[] }) {
  return (
    <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2">
      <p className="text-[11px] font-medium text-violet-900">
        Now checking · {plural(active.length, 'worker')} busy
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {active.slice(0, 5).map((check) => (
          <ActiveLine key={`${check.clientId}-${check.platform}`} check={check} />
        ))}
      </ul>
    </div>
  );
}

function ActiveLine({ check }: { check: ActiveCheckResponse }) {
  const elapsed = useElapsed(new Date(check.startedAt).getTime());
  return (
    <li className="flex items-center gap-2 text-xs">
      <PlatformLogo platform={check.platform} size="xs" />
      <span className="min-w-0 flex-1 truncate text-slate-700">
        {check.clientName} · {PLATFORMS[check.platform].label}
      </span>
      {check.attempt > 1 && (
        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
          retry {check.attempt - 1}
        </span>
      )}
      <LoaderCircle className="h-3 w-3 animate-spin text-violet-500" aria-hidden />
      <span className="w-12 text-right text-violet-700 tabular-nums">
        {formatDuration(elapsed)}
      </span>
    </li>
  );
}

/** One finished check: which account, how long it took and what happened. */
export function CheckLine({ check }: { check: MonitoringCheckResponse }) {
  return (
    <li className="flex items-center gap-2.5 text-xs">
      <PlatformLogo platform={check.platform} size="xs" muted={!check.sourceConnected} />
      <span className="min-w-0 flex-1 truncate text-slate-700">
        {check.clientName} · {PLATFORMS[check.platform].label}
      </span>
      {check.attempts > 1 && (
        <span
          className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700"
          title="Retried by the job queue"
        >
          {check.attempts} tries
        </span>
      )}
      <CheckOutcome check={check} />
      <span className="w-14 text-right text-slate-400 tabular-nums">
        {formatDuration(check.durationMs)}
      </span>
    </li>
  );
}

export function CheckOutcome({ check }: { check: MonitoringCheckResponse }) {
  if (check.error !== null) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700" title={check.error}>
        <CircleAlert className="h-3.5 w-3.5" aria-hidden /> Failed
      </span>
    );
  }
  if (!check.sourceConnected) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-400">
        <CircleSlash className="h-3.5 w-3.5" aria-hidden /> Source off
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-emerald-700">
      <CircleCheck className="h-3.5 w-3.5" aria-hidden />
      {check.newSignalsSaved > 0 ? `${check.newSignalsSaved} new` : `${check.signalsFound} found`}
    </span>
  );
}

/** The Signals page showing only what this run collected (for one brand on "Check now"). */
export function newSignalsHref(run: MonitoringRunResponse, clientId: string | null): string {
  const params = new URLSearchParams({ collectedSince: run.startedAt });
  if (clientId !== null) params.set('clientId', clientId);
  return `/signals?${params.toString()}`;
}

function Done({ run }: { run: MonitoringRunResponse }) {
  const ok = run.errors.length === 0;
  const single = run.clientIds !== null && run.clientIds.length === 1 ? run.clientIds[0] : null;
  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <span
          className={cx(
            'grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1',
            ok
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-amber-50 text-amber-700 ring-amber-200',
          )}
        >
          {ok ? (
            <CircleCheck className="h-4.5 w-4.5" aria-hidden />
          ) : (
            <CircleAlert className="h-4.5 w-4.5" aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            {ok ? 'Run complete' : `Run complete with ${plural(run.errors.length, 'problem')}`}
          </p>
          <p className="text-xs text-slate-500">
            100% · took {durationBetween(run.startedAt, run.finishedAt)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => runProgress.dismiss()}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 h-2 rounded-full bg-linear-to-r from-emerald-400 to-cyan-400" />
      <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Figure label="Accounts" value={run.checks.length} />
        <Figure label="Found" value={run.signalsFound} />
        <Figure label="New" value={run.newSignalsSaved} highlight />
        <Figure label="Errors" value={run.errors.length} />
      </dl>
      {(run.accountsUpToDate ?? 0) > 0 && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-center text-xs text-emerald-800 ring-1 ring-emerald-200">
          {plural(run.accountsUpToDate ?? 0, 'account')} skipped: checked recently, so already up to
          date. Use Check now on a brand to force a fresh check.
        </p>
      )}
      {run.newSignalsSaved > 0 ? (
        <Link
          href={newSignalsHref(run, single ?? null)}
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-linear-to-r from-violet-600 to-cyan-500 px-3 py-2 text-xs font-semibold text-white shadow-md shadow-violet-500/20 hover:brightness-110"
        >
          View {plural(run.newSignalsSaved, 'new signal')}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : (
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
          Nothing new since the last check.
        </p>
      )}
      <div className="mt-3 flex justify-end gap-3 text-xs font-medium">
        {single !== null && single !== undefined && (
          <Link
            href={`/brands/${encodeURIComponent(single)}`}
            className="inline-flex items-center gap-1 text-violet-700 hover:text-violet-800"
          >
            Brand details <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        )}
        <Link
          href="/runs"
          className="inline-flex items-center gap-1 text-violet-700 hover:text-violet-800"
        >
          Run details <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 py-2">
      <dd
        className={cx(
          'text-base font-semibold tabular-nums',
          highlight === true ? 'text-cyan-700' : 'text-slate-900',
        )}
      >
        {value.toLocaleString('en-AU')}
      </dd>
      <dt className="text-[11px] text-slate-500">{label}</dt>
    </div>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 bg-rose-50/80 p-4">
      <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-rose-900">Run failed</p>
        <p className="mt-0.5 text-rose-700">{message}</p>
      </div>
      <button
        type="button"
        onClick={() => runProgress.dismiss()}
        className="rounded-lg p-1 text-slate-500 hover:bg-rose-100 hover:text-slate-900"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
