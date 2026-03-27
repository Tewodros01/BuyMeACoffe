import type { Request, Response } from 'express';
import * as crypto from 'crypto';

export const ACCESS_COOKIE = 'bmac_access';
export const REFRESH_COOKIE = 'bmac_refresh';
export const CSRF_COOKIE = 'bmac_csrf';

export interface SessionCookieOptions {
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  domain?: string;
}

function encodeCookieValue(value: string) {
  return encodeURIComponent(value);
}

function buildCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    maxAge?: number;
    domain?: string;
    path?: string;
  },
) {
  const parts = [`${name}=${encodeCookieValue(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);

  if (typeof options.maxAge === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);

  return parts.join('; ');
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const index = part.indexOf('=');
      if (index <= 0) return acc;
      const key = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

export function getCookie(req: Request, name: string): string | undefined {
  return parseCookies(req.headers.cookie)[name];
}

export function generateCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function setSessionCookies(
  res: Response,
  payload: {
    accessToken: string;
    refreshToken: string;
    csrfToken: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
  },
  options: SessionCookieOptions,
) {
  res.setHeader('Set-Cookie', [
    buildCookie(ACCESS_COOKIE, payload.accessToken, {
      httpOnly: true,
      secure: options.secure,
      sameSite: options.sameSite,
      maxAge: payload.accessTtlSeconds,
      domain: options.domain,
    }),
    buildCookie(REFRESH_COOKIE, payload.refreshToken, {
      httpOnly: true,
      secure: options.secure,
      sameSite: options.sameSite,
      maxAge: payload.refreshTtlSeconds,
      domain: options.domain,
    }),
    buildCookie(CSRF_COOKIE, payload.csrfToken, {
      secure: options.secure,
      sameSite: options.sameSite,
      maxAge: payload.refreshTtlSeconds,
      domain: options.domain,
    }),
  ]);
}

export function clearSessionCookies(
  res: Response,
  options: SessionCookieOptions,
) {
  res.setHeader('Set-Cookie', [
    buildCookie(ACCESS_COOKIE, '', {
      httpOnly: true,
      secure: options.secure,
      sameSite: options.sameSite,
      maxAge: 0,
      domain: options.domain,
    }),
    buildCookie(REFRESH_COOKIE, '', {
      httpOnly: true,
      secure: options.secure,
      sameSite: options.sameSite,
      maxAge: 0,
      domain: options.domain,
    }),
    buildCookie(CSRF_COOKIE, '', {
      secure: options.secure,
      sameSite: options.sameSite,
      maxAge: 0,
      domain: options.domain,
    }),
  ]);
}
