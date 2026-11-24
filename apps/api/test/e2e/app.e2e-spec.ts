import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  ClientResponse,
  DraftResponse,
  HealthResponse,
  JobQueueStatsResponse,
  MonitoringProgressResponse,
  MonitoringRunListResponse,
  MonitoringRunResponse,
  SignalPageResponse,
  SignalSummaryResponse,
  SourceStatusResponse,
} from '@signal-monitoring/shared';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { readPackageVersion } from '../../src/config';

describe('HTTP API (demo sources wired)', () => {
  let app: INestApplication<App>;

  beforeAll(() => {
    Logger.overrideLogger(false);
    // Deterministic: never pick up a developer's real clients file or Monid settings.
    process.env.CLIENTS_FILE = 'test-no-such-clients-file.json';
    process.env.LINKEDIN_SOURCE = 'demo';
    process.env.NEWS_SOURCE = 'demo';
    // The in-process job queue, with quick retries.
    delete process.env.REDIS_URL;
    delete process.env.CLERK_SECRET_KEY; // API open: sign-in is tested in the guard's unit tests.
    delete process.env.MONITORING_SCHEDULE_CRON;
    process.env.MONITORING_RETRY_DELAY_MS = '1';
    // Demo posts have fixed dates; do not let the 90-day window hide them.
    process.env.MONITORING_LOOKBACK_DAYS = '0';
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Queue a run (202), then wait for its jobs to finish and return the finished run. */
  async function runMonitoring(): Promise<MonitoringRunResponse> {
    const queued = (await http().post('/monitoring/run').expect(202)).body as MonitoringRunResponse;
    for (let i = 0; i < 200; i += 1) {
      const run = (await http().get(`/monitoring/runs/${queued.id}`).expect(200))
        .body as MonitoringRunResponse;
      if (run.status !== 'RUNNING') return run;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Run ${queued.id} did not finish`);
  }

  it('GET /health returns status and version', async () => {
    const response = await http().get('/health').expect(200);
    expect(response.body as HealthResponse).toEqual({
      status: 'ok',
      version: readPackageVersion(),
    });
  });

  it('POST /monitoring/run stores signals, and a repeat run stores no duplicates', async () => {
    const first = await runMonitoring();
    expect(first).toMatchObject({
      trigger: 'MANUAL',
      status: 'COMPLETED',
      clientsChecked: 1,
      clientsSkipped: 0,
      signalsFound: 4,
      newSignalsSaved: 4,
      errors: [],
    });
    expect(typeof first.id).toBe('string');

    const second = await runMonitoring();
    expect(second.newSignalsSaved).toBe(0);

    const runs = (await http().get('/monitoring/runs').expect(200))
      .body as MonitoringRunListResponse;
    expect(runs.running).toBe(false);
    expect(runs.items.map((r) => r.id)).toEqual([second.id, first.id]);
    expect(first.checks.length).toBeGreaterThan(0);
    expect(first.checks[0]).toMatchObject({ error: null, sourceConnected: true });

    const progress = (await http().get('/monitoring/progress').expect(200))
      .body as MonitoringProgressResponse;
    expect(progress).toMatchObject({ running: false, progress: null });
    expect(progress.lastRun?.id).toBe(second.id);
  });

  it('POST /monitoring/run answers 202 at once and the run finishes in the background', async () => {
    const queued = (await http().post('/monitoring/run').expect(202)).body as MonitoringRunResponse;
    expect(queued).toMatchObject({ status: 'RUNNING', finishedAt: null, checks: [] });
    expect(queued.totalChecks).toBeGreaterThan(0);

    const queue = (await http().get('/monitoring/queue').expect(200)).body as JobQueueStatsResponse;
    expect(queue).toMatchObject({ driver: 'in-process', attempts: 3 });
    await http().get('/monitoring/runs/no-such-run').expect(404);

    // Let the queued run finish before the app closes.
    let run = queued;
    for (let i = 0; i < 200 && run.status === 'RUNNING'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      run = (await http().get(`/monitoring/runs/${queued.id}`).expect(200))
        .body as MonitoringRunResponse;
    }
    expect(run.status).toBe('COMPLETED');
    expect(run.checks).toHaveLength(run.totalChecks);
  });

  it('GET /signals lists stored signals by score then newest, with rank, filters and pagination', async () => {
    await runMonitoring();

    const page = (await http().get('/signals?pageSize=3').expect(200)).body as SignalPageResponse;
    expect(page).toMatchObject({ total: 4, page: 1, pageSize: 3 });
    expect(page.items).toHaveLength(3);
    const order = page.items.map((s) => [s.score, Date.parse(s.publishedAt)] as const);
    const sorted = [...order].sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    expect(order).toEqual(sorted);
    expect(page.items.map((s) => s.rank)).toEqual([1, 2, 3]);
    expect(page.items[0]?.reason.length).toBeGreaterThan(0);
    expect(page.items[0]?.clientName).toBe('Example Client');

    const second = (await http().get('/signals?pageSize=3&page=2').expect(200))
      .body as SignalPageResponse;
    expect(second.items[0]?.rank).toBe(4);

    const news = (await http().get('/signals?platform=GOOGLE_RSS').expect(200))
      .body as SignalPageResponse;
    expect(news.total).toBe(2);
    expect(news.items.every((s) => s.platform === 'GOOGLE_RSS')).toBe(true);

    await http().get('/signals?platform=MYSPACE').expect(400);
    await http().get('/signals?pageSize=1000').expect(400);
  });

  it('POST and DELETE /signals/:id/skip move a signal between the to-review and skipped lists', async () => {
    await runMonitoring();
    const before = (await http().get('/signals').expect(200)).body as SignalPageResponse;
    const id = before.items[0]?.id ?? '';

    await http()
      .post(`/signals/${encodeURIComponent(id)}/skip`)
      .expect(200);
    const toReview = (await http().get('/signals').expect(200)).body as SignalPageResponse;
    const skipped = (await http().get('/signals?view=skipped').expect(200))
      .body as SignalPageResponse;
    expect(toReview.total).toBe(before.total - 1);
    expect(skipped.items.map((s) => s.id)).toEqual([id]);
    expect(typeof skipped.items[0]?.skippedAt).toBe('string');

    await http()
      .delete(`/signals/${encodeURIComponent(id)}/skip`)
      .expect(200);
    expect(((await http().get('/signals').expect(200)).body as SignalPageResponse).total).toBe(
      before.total,
    );

    await http().post('/signals/no-such-signal/skip').expect(404);
  });

  it('POST and PUT /signals/:id/draft draft a message, keep edits, and list it with the signal', async () => {
    await runMonitoring();
    const id = ((await http().get('/signals').expect(200)).body as SignalPageResponse).items[0]?.id;
    const path = `/signals/${encodeURIComponent(id ?? '')}/draft`;

    const first = (await http().post(path).expect(200)).body as DraftResponse;
    expect(first).toMatchObject({ source: 'TEMPLATE', editedAt: null });
    expect(first.text).toContain('Hi Example Client team,');

    await http().put(path).send({ text: 'Edited message' }).expect(200);
    const again = (await http().post(path).expect(200)).body as DraftResponse;
    expect(again.text).toBe('Edited message');

    const listed = (await http().get('/signals').expect(200)).body as SignalPageResponse;
    expect(listed.items.find((s) => s.id === id)?.draft?.text).toBe('Edited message');

    await http().post('/signals/no-such-signal/draft').expect(404);
    await http().put(path).send({ text: '  ' }).expect(400);
  });

  it('POST /clients rejects invalid brands without changing anything', async () => {
    await http().post('/clients').send({ name: '', linkedInUrl: 'x' }).expect(400);
    await http()
      .post('/clients')
      .send({ name: 'Example', linkedInUrl: 'https://www.linkedin.com/in/a-person/' })
      .expect(400);
    await http().post('/clients').send({}).expect(400);
    await http().delete('/clients/no-such-brand').expect(404);
    expect(((await http().get('/clients').expect(200)).body as ClientResponse[]).length).toBe(1);
  });

  it('GET /signals/summary totals by platform and type', async () => {
    await runMonitoring();
    const summary = (await http().get('/signals/summary').expect(200))
      .body as SignalSummaryResponse;
    expect(summary.total).toBe(4);
    expect(summary.byPlatform).toEqual({ LINKEDIN: 2, GOOGLE_RSS: 2 });
  });

  it('GET /clients and GET /monitoring/sources describe what is monitored', async () => {
    const clients = (await http().get('/clients').expect(200)).body as ClientResponse[];
    expect(clients.map((c) => c.name)).toEqual(['Example Client']);

    const sources = (await http().get('/monitoring/sources').expect(200))
      .body as SourceStatusResponse[];
    expect(sources).toEqual([
      { platform: 'LINKEDIN', mode: 'demo', label: 'Demo data' },
      { platform: 'INSTAGRAM', mode: 'not_connected', label: 'Not connected' },
      { platform: 'TIKTOK', mode: 'not_connected', label: 'Not connected' },
      { platform: 'YOUTUBE', mode: 'not_connected', label: 'Not connected' },
      { platform: 'GOOGLE_RSS', mode: 'demo', label: 'Demo data' },
    ]);
  });
});
