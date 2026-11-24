import { MonidError } from '../../../src/adapters/outbound/monid';
import { TEST_CONFIG, fixture, json, scriptedFetch, testClient } from './monid-test-helpers';

const PROVIDER = 'example-provider';
const ENDPOINT = '/example/linkedin-posts';

async function expectMonidError(promise: Promise<unknown>, failure: MonidError['failure']) {
  await expect(promise).rejects.toBeInstanceOf(MonidError);
  await promise.catch((error: MonidError) => expect(error.failure).toBe(failure));
}

describe('MonidHttpClient', () => {
  it('sends Bearer auth and JSON, and returns a sync completed run', async () => {
    const { fetchFn, calls } = scriptedFetch([json(fixture('run-sync-completed.json'))]);
    const { client } = testClient(fetchFn);

    const run = await client.runAndWait(PROVIDER, ENDPOINT, { profile: 'placeholder' });

    expect(run.status).toBe('COMPLETED');
    expect(Array.isArray(run.output)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      url: 'https://monid.test/v1/run',
      body: { provider: PROVIDER, endpoint: ENDPOINT, input: { profile: 'placeholder' } },
    });
    expect(calls[0]?.headers.Authorization).toBe('Bearer test-key-not-real');
    expect(calls[0]?.headers['Content-Type']).toBe('application/json');
  });

  it('polls an async run (202) until it completes', async () => {
    const accepted = fixture('run-async-accepted.json');
    const running = { ...accepted, status: 'RUNNING' };
    const completed = { ...fixture('run-sync-completed.json'), runId: String(accepted.runId) };
    const { fetchFn, calls } = scriptedFetch([json(accepted, 202), json(running), json(completed)]);
    const { client, sleeps } = testClient(fetchFn);

    const run = await client.runAndWait(PROVIDER, ENDPOINT, {});

    expect(run.status).toBe('COMPLETED');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST https://monid.test/v1/run',
      'GET https://monid.test/v1/runs/01TESTRUNASYNC000000000000',
      'GET https://monid.test/v1/runs/01TESTRUNASYNC000000000000',
    ]);
    expect(sleeps).toEqual([50, 50]);
  });

  it('polls soon at first, then 1.5 times slower each time, up to the poll interval', async () => {
    const accepted = fixture('run-async-accepted.json');
    const running = { ...accepted, status: 'RUNNING' };
    const completed = { ...fixture('run-sync-completed.json'), runId: String(accepted.runId) };
    const { fetchFn } = scriptedFetch([
      json(accepted, 202),
      ...Array.from({ length: 6 }, () => json(running)),
      json(completed),
    ]);
    const { client, sleeps } = testClient(fetchFn, {
      ...TEST_CONFIG,
      firstPollMs: 500,
      pollIntervalMs: 2000,
      runTimeoutMs: 60_000,
    });

    await client.runAndWait(PROVIDER, ENDPOINT, {});

    expect(sleeps).toEqual([500, 750, 1125, 1688, 2000, 2000, 2000]);
  });

  it('treats a provider 404 ("no match") as an empty result, not an error', async () => {
    const { fetchFn } = scriptedFetch([json(fixture('run-provider-not-found.json'), 404)]);
    const { client } = testClient(fetchFn);

    const run = await client.runAndWait(PROVIDER, ENDPOINT, {});

    expect(run.output).toBeNull();
  });

  it('retries a timed-out request with exponential backoff, then gives up as TIMEOUT', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const { fetchFn, calls } = scriptedFetch([timeout, timeout, timeout]);
    const { client, sleeps } = testClient(fetchFn);

    await expectMonidError(client.runAndWait(PROVIDER, ENDPOINT, {}), 'TIMEOUT');
    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([100, 200]);
  });

  it('retries a 429 honouring Retry-After, then succeeds', async () => {
    const { fetchFn } = scriptedFetch([
      json({ code: 429, message: 'Too many requests' }, 429, { 'Retry-After': '2' }),
      json(fixture('run-sync-completed.json')),
    ]);
    const { client, sleeps } = testClient(fetchFn);

    const run = await client.runAndWait(PROVIDER, ENDPOINT, {});

    expect(run.status).toBe('COMPLETED');
    expect(sleeps).toEqual([2000]);
  });

  it('reports RATE_LIMITED after retries are exhausted on provider 429', async () => {
    const limited = {
      ...fixture('run-sync-completed.json'),
      output: null,
      providerResponse: { httpStatus: 429 },
    };
    const { fetchFn, calls } = scriptedFetch([
      json(limited, 429),
      json(limited, 429),
      json(limited, 429),
    ]);
    const { client } = testClient(fetchFn);

    await expectMonidError(client.runAndWait(PROVIDER, ENDPOINT, {}), 'RATE_LIMITED');
    expect(calls).toHaveLength(3);
  });

  it('does not retry auth or credit failures', async () => {
    const unauthorised = scriptedFetch([json({ code: 401, message: 'Invalid key' }, 401)]);
    await expectMonidError(
      testClient(unauthorised.fetchFn).client.runAndWait(PROVIDER, ENDPOINT, {}),
      'NOT_AUTHORISED',
    );
    expect(unauthorised.calls).toHaveLength(1);

    const noCredit = scriptedFetch([json({ code: 402, message: 'Insufficient balance' }, 402)]);
    await expectMonidError(
      testClient(noCredit.fetchFn).client.runAndWait(PROVIDER, ENDPOINT, {}),
      'INSUFFICIENT_CREDIT',
    );
    expect(noCredit.calls).toHaveLength(1);
  });

  it('rejects a malformed response as BAD_RESPONSE', async () => {
    const notJson = new Response('<html>oops</html>', { status: 200 });
    const { fetchFn } = scriptedFetch([notJson]);
    await expectMonidError(
      testClient(fetchFn).client.runAndWait(PROVIDER, ENDPOINT, {}),
      'BAD_RESPONSE',
    );

    const missingFields = scriptedFetch([json({ hello: 'world' })]);
    await expectMonidError(
      testClient(missingFields.fetchFn).client.runAndWait(PROVIDER, ENDPOINT, {}),
      'BAD_RESPONSE',
    );
  });

  it('gives up on an async run that never finishes, and asks Monid to stop it', async () => {
    const accepted = fixture('run-async-accepted.json');
    const running = (): Response => json({ ...accepted, status: 'RUNNING' });
    const steps = [json(accepted, 202), ...Array.from({ length: 30 }, () => running)];
    const { fetchFn, calls } = scriptedFetch(steps);
    const { client } = testClient(fetchFn, {
      baseUrl: 'https://monid.test',
      apiKey: 'test-key-not-real',
      requestTimeoutMs: 1_000,
      maxRetries: 0,
      retryBaseDelayMs: 100,
      pollIntervalMs: 50,
      runTimeoutMs: 200,
    });

    await expectMonidError(client.runAndWait(PROVIDER, ENDPOINT, {}), 'TIMEOUT');
    expect(calls.at(-1)?.url).toBe('https://monid.test/v1/runs/01TESTRUNASYNC000000000000/stop');
  });

  it('reports a BLOCKED run without retrying', async () => {
    const blocked = {
      ...fixture('run-async-accepted.json'),
      status: 'BLOCKED',
      reason: 'budget cap',
    };
    const { fetchFn, calls } = scriptedFetch([json(blocked)]);

    await expectMonidError(
      testClient(fetchFn).client.runAndWait(PROVIDER, ENDPOINT, {}),
      'UNAVAILABLE',
    );
    expect(calls).toHaveLength(1);
  });
});
