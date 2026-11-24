/**
 * YouTube videos via Monid -> anyapi /youtube.channel_videos.
 *
 * Based on the endpoint's inspected input schema and a real run's output (18/11/2026):
 *   input  = { handle ("@name") | channelId ("UC..."), cursor?, route?, sort? }
 *   output = { found, data: { nextCursor, videos: Video[] } }
 *   Video  = { id, url, title, createdUtc (Unix seconds), publishedTime (ISO), views, image,
 *              lengthText }
 *
 * Route: "fox". The schema says only fox returns `createdUtc`; the default route gives no
 * exact publish time, which the `since` check needs. Fox refused `sort` in testing (400), so
 * it is not sent; fox returned newest first without it.
 *
 * Handle: the channel as stored by brand setup (https://www.youtube.com/@<handle> or
 * https://www.youtube.com/channel/<id>), or `@handle` in the clients file.
 * Pricing at the time of writing: flat per call on fox (higher than the default route).
 */
import { Platform, SignalType } from '../../../../core/domain';
import type { JsonObject } from '../../../../core/domain';
import type { MappedItem, MonidEndpointProfile } from '../monid-endpoint-profile';
import {
  itemsUnder,
  lastSegment,
  minimise,
  notFoundProblem,
  publishedAt,
  str,
} from './anyapi-social';

const CHANNEL_ID = /^UC[a-zA-Z0-9_-]{22}$/;

/** `{ channelId }` for channel-ID links, otherwise `{ handle: "@name" }`. */
export function youTubeChannelInput(handle: string): JsonObject {
  const last = lastSegment(handle);
  return CHANNEL_ID.test(last) ? { channelId: last } : { handle: `@${last}` };
}

export const anyapiYouTubeChannelVideos: MonidEndpointProfile = {
  platform: Platform.YOUTUBE,
  provider: 'anyapi',
  endpoint: '/youtube.channel_videos',
  typeMap: {},
  defaultType: SignalType.NEW_POST,

  buildInput: (handle) => ({ body: { ...youTubeChannelInput(handle), route: 'fox' } }),

  outputProblem: (value) => notFoundProblem(value, 'YouTube channel'),

  extractItems: (value) => itemsUnder(value, 'videos'),

  mapItem: (item): MappedItem | null => {
    const id = str(item.id);
    const url = str(item.url);
    const date = publishedAt(item);
    if (id === null || url === null || date === null) return null;
    return {
      externalId: id,
      providerType: null,
      content: str(item.title) ?? '',
      url,
      publishedAt: date,
    };
  },

  minimiseRaw: (item) =>
    minimise(item, 'monid:anyapi/youtube.channel_videos', ['id', 'createdUtc', 'url'], ['views']),
};
