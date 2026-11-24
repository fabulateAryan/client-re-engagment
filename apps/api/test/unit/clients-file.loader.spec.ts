import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ClientsFileError,
  loadClientsFile,
} from '../../src/adapters/outbound/clients-file/clients-file.loader';
import { Platform } from '../../src/core/domain';

// Invented test data only.
describe('loadClientsFile', () => {
  let dir: string;
  const write = (content: unknown): string => {
    const path = join(dir, 'clients.json');
    writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content));
    return path;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'clients-file-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null when the file does not exist', () => {
    expect(loadClientsFile(join(dir, 'missing.json'))).toBeNull();
  });

  it('loads clients with handles and an optional last-active date', () => {
    const path = write({
      clients: [
        {
          id: 'test-brand',
          name: 'Test Brand',
          handles: { LINKEDIN: 'https://example.com/company/test-brand', GOOGLE_RSS: 'Test Brand' },
          lastActiveDate: '2026-03-31',
        },
        { id: 'other-brand', name: 'Other Brand', handles: { GOOGLE_RSS: 'Other Brand' } },
      ],
    });

    const loaded = loadClientsFile(path);

    expect(loaded?.campaigns).toEqual([]);
    expect(loaded?.clients).toEqual([
      {
        id: 'test-brand',
        name: 'Test Brand',
        socialHandles: {
          [Platform.LINKEDIN]: 'https://example.com/company/test-brand',
          [Platform.GOOGLE_RSS]: 'Test Brand',
        },
        lastActiveDate: new Date('2026-03-31T00:00:00Z'),
        lastCheckedAt: {},
      },
      {
        id: 'other-brand',
        name: 'Other Brand',
        socialHandles: { [Platform.GOOGLE_RSS]: 'Other Brand' },
        lastActiveDate: null,
        lastCheckedAt: {},
      },
    ]);
  });

  it('loads campaigns, keeping unknown dates as null', () => {
    const path = write({
      clients: [
        {
          id: 'test-creator',
          name: 'Test Creator',
          handles: {},
          lastActiveDate: '2026-06-10',
          campaigns: [
            { name: 'Test Campaign A' },
            {
              name: 'Test Campaign B',
              startDate: '2026-05-01',
              endDate: '2026-06-10',
              tags: ['x'],
            },
          ],
        },
      ],
    });

    expect(loadClientsFile(path)?.campaigns).toEqual([
      {
        id: 'test-creator-campaign-1',
        clientId: 'test-creator',
        name: 'Test Campaign A',
        startDate: null,
        endDate: null,
        tags: [],
      },
      {
        id: 'test-creator-campaign-2',
        clientId: 'test-creator',
        name: 'Test Campaign B',
        startDate: new Date('2026-05-01T00:00:00Z'),
        endDate: new Date('2026-06-10T00:00:00Z'),
        tags: ['x'],
      },
    ]);
  });

  it('rejects invalid JSON, unknown platforms and duplicate ids', () => {
    expect(() => loadClientsFile(write('{ not json'))).toThrow(ClientsFileError);
    expect(() =>
      loadClientsFile(write({ clients: [{ id: 'a', name: 'A', handles: { MYSPACE: 'x' } }] })),
    ).toThrow(/MYSPACE|Unrecognized/);
    expect(() =>
      loadClientsFile(
        write({
          clients: [
            { id: 'a', name: 'A', handles: {} },
            { id: 'a', name: 'B', handles: {} },
          ],
        }),
      ),
    ).toThrow(/duplicate id "a"/);
  });
});
