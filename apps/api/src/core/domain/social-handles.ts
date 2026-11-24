import { Platform } from './platform';

/** A client's handle (username, page id or feed URL) per platform. Missing means no presence. */
export type SocialHandles = Readonly<Partial<Record<Platform, string>>>;

/** Platforms where the client has a non-blank handle, in Platform enum order. */
export function platformsWithHandles(handles: SocialHandles): Platform[] {
  return Object.values(Platform).filter((platform) => {
    const handle = handles[platform];
    return handle !== undefined && handle.trim().length > 0;
  });
}
