import { Body, Controller, Post } from '@nestjs/common';

import { AuthService } from './auth.service.js';

import { LoginDto } from './dto/login.dto.js';

import { UseGuards, Req, Get } from '@nestjs/common';

import { JwtAuthGuard } from './auth.guard.js';
import { Request } from 'express';

type AuthRequest = Request & {
  user: {
    id: number;
    username: string;
    role: string;
  };
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body()
    dto: LoginDto,
  ) {
    return this.authService.login(dto.username, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Req() req: AuthRequest) {
    return req.user;
  }
}
