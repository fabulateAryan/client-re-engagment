'use client';

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';
import { cx } from './ui';

export type ToastTone = 'success' | 'info' | 'error';

interface ToastItem {
  readonly id: number;
  readonly title: string;
  readonly description?: string;
  readonly tone: ToastTone;
  readonly durationMs: number;
}

let items: readonly ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const EMPTY: readonly ToastItem[] = [];

function emit(next: readonly ToastItem[]): void {
  items = next;
  listeners.forEach((l) => l());
}

export function dismissToast(id: number): void {
  emit(items.filter((t) => t.id !== id));
}

/** Show a short message in the corner. It closes by itself after a few seconds. */
export function toast(options: {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
}): number {
  const id = nextId++;
  emit([
    ...items.slice(-2), // at most three on screen
    {
      id,
      title: options.title,
      description: options.description,
      tone: options.tone ?? 'success',
      durationMs: options.durationMs ?? 4000,
    },
  ]);
  return id;
}

const TONE: Record<ToastTone, { icon: typeof Info; iconClass: string; bar: string }> = {
  success: {
    icon: CircleCheck,
    iconClass: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
    bar: 'from-emerald-400 to-cyan-400',
  },
  info: {
    icon: Info,
    iconClass: 'bg-violet-50 text-violet-600 ring-violet-200',
    bar: 'from-violet-500 to-cyan-400',
  },
  error: {
    icon: CircleAlert,
    iconClass: 'bg-rose-50 text-rose-600 ring-rose-200',
    bar: 'from-rose-500 to-orange-400',
  },
};

function ToastCard({ item }: { item: ToastItem }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(item.id), item.durationMs);
    return () => clearTimeout(timer);
  }, [item.id, item.durationMs]);

  const tone = TONE[item.tone];
  const Icon = tone.icon;
  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className="animate-rise pointer-events-auto relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
    >
      <div className="flex items-start gap-3 p-3.5 pr-10">
        <span
          className={cx(
            'grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1',
            tone.iconClass,
          )}
        >
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
        <div className="min-w-0 pt-0.5">
          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
          {item.description !== undefined && (
            <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        className="absolute top-2.5 right-2.5 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
      {/* Time left before it closes. */}
      <span
        aria-hidden
        className={cx('toast-timer absolute bottom-0 left-0 h-0.5 w-full bg-linear-to-r', tone.bar)}
        style={{ animationDuration: `${item.durationMs}ms` }}
      />
    </div>
  );
}

/** Where toasts appear: top right (top centre on phones). Mount once. */
export function Toaster() {
  const list = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
    () => EMPTY,
  );
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-4 z-[60] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:w-[22rem] sm:items-end"
    >
      {list.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}
