import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';
import { SIGN_IN_PATH, SIGN_UP_PATH } from '../../../../lib/auth-routes';
import { signInAppearance } from '../../../../lib/clerk-appearance';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * A placeholder the size of Clerk's form. Clerk draws its form a moment after the page
 * appears; without this the card collapses and then jumps back when switching tabs.
 * It lies over the slot and is hidden by CSS (globals.css, .signin-slot) once Clerk draws its form.
 */
function SignInSkeleton() {
  const bar = 'rounded-lg bg-slate-100';
  return (
    <div className="signin-skeleton animate-pulse space-y-4" aria-hidden>
      <div className="space-y-2">
        <div className={`${bar} h-6 w-40`} />
        <div className={`${bar} h-4 w-56`} />
      </div>
      <div className="h-10 rounded-xl border border-slate-200 bg-white" />
      <div className={`${bar} mx-auto h-3 w-8`} />
      <div className="space-y-2">
        <div className={`${bar} h-4 w-28`} />
        <div className="h-10 rounded-xl bg-slate-100" />
      </div>
      <div className="h-10 rounded-xl bg-violet-100" />
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="signin-slot">
      <SignInSkeleton />
      <SignIn path={SIGN_IN_PATH} signUpUrl={SIGN_UP_PATH} appearance={signInAppearance} />
    </div>
  );
}
