import type { SignalResponse } from '@signal-monitoring/shared';

/**
 * The manager's overview, worked out from signals the app already stores: one best signal per
 * brand, which brands to hold off, and what the team did this week. No rep or outcome data
 * exists yet, so nothing here guesses at it.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Don't suggest a new message to a brand contacted this recently (matches the API's 15-day gap). */
export const HOLD_AFTER_CONTACT_DAYS = 15;
/** An untouched high-priority signal older than this is flagged as waiting too long. */
export const WAITING_TOO_LONG_HOURS = 48;
/** "This week" for the team's activity. */
export const ACTIVITY_WINDOW_DAYS = 7;

export type BrandStatus = 'not_started' | 'draft_ready';
export type HoldReason = 'contacted_recently' | 'weak_signal';

export interface BrandPlan {
  clientId: string;
  clientName: string;
  /** The strongest signal for this brand: the one to act on. */
  best: SignalResponse;
  /** How many other signals this brand has (context for the same message). */
  otherSignals: number;
  status: BrandStatus;
  /** True when the best signal is high priority, untouched, and found over 48 hours ago. */
  waitingTooLong: boolean;
}

export interface HeldBrand {
  clientId: string;
  clientName: string;
  best: SignalResponse;
  reason: HoldReason;
  /** When the last message was sent, for `contacted_recently`. */
  lastContactedAt: string | null;
}

export interface TeamActivity {
  sent: number;
  skipped: number;
  /** Drafts written but not yet marked sent (any age). */
  draftsWaiting: number;
}

export interface ManagerView {
  contactToday: BrandPlan[];
  holdOff: HeldBrand[];
  highWaiting: number;
  highWaitingTooLong: number;
  activity: TeamActivity;
}

function olderThan(iso: string, ms: number, now: number): boolean {
  return now - new Date(iso).getTime() > ms;
}

function within(iso: string | null | undefined, ms: number, now: number): boolean {
  return iso !== null && iso !== undefined && now - new Date(iso).getTime() <= ms;
}

/**
 * `toReview` must be ranked best first (as the API returns it), so the first signal seen for a
 * brand is its best one.
 */
export function buildManagerView(
  toReview: SignalResponse[],
  skipped: SignalResponse[],
  now: number,
): ManagerView {
  const byBrand = new Map<string, SignalResponse[]>();
  for (const signal of toReview) {
    const list = byBrand.get(signal.clientId);
    if (list === undefined) byBrand.set(signal.clientId, [signal]);
    else list.push(signal);
  }

  const contactToday: BrandPlan[] = [];
  const holdOff: HeldBrand[] = [];

  for (const [clientId, signals] of byBrand) {
    const clientName = signals[0]?.clientName ?? 'Unknown brand';
    const lastSent = signals
      .map((s) => s.draft?.sentAt ?? null)
      .filter((at): at is string => at !== null)
      .sort()
      .at(-1);
    // Signals already answered by a sent message are done; the rest are still open.
    const open = signals.filter((s) => s.draft?.sentAt == null);
    const best = open[0];
    if (best === undefined) continue;

    if (within(lastSent, HOLD_AFTER_CONTACT_DAYS * DAY_MS, now)) {
      holdOff.push({
        clientId,
        clientName,
        best,
        reason: 'contacted_recently',
        lastContactedAt: lastSent ?? null,
      });
      continue;
    }
    if (best.priority === 'LOW') {
      holdOff.push({ clientId, clientName, best, reason: 'weak_signal', lastContactedAt: null });
      continue;
    }

    const status: BrandStatus = best.draft === null ? 'not_started' : 'draft_ready';
    contactToday.push({
      clientId,
      clientName,
      best,
      otherSignals: open.length - 1,
      status,
      waitingTooLong:
        best.priority === 'HIGH' &&
        status === 'not_started' &&
        olderThan(best.collectedAt, WAITING_TOO_LONG_HOURS * 60 * 60 * 1000, now),
    });
  }

  const week = ACTIVITY_WINDOW_DAYS * DAY_MS;
  const highUntouched = contactToday.filter(
    (b) => b.best.priority === 'HIGH' && b.status === 'not_started',
  );

  return {
    contactToday,
    holdOff,
    highWaiting: highUntouched.length,
    highWaitingTooLong: highUntouched.filter((b) => b.waitingTooLong).length,
    activity: {
      sent: toReview.filter((s) => within(s.draft?.sentAt, week, now)).length,
      skipped: skipped.filter((s) => within(s.skippedAt, week, now)).length,
      draftsWaiting: toReview.filter((s) => s.draft !== null && s.draft.sentAt === null).length,
    },
  };
}
