/** Sending and receiving through Gmail (fake Google endpoints). Invented addresses only. */
import { GmailReplyPoller } from '../../src/adapters/inbound/jobs/gmail-reply.poller';
import { FakeClock, InMemoryDraftRepository } from '../../src/adapters/outbound/fakes';
import { GmailApiClient } from '../../src/adapters/outbound/email/gmail/gmail-api.client';
import type { GmailMessage } from '../../src/adapters/outbound/email/gmail/gmail-api.client';
import { GmailEmailAdapter } from '../../src/adapters/outbound/email/gmail/gmail-email.adapter';
import {
  buildMimeMessage,
  parseGmailMessage,
} from '../../src/adapters/outbound/email/gmail/gmail-mime';
import { RecordInboundReplyUseCase, SendDraftEmailUseCase } from '../../src/core/application';
import { DraftFailedError, DraftSource, ThreadDirection } from '../../src/core/domain';
import { loadAppConfig } from '../../src/config';

const NOW = new Date('2026-11-23T01:00:00.000Z');
const CREDENTIALS = { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh' };

/** A fake of Google's token and Gmail endpoints that records every request. */
function fakeGoogle(options: { tokenError?: string; inbox?: GmailMessage[] } = {}) {
  const requests: { url: string; init: RequestInit }[] = [];
  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const fetchFn = ((url: string, init: RequestInit) => {
    requests.push({ url, init });
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return Promise.resolve(
        options.tokenError === undefined
          ? json(200, { access_token: 'access-1', expires_in: 3600 })
          : json(400, { error: options.tokenError }),
      );
    }
    if (url.endsWith('/messages/send')) return Promise.resolve(json(200, { id: 'g1' }));
    if (url.includes('/messages?')) {
      return Promise.resolve(
        json(200, { messages: (options.inbox ?? []).map((m) => ({ id: m.id })) }),
      );
    }
    const id = /\/messages\/([^?]+)\?/.exec(url)?.[1];
    const message = (options.inbox ?? []).find((m) => m.id === id);
    return Promise.resolve(message === undefined ? json(404, {}) : json(200, message));
  }) as typeof fetch;
  return { fetchFn, requests };
}

function rawOf(request: { init: RequestInit }): string {
  const { raw } = JSON.parse(String(request.init.body)) as { raw: string };
  return Buffer.from(raw, 'base64url').toString('utf8');
}

function b64url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}

