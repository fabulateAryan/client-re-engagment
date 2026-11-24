import { AuthenticateWithRedirectCallback } from '@clerk/nextjs';
import { LoaderCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { HOME_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from '../../lib/auth-routes';

export const metadata: Metadata = { title: 'Signing you in' };

/** Where Google sends people back after "Continue with Google"; Clerk finishes the sign-in. */
export default function SsoCallbackPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas">
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <LoaderCircle className="h-4 w-4 animate-spin text-violet-600" aria-hidden />
        Signing you in…
      </p>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl={HOME_PATH}
        signUpFallbackRedirectUrl={HOME_PATH}
        signInUrl={SIGN_IN_PATH}
        signUpUrl={SIGN_UP_PATH}
      />
    </main>
  );
}
