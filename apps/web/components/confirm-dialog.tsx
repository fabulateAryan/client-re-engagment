'use client';

import type { LucideIcon } from 'lucide-react';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { cx } from './ui';

/**
 * A centred "Are you sure?" dialog. Built on the browser's <dialog>, so focus stays inside,
 * Esc cancels and the page behind cannot be clicked. Clicking the dimmed backdrop cancels.
 */
export function ConfirmDialog({
  open,
  icon: Icon,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(e) => {
        // Esc: let React state close it, and not while the action is running.
        e.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
      className="dialog-pop m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-slate-200 bg-white p-0 text-left shadow-2xl shadow-slate-900/20 backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <span
          className={cx(
            'grid h-11 w-11 place-items-center rounded-full ring-8',
            tone === 'danger'
              ? 'bg-rose-100 text-rose-600 ring-rose-50'
              : 'bg-violet-100 text-violet-600 ring-violet-50',
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <h2 id={titleId} className="mt-5 text-lg font-semibold tracking-tight text-slate-900">
          {title}
        </h2>
        <p id={descriptionId} className="mt-1.5 text-sm text-slate-500">
          {description}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            autoFocus
            className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cx(
              'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-md transition hover:brightness-110 disabled:opacity-80',
              tone === 'danger'
                ? 'bg-linear-to-r from-rose-600 to-red-500 shadow-rose-500/25'
                : 'bg-linear-to-r from-violet-600 to-indigo-500 shadow-violet-500/25',
            )}
          >
            {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
