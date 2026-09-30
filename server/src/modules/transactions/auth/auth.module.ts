import { Module } from '@nestjs/common';

import { AuthController } from './auth.controller.js';

import { AuthService } from './auth.service.js';

import { UsersModule } from '../../masters/administration/users/users.module.js';
import { JwtModule } from '@nestjs/jwt';

import { JwtStrategy } from './jwt.strategy.js';
import { PassportModule } from '@nestjs/passport';
import { RolesGuard } from './roles.guard.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RefreshTokenRepository } from './refresh-token.repository.js';
import { PrismaModule } from '../../../prisma/prisma.module.js';

@Module({
  imports: [
    PassportModule,
    UsersModule,
    PrismaModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('SECRET'),
        signOptions: {
          expiresIn: config.get<string>('ACCESS_TOKEN_TTL', '15m') as any,
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, JwtStrategy, RolesGuard, RefreshTokenRepository],
})
export class AuthModule {}
