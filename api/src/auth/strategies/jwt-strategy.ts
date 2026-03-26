import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Role } from 'generated/prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ActiveUser } from '../decorators/get-user.decorators';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    if (!jwtSecret)
      throw new Error('JWT_SECRET environment variable is required');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  validate(payload: unknown): ActiveUser {
    if (!this.isValidPayload(payload)) {
      throw new UnauthorizedException('Invalid token structure');
    }
    return { sub: payload.sub, email: payload.email, role: payload.role };
  }

  private isValidPayload(payload: unknown): payload is JwtPayload {
    return (
      payload !== null &&
      typeof payload === 'object' &&
      'sub' in payload &&
      'email' in payload &&
      'role' in payload &&
      typeof (payload as JwtPayload).sub === 'string' &&
      typeof (payload as JwtPayload).email === 'string' &&
      Object.values(Role).includes((payload as JwtPayload).role)
    );
  }
}
