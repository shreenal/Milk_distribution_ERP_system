import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Body,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { AuthService } from './auth.service.js';
import { AuthCookieService } from './auth-cookie.service.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './auth.guard.js';

type AuthRequest = Request & {
  user: {
    id: number;
    username: string;
    role: string;
  };
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Post('login')
  // Per IP. Kept above a handful so several staff behind one office NAT can
  // sign in together; bcrypt cost still bounds brute-force speed.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...session } = await this.authService.login(
      dto.username,
      dto.password,
    );

    this.cookies.set(res, refreshToken);

    return session;
  }

  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.cookies.assertTrustedOrigin(req);

    const token = this.cookies.read(req);

    if (!token) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // The cookie is deliberately NOT cleared when this fails: a concurrent
    // refresh that lost the rotation race would otherwise delete the winner's
    // freshly issued cookie and log the user out.
    const { refreshToken, ...session } = await this.authService.refresh(token);

    this.cookies.set(res, refreshToken);

    return session;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.cookies.assertTrustedOrigin(req);

    const token = this.cookies.read(req);

    this.cookies.clear(res);

    if (token) {
      await this.authService.logout(token);
    }
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.cookies.clear(res);

    await this.authService.logoutAll(req.user.id);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req: AuthRequest) {
    return this.authService.getCurrentUser(req.user.id);
  }
}
