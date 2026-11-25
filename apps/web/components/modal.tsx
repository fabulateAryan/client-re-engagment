'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { cx } from './ui';

/**
 * A closable modal on the browser's <dialog>: focus stays inside, the page behind cannot be
 * clicked, and it closes with the X button, the Esc key, or a click on the dimmed backdrop.
 *
 * `fill`: a fixed-height body (e.g. a chat that scrolls inside); otherwise the body grows with
 * its content and scrolls once the modal reaches the screen height.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  headerExtra,
  size = 'lg',
  fill = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Shown next to the title, e.g. a link. */
  headerExtra?: ReactNode;
  size?: 'md' | 'lg';
  fill?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Keep the page behind from scrolling while the modal is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Esc: close through React state so it stays in sync.
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        'dialog-pop m-auto w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-left shadow-2xl shadow-slate-900/20 backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm',
        size === 'md' ? 'max-w-lg' : 'max-w-2xl',
      )}
    >
      {open && (
        <div
          className={cx(
            'flex max-h-[calc(100dvh-2rem)] flex-col',
            fill && 'h-[min(46rem,calc(100dvh-2rem))]',
          )}
        >
          <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                className="truncate text-base font-semibold tracking-tight text-slate-900"
              >
                {title}
              </h2>
              {subtitle !== undefined && (
                <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
              )}
            </div>
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close (Esc)"
              className="-mt-1 -mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>
          <div
            className={cx(
              'px-5 py-4',
              fill ? 'flex min-h-0 flex-1 flex-col' : 'min-h-0 overflow-y-auto',
            )}
          >
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}
