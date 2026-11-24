import type { SourceStatusResponse } from '@signal-monitoring/shared';
import { Activity } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { api } from '../lib/api-server';
import { APP_NAME } from '../lib/app-name';
import { PLATFORMS } from '../lib/meta';
import { MobileTabBar, SidebarNav } from './nav-links';
import { RunProgressPanel } from './run-progress-panel';
import { SignInToast } from './sign-in-toast';
import { Toaster } from './toast';
import { UserMenu } from './user-menu';
import { PlatformLogo, cx } from './ui';

async function loadSources(): Promise<SourceStatusResponse[] | null> {
  try {
    return await api.sources();
  } catch {
    return null;
  }
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/25">
        <Activity className="h-5 w-5 text-white" aria-hidden />
      </span>
      <span className="text-sm font-semibold tracking-tight text-slate-900">{APP_NAME}</span>
    </Link>
  );
}

function StatusDot({ mode }: { mode: SourceStatusResponse['mode'] | 'offline' }) {
  const colour =
    mode === 'live' ? 'bg-emerald-400' : mode === 'demo' ? 'bg-amber-400' : 'bg-slate-300';
  return (
    <span className="relative flex h-2 w-2">
      {mode === 'live' && (
        <span
          className={cx(
            'animate-ping-soft absolute inline-flex h-full w-full rounded-full',
            colour,
          )}
        />
      )}
      <span className={cx('relative inline-flex h-2 w-2 rounded-full', colour)} />
    </span>
  );
}

function SourcesPanel({ sources }: { sources: SourceStatusResponse[] | null }) {
  const live = sources?.filter((s) => s.mode === 'live').length ?? 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
          Sources
        </p>
        {sources !== null && (
          <span className="text-[11px] font-medium text-slate-500">
            {live} of {sources.length} live
          </span>
        )}
      </div>
      {sources === null ? (
        <p className="mt-2 flex items-center gap-2 px-1 text-xs text-rose-700">
          <StatusDot mode="offline" /> API offline
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {sources.map((s) => {
            const meta = PLATFORMS[s.platform];
            return (
              <li
                key={s.platform}
                className={cx(
                  'flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-xs transition hover:bg-white',
                  s.mode === 'not_connected' && 'opacity-60',
                )}
              >
                <span className="flex items-center gap-2 font-medium text-slate-700">
                  <PlatformLogo
                    platform={s.platform}
                    size="xs"
                    muted={s.mode === 'not_connected'}
                  />
                  {meta.label}
                </span>
                <span className="flex items-center gap-1.5 text-slate-500">
                  <StatusDot mode={s.mode} />
                  {s.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// export function DemoBanner() {
//   return (
//     <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-700">
//       Demo mode: showing invented example data. No real client information is displayed.
//     </div>
//   );
// }

export async function AppShell({ children }: { children: ReactNode }) {
  const sources = await loadSources();
  const isDemo = sources?.some((s) => s.mode === 'demo') ?? false;

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col justify-between border-r border-slate-200 bg-white/80 p-5 backdrop-blur lg:flex">
        <div className="space-y-8">
          <Brand />
          <SidebarNav />
        </div>
        <div className="space-y-3">
          <SourcesPanel sources={sources} />
          <UserMenu variant="sidebar" />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur-lg lg:hidden">
          <Brand />
          <UserMenu variant="compact" />
        </header>
        {isDemo}
        <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">
          {children}
        </main>
      </div>

      <MobileTabBar />
      <RunProgressPanel />
      <Toaster />
      <SignInToast />
    </div>
  );
}
