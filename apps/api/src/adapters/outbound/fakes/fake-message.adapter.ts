import { DraftSource } from '../../../core/domain';
import { MessagePort } from '../../../core/ports';
import type { DraftInput } from '../../../core/ports';

/** Predictable placeholder draft for tests. */
export class FakeMessageAdapter extends MessagePort {
  readonly source = DraftSource.TEMPLATE;
  readonly calls: DraftInput[] = [];

  draft(input: DraftInput): Promise<string> {
    this.calls.push(input);
    return Promise.resolve(
      `[FAKE DRAFT] To ${input.client.name} about ${input.signal.id} (${input.campaigns.length} past campaigns)`,
    );
  }
}
