// Wire types for the HTTP API. Rebuilt from how apps/api and apps/web use them.
// Every value is plain JSON: dates are ISO 8601 strings.

export type PlatformValue = 'LINKEDIN' | 'INSTAGRAM' | 'TIKTOK' | 'YOUTUBE' | 'GOOGLE_RSS';

export type SignalTypeValue =
  | 'PRODUCT_LAUNCH'
  | 'CAMPAIGN_LAUNCH'
  | 'CREATOR_CONTENT'
  | 'MARKET_EXPANSION'
  | 'SEASONAL'
  | 'EVENT_PARTNERSHIP'
  | 'JOB_CHANGE'
  | 'HIRING'
  | 'COMPANY_ANNOUNCEMENT'
  | 'NEW_POST'
  | 'OTHER';

export type ClientEligibilityValue =
  | 'MONITORED'
  | 'CAMPAIGN_RUNNING'
  | 'TOO_RECENT'
  | 'NEEDS_REVIEW_MISSING_END_DATE'
  | 'NOT_A_PAST_CLIENT';

export type SignalListViewValue = 'to_review' | 'skipped';

export type DraftSourceValue = 'TEMPLATE' | 'CLAUDE';

export type MonitoringTriggerValue = 'MANUAL' | 'SCHEDULED';

export interface HealthResponse {
  status: 'ok';
  version: string;
}

export interface MonitoringRunErrorResponse {
  clientId: string;
  platform: PlatformValue;
  message: string;
}

export type MonitoringRunStatusValue = 'RUNNING' | 'COMPLETED' | 'INTERRUPTED';

export interface MonitoringRunSummaryResponse {
  startedAt: string;
  /** Null while the run is going. */
  finishedAt: string | null;
  clientsChecked: number;
  clientsSkipped: number;
  /** Accounts left out of a full run because they were checked recently. */
  accountsUpToDate?: number;
  signalsFound: number;
  newSignalsSaved: number;
  signalsMissingSource: number;
  errors: MonitoringRunErrorResponse[];
  /** Every account checked, in order. */
  checks: MonitoringCheckResponse[];
  /** The brands asked for ("Check now"), or null for every brand. */
  clientIds: string[] | null;
}

/** One brand account checked during a run. */
export interface MonitoringCheckResponse {
  clientId: string;
  clientName: string;
  platform: PlatformValue;
  handle: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  signalsFound: number;
  newSignalsSaved: number;
  signalsMissingSource: number;
  /** False when no source is connected for the platform, so nothing was fetched. */
  sourceConnected: boolean;
  error: string | null;
  /** Tries it took; more than 1 means the job was retried. */
  attempts: number;
}

/** An account a worker is checking right now. */
export interface ActiveCheckResponse {
  clientId: string;
  clientName: string;
  platform: PlatformValue;
  startedAt: string;
  attempt: number;
}

/** GET /monitoring/queue: the account-check job queue. */
export interface JobQueueStatsResponse {
  /** "bullmq" (Redis) or "in-process". */
  driver: string;
  concurrency: number;
  attempts: number;
  waiting: number;
  active: number;
  /** Waiting to be retried. */
  delayed: number;
  completed: number;
  failed: number;
}

/** GET /monitoring/progress */
export interface MonitoringProgressResponse {
  running: boolean;
  /** Null when nothing is running. */
  progress: {
    startedAt: string;
    clientIds: string[] | null;
    totalChecks: number;
    doneChecks: number;
    /** 0 to 100. */
    percent: number;
    /** Average time of the checks done so far times the checks left; null until one is done. */
    estimatedRemainingMs: number | null;
    completed: MonitoringCheckResponse[];
    /** The account started most recently, if any. */
    current: ActiveCheckResponse | null;
    /** Every account being checked right now (several workers run at once). */
    active: ActiveCheckResponse[];
  } | null;
  /** The most recent finished run, to show the result when a run ends. */
  lastRun: MonitoringRunResponse | null;
}

export interface MonitoringRunResponse extends MonitoringRunSummaryResponse {
  id: string;
  trigger: MonitoringTriggerValue;
  status: MonitoringRunStatusValue;
  /** Accounts queued for this run. */
  totalChecks: number;
  active: ActiveCheckResponse[];
}

export interface MonitoringRunListResponse {
  items: MonitoringRunResponse[];
  running: boolean;
}

export interface SourceStatusResponse {
  platform: PlatformValue;
  mode: 'live' | 'demo' | 'not_connected';
  label: string;
}

export interface CampaignResponse {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  tags: string[];
}

export interface PublicProfileResponse {
  url: string;
  headline: string | null;
  location: string | null;
}

