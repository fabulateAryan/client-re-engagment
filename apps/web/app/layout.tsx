import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { APP_NAME } from '../lib/app-name';
import { HOME_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from '../lib/auth-routes';
import { clerkAppearance, clerkLocalization } from '../lib/clerk-appearance';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: 'Watch client social activity and spot the moments worth re-engaging.',
};

export const viewport: Viewport = {
  themeColor: '#f7f7fb',
};

/** Root layout: fonts and Clerk. The app shell lives in (app)/layout, sign-in in (auth)/layout. */
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en-AU" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans text-slate-800 antialiased">
        <ClerkProvider
          appearance={clerkAppearance}
          localization={clerkLocalization}
          signInUrl={SIGN_IN_PATH}
          signUpUrl={SIGN_UP_PATH}
          signInFallbackRedirectUrl={HOME_PATH}
          signUpFallbackRedirectUrl={HOME_PATH}
          afterSignOutUrl={SIGN_IN_PATH}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
