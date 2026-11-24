import type { NextConfig } from 'next';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

// The repository-root .env.local / .env serve both apps. The web app takes only
// NEXT_PUBLIC_* values and the server-only keys listed below, so other server secrets
// (e.g. MONID_API_KEY) never enter this process. Variables already set in the environment win.
const SERVER_KEYS = new Set([
  // Clerk checks sessions on the web server (proxy.ts, auth()). Never sent to the browser.
  'CLERK_SECRET_KEY',
]);
const repoRoot = resolve(process.cwd(), '..', '..');
for (const name of ['.env.local', '.env']) {
  const file = resolve(repoRoot, name);
  if (!existsSync(file)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (
      (key.startsWith('NEXT_PUBLIC_') || SERVER_KEYS.has(key)) &&
      process.env[key] === undefined
    ) {
      process.env[key] = value;
    }
  }
}

// Clerk's server code reads these to send signed-out visitors to our own pages (not Clerk's
// hosted ones). Set in this process for the server, and inlined below for the browser.
process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ??= '/sign-in';
process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ??= '/sign-up';
process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL ??= '/';
process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL ??= '/';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
    // Default matches the API's default port, so local dev works before an env file exists.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  },
  turbopack: {
    root: repoRoot,
  },
  // The Brands pages used to live under /clients; keep old links and bookmarks working.
  redirects: async () => [
    { source: '/clients', destination: '/brands', permanent: true },
    { source: '/clients/:id', destination: '/brands/:id', permanent: true },
  ],
};

export default nextConfig;
