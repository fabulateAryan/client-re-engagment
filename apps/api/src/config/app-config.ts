import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';

/** Repository root. src/config and dist/config sit at the same depth. */
export const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

const sourceMode = z.enum(['demo', 'monid']).default('demo');

/** Optional string where an empty value (e.g. `KEY=` in an env file) means "not set". */
const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CORS_ORIGIN: z.url().default('http://localhost:3000'),

  /**
   * Clients to monitor, as JSON (see clients.local.example.json). Git-ignored by default so
   * real client names never reach the repository. When the file is missing, one invented
   * demo client is used.
   */
  CLIENTS_FILE: z.string().trim().min(1).default('clients.local.json'),

  /** 'demo' uses invented data; 'monid' uses Monid (needs the matching MONID_* values). */
  LINKEDIN_SOURCE: sourceMode,
  NEWS_SOURCE: sourceMode,
  INSTAGRAM_SOURCE: sourceMode,
  TIKTOK_SOURCE: sourceMode,
  YOUTUBE_SOURCE: sourceMode,

  /**
   * Who drafts engagement messages. 'template' (default) never sends data anywhere.
   * 'claude' sends the brand name and post text to Anthropic; credentials come from
   * ANTHROPIC_API_KEY or an `ant auth login` profile.
   */
  MESSAGE_DRAFTER: z.enum(['template', 'claude']).default('template'),

  /**
   * SendGrid, for the "Send" button on a draft. Unset: the app never sends email and reps
   * send from their own mailbox. The From address must be a verified sender in SendGrid,
   * or on a domain authenticated there.
   */
  SENDGRID_API_KEY: optionalString,
  SENDGRID_FROM_EMAIL: optionalString,
  SENDGRID_FROM_NAME: z.string().trim().min(1).default('Fabulate'),
  /** Where replies go. Unset: replies go to SENDGRID_FROM_EMAIL. */
  SENDGRID_REPLY_TO: optionalString,
  /** "true": SendGrid accepts the request but delivers nothing (testing). */
  SENDGRID_SANDBOX: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /**
   * Replies in the app: a (sub)domain whose MX record points at mx.sendgrid.net and is set up
   * in SendGrid > Settings > Inbound Parse. Each thread's Reply-To becomes
   * reply+<token>@<this domain>, and SendGrid posts replies to /inbound/sendgrid?key=...
   */
  SENDGRID_INBOUND_DOMAIN: optionalString,
  /** Secret in the Inbound Parse URL, so only SendGrid can post replies. 24+ characters. */
  SENDGRID_INBOUND_KEY: optionalString,

  /**
   * Gmail, for the "Send" button and for replies in the app. When all four are set, Gmail is
   * used instead of SendGrid. Get GMAIL_REFRESH_TOKEN (and GMAIL_FROM_EMAIL) with
   * `pnpm --filter @signal-monitoring/api gmail:auth`. Replies come back by plus addressing
   * (<mailbox>+<token>@gmail.com) and are read from the inbox every GMAIL_POLL_SECONDS.
   */
  GMAIL_CLIENT_ID: optionalString,
  GMAIL_CLIENT_SECRET: optionalString,
  GMAIL_REFRESH_TOKEN: optionalString,
  GMAIL_FROM_EMAIL: optionalString,
  GMAIL_FROM_NAME: z.string().trim().min(1).default('Fabulate'),
  GMAIL_POLL_SECONDS: z.coerce.number().int().min(10).default(15),

  MONID_API_KEY: optionalString,
  /** Documented base URL: https://monid.ai/docs/api/overview */
  MONID_BASE_URL: z.url().default('https://api.monid.ai'),
  /** Endpoints chosen with `pnpm monid discover`, e.g. provider "apify", endpoint "/owner/actor". */
  MONID_LINKEDIN_PROVIDER: optionalString,
  MONID_LINKEDIN_ENDPOINT: optionalString,
  MONID_NEWS_PROVIDER: optionalString,
  MONID_NEWS_ENDPOINT: optionalString,
  MONID_INSTAGRAM_PROVIDER: optionalString,
  MONID_INSTAGRAM_ENDPOINT: optionalString,
  MONID_TIKTOK_PROVIDER: optionalString,
  MONID_TIKTOK_ENDPOINT: optionalString,
  MONID_YOUTUBE_PROVIDER: optionalString,
  MONID_YOUTUBE_ENDPOINT: optionalString,
  // Tuning knobs, not Monid-published limits. Review before production.
  MONID_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  MONID_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  MONID_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1_000),
  /**
   * Polling an async run starts at MONID_FIRST_POLL_MS and slows down by 1.5 times each poll,
   * up to MONID_POLL_INTERVAL_MS. (The Monid docs example polls every 5 seconds; a fixed
   * 5 seconds added up to 5 seconds of waiting to every account check.)
   */
  /**
   * Testing only: keep at most this many newest posts per account per check, and ask Monid
   * for no more where the endpoint has a limit. Leave unset in production (no limit).
   */
  MONID_MAX_POSTS_PER_ACCOUNT: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),
  /**
   * Testing only: show only signals scoring at least this (50 = Medium and High). Lower ones
   * are still stored, just hidden. Leave unset in production (0, show everything).
   */
  SIGNALS_MIN_SCORE: z.coerce.number().int().min(0).max(100).default(0),
  /**
   * Only posts from the last this-many days are collected and shown (0 = no limit). A first
   * check of an account collects this much history; later checks only what is new.
   */
  MONITORING_LOOKBACK_DAYS: z.coerce.number().int().min(0).max(3650).default(90),
  /**
   * "Run monitoring" skips accounts checked less than this many minutes ago, so clicking it
   * again soon after is quick. "Check now" on a brand always checks. 0 = never skip.
   */
  MONITORING_RECHECK_AFTER_MINUTES: z.coerce.number().int().min(0).max(10_080).default(60),
  /**
   * Clerk secret key (Clerk dashboard > API keys). When set, every API request except
   * GET /health needs a valid signed-in Clerk session token. Unset: the API is open (dev, tests).
   */
  CLERK_SECRET_KEY: optionalString,
  /** Origins allowed to have issued the session token (comma-separated). Defaults to CORS_ORIGIN. */
  CLERK_AUTHORIZED_PARTIES: optionalString,
  MONID_FIRST_POLL_MS: z.coerce.number().int().positive().default(500),
  MONID_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2_000),
  /** The Monid docs say most runs complete within 1 to 120 seconds. */
  MONID_RUN_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),

  // Job queue. With REDIS_URL, runs use BullMQ on Redis; without it, an in-process queue.
  REDIS_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string()
      .trim()
      .regex(/^rediss?:\/\//, 'must start with redis:// or rediss://')
      .optional(),
  ),
  /** Keeps this app's Redis keys apart from anything else in the same Redis. */
  REDIS_PREFIX: z.string().trim().min(1).default('signal-monitor'),
  /** Accounts checked at the same time. */
  /** 5 means every account of one brand (up to 5) is checked at once on "Check now". */
  MONITORING_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  /** Tries per account, including the first. */
  MONITORING_JOB_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  /** Wait before the first retry; doubles each time. */
  MONITORING_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(5_000),
  /** Most checks started per minute (BullMQ only). Empty means no limit. */
  MONITORING_MAX_CHECKS_PER_MINUTE: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),
  /** Cron pattern for automatic runs, Sydney time, e.g. "0 8 * * 1-5" (needs REDIS_URL). */
  MONITORING_SCHEDULE_CRON: optionalString,
});

