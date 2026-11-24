import type { SourceStatusResponse } from '@signal-monitoring/shared';

/** Injection token: how each platform is sourced, built in app.module.ts alongside the sources. */
export const SOURCE_STATUS = Symbol('SOURCE_STATUS');
export type SourceStatusList = readonly SourceStatusResponse[];
