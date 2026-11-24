import type { CSSProperties, ReactNode } from 'react';
import { cx } from './ui';

/**
 * Loading placeholders shaped like each page, shown the moment a sidebar link is clicked
 * (each route's loading.tsx) while the page's data loads.
 */

/** One grey block with a soft shimmer. */
export function Bone({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      className={cx('skeleton-shimmer block rounded-lg', className)}
      style={style}
    />
  );
}

function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Wraps a page skeleton so screen readers hear "Loading" once. */
export function PageSkeleton({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading">
      {children}
    </div>
  );
}

export function HeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2.5">
        <Bone className="h-3 w-20" />
        <Bone className="h-8 w-64 max-w-full" />
        <Bone className="h-4 w-96 max-w-full" />
      </div>
      {withAction && <Bone className="h-11 w-44 rounded-xl" />}
    </div>
  );
}

export function NoteSkeleton() {
  return <Bone className="h-10 w-full rounded-xl" />;
}

export function StatCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <Panel key={i} className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <Bone className="h-3 w-24" />
            <Bone className="h-8 w-8 rounded-lg" />
          </div>
          <Bone className="h-8 w-16" />
          <Bone className="h-3 w-28" />
        </Panel>
      ))}
    </div>
  );
}

/** A list row: avatar, two lines of text, a score. */
function RowSkeleton() {
  return (
    <div className="flex items-start gap-3 py-4">
      <Bone className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 space-y-2">
        <Bone className="h-4 w-40" />
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-3/4" />
      </div>
      <Bone className="h-10 w-10 shrink-0 rounded-full" />
    </div>
  );
}

export function ListPanelSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <Panel className={cx('px-5 pt-5 pb-2', className)}>
      <Bone className="h-4 w-32" />
      <Bone className="mt-2 h-3 w-56 max-w-full" />
      <div className="mt-2 divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </Panel>
  );
}

/** A signal card: rank and score, brand, reason box, text, chips. */
export function SignalCardSkeleton() {
  return (
    <Panel className="space-y-4 p-5">
      <div className="flex items-center justify-between">
        <Bone className="h-10 w-10 rounded-xl" />
        <div className="flex items-center gap-2">
          <Bone className="h-10 w-10 rounded-full" />
          <Bone className="h-5 w-14 rounded-full" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Bone className="h-12 w-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Bone className="h-4 w-28" />
          <Bone className="h-3 w-44" />
        </div>
      </div>
      <Bone className="h-16 w-full rounded-xl" />
      <div className="space-y-2">
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-2/3" />
      </div>
      <div className="flex items-center justify-between pt-1">
        <Bone className="h-7 w-28 rounded-full" />
        <Bone className="h-4 w-20" />
      </div>
    </Panel>
  );
}

export function SignalGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }, (_, i) => (
        <SignalCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A row of filter pills (Signals page). */
export function FilterBarSkeleton() {
  return (
    <Panel className="flex flex-wrap items-center gap-2 p-3">
      {[20, 24, 28, 24, 20, 32].map((w, i) => (
        <Bone key={i} className="h-8 rounded-full" style={{ width: `${w * 4}px` }} />
      ))}
    </Panel>
  );
}

/** Platform tiles at the top of the Brands page. */
export function SourceStripSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, i) => (
        <Panel key={i} className="flex items-center gap-3 p-3">
          <Bone className="h-11 w-11 shrink-0 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Bone className="h-4 w-20" />
            <Bone className="h-4 w-24 rounded-full" />
          </div>
        </Panel>
      ))}
    </div>
  );
}

export function BrandToolbarSkeleton() {
  return (
    <Panel className="flex flex-wrap items-center gap-4 p-3.5">
      <Bone className="h-10 w-32 rounded-xl" />
      <Bone className="hidden h-8 w-28 md:block" />
      <Bone className="h-10 w-full rounded-xl sm:ml-auto sm:w-80 lg:w-96" />
      <Bone className="hidden h-7 w-32 rounded-full sm:block" />
    </Panel>
  );
}

/** A brand card: avatar and name, channel icons, account rows, actions. */
export function BrandCardSkeleton() {
  return (
    <Panel className="space-y-5 p-5">
      <div className="flex items-start gap-3">
        <Bone className="h-12 w-12 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Bone className="h-5 w-32" />
          <Bone className="h-3 w-48 max-w-full" />
          <div className="flex gap-1 pt-1">
            {Array.from({ length: 5 }, (_, i) => (
              <Bone key={i} className="h-5 w-5 rounded-md" />
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Bone key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-slate-100 pt-4">
        <Bone className="h-8 w-28 rounded-xl" />
        <Bone className="h-4 w-20" />
      </div>
    </Panel>
  );
}

export function BrandGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }, (_, i) => (
        <BrandCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** A run row: time and status, then five figures. */
export function RunListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Panel className="divide-y divide-slate-100">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between"
        >
          <div className="flex items-center gap-3">
            <Bone className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="space-y-2">
              <Bone className="h-4 w-48" />
              <Bone className="h-3 w-36" />
            </div>
          </div>
          <div className="grid grid-cols-5 gap-4 md:w-lg">
            {Array.from({ length: 5 }, (_, j) => (
              <div key={j} className="space-y-2">
                <Bone className="mx-auto h-5 w-8" />
                <Bone className="mx-auto h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Panel>
  );
}