type Env = z.infer<typeof envSchema>;
export type SourceMode = 'demo' | 'monid';
export type MessageDrafter = 'template' | 'claude';

export interface MonidEndpointSetting {
  readonly provider: string;
  readonly endpoint: string;
}

export interface MonidSettings {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly linkedIn: MonidEndpointSetting | null;
  readonly news: MonidEndpointSetting | null;
  readonly instagram: MonidEndpointSetting | null;
  readonly tiktok: MonidEndpointSetting | null;
  readonly youtube: MonidEndpointSetting | null;
  readonly requestTimeoutMs: number;
  readonly maxRetries: number;
  readonly retryBaseDelayMs: number;
  readonly pollIntervalMs: number;
  /** Optional for callers that build settings by hand; missing means a fixed interval. */
  readonly firstPollMs?: number;
  readonly runTimeoutMs: number;
  /** Testing: newest posts kept per account per check. Missing or null means no limit. */
  readonly maxPostsPerAccount?: number | null;
}

/** The account-check job queue. */
export interface JobQueueConfig {
  /** Null runs the in-process queue instead of BullMQ. */
  readonly redisUrl: string | null;
  readonly redisPrefix: string;
  readonly concurrency: number;
  readonly attempts: number;
  readonly retryDelayMs: number;
  readonly maxChecksPerMinute: number | null;
  /** Null means no automatic runs. */
  readonly scheduleCron: string | null;
}

export const DEFAULT_JOB_QUEUE: JobQueueConfig = {
  redisUrl: null,
  redisPrefix: 'signal-monitor',
  concurrency: 5,
  attempts: 3,
  retryDelayMs: 5_000,
  maxChecksPerMinute: null,
  scheduleCron: null,
};

