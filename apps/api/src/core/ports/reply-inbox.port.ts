/** Where replies to app emails arrive (e.g. a Gmail inbox the app reads). */
export abstract class ReplyInboxPort {
  /** True when replies are read from a mailbox on demand. */
  abstract readonly enabled: boolean;

  /**
   * Reads the inbox now and adds any new replies to their threads. Returns how many were
   * added. Never throws; a failure counts as nothing new.
   */
  abstract checkNow(): Promise<number>;
}

/** No inbox to read (replies arrive by webhook, or not at all). */
export class NoReplyInbox extends ReplyInboxPort {
  readonly enabled = false;

  checkNow(): Promise<number> {
    return Promise.resolve(0);
  }
}
