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
  ): ActiveUser | ActiveUser[keyof ActiveUser] | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user: ActiveUser }>();
    const user = request.user;

    if (!user) {
      return undefined;
    }

    return data ? user[data] : user;
  },
);
