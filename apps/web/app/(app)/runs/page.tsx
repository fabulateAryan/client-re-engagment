import type { JobQueueStatsResponse, MonitoringRunListResponse } from '@signal-monitoring/shared';
import type { Metadata } from 'next';
import { Database, History, Layers, LoaderCircle } from 'lucide-react';
import { connection } from 'next/server';
import { RunCard } from '../../../components/run-card';
import { ApiErrorPanel, Card, EmptyState, PageHeader, cx } from '../../../components/ui';
import { api, attempt } from '../../../lib/api-server';

export const metadata: Metadata = { title: 'Runs' };

export default async function RunsPage() {
  await connection();
  const [loaded, queue] = await Promise.all([
    attempt(() => api.runs(50)),
    attempt(() => api.queue()),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Runs"
        title="Monitoring history"
        description="Every run, what it found and anything that went wrong. Each brand account is its own job, so one failing source never stops the others."
      />
      {queue.ok && <QueuePanel stats={queue.data} />}
      {loaded.ok ? <RunsView runs={loaded.data} /> : <ApiErrorPanel message={loaded.error} />}
    </div>
  );
}

/** The job queue behind the runs: which driver, how many workers, and job counts. */
function QueuePanel({ stats }: { stats: JobQueueStatsResponse }) {
  const bullmq = stats.driver === 'bullmq';
  const figures: { label: string; value: number; tone?: string }[] = [
    { label: 'Waiting', value: stats.waiting },
    {
      label: 'Running',
      value: stats.active,
      tone: stats.active > 0 ? 'text-violet-700' : undefined,
    },
    {
      label: 'Retrying',
      value: stats.delayed,
      tone: stats.delayed > 0 ? 'text-amber-700' : undefined,
    },
    { label: 'Done', value: stats.completed, tone: 'text-emerald-700' },
    { label: 'Gave up', value: stats.failed, tone: stats.failed > 0 ? 'text-rose-700' : undefined },
  ];
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={cx(
              'grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1',
              bullmq
                ? 'bg-rose-50 text-rose-700 ring-rose-200'
                : 'bg-slate-100 text-slate-600 ring-slate-200',
            )}
          >
            {bullmq ? (
              <Database className="h-5 w-5" aria-hidden />
            ) : (
              <Layers className="h-5 w-5" aria-hidden />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              Job queue · {bullmq ? 'BullMQ on Redis' : 'In-process'}
            </p>
            <p className="text-xs text-slate-500">
              {stats.concurrency} accounts at a time · up to {stats.attempts} tries each, waiting
              longer between tries
              {!bullmq && ' · set REDIS_URL so jobs survive restarts'}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-5 gap-3 text-center md:w-[26rem]">
          {figures.map((f) => (
            <div key={f.label} className="rounded-xl bg-slate-50 py-2">
              <dd
                className={cx('text-base font-semibold tabular-nums', f.tone ?? 'text-slate-900')}
              >
                {f.value.toLocaleString('en-AU')}
              </dd>
              <dt className="text-[11px] text-slate-500">{f.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}

function RunsView({ runs }: { runs: MonitoringRunListResponse }) {
  return (
    <>
      {runs.running && (
        <p className="flex items-center gap-2 text-sm text-cyan-700">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> A run is in progress
        </p>
      )}
      <Card>
        {runs.items.length === 0 ? (
          <EmptyState
            icon={History}
            title="No runs yet"
            description="Each run checks every monitored client once and records what it found. Start one from the Overview page."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {runs.items.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
