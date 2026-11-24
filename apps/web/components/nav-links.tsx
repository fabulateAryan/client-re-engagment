'use client';

import { History, LayoutDashboard, Mail, Radio, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

const LINKS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/signals', label: 'Signals', icon: Radio },
  { href: '/outreach', label: 'Outreach', icon: Mail },
  { href: '/runs', label: 'Runs', icon: History },
  { href: '/brands', label: 'Brands', icon: Users },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/** The link's icon. The page's loading skeleton shows progress, so the icon stays as it is. */
function NavIcon({ icon: Icon, className }: { icon: LucideIcon; className: string }) {
  return <Icon className={className} aria-hidden />;
}

/** Vertical navigation for the desktop sidebar. */
export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Main">
      {LINKS.map(({ href, label, icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cx(
              // No browser outline on click; a violet ring only for keyboard focus.
              'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-violet-400',
              active
                ? 'bg-violet-50 text-slate-900 ring-1 ring-violet-100'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 active:bg-violet-50',
            )}
          >
            <NavIcon
              icon={icon}
              className={cx('h-4 w-4', active ? 'text-violet-700' : 'text-slate-500')}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Bottom tab bar for phones. */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {LINKS.map(({ href, label, icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium outline-none focus-visible:bg-violet-50',
                  active ? 'text-slate-900' : 'text-slate-500',
                )}
              >
                <NavIcon icon={icon} className={cx('h-5 w-5', active && 'text-violet-700')} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
