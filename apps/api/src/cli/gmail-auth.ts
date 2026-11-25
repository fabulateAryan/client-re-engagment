/**
 * One-off Gmail sign-in: gets a refresh token for the sending mailbox and saves it to
 * .env.local (GMAIL_REFRESH_TOKEN and GMAIL_FROM_EMAIL).
 *
 *   pnpm --filter @signal-monitoring/api gmail:auth
 *
 * Needs GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (a "Desktop app" OAuth client) in .env.local.
 * Uses Google's loopback flow with PKCE: a browser window opens, you sign in as the sending
 * mailbox, and Google redirects back to a short-lived server on localhost.
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import {
  GMAIL_SCOPES,
  GOOGLE_AUTH_URL,
  GOOGLE_TOKEN_URL,
  GmailApiClient,
} from '../adapters/outbound/email/gmail/gmail-api.client';
import { loadRootEnvFiles, REPO_ROOT } from '../config';

const ENV_FILE = join(REPO_ROOT, '.env.local');
const TIMEOUT_MS = 15 * 60_000;

async function main(): Promise<void> {
  loadRootEnvFiles(REPO_ROOT);
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error('Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env.local first.');
  }

  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('hex');

  const { code, redirectUri } = await waitForCode((redirect) => {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: 'code',
      scope: GMAIL_SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent', // always return a refresh token
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }, state);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });
  const tokens = (await response.json()) as {
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || tokens.refresh_token === undefined) {
    throw new Error(
      `Google did not return a refresh token: ${tokens.error ?? response.status} ${tokens.error_description ?? ''}`,
    );
  }
  const granted = new Set((tokens.scope ?? '').split(' '));
  const missing = GMAIL_SCOPES.filter((s) => !granted.has(s));
  if (missing.length > 0) {
    throw new Error(
      `Some permissions were not granted: ${missing.join(', ')}. Run again and tick every box.`,
    );
  }

  const email = await new GmailApiClient({
    clientId,
    clientSecret,
    refreshToken: tokens.refresh_token,
  }).profileEmail();

  setEnvValues(ENV_FILE, { GMAIL_REFRESH_TOKEN: tokens.refresh_token, GMAIL_FROM_EMAIL: email });
  console.log(
    `\nConnected Gmail as ${email}. Saved GMAIL_REFRESH_TOKEN and GMAIL_FROM_EMAIL to .env.local.`,
  );
  console.log('Restart the API to start sending and reading replies through Gmail.');
}

/** Starts a loopback server, opens the consent page, and resolves with the returned code. */
function waitForCode(
  authUrlFor: (redirectUri: string) => string,
  state: string,
): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    let redirectUri = '';
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== '/') {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const ok = error === null && code !== null && url.searchParams.get('state') === state;
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(
        ok
          ? 'Gmail connected. You can close this tab.'
          : `Sign-in failed: ${error ?? 'bad response'}`,
      );
      clearTimeout(timer);
      server.close();
      if (ok) resolve({ code, redirectUri });
      else reject(new Error(`Sign-in failed: ${error ?? 'state mismatch'}`));
    });
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for the Google sign-in (15 minutes). Run the command again.'));
    }, TIMEOUT_MS);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      redirectUri = `http://localhost:${port}`;
      const authUrl = authUrlFor(redirectUri);
      console.log('Sign in as the mailbox the app should send from. If no browser opens, visit:\n');
      console.log(authUrl);
      openBrowser(authUrl);
    });
  });
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(command, args, { stdio: 'ignore', detached: true })
      .on('error', () => undefined)
      .unref();
  } catch {
    // The URL is printed; the user can open it by hand.
  }
}

/** Sets KEY=value lines in an env file, replacing existing ones or appending. */
function setEnvValues(path: string, values: Record<string, string>): void {
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    text = pattern.test(text)
      ? text.replace(pattern, () => line)
      : `${text.replace(/\s*$/, '')}\n${line}\n`;
  }
  writeFileSync(path, text);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
