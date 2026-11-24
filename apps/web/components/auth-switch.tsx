'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SIGN_IN_PATH, SIGN_UP_PATH } from '../lib/auth-routes';
import { cx } from './ui';

const TABS = [
  { href: SIGN_IN_PATH, label: 'Sign in' },
  { href: SIGN_UP_PATH, label: 'Create account' },
];

/** Segmented switch between sign-in and sign-up, with a sliding highlight. */
export function AuthSwitch() {
  const pathname = usePathname();
  const active = pathname.startsWith(SIGN_UP_PATH) ? 1 : 0;
  return (
    <nav
      aria-label="Sign in or create an account"
      className="relative grid grid-cols-2 rounded-2xl bg-slate-100 p-1 text-sm font-medium"
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl bg-white shadow-sm shadow-slate-300/60 transition-transform duration-300 ease-out"
        style={{ transform: `translateX(${active * 100}%)` }}
      />
      {TABS.map((tab, index) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={index === active ? 'page' : undefined}
          className={cx(
            // No browser outline on click; a violet ring only for keyboard focus.
            'relative z-10 rounded-xl py-2 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
            index === active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
