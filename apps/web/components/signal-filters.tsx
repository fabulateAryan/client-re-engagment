'use client';

import type { ClientResponse, PlatformValue, SignalTypeValue } from '@signal-monitoring/shared';
import { X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PLATFORM_ORDER, PLATFORMS, SIGNAL_TYPE_ORDER, SIGNAL_TYPES } from '../lib/meta';
import { cx } from './ui';

interface Props {
  clients: ClientResponse[];
  clientId: string | undefined;
  platform: PlatformValue | undefined;
  signalType: SignalTypeValue | undefined;
}

/** Filter controls that write to the URL, so filtered views can be shared and bookmarked. */
export function SignalFilters({ clients, clientId, platform, signalType }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefWith = (key: string, value: string | undefined): string => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === undefined) params.delete(key);
    else params.set(key, value);
    params.delete('page');
    const query = params.toString();
    return query === '' ? pathname : `${pathname}?${query}`;
  };

  // Clearing filters keeps the To review / Skipped tab the user is on.
  const clearHref = searchParams.get('view') === 'skipped' ? `${pathname}?view=skipped` : pathname;

  const hasFilters = clientId !== undefined || platform !== undefined || signalType !== undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="sr-only" htmlFor="client-filter">
          Client
        </label>
        <select
          id="client-filter"
          value={clientId ?? ''}
          onChange={(event) => router.push(hrefWith('clientId', event.target.value || undefined))}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 focus:outline-none sm:w-64"
        >
          <option value="">All clients</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0">
          <FilterPill href={hrefWith('platform', undefined)} active={platform === undefined}>
            All platforms
          </FilterPill>
          {PLATFORM_ORDER.map((p) => (
            <FilterPill key={p} href={hrefWith('platform', p)} active={platform === p}>
              {PLATFORMS[p].label}
            </FilterPill>
          ))}
        </div>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <FilterPill href={hrefWith('signalType', undefined)} active={signalType === undefined}>
          All types
        </FilterPill>
        {SIGNAL_TYPE_ORDER.map((t) => (
          <FilterPill key={t} href={hrefWith('signalType', t)} active={signalType === t}>
            {SIGNAL_TYPES[t].label}
          </FilterPill>
        ))}
        {hasFilters && (
          <Link
            href={clearHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Clear filters
          </Link>
        )}
      </div>
    </div>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cx(
        'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition',
        active
          ? 'bg-violet-600 text-white ring-violet-600'
          : 'bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      {children}
    </Link>
  );
}
