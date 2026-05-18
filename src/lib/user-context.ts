import crypto from 'crypto';
import type { NextRequest, NextResponse } from 'next/server';

export const ANONYMOUS_USER_COOKIE = 'sa_uid';

export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{16,}$/;

export interface UserContext {
  userId: string;
  mode: 'anonymous';
  isNew: boolean;
}

export function isValidAnonymousUserId(value: string | null | undefined): value is string {
  return Boolean(value && USER_ID_PATTERN.test(value.trim()));
}

export function createAnonymousUserId(): string {
  return crypto.randomUUID();
}

export function getOrCreateAnonymousUserId(value: string | null | undefined): { userId: string; isNew: boolean } {
  if (isValidAnonymousUserId(value)) {
    return {
      userId: value.trim(),
      isNew: false,
    };
  }

  return {
    userId: createAnonymousUserId(),
    isNew: true,
  };
}

export function resolveUserContext(request: NextRequest): UserContext {
  const resolvedUser = getOrCreateAnonymousUserId(request.cookies.get(ANONYMOUS_USER_COOKIE)?.value);

  return {
    userId: resolvedUser.userId,
    mode: 'anonymous',
    isNew: resolvedUser.isNew,
  };
}

export function applyUserContext(response: NextResponse, userContext: UserContext): NextResponse {
  if (!userContext.isNew) {
    return response;
  }

  response.cookies.set(ANONYMOUS_USER_COOKIE, userContext.userId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });

  return response;
}
