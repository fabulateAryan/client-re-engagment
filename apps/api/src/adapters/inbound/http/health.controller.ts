import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@signal-monitoring/shared';
import { AppConfig } from '../../../config';
import { Public } from './clerk-auth.guard';

/** Open without signing in, so uptime checks work. */
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(AppConfig) private readonly config: AppConfig) {}

  @Get()
  check(): HealthResponse {
    return { status: 'ok', version: this.config.version };
  }
}
