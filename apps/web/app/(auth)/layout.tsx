import { auth } from '@clerk/nextjs/server';
import type { PlatformValue } from '@signal-monitoring/shared';
import {
  Activity,
  BellRing,
  CircleCheck,
  Gauge,
  Layers,
  LoaderCircle,
  ShieldCheck,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { AuthSwitch } from '../../components/auth-switch';
import { PlatformLogo } from '../../components/ui';
import { APP_NAME } from '../../lib/app-name';
import { HOME_PATH } from '../../lib/auth-routes';

const PLATFORMS: PlatformValue[] = ['LINKEDIN', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'GOOGLE_RSS'];

const FEATURES = [
  {
    icon: Layers,
    title: 'Every channel in one feed',
    text: 'LinkedIn, Instagram, TikTok, YouTube and news for each past client.',
  },
  {
    icon: Gauge,
    title: 'Ranked by relevance',
    text: 'Launches, campaigns and new marketing leads rise to the top, with the reason shown.',
  },
  {
    icon: BellRing,
    title: 'Only what is new',
    text: 'Each run picks up posts since the last check, ready to turn into outreach.',
  },
];

/** Staggered entrance: each item fades up a little after the one before. */
const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

/** A floating card's phase and tilt. */
const floatStyle = (phase: string, tilt: string): CSSProperties =>
  ({ animationDelay: phase, '--tilt': tilt }) as CSSProperties;

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={
          light
            ? 'grid h-10 w-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/30 backdrop-blur'
            : 'grid h-10 w-10 place-items-center rounded-xl bg-linear-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-500/25'
        }
      >
        <Activity className="h-5 w-5 text-white" aria-hidden />
      </span>
      <span
        className={`text-base font-semibold tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}
      >
        {APP_NAME}
      </span>
    </span>
  );
}

/* ── Illustrations (invented examples, not real data) ─────────────────────── */

function SignalPreview() {
  return (
    <div className="rounded-2xl bg-white/95 p-4 text-slate-800 shadow-2xl shadow-indigo-950/30 ring-1 ring-white/40 backdrop-blur">
      <div className="flex items-center gap-3">
        <PlatformLogo platform="INSTAGRAM" size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Your past client</p>
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="animate-pulse-ring h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Instagram · just now
          </p>
        </div>
        <span
          className="grid h-12 w-12 place-items-center rounded-full text-sm font-bold text-emerald-700"
          style={{ background: 'conic-gradient(#10b981 0 92%, #e2e8f0 92% 100%)' }}
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white">92</span>
        </span>
      </div>
      <p className="mt-3 text-sm leading-snug text-slate-700">
        “Introducing our new summer range, launching in Sydney with our brand ambassadors.”
      </p>
      <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800">
        High · Product launch + Ambassador + Mentions AU
      </p>
    </div>
  );
}

function RunPreview() {
  return (
    <div className="w-60 rounded-2xl bg-white/95 p-3.5 text-slate-800 shadow-xl shadow-indigo-950/25 ring-1 ring-white/40">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
        <LoaderCircle className="h-4 w-4 animate-spin text-violet-600" aria-hidden />
        Checking 5 accounts
        <span className="ml-auto text-violet-700 tabular-nums">60%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="progress-stripes h-full w-3/5 rounded-full bg-linear-to-r from-violet-600 to-cyan-400" />
      </div>
      <div className="mt-2.5 flex gap-1.5">
        {PLATFORMS.map((p, i) => (
          <PlatformLogo key={p} platform={p} size="xs" muted={i > 2} />
        ))}
      </div>
    </div>
  );
}

function DonePreview() {
  return (
    <div className="flex w-56 items-center gap-2.5 rounded-2xl bg-white/95 p-3 text-slate-800 shadow-xl shadow-indigo-950/25 ring-1 ring-white/40">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
        <CircleCheck className="h-4 w-4" aria-hidden />
      </span>
      <span className="text-xs leading-tight">
        <span className="block font-semibold text-slate-900">Run complete</span>
        <span className="text-slate-500">New signals ready to review</span>
      </span>
    </div>
  );
}

/* ── Panels ────────────────────────────────────────────────────────────────── */

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-linear-to-br from-violet-700 via-indigo-600 to-cyan-500 text-white lg:flex lg:flex-col">
      {/* Moving background */}
      <div aria-hidden className="bg-dot-grid absolute inset-0 opacity-60" />
      <span
        aria-hidden
        className="animate-aurora absolute -top-32 -right-24 h-112 w-112 rounded-full bg-fuchsia-400/30 blur-3xl"
      />
      <span
        aria-hidden
        className="animate-aurora absolute -bottom-40 -left-28 h-128 w-128 rounded-full bg-cyan-300/30 blur-3xl"
        style={{ animationDelay: '-9s' }}
      />

      <div className="relative flex min-h-0 flex-1 flex-col justify-between gap-6 p-8 xl:px-12 xl:py-10">
        <div className="animate-fade-up">
          <Logo light />
        </div>

        <div className="auth-fit max-w-xl space-y-6">
          <div className="animate-fade-up" style={delay(120)}>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/25">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Signed-in access only
            </p>
            <h1 className="mt-4 text-3xl leading-[1.12] font-semibold tracking-tight xl:text-[2.6rem]">
              Spot the <span className="text-shimmer">right moment</span> to re-engage every client.
            </h1>
            <p className="mt-3 max-w-lg text-sm text-white/80 xl:text-base">
              We watch your past clients&apos; social channels and the news, and tell you who is
              launching, hiring or partnering, so you reach out at the right time.
            </p>
          </div>

          <ul className="space-y-3 [@media(max-height:640px)]:hidden">
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="animate-fade-up flex gap-3" style={delay(260 + i * 110)}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
                  <Icon className="h-4.5 w-4.5" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm text-white/75">{text}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* Floating previews of what the app does. */}
          <div
            className="animate-fade-up relative h-52 [@media(max-height:820px)]:hidden"
            style={delay(640)}
            aria-hidden
          >
            <div className="animate-float absolute top-0 left-0 w-[20rem] max-w-full">
              <SignalPreview />
            </div>
            <div
              className="animate-float absolute top-4 right-0 hidden xl:block"
              style={floatStyle('-2s', '2deg')}
            >
              <RunPreview />
            </div>
            <div
              className="animate-float absolute right-10 bottom-0 hidden lg:block"
              style={floatStyle('-4s', '-2deg')}
            >
              <DonePreview />
            </div>
          </div>
        </div>

        <div className="animate-fade-up flex items-center gap-3" style={delay(800)}>
          <div className="flex gap-1.5">
            {PLATFORMS.map((p) => (
              <PlatformLogo key={p} platform={p} size="sm" />
            ))}
          </div>
          <span className="text-xs text-white/70">Live sources, checked as background jobs</span>
        </div>
      </div>
    </aside>
  );
}

/** Small screens: a colourful header that the form card overlaps. */
function MobileHeader() {
  return (
    <div className="relative overflow-hidden bg-linear-to-br from-violet-700 via-indigo-600 to-cyan-500 px-5 pt-6 pb-22 text-white sm:px-8 lg:hidden">
      <div aria-hidden className="bg-dot-grid absolute inset-0 opacity-50" />
      <span
        aria-hidden
        className="animate-aurora absolute -top-20 -right-16 h-64 w-64 rounded-full bg-fuchsia-400/30 blur-3xl"
      />
      <div className="animate-fade-up relative mx-auto max-w-md">
        <Logo light />
        <h1 className="mt-4 text-xl leading-tight font-semibold tracking-tight sm:text-2xl">
          Spot the <span className="text-shimmer">right moment</span> to re-engage every client.
        </h1>
        <div className="mt-4 flex gap-1.5">
          {PLATFORMS.map((p) => (
            <PlatformLogo key={p} platform={p} size="xs" />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Sign-in and sign-up. Signed-in visitors go straight to the app; everyone else sees the
 * brand panel (large screens) or a header (small screens) next to the Clerk form.
 */
export default async function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { userId } = await auth();
  if (userId !== null) redirect(HOME_PATH);

  return (
    <div className="min-h-dvh overflow-x-clip bg-canvas lg:grid lg:h-dvh lg:grid-cols-[1.1fr_1fr] lg:overflow-hidden">
      <BrandPanel />
      <MobileHeader />

      <main className="relative -mt-16 flex min-w-0 flex-col items-center px-4 pb-8 sm:px-8 lg:mt-0 lg:h-dvh lg:justify-center lg:overflow-y-auto lg:py-4">
        <div className="auth-fit animate-rise w-full max-w-md min-w-0">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-2xl shadow-violet-200/40 sm:p-6">
            <AuthSwitch />
            <div className="mt-4">{children}</div>
          </div>
          <p
            className="animate-fade-up mt-4 text-center text-xs text-slate-400 lg:hidden"
            style={delay(300)}
          >
            Use your work email to sign in or create an account.
          </p>
        </div>
      </main>
    </div>
  );
}
