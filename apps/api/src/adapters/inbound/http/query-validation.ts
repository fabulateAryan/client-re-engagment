import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** Parse query parameters with a zod schema, turning problems into a 400 with details. */
export function parseQuery<T>(schema: z.ZodType<T>, query: unknown): T {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Invalid query parameters',
      issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }
  return result.data;
}
