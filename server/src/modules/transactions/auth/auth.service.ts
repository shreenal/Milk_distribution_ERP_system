import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { UsersRepository } from '../../masters/administration/users/users.repository.js';
import { RefreshTokenRepository } from './refresh-token.repository.js';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

const REFRESH_TOKEN_BYTES = 64;

const REFRESH_REUSE_GRACE_MS = 15_000;

const DUMMY_PASSWORD_HASH =
  '$2b$10$CwTycUXWue0Thq9StjUM0uJ8Q0Vgpvpw/uRRFtQFJn.5YCbNXdIY2';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: UsersRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.authRepository.findByUsername(username);

    const isPasswordValid = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.is_active) {
      throw new ForbiddenException('This account has been deactivated');
    }

    const { accessToken, refreshToken, user: sessionUser } =
      await this.issueTokenPair(user.id, user.username, user.role.name);

    // refreshTokenId is an internal DB id; clients do not need it.
    return { accessToken, refreshToken, user: sessionUser };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.refreshTokenRepository.findByHash(tokenHash);

    if (!stored) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.expires_at < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // M9: claim the token atomically before doing anything else. Only one
    // concurrent request can win; the loser falls through to reuse
    // detection instead of also issuing a valid token pair.
    const claimed = await this.refreshTokenRepository.claimForRotation(
      stored.id,
    );

    if (!claimed) {
      if (stored.revoked_at && stored.replaced_by !== null) {
        const revokedMsAgo = Date.now() - stored.revoked_at.getTime();
        if (revokedMsAgo > REFRESH_REUSE_GRACE_MS) {
          await this.refreshTokenRepository.revokeAllForUser(stored.user_id);
        }
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.authRepository.findById(stored.user_id);

    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const newPair = await this.issueTokenPair(
      user.id,
      user.username,
      user.role.name,
    );

    await this.refreshTokenRepository.setReplacedBy(
      stored.id,
      newPair.refreshTokenId,
    );

    return {
      accessToken: newPair.accessToken,
      refreshToken: newPair.refreshToken,
      user: newPair.user,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.refreshTokenRepository.findByHash(tokenHash);
    if (stored && !stored.revoked_at) {
      await this.refreshTokenRepository.revoke(stored.id);
    }
  }

  async logoutAll(userId: number): Promise<void> {
    await this.refreshTokenRepository.revokeAllForUser(userId);
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

  private async issueTokenPair(userId: number, username: string, role: string) {
    const payload = { sub: userId, username, role };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.config.get<string>('ACCESS_TOKEN_TTL', '15m') as any,
    });

    const refreshToken = crypto
      .randomBytes(REFRESH_TOKEN_BYTES)
      .toString('hex');
    const tokenHash = this.hashToken(refreshToken);

    const ttlDays = this.config.get<number>('REFRESH_TOKEN_TTL_DAYS', 7);
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const created = await this.refreshTokenRepository.create(
      userId,
      tokenHash,
      expiresAt,
    );

    return {
      accessToken,
      refreshToken,
      refreshTokenId: created.id,
      user: { id: userId, username, role },
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
