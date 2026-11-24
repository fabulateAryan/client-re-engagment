'use client';

import type { MonitoringProgressResponse, MonitoringRunResponse } from '@signal-monitoring/shared';
import { useSyncExternalStore } from 'react';
import { api, ApiError } from './api-client';

/**
 * One shared, browser-side view of the monitoring run, so the Run button, every "Check now"
 * button and the progress panel all show the same thing.
 *
 * Starting a run queues it on the API (202, answered at once); the checks run as jobs in the
 * background. While a run is going this polls GET /monitoring/progress, and when it ends it
 * loads the finished run.
 */
export type RunState =
  | { phase: 'idle' }
  | {
      phase: 'running';
      runId: string | null;
      /** The brand being checked ("Check now"), or null for every brand. */
      clientId: string | null;
      progress: NonNullable<MonitoringProgressResponse['progress']> | null;
      /** Browser time the panel started showing this run, for the elapsed clock. */
      shownAt: number;
    }
  | { phase: 'done'; run: MonitoringRunResponse }
  | { phase: 'error'; message: string };

const POLL_MS = 1000;

let state: RunState = { phase: 'idle' };
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setTimeout> | null = null;

function setState(next: RunState): void {
  state = next;
  for (const listener of listeners) listener();
}

function currentState(): RunState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function scopeOf(clientIds: string[] | null): string | null {
  return clientIds !== null && clientIds.length === 1 ? (clientIds[0] ?? null) : null;
}

function schedulePoll(delay = POLL_MS): void {
  if (pollTimer === null) pollTimer = setTimeout(() => void poll(), delay);
}

async function poll(): Promise<void> {
  pollTimer = null;
  if (state.phase !== 'running') return;
  try {
    const result = await api.progress();
    if (result.running && result.progress !== null) {
      setState({
        phase: 'running',
        runId: state.runId,
        clientId: scopeOf(result.progress.clientIds),
        progress: result.progress,
        shownAt: state.shownAt,
      });
    } else {
      // Finished: show the run we started (or, if we were following another, the latest).
      const runId = state.runId;
      const mine = runId === null ? null : await api.run(runId).catch(() => null);
      const run = mine ?? result.lastRun;
      setState(run === null ? { phase: 'idle' } : { phase: 'done', run });
      return;
    }
  } catch {
    // A missed poll is fine; try again.
  }
  schedulePoll();
}

export const runProgress = {
  /** Queue a run (every brand, or one with `clientId`) and follow it to the end. */
  async start(clientId?: string): Promise<void> {
    if (state.phase === 'running') return;
    setState({
      phase: 'running',
      runId: null,
      clientId: clientId ?? null,
      progress: null,
      shownAt: Date.now(),
    });
    try {
      const run = await api.triggerRun(clientId);
      if (run.status !== 'RUNNING') {
        // Nothing to check: it finished straight away.
        setState({ phase: 'done', run });
        return;
      }
      // Read afresh: the state may have changed while the request was out.
      const now = currentState();
      if (now.phase === 'running') setState({ ...now, runId: run.id });
      schedulePoll(300);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // A run is already going (another tab, or the schedule): follow that one instead.
        schedulePoll(0);
        return;
      }
      setState({
        phase: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong.',
      });
    }
  },

  /** On page load: if a run is already going, show it. */
  async resume(): Promise<void> {
    if (state.phase === 'running') return;
    try {
      const result = await api.progress();
      if (result.running && result.progress !== null) {
        setState({
          phase: 'running',
          runId: null,
          clientId: scopeOf(result.progress.clientIds),
          progress: result.progress,
          shownAt: Date.now(),
        });
        schedulePoll();
      }
    } catch {
      // API offline: the pages already say so.
    }
  },

  dismiss(): void {
    if (state.phase !== 'running') setState({ phase: 'idle' });
  },
};

/**
 * What the server renders, and what the browser must render while hydrating: never a run.
 * The live state (which survives client-side navigation) takes over straight after, so a run
 * in progress still shows, without the server and browser HTML disagreeing.
 */
const SERVER_STATE: RunState = { phase: 'idle' };

export function useRunState(): RunState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}
