import { Injectable, UnauthorizedException } from '@nestjs/common';

import { PassportStrategy } from '@nestjs/passport';

import { ExtractJwt, Strategy } from 'passport-jwt';

import { ConfigService } from '@nestjs/config';
import { UsersRepository } from '../../masters/administration/users/users.repository.js';

type JwtPayload = {
  sub: number;
  username: string;
  role: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly usersRepository: UsersRepository,
  ) {
    const secret = config.get<string>('SECRET');

    if (!secret) {
      throw new Error('SECRET environment variable is not configured');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.usersRepository.findById(payload.sub);

    if (!user || !user.is_active) {
      throw new UnauthorizedException();
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role.name,
    };
  }
}
