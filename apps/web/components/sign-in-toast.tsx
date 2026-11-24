'use client';

import { useSession, useUser } from '@clerk/nextjs';
import { useEffect } from 'react';
import { toast } from './toast';

const STORAGE_KEY = 'client-reengagement:greeted-session';
/** Only sessions started this recently count as "just signed in" (not a reload days later). */
const FRESH_SESSION_MS = 5 * 60_000;

/**
 * Shows "Signed in successfully" once per sign-in (or new account). Each sign-in starts a new
 * Clerk session, so the session id is remembered in this browser and the toast is not shown
 * again for it on reloads or other pages.
 */
export function SignInToast() {
  const { session, isLoaded } = useSession();
  const { user, isLoaded: userLoaded } = useUser();
  const hasUser = userLoaded && user != null;
  const firstName = user?.firstName?.trim() ?? '';

  useEffect(() => {
    if (!isLoaded || session == null || !hasUser) return;
    let greeted: string | null = null;
    try {
      greeted = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage blocked: the freshness check below still stops repeats on later visits.
    }
    if (greeted === session.id) return;
    const fresh = Date.now() - new Date(session.createdAt).getTime() < FRESH_SESSION_MS;
    try {
      window.localStorage.setItem(STORAGE_KEY, session.id);
    } catch {
      // Ignore: worst case the toast may show once more.
    }
    if (!fresh) return;
    toast({
      tone: 'success',
      title: 'Signed in successfully',
      description: firstName !== '' ? `Welcome back, ${firstName}.` : 'Welcome back.',
    });
  }, [isLoaded, session, hasUser, firstName]);

  return null;
}