export interface ClientEligibilityResponse {
  status: ClientEligibilityValue;
  lastCampaignEndDate: string | null;
  daysSinceLastCampaign: number | null;
  waitingPeriodDays: number;
}

export interface ClientResponse {
  id: string;
  name: string;
  handles: Partial<Record<PlatformValue, string>>;
  lastActiveDate: string | null;
  lastCheckedAt: Partial<Record<PlatformValue, string>>;
  campaigns: CampaignResponse[];
  publicProfile: PublicProfileResponse | null;
  eligibility: ClientEligibilityResponse;
  /** When the brand was added in the app; null for brands added before this was recorded. */
  addedAt?: string | null;
  /** Order the brands were added in: 1 is the oldest, higher is newer. */
  addedOrder?: number;
}

export interface AddBrandRequest {
  name: string;
  linkedInUrl: string;
  website?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
}

/** Change an existing brand's accounts. Omitted fields are kept; empty text removes one. */
export interface UpdateBrandRequest {
  website?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  youtube?: string | null;
}

export interface DraftResponse {
  signalId: string;
  subject: string;
  text: string;
  recipient: string | null;
  source: DraftSourceValue;
  createdAt: string;
  editedAt: string | null;
  sentAt: string | null;
  /** MANUAL: the rep sent it from their mailbox. SENDGRID: emailed from the app. */
  sentVia: 'MANUAL' | 'SENDGRID' | null;
  /** The email conversation, oldest first (emails sent from the app, and replies). */
  thread: ThreadMessageResponse[];
}

/** One email in an outreach thread. */
export interface ThreadMessageResponse {
  /** Unique within the thread (the email's Message-ID). */
  id: string;
  /** OUTBOUND: emailed from the app. INBOUND: a reply received. */
  direction: 'OUTBOUND' | 'INBOUND';
  from: string;
  to: string;
  subject: string;
  text: string;
  at: string;
}

/** One email thread sent from the app, for the outreach overview. */
export interface OutreachThreadResponse {
  signalId: string;
  /** Null when the brand was removed. */
  clientName: string | null;
  /** Null when the post is no longer stored. */
  platform: PlatformValue | null;
  signalUrl: string | null;
  lastActivityAt: string;
  replies: number;
  /** The last message is a reply nobody has answered yet. */
  needsResponse: boolean;
  draft: DraftResponse;
}

export interface OutreachListResponse {
  items: OutreachThreadResponse[];
}

export interface FollowUpRequest {
  text: string;
}

/** Whether drafts can be emailed from the app (SendGrid set up), and the From address. */
export interface EmailStatusResponse {
  enabled: boolean;
  from: string | null;
  /** True when replies to app emails come back into the app (SendGrid Inbound Parse). */
  repliesInApp: boolean;
}

export interface DraftChangesRequest {
  text?: string;
  subject?: string;
  recipient?: string | null;
}

export type EngagementMetric = 'views' | 'likes' | 'comments' | 'shares' | 'saves';

/** Public counts captured when the post was collected (a snapshot, not live). */
export type EngagementResponse = Partial<Record<EngagementMetric, number>>;

export interface SignalResponse {
  id: string;
  clientId: string;
  clientName: string | null;
  platform: PlatformValue;
  signalType: SignalTypeValue;
  content: string;
  url: string;
  publishedAt: string;
  skippedAt: string | null;
  draft: DraftResponse | null;
  collectedAt: string;
  /** `null` when the source gives no counts (news, demo data). */
  engagement: EngagementResponse | null;
  /** Position in the list across all pages, 1 = most relevant. */
  rank: number;
  /** 0 to 100 (story 9a). */
  score: number;
  priority: SignalPriorityValue;
  /** One-line reason (story 9b). */
  reason: string;
  /** Every factor that added or removed points. */
  scoreFactors: ScoreFactorResponse[];
}

export type SignalPriorityValue = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ScoreFactorResponse {
  label: string;
  points: number;
  /** The word found in the post, or `null` for platform flags. */
  evidence: string | null;
}

export interface SignalPageResponse {
  total: number;
  page: number;
  pageSize: number;
  items: SignalResponse[];
}

export interface SignalSummaryResponse {
  total: number;
  byPlatform: Partial<Record<PlatformValue, number>>;
  bySignalType: Partial<Record<SignalTypeValue, number>>;
  latestPublishedAt: string | null;
  /** Signals scoring below this are hidden (testing setting); 0 means all are shown. */
  minScore: number;
  /** Only posts from the last this-many days are collected and shown; 0 means no limit. */
  maxAgeDays: number;
}

export interface SkipSignalResponse {
  id: string;
  skippedAt: string | null;
}
