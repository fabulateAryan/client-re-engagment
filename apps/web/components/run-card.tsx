import type { MonitoringRunResponse } from '@signal-monitoring/shared';
import { CircleAlert, CircleCheck, CircleStop, LoaderCircle } from 'lucide-react';
import { durationBetween, formatDateTime, plural, timeAgo } from '../lib/format';
import { PLATFORMS } from '../lib/meta';
import { CheckLine } from './run-progress-panel';
import { cx } from './ui';

export function RunStatusIcon({ run }: { run: MonitoringRunResponse }) {
  if (run.status === 'RUNNING') {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700 ring-1 ring-violet-200">
        <LoaderCircle className="h-4.5 w-4.5 animate-spin" aria-hidden />
        <span className="sr-only">Running</span>
      </span>
    );
  }
  if (run.status === 'INTERRUPTED') {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-700 ring-1 ring-rose-200">
        <CircleStop className="h-4.5 w-4.5" aria-hidden />
        <span className="sr-only">Interrupted</span>
      </span>
    );
  }
  const ok = run.errors.length === 0;
  return ok ? (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
      <CircleCheck className="h-4.5 w-4.5" aria-hidden />
      <span className="sr-only">Completed without errors</span>
    </span>
  ) : (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200">
      <CircleAlert className="h-4.5 w-4.5" aria-hidden />
      <span className="sr-only">Completed with errors</span>
    </span>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div>
      <p
        className={cx(
          'text-lg font-semibold tabular-nums',
          highlight === true ? 'text-cyan-700' : 'text-slate-900',
        )}
      >
        {value.toLocaleString('en-AU')}
      </p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

/** Full run detail for the Runs page. */
export function RunCard({ run }: { run: MonitoringRunResponse }) {
  return (
    <li className="px-5 py-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <RunStatusIcon run={run} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {formatDateTime(run.startedAt)}
              <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-slate-500 uppercase">
                {run.trigger === 'MANUAL' ? 'Manual' : 'Scheduled'}
              </span>
              <span className="ml-1.5 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-violet-700 uppercase">
                {run.clientIds === null ? 'All brands' : (run.checks[0]?.clientName ?? 'One brand')}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {timeAgo(run.startedAt)} ·{' '}
              {run.status === 'RUNNING'
                ? `running for ${durationBetween(run.startedAt, null)} · ${run.checks.length} of ${run.totalChecks} accounts done`
                : run.status === 'INTERRUPTED'
                  ? `interrupted after ${run.checks.length} of ${run.totalChecks} accounts`
                  : `took ${durationBetween(run.startedAt, run.finishedAt)}`}
              {(run.accountsUpToDate ?? 0) > 0 && ` · ${run.accountsUpToDate} up to date, skipped`}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-4 md:w-[32rem]">
          <Metric label="Clients" value={run.clientsChecked} />
          <Metric label="Accounts" value={run.checks.length} />
          <Metric label="Found" value={run.signalsFound} />
          <Metric label="New" value={run.newSignalsSaved} highlight />
          <Metric label="Errors" value={run.errors.length} />
        </div>
      </div>

      {run.checks.length > 0 && (
        <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            {plural(run.checks.length, 'account')} checked · how long each took
          </summary>
          <ul className="mt-3 space-y-1.5">
            {run.checks.map((check) => (
              <CheckLine key={`${check.clientId}-${check.platform}`} check={check} />
            ))}
          </ul>
        </details>
      )}

      {run.signalsMissingSource > 0 && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
          Needs review: {plural(run.signalsMissingSource, 'item')} had no source link, so{' '}
          {run.signalsMissingSource === 1 ? 'it was' : 'they were'} not shown.
        </p>
      )}

      {run.errors.length > 0 && (
        <details className="group mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <summary className="cursor-pointer text-xs font-medium text-amber-700">
            {plural(run.errors.length, 'problem')} during this run
          </summary>
          <ul className="mt-3 space-y-2">
            {run.errors.map((error, index) => (
              <li key={`${error.clientId}-${error.platform}-${index}`} className="text-xs">
                <span className="font-medium text-amber-700">
                  {PLATFORMS[error.platform].label} · {error.clientId}
                </span>
                <span className="block text-amber-700">{error.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
