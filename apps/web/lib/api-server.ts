import { auth } from '@clerk/nextjs/server';
import { createApi } from './api-client';
import type { Api } from './api-client';

export { attempt } from './api-client';
export type { Loaded, SignalFilters } from './api-client';

/**
 * The API for server components and pages: each call carries the signed-in user's session
 * token, read on the server for the current request. (Client components use `api` from
 * ./api-client, which gets the token in the browser.)
 */
export const api: Api = createApi(async () => (await auth()).getToken());
