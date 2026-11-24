export interface Campaign {
  readonly id: string;
  readonly clientId: string;
  readonly name: string;
  /** `null` when not recorded, so an unknown date is never shown as a made-up one. */
  readonly startDate: Date | null;
  /** `null` when not recorded. */
  readonly endDate: Date | null;
  readonly tags: readonly string[];
}
