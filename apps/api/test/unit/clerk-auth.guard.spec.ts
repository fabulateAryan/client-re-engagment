import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClerkAuthGuard, Public } from '../../src/adapters/inbound/http/clerk-auth.guard';
import type {
  AuthenticatedRequest,
  VerifySessionToken,
} from '../../src/adapters/inbound/http/clerk-auth.guard';

const CLERK = { secretKey: 'sk_test_not_real', authorizedParties: ['http://localhost:3000'] };

class OpenController {
  @Public()
  open(): void {}
  closed(): void {}
}

function contextFor(handler: keyof OpenController, authorization?: string) {
  const request = {
    headers: authorization === undefined ? {} : { authorization },
  } as AuthenticatedRequest;
  const context = {
    getHandler: () => OpenController.prototype[handler],
    getClass: () => OpenController,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('ClerkAuthGuard', () => {
  const valid: VerifySessionToken = (token) =>
    token === 'good-token'
      ? Promise.resolve({ sub: 'user_123' })
      : Promise.reject(new Error('bad signature'));

  it('lets everything through when Clerk is not configured (dev and tests)', async () => {
    const guard = new ClerkAuthGuard(new Reflector(), null, valid);
    await expect(guard.canActivate(contextFor('closed').context)).resolves.toBe(true);
  });

  it('accepts a valid session token and records the user', async () => {
    const guard = new ClerkAuthGuard(new Reflector(), CLERK, valid);
    const { context, request } = contextFor('closed', 'Bearer good-token');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.auth).toEqual({ userId: 'user_123' });
  });

  it('passes the secret key and allowed origins to the verifier', async () => {
    const verify = jest.fn<ReturnType<VerifySessionToken>, Parameters<VerifySessionToken>>(() =>
      Promise.resolve({ sub: 'user_1' }),
    );
    const guard = new ClerkAuthGuard(new Reflector(), CLERK, verify);
    await guard.canActivate(contextFor('closed', 'Bearer t').context);
    expect(verify).toHaveBeenCalledWith('t', {
      secretKey: 'sk_test_not_real',
      authorizedParties: ['http://localhost:3000'],
    });
  });

  it('rejects a request with no token', async () => {
    const guard = new ClerkAuthGuard(new Reflector(), CLERK, valid);
    await expect(guard.canActivate(contextFor('closed').context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an invalid or expired token', async () => {
    const guard = new ClerkAuthGuard(new Reflector(), CLERK, valid);
    await expect(
      guard.canActivate(contextFor('closed', 'Bearer forged').context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('leaves routes marked @Public() open', async () => {
    const guard = new ClerkAuthGuard(new Reflector(), CLERK, valid);
    await expect(guard.canActivate(contextFor('open').context)).resolves.toBe(true);
  });
});
