import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  // Override to not throw on missing/invalid token — just set user to undefined
  handleRequest<T>(_err: any, user: T): T {
    return user;
  }
}
