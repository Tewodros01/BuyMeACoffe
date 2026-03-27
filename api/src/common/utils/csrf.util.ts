import type { Request } from 'express';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CSRF_COOKIE, getCookie } from './cookie.util';

export function assertCsrf(req: Request) {
  const csrfCookie = getCookie(req, CSRF_COOKIE);
  const csrfHeader = req.headers['x-csrf-token'];
  const headerValue = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;

  if (!csrfCookie) {
    throw new BadRequestException('CSRF cookie is missing');
  }

  if (!headerValue || headerValue !== csrfCookie) {
    throw new ForbiddenException('Invalid CSRF token');
  }
}
