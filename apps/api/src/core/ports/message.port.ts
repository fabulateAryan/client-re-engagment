import type { Campaign, Client, DraftSource, Signal } from '../domain';

/** Everything a drafter may use. Drafts must not state facts that are not in here. */
export interface DraftInput {
  readonly client: Client;
  readonly signal: Signal;
  /** The brand's past campaigns with us, oldest first. May be empty. */
  readonly campaigns: readonly Campaign[];
}

export abstract class MessagePort {
  /** Which drafter this is, recorded on each draft. */
  abstract readonly source: DraftSource;

  /**
   * Draft an engagement message for a person to review. Returns the draft text.
   * @throws DraftFailedError when no draft can be produced.
   */
  abstract draft(input: DraftInput): Promise<string>;
}