describe('Gmail', () => {
  async function sentThread() {
    const google = fakeGoogle();
    const gmail = new GmailApiClient(CREDENTIALS, google.fetchFn, () => NOW.getTime());
    const sender = new GmailEmailAdapter(gmail, {
      fromEmail: 'sales@example.test',
      fromName: 'Example',
    });
    const drafts = new InMemoryDraftRepository();
    await drafts.save({
      signalId: 'sig-1',
      subject: 'Creators for Example Brand',
      text: 'Hi Example Brand team,\nCafé chat?',
      recipient: 'person@example.test',
      source: DraftSource.TEMPLATE,
      createdAt: NOW,
      editedAt: null,
      sentAt: null,
      sentVia: null,
    });
    const clock = new FakeClock(NOW);
    await new SendDraftEmailUseCase(drafts, sender, clock).execute('sig-1');
    return { google, drafts };
  }

  it('sends a plain-text email with a plus-addressed Reply-To and threading headers', async () => {
    const { google, drafts } = await sentThread();
    const send = google.requests.find((r) => r.url.endsWith('/messages/send'));
    expect(send?.init.headers).toMatchObject({ Authorization: 'Bearer access-1' });
    if (send === undefined) throw new Error('nothing was sent');
    const raw = rawOf(send);
    const saved = await drafts.get('sig-1');
    const token = saved?.replyToken ?? '';
    expect(token).toMatch(/^[0-9a-f]{24}$/);
    expect(raw).toContain('From: "Example" <sales@example.test>\r\n');
    expect(raw).toContain('To: person@example.test\r\n');
    expect(raw).toContain(`Reply-To: sales+${token}@example.test\r\n`);
    expect(raw).toContain(`Message-ID: <${token}@example.test>\r\n`);
    expect(raw).toContain('Subject: Creators for Example Brand\r\n');
    const body = raw.split('\r\n\r\n')[1] ?? '';
    expect(Buffer.from(body, 'base64').toString('utf8')).toBe(
      'Hi Example Brand team,\r\nCafé chat?',
    );
  });

  it('reads a reply from the inbox into its thread, once', async () => {
    const headers: { name: string; value: string }[] = [];
    const reply: GmailMessage = {
      id: 'r1',
      payload: {
        mimeType: 'multipart/alternative',
        headers,
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: b64url('Yes, let us talk.\n\nOn Mon, Example wrote:\n> Hi') },
          },
          { mimeType: 'text/html', body: { data: b64url('<p>Yes</p>') } },
        ],
      },
    };
    const { drafts } = await sentThread();
    const token = (await drafts.get('sig-1'))?.replyToken ?? '';
    headers.push(
      { name: 'Delivered-To', value: `sales+${token}@example.test` },
      { name: 'To', value: `Example <sales+${token}@example.test>` },
      { name: 'From', value: 'Person <person@example.test>' },
      { name: 'Subject', value: 'Re: Creators for Example Brand' },
      { name: 'Message-ID', value: '<r1@mail.example.test>' },
    );
    const withInbox = fakeGoogle({ inbox: [reply] });
    const gmail = new GmailApiClient(CREDENTIALS, withInbox.fetchFn, () => NOW.getTime());
    const poller = new GmailReplyPoller(
      gmail,
      new RecordInboundReplyUseCase(drafts, new FakeClock(NOW)),
      {
        intervalMs: 60_000,
        lookbackDays: 14,
        batchSize: 50,
      },
    );

    expect(await poller.pollOnce()).toBe(1);
    expect(await poller.pollOnce()).toBe(0); // already seen
    const list = withInbox.requests.find((r) => r.url.includes('/messages?'));
    expect(new URL(list?.url ?? 'http://x').searchParams.get('q')).toBe(
      'in:inbox -from:me newer_than:14d',
    );
    const thread = (await drafts.get('sig-1'))?.thread ?? [];
    expect(thread).toHaveLength(2);
    expect(thread[1]).toMatchObject({
      direction: ThreadDirection.INBOUND,
      text: 'Yes, let us talk.',
    });
  });

  it('turns an expired sign-in into a message an admin can act on', async () => {
    const google = fakeGoogle({ tokenError: 'invalid_grant' });
    const sender = new GmailEmailAdapter(new GmailApiClient(CREDENTIALS, google.fetchFn), {
      fromEmail: 'sales@example.test',
      fromName: 'Example',
    });
    const attempt = sender.send({ to: 'person@example.test', subject: 'Hi', text: 'Hi' });
    await expect(attempt).rejects.toThrow(DraftFailedError);
    await expect(attempt).rejects.toThrow('gmail:auth');
  });

  it('encodes non-ASCII subjects and strips line breaks from headers', () => {
    const raw = buildMimeMessage({
      fromEmail: 'sales@example.test',
      fromName: 'Example',
      to: 'person@example.test\r\nBcc: someone@example.test',
      replyTo: null,
      subject: 'Café creators',
      text: 'Hi',
    });
    expect(raw).toContain('Subject: =?UTF-8?B?');
    expect(raw).not.toContain('\r\nBcc:');
  });

  it('falls back to the HTML part when there is no text part', () => {
    const email = parseGmailMessage({
      id: 'x',
      payload: {
        mimeType: 'text/html',
        headers: [],
        body: { data: b64url('<p>Hello<br>there</p>') },
      },
    });
    expect(email.text).toBe('Hello\nthere');
  });

  it('is configured only when all four Gmail settings are present', () => {
    const base = {
      GMAIL_CLIENT_ID: 'id',
      GMAIL_CLIENT_SECRET: 'secret',
      GMAIL_REFRESH_TOKEN: '',
      GMAIL_FROM_EMAIL: 'Sales@Example.test',
    };
    expect(loadAppConfig(base, '1.0.0').gmail).toBeNull();
    expect(loadAppConfig({ ...base, GMAIL_REFRESH_TOKEN: 'r' }, '1.0.0').gmail).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
      refreshToken: 'r',
      fromEmail: 'sales@example.test',
      fromName: 'Fabulate',
      pollIntervalMs: 15_000,
    });
  });
});
