import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from 'generated/prisma/client';

export interface ActiveUser {
  sub: string;
  email: string;
  role: Role;
}

export const GetUser = createParamDecorator(
  (
    data: keyof ActiveUser | undefined,
    ctx: ExecutionContext,
  ): ActiveUser | ActiveUser[keyof ActiveUser] => {
    const request = ctx.switchToHttp().getRequest<{ user: ActiveUser }>();
    const user = request.user;

    if (!user) {
      throw new Error('User not found in request context');
    }

    return data ? user[data] : user;
  },
);
