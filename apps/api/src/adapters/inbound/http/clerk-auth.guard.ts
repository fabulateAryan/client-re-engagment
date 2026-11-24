import { SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ClerkConfig } from '../../../config';

const IS_PUBLIC = 'signal-monitor:public-route';

/** Mark a controller or route as open without signing in (e.g. the health check). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/** Checks a Clerk session token and returns its user id. Throws when the token is not valid. */
export type VerifySessionToken = (
  token: string,
  options: { secretKey: string; authorizedParties: string[] },
) => Promise<{ sub: string }>;

/** The signed-in user, set on the request for handlers that need it. */
export interface AuthenticatedRequest extends Request {
  auth?: { userId: string };
}

/**
 * Every API request must carry a valid Clerk session token (Authorization: Bearer ...),
 * issued to one of our own front-end origins. Routes marked @Public() are open.
 *
 * With no Clerk configuration the guard lets everything through, so local development and
 * tests work without keys; set CLERK_SECRET_KEY to switch it on.
 */
export class ClerkAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly clerk: ClerkConfig | null,
    private readonly verify: VerifySessionToken,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.clerk === null) return true;
    const open = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (open === true) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization ?? '';
    const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim();
    if (token === undefined || token === '') {
      throw new UnauthorizedException('Sign in to continue.');
    }

    try {
      const payload = await this.verify(token, {
        secretKey: this.clerk.secretKey,
        authorizedParties: [...this.clerk.authorizedParties],
      });
      request.auth = { userId: payload.sub };
      return true;
    } catch {
      // The reason (expired, wrong signature, other app) is not shown to the caller.
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }
  }
}
