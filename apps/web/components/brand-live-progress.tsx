'use client';

import type { PlatformValue } from '@signal-monitoring/shared';
import { CircleCheck, LoaderCircle } from 'lucide-react';
import { PLATFORMS } from '../lib/meta';
import { useRunState } from '../lib/run-progress';
import { CheckOutcome } from './run-progress-panel';
import { PlatformLogo, cx } from './ui';

/** While a run includes this brand, shows each of its accounts as waiting, checking or done. */
export function BrandLiveProgress({
  clientId,
  platforms,
}: {
  clientId: string;
  platforms: PlatformValue[];
}) {
  const state = useRunState();
  if (state.phase !== 'running') return null;
  if (state.clientId !== null && state.clientId !== clientId) return null;

  const progress = state.progress;
  const done = new Map(
    (progress?.completed ?? []).filter((c) => c.clientId === clientId).map((c) => [c.platform, c]),
  );
  const current = progress?.current?.clientId === clientId ? progress.current.platform : null;
  const percent = platforms.length === 0 ? 0 : Math.round((done.size / platforms.length) * 100);

  return (
    <section
      aria-label="Check in progress"
      className="animate-rise rounded-2xl border border-violet-200 bg-linear-to-br from-violet-50 via-white to-cyan-50 p-5 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <LoaderCircle className="h-5 w-5 animate-spin text-violet-600" aria-hidden />
        <p className="flex-1 text-sm font-semibold text-slate-900">
          Checking this brand now
          <span className="ml-2 font-normal text-slate-500">
            {done.size} of {platforms.length} accounts done
          </span>
        </p>
        <span className="text-lg font-semibold text-violet-700 tabular-nums">{percent}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white ring-1 ring-violet-100">
        <div
          className="progress-stripes h-full rounded-full bg-linear-to-r from-violet-600 to-cyan-400 transition-[width] duration-700"
          style={{ width: `${Math.max(percent, 3)}%` }}
        />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {platforms.map((platform) => {
          const check = done.get(platform);
          const now = current === platform;
          return (
            <li
              key={platform}
              className={cx(
                'flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2 text-xs',
                now ? 'border-violet-300 shadow-sm shadow-violet-200' : 'border-slate-100',
              )}
            >
              <PlatformLogo platform={platform} size="sm" muted={check === undefined && !now} />
              <span className="flex-1 font-medium text-slate-800">{PLATFORMS[platform].label}</span>
              {check !== undefined ? (
                <CheckOutcome check={check} />
              ) : now ? (
                <span className="inline-flex items-center gap-1 text-violet-700">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden /> Checking
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <CircleCheck className="h-3.5 w-3.5 opacity-30" aria-hidden /> Waiting
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