/** Sign-in checks on the API. Null when CLERK_SECRET_KEY is not set (API open). */
export interface ClerkConfig {
  readonly secretKey: string;
  /** Front-end origins whose session tokens are accepted. */
  readonly authorizedParties: readonly string[];
}

export interface AppConfigValues {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly port: number;
  readonly corsOrigin: string;
  readonly version: string;
  /** Absolute path of the clients JSON file (it may not exist). */
  readonly clientsFile: string;
  readonly linkedInSource: SourceMode;
  readonly newsSource: SourceMode;
  /** Optional so existing callers keep working; missing means demo. */
  readonly instagramSource?: SourceMode;
  readonly tiktokSource?: SourceMode;
  readonly youtubeSource?: SourceMode;
  readonly messageDrafter: MessageDrafter;
  /** `null` when MONID_API_KEY is not set. */
  readonly monid: MonidSettings | null;
  /** Optional so existing callers keep working; missing means the in-process defaults. */
  readonly jobQueue?: JobQueueConfig;
  /** Signals scoring below this are hidden (testing). Missing means 0, show everything. */
  readonly signalsMinScore?: number;
  /** Missing or null: the API does not check sign-in. */
  readonly clerk?: ClerkConfig | null;
  /** Posts older than this many days are not collected or shown. Missing or 0: no limit. */
  readonly lookbackDays?: number;
  /** Full runs skip accounts checked within this many minutes. Missing or 0: never skip. */
  readonly recheckAfterMinutes?: number;
  /** Missing or null: the app does not send email. */
  readonly sendGrid?: SendGridConfig | null;
  /** Missing or null: Gmail is not used. Wins over SendGrid when set. */
  readonly gmail?: GmailConfig | null;
}

/** Email sending and replies through a Gmail mailbox (Gmail API, OAuth refresh token). */
export interface GmailConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly fromEmail: string;
  readonly fromName: string;
  readonly pollIntervalMs: number;
}

/** Email sending through SendGrid. */
export interface SendGridConfig {
  readonly apiKey: string;
  readonly fromEmail: string;
  readonly fromName: string;
  readonly replyTo: string | null;
  readonly sandbox: boolean;
  /** Null: replies go to the normal mailbox and are not shown in the app. */
  readonly inboundDomain?: string | null;
  /** Secret the Inbound Parse webhook URL must carry. Set whenever `inboundDomain` is. */
  readonly inboundKey?: string | null;
}

/** Validated runtime configuration. Also used as the Nest injection token. */
export class AppConfig implements AppConfigValues {
  readonly nodeEnv: AppConfigValues['nodeEnv'];
  readonly port: number;
  readonly corsOrigin: string;
  readonly version: string;
  readonly clientsFile: string;
  readonly linkedInSource: SourceMode;
  readonly newsSource: SourceMode;
  readonly instagramSource: SourceMode;
  readonly tiktokSource: SourceMode;
  readonly youtubeSource: SourceMode;
  readonly messageDrafter: MessageDrafter;
  readonly monid: MonidSettings | null;
  readonly jobQueue: JobQueueConfig;
  readonly signalsMinScore: number;
  readonly clerk: ClerkConfig | null;
  readonly lookbackDays: number;
  readonly recheckAfterMinutes: number;
  readonly sendGrid: SendGridConfig | null;
  readonly gmail: GmailConfig | null;

  constructor(values: AppConfigValues) {
    this.nodeEnv = values.nodeEnv;
    this.port = values.port;
    this.corsOrigin = values.corsOrigin;
    this.version = values.version;
    this.clientsFile = values.clientsFile;
    this.linkedInSource = values.linkedInSource;
    this.newsSource = values.newsSource;
    this.instagramSource = values.instagramSource ?? 'demo';
    this.tiktokSource = values.tiktokSource ?? 'demo';
    this.youtubeSource = values.youtubeSource ?? 'demo';
    this.messageDrafter = values.messageDrafter;
    this.monid = values.monid;
    this.jobQueue = values.jobQueue ?? DEFAULT_JOB_QUEUE;
    this.signalsMinScore = values.signalsMinScore ?? 0;
    this.clerk = values.clerk ?? null;
    this.lookbackDays = values.lookbackDays ?? 0;
    this.recheckAfterMinutes = values.recheckAfterMinutes ?? 0;
    this.sendGrid = values.sendGrid ?? null;
    this.gmail = values.gmail ?? null;
  }
}

