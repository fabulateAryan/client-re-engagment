'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { cx } from './ui';

/**
 * Search brands by name. Keeps the text in the URL (?q=), so a refresh or shared link keeps it.
 * A new search goes back to page 1.
 */
export function BrandSearch({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const apply = (text: string) => {
    const next = new URLSearchParams(params.toString());
    if (text.trim() === '') next.delete('q');
    else next.set('q', text.trim());
    next.delete('page');
    const query = next.toString();
    startTransition(() =>
      router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false }),
    );
  };

  // "/" anywhere on the page jumps to the search box (unless typing in another field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      input.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const onChange = (text: string) => {
    setValue(text);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(text), 200);
  };

  return (
    <label className={cx('group/search relative block w-full', className)}>
      <span className="sr-only">Search brands by name</span>
      <Search
        className={cx(
          'pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2',
          pending
            ? 'animate-pulse text-violet-500'
            : 'text-slate-400 transition group-focus-within/search:text-violet-500',
        )}
        aria-hidden
      />
      <input
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value !== '') onChange('');
        }}
        placeholder="Search brands by name"
        className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/80 pr-10 pl-10 text-sm text-slate-900 transition outline-none placeholder:text-slate-400 hover:border-slate-300 hover:bg-white focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100 [&::-webkit-search-cancel-button]:hidden"
      />
      {value === '' ? (
        <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-400 shadow-sm sm:block group-focus-within/search:hidden">
          /
        </kbd>
      ) : (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Clear search"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </label>
  );
}
