import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../prisma/prisma.module.js';

import { AuthController } from './auth.controller.js';

import { AuthService } from './auth.service.js';

import { UsersModule } from '../../masters/administration/users/users.module.js';
import { JwtModule } from '@nestjs/jwt';

import { JwtStrategy } from './jwt.strategy.js';
import { PassportModule } from '@nestjs/passport';
import { RolesGuard } from './roles.guard.js';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PassportModule,
    UsersModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('SECRET'),
        signOptions: {
          expiresIn: '1d',
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, UsersModule, JwtStrategy, RolesGuard],
})
export class AuthModule {}