export class InvalidConfigError extends Error {
  constructor(issues: readonly string[]) {
    super(`Invalid environment configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'InvalidConfigError';
  }
}

/**
 * Validate environment variables. Throws InvalidConfigError listing every problem,
 * so the API refuses to start with a bad configuration.
 */
export function loadAppConfig(
  env: NodeJS.ProcessEnv,
  version: string = readPackageVersion(),
): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new InvalidConfigError(issues);
  }
  const values = parsed.data;
  const issues = monidIssues(values);
  if (issues.length > 0) throw new InvalidConfigError(issues);
  return new AppConfig({
    nodeEnv: values.NODE_ENV,
    port: values.API_PORT,
    corsOrigin: values.CORS_ORIGIN,
    version,
    clientsFile: isAbsolute(values.CLIENTS_FILE)
      ? values.CLIENTS_FILE
      : join(REPO_ROOT, values.CLIENTS_FILE),
    linkedInSource: values.LINKEDIN_SOURCE,
    newsSource: values.NEWS_SOURCE,
    instagramSource: values.INSTAGRAM_SOURCE,
    tiktokSource: values.TIKTOK_SOURCE,
    youtubeSource: values.YOUTUBE_SOURCE,
    messageDrafter: values.MESSAGE_DRAFTER,
    monid: monidSettings(values),
    signalsMinScore: values.SIGNALS_MIN_SCORE,
    lookbackDays: values.MONITORING_LOOKBACK_DAYS,
    recheckAfterMinutes: values.MONITORING_RECHECK_AFTER_MINUTES,
    sendGrid:
      values.SENDGRID_API_KEY === undefined || values.SENDGRID_FROM_EMAIL === undefined
        ? null
        : {
            apiKey: values.SENDGRID_API_KEY,
            fromEmail: values.SENDGRID_FROM_EMAIL,
            fromName: values.SENDGRID_FROM_NAME,
            replyTo: values.SENDGRID_REPLY_TO ?? null,
            sandbox: values.SENDGRID_SANDBOX,
            inboundDomain: values.SENDGRID_INBOUND_DOMAIN?.toLowerCase() ?? null,
            inboundKey: values.SENDGRID_INBOUND_KEY ?? null,
          },
    gmail:
      values.GMAIL_CLIENT_ID === undefined ||
      values.GMAIL_CLIENT_SECRET === undefined ||
      values.GMAIL_REFRESH_TOKEN === undefined ||
      values.GMAIL_FROM_EMAIL === undefined
        ? null
        : {
            clientId: values.GMAIL_CLIENT_ID,
            clientSecret: values.GMAIL_CLIENT_SECRET,
            refreshToken: values.GMAIL_REFRESH_TOKEN,
            fromEmail: values.GMAIL_FROM_EMAIL.toLowerCase(),
            fromName: values.GMAIL_FROM_NAME,
            pollIntervalMs: values.GMAIL_POLL_SECONDS * 1000,
          },
    clerk:
      values.CLERK_SECRET_KEY === undefined
        ? null
        : {
            secretKey: values.CLERK_SECRET_KEY,
            authorizedParties: (values.CLERK_AUTHORIZED_PARTIES ?? values.CORS_ORIGIN)
              .split(',')
              .map((origin) => origin.trim().replace(/\/+$/, ''))
              .filter((origin) => origin !== ''),
          },
    jobQueue: {
      redisUrl: values.REDIS_URL ?? null,
      redisPrefix: values.REDIS_PREFIX,
      concurrency: values.MONITORING_CONCURRENCY,
      attempts: values.MONITORING_JOB_ATTEMPTS,
      retryDelayMs: values.MONITORING_RETRY_DELAY_MS,
      maxChecksPerMinute: values.MONITORING_MAX_CHECKS_PER_MINUTE ?? null,
      scheduleCron: values.MONITORING_SCHEDULE_CRON ?? null,
    },
  });
}

function monidIssues(env: Env): string[] {
  const issues: string[] = [];
  if (new URL(env.MONID_BASE_URL).hostname === 'app.monid.ai') {
    issues.push(
      'MONID_BASE_URL: app.monid.ai is the dashboard website; the API is https://api.monid.ai',
    );
  }
  const require = (mode: SourceMode, sourceVar: string, keys: (keyof Env)[]): void => {
    if (mode !== 'monid') return;
    for (const key of ['MONID_API_KEY' as const, ...keys]) {
      if (env[key] === undefined) issues.push(`${key}: required when ${sourceVar}=monid`);
    }
  };
  require(env.LINKEDIN_SOURCE, 'LINKEDIN_SOURCE', [
    'MONID_LINKEDIN_PROVIDER',
    'MONID_LINKEDIN_ENDPOINT',
  ]);
  require(env.NEWS_SOURCE, 'NEWS_SOURCE', ['MONID_NEWS_PROVIDER', 'MONID_NEWS_ENDPOINT']);
  require(env.INSTAGRAM_SOURCE, 'INSTAGRAM_SOURCE', [
    'MONID_INSTAGRAM_PROVIDER',
    'MONID_INSTAGRAM_ENDPOINT',
  ]);
  require(env.TIKTOK_SOURCE, 'TIKTOK_SOURCE', ['MONID_TIKTOK_PROVIDER', 'MONID_TIKTOK_ENDPOINT']);
  require(env.YOUTUBE_SOURCE, 'YOUTUBE_SOURCE', [
    'MONID_YOUTUBE_PROVIDER',
    'MONID_YOUTUBE_ENDPOINT',
  ]);
  if (env.SENDGRID_API_KEY !== undefined && env.SENDGRID_FROM_EMAIL === undefined) {
    issues.push('SENDGRID_FROM_EMAIL: required when SENDGRID_API_KEY is set');
  }
  const emailLike = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
  for (const key of ['SENDGRID_FROM_EMAIL', 'SENDGRID_REPLY_TO'] as const) {
    const value = env[key];
    if (value !== undefined && !emailLike.test(value)) {
      issues.push(`${key}: must be one email address, like sales@example.com`);
    }
  }
  if (env.SENDGRID_INBOUND_DOMAIN !== undefined) {
    if (!/^(?=.{1,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i.test(env.SENDGRID_INBOUND_DOMAIN)) {
      issues.push('SENDGRID_INBOUND_DOMAIN: use a domain name, like replies.example.com');
    }
    if (env.SENDGRID_INBOUND_KEY === undefined || env.SENDGRID_INBOUND_KEY.length < 24) {
      issues.push(
        'SENDGRID_INBOUND_KEY: required (24+ random characters) when SENDGRID_INBOUND_DOMAIN is set',
      );
    }
  }
  if (env.MONITORING_SCHEDULE_CRON !== undefined) {
    if (env.REDIS_URL === undefined) {
      issues.push('MONITORING_SCHEDULE_CRON: needs REDIS_URL (schedules run on BullMQ)');
    }
    const fields = env.MONITORING_SCHEDULE_CRON.split(/\s+/).length;
    if (fields < 5 || fields > 6) {
      issues.push('MONITORING_SCHEDULE_CRON: use a cron pattern with 5 fields, e.g. "0 8 * * 1-5"');
    }
  }
  return [...new Set(issues)];
}

function endpointSetting(
  provider: string | undefined,
  endpoint: string | undefined,
): MonidEndpointSetting | null {
  return provider === undefined || endpoint === undefined ? null : { provider, endpoint };
}

function monidSettings(env: Env): MonidSettings | null {
  if (env.MONID_API_KEY === undefined) return null;
  return {
    apiKey: env.MONID_API_KEY,
    baseUrl: env.MONID_BASE_URL,
    linkedIn: endpointSetting(env.MONID_LINKEDIN_PROVIDER, env.MONID_LINKEDIN_ENDPOINT),
    news: endpointSetting(env.MONID_NEWS_PROVIDER, env.MONID_NEWS_ENDPOINT),
    instagram: endpointSetting(env.MONID_INSTAGRAM_PROVIDER, env.MONID_INSTAGRAM_ENDPOINT),
    tiktok: endpointSetting(env.MONID_TIKTOK_PROVIDER, env.MONID_TIKTOK_ENDPOINT),
    youtube: endpointSetting(env.MONID_YOUTUBE_PROVIDER, env.MONID_YOUTUBE_ENDPOINT),
    requestTimeoutMs: env.MONID_REQUEST_TIMEOUT_MS,
    maxRetries: env.MONID_MAX_RETRIES,
    retryBaseDelayMs: env.MONID_RETRY_BASE_DELAY_MS,
    pollIntervalMs: env.MONID_POLL_INTERVAL_MS,
    firstPollMs: env.MONID_FIRST_POLL_MS,
    maxPostsPerAccount: env.MONID_MAX_POSTS_PER_ACCOUNT ?? null,
    runTimeoutMs: env.MONID_RUN_TIMEOUT_MS,
  };
}

/** Version from apps/api/package.json. */
export function readPackageVersion(): string {
  const packageJsonPath = join(__dirname, '..', '..', 'package.json');
  const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const version = z.object({ version: z.string() }).parse(parsed).version;
  return version;
}
