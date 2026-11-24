/**
 * A single invented demo client, used when no clients file exists, plus a few invented
 * signals for the demo sources. Nothing here refers to a real organisation or person.
 *
 * Signal dates are relative to when the API starts, so the demo always looks current.
 */
import { Platform, SignalType } from '../../../core/domain';
import type { Campaign, Client, Signal } from '../../../core/domain';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const loadedAt = Date.now();
const ago = (ms: number): Date => new Date(loadedAt - ms);

export const DEMO_CLIENT_ID = 'demo-client';

export const FAKE_CLIENTS: readonly Client[] = [
  {
    id: DEMO_CLIENT_ID,
    name: 'Example Client',
    socialHandles: {
      [Platform.LINKEDIN]: 'example-client',
      [Platform.GOOGLE_RSS]: 'Example Client',
    },
    lastActiveDate: ago(120 * DAY),
    lastCheckedAt: {},
  },
];

export const FAKE_CAMPAIGNS: readonly Campaign[] = [
  {
    id: 'demo-campaign-1',
    clientId: DEMO_CLIENT_ID,
    name: 'Example Spring Launch',
    startDate: ago(240 * DAY),
    endDate: ago(180 * DAY),
    tags: ['launch', 'example'],
  },
];

interface DemoSignalInput {
  readonly platform: Platform;
  readonly signalType: SignalType;
  readonly content: string;
  readonly hoursAgo: number;
}

const DEMO_SIGNALS: readonly DemoSignalInput[] = [
  {
    platform: Platform.LINKEDIN,
    signalType: SignalType.CAMPAIGN_LAUNCH,
    content: 'Our new summer range launches this week, with creator partnerships across Australia.',
    hoursAgo: 3,
  },
  {
    platform: Platform.LINKEDIN,
    signalType: SignalType.HIRING,
    content: 'We are hiring an Influencer Marketing Manager to join our Sydney team.',
    hoursAgo: 26,
  },
  {
    platform: Platform.GOOGLE_RSS,
    signalType: SignalType.COMPANY_ANNOUNCEMENT,
    content: 'Example Client announces expansion into Southeast Asia (example news article).',
    hoursAgo: 9,
  },
  {
    platform: Platform.GOOGLE_RSS,
    signalType: SignalType.OTHER,
    content: 'Industry roundup: Example Client named among fast-growing local brands (example).',
    hoursAgo: 52,
  },
];

export const FAKE_SIGNALS: readonly Signal[] = DEMO_SIGNALS.map((input, index) => {
  const externalId = `demo-${String(index + 1).padStart(3, '0')}`;
  return {
    id: `signal-${externalId}`,
    clientId: DEMO_CLIENT_ID,
    platform: input.platform,
    signalType: input.signalType,
    content: input.content,
    url: `https://example.com/${input.platform.toLowerCase()}/${externalId}`,
    externalId,
    publishedAt: ago(input.hoursAgo * HOUR),
    collectedAt: ago(0),
    raw: { source: 'fake', externalId },
  };
});
