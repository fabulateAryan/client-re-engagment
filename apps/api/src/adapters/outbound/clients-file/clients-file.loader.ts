/**
 * Loads the clients to monitor, and their campaigns, from a local JSON file (default:
 * clients.local.json at the repository root, git-ignored). Keeps real client names out of
 * source control until the PostgreSQL repository replaces this.
 */
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { Platform } from '../../../core/domain';
import type { Campaign, Client } from '../../../core/domain';

const handle = z.string().trim().min(1).optional();
/** ISO date (YYYY-MM-DD), or null/absent when not recorded. */
const optionalDate = z.iso.date().nullable().optional();

const fileSchema = z.object({
  clients: z.array(
    z.object({
      id: z
        .string()
        .trim()
        .regex(/^[a-z0-9-]+$/, 'use lower-case letters, digits and dashes'),
      name: z.string().trim().min(1),
      handles: z
        .object({
          [Platform.LINKEDIN]: handle,
          [Platform.INSTAGRAM]: handle,
          [Platform.TIKTOK]: handle,
          [Platform.YOUTUBE]: handle,
          [Platform.GOOGLE_RSS]: handle,
        })
        .strict(),
      lastActiveDate: optionalDate,
      /** When the brand was added in the app (ISO date-time). */
      addedAt: z.iso.datetime().nullable().optional(),
      /** Display-only public profile (not monitored). */
      publicProfile: z
        .object({
          url: z.url(),
          headline: z.string().trim().min(1).nullable().optional(),
          location: z.string().trim().min(1).nullable().optional(),
        })
        .nullable()
        .optional(),
      campaigns: z
        .array(
          z.object({
            name: z.string().trim().min(1),
            startDate: optionalDate,
            endDate: optionalDate,
            tags: z.array(z.string().trim().min(1)).optional(),
          }),
        )
        .optional(),
    }),
  ),
});

export interface ClientsFile {
  readonly clients: Client[];
  readonly campaigns: Campaign[];
}

export class ClientsFileError extends Error {
  constructor(path: string, detail: string) {
    super(`Invalid clients file ${path}: ${detail}`);
    this.name = 'ClientsFileError';
  }
}

function toDate(value: string | null | undefined): Date | null {
  return value == null ? null : new Date(`${value}T00:00:00Z`);
}

/** @returns the clients and campaigns in the file, or `null` if the file does not exist. */
export function loadClientsFile(path: string): ClientsFile | null {
  if (!existsSync(path)) return null;

  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new ClientsFileError(path, 'not valid JSON');
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ClientsFileError(path, detail);
  }

  const ids = parsed.data.clients.map((c) => c.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate !== undefined) throw new ClientsFileError(path, `duplicate id "${duplicate}"`);

  const clients: Client[] = parsed.data.clients.map((c) => ({
    id: c.id,
    name: c.name,
    socialHandles: c.handles,
    lastActiveDate: toDate(c.lastActiveDate),
    lastCheckedAt: {},
    ...(c.addedAt != null && { addedAt: new Date(c.addedAt) }),
    publicProfile:
      c.publicProfile == null
        ? undefined
        : {
            url: c.publicProfile.url,
            headline: c.publicProfile.headline ?? null,
            location: c.publicProfile.location ?? null,
          },
  }));
  const campaigns: Campaign[] = parsed.data.clients.flatMap((c) =>
    (c.campaigns ?? []).map((campaign, index) => ({
      id: `${c.id}-campaign-${index + 1}`,
      clientId: c.id,
      name: campaign.name,
      startDate: toDate(campaign.startDate),
      endDate: toDate(campaign.endDate),
      tags: campaign.tags ?? [],
    })),
  );
  return { clients, campaigns };
}
