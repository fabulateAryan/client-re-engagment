/** What kind of activity a signal represents. */
export enum SignalType {
  // Activity types (ENG-231 sections 6 and 11): the only types that can become a signal.
  PRODUCT_LAUNCH = 'PRODUCT_LAUNCH',
  CAMPAIGN_LAUNCH = 'CAMPAIGN_LAUNCH',
  CREATOR_CONTENT = 'CREATOR_CONTENT',
  MARKET_EXPANSION = 'MARKET_EXPANSION',
  SEASONAL = 'SEASONAL',
  EVENT_PARTNERSHIP = 'EVENT_PARTNERSHIP',
  // Context only: kept and shown, but never a signal on their own (section 9).
  JOB_CHANGE = 'JOB_CHANGE',
  HIRING = 'HIRING',
  COMPANY_ANNOUNCEMENT = 'COMPANY_ANNOUNCEMENT',
  NEW_POST = 'NEW_POST',
  OTHER = 'OTHER',
}

/** Brand activity that can pass qualification and become a signal. */
export const ACTIVITY_SIGNAL_TYPES: ReadonlySet<SignalType> = new Set([
  SignalType.PRODUCT_LAUNCH,
  SignalType.CAMPAIGN_LAUNCH,
  SignalType.CREATOR_CONTENT,
  SignalType.MARKET_EXPANSION,
  SignalType.SEASONAL,
  SignalType.EVENT_PARTNERSHIP,
]);

export function isActivitySignalType(type: SignalType): boolean {
  return ACTIVITY_SIGNAL_TYPES.has(type);
}
