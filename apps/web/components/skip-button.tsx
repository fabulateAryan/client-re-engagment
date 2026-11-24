'use client';

import { EyeOff, LoaderCircle, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { api } from '../lib/api-client';
import { cx } from './ui';

/**
 * Story 8b: skip a card so it leaves the to-review list, or undo a skip from the Skipped view.
 * Refreshes server data afterwards so the card moves lists.
 */
export function SkipButton({ signalId, skipped }: { signalId: string; skipped: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (skipped) await api.undoSkipSignal(signalId);
      else await api.skipSignal(signalId);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update this card.');
      setBusy(false);
    }
  };

  const Icon = busy ? LoaderCircle : skipped ? Undo2 : EyeOff;
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        className={cx(
          'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition',
          'text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:cursor-progress',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400',
        )}
      >
        <Icon className={cx('h-3.5 w-3.5', busy && 'animate-spin')} aria-hidden />
        {skipped ? 'Undo skip' : 'Skip'}
      </button>
      {error !== null && (
        <span role="alert" className="text-[11px] text-rose-700">
          {error}
        </span>
      )}
    </span>
  );
}
