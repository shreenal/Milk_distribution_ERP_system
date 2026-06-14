import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module.js';

import { AuthController } from './auth.controller.js';

import { AuthService } from './auth.service.js';

import { AuthRepository } from './auth.repository.js';

import { JwtModule } from '@nestjs/jwt';

import { JwtStrategy } from './jwt.strategy.js';
import { PassportModule } from '@nestjs/passport';
import { RolesGuard } from './roles.guard.js';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: 'milk-distribution-secret',
      signOptions: {
        expiresIn: '1d',
      },
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, AuthRepository, JwtStrategy, RolesGuard],
})
export class AuthModule {}
