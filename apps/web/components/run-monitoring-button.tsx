'use client';

import { LoaderCircle, Play } from 'lucide-react';
import { runProgress, useRunState } from '../lib/run-progress';
import { cx } from './ui';

/**
 * Starts a monitoring run: every brand, or just `clientId` ("Check now"). Progress and the
 * result are shown by the floating RunProgressPanel; the button itself shows the percentage.
 */
export function RunMonitoringButton({
  size = 'md',
  clientId,
}: {
  size?: 'sm' | 'md' | 'lg';
  clientId?: string;
}) {
  const state = useRunState();
  const anyRunning = state.phase === 'running';
  // This button's own run: every brand for the main button, or this brand for "Check now".
  const mine = anyRunning && (clientId === undefined || state.clientId === clientId);
  const percent = mine && state.progress !== null ? state.progress.percent : null;

  return (
    <button
      type="button"
      onClick={() => void runProgress.start(clientId)}
      disabled={anyRunning}
      title={anyRunning && !mine ? 'Another run is in progress' : undefined}
      className={cx(
        'group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl font-semibold text-white transition',
        'bg-linear-to-r from-violet-600 via-indigo-500 to-cyan-500 shadow-lg shadow-violet-500/25',
        'hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400',
        'disabled:cursor-not-allowed disabled:opacity-60',
        mine && 'disabled:cursor-progress disabled:opacity-100',
        size === 'lg'
          ? 'px-5 py-3 text-sm'
          : size === 'sm'
            ? 'px-3 py-1.5 text-xs'
            : 'px-4 py-2.5 text-sm',
      )}
    >
      {mine && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-500"
          style={{ width: `${percent ?? 0}%` }}
        />
      )}
      <span className="relative inline-flex items-center gap-2">
        {mine ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Play className="h-4 w-4 fill-current" aria-hidden />
        )}
        {mine
          ? `${clientId === undefined ? 'Monitoring' : 'Checking'}${percent === null ? '…' : ` ${percent}%`}`
          : clientId === undefined
            ? 'Run monitoring'
            : 'Check now'}
      </span>
    </button>
  );
}
