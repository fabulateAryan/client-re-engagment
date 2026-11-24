import { auth } from '@clerk/nextjs/server';
import type { ReactNode } from 'react';
import { AppShell } from '../../components/app-shell';

/**
 * Every signed-in page: sidebar, header and the run progress panel.
 *
 * Sign-in is checked here, where all app pages and their data load (Clerk's recommended
 * "resource-based" check), not by matching paths in proxy.ts. Signed-out visitors go to
 * /sign-in and come back to the page they asked for. The API checks the session again on
 * every request, so data is protected even if a page were reached another way.
 */
export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { userId, redirectToSignIn } = await auth();
  if (userId === null) return redirectToSignIn();
  return <AppShell>{children}</AppShell>;
}
