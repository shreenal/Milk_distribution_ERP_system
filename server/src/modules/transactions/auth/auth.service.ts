import { Injectable, UnauthorizedException } from '@nestjs/common';

import * as bcrypt from 'bcrypt';

// import { AuthRepository } from './auth.repository.js';
import { UsersRepository } from '../../masters/administration/users/users.repository.js';

import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: UsersRepository,

    private readonly jwtService: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.authRepository.findByUsername(username);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      sub: user.id,

      username: user.username,

      role: user.role.name,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,

      user: {
        id: user.id,

        username: user.username,

        role: user.role.name,
      },
    };
  }

  async getCurrentUser(userId: number) {
  const user = await this.authRepository.findById(userId);

  if (!user) {
    throw new UnauthorizedException();
  }

  return {
    id: user.id,
    username: user.username,
    role: user.role.name,
  };
}
}
