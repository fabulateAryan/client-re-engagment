import type {
  ActiveCheckResponse,
  CampaignResponse,
  ClientEligibilityValue,
  ClientResponse,
  DraftResponse,
  EngagementMetric,
  EngagementResponse,
  JobQueueStatsResponse,
  MonitoringCheckResponse,
  MonitoringProgressResponse,
  MonitoringRunResponse,
  MonitoringRunStatusValue,
  PlatformValue,
  SignalPageResponse,
  SignalSummaryResponse,
  SignalTypeValue,
} from '@signal-monitoring/shared';
import type { ClientView, SignalView } from '../../../core/application';
import { scoreSignal, summariseRun } from '../../../core/domain';
import type {
  ActiveCheck,
  Campaign,
  ClientEligibility,
  EngagementDraft,
  JsonObject,
  MonitoringCheck,
  MonitoringRun,
  MonitoringRunStatus,
  Platform,
  SignalType,
} from '../../../core/domain';
import type { JobQueueStats, Page, SignalSummary } from '../../../core/ports';

/** Compile-time checks that shared wire unions and domain enums list the same values. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const platformsMatch: Same<`${Platform}`, PlatformValue> = true;
const signalTypesMatch: Same<`${SignalType}`, SignalTypeValue> = true;
void platformsMatch;
void signalTypesMatch;
const eligibilityMatch: Same<`${ClientEligibility}`, ClientEligibilityValue> = true;
void eligibilityMatch;
const runStatusMatch: Same<`${MonitoringRunStatus}`, MonitoringRunStatusValue> = true;
void runStatusMatch;

const durationMs = (from: Date, to: Date): number => Math.max(0, to.getTime() - from.getTime());

export function toMonitoringCheckResponse(check: MonitoringCheck): MonitoringCheckResponse {
  return {
    clientId: check.clientId,
    clientName: check.clientName,
    platform: check.platform,
    handle: check.handle,
    startedAt: check.startedAt.toISOString(),
    finishedAt: check.finishedAt.toISOString(),
    durationMs: durationMs(check.startedAt, check.finishedAt),
    signalsFound: check.signalsFound,
    newSignalsSaved: check.newSignalsSaved,
    signalsMissingSource: check.signalsMissingSource,
    sourceConnected: check.sourceConnected,
    error: check.error,
    attempts: check.attempts,
  };
}

export function toActiveCheckResponse(check: ActiveCheck): ActiveCheckResponse {
  return {
    clientId: check.clientId,
    clientName: check.clientName,
    platform: check.platform,
    startedAt: check.startedAt.toISOString(),
    attempt: check.attempt,
  };
}

export function toMonitoringRunResponse(run: MonitoringRun): MonitoringRunResponse {
  const totals = summariseRun(run);
  return {
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    clientsChecked: run.clientsChecked,
    clientsSkipped: run.clientsSkipped,
    accountsUpToDate: run.accountsUpToDate,
    totalChecks: run.totalChecks,
    signalsFound: totals.signalsFound,
    newSignalsSaved: totals.newSignalsSaved,
    signalsMissingSource: totals.signalsMissingSource,
    errors: totals.errors.map((error) => ({
      clientId: error.clientId,
      platform: error.platform,
      message: error.message,
    })),
    checks: run.checks.map(toMonitoringCheckResponse),
    active: run.active.map(toActiveCheckResponse),
    clientIds: run.clientIds === null ? null : [...run.clientIds],
  };
}

export function toMonitoringProgressResponse(
  current: MonitoringRun | null,
  last: MonitoringRun | null,
): MonitoringProgressResponse {
  const lastRun = last === null ? null : toMonitoringRunResponse(last);
  if (current === null) return { running: false, progress: null, lastRun };

  const done = current.checks.length;
  const total = current.totalChecks;
  const spentMs = current.checks.reduce((sum, c) => sum + durationMs(c.startedAt, c.finishedAt), 0);
  // Several accounts are checked at once, so time left is shared between the workers.
  const workers = Math.max(1, current.active.length);
  const active = [...current.active]
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .map(toActiveCheckResponse);
  return {
    running: true,
    progress: {
      startedAt: current.startedAt.toISOString(),
      clientIds: current.clientIds === null ? null : [...current.clientIds],
      totalChecks: total,
      doneChecks: done,
      percent: total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100)),
      estimatedRemainingMs:
        done === 0 ? null : Math.round(((spentMs / done) * Math.max(0, total - done)) / workers),
      completed: current.checks.map(toMonitoringCheckResponse),
      current: active[0] ?? null,
      active,
    },
    lastRun,
  };
}

export function toJobQueueStatsResponse(stats: JobQueueStats): JobQueueStatsResponse {
  return { ...stats };
}

export function toClientResponse({
  client,
  campaigns,
  eligibility,
  addedOrder,
}: ClientView): ClientResponse {
  const lastCheckedAt: Partial<Record<PlatformValue, string>> = {};
  for (const [platform, date] of Object.entries(client.lastCheckedAt) as [Platform, Date][]) {
    lastCheckedAt[platform] = date.toISOString();
  }
  return {
    id: client.id,
    name: client.name,
    handles: { ...client.socialHandles },
    lastActiveDate: client.lastActiveDate?.toISOString() ?? null,
    lastCheckedAt,
    campaigns: campaigns.map(toCampaignResponse),
    publicProfile: client.publicProfile == null ? null : { ...client.publicProfile },
    addedAt: client.addedAt?.toISOString() ?? null,
    addedOrder,
    eligibility: {
      status: eligibility.status,
      lastCampaignEndDate: eligibility.lastCampaignEndDate?.toISOString() ?? null,
      daysSinceLastCampaign: eligibility.daysSinceLastCampaign,
      waitingPeriodDays: eligibility.waitingPeriodDays,
    },
  };
}

function toCampaignResponse(campaign: Campaign): CampaignResponse {
  return {
    id: campaign.id,
    name: campaign.name,
    startDate: campaign.startDate?.toISOString() ?? null,
    endDate: campaign.endDate?.toISOString() ?? null,
    tags: [...campaign.tags],
  };
}

export function toSignalPageResponse(page: Page<SignalView>): SignalPageResponse {
  return {
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    items: page.items.map(({ signal, clientName, draft }, index) => {
      const scored = scoreSignal(signal);
      return {
        id: signal.id,
        clientId: signal.clientId,
        clientName,
        platform: signal.platform,
        signalType: signal.signalType,
        content: signal.content,
        url: signal.url,
        publishedAt: signal.publishedAt.toISOString(),
        skippedAt: signal.skippedAt?.toISOString() ?? null,
        draft: draft === null ? null : toDraftResponse(draft),
        collectedAt: signal.collectedAt.toISOString(),
        engagement: toEngagementResponse(signal.raw),
        rank: (page.page - 1) * page.pageSize + index + 1,
        score: scored.score,
        priority: scored.priority,
        reason: scored.reason,
        scoreFactors: scored.factors.map((f) => ({ ...f })),
      };
    }),
  };
}

const ENGAGEMENT_METRICS: readonly EngagementMetric[] = [
  'views',
  'likes',
  'comments',
  'shares',
  'saves',
];

/** The counts the Monid profiles keep in `raw.engagement`, or `null` when there are none. */
export function toEngagementResponse(raw: JsonObject): EngagementResponse | null {
  const engagement = raw.engagement;
  if (engagement === null || typeof engagement !== 'object' || Array.isArray(engagement)) {
    return null;
  }
  const counts: EngagementResponse = {};
  for (const metric of ENGAGEMENT_METRICS) {
    const value = engagement[metric];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) counts[metric] = value;
  }
  return Object.keys(counts).length > 0 ? counts : null;
}

export function toSignalSummaryResponse(summary: SignalSummary): SignalSummaryResponse {
  return {
    total: summary.total,
    byPlatform: { ...summary.byPlatform },
    bySignalType: { ...summary.bySignalType },
    latestPublishedAt: summary.latestPublishedAt?.toISOString() ?? null,
    minScore: summary.minScore,
    maxAgeDays: summary.maxAgeDays,
  };
}

export function toDraftResponse(draft: EngagementDraft): DraftResponse {
  return {
    signalId: draft.signalId,
    subject: draft.subject,
    text: draft.text,
    recipient: draft.recipient,
    source: draft.source,
    createdAt: draft.createdAt.toISOString(),
    editedAt: draft.editedAt?.toISOString() ?? null,
    sentAt: draft.sentAt?.toISOString() ?? null,
    sentVia: draft.sentVia ?? null,
    thread: (draft.thread ?? []).map((m) => ({
      id: m.messageId,
      direction: m.direction,
      from: m.from,
      to: m.to,
      subject: m.subject,
      text: m.text,
      at: m.at.toISOString(),
    })),
  };
}
