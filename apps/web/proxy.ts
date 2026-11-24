import { clerkMiddleware } from '@clerk/nextjs/server';
import { SIGN_IN_PATH, SIGN_UP_PATH } from './lib/auth-routes';

/**
 * Runs before every page (Next.js 16 "proxy", formerly middleware) so Clerk can read and
 * refresh the session. It does not decide who may see what: the (app) layout sends
 * signed-out visitors to our own /sign-in page, and the API checks the session on every
 * request. Without these URLs Clerk would send people to its hosted sign-in page instead.
 */
export default clerkMiddleware({ signInUrl: SIGN_IN_PATH, signUpUrl: SIGN_UP_PATH });

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes.
    '/(api|trpc)(.*)',
  ],
};
