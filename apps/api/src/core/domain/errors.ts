/** Base class for errors raised by the core. Adapters may translate these to transport errors. */
export abstract class DomainError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ClientNotFoundError extends DomainError {
  constructor(public readonly clientId: string) {
    super(`Client not found: ${clientId}`);
  }
}

export class SignalNotFoundError extends DomainError {
  constructor(public readonly signalId: string) {
    super(`Signal not found: ${signalId}`);
  }
}

/** A brand could not be set up because what was entered is not valid. */
export class InvalidBrandError extends DomainError {
  /** @param userMessage Safe to show a person as is. */
  constructor(public readonly userMessage: string) {
    super(userMessage);
  }
}

/** A brand with the same LinkedIn page is already set up. */
export class DuplicateBrandError extends DomainError {
  constructor(public readonly existingClientId: string) {
    super(
      'A brand with this LinkedIn page is already set up. Use Edit accounts on its card to add Instagram, TikTok or YouTube.',
    );
  }
}

/** A draft could not be produced or saved. The message is safe to show a person. */
export class DraftFailedError extends DomainError {
  /** @param userMessage Safe to show a person as is. */
  constructor(public readonly userMessage: string) {
    super(userMessage);
  }
}

/** Thrown by use cases that are scaffolded but scheduled for a later phase. */
export class NotImplementedYetError extends DomainError {
  constructor(feature: string, phase: string) {
    super(`${feature} is not implemented yet (planned for ${phase}).`);
  }
}

/** Why a signal source could not deliver. Platform-neutral, so any adapter can use it. */
export enum SignalSourceFailure {
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  BAD_RESPONSE = 'BAD_RESPONSE',
  UNAVAILABLE = 'UNAVAILABLE',
  NOT_AUTHORISED = 'NOT_AUTHORISED',
  INSUFFICIENT_CREDIT = 'INSUFFICIENT_CREDIT',
}

/** Raised by SignalSourcePort adapters. The message must not contain personal data. */
export class SignalSourceError extends DomainError {
  constructor(
    public readonly platform: string,
    public readonly failure: SignalSourceFailure,
    detail: string,
  ) {
    super(`${platform} source failed (${failure}): ${detail}`);
  }
}

const TRANSIENT_FAILURES: ReadonlySet<SignalSourceFailure> = new Set([
  SignalSourceFailure.TIMEOUT,
  SignalSourceFailure.RATE_LIMITED,
  SignalSourceFailure.UNAVAILABLE,
]);

/**
 * Whether trying again later could help. A wrong handle, a bad API key or no credit will fail
 * the same way every time, so retrying only costs time and paid calls. Unknown errors (e.g.
 * saving failed) are treated as worth a retry.
 */
export function isRetryableFailure(error: unknown): boolean {
  return !(error instanceof SignalSourceError) || TRANSIENT_FAILURES.has(error.failure);
}

/** A monitoring run was requested while another one is still in progress. */
export class MonitoringRunInProgressError extends DomainError {
  constructor() {
    super('A monitoring run is already in progress.');
  }
}
